import type { AppId, DomMutation, MutationMessage, NodeId } from "../core/protocol.ts";
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
	private _coalesceEnabled = true;
	private _stats = { added: 0, coalesced: 0, flushed: 0 };

	getStats(): { added: number; coalesced: number; flushed: number } {
		return { ...this._stats };
	}

	constructor(private appId: AppId) {}

	enableCoalescing(enabled: boolean): void {
		this._coalesceEnabled = enabled;
	}

	setTransport(transport: Transport): void {
		this.transport = transport;
	}

	add(mutation: DomMutation): void {
		this._stats.added++;
		this.queue.push(mutation);
		if (!this.scheduled) {
			this.scheduled = true;
			queueMicrotask(() => this.flush());
		}
	}

	private coalesce(mutations: DomMutation[]): DomMutation[] {
		if (mutations.length <= 1) return mutations;

		// Track last index of each deduplicate-able mutation by key
		const lastIndex = new Map<string, number>();
		const toRemove = new Set<number>();

		// Track created nodes and their attachment status for create+remove elimination
		const createdAt = new Map<NodeId, number>();
		const attachedIds = new Set<NodeId>();
		const eliminatedIds = new Set<NodeId>();

		for (let i = 0; i < mutations.length; i++) {
			const m = mutations[i];
			let key: string | null = null;

			switch (m.action) {
				case "setStyle":
					key = `setStyle:${m.id}:${m.property}`;
					break;
				case "setAttribute":
					key = `setAttribute:${m.id}:${m.name}`;
					break;
				case "setClassName":
					key = `setClassName:${m.id}`;
					break;
				case "setTextContent":
					key = `setTextContent:${m.id}`;
					break;
				case "setProperty":
					key = `setProperty:${m.id}:${m.property}`;
					break;
				case "setHTML":
					key = `setHTML:${m.id}`;
					break;
				case "createNode":
					createdAt.set(m.id, i);
					break;
				case "appendChild":
					attachedIds.add(m.childId);
					break;
				case "insertBefore":
					attachedIds.add(m.newId);
					break;
				case "removeNode":
					// If this node was created in this batch and never attached,
					// drop both and mark for orphan cleanup
					if (createdAt.has(m.id) && !attachedIds.has(m.id)) {
						const createdIdx = createdAt.get(m.id);
						if (createdIdx !== undefined) toRemove.add(createdIdx);
						toRemove.add(i);
						createdAt.delete(m.id);
						eliminatedIds.add(m.id);
					}
					break;
			}

			if (key !== null) {
				const prev = lastIndex.get(key);
				if (prev !== undefined) {
					toRemove.add(prev); // Remove the earlier one, keep this later one
				}
				lastIndex.set(key, i);
			}
		}

		// Remove orphan mutations targeting eliminated nodes
		// (created + removed without ever being attached to the DOM)
		if (eliminatedIds.size > 0) {
			for (let j = 0; j < mutations.length; j++) {
				if (toRemove.has(j)) continue;
				const mut = mutations[j];
				if ("id" in mut && eliminatedIds.has((mut as { id: NodeId }).id)) {
					toRemove.add(j);
				}
			}
		}

		if (toRemove.size === 0) return mutations;
		return mutations.filter((_, i) => !toRemove.has(i));
	}

	flush(): void {
		if (this.queue.length === 0) {
			this.scheduled = false;
			return;
		}

		const rawLength = this.queue.length;
		const batch = this._coalesceEnabled
			? this.coalesce(this.queue.splice(0))
			: this.queue.splice(0);
		this.scheduled = false;
		this._stats.coalesced += rawLength - batch.length;
		this._stats.flushed += batch.length;

		if (batch.length === 0) return;
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
