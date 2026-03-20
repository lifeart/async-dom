Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_sync_channel = require("./sync-channel.cjs");
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
	let ready;
	try {
		const result = appModule(dom);
		ready = result instanceof Promise ? result.catch((err) => {
			console.error("[async-dom] Server app module error:", err);
		}) : Promise.resolve();
	} catch (err) {
		console.error("[async-dom] Server app module error:", err);
		ready = Promise.resolve();
	}
	return {
		ready,
		destroy() {
			dom.destroy();
		}
	};
}
//#endregion
//#region src/server/mutation-log.ts
/**
* Ring buffer that stores recent MutationMessages for replay to new clients.
*/
var MutationLog = class {
	entries = [];
	maxEntries;
	constructor(config) {
		this.maxEntries = Math.max(0, config?.maxEntries ?? 1e4);
	}
	append(message) {
		if (this.maxEntries === 0) return;
		this.entries.push(message);
		if (this.entries.length > this.maxEntries) this.entries.shift();
	}
	getReplayMessages() {
		return this.entries.slice();
	}
	size() {
		return this.entries.length;
	}
	clear() {
		this.entries.length = 0;
	}
};
//#endregion
//#region src/server/broadcast-transport.ts
/**
* Transport that fans out messages from a single source to N client transports.
*
* Used by StreamingServer to broadcast DOM mutations to all connected readers.
*/
var BroadcastTransport = class {
	clients = /* @__PURE__ */ new Map();
	handlers = [];
	log;
	_readyState = "open";
	config;
	onError;
	onClose;
	constructor(config) {
		this.config = config ?? {};
		this.log = new MutationLog(config?.mutationLog);
	}
	send(message) {
		if (this._readyState === "closed") return;
		if (require_sync_channel.isMutationMessage(message)) this.log.append(message);
		const failedClientIds = [];
		for (const [clientId, transport] of this.clients) try {
			transport.send(message);
		} catch (err) {
			console.error(`[async-dom] Failed to send to client ${clientId}:`, err);
			failedClientIds.push(clientId);
		}
		for (const clientId of failedClientIds) this.removeClient(clientId);
	}
	onMessage(handler) {
		this.handlers.push(handler);
	}
	close() {
		if (this._readyState === "closed") return;
		this._readyState = "closed";
		for (const clientId of [...this.clients.keys()]) this.removeClient(clientId);
		this.log.clear();
		this.onClose?.();
	}
	get readyState() {
		return this._readyState;
	}
	addClient(clientId, transport) {
		if (this._readyState === "closed") return;
		if (this.config.maxClients !== void 0 && this.clients.size >= this.config.maxClients) {
			console.error(`[async-dom] Max clients (${this.config.maxClients}) reached, rejecting ${clientId}`);
			transport.close();
			return;
		}
		if (this.clients.has(clientId)) this.removeClient(clientId);
		const replay = this.log.getReplayMessages();
		for (const msg of replay) try {
			transport.send(msg);
		} catch (err) {
			console.error(`[async-dom] Failed to replay to client ${clientId}:`, err);
			return;
		}
		try {
			transport.send({ type: "snapshotComplete" });
		} catch (err) {
			console.error(`[async-dom] Failed to send snapshotComplete to client ${clientId}:`, err);
			return;
		}
		this.clients.set(clientId, transport);
		transport.onMessage((message) => {
			if (message.type === "event") message.clientId = clientId;
			for (const h of this.handlers) try {
				h(message);
			} catch (err) {
				console.error("[async-dom] BroadcastTransport handler error:", err);
			}
		});
		const previousOnClose = transport.onClose;
		transport.onClose = () => {
			this.removeClient(clientId);
			previousOnClose?.();
		};
		for (const h of this.handlers) try {
			h({
				type: "clientConnect",
				clientId
			});
		} catch (err) {
			console.error("[async-dom] BroadcastTransport handler error:", err);
		}
		this.config.onClientConnect?.(clientId);
	}
	removeClient(clientId) {
		const transport = this.clients.get(clientId);
		if (!transport) return;
		transport.onClose = void 0;
		this.clients.delete(clientId);
		for (const h of this.handlers) try {
			h({
				type: "clientDisconnect",
				clientId
			});
		} catch (err) {
			console.error("[async-dom] BroadcastTransport handler error:", err);
		}
		this.config.onClientDisconnect?.(clientId);
	}
	getClientCount() {
		return this.clients.size;
	}
	getClientIds() {
		return [...this.clients.keys()];
	}
};
//#endregion
//#region src/server/streaming-server.ts
/**
* Creates a streaming server that broadcasts one app's DOM mutations to N clients.
*
* This is an OPTIONAL alternative to `createServerApp` for scenarios where
* a single source of truth needs to be observed by multiple readers.
*/
function createStreamingServer(config) {
	const broadcastTransport = new BroadcastTransport(config.broadcast);
	const dom = require_worker_thread.createWorkerDom({
		...config.workerDomConfig,
		transport: broadcastTransport
	});
	let ready;
	try {
		const result = config.createApp(dom);
		ready = result instanceof Promise ? result.catch((err) => {
			console.error("[async-dom] Streaming server app error:", err);
		}) : Promise.resolve();
	} catch (err) {
		console.error("[async-dom] Streaming server app error:", err);
		ready = Promise.resolve();
	}
	let clientCounter = 0;
	return {
		handleConnection(socket, clientId) {
			const id = require_sync_channel.createClientId(clientId ?? `client-${++clientCounter}`);
			const transport = new require_ws_server_transport.WebSocketServerTransport(socket);
			broadcastTransport.addClient(id, transport);
			return id;
		},
		disconnectClient(clientId) {
			broadcastTransport.removeClient(clientId);
		},
		getClientCount() {
			return broadcastTransport.getClientCount();
		},
		getClientIds() {
			return broadcastTransport.getClientIds();
		},
		getDom() {
			return dom;
		},
		destroy() {
			broadcastTransport.close();
			dom.destroy();
		},
		ready
	};
}
//#endregion
exports.BroadcastTransport = BroadcastTransport;
exports.MutationLog = MutationLog;
exports.WebSocketServerTransport = require_ws_server_transport.WebSocketServerTransport;
exports.createServerApp = createServerApp;
exports.createStreamingServer = createStreamingServer;

//# sourceMappingURL=server.cjs.map