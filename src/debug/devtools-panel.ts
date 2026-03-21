import type {
	EventLogEntry,
	MutationEventCorrelation,
	MutationLogEntry,
	SyncReadLogEntry,
	WarningLogEntry,
} from "../core/debug.ts";
import { WarningDescriptions } from "../core/debug.ts";
import type { PerfEntryData } from "../core/protocol.ts";
import type { CausalityGraph, CausalityTracker } from "./causality-graph.ts";
import { formatBytes } from "./format-helpers.ts";
import {
	createReplayState,
	type ReplayState,
	replayReset,
	replaySeek,
	replayStep,
} from "./replay.ts";
import { type DebugSession, downloadJson, exportSession, importSession } from "./session-export.ts";
import { computePercentiles, latencyColorClass, syncReadColorClass } from "./stats-helpers.ts";
import {
	cloneSnapshot,
	diffTrees,
	hasChanges,
	type TreeDiffNode,
	type TreeSnapshot,
} from "./tree-diff.ts";

/**
 * The shape of __ASYNC_DOM_DEVTOOLS__ exposed on globalThis (main thread).
 */
interface FrameLogEntry {
	frameId: number;
	totalMs: number;
	actionCount: number;
	timingBreakdown: Map<string, number>;
	/** Feature 18: per-app mutation counts and deferred counts per frame */
	perApp?: Map<string, { mutations: number; deferred: number }>;
}

interface EventTraceEntry {
	eventType: string;
	serializeMs: number;
	timestamp: number;
	transportMs?: number;
	dispatchMs?: number;
	mutationCount?: number;
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
			droppedFrameCount: number;
			workerToMainLatencyMs: number;
		};
		frameLog: () => FrameLogEntry[];
		flush: () => void;
		stop: () => void;
		start: () => void;
	};
	debugStats: () => Record<string, number>;
	getEventTraces: () => EventTraceEntry[];
	getListenersForNode: (nodeId: number) => Array<{ listenerId: string; eventName: string }>;
	enableHighlightUpdates: (enabled: boolean) => void;
	findRealNode: (nodeId: number) => Node | null;
	apps: () => string[];
	renderers: () => Record<string, { root: unknown }>;
	refreshDebugData: () => void;
	getAppData: (appId: string) => AppDebugData | undefined;
	getAllAppsData: () => Record<string, AppDebugData>;
	getTransportStats: () => Record<
		string,
		{
			messageCount: number;
			totalBytes: number;
			largestMessageBytes: number;
			lastMessageBytes: number;
		} | null
	>;
	replayMutation: (mutation: import("../core/protocol.ts").DomMutation, appId: string) => void;
	clearAndReapply: (
		mutations: Array<{ mutation: import("../core/protocol.ts").DomMutation; batchUid?: number }>,
		upToIndex: number,
		appId?: string,
	) => void;
	/** Feature 15: Causality graph tracker */
	getCausalityTracker: () => CausalityTracker;
	/** Feature 16: Worker CPU profiler entries */
	getWorkerPerfEntries: () => Record<string, PerfEntryData[]>;
	/** Feature 19: Mutation-to-event correlation */
	getMutationCorrelation: () => MutationEventCorrelation;
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
let isReplaying = false;

export function captureMutation(entry: MutationLogEntry): void {
	if (logPaused || isReplaying) return;
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
	if (logPaused) {
		warningBadgeCount++;
		onWarningBadgeUpdate?.();
		return;
	}
	warningLog.push(entry);
	if (warningLog.length > MAX_WARNING_ENTRIES) warningLog.shift();
	warningBadgeCount++;
	onWarningBadgeUpdate?.();
}

/**
 * Reset module-level capture state. Used by destroy() and tests.
 */
export function resetDevtoolsState(): void {
	mutationLog.length = 0;
	warningLog.length = 0;
	eventLog.length = 0;
	syncReadLog.length = 0;
	warningBadgeCount = 0;
	logPaused = false;
	isReplaying = false;
}

/**
 * Set the logPaused flag. Exposed for testing.
 */
export function setLogPaused(value: boolean): void {
	logPaused = value;
}

/**
 * Set the isReplaying flag. Exposed for testing.
 */
export function setIsReplaying(value: boolean): void {
	isReplaying = value;
}

/**
 * Get current values of module-level flags. Exposed for testing.
 */
export function getDevtoolsFlags(): { logPaused: boolean; isReplaying: boolean } {
	return { logPaused, isReplaying };
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

.event-timeline { display: flex; align-items: center; gap: 2px; height: 16px; margin: 2px 0; cursor: pointer; }
.event-timeline:hover { background: #2a2d2e; }
.event-phase { height: 12px; border-radius: 2px; min-width: 4px; position: relative; }
.event-phase.serialize { background: #569cd6; }
.event-phase.transport { background: #d7ba7d; }
.event-phase.dispatch { background: #4ec9b0; }
.event-phase-label { font-size: 9px; color: #808080; white-space: nowrap; }
.event-mutation-count { color: #ce9178; font-weight: 600; font-size: 10px; }
.event-timeline-detail {
  padding: 4px 8px; background: #1a1a1a; border: 1px solid #333;
  border-radius: 3px; margin: 2px 0 4px 0; font-size: 10px; color: #d4d4d4; display: none;
}
.event-timeline-detail.visible { display: block; }

.sidebar-listener {
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 10px;
}
.sidebar-listener-event { color: #d7ba7d; font-weight: 600; }
.sidebar-listener-id { color: #555; margin-left: 4px; }
.sidebar-computed-val { color: #b5cea8; }

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

/* Sync Read Heatmap */
.heatmap-container { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 0; }
.heatmap-block { width: 14px; height: 14px; border-radius: 2px; cursor: pointer; position: relative; }
.heatmap-block.green { background: #4ec9b0; }
.heatmap-block.yellow { background: #d7ba7d; }
.heatmap-block.red { background: #f44747; }
.heatmap-tooltip { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #1a1a1a; border: 1px solid #555; padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap; z-index: 10; color: #d4d4d4; pointer-events: none; }

/* Latency sparkline color coding */
.perf-latency-val.green { color: #4ec9b0; }
.perf-latency-val.yellow { color: #d7ba7d; }
.perf-latency-val.red { color: #f44747; }

/* Threshold line on sparkline */
.sparkline-with-threshold { position: relative; display: inline-block; }
.sparkline-threshold { position: absolute; bottom: 50%; left: 0; right: 0; border-top: 1px dashed #f44747; opacity: 0.5; pointer-events: none; }
.transport-warn { color: #f44747; font-size: 10px; margin-left: 4px; }

/* ---- Replay bar ---- */

.replay-bar { display: flex; align-items: center; gap: 4px; padding: 4px 0; border-bottom: 1px solid #2d2d2d; margin-bottom: 4px; background: #1a1a1a; }
.replay-btn { background: #3c3c3c; border: 1px solid #555; color: #d4d4d4; padding: 2px 6px; cursor: pointer; font-family: inherit; font-size: 11px; border-radius: 3px; }
.replay-btn:hover { background: #505050; }
.replay-btn.active { background: #007acc; border-color: #007acc; }
.replay-slider { flex: 1; height: 4px; accent-color: #007acc; }
.replay-position { color: #808080; font-size: 10px; flex-shrink: 0; min-width: 60px; text-align: center; }
.replay-exit { color: #f44747; border-color: #f44747; }
.replay-exit:hover { background: #f44747; color: #fff; }
.replay-highlight { background: #094771 !important; }

/* ---- Import indicator ---- */

.import-indicator { color: #d7ba7d; font-size: 10px; margin-left: 6px; }
/* ---- Feature 15: Causality Graph tab ---- */

.graph-container {
  padding: 4px;
}

.graph-node {
  display: flex;
  align-items: flex-start;
  margin: 2px 0;
  padding: 3px 6px;
  border-left: 2px solid #3c3c3c;
  font-size: 11px;
}
.graph-node.event-node { border-left-color: #d7ba7d; }
.graph-node.batch-node { border-left-color: #569cd6; }
.graph-node.dom-node { border-left-color: #4ec9b0; }

.graph-node-label {
  color: #d4d4d4;
  cursor: pointer;
}
.graph-node-label:hover { text-decoration: underline; }

.graph-node-type {
  font-weight: 600;
  margin-right: 6px;
  font-size: 9px;
  text-transform: uppercase;
  flex-shrink: 0;
  width: 40px;
}
.graph-node-type.event { color: #d7ba7d; }
.graph-node-type.batch { color: #569cd6; }
.graph-node-type.node { color: #4ec9b0; }

.graph-children {
  padding-left: 16px;
}

.graph-empty {
  color: #808080;
  padding: 16px;
  text-align: center;
}

/* ---- Feature 16: Worker CPU Profiler ---- */

.worker-perf-section {
  margin-top: 8px;
}

.worker-perf-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 0;
  font-size: 10px;
}

.worker-perf-name {
  color: #808080;
  flex-shrink: 0;
  width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.worker-perf-duration {
  color: #d4d4d4;
  flex-shrink: 0;
  width: 60px;
  text-align: right;
}

.worker-perf-track {
  flex: 1;
  height: 10px;
  background: #2d2d2d;
  border-radius: 2px;
  overflow: hidden;
}

.worker-perf-fill {
  height: 100%;
  border-radius: 2px;
  background: #c586c0;
}

.worker-util {
  font-size: 11px;
  padding: 2px 0;
}
.worker-util-label { color: #808080; }
.worker-util-value { color: #d4d4d4; font-weight: 600; }

/* ---- Feature 17: Tree Diff ---- */

.snapshot-bar {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-bottom: 4px;
  flex-wrap: wrap;
}

.snapshot-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
}
.snapshot-btn:hover { background: #505050; }
.snapshot-btn:disabled { opacity: 0.4; cursor: default; }

.snapshot-info {
  color: #555;
  font-size: 10px;
}

.diff-marker {
  display: inline-block;
  font-size: 9px;
  padding: 0 3px;
  border-radius: 2px;
  margin-left: 4px;
  font-weight: 600;
}
.diff-marker.added { background: #2ea04333; color: #4ec9b0; }
.diff-marker.removed { background: #f4474733; color: #f44747; }
.diff-marker.changed { background: #d7ba7d33; color: #d7ba7d; }

.tree-line.diff-added { background: #2ea04315; }
.tree-line.diff-removed { background: #f4474715; text-decoration: line-through; opacity: 0.7; }
.tree-line.diff-changed { background: #d7ba7d15; }

/* ---- Feature 18: Multi-App Interleaving ---- */

.multiapp-frame {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 10px;
}

.multiapp-frame-label {
  color: #808080;
  flex-shrink: 0;
  width: 50px;
}

.multiapp-stacked-bar {
  flex: 1;
  height: 14px;
  display: flex;
  border-radius: 2px;
  overflow: hidden;
  background: #2d2d2d;
}

.multiapp-segment {
  height: 100%;
  min-width: 1px;
}

.multiapp-info {
  color: #808080;
  flex-shrink: 0;
  font-size: 10px;
  white-space: nowrap;
  width: 100px;
  text-align: right;
}

.multiapp-legend {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  font-size: 10px;
  flex-wrap: wrap;
}

.multiapp-legend-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.multiapp-legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* ---- Feature 19: Why Updated? ---- */

.why-updated-section {
  margin-top: 4px;
}

.why-updated-title {
  color: #c586c0;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 0 2px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 2px;
}

.why-updated-chain {
  padding: 2px 0;
  font-size: 10px;
  border-bottom: 1px solid #2a2a2a;
}

.why-chain-mutation { color: #569cd6; }
.why-chain-arrow { color: #555; margin: 0 3px; }
.why-chain-batch { color: #d7ba7d; }
.why-chain-event { color: #4ec9b0; }
.why-chain-none { color: #555; font-style: italic; }

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

	const importIndicator = document.createElement("span");
	importIndicator.className = "import-indicator";
	importIndicator.style.display = "none";
	headerTitle.appendChild(importIndicator);

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

	const exportBtn = document.createElement("button");
	exportBtn.className = "header-btn";
	exportBtn.textContent = "\u2193";
	exportBtn.title = "Export debug session";
	headerActions.appendChild(exportBtn);

	const importBtn = document.createElement("button");
	importBtn.className = "header-btn";
	importBtn.textContent = "\u2191";
	importBtn.title = "Import debug session";
	headerActions.appendChild(importBtn);

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

	const tabs = ["Tree", "Performance", "Log", "Warnings", "Graph"] as const;
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

	const logReplayBtn = document.createElement("button");
	logReplayBtn.className = "log-btn";
	logReplayBtn.textContent = "Replay";
	logToolbar.appendChild(logReplayBtn);

	logContent.appendChild(logToolbar);

	// Replay bar (hidden by default)
	const replayBar = document.createElement("div");
	replayBar.className = "replay-bar";
	replayBar.style.display = "none";

	const replayFirstBtn = document.createElement("button");
	replayFirstBtn.className = "replay-btn";
	replayFirstBtn.textContent = "\u23EE";
	replayBar.appendChild(replayFirstBtn);

	const replayPrevBtn = document.createElement("button");
	replayPrevBtn.className = "replay-btn";
	replayPrevBtn.textContent = "\u25C0";
	replayBar.appendChild(replayPrevBtn);

	const replayPlayBtn = document.createElement("button");
	replayPlayBtn.className = "replay-btn";
	replayPlayBtn.textContent = "\u25B6";
	replayBar.appendChild(replayPlayBtn);

	const replayStepFwdBtn = document.createElement("button");
	replayStepFwdBtn.className = "replay-btn";
	replayStepFwdBtn.textContent = "\u25B6\u2758";
	replayStepFwdBtn.title = "Step forward one entry";
	replayBar.appendChild(replayStepFwdBtn);

	const replayNextBtn = document.createElement("button");
	replayNextBtn.className = "replay-btn";
	replayNextBtn.textContent = "\u23ED";
	replayNextBtn.title = "Skip to end";
	replayBar.appendChild(replayNextBtn);

	const replaySlider = document.createElement("input");
	replaySlider.type = "range";
	replaySlider.className = "replay-slider";
	replaySlider.min = "0";
	replaySlider.max = "0";
	replaySlider.value = "0";
	replayBar.appendChild(replaySlider);

	const replayPosition = document.createElement("span");
	replayPosition.className = "replay-position";
	replayPosition.textContent = "0 / 0";
	replayBar.appendChild(replayPosition);

	const replaySpeedBtn = document.createElement("button");
	replaySpeedBtn.className = "replay-btn";
	replaySpeedBtn.textContent = "1x";
	replayBar.appendChild(replaySpeedBtn);

	const replayExitBtn = document.createElement("button");
	replayExitBtn.className = "replay-btn replay-exit";
	replayExitBtn.textContent = "\u2715 Exit";
	replayBar.appendChild(replayExitBtn);

	const logList = document.createElement("div");
	logList.className = "log-list";
	logList.innerHTML = '<div class="log-empty">No mutations captured yet.</div>';
	logContent.appendChild(logList);

	// Insert replay bar before logList (must be after both are created)
	logContent.insertBefore(replayBar, logList);

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

	// ---- Graph content (Feature 15: Causality Graph) ----
	const graphContent = document.createElement("div");
	graphContent.className = "tab-content";
	graphContent.innerHTML =
		'<div class="graph-empty">No causality data yet. Interact with the app to generate event-mutation data.</div>';
	tabPanels.Graph = graphContent as HTMLDivElement;
	panel.appendChild(graphContent);

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
	/** Tracks which node IDs are expanded in the tree view. Empty means "first render". */
	const expandedNodeIds = new Set<number>();
	/** Whether the tree has been rendered at least once (to distinguish first render). */
	let hasRenderedTree = false;
	let expandedFrameId: number | null = null;

	// Feature 3: Latency history tracking
	const latencyHistory: number[] = [];
	// Guards to prevent duplicate sparkline data on manual refresh
	let lastQueuePushFrameId = -1;
	let lastLatencyPushFrameId = -1;
	const MAX_LATENCY_HISTORY = 60;

	// Track pending setTimeout IDs so destroy() can cancel them
	let treeRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
	let perfRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
	let manualRefreshTimeout: ReturnType<typeof setTimeout> | null = null;

	// Replay state (Feature 8)
	let replayState: ReplayState | null = null;
	let replayTimer: ReturnType<typeof setInterval> | null = null;
	let replaySpeedMultiplier = 1;
	const REPLAY_SPEEDS = [1, 2, 5];

	// Import state (Feature 14)
	let importedSession: DebugSession | null = null;

	// Feature 17: Tree snapshots for diffing
	let snapshot1: TreeSnapshot | null = null;
	let snapshot2: TreeSnapshot | null = null;
	let showDiff = false;
	let currentDiff: TreeDiffNode | null = null;

	// ---- Feature 8: Replay controls ----

	function updateReplayUI(): void {
		if (!replayState) return;
		replaySlider.max = String(replayState.entries.length);
		replaySlider.value = String(replayState.currentIndex);
		replayPosition.textContent = `${replayState.currentIndex} / ${replayState.entries.length}`;
		replayPlayBtn.textContent = replayState.isPlaying ? "\u23F8" : "\u25B6";
		replayPlayBtn.classList.toggle("active", replayState.isPlaying);
	}

	function enterReplayMode(): void {
		if (importedSession) return; // no replay in imported mode
		const dt = getDevtools();
		// Pause the scheduler so live mutations don't interfere with replay
		dt?.scheduler.stop();
		isReplaying = true;
		replayState = createReplayState(mutationLog);
		replayBar.style.display = "flex";
		logReplayBtn.classList.add("active");
		updateReplayUI();
		renderLogTab();
	}

	function exitReplayMode(): void {
		if (replayTimer) {
			clearInterval(replayTimer);
			replayTimer = null;
		}
		const dt = getDevtools();
		if (replayState) {
			replayState.isPlaying = false;
			// Restore DOM to latest state by re-applying the full mutation log
			const appId = selectedAppId ?? dt?.apps()[0];
			if (dt?.clearAndReapply && appId) {
				dt.clearAndReapply(mutationLog, mutationLog.length, appId);
			}
			replayState = null;
		}
		isReplaying = false;
		// Resume the scheduler so live mutations flow again
		dt?.scheduler.start();
		replayBar.style.display = "none";
		logReplayBtn.classList.remove("active");
		renderLogTab();
	}

	function applyReplayMutation(entry: MutationLogEntry): void {
		const dt = getDevtools();
		if (!dt?.replayMutation) return;
		const appId = selectedAppId ?? dt.apps()[0];
		if (appId) dt.replayMutation(entry.mutation, appId);
	}

	function clearAndReapplyUpTo(index: number): void {
		if (!replayState) return;
		const dt = getDevtools();
		if (!dt?.clearAndReapply) return;
		const appId = selectedAppId ?? dt.apps()[0];
		dt.clearAndReapply(replayState.entries, index, appId);
	}

	function replayStepForwardOne(): void {
		if (!replayState) return;
		const entry = replayStep(replayState);
		if (entry) applyReplayMutation(entry);
		updateReplayUI();
		renderLogTab();
	}

	function replayStepBackward(): void {
		if (!replayState) return;
		if (replayState.currentIndex > 0) {
			replaySeek(replayState, replayState.currentIndex - 1);
			// Backward requires clearing and re-applying from scratch
			clearAndReapplyUpTo(replayState.currentIndex);
		}
		updateReplayUI();
		renderLogTab();
	}

	function replayGoToStart(): void {
		if (!replayState) return;
		replayReset(replayState);
		// Clear DOM — nothing to re-apply at index 0
		clearAndReapplyUpTo(0);
		updateReplayUI();
		renderLogTab();
	}

	function replayGoToEnd(): void {
		if (!replayState) return;
		replaySeek(replayState, replayState.entries.length);
		// Re-apply all mutations
		clearAndReapplyUpTo(replayState.entries.length);
		updateReplayUI();
		renderLogTab();
	}

	function toggleReplayPlay(): void {
		if (!replayState) return;
		replayState.isPlaying = !replayState.isPlaying;
		if (replayState.isPlaying) {
			const intervalMs = Math.max(50, 500 / replaySpeedMultiplier);
			replayTimer = setInterval(() => {
				if (!replayState || replayState.currentIndex >= replayState.entries.length) {
					if (replayState) replayState.isPlaying = false;
					if (replayTimer) {
						clearInterval(replayTimer);
						replayTimer = null;
					}
					updateReplayUI();
					return;
				}
				const entry = replayStep(replayState);
				if (entry) applyReplayMutation(entry);
				updateReplayUI();
				renderLogTab();
			}, intervalMs);
		} else {
			if (replayTimer) {
				clearInterval(replayTimer);
				replayTimer = null;
			}
		}
		updateReplayUI();
	}

	function cycleReplaySpeed(): void {
		const idx = REPLAY_SPEEDS.indexOf(replaySpeedMultiplier);
		replaySpeedMultiplier = REPLAY_SPEEDS[(idx + 1) % REPLAY_SPEEDS.length];
		replaySpeedBtn.textContent = `${replaySpeedMultiplier}x`;
		// Restart play interval if playing
		if (replayState?.isPlaying) {
			if (replayTimer) {
				clearInterval(replayTimer);
				replayTimer = null;
			}
			replayState.isPlaying = false;
			toggleReplayPlay();
		}
	}

	logReplayBtn.addEventListener("click", () => {
		if (replayState) exitReplayMode();
		else enterReplayMode();
	});
	replayFirstBtn.addEventListener("click", replayGoToStart);
	replayPrevBtn.addEventListener("click", replayStepBackward);
	replayPlayBtn.addEventListener("click", toggleReplayPlay);
	replayStepFwdBtn.addEventListener("click", replayStepForwardOne);
	replayNextBtn.addEventListener("click", replayGoToEnd);
	replaySlider.addEventListener("input", () => {
		if (!replayState) return;
		const target = Number(replaySlider.value);
		replaySeek(replayState, target);
		// Re-apply mutations up to the new position
		clearAndReapplyUpTo(replayState.currentIndex);
		updateReplayUI();
		renderLogTab();
	});
	replaySpeedBtn.addEventListener("click", cycleReplaySpeed);
	replayExitBtn.addEventListener("click", exitReplayMode);

	// ---- Feature 14: Export / Import ----

	exportBtn.addEventListener("click", () => {
		const dt = getDevtools();
		const schedulerStats = dt?.scheduler?.stats() ?? {};
		const allData = dt?.getAllAppsData() ?? {};
		const firstAppData = Object.values(allData)[0];

		const json = exportSession({
			mutationLog: importedSession ? importedSession.mutationLog : [...mutationLog],
			warningLog: importedSession ? importedSession.warningLog : [...warningLog],
			eventLog: importedSession ? importedSession.eventLog : [...eventLog],
			syncReadLog: importedSession ? importedSession.syncReadLog : [...syncReadLog],
			schedulerStats: schedulerStats as Record<string, unknown>,
			tree: firstAppData?.tree,
			appData: allData as Record<string, unknown>,
		});

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		downloadJson(json, `async-dom-session-${timestamp}.json`);
	});

	importBtn.addEventListener("click", () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => {
				try {
					const session = importSession(reader.result as string);
					enterImportMode(session);
				} catch (err) {
					console.error("[async-dom devtools] Import failed:", err);
				}
			};
			reader.readAsText(file);
		});
		input.click();
	});

	function setImportControlsDisabled(disabled: boolean): void {
		// Log tab controls
		logClearBtn.disabled = disabled;
		logPauseBtn.disabled = disabled;
		logAutoScrollBtn.disabled = disabled;
		logReplayBtn.disabled = disabled;
		// Warnings tab controls
		warnClearBtn.disabled = disabled;

		const grayedStyle = disabled ? "0.4" : "1";
		logClearBtn.style.opacity = grayedStyle;
		logPauseBtn.style.opacity = grayedStyle;
		logAutoScrollBtn.style.opacity = grayedStyle;
		logReplayBtn.style.opacity = grayedStyle;
		warnClearBtn.style.opacity = grayedStyle;

		if (disabled) {
			logClearBtn.style.pointerEvents = "none";
			logPauseBtn.style.pointerEvents = "none";
			logAutoScrollBtn.style.pointerEvents = "none";
			logReplayBtn.style.pointerEvents = "none";
			warnClearBtn.style.pointerEvents = "none";
		} else {
			logClearBtn.style.pointerEvents = "";
			logPauseBtn.style.pointerEvents = "";
			logAutoScrollBtn.style.pointerEvents = "";
			logReplayBtn.style.pointerEvents = "";
			warnClearBtn.style.pointerEvents = "";
		}
	}

	function enterImportMode(session: DebugSession): void {
		importedSession = session;
		// Pause live capture so incoming mutations don't overwrite the ring buffer
		logPaused = true;
		logPauseBtn.textContent = "Resume";
		logPauseBtn.classList.add("active");
		// Exit replay if active
		if (replayState) exitReplayMode();

		importIndicator.textContent = "[IMPORTED]";
		importIndicator.style.display = "inline";

		// Disable irrelevant controls
		setImportControlsDisabled(true);

		// Add a close-import button if not already present
		let closeImportBtn = headerActions.querySelector(
			".close-import-btn",
		) as HTMLButtonElement | null;
		if (!closeImportBtn) {
			closeImportBtn = document.createElement("button");
			closeImportBtn.className = "header-btn close-import-btn";
			closeImportBtn.textContent = "\u2715";
			closeImportBtn.title = "Close imported session";
			closeImportBtn.style.color = "#d7ba7d";
			closeImportBtn.addEventListener("click", exitImportMode);
			headerActions.insertBefore(closeImportBtn, headerActions.firstChild);
		}

		renderActiveTab();
	}

	function exitImportMode(): void {
		importedSession = null;
		importIndicator.style.display = "none";
		importIndicator.textContent = "";

		// Resume live capture
		logPaused = false;
		logPauseBtn.textContent = "Pause";
		logPauseBtn.classList.remove("active");

		// Re-enable controls
		setImportControlsDisabled(false);

		const closeImportBtn = headerActions.querySelector(".close-import-btn");
		if (closeImportBtn) closeImportBtn.remove();

		renderActiveTab();
	}

	// ---- Feature 1: Queue pressure health dot (polls even when collapsed) ----
	function updateHealthDot(): void {
		const dt = getDevtools();
		if (!dt?.scheduler?.stats) return;
		const stats = dt.scheduler.stats();
		const pending = stats.pending;
		if (pending > 1000 || !stats.isRunning || stats.lastFrameTimeMs > 16) {
			healthDot.style.backgroundColor = "#f44747"; // red
		} else if (pending > 100 || stats.lastFrameTimeMs > 12) {
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
		// Stop replay playback to prevent invisible DOM mutations while collapsed
		if (replayTimer) {
			clearInterval(replayTimer);
			replayTimer = null;
		}
		if (replayState?.isPlaying) {
			replayState.isPlaying = false;
			updateReplayUI();
		}
	}

	toggleTab.addEventListener("click", expand);
	closeBtn.addEventListener("click", collapse);

	// ---- Refresh: request data from workers ----

	function requestTreeRefresh(): void {
		const dt = getDevtools();
		if (!dt) return;
		dt.refreshDebugData();
		// Render after a short delay to let the response arrive
		manualRefreshTimeout = setTimeout(() => {
			manualRefreshTimeout = null;
			updateAppBar();
			renderActiveTab();
		}, 250);
	}

	refreshBtn.addEventListener("click", requestTreeRefresh);

	// ---- App bar ----

	/** Reset UI state that is specific to a particular app when switching apps. */
	function resetPerAppState(): void {
		// Tree tab: clear snapshots and diff state
		snapshot1 = null;
		snapshot2 = null;
		showDiff = false;
		currentDiff = null;
		selectedNodeForSidebar = null;
		expandedNodeIds.clear();
		hasRenderedTree = false;

		// Log tab: reset coalesced view and log render position
		showCoalesced = false;
		lastRenderedLogLength = 0;
		lastRenderedFilterText = "";
		lastRenderedEventLogLength = 0;
		lastRenderedSyncReadLogLength = 0;

		// Replay: exit replay mode if active
		if (replayState) {
			exitReplayMode();
		}

		// Performance: reset expanded frame
		expandedFrameId = null;
	}

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
			const previousAppId = selectedAppId;
			selectedAppId = apps[0];
			if (previousAppId !== null && previousAppId !== selectedAppId) {
				resetPerAppState();
			}
		}

		for (const id of apps) {
			const btn = document.createElement("button");
			btn.className = `app-btn${id === selectedAppId ? " active" : ""}`;
			btn.textContent = id;
			btn.addEventListener("click", () => {
				if (selectedAppId !== id) {
					selectedAppId = id;
					resetPerAppState();
				}
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
		else if (activeTab === "Graph") renderGraphTab();
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

		// Event Listeners
		if (dt && node.id != null) {
			const listeners = dt.getListenersForNode(node.id);
			const listenerTitle = document.createElement("div");
			listenerTitle.className = "sidebar-title";
			listenerTitle.textContent = `Event Listeners (${listeners.length})`;
			sidebar.appendChild(listenerTitle);

			if (listeners.length === 0) {
				const emptyListeners = document.createElement("div");
				emptyListeners.className = "sidebar-empty";
				emptyListeners.textContent = "none";
				sidebar.appendChild(emptyListeners);
			} else {
				for (const listener of listeners) {
					const listenerDiv = document.createElement("div");
					listenerDiv.className = "sidebar-listener";
					listenerDiv.innerHTML =
						`<span class="sidebar-listener-event">${escapeHtml(listener.eventName)}</span>` +
						`<span class="sidebar-listener-id">${escapeHtml(listener.listenerId)}</span>`;
					sidebar.appendChild(listenerDiv);
				}
			}
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

		// Computed Styles (from real DOM node)
		if (dt && node.id != null) {
			const realNode = dt.findRealNode(node.id) as HTMLElement | null;
			if (realNode && realNode.nodeType === 1 && typeof getComputedStyle === "function") {
				const computed = getComputedStyle(realNode);
				const keyProps = [
					"display",
					"position",
					"width",
					"height",
					"margin",
					"padding",
					"color",
					"backgroundColor",
					"fontSize",
					"fontFamily",
					"overflow",
					"visibility",
					"opacity",
					"zIndex",
				];
				const styleTitle = document.createElement("div");
				styleTitle.className = "sidebar-title";
				styleTitle.textContent = "Computed Styles";
				sidebar.appendChild(styleTitle);

				for (const prop of keyProps) {
					const val = computed.getPropertyValue(prop.replace(/([A-Z])/g, "-$1").toLowerCase());
					if (val) {
						const row = document.createElement("div");
						row.className = "sidebar-row";
						row.innerHTML =
							`<span class="sidebar-key">${escapeHtml(prop)}</span>` +
							`<span class="sidebar-val sidebar-computed-val">${escapeHtml(truncate(val, 24))}</span>`;
						sidebar.appendChild(row);
					}
				}
			}
		}

		// Recent mutations targeting this node (with action details)
		if (node.id != null) {
			const nodeId = node.id;
			const recentMuts = mutationLog.filter((entry) => {
				const m = entry.mutation as Record<string, unknown>;
				return m.id === nodeId;
			});
			const mutTitle = document.createElement("div");
			mutTitle.className = "sidebar-title";
			mutTitle.textContent = `Mutation History (${recentMuts.length})`;
			sidebar.appendChild(mutTitle);

			if (recentMuts.length === 0) {
				const emptyMut = document.createElement("div");
				emptyMut.className = "sidebar-empty";
				emptyMut.textContent = "none captured";
				sidebar.appendChild(emptyMut);
			} else {
				const last10 = recentMuts.slice(-10);
				for (const entry of last10) {
					const m = entry.mutation as Record<string, unknown>;
					let detail = "";
					if (m.name) detail += ` ${m.name}`;
					if (m.property) detail += ` .${m.property}`;
					if (m.value !== undefined) detail += `="${truncate(String(m.value), 20)}"`;
					if (m.tag) detail += ` <${m.tag}>`;
					if (m.textContent !== undefined) detail += ` "${truncate(String(m.textContent), 20)}"`;
					if (m.childId !== undefined) detail += ` child:${m.childId}`;

					const div = document.createElement("div");
					div.className = "sidebar-mutation";
					div.innerHTML =
						`<span class="sidebar-mut-time">${formatTime(entry.timestamp)}</span> ` +
						`<span class="sidebar-mut-action">${escapeHtml(entry.action)}</span>` +
						(detail
							? `<br><span style="color:#808080;font-size:9px;padding-left:4px">${escapeHtml(detail.trim())}</span>`
							: "");
					sidebar.appendChild(div);
				}
			}
		}

		// Feature 19: "Why Was This Node Updated?" section
		if (node.id != null) {
			const nodeId = node.id;
			const dt2 = getDevtools();
			if (dt2?.getMutationCorrelation) {
				const correlation = dt2.getMutationCorrelation();
				const whyEntries = correlation.getWhyUpdated(nodeId);

				const whyTitle = document.createElement("div");
				whyTitle.className = "why-updated-title";
				whyTitle.textContent = `Why Updated? (${whyEntries.length})`;
				sidebar.appendChild(whyTitle);

				if (whyEntries.length === 0) {
					const emptyWhy = document.createElement("div");
					emptyWhy.className = "sidebar-empty";
					emptyWhy.textContent = "no correlation data";
					sidebar.appendChild(emptyWhy);
				} else {
					const recentWhy = whyEntries.slice(-8);
					for (const entry of recentWhy) {
						const chain = document.createElement("div");
						chain.className = "why-updated-chain";

						// mutation action
						let html = `<span class="why-chain-mutation">${escapeHtml(entry.action)}</span>`;

						// batch
						if (entry.batchUid != null) {
							html += `<span class="why-chain-arrow">\u2192</span>`;
							html += `<span class="why-chain-batch">Batch #${entry.batchUid}</span>`;
						}

						// causal event
						if (entry.causalEvent) {
							html += `<span class="why-chain-arrow">\u2192</span>`;
							html += `<span class="why-chain-event">${escapeHtml(entry.causalEvent.eventType)}</span>`;
						} else {
							html += `<span class="why-chain-arrow">\u2192</span>`;
							html += `<span class="why-chain-none">no event</span>`;
						}

						chain.innerHTML = html;
						sidebar.appendChild(chain);
					}
				}
			}
		}

		sidebar.classList.add("visible");
	}

	function renderTreeTab(): void {
		// Imported session: show tree if available
		if (importedSession) {
			if (importedSession.tree) {
				const tree = importedSession.tree as TreeNode;
				const layout = document.createElement("div");
				layout.className = "tree-with-sidebar";
				const treeMain = document.createElement("div");
				treeMain.className = "tree-main";
				const statusLine = document.createElement("div");
				statusLine.className = "tree-refresh-bar";
				const statusText = document.createElement("span");
				statusText.className = "tree-status";
				statusText.textContent = "Imported session tree (read-only)";
				statusLine.appendChild(statusText);
				treeMain.appendChild(statusLine);
				const sidebar = document.createElement("div") as HTMLDivElement;
				sidebar.className = "node-sidebar";
				const fakeDt = getDevtools();
				if (fakeDt) {
					buildTreeDOM(treeMain, tree, 0, true, fakeDt, sidebar);
				}
				layout.appendChild(treeMain);
				layout.appendChild(sidebar);
				treeContent.innerHTML = "";
				treeContent.appendChild(layout);
			} else {
				treeContent.innerHTML = '<div class="tree-empty">Imported session has no tree data.</div>';
			}
			return;
		}

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

		// Feature 17: Snapshot/Diff bar
		const snapshotBar = document.createElement("div");
		snapshotBar.className = "snapshot-bar";

		const snapshotBtn = document.createElement("button");
		snapshotBtn.className = "snapshot-btn";
		snapshotBtn.textContent = snapshot1
			? snapshot2
				? "Reset Snapshots"
				: "Snapshot B"
			: "Snapshot A";
		snapshotBtn.addEventListener("click", () => {
			if (snapshot1 && snapshot2) {
				// Reset
				snapshot1 = null;
				snapshot2 = null;
				showDiff = false;
				currentDiff = null;
			} else if (!snapshot1) {
				snapshot1 = cloneSnapshot(tree as unknown as TreeSnapshot);
			} else {
				snapshot2 = cloneSnapshot(tree as unknown as TreeSnapshot);
			}
			renderTreeTab();
		});
		snapshotBar.appendChild(snapshotBtn);

		if (snapshot1 && snapshot2) {
			const diffBtn = document.createElement("button");
			diffBtn.className = "snapshot-btn";
			diffBtn.textContent = showDiff ? "Hide Diff" : "Show Diff";
			diffBtn.addEventListener("click", () => {
				showDiff = !showDiff;
				if (showDiff) {
					currentDiff = diffTrees(snapshot1, snapshot2);
				} else {
					currentDiff = null;
				}
				renderTreeTab();
			});
			snapshotBar.appendChild(diffBtn);
		}

		const snapshotInfo = document.createElement("span");
		snapshotInfo.className = "snapshot-info";
		if (snapshot1 && snapshot2) {
			snapshotInfo.textContent = "2 snapshots captured";
			if (showDiff && currentDiff) {
				snapshotInfo.textContent += hasChanges(currentDiff) ? " (changes found)" : " (no changes)";
			}
		} else if (snapshot1) {
			snapshotInfo.textContent = "1 snapshot captured";
		}
		snapshotBar.appendChild(snapshotInfo);

		treeMain.appendChild(snapshotBar);

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

		// Feature 17: if showing diff, render diff tree; otherwise normal tree
		if (showDiff && currentDiff) {
			buildDiffTreeDOM(treeMain, currentDiff, 0, true, dt, sidebar);
		} else {
			buildTreeDOM(treeMain, tree, 0, true, dt, sidebar);
		}

		layout.appendChild(treeMain);
		layout.appendChild(sidebar);

		treeContent.innerHTML = "";
		treeContent.appendChild(layout);

		// Mark that the tree has been rendered at least once so subsequent
		// rebuilds use expandedNodeIds instead of the depth-based default.
		hasRenderedTree = true;

		// Refresh selectedNodeForSidebar to point at the new tree's node
		// so the sidebar shows up-to-date metadata after a rebuild.
		if (selectedNodeForSidebar && selectedNodeForSidebar.id != null) {
			const freshNode = findTreeNodeById(tree, selectedNodeForSidebar.id);
			if (freshNode) {
				selectedNodeForSidebar = freshNode;
			}
		}

		// If we had a selected node, try to render sidebar for it
		if (selectedNodeForSidebar) {
			renderNodeSidebar(sidebar, selectedNodeForSidebar);
		}
	}

	/** Recursively find a TreeNode by its numeric id. */
	function findTreeNodeById(root: TreeNode, targetId: number): TreeNode | null {
		if (root.id === targetId) return root;
		for (const child of root.children ?? []) {
			const found = findTreeNodeById(child, targetId);
			if (found) return found;
		}
		return null;
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

		// Determine expanded state from expandedNodeIds (or default on first render)
		let isExpanded: boolean;
		if (node.id != null && hasRenderedTree) {
			isExpanded = expandedNodeIds.has(node.id);
		} else {
			// First render or node without id: use the depth-based default
			isExpanded = expanded;
			if (node.id != null && isExpanded) {
				expandedNodeIds.add(node.id);
			}
		}
		// Update wrapper class to reflect computed expanded state
		wrapper.className = `tree-node${isExpanded ? " expanded" : ""}`;

		const toggleEl = document.createElement("span");
		toggleEl.className = "tree-toggle";
		toggleEl.textContent = hasChildren ? (isExpanded ? "\u25BC" : "\u25B6") : " ";
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
				const nowExpanded = wrapper.classList.contains("expanded");
				toggleEl.textContent = nowExpanded ? "\u25BC" : "\u25B6";
				// Track expand/collapse state so it survives tree rebuilds
				if (node.id != null) {
					if (nowExpanded) {
						expandedNodeIds.add(node.id);
					} else {
						expandedNodeIds.delete(node.id);
					}
				}
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

	// ---- Feature 17: Diff tree rendering ----

	function buildDiffTreeDOM(
		parent: HTMLElement,
		diff: TreeDiffNode,
		depth: number,
		expanded: boolean,
		dt: DevtoolsAPI,
		sidebar: HTMLDivElement,
	): void {
		const node = diff.node;
		const wrapper = document.createElement("div");
		wrapper.className = `tree-node${expanded ? " expanded" : ""}`;

		const line = document.createElement("div");
		line.className = "tree-line";
		line.style.paddingLeft = `${depth * 14}px`;

		// Apply diff styling
		if (diff.diffType === "added") line.classList.add("diff-added");
		else if (diff.diffType === "removed") line.classList.add("diff-removed");
		else if (diff.diffType === "changed") line.classList.add("diff-changed");

		const children = diff.children ?? [];
		const hasChildren = children.length > 0;

		if (node.type === "text") {
			const toggle = document.createElement("span");
			toggle.className = "tree-toggle";
			line.appendChild(toggle);

			const textSpan = document.createElement("span");
			textSpan.className = "tree-text-node";
			textSpan.textContent = `"${truncate((node.text ?? "").trim(), 50)}"`;
			line.appendChild(textSpan);

			appendDiffMarker(line, diff);
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

			appendDiffMarker(line, diff);
			wrapper.appendChild(line);
			parent.appendChild(wrapper);
			return;
		}

		// Element node
		// Determine expanded state from expandedNodeIds (or default on first render)
		let isExpanded: boolean;
		if (node.id != null && hasRenderedTree) {
			isExpanded = expandedNodeIds.has(node.id);
		} else {
			isExpanded = expanded;
			if (node.id != null && isExpanded) {
				expandedNodeIds.add(node.id);
			}
		}
		wrapper.className = `tree-node${isExpanded ? " expanded" : ""}`;

		const toggleEl = document.createElement("span");
		toggleEl.className = "tree-toggle";
		toggleEl.textContent = hasChildren ? (isExpanded ? "\u25BC" : "\u25B6") : " ";
		line.appendChild(toggleEl);

		const tag = (node.tag ?? "???").toLowerCase();
		const tagSpan = document.createElement("span");
		let html = `<span class="tree-tag">&lt;${escapeHtml(tag)}</span>`;
		const attrs = node.attributes ?? {};
		if (attrs.id) {
			html += ` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${escapeHtml(attrs.id)}"</span>`;
		}
		if (node.className) {
			html += ` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${escapeHtml(truncate(node.className, 30))}"</span>`;
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

		appendDiffMarker(line, diff);

		if (hasChildren) {
			toggleEl.addEventListener("click", (e) => {
				e.stopPropagation();
				wrapper.classList.toggle("expanded");
				const nowExpanded = wrapper.classList.contains("expanded");
				toggleEl.textContent = nowExpanded ? "\u25BC" : "\u25B6";
				if (node.id != null) {
					if (nowExpanded) {
						expandedNodeIds.add(node.id);
					} else {
						expandedNodeIds.delete(node.id);
					}
				}
			});
		}

		wrapper.appendChild(line);

		if (hasChildren) {
			const childrenDiv = document.createElement("div");
			childrenDiv.className = "tree-children";
			for (const child of children) {
				buildDiffTreeDOM(childrenDiv, child, depth + 1, depth < 2, dt, sidebar);
			}
			wrapper.appendChild(childrenDiv);
		}

		parent.appendChild(wrapper);
	}

	function appendDiffMarker(line: HTMLElement, diff: TreeDiffNode): void {
		if (diff.diffType === "unchanged") return;
		const marker = document.createElement("span");
		marker.className = `diff-marker ${diff.diffType}`;
		if (diff.diffType === "added") marker.textContent = "+ADD";
		else if (diff.diffType === "removed") marker.textContent = "-DEL";
		else if (diff.diffType === "changed") {
			marker.textContent = `~${(diff.changes ?? []).join(",")}`;
		}
		line.appendChild(marker);
	}

	// ---- Performance rendering ----

	function renderPerfTab(): void {
		// Imported session: show read-only scheduler stats
		if (importedSession) {
			const ss = importedSession.schedulerStats;
			let html = '<div class="perf-section-title">Imported Session (read-only)</div>';
			for (const [key, val] of Object.entries(ss)) {
				html += `<div class="perf-row"><span class="perf-label">${escapeHtml(String(key))}</span><span class="perf-value">${escapeHtml(String(val))}</span></div>`;
			}
			html += `<div class="perf-row"><span class="perf-label">Exported At</span><span class="perf-value">${escapeHtml(importedSession.exportedAt)}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Mutations</span><span class="perf-value">${importedSession.mutationLog.length}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Warnings</span><span class="perf-value">${importedSession.warningLog.length}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Events</span><span class="perf-value">${importedSession.eventLog.length}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Sync Reads</span><span class="perf-value">${importedSession.syncReadLog.length}</span></div>`;
			perfContent.innerHTML = html;
			return;
		}

		const dt = getDevtools();
		if (!dt) {
			perfContent.innerHTML =
				'<div class="perf-row"><span class="perf-label">Devtools API not available.</span></div>';
			return;
		}

		const stats = dt.scheduler.stats();
		const pending = stats.pending;

		// Track queue depth history (guard against duplicate pushes on manual refresh)
		if (stats.frameId !== lastQueuePushFrameId) {
			queueHistory.push(pending);
			if (queueHistory.length > MAX_HISTORY) queueHistory.shift();
			lastQueuePushFrameId = stats.frameId;
		}

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

		// Worker-to-main cross-thread latency (real, from Date.now() diff)
		const workerLatencyMs = stats.workerToMainLatencyMs;
		if (workerLatencyMs > 0 && stats.frameId !== lastLatencyPushFrameId) {
			latencyHistory.push(workerLatencyMs);
			if (latencyHistory.length > MAX_LATENCY_HISTORY) latencyHistory.shift();
			lastLatencyPushFrameId = stats.frameId;
		}
		const workerLatencyClass = latencyColorClass(workerLatencyMs);
		html += `<div class="perf-row"><span class="perf-label">Worker\u2192Main</span><span class="perf-value ${workerLatencyClass}">${workerLatencyMs > 0 ? `${workerLatencyMs.toFixed(1)}ms` : "N/A"}</span></div>`;

		// Enqueue-to-apply latency (intra-main-thread)
		const enqueueLatencyMs = stats.enqueueToApplyMs;
		const enqueueLatencyClass = latencyColorClass(enqueueLatencyMs);
		html += `<div class="perf-row"><span class="perf-label">Enqueue\u2192Apply</span><span class="perf-value ${enqueueLatencyClass}">${enqueueLatencyMs > 0 ? `${enqueueLatencyMs.toFixed(1)}ms` : "N/A"}</span></div>`;

		// Latency percentiles
		if (latencyHistory.length > 0) {
			const pcts = computePercentiles(latencyHistory);
			html += `<div class="perf-row"><span class="perf-label">Latency P50</span><span class="perf-value ${latencyColorClass(pcts.p50)}">${pcts.p50.toFixed(1)}ms</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Latency P95</span><span class="perf-value ${latencyColorClass(pcts.p95)}">${pcts.p95.toFixed(1)}ms</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Latency P99</span><span class="perf-value ${latencyColorClass(pcts.p99)}">${pcts.p99.toFixed(1)}ms</span></div>`;
		}

		// Latency sparkline
		if (latencyHistory.length > 1) {
			html += `<div class="perf-row"><span class="perf-label">Latency (${MAX_LATENCY_HISTORY})</span><span class="perf-sparkline">${sparkline(latencyHistory)}</span></div>`;
		}

		// Dropped frames counter (Feature 7)
		const droppedFrames = stats.droppedFrameCount;
		const droppedClass = droppedFrames > 0 ? "red" : "green";
		html += `<div class="perf-row"><span class="perf-label">Dropped Frames</span><span class="perf-value ${droppedClass}">${droppedFrames}</span></div>`;

		// Queue depth sparkline with 16ms threshold reference
		if (queueHistory.length > 1) {
			html += `<div class="perf-row"><span class="perf-label">Queue (${MAX_HISTORY}f)</span><span class="sparkline-with-threshold"><span class="perf-sparkline">${sparkline(queueHistory)}</span><span class="sparkline-threshold"></span></span></div>`;
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

		// Feature 16: Worker CPU Profiler entries
		if (dt.getWorkerPerfEntries) {
			const allPerfEntries = dt.getWorkerPerfEntries();
			const appIds16 = Object.keys(allPerfEntries);
			for (const appId16 of appIds16) {
				const entries = allPerfEntries[appId16];
				if (!entries || entries.length === 0) continue;

				html += `<div class="perf-section-title">Worker CPU: ${escapeHtml(appId16)}</div>`;

				// Compute utilization: total duration vs wall time
				const totalDuration = entries.reduce((s, e) => s + e.duration, 0);
				const maxDuration = Math.max(...entries.map((e) => e.duration));

				// Group by name prefix (event vs flush)
				const eventEntries = entries.filter((e) => e.name.includes(":event:"));
				const flushEntries = entries.filter((e) => e.name.includes(":flush:"));
				const eventTotal = eventEntries.reduce((s, e) => s + e.duration, 0);
				const flushTotal = flushEntries.reduce((s, e) => s + e.duration, 0);

				html += `<div class="worker-util"><span class="worker-util-label">Total worker time: </span><span class="worker-util-value">${totalDuration.toFixed(1)}ms</span></div>`;
				html += `<div class="worker-util"><span class="worker-util-label">Event handlers: </span><span class="worker-util-value">${eventTotal.toFixed(1)}ms (${eventEntries.length} calls)</span></div>`;
				html += `<div class="worker-util"><span class="worker-util-label">Flush/coalesce: </span><span class="worker-util-value">${flushTotal.toFixed(1)}ms (${flushEntries.length} calls)</span></div>`;

				// Show top entries by duration
				const topEntries = entries
					.slice()
					.sort((a, b) => b.duration - a.duration)
					.slice(0, 10);
				for (const entry of topEntries) {
					const pct = maxDuration > 0 ? Math.max((entry.duration / maxDuration) * 100, 2) : 0;
					const shortName = entry.name.replace("async-dom:", "");
					html += `<div class="worker-perf-bar">`;
					html += `<span class="worker-perf-name" title="${escapeHtml(entry.name)}">${escapeHtml(shortName)}</span>`;
					html += `<span class="worker-perf-track"><span class="worker-perf-fill" style="width:${pct.toFixed(1)}%"></span></span>`;
					html += `<span class="worker-perf-duration">${entry.duration.toFixed(2)}ms</span>`;
					html += `</div>`;
				}
			}
		}

		// Feature 18: Multi-App Message Interleaving Timeline
		if (frameLog.length > 0) {
			const framesWithPerApp = frameLog.filter((f) => f.perApp && f.perApp.size > 0);
			if (framesWithPerApp.length > 0) {
				html += '<div class="perf-section-title">Multi-App Interleaving</div>';

				// Collect all app IDs for legend
				const allAppIds18 = new Set<string>();
				for (const frame of framesWithPerApp) {
					if (frame.perApp) {
						for (const key of frame.perApp.keys()) {
							allAppIds18.add(key);
						}
					}
				}
				const appColors18 = new Map<string, string>();
				const palette = [
					"#569cd6",
					"#4ec9b0",
					"#d7ba7d",
					"#c586c0",
					"#f44747",
					"#ce9178",
					"#6a9955",
				];
				let colorIdx = 0;
				for (const appKey of allAppIds18) {
					appColors18.set(appKey, palette[colorIdx % palette.length]);
					colorIdx++;
				}

				// Legend
				html += '<div class="multiapp-legend">';
				for (const [appKey, color] of appColors18) {
					html += `<span class="multiapp-legend-item"><span class="multiapp-legend-dot" style="background:${color}"></span>${escapeHtml(appKey)}</span>`;
				}
				html += "</div>";

				// Stacked bars per frame
				for (const frame of framesWithPerApp.slice(-20)) {
					const perApp = frame.perApp!;
					let totalMuts = 0;
					let totalDeferred = 0;
					for (const [, data] of perApp) {
						totalMuts += data.mutations;
						totalDeferred += data.deferred;
					}
					if (totalMuts === 0) continue;

					html += `<div class="multiapp-frame">`;
					html += `<span class="multiapp-frame-label">#${frame.frameId}</span>`;
					html += `<span class="multiapp-stacked-bar">`;
					for (const [appKey, data] of perApp) {
						const pct = (data.mutations / totalMuts) * 100;
						const color = appColors18.get(appKey) ?? "#569cd6";
						html += `<span class="multiapp-segment" style="width:${pct.toFixed(1)}%;background:${color}" title="${escapeHtml(appKey)}: ${data.mutations} muts, ${data.deferred} deferred"></span>`;
					}
					html += `</span>`;
					html += `<span class="multiapp-info">${totalMuts} muts${totalDeferred > 0 ? ` (${totalDeferred} def)` : ""}</span>`;
					html += `</div>`;
				}
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

		// Sync Read Heatmap (Feature 12)
		if (syncReadLog.length > 0) {
			const totalReads = syncReadLog.length;
			const timeouts = syncReadLog.filter((e) => e.result === "timeout").length;
			const timeoutRate = totalReads > 0 ? ((timeouts / totalReads) * 100).toFixed(1) : "0.0";
			const syncLatencies = syncReadLog.map((e) => e.latencyMs);
			const syncPcts = computePercentiles(syncLatencies);

			html += '<div class="perf-section-title">Sync Reads</div>';
			html += `<div class="perf-row"><span class="perf-label">Total</span><span class="perf-value">${totalReads}</span></div>`;
			const timeoutClass = timeouts > 0 ? "red" : "green";
			html += `<div class="perf-row"><span class="perf-label">Timeout Rate</span><span class="perf-value ${timeoutClass}">${timeoutRate}% (${timeouts})</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">P95 Latency</span><span class="perf-value ${syncReadColorClass(syncPcts.p95)}">${syncPcts.p95.toFixed(1)}ms</span></div>`;

			// Heatmap blocks
			html += '<div class="heatmap-container">';
			const recentReads = syncReadLog.slice(-100);
			const queryNames = ["boundingRect", "computedStyle", "nodeProperty", "windowProperty"];
			for (let i = 0; i < recentReads.length; i++) {
				const entry = recentReads[i];
				const colorCls = syncReadColorClass(entry.latencyMs);
				const queryName = queryNames[entry.queryType] ?? `query:${entry.queryType}`;
				html += `<div class="heatmap-block ${colorCls}" data-sync-read-idx="${i}" title="${entry.latencyMs.toFixed(1)}ms ${queryName} node=${entry.nodeId} ${entry.result}"></div>`;
			}
			html += "</div>";
		}

		// Transport section
		if (dt.getTransportStats) {
			const transportStats = dt.getTransportStats();
			const appIds = Object.keys(transportStats);
			if (appIds.length > 0) {
				html += '<div class="perf-section-title">Transport</div>';
				for (const appId of appIds) {
					const ts = transportStats[appId];
					if (!ts) continue;
					if (appIds.length > 1) {
						html += `<div class="perf-row"><span class="perf-label" style="font-weight:600">App: ${escapeHtml(appId)}</span><span class="perf-value"></span></div>`;
					}
					html += `<div class="perf-row"><span class="perf-label">Messages Sent</span><span class="perf-value">${ts.messageCount}</span></div>`;
					html += `<div class="perf-row"><span class="perf-label">Total Bytes</span><span class="perf-value">${formatBytes(ts.totalBytes)}</span></div>`;
					const avgBytes = ts.messageCount > 0 ? Math.round(ts.totalBytes / ts.messageCount) : 0;
					html += `<div class="perf-row"><span class="perf-label">Avg Message Size</span><span class="perf-value">${formatBytes(avgBytes)}</span></div>`;
					const largestClass = ts.largestMessageBytes > 102400 ? "red" : "";
					const largestWarn =
						ts.largestMessageBytes > 102400
							? '<span class="transport-warn">[!] exceeds 100KB</span>'
							: "";
					html += `<div class="perf-row"><span class="perf-label">Largest Message</span><span class="perf-value ${largestClass}">${formatBytes(ts.largestMessageBytes)}${largestWarn}</span></div>`;
					const lastClass = ts.lastMessageBytes > 102400 ? "red" : "";
					const lastWarn =
						ts.lastMessageBytes > 102400
							? '<span class="transport-warn">[!] exceeds 100KB</span>'
							: "";
					html += `<div class="perf-row"><span class="perf-label">Last Message</span><span class="perf-value ${lastClass}">${formatBytes(ts.lastMessageBytes)}${lastWarn}</span></div>`;
				}
			}
		}

		perfContent.innerHTML = html;

		// Wire sync read heatmap block click handlers
		const heatmapBlocks = perfContent.querySelectorAll(".heatmap-block");
		const queryNamesForClick = ["boundingRect", "computedStyle", "nodeProperty", "windowProperty"];
		for (const block of heatmapBlocks) {
			block.addEventListener("click", (e) => {
				const el = e.currentTarget as HTMLElement;
				// Remove any existing tooltip
				const existing = el.querySelector(".heatmap-tooltip");
				if (existing) {
					existing.remove();
					return;
				}
				// Remove tooltips from other blocks
				for (const b of heatmapBlocks) {
					const tip = b.querySelector(".heatmap-tooltip");
					if (tip) tip.remove();
				}
				const idx = Number(el.dataset.syncReadIdx);
				const recentReads = syncReadLog.slice(-100);
				const entry = recentReads[idx];
				if (!entry) return;
				const queryName = queryNamesForClick[entry.queryType] ?? `query:${entry.queryType}`;
				const tooltip = document.createElement("div");
				tooltip.className = "heatmap-tooltip";
				tooltip.textContent = `${queryName} node=${entry.nodeId} ${entry.latencyMs.toFixed(1)}ms ${entry.result}`;
				el.appendChild(tooltip);
			});
		}

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

	// ---- Feature 15: Graph tab rendering (Causality DAG) ----

	function renderGraphTab(): void {
		const dt = getDevtools();
		if (!dt?.getCausalityTracker) {
			graphContent.innerHTML = '<div class="graph-empty">Causality tracker not available.</div>';
			return;
		}

		const tracker = dt.getCausalityTracker();
		const graph = tracker.buildGraph();

		if (graph.roots.length === 0) {
			graphContent.innerHTML =
				'<div class="graph-empty">No causality data yet. Interact with the app to generate event-to-mutation data.</div>';
			return;
		}

		graphContent.innerHTML = "";

		const container = document.createElement("div");
		container.className = "graph-container";

		// Render each root and its subtree
		for (const rootId of graph.roots) {
			renderGraphNode(container, graph, rootId, 0);
		}

		graphContent.appendChild(container);
	}

	function renderGraphNode(
		parent: HTMLElement,
		graph: CausalityGraph,
		nodeId: string,
		depth: number,
	): void {
		const node = graph.nodes.get(nodeId);
		if (!node) return;

		const div = document.createElement("div");
		div.style.paddingLeft = `${depth * 16}px`;

		const line = document.createElement("div");
		let cssClass = "graph-node";
		if (node.type === "event") cssClass += " event-node";
		else if (node.type === "batch") cssClass += " batch-node";
		else cssClass += " dom-node";
		line.className = cssClass;

		const typeSpan = document.createElement("span");
		typeSpan.className = `graph-node-type ${node.type}`;
		typeSpan.textContent = node.type === "event" ? "EVT" : node.type === "batch" ? "BAT" : "NOD";
		line.appendChild(typeSpan);

		const labelSpan = document.createElement("span");
		labelSpan.className = "graph-node-label";
		labelSpan.textContent = node.label;
		line.appendChild(labelSpan);

		div.appendChild(line);
		parent.appendChild(div);

		// Render children
		if (node.children.length > 0) {
			const childrenDiv = document.createElement("div");
			childrenDiv.className = "graph-children";
			for (const childId of node.children) {
				renderGraphNode(childrenDiv, graph, childId, depth + 1);
			}
			parent.appendChild(childrenDiv);
		}
	}

	// ---- Log rendering ----

	let lastRenderedLogLength = 0;
	let lastRenderedFilterText = "";
	let lastRenderedEventLogLength = 0;
	let lastRenderedSyncReadLogLength = 0;
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
		// Determine the source of mutations based on mode
		const activeMutationLog = importedSession ? importedSession.mutationLog : mutationLog;
		const activeEventLog = importedSession ? importedSession.eventLog : eventLog;
		const activeSyncReadLog = importedSession ? importedSession.syncReadLog : syncReadLog;

		// In replay mode, show only entries up to currentIndex
		const displayMutations = replayState
			? replayState.entries.slice(0, replayState.currentIndex)
			: activeMutationLog;

		logCountSpan.textContent = String(displayMutations.length);

		if (displayMutations.length === 0) {
			if (lastRenderedLogLength !== 0 || replayState) {
				const msg = replayState
					? "Replay position: 0. Step forward to see mutations."
					: "No mutations captured yet.";
				logList.innerHTML = `<div class="log-empty">${msg}</div>`;
				lastRenderedLogLength = 0;
				lastRenderedFilterText = "";
				lastRenderedEventLogLength = 0;
				lastRenderedSyncReadLogLength = 0;
			}
			return;
		}

		const filterText = logFilter.value.toLowerCase().trim();

		// Skip full rebuild if nothing has changed since last render
		const needsFullRebuild =
			replayState !== null ||
			filterText !== lastRenderedFilterText ||
			displayMutations.length !== lastRenderedLogLength ||
			activeEventLog.length !== lastRenderedEventLogLength ||
			activeSyncReadLog.length !== lastRenderedSyncReadLogLength;

		if (!needsFullRebuild) {
			return;
		}

		const fragment = document.createDocumentFragment();

		// Group mutations by batchUid
		interface BatchGroup {
			batchUid: number | undefined;
			entries: MutationLogEntry[];
		}
		const groups: BatchGroup[] = [];
		let currentGroup: BatchGroup | null = null;

		for (const entry of displayMutations) {
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

		// Highlight current replay entry
		if (replayState && replayState.currentIndex > 0) {
			const allLogEntries = logList.querySelectorAll(".log-entry");
			const targetIdx = replayState.currentIndex - 1;
			if (targetIdx < allLogEntries.length) {
				allLogEntries[targetIdx].classList.add("replay-highlight");
				allLogEntries[targetIdx].scrollIntoView({ block: "nearest" });
			}
		}

		// Event round-trip tracer section with visual timeline bars
		const dt = getDevtools();
		if (dt) {
			const traces = dt.getEventTraces();
			if (traces.length > 0) {
				const traceSection = document.createElement("div");
				traceSection.className = "event-trace-section";

				const traceTitle = document.createElement("div");
				traceTitle.className = "event-trace-title";
				traceTitle.textContent = `Event Round-Trips (${traces.length})`;
				traceSection.appendChild(traceTitle);

				const recent = traces.slice(-20);

				// Compute max total time for scaling bars
				let maxTotalMs = 1;
				for (const trace of recent) {
					const total = trace.serializeMs + (trace.transportMs ?? 0) + (trace.dispatchMs ?? 0);
					if (total > maxTotalMs) maxTotalMs = total;
				}

				for (const trace of recent) {
					const serMs = trace.serializeMs;
					const trnMs = trace.transportMs ?? 0;
					const dspMs = trace.dispatchMs ?? 0;
					const mutCount =
						trace.mutationCount ??
						mutationLog.filter(
							(m) => m.timestamp >= trace.timestamp && m.timestamp <= trace.timestamp + 100,
						).length;

					const totalMs = serMs + trnMs + dspMs;
					const scale = 120 / (maxTotalMs || 1); // 120px max bar width

					// Timeline row
					const row = document.createElement("div");
					row.className = "event-timeline";

					// Event type label
					const typeLabel = document.createElement("span");
					typeLabel.className = "event-trace-type";
					typeLabel.style.cssText =
						"width:60px;flex-shrink:0;font-size:10px;overflow:hidden;text-overflow:ellipsis;";
					typeLabel.textContent = `[${trace.eventType}]`;
					row.appendChild(typeLabel);

					// Serialize phase bar
					const serBar = document.createElement("span");
					serBar.className = "event-phase serialize";
					serBar.style.width = `${Math.max(serMs * scale, 4)}px`;
					serBar.title = `serialize: ${serMs.toFixed(1)}ms`;
					row.appendChild(serBar);

					const serLabel = document.createElement("span");
					serLabel.className = "event-phase-label";
					serLabel.textContent = `${serMs.toFixed(1)}ms`;
					row.appendChild(serLabel);

					// Arrow
					const arrow1 = document.createElement("span");
					arrow1.className = "event-phase-label";
					arrow1.textContent = "\u2192";
					row.appendChild(arrow1);

					// Transport phase bar
					const trnBar = document.createElement("span");
					trnBar.className = "event-phase transport";
					trnBar.style.width = `${Math.max(trnMs * scale, 4)}px`;
					trnBar.title = `transport: ${trnMs.toFixed(1)}ms`;
					row.appendChild(trnBar);

					const trnLabel = document.createElement("span");
					trnLabel.className = "event-phase-label";
					trnLabel.textContent = `${trnMs.toFixed(1)}ms`;
					row.appendChild(trnLabel);

					// Arrow
					const arrow2 = document.createElement("span");
					arrow2.className = "event-phase-label";
					arrow2.textContent = "\u2192";
					row.appendChild(arrow2);

					// Dispatch phase bar
					const dspBar = document.createElement("span");
					dspBar.className = "event-phase dispatch";
					dspBar.style.width = `${Math.max(dspMs * scale, 4)}px`;
					dspBar.title = `dispatch: ${dspMs.toFixed(1)}ms`;
					row.appendChild(dspBar);

					const dspLabel = document.createElement("span");
					dspLabel.className = "event-phase-label";
					dspLabel.textContent = `${dspMs.toFixed(1)}ms`;
					row.appendChild(dspLabel);

					// Arrow + mutation count
					if (mutCount > 0) {
						const arrow3 = document.createElement("span");
						arrow3.className = "event-phase-label";
						arrow3.textContent = "\u2192";
						row.appendChild(arrow3);

						const mutSpan = document.createElement("span");
						mutSpan.className = "event-mutation-count";
						mutSpan.textContent = `${mutCount} mut${mutCount !== 1 ? "s" : ""}`;
						row.appendChild(mutSpan);
					}

					// Detail panel (shown on click)
					const detail = document.createElement("div");
					detail.className = "event-timeline-detail";
					detail.innerHTML =
						`<div><strong>${escapeHtml(trace.eventType)}</strong> total: ${totalMs.toFixed(1)}ms</div>` +
						`<div>main:serialize ${serMs.toFixed(2)}ms</div>` +
						`<div>transport ${trnMs.toFixed(2)}ms</div>` +
						`<div>worker:dispatch ${dspMs.toFixed(2)}ms</div>` +
						`<div>mutations generated: ${mutCount}</div>`;

					row.addEventListener("click", () => {
						detail.classList.toggle("visible");
					});

					traceSection.appendChild(row);
					traceSection.appendChild(detail);
				}

				logList.appendChild(traceSection);
			}
		}

		// Events section (Gap 4)
		if (activeEventLog.length > 0) {
			const evtSection = document.createElement("div");
			evtSection.className = "log-section-title";
			evtSection.textContent = `Events (${activeEventLog.length})`;
			logList.appendChild(evtSection);

			const recentEvents = activeEventLog.slice(-50);
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
		if (activeSyncReadLog.length > 0) {
			const syncSection = document.createElement("div");
			syncSection.className = "log-section-title";
			syncSection.textContent = `Sync Reads (${activeSyncReadLog.length})`;
			logList.appendChild(syncSection);

			const recentReads = activeSyncReadLog.slice(-50);
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

		if (autoScroll && !replayState) {
			logList.scrollTop = logList.scrollHeight;
		}
		lastRenderedLogLength = displayMutations.length;
		lastRenderedFilterText = filterText;
		lastRenderedEventLogLength = activeEventLog.length;
		lastRenderedSyncReadLogLength = activeSyncReadLog.length;
	}

	logFilter.addEventListener("input", renderLogTab);

	logClearBtn.addEventListener("click", () => {
		mutationLog.length = 0;
		lastRenderedLogLength = 0;
		lastRenderedFilterText = "";
		lastRenderedEventLogLength = 0;
		lastRenderedSyncReadLogLength = 0;
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
		const activeWarningLog = importedSession ? importedSession.warningLog : warningLog;

		if (activeWarningLog.length === 0) {
			if (lastRenderedWarningLength !== 0) {
				warnList.innerHTML = '<div class="warn-empty">No warnings captured yet.</div>';
				lastRenderedWarningLength = 0;
			}
			return;
		}

		if (activeWarningLog.length === lastRenderedWarningLength) return;

		const filterText = warnFilter.value.toLowerCase().trim();
		const fragment = document.createDocumentFragment();

		// Filter warnings by text
		const filtered = filterText
			? activeWarningLog.filter(
					(e) =>
						e.code.toLowerCase().includes(filterText) ||
						e.message.toLowerCase().includes(filterText),
				)
			: activeWarningLog;

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
		lastRenderedWarningLength = activeWarningLog.length;
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
				treeRefreshTimeout = setTimeout(() => {
					treeRefreshTimeout = null;
					renderTreeTab();
				}, 250);
			}
		}, 2000);

		// Performance: poll every 1 second (also refresh worker stats)
		perfPollTimer = setInterval(() => {
			if (activeTab === "Performance") {
				const dt = getDevtools();
				if (dt) dt.refreshDebugData();
				perfRefreshTimeout = setTimeout(() => {
					perfRefreshTimeout = null;
					renderPerfTab();
				}, 250);
			}
		}, 1000);

		// Log + warnings + graph: poll every 500ms
		logRenderTimer = setInterval(() => {
			if (activeTab === "Log") renderLogTab();
			if (activeTab === "Warnings") renderWarningsTab();
			if (activeTab === "Graph") renderGraphTab();
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
			if (replayTimer) {
				clearInterval(replayTimer);
				replayTimer = null;
			}
			// Cancel pending setTimeout callbacks
			if (treeRefreshTimeout) {
				clearTimeout(treeRefreshTimeout);
				treeRefreshTimeout = null;
			}
			if (perfRefreshTimeout) {
				clearTimeout(perfRefreshTimeout);
				perfRefreshTimeout = null;
			}
			if (manualRefreshTimeout) {
				clearTimeout(manualRefreshTimeout);
				manualRefreshTimeout = null;
			}
			clearInterval(healthDotTimer);
			onWarningBadgeUpdate = null;
			// Reset module-level state for clean re-creation (e.g., HMR)
			mutationLog.length = 0;
			warningLog.length = 0;
			eventLog.length = 0;
			syncReadLog.length = 0;
			warningBadgeCount = 0;
			logPaused = false;
			isReplaying = false;
			host.remove();
		},
	};
}
