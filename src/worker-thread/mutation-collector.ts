import type { AppId, DomMutation, MutationMessage, NodeId } from "../core/protocol.ts";
import type { Transport } from "../transport/base.ts";

/** Entry recording a coalesced (eliminated) mutation. */
export interface CoalescedLogEntry {
	action: string;
	key: string;
	timestamp: number;
}

const MAX_COALESCED_LOG = 50;

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
	private _coalescedLog: CoalescedLogEntry[] = [];
	private _perTypeCoalesced = new Map<string, { added: number; coalesced: number }>();

	/** Total mutations added (monotonically increasing counter for diff-based tracking). */
	get totalAdded(): number {
		return this._stats.added;
	}

	/** Feature 15: Current causal event tag for this flush cycle */
	private _causalEvent: { eventType: string; listenerId: string; timestamp: number } | null =
		null;

	getStats(): { added: number; coalesced: number; flushed: number } {
		return { ...this._stats };
	}

	getCoalescedLog(): CoalescedLogEntry[] {
		return this._coalescedLog.slice();
	}

	getPerTypeCoalesced(): Record<string, { added: number; coalesced: number }> {
		const result: Record<string, { added: number; coalesced: number }> = {};
		for (const [action, counts] of this._perTypeCoalesced) {
			result[action] = { ...counts };
		}
		return result;
	}

	constructor(private appId: AppId) {}

	/** Feature 15: Set the causal event for the current mutation cycle. */
	setCausalEvent(
		event: { eventType: string; listenerId: string; timestamp: number } | null,
	): void {
		this._causalEvent = event;
	}

	/** Feature 15: Get current causal event. */
	getCausalEvent(): { eventType: string; listenerId: string; timestamp: number } | null {
		return this._causalEvent;
	}

	enableCoalescing(enabled: boolean): void {
		this._coalesceEnabled = enabled;
	}

	setTransport(transport: Transport): void {
		this.transport = transport;
	}

	add(mutation: DomMutation): void {
		this._stats.added++;
		const counts = this._perTypeCoalesced.get(mutation.action);
		if (counts) {
			counts.added++;
		} else {
			this._perTypeCoalesced.set(mutation.action, { added: 1, coalesced: 0 });
		}
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

		// Record coalesced mutations into the log and per-type stats
		if (toRemove.size > 0) {
			const now = Date.now();
			for (const idx of toRemove) {
				const removed = mutations[idx];
				const action = removed.action;
				const entry: CoalescedLogEntry = {
					action,
					key: this._buildKey(removed),
					timestamp: now,
				};
				this._coalescedLog.push(entry);
				if (this._coalescedLog.length > MAX_COALESCED_LOG) {
					this._coalescedLog.shift();
				}
				const counts = this._perTypeCoalesced.get(action);
				if (counts) {
					counts.coalesced++;
				}
			}
		}

		if (toRemove.size === 0) return mutations;
		return mutations.filter((_, i) => !toRemove.has(i));
	}

	private _buildKey(m: DomMutation): string {
		switch (m.action) {
			case "setStyle":
				return `setStyle:${m.id}:${m.property}`;
			case "setAttribute":
				return `setAttribute:${m.id}:${m.name}`;
			case "setClassName":
				return `setClassName:${m.id}`;
			case "setTextContent":
				return `setTextContent:${m.id}`;
			case "setProperty":
				return `setProperty:${m.id}:${m.property}`;
			case "setHTML":
				return `setHTML:${m.id}`;
			default:
				return `${m.action}:${"id" in m ? (m as { id: NodeId }).id : "?"}`;
		}
	}

	flush(): void {
		if (this.queue.length === 0) {
			this.scheduled = false;
			return;
		}

		// Feature 16: performance mark around coalesce/flush
		const perfMarkName = `async-dom:flush:${this.appId}`;
		if (typeof performance !== "undefined" && performance.mark) {
			performance.mark(`${perfMarkName}:start`);
		}

		const rawLength = this.queue.length;
		const batch = this._coalesceEnabled
			? this.coalesce(this.queue.splice(0))
			: this.queue.splice(0);
		this.scheduled = false;
		this._stats.coalesced += rawLength - batch.length;
		this._stats.flushed += batch.length;

		if (batch.length === 0) {
			// Clear causal event after flush
			this._causalEvent = null;
			return;
		}
		this.uidCounter++;

		if (this.transport?.readyState !== "open") {
			this._causalEvent = null;
			return;
		}

		const message: MutationMessage = {
			type: "mutation",
			appId: this.appId,
			uid: this.uidCounter,
			mutations: batch,
			sentAt: Date.now(),
		};

		// Feature 15: attach causal event to the mutation message
		if (this._causalEvent) {
			message.causalEvent = this._causalEvent;
			this._causalEvent = null;
		}

		this.transport.send(message);

		// Feature 16: performance measure
		if (typeof performance !== "undefined" && performance.mark && performance.measure) {
			performance.mark(`${perfMarkName}:end`);
			try {
				performance.measure(perfMarkName, `${perfMarkName}:start`, `${perfMarkName}:end`);
			} catch {
				// marks may not exist if cleared
			}
		}
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
