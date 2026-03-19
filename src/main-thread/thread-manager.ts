import type { AppId, Message } from "../core/protocol.ts";
import { createAppId } from "../core/protocol.ts";
import type { Transport } from "../transport/base.ts";
import { WorkerTransport } from "../transport/worker-transport.ts";
import { WebSocketTransport, type WebSocketTransportOptions } from "../transport/ws-transport.ts";

export interface WorkerConfig {
	worker: Worker;
}

export interface WebSocketConfig {
	url: string;
	options?: WebSocketTransportOptions;
}

interface ThreadConnection {
	transport: Transport;
	appId: AppId;
}

/**
 * Manages multiple worker/WebSocket connections, routing messages
 * between the main thread and isolated app threads.
 */
export class ThreadManager {
	private threads = new Map<AppId, ThreadConnection>();
	private messageHandlers: Array<(appId: AppId, message: Message) => void> = [];

	createWorkerThread(config: WorkerConfig): AppId {
		const appId = generateAppId();
		const transport = new WorkerTransport(config.worker);

		transport.onMessage((message) => {
			this.notifyHandlers(appId, message);
		});

		this.threads.set(appId, { transport, appId });
		return appId;
	}

	createWebSocketThread(config: WebSocketConfig): AppId {
		const appId = generateAppId();
		const transport = new WebSocketTransport(config.url, config.options);

		transport.onMessage((message) => {
			this.notifyHandlers(appId, message);
		});

		this.threads.set(appId, { transport, appId });
		return appId;
	}

	sendToThread(appId: AppId, message: Message): void {
		const thread = this.threads.get(appId);
		if (thread) {
			thread.transport.send(message);
		}
	}

	broadcast(message: Message): void {
		for (const thread of this.threads.values()) {
			thread.transport.send(message);
		}
	}

	destroyThread(appId: AppId): void {
		const thread = this.threads.get(appId);
		if (thread) {
			thread.transport.close();
			this.threads.delete(appId);
		}
	}

	destroyAll(): void {
		for (const appId of [...this.threads.keys()]) {
			this.destroyThread(appId);
		}
	}

	onMessage(handler: (appId: AppId, message: Message) => void): void {
		this.messageHandlers.push(handler);
	}

	getTransport(appId: AppId): Transport | null {
		return this.threads.get(appId)?.transport ?? null;
	}

	private notifyHandlers(appId: AppId, message: Message): void {
		for (const handler of this.messageHandlers) {
			handler(appId, message);
		}
	}
}

function generateAppId(): AppId {
	return createAppId(Math.random().toString(36).slice(2, 7));
}
