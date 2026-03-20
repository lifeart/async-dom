//#region src/transport/ws-server-transport.ts
/** 1 MB — stop sending and start queueing */
const HIGH_WATER_MARK = 1024 * 1024;
/** 256 KB — resume sending queued messages */
const LOW_WATER_MARK = 256 * 1024;
/** Interval for checking bufferedAmount drain (ms) */
const DRAIN_CHECK_INTERVAL = 50;
/** Maximum queued messages before dropping (backpressure safety valve) */
const MAX_QUEUE_SIZE = 1e4;
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
			this.stopDrainCheck();
			this.messageQueue.length = 0;
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
			if (this.messageQueue.length >= MAX_QUEUE_SIZE) this.messageQueue.shift();
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
		if (this._readyState === "closed") {
			this.messageQueue.length = 0;
			return;
		}
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
export { WebSocketServerTransport as t };

//# sourceMappingURL=ws-server-transport.js.map