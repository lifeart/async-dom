/**
 * Promise-based fallback channel for DOM queries.
 *
 * Used when SharedArrayBuffer is not available (e.g., missing
 * cross-origin isolation headers). Returns Promises instead of
 * blocking synchronously.
 */

import type { Transport } from "../transport/base.ts";
import type { AppId, NodeId } from "./protocol.ts";

export type AsyncQueryType = "boundingRect" | "computedStyle" | "nodeProperty" | "windowProperty";

let queryUidCounter = 0;

export class AsyncChannel {
	private pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }
	>();
	private transport: Transport | null = null;
	private appId: AppId;
	private timeoutMs: number;

	constructor(appId: AppId, timeoutMs = 5000) {
		this.appId = appId;
		this.timeoutMs = timeoutMs;
	}

	setTransport(transport: Transport): void {
		this.transport = transport;
	}

	/**
	 * Send a query and return a Promise that resolves with the result.
	 */
	request(nodeId: NodeId, query: AsyncQueryType, property?: string): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const uid = ++queryUidCounter;
			this.pending.set(uid, { resolve, reject });

			// Set a timeout to prevent hanging
			const timer = setTimeout(() => {
				if (this.pending.has(uid)) {
					this.pending.delete(uid);
					resolve(null); // Resolve with null on timeout instead of rejecting
				}
			}, this.timeoutMs);

			// Override resolve to also clear timeout
			const originalResolve = resolve;
			this.pending.set(uid, {
				resolve: (value: unknown) => {
					clearTimeout(timer);
					originalResolve(value);
				},
				reject: (reason: unknown) => {
					clearTimeout(timer);
					reject(reason);
				},
			});

			this.transport?.send({
				type: "query",
				appId: this.appId,
				uid,
				nodeId,
				query,
				property,
			});
		});
	}

	/**
	 * Handle a query result message from the main thread.
	 */
	handleResult(uid: number, result: unknown): void {
		const entry = this.pending.get(uid);
		if (entry) {
			this.pending.delete(uid);
			entry.resolve(result);
		}
	}

	/**
	 * Cancel all pending queries.
	 */
	destroy(): void {
		for (const entry of this.pending.values()) {
			entry.resolve(null);
		}
		this.pending.clear();
	}
}
