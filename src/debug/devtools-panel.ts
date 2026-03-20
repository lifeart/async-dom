import type {
	EventLogEntry,
	MutationLogEntry,
	SyncReadLogEntry,
	WarningLogEntry,
} from "../core/debug.ts";
import { WarningDescriptions } from "../core/debug.ts";

/**
 * The shape of __ASYNC_DOM_DEVTOOLS__ exposed on globalThis (main thread).
 */
interface FrameLogEntry {
	frameId: number;
	totalMs: number;
	actionCount: number;
	timingBreakdown: Map<string, number>;
}

interface EventTraceEntry {
	eventType: string;
	serializeMs: number;
	timestamp: number;
}

interface DevtoolsAPI {
	scheduler: {
		pending: () => number;
		stats: () => {
			pending: number;
			frameId: number;
			lastFrameTimeMs: number;
			lastFrameActions: number;
			isRunning: boolean;
			lastTickTime: number;
			enqueueToApplyMs: number;
		};
		frameLog: () => FrameLogEntry[];
		flush: () => void;
	};
	debugStats: () => Record<string, number>;
	getEventTraces: () => EventTraceEntry[];
	enableHighlightUpdates: (enabled: boolean) => void;
	findRealNode: (nodeId: number) => Node | null;
	apps: () => string[];
	renderers: () => Record<string, { root: unknown }>;
	refreshDebugData: () => void;
	getAppData: (appId: string) => AppDebugData | undefined;
	getAllAppsData: () => Record<string, AppDebugData>;
}

interface AppDebugData {
	tree: unknown;
	workerStats: unknown;
	perTypeCoalesced: unknown;
	coalescedLog: unknown;
}

interface TreeNode {
	type: "element" | "text" | "comment";
	tag?: string;
	id?: number;
	className?: string;
	attributes?: Record<string, string>;
	text?: string;
	children?: TreeNode[];
}

const MAX_LOG_ENTRIES = 200;
const MAX_WARNING_ENTRIES = 200;
const MAX_EVENT_LOG_ENTRIES = 200;
const MAX_SYNC_READ_LOG_ENTRIES = 200;

// ---- Mutation / Warning / Event / SyncRead capture ----

const mutationLog: MutationLogEntry[] = [];
const warningLog: WarningLogEntry[] = [];
const eventLog: EventLogEntry[] = [];
const syncReadLog: SyncReadLogEntry[] = [];
let warningBadgeCount = 0;
let onWarningBadgeUpdate: (() => void) | null = null;
let logPaused = false;

export function captureMutation(entry: MutationLogEntry): void {
	if (logPaused) return;
	mutationLog.push(entry);
	if (mutationLog.length > MAX_LOG_ENTRIES) mutationLog.shift();
}

export function captureEvent(entry: EventLogEntry): void {
	if (logPaused) return;
	eventLog.push(entry);
	if (eventLog.length > MAX_EVENT_LOG_ENTRIES) eventLog.shift();
}

export function captureSyncRead(entry: SyncReadLogEntry): void {
	if (logPaused) return;
	syncReadLog.push(entry);
	if (syncReadLog.length > MAX_SYNC_READ_LOG_ENTRIES) syncReadLog.shift();
}

export function captureWarning(entry: WarningLogEntry): void {
	warningLog.push(entry);
	if (warningLog.length > MAX_WARNING_ENTRIES) warningLog.shift();
	warningBadgeCount++;
	onWarningBadgeUpdate?.();
}

// ---- CSS ----

const PANEL_CSS = `
:host {
  all: initial;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: #d4d4d4;
  line-height: 1.4;
}

*, *::before, *::after {
  box-sizing: border-box;
}

.panel {
  position: fixed;
  bottom: 8px;
  right: 8px;
  z-index: 2147483647;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  width: 450px;
  height: 400px;
  resize: both;
  min-width: 300px;
  min-height: 200px;
  transition: width 0.15s, height 0.15s;
}

.panel.collapsed {
  width: auto !important;
  height: auto !important;
  min-width: 0;
  min-height: 0;
  resize: none;
  border-radius: 4px;
}

.toggle-tab {
  display: none;
  padding: 4px 12px;
  cursor: pointer;
  background: #2d2d2d;
  color: #d4d4d4;
  border: none;
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  user-select: none;
}

.panel.collapsed .toggle-tab {
  display: block;
}

.panel.collapsed .app-bar,
.panel.collapsed .tab-bar,
.panel.collapsed .tab-content,
.panel.collapsed .header-bar {
  display: none;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  height: 28px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  color: #cccccc;
}

.header-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.header-btn {
  background: none;
  border: none;
  color: #808080;
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
  font-family: inherit;
}
.header-btn:hover { color: #d4d4d4; }

/* ---- App bar (multi-app) ---- */

.app-bar {
  display: none;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  padding: 0 4px;
  gap: 2px;
  align-items: center;
  height: 24px;
  overflow-x: auto;
}
.app-bar.visible { display: flex; }

.app-btn {
  padding: 2px 8px;
  background: none;
  border: 1px solid transparent;
  border-radius: 3px;
  color: #808080;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  white-space: nowrap;
}
.app-btn:hover { color: #cccccc; }
.app-btn.active {
  color: #d4d4d4;
  background: #37373d;
  border-color: #007acc;
}

.app-label {
  color: #555;
  font-size: 10px;
  margin-right: 4px;
  flex-shrink: 0;
}

/* ---- Tab bar ---- */

.tab-bar {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.tab-btn {
  padding: 4px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #808080;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
}
.tab-btn:hover { color: #cccccc; }
.tab-btn.active {
  color: #d4d4d4;
  border-bottom-color: #007acc;
}

.tab-badge {
  display: inline-block;
  background: #f44747;
  color: #fff;
  font-size: 9px;
  padding: 0 4px;
  border-radius: 8px;
  margin-left: 4px;
  min-width: 14px;
  text-align: center;
  vertical-align: middle;
}

.tab-content {
  flex: 1;
  overflow: auto;
  padding: 6px 8px;
  display: none;
}
.tab-content.active { display: block; }

/* ---- Tree tab ---- */

.tree-refresh-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 4px;
}

.tree-refresh-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
}
.tree-refresh-btn:hover { background: #505050; }

.tree-status {
  color: #555;
  font-size: 10px;
}

.tree-node { padding-left: 14px; }
.tree-line {
  display: flex;
  align-items: baseline;
  gap: 3px;
  padding: 1px 0;
  cursor: pointer;
  white-space: nowrap;
}
.tree-line:hover { background: #2a2d2e; }

.tree-toggle {
  width: 12px;
  text-align: center;
  color: #808080;
  flex-shrink: 0;
  font-size: 9px;
}

.tree-tag { color: #569cd6; }
.tree-attr-name { color: #9cdcfe; }
.tree-attr-value { color: #ce9178; }
.tree-text-node { color: #6a9955; font-style: italic; }
.tree-comment { color: #6a9955; font-style: italic; }
.tree-nodeid { color: #555; font-size: 10px; margin-left: 4px; }

.tree-children { display: none; }
.tree-node.expanded > .tree-children { display: block; }

.tree-empty { color: #808080; padding: 16px; text-align: center; }

/* ---- Performance tab ---- */

.perf-section-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 0 3px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 2px;
}
.perf-section-title:first-child { padding-top: 0; }

.perf-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  border-bottom: 1px solid #2d2d2d;
}
.perf-label { color: #808080; }
.perf-value { color: #d4d4d4; font-weight: 600; }
.perf-value.red { color: #f44747; }
.perf-value.yellow { color: #d7ba7d; }
.perf-value.green { color: #4ec9b0; }

.perf-sparkline {
  color: #555;
  font-size: 10px;
  letter-spacing: 1px;
}

/* ---- Log tab ---- */

.log-toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-bottom: 4px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 4px;
}

.log-filter {
  flex: 1;
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
  outline: none;
}
.log-filter:focus { border-color: #007acc; }

.log-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
  white-space: nowrap;
}
.log-btn:hover { background: #505050; }
.log-btn.active { background: #007acc; border-color: #007acc; }

.log-count {
  color: #555;
  font-size: 10px;
  flex-shrink: 0;
}

.log-list {
  overflow-y: auto;
  max-height: calc(100% - 32px);
}

.log-entry {
  display: flex;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
}
.log-time { color: #555; flex-shrink: 0; width: 80px; }
.log-action { color: #569cd6; flex-shrink: 0; width: 120px; overflow: hidden; text-overflow: ellipsis; }
.log-detail { color: #808080; overflow: hidden; text-overflow: ellipsis; }

.log-empty { color: #808080; padding: 16px; text-align: center; }

/* ---- Warnings tab ---- */

.warn-entry {
  padding: 4px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
}
.warn-time { color: #555; margin-right: 6px; }
.warn-code {
  font-weight: 600;
  margin-right: 6px;
}
.warn-code.ASYNC_DOM_MISSING_NODE { color: #f44747; }
.warn-code.ASYNC_DOM_SYNC_TIMEOUT { color: #f44747; }
.warn-code.ASYNC_DOM_LISTENER_NOT_FOUND { color: #d7ba7d; }
.warn-code.ASYNC_DOM_EVENT_ATTACH_FAILED { color: #d7ba7d; }
.warn-code.ASYNC_DOM_TRANSPORT_NOT_OPEN { color: #d7ba7d; }
.warn-code.ASYNC_DOM_BLOCKED_PROPERTY { color: #d7ba7d; }

.warn-msg { color: #d4d4d4; }
.warn-stack {
  margin: 4px 0 0 0; padding: 8px; background: #1a1a1a; border: 1px solid #333;
  border-radius: 3px; font-size: 11px; color: #ce9178; white-space: pre-wrap;
  word-break: break-all; max-height: 200px; overflow-y: auto; line-height: 1.4;
}
.warn-code.WORKER_ERROR, .warn-code.WORKER_UNHANDLED_REJECTION { color: #f44747; }
.warn-empty { color: #808080; padding: 16px; text-align: center; }

/* Grouped Warnings */
.warn-group { margin: 4px 0; border: 1px solid #2d2d2d; border-radius: 3px; }
.warn-group-header { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: #252526; cursor: pointer; font-size: 11px; user-select: none; }
.warn-group-header:hover { background: #2a2d2e; }
.warn-group-toggle { color: #808080; font-size: 9px; width: 12px; text-align: center; flex-shrink: 0; }
.warn-group-code { font-weight: 600; }
.warn-group-count { color: #808080; font-size: 10px; }
.warn-group-entries { display: none; padding: 0 6px 4px 18px; }
.warn-group.expanded .warn-group-entries { display: block; }
.warn-group-doc { padding: 4px 6px; background: #1a1a1a; border-bottom: 1px solid #2d2d2d; font-size: 10px; }
.warn-group-desc { color: #9cdcfe; }
.warn-group-suggestion { color: #4ec9b0; margin-top: 2px; }
.warn-suppress-btn { background: #3c3c3c; border: 1px solid #555; color: #808080; padding: 1px 6px; cursor: pointer; font-family: inherit; font-size: 10px; border-radius: 3px; margin-left: auto; }
.warn-suppress-btn:hover { color: #d4d4d4; background: #505050; }
.warn-suppressed-note { color: #555; font-size: 10px; padding: 4px; text-align: center; font-style: italic; }
.warn-view-toggle { font-size: 10px; }

/* ---- Frame flamechart ---- */

.frame-section-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 0 3px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 4px;
}

.frame-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
  cursor: pointer;
}
.frame-bar-row:hover { background: #2a2d2e; }

.frame-label {
  color: #808080;
  flex-shrink: 0;
  width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.frame-bar-track {
  flex: 1;
  height: 14px;
  background: #2d2d2d;
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.frame-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.15s;
}
.frame-bar-fill.green { background: #4ec9b0; }
.frame-bar-fill.yellow { background: #d7ba7d; }
.frame-bar-fill.red { background: #f44747; }

.frame-info {
  color: #808080;
  flex-shrink: 0;
  width: 130px;
  text-align: right;
  font-size: 10px;
  white-space: nowrap;
}

.frame-detail {
  padding: 4px 8px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  margin: 2px 0 4px 0;
  font-size: 10px;
  color: #d4d4d4;
}

.frame-detail-row {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
}
.frame-detail-action { color: #569cd6; }
.frame-detail-time { color: #d4d4d4; }

/* ---- Event tracer ---- */

.event-trace-section {
  margin-top: 8px;
  border-top: 1px solid #2d2d2d;
  padding-top: 4px;
}

.event-trace-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 0 3px;
}

.event-trace-entry {
  font-size: 11px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  color: #808080;
}
.event-trace-type { color: #569cd6; font-weight: 600; }
.event-trace-time { color: #d7ba7d; }

/* ---- Node Inspector Sidebar ---- */

.tree-with-sidebar {
  display: flex;
  height: 100%;
}

.tree-main {
  flex: 1;
  overflow: auto;
  min-width: 0;
}

.node-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-left: 1px solid #3c3c3c;
  overflow-y: auto;
  padding: 6px;
  background: #1e1e1e;
  font-size: 11px;
  display: none;
}
.node-sidebar.visible { display: block; }

.sidebar-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 0 2px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 2px;
}
.sidebar-title:first-child { padding-top: 0; }

.sidebar-row {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
  gap: 4px;
}
.sidebar-key { color: #9cdcfe; word-break: break-all; }
.sidebar-val { color: #ce9178; word-break: break-all; text-align: right; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }

.sidebar-empty { color: #555; font-style: italic; padding: 2px 0; }

.sidebar-mutation {
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 10px;
}
.sidebar-mut-action { color: #569cd6; }
.sidebar-mut-time { color: #555; }

.tree-line.selected { background: #094771; }

/* ---- Batch Diff View (Log tab) ---- */

.batch-group {
  margin: 2px 0;
  border: 1px solid #2d2d2d;
  border-radius: 3px;
}

.batch-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  background: #252526;
  cursor: pointer;
  font-size: 11px;
  user-select: none;
}
.batch-header:hover { background: #2a2d2e; }

.batch-toggle {
  color: #808080;
  font-size: 9px;
  width: 12px;
  text-align: center;
  flex-shrink: 0;
}

.batch-uid { color: #569cd6; font-weight: 600; }
.batch-count { color: #808080; }

.batch-entries {
  display: none;
  padding: 0 4px 2px 18px;
}
.batch-group.expanded .batch-entries { display: block; }

.log-entry.color-green .log-action { color: #4ec9b0; }
.log-entry.color-blue .log-action { color: #569cd6; }
.log-entry.color-red .log-action { color: #f44747; }

/* ---- Mutation Type Chart (Performance tab) ---- */

.chart-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 11px;
}

.chart-bar-label {
  color: #808080;
  flex-shrink: 0;
  width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-bar-track {
  flex: 1;
  height: 12px;
  background: #2d2d2d;
  border-radius: 2px;
  overflow: hidden;
}

.chart-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: #569cd6;
  transition: width 0.15s;
}

.chart-bar-value {
  color: #d4d4d4;
  flex-shrink: 0;
  width: 50px;
  text-align: right;
  font-size: 10px;
}

/* ---- Coalescing Visualizer (Performance tab) ---- */

.coalesce-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
}
.coalesce-action { color: #569cd6; width: 120px; flex-shrink: 0; }
.coalesce-detail { color: #808080; flex: 1; }
.coalesce-pct { color: #d7ba7d; flex-shrink: 0; width: 60px; text-align: right; }

/* ---- Flush button ---- */

.flush-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 1px 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  border-radius: 3px;
  white-space: nowrap;
  margin-left: 6px;
}
.flush-btn:hover { background: #505050; }

/* ---- Coalesced log (dimmed/strikethrough) ---- */

.coalesced-entry {
  display: flex;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
  opacity: 0.5;
  text-decoration: line-through;
}
.coalesced-entry .log-action { color: #808080; }

.coalesced-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  font-size: 11px;
  color: #808080;
}
.coalesced-toggle input { margin: 0; }
.coalesced-toggle label { cursor: pointer; }

/* ---- Event / Sync Read log entries ---- */

.log-section-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 0 3px;
  border-top: 1px solid #2d2d2d;
  margin-top: 4px;
}

.log-entry.event-entry .log-action { color: #d7ba7d; }
.log-entry.syncread-entry .log-action { color: #c586c0; }

/* Responsive / mobile-friendly */
@media (max-width: 600px) {
  .panel { width: calc(100vw - 16px) !important; height: 50vh !important; left: 8px; right: 8px; bottom: 8px; }
  .panel.collapsed { width: auto; height: auto; }
  .tab-bar button { padding: 4px 8px; font-size: 10px; }
  .header-bar { padding: 2px 8px; }
  .tree-tag, .log-action { font-size: 11px; }
  .stat-row { font-size: 11px; }
}
@media (max-width: 400px) {
  .panel { width: calc(100vw - 8px) !important; left: 4px; right: 4px; }
  .tab-bar button { padding: 3px 6px; font-size: 9px; }
}
`;

// ---- Helpers ----

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function formatTime(ts: number): string {
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) {
		const now = new Date();
		const h = String(now.getHours()).padStart(2, "0");
		const m = String(now.getMinutes()).padStart(2, "0");
		const s = String(now.getSeconds()).padStart(2, "0");
		return `${h}:${m}:${s}`;
	}
	const h = String(d.getHours()).padStart(2, "0");
	const m = String(d.getMinutes()).padStart(2, "0");
	const s = String(d.getSeconds()).padStart(2, "0");
	const ms = String(d.getMilliseconds()).padStart(3, "0");
	return `${h}:${m}:${s}.${ms}`;
}

function truncate(str: string, max: number): string {
	return str.length > max ? `${str.slice(0, max)}...` : str;
}

// ASCII sparkline from an array of numbers
function sparkline(data: number[]): string {
	if (data.length === 0) return "";
	const chars = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";
	const max = Math.max(...data);
	const min = Math.min(...data);
	const range = max - min || 1;
	return data.map((v) => chars[Math.min(Math.floor(((v - min) / range) * 7), 7)]).join("");
}

// ---- Panel creation ----

export function createDevtoolsPanel(): { destroy: () => void } {
	const host = document.createElement("div");
	host.id = "__async-dom-devtools__";
	const shadow = host.attachShadow({ mode: "open" });

	const style = document.createElement("style");
	style.textContent = PANEL_CSS;
	shadow.appendChild(style);

	const panel = document.createElement("div");
	panel.className = "panel collapsed";

	// Collapsed toggle tab
	const toggleTab = document.createElement("button");
	toggleTab.className = "toggle-tab";

	const healthDot = document.createElement("span");
	healthDot.style.cssText =
		"display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background-color:#4ec9b0;vertical-align:middle;";
	toggleTab.appendChild(healthDot);

	const toggleTabText = document.createElement("span");
	toggleTabText.textContent = "async-dom \u25B2";
	toggleTab.appendChild(toggleTabText);

	panel.appendChild(toggleTab);

	// Header bar
	const headerBar = document.createElement("div");
	headerBar.className = "header-bar";

	const headerTitle = document.createElement("span");
	headerTitle.className = "header-title";
	headerTitle.textContent = "async-dom devtools";
	headerBar.appendChild(headerTitle);

	const headerActions = document.createElement("div");
	headerActions.className = "header-actions";

	const highlightBtn = document.createElement("button");
	highlightBtn.className = "header-btn";
	highlightBtn.textContent = "\u2B24";
	highlightBtn.title = "Highlight DOM updates";
	highlightBtn.style.fontSize = "8px";
	highlightBtn.style.color = "#808080";
	highlightBtn.addEventListener("click", () => {
		highlightUpdatesEnabled = !highlightUpdatesEnabled;
		highlightBtn.style.color = highlightUpdatesEnabled ? "#4ec9b0" : "#808080";
		const dt = getDevtools();
		if (dt) dt.enableHighlightUpdates(highlightUpdatesEnabled);
	});
	headerActions.appendChild(highlightBtn);

	const refreshBtn = document.createElement("button");
	refreshBtn.className = "header-btn";
	refreshBtn.textContent = "\u21BB";
	refreshBtn.title = "Refresh data from workers";
	headerActions.appendChild(refreshBtn);

	const closeBtn = document.createElement("button");
	closeBtn.className = "header-btn";
	closeBtn.textContent = "\u25BC";
	closeBtn.title = "Collapse";
	headerActions.appendChild(closeBtn);

	headerBar.appendChild(headerActions);
	panel.appendChild(headerBar);

	// App bar (multi-app support)
	const appBar = document.createElement("div");
	appBar.className = "app-bar";
	panel.appendChild(appBar);

	let selectedAppId: string | null = null;

	// Tab bar
	const tabBar = document.createElement("div");
	tabBar.className = "tab-bar";

	const tabs = ["Tree", "Performance", "Log", "Warnings"] as const;
	type TabName = (typeof tabs)[number];
	const tabBtns: Record<string, HTMLButtonElement> = {};
	const tabPanels: Record<string, HTMLDivElement> = {};

	for (const tabName of tabs) {
		const btn = document.createElement("button");
		btn.className = `tab-btn${tabName === "Tree" ? " active" : ""}`;
		btn.textContent = tabName;
		btn.dataset.tab = tabName;
		tabBar.appendChild(btn);
		tabBtns[tabName] = btn;
	}
	panel.appendChild(tabBar);

	// Warning badge
	const warningBadge = document.createElement("span");
	warningBadge.className = "tab-badge";
	warningBadge.style.display = "none";

	// Tab contents
	let activeTab: TabName = "Tree";

	function switchTab(name: TabName): void {
		activeTab = name;
		for (const t of tabs) {
			tabBtns[t].classList.toggle("active", t === name);
			tabPanels[t].classList.toggle("active", t === name);
		}
		if (name === "Warnings") {
			warningBadgeCount = 0;
			updateWarningBadge();
		}
		renderActiveTab();
	}

	for (const tabName of tabs) {
		tabBtns[tabName].addEventListener("click", () => switchTab(tabName));
	}

	// ---- Tree content ----
	const treeContent = document.createElement("div");
	treeContent.className = "tab-content active";
	treeContent.innerHTML =
		'<div class="tree-empty">Click refresh to load virtual DOM tree from worker.</div>';
	tabPanels.Tree = treeContent as HTMLDivElement;
	panel.appendChild(treeContent);

	// ---- Performance content ----
	const perfContent = document.createElement("div");
	perfContent.className = "tab-content";
	perfContent.innerHTML = '<div class="perf-row"><span class="perf-label">Loading...</span></div>';
	tabPanels.Performance = perfContent as HTMLDivElement;
	panel.appendChild(perfContent);

	// ---- Log content ----
	const logContent = document.createElement("div");
	logContent.className = "tab-content";

	const logToolbar = document.createElement("div");
	logToolbar.className = "log-toolbar";

	const logFilter = document.createElement("input");
	logFilter.className = "log-filter";
	logFilter.placeholder = "Filter...";
	logFilter.type = "text";
	logToolbar.appendChild(logFilter);

	const logCountSpan = document.createElement("span");
	logCountSpan.className = "log-count";
	logCountSpan.textContent = "0";
	logToolbar.appendChild(logCountSpan);

	const logPauseBtn = document.createElement("button");
	logPauseBtn.className = "log-btn";
	logPauseBtn.textContent = "Pause";
	logToolbar.appendChild(logPauseBtn);

	const logAutoScrollBtn = document.createElement("button");
	logAutoScrollBtn.className = "log-btn active";
	logAutoScrollBtn.textContent = "Auto-scroll";
	logToolbar.appendChild(logAutoScrollBtn);

	const logClearBtn = document.createElement("button");
	logClearBtn.className = "log-btn";
	logClearBtn.textContent = "Clear";
	logToolbar.appendChild(logClearBtn);

	logContent.appendChild(logToolbar);

	const logList = document.createElement("div");
	logList.className = "log-list";
	logList.innerHTML = '<div class="log-empty">No mutations captured yet.</div>';
	logContent.appendChild(logList);

	tabPanels.Log = logContent as HTMLDivElement;
	panel.appendChild(logContent);

	// ---- Warnings content ----
	const warnContent = document.createElement("div");
	warnContent.className = "tab-content";

	const warnToolbar = document.createElement("div");
	warnToolbar.className = "log-toolbar";

	const warnFilter = document.createElement("input");
	warnFilter.className = "log-filter";
	warnFilter.placeholder = "Filter warnings...";
	warnFilter.type = "text";
	warnToolbar.appendChild(warnFilter);

	const warnViewToggle = document.createElement("button");
	warnViewToggle.className = "log-btn warn-view-toggle";
	warnViewToggle.textContent = "Chronological";
	warnToolbar.appendChild(warnViewToggle);

	const warnClearBtn = document.createElement("button");
	warnClearBtn.className = "log-btn";
	warnClearBtn.textContent = "Clear";
	warnToolbar.appendChild(warnClearBtn);
	warnContent.appendChild(warnToolbar);

	const warnList = document.createElement("div");
	warnList.className = "log-list";
	warnList.innerHTML = '<div class="warn-empty">No warnings captured yet.</div>';
	warnContent.appendChild(warnList);

	tabPanels.Warnings = warnContent as HTMLDivElement;
	panel.appendChild(warnContent);

	// Attach badge to Warnings tab button
	tabBtns.Warnings.appendChild(warningBadge);

	shadow.appendChild(panel);
	document.body.appendChild(host);

	// ---- State ----
	let treePollTimer: ReturnType<typeof setInterval> | null = null;
	let perfPollTimer: ReturnType<typeof setInterval> | null = null;
	let logRenderTimer: ReturnType<typeof setInterval> | null = null;
	let autoScroll = true;
	const queueHistory: number[] = [];
	const MAX_HISTORY = 30;
	let highlightUpdatesEnabled = false;
	let selectedNodeForSidebar: TreeNode | null = null;
	let expandedFrameId: number | null = null;

	// ---- Feature 1: Queue pressure health dot (polls even when collapsed) ----
	function updateHealthDot(): void {
		const dt = getDevtools();
		if (!dt?.scheduler?.stats) return;
		const stats = dt.scheduler.stats();
		const pending = stats.pending;
		if (pending > 1000 || !stats.isRunning) {
			healthDot.style.backgroundColor = "#f44747"; // red
		} else if (pending > 100) {
			healthDot.style.backgroundColor = "#d7ba7d"; // yellow
		} else {
			healthDot.style.backgroundColor = "#4ec9b0"; // green
		}
	}

	const healthDotTimer = setInterval(updateHealthDot, 2000);

	function getDevtools(): DevtoolsAPI | null {
		return (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ as DevtoolsAPI | null;
	}

	// ---- Toggle expand / collapse ----

	function expand(): void {
		panel.classList.remove("collapsed");
		requestTreeRefresh();
		startPolling();
	}

	function collapse(): void {
		panel.classList.add("collapsed");
		stopPolling();
	}

	toggleTab.addEventListener("click", expand);
	closeBtn.addEventListener("click", collapse);

	// ---- Refresh: request data from workers ----

	function requestTreeRefresh(): void {
		const dt = getDevtools();
		if (!dt) return;
		dt.refreshDebugData();
		// Render after a short delay to let the response arrive
		setTimeout(() => {
			updateAppBar();
			renderActiveTab();
		}, 250);
	}

	refreshBtn.addEventListener("click", requestTreeRefresh);

	// ---- App bar ----

	function updateAppBar(): void {
		const dt = getDevtools();
		if (!dt) return;
		const apps = dt.apps();
		if (apps.length <= 1) {
			appBar.classList.remove("visible");
			selectedAppId = apps[0] ?? null;
			return;
		}
		appBar.classList.add("visible");
		appBar.innerHTML = "";

		const label = document.createElement("span");
		label.className = "app-label";
		label.textContent = "Apps:";
		appBar.appendChild(label);

		if (selectedAppId === null || !apps.includes(selectedAppId)) {
			selectedAppId = apps[0];
		}

		for (const id of apps) {
			const btn = document.createElement("button");
			btn.className = `app-btn${id === selectedAppId ? " active" : ""}`;
			btn.textContent = id;
			btn.addEventListener("click", () => {
				selectedAppId = id;
				updateAppBar();
				renderActiveTab();
			});
			appBar.appendChild(btn);
		}
	}

	function renderActiveTab(): void {
		if (activeTab === "Tree") renderTreeTab();
		else if (activeTab === "Performance") renderPerfTab();
		else if (activeTab === "Log") renderLogTab();
		else if (activeTab === "Warnings") renderWarningsTab();
	}

	// ---- Tree rendering (VIRTUAL DOM from worker) ----

	function renderNodeSidebar(sidebar: HTMLDivElement, node: TreeNode): void {
		sidebar.innerHTML = "";

		// Node ID
		if (node.id != null) {
			const title0 = document.createElement("div");
			title0.className = "sidebar-title";
			title0.textContent = "Node";
			sidebar.appendChild(title0);

			const row0 = document.createElement("div");
			row0.className = "sidebar-row";
			row0.innerHTML = `<span class="sidebar-key">_nodeId</span><span class="sidebar-val">${node.id}</span>`;
			sidebar.appendChild(row0);
		}

		// Type + tag
		const typeRow = document.createElement("div");
		typeRow.className = "sidebar-row";
		typeRow.innerHTML = `<span class="sidebar-key">type</span><span class="sidebar-val">${escapeHtml(node.type)}</span>`;
		sidebar.appendChild(typeRow);

		if (node.tag) {
			const tagRow = document.createElement("div");
			tagRow.className = "sidebar-row";
			tagRow.innerHTML = `<span class="sidebar-key">tag</span><span class="sidebar-val">${escapeHtml(node.tag)}</span>`;
			sidebar.appendChild(tagRow);
		}

		// Children count
		const childCount = node.children?.length ?? 0;
		const childRow = document.createElement("div");
		childRow.className = "sidebar-row";
		childRow.innerHTML = `<span class="sidebar-key">children</span><span class="sidebar-val">${childCount}</span>`;
		sidebar.appendChild(childRow);

		// isConnected (check via findRealNode)
		const dt = getDevtools();
		if (dt && node.id != null) {
			const realNode = dt.findRealNode(node.id);
			const connected = realNode ? (realNode as Element).isConnected : false;
			const connRow = document.createElement("div");
			connRow.className = "sidebar-row";
			connRow.innerHTML = `<span class="sidebar-key">isConnected</span><span class="sidebar-val">${connected}</span>`;
			sidebar.appendChild(connRow);
		}

		// Attributes
		const attrs = node.attributes ?? {};
		const attrKeys = Object.keys(attrs);
		if (attrKeys.length > 0) {
			const attrTitle = document.createElement("div");
			attrTitle.className = "sidebar-title";
			attrTitle.textContent = "Attributes";
			sidebar.appendChild(attrTitle);

			for (const key of attrKeys) {
				const row = document.createElement("div");
				row.className = "sidebar-row";
				row.innerHTML = `<span class="sidebar-key">${escapeHtml(key)}</span><span class="sidebar-val" title="${escapeHtml(attrs[key])}">${escapeHtml(truncate(attrs[key], 30))}</span>`;
				sidebar.appendChild(row);
			}
		} else if (node.type === "element") {
			const attrTitle = document.createElement("div");
			attrTitle.className = "sidebar-title";
			attrTitle.textContent = "Attributes";
			sidebar.appendChild(attrTitle);
			const emptyAttr = document.createElement("div");
			emptyAttr.className = "sidebar-empty";
			emptyAttr.textContent = "none";
			sidebar.appendChild(emptyAttr);
		}

		// Inline styles (from style attribute)
		if (attrs.style) {
			const styleTitle = document.createElement("div");
			styleTitle.className = "sidebar-title";
			styleTitle.textContent = "Inline Styles";
			sidebar.appendChild(styleTitle);

			const parts = attrs.style.split(";").filter((s) => s.trim());
			for (const part of parts) {
				const colonIdx = part.indexOf(":");
				if (colonIdx === -1) continue;
				const prop = part.slice(0, colonIdx).trim();
				const val = part.slice(colonIdx + 1).trim();
				const row = document.createElement("div");
				row.className = "sidebar-row";
				row.innerHTML = `<span class="sidebar-key">${escapeHtml(prop)}</span><span class="sidebar-val">${escapeHtml(val)}</span>`;
				sidebar.appendChild(row);
			}
		}

		// Recent mutations targeting this node
		if (node.id != null) {
			const nodeId = node.id;
			const recentMuts = mutationLog.filter((entry) => {
				const m = entry.mutation as Record<string, unknown>;
				return m.id === nodeId;
			});
			const mutTitle = document.createElement("div");
			mutTitle.className = "sidebar-title";
			mutTitle.textContent = `Mutations (${recentMuts.length})`;
			sidebar.appendChild(mutTitle);

			if (recentMuts.length === 0) {
				const emptyMut = document.createElement("div");
				emptyMut.className = "sidebar-empty";
				emptyMut.textContent = "none captured";
				sidebar.appendChild(emptyMut);
			} else {
				const last10 = recentMuts.slice(-10);
				for (const entry of last10) {
					const div = document.createElement("div");
					div.className = "sidebar-mutation";
					div.innerHTML = `<span class="sidebar-mut-time">${formatTime(entry.timestamp)}</span> <span class="sidebar-mut-action">${escapeHtml(entry.action)}</span>`;
					sidebar.appendChild(div);
				}
			}
		}

		sidebar.classList.add("visible");
	}

	function renderTreeTab(): void {
		const dt = getDevtools();
		if (!dt) {
			treeContent.innerHTML = '<div class="tree-empty">Devtools API not available.</div>';
			return;
		}

		const allData = dt.getAllAppsData();
		const appIds = Object.keys(allData);

		if (appIds.length === 0) {
			treeContent.innerHTML =
				'<div class="tree-empty">No apps registered. Click \u21BB to refresh.</div>';
			return;
		}

		// If multi-app, show selected app; if single, show only one
		const targetAppId = selectedAppId && allData[selectedAppId] ? selectedAppId : appIds[0];
		const data = allData[targetAppId];

		if (!data || !data.tree) {
			treeContent.innerHTML =
				'<div class="tree-empty">No virtual DOM tree received yet. Click \u21BB to refresh.</div>';
			return;
		}

		const tree = data.tree as TreeNode;

		// Layout: tree + sidebar
		const layout = document.createElement("div");
		layout.className = "tree-with-sidebar";

		const treeMain = document.createElement("div");
		treeMain.className = "tree-main";

		// Status line
		const statusLine = document.createElement("div");
		statusLine.className = "tree-refresh-bar";
		const statusText = document.createElement("span");
		statusText.className = "tree-status";
		statusText.textContent = `Virtual DOM for app: ${targetAppId}`;
		statusLine.appendChild(statusText);
		treeMain.appendChild(statusLine);

		const sidebar = document.createElement("div") as HTMLDivElement;
		sidebar.className = "node-sidebar";

		buildTreeDOM(treeMain, tree, 0, true, dt, sidebar);

		layout.appendChild(treeMain);
		layout.appendChild(sidebar);

		treeContent.innerHTML = "";
		treeContent.appendChild(layout);

		// If we had a selected node, try to render sidebar for it
		if (selectedNodeForSidebar) {
			renderNodeSidebar(sidebar, selectedNodeForSidebar);
		}
	}

	function buildTreeDOM(
		parent: HTMLElement,
		node: TreeNode,
		depth: number,
		expanded: boolean,
		dt: DevtoolsAPI,
		sidebar: HTMLDivElement,
	): void {
		const wrapper = document.createElement("div");
		wrapper.className = `tree-node${expanded ? " expanded" : ""}`;

		const line = document.createElement("div");
		line.className = "tree-line";
		line.style.paddingLeft = `${depth * 14}px`;

		// Helper to select node in sidebar
		function selectForSidebar(): void {
			// Remove previous selection highlight
			const prev = parent.closest(".tree-with-sidebar")?.querySelector(".tree-line.selected");
			if (prev) prev.classList.remove("selected");
			line.classList.add("selected");

			selectedNodeForSidebar = node;
			renderNodeSidebar(sidebar, node);
		}

		if (node.type === "text") {
			const toggle = document.createElement("span");
			toggle.className = "tree-toggle";
			line.appendChild(toggle);

			const textSpan = document.createElement("span");
			textSpan.className = "tree-text-node";
			textSpan.textContent = `"${truncate((node.text ?? "").trim(), 50)}"`;
			line.appendChild(textSpan);

			if (node.id != null) {
				const idSpan = document.createElement("span");
				idSpan.className = "tree-nodeid";
				idSpan.textContent = `_${node.id}`;
				line.appendChild(idSpan);
			}

			line.addEventListener("click", selectForSidebar);
			wrapper.appendChild(line);
			parent.appendChild(wrapper);
			return;
		}

		if (node.type === "comment") {
			const toggle = document.createElement("span");
			toggle.className = "tree-toggle";
			line.appendChild(toggle);

			const commentSpan = document.createElement("span");
			commentSpan.className = "tree-comment";
			commentSpan.textContent = `<!-- ${truncate(node.text ?? "", 40)} -->`;
			line.appendChild(commentSpan);

			line.addEventListener("click", selectForSidebar);
			wrapper.appendChild(line);
			parent.appendChild(wrapper);
			return;
		}

		// Element node
		const children = node.children ?? [];
		const hasChildren = children.length > 0;

		const toggleEl = document.createElement("span");
		toggleEl.className = "tree-toggle";
		toggleEl.textContent = hasChildren ? (expanded ? "\u25BC" : "\u25B6") : " ";
		line.appendChild(toggleEl);

		// Build tag string: <tag .className #id>
		const tag = (node.tag ?? "???").toLowerCase();
		const tagSpan = document.createElement("span");
		let html = `<span class="tree-tag">&lt;${escapeHtml(tag)}</span>`;

		const attrs = node.attributes ?? {};
		if (attrs.id) {
			html += ` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${escapeHtml(attrs.id)}"</span>`;
		}
		if (node.className) {
			const cls = truncate(node.className, 30);
			html += ` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${escapeHtml(cls)}"</span>`;
		}

		// Show up to 2 extra attributes
		let shownAttrs = 0;
		for (const attrName in attrs) {
			if (attrName === "id" || attrName === "class") continue;
			if (shownAttrs >= 2) break;
			html += ` <span class="tree-attr-name">${escapeHtml(attrName)}</span>=<span class="tree-attr-value">"${escapeHtml(truncate(attrs[attrName], 20))}"</span>`;
			shownAttrs++;
		}

		html += `<span class="tree-tag">&gt;</span>`;
		tagSpan.innerHTML = html;
		line.appendChild(tagSpan);

		if (node.id != null) {
			const nidSpan = document.createElement("span");
			nidSpan.className = "tree-nodeid";
			nidSpan.textContent = `_${node.id}`;
			line.appendChild(nidSpan);
		}

		// Click: toggle children, select for sidebar, or highlight real DOM node
		line.addEventListener("click", (e: MouseEvent) => {
			if (hasChildren && e.target === toggleEl) {
				wrapper.classList.toggle("expanded");
				toggleEl.textContent = wrapper.classList.contains("expanded") ? "\u25BC" : "\u25B6";
				return;
			}
			// Select for sidebar inspection
			selectForSidebar();
			// Also highlight real DOM node via findRealNode
			if (node.id != null) {
				const realNode = dt.findRealNode(node.id) as HTMLElement | null;
				if (realNode && "scrollIntoView" in realNode) {
					realNode.scrollIntoView({ behavior: "smooth", block: "center" });
					const prev = realNode.style.outline;
					const prevOffset = realNode.style.outlineOffset;
					realNode.style.outline = "3px solid #007acc";
					realNode.style.outlineOffset = "2px";
					setTimeout(() => {
						realNode.style.outline = prev;
						realNode.style.outlineOffset = prevOffset;
					}, 1500);
				}
			}
		});

		wrapper.appendChild(line);

		if (hasChildren) {
			const childrenDiv = document.createElement("div");
			childrenDiv.className = "tree-children";
			for (const child of children) {
				buildTreeDOM(childrenDiv, child, depth + 1, depth < 2, dt, sidebar);
			}
			wrapper.appendChild(childrenDiv);
		}

		parent.appendChild(wrapper);
	}

	// ---- Performance rendering ----

	function renderPerfTab(): void {
		const dt = getDevtools();
		if (!dt) {
			perfContent.innerHTML =
				'<div class="perf-row"><span class="perf-label">Devtools API not available.</span></div>';
			return;
		}

		const stats = dt.scheduler.stats();
		const pending = stats.pending;

		// Track queue depth history
		queueHistory.push(pending);
		if (queueHistory.length > MAX_HISTORY) queueHistory.shift();

		let html = "";

		// Scheduler section with Flush button
		html +=
			'<div class="perf-section-title">Scheduler<button class="flush-btn" id="flush-btn">\u23E9 Flush</button></div>';

		let pendingClass = "";
		if (pending > 1000) pendingClass = "red";
		else if (pending > 100) pendingClass = "yellow";
		else pendingClass = "green";

		html += `<div class="perf-row"><span class="perf-label">Pending</span><span class="perf-value ${pendingClass}">${pending}</span></div>`;
		html += `<div class="perf-row"><span class="perf-label">Frame ID</span><span class="perf-value">${stats.frameId}</span></div>`;

		const ftClass =
			stats.lastFrameTimeMs > 16 ? "red" : stats.lastFrameTimeMs > 12 ? "yellow" : "green";
		html += `<div class="perf-row"><span class="perf-label">Frame Time</span><span class="perf-value ${ftClass}">${stats.lastFrameTimeMs.toFixed(1)}ms</span></div>`;

		html += `<div class="perf-row"><span class="perf-label">Frame Actions</span><span class="perf-value">${stats.lastFrameActions}</span></div>`;

		const runClass = stats.isRunning ? "green" : "yellow";
		html += `<div class="perf-row"><span class="perf-label">Running</span><span class="perf-value ${runClass}">${stats.isRunning ? "Yes" : "No"}</span></div>`;

		html += `<div class="perf-row"><span class="perf-label">Last Tick</span><span class="perf-value">${stats.lastTickTime > 0 ? `${stats.lastTickTime.toFixed(0)}ms` : "N/A"}</span></div>`;

		// Enqueue-to-apply latency
		const latencyMs = stats.enqueueToApplyMs;
		const latencyClass = latencyMs > 16 ? "red" : latencyMs > 5 ? "yellow" : "green";
		html += `<div class="perf-row"><span class="perf-label">Enqueue\u2192Apply</span><span class="perf-value ${latencyClass}">${latencyMs > 0 ? `${latencyMs.toFixed(1)}ms` : "N/A"}</span></div>`;

		// Queue depth sparkline
		if (queueHistory.length > 1) {
			html += `<div class="perf-row"><span class="perf-label">Queue (${MAX_HISTORY}f)</span><span class="perf-sparkline">${sparkline(queueHistory)}</span></div>`;
		}

		// Apps section
		const apps = dt.apps();
		html += `<div class="perf-row"><span class="perf-label">Apps</span><span class="perf-value">${apps.length}</span></div>`;

		// Worker stats per app (from cached debug data)
		const allData = dt.getAllAppsData();
		for (const appId of apps) {
			const data = allData[appId];
			if (!data?.workerStats) continue;

			const ws = data.workerStats as { added: number; coalesced: number; flushed: number };
			html += `<div class="perf-section-title">Worker: ${escapeHtml(appId)}</div>`;
			html += `<div class="perf-row"><span class="perf-label">Mutations Added</span><span class="perf-value">${ws.added}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Mutations Coalesced</span><span class="perf-value">${ws.coalesced}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Mutations Flushed</span><span class="perf-value">${ws.flushed}</span></div>`;

			const coalescingRatio = ws.added > 0 ? ((ws.coalesced / ws.added) * 100).toFixed(1) : "0.0";
			const ratioClass =
				Number.parseFloat(coalescingRatio) > 50
					? "green"
					: Number.parseFloat(coalescingRatio) > 20
						? "yellow"
						: "";
			html += `<div class="perf-row"><span class="perf-label">Coalescing Ratio</span><span class="perf-value ${ratioClass}">${coalescingRatio}%</span></div>`;
		}

		// Main Thread Stats (DebugStats)
		if (dt.debugStats) {
			const ds = dt.debugStats();
			html += '<div class="perf-section-title">Main Thread Stats</div>';
			const statKeys: Array<[string, string]> = [
				["mutationsAdded", "Mutations Added"],
				["mutationsCoalesced", "Mutations Coalesced"],
				["mutationsFlushed", "Mutations Flushed"],
				["mutationsApplied", "Mutations Applied"],
				["eventsForwarded", "Events Forwarded"],
				["eventsDispatched", "Events Dispatched"],
				["syncReadRequests", "Sync Read Requests"],
				["syncReadTimeouts", "Sync Read Timeouts"],
			];
			for (const [key, label] of statKeys) {
				const val = ds[key] ?? 0;
				const valClass = key === "syncReadTimeouts" && val > 0 ? "red" : "";
				html += `<div class="perf-row"><span class="perf-label">${escapeHtml(label)}</span><span class="perf-value ${valClass}">${val}</span></div>`;
			}
		}

		// Frame budget flamechart
		const frameLog = dt.scheduler.frameLog();
		if (frameLog.length > 0) {
			html += '<div class="frame-section-title">Frames</div>';
			const budget = 16;
			for (const frame of frameLog) {
				const pct = Math.min((frame.totalMs / budget) * 100, 100);
				const ratio = frame.totalMs / budget;
				let colorClass: string;
				if (ratio > 1) colorClass = "red";
				else if (ratio > 0.5) colorClass = "yellow";
				else colorClass = "green";
				const warn = frame.totalMs > budget ? " !" : "";
				html += `<div class="frame-bar-row" data-frame-id="${frame.frameId}">`;
				html += `<span class="frame-label">#${frame.frameId}</span>`;
				html += `<span class="frame-bar-track"><span class="frame-bar-fill ${colorClass}" style="width:${pct.toFixed(1)}%"></span></span>`;
				html += `<span class="frame-info">${frame.totalMs.toFixed(1)}ms / ${budget}ms (${frame.actionCount})${warn}</span>`;
				html += "</div>";
				if (expandedFrameId === frame.frameId) {
					html += '<div class="frame-detail">';
					const entries = [...frame.timingBreakdown.entries()].sort((a, b) => b[1] - a[1]);
					for (const [action, ms] of entries) {
						html += `<div class="frame-detail-row"><span class="frame-detail-action">${escapeHtml(action)}</span><span class="frame-detail-time">${ms.toFixed(2)}ms</span></div>`;
					}
					html += "</div>";
				}
			}
		}

		// Coalescing Visualizer: per-type breakdown
		for (const appId of apps) {
			const data = allData[appId];
			if (!data?.perTypeCoalesced) continue;

			const ptc = data.perTypeCoalesced as Record<string, { added: number; coalesced: number }>;
			const actions = Object.keys(ptc);
			if (actions.length === 0) continue;

			html += `<div class="perf-section-title">Coalescing: ${escapeHtml(appId)}</div>`;
			for (const action of actions) {
				const c = ptc[action];
				const pct = c.added > 0 ? ((c.coalesced / c.added) * 100).toFixed(0) : "0";
				html += `<div class="coalesce-row">`;
				html += `<span class="coalesce-action">${escapeHtml(action)}</span>`;
				html += `<span class="coalesce-detail">${c.added} added, ${c.coalesced} coalesced</span>`;
				html += `<span class="coalesce-pct">(${pct}%)</span>`;
				html += "</div>";
			}
		}

		// Mutation Type Chart: horizontal bar chart from mutation log
		if (mutationLog.length > 0) {
			const typeCounts = new Map<string, number>();
			for (const entry of mutationLog) {
				typeCounts.set(entry.action, (typeCounts.get(entry.action) ?? 0) + 1);
			}
			const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
			const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

			html += '<div class="perf-section-title">Mutation Types</div>';
			for (const [action, count] of sorted) {
				const pct = Math.max((count / maxCount) * 100, 2);
				html += `<div class="chart-bar-row">`;
				html += `<span class="chart-bar-label">${escapeHtml(action)}</span>`;
				html += `<span class="chart-bar-track"><span class="chart-bar-fill" style="width:${pct.toFixed(1)}%"></span></span>`;
				html += `<span class="chart-bar-value">${count}</span>`;
				html += "</div>";
			}
		}

		perfContent.innerHTML = html;

		// Wire flush button
		const flushBtn = perfContent.querySelector("#flush-btn");
		if (flushBtn) {
			flushBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				const dtf = getDevtools();
				if (dtf) dtf.scheduler.flush();
				renderPerfTab();
			});
		}

		// Wire click handlers for frame rows
		const frameRows = perfContent.querySelectorAll(".frame-bar-row");
		for (const row of frameRows) {
			row.addEventListener("click", () => {
				const fid = Number((row as HTMLElement).dataset.frameId);
				expandedFrameId = expandedFrameId === fid ? null : fid;
				renderPerfTab();
			});
		}
	}

	// ---- Log rendering ----

	let lastRenderedLogLength = 0;
	let showCoalesced = false;

	logPauseBtn.addEventListener("click", () => {
		logPaused = !logPaused;
		logPauseBtn.textContent = logPaused ? "Resume" : "Pause";
		logPauseBtn.classList.toggle("active", logPaused);
	});

	logAutoScrollBtn.addEventListener("click", () => {
		autoScroll = !autoScroll;
		logAutoScrollBtn.classList.toggle("active", autoScroll);
	});

	function getActionColorClass(action: string): string {
		switch (action) {
			case "createNode":
			case "createComment":
			case "appendChild":
			case "bodyAppendChild":
			case "headAppendChild":
			case "insertBefore":
				return "color-green";
			case "setAttribute":
			case "removeAttribute":
			case "setStyle":
			case "setClassName":
			case "setProperty":
			case "setTextContent":
			case "setHTML":
			case "insertAdjacentHTML":
				return "color-blue";
			case "removeNode":
			case "removeChild":
				return "color-red";
			default:
				return "";
		}
	}

	function buildLogEntryDiv(entry: MutationLogEntry): HTMLDivElement {
		const div = document.createElement("div");
		const colorClass = getActionColorClass(entry.action);
		div.className = `log-entry${colorClass ? ` ${colorClass}` : ""}`;

		const timeSpan = document.createElement("span");
		timeSpan.className = "log-time";
		timeSpan.textContent = formatTime(entry.timestamp);
		div.appendChild(timeSpan);

		const actionSpan = document.createElement("span");
		actionSpan.className = "log-action";
		actionSpan.textContent = entry.action;
		div.appendChild(actionSpan);

		const detailSpan = document.createElement("span");
		detailSpan.className = "log-detail";
		const nodeId = "id" in entry.mutation ? entry.mutation.id : undefined;
		let detail = nodeId != null ? `#${nodeId}` : "";
		const m = entry.mutation as Record<string, unknown>;
		if (m.tag) detail += ` tag=${m.tag}`;
		if (m.name && entry.action !== "addEventListener") detail += ` ${m.name}`;
		if (m.property) detail += ` ${m.property}`;
		detailSpan.textContent = detail;
		div.appendChild(detailSpan);

		return div;
	}

	function renderLogTab(): void {
		logCountSpan.textContent = String(mutationLog.length);

		if (mutationLog.length === 0) {
			if (lastRenderedLogLength !== 0) {
				logList.innerHTML = '<div class="log-empty">No mutations captured yet.</div>';
				lastRenderedLogLength = 0;
			}
			return;
		}

		const filterText = logFilter.value.toLowerCase().trim();
		const fragment = document.createDocumentFragment();

		// Group mutations by batchUid
		interface BatchGroup {
			batchUid: number | undefined;
			entries: MutationLogEntry[];
		}
		const groups: BatchGroup[] = [];
		let currentGroup: BatchGroup | null = null;

		for (const entry of mutationLog) {
			if (filterText && !entry.action.toLowerCase().includes(filterText)) continue;

			const uid = entry.batchUid;
			if (uid != null && currentGroup !== null && currentGroup.batchUid === uid) {
				currentGroup.entries.push(entry);
			} else {
				currentGroup = { batchUid: uid, entries: [entry] };
				groups.push(currentGroup);
			}
		}

		for (const group of groups) {
			// If no batchUid or only one entry, render flat
			if (group.batchUid == null || group.entries.length <= 1) {
				for (const entry of group.entries) {
					fragment.appendChild(buildLogEntryDiv(entry));
				}
				continue;
			}

			// Render as collapsible batch group
			const batchDiv = document.createElement("div");
			batchDiv.className = "batch-group";

			const header = document.createElement("div");
			header.className = "batch-header";

			const toggle = document.createElement("span");
			toggle.className = "batch-toggle";
			toggle.textContent = "\u25B6";
			header.appendChild(toggle);

			const uidSpan = document.createElement("span");
			uidSpan.className = "batch-uid";
			uidSpan.textContent = `Batch #${group.batchUid}`;
			header.appendChild(uidSpan);

			const countSpan = document.createElement("span");
			countSpan.className = "batch-count";
			countSpan.textContent = `\u2014 ${group.entries.length} mutations`;
			header.appendChild(countSpan);

			header.addEventListener("click", () => {
				batchDiv.classList.toggle("expanded");
				toggle.textContent = batchDiv.classList.contains("expanded") ? "\u25BC" : "\u25B6";
			});

			batchDiv.appendChild(header);

			const entriesDiv = document.createElement("div");
			entriesDiv.className = "batch-entries";
			for (const entry of group.entries) {
				entriesDiv.appendChild(buildLogEntryDiv(entry));
			}
			batchDiv.appendChild(entriesDiv);

			fragment.appendChild(batchDiv);
		}

		logList.innerHTML = "";
		logList.appendChild(fragment);

		// Event round-trip tracer section
		const dt = getDevtools();
		if (dt) {
			const traces = dt.getEventTraces();
			if (traces.length > 0) {
				const traceSection = document.createElement("div");
				traceSection.className = "event-trace-section";

				const traceTitle = document.createElement("div");
				traceTitle.className = "event-trace-title";
				traceTitle.textContent = `Events (${traces.length})`;
				traceSection.appendChild(traceTitle);

				const recent = traces.slice(-20);
				for (const trace of recent) {
					const eventTime = trace.timestamp;
					const mutCount = mutationLog.filter(
						(m) => m.timestamp >= eventTime && m.timestamp <= eventTime + 100,
					).length;
					const div = document.createElement("div");
					div.className = "event-trace-entry";
					div.innerHTML =
						`[<span class="event-trace-type">${escapeHtml(trace.eventType)}</span>]` +
						` serialize <span class="event-trace-time">${trace.serializeMs.toFixed(1)}ms</span>` +
						` transport dispatch` +
						`${mutCount > 0 ? ` ${mutCount} mutations` : ""}`;
					traceSection.appendChild(div);
				}

				logList.appendChild(traceSection);
			}
		}

		// Events section (Gap 4)
		if (eventLog.length > 0) {
			const evtSection = document.createElement("div");
			evtSection.className = "log-section-title";
			evtSection.textContent = `Events (${eventLog.length})`;
			logList.appendChild(evtSection);

			const recentEvents = eventLog.slice(-50);
			for (const entry of recentEvents) {
				const div = document.createElement("div");
				div.className = "log-entry event-entry";

				const timeSpan = document.createElement("span");
				timeSpan.className = "log-time";
				timeSpan.textContent = formatTime(entry.timestamp);
				div.appendChild(timeSpan);

				const actionSpan = document.createElement("span");
				actionSpan.className = "log-action";
				actionSpan.textContent = entry.eventType;
				div.appendChild(actionSpan);

				const detailSpan = document.createElement("span");
				detailSpan.className = "log-detail";
				detailSpan.textContent = `${entry.phase}\u2192${entry.phase === "serialize" ? "dispatch" : "done"} targetId=${entry.targetId ?? "?"}`;
				div.appendChild(detailSpan);

				logList.appendChild(div);
			}
		}

		// Sync Reads section (Gap 4)
		if (syncReadLog.length > 0) {
			const syncSection = document.createElement("div");
			syncSection.className = "log-section-title";
			syncSection.textContent = `Sync Reads (${syncReadLog.length})`;
			logList.appendChild(syncSection);

			const recentReads = syncReadLog.slice(-50);
			for (const entry of recentReads) {
				const div = document.createElement("div");
				div.className = "log-entry syncread-entry";

				const timeSpan = document.createElement("span");
				timeSpan.className = "log-time";
				timeSpan.textContent = formatTime(entry.timestamp);
				div.appendChild(timeSpan);

				const actionSpan = document.createElement("span");
				actionSpan.className = "log-action";
				const queryNames = ["boundingRect", "computedStyle", "nodeProperty", "windowProperty"];
				actionSpan.textContent = queryNames[entry.queryType] ?? `query:${entry.queryType}`;
				div.appendChild(actionSpan);

				const detailSpan = document.createElement("span");
				detailSpan.className = "log-detail";
				detailSpan.textContent = `node=${entry.nodeId} ${entry.latencyMs.toFixed(1)}ms ${entry.result}`;
				div.appendChild(detailSpan);

				logList.appendChild(div);
			}
		}

		// Coalesced log section (Gap 2)
		{
			const coalescedToggleDiv = document.createElement("div");
			coalescedToggleDiv.className = "coalesced-toggle";
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = "coalesced-toggle-cb";
			checkbox.checked = showCoalesced;
			const label = document.createElement("label");
			label.htmlFor = "coalesced-toggle-cb";
			label.textContent = "Show coalesced";
			coalescedToggleDiv.appendChild(checkbox);
			coalescedToggleDiv.appendChild(label);
			logList.appendChild(coalescedToggleDiv);

			checkbox.addEventListener("change", () => {
				showCoalesced = checkbox.checked;
				renderLogTab();
			});

			if (showCoalesced) {
				const allData = dt ? dt.getAllAppsData() : {};
				let allCoalesced: Array<{ action: string; key: string; timestamp: number }> = [];
				for (const data of Object.values(allData)) {
					if (data?.coalescedLog && Array.isArray(data.coalescedLog)) {
						allCoalesced = allCoalesced.concat(
							data.coalescedLog as Array<{ action: string; key: string; timestamp: number }>,
						);
					}
				}
				allCoalesced.sort((a, b) => b.timestamp - a.timestamp);
				const last50 = allCoalesced.slice(0, 50);

				if (last50.length > 0) {
					const coalTitle = document.createElement("div");
					coalTitle.className = "log-section-title";
					coalTitle.textContent = `Coalesced (${last50.length} of ${allCoalesced.length})`;
					logList.appendChild(coalTitle);

					for (const entry of last50) {
						const div = document.createElement("div");
						div.className = "coalesced-entry";

						const timeSpan = document.createElement("span");
						timeSpan.className = "log-time";
						timeSpan.textContent = formatTime(entry.timestamp);
						div.appendChild(timeSpan);

						const actionSpan = document.createElement("span");
						actionSpan.className = "log-action";
						actionSpan.textContent = entry.action;
						div.appendChild(actionSpan);

						const detailSpan = document.createElement("span");
						detailSpan.className = "log-detail";
						detailSpan.textContent = entry.key;
						div.appendChild(detailSpan);

						logList.appendChild(div);
					}
				}
			}
		}

		if (autoScroll) {
			logList.scrollTop = logList.scrollHeight;
		}
		lastRenderedLogLength = mutationLog.length;
	}

	logFilter.addEventListener("input", renderLogTab);

	logClearBtn.addEventListener("click", () => {
		mutationLog.length = 0;
		lastRenderedLogLength = 0;
		logList.innerHTML = '<div class="log-empty">No mutations captured yet.</div>';
		logCountSpan.textContent = "0";
	});

	// ---- Warnings rendering ----

	let lastRenderedWarningLength = 0;
	let warnViewMode: "grouped" | "chronological" = "grouped";
	const suppressedCodes = new Set<string>();

	warnViewToggle.addEventListener("click", () => {
		warnViewMode = warnViewMode === "grouped" ? "chronological" : "grouped";
		warnViewToggle.textContent = warnViewMode === "grouped" ? "Chronological" : "Grouped";
		warnViewToggle.classList.toggle("active", warnViewMode === "chronological");
		lastRenderedWarningLength = -1; // force re-render
		renderWarningsTab();
	});

	warnFilter.addEventListener("input", () => {
		lastRenderedWarningLength = -1; // force re-render
		renderWarningsTab();
	});

	function buildWarnEntryDiv(entry: WarningLogEntry): HTMLDivElement {
		const div = document.createElement("div");
		div.className = "warn-entry";

		const timeSpan = document.createElement("span");
		timeSpan.className = "warn-time";
		timeSpan.textContent = formatTime(entry.timestamp);
		div.appendChild(timeSpan);

		const codeSpan = document.createElement("span");
		codeSpan.className = `warn-code ${entry.code}`;
		codeSpan.textContent = entry.code;
		div.appendChild(codeSpan);

		const msgSpan = document.createElement("span");
		msgSpan.className = "warn-msg";
		const firstLine = entry.message.split("\n")[0];
		const hasStack = entry.message.includes("\n");
		msgSpan.textContent = firstLine;
		div.appendChild(msgSpan);

		if (hasStack) {
			div.style.cursor = "pointer";
			const stackPre = document.createElement("pre");
			stackPre.className = "warn-stack";
			stackPre.textContent = entry.message;
			stackPre.style.display = "none";
			div.appendChild(stackPre);
			div.addEventListener("click", () => {
				stackPre.style.display = stackPre.style.display === "none" ? "block" : "none";
			});
		}

		return div;
	}

	function renderWarningsTab(): void {
		if (warningLog.length === 0) {
			if (lastRenderedWarningLength !== 0) {
				warnList.innerHTML = '<div class="warn-empty">No warnings captured yet.</div>';
				lastRenderedWarningLength = 0;
			}
			return;
		}

		if (warningLog.length === lastRenderedWarningLength) return;

		const filterText = warnFilter.value.toLowerCase().trim();
		const fragment = document.createDocumentFragment();

		// Filter warnings by text
		const filtered = filterText
			? warningLog.filter(
					(e) =>
						e.code.toLowerCase().includes(filterText) ||
						e.message.toLowerCase().includes(filterText),
				)
			: warningLog;

		// Separate visible vs suppressed
		const visible = filtered.filter((e) => !suppressedCodes.has(e.code));
		const suppressedCount = filtered.length - visible.length;

		if (warnViewMode === "chronological") {
			// Flat chronological list (only non-suppressed)
			for (const entry of visible) {
				fragment.appendChild(buildWarnEntryDiv(entry));
			}
		} else {
			// Grouped view
			const groups = new Map<string, WarningLogEntry[]>();
			for (const entry of visible) {
				let arr = groups.get(entry.code);
				if (!arr) {
					arr = [];
					groups.set(entry.code, arr);
				}
				arr.push(entry);
			}

			for (const [code, entries] of groups) {
				const groupDiv = document.createElement("div");
				groupDiv.className = "warn-group";

				// Header
				const header = document.createElement("div");
				header.className = "warn-group-header";

				const toggle = document.createElement("span");
				toggle.className = "warn-group-toggle";
				toggle.textContent = "\u25B6";
				header.appendChild(toggle);

				const codeSpan = document.createElement("span");
				codeSpan.className = `warn-group-code warn-code ${code}`;
				codeSpan.textContent = code;
				header.appendChild(codeSpan);

				const countSpan = document.createElement("span");
				countSpan.className = "warn-group-count";
				countSpan.textContent = `(${entries.length})`;
				header.appendChild(countSpan);

				const suppressBtn = document.createElement("button");
				suppressBtn.className = "warn-suppress-btn";
				suppressBtn.textContent = "Suppress";
				suppressBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					suppressedCodes.add(code);
					lastRenderedWarningLength = -1; // force re-render
					renderWarningsTab();
				});
				header.appendChild(suppressBtn);

				header.addEventListener("click", () => {
					groupDiv.classList.toggle("expanded");
					toggle.textContent = groupDiv.classList.contains("expanded") ? "\u25BC" : "\u25B6";
				});

				groupDiv.appendChild(header);

				// Inline documentation
				const desc = WarningDescriptions[code as keyof typeof WarningDescriptions];
				if (desc) {
					const docDiv = document.createElement("div");
					docDiv.className = "warn-group-doc";
					const descP = document.createElement("div");
					descP.className = "warn-group-desc";
					descP.textContent = desc.description;
					docDiv.appendChild(descP);
					const sugP = document.createElement("div");
					sugP.className = "warn-group-suggestion";
					sugP.textContent = `Suggestion: ${desc.suggestion}`;
					docDiv.appendChild(sugP);
					groupDiv.appendChild(docDiv);
				}

				// Entries
				const entriesDiv = document.createElement("div");
				entriesDiv.className = "warn-group-entries";
				for (const entry of entries) {
					entriesDiv.appendChild(buildWarnEntryDiv(entry));
				}
				groupDiv.appendChild(entriesDiv);

				fragment.appendChild(groupDiv);
			}
		}

		warnList.innerHTML = "";
		warnList.appendChild(fragment);

		// Suppressed note
		if (suppressedCount > 0) {
			const note = document.createElement("div");
			note.className = "warn-suppressed-note";
			note.textContent = `${suppressedCount} suppressed warning${suppressedCount !== 1 ? "s" : ""} hidden`;
			const unsuppressBtn = document.createElement("button");
			unsuppressBtn.className = "warn-suppress-btn";
			unsuppressBtn.textContent = "Show all";
			unsuppressBtn.style.marginLeft = "8px";
			unsuppressBtn.addEventListener("click", () => {
				suppressedCodes.clear();
				lastRenderedWarningLength = -1;
				renderWarningsTab();
			});
			note.appendChild(unsuppressBtn);
			warnList.appendChild(note);
		}

		warnList.scrollTop = warnList.scrollHeight;
		lastRenderedWarningLength = warningLog.length;
	}

	warnClearBtn.addEventListener("click", () => {
		warningLog.length = 0;
		warningBadgeCount = 0;
		lastRenderedWarningLength = 0;
		warnList.innerHTML = '<div class="warn-empty">No warnings captured yet.</div>';
		updateWarningBadge();
	});

	// ---- Warning badge ----

	function updateWarningBadge(): void {
		if (warningBadgeCount > 0 && activeTab !== "Warnings") {
			warningBadge.textContent = String(warningBadgeCount > 99 ? "99+" : warningBadgeCount);
			warningBadge.style.display = "inline-block";
		} else {
			warningBadge.style.display = "none";
		}
		// Update collapsed tab text (preserving the health dot element)
		toggleTabText.textContent =
			warningBadgeCount > 0
				? `async-dom (${warningBadgeCount > 99 ? "99+" : warningBadgeCount}) \u25B2`
				: "async-dom \u25B2";
	}

	onWarningBadgeUpdate = updateWarningBadge;

	// ---- Polling ----

	function startPolling(): void {
		stopPolling();

		// Tree: request + render every 2 seconds
		treePollTimer = setInterval(() => {
			if (activeTab === "Tree") {
				const dt = getDevtools();
				if (dt) dt.refreshDebugData();
				setTimeout(renderTreeTab, 250);
			}
		}, 2000);

		// Performance: poll every 1 second (also refresh worker stats)
		perfPollTimer = setInterval(() => {
			if (activeTab === "Performance") {
				const dt = getDevtools();
				if (dt) dt.refreshDebugData();
				setTimeout(renderPerfTab, 250);
			}
		}, 1000);

		// Log + warnings: poll every 500ms
		logRenderTimer = setInterval(() => {
			if (activeTab === "Log") renderLogTab();
			if (activeTab === "Warnings") renderWarningsTab();
		}, 500);

		// Render current tab immediately
		renderActiveTab();
	}

	function stopPolling(): void {
		if (treePollTimer) {
			clearInterval(treePollTimer);
			treePollTimer = null;
		}
		if (perfPollTimer) {
			clearInterval(perfPollTimer);
			perfPollTimer = null;
		}
		if (logRenderTimer) {
			clearInterval(logRenderTimer);
			logRenderTimer = null;
		}
	}

	return {
		destroy(): void {
			stopPolling();
			clearInterval(healthDotTimer);
			onWarningBadgeUpdate = null;
			// Reset module-level state for clean re-creation (e.g., HMR)
			mutationLog.length = 0;
			warningLog.length = 0;
			eventLog.length = 0;
			syncReadLog.length = 0;
			warningBadgeCount = 0;
			host.remove();
		},
	};
}
