import { createElement, type ReactNode } from "react";
import type { AsyncDomInstance } from "../main-thread/index.ts";
import type { DebugOptions, SchedulerConfig, SerializedError } from "../index.ts";
import { useAsyncDom } from "./use-async-dom.ts";

export interface AsyncDomProps {
	/** Worker script path or factory function */
	worker: string | (() => Worker);
	/** Scheduler configuration */
	scheduler?: SchedulerConfig;
	/** Enable debug mode (true for defaults, or pass DebugOptions) */
	debug?: DebugOptions | boolean;
	/** Fallback content shown while loading */
	fallback?: ReactNode;
	/** Called when the async-dom instance is ready */
	onReady?: (instance: AsyncDomInstance) => void;
	/** Called when a worker error occurs */
	onError?: (error: SerializedError) => void;
	/** CSS class name for the container div */
	className?: string;
	/** Inline styles for the container div */
	style?: React.CSSProperties;
}

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
export function AsyncDom(props: AsyncDomProps): ReactNode {
	const { containerRef, instance } = useAsyncDom({
		worker: props.worker,
		scheduler: props.scheduler,
		debug: props.debug,
		onReady: props.onReady,
		onError: props.onError,
	});

	// SSR guard: render only the container div
	if (typeof window === "undefined") {
		return createElement("div", {
			className: props.className,
			style: props.style,
		});
	}

	// Fallback is rendered as a sibling before the container to avoid
	// conflicting with createAsyncDom's DOM manipulation of the target element.
	return createElement(
		"div",
		{ className: props.className, style: props.style },
		!instance && props.fallback ? props.fallback : null,
		createElement("div", { ref: containerRef }),
	);
}
