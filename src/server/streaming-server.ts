import type { ClientId } from "../core/protocol.ts";
import { createClientId } from "../core/protocol.ts";
import type { WebSocketLike } from "../transport/ws-server-transport.ts";
import { WebSocketServerTransport } from "../transport/ws-server-transport.ts";
import type { WorkerDomConfig, WorkerDomResult } from "../worker-thread/index.ts";
import { createWorkerDom } from "../worker-thread/index.ts";
import type { BroadcastTransportConfig } from "./broadcast-transport.ts";
import { BroadcastTransport } from "./broadcast-transport.ts";

/** Configuration for {@link createStreamingServer}. */
export interface StreamingServerConfig {
	/** The application entry point. Receives a virtual DOM environment shared across all clients. */
	createApp: (dom: WorkerDomResult) => void | Promise<void>;
	/** Optional overrides for the underlying `WorkerDomConfig` (transport is managed internally). */
	workerDomConfig?: Partial<Omit<WorkerDomConfig, "transport">>;
	/** Configuration for the broadcast transport (mutation log size, max clients, etc.). */
	broadcast?: BroadcastTransportConfig;
}

/** Handle returned by {@link createStreamingServer}. */
export interface StreamingServerInstance {
	/** Register a new WebSocket client. Returns the assigned `ClientId`. */
	handleConnection(socket: WebSocketLike, clientId?: string): ClientId;
	/** Disconnect and clean up a client by its `ClientId`. */
	disconnectClient(clientId: ClientId): void;
	/** Return the number of currently connected clients. */
	getClientCount(): number;
	/** Return the IDs of all currently connected clients. */
	getClientIds(): ClientId[];
	/** Access the shared virtual DOM instance. */
	getDom(): WorkerDomResult;
	/** Shut down the server, disconnecting all clients and destroying the virtual DOM. */
	destroy(): void;
	/** Resolves when the app module has finished initializing. */
	ready: Promise<void>;
}

/**
 * Creates a streaming server that broadcasts one app's DOM mutations to N clients.
 *
 * This is an OPTIONAL alternative to `createServerApp` for scenarios where
 * a single source of truth needs to be observed by multiple readers.
 */
export function createStreamingServer(config: StreamingServerConfig): StreamingServerInstance {
	const broadcastTransport = new BroadcastTransport(config.broadcast);

	const dom = createWorkerDom({
		...config.workerDomConfig,
		transport: broadcastTransport,
	});

	// Run the user's app module, catching errors so one failure
	// doesn't crash the server process
	let ready: Promise<void>;
	try {
		const result = config.createApp(dom);
		ready =
			result instanceof Promise
				? result.catch((err) => {
						console.error("[async-dom] Streaming server app error:", err);
					})
				: Promise.resolve();
	} catch (err) {
		console.error("[async-dom] Streaming server app error:", err);
		ready = Promise.resolve();
	}

	let clientCounter = 0;

	return {
		handleConnection(socket: WebSocketLike, clientId?: string): ClientId {
			const id = createClientId(clientId ?? `client-${++clientCounter}`);
			const transport = new WebSocketServerTransport(socket);
			broadcastTransport.addClient(id, transport);
			return id;
		},

		disconnectClient(clientId: ClientId): void {
			broadcastTransport.removeClient(clientId);
		},

		getClientCount(): number {
			return broadcastTransport.getClientCount();
		},

		getClientIds(): ClientId[] {
			return broadcastTransport.getClientIds();
		},

		getDom(): WorkerDomResult {
			return dom;
		},

		destroy(): void {
			broadcastTransport.close();
			dom.destroy();
		},

		ready,
	};
}
