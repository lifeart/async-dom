import type { Message } from "../core/protocol.ts";
import type { Transport, TransportReadyState, TransportStats } from "./base.ts";

/**
 * Transport implementation using a SharedWorker MessagePort.
 * Used on the main thread side to communicate with a SharedWorker.
 */
export class SharedWorkerTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
	private _statsEnabled = false;
	private _stats: TransportStats = {
		messageCount: 0,
		totalBytes: 0,
		largestMessageBytes: 0,
		lastMessageBytes: 0,
	};
	private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private _heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
	onError?: (error: Error) => void;
	onClose?: () => void;

	constructor(private port: MessagePort) {
		port.onmessage = (e: MessageEvent) => {
			const data = e.data;
			// Handle pong responses for heartbeat — don't forward to app handlers
			if (data && typeof data === "object" && data.type === "pong") {
				this._clearHeartbeatTimeout();
				return;
			}
			for (const h of this.handlers) {
				try {
					h(data as Message);
				} catch (err) {
					console.error("[async-dom] Handler error:", err);
				}
			}
		};

		port.onmessageerror = () => {
			const error = new Error("SharedWorker message deserialization failed");
			this.onError?.(error);
		};

		// Chrome 122+ supports close event on MessagePort for instant detection
		try {
			port.addEventListener("close", () => {
				this._stopHeartbeat();
				if (this._readyState !== "closed") {
					this._readyState = "closed";
					this.onClose?.();
				}
			});
		} catch {
			// Not supported in this browser — heartbeat handles it
		}

		this._startHeartbeat();
	}

	private _startHeartbeat(): void {
		this._heartbeatInterval = setInterval(() => {
			if (this._readyState !== "open") {
				this._stopHeartbeat();
				return;
			}
			this.port.postMessage({ type: "ping" });
			this._heartbeatTimeout = setTimeout(() => {
				if (this._readyState !== "closed") {
					this._readyState = "closed";
					this._stopHeartbeat();
					this.onClose?.();
				}
			}, 15_000);
		}, 5_000);
	}

	private _clearHeartbeatTimeout(): void {
		if (this._heartbeatTimeout !== null) {
			clearTimeout(this._heartbeatTimeout);
			this._heartbeatTimeout = null;
		}
	}

	private _stopHeartbeat(): void {
		this._clearHeartbeatTimeout();
		if (this._heartbeatInterval !== null) {
			clearInterval(this._heartbeatInterval);
			this._heartbeatInterval = null;
		}
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
		this.port.postMessage(message);
	}

	onMessage(handler: (message: Message) => void): void {
		this.handlers.push(handler);
	}

	close(): void {
		this._stopHeartbeat();
		this._readyState = "closed";
		this.port.close();
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}

	getStats(): TransportStats {
		return { ...this._stats };
	}
}

/**
 * Transport implementation used inside a SharedWorker.
 * Communicates with the main thread via a MessagePort received from the connect event.
 */
export class SharedWorkerSelfTransport implements Transport {
	private handlers: Array<(message: Message) => void> = [];
	private _readyState: TransportReadyState = "open";
	private _statsEnabled = false;
	private _stats: TransportStats = {
		messageCount: 0,
		totalBytes: 0,
		largestMessageBytes: 0,
		lastMessageBytes: 0,
	};
	onError?: (error: Error) => void;
	onClose?: () => void;

	constructor(private port: MessagePort) {
		port.onmessage = (e: MessageEvent) => {
			const data = e.data;
			// Respond to ping with pong automatically — don't forward to app handlers
			if (data && typeof data === "object" && data.type === "ping") {
				port.postMessage({ type: "pong" });
				return;
			}
			for (const h of this.handlers) {
				try {
					h(data as Message);
				} catch (err) {
					console.error("[async-dom] Handler error:", err);
				}
			}
		};

		port.onmessageerror = () => {
			const error = new Error("SharedWorker message deserialization failed");
			this.onError?.(error);
		};

		// Explicit start() required when using addEventListener pattern,
		// but also safe to call with onmessage assignment
		port.start();
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
		this.port.postMessage(message);
	}

	onMessage(handler: (message: Message) => void): void {
		this.handlers.push(handler);
	}

	close(): void {
		this._readyState = "closed";
		this.port.close();
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}

	getStats(): TransportStats {
		return { ...this._stats };
	}
}
