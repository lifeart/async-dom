import type { DebugOptions } from "../core/debug.ts";
import { resolveDebugHooks } from "../core/debug.ts";
import { NodeCache } from "../core/node-cache.ts";
import type { AppId, DomMutation, Message, NodeId } from "../core/protocol.ts";
import { createNodeId, isMutationMessage, isSystemMessage } from "../core/protocol.ts";
import { FrameScheduler, type SchedulerConfig } from "../core/scheduler.ts";
import { QueryType, SyncChannelHost } from "../core/sync-channel.ts";
import { EventBridge } from "./event-bridge.ts";
import { DomRenderer, type RendererRoot } from "./renderer.ts";
import { ThreadManager } from "./thread-manager.ts";

export interface AsyncDomConfig {
	target: Element;
	worker?: Worker;
	scheduler?: SchedulerConfig;
	debug?: DebugOptions;
}

export interface AppConfig {
	worker: Worker;
	mountPoint?: string | Element;
	shadow?: boolean | ShadowRootInit;
	transport?: import("../transport/base.ts").Transport;
	onError?: (error: import("../core/protocol.ts").SerializedError, appId: AppId) => void;
}

export interface AsyncDomInstance {
	start(): void;
	stop(): void;
	destroy(): void;
	addApp(config: AppConfig): AppId;
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

	// Per-app DomRenderer map (each has its own NodeCache)
	const renderers = new Map<AppId, DomRenderer>();
	let lastRenderer: DomRenderer | null = null;
	let lastAppId: AppId | null = null;

	function handleSyncQuery(
		appRenderer: DomRenderer,
		query: { queryType: QueryType; data: string },
	): unknown {
		try {
			const parsed = JSON.parse(query.data);
			const nodeId = parsed.nodeId;
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
					return (window as unknown as Record<string, unknown>)[property] ?? null;
				}
				default:
					return null;
			}
		} catch {
			return null;
		}
	}

	// Wire scheduler to renderer — appId is used to route mutations
	// to the correct per-app renderer and event bridge
	scheduler.setApplier((mutation: DomMutation, appId: AppId) => {
		// Handle addEventListener specially — route to the owning app's EventBridge
		if (mutation.action === "addEventListener") {
			const bridge = eventBridges.get(appId);
			if (bridge) {
				bridge.attach(mutation.id, mutation.name, mutation.listenerId);
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
			renderer.apply(mutation);
		}
	});

	// Handle incoming messages from workers
	threadManager.onMessage((appId: AppId, message: Message) => {
		if (isMutationMessage(message)) {
			scheduler.enqueue(message.mutations, appId, message.priority ?? "normal");
		}
	});

	// If a worker was provided in config, add it as the first app
	if (config.worker) {
		addAppInternal(config.worker);
	}

	function addAppInternal(
		worker: Worker,
		mountPoint?: string | Element,
		shadow?: boolean | ShadowRootInit,
		customTransport?: import("../transport/base.ts").Transport,
		onError?: (error: import("../core/protocol.ts").SerializedError, appId: AppId) => void,
	): AppId {
		const appId = threadManager.createWorkerThread({ worker, transport: customTransport });

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

		if (debugHooks.onWarning || debugHooks.onMutation) {
			appRenderer.setDebugHooks({
				onWarning: debugHooks.onWarning,
				onMutation: debugHooks.onMutation,
			});
		}

		// Seed structural nodes
		if (rendererRoot) {
			appNodeCache.set(createNodeId("body-node"), rendererRoot.body as unknown as Node);
			appNodeCache.set(createNodeId("head-node"), rendererRoot.head as unknown as Node);
			appNodeCache.set(createNodeId("async-html"), rendererRoot.html);
		}

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

			appTransport.onError = (error: Error) => {
				onError?.({ message: error.message, stack: error.stack, name: error.name }, appId);
			};

			appTransport.onClose = () => {
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
				}
			});
		}
		eventBridges.set(appId, bridge);
		scheduler.setAppCount(renderers.size);

		// Create sync channel for synchronous DOM reads
		let sharedBuffer: SharedArrayBuffer | undefined;
		if (typeof SharedArrayBuffer !== "undefined") {
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
						nodeId: string;
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

	if (config.debug?.exposeDevtools) {
		(globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ = {
			scheduler: {
				pending: () => scheduler.pendingCount,
			},
			findRealNode: (nodeId: string) => {
				for (const r of renderers.values()) {
					const node = r.getNode(nodeId as NodeId);
					if (node) return node;
				}
				return null;
			},
			apps: () => [...renderers.keys()],
		};
	}

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
		},

		addApp(appConfig: AppConfig): AppId {
			return addAppInternal(
				appConfig.worker,
				appConfig.mountPoint,
				appConfig.shadow,
				appConfig.transport,
				appConfig.onError,
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
export { DomRenderer, type RendererPermissions, type RendererRoot } from "./renderer.ts";
export type { WebSocketConfig, WorkerConfig } from "./thread-manager.ts";
export { ThreadManager } from "./thread-manager.ts";
