import { BinaryMutationDecoder, BinaryMutationEncoder } from "../core/binary-codec.ts";
import type { Message, MutationMessage } from "../core/protocol.ts";
import { StringStore } from "../core/string-store.ts";
import type { Transport, TransportReadyState, TransportStats } from "./base.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Returns true if the value is an ArrayBuffer (or ArrayBuffer-like from Uint8Array.buffer).
 */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
	return (
		value instanceof ArrayBuffer ||
		(typeof value === "object" &&
			value !== null &&
			"byteLength" in value &&
			"slice" in value &&
			typeof (value as ArrayBuffer).slice === "function" &&
			!ArrayBuffer.isView(value))
	);
}

/**
 * Marker byte for binary mutation messages.
 * Used to distinguish binary-encoded mutations from legacy JSON-in-ArrayBuffer.
 */
const BINARY_MUTATION_MARKER = 0x02;

/**
 * Returns true if the incoming data is a binary mutation message (has the marker byte).
 */
function isBinaryMutationMessage(data: ArrayBuffer): boolean {
	if (data.byteLength < 1) return false;
	return new DataView(data).getUint8(0) === BINARY_MUTATION_MARKER;
}

/**
 * Encode a Message as a Transferable ArrayBuffer (legacy JSON format).
 * Used for non-mutation messages.
 */
export function encodeBinaryMessage(message: Message): ArrayBuffer {
	const json = JSON.stringify(message);
	const bytes = encoder.encode(json);
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	return buffer;
}

/**
 * Decode a Message from an ArrayBuffer (inverse of encodeBinaryMessage).
 */
export function decodeBinaryMessage(buffer: ArrayBuffer): Message {
	return JSON.parse(decoder.decode(buffer));
}

/**
 * Returns true if the message should be sent as a Transferable ArrayBuffer.
 * Only mutation messages benefit from zero-copy transfer since they are
 * the most frequent and largest messages.
 */
function shouldUseBinaryTransfer(message: Message): boolean {
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
function encodeBinaryMutationMessage(
	message: MutationMessage,
	strings: StringStore,
	mutEncoder: BinaryMutationEncoder,
): ArrayBuffer {
	// Encode mutations first so that new strings get registered in the store
	mutEncoder.reset();
	for (const mut of message.mutations) {
		mutEncoder.encode(mut);
	}
	const mutBuffer = mutEncoder.finish();
	const newStrings = strings.consumePending();

	// Encode appId as UTF-8
	const appIdBytes = textEncoder.encode(message.appId);

	// Calculate total size for the header
	let headerSize =
		1 + // marker
		4 + // uid
		2 +
		appIdBytes.byteLength + // appId
		1 + // priority
		2; // newStringCount

	// Pre-encode new strings
	const encodedStrings: Uint8Array[] = [];
	for (const s of newStrings) {
		const encoded = textEncoder.encode(s);
		encodedStrings.push(encoded);
		headerSize += 2 + encoded.byteLength; // uint16 length + bytes
	}

	const totalSize = headerSize + mutBuffer.byteLength;
	const buffer = new ArrayBuffer(totalSize);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	let offset = 0;

	// Marker
	view.setUint8(offset++, BINARY_MUTATION_MARKER);

	// uid
	view.setUint32(offset, message.uid, true);
	offset += 4;

	// appId
	view.setUint16(offset, appIdBytes.byteLength, true);
	offset += 2;
	bytes.set(appIdBytes, offset);
	offset += appIdBytes.byteLength;

	// priority
	const priorityMap = { normal: 0, high: 1, low: 2 } as const;
	view.setUint8(offset++, priorityMap[message.priority ?? "normal"]);

	// new strings
	view.setUint16(offset, newStrings.length, true);
	offset += 2;
	for (const encoded of encodedStrings) {
		view.setUint16(offset, encoded.byteLength, true);
		offset += 2;
		bytes.set(encoded, offset);
		offset += encoded.byteLength;
	}

	// mutation payload
	bytes.set(new Uint8Array(mutBuffer), offset);

	return buffer;
}

/**
 * Decode a binary mutation message from the wire format.
 */
function decodeBinaryMutationMessage(
	buffer: ArrayBuffer,
	strings: StringStore,
	mutDecoder: BinaryMutationDecoder,
): MutationMessage {
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	let offset = 0;

	// Skip marker
	offset += 1;

	// uid
	const uid = view.getUint32(offset, true);
	offset += 4;

	// appId
	const appIdLen = view.getUint16(offset, true);
	offset += 2;
	const appId = textDecoder.decode(bytes.slice(offset, offset + appIdLen));
	offset += appIdLen;

	// priority
	const priorityByte = view.getUint8(offset++);
	const priorityValues = ["normal", "high", "low"] as const;
	const priority = priorityValues[priorityByte] ?? "normal";

	// new strings
	const newStringCount = view.getUint16(offset, true);
	offset += 2;
	const newStrings: string[] = [];
	for (let i = 0; i < newStringCount; i++) {
		const strLen = view.getUint16(offset, true);
		offset += 2;
		newStrings.push(textDecoder.decode(bytes.slice(offset, offset + strLen)));
		offset += strLen;
	}
	strings.registerBulk(newStrings);

	// mutation payload
	const mutPayload = buffer.slice(offset);
	const mutations = mutDecoder.decode(mutPayload);

	return {
		type: "mutation",
		appId: appId as MutationMessage["appId"],
		uid,
		mutations,
		...(priority !== "normal" ? { priority } : {}),
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
export class BinaryWorkerTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
	private strings = new StringStore();
	private mutDecoder = new BinaryMutationDecoder(this.strings);
	private _statsEnabled = false;
	private _stats: TransportStats = { messageCount: 0, totalBytes: 0, largestMessageBytes: 0, lastMessageBytes: 0 };
	onError?: (error: Error) => void;
	onClose?: () => void;

	constructor(private worker: Worker) {
		worker.onmessage = (e: MessageEvent) => {
			if (this.handlers.length === 0) return;
			let msg: Message;
			if (isArrayBuffer(e.data)) {
				if (isBinaryMutationMessage(e.data)) {
					msg = decodeBinaryMutationMessage(e.data, this.strings, this.mutDecoder);
				} else {
					// Legacy JSON-in-ArrayBuffer format
					msg = decodeBinaryMessage(e.data);
				}
			} else {
				msg = e.data;
			}
			for (const h of this.handlers) {
				try {
					h(msg);
				} catch (err) {
					console.error("[async-dom] Handler error:", err);
				}
			}
		};
		worker.onerror = (e: ErrorEvent) => {
			const error = new Error(e.message ?? "Worker error");
			this.onError?.(error);
			if (this._readyState !== "closed") {
				this._readyState = "closed";
				this.onClose?.();
			}
		};
		worker.onmessageerror = () => {
			const error = new Error("Worker message deserialization failed");
			this.onError?.(error);
		};
	}

	enableStats(enabled: boolean): void {
		this._statsEnabled = enabled;
	}

	send(message: Message): void {
		if (this._readyState !== "open") {
			return;
		}
		if (shouldUseBinaryTransfer(message)) {
			const buffer = encodeBinaryMessage(message);
			if (this._statsEnabled) {
				const bytes = buffer.byteLength;
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) {
					this._stats.largestMessageBytes = bytes;
				}
			}
			this.worker.postMessage(buffer, [buffer]);
		} else {
			if (this._statsEnabled) {
				const bytes = JSON.stringify(message).length;
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) {
					this._stats.largestMessageBytes = bytes;
				}
			}
			this.worker.postMessage(message);
		}
	}

	onMessage(handler: (message: Message) => void): void {
		this.handlers.push(handler);
	}

	close(): void {
		this._readyState = "closed";
		this.worker.terminate();
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}

	getStats(): TransportStats {
		return { ...this._stats };
	}
}

/**
 * Worker-side binary transport (used inside the worker via self.postMessage).
 *
 * Mutation messages are encoded using BinaryMutationEncoder with string
 * deduplication. The string table preamble is embedded in each message
 * so the main thread can stay synchronized.
 *
 * Counterpart to BinaryWorkerTransport for use within the Web Worker.
 */
export class BinaryWorkerSelfTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
	private strings = new StringStore();
	private mutEncoder = new BinaryMutationEncoder(this.strings);
	private _statsEnabled = false;
	private _stats: TransportStats = { messageCount: 0, totalBytes: 0, largestMessageBytes: 0, lastMessageBytes: 0 };
	onError?: (error: Error) => void;
	onClose?: () => void;
	private scope: {
		postMessage(message: unknown, transfer?: Transferable[]): void;
		onmessage: ((e: MessageEvent) => void) | null;
	};

	constructor(scope?: {
		postMessage(message: unknown, transfer?: Transferable[]): void;
		onmessage: ((e: MessageEvent) => void) | null;
	}) {
		this.scope = scope ?? (self as unknown as typeof this.scope);
		this.scope.onmessage = (e: MessageEvent) => {
			if (this.handlers.length === 0) return;
			const msg = isArrayBuffer(e.data) ? decodeBinaryMessage(e.data) : e.data;
			for (const h of this.handlers) {
				try {
					h(msg);
				} catch (err) {
					console.error("[async-dom] Handler error:", err);
				}
			}
		};
	}

	enableStats(enabled: boolean): void {
		this._statsEnabled = enabled;
	}

	send(message: Message): void {
		if (this._readyState !== "open") {
			return;
		}
		if (shouldUseBinaryTransfer(message)) {
			const buffer = encodeBinaryMutationMessage(
				message as MutationMessage,
				this.strings,
				this.mutEncoder,
			);
			if (this._statsEnabled) {
				const bytes = buffer.byteLength;
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) {
					this._stats.largestMessageBytes = bytes;
				}
			}
			this.scope.postMessage(buffer, [buffer]);
		} else {
			if (this._statsEnabled) {
				const bytes = JSON.stringify(message).length;
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) {
					this._stats.largestMessageBytes = bytes;
				}
			}
			this.scope.postMessage(message);
		}
	}

	onMessage(handler: (message: Message) => void): void {
		this.handlers.push(handler);
	}

	close(): void {
		this._readyState = "closed";
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}

	getStats(): TransportStats {
		return { ...this._stats };
	}
}
