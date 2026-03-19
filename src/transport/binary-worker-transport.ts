import type { Message } from "../core/protocol.ts";
import type { Transport, TransportReadyState } from "./base.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Returns true if the value is an ArrayBuffer (or ArrayBuffer-like from Uint8Array.buffer).
 */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
	return value instanceof ArrayBuffer ||
		(typeof value === "object" && value !== null && "byteLength" in value && "slice" in value && typeof (value as ArrayBuffer).slice === "function" && !ArrayBuffer.isView(value));
}

/**
 * Encode a Message as a Transferable ArrayBuffer.
 * The message is JSON-serialized and then encoded as UTF-8 bytes.
 */
export function encodeBinaryMessage(message: Message): ArrayBuffer {
	const json = JSON.stringify(message);
	const bytes = encoder.encode(json);
	// Copy into a standalone ArrayBuffer to ensure it is transferable
	// and not a view over a shared/larger buffer.
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
 * the most frequent and largest messages. Other message types (events,
 * system messages) are infrequent and use regular structured clone.
 *
 * IMPORTANT: This must NOT return true for "init" messages, because they
 * may contain a SharedArrayBuffer field which is not JSON-serializable.
 * JSON.stringify would silently drop it, breaking sync reads.
 */
function shouldUseBinaryTransfer(message: Message): boolean {
	return message.type === "mutation";
}

/**
 * Worker transport that uses Transferable ArrayBuffers for zero-copy message passing.
 * Mutation messages are JSON-encoded into a Uint8Array and the underlying ArrayBuffer
 * is transferred (not cloned), eliminating structured clone overhead.
 * Non-mutation messages fall back to structured clone since they are infrequent.
 *
 * Used on the main thread side to communicate with a dedicated worker.
 */
export class BinaryWorkerTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
	onError?: (error: Error) => void;
	onClose?: () => void;

	constructor(private worker: Worker) {
		worker.onmessage = (e: MessageEvent) => {
			if (this.handlers.length === 0) return;
			const msg = isArrayBuffer(e.data) ? decodeBinaryMessage(e.data) : e.data;
			for (const h of this.handlers) {
				try { h(msg); } catch (err) { console.error("[async-dom] Handler error:", err); }
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

	send(message: Message): void {
		if (this._readyState !== "open") {
			return;
		}
		if (shouldUseBinaryTransfer(message)) {
			const buffer = encodeBinaryMessage(message);
			this.worker.postMessage(buffer, [buffer]);
		} else {
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
}

/**
 * Worker-side binary transport (used inside the worker via self.postMessage).
 * Counterpart to BinaryWorkerTransport for use within the Web Worker.
 */
export class BinaryWorkerSelfTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
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
				try { h(msg); } catch (err) { console.error("[async-dom] Handler error:", err); }
			}
		};
	}

	send(message: Message): void {
		if (this._readyState !== "open") {
			return;
		}
		if (shouldUseBinaryTransfer(message)) {
			const buffer = encodeBinaryMessage(message);
			this.scope.postMessage(buffer, [buffer]);
		} else {
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
}
