import type { ClientId } from "../core/protocol.ts";
import { createClientId } from "../core/protocol.ts";
import type { WebSocketLike } from "../transport/ws-server-transport.ts";
import { WebSocketServerTransport } from "../transport/ws-server-transport.ts";
import type { WorkerDomConfig, WorkerDomResult } from "../worker-thread/index.ts";
import { createWorkerDom } from "../worker-thread/index.ts";
import type { BroadcastTransportConfig } from "./broadcast-transport.ts";
import { BroadcastTransport } from "./broadcast-transport.ts";

export interface StreamingServerConfig {
	createApp: (dom: WorkerDomResult) => void | Promise<void>;
	workerDomConfig?: Partial<Omit<WorkerDomConfig, "transport">>;
	broadcast?: BroadcastTransportConfig;
}

export interface StreamingServerInstance {
	handleConnection(socket: WebSocketLike, clientId?: string): ClientId;
	disconnectClient(clientId: ClientId): void;
	getClientCount(): number;
	getClientIds(): ClientId[];
	getDom(): WorkerDomResult;
	destroy(): void;
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
