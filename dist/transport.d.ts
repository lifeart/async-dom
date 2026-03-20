import { n as TransportReadyState, p as Message, r as TransportStats, t as Transport } from "./base.js";
import { a as decodeBinaryMessage, c as WebSocketTransportOptions, i as BinaryWorkerTransport, n as WorkerTransport, o as encodeBinaryMessage, r as BinaryWorkerSelfTransport, s as WebSocketTransport, t as WorkerSelfTransport } from "./worker-transport.js";
import { n as WebSocketServerTransport, t as WebSocketLike } from "./ws-server-transport.js";

//#region src/transport/comlink-adapter.d.ts

/**
 * Adapts a Transport into a Comlink-compatible Endpoint.
 *
 * This allows using Comlink's RPC-style API over any async-dom transport.
 * Requires `comlink` as a peer dependency.
 *
 * Usage:
 * ```ts
 * import * as Comlink from 'comlink';
 * import { createComlinkEndpoint } from '@lifeart/async-dom/transport';
 *
 * const endpoint = createComlinkEndpoint(transport);
 * const api = Comlink.wrap(endpoint);
 * ```
 */
interface ComlinkEndpoint {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
declare function createComlinkEndpoint(transport: Transport): ComlinkEndpoint;
//#endregion
//#region src/transport/shared-worker-transport.d.ts
/**
 * Transport implementation using a SharedWorker MessagePort.
 * Used on the main thread side to communicate with a SharedWorker.
 */
declare class SharedWorkerTransport implements Transport {
  private port;
  private handlers;
  private _readyState;
  private _statsEnabled;
  private _stats;
  private _heartbeatInterval;
  private _heartbeatTimeout;
  private _awaitingPong;
  onError?: (error: Error) => void;
  onClose?: () => void;
  constructor(port: MessagePort);
  private _startHeartbeat;
  private _clearHeartbeatTimeout;
  private _stopHeartbeat;
  enableStats(enabled: boolean): void;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  getStats(): TransportStats;
}
/**
 * Transport implementation used inside a SharedWorker.
 * Communicates with the main thread via a MessagePort received from the connect event.
 */
declare class SharedWorkerSelfTransport implements Transport {
  private port;
  private handlers;
  private _readyState;
  private _statsEnabled;
  private _stats;
  onError?: (error: Error) => void;
  onClose?: () => void;
  constructor(port: MessagePort);
  enableStats(enabled: boolean): void;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  getStats(): TransportStats;
}
//# sourceMappingURL=shared-worker-transport.d.ts.map
//#endregion
export { BinaryWorkerSelfTransport, BinaryWorkerTransport, type ComlinkEndpoint, SharedWorkerSelfTransport, SharedWorkerTransport, type Transport, type TransportReadyState, type WebSocketLike, WebSocketServerTransport, WebSocketTransport, type WebSocketTransportOptions, WorkerSelfTransport, WorkerTransport, createComlinkEndpoint, decodeBinaryMessage, encodeBinaryMessage };
//# sourceMappingURL=transport.d.ts.map