import { defineComponent, h, type PropType, type SlotsType } from "vue";
import type { DebugOptions, SchedulerConfig, SerializedError } from "../index.ts";
import type { AsyncDomInstance } from "../main-thread/index.ts";
import { useAsyncDom } from "./use-async-dom.ts";

/** Props for the {@link AsyncDom} Vue component. */
export interface AsyncDomProps {
	/** Worker script path or factory function */
	worker: string | (() => Worker);
	/** Scheduler configuration */
	scheduler?: SchedulerConfig;
	/** Enable debug mode (true for defaults, or pass DebugOptions) */
	debug?: DebugOptions | boolean;
}

/**
 * Vue component that renders an async-dom worker application.
 *
 * Wraps the {@link useAsyncDom} composable in a self-contained component.
 * Supports a `fallback` slot for loading state.
 *
 * @example
 * ```vue
 * <template>
 *   <AsyncDom worker="./app.worker.ts" @ready="onReady">
 *     <template #fallback>
 *       <p>Loading...</p>
 *     </template>
 *   </AsyncDom>
 * </template>
 * ```
 */
export const AsyncDom = defineComponent({
	name: "AsyncDom",

	props: {
		worker: {
			type: [String, Function] as PropType<string | (() => Worker)>,
			required: true,
		},
		scheduler: {
			type: Object as PropType<SchedulerConfig>,
			default: undefined,
		},
		debug: {
			type: [Boolean, Object] as PropType<boolean | DebugOptions>,
			default: undefined,
		},
	},

	emits: {
		ready: (_instance: AsyncDomInstance) => true,
		error: (_error: SerializedError) => true,
	},

	slots: Object as SlotsType<{
		fallback?: Record<string, never>;
	}>,

	setup(props, { emit, slots }) {
		// biome-ignore lint/correctness/useHookAtTopLevel: Vue composable, not a React hook
		const { containerRef, instance } = useAsyncDom({
			worker: props.worker,
			scheduler: props.scheduler,
			debug: props.debug,
			onReady: (inst) => emit("ready", inst),
			onError: (err) => emit("error", err),
		});

		return () => {
			// Fallback is rendered as a sibling before the container div to avoid
			// Vue's VDOM diffing from clearing the worker-rendered content inside it.
			return h("div", null, [
				!instance.value && slots.fallback ? slots.fallback() : null,
				h("div", { ref: containerRef }),
			]);
		};
	},
});
