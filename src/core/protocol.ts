/**
 * Type-safe message protocol for async-dom communication.
 *
 * All messages between the main thread and worker threads use discriminated
 * unions for compile-time safety and exhaustive switch handling.
 */

/**
 * Branded numeric type for DOM node identifiers.
 * The brand prevents accidental use of plain numbers as NodeIds.
 */
export type NodeId = number & { readonly __brand: "NodeId" };

/** Branded string type identifying an application instance. */
export type AppId = string & { readonly __brand: "AppId" };

/** Branded string type identifying a connected client (for multi-client server mode). */
export type ClientId = string & { readonly __brand: "ClientId" };

/**
 * Reserved structural node IDs.
 * These correspond to the well-known DOM nodes that always exist.
 * Dynamic node IDs start at 11 to avoid collisions.
 */
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

/** Cast a plain string to a branded AppId. */
export function createAppId(id: string): AppId {
	return id as AppId;
}

/** Cast a plain string to a branded ClientId. */
export function createClientId(id: string): ClientId {
	return id as ClientId;
}

/** Standard DOM insertAdjacentHTML position values. */
export type InsertPosition = "beforebegin" | "afterbegin" | "beforeend" | "afterend";

/**
 * Discriminated union of all DOM mutations sent from worker to main thread.
 *
 * Mutation lifecycle:
 * 1. Worker-side VirtualElement/VirtualDocument methods create DomMutation objects
 * 2. Mutations are collected by MutationCollector into batches
 * 3. Batches are wrapped in a MutationMessage and sent via Transport
 * 4. Main-thread FrameScheduler queues and prioritizes mutations
 * 5. DomRenderer.apply() executes each mutation against the real DOM
 *
 * Each variant carries the target node's `id` plus action-specific data.
 * Mutations marked `optional: true` (e.g., style updates) may be dropped
 * by the scheduler under frame budget pressure.
 */
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

/** Convenience union of all possible mutation action string literals. */
export type MutationAction = DomMutation["action"];

/** Scheduler priority level. High-priority mutations are processed first each frame. */
export type Priority = "high" | "normal" | "low";

/**
 * Envelope wrapping a batch of mutations with routing and timing metadata.
 * Sent from worker thread to main thread via Transport.
 */
export interface MutationMessage {
	type: "mutation";
	appId: AppId;
	uid: number;
	mutations: DomMutation[];
	priority?: Priority;
	sentAt?: number;
	/** Causal event that triggered this batch (Feature 15: Causality Graph). */
	causalEvent?: { eventType: string; listenerId: string; timestamp: number };
}

/**
 * Serialized event data sent from main thread to worker.
 * Contains a flat subset of DOM event properties that can be transferred via postMessage.
 * Target and relatedTarget are serialized as NodeId strings, not DOM references.
 */
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

/** Event message sent from main thread to worker to dispatch a DOM event. */
export interface EventMessage {
	type: "event";
	appId: AppId;
	listenerId: string;
	event: SerializedEvent;
	clientId?: ClientId;
}

/** Serialized window.location data sent during app initialization. */
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

/** Serialized error data for cross-thread error reporting, including causal chain via `cause`. */
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

/**
 * System-level control messages exchanged between main thread and worker.
 * Includes lifecycle events (init/ready), sync queries, diagnostics, and multi-client management.
 */
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
	| { type: "debugResult"; query: string; result: unknown }
	| {
			type: "eventTimingResult";
			listenerId: string;
			eventType: string;
			dispatchMs: number;
			mutationCount: number;
			transportMs: number;
	  }
	| { type: "perfEntries"; appId: AppId; entries: PerfEntryData[] }
	| { type: "ping" }
	| { type: "pong" }
	| { type: "ack"; appId: AppId; lastUid: number }
	| { type: "clientConnect"; clientId: ClientId; metadata?: Record<string, unknown> }
	| { type: "clientDisconnect"; clientId: ClientId }
	| { type: "snapshotComplete" };

/** Serialized performance entry sent from worker to main thread (Feature 16). */
export interface PerfEntryData {
	name: string;
	startTime: number;
	duration: number;
	entryType: string;
}

/** Top-level discriminated union of all messages in the async-dom protocol. */
export type Message = MutationMessage | EventMessage | SystemMessage;

/** Type guard: narrows a Message to MutationMessage. */
export function isMutationMessage(msg: Message): msg is MutationMessage {
	return msg.type === "mutation";
}

/** Type guard: narrows a Message to EventMessage. */
export function isEventMessage(msg: Message): msg is EventMessage {
	return msg.type === "event";
}

/** Type guard: narrows a Message to SystemMessage. */
export function isSystemMessage(msg: Message): msg is SystemMessage {
	return !isMutationMessage(msg) && !isEventMessage(msg);
}
