import { _ as SerializedError } from "./base.cjs";
import { n as DebugOptions } from "./debug.cjs";
import { d as SchedulerConfig, r as AsyncDomInstance } from "./index.cjs";

//#region src/svelte/index.d.ts
interface AsyncDomActionOptions {
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
declare function asyncDom(node: HTMLElement, options: AsyncDomActionOptions): {
  destroy: () => void;
};
//#endregion
export { AsyncDomActionOptions, type AsyncDomInstance, type DebugOptions, type SchedulerConfig, type SerializedError, asyncDom };
//# sourceMappingURL=svelte.d.cts.map