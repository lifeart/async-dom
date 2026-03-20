Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_ws_transport = require("./ws-transport.cjs");
const require_worker_transport = require("./worker-transport.cjs");
//#region src/transport/comlink-adapter.ts
function createComlinkEndpoint(transport) {
	const listeners = /* @__PURE__ */ new Set();
	transport.onMessage((message) => {
		const event = new MessageEvent("message", { data: message });
		for (const listener of listeners) if (typeof listener === "function") listener(event);
		else listener.handleEvent(event);
	});
	return {
		postMessage(message) {
			transport.send(message);
		},
		addEventListener(_type, listener) {
			listeners.add(listener);
		},
		removeEventListener(_type, listener) {
			listeners.delete(listener);
		}
	};
}
//#endregion
exports.BinaryWorkerSelfTransport = require_ws_transport.BinaryWorkerSelfTransport;
exports.BinaryWorkerTransport = require_ws_transport.BinaryWorkerTransport;
exports.WebSocketTransport = require_ws_transport.WebSocketTransport;
exports.WorkerSelfTransport = require_worker_transport.WorkerSelfTransport;
exports.WorkerTransport = require_worker_transport.WorkerTransport;
exports.createComlinkEndpoint = createComlinkEndpoint;
exports.decodeBinaryMessage = require_ws_transport.decodeBinaryMessage;
exports.encodeBinaryMessage = require_ws_transport.encodeBinaryMessage;

//# sourceMappingURL=transport.cjs.map