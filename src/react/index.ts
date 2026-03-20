/**
 * React bindings for async-dom.
 *
 * Provides the `<AsyncDom>` component and `useAsyncDom` hook for rendering
 * async-dom worker applications inside a React tree.
 *
 * @packageDocumentation
 */

export type { DebugOptions, SerializedError } from "../index.ts";
// Re-export key types for convenience
export type { AsyncDomInstance, SchedulerConfig } from "../main-thread/index.ts";
export { AsyncDom, type AsyncDomProps } from "./async-dom-component.ts";
export { type UseAsyncDomOptions, type UseAsyncDomResult, useAsyncDom } from "./use-async-dom.ts";
