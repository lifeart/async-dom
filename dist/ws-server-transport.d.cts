import { n as TransportReadyState, p as Message, r as TransportStats, t as Transport } from "./base.cjs";

//#region src/transport/ws-server-transport.d.ts

/**
 * Minimal WebSocket interface that works with any WebSocket server library
 * (ws, uWebSockets.js, Deno, Bun, etc.) without importing their types.
 */
interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  readonly bufferedAmount: number;
  onmessage: ((event: {
    data: unknown;
  }) => void) | null;
  onclose: ((event: {
    code: number;
    reason: string;
  }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}
/**
 * Server-side WebSocket transport for async-dom.
 *
 * Unlike the client-side WebSocketTransport, this does NOT handle reconnection.
 * It accepts an already-connected WebSocketLike socket and wraps it with
 * the Transport interface including backpressure handling.
 */
declare class WebSocketServerTransport implements Transport {
  private socket;
  private handlers;
  private _readyState;
  private _stats;
  private _statsEnabled;
  private messageQueue;
  private drainTimer;
  onError?: (error: Error) => void;
  onClose?: () => void;
  constructor(socket: WebSocketLike);
  private mapReadyState;
  send(message: Message): void;
  private sendRaw;
  private startDrainCheck;
  private stopDrainCheck;
  private flushQueue;
  onMessage(handler: (message: Message) => void): void;
  close(): void;
  get readyState(): TransportReadyState;
  get bufferedAmount(): number;
  getStats(): TransportStats;
  enableStats(enabled: boolean): void;
}
//# sourceMappingURL=ws-server-transport.d.ts.map
//#endregion
export { WebSocketServerTransport as n, WebSocketLike as t };
//# sourceMappingURL=ws-server-transport.d.cts.map