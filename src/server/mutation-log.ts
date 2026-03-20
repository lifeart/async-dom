import type { MutationMessage } from "../core/protocol.ts";

export interface MutationLogConfig {
	maxEntries?: number; // default 10_000
}

/**
 * Ring buffer that stores recent MutationMessages for replay to new clients.
 *
 * Uses a fixed-capacity circular buffer with O(1) append and O(n) replay,
 * avoiding the O(n) cost of Array.shift() for eviction.
 */
export class MutationLog {
	private buffer: (MutationMessage | undefined)[];
	private head = 0; // index of the oldest entry (read pointer)
	private count = 0; // number of valid entries currently stored
	private maxEntries: number;

	constructor(config?: MutationLogConfig) {
		this.maxEntries = Math.max(0, config?.maxEntries ?? 10_000);
		// Allocate the backing array once; sparse for maxEntries=0
		this.buffer = this.maxEntries > 0 ? new Array(this.maxEntries) : [];
	}

	append(message: MutationMessage): void {
		if (this.maxEntries === 0) return;

		if (this.count < this.maxEntries) {
			// Buffer not yet full — write at (head + count) % capacity
			const writeIndex = (this.head + this.count) % this.maxEntries;
			this.buffer[writeIndex] = message;
			this.count++;
		} else {
			// Buffer full — overwrite the oldest slot and advance head
			this.buffer[this.head] = message;
			this.head = (this.head + 1) % this.maxEntries;
		}
	}

	getReplayMessages(): MutationMessage[] {
		const result: MutationMessage[] = new Array(this.count);
		for (let i = 0; i < this.count; i++) {
			result[i] = this.buffer[(this.head + i) % this.maxEntries] as MutationMessage;
		}
		return result;
	}

	size(): number {
		return this.count;
	}

	clear(): void {
		this.head = 0;
		this.count = 0;
		// Release object references so they can be GC'd
		this.buffer.fill(undefined);
	}
}
