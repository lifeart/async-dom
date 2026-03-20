import { _ as SerializedError, f as Message, g as Priority, h as NodeId, i as AppId, s as DomMutation, t as Transport } from "./base.cjs";
import { a as MutationLogEntry, l as WarningLogEntry, n as DebugOptions } from "./debug.cjs";
import { c as WebSocketTransportOptions } from "./worker-transport.cjs";

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
  /** Feature 18: per-app mutation counts and deferred counts per frame */
  perApp?: Map<string, {
    mutations: number;
    deferred: number;
  }>;
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
  private droppedFrameCount;
  private lastWorkerToMainLatencyMs;
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
  /** Record the cross-thread latency from a worker MutationMessage.sentAt */
  recordWorkerLatency(sentAt: number): void;
  getStats(): {
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
 * Supports both forward (NodeId → Node) and reverse (Node → NodeId) lookups.
 */
declare class NodeCache {
  private cache;
  private reverseCache;
  get(id: NodeId): Node | null;
  /** Reverse lookup: get the NodeId for a real DOM node. */
  getId(node: Node): NodeId | null;
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
  listenerId: string;
  serializeMs: number;
  timestamp: number;
  sentAt: number;
  transportMs?: number;
  dispatchMs?: number;
  mutationCount?: number;
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
  private _onTimingResult;
  constructor(appId: AppId, nodeCache?: NodeCache);
  /**
   * Set a callback that is invoked whenever a trace entry is fully
   * populated with worker timing data.  This allows callers (e.g. the
   * devtools debug hooks) to emit EventLogEntry objects.
   */
  set onTimingResult(cb: ((trace: EventTraceEntry) => void) | null);
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
  /**
   * Update the most recent trace entry for a given listener with
   * dispatch and mutation count timing from the worker.
   * Transport time is computed on the main thread to avoid cross-origin
   * timing issues between main thread and worker `performance.now()`.
   */
  updateTraceWithWorkerTiming(listenerId: string, dispatchMs: number, mutationCount: number): void;
  getListenersForNode(nodeId: NodeId): Array<{
    listenerId: string;
    eventName: string;
  }>;
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
  private callMethod;
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
  /** Human-readable name for this app (shown in DevTools instead of a random hash) */
  name?: string;
}
interface WebSocketConfig {
  url: string;
  options?: WebSocketTransportOptions;
  /** Human-readable name for this app (shown in DevTools instead of a random hash) */
  name?: string;
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
  /** Human-readable name for this app (shown in DevTools instead of a random hash) */
  name?: string;
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
export { ThreadManager as a, DomRenderer as c, SchedulerConfig as d, sanitizeHTML as f, createAsyncDom as i, EventBridge as l, AsyncDomConfig as n, WebSocketConfig as o, AsyncDomInstance as r, WorkerConfig as s, AppConfig as t, FrameScheduler as u };
//# sourceMappingURL=index.d.cts.map