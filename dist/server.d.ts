import { h as MutationMessage, n as TransportReadyState, o as ClientId, p as Message, t as Transport } from "./base.js";
import { n as WebSocketServerTransport, t as WebSocketLike } from "./ws-server-transport.js";
import { n as WorkerDomResult, t as WorkerDomConfig } from "./index3.js";

//#region src/server/runner.d.ts
interface ServerAppOptions {
  transport: Transport;
  appModule: (dom: WorkerDomResult) => void | Promise<void>;
}
/**
 * Creates a server-side async-dom app instance.
 *
 * Wraps `createWorkerDom` with the provided transport and runs the user's
 * app module. Returns a destroy handle for cleanup on disconnect.
 *
 * Note: No SharedArrayBuffer is used — the async query fallback is used instead.
 */
declare function createServerApp(options: ServerAppOptions): {
  destroy: () => void;
  ready: Promise<void>;
};
//# sourceMappingURL=runner.d.ts.map
//#endregion
//#region src/server/mutation-log.d.ts
interface MutationLogConfig {
  maxEntries?: number;
}
/**
 * Ring buffer that stores recent MutationMessages for replay to new clients.
 *
 * Uses a fixed-capacity circular buffer with O(1) append and O(n) replay,
 * avoiding the O(n) cost of Array.shift() for eviction.
 */
declare class MutationLog {
  private buffer;
  private head;
  private count;
  private maxEntries;
  constructor(config?: MutationLogConfig);
  append(message: MutationMessage): void;
  getReplayMessages(): MutationMessage[];
  size(): number;
  clear(): void;
}
//# sourceMappingURL=mutation-log.d.ts.map
//#endregion
//#region src/server/broadcast-transport.d.ts
interface BroadcastTransportConfig {
  mutationLog?: MutationLogConfig;
  maxClients?: number;
  onClientConnect?: (clientId: ClientId) => void;
  onClientDisconnect?: (clientId: ClientId) => void;
}
/**
 * Transport that fans out messages from a single source to N client transports.
 *
 * Used by StreamingServer to broadcast DOM mutations to all connected readers.
 */
declare class BroadcastTransport implements Transport {
  private clients;
  private handlers;
  private log;
  private _readyState;
  private config;
  onError?: (error: Error) => void;
  onClose?: () => void;
  constructor(config?: BroadcastTransportConfig);
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  addClient(clientId: ClientId, transport: Transport): void;
  removeClient(clientId: ClientId): void;
  getClientCount(): number;
  getClientIds(): ClientId[];
}
//# sourceMappingURL=broadcast-transport.d.ts.map
//#endregion
//#region src/server/streaming-server.d.ts
interface StreamingServerConfig {
  createApp: (dom: WorkerDomResult) => void | Promise<void>;
  workerDomConfig?: Partial<Omit<WorkerDomConfig, "transport">>;
  broadcast?: BroadcastTransportConfig;
}
interface StreamingServerInstance {
  handleConnection(socket: WebSocketLike, clientId?: string): ClientId;
  disconnectClient(clientId: ClientId): void;
  getClientCount(): number;
  getClientIds(): ClientId[];
  getDom(): WorkerDomResult;
  destroy(): void;
  ready: Promise<void>;
}
/**
 * Creates a streaming server that broadcasts one app's DOM mutations to N clients.
 *
 * This is an OPTIONAL alternative to `createServerApp` for scenarios where
 * a single source of truth needs to be observed by multiple readers.
 */
declare function createStreamingServer(config: StreamingServerConfig): StreamingServerInstance;
//# sourceMappingURL=streaming-server.d.ts.map

//#endregion
export { BroadcastTransport, type BroadcastTransportConfig, MutationLog, type MutationLogConfig, type ServerAppOptions, type StreamingServerConfig, type StreamingServerInstance, type WebSocketLike, WebSocketServerTransport, createServerApp, createStreamingServer };
//# sourceMappingURL=server.d.ts.map