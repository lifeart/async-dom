//#region src/transport/worker-transport.ts
/**
* Transport implementation using Web Worker postMessage.
* Used on the main thread side to communicate with a dedicated worker.
*/
var WorkerTransport = class {
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
	constructor(worker) {
		this.worker = worker;
		worker.onmessage = (e) => {
			for (const h of this.handlers) try {
				h(e.data);
			} catch (err) {
				console.error("[async-dom] Handler error:", err);
			}
		};
		worker.onerror = (e) => {
			const error = new Error(e.message ?? "Worker error");
			this.onError?.(error);
			if (this._readyState !== "closed") {
				this._readyState = "closed";
				this.onClose?.();
			}
		};
		worker.onmessageerror = () => {
			const error = /* @__PURE__ */ new Error("Worker message deserialization failed");
			this.onError?.(error);
		};
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
		this.worker.postMessage(message);
	}
	onMessage(handler) {
		this.handlers.push(handler);
	}
	close() {
		this._readyState = "closed";
		this.worker.terminate();
	}
	get readyState() {
		return this._readyState;
	}
	getStats() {
		return { ...this._stats };
	}
};
/**
* Transport implementation used inside a Web Worker.
* Communicates with the main thread via self.postMessage.
*/
var WorkerSelfTransport = class {
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
	scope;
	constructor(scope) {
		this.scope = scope ?? self;
		this.scope.onmessage = (e) => {
			for (const h of this.handlers) try {
				h(e.data);
			} catch (err) {
				console.error("[async-dom] Handler error:", err);
			}
		};
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
		this.scope.postMessage(message);
	}
	onMessage(handler) {
		this.handlers.push(handler);
	}
	close() {
		this._readyState = "closed";
	}
	get readyState() {
		return this._readyState;
	}
	getStats() {
		return { ...this._stats };
	}
};
//#endregion
export { WorkerTransport as n, WorkerSelfTransport as t };

//# sourceMappingURL=worker-transport.js.map