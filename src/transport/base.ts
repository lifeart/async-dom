import type { Message } from "../core/protocol.ts";

export type TransportReadyState = "connecting" | "open" | "closed";

export interface Transport {
	send(message: Message): void;
	onMessage(handler: (message: Message) => void): void;
	close(): void;
	readonly readyState: TransportReadyState;
	onError?: (error: Error) => void;
	onClose?: () => void;
}
