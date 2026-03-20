/**
 * Creates a proxy bridge that forwards method calls from worker to main thread.
 * Used for APIs that don't exist in workers (AudioContext, Canvas2D, etc.)
 */

import type { NodeId } from "./protocol.ts";
import type { SyncChannel } from "./sync-channel.ts";
import { QueryType } from "./sync-channel.ts";

export interface BridgeConfig {
	/** Name of the API (e.g., "AudioContext", "CanvasRenderingContext2D") */
	apiName: string;
	/** Methods that return void (fire-and-forget, no sync read needed) */
	fireMethods: string[];
	/** Methods that return a value (needs sync channel) */
	syncMethods: string[];
	/** Properties that can be get/set */
	properties: string[];
}

export function createApiBridge(
	config: BridgeConfig,
	nodeId: NodeId,
	syncChannel: SyncChannel | null,
	collector: { add(mutation: unknown): void },
): Record<string, unknown> {
	const cache: Record<string, unknown> = {};

	return new Proxy(cache, {
		get(_target, prop: string | symbol) {
			if (typeof prop !== "string") return undefined;

			// Fire-and-forget methods
			if (config.fireMethods.includes(prop)) {
				return (...args: unknown[]) => {
					collector.add({
						action: "callMethod",
						id: nodeId,
						method: `${config.apiName}.${prop}`,
						args,
					});
				};
			}

			// Sync methods (return value via sync channel)
			if (config.syncMethods.includes(prop)) {
				return (...args: unknown[]) => {
					if (!syncChannel) return null;
					return syncChannel.request(
						QueryType.NodeProperty,
						JSON.stringify({
							nodeId,
							property: `${config.apiName}.${prop}`,
							args,
						}),
					);
				};
			}

			// Properties (cached, sync-read on first access)
			if (config.properties.includes(prop)) {
				return cache[prop];
			}

			return undefined;
		},
		set(_target, prop: string | symbol, value: unknown) {
			if (typeof prop !== "string") return true;
			if (config.properties.includes(prop)) {
				cache[prop] = value;
				collector.add({
					action: "setProperty",
					id: nodeId,
					property: `${config.apiName}.${prop}`,
					value,
				});
			}
			return true;
		},
	});
}
