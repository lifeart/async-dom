import type { Message } from "../core/protocol.ts";
import type { Transport, TransportReadyState, TransportStats } from "./base.ts";

/**
 * Transport implementation using Web Worker postMessage.
 * Used on the main thread side to communicate with a dedicated worker.
 */
export class WorkerTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
	private _statsEnabled = false;
	private _stats: TransportStats = { messageCount: 0, totalBytes: 0, largestMessageBytes: 0, lastMessageBytes: 0 };
	onError?: (error: Error) => void;
	onClose?: () => void;

	constructor(private worker: Worker) {
		worker.onmessage = (e: MessageEvent<Message>) => {
			for (const h of this.handlers) {
				try {
					h(e.data);
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
		if (this._statsEnabled) {
			const size = JSON.stringify(message).length;
			this._stats.messageCount++;
			this._stats.totalBytes += size;
			this._stats.lastMessageBytes = size;
			if (size > this._stats.largestMessageBytes) {
				this._stats.largestMessageBytes = size;
			}
		}
		this.worker.postMessage(message);
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
 * Transport implementation used inside a Web Worker.
 * Communicates with the main thread via self.postMessage.
 */
export class WorkerSelfTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
	private _statsEnabled = false;
	private _stats: TransportStats = { messageCount: 0, totalBytes: 0, largestMessageBytes: 0, lastMessageBytes: 0 };
	onError?: (error: Error) => void;
	onClose?: () => void;
	private scope: {
		postMessage(message: unknown): void;
		onmessage: ((e: MessageEvent) => void) | null;
	};

	constructor(scope?: {
		postMessage(message: unknown): void;
		onmessage: ((e: MessageEvent) => void) | null;
	}) {
		this.scope = scope ?? (self as unknown as typeof this.scope);
		this.scope.onmessage = (e: MessageEvent<Message>) => {
			for (const h of this.handlers) {
				try {
					h(e.data);
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
		if (this._statsEnabled) {
			const size = JSON.stringify(message).length;
			this._stats.messageCount++;
			this._stats.totalBytes += size;
			this._stats.lastMessageBytes = size;
			if (size > this._stats.largestMessageBytes) {
				this._stats.largestMessageBytes = size;
			}
		}
		this.scope.postMessage(message);
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
