Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_sync_channel = require("./sync-channel.cjs");
const require_binary_worker_transport = require("./binary-worker-transport.cjs");
const require_worker_transport = require("./worker-transport.cjs");
//#region src/core/html-sanitizer.ts
/**
* Lightweight HTML sanitizer for async-dom.
*
* Strips dangerous tags and attributes to prevent XSS when
* worker-provided HTML is injected via innerHTML or insertAdjacentHTML.
*/
const DANGEROUS_TAGS = new Set([
	"script",
	"iframe",
	"object",
	"embed",
	"form",
	"base",
	"meta",
	"link",
	"style"
]);
const DANGEROUS_ATTR_PATTERN = /^on/i;
const DANGEROUS_URI_ATTRS = new Set([
	"href",
	"src",
	"data",
	"action",
	"formaction",
	"xlink:href"
]);
const DANGEROUS_ATTRS = new Set(["srcdoc", "formaction"]);
/**
* Returns true if the given URI string starts with `javascript:` (ignoring whitespace and case).
*/
function isDangerousURI$1(value) {
	const trimmed = value.trim().toLowerCase();
	return /^\s*javascript\s*:/i.test(trimmed) || /^\s*vbscript\s*:/i.test(trimmed) || /^\s*data\s*:\s*text\/html/i.test(trimmed);
}
/**
* Sanitize an HTML string by removing dangerous tags and attributes.
*
* Uses the browser's DOMParser to parse the HTML, walks the resulting tree,
* and removes any elements/attributes that could execute scripts or load
* external resources in a dangerous way.
*/
function sanitizeHTML(html) {
	const body = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
	sanitizeNode(body);
	return body.innerHTML;
}
function sanitizeNode(node) {
	const children = Array.from(node.childNodes);
	for (const child of children) if (child.nodeType === Node.ELEMENT_NODE) {
		const el = child;
		const tagName = el.tagName.toLowerCase();
		if (DANGEROUS_TAGS.has(tagName)) {
			el.remove();
			continue;
		}
		const attrsToRemove = [];
		for (let i = 0; i < el.attributes.length; i++) {
			const attr = el.attributes[i];
			const name = attr.name.toLowerCase();
			if (DANGEROUS_ATTR_PATTERN.test(name)) attrsToRemove.push(attr.name);
			else if (DANGEROUS_ATTRS.has(name)) attrsToRemove.push(attr.name);
			else if (DANGEROUS_URI_ATTRS.has(name) && isDangerousURI$1(attr.value)) attrsToRemove.push(attr.name);
		}
		for (const attrName of attrsToRemove) el.removeAttribute(attrName);
		sanitizeNode(el);
	}
}
//#endregion
//#region src/core/node-cache.ts
/**
* Cache for mapping NodeIds to real DOM nodes on the main thread.
*/
var NodeCache = class {
	cache = /* @__PURE__ */ new Map();
	get(id) {
		if (id === 4) return document;
		return this.cache.get(id) ?? null;
	}
	set(id, node) {
		this.cache.set(id, node);
	}
	delete(id) {
		this.cache.delete(id);
	}
	clear() {
		this.cache.clear();
	}
	has(id) {
		return this.cache.has(id);
	}
};
//#endregion
//#region src/core/scheduler.ts
const MAX_FRAME_LOG = 30;
/**
* Frame-budget scheduler that processes DOM mutations within requestAnimationFrame
* callbacks, respecting a configurable time budget per frame.
*
* Key features preserved from the original vm.js:
* - Adaptive batch sizing based on measured action execution times
* - Priority sorting (high > normal > low, non-optional before optional)
* - Viewport culling for optional style mutations
* - Graceful degradation: skip optional mutations under pressure
*/
var FrameScheduler = class {
	queue = [];
	actionTimes = /* @__PURE__ */ new Map();
	frameId = 0;
	running = false;
	rafId = 0;
	uidCounter = 0;
	timePerLastFrame = 0;
	totalActionsLastFrame = 0;
	isScrolling = false;
	scrollTimer = null;
	scrollAbort = null;
	viewportHeight = 0;
	viewportWidth = 0;
	boundingRectCache = /* @__PURE__ */ new Map();
	boundingRectCacheFrame = /* @__PURE__ */ new Map();
	frameBudgetMs;
	enableViewportCulling;
	enablePrioritySkipping;
	applier = null;
	appCount = 0;
	appBudgets = /* @__PURE__ */ new Map();
	lastTickTime = 0;
	healthCheckTimer = null;
	queueOverflowWarned = false;
	lastEnqueueTime = 0;
	frameLog = [];
	constructor(config = {}) {
		this.frameBudgetMs = config.frameBudgetMs ?? 16;
		this.enableViewportCulling = config.enableViewportCulling ?? true;
		this.enablePrioritySkipping = config.enablePrioritySkipping ?? true;
	}
	setApplier(applier) {
		this.applier = applier;
	}
	setAppCount(count) {
		this.appCount = count;
	}
	enqueue(mutations, appId, priority = "normal", batchUid) {
		this.lastEnqueueTime = performance.now();
		for (const mutation of mutations) {
			this.uidCounter++;
			this.queue.push({
				mutation,
				priority,
				uid: this.uidCounter,
				appId,
				batchUid
			});
		}
		if (this.queue.length > 1e4 && !this.queueOverflowWarned) {
			this.queueOverflowWarned = true;
			console.warn(`[async-dom] Scheduler queue overflow: ${this.queue.length} pending mutations. Possible causes: tab hidden, applier not set, or mutations arriving faster than processing.`);
		}
		if (this.queue.length <= 1e4) this.queueOverflowWarned = false;
	}
	start() {
		if (this.running) return;
		this.running = true;
		this.lastTickTime = 0;
		this.setupScrollListener();
		this.scheduleFrame();
		this.healthCheckTimer = setTimeout(() => {
			if (this.running && this.lastTickTime === 0) console.warn(`[async-dom] Scheduler started but tick() has not fired after 1 second. This usually means the tab is hidden (rAF does not fire in background tabs). Queue has ${this.queue.length} pending mutations.`);
		}, 1e3);
		console.debug("[async-dom] Scheduler started");
	}
	scheduleFrame() {
		if (!this.running) return;
		if (typeof document !== "undefined" && document.hidden) setTimeout(() => this.tick(performance.now()), this.frameBudgetMs);
		else this.rafId = requestAnimationFrame((ts) => this.tick(ts));
	}
	stop() {
		this.running = false;
		if (this.healthCheckTimer) {
			clearTimeout(this.healthCheckTimer);
			this.healthCheckTimer = null;
		}
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = 0;
		}
		if (this.scrollAbort) {
			this.scrollAbort.abort();
			this.scrollAbort = null;
		}
		this.clearViewportCache();
	}
	clearViewportCache() {
		this.boundingRectCache.clear();
		this.boundingRectCacheFrame.clear();
	}
	flush() {
		const applier = this.applier;
		if (!applier) return;
		this.queue.sort(prioritySort);
		for (const item of this.queue) applier(item.mutation, item.appId, item.batchUid);
		this.queue.length = 0;
	}
	get pendingCount() {
		return this.queue.length;
	}
	getStats() {
		return {
			pending: this.queue.length,
			frameId: this.frameId,
			lastFrameTimeMs: this.timePerLastFrame,
			lastFrameActions: this.totalActionsLastFrame,
			isRunning: this.running,
			lastTickTime: this.lastTickTime,
			enqueueToApplyMs: this.lastTickTime > 0 && this.lastEnqueueTime > 0 ? Math.max(0, this.lastTickTime - this.lastEnqueueTime) : 0
		};
	}
	getFrameLog() {
		return this.frameLog.slice();
	}
	tick(_timestamp) {
		if (!this.running) return;
		this.lastTickTime = performance.now();
		const start = performance.now();
		this.frameId++;
		this.calcViewportSize();
		this.queue.sort(prioritySort);
		const applier = this.applier;
		if (!applier) {
			this.scheduleNext(start);
			return;
		}
		let processed = 0;
		const maxActions = this.getActionsForFrame();
		const deferred = [];
		const frameTimingBreakdown = /* @__PURE__ */ new Map();
		if (this.appCount > 1) this.appBudgets.clear();
		let cursor = 0;
		while (cursor < this.queue.length && processed < maxActions) {
			const elapsed = performance.now() - start;
			if (this.queue.length < 3e3 && elapsed >= this.frameBudgetMs) break;
			const item = this.queue[cursor];
			cursor++;
			if (this.shouldSkip(item)) continue;
			if (this.appCount > 1) {
				const appBudget = this.appBudgets.get(item.appId) ?? 0;
				if (appBudget >= Math.ceil(maxActions / this.appCount)) {
					deferred.push(item);
					continue;
				}
				this.appBudgets.set(item.appId, appBudget + 1);
			}
			const actionStart = performance.now();
			applier(item.mutation, item.appId, item.batchUid);
			const actionTime = performance.now() - actionStart;
			this.recordTiming(item.mutation.action, actionTime);
			frameTimingBreakdown.set(item.mutation.action, (frameTimingBreakdown.get(item.mutation.action) ?? 0) + actionTime);
			processed++;
		}
		if (cursor === this.queue.length) this.queue.length = 0;
		else if (cursor > 0) this.queue = this.queue.slice(cursor);
		if (deferred.length > 0) this.queue = deferred.concat(this.queue);
		const delta = performance.now() - start;
		if (processed > 0) {
			this.timePerLastFrame = delta;
			this.totalActionsLastFrame = processed;
			this.frameLog.push({
				frameId: this.frameId,
				totalMs: delta,
				actionCount: processed,
				timingBreakdown: frameTimingBreakdown
			});
			if (this.frameLog.length > MAX_FRAME_LOG) this.frameLog.shift();
		}
		this.scheduleNext(start);
	}
	scheduleNext(frameStart) {
		const elapsed = performance.now() - frameStart;
		if (elapsed + 1 >= this.frameBudgetMs) this.scheduleFrame();
		else setTimeout(() => {
			this.scheduleFrame();
		}, this.frameBudgetMs - elapsed);
	}
	getActionsForFrame() {
		const queueLen = this.queue.length;
		if (queueLen > 25e3) return queueLen;
		if (queueLen >= 3e3) return 500;
		if (queueLen > 1500) return require_binary_worker_transport.CRITICAL_QUEUE_SIZE;
		const avgTime = this.getAvgActionTime();
		if (avgTime > 0) return Math.max(1, Math.floor(this.frameBudgetMs * 3 / avgTime));
		return 2e3;
	}
	shouldSkip(item) {
		if (!this.enablePrioritySkipping) return false;
		const mutation = item.mutation;
		if (!("optional" in mutation && mutation.optional)) return false;
		if (this.isScrolling) return true;
		if (this.queue.length > 1500 / 2) return true;
		if (this.timePerLastFrame > this.frameBudgetMs + .2) return true;
		if (this.enableViewportCulling && mutation.action === "setStyle") {}
		return false;
	}
	recordTiming(action, ms) {
		if (ms > 0) this.actionTimes.set(action, ms + .02);
	}
	getAvgActionTime() {
		if (this.totalActionsLastFrame === 0) return 0;
		return this.timePerLastFrame / this.totalActionsLastFrame;
	}
	calcViewportSize() {
		this.viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		this.viewportWidth = window.innerWidth || document.documentElement.clientWidth;
	}
	isInViewport(elem) {
		const id = elem.id;
		if (!id) return true;
		const cachedFrame = this.boundingRectCacheFrame.get(id);
		if (cachedFrame !== void 0 && cachedFrame + 60 > this.frameId) return this.boundingRectCache.get(id) ?? true;
		const rect = elem.getBoundingClientRect();
		const result = rect.top >= 0 && rect.left >= 0 && rect.bottom <= this.viewportHeight && rect.right <= this.viewportWidth;
		this.boundingRectCache.set(id, result);
		this.boundingRectCacheFrame.set(id, this.frameId);
		return result;
	}
	setupScrollListener() {
		if (this.scrollAbort) this.scrollAbort.abort();
		this.scrollAbort = new AbortController();
		window.addEventListener("scroll", () => {
			this.isScrolling = true;
			if (this.scrollTimer !== null) clearTimeout(this.scrollTimer);
			this.scrollTimer = setTimeout(() => {
				this.isScrolling = false;
			}, 66);
		}, {
			passive: true,
			signal: this.scrollAbort.signal
		});
	}
};
function prioritySort(a, b) {
	const priorityOrder = {
		high: 0,
		normal: 1,
		low: 2
	};
	const pa = priorityOrder[a.priority];
	const pb = priorityOrder[b.priority];
	if (pa !== pb) return pa - pb;
	const aOpt = "optional" in a.mutation && a.mutation.optional ? 1 : 0;
	const bOpt = "optional" in b.mutation && b.mutation.optional ? 1 : 0;
	if (aOpt !== bOpt) return aOpt - bOpt;
	return a.uid - b.uid;
}
//#endregion
//#region src/debug/devtools-panel.ts
const MAX_LOG_ENTRIES = 200;
const MAX_WARNING_ENTRIES = 200;
const mutationLog = [];
const warningLog = [];
let warningBadgeCount = 0;
let onWarningBadgeUpdate = null;
let logPaused = false;
function captureMutation(entry) {
	if (logPaused) return;
	mutationLog.push(entry);
	if (mutationLog.length > MAX_LOG_ENTRIES) mutationLog.shift();
}
function captureWarning(entry) {
	warningLog.push(entry);
	if (warningLog.length > MAX_WARNING_ENTRIES) warningLog.shift();
	warningBadgeCount++;
	onWarningBadgeUpdate?.();
}
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
function escapeHtml(str) {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatTime(ts) {
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) {
		const now = /* @__PURE__ */ new Date();
		return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
	}
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
function truncate(str, max) {
	return str.length > max ? `${str.slice(0, max)}...` : str;
}
function sparkline(data) {
	if (data.length === 0) return "";
	const chars = "▁▂▃▄▅▆▇█";
	const max = Math.max(...data);
	const min = Math.min(...data);
	const range = max - min || 1;
	return data.map((v) => chars[Math.min(Math.floor((v - min) / range * 7), 7)]).join("");
}
function createDevtoolsPanel() {
	const host = document.createElement("div");
	host.id = "__async-dom-devtools__";
	const shadow = host.attachShadow({ mode: "open" });
	const style = document.createElement("style");
	style.textContent = PANEL_CSS;
	shadow.appendChild(style);
	const panel = document.createElement("div");
	panel.className = "panel collapsed";
	const toggleTab = document.createElement("button");
	toggleTab.className = "toggle-tab";
	const healthDot = document.createElement("span");
	healthDot.style.cssText = "display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background-color:#4ec9b0;vertical-align:middle;";
	toggleTab.appendChild(healthDot);
	const toggleTabText = document.createElement("span");
	toggleTabText.textContent = "async-dom ▲";
	toggleTab.appendChild(toggleTabText);
	panel.appendChild(toggleTab);
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
	highlightBtn.textContent = "⬤";
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
	refreshBtn.textContent = "↻";
	refreshBtn.title = "Refresh data from workers";
	headerActions.appendChild(refreshBtn);
	const closeBtn = document.createElement("button");
	closeBtn.className = "header-btn";
	closeBtn.textContent = "▼";
	closeBtn.title = "Collapse";
	headerActions.appendChild(closeBtn);
	headerBar.appendChild(headerActions);
	panel.appendChild(headerBar);
	const appBar = document.createElement("div");
	appBar.className = "app-bar";
	panel.appendChild(appBar);
	let selectedAppId = null;
	const tabBar = document.createElement("div");
	tabBar.className = "tab-bar";
	const tabs = [
		"Tree",
		"Performance",
		"Log",
		"Warnings"
	];
	const tabBtns = {};
	const tabPanels = {};
	for (const tabName of tabs) {
		const btn = document.createElement("button");
		btn.className = `tab-btn${tabName === "Tree" ? " active" : ""}`;
		btn.textContent = tabName;
		btn.dataset.tab = tabName;
		tabBar.appendChild(btn);
		tabBtns[tabName] = btn;
	}
	panel.appendChild(tabBar);
	const warningBadge = document.createElement("span");
	warningBadge.className = "tab-badge";
	warningBadge.style.display = "none";
	let activeTab = "Tree";
	function switchTab(name) {
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
	for (const tabName of tabs) tabBtns[tabName].addEventListener("click", () => switchTab(tabName));
	const treeContent = document.createElement("div");
	treeContent.className = "tab-content active";
	treeContent.innerHTML = "<div class=\"tree-empty\">Click refresh to load virtual DOM tree from worker.</div>";
	tabPanels.Tree = treeContent;
	panel.appendChild(treeContent);
	const perfContent = document.createElement("div");
	perfContent.className = "tab-content";
	perfContent.innerHTML = "<div class=\"perf-row\"><span class=\"perf-label\">Loading...</span></div>";
	tabPanels.Performance = perfContent;
	panel.appendChild(perfContent);
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
	logList.innerHTML = "<div class=\"log-empty\">No mutations captured yet.</div>";
	logContent.appendChild(logList);
	tabPanels.Log = logContent;
	panel.appendChild(logContent);
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
	warnList.innerHTML = "<div class=\"warn-empty\">No warnings captured yet.</div>";
	warnContent.appendChild(warnList);
	tabPanels.Warnings = warnContent;
	panel.appendChild(warnContent);
	tabBtns.Warnings.appendChild(warningBadge);
	shadow.appendChild(panel);
	document.body.appendChild(host);
	let treePollTimer = null;
	let perfPollTimer = null;
	let logRenderTimer = null;
	let autoScroll = true;
	const queueHistory = [];
	const MAX_HISTORY = 30;
	let highlightUpdatesEnabled = false;
	let selectedNodeForSidebar = null;
	let expandedFrameId = null;
	function updateHealthDot() {
		const dt = getDevtools();
		if (!dt?.scheduler?.stats) return;
		const stats = dt.scheduler.stats();
		const pending = stats.pending;
		if (pending > 1e3 || !stats.isRunning) healthDot.style.backgroundColor = "#f44747";
		else if (pending > 100) healthDot.style.backgroundColor = "#d7ba7d";
		else healthDot.style.backgroundColor = "#4ec9b0";
	}
	const healthDotTimer = setInterval(updateHealthDot, 2e3);
	function getDevtools() {
		return globalThis.__ASYNC_DOM_DEVTOOLS__;
	}
	function expand() {
		panel.classList.remove("collapsed");
		requestTreeRefresh();
		startPolling();
	}
	function collapse() {
		panel.classList.add("collapsed");
		stopPolling();
	}
	toggleTab.addEventListener("click", expand);
	closeBtn.addEventListener("click", collapse);
	function requestTreeRefresh() {
		const dt = getDevtools();
		if (!dt) return;
		dt.refreshDebugData();
		setTimeout(() => {
			updateAppBar();
			renderActiveTab();
		}, 250);
	}
	refreshBtn.addEventListener("click", requestTreeRefresh);
	function updateAppBar() {
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
		if (selectedAppId === null || !apps.includes(selectedAppId)) selectedAppId = apps[0];
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
	function renderActiveTab() {
		if (activeTab === "Tree") renderTreeTab();
		else if (activeTab === "Performance") renderPerfTab();
		else if (activeTab === "Log") renderLogTab();
		else if (activeTab === "Warnings") renderWarningsTab();
	}
	function renderNodeSidebar(sidebar, node) {
		sidebar.innerHTML = "";
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
		const childCount = node.children?.length ?? 0;
		const childRow = document.createElement("div");
		childRow.className = "sidebar-row";
		childRow.innerHTML = `<span class="sidebar-key">children</span><span class="sidebar-val">${childCount}</span>`;
		sidebar.appendChild(childRow);
		const dt = getDevtools();
		if (dt && node.id != null) {
			const realNode = dt.findRealNode(node.id);
			const connected = realNode ? realNode.isConnected : false;
			const connRow = document.createElement("div");
			connRow.className = "sidebar-row";
			connRow.innerHTML = `<span class="sidebar-key">isConnected</span><span class="sidebar-val">${connected}</span>`;
			sidebar.appendChild(connRow);
		}
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
		if (node.id != null) {
			const nodeId = node.id;
			const recentMuts = mutationLog.filter((entry) => {
				return entry.mutation.id === nodeId;
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
	function renderTreeTab() {
		const dt = getDevtools();
		if (!dt) {
			treeContent.innerHTML = "<div class=\"tree-empty\">Devtools API not available.</div>";
			return;
		}
		const allData = dt.getAllAppsData();
		const appIds = Object.keys(allData);
		if (appIds.length === 0) {
			treeContent.innerHTML = "<div class=\"tree-empty\">No apps registered. Click ↻ to refresh.</div>";
			return;
		}
		const targetAppId = selectedAppId && allData[selectedAppId] ? selectedAppId : appIds[0];
		const data = allData[targetAppId];
		if (!data || !data.tree) {
			treeContent.innerHTML = "<div class=\"tree-empty\">No virtual DOM tree received yet. Click ↻ to refresh.</div>";
			return;
		}
		const tree = data.tree;
		const layout = document.createElement("div");
		layout.className = "tree-with-sidebar";
		const treeMain = document.createElement("div");
		treeMain.className = "tree-main";
		const statusLine = document.createElement("div");
		statusLine.className = "tree-refresh-bar";
		const statusText = document.createElement("span");
		statusText.className = "tree-status";
		statusText.textContent = `Virtual DOM for app: ${targetAppId}`;
		statusLine.appendChild(statusText);
		treeMain.appendChild(statusLine);
		const sidebar = document.createElement("div");
		sidebar.className = "node-sidebar";
		buildTreeDOM(treeMain, tree, 0, true, dt, sidebar);
		layout.appendChild(treeMain);
		layout.appendChild(sidebar);
		treeContent.innerHTML = "";
		treeContent.appendChild(layout);
		if (selectedNodeForSidebar) renderNodeSidebar(sidebar, selectedNodeForSidebar);
	}
	function buildTreeDOM(parent, node, depth, expanded, dt, sidebar) {
		const wrapper = document.createElement("div");
		wrapper.className = `tree-node${expanded ? " expanded" : ""}`;
		const line = document.createElement("div");
		line.className = "tree-line";
		line.style.paddingLeft = `${depth * 14}px`;
		function selectForSidebar() {
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
		const children = node.children ?? [];
		const hasChildren = children.length > 0;
		const toggleEl = document.createElement("span");
		toggleEl.className = "tree-toggle";
		toggleEl.textContent = hasChildren ? expanded ? "▼" : "▶" : " ";
		line.appendChild(toggleEl);
		const tag = (node.tag ?? "???").toLowerCase();
		const tagSpan = document.createElement("span");
		let html = `<span class="tree-tag">&lt;${escapeHtml(tag)}</span>`;
		const attrs = node.attributes ?? {};
		if (attrs.id) html += ` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${escapeHtml(attrs.id)}"</span>`;
		if (node.className) {
			const cls = truncate(node.className, 30);
			html += ` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${escapeHtml(cls)}"</span>`;
		}
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
		line.addEventListener("click", (e) => {
			if (hasChildren && e.target === toggleEl) {
				wrapper.classList.toggle("expanded");
				toggleEl.textContent = wrapper.classList.contains("expanded") ? "▼" : "▶";
				return;
			}
			selectForSidebar();
			if (node.id != null) {
				const realNode = dt.findRealNode(node.id);
				if (realNode && "scrollIntoView" in realNode) {
					realNode.scrollIntoView({
						behavior: "smooth",
						block: "center"
					});
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
			for (const child of children) buildTreeDOM(childrenDiv, child, depth + 1, depth < 2, dt, sidebar);
			wrapper.appendChild(childrenDiv);
		}
		parent.appendChild(wrapper);
	}
	function renderPerfTab() {
		const dt = getDevtools();
		if (!dt) {
			perfContent.innerHTML = "<div class=\"perf-row\"><span class=\"perf-label\">Devtools API not available.</span></div>";
			return;
		}
		const stats = dt.scheduler.stats();
		const pending = stats.pending;
		queueHistory.push(pending);
		if (queueHistory.length > MAX_HISTORY) queueHistory.shift();
		let html = "";
		html += "<div class=\"perf-section-title\">Scheduler</div>";
		let pendingClass = "";
		if (pending > 1e3) pendingClass = "red";
		else if (pending > 100) pendingClass = "yellow";
		else pendingClass = "green";
		html += `<div class="perf-row"><span class="perf-label">Pending</span><span class="perf-value ${pendingClass}">${pending}</span></div>`;
		html += `<div class="perf-row"><span class="perf-label">Frame ID</span><span class="perf-value">${stats.frameId}</span></div>`;
		const ftClass = stats.lastFrameTimeMs > 16 ? "red" : stats.lastFrameTimeMs > 12 ? "yellow" : "green";
		html += `<div class="perf-row"><span class="perf-label">Frame Time</span><span class="perf-value ${ftClass}">${stats.lastFrameTimeMs.toFixed(1)}ms</span></div>`;
		html += `<div class="perf-row"><span class="perf-label">Frame Actions</span><span class="perf-value">${stats.lastFrameActions}</span></div>`;
		const runClass = stats.isRunning ? "green" : "yellow";
		html += `<div class="perf-row"><span class="perf-label">Running</span><span class="perf-value ${runClass}">${stats.isRunning ? "Yes" : "No"}</span></div>`;
		html += `<div class="perf-row"><span class="perf-label">Last Tick</span><span class="perf-value">${stats.lastTickTime > 0 ? `${stats.lastTickTime.toFixed(0)}ms` : "N/A"}</span></div>`;
		const latencyMs = stats.enqueueToApplyMs;
		html += `<div class="perf-row"><span class="perf-label">Enqueue\u2192Apply</span><span class="perf-value ${latencyMs > 16 ? "red" : latencyMs > 5 ? "yellow" : "green"}">${latencyMs > 0 ? `${latencyMs.toFixed(1)}ms` : "N/A"}</span></div>`;
		if (queueHistory.length > 1) html += `<div class="perf-row"><span class="perf-label">Queue (${MAX_HISTORY}f)</span><span class="perf-sparkline">${sparkline(queueHistory)}</span></div>`;
		const apps = dt.apps();
		html += `<div class="perf-row"><span class="perf-label">Apps</span><span class="perf-value">${apps.length}</span></div>`;
		const allData = dt.getAllAppsData();
		for (const appId of apps) {
			const data = allData[appId];
			if (!data?.workerStats) continue;
			const ws = data.workerStats;
			html += `<div class="perf-section-title">Worker: ${escapeHtml(appId)}</div>`;
			html += `<div class="perf-row"><span class="perf-label">Mutations Added</span><span class="perf-value">${ws.added}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Mutations Coalesced</span><span class="perf-value">${ws.coalesced}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Mutations Flushed</span><span class="perf-value">${ws.flushed}</span></div>`;
			const coalescingRatio = ws.added > 0 ? (ws.coalesced / ws.added * 100).toFixed(1) : "0.0";
			html += `<div class="perf-row"><span class="perf-label">Coalescing Ratio</span><span class="perf-value ${Number.parseFloat(coalescingRatio) > 50 ? "green" : Number.parseFloat(coalescingRatio) > 20 ? "yellow" : ""}">${coalescingRatio}%</span></div>`;
		}
		const frameLog = dt.scheduler.frameLog();
		if (frameLog.length > 0) {
			html += "<div class=\"frame-section-title\">Frames</div>";
			const budget = 16;
			for (const frame of frameLog) {
				const pct = Math.min(frame.totalMs / budget * 100, 100);
				const ratio = frame.totalMs / budget;
				let colorClass;
				if (ratio > 1) colorClass = "red";
				else if (ratio > .5) colorClass = "yellow";
				else colorClass = "green";
				const warn = frame.totalMs > budget ? " !" : "";
				html += `<div class="frame-bar-row" data-frame-id="${frame.frameId}">`;
				html += `<span class="frame-label">#${frame.frameId}</span>`;
				html += `<span class="frame-bar-track"><span class="frame-bar-fill ${colorClass}" style="width:${pct.toFixed(1)}%"></span></span>`;
				html += `<span class="frame-info">${frame.totalMs.toFixed(1)}ms / ${budget}ms (${frame.actionCount})${warn}</span>`;
				html += "</div>";
				if (expandedFrameId === frame.frameId) {
					html += "<div class=\"frame-detail\">";
					const entries = [...frame.timingBreakdown.entries()].sort((a, b) => b[1] - a[1]);
					for (const [action, ms] of entries) html += `<div class="frame-detail-row"><span class="frame-detail-action">${escapeHtml(action)}</span><span class="frame-detail-time">${ms.toFixed(2)}ms</span></div>`;
					html += "</div>";
				}
			}
		}
		for (const appId of apps) {
			const data = allData[appId];
			if (!data?.perTypeCoalesced) continue;
			const ptc = data.perTypeCoalesced;
			const actions = Object.keys(ptc);
			if (actions.length === 0) continue;
			html += `<div class="perf-section-title">Coalescing: ${escapeHtml(appId)}</div>`;
			for (const action of actions) {
				const c = ptc[action];
				const pct = c.added > 0 ? (c.coalesced / c.added * 100).toFixed(0) : "0";
				html += `<div class="coalesce-row">`;
				html += `<span class="coalesce-action">${escapeHtml(action)}</span>`;
				html += `<span class="coalesce-detail">${c.added} added, ${c.coalesced} coalesced</span>`;
				html += `<span class="coalesce-pct">(${pct}%)</span>`;
				html += "</div>";
			}
		}
		if (mutationLog.length > 0) {
			const typeCounts = /* @__PURE__ */ new Map();
			for (const entry of mutationLog) typeCounts.set(entry.action, (typeCounts.get(entry.action) ?? 0) + 1);
			const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
			const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
			html += "<div class=\"perf-section-title\">Mutation Types</div>";
			for (const [action, count] of sorted) {
				const pct = Math.max(count / maxCount * 100, 2);
				html += `<div class="chart-bar-row">`;
				html += `<span class="chart-bar-label">${escapeHtml(action)}</span>`;
				html += `<span class="chart-bar-track"><span class="chart-bar-fill" style="width:${pct.toFixed(1)}%"></span></span>`;
				html += `<span class="chart-bar-value">${count}</span>`;
				html += "</div>";
			}
		}
		perfContent.innerHTML = html;
		const frameRows = perfContent.querySelectorAll(".frame-bar-row");
		for (const row of frameRows) row.addEventListener("click", () => {
			const fid = Number(row.dataset.frameId);
			expandedFrameId = expandedFrameId === fid ? null : fid;
			renderPerfTab();
		});
	}
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
	function getActionColorClass(action) {
		switch (action) {
			case "createNode":
			case "createComment":
			case "appendChild":
			case "bodyAppendChild":
			case "headAppendChild":
			case "insertBefore": return "color-green";
			case "setAttribute":
			case "removeAttribute":
			case "setStyle":
			case "setClassName":
			case "setProperty":
			case "setTextContent":
			case "setHTML":
			case "insertAdjacentHTML": return "color-blue";
			case "removeNode":
			case "removeChild": return "color-red";
			default: return "";
		}
	}
	function buildLogEntryDiv(entry) {
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
		const nodeId = "id" in entry.mutation ? entry.mutation.id : void 0;
		let detail = nodeId != null ? `#${nodeId}` : "";
		const m = entry.mutation;
		if (m.tag) detail += ` tag=${m.tag}`;
		if (m.name && entry.action !== "addEventListener") detail += ` ${m.name}`;
		if (m.property) detail += ` ${m.property}`;
		detailSpan.textContent = detail;
		div.appendChild(detailSpan);
		return div;
	}
	function renderLogTab() {
		logCountSpan.textContent = String(mutationLog.length);
		if (mutationLog.length === 0) {
			if (lastRenderedLogLength !== 0) {
				logList.innerHTML = "<div class=\"log-empty\">No mutations captured yet.</div>";
				lastRenderedLogLength = 0;
			}
			return;
		}
		const filterText = logFilter.value.toLowerCase().trim();
		const fragment = document.createDocumentFragment();
		const groups = [];
		let currentGroup = null;
		for (const entry of mutationLog) {
			if (filterText && !entry.action.toLowerCase().includes(filterText)) continue;
			const uid = entry.batchUid;
			if (uid != null && currentGroup !== null && currentGroup.batchUid === uid) currentGroup.entries.push(entry);
			else {
				currentGroup = {
					batchUid: uid,
					entries: [entry]
				};
				groups.push(currentGroup);
			}
		}
		for (const group of groups) {
			if (group.batchUid == null || group.entries.length <= 1) {
				for (const entry of group.entries) fragment.appendChild(buildLogEntryDiv(entry));
				continue;
			}
			const batchDiv = document.createElement("div");
			batchDiv.className = "batch-group";
			const header = document.createElement("div");
			header.className = "batch-header";
			const toggle = document.createElement("span");
			toggle.className = "batch-toggle";
			toggle.textContent = "▶";
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
				toggle.textContent = batchDiv.classList.contains("expanded") ? "▼" : "▶";
			});
			batchDiv.appendChild(header);
			const entriesDiv = document.createElement("div");
			entriesDiv.className = "batch-entries";
			for (const entry of group.entries) entriesDiv.appendChild(buildLogEntryDiv(entry));
			batchDiv.appendChild(entriesDiv);
			fragment.appendChild(batchDiv);
		}
		logList.innerHTML = "";
		logList.appendChild(fragment);
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
					const mutCount = mutationLog.filter((m) => m.timestamp >= eventTime && m.timestamp <= eventTime + 100).length;
					const div = document.createElement("div");
					div.className = "event-trace-entry";
					div.innerHTML = `[<span class="event-trace-type">${escapeHtml(trace.eventType)}</span>] serialize <span class="event-trace-time">${trace.serializeMs.toFixed(1)}ms</span> transport dispatch${mutCount > 0 ? ` ${mutCount} mutations` : ""}`;
					traceSection.appendChild(div);
				}
				logList.appendChild(traceSection);
			}
		}
		if (autoScroll) logList.scrollTop = logList.scrollHeight;
		lastRenderedLogLength = mutationLog.length;
	}
	logFilter.addEventListener("input", renderLogTab);
	logClearBtn.addEventListener("click", () => {
		mutationLog.length = 0;
		lastRenderedLogLength = 0;
		logList.innerHTML = "<div class=\"log-empty\">No mutations captured yet.</div>";
		logCountSpan.textContent = "0";
	});
	let lastRenderedWarningLength = 0;
	function renderWarningsTab() {
		if (warningLog.length === 0) {
			if (lastRenderedWarningLength !== 0) {
				warnList.innerHTML = "<div class=\"warn-empty\">No warnings captured yet.</div>";
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
		warnList.innerHTML = "<div class=\"warn-empty\">No warnings captured yet.</div>";
		updateWarningBadge();
	});
	function updateWarningBadge() {
		if (warningBadgeCount > 0 && activeTab !== "Warnings") {
			warningBadge.textContent = String(warningBadgeCount > 99 ? "99+" : warningBadgeCount);
			warningBadge.style.display = "inline-block";
		} else warningBadge.style.display = "none";
		toggleTabText.textContent = warningBadgeCount > 0 ? `async-dom (${warningBadgeCount > 99 ? "99+" : warningBadgeCount}) \u25B2` : "async-dom ▲";
	}
	onWarningBadgeUpdate = updateWarningBadge;
	function startPolling() {
		stopPolling();
		treePollTimer = setInterval(() => {
			if (activeTab === "Tree") {
				const dt = getDevtools();
				if (dt) dt.refreshDebugData();
				setTimeout(renderTreeTab, 250);
			}
		}, 2e3);
		perfPollTimer = setInterval(() => {
			if (activeTab === "Performance") {
				const dt = getDevtools();
				if (dt) dt.refreshDebugData();
				setTimeout(renderPerfTab, 250);
			}
		}, 1e3);
		logRenderTimer = setInterval(() => {
			if (activeTab === "Log") renderLogTab();
			if (activeTab === "Warnings") renderWarningsTab();
		}, 500);
		renderActiveTab();
	}
	function stopPolling() {
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
	return { destroy() {
		stopPolling();
		clearInterval(healthDotTimer);
		onWarningBadgeUpdate = null;
		mutationLog.length = 0;
		warningLog.length = 0;
		warningBadgeCount = 0;
		host.remove();
	} };
}
//#endregion
//#region src/main-thread/event-bridge.ts
const MAX_EVENT_TRACES = 100;
/**
* Bridges real DOM events on the main thread to the worker thread.
* Uses AbortController for clean listener removal.
*/
var EventBridge = class {
	listeners = /* @__PURE__ */ new Map();
	eventConfig = /* @__PURE__ */ new Map();
	nodeCache;
	transport = null;
	appId;
	eventTraces = [];
	constructor(appId, nodeCache) {
		this.appId = appId;
		this.nodeCache = nodeCache ?? new NodeCache();
	}
	setTransport(transport) {
		this.transport = transport;
	}
	setNodeCache(nodeCache) {
		this.nodeCache = nodeCache;
	}
	configureEvent(nodeId, eventName, config) {
		this.eventConfig.set(`${nodeId}_${eventName}`, config);
		if (config.preventDefault && isPassiveEvent(eventName)) {
			for (const [listenerId, meta] of this.listeners.entries()) if (meta.nodeId === nodeId && meta.eventName === eventName) {
				meta.controller.abort();
				this.attach(nodeId, eventName, listenerId);
				break;
			}
		}
	}
	attach(nodeId, eventName, listenerId) {
		const node = this.nodeCache.get(nodeId);
		if (!node) return;
		const controller = new AbortController();
		this.listeners.set(listenerId, {
			controller,
			nodeId,
			eventName
		});
		const passive = this._isPassiveForListener(listenerId, eventName);
		node.addEventListener(eventName, (domEvent) => {
			const configKey = `${nodeId}_${eventName}`;
			if (this.eventConfig.get(configKey)?.preventDefault) domEvent.preventDefault();
			const serializeStart = performance.now();
			const serialized = serializeEvent(domEvent);
			const serializeMs = performance.now() - serializeStart;
			this.eventTraces.push({
				eventType: domEvent.type,
				serializeMs,
				timestamp: performance.now()
			});
			if (this.eventTraces.length > MAX_EVENT_TRACES) this.eventTraces.shift();
			this.transport?.send({
				type: "event",
				appId: this.appId,
				listenerId,
				event: serialized
			});
		}, {
			signal: controller.signal,
			passive
		});
	}
	detach(listenerId) {
		const meta = this.listeners.get(listenerId);
		if (meta) {
			meta.controller.abort();
			this.listeners.delete(listenerId);
		}
	}
	detachByNodeId(nodeId) {
		for (const [listenerId, meta] of this.listeners) if (meta.nodeId === nodeId) {
			meta.controller.abort();
			this.listeners.delete(listenerId);
		}
	}
	getEventTraces() {
		return this.eventTraces.slice();
	}
	detachAll() {
		for (const meta of this.listeners.values()) meta.controller.abort();
		this.listeners.clear();
	}
	_isPassiveForListener(_listenerId, eventName) {
		for (const [key, config] of this.eventConfig.entries()) if (key.endsWith(`_${eventName}`) && config.preventDefault) return false;
		return isPassiveEvent(eventName);
	}
};
const PASSIVE_EVENTS = new Set([
	"scroll",
	"touchstart",
	"touchmove",
	"wheel",
	"mousewheel"
]);
function isPassiveEvent(name) {
	return PASSIVE_EVENTS.has(name);
}
function getNodeId(el) {
	if (!el) return null;
	const asyncId = el.__asyncDomId;
	if (asyncId != null) return String(asyncId);
	return el.getAttribute("data-async-dom-id") ?? el.id ?? null;
}
/**
* Serialize a DOM event to a plain object that can be transferred via postMessage.
* Only includes properties relevant to the event type.
*/
function serializeEvent(e) {
	const composedTarget = e.composedPath?.()[0] ?? e.target;
	const base = {
		type: e.type,
		target: getNodeId(composedTarget),
		currentTarget: getNodeId(e.currentTarget),
		bubbles: e.bubbles,
		cancelable: e.cancelable,
		composed: e.composed,
		eventPhase: e.eventPhase,
		isTrusted: e.isTrusted,
		timeStamp: e.timeStamp
	};
	if (e.type === "click") {
		if (e.target instanceof HTMLAnchorElement || e.currentTarget instanceof HTMLAnchorElement) e.preventDefault();
	}
	if (e instanceof MouseEvent) {
		base.clientX = e.clientX;
		base.clientY = e.clientY;
		base.pageX = e.pageX;
		base.pageY = e.pageY;
		base.screenX = e.screenX;
		base.screenY = e.screenY;
		base.offsetX = e.offsetX;
		base.offsetY = e.offsetY;
		base.button = e.button;
		base.buttons = e.buttons;
		base.altKey = e.altKey;
		base.ctrlKey = e.ctrlKey;
		base.metaKey = e.metaKey;
		base.shiftKey = e.shiftKey;
		base.relatedTarget = getNodeId(e.relatedTarget);
		base.detail = e.detail;
	}
	if (e instanceof KeyboardEvent) {
		base.key = e.key;
		base.code = e.code;
		base.keyCode = e.keyCode;
		base.altKey = e.altKey;
		base.ctrlKey = e.ctrlKey;
		base.metaKey = e.metaKey;
		base.shiftKey = e.shiftKey;
	}
	if (e instanceof InputEvent) {
		base.data = e.data ?? void 0;
		base.inputType = e.inputType;
	}
	const target = e.target;
	if (target instanceof HTMLInputElement) {
		base.value = target.value;
		base.checked = target.checked;
	} else if (target instanceof HTMLTextAreaElement) base.value = target.value;
	else if (target instanceof HTMLSelectElement) {
		base.value = target.value;
		base.selectedIndex = target.selectedIndex;
	}
	if (e instanceof FocusEvent) base.relatedTarget = e.relatedTarget instanceof Element ? getNodeId(e.relatedTarget) : null;
	if (e instanceof WheelEvent) Object.assign(base, {
		deltaX: e.deltaX,
		deltaY: e.deltaY,
		deltaZ: e.deltaZ,
		deltaMode: e.deltaMode
	});
	return base;
}
//#endregion
//#region src/main-thread/renderer.ts
const DANGEROUS_ATTR_NAMES = new Set(["srcdoc", "formaction"]);
const DANGEROUS_URI_ATTR_NAMES = new Set([
	"href",
	"src",
	"data",
	"action",
	"xlink:href"
]);
function isDangerousURI(value) {
	const trimmed = value.trim().toLowerCase();
	return /^\s*javascript\s*:/i.test(trimmed) || /^\s*vbscript\s*:/i.test(trimmed) || /^\s*data\s*:\s*text\/html/i.test(trimmed);
}
const DEFAULT_PERMISSIONS = {
	allowHeadAppend: false,
	allowBodyAppend: false,
	allowNavigation: true,
	allowScroll: true,
	allowUnsafeHTML: false
};
const ALLOWED_PROPERTIES = new Set([
	"value",
	"checked",
	"disabled",
	"selectedIndex",
	"indeterminate",
	"readOnly",
	"required",
	"placeholder",
	"type",
	"name",
	"scrollTop",
	"scrollLeft",
	"textContent",
	"nodeValue",
	"src",
	"currentTime",
	"volume",
	"muted",
	"controls",
	"loop",
	"poster",
	"autoplay",
	"tabIndex",
	"title",
	"lang",
	"dir",
	"hidden",
	"draggable",
	"contentEditable",
	"htmlFor",
	"open",
	"selected",
	"multiple",
	"width",
	"height",
	"colSpan",
	"rowSpan"
]);
const SVG_TAGS = new Set([
	"svg",
	"path",
	"circle",
	"ellipse",
	"line",
	"polygon",
	"polyline",
	"rect",
	"g",
	"defs",
	"use",
	"text",
	"tspan",
	"clippath",
	"mask",
	"image",
	"symbol",
	"marker",
	"lineargradient",
	"radialgradient",
	"stop",
	"filter",
	"fegaussianblur",
	"feoffset",
	"feblend",
	"foreignobject"
]);
const SVG_NS = "http://www.w3.org/2000/svg";
/**
* Applies DOM mutations to the real DOM.
* Stateless except for the node cache mapping NodeIds to DOM nodes.
*/
var DomRenderer = class {
	nodeCache;
	permissions;
	root;
	_additionalAllowedProperties;
	onNodeRemoved = null;
	_onWarning = null;
	_onMutation = null;
	highlightEnabled = false;
	setDebugHooks(hooks) {
		this._onWarning = hooks.onWarning ?? null;
		this._onMutation = hooks.onMutation ?? null;
	}
	enableHighlightUpdates(enabled) {
		this.highlightEnabled = enabled;
	}
	highlightNode(id) {
		if (!this.highlightEnabled) return;
		const node = this.nodeCache.get(id);
		if (!node?.style) return;
		const prev = node.style.outline;
		node.style.outline = "2px solid rgba(78, 201, 176, 0.8)";
		setTimeout(() => {
			node.style.outline = prev;
		}, 300);
	}
	constructor(nodeCache, permissions, root) {
		this.nodeCache = nodeCache ?? new NodeCache();
		this.permissions = {
			...DEFAULT_PERMISSIONS,
			...permissions
		};
		this._additionalAllowedProperties = new Set(this.permissions.additionalAllowedProperties ?? []);
		this.root = root ?? {
			body: document.body,
			head: document.head,
			html: document.documentElement
		};
	}
	apply(mutation, batchUid) {
		if (this._onMutation) this._onMutation({
			side: "main",
			action: mutation.action,
			mutation,
			timestamp: performance.now(),
			batchUid
		});
		switch (mutation.action) {
			case "createNode":
				this.createNode(mutation.id, mutation.tag, mutation.textContent);
				break;
			case "createComment":
				this.createComment(mutation.id, mutation.textContent);
				break;
			case "appendChild":
				this.appendChild(mutation.id, mutation.childId);
				break;
			case "removeNode":
				this.removeNode(mutation.id);
				break;
			case "removeChild":
				this.removeChild(mutation.id, mutation.childId);
				break;
			case "insertBefore":
				this.insertBefore(mutation.id, mutation.newId, mutation.refId);
				break;
			case "setAttribute":
				this.setAttribute(mutation.id, mutation.name, mutation.value);
				break;
			case "removeAttribute":
				this.removeAttribute(mutation.id, mutation.name);
				break;
			case "setStyle":
				this.setStyle(mutation.id, mutation.property, mutation.value);
				break;
			case "setProperty":
				this.setProperty(mutation.id, mutation.property, mutation.value);
				break;
			case "setTextContent":
				this.setTextContent(mutation.id, mutation.textContent);
				break;
			case "setClassName":
				this.setClassName(mutation.id, mutation.name);
				break;
			case "setHTML":
				this.setHTML(mutation.id, mutation.html);
				break;
			case "addEventListener": break;
			case "configureEvent": break;
			case "removeEventListener": break;
			case "headAppendChild":
				this.headAppendChild(mutation.id);
				break;
			case "bodyAppendChild":
				this.bodyAppendChild(mutation.id);
				break;
			case "pushState":
				if (this.permissions.allowNavigation) window.history.pushState(mutation.state, mutation.title, mutation.url);
				break;
			case "replaceState":
				if (this.permissions.allowNavigation) window.history.replaceState(mutation.state, mutation.title, mutation.url);
				break;
			case "scrollTo":
				if (this.permissions.allowScroll) window.scrollTo(mutation.x, mutation.y);
				break;
			case "insertAdjacentHTML":
				this.insertAdjacentHTML(mutation.id, mutation.position, mutation.html);
				break;
		}
		if (this.highlightEnabled && "id" in mutation) {
			const action = mutation.action;
			if (action === "appendChild" || action === "setAttribute" || action === "setStyle" || action === "setClassName" || action === "setTextContent" || action === "setHTML") this.highlightNode(mutation.id);
		}
	}
	getNode(id) {
		return this.nodeCache.get(id);
	}
	clear() {
		this.nodeCache.clear();
	}
	getRoot() {
		return this.root;
	}
	createNode(id, tag, textContent) {
		if (this.nodeCache.has(id)) return;
		if (tag === "HTML") {
			this.nodeCache.set(id, this.root.html);
			return;
		}
		if (tag === "BODY") {
			this.nodeCache.set(id, this.root.body);
			return;
		}
		if (tag === "HEAD") {
			this.nodeCache.set(id, this.root.head);
			return;
		}
		if (tag.charAt(0) === "#") {
			const textNode = document.createTextNode(textContent ?? "");
			this.nodeCache.set(id, textNode);
			return;
		}
		const lowerTag = tag.toLowerCase();
		let node;
		if (SVG_TAGS.has(lowerTag)) node = document.createElementNS(SVG_NS, lowerTag);
		else node = document.createElement(tag);
		const idStr = String(id);
		node.setAttribute("data-async-dom-id", idStr);
		node.__asyncDomId = id;
		if (textContent) node.textContent = textContent;
		this.nodeCache.set(id, node);
	}
	createComment(id, textContent) {
		if (this.nodeCache.has(id)) return;
		const node = document.createComment(textContent);
		this.nodeCache.set(id, node);
	}
	appendChild(parentId, childId) {
		const parent = this.nodeCache.get(parentId);
		const child = this.nodeCache.get(childId);
		if (!parent || !child) {
			const msg = `appendChild: ${!parent ? "parent" : "child"} not found`;
			console.warn(`[async-dom] ${msg}`, {
				parentId,
				childId
			});
			this._onWarning?.({
				code: require_sync_channel.WarningCode.MISSING_NODE,
				message: msg,
				context: {
					parentId,
					childId
				},
				timestamp: performance.now()
			});
			return;
		}
		parent.appendChild(child);
	}
	removeNode(id) {
		const node = this.nodeCache.get(id);
		if (!node) {
			const msg = "removeNode: node not found";
			console.warn(`[async-dom] ${msg}`, { id });
			this._onWarning?.({
				code: require_sync_channel.WarningCode.MISSING_NODE,
				message: msg,
				context: { id },
				timestamp: performance.now()
			});
			return;
		}
		this._cleanupSubtreeListeners(node, id);
		this.nodeCache.delete(id);
		if (node.parentNode) node.parentNode.removeChild(node);
		else if ("remove" in node && typeof node.remove === "function") node.remove();
	}
	removeChild(parentId, childId) {
		const parent = this.nodeCache.get(parentId);
		const child = this.nodeCache.get(childId);
		if (parent && child?.parentNode) {
			child.parentNode.removeChild(child);
			this.nodeCache.delete(childId);
			this.onNodeRemoved?.(childId);
		}
	}
	insertBefore(parentId, newId, refId) {
		if (parentId === newId) return;
		const parent = this.nodeCache.get(parentId);
		const newEl = this.nodeCache.get(newId);
		if (!parent || !newEl) {
			const msg = `insertBefore: ${!parent ? "parent" : "newNode"} not found`;
			console.warn(`[async-dom] ${msg}`, {
				parentId,
				newId,
				refId
			});
			this._onWarning?.({
				code: require_sync_channel.WarningCode.MISSING_NODE,
				message: msg,
				context: {
					parentId,
					newId,
					refId
				},
				timestamp: performance.now()
			});
			return;
		}
		const refEl = refId ? this.nodeCache.get(refId) : null;
		parent.insertBefore(newEl, refEl ?? null);
	}
	setAttribute(id, name, value) {
		const node = this.nodeCache.get(id);
		if (!node || !("setAttribute" in node)) {
			const msg = "setAttribute: node not found";
			console.warn(`[async-dom] ${msg}`, {
				id,
				name,
				value
			});
			this._onWarning?.({
				code: require_sync_channel.WarningCode.MISSING_NODE,
				message: msg,
				context: {
					id,
					name,
					value
				},
				timestamp: performance.now()
			});
			return;
		}
		const lowerName = name.toLowerCase();
		if (/^on/i.test(lowerName)) return;
		if (DANGEROUS_ATTR_NAMES.has(lowerName)) return;
		if (DANGEROUS_URI_ATTR_NAMES.has(lowerName) && isDangerousURI(value)) return;
		if (name === "id") this.nodeCache.set(value, node);
		node.setAttribute(name, value);
	}
	removeAttribute(id, name) {
		const node = this.nodeCache.get(id);
		if (!node || !("removeAttribute" in node)) return;
		node.removeAttribute(name);
	}
	setStyle(id, property, value) {
		const node = this.nodeCache.get(id);
		if (!node?.style) {
			const msg = "setStyle: node not found";
			console.warn(`[async-dom] ${msg}`, {
				id,
				property,
				value
			});
			this._onWarning?.({
				code: require_sync_channel.WarningCode.MISSING_NODE,
				message: msg,
				context: {
					id,
					property,
					value
				},
				timestamp: performance.now()
			});
			return;
		}
		node.style.setProperty(property, value);
	}
	setProperty(id, property, value) {
		const node = this.nodeCache.get(id);
		if (!node) return;
		if (!ALLOWED_PROPERTIES.has(property) && !this._additionalAllowedProperties.has(property)) {
			this._onWarning?.({
				code: require_sync_channel.WarningCode.BLOCKED_PROPERTY,
				message: `setProperty: property "${property}" is not in the allowed list`,
				context: {
					id,
					property
				},
				timestamp: performance.now()
			});
			return;
		}
		node[property] = value;
	}
	setTextContent(id, textContent) {
		const node = this.nodeCache.get(id);
		if (!node) return;
		node.textContent = textContent;
	}
	setClassName(id, name) {
		const node = this.nodeCache.get(id);
		if (!node) return;
		node.className = name;
	}
	setHTML(id, html) {
		const node = this.nodeCache.get(id);
		if (!node) return;
		node.innerHTML = this.permissions.allowUnsafeHTML ? html : sanitizeHTML(html);
	}
	insertAdjacentHTML(id, position, html) {
		const node = this.nodeCache.get(id);
		if (!node || !("insertAdjacentHTML" in node)) return;
		node.insertAdjacentHTML(position, this.permissions.allowUnsafeHTML ? html : sanitizeHTML(html));
	}
	headAppendChild(id) {
		if (!this.permissions.allowHeadAppend) return;
		const node = this.nodeCache.get(id);
		if (node) this.root.head.appendChild(node);
	}
	bodyAppendChild(id) {
		if (!this.permissions.allowBodyAppend) return;
		const node = this.nodeCache.get(id);
		if (node) this.root.body.appendChild(node);
	}
	/**
	* Notify onNodeRemoved for a node and all its descendants.
	* This ensures EventBridge detaches listeners on the entire subtree.
	*/
	_cleanupSubtreeListeners(node, id) {
		this.onNodeRemoved?.(id);
		if ("children" in node) {
			const el = node;
			for (let i = 0; i < el.children.length; i++) {
				const child = el.children[i];
				const childId = child.__asyncDomId;
				if (childId) {
					this._cleanupSubtreeListeners(child, childId);
					this.nodeCache.delete(childId);
				}
			}
		}
	}
};
//#endregion
//#region src/main-thread/thread-manager.ts
/**
* Manages multiple worker/WebSocket connections, routing messages
* between the main thread and isolated app threads.
*/
var ThreadManager = class {
	threads = /* @__PURE__ */ new Map();
	messageHandlers = [];
	createWorkerThread(config) {
		const appId = generateAppId();
		const transport = config.transport ?? new require_worker_transport.WorkerTransport(config.worker);
		transport.onMessage((message) => {
			this.notifyHandlers(appId, message);
		});
		this.threads.set(appId, {
			transport,
			appId
		});
		return appId;
	}
	createWebSocketThread(config) {
		const appId = generateAppId();
		const transport = new require_binary_worker_transport.WebSocketTransport(config.url, config.options);
		transport.onMessage((message) => {
			this.notifyHandlers(appId, message);
		});
		this.threads.set(appId, {
			transport,
			appId
		});
		return appId;
	}
	sendToThread(appId, message) {
		const thread = this.threads.get(appId);
		if (thread) thread.transport.send(message);
	}
	broadcast(message) {
		for (const thread of this.threads.values()) thread.transport.send(message);
	}
	destroyThread(appId) {
		const thread = this.threads.get(appId);
		if (thread) {
			thread.transport.close();
			this.threads.delete(appId);
		}
	}
	destroyAll() {
		for (const appId of [...this.threads.keys()]) this.destroyThread(appId);
	}
	onMessage(handler) {
		this.messageHandlers.push(handler);
	}
	getTransport(appId) {
		return this.threads.get(appId)?.transport ?? null;
	}
	notifyHandlers(appId, message) {
		for (const handler of this.messageHandlers) handler(appId, message);
	}
};
function generateAppId() {
	return require_sync_channel.createAppId(Math.random().toString(36).slice(2, 7));
}
//#endregion
//#region src/main-thread/index.ts
/**
* Creates a new async-dom instance on the main thread.
*
* This is the primary entry point for using async-dom. It:
* - Creates a scheduler for frame-budgeted rendering
* - Creates per-app renderers for applying DOM mutations (isolation)
* - Creates an event bridge for forwarding events to workers
* - Manages worker threads
*/
function createAsyncDom(config) {
	const scheduler = new FrameScheduler(config.scheduler);
	const threadManager = new ThreadManager();
	const eventBridges = /* @__PURE__ */ new Map();
	const syncHosts = /* @__PURE__ */ new Map();
	const debugHooks = require_sync_channel.resolveDebugHooks(config.debug);
	const renderers = /* @__PURE__ */ new Map();
	let lastRenderer = null;
	let lastAppId = null;
	const debugData = /* @__PURE__ */ new Map();
	function requestDebugData(appId) {
		threadManager.sendToThread(appId, {
			type: "debugQuery",
			query: "tree"
		});
		threadManager.sendToThread(appId, {
			type: "debugQuery",
			query: "stats"
		});
		threadManager.sendToThread(appId, {
			type: "debugQuery",
			query: "perTypeCoalesced"
		});
	}
	function handleSyncQuery(appRenderer, query) {
		try {
			const parsed = JSON.parse(query.data);
			const nodeId = parsed.nodeId;
			const property = parsed.property;
			switch (query.queryType) {
				case require_sync_channel.QueryType.BoundingRect: {
					const node = appRenderer.getNode(nodeId);
					if (!node || !("getBoundingClientRect" in node)) return null;
					const rect = node.getBoundingClientRect();
					return {
						top: rect.top,
						left: rect.left,
						right: rect.right,
						bottom: rect.bottom,
						width: rect.width,
						height: rect.height,
						x: rect.x,
						y: rect.y
					};
				}
				case require_sync_channel.QueryType.ComputedStyle: {
					const node = appRenderer.getNode(nodeId);
					if (!node) return {};
					const cs = window.getComputedStyle(node);
					const result = {};
					for (const p of [
						"display",
						"position",
						"top",
						"left",
						"right",
						"bottom",
						"width",
						"height",
						"color",
						"background-color",
						"font-size",
						"font-family",
						"font-weight",
						"line-height",
						"text-align",
						"visibility",
						"opacity",
						"overflow",
						"z-index",
						"float",
						"clear",
						"cursor",
						"pointer-events",
						"box-sizing",
						"flex-direction",
						"justify-content",
						"align-items",
						"flex-wrap",
						"flex-grow",
						"flex-shrink",
						"flex-basis",
						"grid-template-columns",
						"grid-template-rows",
						"gap",
						"transform",
						"border-radius",
						"box-shadow",
						"text-decoration",
						"white-space",
						"word-break",
						"overflow-wrap",
						"min-width",
						"max-width",
						"min-height",
						"max-height",
						"margin-top",
						"margin-right",
						"margin-bottom",
						"margin-left",
						"padding-top",
						"padding-right",
						"padding-bottom",
						"padding-left"
					]) {
						const v = cs.getPropertyValue(p);
						if (v) result[p] = v;
					}
					return result;
				}
				case require_sync_channel.QueryType.NodeProperty: {
					const node = appRenderer.getNode(nodeId);
					if (!node || !property) return null;
					return node[property] ?? null;
				}
				case require_sync_channel.QueryType.WindowProperty: {
					if (!property) return null;
					const parts = property.split(".");
					let current = window;
					for (const part of parts) {
						if (current == null) return null;
						current = current[part];
					}
					return current ?? null;
				}
				default: return null;
			}
		} catch {
			return null;
		}
	}
	scheduler.setApplier((mutation, appId, batchUid) => {
		if (mutation.action === "addEventListener") {
			const bridge = eventBridges.get(appId);
			if (bridge) bridge.attach(mutation.id, mutation.name, mutation.listenerId);
			return;
		}
		if (mutation.action === "configureEvent") {
			const bridge = eventBridges.get(appId);
			if (bridge) bridge.configureEvent(mutation.id, mutation.name, {
				preventDefault: mutation.preventDefault,
				passive: mutation.passive
			});
			return;
		}
		if (mutation.action === "removeEventListener") {
			const bridge = eventBridges.get(appId);
			if (bridge) bridge.detach(mutation.listenerId);
			return;
		}
		let renderer;
		if (appId === lastAppId && lastRenderer) renderer = lastRenderer;
		else {
			renderer = renderers.get(appId);
			if (renderer) {
				lastRenderer = renderer;
				lastAppId = appId;
			}
		}
		if (renderer) renderer.apply(mutation, batchUid);
	});
	threadManager.onMessage((appId, message) => {
		if (require_sync_channel.isMutationMessage(message)) {
			scheduler.enqueue(message.mutations, appId, message.priority ?? "normal", message.uid);
			return;
		}
		if (require_sync_channel.isSystemMessage(message) && message.type === "debugResult") {
			const debugMsg = message;
			const data = debugData.get(appId) ?? {
				tree: null,
				workerStats: null,
				perTypeCoalesced: null
			};
			if (debugMsg.query === "tree") data.tree = debugMsg.result;
			if (debugMsg.query === "stats") data.workerStats = debugMsg.result;
			if (debugMsg.query === "perTypeCoalesced") data.perTypeCoalesced = debugMsg.result;
			debugData.set(appId, data);
		}
	});
	if (config.worker) addAppInternal(config.worker);
	function addAppInternal(worker, mountPoint, shadow, customTransport, onError) {
		const appId = threadManager.createWorkerThread({
			worker,
			transport: customTransport
		});
		const appNodeCache = new NodeCache();
		let mountEl = null;
		if (mountPoint) mountEl = typeof mountPoint === "string" ? document.querySelector(mountPoint) : mountPoint;
		let rendererRoot;
		if (mountEl && shadow) {
			const shadowInit = shadow === true ? { mode: "open" } : shadow;
			const shadowRoot = mountEl.attachShadow(shadowInit);
			rendererRoot = {
				body: shadowRoot,
				head: shadowRoot,
				html: mountEl
			};
		} else if (mountEl) rendererRoot = {
			body: mountEl,
			head: document.head,
			html: mountEl
		};
		const appRenderer = new DomRenderer(appNodeCache, void 0, rendererRoot);
		if (debugHooks.onWarning || debugHooks.onMutation) appRenderer.setDebugHooks({
			onWarning: debugHooks.onWarning,
			onMutation: debugHooks.onMutation
		});
		const root = appRenderer.getRoot();
		appNodeCache.set(1, root.body);
		appNodeCache.set(2, root.head);
		appNodeCache.set(3, root.html);
		appNodeCache.set(4, document);
		appRenderer.onNodeRemoved = (id) => {
			const bridge = eventBridges.get(appId);
			if (bridge) bridge.detachByNodeId(id);
		};
		renderers.set(appId, appRenderer);
		const bridge = new EventBridge(appId, appNodeCache);
		const appTransport = threadManager.getTransport(appId);
		if (appTransport) {
			bridge.setTransport(appTransport);
			const cleanupDeadApp = () => {
				bridge.detachAll();
				eventBridges.delete(appId);
				appRenderer.clear();
				renderers.delete(appId);
				if (lastAppId === appId) {
					lastRenderer = null;
					lastAppId = null;
				}
				const host = syncHosts.get(appId);
				if (host) {
					host.stopPolling();
					syncHosts.delete(appId);
				}
				scheduler.setAppCount(renderers.size);
			};
			console.debug("[async-dom] App", appId, "transport ready, readyState:", appTransport.readyState);
			appTransport.onError = (error) => {
				console.error("[async-dom] App", appId, "worker error:", error.message);
				onError?.({
					message: error.message,
					stack: error.stack,
					name: error.name
				}, appId);
			};
			appTransport.onClose = () => {
				console.warn("[async-dom] App", appId, "worker disconnected, cleaning up");
				cleanupDeadApp();
			};
			appTransport.onMessage((message) => {
				if (require_sync_channel.isSystemMessage(message) && message.type === "error" && "error" in message) {
					const errMsg = message;
					onError?.(errMsg.error, appId);
					const err = errMsg.error;
					const location = err.filename ? ` at ${err.filename}:${err.lineno ?? "?"}:${err.colno ?? "?"}` : "";
					captureWarning({
						code: err.isUnhandledRejection ? "WORKER_UNHANDLED_REJECTION" : "WORKER_ERROR",
						message: `[${String(appId)}] ${err.name ?? "Error"}: ${err.message}${location}${err.stack ? `\n${err.stack}` : ""}`,
						context: {
							appId: String(appId),
							error: err
						},
						timestamp: performance.now()
					});
				}
			});
		}
		eventBridges.set(appId, bridge);
		scheduler.setAppCount(renderers.size);
		let sharedBuffer;
		if (typeof SharedArrayBuffer !== "undefined") try {
			sharedBuffer = new SharedArrayBuffer(65536);
			const host = new require_sync_channel.SyncChannelHost(sharedBuffer);
			host.startPolling((query) => handleSyncQuery(appRenderer, query));
			syncHosts.set(appId, host);
		} catch {
			sharedBuffer = void 0;
		}
		if (appTransport) appTransport.onMessage((message) => {
			if (require_sync_channel.isSystemMessage(message) && message.type === "query") {
				const queryMsg = message;
				const result = handleSyncQuery(appRenderer, {
					queryType: {
						boundingRect: require_sync_channel.QueryType.BoundingRect,
						computedStyle: require_sync_channel.QueryType.ComputedStyle,
						nodeProperty: require_sync_channel.QueryType.NodeProperty,
						windowProperty: require_sync_channel.QueryType.WindowProperty
					}[queryMsg.query] ?? require_sync_channel.QueryType.NodeProperty,
					data: JSON.stringify({
						nodeId: queryMsg.nodeId,
						property: queryMsg.property
					})
				});
				appTransport.send({
					type: "queryResult",
					uid: queryMsg.uid,
					result
				});
			}
		});
		threadManager.sendToThread(appId, {
			type: "init",
			appId,
			location: {
				hash: window.location.hash,
				href: window.location.href,
				port: window.location.port,
				host: window.location.host,
				origin: window.location.origin,
				hostname: window.location.hostname,
				pathname: window.location.pathname,
				protocol: window.location.protocol,
				search: window.location.search,
				state: window.history.state
			},
			sharedBuffer
		});
		return appId;
	}
	let devtoolsPanelHandle = null;
	if (config.debug?.exposeDevtools) {
		globalThis.__ASYNC_DOM_DEVTOOLS__ = {
			scheduler: {
				pending: () => scheduler.pendingCount,
				stats: () => scheduler.getStats(),
				frameLog: () => scheduler.getFrameLog(),
				flush: () => scheduler.flush()
			},
			getEventTraces: () => {
				const traces = [];
				for (const bridge of eventBridges.values()) traces.push(...bridge.getEventTraces());
				traces.sort((a, b) => a.timestamp - b.timestamp);
				return traces;
			},
			enableHighlightUpdates: (enabled) => {
				for (const r of renderers.values()) r.enableHighlightUpdates(enabled);
			},
			findRealNode: (nodeId) => {
				for (const r of renderers.values()) {
					const node = r.getNode(nodeId);
					if (node) return node;
				}
				return null;
			},
			apps: () => [...renderers.keys()],
			renderers: () => {
				const info = {};
				for (const [appId, r] of renderers) info[String(appId)] = { root: r.getRoot() };
				return info;
			},
			refreshDebugData: () => {
				for (const appId of renderers.keys()) requestDebugData(appId);
			},
			getAppData: (appId) => debugData.get(appId),
			getAllAppsData: () => {
				const result = {};
				for (const [appId, data] of debugData) result[String(appId)] = data;
				return result;
			}
		};
		if (typeof document !== "undefined") devtoolsPanelHandle = createDevtoolsPanel();
	}
	if (config.debug?.exposeDevtools) {
		const origOnMutation = debugHooks.onMutation;
		const origOnWarning = debugHooks.onWarning;
		debugHooks.onMutation = (entry) => {
			origOnMutation?.(entry);
			captureMutation(entry);
		};
		debugHooks.onWarning = (entry) => {
			origOnWarning?.(entry);
			captureWarning(entry);
		};
	}
	console.debug("[async-dom] Initialized", {
		apps: config.worker ? 1 : 0,
		debug: !!config.debug,
		scheduler: config.scheduler ?? "default"
	});
	const visibilityHandler = () => {
		threadManager.broadcast({
			type: "visibility",
			state: document.visibilityState
		});
	};
	document.addEventListener("visibilitychange", visibilityHandler);
	return {
		start() {
			scheduler.start();
		},
		stop() {
			scheduler.stop();
		},
		destroy() {
			scheduler.stop();
			scheduler.flush();
			for (const r of renderers.values()) r.clear();
			renderers.clear();
			lastRenderer = null;
			lastAppId = null;
			for (const bridge of eventBridges.values()) bridge.detachAll();
			for (const host of syncHosts.values()) host.stopPolling();
			syncHosts.clear();
			document.removeEventListener("visibilitychange", visibilityHandler);
			threadManager.destroyAll();
			if (devtoolsPanelHandle) {
				devtoolsPanelHandle.destroy();
				devtoolsPanelHandle = null;
			}
		},
		addApp(appConfig) {
			return addAppInternal(appConfig.worker, appConfig.mountPoint, appConfig.shadow, appConfig.transport, appConfig.onError);
		},
		removeApp(appId) {
			const bridge = eventBridges.get(appId);
			if (bridge) {
				bridge.detachAll();
				eventBridges.delete(appId);
			}
			const renderer = renderers.get(appId);
			if (renderer) {
				renderer.clear();
				renderers.delete(appId);
			}
			if (lastAppId === appId) {
				lastRenderer = null;
				lastAppId = null;
			}
			const host = syncHosts.get(appId);
			if (host) {
				host.stopPolling();
				syncHosts.delete(appId);
			}
			threadManager.destroyThread(appId);
			scheduler.setAppCount(renderers.size);
		}
	};
}
//#endregion
exports.BODY_NODE_ID = require_sync_channel.BODY_NODE_ID;
exports.BinaryWorkerSelfTransport = require_binary_worker_transport.BinaryWorkerSelfTransport;
exports.BinaryWorkerTransport = require_binary_worker_transport.BinaryWorkerTransport;
exports.DOCUMENT_NODE_ID = require_sync_channel.DOCUMENT_NODE_ID;
exports.DebugStats = require_sync_channel.DebugStats;
exports.DomRenderer = DomRenderer;
exports.EventBridge = EventBridge;
exports.FrameScheduler = FrameScheduler;
exports.HEAD_NODE_ID = require_sync_channel.HEAD_NODE_ID;
exports.HTML_NODE_ID = require_sync_channel.HTML_NODE_ID;
exports.ThreadManager = ThreadManager;
exports.WarningCode = require_sync_channel.WarningCode;
exports.WorkerSelfTransport = require_worker_transport.WorkerSelfTransport;
exports.WorkerTransport = require_worker_transport.WorkerTransport;
exports.createAppId = require_sync_channel.createAppId;
exports.createAsyncDom = createAsyncDom;
exports.createNodeId = require_sync_channel.createNodeId;
exports.decodeBinaryMessage = require_binary_worker_transport.decodeBinaryMessage;
exports.encodeBinaryMessage = require_binary_worker_transport.encodeBinaryMessage;
exports.sanitizeHTML = sanitizeHTML;

//# sourceMappingURL=index.cjs.map