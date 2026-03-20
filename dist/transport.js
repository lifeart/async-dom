import { a as encodeBinaryMessage, i as decodeBinaryMessage, n as BinaryWorkerSelfTransport, r as BinaryWorkerTransport, t as WebSocketTransport } from "./ws-transport.js";
import { n as WorkerTransport, t as WorkerSelfTransport } from "./worker-transport.js";
import { t as WebSocketServerTransport } from "./ws-server-transport.js";
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
//#region src/transport/shared-worker-transport.ts
/**
* Transport implementation using a SharedWorker MessagePort.
* Used on the main thread side to communicate with a SharedWorker.
*/
var SharedWorkerTransport = class {
	handlers = [];
	_readyState = "open";
	_statsEnabled = false;
	_stats = {
		messageCount: 0,
		totalBytes: 0,
		largestMessageBytes: 0,
		lastMessageBytes: 0
	};
	_heartbeatInterval = null;
	_heartbeatTimeout = null;
	onError;
	onClose;
	constructor(port) {
		this.port = port;
		port.onmessage = (e) => {
			const data = e.data;
			if (data && typeof data === "object" && data.type === "pong") {
				this._clearHeartbeatTimeout();
				return;
			}
			for (const h of this.handlers) try {
				h(data);
			} catch (err) {
				console.error("[async-dom] Handler error:", err);
			}
		};
		port.onmessageerror = () => {
			const error = /* @__PURE__ */ new Error("SharedWorker message deserialization failed");
			this.onError?.(error);
		};
		try {
			port.addEventListener("close", () => {
				this._stopHeartbeat();
				if (this._readyState !== "closed") {
					this._readyState = "closed";
					this.onClose?.();
				}
			});
		} catch {}
		this._startHeartbeat();
	}
	_startHeartbeat() {
		this._heartbeatInterval = setInterval(() => {
			if (this._readyState !== "open") {
				this._stopHeartbeat();
				return;
			}
			this.port.postMessage({ type: "ping" });
			this._heartbeatTimeout = setTimeout(() => {
				if (this._readyState !== "closed") {
					this._readyState = "closed";
					this._stopHeartbeat();
					this.onClose?.();
				}
			}, 15e3);
		}, 5e3);
	}
	_clearHeartbeatTimeout() {
		if (this._heartbeatTimeout !== null) {
			clearTimeout(this._heartbeatTimeout);
			this._heartbeatTimeout = null;
		}
	}
	_stopHeartbeat() {
		this._clearHeartbeatTimeout();
		if (this._heartbeatInterval !== null) {
			clearInterval(this._heartbeatInterval);
			this._heartbeatInterval = null;
		}
	}
	enableStats(enabled) {
		this._statsEnabled = enabled;
	}
	send(message) {
		if (this._readyState !== "open") return;
		if (this._statsEnabled) {
			const size = JSON.stringify(message).length;
			this._stats.messageCount++;
			this._stats.totalBytes += size;
			this._stats.lastMessageBytes = size;
			if (size > this._stats.largestMessageBytes) this._stats.largestMessageBytes = size;
		}
		this.port.postMessage(message);
	}
	onMessage(handler) {
		this.handlers.push(handler);
	}
	close() {
		this._stopHeartbeat();
		this._readyState = "closed";
		this.port.close();
	}
	get readyState() {
		return this._readyState;
	}
	getStats() {
		return { ...this._stats };
	}
};
/**
* Transport implementation used inside a SharedWorker.
* Communicates with the main thread via a MessagePort received from the connect event.
*/
var SharedWorkerSelfTransport = class {
	handlers = [];
	_readyState = "open";
	_statsEnabled = false;
	_stats = {
		messageCount: 0,
		totalBytes: 0,
		largestMessageBytes: 0,
		lastMessageBytes: 0
	};
	onError;
	onClose;
	constructor(port) {
		this.port = port;
		port.onmessage = (e) => {
			const data = e.data;
			if (data && typeof data === "object" && data.type === "ping") {
				port.postMessage({ type: "pong" });
				return;
			}
			for (const h of this.handlers) try {
				h(data);
			} catch (err) {
				console.error("[async-dom] Handler error:", err);
			}
		};
		port.onmessageerror = () => {
			const error = /* @__PURE__ */ new Error("SharedWorker message deserialization failed");
			this.onError?.(error);
		};
		port.start();
	}
	enableStats(enabled) {
		this._statsEnabled = enabled;
	}
	send(message) {
		if (this._readyState !== "open") return;
		if (this._statsEnabled) {
			const size = JSON.stringify(message).length;
			this._stats.messageCount++;
			this._stats.totalBytes += size;
			this._stats.lastMessageBytes = size;
			if (size > this._stats.largestMessageBytes) this._stats.largestMessageBytes = size;
		}
		this.port.postMessage(message);
	}
	onMessage(handler) {
		this.handlers.push(handler);
	}
	close() {
		this._readyState = "closed";
		this.port.close();
	}
	get readyState() {
		return this._readyState;
	}
	getStats() {
		return { ...this._stats };
	}
};
//#endregion
export { BinaryWorkerSelfTransport, BinaryWorkerTransport, SharedWorkerSelfTransport, SharedWorkerTransport, WebSocketServerTransport, WebSocketTransport, WorkerSelfTransport, WorkerTransport, createComlinkEndpoint, decodeBinaryMessage, encodeBinaryMessage };

//# sourceMappingURL=transport.js.map