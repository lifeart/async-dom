import { a as WebSocketTransport, i as encodeBinaryMessage, n as BinaryWorkerTransport, r as decodeBinaryMessage, t as BinaryWorkerSelfTransport } from "./binary-worker-transport.js";
import { n as WorkerTransport, t as WorkerSelfTransport } from "./worker-transport.js";
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
export { BinaryWorkerSelfTransport, BinaryWorkerTransport, WebSocketTransport, WorkerSelfTransport, WorkerTransport, createComlinkEndpoint, decodeBinaryMessage, encodeBinaryMessage };

//# sourceMappingURL=transport.js.map