//#region src/transport/worker-transport.ts
/**
* Transport implementation using Web Worker postMessage.
* Used on the main thread side to communicate with a dedicated worker.
*/
var WorkerTransport = class {
	handlers = [];
	_readyState = "open";
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
	send(message) {
		if (this._readyState !== "open") return;
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
};
/**
* Transport implementation used inside a Web Worker.
* Communicates with the main thread via self.postMessage.
*/
var WorkerSelfTransport = class {
	handlers = [];
	_readyState = "open";
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
	send(message) {
		if (this._readyState !== "open") return;
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
};
//#endregion
Object.defineProperty(exports, "WorkerSelfTransport", {
	enumerable: true,
	get: function() {
		return WorkerSelfTransport;
	}
});
Object.defineProperty(exports, "WorkerTransport", {
	enumerable: true,
	get: function() {
		return WorkerTransport;
	}
});

//# sourceMappingURL=worker-transport.cjs.map