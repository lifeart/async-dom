import { t as resolveDebugOption } from "./resolve-debug.js";
import { createElement, useEffect, useRef, useState } from "react";
//#region src/react/use-async-dom.ts
/**
* React hook that creates and manages an async-dom instance.
*
* Attaches an async-dom worker to the container element referenced by
* `containerRef`. The instance is created on mount and destroyed on unmount.
*
* @param options - Configuration for the async-dom instance.
* @returns An object containing the container ref and the instance (null until ready).
*
* @example
* ```tsx
* function MyComponent() {
*   const { containerRef, instance } = useAsyncDom({
*     worker: "./my-worker.ts",
*     onReady: (inst) => console.log("Ready!", inst),
*   });
*   return <div ref={containerRef} />;
* }
* ```
*/
function useAsyncDom(options) {
	const containerRef = useRef(null);
	const [instance, setInstance] = useState(null);
	const workerRef = useRef(options.worker);
	workerRef.current = options.worker;
	const onReadyRef = useRef(options.onReady);
	onReadyRef.current = options.onReady;
	const onErrorRef = useRef(options.onError);
	onErrorRef.current = options.onError;
	const debugRef = useRef(options.debug);
	debugRef.current = options.debug;
	const schedulerRef = useRef(options.scheduler);
	schedulerRef.current = options.scheduler;
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		let cancelled = false;
		const workerProp = workerRef.current;
		const worker = typeof workerProp === "string" ? new Worker(new URL(workerProp, import.meta.url), { type: "module" }) : workerProp();
		import("./main-thread.js").then((n) => n.n).then(({ createAsyncDom }) => {
			if (cancelled) {
				worker.terminate();
				return;
			}
			const inst = createAsyncDom({
				target: el,
				worker,
				scheduler: schedulerRef.current,
				debug: resolveDebugOption(debugRef.current)
			});
			inst.start();
			setInstance(inst);
			onReadyRef.current?.(inst);
		});
		return () => {
			cancelled = true;
			setInstance((prev) => {
				prev?.destroy();
				return null;
			});
		};
	}, []);
	return {
		containerRef,
		instance
	};
}
//#endregion
//#region src/react/async-dom-component.ts
/**
* React component that renders an async-dom worker application.
*
* Wraps {@link useAsyncDom} in a self-contained component with a container div.
* Supports a `fallback` prop for loading state, and passes through `className`
* and `style` to the container element.
*
* @param props - Component props.
* @returns A React element containing the async-dom container.
*
* @example
* ```tsx
* <AsyncDom
*   worker="./app.worker.ts"
*   fallback={<p>Loading...</p>}
*   onReady={(instance) => console.log("ready", instance)}
* />
* ```
*/
function AsyncDom(props) {
	const { containerRef, instance } = useAsyncDom({
		worker: props.worker,
		scheduler: props.scheduler,
		debug: props.debug,
		onReady: props.onReady,
		onError: props.onError
	});
	if (typeof window === "undefined") return createElement("div", {
		className: props.className,
		style: props.style
	});
	return createElement("div", {
		className: props.className,
		style: props.style
	}, !instance && props.fallback ? props.fallback : null, createElement("div", { ref: containerRef }));
}
//#endregion
export { AsyncDom, useAsyncDom };

//# sourceMappingURL=react.js.map