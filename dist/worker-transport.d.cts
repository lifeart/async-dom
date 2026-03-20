import { f as Message, n as TransportReadyState, r as TransportStats, t as Transport } from "./base.cjs";

//#region src/transport/ws-transport.d.ts
interface WebSocketTransportOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}
/**
 * Transport implementation using WebSocket with automatic reconnection.
 * Messages are queued while disconnected and flushed on reconnect.
 */
declare class WebSocketTransport implements Transport {
  private url;
  private ws;
  private handlers;
  private _readyState;
  private _stats;
  onError?: (error: Error) => void;
  onClose?: () => void;
  private attempt;
  private messageQueue;
  private closed;
  private reconnectTimer;
  private readonly maxRetries;
  private readonly baseDelay;
  private readonly maxDelay;
  constructor(url: string, options?: WebSocketTransportOptions);
  private connect;
  private scheduleReconnect;
  private flushQueue;
  private sendRaw;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  getStats(): TransportStats;
}
//# sourceMappingURL=ws-transport.d.ts.map
//#endregion
//#region src/transport/binary-worker-transport.d.ts
/**
 * Encode a Message as a Transferable ArrayBuffer (legacy JSON format).
 * Used for non-mutation messages.
 */
declare function encodeBinaryMessage(message: Message): ArrayBuffer;
/**
 * Decode a Message from an ArrayBuffer (inverse of encodeBinaryMessage).
 */
declare function decodeBinaryMessage(buffer: ArrayBuffer): Message;
/**
 * Worker transport that uses binary encoding for mutation messages.
 *
 * Mutation messages are encoded using BinaryMutationEncoder with string
 * deduplication, providing ~10x smaller wire format compared to JSON.
 * Non-mutation messages fall back to structured clone.
 *
 * Used on the main thread side to communicate with a dedicated worker.
 */
declare class BinaryWorkerTransport implements Transport {
  private worker;
  private handlers;
  private _readyState;
  private strings;
  private mutDecoder;
  private _statsEnabled;
  private _stats;
  onError?: (error: Error) => void;
  onClose?: () => void;
  constructor(worker: Worker);
  enableStats(enabled: boolean): void;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  getStats(): TransportStats;
}
/**
 * Worker-side binary transport (used inside the worker via self.postMessage).
 *
 * Mutation messages are encoded using BinaryMutationEncoder with string
 * deduplication. The string table preamble is embedded in each message
 * so the main thread can stay synchronized.
 *
 * Counterpart to BinaryWorkerTransport for use within the Web Worker.
 */
declare class BinaryWorkerSelfTransport implements Transport {
  private handlers;
  private _readyState;
  private strings;
  private mutEncoder;
  private _statsEnabled;
  private _stats;
  onError?: (error: Error) => void;
  onClose?: () => void;
  private scope;
  constructor(scope?: {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    onmessage: ((e: MessageEvent) => void) | null;
  });
  enableStats(enabled: boolean): void;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  getStats(): TransportStats;
}
//# sourceMappingURL=binary-worker-transport.d.ts.map
//#endregion
//#region src/transport/worker-transport.d.ts
/**
 * Transport implementation using Web Worker postMessage.
 * Used on the main thread side to communicate with a dedicated worker.
 */
declare class WorkerTransport implements Transport {
  private worker;
  private handlers;
  private _readyState;
  private _statsEnabled;
  private _stats;
  onError?: (error: Error) => void;
  onClose?: () => void;
  constructor(worker: Worker);
  enableStats(enabled: boolean): void;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  getStats(): TransportStats;
}
/**
 * Transport implementation used inside a Web Worker.
 * Communicates with the main thread via self.postMessage.
 */
declare class WorkerSelfTransport implements Transport {
  private handlers;
  private _readyState;
  private _statsEnabled;
  private _stats;
  onError?: (error: Error) => void;
  onClose?: () => void;
  private scope;
  constructor(scope?: {
    postMessage(message: unknown): void;
    onmessage: ((e: MessageEvent) => void) | null;
  });
  enableStats(enabled: boolean): void;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  getStats(): TransportStats;
}
//# sourceMappingURL=worker-transport.d.ts.map

//#endregion
export { decodeBinaryMessage as a, WebSocketTransportOptions as c, BinaryWorkerTransport as i, WorkerTransport as n, encodeBinaryMessage as o, BinaryWorkerSelfTransport as r, WebSocketTransport as s, WorkerSelfTransport as t };
//# sourceMappingURL=worker-transport.d.cts.map