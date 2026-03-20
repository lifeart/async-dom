import type { QueryType, SyncChannel } from "../core/sync-channel.ts";

/**
 * Scoped Storage implementation that can optionally sync with
 * the main thread's real localStorage/sessionStorage via the sync channel.
 *
 * Each worker app gets its own isolated storage with a unique prefix.
 * When a sync channel is available, reads/writes are persisted to the
 * real browser storage on the main thread.
 */
export class ScopedStorage {
	private cache = new Map<string, string>();
	private prefix: string;
	private storageType: "localStorage" | "sessionStorage";
	private getSyncChannel: () => SyncChannel | null;
	private queryType: QueryType;

	constructor(
		prefix: string,
		storageType: "localStorage" | "sessionStorage",
		getSyncChannel: () => SyncChannel | null,
		queryType: QueryType,
	) {
		this.prefix = prefix;
		this.storageType = storageType;
		this.getSyncChannel = getSyncChannel;
		this.queryType = queryType;
	}

	private syncCall(method: string, args: unknown[]): unknown {
		const channel = this.getSyncChannel();
		if (!channel) return null;
		return channel.request(
			this.queryType,
			JSON.stringify({
				property: `${this.storageType}.${method}`,
				args,
			}),
		);
	}

	get length(): number {
		return this.cache.size;
	}

	key(index: number): string | null {
		const keys = [...this.cache.keys()];
		return keys[index] ?? null;
	}

	getItem(key: string): string | null {
		// Check local cache first
		const cached = this.cache.get(key);
		if (cached !== undefined) return cached;

		// Try to read from main thread if sync channel available
		const result = this.syncCall("getItem", [this.prefix + key]);
		if (typeof result === "string") {
			this.cache.set(key, result);
			return result;
		}
		return null;
	}

	setItem(key: string, value: string): void {
		const strValue = String(value);
		this.cache.set(key, strValue);
		// Persist to main thread if sync channel available
		this.syncCall("setItem", [this.prefix + key, strValue]);
	}

	removeItem(key: string): void {
		this.cache.delete(key);
		this.syncCall("removeItem", [this.prefix + key]);
	}

	clear(): void {
		// Remove all prefixed keys from main thread storage
		for (const key of this.cache.keys()) {
			this.syncCall("removeItem", [this.prefix + key]);
		}
		this.cache.clear();
	}
}
