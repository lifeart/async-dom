import type { Message } from "../core/protocol.ts";

export type TransportReadyState = "connecting" | "open" | "reconnecting" | "closed";

export interface TransportStats {
	messageCount: number;
	totalBytes: number;
	largestMessageBytes: number;
	lastMessageBytes: number;
}

export interface Transport {
	send(message: Message): void;
	onMessage(handler: (message: Message) => void): void;
	close(): void;
	readonly readyState: TransportReadyState;
	onError?: (error: Error) => void;
	onClose?: () => void;
	getStats?(): TransportStats;
	enableStats?(enabled: boolean): void;
	maxMessageSize?: number;
	bufferedAmount?: number;
}
