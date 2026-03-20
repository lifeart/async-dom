import { t as resolveDebugOption } from "./resolve-debug.js";
import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
//#region src/vue/use-async-dom.ts
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
* import { useAsyncDom } from "async-dom/vue";
*
* const { containerRef, instance } = useAsyncDom({
*   worker: "./my-worker.ts",
*   onReady: (inst) => console.log("Ready!", inst),
* });
* <\/script>
*
* <template>
*   <div ref="containerRef" />
* </template>
* ```
*/
function useAsyncDom(options) {
	const containerRef = ref(null);
	const instance = shallowRef(null);
	let destroyed = false;
	onMounted(async () => {
		const el = containerRef.value;
		if (!el) return;
		const workerProp = options.worker;
		const worker = typeof workerProp === "string" ? new Worker(new URL(workerProp, import.meta.url), { type: "module" }) : workerProp();
		const { createAsyncDom } = await import("./main-thread.js").then((n) => n.n);
		if (destroyed) {
			worker.terminate();
			return;
		}
		const inst = createAsyncDom({
			target: el,
			worker,
			scheduler: options.scheduler,
			debug: resolveDebugOption(options.debug)
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
	return {
		containerRef,
		instance
	};
}
//#endregion
//#region src/vue/AsyncDom.ts
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
const AsyncDom = defineComponent({
	name: "AsyncDom",
	props: {
		worker: {
			type: [String, Function],
			required: true
		},
		scheduler: {
			type: Object,
			default: void 0
		},
		debug: {
			type: [Boolean, Object],
			default: void 0
		}
	},
	emits: {
		ready: (_instance) => true,
		error: (_error) => true
	},
	slots: Object,
	setup(props, { emit, slots }) {
		const { containerRef, instance } = useAsyncDom({
			worker: props.worker,
			scheduler: props.scheduler,
			debug: props.debug,
			onReady: (inst) => emit("ready", inst),
			onError: (err) => emit("error", err)
		});
		return () => {
			const children = [];
			if (!instance.value && slots.fallback) children.push(...slots.fallback());
			return h("div", { ref: containerRef }, children);
		};
	}
});
//#endregion
export { AsyncDom, useAsyncDom };

//# sourceMappingURL=vue.js.map