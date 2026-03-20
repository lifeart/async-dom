import { t as resolveDebugOption } from "./resolve-debug.js";
//#region src/svelte/index.ts
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
function asyncDom(node, options) {
	let instance = null;
	let destroyed = false;
	if (typeof window === "undefined") return { destroy() {} };
	const workerProp = options.worker;
	const worker = typeof workerProp === "string" ? new Worker(new URL(workerProp, import.meta.url), { type: "module" }) : workerProp();
	import("./main-thread.js").then((n) => n.n).then(({ createAsyncDom }) => {
		if (destroyed) {
			worker.terminate();
			return;
		}
		instance = createAsyncDom({
			target: node,
			worker,
			scheduler: options.scheduler,
			debug: resolveDebugOption(options.debug)
		});
		instance.start();
		options.onReady?.(instance);
	});
	return { destroy() {
		destroyed = true;
		instance?.destroy();
		instance = null;
	} };
}
//#endregion
export { asyncDom };

//# sourceMappingURL=svelte.js.map