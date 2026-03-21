// Main package entry — re-exports the main thread API

// Re-export debug types
export type {
	DebugLogger,
	DebugOptions,
	EventLogEntry,
	MutationLogEntry,
	SchedulerLogEntry,
	SyncReadLogEntry,
	WarningLogEntry,
} from "./core/debug.ts";
export { DebugStats, WarningCode } from "./core/debug.ts";
// Re-export HTML sanitizer
export { sanitizeHTML } from "./core/html-sanitizer.ts";
// Re-export core types used across both threads
export type {
	AppId,
	ClientId,
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
export {
	BODY_NODE_ID,
	createAppId,
	createClientId,
	createNodeId,
	DOCUMENT_NODE_ID,
	HEAD_NODE_ID,
	HTML_NODE_ID,
} from "./core/protocol.ts";
export {
	type AppConfig,
	type AsyncDomConfig,
	type AsyncDomInstance,
	type ContentVisibilityConfig,
	createAsyncDom,
	DomRenderer,
	EventBridge,
	FrameScheduler,
	type RemoteAppConfig,
	type RemoteConfig,
	type RendererPermissions,
	type RendererRoot,
	type SchedulerConfig,
	ThreadManager,
	type WebSocketConfig,
	type WorkerConfig,
} from "./main-thread/index.ts";

// Re-export transport base interface and implementations
export type { Transport, TransportReadyState, TransportStats } from "./transport/base.ts";
export {
	BinaryWorkerSelfTransport,
	BinaryWorkerTransport,
	decodeBinaryMessage,
	encodeBinaryMessage,
} from "./transport/binary-worker-transport.ts";
export { WorkerSelfTransport, WorkerTransport } from "./transport/worker-transport.ts";
