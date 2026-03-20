import type { AsyncDomInstance } from "../main-thread/index.ts";
import type { DebugOptions, SchedulerConfig, SerializedError } from "../index.ts";
import { resolveDebugOption } from "../shared/resolve-debug.ts";

export interface AsyncDomActionOptions {
	/** Worker script path or factory function */
	worker: string | (() => Worker);
	/** Scheduler configuration */
	scheduler?: SchedulerConfig;
	/** Debug options (pass `true` for sensible defaults, or a `DebugOptions` object) */
	debug?: DebugOptions | boolean;
	/** Called when the async-dom instance is ready */
	onReady?: (instance: AsyncDomInstance) => void;
	/** Called when a worker error occurs */
	onError?: (error: SerializedError) => void;
}

/**
 * Svelte action that creates an async-dom instance on the given element.
 *
 * @param node - The HTML element the action is applied to.
 * @param options - Configuration for the async-dom instance.
 * @returns An object with a `destroy` method to clean up the instance.
 *
 * @example
 * ```svelte
 * <div use:asyncDom={{ worker: "./app.worker.ts" }} />
 * ```
 *
 * Works with both Svelte 4 and Svelte 5.
 * Config changes should use Svelte's `{#key}` block to force re-creation.
 */
export function asyncDom(
	node: HTMLElement,
	options: AsyncDomActionOptions,
): { destroy: () => void } {
	let instance: AsyncDomInstance | null = null;
	let destroyed = false;

	// SSR guard (shouldn't fire in action, but be safe)
	if (typeof window === "undefined") {
		return { destroy() {} };
	}

	const workerProp = options.worker;
	const worker =
		typeof workerProp === "string"
			? new Worker(new URL(workerProp, import.meta.url), { type: "module" })
			: workerProp();

	import("../main-thread/index.ts").then(({ createAsyncDom }) => {
		if (destroyed) {
			worker.terminate();
			return;
		}

		instance = createAsyncDom({
			target: node,
			worker,
			scheduler: options.scheduler,
			debug: resolveDebugOption(options.debug),
		});
		instance.start();
		options.onReady?.(instance);
	});

	return {
		destroy() {
			destroyed = true;
			instance?.destroy();
			instance = null;
		},
	};
}

// Re-export key types for convenience
export type { AsyncDomInstance, SchedulerConfig } from "../main-thread/index.ts";
export type { DebugOptions, SerializedError } from "../index.ts";
