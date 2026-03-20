import { m as NodeId, o as DomMutation, r as AppId, t as Transport, u as InsertPosition } from "./base.js";
import { n as DebugOptions } from "./debug.js";

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
  remove(): void;
  cloneNode(_deep?: boolean): VirtualCommentNode;
}
declare class VirtualClassList {
  private element;
  constructor(element: VirtualElement);
  add(name: string): void;
  remove(name: string): void;
  contains(name: string): boolean;
  toggle(name: string, force?: boolean): boolean;
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
  get defaultView(): unknown;
  get ownerDocument(): VirtualDocument;
  toJSON(): unknown;
  private _serializeNode;
}
//# sourceMappingURL=document.d.ts.map
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
//#region src/worker-thread/index.d.ts
interface WorkerDomConfig {
  appId?: AppId;
  transport?: Transport;
  debug?: DebugOptions;
}
interface WorkerDomResult {
  document: VirtualDocument;
  window: WorkerWindow;
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
  localStorage: WorkerLocalStorage;
  addEventListener(name: string, callback: (e: unknown) => void): void;
  removeEventListener(name: string, callback: (e: unknown) => void): void;
  scrollTo(x: number, y: number): void;
  getComputedStyle(el: unknown): Record<string, string>;
  requestAnimationFrame(cb: (time: number) => void): number;
  cancelAnimationFrame(id: number): void;
  MutationObserver: typeof VirtualMutationObserver;
  ResizeObserver: typeof VirtualResizeObserver;
  IntersectionObserver: typeof VirtualIntersectionObserver;
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
}
interface WorkerHistory {
  state: unknown;
  pushState(state: unknown, title: string, url: string): void;
  replaceState(state: unknown, title: string, url: string): void;
}
interface WorkerLocalStorage {
  setItem(key: string, value: string): void;
  getItem(key: string): string | null;
  removeItem(key: string): void;
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
export { MutationCollector, VirtualCommentNode, VirtualDocument, VirtualElement, type VirtualNode, VirtualTextNode, WorkerDomConfig, WorkerDomResult, WorkerWindow, createWorkerDom };
//# sourceMappingURL=worker.d.ts.map