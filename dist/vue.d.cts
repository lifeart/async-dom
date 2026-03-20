import { v as SerializedError } from "./base.cjs";
import { n as DebugOptions } from "./debug.cjs";
import { p as SchedulerConfig, r as AsyncDomInstance } from "./index.cjs";
import * as vue0 from "vue";
import { PropType, Ref, ShallowRef, SlotsType } from "vue";

//#region src/vue/AsyncDom.d.ts
/** Props for the {@link AsyncDom} Vue component. */
interface AsyncDomProps {
  /** Worker script path or factory function */
  worker: string | (() => Worker);
  /** Scheduler configuration */
  scheduler?: SchedulerConfig;
  /** Enable debug mode (true for defaults, or pass DebugOptions) */
  debug?: DebugOptions | boolean;
}
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
declare const AsyncDom: vue0.DefineComponent<vue0.ExtractPropTypes<{
  worker: {
    type: PropType<string | (() => Worker)>;
    required: true;
  };
  scheduler: {
    type: PropType<SchedulerConfig>;
    default: undefined;
  };
  debug: {
    type: PropType<boolean | DebugOptions>;
    default: undefined;
  };
}>, () => vue0.VNode<vue0.RendererNode, vue0.RendererElement, {
  [key: string]: any;
}>, {}, {}, {}, vue0.ComponentOptionsMixin, vue0.ComponentOptionsMixin, {
  ready: (_instance: AsyncDomInstance) => true;
  error: (_error: SerializedError) => true;
}, string, vue0.PublicProps, Readonly<vue0.ExtractPropTypes<{
  worker: {
    type: PropType<string | (() => Worker)>;
    required: true;
  };
  scheduler: {
    type: PropType<SchedulerConfig>;
    default: undefined;
  };
  debug: {
    type: PropType<boolean | DebugOptions>;
    default: undefined;
  };
}>> & Readonly<{
  onReady?: ((_instance: AsyncDomInstance) => any) | undefined;
  onError?: ((_error: SerializedError) => any) | undefined;
}>, {
  scheduler: SchedulerConfig;
  debug: boolean | DebugOptions;
}, SlotsType<{
  fallback?: Record<string, never>;
}>, {}, {}, string, vue0.ComponentProvideOptions, true, {}, any>;
//# sourceMappingURL=AsyncDom.d.ts.map
//#endregion
//#region src/vue/use-async-dom.d.ts
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
  /** Template ref to bind to the container element */
  containerRef: Ref<HTMLDivElement | null>;
  /** The async-dom instance (null until ready) */
  instance: ShallowRef<AsyncDomInstance | null>;
}
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
 * import { useAsyncDom } from "@lifeart/async-dom/vue";
 *
 * const { containerRef, instance } = useAsyncDom({
 *   worker: "./my-worker.ts",
 *   onReady: (inst) => console.log("Ready!", inst),
 * });
 * </script>
 *
 * <template>
 *   <div ref="containerRef" />
 * </template>
 * ```
 */
declare function useAsyncDom(options: UseAsyncDomOptions): UseAsyncDomResult;
//# sourceMappingURL=use-async-dom.d.ts.map

//#endregion
export { AsyncDom, type AsyncDomInstance, type AsyncDomProps, type DebugOptions, type SchedulerConfig, type SerializedError, type UseAsyncDomOptions, type UseAsyncDomResult, useAsyncDom };
//# sourceMappingURL=vue.d.cts.map