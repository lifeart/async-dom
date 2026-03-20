import { t as Transport } from "./base.cjs";
import { n as WebSocketServerTransport, t as WebSocketLike } from "./ws-server-transport.cjs";
import { n as WorkerDomResult } from "./index3.cjs";

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
};
//# sourceMappingURL=runner.d.ts.map
//#endregion
export { type ServerAppOptions, type WebSocketLike, WebSocketServerTransport, createServerApp };
//# sourceMappingURL=server.d.cts.map