import { useEffect, useRef, useState } from "react";
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
	/** Ref to attach to the container element */
	containerRef: React.RefObject<HTMLDivElement | null>;
	/** The async-dom instance (null until ready) */
	instance: AsyncDomInstance | null;
}

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
export function useAsyncDom(options: UseAsyncDomOptions): UseAsyncDomResult {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [instance, setInstance] = useState<AsyncDomInstance | null>(null);
	const instanceRef = useRef<AsyncDomInstance | null>(null);

	// Stabilize callback refs to prevent re-creation on re-renders
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
		const worker =
			typeof workerProp === "string"
				? new Worker(new URL(workerProp, import.meta.url), { type: "module" })
				: workerProp();

		// Dynamic import to avoid pulling main-thread code into SSR bundles
		import("../main-thread/index.ts").then(({ createAsyncDom }) => {
			if (cancelled) {
				worker.terminate();
				return;
			}

			const inst = createAsyncDom({
				target: el,
				worker,
				scheduler: schedulerRef.current,
				debug: resolveDebugOption(debugRef.current),
			});
			inst.start();
			instanceRef.current = inst;
			setInstance(inst);
			onReadyRef.current?.(inst);
		});

		return () => {
			cancelled = true;
			instanceRef.current?.destroy();
			instanceRef.current = null;
			setInstance(null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return { containerRef, instance };
}
