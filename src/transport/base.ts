import type { Message } from "../core/protocol.ts";

/**
 * The connection lifecycle state of a transport.
 *
 * - `"connecting"` — Transport is establishing a connection.
 * - `"open"` — Transport is connected and ready to send/receive messages.
 * - `"reconnecting"` — Transport lost connection and is attempting to reconnect.
 * - `"closed"` — Transport is permanently closed and cannot be reused.
 */
export type TransportReadyState = "connecting" | "open" | "reconnecting" | "closed";

/** Cumulative message statistics collected by a transport. */
export interface TransportStats {
	/** Total number of messages sent. */
	messageCount: number;
	/** Total bytes sent (approximate, based on JSON string length). */
	totalBytes: number;
	/** Size in bytes of the largest single message sent. */
	largestMessageBytes: number;
	/** Size in bytes of the most recently sent message. */
	lastMessageBytes: number;
}

/**
 * Bidirectional message transport between the main thread and a worker or remote process.
 *
 * All async-dom communication flows through this interface. Built-in implementations
 * include `WorkerTransport`, `WebSocketTransport`, `BinaryWorkerTransport`, and
 * `WebSocketServerTransport`.
 */
export interface Transport {
	/** Send a message to the other end of the transport. */
	send(message: Message): void;
	/** Register a handler that is called for every incoming message. */
	onMessage(handler: (message: Message) => void): void;
	/** Permanently close the transport, releasing all resources. */
	close(): void;
	/** Current connection state of the transport. */
	readonly readyState: TransportReadyState;
	/** Called when the transport encounters a connection error. */
	onError?: (error: Error) => void;
	/** Called when the transport is closed (locally or remotely). */
	onClose?: () => void;
	/** Return cumulative send statistics. Only populated when stats are enabled. */
	getStats?(): TransportStats;
	/** Enable or disable statistics collection. */
	enableStats?(enabled: boolean): void;
	/** Maximum message size in bytes. Messages exceeding this are dropped. */
	maxMessageSize?: number;
	/** Number of bytes queued for sending but not yet transmitted. */
	bufferedAmount?: number;
}
