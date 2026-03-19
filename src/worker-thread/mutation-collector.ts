import type { AppId, DomMutation, MutationMessage } from "../core/protocol.ts";
import type { Transport } from "../transport/base.ts";

/**
 * Collects DOM mutations during synchronous execution and flushes them
 * as a batched message at the end of the current microtask.
 */
export class MutationCollector {
	private queue: DomMutation[] = [];
	private scheduled = false;
	private uidCounter = 0;
	private transport: Transport | null = null;

	constructor(private appId: AppId) {}

	setTransport(transport: Transport): void {
		this.transport = transport;
	}

	add(mutation: DomMutation): void {
		this.queue.push(mutation);
		if (!this.scheduled) {
			this.scheduled = true;
			queueMicrotask(() => this.flush());
		}
	}

	flush(): void {
		if (this.queue.length === 0) {
			this.scheduled = false;
			return;
		}

		const batch = this.queue.splice(0);
		this.scheduled = false;
		this.uidCounter++;

		if (this.transport?.readyState !== "open") {
			return;
		}

		const message: MutationMessage = {
			type: "mutation",
			appId: this.appId,
			uid: this.uidCounter,
			mutations: batch,
		};

		this.transport.send(message);
	}

	/** Force-flush all pending mutations immediately */
	flushSync(): void {
		this.flush();
	}

	/** Get number of pending mutations (useful for testing) */
	get pendingCount(): number {
		return this.queue.length;
	}
}
