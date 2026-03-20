import { onBeforeUnmount, onMounted, type Ref, ref, type ShallowRef, shallowRef } from "vue";
import type { DebugOptions, SchedulerConfig, SerializedError } from "../index.ts";
import type { AsyncDomInstance } from "../main-thread/index.ts";
import { resolveDebugOption } from "../shared/resolve-debug.ts";

export interface UseAsyncDomOptions {
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

export interface UseAsyncDomResult {
	/** Template ref to bind to the container element */
	containerRef: Ref<HTMLDivElement | null>;
	/** The async-dom instance (null until ready) */
	instance: ShallowRef<AsyncDomInstance | null>;
}

/**
 * Vue composable that creates and manages an async-dom instance.
 *
 * Attaches an async-dom worker to the container element referenced by
 * `containerRef`. The instance is created on `onMounted` and destroyed on
 * `onBeforeUnmount`. Must be called during component setup.
 *
 * @param options - Configuration for the async-dom instance.
 * @returns An object containing the container template ref and a shallow ref to the instance.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAsyncDom } from "@lifeart/async-dom/vue";
 *
 * const { containerRef, instance } = useAsyncDom({
 *   worker: "./my-worker.ts",
 *   onReady: (inst) => console.log("Ready!", inst),
 * });
 * </script>
 *
 * <template>
 *   <div ref="containerRef" />
 * </template>
 * ```
 */
export function useAsyncDom(options: UseAsyncDomOptions): UseAsyncDomResult {
	const containerRef = ref<HTMLDivElement | null>(null);
	const instance = shallowRef<AsyncDomInstance | null>(null);
	let destroyed = false;

	onMounted(async () => {
		const el = containerRef.value;
		if (!el) return;

		const workerProp = options.worker;
		const worker =
			typeof workerProp === "string"
				? new Worker(new URL(workerProp, import.meta.url), { type: "module" })
				: workerProp();

		const { createAsyncDom } = await import("../main-thread/index.ts");

		if (destroyed) {
			worker.terminate();
			return;
		}

		const inst = createAsyncDom({
			target: el,
			worker,
			scheduler: options.scheduler,
			debug: resolveDebugOption(options.debug),
		});
		inst.start();
		instance.value = inst;
		options.onReady?.(inst);
	});

	onBeforeUnmount(() => {
		destroyed = true;
		instance.value?.destroy();
		instance.value = null;
	});

	return { containerRef, instance };
}
