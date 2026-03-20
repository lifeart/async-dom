//#region src/core/protocol.d.ts
/**
 * Type-safe message protocol for async-dom communication.
 *
 * All messages between the main thread and worker threads use discriminated
 * unions for compile-time safety and exhaustive switch handling.
 */
type NodeId = number & {
  readonly __brand: "NodeId";
};
type AppId = string & {
  readonly __brand: "AppId";
};
declare const BODY_NODE_ID: NodeId;
declare const HEAD_NODE_ID: NodeId;
declare const HTML_NODE_ID: NodeId;
declare const DOCUMENT_NODE_ID: NodeId;
/**
 * Create a new unique numeric NodeId (auto-incremented).
 */
declare function createNodeId(): NodeId;
/**
 * Reset the node ID counter (for testing only).
 */

declare function createAppId(id: string): AppId;
type InsertPosition = "beforebegin" | "afterbegin" | "beforeend" | "afterend";
type DomMutation = {
  action: "createNode";
  id: NodeId;
  tag: string;
  textContent?: string;
} | {
  action: "createComment";
  id: NodeId;
  textContent: string;
} | {
  action: "appendChild";
  id: NodeId;
  childId: NodeId;
} | {
  action: "removeNode";
  id: NodeId;
} | {
  action: "removeChild";
  id: NodeId;
  childId: NodeId;
} | {
  action: "insertBefore";
  id: NodeId;
  newId: NodeId;
  refId: NodeId | null;
} | {
  action: "setAttribute";
  id: NodeId;
  name: string;
  value: string;
  optional?: boolean;
} | {
  action: "removeAttribute";
  id: NodeId;
  name: string;
} | {
  action: "setStyle";
  id: NodeId;
  property: string;
  value: string;
  optional?: boolean;
} | {
  action: "setProperty";
  id: NodeId;
  property: string;
  value: unknown;
} | {
  action: "setTextContent";
  id: NodeId;
  textContent: string;
} | {
  action: "setClassName";
  id: NodeId;
  name: string;
} | {
  action: "setHTML";
  id: NodeId;
  html: string;
} | {
  action: "addEventListener";
  id: NodeId;
  name: string;
  listenerId: string;
} | {
  action: "headAppendChild";
  id: NodeId;
} | {
  action: "bodyAppendChild";
  id: NodeId;
} | {
  action: "pushState";
  state: unknown;
  title: string;
  url: string;
} | {
  action: "replaceState";
  state: unknown;
  title: string;
  url: string;
} | {
  action: "scrollTo";
  x: number;
  y: number;
} | {
  action: "insertAdjacentHTML";
  id: NodeId;
  position: InsertPosition;
  html: string;
} | {
  action: "configureEvent";
  id: NodeId;
  name: string;
  preventDefault: boolean;
  passive?: boolean;
} | {
  action: "removeEventListener";
  id: NodeId;
  listenerId: string;
} | {
  action: "callMethod";
  id: NodeId;
  method: string;
  args: unknown[];
};
type MutationAction = DomMutation["action"];
type Priority = "high" | "normal" | "low";
interface MutationMessage {
  type: "mutation";
  appId: AppId;
  uid: number;
  mutations: DomMutation[];
  priority?: Priority;
  sentAt?: number;
  /** Causal event that triggered this batch (Feature 15: Causality Graph). */
  causalEvent?: {
    eventType: string;
    listenerId: string;
    timestamp: number;
  };
}
interface SerializedEvent {
  type: string;
  target: string | null;
  currentTarget: string | null;
  clientX?: number;
  clientY?: number;
  pageX?: number;
  pageY?: number;
  screenX?: number;
  screenY?: number;
  offsetX?: number;
  offsetY?: number;
  button?: number;
  buttons?: number;
  key?: string;
  code?: string;
  keyCode?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
  detail?: number;
  eventPhase?: number;
  isTrusted?: boolean;
  timeStamp?: number;
  data?: string;
  inputType?: string;
  relatedTarget?: string | null;
  deltaX?: number;
  deltaY?: number;
  deltaZ?: number;
  deltaMode?: number;
  value?: string;
  checked?: boolean;
  selectedIndex?: number;
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  ended?: boolean;
  readyState?: number;
}
interface EventMessage {
  type: "event";
  appId: AppId;
  listenerId: string;
  event: SerializedEvent;
}
interface SerializedLocation {
  hash: string;
  href: string;
  port: string;
  host: string;
  origin: string;
  hostname: string;
  pathname: string;
  protocol: string;
  search: string;
  state: unknown;
}
interface SerializedError {
  message: string;
  stack?: string;
  name?: string;
  cause?: SerializedError;
  filename?: string;
  lineno?: number;
  colno?: number;
  isUnhandledRejection?: boolean;
}
type SystemMessage = {
  type: "init";
  appId: AppId;
  location: SerializedLocation;
  sharedBuffer?: SharedArrayBuffer;
} | {
  type: "ready";
  appId: AppId;
} | {
  type: "error";
  appId: AppId;
  error: SerializedError;
} | {
  type: "visibility";
  state: "visible" | "hidden" | "prerender";
} | {
  type: "query";
  appId: AppId;
  uid: number;
  nodeId: NodeId;
  query: "boundingRect" | "computedStyle" | "nodeProperty" | "windowProperty";
  property?: string;
} | {
  type: "queryResult";
  uid: number;
  result: unknown;
} | {
  type: "debugQuery";
  query: string;
} | {
  type: "debugResult";
  query: string;
  result: unknown;
} | {
  type: "eventTimingResult";
  listenerId: string;
  eventType: string;
  dispatchMs: number;
  mutationCount: number;
  transportMs: number;
} | {
  type: "perfEntries";
  appId: AppId;
  entries: PerfEntryData[];
};
/** Serialized performance entry sent from worker to main thread (Feature 16). */
interface PerfEntryData {
  name: string;
  startTime: number;
  duration: number;
  entryType: string;
}
type Message = MutationMessage | EventMessage | SystemMessage;
//#endregion
//#region src/transport/base.d.ts
type TransportReadyState = "connecting" | "open" | "closed";
interface TransportStats {
  messageCount: number;
  totalBytes: number;
  largestMessageBytes: number;
  lastMessageBytes: number;
}
interface Transport {
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  readonly readyState: TransportReadyState;
  onError?: (error: Error) => void;
  onClose?: () => void;
  getStats?(): TransportStats;
  enableStats?(enabled: boolean): void;
}
//# sourceMappingURL=base.d.ts.map

//#endregion
export { createNodeId as S, SerializedError as _, BODY_NODE_ID as a, SystemMessage as b, EventMessage as c, InsertPosition as d, Message as f, Priority as g, NodeId as h, AppId as i, HEAD_NODE_ID as l, MutationMessage as m, TransportReadyState as n, DOCUMENT_NODE_ID as o, MutationAction as p, TransportStats as r, DomMutation as s, Transport as t, HTML_NODE_ID as u, SerializedEvent as v, createAppId as x, SerializedLocation as y };
//# sourceMappingURL=base.d.cts.map