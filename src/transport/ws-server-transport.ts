import type { Message } from "../core/protocol.ts";
import type { Transport, TransportReadyState, TransportStats } from "./base.ts";

/**
 * Minimal WebSocket interface that works with any WebSocket server library
 * (ws, uWebSockets.js, Deno, Bun, etc.) without importing their types.
 */
export interface WebSocketLike {
	send(data: string): void;
	close(code?: number, reason?: string): void;
	readonly readyState: number;
	readonly bufferedAmount: number;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: { code: number; reason: string }) => void) | null;
	onerror: ((event: unknown) => void) | null;
}

/** 1 MB — stop sending and start queueing */
const HIGH_WATER_MARK = 1024 * 1024;
/** 256 KB — resume sending queued messages */
const LOW_WATER_MARK = 256 * 1024;
/** Interval for checking bufferedAmount drain (ms) */
const DRAIN_CHECK_INTERVAL = 50;
/** Maximum queued messages before dropping (backpressure safety valve) */
const MAX_QUEUE_SIZE = 10_000;

/**
 * Server-side WebSocket transport for async-dom.
 *
 * Unlike the client-side WebSocketTransport, this does NOT handle reconnection.
 * It accepts an already-connected WebSocketLike socket and wraps it with
 * the Transport interface including backpressure handling.
 */
export class WebSocketServerTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState;
	private _stats: TransportStats = {
		messageCount: 0,
		totalBytes: 0,
		largestMessageBytes: 0,
		lastMessageBytes: 0,
	};
	private _statsEnabled = false;
	private messageQueue: Message[] = [];
	private drainTimer: ReturnType<typeof setInterval> | null = null;

	onError?: (error: Error) => void;
	onClose?: () => void;

	constructor(private socket: WebSocketLike) {
		// Map initial readyState
		this._readyState = this.mapReadyState(socket.readyState);

		// Wire incoming messages
		this.socket.onmessage = (event: { data: unknown }) => {
			try {
				const raw = typeof event.data === "string" ? event.data : String(event.data);
				const data = JSON.parse(raw) as Message;
				for (const h of this.handlers) {
					try {
						h(data);
					} catch (err) {
						console.error("[async-dom] Server transport handler error:", err);
					}
				}
			} catch {
				console.error("[async-dom] Failed to parse WebSocket message");
			}
		};

		// Wire close
		this.socket.onclose = (_event: { code: number; reason: string }) => {
			this._readyState = "closed";
			this.stopDrainCheck();
			this.onClose?.();
		};

		// Wire error
		this.socket.onerror = (event: unknown) => {
			this.stopDrainCheck();
			this.messageQueue.length = 0;
			this.onError?.(event instanceof Error ? event : new Error("WebSocket error"));
		};
	}

	private mapReadyState(wsState: number): TransportReadyState {
		switch (wsState) {
			case 0:
				return "connecting";
			case 1:
				return "open";
			case 2:
			case 3:
				return "closed";
			default:
				return "closed";
		}
	}

	send(message: Message): void {
		if (this._readyState === "closed") return;

		// Backpressure: queue if bufferedAmount exceeds high water mark
		if (this.socket.bufferedAmount > HIGH_WATER_MARK) {
			if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
				// Safety valve: drop oldest messages to prevent unbounded memory growth
				this.messageQueue.shift();
			}
			this.messageQueue.push(message);
			this.startDrainCheck();
			return;
		}

		this.sendRaw(message);
	}

	private sendRaw(message: Message): void {
		try {
			const json = JSON.stringify(message);
			const bytes = json.length;

			if (this._statsEnabled) {
				this._stats.messageCount++;
				this._stats.totalBytes += bytes;
				this._stats.lastMessageBytes = bytes;
				if (bytes > this._stats.largestMessageBytes) {
					this._stats.largestMessageBytes = bytes;
				}
			}

			this.socket.send(json);
		} catch (err) {
			this.onError?.(err instanceof Error ? err : new Error("Send failed"));
		}
	}

	private startDrainCheck(): void {
		if (this.drainTimer !== null) return;

		this.drainTimer = setInterval(() => {
			if (this.socket.bufferedAmount <= LOW_WATER_MARK) {
				this.flushQueue();
			}
			// Stop checking if queue is empty
			if (this.messageQueue.length === 0) {
				this.stopDrainCheck();
			}
		}, DRAIN_CHECK_INTERVAL);
	}

	private stopDrainCheck(): void {
		if (this.drainTimer !== null) {
			clearInterval(this.drainTimer);
			this.drainTimer = null;
		}
	}

	private flushQueue(): void {
		// Fix 5: don't waste cycles flushing a closed transport
		if (this._readyState === "closed") {
			this.messageQueue.length = 0;
			return;
		}
		while (this.messageQueue.length > 0) {
			// Re-check backpressure while flushing
			if (this.socket.bufferedAmount > HIGH_WATER_MARK) {
				return;
			}
			const msg = this.messageQueue.shift();
			if (msg) {
				this.sendRaw(msg);
			}
		}
	}

	onMessage(handler: (message: Message) => void): void {
		this.handlers.push(handler);
	}

	close(): void {
		if (this._readyState === "closed") return;
		this._readyState = "closed";
		this.stopDrainCheck();
		this.messageQueue.length = 0;
		this.socket.close(1000, "Transport closed");
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}

	get bufferedAmount(): number {
		return this.socket.bufferedAmount;
	}

	getStats(): TransportStats {
		return { ...this._stats };
	}

	enableStats(enabled: boolean): void {
		this._statsEnabled = enabled;
	}
}
