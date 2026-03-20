import { Plugin } from "vite";

//#region src/vite-plugin/index.d.ts
interface AsyncDomPluginOptions {
  /** Enable COOP/COEP headers for SharedArrayBuffer support (default: true) */
  headers?: boolean;
  /** Force debug mode (default: auto — enabled in development) */
  debug?: boolean;
  /** Use binary transport in production (default: true) */
  binaryTransport?: boolean;
  /** Forward worker errors to Vite error overlay (default: true) */
  workerErrorOverlay?: boolean;
}
/**
 * Vite plugin that configures your project for async-dom.
 *
 * - Sets COOP/COEP headers for SharedArrayBuffer support
 * - Injects `__ASYNC_DOM_DEBUG__` and `__ASYNC_DOM_BINARY__` compile-time flags
 * - Forwards worker errors to the Vite error overlay during development
 *
 * @param options - Plugin configuration options.
 * @returns A Vite plugin instance.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { asyncDomPlugin } from "async-dom/vite-plugin";
 *
 * export default defineConfig({
 *   plugins: [asyncDomPlugin()],
 * });
 * ```
 */
declare function asyncDomPlugin(options?: AsyncDomPluginOptions): Plugin;
//#endregion
export { AsyncDomPluginOptions, asyncDomPlugin, asyncDomPlugin as default };
//# sourceMappingURL=vite-plugin.d.cts.map