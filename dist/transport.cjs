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
//#region src/transport/ws-server-transport.ts
/** 1 MB — stop sending and start queueing */
const HIGH_WATER_MARK = 1024 * 1024;
/** 256 KB — resume sending queued messages */
const LOW_WATER_MARK = 256 * 1024;
/** Interval for checking bufferedAmount drain (ms) */
const DRAIN_CHECK_INTERVAL = 50;
/**
* Server-side WebSocket transport for async-dom.
*
* Unlike the client-side WebSocketTransport, this does NOT handle reconnection.
* It accepts an already-connected WebSocketLike socket and wraps it with
* the Transport interface including backpressure handling.
*/
var WebSocketServerTransport = class {
	handlers = [];
	_readyState;
	_stats = {
		messageCount: 0,
		totalBytes: 0,
		largestMessageBytes: 0,
		lastMessageBytes: 0
	};
	_statsEnabled = false;
	messageQueue = [];
	drainTimer = null;
	onError;
	onClose;
	constructor(socket) {
		this.socket = socket;
		this._readyState = this.mapReadyState(socket.readyState);
		this.socket.onmessage = (event) => {
			try {
				const raw = typeof event.data === "string" ? event.data : String(event.data);
				const data = JSON.parse(raw);
				for (const h of this.handlers) try {
					h(data);
				} catch (err) {
					console.error("[async-dom] Server transport handler error:", err);
				}
			} catch {
				console.error("[async-dom] Failed to parse WebSocket message");
			}
		};
		this.socket.onclose = (_event) => {
			this._readyState = "closed";
			this.stopDrainCheck();
			this.onClose?.();
		};
		this.socket.onerror = (event) => {
			this.onError?.(event instanceof Error ? event : /* @__PURE__ */ new Error("WebSocket error"));
		};
	}
	mapReadyState(wsState) {
		switch (wsState) {
			case 0: return "connecting";
			case 1: return "open";
			case 2:
			case 3: return "closed";
			default: return "closed";
		}
	}
	send(message) {
		if (this._readyState === "closed") return;
		if (this.socket.bufferedAmount > HIGH_WATER_MARK) {
			this.messageQueue.push(message);
			this.startDrainCheck();
			return;
		}
		this.sendRaw(message);
	}
	sendRaw(message) {
		try {
			const json = JSON.stringify(message);
			const bytes = json.length;
			if (this._statsEnabled) {
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) this._stats.largestMessageBytes = bytes;
			}
			this.socket.send(json);
		} catch (err) {
			this.onError?.(err instanceof Error ? err : /* @__PURE__ */ new Error("Send failed"));
		}
	}
	startDrainCheck() {
		if (this.drainTimer !== null) return;
		this.drainTimer = setInterval(() => {
			if (this.socket.bufferedAmount <= LOW_WATER_MARK) this.flushQueue();
			if (this.messageQueue.length === 0) this.stopDrainCheck();
		}, DRAIN_CHECK_INTERVAL);
	}
	stopDrainCheck() {
		if (this.drainTimer !== null) {
			clearInterval(this.drainTimer);
			this.drainTimer = null;
		}
	}
	flushQueue() {
		while (this.messageQueue.length > 0) {
			if (this.socket.bufferedAmount > HIGH_WATER_MARK) return;
			const msg = this.messageQueue.shift();
			if (msg) this.sendRaw(msg);
		}
	}
	onMessage(handler) {
		this.handlers.push(handler);
	}
	close() {
		if (this._readyState === "closed") return;
		this._readyState = "closed";
		this.stopDrainCheck();
		this.messageQueue.length = 0;
		this.socket.close(1e3, "Transport closed");
	}
	get readyState() {
		return this._readyState;
	}
	get bufferedAmount() {
		return this.socket.bufferedAmount;
	}
	getStats() {
		return { ...this._stats };
	}
	enableStats(enabled) {
		this._statsEnabled = enabled;
	}
};
//#endregion
exports.BinaryWorkerSelfTransport = require_ws_transport.BinaryWorkerSelfTransport;
exports.BinaryWorkerTransport = require_ws_transport.BinaryWorkerTransport;
exports.SharedWorkerSelfTransport = SharedWorkerSelfTransport;
exports.SharedWorkerTransport = SharedWorkerTransport;
exports.WebSocketServerTransport = WebSocketServerTransport;
exports.WebSocketTransport = require_ws_transport.WebSocketTransport;
exports.WorkerSelfTransport = require_worker_transport.WorkerSelfTransport;
exports.WorkerTransport = require_worker_transport.WorkerTransport;
exports.createComlinkEndpoint = createComlinkEndpoint;
exports.decodeBinaryMessage = require_ws_transport.decodeBinaryMessage;
exports.encodeBinaryMessage = require_ws_transport.encodeBinaryMessage;

//# sourceMappingURL=transport.cjs.map