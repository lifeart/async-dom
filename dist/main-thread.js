import { _ as WarningDescriptions, c as createAppId, f as isMutationMessage, g as WarningCode, h as MutationEventCorrelation, m as DebugStats, p as isSystemMessage, r as SyncChannelHost, t as QueryType, v as resolveDebugHooks } from "./sync-channel.js";
import { o as CRITICAL_QUEUE_SIZE, r as BinaryWorkerTransport, t as WebSocketTransport } from "./ws-transport.js";
import { n as WorkerTransport } from "./worker-transport.js";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
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
* Supports both forward (NodeId → Node) and reverse (Node → NodeId) lookups.
*/
var NodeCache = class {
	cache = /* @__PURE__ */ new Map();
	reverseCache = /* @__PURE__ */ new WeakMap();
	get(id) {
		if (id === 4) return document;
		return this.cache.get(id) ?? null;
	}
	/** Reverse lookup: get the NodeId for a real DOM node. */
	getId(node) {
		return this.reverseCache.get(node) ?? null;
	}
	set(id, node) {
		this.cache.set(id, node);
		this.reverseCache.set(node, id);
	}
	delete(id) {
		const node = this.cache.get(id);
		if (node) this.reverseCache.delete(node);
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
	droppedFrameCount = 0;
	lastWorkerToMainLatencyMs = 0;
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
	/** Record the cross-thread latency from a worker MutationMessage.sentAt */
	recordWorkerLatency(sentAt) {
		this.lastWorkerToMainLatencyMs = Math.max(0, Date.now() - sentAt);
	}
	getStats() {
		return {
			pending: this.queue.length,
			frameId: this.frameId,
			lastFrameTimeMs: this.timePerLastFrame,
			lastFrameActions: this.totalActionsLastFrame,
			isRunning: this.running,
			lastTickTime: this.lastTickTime,
			enqueueToApplyMs: this.lastTickTime > 0 && this.lastEnqueueTime > 0 ? Math.max(0, this.lastTickTime - this.lastEnqueueTime) : 0,
			droppedFrameCount: this.droppedFrameCount,
			workerToMainLatencyMs: this.lastWorkerToMainLatencyMs
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
		const perAppMutations = /* @__PURE__ */ new Map();
		const perAppDeferred = /* @__PURE__ */ new Map();
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
					const appKey = String(item.appId);
					perAppDeferred.set(appKey, (perAppDeferred.get(appKey) ?? 0) + 1);
					continue;
				}
				this.appBudgets.set(item.appId, appBudget + 1);
			}
			const actionStart = performance.now();
			applier(item.mutation, item.appId, item.batchUid);
			const actionTime = performance.now() - actionStart;
			{
				const appKey = String(item.appId);
				perAppMutations.set(appKey, (perAppMutations.get(appKey) ?? 0) + 1);
			}
			this.recordTiming(item.mutation.action, actionTime);
			frameTimingBreakdown.set(item.mutation.action, (frameTimingBreakdown.get(item.mutation.action) ?? 0) + actionTime);
			processed++;
		}
		if (cursor === this.queue.length) this.queue.length = 0;
		else if (cursor > 0) this.queue = this.queue.slice(cursor);
		if (deferred.length > 0) this.queue = deferred.concat(this.queue);
		const delta = performance.now() - start;
		if (processed > 0) {
			if (delta > this.frameBudgetMs) this.droppedFrameCount++;
			this.timePerLastFrame = delta;
			this.totalActionsLastFrame = processed;
			let perApp;
			if (perAppMutations.size > 0 || perAppDeferred.size > 0) {
				perApp = /* @__PURE__ */ new Map();
				const allApps = new Set([...perAppMutations.keys(), ...perAppDeferred.keys()]);
				for (const appKey of allApps) perApp.set(appKey, {
					mutations: perAppMutations.get(appKey) ?? 0,
					deferred: perAppDeferred.get(appKey) ?? 0
				});
			}
			this.frameLog.push({
				frameId: this.frameId,
				totalMs: delta,
				actionCount: processed,
				timingBreakdown: frameTimingBreakdown,
				perApp
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
		if (queueLen > 1500) return CRITICAL_QUEUE_SIZE;
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
//#region src/debug/causality-graph.ts
/**
* Build a causality DAG from batch records.
*/
function buildCausalityGraph(batches) {
	const nodes = /* @__PURE__ */ new Map();
	const roots = [];
	const eventMap = /* @__PURE__ */ new Map();
	const orphanBatches = [];
	for (const batch of batches) if (batch.causalEvent) {
		const eventKey = `event:${batch.causalEvent.eventType}:${batch.causalEvent.listenerId}:${batch.causalEvent.timestamp}`;
		if (!eventMap.has(eventKey)) eventMap.set(eventKey, []);
		eventMap.get(eventKey)?.push(batch);
	} else orphanBatches.push(batch);
	for (const [eventKey, eventBatches] of eventMap) {
		const evt = eventBatches[0].causalEvent;
		const eventNode = {
			type: "event",
			id: eventKey,
			label: `${evt.eventType} (${evt.listenerId})`,
			children: []
		};
		for (const batch of eventBatches) {
			const batchKey = `batch:${batch.batchUid}`;
			const batchNode = {
				type: "batch",
				id: batchKey,
				label: `Batch #${batch.batchUid} (${batch.mutationCount} muts)`,
				children: []
			};
			for (const nodeId of batch.nodeIds) {
				const nodeKey = `node:${nodeId}`;
				if (!nodes.has(nodeKey)) nodes.set(nodeKey, {
					type: "node",
					id: nodeKey,
					label: `#${nodeId}`,
					children: []
				});
				batchNode.children.push(nodeKey);
			}
			nodes.set(batchKey, batchNode);
			eventNode.children.push(batchKey);
		}
		nodes.set(eventKey, eventNode);
		roots.push(eventKey);
	}
	for (const batch of orphanBatches) {
		const batchKey = `batch:${batch.batchUid}`;
		const batchNode = {
			type: "batch",
			id: batchKey,
			label: `Batch #${batch.batchUid} (${batch.mutationCount} muts, no event)`,
			children: []
		};
		for (const nodeId of batch.nodeIds) {
			const nodeKey = `node:${nodeId}`;
			if (!nodes.has(nodeKey)) nodes.set(nodeKey, {
				type: "node",
				id: nodeKey,
				label: `#${nodeId}`,
				children: []
			});
			batchNode.children.push(nodeKey);
		}
		nodes.set(batchKey, batchNode);
		roots.push(batchKey);
	}
	return {
		nodes,
		roots
	};
}
/**
* Storage for causal batch records, maintained on the main thread.
*/
var CausalityTracker = class {
	batches = [];
	maxBatches = 100;
	/** Record a batch with its causal event */
	recordBatch(batchUid, nodeIds, mutationCount, causalEvent) {
		this.batches.push({
			batchUid,
			causalEvent,
			nodeIds: new Set(nodeIds),
			mutationCount,
			timestamp: Date.now()
		});
		if (this.batches.length > this.maxBatches) this.batches.shift();
	}
	/** Get all recorded batches */
	getBatches() {
		return this.batches.slice();
	}
	/** Build the DAG from recorded batches */
	buildGraph() {
		return buildCausalityGraph(this.batches);
	}
	/** Find batches that affected a given nodeId */
	findBatchesForNode(nodeId) {
		return this.batches.filter((b) => b.nodeIds.has(nodeId));
	}
	/** Clear all records */
	clear() {
		this.batches.length = 0;
	}
};
//#endregion
//#region src/debug/format-helpers.ts
/**
* Format a byte count into a human-readable string (B, KB, MB).
*/
function formatBytes(bytes) {
	if (bytes === 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
//#endregion
//#region src/debug/replay.ts
function createReplayState(entries) {
	return {
		entries: [...entries],
		currentIndex: 0,
		isPlaying: false
	};
}
function replayStep(state) {
	if (state.currentIndex >= state.entries.length) return null;
	return state.entries[state.currentIndex++];
}
function replaySeek(state, index) {
	state.currentIndex = Math.max(0, Math.min(index, state.entries.length));
}
function replayReset(state) {
	state.currentIndex = 0;
	state.isPlaying = false;
}
//#endregion
//#region src/debug/session-export.ts
function exportSession(data) {
	const session = {
		version: 1,
		exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
		...data
	};
	return JSON.stringify(session, replacer, 2);
}
function replacer(_key, value) {
	if (value instanceof Map) return Object.fromEntries(value);
	return value;
}
function importSession(json) {
	const raw = JSON.parse(json);
	if (!raw || typeof raw !== "object") throw new Error("Invalid session: not an object");
	if (raw.version !== 1) throw new Error(`Unsupported session version: ${raw.version}`);
	if (!Array.isArray(raw.mutationLog)) throw new Error("Invalid session: mutationLog must be an array");
	if (!Array.isArray(raw.warningLog)) throw new Error("Invalid session: warningLog must be an array");
	if (!Array.isArray(raw.eventLog)) throw new Error("Invalid session: eventLog must be an array");
	if (!Array.isArray(raw.syncReadLog)) throw new Error("Invalid session: syncReadLog must be an array");
	const MAX_ENTRIES = 1e4;
	if (raw.mutationLog.length > MAX_ENTRIES) raw.mutationLog = raw.mutationLog.slice(-MAX_ENTRIES);
	if (raw.warningLog.length > MAX_ENTRIES) raw.warningLog = raw.warningLog.slice(-MAX_ENTRIES);
	if (raw.eventLog.length > MAX_ENTRIES) raw.eventLog = raw.eventLog.slice(-MAX_ENTRIES);
	if (raw.syncReadLog.length > MAX_ENTRIES) raw.syncReadLog = raw.syncReadLog.slice(-MAX_ENTRIES);
	return raw;
}
function downloadJson(content, filename) {
	const blob = new Blob([content], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
//#endregion
//#region src/debug/stats-helpers.ts
/**
* Shared helper functions for devtools statistics computation.
* Extracted to a separate module for testability.
*/
/** Compute the value at a given percentile from a sorted array. */
function percentile(sorted, p) {
	if (sorted.length === 0) return 0;
	const idx = Math.ceil(p / 100 * sorted.length) - 1;
	return sorted[Math.max(0, idx)];
}
/** Compute P50, P95, P99 from an unsorted data array. */
function computePercentiles(data) {
	if (data.length === 0) return {
		p50: 0,
		p95: 0,
		p99: 0
	};
	const sorted = [...data].sort((a, b) => a - b);
	return {
		p50: percentile(sorted, 50),
		p95: percentile(sorted, 95),
		p99: percentile(sorted, 99)
	};
}
/** Color class for latency values: green/yellow/red. */
function latencyColorClass(ms) {
	if (ms > 16) return "red";
	if (ms > 5) return "yellow";
	return "green";
}
/** Color class for sync read latency values: green/yellow/red. */
function syncReadColorClass(ms) {
	if (ms > 50) return "red";
	if (ms > 5) return "yellow";
	return "green";
}
//#endregion
//#region src/debug/tree-diff.ts
/**
* Deep-clone a tree snapshot for immutable storage.
*/
function cloneSnapshot(node) {
	const clone = { type: node.type };
	if (node.tag !== void 0) clone.tag = node.tag;
	if (node.id !== void 0) clone.id = node.id;
	if (node.className !== void 0) clone.className = node.className;
	if (node.text !== void 0) clone.text = node.text;
	if (node.attributes) clone.attributes = { ...node.attributes };
	if (node.children) clone.children = node.children.map(cloneSnapshot);
	return clone;
}
/**
* Compare two tree snapshots and produce a diff tree.
*/
function diffTrees(oldTree, newTree) {
	if (!oldTree && !newTree) return null;
	if (!oldTree && newTree) return markAdded(newTree);
	if (oldTree && !newTree) return markRemoved(oldTree);
	return compareNodes(oldTree, newTree);
}
function markAdded(node) {
	const result = {
		diffType: "added",
		node
	};
	if (node.children) result.children = node.children.map(markAdded);
	return result;
}
function markRemoved(node) {
	const result = {
		diffType: "removed",
		node
	};
	if (node.children) result.children = node.children.map(markRemoved);
	return result;
}
function compareNodes(oldNode, newNode) {
	const changes = [];
	if (oldNode.type !== newNode.type || oldNode.tag !== newNode.tag) return {
		diffType: "changed",
		node: newNode,
		changes: ["replaced"],
		children: [markRemoved(oldNode), markAdded(newNode)]
	};
	if (oldNode.type === "element" && newNode.type === "element") {
		const oldAttrs = oldNode.attributes ?? {};
		const newAttrs = newNode.attributes ?? {};
		const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);
		for (const key of allKeys) if (oldAttrs[key] !== newAttrs[key]) changes.push(`attr:${key}`);
		if (oldNode.className !== newNode.className) changes.push("className");
	}
	if (oldNode.text !== newNode.text) changes.push("text");
	const diffChildren = diffChildArrays(oldNode.children ?? [], newNode.children ?? []);
	const result = {
		diffType: changes.length > 0 ? "changed" : "unchanged",
		node: newNode
	};
	if (changes.length > 0) result.changes = changes;
	if (diffChildren.length > 0) result.children = diffChildren;
	return result;
}
/**
* Diff two child arrays using node IDs for matching where possible.
*/
function diffChildArrays(oldChildren, newChildren) {
	const result = [];
	const oldById = /* @__PURE__ */ new Map();
	const oldNoId = [];
	for (const child of oldChildren) if (child.id != null) oldById.set(child.id, {
		node: child,
		used: false
	});
	else oldNoId.push(child);
	let noIdCursor = 0;
	for (const newChild of newChildren) if (newChild.id != null) {
		const oldEntry = oldById.get(newChild.id);
		if (oldEntry) {
			oldEntry.used = true;
			result.push(compareNodes(oldEntry.node, newChild));
		} else result.push(markAdded(newChild));
	} else if (noIdCursor < oldNoId.length) {
		result.push(compareNodes(oldNoId[noIdCursor], newChild));
		noIdCursor++;
	} else result.push(markAdded(newChild));
	for (const [, entry] of oldById) if (!entry.used) result.push(markRemoved(entry.node));
	for (let i = noIdCursor; i < oldNoId.length; i++) result.push(markRemoved(oldNoId[i]));
	return result;
}
/**
* Check if a diff tree has any actual changes.
*/
function hasChanges(diff) {
	if (diff.diffType !== "unchanged") return true;
	if (diff.children) return diff.children.some(hasChanges);
	return false;
}
//#endregion
//#region src/debug/devtools-panel.ts
const MAX_LOG_ENTRIES = 200;
const MAX_WARNING_ENTRIES = 200;
const MAX_EVENT_LOG_ENTRIES = 200;
const MAX_SYNC_READ_LOG_ENTRIES = 200;
const mutationLog = [];
const warningLog = [];
const eventLog = [];
const syncReadLog = [];
let warningBadgeCount = 0;
let onWarningBadgeUpdate = null;
let logPaused = false;
function captureMutation(entry) {
	if (logPaused) return;
	mutationLog.push(entry);
	if (mutationLog.length > MAX_LOG_ENTRIES) mutationLog.shift();
}
function captureEvent(entry) {
	if (logPaused) return;
	eventLog.push(entry);
	if (eventLog.length > MAX_EVENT_LOG_ENTRIES) eventLog.shift();
}
function captureSyncRead(entry) {
	if (logPaused) return;
	syncReadLog.push(entry);
	if (syncReadLog.length > MAX_SYNC_READ_LOG_ENTRIES) syncReadLog.shift();
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
	const importIndicator = document.createElement("span");
	importIndicator.className = "import-indicator";
	importIndicator.style.display = "none";
	headerTitle.appendChild(importIndicator);
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
	const exportBtn = document.createElement("button");
	exportBtn.className = "header-btn";
	exportBtn.textContent = "↓";
	exportBtn.title = "Export debug session";
	headerActions.appendChild(exportBtn);
	const importBtn = document.createElement("button");
	importBtn.className = "header-btn";
	importBtn.textContent = "↑";
	importBtn.title = "Import debug session";
	headerActions.appendChild(importBtn);
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
		"Warnings",
		"Graph"
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
	const logReplayBtn = document.createElement("button");
	logReplayBtn.className = "log-btn";
	logReplayBtn.textContent = "Replay";
	logToolbar.appendChild(logReplayBtn);
	logContent.appendChild(logToolbar);
	const replayBar = document.createElement("div");
	replayBar.className = "replay-bar";
	replayBar.style.display = "none";
	const replayFirstBtn = document.createElement("button");
	replayFirstBtn.className = "replay-btn";
	replayFirstBtn.textContent = "⏮";
	replayBar.appendChild(replayFirstBtn);
	const replayPrevBtn = document.createElement("button");
	replayPrevBtn.className = "replay-btn";
	replayPrevBtn.textContent = "◀";
	replayBar.appendChild(replayPrevBtn);
	const replayPlayBtn = document.createElement("button");
	replayPlayBtn.className = "replay-btn";
	replayPlayBtn.textContent = "▶";
	replayBar.appendChild(replayPlayBtn);
	const replayStepFwdBtn = document.createElement("button");
	replayStepFwdBtn.className = "replay-btn";
	replayStepFwdBtn.textContent = "▶❘";
	replayStepFwdBtn.title = "Step forward one entry";
	replayBar.appendChild(replayStepFwdBtn);
	const replayNextBtn = document.createElement("button");
	replayNextBtn.className = "replay-btn";
	replayNextBtn.textContent = "⏭";
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
	replayExitBtn.textContent = "✕ Exit";
	replayBar.appendChild(replayExitBtn);
	const logList = document.createElement("div");
	logList.className = "log-list";
	logList.innerHTML = "<div class=\"log-empty\">No mutations captured yet.</div>";
	logContent.appendChild(logList);
	logContent.insertBefore(replayBar, logList);
	tabPanels.Log = logContent;
	panel.appendChild(logContent);
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
	warnList.innerHTML = "<div class=\"warn-empty\">No warnings captured yet.</div>";
	warnContent.appendChild(warnList);
	tabPanels.Warnings = warnContent;
	panel.appendChild(warnContent);
	const graphContent = document.createElement("div");
	graphContent.className = "tab-content";
	graphContent.innerHTML = "<div class=\"graph-empty\">No causality data yet. Interact with the app to generate event-mutation data.</div>";
	tabPanels.Graph = graphContent;
	panel.appendChild(graphContent);
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
	const latencyHistory = [];
	const MAX_LATENCY_HISTORY = 60;
	let replayState = null;
	let replayTimer = null;
	let replaySpeedMultiplier = 1;
	const REPLAY_SPEEDS = [
		1,
		2,
		5
	];
	let importedSession = null;
	let snapshot1 = null;
	let snapshot2 = null;
	let showDiff = false;
	let currentDiff = null;
	function updateReplayUI() {
		if (!replayState) return;
		replaySlider.max = String(replayState.entries.length);
		replaySlider.value = String(replayState.currentIndex);
		replayPosition.textContent = `${replayState.currentIndex} / ${replayState.entries.length}`;
		replayPlayBtn.textContent = replayState.isPlaying ? "⏸" : "▶";
		replayPlayBtn.classList.toggle("active", replayState.isPlaying);
	}
	function enterReplayMode() {
		if (importedSession) return;
		replayState = createReplayState(mutationLog);
		replayBar.style.display = "flex";
		logReplayBtn.classList.add("active");
		updateReplayUI();
		renderLogTab();
	}
	function exitReplayMode() {
		if (replayTimer) {
			clearInterval(replayTimer);
			replayTimer = null;
		}
		if (replayState) {
			replayState.isPlaying = false;
			replayState = null;
		}
		replayBar.style.display = "none";
		logReplayBtn.classList.remove("active");
		renderLogTab();
	}
	function applyReplayMutation(entry) {
		const dt = getDevtools();
		if (!dt?.replayMutation) return;
		const appId = dt.apps()[0];
		if (appId) dt.replayMutation(entry.mutation, appId);
	}
	function clearAndReapplyUpTo(index) {
		if (!replayState) return;
		const dt = getDevtools();
		if (!dt?.clearAndReapply) return;
		dt.clearAndReapply(replayState.entries, index);
	}
	function replayStepForwardOne() {
		if (!replayState) return;
		const entry = replayStep(replayState);
		if (entry) applyReplayMutation(entry);
		updateReplayUI();
		renderLogTab();
	}
	function replayStepBackward() {
		if (!replayState) return;
		if (replayState.currentIndex > 0) {
			replaySeek(replayState, replayState.currentIndex - 1);
			clearAndReapplyUpTo(replayState.currentIndex);
		}
		updateReplayUI();
		renderLogTab();
	}
	function replayGoToStart() {
		if (!replayState) return;
		replayReset(replayState);
		clearAndReapplyUpTo(0);
		updateReplayUI();
		renderLogTab();
	}
	function replayGoToEnd() {
		if (!replayState) return;
		replaySeek(replayState, replayState.entries.length);
		clearAndReapplyUpTo(replayState.entries.length);
		updateReplayUI();
		renderLogTab();
	}
	function toggleReplayPlay() {
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
		} else if (replayTimer) {
			clearInterval(replayTimer);
			replayTimer = null;
		}
		updateReplayUI();
	}
	function cycleReplaySpeed() {
		replaySpeedMultiplier = REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(replaySpeedMultiplier) + 1) % REPLAY_SPEEDS.length];
		replaySpeedBtn.textContent = `${replaySpeedMultiplier}x`;
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
		clearAndReapplyUpTo(replayState.currentIndex);
		updateReplayUI();
		renderLogTab();
	});
	replaySpeedBtn.addEventListener("click", cycleReplaySpeed);
	replayExitBtn.addEventListener("click", exitReplayMode);
	exportBtn.addEventListener("click", () => {
		const dt = getDevtools();
		const schedulerStats = dt?.scheduler?.stats() ?? {};
		const allData = dt?.getAllAppsData() ?? {};
		const firstAppData = Object.values(allData)[0];
		downloadJson(exportSession({
			mutationLog: importedSession ? importedSession.mutationLog : [...mutationLog],
			warningLog: importedSession ? importedSession.warningLog : [...warningLog],
			eventLog: importedSession ? importedSession.eventLog : [...eventLog],
			syncReadLog: importedSession ? importedSession.syncReadLog : [...syncReadLog],
			schedulerStats,
			tree: firstAppData?.tree,
			appData: allData
		}), `async-dom-session-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
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
					enterImportMode(importSession(reader.result));
				} catch (err) {
					console.error("[async-dom devtools] Import failed:", err);
				}
			};
			reader.readAsText(file);
		});
		input.click();
	});
	function setImportControlsDisabled(disabled) {
		logClearBtn.disabled = disabled;
		logPauseBtn.disabled = disabled;
		logAutoScrollBtn.disabled = disabled;
		logReplayBtn.disabled = disabled;
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
	function enterImportMode(session) {
		importedSession = session;
		if (replayState) exitReplayMode();
		importIndicator.textContent = "[IMPORTED]";
		importIndicator.style.display = "inline";
		setImportControlsDisabled(true);
		let closeImportBtn = headerActions.querySelector(".close-import-btn");
		if (!closeImportBtn) {
			closeImportBtn = document.createElement("button");
			closeImportBtn.className = "header-btn close-import-btn";
			closeImportBtn.textContent = "✕";
			closeImportBtn.title = "Close imported session";
			closeImportBtn.style.color = "#d7ba7d";
			closeImportBtn.addEventListener("click", exitImportMode);
			headerActions.insertBefore(closeImportBtn, headerActions.firstChild);
		}
		renderActiveTab();
	}
	function exitImportMode() {
		importedSession = null;
		importIndicator.style.display = "none";
		importIndicator.textContent = "";
		setImportControlsDisabled(false);
		const closeImportBtn = headerActions.querySelector(".close-import-btn");
		if (closeImportBtn) closeImportBtn.remove();
		renderActiveTab();
	}
	function updateHealthDot() {
		const dt = getDevtools();
		if (!dt?.scheduler?.stats) return;
		const stats = dt.scheduler.stats();
		const pending = stats.pending;
		if (pending > 1e3 || !stats.isRunning || stats.lastFrameTimeMs > 16) healthDot.style.backgroundColor = "#f44747";
		else if (pending > 100 || stats.lastFrameTimeMs > 12) healthDot.style.backgroundColor = "#d7ba7d";
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
	/** Reset UI state that is specific to a particular app when switching apps. */
	function resetPerAppState() {
		snapshot1 = null;
		snapshot2 = null;
		showDiff = false;
		currentDiff = null;
		selectedNodeForSidebar = null;
		showCoalesced = false;
		lastRenderedLogLength = 0;
		if (replayState) exitReplayMode();
		expandedFrameId = null;
	}
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
	function renderActiveTab() {
		if (activeTab === "Tree") renderTreeTab();
		else if (activeTab === "Performance") renderPerfTab();
		else if (activeTab === "Log") renderLogTab();
		else if (activeTab === "Warnings") renderWarningsTab();
		else if (activeTab === "Graph") renderGraphTab();
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
			} else for (const listener of listeners) {
				const listenerDiv = document.createElement("div");
				listenerDiv.className = "sidebar-listener";
				listenerDiv.innerHTML = `<span class="sidebar-listener-event">${escapeHtml(listener.eventName)}</span><span class="sidebar-listener-id">${escapeHtml(listener.listenerId)}</span>`;
				sidebar.appendChild(listenerDiv);
			}
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
		if (dt && node.id != null) {
			const realNode = dt.findRealNode(node.id);
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
					"zIndex"
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
						row.innerHTML = `<span class="sidebar-key">${escapeHtml(prop)}</span><span class="sidebar-val sidebar-computed-val">${escapeHtml(truncate(val, 24))}</span>`;
						sidebar.appendChild(row);
					}
				}
			}
		}
		if (node.id != null) {
			const nodeId = node.id;
			const recentMuts = mutationLog.filter((entry) => {
				return entry.mutation.id === nodeId;
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
					const m = entry.mutation;
					let detail = "";
					if (m.name) detail += ` ${m.name}`;
					if (m.property) detail += ` .${m.property}`;
					if (m.value !== void 0) detail += `="${truncate(String(m.value), 20)}"`;
					if (m.tag) detail += ` <${m.tag}>`;
					if (m.textContent !== void 0) detail += ` "${truncate(String(m.textContent), 20)}"`;
					if (m.childId !== void 0) detail += ` child:${m.childId}`;
					const div = document.createElement("div");
					div.className = "sidebar-mutation";
					div.innerHTML = `<span class="sidebar-mut-time">${formatTime(entry.timestamp)}</span> <span class="sidebar-mut-action">${escapeHtml(entry.action)}</span>` + (detail ? `<br><span style="color:#808080;font-size:9px;padding-left:4px">${escapeHtml(detail.trim())}</span>` : "");
					sidebar.appendChild(div);
				}
			}
		}
		if (node.id != null) {
			const nodeId = node.id;
			const dt2 = getDevtools();
			if (dt2?.getMutationCorrelation) {
				const whyEntries = dt2.getMutationCorrelation().getWhyUpdated(nodeId);
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
						let html = `<span class="why-chain-mutation">${escapeHtml(entry.action)}</span>`;
						if (entry.batchUid != null) {
							html += `<span class="why-chain-arrow">\u2192</span>`;
							html += `<span class="why-chain-batch">Batch #${entry.batchUid}</span>`;
						}
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
	function renderTreeTab() {
		if (importedSession) {
			if (importedSession.tree) {
				const tree = importedSession.tree;
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
				const sidebar = document.createElement("div");
				sidebar.className = "node-sidebar";
				const fakeDt = getDevtools();
				if (fakeDt) buildTreeDOM(treeMain, tree, 0, true, fakeDt, sidebar);
				layout.appendChild(treeMain);
				layout.appendChild(sidebar);
				treeContent.innerHTML = "";
				treeContent.appendChild(layout);
			} else treeContent.innerHTML = "<div class=\"tree-empty\">Imported session has no tree data.</div>";
			return;
		}
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
		const snapshotBar = document.createElement("div");
		snapshotBar.className = "snapshot-bar";
		const snapshotBtn = document.createElement("button");
		snapshotBtn.className = "snapshot-btn";
		snapshotBtn.textContent = snapshot1 ? snapshot2 ? "Reset Snapshots" : "Snapshot B" : "Snapshot A";
		snapshotBtn.addEventListener("click", () => {
			if (snapshot1 && snapshot2) {
				snapshot1 = null;
				snapshot2 = null;
				showDiff = false;
				currentDiff = null;
			} else if (!snapshot1) snapshot1 = cloneSnapshot(tree);
			else snapshot2 = cloneSnapshot(tree);
			renderTreeTab();
		});
		snapshotBar.appendChild(snapshotBtn);
		if (snapshot1 && snapshot2) {
			const diffBtn = document.createElement("button");
			diffBtn.className = "snapshot-btn";
			diffBtn.textContent = showDiff ? "Hide Diff" : "Show Diff";
			diffBtn.addEventListener("click", () => {
				showDiff = !showDiff;
				if (showDiff) currentDiff = diffTrees(snapshot1, snapshot2);
				else currentDiff = null;
				renderTreeTab();
			});
			snapshotBar.appendChild(diffBtn);
		}
		const snapshotInfo = document.createElement("span");
		snapshotInfo.className = "snapshot-info";
		if (snapshot1 && snapshot2) {
			snapshotInfo.textContent = "2 snapshots captured";
			if (showDiff && currentDiff) snapshotInfo.textContent += hasChanges(currentDiff) ? " (changes found)" : " (no changes)";
		} else if (snapshot1) snapshotInfo.textContent = "1 snapshot captured";
		snapshotBar.appendChild(snapshotInfo);
		treeMain.appendChild(snapshotBar);
		const statusLine = document.createElement("div");
		statusLine.className = "tree-refresh-bar";
		const statusText = document.createElement("span");
		statusText.className = "tree-status";
		statusText.textContent = `Virtual DOM for app: ${targetAppId}`;
		statusLine.appendChild(statusText);
		treeMain.appendChild(statusLine);
		const sidebar = document.createElement("div");
		sidebar.className = "node-sidebar";
		if (showDiff && currentDiff) buildDiffTreeDOM(treeMain, currentDiff, 0, true, dt, sidebar);
		else buildTreeDOM(treeMain, tree, 0, true, dt, sidebar);
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
	function buildDiffTreeDOM(parent, diff, depth, expanded, dt, sidebar) {
		const node = diff.node;
		const wrapper = document.createElement("div");
		wrapper.className = `tree-node${expanded ? " expanded" : ""}`;
		const line = document.createElement("div");
		line.className = "tree-line";
		line.style.paddingLeft = `${depth * 14}px`;
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
		const toggleEl = document.createElement("span");
		toggleEl.className = "tree-toggle";
		toggleEl.textContent = hasChildren ? expanded ? "▼" : "▶" : " ";
		line.appendChild(toggleEl);
		const tag = (node.tag ?? "???").toLowerCase();
		const tagSpan = document.createElement("span");
		let html = `<span class="tree-tag">&lt;${escapeHtml(tag)}</span>`;
		const attrs = node.attributes ?? {};
		if (attrs.id) html += ` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${escapeHtml(attrs.id)}"</span>`;
		if (node.className) html += ` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${escapeHtml(truncate(node.className, 30))}"</span>`;
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
		if (hasChildren) toggleEl.addEventListener("click", (e) => {
			e.stopPropagation();
			wrapper.classList.toggle("expanded");
			toggleEl.textContent = wrapper.classList.contains("expanded") ? "▼" : "▶";
		});
		wrapper.appendChild(line);
		if (hasChildren) {
			const childrenDiv = document.createElement("div");
			childrenDiv.className = "tree-children";
			for (const child of children) buildDiffTreeDOM(childrenDiv, child, depth + 1, depth < 2, dt, sidebar);
			wrapper.appendChild(childrenDiv);
		}
		parent.appendChild(wrapper);
	}
	function appendDiffMarker(line, diff) {
		if (diff.diffType === "unchanged") return;
		const marker = document.createElement("span");
		marker.className = `diff-marker ${diff.diffType}`;
		if (diff.diffType === "added") marker.textContent = "+ADD";
		else if (diff.diffType === "removed") marker.textContent = "-DEL";
		else if (diff.diffType === "changed") marker.textContent = `~${(diff.changes ?? []).join(",")}`;
		line.appendChild(marker);
	}
	function renderPerfTab() {
		if (importedSession) {
			const ss = importedSession.schedulerStats;
			let html = "<div class=\"perf-section-title\">Imported Session (read-only)</div>";
			for (const [key, val] of Object.entries(ss)) html += `<div class="perf-row"><span class="perf-label">${escapeHtml(String(key))}</span><span class="perf-value">${escapeHtml(String(val))}</span></div>`;
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
			perfContent.innerHTML = "<div class=\"perf-row\"><span class=\"perf-label\">Devtools API not available.</span></div>";
			return;
		}
		const stats = dt.scheduler.stats();
		const pending = stats.pending;
		queueHistory.push(pending);
		if (queueHistory.length > MAX_HISTORY) queueHistory.shift();
		let html = "";
		html += "<div class=\"perf-section-title\">Scheduler<button class=\"flush-btn\" id=\"flush-btn\">⏩ Flush</button></div>";
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
		const workerLatencyMs = stats.workerToMainLatencyMs;
		if (workerLatencyMs > 0) {
			latencyHistory.push(workerLatencyMs);
			if (latencyHistory.length > MAX_LATENCY_HISTORY) latencyHistory.shift();
		}
		const workerLatencyClass = latencyColorClass(workerLatencyMs);
		html += `<div class="perf-row"><span class="perf-label">Worker\u2192Main</span><span class="perf-value ${workerLatencyClass}">${workerLatencyMs > 0 ? `${workerLatencyMs.toFixed(1)}ms` : "N/A"}</span></div>`;
		const enqueueLatencyMs = stats.enqueueToApplyMs;
		const enqueueLatencyClass = latencyColorClass(enqueueLatencyMs);
		html += `<div class="perf-row"><span class="perf-label">Enqueue\u2192Apply</span><span class="perf-value ${enqueueLatencyClass}">${enqueueLatencyMs > 0 ? `${enqueueLatencyMs.toFixed(1)}ms` : "N/A"}</span></div>`;
		if (latencyHistory.length > 0) {
			const pcts = computePercentiles(latencyHistory);
			html += `<div class="perf-row"><span class="perf-label">Latency P50</span><span class="perf-value ${latencyColorClass(pcts.p50)}">${pcts.p50.toFixed(1)}ms</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Latency P95</span><span class="perf-value ${latencyColorClass(pcts.p95)}">${pcts.p95.toFixed(1)}ms</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Latency P99</span><span class="perf-value ${latencyColorClass(pcts.p99)}">${pcts.p99.toFixed(1)}ms</span></div>`;
		}
		if (latencyHistory.length > 1) html += `<div class="perf-row"><span class="perf-label">Latency (${MAX_LATENCY_HISTORY})</span><span class="perf-sparkline">${sparkline(latencyHistory)}</span></div>`;
		const droppedFrames = stats.droppedFrameCount;
		html += `<div class="perf-row"><span class="perf-label">Dropped Frames</span><span class="perf-value ${droppedFrames > 0 ? "red" : "green"}">${droppedFrames}</span></div>`;
		if (queueHistory.length > 1) html += `<div class="perf-row"><span class="perf-label">Queue (${MAX_HISTORY}f)</span><span class="sparkline-with-threshold"><span class="perf-sparkline">${sparkline(queueHistory)}</span><span class="sparkline-threshold"></span></span></div>`;
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
		if (dt.debugStats) {
			const ds = dt.debugStats();
			html += "<div class=\"perf-section-title\">Main Thread Stats</div>";
			for (const [key, label] of [
				["mutationsAdded", "Mutations Added"],
				["mutationsCoalesced", "Mutations Coalesced"],
				["mutationsFlushed", "Mutations Flushed"],
				["mutationsApplied", "Mutations Applied"],
				["eventsForwarded", "Events Forwarded"],
				["eventsDispatched", "Events Dispatched"],
				["syncReadRequests", "Sync Read Requests"],
				["syncReadTimeouts", "Sync Read Timeouts"]
			]) {
				const val = ds[key] ?? 0;
				const valClass = key === "syncReadTimeouts" && val > 0 ? "red" : "";
				html += `<div class="perf-row"><span class="perf-label">${escapeHtml(label)}</span><span class="perf-value ${valClass}">${val}</span></div>`;
			}
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
		if (dt.getWorkerPerfEntries) {
			const allPerfEntries = dt.getWorkerPerfEntries();
			const appIds16 = Object.keys(allPerfEntries);
			for (const appId16 of appIds16) {
				const entries = allPerfEntries[appId16];
				if (!entries || entries.length === 0) continue;
				html += `<div class="perf-section-title">Worker CPU: ${escapeHtml(appId16)}</div>`;
				const totalDuration = entries.reduce((s, e) => s + e.duration, 0);
				const maxDuration = Math.max(...entries.map((e) => e.duration));
				const eventEntries = entries.filter((e) => e.name.includes(":event:"));
				const flushEntries = entries.filter((e) => e.name.includes(":flush:"));
				const eventTotal = eventEntries.reduce((s, e) => s + e.duration, 0);
				const flushTotal = flushEntries.reduce((s, e) => s + e.duration, 0);
				html += `<div class="worker-util"><span class="worker-util-label">Total worker time: </span><span class="worker-util-value">${totalDuration.toFixed(1)}ms</span></div>`;
				html += `<div class="worker-util"><span class="worker-util-label">Event handlers: </span><span class="worker-util-value">${eventTotal.toFixed(1)}ms (${eventEntries.length} calls)</span></div>`;
				html += `<div class="worker-util"><span class="worker-util-label">Flush/coalesce: </span><span class="worker-util-value">${flushTotal.toFixed(1)}ms (${flushEntries.length} calls)</span></div>`;
				const topEntries = entries.slice().sort((a, b) => b.duration - a.duration).slice(0, 10);
				for (const entry of topEntries) {
					const pct = maxDuration > 0 ? Math.max(entry.duration / maxDuration * 100, 2) : 0;
					const shortName = entry.name.replace("async-dom:", "");
					html += `<div class="worker-perf-bar">`;
					html += `<span class="worker-perf-name" title="${escapeHtml(entry.name)}">${escapeHtml(shortName)}</span>`;
					html += `<span class="worker-perf-track"><span class="worker-perf-fill" style="width:${pct.toFixed(1)}%"></span></span>`;
					html += `<span class="worker-perf-duration">${entry.duration.toFixed(2)}ms</span>`;
					html += `</div>`;
				}
			}
		}
		if (frameLog.length > 0) {
			const framesWithPerApp = frameLog.filter((f) => f.perApp && f.perApp.size > 0);
			if (framesWithPerApp.length > 0) {
				html += "<div class=\"perf-section-title\">Multi-App Interleaving</div>";
				const allAppIds18 = /* @__PURE__ */ new Set();
				for (const frame of framesWithPerApp) if (frame.perApp) for (const key of frame.perApp.keys()) allAppIds18.add(key);
				const appColors18 = /* @__PURE__ */ new Map();
				const palette = [
					"#569cd6",
					"#4ec9b0",
					"#d7ba7d",
					"#c586c0",
					"#f44747",
					"#ce9178",
					"#6a9955"
				];
				let colorIdx = 0;
				for (const appKey of allAppIds18) {
					appColors18.set(appKey, palette[colorIdx % palette.length]);
					colorIdx++;
				}
				html += "<div class=\"multiapp-legend\">";
				for (const [appKey, color] of appColors18) html += `<span class="multiapp-legend-item"><span class="multiapp-legend-dot" style="background:${color}"></span>${escapeHtml(appKey)}</span>`;
				html += "</div>";
				for (const frame of framesWithPerApp.slice(-20)) {
					const perApp = frame.perApp;
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
						const pct = data.mutations / totalMuts * 100;
						const color = appColors18.get(appKey) ?? "#569cd6";
						html += `<span class="multiapp-segment" style="width:${pct.toFixed(1)}%;background:${color}" title="${escapeHtml(appKey)}: ${data.mutations} muts, ${data.deferred} deferred"></span>`;
					}
					html += `</span>`;
					html += `<span class="multiapp-info">${totalMuts} muts${totalDeferred > 0 ? ` (${totalDeferred} def)` : ""}</span>`;
					html += `</div>`;
				}
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
		if (syncReadLog.length > 0) {
			const totalReads = syncReadLog.length;
			const timeouts = syncReadLog.filter((e) => e.result === "timeout").length;
			const timeoutRate = totalReads > 0 ? (timeouts / totalReads * 100).toFixed(1) : "0.0";
			const syncPcts = computePercentiles(syncReadLog.map((e) => e.latencyMs));
			html += "<div class=\"perf-section-title\">Sync Reads</div>";
			html += `<div class="perf-row"><span class="perf-label">Total</span><span class="perf-value">${totalReads}</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">Timeout Rate</span><span class="perf-value ${timeouts > 0 ? "red" : "green"}">${timeoutRate}% (${timeouts})</span></div>`;
			html += `<div class="perf-row"><span class="perf-label">P95 Latency</span><span class="perf-value ${syncReadColorClass(syncPcts.p95)}">${syncPcts.p95.toFixed(1)}ms</span></div>`;
			html += "<div class=\"heatmap-container\">";
			const recentReads = syncReadLog.slice(-100);
			const queryNames = [
				"boundingRect",
				"computedStyle",
				"nodeProperty",
				"windowProperty"
			];
			for (let i = 0; i < recentReads.length; i++) {
				const entry = recentReads[i];
				const colorCls = syncReadColorClass(entry.latencyMs);
				const queryName = queryNames[entry.queryType] ?? `query:${entry.queryType}`;
				html += `<div class="heatmap-block ${colorCls}" data-sync-read-idx="${i}" title="${entry.latencyMs.toFixed(1)}ms ${queryName} node=${entry.nodeId} ${entry.result}"></div>`;
			}
			html += "</div>";
		}
		if (dt.getTransportStats) {
			const transportStats = dt.getTransportStats();
			const appIds = Object.keys(transportStats);
			if (appIds.length > 0) {
				html += "<div class=\"perf-section-title\">Transport</div>";
				for (const appId of appIds) {
					const ts = transportStats[appId];
					if (!ts) continue;
					if (appIds.length > 1) html += `<div class="perf-row"><span class="perf-label" style="font-weight:600">App: ${escapeHtml(appId)}</span><span class="perf-value"></span></div>`;
					html += `<div class="perf-row"><span class="perf-label">Messages Sent</span><span class="perf-value">${ts.messageCount}</span></div>`;
					html += `<div class="perf-row"><span class="perf-label">Total Bytes</span><span class="perf-value">${formatBytes(ts.totalBytes)}</span></div>`;
					const avgBytes = ts.messageCount > 0 ? Math.round(ts.totalBytes / ts.messageCount) : 0;
					html += `<div class="perf-row"><span class="perf-label">Avg Message Size</span><span class="perf-value">${formatBytes(avgBytes)}</span></div>`;
					const largestClass = ts.largestMessageBytes > 102400 ? "red" : "";
					const largestWarn = ts.largestMessageBytes > 102400 ? "<span class=\"transport-warn\">[!] exceeds 100KB</span>" : "";
					html += `<div class="perf-row"><span class="perf-label">Largest Message</span><span class="perf-value ${largestClass}">${formatBytes(ts.largestMessageBytes)}${largestWarn}</span></div>`;
					const lastClass = ts.lastMessageBytes > 102400 ? "red" : "";
					const lastWarn = ts.lastMessageBytes > 102400 ? "<span class=\"transport-warn\">[!] exceeds 100KB</span>" : "";
					html += `<div class="perf-row"><span class="perf-label">Last Message</span><span class="perf-value ${lastClass}">${formatBytes(ts.lastMessageBytes)}${lastWarn}</span></div>`;
				}
			}
		}
		perfContent.innerHTML = html;
		const heatmapBlocks = perfContent.querySelectorAll(".heatmap-block");
		const queryNamesForClick = [
			"boundingRect",
			"computedStyle",
			"nodeProperty",
			"windowProperty"
		];
		for (const block of heatmapBlocks) block.addEventListener("click", (e) => {
			const el = e.currentTarget;
			const existing = el.querySelector(".heatmap-tooltip");
			if (existing) {
				existing.remove();
				return;
			}
			for (const b of heatmapBlocks) {
				const tip = b.querySelector(".heatmap-tooltip");
				if (tip) tip.remove();
			}
			const idx = Number(el.dataset.syncReadIdx);
			const entry = syncReadLog.slice(-100)[idx];
			if (!entry) return;
			const queryName = queryNamesForClick[entry.queryType] ?? `query:${entry.queryType}`;
			const tooltip = document.createElement("div");
			tooltip.className = "heatmap-tooltip";
			tooltip.textContent = `${queryName} node=${entry.nodeId} ${entry.latencyMs.toFixed(1)}ms ${entry.result}`;
			el.appendChild(tooltip);
		});
		const flushBtn = perfContent.querySelector("#flush-btn");
		if (flushBtn) flushBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const dtf = getDevtools();
			if (dtf) dtf.scheduler.flush();
			renderPerfTab();
		});
		const frameRows = perfContent.querySelectorAll(".frame-bar-row");
		for (const row of frameRows) row.addEventListener("click", () => {
			const fid = Number(row.dataset.frameId);
			expandedFrameId = expandedFrameId === fid ? null : fid;
			renderPerfTab();
		});
	}
	function renderGraphTab() {
		const dt = getDevtools();
		if (!dt?.getCausalityTracker) {
			graphContent.innerHTML = "<div class=\"graph-empty\">Causality tracker not available.</div>";
			return;
		}
		const graph = dt.getCausalityTracker().buildGraph();
		if (graph.roots.length === 0) {
			graphContent.innerHTML = "<div class=\"graph-empty\">No causality data yet. Interact with the app to generate event-to-mutation data.</div>";
			return;
		}
		graphContent.innerHTML = "";
		const container = document.createElement("div");
		container.className = "graph-container";
		for (const rootId of graph.roots) renderGraphNode(container, graph, rootId, 0);
		graphContent.appendChild(container);
	}
	function renderGraphNode(parent, graph, nodeId, depth) {
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
		if (node.children.length > 0) {
			const childrenDiv = document.createElement("div");
			childrenDiv.className = "graph-children";
			for (const childId of node.children) renderGraphNode(childrenDiv, graph, childId, depth + 1);
			parent.appendChild(childrenDiv);
		}
	}
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
		const activeMutationLog = importedSession ? importedSession.mutationLog : mutationLog;
		const activeEventLog = importedSession ? importedSession.eventLog : eventLog;
		const activeSyncReadLog = importedSession ? importedSession.syncReadLog : syncReadLog;
		const displayMutations = replayState ? replayState.entries.slice(0, replayState.currentIndex) : activeMutationLog;
		logCountSpan.textContent = String(displayMutations.length);
		if (displayMutations.length === 0) {
			if (lastRenderedLogLength !== 0 || replayState) {
				logList.innerHTML = `<div class="log-empty">${replayState ? "Replay position: 0. Step forward to see mutations." : "No mutations captured yet."}</div>`;
				lastRenderedLogLength = 0;
			}
			return;
		}
		const filterText = logFilter.value.toLowerCase().trim();
		const fragment = document.createDocumentFragment();
		const groups = [];
		let currentGroup = null;
		for (const entry of displayMutations) {
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
		if (replayState && replayState.currentIndex > 0) {
			const allLogEntries = logList.querySelectorAll(".log-entry");
			const targetIdx = replayState.currentIndex - 1;
			if (targetIdx < allLogEntries.length) {
				allLogEntries[targetIdx].classList.add("replay-highlight");
				allLogEntries[targetIdx].scrollIntoView({ block: "nearest" });
			}
		}
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
				let maxTotalMs = 1;
				for (const trace of recent) {
					const total = trace.serializeMs + (trace.transportMs ?? 0) + (trace.dispatchMs ?? 0);
					if (total > maxTotalMs) maxTotalMs = total;
				}
				for (const trace of recent) {
					const serMs = trace.serializeMs;
					const trnMs = trace.transportMs ?? 0;
					const dspMs = trace.dispatchMs ?? 0;
					const mutCount = trace.mutationCount ?? mutationLog.filter((m) => m.timestamp >= trace.timestamp && m.timestamp <= trace.timestamp + 100).length;
					const totalMs = serMs + trnMs + dspMs;
					const scale = 120 / (maxTotalMs || 1);
					const row = document.createElement("div");
					row.className = "event-timeline";
					const typeLabel = document.createElement("span");
					typeLabel.className = "event-trace-type";
					typeLabel.style.cssText = "width:60px;flex-shrink:0;font-size:10px;overflow:hidden;text-overflow:ellipsis;";
					typeLabel.textContent = `[${trace.eventType}]`;
					row.appendChild(typeLabel);
					const serBar = document.createElement("span");
					serBar.className = "event-phase serialize";
					serBar.style.width = `${Math.max(serMs * scale, 4)}px`;
					serBar.title = `serialize: ${serMs.toFixed(1)}ms`;
					row.appendChild(serBar);
					const serLabel = document.createElement("span");
					serLabel.className = "event-phase-label";
					serLabel.textContent = `${serMs.toFixed(1)}ms`;
					row.appendChild(serLabel);
					const arrow1 = document.createElement("span");
					arrow1.className = "event-phase-label";
					arrow1.textContent = "→";
					row.appendChild(arrow1);
					const trnBar = document.createElement("span");
					trnBar.className = "event-phase transport";
					trnBar.style.width = `${Math.max(trnMs * scale, 4)}px`;
					trnBar.title = `transport: ${trnMs.toFixed(1)}ms`;
					row.appendChild(trnBar);
					const trnLabel = document.createElement("span");
					trnLabel.className = "event-phase-label";
					trnLabel.textContent = `${trnMs.toFixed(1)}ms`;
					row.appendChild(trnLabel);
					const arrow2 = document.createElement("span");
					arrow2.className = "event-phase-label";
					arrow2.textContent = "→";
					row.appendChild(arrow2);
					const dspBar = document.createElement("span");
					dspBar.className = "event-phase dispatch";
					dspBar.style.width = `${Math.max(dspMs * scale, 4)}px`;
					dspBar.title = `dispatch: ${dspMs.toFixed(1)}ms`;
					row.appendChild(dspBar);
					const dspLabel = document.createElement("span");
					dspLabel.className = "event-phase-label";
					dspLabel.textContent = `${dspMs.toFixed(1)}ms`;
					row.appendChild(dspLabel);
					if (mutCount > 0) {
						const arrow3 = document.createElement("span");
						arrow3.className = "event-phase-label";
						arrow3.textContent = "→";
						row.appendChild(arrow3);
						const mutSpan = document.createElement("span");
						mutSpan.className = "event-mutation-count";
						mutSpan.textContent = `${mutCount} mut${mutCount !== 1 ? "s" : ""}`;
						row.appendChild(mutSpan);
					}
					const detail = document.createElement("div");
					detail.className = "event-timeline-detail";
					detail.innerHTML = `<div><strong>${escapeHtml(trace.eventType)}</strong> total: ${totalMs.toFixed(1)}ms</div><div>main:serialize ${serMs.toFixed(2)}ms</div><div>transport ${trnMs.toFixed(2)}ms</div><div>worker:dispatch ${dspMs.toFixed(2)}ms</div><div>mutations generated: ${mutCount}</div>`;
					row.addEventListener("click", () => {
						detail.classList.toggle("visible");
					});
					traceSection.appendChild(row);
					traceSection.appendChild(detail);
				}
				logList.appendChild(traceSection);
			}
		}
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
				actionSpan.textContent = [
					"boundingRect",
					"computedStyle",
					"nodeProperty",
					"windowProperty"
				][entry.queryType] ?? `query:${entry.queryType}`;
				div.appendChild(actionSpan);
				const detailSpan = document.createElement("span");
				detailSpan.className = "log-detail";
				detailSpan.textContent = `node=${entry.nodeId} ${entry.latencyMs.toFixed(1)}ms ${entry.result}`;
				div.appendChild(detailSpan);
				logList.appendChild(div);
			}
		}
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
				let allCoalesced = [];
				for (const data of Object.values(allData)) if (data?.coalescedLog && Array.isArray(data.coalescedLog)) allCoalesced = allCoalesced.concat(data.coalescedLog);
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
		if (autoScroll && !replayState) logList.scrollTop = logList.scrollHeight;
		lastRenderedLogLength = displayMutations.length;
	}
	logFilter.addEventListener("input", renderLogTab);
	logClearBtn.addEventListener("click", () => {
		mutationLog.length = 0;
		lastRenderedLogLength = 0;
		logList.innerHTML = "<div class=\"log-empty\">No mutations captured yet.</div>";
		logCountSpan.textContent = "0";
	});
	let lastRenderedWarningLength = 0;
	let warnViewMode = "grouped";
	const suppressedCodes = /* @__PURE__ */ new Set();
	warnViewToggle.addEventListener("click", () => {
		warnViewMode = warnViewMode === "grouped" ? "chronological" : "grouped";
		warnViewToggle.textContent = warnViewMode === "grouped" ? "Chronological" : "Grouped";
		warnViewToggle.classList.toggle("active", warnViewMode === "chronological");
		lastRenderedWarningLength = -1;
		renderWarningsTab();
	});
	warnFilter.addEventListener("input", () => {
		lastRenderedWarningLength = -1;
		renderWarningsTab();
	});
	function buildWarnEntryDiv(entry) {
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
	function renderWarningsTab() {
		const activeWarningLog = importedSession ? importedSession.warningLog : warningLog;
		if (activeWarningLog.length === 0) {
			if (lastRenderedWarningLength !== 0) {
				warnList.innerHTML = "<div class=\"warn-empty\">No warnings captured yet.</div>";
				lastRenderedWarningLength = 0;
			}
			return;
		}
		if (activeWarningLog.length === lastRenderedWarningLength) return;
		const filterText = warnFilter.value.toLowerCase().trim();
		const fragment = document.createDocumentFragment();
		const filtered = filterText ? activeWarningLog.filter((e) => e.code.toLowerCase().includes(filterText) || e.message.toLowerCase().includes(filterText)) : activeWarningLog;
		const visible = filtered.filter((e) => !suppressedCodes.has(e.code));
		const suppressedCount = filtered.length - visible.length;
		if (warnViewMode === "chronological") for (const entry of visible) fragment.appendChild(buildWarnEntryDiv(entry));
		else {
			const groups = /* @__PURE__ */ new Map();
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
				const header = document.createElement("div");
				header.className = "warn-group-header";
				const toggle = document.createElement("span");
				toggle.className = "warn-group-toggle";
				toggle.textContent = "▶";
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
					lastRenderedWarningLength = -1;
					renderWarningsTab();
				});
				header.appendChild(suppressBtn);
				header.addEventListener("click", () => {
					groupDiv.classList.toggle("expanded");
					toggle.textContent = groupDiv.classList.contains("expanded") ? "▼" : "▶";
				});
				groupDiv.appendChild(header);
				const desc = WarningDescriptions[code];
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
				const entriesDiv = document.createElement("div");
				entriesDiv.className = "warn-group-entries";
				for (const entry of entries) entriesDiv.appendChild(buildWarnEntryDiv(entry));
				groupDiv.appendChild(entriesDiv);
				fragment.appendChild(groupDiv);
			}
		}
		warnList.innerHTML = "";
		warnList.appendChild(fragment);
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
			if (activeTab === "Graph") renderGraphTab();
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
		if (replayTimer) {
			clearInterval(replayTimer);
			replayTimer = null;
		}
		clearInterval(healthDotTimer);
		onWarningBadgeUpdate = null;
		mutationLog.length = 0;
		warningLog.length = 0;
		eventLog.length = 0;
		syncReadLog.length = 0;
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
	_onTimingResult = null;
	constructor(appId, nodeCache) {
		this.appId = appId;
		this.nodeCache = nodeCache ?? new NodeCache();
	}
	/**
	* Set a callback that is invoked whenever a trace entry is fully
	* populated with worker timing data.  This allows callers (e.g. the
	* devtools debug hooks) to emit EventLogEntry objects.
	*/
	set onTimingResult(cb) {
		this._onTimingResult = cb;
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
		const existing = this.listeners.get(listenerId);
		if (existing) existing.controller.abort();
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
			const serialized = serializeEvent(domEvent, this.nodeCache);
			const serializeMs = performance.now() - serializeStart;
			const sentAt = Date.now();
			this.eventTraces.push({
				eventType: domEvent.type,
				listenerId,
				serializeMs,
				timestamp: performance.now(),
				sentAt
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
	/**
	* Update the most recent trace entry for a given listener with
	* dispatch and mutation count timing from the worker.
	* Transport time is computed on the main thread to avoid cross-origin
	* timing issues between main thread and worker `performance.now()`.
	*/
	updateTraceWithWorkerTiming(listenerId, dispatchMs, mutationCount) {
		const receivedAt = Date.now();
		for (let i = this.eventTraces.length - 1; i >= 0; i--) {
			const trace = this.eventTraces[i];
			if (trace.listenerId === listenerId && trace.transportMs === void 0) {
				trace.transportMs = Math.max(0, receivedAt - trace.sentAt - dispatchMs);
				trace.dispatchMs = dispatchMs;
				trace.mutationCount = mutationCount;
				this._onTimingResult?.(trace);
				return;
			}
		}
	}
	getListenersForNode(nodeId) {
		const result = [];
		for (const [listenerId, meta] of this.listeners) if (meta.nodeId === nodeId) result.push({
			listenerId,
			eventName: meta.eventName
		});
		return result;
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
function getNodeId(el, cache) {
	if (!el) return null;
	if (cache) {
		const id = cache.getId(el);
		if (id != null) return String(id);
	}
	return el.id ?? null;
}
/**
* Serialize a DOM event to a plain object that can be transferred via postMessage.
* Only includes properties relevant to the event type.
*/
function serializeEvent(e, cache) {
	const composedTarget = e.composedPath?.()[0] ?? e.target;
	const base = {
		type: e.type,
		target: getNodeId(composedTarget, cache),
		currentTarget: getNodeId(e.currentTarget, cache),
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
		base.relatedTarget = getNodeId(e.relatedTarget, cache);
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
	const mediaTarget = e.target;
	if (mediaTarget instanceof HTMLMediaElement) {
		base.currentTime = mediaTarget.currentTime;
		base.duration = Number.isFinite(mediaTarget.duration) ? mediaTarget.duration : 0;
		base.paused = mediaTarget.paused;
		base.ended = mediaTarget.ended;
		base.readyState = mediaTarget.readyState;
	}
	if (e instanceof FocusEvent) base.relatedTarget = e.relatedTarget instanceof Element ? getNodeId(e.relatedTarget, cache) : null;
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
const ALLOWED_METHODS = new Set([
	"play",
	"pause",
	"load",
	"focus",
	"blur",
	"click",
	"scrollIntoView",
	"requestFullscreen",
	"select",
	"setCustomValidity",
	"reportValidity",
	"showModal",
	"close"
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
			case "callMethod":
				this.callMethod(mutation.id, mutation.method, mutation.args);
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
				code: WarningCode.MISSING_NODE,
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
				code: WarningCode.MISSING_NODE,
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
			this._cleanupSubtreeListeners(child, childId);
			this.nodeCache.delete(childId);
			child.parentNode.removeChild(child);
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
				code: WarningCode.MISSING_NODE,
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
				code: WarningCode.MISSING_NODE,
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
				code: WarningCode.MISSING_NODE,
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
				code: WarningCode.BLOCKED_PROPERTY,
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
	callMethod(id, method, args) {
		const node = this.nodeCache.get(id);
		if (!node) return;
		if (!ALLOWED_METHODS.has(method)) {
			console.warn(`[async-dom] Blocked callMethod: "${method}" is not allowed`);
			return;
		}
		const fn = node[method];
		if (typeof fn === "function") fn.apply(node, args);
	}
	/**
	* Notify onNodeRemoved for a node and all its descendants.
	* This ensures EventBridge detaches listeners on the entire subtree.
	*/
	_cleanupSubtreeListeners(node, id) {
		this.onNodeRemoved?.(id);
		const children = node.childNodes;
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const childId = this.nodeCache.getId(child);
			if (childId) {
				this._cleanupSubtreeListeners(child, childId);
				this.nodeCache.delete(childId);
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
		const appId = generateAppId(config.name);
		const useBinary = typeof __ASYNC_DOM_BINARY__ !== "undefined" && __ASYNC_DOM_BINARY__;
		const transport = config.transport ?? (useBinary ? new BinaryWorkerTransport(config.worker) : new WorkerTransport(config.worker));
		transport.onMessage((message) => {
			this.notifyHandlers(appId, message);
		});
		this.threads.set(appId, {
			transport,
			appId
		});
		return appId;
	}
	createRemoteThread(config) {
		const appId = generateAppId(config.name);
		const transport = config.transport;
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
		const appId = generateAppId(config.name);
		const transport = new WebSocketTransport(config.url, config.options);
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
function generateAppId(name) {
	if (name) return createAppId(name);
	return createAppId(Math.random().toString(36).slice(2, 7));
}
//#endregion
//#region src/main-thread/index.ts
var main_thread_exports = /* @__PURE__ */ __exportAll({ createAsyncDom: () => createAsyncDom });
const ALLOWED_WINDOW_PROPERTIES = new Set([
	"innerWidth",
	"innerHeight",
	"outerWidth",
	"outerHeight",
	"devicePixelRatio",
	"screen.width",
	"screen.height",
	"screen.availWidth",
	"screen.availHeight",
	"screen.colorDepth",
	"screen.pixelDepth",
	"screen.orientation.type",
	"scrollX",
	"scrollY",
	"visualViewport.width",
	"visualViewport.height",
	"navigator.language",
	"navigator.languages",
	"navigator.userAgent",
	"navigator.hardwareConcurrency",
	"document.visibilityState",
	"document.hidden",
	"localStorage.getItem",
	"localStorage.setItem",
	"localStorage.removeItem",
	"localStorage.length",
	"localStorage.key",
	"sessionStorage.getItem",
	"sessionStorage.setItem",
	"sessionStorage.removeItem",
	"sessionStorage.length",
	"sessionStorage.key"
]);
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
	const debugHooks = resolveDebugHooks(config.debug);
	const debugStats = new DebugStats();
	const causalityTracker = new CausalityTracker();
	const workerPerfEntries = /* @__PURE__ */ new Map();
	const MAX_PERF_ENTRIES = 200;
	const mutationCorrelation = new MutationEventCorrelation();
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
		threadManager.sendToThread(appId, {
			type: "debugQuery",
			query: "coalescedLog"
		});
	}
	function handleSyncQuery(appRenderer, query) {
		try {
			const parsed = JSON.parse(query.data);
			const nodeId = parsed.nodeId;
			const property = parsed.property;
			switch (query.queryType) {
				case QueryType.BoundingRect: {
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
				case QueryType.ComputedStyle: {
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
				case QueryType.NodeProperty: {
					const node = appRenderer.getNode(nodeId);
					if (!node || !property) return null;
					return node[property] ?? null;
				}
				case QueryType.WindowProperty: {
					if (!property) return null;
					if (!ALLOWED_WINDOW_PROPERTIES.has(property)) return null;
					if (property.startsWith("localStorage.") || property.startsWith("sessionStorage.")) {
						const dotIndex = property.indexOf(".");
						const storageType = property.slice(0, dotIndex);
						const method = property.slice(dotIndex + 1);
						const storage = storageType === "localStorage" ? window.localStorage : window.sessionStorage;
						const args = parsed.args;
						if (method === "getItem" && args?.[0] != null) return storage.getItem(args[0]);
						if (method === "setItem" && args?.[0] != null && args[1] !== void 0) {
							storage.setItem(args[0], args[1]);
							return null;
						}
						if (method === "removeItem" && args?.[0] != null) {
							storage.removeItem(args[0]);
							return null;
						}
						if (method === "length") return storage.length;
						if (method === "key" && args?.[0] !== void 0) return storage.key(Number(args[0]));
						return null;
					}
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
			if (bridge) {
				bridge.attach(mutation.id, mutation.name, mutation.listenerId);
				debugStats.eventsForwarded++;
			}
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
		if (renderer) {
			renderer.apply(mutation, batchUid);
			debugStats.mutationsApplied++;
		}
	});
	threadManager.onMessage((appId, message) => {
		if (isMutationMessage(message)) {
			if (message.sentAt != null) scheduler.recordWorkerLatency(message.sentAt);
			scheduler.enqueue(message.mutations, appId, message.priority ?? "normal", message.uid);
			if (message.causalEvent) {
				const nodeIds = message.mutations.filter((m) => "id" in m).map((m) => m.id);
				causalityTracker.recordBatch(message.uid, nodeIds, message.mutations.length, message.causalEvent);
				mutationCorrelation.registerBatchEvent(message.uid, message.causalEvent);
			}
			return;
		}
		if (isSystemMessage(message) && message.type === "eventTimingResult") {
			const bridge = eventBridges.get(appId);
			if (bridge) bridge.updateTraceWithWorkerTiming(message.listenerId, message.dispatchMs, message.mutationCount);
			return;
		}
		if (isSystemMessage(message) && message.type === "perfEntries") {
			const perfMsg = message;
			let entries = workerPerfEntries.get(appId);
			if (!entries) {
				entries = [];
				workerPerfEntries.set(appId, entries);
			}
			entries.push(...perfMsg.entries);
			if (entries.length > MAX_PERF_ENTRIES) entries.splice(0, entries.length - MAX_PERF_ENTRIES);
			return;
		}
		if (isSystemMessage(message) && message.type === "debugResult") {
			const debugMsg = message;
			const data = debugData.get(appId) ?? {
				tree: null,
				workerStats: null,
				perTypeCoalesced: null,
				coalescedLog: null
			};
			if (debugMsg.query === "tree") data.tree = debugMsg.result;
			if (debugMsg.query === "stats") data.workerStats = debugMsg.result;
			if (debugMsg.query === "perTypeCoalesced") data.perTypeCoalesced = debugMsg.result;
			if (debugMsg.query === "coalescedLog") data.coalescedLog = debugMsg.result;
			debugData.set(appId, data);
		}
	});
	if (config.worker) addAppInternal(config.worker, config.target);
	function addAppInternal(worker, mountPoint, shadow, customTransport, onError, name, enableSyncChannel) {
		let appId;
		if (worker) appId = threadManager.createWorkerThread({
			worker,
			transport: customTransport,
			name
		});
		else if (customTransport) appId = threadManager.createRemoteThread({
			transport: customTransport,
			name
		});
		else throw new Error("[async-dom] addAppInternal requires either a worker or a transport");
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
			if (config.debug?.exposeDevtools) appTransport.enableStats?.(true);
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
				if (isSystemMessage(message) && message.type === "error" && "error" in message) {
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
		if (debugHooks.onEvent) bridge.onTimingResult = (trace) => {
			debugHooks.onEvent?.({
				side: "main",
				phase: "dispatch",
				eventType: trace.eventType,
				listenerId: trace.listenerId,
				targetId: null,
				timestamp: trace.timestamp,
				transportMs: trace.transportMs,
				dispatchMs: trace.dispatchMs,
				mutationCount: trace.mutationCount
			});
		};
		eventBridges.set(appId, bridge);
		scheduler.setAppCount(renderers.size);
		const shouldCreateSyncChannel = worker ? true : enableSyncChannel ?? false;
		let sharedBuffer;
		if (shouldCreateSyncChannel && typeof SharedArrayBuffer !== "undefined") try {
			sharedBuffer = new SharedArrayBuffer(65536);
			const host = new SyncChannelHost(sharedBuffer);
			host.startPolling((query) => handleSyncQuery(appRenderer, query));
			syncHosts.set(appId, host);
		} catch {
			sharedBuffer = void 0;
		}
		if (appTransport) appTransport.onMessage((message) => {
			if (isSystemMessage(message) && message.type === "query") {
				const queryMsg = message;
				const result = handleSyncQuery(appRenderer, {
					queryType: {
						boundingRect: QueryType.BoundingRect,
						computedStyle: QueryType.ComputedStyle,
						nodeProperty: QueryType.NodeProperty,
						windowProperty: QueryType.WindowProperty
					}[queryMsg.query] ?? QueryType.NodeProperty,
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
			getListenersForNode: (nodeId) => {
				const results = [];
				for (const bridge of eventBridges.values()) results.push(...bridge.getListenersForNode(nodeId));
				return results;
			},
			debugStats: () => debugStats.snapshot(),
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
			getTransportStats: () => {
				const result = {};
				for (const appId of renderers.keys()) {
					const transport = threadManager.getTransport(appId);
					result[String(appId)] = transport?.getStats?.() ?? null;
				}
				return result;
			},
			getAllAppsData: () => {
				const result = {};
				for (const [appId, data] of debugData) result[String(appId)] = data;
				return result;
			},
			replayMutation: (mutation, appId) => {
				const renderer = renderers.get(appId);
				if (renderer) renderer.apply(mutation);
			},
			clearAndReapply: (mutations, upToIndex) => {
				for (const renderer of renderers.values()) {
					const root = renderer.getRoot();
					if (root) {
						root.body.textContent = "";
						root.head.textContent = "";
					}
					const end = Math.min(upToIndex, mutations.length);
					for (let i = 0; i < end; i++) renderer.apply(mutations[i].mutation, mutations[i].batchUid);
					break;
				}
			},
			getCausalityTracker: () => causalityTracker,
			getWorkerPerfEntries: () => {
				const result = {};
				for (const [appId, entries] of workerPerfEntries) result[String(appId)] = entries.slice();
				return result;
			},
			getMutationCorrelation: () => mutationCorrelation
		};
		if (typeof document !== "undefined") devtoolsPanelHandle = createDevtoolsPanel();
	}
	if (config.debug?.exposeDevtools) {
		const origOnMutation = debugHooks.onMutation;
		const origOnWarning = debugHooks.onWarning;
		const origOnEvent = debugHooks.onEvent;
		const origOnSyncRead = debugHooks.onSyncRead;
		debugHooks.onMutation = (entry) => {
			origOnMutation?.(entry);
			captureMutation(entry);
			mutationCorrelation.indexMutation(entry);
		};
		debugHooks.onWarning = (entry) => {
			origOnWarning?.(entry);
			captureWarning(entry);
		};
		debugHooks.onEvent = (entry) => {
			origOnEvent?.(entry);
			captureEvent(entry);
		};
		debugHooks.onSyncRead = (entry) => {
			origOnSyncRead?.(entry);
			captureSyncRead(entry);
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
			return addAppInternal(appConfig.worker, appConfig.mountPoint, appConfig.shadow, appConfig.transport, appConfig.onError, appConfig.name);
		},
		addRemoteApp(remoteConfig) {
			return addAppInternal(void 0, remoteConfig.mountPoint, remoteConfig.shadow, remoteConfig.transport, remoteConfig.onError, remoteConfig.name, remoteConfig.enableSyncChannel);
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
export { EventBridge as a, DomRenderer as i, main_thread_exports as n, FrameScheduler as o, ThreadManager as r, sanitizeHTML as s, createAsyncDom as t };

//# sourceMappingURL=main-thread.js.map