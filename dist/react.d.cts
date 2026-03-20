import { _ as SerializedError } from "./base.cjs";
import { n as DebugOptions } from "./debug.cjs";
import { d as SchedulerConfig, r as AsyncDomInstance } from "./index.cjs";
import { ReactNode } from "react";

//#region src/react/async-dom-component.d.ts
interface AsyncDomProps {
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
declare function AsyncDom(props: AsyncDomProps): ReactNode;
//# sourceMappingURL=async-dom-component.d.ts.map
//#endregion
//#region src/react/use-async-dom.d.ts
interface UseAsyncDomOptions {
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
interface UseAsyncDomResult {
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
declare function useAsyncDom(options: UseAsyncDomOptions): UseAsyncDomResult;
//# sourceMappingURL=use-async-dom.d.ts.map

//#endregion
export { AsyncDom, type AsyncDomInstance, type AsyncDomProps, type DebugOptions, type SchedulerConfig, type SerializedError, type UseAsyncDomOptions, type UseAsyncDomResult, useAsyncDom };
//# sourceMappingURL=react.d.cts.map