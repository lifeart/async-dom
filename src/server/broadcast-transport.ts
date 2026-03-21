import type { ClientId, EventMessage, Message } from "../core/protocol.ts";
import { isMutationMessage } from "../core/protocol.ts";
import type { Transport, TransportReadyState } from "../transport/base.ts";
import type { MutationLogConfig } from "./mutation-log.ts";
import { MutationLog } from "./mutation-log.ts";

/** Configuration for the broadcast transport used by the streaming server. */
export interface BroadcastTransportConfig {
	/** Settings for the mutation replay log sent to newly connecting clients. */
	mutationLog?: MutationLogConfig;
	/** Maximum number of concurrent clients. New connections are rejected when the limit is reached. */
	maxClients?: number;
	/** Called when a new client connects. */
	onClientConnect?: (clientId: ClientId) => void;
	/** Called when a client disconnects. */
	onClientDisconnect?: (clientId: ClientId) => void;
}

/**
 * Transport that fans out messages from a single source to N client transports.
 *
 * Used by StreamingServer to broadcast DOM mutations to all connected readers.
 */
export class BroadcastTransport implements Transport {
	private clients = new Map<ClientId, Transport>();
	private handlers: Array<(message: Message) => void> = [];
	private log: MutationLog;
	private _readyState: TransportReadyState = "open";
	private config: BroadcastTransportConfig;

	onError?: (error: Error) => void;
	onClose?: () => void;

	constructor(config?: BroadcastTransportConfig) {
		this.config = config ?? {};
		this.log = new MutationLog(config?.mutationLog);
	}

	send(message: Message): void {
		if (this._readyState === "closed") return;

		if (isMutationMessage(message)) {
			this.log.append(message);
		}

		// Collect failed clients, then remove after iteration.
		// A client is considered failed if send() throws OR if the transport
		// transitions to "closed" during send (e.g. sendRaw swallows the exception
		// but closes the underlying socket).
		const failedClientIds: ClientId[] = [];
		for (const [clientId, transport] of this.clients) {
			try {
				transport.send(message);
				// Fix 1: detect transports that closed silently during send
				if (transport.readyState === "closed") {
					failedClientIds.push(clientId);
				}
			} catch (err) {
				console.error(`[async-dom] Failed to send to client ${clientId}:`, err);
				failedClientIds.push(clientId);
			}
		}
		for (const clientId of failedClientIds) {
			this.removeClient(clientId);
		}
	}

	onMessage(handler: (message: Message) => void): void {
		this.handlers.push(handler);
	}

	close(): void {
		if (this._readyState === "closed") return;
		this._readyState = "closed";

		// Remove all clients (this also fires disconnect callbacks and closes transports)
		for (const clientId of [...this.clients.keys()]) {
			this.removeClient(clientId);
		}

		// Fix 3: clear handler array so retained references can be GC'd
		this.handlers.length = 0;

		this.log.clear();
		this.onClose?.();
	}

	get readyState(): TransportReadyState {
		return this._readyState;
	}

	addClient(clientId: ClientId, transport: Transport): void {
		if (this._readyState === "closed") return;

		if (this.config.maxClients !== undefined && this.clients.size >= this.config.maxClients) {
			console.error(
				`[async-dom] Max clients (${this.config.maxClients}) reached, rejecting ${clientId}`,
			);
			transport.close();
			return;
		}

		// Fix E: handle duplicate clientId by removing the old one first
		if (this.clients.has(clientId)) {
			this.removeClient(clientId);
		}

		// Fix A: do replay BEFORE adding to this.clients so live mutations
		// from send() cannot interleave with the replay.
		const replay = this.log.getReplayMessages();
		for (const msg of replay) {
			try {
				transport.send(msg);
			} catch (err) {
				console.error(`[async-dom] Failed to replay to client ${clientId}:`, err);
				return;
			}
		}

		// Fix B: wrap snapshotComplete in try/catch; on failure don't add client
		try {
			transport.send({ type: "snapshotComplete" });
		} catch (err) {
			console.error(`[async-dom] Failed to send snapshotComplete to client ${clientId}:`, err);
			return;
		}

		// Now safe to register as a live client
		this.clients.set(clientId, transport);

		// Forward events from this client to the source (stamp clientId)
		transport.onMessage((message: Message) => {
			if (message.type === "event") {
				(message as EventMessage).clientId = clientId;
			}
			for (const h of this.handlers) {
				try {
					h(message);
				} catch (err) {
					console.error("[async-dom] BroadcastTransport handler error:", err);
				}
			}
		});

		// Fix D: chain existing onClose callback instead of overwriting
		const previousOnClose = transport.onClose;
		// Auto-remove on disconnect
		transport.onClose = () => {
			this.removeClient(clientId);
			previousOnClose?.();
		};

		// Notify source of new client
		for (const h of this.handlers) {
			try {
				h({ type: "clientConnect", clientId });
			} catch (err) {
				console.error("[async-dom] BroadcastTransport handler error:", err);
			}
		}

		this.config.onClientConnect?.(clientId);
	}

	removeClient(clientId: ClientId): void {
		const transport = this.clients.get(clientId);
		if (!transport) return;

		// Nullify transport.onClose before doing anything else to prevent
		// re-entrant calls (e.g. if close() triggers onClose again)
		transport.onClose = undefined;

		this.clients.delete(clientId);

		// Fix 2: close the underlying transport so the socket is torn down,
		// drain timer stops, and no further messages are queued.
		try {
			transport.close();
		} catch {
			// Already closed — ignore
		}

		// Notify source of disconnection
		for (const h of this.handlers) {
			try {
				h({ type: "clientDisconnect", clientId });
			} catch (err) {
				console.error("[async-dom] BroadcastTransport handler error:", err);
			}
		}

		this.config.onClientDisconnect?.(clientId);
	}

	getClientCount(): number {
		return this.clients.size;
	}

	getClientIds(): ClientId[] {
		return [...this.clients.keys()];
	}
}
