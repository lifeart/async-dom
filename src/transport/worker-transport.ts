import type { Message } from "../core/protocol.ts";
import type { Transport, TransportReadyState } from "./base.ts";

/**
 * Transport implementation using Web Worker postMessage.
 * Used on the main thread side to communicate with a dedicated worker.
 */
export class WorkerTransport implements Transport {
	private handler: ((message: Message) => void) | null = null;
	private _readyState: TransportReadyState = "open";

	constructor(private worker: Worker) {
		worker.onmessage = (e: MessageEvent<Message>) => {
			this.handler?.(e.data);
		};
		worker.onerror = (e: ErrorEvent) => {
			console.error("[async-dom] Worker error:", e.message);
		};
	}

	send(message: Message): void {
		if (this._readyState !== "open") {
			return;
		}
		this.worker.postMessage(message);
	}

	onMessage(handler: (message: Message) => void): void {
		this.handler = handler;
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
	private handler: ((message: Message) => void) | null = null;
	private _readyState: TransportReadyState = "open";
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
			this.handler?.(e.data);
		};
	}

	send(message: Message): void {
		if (this._readyState !== "open") {
			return;
		}
		this.scope.postMessage(message);
	}

	onMessage(handler: (message: Message) => void): void {
		this.handler = handler;
	}

	close(): void {
		this._readyState = "closed";
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}
}
