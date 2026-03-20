import type { MutationLogEntry, WarningLogEntry } from "../core/debug.ts";

/**
 * The shape of __ASYNC_DOM_DEVTOOLS__ exposed on globalThis.
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
		};
		flush: () => void;
	};
	findRealNode: (nodeId: number) => Node | null;
	apps: () => string[];
	renderers: () => Record<string, { root: unknown }>;
	tree?: () => TreeNode | null;
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

const MAX_LOG_ENTRIES = 100;
const MAX_WARNING_ENTRIES = 200;

// ---- Mutation / Warning capture ----

const mutationLog: MutationLogEntry[] = [];
const warningLog: WarningLogEntry[] = [];
let warningBadgeCount = 0;
let onWarningBadgeUpdate: (() => void) | null = null;

export function captureMutation(entry: MutationLogEntry): void {
	mutationLog.push(entry);
	if (mutationLog.length > MAX_LOG_ENTRIES) mutationLog.shift();
}

export function captureWarning(entry: WarningLogEntry): void {
	warningLog.push(entry);
	if (warningLog.length > MAX_WARNING_ENTRIES) warningLog.shift();
	warningBadgeCount++;
	onWarningBadgeUpdate?.();
}

// ---- Tree builder ----

function buildTree(node: Node, depth: number): TreeNode | null {
	if (depth > 30) return null;

	if (node.nodeType === 3) {
		const text = node.textContent ?? "";
		if (!text.trim()) return null;
		return {
			type: "text",
			text,
			id: (node as unknown as Record<string, unknown>).__asyncDomId as number | undefined,
		};
	}

	if (node.nodeType === 8) {
		return {
			type: "comment",
			text: (node as Comment).data,
		};
	}

	if (node.nodeType !== 1) return null;

	const el = node as Element;
	const tag = el.tagName;
	const attrs: Record<string, string> = {};
	for (let i = 0; i < el.attributes.length; i++) {
		const attr = el.attributes[i];
		if (attr.name !== "data-async-dom-id") {
			attrs[attr.name] = attr.value;
		}
	}

	const children: TreeNode[] = [];
	for (let i = 0; i < el.childNodes.length; i++) {
		const child = buildTree(el.childNodes[i], depth + 1);
		if (child) children.push(child);
	}

	return {
		type: "element",
		tag,
		id: (el as unknown as Record<string, unknown>).__asyncDomId as number | undefined,
		className: el.className || undefined,
		attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
		children: children.length > 0 ? children : undefined,
	};
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
  width: 420px;
  height: 370px;
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

.header-close {
  background: none;
  border: none;
  color: #808080;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  font-family: inherit;
}
.header-close:hover { color: #d4d4d4; }

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

.log-clear {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
}
.log-clear:hover { background: #505050; }

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
.log-time { color: #555; flex-shrink: 0; width: 75px; }
.log-action { color: #569cd6; flex-shrink: 0; width: 110px; overflow: hidden; text-overflow: ellipsis; }
.log-nodeid { color: #808080; }

.log-empty { color: #808080; padding: 16px; text-align: center; }

/* ---- Warnings tab ---- */

.warn-entry {
  padding: 4px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
}
.warn-time { color: #555; margin-right: 6px; }
.warn-code {
  color: #d7ba7d;
  font-weight: 600;
  margin-right: 6px;
}
.warn-msg { color: #d4d4d4; }

.warn-empty { color: #808080; padding: 16px; text-align: center; }

/* Flash highlight */
@keyframes async-dom-flash {
  0% { outline: 3px solid #007acc; outline-offset: 2px; }
  100% { outline: 3px solid transparent; outline-offset: 2px; }
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
		// performance.now() value — use current time
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

// ---- Panel creation ----

export function createDevtoolsPanel(): { destroy: () => void } {
	const host = document.createElement("div");
	host.id = "__async-dom-devtools__";
	const shadow = host.attachShadow({ mode: "open" });

	// Styles
	const style = document.createElement("style");
	style.textContent = PANEL_CSS;
	shadow.appendChild(style);

	// Panel container
	const panel = document.createElement("div");
	panel.className = "panel collapsed";

	// Collapsed toggle tab
	const toggleTab = document.createElement("button");
	toggleTab.className = "toggle-tab";
	toggleTab.textContent = "async-dom \u25B2";
	panel.appendChild(toggleTab);

	// Header bar
	const headerBar = document.createElement("div");
	headerBar.className = "header-bar";

	const headerTitle = document.createElement("span");
	headerTitle.className = "header-title";
	headerTitle.textContent = "async-dom devtools";
	headerBar.appendChild(headerTitle);

	const closeBtn = document.createElement("button");
	closeBtn.className = "header-close";
	closeBtn.textContent = "\u25BC";
	closeBtn.title = "Collapse";
	headerBar.appendChild(closeBtn);
	panel.appendChild(headerBar);

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
	}

	for (const tabName of tabs) {
		tabBtns[tabName].addEventListener("click", () => switchTab(tabName));
	}

	// ---- Tree content ----
	const treeContent = document.createElement("div");
	treeContent.className = "tab-content active";
	treeContent.innerHTML = '<div class="tree-empty">Waiting for data...</div>';
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
	logFilter.placeholder = "Filter by action...";
	logFilter.type = "text";
	logToolbar.appendChild(logFilter);

	const logClearBtn = document.createElement("button");
	logClearBtn.className = "log-clear";
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
	warnClearBtn.className = "log-clear";
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

	// ---- Polling state ----
	let treePollTimer: ReturnType<typeof setInterval> | null = null;
	let perfPollTimer: ReturnType<typeof setInterval> | null = null;
	let logRenderTimer: ReturnType<typeof setInterval> | null = null;
	function getDevtools(): DevtoolsAPI | null {
		return (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ as DevtoolsAPI | null;
	}

	// ---- Toggle expand / collapse ----

	function expand(): void {
		panel.classList.remove("collapsed");
		startPolling();
	}

	function collapse(): void {
		panel.classList.add("collapsed");
		stopPolling();
	}

	toggleTab.addEventListener("click", expand);
	closeBtn.addEventListener("click", collapse);

	// ---- Tree rendering ----

	function renderTreeTab(): void {
		const dt = getDevtools();
		if (!dt) {
			treeContent.innerHTML = '<div class="tree-empty">Devtools API not available.</div>';
			return;
		}

		let tree: TreeNode | null = null;
		if (typeof dt.tree === "function") {
			tree = dt.tree();
		} else {
			// Fallback: build tree from findRealNode(2) = body
			const body = dt.findRealNode(2);
			if (body) {
				tree = buildTree(body, 0);
			}
		}

		if (!tree) {
			treeContent.innerHTML = '<div class="tree-empty">No tree data available.</div>';
			return;
		}

		const container = document.createElement("div");
		buildTreeDOM(container, tree, 0, true);
		treeContent.innerHTML = "";
		treeContent.appendChild(container);
	}

	function buildTreeDOM(
		parent: HTMLElement,
		node: TreeNode,
		depth: number,
		expanded: boolean,
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
				idSpan.textContent = `#${node.id}`;
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

		// Build tag string
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
			nidSpan.textContent = `#${node.id}`;
			line.appendChild(nidSpan);
		}

		// Click: toggle or highlight node
		line.addEventListener("click", (e: MouseEvent) => {
			if (hasChildren && e.target === toggleEl) {
				wrapper.classList.toggle("expanded");
				toggleEl.textContent = wrapper.classList.contains("expanded") ? "\u25BC" : "\u25B6";
				return;
			}
			// Highlight real node
			if (node.id != null) {
				const dt = getDevtools();
				if (dt) {
					const realNode = dt.findRealNode(node.id) as HTMLElement | null;
					if (realNode && "scrollIntoView" in realNode) {
						realNode.scrollIntoView({ behavior: "smooth", block: "center" });
						// Apply flash highlight directly (outside shadow DOM)
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
			}
		});

		wrapper.appendChild(line);

		if (hasChildren) {
			const childrenDiv = document.createElement("div");
			childrenDiv.className = "tree-children";
			for (const child of children) {
				buildTreeDOM(childrenDiv, child, depth + 1, depth < 2);
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

		let pendingClass = "";
		if (pending > 1000) pendingClass = "red";
		else if (pending > 100) pendingClass = "yellow";
		else pendingClass = "green";

		let html = "";
		html += `<div class="perf-row"><span class="perf-label">Pending</span><span class="perf-value ${pendingClass}">${pending}</span></div>`;
		html += `<div class="perf-row"><span class="perf-label">Frame ID</span><span class="perf-value">${stats.frameId}</span></div>`;

		const ftClass =
			stats.lastFrameTimeMs > 16 ? "red" : stats.lastFrameTimeMs > 12 ? "yellow" : "green";
		html += `<div class="perf-row"><span class="perf-label">Frame Time</span><span class="perf-value ${ftClass}">${stats.lastFrameTimeMs.toFixed(1)}ms</span></div>`;

		html += `<div class="perf-row"><span class="perf-label">Frame Actions</span><span class="perf-value">${stats.lastFrameActions}</span></div>`;

		const runClass = stats.isRunning ? "green" : "yellow";
		html += `<div class="perf-row"><span class="perf-label">Running</span><span class="perf-value ${runClass}">${stats.isRunning ? "Yes" : "No"}</span></div>`;

		html += `<div class="perf-row"><span class="perf-label">Last Tick</span><span class="perf-value">${stats.lastTickTime > 0 ? `${stats.lastTickTime.toFixed(0)}ms` : "N/A"}</span></div>`;

		// Apps
		const apps = dt.apps();
		html += `<div class="perf-row"><span class="perf-label">Apps</span><span class="perf-value">${apps.length} (${apps.join(", ")})</span></div>`;

		perfContent.innerHTML = html;
	}

	// ---- Log rendering ----

	let lastRenderedLogLength = 0;

	function renderLogTab(): void {
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

			const nodeIdSpan = document.createElement("span");
			nodeIdSpan.className = "log-nodeid";
			const nodeId = "id" in entry.mutation ? entry.mutation.id : undefined;
			nodeIdSpan.textContent = nodeId != null ? `node:${nodeId}` : "";
			div.appendChild(nodeIdSpan);

			fragment.appendChild(div);
		}

		logList.innerHTML = "";
		logList.appendChild(fragment);
		logList.scrollTop = logList.scrollHeight;
		lastRenderedLogLength = mutationLog.length;
	}

	logFilter.addEventListener("input", renderLogTab);

	logClearBtn.addEventListener("click", () => {
		mutationLog.length = 0;
		lastRenderedLogLength = 0;
		logList.innerHTML = '<div class="log-empty">No mutations captured yet.</div>';
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
			codeSpan.className = "warn-code";
			codeSpan.textContent = entry.code;
			div.appendChild(codeSpan);

			const msgSpan = document.createElement("span");
			msgSpan.className = "warn-msg";
			msgSpan.textContent = truncate(entry.message, 120);
			div.appendChild(msgSpan);

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
	}

	onWarningBadgeUpdate = updateWarningBadge;

	// ---- Polling ----

	function startPolling(): void {
		stopPolling();

		// Tree: poll every 2 seconds
		treePollTimer = setInterval(() => {
			if (activeTab === "Tree") renderTreeTab();
		}, 2000);

		// Performance: poll every 1 second
		perfPollTimer = setInterval(() => {
			if (activeTab === "Performance") renderPerfTab();
		}, 1000);

		// Log + warnings: poll every 500ms
		logRenderTimer = setInterval(() => {
			if (activeTab === "Log") renderLogTab();
			if (activeTab === "Warnings") renderWarningsTab();
		}, 500);

		// Render current tab immediately
		if (activeTab === "Tree") renderTreeTab();
		else if (activeTab === "Performance") renderPerfTab();
		else if (activeTab === "Log") renderLogTab();
		else if (activeTab === "Warnings") renderWarningsTab();
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
			onWarningBadgeUpdate = null;
			host.remove();
		},
	};
}
