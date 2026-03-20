import type { Plugin, ViteDevServer } from "vite";
import { workerErrorSnippet } from "./error-snippet.ts";

export interface AsyncDomPluginOptions {
	/** Enable COOP/COEP headers for SharedArrayBuffer support (default: true) */
	headers?: boolean;
	/** Force debug mode (default: auto — enabled in development) */
	debug?: boolean;
	/** Use binary transport in production (default: true) */
	binaryTransport?: boolean;
	/** Forward worker errors to Vite error overlay (default: true) */
	workerErrorOverlay?: boolean;
}

const COOP_HEADER = "Cross-Origin-Opener-Policy";
const COEP_HEADER = "Cross-Origin-Embedder-Policy";

function addCrossOriginHeaders(server: ViteDevServer, enabled: boolean): void {
	if (!enabled) return;

	server.middlewares.use((_req, res, next) => {
		// Don't override if already set by the user
		if (!res.getHeader(COOP_HEADER)) {
			res.setHeader(COOP_HEADER, "same-origin");
		}
		if (!res.getHeader(COEP_HEADER)) {
			res.setHeader(COEP_HEADER, "require-corp");
		}
		next();
	});
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
 * import { asyncDomPlugin } from "@lifeart/async-dom/vite-plugin";
 *
 * export default defineConfig({
 *   plugins: [asyncDomPlugin()],
 * });
 * ```
 */
export function asyncDomPlugin(options: AsyncDomPluginOptions = {}): Plugin {
	const { headers = true, debug, binaryTransport = true, workerErrorOverlay = true } = options;

	return {
		name: "async-dom",

		config(_config, env) {
			const isDev = env.mode === "development" || env.command === "serve";
			return {
				define: {
					__ASYNC_DOM_DEBUG__: JSON.stringify(debug ?? isDev),
					__ASYNC_DOM_BINARY__: JSON.stringify(!isDev && binaryTransport),
				},
				worker: {
					format: "es" as const,
				},
			};
		},

		configureServer(server) {
			addCrossOriginHeaders(server, headers);

			if (workerErrorOverlay) {
				server.hot.on("async-dom:error", (data) => {
					server.hot.send({
						type: "error",
						err: {
							message: data.message ?? "Worker error",
							stack: data.stack ?? "",
							plugin: "async-dom",
							id: data.source ?? "worker",
						},
					});
				});
			}
		},

		configurePreviewServer(server) {
			addCrossOriginHeaders(server as unknown as ViteDevServer, headers);
		},

		transformIndexHtml: {
			order: "pre",
			handler(_html, ctx) {
				if (ctx.server && workerErrorOverlay) {
					return [
						{
							tag: "script",
							attrs: { type: "module" },
							children: workerErrorSnippet,
							injectTo: "head" as const,
						},
					];
				}
				return [];
			},
		},
	};
}

export default asyncDomPlugin;
