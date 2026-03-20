import { c as DomMutation, f as InsertPosition, g as NodeId, i as AppId, t as Transport } from "./base.js";
import { n as DebugOptions } from "./debug.js";

//#region src/platform.d.ts

/**
 * PlatformHost abstraction for running async-dom in different environments
 * (Web Worker, Node.js, etc.).
 *
 * Only three things need platform abstraction:
 * 1. navigator (userAgent, language, etc.)
 * 2. Error handlers (onerror, onunhandledrejection)
 * 3. beforeunload / shutdown hook
 */
interface PlatformHost {
  navigator: {
    userAgent: string;
    language: string;
    languages: readonly string[];
    hardwareConcurrency: number;
  };
  /**
   * Install global error and unhandled rejection handlers.
   * Returns a cleanup function that removes the handlers.
   */
  installErrorHandlers(onError: (message: string, error?: Error, filename?: string, lineno?: number, colno?: number) => void, onUnhandledRejection: (reason: unknown) => void): () => void;
  /**
   * Register a callback to run before the environment shuts down.
   * Returns a cleanup function that removes the hook.
   */
  onBeforeUnload(callback: () => void): () => void;
}
/**
 * Create a PlatformHost for Web Worker environments (uses `self`).
 */
declare function createWorkerPlatform(): PlatformHost;
/**
 * Create a PlatformHost for Node.js environments (uses `process`).
 */
declare function createNodePlatform(): PlatformHost;
/**
 * Auto-detect the current platform and create the appropriate PlatformHost.
 */
declare function detectPlatform(): PlatformHost;
//# sourceMappingURL=platform.d.ts.map
//#endregion
//#region src/core/sync-channel.d.ts
/**
 * SharedArrayBuffer-based synchronous communication channel.
 *
 * Allows a worker thread to make blocking reads from the main thread
 * using Atomics.wait/notify. Inspired by Partytown's approach.
 *
 * Buffer layout (SharedArrayBuffer):
 *   Int32Array view:
 *     [0] — signal: 0=idle, 1=request-pending, 2=response-ready
 *     [1] — query type enum
 *     [2] — request data length (bytes)
 *     [3] — response data length (bytes)
 *   Uint8Array view at offset 16: request data (JSON-encoded)
 *   Uint8Array view at offset 16+REQUEST_REGION_SIZE: response data (JSON-encoded)
 */
declare enum QueryType {
  BoundingRect = 0,
  ComputedStyle = 1,
  NodeProperty = 2,
  WindowProperty = 3,
}
/**
 * Worker-side synchronous channel.
 * Uses Atomics.wait to block until the main thread responds.
 */
declare class SyncChannel {
  private signal;
  private meta;
  private requestRegion;
  private responseRegion;
  private encoder;
  private decoder;
  private constructor();
  static create(size?: number): {
    channel: SyncChannel;
    buffer: SharedArrayBuffer;
  };
  static fromBuffer(sab: SharedArrayBuffer): SyncChannel;
  /**
   * Send a synchronous request to the main thread and block until response.
   * Returns the parsed response or a fallback value on timeout.
   */
  request(queryType: QueryType, data: string): unknown;
}
/**
 * Main-thread host for the sync channel.
 * Polls for pending requests and writes responses.
 */
//#endregion
//#region src/worker-thread/mutation-collector.d.ts
/** Entry recording a coalesced (eliminated) mutation. */
interface CoalescedLogEntry {
  action: string;
  key: string;
  timestamp: number;
}
/**
 * Collects DOM mutations during synchronous execution and flushes them
 * as a batched message at the end of the current microtask.
 */
declare class MutationCollector {
  private appId;
  private queue;
  private scheduled;
  private uidCounter;
  private transport;
  private _coalesceEnabled;
  private _stats;
  private _coalescedLog;
  private _perTypeCoalesced;
  /** Total mutations added (monotonically increasing counter for diff-based tracking). */
  get totalAdded(): number;
  /** Feature 15: Current causal event tag for this flush cycle */
  private _causalEvent;
  getStats(): {
    added: number;
    coalesced: number;
    flushed: number;
  };
  getCoalescedLog(): CoalescedLogEntry[];
  getPerTypeCoalesced(): Record<string, {
    added: number;
    coalesced: number;
  }>;
  constructor(appId: AppId);
  /** Feature 15: Set the causal event for the current mutation cycle. */
  setCausalEvent(event: {
    eventType: string;
    listenerId: string;
    timestamp: number;
  } | null): void;
  /** Feature 15: Get current causal event. */
  getCausalEvent(): {
    eventType: string;
    listenerId: string;
    timestamp: number;
  } | null;
  enableCoalescing(enabled: boolean): void;
  setTransport(transport: Transport): void;
  add(mutation: DomMutation): void;
  private coalesce;
  private _buildKey;
  flush(): void;
  /** Force-flush all pending mutations immediately */
  flushSync(): void;
  /** Get number of pending mutations (useful for testing) */
  get pendingCount(): number;
}
//# sourceMappingURL=mutation-collector.d.ts.map
//#endregion
//#region src/worker-thread/element.d.ts
type VirtualNode = VirtualElement | VirtualTextNode | VirtualCommentNode;
/**
 * Virtual DOM element that records mutations via the MutationCollector
 * instead of touching real DOM.
 */
declare class VirtualElement {
  private collector;
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly COMMENT_NODE = 8;
  static readonly DOCUMENT_NODE = 9;
  static readonly DOCUMENT_FRAGMENT_NODE = 11;
  readonly _nodeId: NodeId;
  readonly nodeName: string;
  readonly tagName: string;
  readonly nodeType = 1;
  readonly namespaceURI: string;
  parentNode: VirtualElement | null;
  _ownerDocument: VirtualDocument | null;
  childNodes: VirtualNode[];
  private _attributes;
  private _classes;
  private _innerHTML;
  private _textContent;
  private _value;
  private _checked;
  private _disabled;
  private _selectedIndex;
  private _datasetProxy;
  style: Record<string, string>;
  classList: VirtualClassList;
  get id(): string;
  set id(value: string);
  get children(): VirtualElement[];
  get childElementCount(): number;
  get firstElementChild(): VirtualElement | null;
  get lastElementChild(): VirtualElement | null;
  get clientWidth(): number;
  get clientHeight(): number;
  get scrollWidth(): number;
  get scrollHeight(): number;
  get offsetWidth(): number;
  get offsetHeight(): number;
  get offsetTop(): number;
  get offsetLeft(): number;
  get scrollTop(): number;
  set scrollTop(v: number);
  get scrollLeft(): number;
  set scrollLeft(v: number);
  private _readNodeProperty;
  constructor(tag: string, collector: MutationCollector, id?: NodeId);
  _setNamespaceURI(ns: string): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  removeAttribute(name: string): void;
  getAttributeNS(_ns: string | null, name: string): string | null;
  setAttributeNS(_ns: string | null, name: string, value: string): void;
  removeAttributeNS(_ns: string | null, name: string): void;
  get attributes(): {
    length: number;
    item(index: number): {
      name: string;
      value: string;
    } | null;
  };
  appendChild(child: VirtualNode): VirtualNode;
  private _appendSingleChild;
  removeChild(child: VirtualNode): VirtualNode;
  insertBefore(newChild: VirtualNode, refChild: VirtualNode | null): VirtualNode;
  remove(): void;
  append(...nodes: VirtualNode[]): void;
  prepend(...nodes: VirtualNode[]): void;
  replaceWith(...nodes: VirtualNode[]): void;
  before(...nodes: VirtualNode[]): void;
  after(...nodes: VirtualNode[]): void;
  replaceChildren(...nodes: VirtualNode[]): void;
  get textContent(): string;
  set textContent(value: string);
  get innerHTML(): string;
  set innerHTML(value: string);
  get value(): string;
  set value(v: string);
  get checked(): boolean;
  set checked(v: boolean);
  get disabled(): boolean;
  set disabled(v: boolean);
  get selectedIndex(): number;
  set selectedIndex(v: number);
  _updateInputState(state: {
    value?: string;
    checked?: boolean;
    selectedIndex?: number;
  }): void;
  private _currentTime;
  private _duration;
  private _paused;
  private _ended;
  private _readyState;
  get currentTime(): number;
  set currentTime(v: number);
  get duration(): number;
  get paused(): boolean;
  get ended(): boolean;
  get readyState(): number;
  _updateMediaState(state: Record<string, unknown>): void;
  get className(): string;
  set className(value: string);
  private _eventListeners;
  private _listenerEventNames;
  private _onHandlers;
  addEventListener(name: string, callback: (e: unknown) => void, options?: AddEventListenerOptions | boolean): void;
  getEventListener(listenerId: string): ((e: unknown) => void) | undefined;
  removeEventListener(_name: string, callback: (e: unknown) => void): void;
  _dispatchBubbledEvent(event: {
    type: string;
    immediatePropagationStopped?: boolean;
  }): void;
  /**
   * Recursively clean up this element and all children from the document's registries.
   * Called before emitting removal mutations to prevent memory leaks.
   */
  _cleanupFromDocument(): void;
  preventDefaultFor(eventName: string): void;
  private _setOnHandler;
  set onclick(cb: ((e: unknown) => void) | null);
  set ondblclick(cb: ((e: unknown) => void) | null);
  set onmouseenter(cb: ((e: unknown) => void) | null);
  set onmouseleave(cb: ((e: unknown) => void) | null);
  set onmousedown(cb: ((e: unknown) => void) | null);
  set onmouseup(cb: ((e: unknown) => void) | null);
  set onmouseover(cb: ((e: unknown) => void) | null);
  set onmousemove(cb: ((e: unknown) => void) | null);
  set onkeydown(cb: ((e: unknown) => void) | null);
  set onkeyup(cb: ((e: unknown) => void) | null);
  set onkeypress(cb: ((e: unknown) => void) | null);
  set onchange(cb: ((e: unknown) => void) | null);
  set oncontextmenu(cb: ((e: unknown) => void) | null);
  set oninput(cb: ((e: unknown) => void) | null);
  set onfocus(cb: ((e: unknown) => void) | null);
  set onblur(cb: ((e: unknown) => void) | null);
  set onsubmit(cb: ((e: unknown) => void) | null);
  get firstChild(): VirtualNode | null;
  get lastChild(): VirtualNode | null;
  get nextSibling(): VirtualNode | null;
  get previousSibling(): VirtualNode | null;
  get parentElement(): VirtualElement | null;
  get ownerDocument(): VirtualDocument | null;
  get isConnected(): boolean;
  getRootNode(): VirtualNode;
  get nextElementSibling(): VirtualElement | null;
  get previousElementSibling(): VirtualElement | null;
  hasChildNodes(): boolean;
  replaceChild(newChild: VirtualNode, oldChild: VirtualNode): VirtualNode;
  normalize(): void;
  dispatchEvent(event: unknown): boolean;
  cloneNode(deep?: boolean): VirtualElement;
  get dataset(): Record<string, string | undefined>;
  insertAdjacentHTML(position: InsertPosition, html: string): void;
  contains(other: VirtualNode | null): boolean;
  querySelector(selector: string): VirtualElement | null;
  querySelectorAll(selector: string): VirtualElement[];
  matches(selector: string): boolean;
  getElementsByTagName(tagName: string): VirtualElement[];
  getElementsByClassName(className: string): VirtualElement[];
  closest(selector: string): VirtualElement | null;
  focus(): void;
  blur(): void;
  play(): void;
  pause(): void;
  load(): void;
  click(): void;
  scrollIntoView(options?: unknown): void;
  select(): void;
  showModal(): void;
  close(): void;
  getBoundingClientRect(): {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    x: number;
    y: number;
  };
  private _parseAndSetStyles;
}
/**
 * Virtual text node.
 */
declare class VirtualTextNode {
  readonly _nodeId: NodeId;
  private collector;
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly COMMENT_NODE = 8;
  static readonly DOCUMENT_NODE = 9;
  static readonly DOCUMENT_FRAGMENT_NODE = 11;
  readonly nodeType = 3;
  readonly nodeName = "#text";
  parentNode: VirtualElement | null;
  _ownerDocument: VirtualDocument | null;
  private _nodeValue;
  constructor(text: string, _nodeId: NodeId, collector: MutationCollector);
  get parentElement(): VirtualElement | null;
  get nodeValue(): string;
  set nodeValue(value: string);
  get textContent(): string;
  set textContent(value: string);
  get nextSibling(): VirtualNode | null;
  get previousSibling(): VirtualNode | null;
  get childNodes(): VirtualNode[];
  remove(): void;
  cloneNode(_deep?: boolean): VirtualTextNode;
}
/**
 * Virtual comment node.
 */
declare class VirtualCommentNode {
  readonly _nodeId: NodeId;
  private collector;
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly COMMENT_NODE = 8;
  static readonly DOCUMENT_NODE = 9;
  static readonly DOCUMENT_FRAGMENT_NODE = 11;
  readonly nodeType = 8;
  readonly nodeName = "#comment";
  parentNode: VirtualElement | null;
  _ownerDocument: VirtualDocument | null;
  private _nodeValue;
  constructor(text: string, _nodeId: NodeId, collector: MutationCollector);
  get parentElement(): VirtualElement | null;
  get nodeValue(): string;
  set nodeValue(value: string);
  get textContent(): string;
  get nextSibling(): VirtualNode | null;
  get previousSibling(): VirtualNode | null;
  get childNodes(): VirtualNode[];
  remove(): void;
  cloneNode(_deep?: boolean): VirtualCommentNode;
}
declare class VirtualClassList {
  private element;
  constructor(element: VirtualElement);
  add(...names: string[]): void;
  remove(...names: string[]): void;
  contains(name: string): boolean;
  toggle(name: string, force?: boolean): boolean;
  get length(): number;
}
//#endregion
//#region src/worker-thread/document.d.ts
/**
 * Virtual Document that exists in a worker thread.
 * All DOM mutations are recorded and batched via MutationCollector.
 */
declare class VirtualDocument {
  readonly body: VirtualElement;
  readonly head: VirtualElement;
  readonly documentElement: VirtualElement;
  readonly nodeType = 9;
  readonly nodeName = "#document";
  readonly collector: MutationCollector;
  _defaultView: unknown;
  _syncChannel: SyncChannel | null;
  private _title;
  private _cookie;
  private _ids;
  private _nodeIdToElement;
  private _listenerMap;
  private _listenerToElement;
  private _listenerCounter;
  constructor(appId: AppId);
  createElement(tag: string): VirtualElement;
  createElementNS(ns: string, tag: string): VirtualElement;
  createTextNode(text: string): VirtualTextNode;
  createComment(text: string): VirtualCommentNode;
  createDocumentFragment(): VirtualElement;
  getElementById(id: string): VirtualElement | null;
  addEventListener(name: string, callback: (e: unknown) => void): void;
  removeEventListener(_name: string, callback: (e: unknown) => void): void;
  /**
   * Route an event from the main thread to the appropriate listener.
   * Resolves serialized target IDs to actual VirtualElement references.
   */
  private _resolveTarget;
  dispatchEvent(listenerId: string, event: unknown): void;
  /** Feature 16: finish performance measurement for an event dispatch */
  private _finishEventPerf;
  /**
   * Register an element by its internal NodeId.
   */
  registerElement(id: NodeId, element: VirtualElement): void;
  /**
   * Unregister an element by its internal NodeId (called during cleanup on removal).
   */
  unregisterElement(id: NodeId): void;
  /**
   * Register an element by its user-visible id attribute (distinct from internal NodeId).
   */
  registerElementById(id: string, element: VirtualElement): void;
  /**
   * Unregister an element by its user-visible id attribute.
   */
  unregisterElementById(id: string): void;
  /**
   * Register a listener ID to its owning element for O(1) event dispatch.
   */
  registerListener(listenerId: string, element: VirtualElement): void;
  /**
   * Unregister a listener ID (called on removeEventListener or element cleanup).
   */
  unregisterListener(listenerId: string): void;
  createEvent(_type: string): Record<string, unknown>;
  get activeElement(): VirtualElement;
  createRange(): unknown;
  createTreeWalker(root: VirtualElement, _whatToShow?: number): {
    currentNode: VirtualNode;
    nextNode(): VirtualNode | null;
  };
  querySelector(selector: string): VirtualElement | null;
  querySelectorAll(selector: string): VirtualElement[];
  getElementsByTagName(tagName: string): VirtualElement[];
  getElementsByClassName(className: string): VirtualElement[];
  get title(): string;
  set title(value: string);
  get URL(): string;
  get location(): unknown;
  get cookie(): string;
  set cookie(value: string);
  get readyState(): string;
  get compatMode(): string;
  get characterSet(): string;
  get contentType(): string;
  get visibilityState(): string;
  get hidden(): boolean;
  get childNodes(): VirtualNode[];
  get children(): VirtualElement[];
  get firstChild(): VirtualElement;
  contains(node: unknown): boolean;
  get implementation(): {
    hasFeature(): boolean;
  };
  get defaultView(): unknown;
  get ownerDocument(): VirtualDocument;
  /**
   * Clean up all internal state. Called when the worker DOM instance is being destroyed.
   * Clears element registries, listener maps, and resets counters.
   */
  destroy(): void;
  toJSON(): unknown;
  private _serializeNode;
}
//# sourceMappingURL=document.d.ts.map
//#endregion
//#region src/worker-thread/events.d.ts
/**
 * Virtual event classes that simulate DOM event behavior
 * including bubbling, propagation control, and default prevention.
 */
declare class VirtualEvent {
  readonly type: string;
  target: unknown;
  currentTarget: unknown;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  defaultPrevented: boolean;
  readonly timeStamp: number;
  readonly isTrusted: boolean;
  eventPhase: number;
  private _stopPropagation;
  private _stopImmediatePropagation;
  constructor(type: string, init?: Record<string, unknown>);
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
  get propagationStopped(): boolean;
  get immediatePropagationStopped(): boolean;
}
declare class VirtualCustomEvent extends VirtualEvent {
  readonly detail: unknown;
  constructor(type: string, init?: Record<string, unknown>);
}
//# sourceMappingURL=events.d.ts.map
//#endregion
//#region src/worker-thread/observers.d.ts
/**
 * Stub observer classes that prevent crashes when frameworks
 * attempt to use browser observers in a worker context.
 */
declare class VirtualMutationObserver {
  constructor(_callback: (mutations: unknown[], observer: unknown) => void);
  observe(_target: unknown, _options?: unknown): void;
  disconnect(): void;
  takeRecords(): unknown[];
}
declare class VirtualResizeObserver {
  constructor(_callback: (entries: unknown[], observer: unknown) => void);
  observe(_target: unknown, _options?: unknown): void;
  unobserve(_target: unknown): void;
  disconnect(): void;
}
declare class VirtualIntersectionObserver {
  readonly root: null;
  readonly rootMargin = "0px";
  readonly thresholds: readonly number[];
  constructor(_callback: (entries: unknown[], observer: unknown) => void, _options?: unknown);
  observe(_target: unknown): void;
  unobserve(_target: unknown): void;
  disconnect(): void;
  takeRecords(): unknown[];
}
//# sourceMappingURL=observers.d.ts.map
//#endregion
//#region src/worker-thread/storage.d.ts
/**
 * Scoped Storage implementation that can optionally sync with
 * the main thread's real localStorage/sessionStorage via the sync channel.
 *
 * Each worker app gets its own isolated storage with a unique prefix.
 * When a sync channel is available, reads/writes are persisted to the
 * real browser storage on the main thread.
 */
declare class ScopedStorage {
  private cache;
  private prefix;
  private storageType;
  private getSyncChannel;
  private queryType;
  constructor(prefix: string, storageType: "localStorage" | "sessionStorage", getSyncChannel: () => SyncChannel | null, queryType: QueryType);
  private syncCall;
  get length(): number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}
//# sourceMappingURL=storage.d.ts.map
//#endregion
//#region src/worker-thread/index.d.ts
interface WorkerDomConfig {
  appId?: AppId;
  transport?: Transport;
  debug?: DebugOptions;
  sandbox?: boolean | "global" | "eval";
  platform?: PlatformHost;
}
interface WorkerDomResult {
  document: VirtualDocument;
  window: WorkerWindow;
  destroy: () => void;
}
interface WorkerWindow {
  document: VirtualDocument;
  location: WorkerLocation;
  history: WorkerHistory;
  screen: {
    width: number;
    height: number;
  };
  innerWidth: number;
  innerHeight: number;
  localStorage: ScopedStorage;
  sessionStorage: ScopedStorage;
  addEventListener(name: string, callback: (e: unknown) => void): void;
  removeEventListener(name: string, callback: (e: unknown) => void): void;
  scrollTo(x: number, y: number): void;
  getComputedStyle(el: unknown): Record<string, string>;
  requestAnimationFrame(cb: (time: number) => void): number;
  cancelAnimationFrame(id: number): void;
  MutationObserver: typeof VirtualMutationObserver;
  ResizeObserver: typeof VirtualResizeObserver;
  IntersectionObserver: typeof VirtualIntersectionObserver;
  setTimeout: typeof setTimeout;
  setInterval: typeof setInterval;
  clearTimeout: typeof clearTimeout;
  clearInterval: typeof clearInterval;
  queueMicrotask: typeof queueMicrotask;
  performance: typeof performance;
  fetch: typeof fetch | undefined;
  URL: typeof URL;
  URLSearchParams: typeof URLSearchParams;
  console: typeof console;
  btoa: typeof btoa;
  atob: typeof atob;
  navigator: PlatformHost["navigator"];
  Event: typeof VirtualEvent;
  CustomEvent: typeof VirtualCustomEvent;
  Node: {
    ELEMENT_NODE: 1;
    TEXT_NODE: 3;
    COMMENT_NODE: 8;
    DOCUMENT_NODE: 9;
    DOCUMENT_FRAGMENT_NODE: 11;
  };
  HTMLElement: typeof VirtualElement;
  devicePixelRatio: number;
  matchMedia: (query: string) => {
    matches: boolean;
    media: string;
    addEventListener: () => void;
    removeEventListener: () => void;
  };
  getSelection: () => {
    rangeCount: number;
    getRangeAt: () => null;
    addRange: () => void;
    removeAllRanges: () => void;
  };
  dispatchEvent: (event: unknown) => boolean;
  eval: (code: string) => unknown;
}
interface WorkerLocation {
  hash: string;
  href: string;
  port: string;
  host: string;
  origin: string;
  hostname: string;
  pathname: string;
  protocol: string;
  search: string;
  toString(): string;
  assign(url: string): void;
  replace(url: string): void;
  reload(): void;
}
interface WorkerHistory {
  state: unknown;
  pushState(state: unknown, title: string, url: string): void;
  replaceState(state: unknown, title: string, url: string): void;
  back(): void;
  forward(): void;
  go(delta?: number): void;
  length: number;
}
/**
 * Creates a virtual DOM environment inside a Web Worker.
 *
 * Returns a `document` and `window` that can be used by frameworks
 * or vanilla JS. All DOM mutations are automatically collected and
 * sent to the main thread for rendering.
 */
declare function createWorkerDom(config?: WorkerDomConfig): WorkerDomResult;
//#endregion
export { ScopedStorage as a, VirtualElement as c, MutationCollector as d, PlatformHost as f, detectPlatform as h, createWorkerDom as i, VirtualNode as l, createWorkerPlatform as m, WorkerDomResult as n, VirtualDocument as o, createNodePlatform as p, WorkerWindow as r, VirtualCommentNode as s, WorkerDomConfig as t, VirtualTextNode as u };
//# sourceMappingURL=index3.d.ts.map