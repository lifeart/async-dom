/**
 * Vue bindings for async-dom.
 *
 * Provides the `<AsyncDom>` component and `useAsyncDom` composable for rendering
 * async-dom worker applications inside a Vue application.
 *
 * @packageDocumentation
 */

export type { DebugOptions, SerializedError } from "../index.ts";
// Re-export key types for convenience
export type { AsyncDomInstance, SchedulerConfig } from "../main-thread/index.ts";
export type { AsyncDomProps } from "./AsyncDom.ts";
export { AsyncDom } from "./AsyncDom.ts";
export { type UseAsyncDomOptions, type UseAsyncDomResult, useAsyncDom } from "./use-async-dom.ts";
