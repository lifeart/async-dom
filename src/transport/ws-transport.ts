import { WS_BASE_DELAY_MS, WS_MAX_DELAY_MS, WS_MAX_RETRIES } from "../core/constants.ts";
import type { Message } from "../core/protocol.ts";
import type { Transport, TransportReadyState, TransportStats } from "./base.ts";

export interface WebSocketTransportOptions {
	maxRetries?: number;
	baseDelay?: number;
	maxDelay?: number;
}

/**
 * Transport implementation using WebSocket with automatic reconnection.
 * Messages are queued while disconnected and flushed on reconnect.
 */
export class WebSocketTransport implements Transport {
	private ws: WebSocket | null = null;
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "connecting";
	private _stats: TransportStats = { messageCount: 0, totalBytes: 0, largestMessageBytes: 0, lastMessageBytes: 0 };
	onError?: (error: Error) => void;
	onClose?: () => void;
	private attempt = 0;
	private messageQueue: Message[] = [];
	private closed = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	private readonly maxRetries: number;
	private readonly baseDelay: number;
	private readonly maxDelay: number;

	constructor(
		private url: string,
		options?: WebSocketTransportOptions,
	) {
		this.maxRetries = options?.maxRetries ?? WS_MAX_RETRIES;
		this.baseDelay = options?.baseDelay ?? WS_BASE_DELAY_MS;
		this.maxDelay = options?.maxDelay ?? WS_MAX_DELAY_MS;
		this.connect();
	}

	private connect(): void {
		if (this.closed) return;

		this._readyState = "connecting";
		this.ws = new WebSocket(this.url);

		this.ws.onopen = () => {
			this._readyState = "open";
			this.attempt = 0;
			this.flushQueue();
		};

		this.ws.onmessage = (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data as string) as Message;
				for (const h of this.handlers) {
					try {
						h(data);
					} catch (err) {
						console.error("[async-dom] Handler error:", err);
					}
				}
			} catch {
				console.error("[async-dom] Failed to parse WebSocket message");
			}
		};

		this.ws.onclose = () => {
			if (!this.closed) {
				this.scheduleReconnect();
			}
		};

		this.ws.onerror = () => {
			this.ws?.close();
		};
	}

	private scheduleReconnect(): void {
		if (this.attempt >= this.maxRetries) {
			this._readyState = "closed";
			console.error(`[async-dom] WebSocket reconnection failed after ${this.maxRetries} attempts`);
			return;
		}

		// Exponential backoff with jitter
		const delay = Math.min(
			this.baseDelay * 2 ** this.attempt + Math.random() * 1000,
			this.maxDelay,
		);
		this.attempt++;

		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}

	private flushQueue(): void {
		while (this.messageQueue.length > 0) {
			const msg = this.messageQueue.shift();
			if (!msg) break;
			this.sendRaw(msg);
		}
	}

	private sendRaw(message: Message): void {
		const json = JSON.stringify(message);
		const bytes = json.length;
		this._stats.messageCount++;
		this._stats.totalBytes += bytes;
		this._stats.lastMessageBytes = bytes;
		if (bytes > this._stats.largestMessageBytes) {
			this._stats.largestMessageBytes = bytes;
		}
		this.ws?.send(json);
	}

	send(message: Message): void {
		if (this._readyState === "open" && this.ws?.readyState === WebSocket.OPEN) {
			this.sendRaw(message);
		} else if (this._readyState !== "closed") {
			this.messageQueue.push(message);
		}
	}

	onMessage(handler: (message: Message) => void): void {
		this.handlers.push(handler);
	}

	close(): void {
		this.closed = true;
		this._readyState = "closed";
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
		}
		this.ws?.close();
		this.messageQueue.length = 0;
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}

	getStats(): TransportStats {
		return { ...this._stats };
	}
}
