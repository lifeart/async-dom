import type { MutationMessage } from "../core/protocol.ts";

export interface MutationLogConfig {
	maxEntries?: number; // default 10_000
}

/**
 * Ring buffer that stores recent MutationMessages for replay to new clients.
 */
export class MutationLog {
	private entries: MutationMessage[] = [];
	private maxEntries: number;

	constructor(config?: MutationLogConfig) {
		this.maxEntries = Math.max(0, config?.maxEntries ?? 10_000);
	}

	append(message: MutationMessage): void {
		if (this.maxEntries === 0) return;
		this.entries.push(message);
		if (this.entries.length > this.maxEntries) {
			this.entries.shift();
		}
	}

	getReplayMessages(): MutationMessage[] {
		return this.entries.slice();
	}

	size(): number {
		return this.entries.length;
	}

	clear(): void {
		this.entries.length = 0;
	}
}
