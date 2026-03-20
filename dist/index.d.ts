import { _ as SerializedEvent, a as DOCUMENT_NODE_ID, b as createAppId, c as HEAD_NODE_ID, d as Message, f as MutationAction, g as SerializedError, h as Priority, i as BODY_NODE_ID, l as HTML_NODE_ID, m as NodeId, n as TransportReadyState, o as DomMutation, p as MutationMessage, r as AppId, s as EventMessage, t as Transport, v as SerializedLocation, x as createNodeId, y as SystemMessage } from "./base.js";
import { a as MutationLogEntry, c as WarningCode, i as EventLogEntry, l as WarningLogEntry, n as DebugOptions, o as SchedulerLogEntry, r as DebugStats, s as SyncReadLogEntry, t as DebugLogger } from "./debug.js";
import { a as decodeBinaryMessage, c as WebSocketTransportOptions, i as BinaryWorkerTransport, n as WorkerTransport, o as encodeBinaryMessage, r as BinaryWorkerSelfTransport, t as WorkerSelfTransport } from "./worker-transport.js";

//#region src/core/html-sanitizer.d.ts

/**
 * Lightweight HTML sanitizer for async-dom.
 *
 * Strips dangerous tags and attributes to prevent XSS when
 * worker-provided HTML is injected via innerHTML or insertAdjacentHTML.
 */
/**
 * Sanitize an HTML string by removing dangerous tags and attributes.
 *
 * Uses the browser's DOMParser to parse the HTML, walks the resulting tree,
 * and removes any elements/attributes that could execute scripts or load
 * external resources in a dangerous way.
 */
declare function sanitizeHTML(html: string): string;
//# sourceMappingURL=html-sanitizer.d.ts.map
//#endregion
//#region src/core/scheduler.d.ts
interface SchedulerConfig {
  frameBudgetMs?: number;
  enableViewportCulling?: boolean;
  enablePrioritySkipping?: boolean;
}
interface FrameLogEntry {
  frameId: number;
  totalMs: number;
  actionCount: number;
  timingBreakdown: Map<string, number>;
}
type MutationApplier = (mutation: DomMutation, appId: AppId, batchUid?: number) => void;
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
declare class FrameScheduler {
  private queue;
  private actionTimes;
  private frameId;
  private running;
  private rafId;
  private uidCounter;
  private timePerLastFrame;
  private totalActionsLastFrame;
  private isScrolling;
  private scrollTimer;
  private scrollAbort;
  private viewportHeight;
  private viewportWidth;
  private boundingRectCache;
  private boundingRectCacheFrame;
  private readonly frameBudgetMs;
  private readonly enableViewportCulling;
  private readonly enablePrioritySkipping;
  private applier;
  private appCount;
  private appBudgets;
  private lastTickTime;
  private healthCheckTimer;
  private queueOverflowWarned;
  private lastEnqueueTime;
  private frameLog;
  constructor(config?: SchedulerConfig);
  setApplier(applier: MutationApplier): void;
  setAppCount(count: number): void;
  enqueue(mutations: DomMutation[], appId: AppId, priority?: Priority, batchUid?: number): void;
  start(): void;
  private scheduleFrame;
  stop(): void;
  clearViewportCache(): void;
  flush(): void;
  get pendingCount(): number;
  getStats(): {
    pending: number;
    frameId: number;
    lastFrameTimeMs: number;
    lastFrameActions: number;
    isRunning: boolean;
    lastTickTime: number;
    enqueueToApplyMs: number;
  };
  getFrameLog(): FrameLogEntry[];
  private tick;
  private scheduleNext;
  private getActionsForFrame;
  private shouldSkip;
  private recordTiming;
  private getAvgActionTime;
  private calcViewportSize;
  isInViewport(elem: Element): boolean;
  private setupScrollListener;
}
//# sourceMappingURL=scheduler.d.ts.map
//#endregion
//#region src/core/node-cache.d.ts
/**
 * Cache for mapping NodeIds to real DOM nodes on the main thread.
 */
declare class NodeCache {
  private cache;
  get(id: NodeId): Node | null;
  set(id: NodeId, node: Node): void;
  delete(id: NodeId): void;
  clear(): void;
  has(id: NodeId): boolean;
}
//# sourceMappingURL=node-cache.d.ts.map
//#endregion
//#region src/main-thread/event-bridge.d.ts
interface EventTraceEntry {
  eventType: string;
  serializeMs: number;
  timestamp: number;
}
/**
 * Bridges real DOM events on the main thread to the worker thread.
 * Uses AbortController for clean listener removal.
 */
declare class EventBridge {
  private listeners;
  private eventConfig;
  private nodeCache;
  private transport;
  private appId;
  private eventTraces;
  constructor(appId: AppId, nodeCache?: NodeCache);
  setTransport(transport: Transport): void;
  setNodeCache(nodeCache: NodeCache): void;
  configureEvent(nodeId: NodeId, eventName: string, config: {
    preventDefault: boolean;
    passive?: boolean;
  }): void;
  attach(nodeId: NodeId, eventName: string, listenerId: string): void;
  detach(listenerId: string): void;
  detachByNodeId(nodeId: NodeId): void;
  getEventTraces(): EventTraceEntry[];
  detachAll(): void;
  private _isPassiveForListener;
}
//# sourceMappingURL=event-bridge.d.ts.map
//#endregion
//#region src/main-thread/renderer.d.ts
interface RendererPermissions {
  allowHeadAppend: boolean;
  allowBodyAppend: boolean;
  allowNavigation: boolean;
  allowScroll: boolean;
  allowUnsafeHTML: boolean;
  additionalAllowedProperties?: string[];
}
interface RendererRoot {
  body: Element | ShadowRoot;
  head: Element | ShadowRoot;
  html: Element;
}
/**
 * Applies DOM mutations to the real DOM.
 * Stateless except for the node cache mapping NodeIds to DOM nodes.
 */
declare class DomRenderer {
  private nodeCache;
  private permissions;
  private root;
  private _additionalAllowedProperties;
  onNodeRemoved: ((id: NodeId) => void) | null;
  private _onWarning;
  private _onMutation;
  private highlightEnabled;
  setDebugHooks(hooks: {
    onWarning?: ((e: WarningLogEntry) => void) | null;
    onMutation?: ((e: MutationLogEntry) => void) | null;
  }): void;
  enableHighlightUpdates(enabled: boolean): void;
  private highlightNode;
  constructor(nodeCache?: NodeCache, permissions?: Partial<RendererPermissions>, root?: RendererRoot);
  apply(mutation: DomMutation, batchUid?: number): void;
  getNode(id: NodeId): Node | null;
  clear(): void;
  getRoot(): RendererRoot;
  private createNode;
  private createComment;
  private appendChild;
  private removeNode;
  private removeChild;
  private insertBefore;
  private setAttribute;
  private removeAttribute;
  private setStyle;
  private setProperty;
  private setTextContent;
  private setClassName;
  private setHTML;
  private insertAdjacentHTML;
  private headAppendChild;
  private bodyAppendChild;
  /**
   * Notify onNodeRemoved for a node and all its descendants.
   * This ensures EventBridge detaches listeners on the entire subtree.
   */
  private _cleanupSubtreeListeners;
}
//# sourceMappingURL=renderer.d.ts.map
//#endregion
//#region src/main-thread/thread-manager.d.ts
interface WorkerConfig {
  worker: Worker;
  transport?: Transport;
}
interface WebSocketConfig {
  url: string;
  options?: WebSocketTransportOptions;
}
/**
 * Manages multiple worker/WebSocket connections, routing messages
 * between the main thread and isolated app threads.
 */
declare class ThreadManager {
  private threads;
  private messageHandlers;
  createWorkerThread(config: WorkerConfig): AppId;
  createWebSocketThread(config: WebSocketConfig): AppId;
  sendToThread(appId: AppId, message: Message): void;
  broadcast(message: Message): void;
  destroyThread(appId: AppId): void;
  destroyAll(): void;
  onMessage(handler: (appId: AppId, message: Message) => void): void;
  getTransport(appId: AppId): Transport | null;
  private notifyHandlers;
}
//# sourceMappingURL=thread-manager.d.ts.map
//#endregion
//#region src/main-thread/index.d.ts
interface AsyncDomConfig {
  target: Element;
  worker?: Worker;
  scheduler?: SchedulerConfig;
  debug?: DebugOptions;
}
interface AppConfig {
  worker: Worker;
  mountPoint?: string | Element;
  shadow?: boolean | ShadowRootInit;
  transport?: Transport;
  onError?: (error: SerializedError, appId: AppId) => void;
}
interface AsyncDomInstance {
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
declare function createAsyncDom(config: AsyncDomConfig): AsyncDomInstance;
//#endregion
export { type AppConfig, type AppId, type AsyncDomConfig, type AsyncDomInstance, BODY_NODE_ID, BinaryWorkerSelfTransport, BinaryWorkerTransport, DOCUMENT_NODE_ID, type DebugLogger, type DebugOptions, DebugStats, type DomMutation, DomRenderer, EventBridge, type EventLogEntry, type EventMessage, FrameScheduler, HEAD_NODE_ID, HTML_NODE_ID, type Message, type MutationAction, type MutationLogEntry, type MutationMessage, type NodeId, type Priority, type SchedulerConfig, type SchedulerLogEntry, type SerializedError, type SerializedEvent, type SerializedLocation, type SyncReadLogEntry, type SystemMessage, ThreadManager, type Transport, type TransportReadyState, WarningCode, type WarningLogEntry, type WebSocketConfig, type WorkerConfig, WorkerSelfTransport, WorkerTransport, createAppId, createAsyncDom, createNodeId, decodeBinaryMessage, encodeBinaryMessage, sanitizeHTML };
//# sourceMappingURL=index.d.ts.map