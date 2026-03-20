//#region src/core/constants.ts
/** Queue size at which all actions are force-applied */
const CRITICAL_QUEUE_SIZE = 1500;
/** Queue size that triggers increased actions-per-frame */
const MAX_QUEUE_BEFORE_FLUSH = 3e3;
//#endregion
//#region src/core/binary-codec.ts
/**
* Opcodes for mutation actions. Each maps to a DomMutation action type.
* Using plain numeric constants since `const enum` is not compatible
* with isolatedModules / verbatimModuleSyntax.
*/
const MutOp = {
	CreateNode: 0,
	CreateComment: 1,
	AppendChild: 2,
	RemoveNode: 3,
	RemoveChild: 4,
	InsertBefore: 5,
	SetAttribute: 6,
	RemoveAttribute: 7,
	SetStyle: 8,
	SetProperty: 9,
	SetTextContent: 10,
	SetClassName: 11,
	SetHTML: 12,
	AddEventListener: 13,
	HeadAppendChild: 14,
	BodyAppendChild: 15,
	PushState: 16,
	ReplaceState: 17,
	ScrollTo: 18,
	InsertAdjacentHTML: 19,
	ConfigureEvent: 20,
	RemoveEventListener: 21,
	CallMethod: 22
};
/**
* Encodes DomMutation objects into a compact binary format using DataView.
*
* Wire format per mutation:
* - uint8 opcode (1 byte)
* - uint32 for NodeIds (4 bytes each, little-endian)
* - uint16 for string store indices (2 bytes each, little-endian)
* - uint8 for booleans (1 byte)
*
* Strings are deduplicated via a shared StringStore — only their uint16
* index is written to the buffer.
*/
var BinaryMutationEncoder = class {
	buffer;
	view;
	offset = 0;
	strings;
	constructor(strings, initialSize = 4096) {
		this.buffer = new ArrayBuffer(initialSize);
		this.view = new DataView(this.buffer);
		this.strings = strings;
	}
	ensureCapacity(bytes) {
		if (this.offset + bytes <= this.buffer.byteLength) return;
		const newSize = Math.max(this.buffer.byteLength * 2, this.offset + bytes);
		const newBuffer = new ArrayBuffer(newSize);
		new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
		this.buffer = newBuffer;
		this.view = new DataView(this.buffer);
	}
	writeU8(value) {
		this.ensureCapacity(1);
		this.view.setUint8(this.offset++, value);
	}
	writeU16(value) {
		this.ensureCapacity(2);
		this.view.setUint16(this.offset, value, true);
		this.offset += 2;
	}
	writeU32(value) {
		this.ensureCapacity(4);
		this.view.setUint32(this.offset, value, true);
		this.offset += 4;
	}
	writeStr(value) {
		this.writeU16(this.strings.store(value));
	}
	writeNodeId(id) {
		this.writeU32(id);
	}
	encode(mutation) {
		switch (mutation.action) {
			case "createNode":
				this.writeU8(MutOp.CreateNode);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.tag);
				this.writeStr(mutation.textContent ?? "");
				break;
			case "createComment":
				this.writeU8(MutOp.CreateComment);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.textContent);
				break;
			case "appendChild":
				this.writeU8(MutOp.AppendChild);
				this.writeNodeId(mutation.id);
				this.writeNodeId(mutation.childId);
				break;
			case "removeNode":
				this.writeU8(MutOp.RemoveNode);
				this.writeNodeId(mutation.id);
				break;
			case "removeChild":
				this.writeU8(MutOp.RemoveChild);
				this.writeNodeId(mutation.id);
				this.writeNodeId(mutation.childId);
				break;
			case "insertBefore":
				this.writeU8(MutOp.InsertBefore);
				this.writeNodeId(mutation.id);
				this.writeNodeId(mutation.newId);
				this.writeU32(mutation.refId !== null ? mutation.refId : 4294967295);
				break;
			case "setAttribute":
				this.writeU8(MutOp.SetAttribute);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				this.writeStr(mutation.value);
				this.writeU8(mutation.optional ? 1 : 0);
				break;
			case "removeAttribute":
				this.writeU8(MutOp.RemoveAttribute);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				break;
			case "setStyle":
				this.writeU8(MutOp.SetStyle);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.property);
				this.writeStr(mutation.value);
				this.writeU8(mutation.optional ? 1 : 0);
				break;
			case "setProperty":
				this.writeU8(MutOp.SetProperty);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.property);
				this.writeStr(JSON.stringify(mutation.value));
				break;
			case "setTextContent":
				this.writeU8(MutOp.SetTextContent);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.textContent);
				break;
			case "setClassName":
				this.writeU8(MutOp.SetClassName);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				break;
			case "setHTML":
				this.writeU8(MutOp.SetHTML);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.html);
				break;
			case "addEventListener":
				this.writeU8(MutOp.AddEventListener);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				this.writeStr(mutation.listenerId);
				break;
			case "headAppendChild":
				this.writeU8(MutOp.HeadAppendChild);
				this.writeNodeId(mutation.id);
				break;
			case "bodyAppendChild":
				this.writeU8(MutOp.BodyAppendChild);
				this.writeNodeId(mutation.id);
				break;
			case "pushState":
				this.writeU8(MutOp.PushState);
				this.writeStr(JSON.stringify(mutation.state));
				this.writeStr(mutation.title);
				this.writeStr(mutation.url);
				break;
			case "replaceState":
				this.writeU8(MutOp.ReplaceState);
				this.writeStr(JSON.stringify(mutation.state));
				this.writeStr(mutation.title);
				this.writeStr(mutation.url);
				break;
			case "scrollTo":
				this.writeU8(MutOp.ScrollTo);
				this.writeU32(mutation.x);
				this.writeU32(mutation.y);
				break;
			case "insertAdjacentHTML":
				this.writeU8(MutOp.InsertAdjacentHTML);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.position);
				this.writeStr(mutation.html);
				break;
			case "configureEvent":
				this.writeU8(MutOp.ConfigureEvent);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.name);
				this.writeU8(mutation.preventDefault ? 1 : 0);
				this.writeU8(mutation.passive ? 1 : 0);
				break;
			case "removeEventListener":
				this.writeU8(MutOp.RemoveEventListener);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.listenerId);
				break;
			case "callMethod":
				this.writeU8(MutOp.CallMethod);
				this.writeNodeId(mutation.id);
				this.writeStr(mutation.method);
				this.writeStr(JSON.stringify(mutation.args));
				break;
		}
	}
	/**
	* Returns a trimmed copy of the internal buffer containing all encoded mutations.
	*/
	finish() {
		return this.buffer.slice(0, this.offset);
	}
	/**
	* Reset the write offset so the encoder can be reused for the next batch.
	*/
	reset() {
		this.offset = 0;
	}
};
/**
* Decodes a binary buffer produced by BinaryMutationEncoder back into
* DomMutation objects. Requires a synchronized StringStore to resolve
* string indices.
*/
var BinaryMutationDecoder = class {
	view;
	offset = 0;
	strings;
	constructor(strings) {
		this.strings = strings;
	}
	readU8() {
		if (this.offset + 1 > this.view.byteLength) throw new Error("Binary decode: unexpected end of buffer");
		return this.view.getUint8(this.offset++);
	}
	readU16() {
		if (this.offset + 2 > this.view.byteLength) throw new Error("Binary decode: unexpected end of buffer");
		const v = this.view.getUint16(this.offset, true);
		this.offset += 2;
		return v;
	}
	readU32() {
		if (this.offset + 4 > this.view.byteLength) throw new Error("Binary decode: unexpected end of buffer");
		const v = this.view.getUint32(this.offset, true);
		this.offset += 4;
		return v;
	}
	readStr() {
		return this.strings.get(this.readU16());
	}
	readNodeId() {
		return this.readU32();
	}
	decode(buffer) {
		this.view = new DataView(buffer);
		this.offset = 0;
		const mutations = [];
		while (this.offset < buffer.byteLength) {
			const op = this.readU8();
			mutations.push(this.decodeMutation(op));
		}
		return mutations;
	}
	decodeMutation(op) {
		switch (op) {
			case MutOp.CreateNode: {
				const id = this.readNodeId();
				const tag = this.readStr();
				const textContent = this.readStr();
				return {
					action: "createNode",
					id,
					tag,
					...textContent ? { textContent } : {}
				};
			}
			case MutOp.CreateComment: return {
				action: "createComment",
				id: this.readNodeId(),
				textContent: this.readStr()
			};
			case MutOp.AppendChild: return {
				action: "appendChild",
				id: this.readNodeId(),
				childId: this.readNodeId()
			};
			case MutOp.RemoveNode: return {
				action: "removeNode",
				id: this.readNodeId()
			};
			case MutOp.RemoveChild: return {
				action: "removeChild",
				id: this.readNodeId(),
				childId: this.readNodeId()
			};
			case MutOp.InsertBefore: {
				const id = this.readNodeId();
				const newId = this.readNodeId();
				const refRaw = this.readU32();
				return {
					action: "insertBefore",
					id,
					newId,
					refId: refRaw === 4294967295 ? null : refRaw
				};
			}
			case MutOp.SetAttribute: {
				const id = this.readNodeId();
				const name = this.readStr();
				const value = this.readStr();
				const optional = this.readU8() === 1;
				return {
					action: "setAttribute",
					id,
					name,
					value,
					...optional ? { optional } : {}
				};
			}
			case MutOp.RemoveAttribute: return {
				action: "removeAttribute",
				id: this.readNodeId(),
				name: this.readStr()
			};
			case MutOp.SetStyle: {
				const id = this.readNodeId();
				const property = this.readStr();
				const value = this.readStr();
				const optional = this.readU8() === 1;
				return {
					action: "setStyle",
					id,
					property,
					value,
					...optional ? { optional } : {}
				};
			}
			case MutOp.SetProperty: {
				const id = this.readNodeId();
				const property = this.readStr();
				const valueStr = this.readStr();
				return {
					action: "setProperty",
					id,
					property,
					value: JSON.parse(valueStr)
				};
			}
			case MutOp.SetTextContent: return {
				action: "setTextContent",
				id: this.readNodeId(),
				textContent: this.readStr()
			};
			case MutOp.SetClassName: return {
				action: "setClassName",
				id: this.readNodeId(),
				name: this.readStr()
			};
			case MutOp.SetHTML: return {
				action: "setHTML",
				id: this.readNodeId(),
				html: this.readStr()
			};
			case MutOp.AddEventListener: return {
				action: "addEventListener",
				id: this.readNodeId(),
				name: this.readStr(),
				listenerId: this.readStr()
			};
			case MutOp.HeadAppendChild: return {
				action: "headAppendChild",
				id: this.readNodeId()
			};
			case MutOp.BodyAppendChild: return {
				action: "bodyAppendChild",
				id: this.readNodeId()
			};
			case MutOp.PushState: return {
				action: "pushState",
				state: JSON.parse(this.readStr()),
				title: this.readStr(),
				url: this.readStr()
			};
			case MutOp.ReplaceState: return {
				action: "replaceState",
				state: JSON.parse(this.readStr()),
				title: this.readStr(),
				url: this.readStr()
			};
			case MutOp.ScrollTo: return {
				action: "scrollTo",
				x: this.readU32(),
				y: this.readU32()
			};
			case MutOp.InsertAdjacentHTML: return {
				action: "insertAdjacentHTML",
				id: this.readNodeId(),
				position: this.readStr(),
				html: this.readStr()
			};
			case MutOp.ConfigureEvent: {
				const id = this.readNodeId();
				const name = this.readStr();
				const preventDefault = this.readU8() === 1;
				const passive = this.readU8() === 1;
				return {
					action: "configureEvent",
					id,
					name,
					preventDefault,
					...passive ? { passive } : {}
				};
			}
			case MutOp.RemoveEventListener: return {
				action: "removeEventListener",
				id: this.readNodeId(),
				listenerId: this.readStr()
			};
			case MutOp.CallMethod: {
				const id = this.readNodeId();
				const method = this.readStr();
				const argsStr = this.readStr();
				return {
					action: "callMethod",
					id,
					method,
					args: JSON.parse(argsStr)
				};
			}
			default: throw new Error(`Unknown mutation opcode: ${op}`);
		}
	}
};
//#endregion
//#region src/core/string-store.ts
/**
* Bidirectional string-to-index store for wire format deduplication.
* Strings are assigned monotonic uint16 indices on first encounter.
* Both worker and main thread maintain synchronized copies.
*/
var StringStore = class {
	stringToIndex = /* @__PURE__ */ new Map();
	indexToString = [];
	pending = [];
	/**
	* Get or assign an index for a string. New strings are tracked as pending.
	*/
	store(value) {
		const existing = this.stringToIndex.get(value);
		if (existing !== void 0) return existing;
		const index = this.indexToString.length;
		this.stringToIndex.set(value, index);
		this.indexToString.push(value);
		this.pending.push(value);
		return index;
	}
	/**
	* Get string by index.
	*/
	get(index) {
		return this.indexToString[index] ?? "";
	}
	/**
	* Consume pending new strings (for sending to the other side).
	*/
	consumePending() {
		const p = this.pending;
		this.pending = [];
		return p;
	}
	/**
	* Register strings from the other side (no pending tracking).
	*/
	registerBulk(strings) {
		for (const s of strings) if (!this.stringToIndex.has(s)) {
			const index = this.indexToString.length;
			this.stringToIndex.set(s, index);
			this.indexToString.push(s);
		}
	}
	get size() {
		return this.indexToString.length;
	}
};
//#endregion
//#region src/transport/binary-worker-transport.ts
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/**
* Returns true if the value is an ArrayBuffer (or ArrayBuffer-like from Uint8Array.buffer).
*/
function isArrayBuffer(value) {
	return value instanceof ArrayBuffer || typeof value === "object" && value !== null && "byteLength" in value && "slice" in value && typeof value.slice === "function" && !ArrayBuffer.isView(value);
}
/**
* Marker byte for binary mutation messages.
* Used to distinguish binary-encoded mutations from legacy JSON-in-ArrayBuffer.
*/
const BINARY_MUTATION_MARKER = 2;
/**
* Returns true if the incoming data is a binary mutation message (has the marker byte).
*/
function isBinaryMutationMessage(data) {
	if (data.byteLength < 1) return false;
	return new DataView(data).getUint8(0) === BINARY_MUTATION_MARKER;
}
/**
* Encode a Message as a Transferable ArrayBuffer (legacy JSON format).
* Used for non-mutation messages.
*/
function encodeBinaryMessage(message) {
	const json = JSON.stringify(message);
	const bytes = encoder.encode(json);
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	return buffer;
}
/**
* Decode a Message from an ArrayBuffer (inverse of encodeBinaryMessage).
*/
function decodeBinaryMessage(buffer) {
	return JSON.parse(decoder.decode(buffer));
}
/**
* Returns true if the message should be sent as a Transferable ArrayBuffer.
* Only mutation messages benefit from zero-copy transfer since they are
* the most frequent and largest messages.
*/
function shouldUseBinaryTransfer(message) {
	return message.type === "mutation";
}
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
/**
* Encode a binary mutation message with string table preamble.
*
* Wire format:
* [uint8: 0x02 marker]
* [uint32: uid]
* [uint16: appId byte length] [UTF-8 bytes: appId]
* [uint8: priority (0=normal, 1=high, 2=low)]
* [uint16: newStringCount]
* [...newStrings: each is uint16 byteLength + UTF-8 bytes]
* [...binaryMutations: the encoded buffer from BinaryMutationEncoder]
*/
function encodeBinaryMutationMessage(message, strings, mutEncoder) {
	mutEncoder.reset();
	for (const mut of message.mutations) mutEncoder.encode(mut);
	const mutBuffer = mutEncoder.finish();
	const newStrings = strings.consumePending();
	const appIdBytes = textEncoder.encode(message.appId);
	let headerSize = 7 + appIdBytes.byteLength + 1 + 2;
	const encodedStrings = [];
	for (const s of newStrings) {
		const encoded = textEncoder.encode(s);
		encodedStrings.push(encoded);
		headerSize += 2 + encoded.byteLength;
	}
	const totalSize = headerSize + mutBuffer.byteLength;
	const buffer = new ArrayBuffer(totalSize);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	let offset = 0;
	view.setUint8(offset++, BINARY_MUTATION_MARKER);
	view.setUint32(offset, message.uid, true);
	offset += 4;
	view.setUint16(offset, appIdBytes.byteLength, true);
	offset += 2;
	bytes.set(appIdBytes, offset);
	offset += appIdBytes.byteLength;
	view.setUint8(offset++, {
		normal: 0,
		high: 1,
		low: 2
	}[message.priority ?? "normal"]);
	view.setUint16(offset, newStrings.length, true);
	offset += 2;
	for (const encoded of encodedStrings) {
		view.setUint16(offset, encoded.byteLength, true);
		offset += 2;
		bytes.set(encoded, offset);
		offset += encoded.byteLength;
	}
	bytes.set(new Uint8Array(mutBuffer), offset);
	return buffer;
}
/**
* Decode a binary mutation message from the wire format.
*/
function decodeBinaryMutationMessage(buffer, strings, mutDecoder) {
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	let offset = 0;
	offset += 1;
	const uid = view.getUint32(offset, true);
	offset += 4;
	const appIdLen = view.getUint16(offset, true);
	offset += 2;
	const appId = textDecoder.decode(bytes.slice(offset, offset + appIdLen));
	offset += appIdLen;
	const priority = [
		"normal",
		"high",
		"low"
	][view.getUint8(offset++)] ?? "normal";
	const newStringCount = view.getUint16(offset, true);
	offset += 2;
	const newStrings = [];
	for (let i = 0; i < newStringCount; i++) {
		const strLen = view.getUint16(offset, true);
		offset += 2;
		newStrings.push(textDecoder.decode(bytes.slice(offset, offset + strLen)));
		offset += strLen;
	}
	strings.registerBulk(newStrings);
	const mutPayload = buffer.slice(offset);
	return {
		type: "mutation",
		appId,
		uid,
		mutations: mutDecoder.decode(mutPayload),
		...priority !== "normal" ? { priority } : {}
	};
}
/**
* Worker transport that uses binary encoding for mutation messages.
*
* Mutation messages are encoded using BinaryMutationEncoder with string
* deduplication, providing ~10x smaller wire format compared to JSON.
* Non-mutation messages fall back to structured clone.
*
* Used on the main thread side to communicate with a dedicated worker.
*/
var BinaryWorkerTransport = class {
	handlers = [];
	_readyState = "open";
	strings = new StringStore();
	mutDecoder = new BinaryMutationDecoder(this.strings);
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
			if (this.handlers.length === 0) return;
			let msg;
			if (isArrayBuffer(e.data)) if (isBinaryMutationMessage(e.data)) msg = decodeBinaryMutationMessage(e.data, this.strings, this.mutDecoder);
			else msg = decodeBinaryMessage(e.data);
			else msg = e.data;
			for (const h of this.handlers) try {
				h(msg);
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
		if (shouldUseBinaryTransfer(message)) {
			const buffer = encodeBinaryMessage(message);
			if (this._statsEnabled) {
				const bytes = buffer.byteLength;
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) this._stats.largestMessageBytes = bytes;
			}
			this.worker.postMessage(buffer, [buffer]);
		} else {
			if (this._statsEnabled) {
				const bytes = JSON.stringify(message).length;
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) this._stats.largestMessageBytes = bytes;
			}
			this.worker.postMessage(message);
		}
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
* Worker-side binary transport (used inside the worker via self.postMessage).
*
* Mutation messages are encoded using BinaryMutationEncoder with string
* deduplication. The string table preamble is embedded in each message
* so the main thread can stay synchronized.
*
* Counterpart to BinaryWorkerTransport for use within the Web Worker.
*/
var BinaryWorkerSelfTransport = class {
	handlers = [];
	_readyState = "open";
	strings = new StringStore();
	mutEncoder = new BinaryMutationEncoder(this.strings);
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
			if (this.handlers.length === 0) return;
			const msg = isArrayBuffer(e.data) ? decodeBinaryMessage(e.data) : e.data;
			for (const h of this.handlers) try {
				h(msg);
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
		if (shouldUseBinaryTransfer(message)) {
			const buffer = encodeBinaryMutationMessage(message, this.strings, this.mutEncoder);
			if (this._statsEnabled) {
				const bytes = buffer.byteLength;
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) this._stats.largestMessageBytes = bytes;
			}
			this.scope.postMessage(buffer, [buffer]);
		} else {
			if (this._statsEnabled) {
				const bytes = JSON.stringify(message).length;
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) this._stats.largestMessageBytes = bytes;
			}
			this.scope.postMessage(message);
		}
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
//#region src/transport/ws-transport.ts
/**
* Transport implementation using WebSocket with automatic reconnection.
* Messages are queued while disconnected and flushed on reconnect.
*/
var WebSocketTransport = class {
	ws = null;
	handlers = [];
	_readyState = "connecting";
	_stats = {
		messageCount: 0,
		totalBytes: 0,
		largestMessageBytes: 0,
		lastMessageBytes: 0
	};
	onError;
	onClose;
	attempt = 0;
	messageQueue = [];
	closed = false;
	reconnectTimer = null;
	maxRetries;
	baseDelay;
	maxDelay;
	constructor(url, options) {
		this.url = url;
		this.maxRetries = options?.maxRetries ?? 10;
		this.baseDelay = options?.baseDelay ?? 1e3;
		this.maxDelay = options?.maxDelay ?? 3e4;
		this.connect();
	}
	connect() {
		if (this.closed) return;
		this._readyState = "connecting";
		this.ws = new WebSocket(this.url);
		this.ws.onopen = () => {
			this._readyState = "open";
			this.attempt = 0;
			this.flushQueue();
		};
		this.ws.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data);
				for (const h of this.handlers) try {
					h(data);
				} catch (err) {
					console.error("[async-dom] Handler error:", err);
				}
			} catch {
				console.error("[async-dom] Failed to parse WebSocket message");
			}
		};
		this.ws.onclose = () => {
			if (!this.closed) this.scheduleReconnect();
		};
		this.ws.onerror = () => {
			this.ws?.close();
		};
	}
	scheduleReconnect() {
		if (this.attempt >= this.maxRetries) {
			this._readyState = "closed";
			console.error(`[async-dom] WebSocket reconnection failed after ${this.maxRetries} attempts`);
			return;
		}
		const delay = Math.min(this.baseDelay * 2 ** this.attempt + Math.random() * 1e3, this.maxDelay);
		this.attempt++;
		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}
	flushQueue() {
		while (this.messageQueue.length > 0) {
			const msg = this.messageQueue.shift();
			if (!msg) break;
			this.sendRaw(msg);
		}
	}
	sendRaw(message) {
		const json = JSON.stringify(message);
		const bytes = json.length;
		this._stats.messageCount++;
		this._stats.totalBytes += bytes;
		this._stats.lastMessageBytes = bytes;
		if (bytes > this._stats.largestMessageBytes) this._stats.largestMessageBytes = bytes;
		this.ws?.send(json);
	}
	send(message) {
		if (this._readyState === "open" && this.ws?.readyState === WebSocket.OPEN) this.sendRaw(message);
		else if (this._readyState !== "closed") this.messageQueue.push(message);
	}
	onMessage(handler) {
		this.handlers.push(handler);
	}
	close() {
		this.closed = true;
		this._readyState = "closed";
		if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
		this.ws?.close();
		this.messageQueue.length = 0;
	}
	get readyState() {
		return this._readyState;
	}
	getStats() {
		return { ...this._stats };
	}
};
//#endregion
export { encodeBinaryMessage as a, decodeBinaryMessage as i, BinaryWorkerSelfTransport as n, CRITICAL_QUEUE_SIZE as o, BinaryWorkerTransport as r, MAX_QUEUE_BEFORE_FLUSH as s, WebSocketTransport as t };

//# sourceMappingURL=ws-transport.js.map