/**
 * Type-safe message protocol for async-dom communication.
 *
 * All messages between the main thread and worker threads use discriminated
 * unions for compile-time safety and exhaustive switch handling.
 */

// Branded types for type safety
export type NodeId = number & { readonly __brand: "NodeId" };
export type AppId = string & { readonly __brand: "AppId" };

// Reserved structural node IDs
export const BODY_NODE_ID = 1 as NodeId;
export const HEAD_NODE_ID = 2 as NodeId;
export const HTML_NODE_ID = 3 as NodeId;
export const DOCUMENT_NODE_ID = 4 as NodeId;

let _nodeIdCounter = 10; // Start after reserved IDs

/**
 * Create a new unique numeric NodeId (auto-incremented).
 */
export function createNodeId(): NodeId {
	return ++_nodeIdCounter as NodeId;
}

/**
 * Reset the node ID counter (for testing only).
 */
export function _resetNodeIdCounter(): void {
	_nodeIdCounter = 10;
}

export function createAppId(id: string): AppId {
	return id as AppId;
}

export type InsertPosition = "beforebegin" | "afterbegin" | "beforeend" | "afterend";

// Worker → Main thread mutations
export type DomMutation =
	| { action: "createNode"; id: NodeId; tag: string; textContent?: string }
	| { action: "createComment"; id: NodeId; textContent: string }
	| { action: "appendChild"; id: NodeId; childId: NodeId }
	| { action: "removeNode"; id: NodeId }
	| { action: "removeChild"; id: NodeId; childId: NodeId }
	| {
			action: "insertBefore";
			id: NodeId;
			newId: NodeId;
			refId: NodeId | null;
	  }
	| {
			action: "setAttribute";
			id: NodeId;
			name: string;
			value: string;
			optional?: boolean;
	  }
	| { action: "removeAttribute"; id: NodeId; name: string }
	| {
			action: "setStyle";
			id: NodeId;
			property: string;
			value: string;
			optional?: boolean;
	  }
	| { action: "setProperty"; id: NodeId; property: string; value: unknown }
	| { action: "setTextContent"; id: NodeId; textContent: string }
	| { action: "setClassName"; id: NodeId; name: string }
	| { action: "setHTML"; id: NodeId; html: string }
	| {
			action: "addEventListener";
			id: NodeId;
			name: string;
			listenerId: string;
	  }
	| { action: "headAppendChild"; id: NodeId }
	| { action: "bodyAppendChild"; id: NodeId }
	| { action: "pushState"; state: unknown; title: string; url: string }
	| { action: "replaceState"; state: unknown; title: string; url: string }
	| { action: "scrollTo"; x: number; y: number }
	| { action: "insertAdjacentHTML"; id: NodeId; position: InsertPosition; html: string }
	| {
			action: "configureEvent";
			id: NodeId;
			name: string;
			preventDefault: boolean;
			passive?: boolean;
	  }
	| { action: "removeEventListener"; id: NodeId; listenerId: string }
	| { action: "callMethod"; id: NodeId; method: string; args: unknown[] };

export type MutationAction = DomMutation["action"];

export type Priority = "high" | "normal" | "low";

// Envelope wrapping mutations with metadata
export interface MutationMessage {
	type: "mutation";
	appId: AppId;
	uid: number;
	mutations: DomMutation[];
	priority?: Priority;
}

// Serialized event data sent from main thread to worker
export interface SerializedEvent {
	type: string;
	target: string | null;
	currentTarget: string | null;
	// Mouse event properties
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
	// Keyboard event properties
	key?: string;
	code?: string;
	keyCode?: number;
	// Modifier keys
	altKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	shiftKey?: boolean;
	// Common properties
	bubbles?: boolean;
	cancelable?: boolean;
	composed?: boolean;
	detail?: number;
	eventPhase?: number;
	isTrusted?: boolean;
	timeStamp?: number;
	// Input event properties
	data?: string;
	inputType?: string;
	// Related target
	relatedTarget?: string | null;
	// Wheel event properties
	deltaX?: number;
	deltaY?: number;
	deltaZ?: number;
	deltaMode?: number;
	// Input state synchronization
	value?: string;
	checked?: boolean;
	selectedIndex?: number;
	// Media element state
	currentTime?: number;
	duration?: number;
	paused?: boolean;
	ended?: boolean;
	readyState?: number;
}

// Main thread → Worker events
export interface EventMessage {
	type: "event";
	appId: AppId;
	listenerId: string;
	event: SerializedEvent;
}

// Serialized location data
export interface SerializedLocation {
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

// Serialized error data
export interface SerializedError {
	message: string;
	stack?: string;
	name?: string;
	cause?: SerializedError;
	filename?: string;
	lineno?: number;
	colno?: number;
	isUnhandledRejection?: boolean;
}

// System messages
export type SystemMessage =
	| { type: "init"; appId: AppId; location: SerializedLocation; sharedBuffer?: SharedArrayBuffer }
	| { type: "ready"; appId: AppId }
	| { type: "error"; appId: AppId; error: SerializedError }
	| { type: "visibility"; state: "visible" | "hidden" | "prerender" }
	| {
			type: "query";
			appId: AppId;
			uid: number;
			nodeId: NodeId;
			query: "boundingRect" | "computedStyle" | "nodeProperty" | "windowProperty";
			property?: string;
	  }
	| { type: "queryResult"; uid: number; result: unknown }
	| { type: "debugQuery"; query: string }
	| { type: "debugResult"; query: string; result: unknown };

export type Message = MutationMessage | EventMessage | SystemMessage;

// Type guards
export function isMutationMessage(msg: Message): msg is MutationMessage {
	return msg.type === "mutation";
}

export function isEventMessage(msg: Message): msg is EventMessage {
	return msg.type === "event";
}

export function isSystemMessage(msg: Message): msg is SystemMessage {
	return !isMutationMessage(msg) && !isEventMessage(msg);
}
