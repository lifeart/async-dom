// Main package entry — re-exports the main thread API

// Re-export core types used across both threads
export type {
	AppId,
	DomMutation,
	EventMessage,
	Message,
	MutationAction,
	MutationMessage,
	NodeId,
	Priority,
	SerializedError,
	SerializedEvent,
	SerializedLocation,
	SystemMessage,
} from "./core/protocol.ts";
export { createAppId, createNodeId } from "./core/protocol.ts";
export {
	type AppConfig,
	type AsyncDomConfig,
	type AsyncDomInstance,
	createAsyncDom,
	DomRenderer,
	EventBridge,
	FrameScheduler,
	type SchedulerConfig,
	ThreadManager,
	type WebSocketConfig,
	type WorkerConfig,
} from "./main-thread/index.ts";

// Re-export transport base interface
export type { Transport, TransportReadyState } from "./transport/base.ts";
