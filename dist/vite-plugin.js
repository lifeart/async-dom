//#region src/vite-plugin/error-snippet.ts
/**
* Client-side snippet injected during development that forwards
* worker errors to the Vite error overlay via HMR.
*
* Note: This is injected as `children` of a `<script type="module">` tag
* by the Vite `transformIndexHtml` hook — do NOT wrap in `<script>` tags.
*/
const workerErrorSnippet = `
if (import.meta.hot) {
  const origOnerror = self.onerror;
  self.onerror = function(message, source, lineno, colno, error) {
    if (source && source.includes('worker')) {
      import.meta.hot.send('async-dom:error', {
        message: error ? error.message : String(message),
        stack: error ? error.stack : '',
        source: source,
        lineno: lineno,
        colno: colno,
      });
    }
    if (origOnerror) return origOnerror.call(this, message, source, lineno, colno, error);
  };
}
`;
//#endregion
//#region src/vite-plugin/index.ts
const COOP_HEADER = "Cross-Origin-Opener-Policy";
const COEP_HEADER = "Cross-Origin-Embedder-Policy";
function addCrossOriginHeaders(server, enabled) {
	if (!enabled) return;
	server.middlewares.use((_req, res, next) => {
		if (!res.getHeader(COOP_HEADER)) res.setHeader(COOP_HEADER, "same-origin");
		if (!res.getHeader(COEP_HEADER)) res.setHeader(COEP_HEADER, "require-corp");
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
* import { asyncDomPlugin } from "async-dom/vite-plugin";
*
* export default defineConfig({
*   plugins: [asyncDomPlugin()],
* });
* ```
*/
function asyncDomPlugin(options = {}) {
	const { headers = true, debug, binaryTransport = true, workerErrorOverlay = true } = options;
	return {
		name: "async-dom",
		config(_config, env) {
			const isDev = env.mode === "development" || env.command === "serve";
			return {
				define: {
					__ASYNC_DOM_DEBUG__: JSON.stringify(debug ?? isDev),
					__ASYNC_DOM_BINARY__: JSON.stringify(!isDev && binaryTransport)
				},
				worker: { format: "es" }
			};
		},
		configureServer(server) {
			addCrossOriginHeaders(server, headers);
			if (workerErrorOverlay) server.hot.on("async-dom:error", (data) => {
				server.hot.send({
					type: "error",
					err: {
						message: data.message ?? "Worker error",
						stack: data.stack ?? "",
						plugin: "async-dom",
						id: data.source ?? "worker"
					}
				});
			});
		},
		configurePreviewServer(server) {
			addCrossOriginHeaders(server, headers);
		},
		transformIndexHtml: {
			order: "pre",
			handler(_html, ctx) {
				if (ctx.server && workerErrorOverlay) return [{
					tag: "script",
					attrs: { type: "module" },
					children: workerErrorSnippet,
					injectTo: "head"
				}];
				return [];
			}
		}
	};
}
//#endregion
export { asyncDomPlugin, asyncDomPlugin as default };

//# sourceMappingURL=vite-plugin.js.map