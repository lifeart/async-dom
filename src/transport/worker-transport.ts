import type { Message } from "../core/protocol.ts";
import type { Transport, TransportReadyState } from "./base.ts";

/**
 * Transport implementation using Web Worker postMessage.
 * Used on the main thread side to communicate with a dedicated worker.
 */
export class WorkerTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
	onError?: (error: Error) => void;
	onClose?: () => void;

	constructor(private worker: Worker) {
		worker.onmessage = (e: MessageEvent<Message>) => {
			for (const h of this.handlers) {
				try { h(e.data); } catch (err) { console.error("[async-dom] Handler error:", err); }
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
}

/**
 * Transport implementation used inside a Web Worker.
 * Communicates with the main thread via self.postMessage.
 */
export class WorkerSelfTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
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
				try { h(e.data); } catch (err) { console.error("[async-dom] Handler error:", err); }
			}
		};
	}

	send(message: Message): void {
		if (this._readyState !== "open") {
			return;
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
}
