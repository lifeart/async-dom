/**
 * React bindings for async-dom.
 *
 * Provides the `<AsyncDom>` component and `useAsyncDom` hook for rendering
 * async-dom worker applications inside a React tree.
 *
 * @packageDocumentation
 */
export { AsyncDom, type AsyncDomProps } from "./async-dom-component.ts";
export { useAsyncDom, type UseAsyncDomOptions, type UseAsyncDomResult } from "./use-async-dom.ts";

// Re-export key types for convenience
export type { AsyncDomInstance, SchedulerConfig } from "../main-thread/index.ts";
export type { DebugOptions, SerializedError } from "../index.ts";
