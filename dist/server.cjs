Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_worker_thread = require("./worker-thread.cjs");
const require_ws_server_transport = require("./ws-server-transport.cjs");
//#region src/server/runner.ts
/**
* Creates a server-side async-dom app instance.
*
* Wraps `createWorkerDom` with the provided transport and runs the user's
* app module. Returns a destroy handle for cleanup on disconnect.
*
* Note: No SharedArrayBuffer is used — the async query fallback is used instead.
*/
function createServerApp(options) {
	const { transport, appModule } = options;
	const dom = require_worker_thread.createWorkerDom({ transport });
	try {
		const result = appModule(dom);
		if (result && typeof result === "object" && "catch" in result) result.catch((err) => {
			console.error("[async-dom] Server app module error:", err);
		});
	} catch (err) {
		console.error("[async-dom] Server app module error:", err);
	}
	return { destroy() {
		const domAny = dom;
		if (typeof domAny.destroy === "function") domAny.destroy();
		else transport.close();
	} };
}
//#endregion
exports.WebSocketServerTransport = require_ws_server_transport.WebSocketServerTransport;
exports.createServerApp = createServerApp;

//# sourceMappingURL=server.cjs.map