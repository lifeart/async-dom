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

const HEADER_SIZE = 16; // 4 Int32s
const REQUEST_REGION_SIZE = 4096;
const DEFAULT_BUFFER_SIZE = 65536; // 64KB
const SIGNAL_IDLE = 0;
const SIGNAL_REQUEST = 1;
const SIGNAL_RESPONSE = 2;
const MAX_RETRIES = 5;
const WAIT_TIMEOUT_MS = 100;

export enum QueryType {
	BoundingRect = 0,
	ComputedStyle = 1,
	NodeProperty = 2,
	WindowProperty = 3,
}

export interface PendingQuery {
	queryType: QueryType;
	data: string;
}

/**
 * Worker-side synchronous channel.
 * Uses Atomics.wait to block until the main thread responds.
 */
export class SyncChannel {
	private signal: Int32Array;
	private meta: Int32Array;
	private requestRegion: Uint8Array;
	private responseRegion: Uint8Array;
	private encoder = new TextEncoder();
	private decoder = new TextDecoder();

	private constructor(buffer: SharedArrayBuffer) {
		this.signal = new Int32Array(buffer, 0, 4);
		this.meta = this.signal; // same view, different semantic access
		this.requestRegion = new Uint8Array(buffer, HEADER_SIZE, REQUEST_REGION_SIZE);
		this.responseRegion = new Uint8Array(
			buffer,
			HEADER_SIZE + REQUEST_REGION_SIZE,
			buffer.byteLength - HEADER_SIZE - REQUEST_REGION_SIZE,
		);
	}

	static create(size: number = DEFAULT_BUFFER_SIZE): {
		channel: SyncChannel;
		buffer: SharedArrayBuffer;
	} {
		const buffer = new SharedArrayBuffer(size);
		return { channel: new SyncChannel(buffer), buffer };
	}

	static fromBuffer(sab: SharedArrayBuffer): SyncChannel {
		return new SyncChannel(sab);
	}

	/**
	 * Send a synchronous request to the main thread and block until response.
	 * Returns the parsed response or a fallback value on timeout.
	 */
	request(queryType: QueryType, data: string): unknown {
		const encoded = this.encoder.encode(data);
		if (encoded.byteLength > REQUEST_REGION_SIZE) {
			return null; // Request too large
		}

		// Write request data, then metadata, then signal.
		// Atomics.store on meta provides a memory fence ensuring
		// the plain byte writes to requestRegion are visible before
		// the signal is set on weakly-ordered architectures (ARM).
		this.requestRegion.set(encoded);
		Atomics.store(this.meta, 1, queryType);
		Atomics.store(this.meta, 2, encoded.byteLength);
		Atomics.store(this.meta, 3, 0);

		// Signal request pending — meta stores above act as release fence
		Atomics.store(this.signal, 0, SIGNAL_REQUEST);
		Atomics.notify(this.signal, 0);

		// Wait for response with retries
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			const result = Atomics.wait(this.signal, 0, SIGNAL_REQUEST, WAIT_TIMEOUT_MS);
			if (result === "not-equal") {
				// Signal already changed — response may be ready
				break;
			}
			if (result === "ok") {
				// Woken up — check if response is ready
				break;
			}
			// result === "timed-out" — retry
		}

		const currentSignal = Atomics.load(this.signal, 0);
		if (currentSignal !== SIGNAL_RESPONSE) {
			// Reset to idle on timeout
			Atomics.store(this.signal, 0, SIGNAL_IDLE);
			return null;
		}

		// Read response
		const responseLength = Atomics.load(this.meta, 3);
		if (responseLength === 0) {
			Atomics.store(this.signal, 0, SIGNAL_IDLE);
			return null;
		}

		const responseBytes = this.responseRegion.slice(0, responseLength);
		const responseStr = this.decoder.decode(responseBytes);

		// Reset to idle
		Atomics.store(this.signal, 0, SIGNAL_IDLE);

		try {
			return JSON.parse(responseStr);
		} catch {
			return null;
		}
	}
}

/**
 * Main-thread host for the sync channel.
 * Polls for pending requests and writes responses.
 */
export class SyncChannelHost {
	private signal: Int32Array;
	private meta: Int32Array;
	private requestRegion: Uint8Array;
	private responseRegion: Uint8Array;
	private encoder = new TextEncoder();
	private decoder = new TextDecoder();
	private polling = false;
	private pollChannel: MessageChannel | null = null;

	constructor(buffer: SharedArrayBuffer) {
		this.signal = new Int32Array(buffer, 0, 4);
		this.meta = this.signal;
		this.requestRegion = new Uint8Array(buffer, HEADER_SIZE, REQUEST_REGION_SIZE);
		this.responseRegion = new Uint8Array(
			buffer,
			HEADER_SIZE + REQUEST_REGION_SIZE,
			buffer.byteLength - HEADER_SIZE - REQUEST_REGION_SIZE,
		);
	}

	/**
	 * Non-blocking check for a pending query.
	 */
	poll(): PendingQuery | null {
		const currentSignal = Atomics.load(this.signal, 0);
		if (currentSignal !== SIGNAL_REQUEST) {
			return null;
		}

		const queryType = Atomics.load(this.meta, 1) as QueryType;
		const dataLength = Atomics.load(this.meta, 2);
		const dataBytes = this.requestRegion.slice(0, dataLength);
		const data = this.decoder.decode(dataBytes);

		return { queryType, data };
	}

	/**
	 * Write a response and wake the worker.
	 */
	respond(data: unknown): void {
		const json = JSON.stringify(data);
		const encoded = this.encoder.encode(json);
		// Write response bytes, then length (acts as memory fence for
		// the plain byte writes above), then signal.
		this.responseRegion.set(encoded);
		Atomics.store(this.meta, 3, encoded.byteLength);
		Atomics.store(this.signal, 0, SIGNAL_RESPONSE);
		Atomics.notify(this.signal, 0);
	}

	/**
	 * Start polling for requests using a MessageChannel for lowest-latency scheduling.
	 */
	startPolling(handler: (query: PendingQuery) => unknown): void {
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
					// Immediate next poll after handling a request
					this.pollChannel?.port2.postMessage(null);
				} else {
					// Exponential backoff: 0, 0, 1ms, 2ms, 4ms, 8ms, capped at 16ms
					idleCount++;
					if (idleCount <= 2) {
						this.pollChannel?.port2.postMessage(null);
					} else {
						const delay = Math.min(1 << (idleCount - 3), 16);
						setTimeout(() => {
							if (this.polling) {
								this.pollChannel?.port2.postMessage(null);
							}
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
	stopPolling(): void {
		this.polling = false;
		if (this.pollChannel) {
			this.pollChannel.port1.close();
			this.pollChannel.port2.close();
			this.pollChannel = null;
		}
	}
}
