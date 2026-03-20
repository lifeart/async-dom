import { n as TransportReadyState, t as Transport } from "./base.js";
import { a as decodeBinaryMessage, c as WebSocketTransportOptions, i as BinaryWorkerTransport, n as WorkerTransport, o as encodeBinaryMessage, r as BinaryWorkerSelfTransport, s as WebSocketTransport, t as WorkerSelfTransport } from "./worker-transport.js";

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
 * import { createComlinkEndpoint } from 'async-dom/transport';
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
export { BinaryWorkerSelfTransport, BinaryWorkerTransport, type ComlinkEndpoint, type Transport, type TransportReadyState, WebSocketTransport, type WebSocketTransportOptions, WorkerSelfTransport, WorkerTransport, createComlinkEndpoint, decodeBinaryMessage, encodeBinaryMessage };
//# sourceMappingURL=transport.d.ts.map