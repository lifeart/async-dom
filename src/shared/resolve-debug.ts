import type { DebugOptions } from "../core/debug.ts";

/**
 * Resolves a `debug` option that can be `true`, a `DebugOptions` object, or `undefined`.
 * `true` expands to sensible defaults; falsy values resolve to `undefined`.
 *
 * Shared across all framework adapters to avoid logic drift.
 */
export function resolveDebugOption(
	debug: DebugOptions | boolean | undefined,
): DebugOptions | undefined {
	if (debug === true) {
		return { logMutations: true, logEvents: true, exposeDevtools: true };
	}
	return debug || undefined;
}
