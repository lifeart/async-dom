import type { MutationLogEntry, WarningLogEntry } from "../core/debug.ts";

/**
 * The shape of __ASYNC_DOM_DEVTOOLS__ exposed on globalThis (main thread).
 */
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
		flush: () => void;
	};
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

// ---- Mutation / Warning capture ----

const mutationLog: MutationLogEntry[] = [];
const warningLog: WarningLogEntry[] = [];
let warningBadgeCount = 0;
let onWarningBadgeUpdate: (() => void) | null = null;
let logPaused = false;

export function captureMutation(entry: MutationLogEntry): void {
	if (logPaused) return;
	mutationLog.push(entry);
	if (mutationLog.length > MAX_LOG_ENTRIES) mutationLog.shift();
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
		const container = document.createElement("div");

		// Status line
		const statusLine = document.createElement("div");
		statusLine.className = "tree-refresh-bar";
		const statusText = document.createElement("span");
		statusText.className = "tree-status";
		statusText.textContent = `Virtual DOM for app: ${targetAppId}`;
		statusLine.appendChild(statusText);
		container.appendChild(statusLine);

		buildTreeDOM(container, tree, 0, true, dt);
		treeContent.innerHTML = "";
		treeContent.appendChild(container);
	}

	function buildTreeDOM(
		parent: HTMLElement,
		node: TreeNode,
		depth: number,
		expanded: boolean,
		dt: DevtoolsAPI,
	): void {
		const wrapper = document.createElement("div");
		wrapper.className = `tree-node${expanded ? " expanded" : ""}`;

		const line = document.createElement("div");
		line.className = "tree-line";
		line.style.paddingLeft = `${depth * 14}px`;

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

		// Click: toggle children or highlight real DOM node
		line.addEventListener("click", (e: MouseEvent) => {
			if (hasChildren && e.target === toggleEl) {
				wrapper.classList.toggle("expanded");
				toggleEl.textContent = wrapper.classList.contains("expanded") ? "\u25BC" : "\u25B6";
				return;
			}
			// Highlight real DOM node via findRealNode
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
				buildTreeDOM(childrenDiv, child, depth + 1, depth < 2, dt);
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

		// Scheduler section
		html += '<div class="perf-section-title">Scheduler</div>';

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

		perfContent.innerHTML = html;
	}

	// ---- Log rendering ----

	let lastRenderedLogLength = 0;

	logPauseBtn.addEventListener("click", () => {
		logPaused = !logPaused;
		logPauseBtn.textContent = logPaused ? "Resume" : "Pause";
		logPauseBtn.classList.toggle("active", logPaused);
	});

	logAutoScrollBtn.addEventListener("click", () => {
		autoScroll = !autoScroll;
		logAutoScrollBtn.classList.toggle("active", autoScroll);
	});

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

		for (const entry of mutationLog) {
			if (filterText && !entry.action.toLowerCase().includes(filterText)) continue;

			const div = document.createElement("div");
			div.className = "log-entry";

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
			// Add extra detail based on mutation type
			const m = entry.mutation as Record<string, unknown>;
			if (m.tag) detail += ` tag=${m.tag}`;
			if (m.name && entry.action !== "addEventListener") detail += ` ${m.name}`;
			if (m.property) detail += ` ${m.property}`;
			detailSpan.textContent = detail;
			div.appendChild(detailSpan);

			fragment.appendChild(div);
		}

		logList.innerHTML = "";
		logList.appendChild(fragment);
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

	function renderWarningsTab(): void {
		if (warningLog.length === 0) {
			if (lastRenderedWarningLength !== 0) {
				warnList.innerHTML = '<div class="warn-empty">No warnings captured yet.</div>';
				lastRenderedWarningLength = 0;
			}
			return;
		}

		if (warningLog.length === lastRenderedWarningLength) return;

		const fragment = document.createDocumentFragment();

		for (const entry of warningLog) {
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
			// Show first line as summary, full message expandable on click
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

			fragment.appendChild(div);
		}

		warnList.innerHTML = "";
		warnList.appendChild(fragment);
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
			warningBadgeCount = 0;
			host.remove();
		},
	};
}
