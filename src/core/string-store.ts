/**
 * Bidirectional string-to-index store for wire format deduplication.
 * Strings are assigned monotonic uint16 indices on first encounter.
 * Both worker and main thread maintain synchronized copies.
 */
export class StringStore {
	private stringToIndex = new Map<string, number>();
	private indexToString: string[] = [];
	private pending: string[] = [];

	/**
	 * Get or assign an index for a string. New strings are tracked as pending.
	 */
	store(value: string): number {
		const existing = this.stringToIndex.get(value);
		if (existing !== undefined) return existing;
		const index = this.indexToString.length;
		this.stringToIndex.set(value, index);
		this.indexToString.push(value);
		this.pending.push(value);
		return index;
	}

	/**
	 * Get string by index.
	 */
	get(index: number): string {
		return this.indexToString[index] ?? "";
	}

	/**
	 * Consume pending new strings (for sending to the other side).
	 */
	consumePending(): string[] {
		const p = this.pending;
		this.pending = [];
		return p;
	}

	/**
	 * Register strings from the other side (no pending tracking).
	 */
	registerBulk(strings: string[]): void {
		for (const s of strings) {
			if (!this.stringToIndex.has(s)) {
				const index = this.indexToString.length;
				this.stringToIndex.set(s, index);
				this.indexToString.push(s);
			}
		}
	}

	get size(): number {
		return this.indexToString.length;
	}
}
