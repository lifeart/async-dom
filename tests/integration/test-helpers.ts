import type { Message } from "../../src/core/protocol.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";

/**
 * InMemoryTransport — a Transport implementation backed purely by in-memory
 * callbacks.  When `send()` is called the message is structuredClone'd (to
 * simulate real serialisation boundary costs) and then synchronously delivered
 * to the paired transport's registered handlers.
 */
export class InMemoryTransport implements Transport {
	private _handlers: Array<(message: Message) => void> = [];
	private _peer: InMemoryTransport | null = null;
	private _readyState: TransportReadyState = "open";

	onError?: (error: Error) => void;
	onClose?: () => void;

	/** Internal: wire this transport to its peer. */
	_setPeer(peer: InMemoryTransport): void {
		this._peer = peer;
	}

	send(message: Message): void {
		if (this._readyState === "closed") return;
		if (!this._peer) return;

		// structuredClone simulates the serialisation boundary present in real
		// postMessage / WebSocket transports.
		const cloned = structuredClone(message) as Message;
		for (const h of this._peer._handlers) {
			h(cloned);
		}
	}

	onMessage(handler: (message: Message) => void): void {
		this._handlers.push(handler);
	}

	close(): void {
		if (this._readyState === "closed") return;
		this._readyState = "closed";
		this.onClose?.();
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}
}

export interface TransportPair {
	/** "Worker-side" transport — send here to deliver to the main-thread side. */
	workerTransport: InMemoryTransport;
	/** "Main-thread-side" transport — send here to deliver to the worker side. */
	mainTransport: InMemoryTransport;
}

/**
 * Creates a linked pair of InMemoryTransports.
 *
 * Messages sent via `workerTransport.send()` are received by handlers
 * registered on `mainTransport`, and vice-versa — exactly like a pair of
 * MessageChannel ports.
 */
export function createTransportPair(): TransportPair {
	const workerTransport = new InMemoryTransport();
	const mainTransport = new InMemoryTransport();
	workerTransport._setPeer(mainTransport);
	mainTransport._setPeer(workerTransport);
	return { workerTransport, mainTransport };
}
