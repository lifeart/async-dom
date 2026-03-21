import type { DebugOptions } from "../core/debug.ts";
import { DebugStats, MutationEventCorrelation, resolveDebugHooks } from "../core/debug.ts";
import { NodeCache } from "../core/node-cache.ts";
import type { AppId, DomMutation, Message, NodeId, PerfEntryData } from "../core/protocol.ts";
import {
	BODY_NODE_ID,
	DOCUMENT_NODE_ID,
	HEAD_NODE_ID,
	HTML_NODE_ID,
	isMutationMessage,
	isSystemMessage,
} from "../core/protocol.ts";
import { FrameScheduler, type SchedulerConfig } from "../core/scheduler.ts";
import { QueryType, SyncChannelHost } from "../core/sync-channel.ts";
import { CausalityTracker } from "../debug/causality-graph.ts";
import {
	captureEvent,
	captureMutation,
	captureSyncRead,
	captureWarning,
	createDevtoolsPanel,
} from "../debug/devtools-panel.ts";
import { EventBridge } from "./event-bridge.ts";
import { type ContentVisibilityConfig, DomRenderer, type RendererRoot } from "./renderer.ts";
import { ThreadManager } from "./thread-manager.ts";

// Allowlist of safe window properties accessible via sync channel.
// Prevents workers from reading sensitive data like document.cookie.
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
	"sessionStorage.key",
]);

/**
 * Configuration for {@link createAsyncDom}.
 *
 * At minimum, provide a `target` element where worker-rendered DOM will be mounted.
 * Optionally pass a `worker` to immediately register the first app.
 */
export interface AsyncDomConfig {
	/** The DOM element that serves as the rendering root for worker-produced mutations. */
	target: Element;
	/** Optional initial worker. If provided, it is registered as the first app automatically. */
	worker?: Worker;
	/** Frame-budget scheduler tuning options. */
	scheduler?: SchedulerConfig;
	/** Debug logging and devtools panel options. */
	debug?: DebugOptions;
	/**
	 * Enable `content-visibility: auto` on top-level container elements for off-screen
	 * rendering optimization. Pass `true` for defaults, or an object with a custom
	 * `intrinsicSize` (CSS value, default `"auto 500px"`).
	 */
	contentVisibility?: boolean | { intrinsicSize?: string };
}

/**
 * Configuration for adding a worker-backed app via {@link AsyncDomInstance.addApp}.
 */
export interface AppConfig {
	/** The Web Worker instance that runs this app's UI logic. */
	worker: Worker;
	/** Human-readable name for this app (shown in DevTools instead of a random hash). */
	name?: string;
	/** CSS selector or Element where this app's DOM will be mounted. Defaults to the instance root. */
	mountPoint?: string | Element;
	/** Attach to a Shadow DOM root for CSS isolation. Pass `true` for `{ mode: "open" }` or a custom `ShadowRootInit`. */
	shadow?: boolean | ShadowRootInit;
	/** Custom transport to use instead of the default `WorkerTransport`. */
	transport?: import("../transport/base.ts").Transport;
	/** Called when the worker reports an unhandled error or unhandled promise rejection. */
	onError?: (error: import("../core/protocol.ts").SerializedError, appId: AppId) => void;
}

/**
 * Configuration for adding a remote (non-worker) app via {@link AsyncDomInstance.addRemoteApp}.
 *
 * Remote apps communicate over a custom transport (e.g. WebSocket) rather than
 * a local Web Worker.
 */
export interface RemoteAppConfig {
	/** The transport used to communicate with the remote process. */
	transport: import("../transport/base.ts").Transport;
	/** Human-readable name for this app (shown in DevTools instead of a random hash). */
	name?: string;
	/** CSS selector or Element where this app's DOM will be mounted. Defaults to the instance root. */
	mountPoint?: string | Element;
	/** Attach to a Shadow DOM root for CSS isolation. Pass `true` for `{ mode: "open" }` or a custom `ShadowRootInit`. */
	shadow?: boolean | ShadowRootInit;
	/** Called when the remote process reports an unhandled error. */
	onError?: (error: import("../core/protocol.ts").SerializedError, appId: AppId) => void;
	/** Enable `SharedArrayBuffer`-based sync channel for synchronous DOM reads. Default: `false`. */
	enableSyncChannel?: boolean;
}

/**
 * Handle returned by {@link createAsyncDom}.
 *
 * Controls the lifecycle of the async-dom instance: starting/stopping the
 * scheduler, adding/removing apps, and tearing down all resources.
 */
export interface AsyncDomInstance {
	/** Start the frame-budget scheduler. Mutations begin applying to the DOM. */
	start(): void;
	/** Pause the scheduler. Mutations are queued but not applied until `start()` is called. */
	stop(): void;
	/** Stop the scheduler, flush remaining mutations, tear down all apps, and release all resources. */
	destroy(): void;
	/** Register a new worker-backed app. Returns a unique `AppId` for later removal. */
	addApp(config: AppConfig): AppId;
	/** Register a new remote app using a custom transport. Returns a unique `AppId` for later removal. */
	addRemoteApp(config: RemoteAppConfig): AppId;
	/** Remove an app by its `AppId`, detaching its event listeners and clearing its rendered DOM. */
	removeApp(appId: AppId): void;
}

/**
 * Creates a new async-dom instance on the main thread.
 *
 * This is the primary entry point for using async-dom. It:
 * - Creates a scheduler for frame-budgeted rendering
 * - Creates per-app renderers for applying DOM mutations (isolation)
 * - Creates an event bridge for forwarding events to workers
 * - Manages worker threads
 */
export function createAsyncDom(config: AsyncDomConfig): AsyncDomInstance {
	const scheduler = new FrameScheduler(config.scheduler);
	const threadManager = new ThreadManager();
	const eventBridges = new Map<AppId, EventBridge>();
	const syncHosts = new Map<AppId, SyncChannelHost>();
	const debugHooks = resolveDebugHooks(config.debug);
	const debugStats = new DebugStats();

	// Resolve content-visibility config
	const contentVisibilityConfig: ContentVisibilityConfig | null = config.contentVisibility
		? {
				enabled: true,
				intrinsicSize:
					typeof config.contentVisibility === "object" && config.contentVisibility.intrinsicSize
						? config.contentVisibility.intrinsicSize
						: "auto 500px",
			}
		: null;

	// Feature 15: Causality tracker for building event -> batch -> node DAG
	const causalityTracker = new CausalityTracker();

	// Feature 16: Worker CPU profiler entries storage
	const workerPerfEntries = new Map<AppId, PerfEntryData[]>();
	const MAX_PERF_ENTRIES = 200;

	// Feature 19: Mutation-to-event correlation index
	const mutationCorrelation = new MutationEventCorrelation();

	// Per-app DomRenderer map (each has its own NodeCache)
	const renderers = new Map<AppId, DomRenderer>();
	let lastRenderer: DomRenderer | null = null;
	let lastAppId: AppId | null = null;

	// Debug data cache: stores virtual DOM trees and worker stats received from workers
	const debugData = new Map<
		AppId,
		{
			tree: unknown;
			workerStats: unknown;
			perTypeCoalesced: unknown;
			coalescedLog: unknown;
		}
	>();

	function requestDebugData(appId: AppId): void {
		threadManager.sendToThread(appId, { type: "debugQuery", query: "tree" });
		threadManager.sendToThread(appId, { type: "debugQuery", query: "stats" });
		threadManager.sendToThread(appId, { type: "debugQuery", query: "perTypeCoalesced" });
		threadManager.sendToThread(appId, { type: "debugQuery", query: "coalescedLog" });
	}

	function handleSyncQuery(
		appRenderer: DomRenderer,
		query: { queryType: QueryType; data: string },
	): unknown {
		const startTime = performance.now();
		let resultStatus: "success" | "timeout" | "error" = "success";
		let parsedNodeId: string = "";
		try {
			const parsed = JSON.parse(query.data);
			const nodeId = parsed.nodeId;
			parsedNodeId = String(nodeId ?? "");
			const property = parsed.property;

			switch (query.queryType) {
				case QueryType.BoundingRect: {
					const node = appRenderer.getNode(nodeId) as Element | null;
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
						y: rect.y,
					};
				}
				case QueryType.ComputedStyle: {
					const node = appRenderer.getNode(nodeId) as Element | null;
					if (!node) return {};
					const cs = window.getComputedStyle(node);
					const result: Record<string, string> = {};
					const props = [
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
						"padding-left",
					];
					for (const p of props) {
						const v = cs.getPropertyValue(p);
						if (v) result[p] = v;
					}
					return result;
				}
				case QueryType.NodeProperty: {
					const node = appRenderer.getNode(nodeId);
					if (!node || !property) return null;
					return (node as unknown as Record<string, unknown>)[property] ?? null;
				}
				case QueryType.WindowProperty: {
					if (!property) return null;
					// Allowlist of safe window properties to prevent data exfiltration
					if (!ALLOWED_WINDOW_PROPERTIES.has(property)) return null;

					// Handle storage method calls (localStorage.getItem, etc.)
					if (property.startsWith("localStorage.") || property.startsWith("sessionStorage.")) {
						const dotIndex = property.indexOf(".");
						const storageType = property.slice(0, dotIndex);
						const method = property.slice(dotIndex + 1);
						const storage =
							storageType === "localStorage" ? window.localStorage : window.sessionStorage;
						const args = parsed.args as string[] | undefined;
						if (method === "getItem" && args?.[0] != null) {
							return storage.getItem(args[0]);
						}
						if (method === "setItem" && args?.[0] != null && args[1] !== undefined) {
							storage.setItem(args[0], args[1]);
							return null;
						}
						if (method === "removeItem" && args?.[0] != null) {
							storage.removeItem(args[0]);
							return null;
						}
						if (method === "length") {
							return storage.length;
						}
						if (method === "key" && args?.[0] !== undefined) {
							return storage.key(Number(args[0]));
						}
						return null;
					}

					// Support dotted paths like "screen.width"
					const parts = property.split(".");
					let current: unknown = window;
					for (const part of parts) {
						if (current == null) return null;
						current = (current as Record<string, unknown>)[part];
					}
					return current ?? null;
				}
				default:
					return null;
			}
		} catch {
			resultStatus = "error";
			return null;
		} finally {
			debugStats.syncReadRequests++;
			if (debugHooks.onSyncRead) {
				const latencyMs = performance.now() - startTime;
				debugHooks.onSyncRead({
					queryType: query.queryType,
					nodeId: parsedNodeId,
					latencyMs,
					result: resultStatus,
					timestamp: performance.now(),
				});
			}
		}
	}

	// Wire scheduler to renderer — appId is used to route mutations
	// to the correct per-app renderer and event bridge
	scheduler.setApplier((mutation: DomMutation, appId: AppId, batchUid?: number) => {
		// Handle addEventListener specially — route to the owning app's EventBridge
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
			if (bridge) {
				bridge.configureEvent(mutation.id, mutation.name, {
					preventDefault: mutation.preventDefault,
					passive: mutation.passive,
				});
			}
			return;
		}
		if (mutation.action === "removeEventListener") {
			const bridge = eventBridges.get(appId);
			if (bridge) {
				bridge.detach(mutation.listenerId);
			}
			return;
		}

		// Fast path: skip map lookup for single/repeated app
		let renderer: DomRenderer | undefined;
		if (appId === lastAppId && lastRenderer) {
			renderer = lastRenderer;
		} else {
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

	// Handle incoming messages from workers
	threadManager.onMessage((appId: AppId, message: Message) => {
		if (isMutationMessage(message)) {
			if (message.sentAt != null) {
				scheduler.recordWorkerLatency(message.sentAt);
			}
			scheduler.enqueue(message.mutations, appId, message.priority ?? "normal", message.uid);

			// Feature 15: record causal batch
			if (message.causalEvent) {
				const nodeIds = message.mutations
					.filter((m) => "id" in m)
					.map((m) => (m as { id: number }).id);
				causalityTracker.recordBatch(
					message.uid,
					nodeIds,
					message.mutations.length,
					message.causalEvent,
				);
				// Feature 19: register batch event for correlation
				mutationCorrelation.registerBatchEvent(message.uid, message.causalEvent);
			}
			return;
		}
		// Handle event timing results from the worker
		if (isSystemMessage(message) && message.type === "eventTimingResult") {
			const bridge = eventBridges.get(appId);
			if (bridge) {
				bridge.updateTraceWithWorkerTiming(
					message.listenerId,
					message.dispatchMs,
					message.mutationCount,
				);
			}
			return;
		}

		// Feature 16: handle worker performance entries
		if (isSystemMessage(message) && message.type === "perfEntries") {
			const perfMsg = message as { type: "perfEntries"; appId: AppId; entries: PerfEntryData[] };
			let entries = workerPerfEntries.get(appId);
			if (!entries) {
				entries = [];
				workerPerfEntries.set(appId, entries);
			}
			entries.push(...perfMsg.entries);
			if (entries.length > MAX_PERF_ENTRIES) {
				entries.splice(0, entries.length - MAX_PERF_ENTRIES);
			}
			return;
		}

		// Cache debug results from worker threads
		if (isSystemMessage(message) && message.type === "debugResult") {
			const debugMsg = message as { type: "debugResult"; query: string; result: unknown };
			const data = debugData.get(appId) ?? {
				tree: null,
				workerStats: null,
				perTypeCoalesced: null,
				coalescedLog: null,
			};
			if (debugMsg.query === "tree") data.tree = debugMsg.result;
			if (debugMsg.query === "stats") data.workerStats = debugMsg.result;
			if (debugMsg.query === "perTypeCoalesced") data.perTypeCoalesced = debugMsg.result;
			if (debugMsg.query === "coalescedLog") data.coalescedLog = debugMsg.result;
			debugData.set(appId, data);
		}
	});

	// Wire mutation/warning/event/syncRead capture for the devtools panel
	// BEFORE adding the first app, so that addAppInternal sees non-null hooks
	if (config.debug?.exposeDevtools) {
		const origOnMutation = debugHooks.onMutation;
		const origOnWarning = debugHooks.onWarning;
		const origOnEvent = debugHooks.onEvent;
		const origOnSyncRead = debugHooks.onSyncRead;
		debugHooks.onMutation = (entry) => {
			origOnMutation?.(entry);
			captureMutation(entry);
			// Feature 19: index mutation for "Why Updated?" lookups
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

	// If a worker was provided in config, add it as the first app
	if (config.worker) {
		addAppInternal(config.worker, config.target);
	}

	function addAppInternal(
		worker: Worker | undefined,
		mountPoint?: string | Element,
		shadow?: boolean | ShadowRootInit,
		customTransport?: import("../transport/base.ts").Transport,
		onError?: (error: import("../core/protocol.ts").SerializedError, appId: AppId) => void,
		name?: string,
		enableSyncChannel?: boolean,
	): AppId {
		let appId: AppId;
		if (worker) {
			appId = threadManager.createWorkerThread({ worker, transport: customTransport, name });
		} else if (customTransport) {
			appId = threadManager.createRemoteThread({ transport: customTransport, name });
		} else {
			throw new Error("[async-dom] addAppInternal requires either a worker or a transport");
		}

		// Per-app NodeCache and DomRenderer for isolation
		const appNodeCache = new NodeCache();

		// Resolve mount point element
		let mountEl: Element | null = null;
		if (mountPoint) {
			mountEl = typeof mountPoint === "string" ? document.querySelector(mountPoint) : mountPoint;
		}

		// Set up renderer root (shadow DOM for CSS isolation)
		let rendererRoot: RendererRoot | undefined;
		if (mountEl && shadow) {
			const shadowInit: ShadowRootInit = shadow === true ? { mode: "open" } : shadow;
			const shadowRoot = mountEl.attachShadow(shadowInit);
			rendererRoot = {
				body: shadowRoot,
				head: shadowRoot,
				html: mountEl,
			};
		} else if (mountEl) {
			rendererRoot = {
				body: mountEl,
				head: document.head,
				html: mountEl,
			};
		}

		const appRenderer = new DomRenderer(appNodeCache, undefined, rendererRoot);

		if (contentVisibilityConfig) {
			appRenderer.setContentVisibility(contentVisibilityConfig);
		}

		if (debugHooks.onWarning || debugHooks.onMutation) {
			appRenderer.setDebugHooks({
				onWarning: debugHooks.onWarning,
				onMutation: debugHooks.onMutation,
			});
		}

		// Seed structural nodes (always — without these, worker mutations targeting body/head/html are silently dropped)
		const root = appRenderer.getRoot();
		appNodeCache.set(BODY_NODE_ID, root.body as unknown as Node);
		appNodeCache.set(HEAD_NODE_ID, root.head as unknown as Node);
		appNodeCache.set(HTML_NODE_ID, root.html);

		// Seed document node for document-level event listeners
		appNodeCache.set(DOCUMENT_NODE_ID, document as unknown as Node);

		// When a node is removed, detach event listeners for this app
		appRenderer.onNodeRemoved = (id) => {
			const bridge = eventBridges.get(appId);
			if (bridge) {
				bridge.detachByNodeId(id);
			}
		};

		renderers.set(appId, appRenderer);

		const bridge = new EventBridge(appId, appNodeCache);
		const appTransport = threadManager.getTransport(appId);
		if (appTransport) {
			// Enable transport stats measurement when devtools are active
			if (config.debug?.exposeDevtools) {
				appTransport.enableStats?.(true);
			}
			bridge.setTransport(appTransport);

			// Wire transport error/close handlers for crash recovery (B4)
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

			console.debug(
				"[async-dom] App",
				appId,
				"transport ready, readyState:",
				appTransport.readyState,
			);

			appTransport.onError = (error: Error) => {
				console.error("[async-dom] App", appId, "worker error:", error.message);
				onError?.({ message: error.message, stack: error.stack, name: error.name }, appId);
			};

			appTransport.onClose = () => {
				console.warn("[async-dom] App", appId, "worker disconnected, cleaning up");
				cleanupDeadApp();
			};

			// Also handle error system messages from the worker
			appTransport.onMessage((message: Message) => {
				if (isSystemMessage(message) && message.type === "error" && "error" in message) {
					const errMsg = message as {
						type: "error";
						appId: AppId;
						error: import("../core/protocol.ts").SerializedError;
					};
					onError?.(errMsg.error, appId);
					// Route worker errors to devtools panel as formatted warnings
					const err = errMsg.error;
					const location = err.filename
						? ` at ${err.filename}:${err.lineno ?? "?"}:${err.colno ?? "?"}`
						: "";
					captureWarning({
						code: err.isUnhandledRejection ? "WORKER_UNHANDLED_REJECTION" : "WORKER_ERROR",
						message: `[${String(appId)}] ${err.name ?? "Error"}: ${err.message}${location}${err.stack ? `\n${err.stack}` : ""}`,
						context: { appId: String(appId), error: err },
						timestamp: performance.now(),
					});
				}
			});
		}
		// Wire timing result callback to emit EventLogEntry via debug hooks
		if (debugHooks.onEvent) {
			bridge.onTimingResult = (trace) => {
				debugHooks.onEvent?.({
					side: "main",
					phase: "dispatch",
					eventType: trace.eventType,
					listenerId: trace.listenerId,
					targetId: null,
					timestamp: trace.timestamp,
					transportMs: trace.transportMs,
					dispatchMs: trace.dispatchMs,
					mutationCount: trace.mutationCount,
				});
			};
		}
		eventBridges.set(appId, bridge);
		scheduler.setAppCount(renderers.size);

		// Create sync channel for synchronous DOM reads
		// For remote apps (no worker), skip SAB unless explicitly enabled
		const shouldCreateSyncChannel = worker ? true : (enableSyncChannel ?? false);
		let sharedBuffer: SharedArrayBuffer | undefined;
		if (shouldCreateSyncChannel && typeof SharedArrayBuffer !== "undefined") {
			try {
				sharedBuffer = new SharedArrayBuffer(65536);
				const host = new SyncChannelHost(sharedBuffer);
				host.startPolling((query) => handleSyncQuery(appRenderer, query));
				syncHosts.set(appId, host);
			} catch {
				// SharedArrayBuffer may not be available (missing COOP/COEP headers)
				sharedBuffer = undefined;
			}
		}

		// Handle async query messages from the worker
		if (appTransport) {
			appTransport.onMessage((message: Message) => {
				if (isSystemMessage(message) && message.type === "query") {
					const queryMsg = message as {
						type: "query";
						uid: number;
						nodeId: NodeId;
						query: string;
						property?: string;
					};
					const queryTypeMap: Record<string, QueryType> = {
						boundingRect: QueryType.BoundingRect,
						computedStyle: QueryType.ComputedStyle,
						nodeProperty: QueryType.NodeProperty,
						windowProperty: QueryType.WindowProperty,
					};
					const queryType = queryTypeMap[queryMsg.query] ?? QueryType.NodeProperty;
					const result = handleSyncQuery(appRenderer, {
						queryType,
						data: JSON.stringify({ nodeId: queryMsg.nodeId, property: queryMsg.property }),
					});
					appTransport.send({ type: "queryResult", uid: queryMsg.uid, result });
				}
			});
		}

		// Send init message with shared buffer
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
				state: window.history.state,
			},
			sharedBuffer,
		});

		return appId;
	}

	let devtoolsPanelHandle: { destroy: () => void } | null = null;

	if (config.debug?.exposeDevtools) {
		(globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ = {
			scheduler: {
				pending: () => scheduler.pendingCount,
				stats: () => scheduler.getStats(),
				frameLog: () => scheduler.getFrameLog(),
				flush: () => scheduler.flush(),
				stop: () => scheduler.stop(),
				start: () => scheduler.start(),
			},
			getEventTraces: () => {
				const traces: Array<{
					eventType: string;
					serializeMs: number;
					timestamp: number;
				}> = [];
				for (const bridge of eventBridges.values()) {
					traces.push(...bridge.getEventTraces());
				}
				traces.sort((a, b) => a.timestamp - b.timestamp);
				return traces;
			},
			enableHighlightUpdates: (enabled: boolean) => {
				for (const r of renderers.values()) {
					r.enableHighlightUpdates(enabled);
				}
			},
			findRealNode: (nodeId: number) => {
				for (const r of renderers.values()) {
					const node = r.getNode(nodeId as NodeId);
					if (node) return node;
				}
				return null;
			},
			getListenersForNode: (nodeId: number) => {
				const results: Array<{ listenerId: string; eventName: string }> = [];
				for (const bridge of eventBridges.values()) {
					results.push(...bridge.getListenersForNode(nodeId as NodeId));
				}
				return results;
			},
			debugStats: () => debugStats.snapshot(),
			apps: () => [...renderers.keys()],
			renderers: () => {
				const info: Record<string, unknown> = {};
				for (const [appId, r] of renderers) {
					info[String(appId)] = { root: r.getRoot() };
				}
				return info;
			},
			// Request fresh virtual DOM tree + stats from all worker threads
			refreshDebugData: () => {
				for (const appId of renderers.keys()) {
					requestDebugData(appId);
				}
			},
			// Get cached debug data for a specific app
			getAppData: (appId: string) => debugData.get(appId as AppId),
			// Get transport stats for all apps
			getTransportStats: () => {
				const result: Record<
					string,
					{
						messageCount: number;
						totalBytes: number;
						largestMessageBytes: number;
						lastMessageBytes: number;
					} | null
				> = {};
				for (const appId of renderers.keys()) {
					const transport = threadManager.getTransport(appId);
					result[String(appId)] = transport?.getStats?.() ?? null;
				}
				return result;
			},
			// Get all apps' cached debug data
			getAllAppsData: () => {
				const result: Record<
					string,
					{
						tree: unknown;
						workerStats: unknown;
						perTypeCoalesced: unknown;
						coalescedLog: unknown;
					}
				> = {};
				for (const [appId, data] of debugData) {
					result[String(appId)] = data;
				}
				return result;
			},
			// Replay: apply a single mutation through the renderer
			replayMutation: (mutation: DomMutation, appId: string) => {
				const renderer = renderers.get(appId as AppId);
				if (renderer) {
					renderer.apply(mutation);
				}
			},
			// Replay: clear the renderer's DOM subtree and re-apply mutations up to a given index
			clearAndReapply: (
				mutations: Array<{ mutation: DomMutation; batchUid?: number }>,
				upToIndex: number,
				appId?: string,
			) => {
				// Route to the correct renderer by appId, or fall back to first
				let renderer: DomRenderer | undefined;
				if (appId) {
					renderer = renderers.get(appId as AppId);
				}
				if (!renderer) {
					for (const r of renderers.values()) {
						renderer = r;
						break;
					}
				}
				if (renderer) {
					const root = renderer.getRoot();
					if (root) {
						root.body.textContent = "";
						root.head.textContent = "";
					}
					renderer.clearNodeCache();
					const end = Math.min(upToIndex, mutations.length);
					for (let i = 0; i < end; i++) {
						renderer.apply(mutations[i].mutation, mutations[i].batchUid);
					}
				}
			},
			// Feature 15: Causality graph
			getCausalityTracker: () => causalityTracker,
			// Feature 16: Worker CPU profiler entries
			getWorkerPerfEntries: () => {
				const result: Record<string, PerfEntryData[]> = {};
				for (const [appId, entries] of workerPerfEntries) {
					result[String(appId)] = entries.slice();
				}
				return result;
			},
			// Feature 19: Mutation-to-event correlation
			getMutationCorrelation: () => mutationCorrelation,
		};

		// Inject the in-page devtools panel
		if (typeof document !== "undefined") {
			devtoolsPanelHandle = createDevtoolsPanel();
		}
	}

	console.debug("[async-dom] Initialized", {
		apps: config.worker ? 1 : 0,
		debug: !!config.debug,
		scheduler: config.scheduler ?? "default",
	});

	// Visibility change forwarding
	const visibilityHandler = () => {
		threadManager.broadcast({
			type: "visibility",
			state: document.visibilityState,
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
			for (const r of renderers.values()) {
				r.clear();
			}
			renderers.clear();
			lastRenderer = null;
			lastAppId = null;
			for (const bridge of eventBridges.values()) {
				bridge.detachAll();
			}
			for (const host of syncHosts.values()) {
				host.stopPolling();
			}
			syncHosts.clear();
			document.removeEventListener("visibilitychange", visibilityHandler);
			threadManager.destroyAll();
			if (devtoolsPanelHandle) {
				devtoolsPanelHandle.destroy();
				devtoolsPanelHandle = null;
			}
		},

		addApp(appConfig: AppConfig): AppId {
			return addAppInternal(
				appConfig.worker,
				appConfig.mountPoint,
				appConfig.shadow,
				appConfig.transport,
				appConfig.onError,
				appConfig.name,
			);
		},

		addRemoteApp(remoteConfig: RemoteAppConfig): AppId {
			return addAppInternal(
				undefined,
				remoteConfig.mountPoint,
				remoteConfig.shadow,
				remoteConfig.transport,
				remoteConfig.onError,
				remoteConfig.name,
				remoteConfig.enableSyncChannel,
			);
		},

		removeApp(appId: AppId): void {
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
		},
	};
}

export { FrameScheduler, type SchedulerConfig } from "../core/scheduler.ts";
export { EventBridge } from "./event-bridge.ts";
export {
	type ContentVisibilityConfig,
	DomRenderer,
	type RendererPermissions,
	type RendererRoot,
} from "./renderer.ts";
export type { RemoteConfig, WebSocketConfig, WorkerConfig } from "./thread-manager.ts";
export { ThreadManager } from "./thread-manager.ts";
