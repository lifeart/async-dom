//#region src/core/debug.ts
const WarningCode = {
	MISSING_NODE: "ASYNC_DOM_MISSING_NODE",
	SYNC_TIMEOUT: "ASYNC_DOM_SYNC_TIMEOUT",
	LISTENER_NOT_FOUND: "ASYNC_DOM_LISTENER_NOT_FOUND",
	EVENT_ATTACH_FAILED: "ASYNC_DOM_EVENT_ATTACH_FAILED",
	TRANSPORT_NOT_OPEN: "ASYNC_DOM_TRANSPORT_NOT_OPEN",
	BLOCKED_PROPERTY: "ASYNC_DOM_BLOCKED_PROPERTY",
	WORKER_ERROR: "WORKER_ERROR",
	WORKER_UNHANDLED_REJECTION: "WORKER_UNHANDLED_REJECTION"
};
const defaultLogger = {
	warning(entry) {
		console.warn(`[async-dom] ${entry.code}: ${entry.message}`, entry.context);
	},
	mutation(entry) {
		console.log(`[async-dom:${entry.side}] mutation:${entry.action}`, entry.mutation);
	},
	event(entry) {
		console.log(`[async-dom:${entry.side}] event:${entry.phase} ${entry.eventType} listenerId=${entry.listenerId}`);
	},
	syncRead(entry) {
		console.log(`[async-dom] sync:${entry.queryType} node=${entry.nodeId} ${entry.result} (${entry.latencyMs.toFixed(1)}ms)`);
	},
	scheduler(entry) {
		console.log(`[async-dom] frame:${entry.frameId} actions=${entry.actionsProcessed} time=${entry.frameTimeMs.toFixed(1)}ms queue=${entry.queueDepth}`);
	}
};
var DebugStats = class {
	mutationsAdded = 0;
	mutationsCoalesced = 0;
	mutationsFlushed = 0;
	mutationsApplied = 0;
	eventsForwarded = 0;
	eventsDispatched = 0;
	syncReadRequests = 0;
	syncReadTimeouts = 0;
	snapshot() {
		return {
			mutationsAdded: this.mutationsAdded,
			mutationsCoalesced: this.mutationsCoalesced,
			mutationsFlushed: this.mutationsFlushed,
			mutationsApplied: this.mutationsApplied,
			eventsForwarded: this.eventsForwarded,
			eventsDispatched: this.eventsDispatched,
			syncReadRequests: this.syncReadRequests,
			syncReadTimeouts: this.syncReadTimeouts
		};
	}
	reset() {
		this.mutationsAdded = 0;
		this.mutationsCoalesced = 0;
		this.mutationsFlushed = 0;
		this.mutationsApplied = 0;
		this.eventsForwarded = 0;
		this.eventsDispatched = 0;
		this.syncReadRequests = 0;
		this.syncReadTimeouts = 0;
	}
};
function resolveDebugHooks(options) {
	if (!options) return {
		onMutation: null,
		onEvent: null,
		onSyncRead: null,
		onScheduler: null,
		onWarning: null
	};
	const logger = {
		...defaultLogger,
		...options.logger
	};
	return {
		onMutation: options.logMutations ? (e) => logger.mutation(e) : null,
		onEvent: options.logEvents ? (e) => logger.event(e) : null,
		onSyncRead: options.logSyncReads ? (e) => logger.syncRead(e) : null,
		onScheduler: options.logScheduler ? (e) => logger.scheduler(e) : null,
		onWarning: options.logWarnings ? (e) => logger.warning(e) : null
	};
}
//#endregion
//#region src/core/protocol.ts
const BODY_NODE_ID = 1;
const HEAD_NODE_ID = 2;
const HTML_NODE_ID = 3;
const DOCUMENT_NODE_ID = 4;
let _nodeIdCounter = 10;
/**
* Create a new unique numeric NodeId (auto-incremented).
*/
function createNodeId() {
	return ++_nodeIdCounter;
}
function createAppId(id) {
	return id;
}
function isMutationMessage(msg) {
	return msg.type === "mutation";
}
function isEventMessage(msg) {
	return msg.type === "event";
}
function isSystemMessage(msg) {
	return !isMutationMessage(msg) && !isEventMessage(msg);
}
//#endregion
//#region src/core/sync-channel.ts
/**
* SharedArrayBuffer-based synchronous communication channel.
*
* Allows a worker thread to make blocking reads from the main thread
* using Atomics.wait/notify. Inspired by Partytown's approach.
*
* Buffer layout (SharedArrayBuffer):
*   Int32Array view:
*     [0] — signal: 0=idle, 1=request-pending, 2=response-ready
*     [1] — query type enum
*     [2] — request data length (bytes)
*     [3] — response data length (bytes)
*   Uint8Array view at offset 16: request data (JSON-encoded)
*   Uint8Array view at offset 16+REQUEST_REGION_SIZE: response data (JSON-encoded)
*/
const HEADER_SIZE = 16;
const REQUEST_REGION_SIZE = 4096;
const DEFAULT_BUFFER_SIZE = 65536;
const SIGNAL_IDLE = 0;
const SIGNAL_REQUEST = 1;
const SIGNAL_RESPONSE = 2;
const MAX_RETRIES = 5;
const WAIT_TIMEOUT_MS = 100;
let QueryType = /* @__PURE__ */ function(QueryType) {
	QueryType[QueryType["BoundingRect"] = 0] = "BoundingRect";
	QueryType[QueryType["ComputedStyle"] = 1] = "ComputedStyle";
	QueryType[QueryType["NodeProperty"] = 2] = "NodeProperty";
	QueryType[QueryType["WindowProperty"] = 3] = "WindowProperty";
	return QueryType;
}({});
/**
* Worker-side synchronous channel.
* Uses Atomics.wait to block until the main thread responds.
*/
var SyncChannel = class SyncChannel {
	signal;
	meta;
	requestRegion;
	responseRegion;
	encoder = new TextEncoder();
	decoder = new TextDecoder();
	constructor(buffer) {
		this.signal = new Int32Array(buffer, 0, 4);
		this.meta = this.signal;
		this.requestRegion = new Uint8Array(buffer, HEADER_SIZE, REQUEST_REGION_SIZE);
		this.responseRegion = new Uint8Array(buffer, HEADER_SIZE + REQUEST_REGION_SIZE, buffer.byteLength - HEADER_SIZE - REQUEST_REGION_SIZE);
	}
	static create(size = DEFAULT_BUFFER_SIZE) {
		const buffer = new SharedArrayBuffer(size);
		return {
			channel: new SyncChannel(buffer),
			buffer
		};
	}
	static fromBuffer(sab) {
		return new SyncChannel(sab);
	}
	/**
	* Send a synchronous request to the main thread and block until response.
	* Returns the parsed response or a fallback value on timeout.
	*/
	request(queryType, data) {
		const encoded = this.encoder.encode(data);
		if (encoded.byteLength > REQUEST_REGION_SIZE) return null;
		this.requestRegion.set(encoded);
		Atomics.store(this.meta, 1, queryType);
		Atomics.store(this.meta, 2, encoded.byteLength);
		Atomics.store(this.meta, 3, 0);
		Atomics.store(this.signal, 0, SIGNAL_REQUEST);
		Atomics.notify(this.signal, 0);
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			const result = Atomics.wait(this.signal, 0, SIGNAL_REQUEST, WAIT_TIMEOUT_MS);
			if (result === "not-equal") break;
			if (result === "ok") break;
		}
		if (Atomics.load(this.signal, 0) !== SIGNAL_RESPONSE) {
			Atomics.store(this.signal, 0, SIGNAL_IDLE);
			return null;
		}
		const responseLength = Atomics.load(this.meta, 3);
		if (responseLength === 0) {
			Atomics.store(this.signal, 0, SIGNAL_IDLE);
			return null;
		}
		const responseBytes = this.responseRegion.slice(0, responseLength);
		const responseStr = this.decoder.decode(responseBytes);
		Atomics.store(this.signal, 0, SIGNAL_IDLE);
		try {
			return JSON.parse(responseStr);
		} catch {
			return null;
		}
	}
};
/**
* Main-thread host for the sync channel.
* Polls for pending requests and writes responses.
*/
var SyncChannelHost = class {
	signal;
	meta;
	requestRegion;
	responseRegion;
	encoder = new TextEncoder();
	decoder = new TextDecoder();
	polling = false;
	pollChannel = null;
	constructor(buffer) {
		this.signal = new Int32Array(buffer, 0, 4);
		this.meta = this.signal;
		this.requestRegion = new Uint8Array(buffer, HEADER_SIZE, REQUEST_REGION_SIZE);
		this.responseRegion = new Uint8Array(buffer, HEADER_SIZE + REQUEST_REGION_SIZE, buffer.byteLength - HEADER_SIZE - REQUEST_REGION_SIZE);
	}
	/**
	* Non-blocking check for a pending query.
	*/
	poll() {
		if (Atomics.load(this.signal, 0) !== SIGNAL_REQUEST) return null;
		const queryType = Atomics.load(this.meta, 1);
		const dataLength = Atomics.load(this.meta, 2);
		const dataBytes = this.requestRegion.slice(0, dataLength);
		return {
			queryType,
			data: this.decoder.decode(dataBytes)
		};
	}
	/**
	* Write a response and wake the worker.
	*/
	respond(data) {
		const json = JSON.stringify(data);
		const encoded = this.encoder.encode(json);
		this.responseRegion.set(encoded);
		Atomics.store(this.meta, 3, encoded.byteLength);
		Atomics.store(this.signal, 0, SIGNAL_RESPONSE);
		Atomics.notify(this.signal, 0);
	}
	/**
	* Start polling for requests using a MessageChannel for lowest-latency scheduling.
	*/
	startPolling(handler) {
		if (this.polling) return;
		this.polling = true;
		if (typeof MessageChannel !== "undefined") {
			this.pollChannel = new MessageChannel();
			let idleCount = 0;
			const pollOnce = () => {
				if (!this.polling) return;
				const query = this.poll();
				if (query) {
					idleCount = 0;
					const result = handler(query);
					this.respond(result);
					this.pollChannel?.port2.postMessage(null);
				} else {
					idleCount++;
					if (idleCount <= 2) this.pollChannel?.port2.postMessage(null);
					else {
						const delay = Math.min(1 << idleCount - 3, 16);
						setTimeout(() => {
							if (this.polling) this.pollChannel?.port2.postMessage(null);
						}, delay);
					}
				}
			};
			this.pollChannel.port1.onmessage = pollOnce;
			this.pollChannel.port2.postMessage(null);
		} else {
			const intervalId = setInterval(() => {
				if (!this.polling) {
					clearInterval(intervalId);
					return;
				}
				const query = this.poll();
				if (query) {
					const result = handler(query);
					this.respond(result);
				}
			}, 4);
		}
	}
	/**
	* Stop polling for requests.
	*/
	stopPolling() {
		this.polling = false;
		if (this.pollChannel) {
			this.pollChannel.port1.close();
			this.pollChannel.port2.close();
			this.pollChannel = null;
		}
	}
};
//#endregion
export { DOCUMENT_NODE_ID as a, createAppId as c, isMutationMessage as d, isSystemMessage as f, resolveDebugHooks as h, BODY_NODE_ID as i, createNodeId as l, WarningCode as m, SyncChannel as n, HEAD_NODE_ID as o, DebugStats as p, SyncChannelHost as r, HTML_NODE_ID as s, QueryType as t, isEventMessage as u };

//# sourceMappingURL=sync-channel.js.map