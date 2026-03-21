/**
 * Vite plugin tests.
 *
 * Verify that the asyncDomPlugin factory returns a correctly shaped Vite
 * plugin object with the expected hooks and configuration behavior.
 */
import { describe, expect, it } from "vitest";
import { asyncDomPlugin } from "../../src/vite-plugin/index.ts";

describe("asyncDomPlugin", () => {
	it('returns object with name "async-dom"', () => {
		const plugin = asyncDomPlugin();
		expect(plugin.name).toBe("async-dom");
	});

	it("has config, configureServer, and configurePreviewServer hooks", () => {
		const plugin = asyncDomPlugin();
		expect(typeof plugin.config).toBe("function");
		expect(typeof plugin.configureServer).toBe("function");
		expect(typeof plugin.configurePreviewServer).toBe("function");
	});

	it("config() returns object with define and worker fields", () => {
		const plugin = asyncDomPlugin();
		const configFn = plugin.config as (
			config: Record<string, unknown>,
			env: { mode: string; command: string },
		) => Record<string, unknown>;
		const result = configFn({}, { mode: "production", command: "build" });
		expect(result).toBeDefined();
		expect(result.define).toBeDefined();
		expect(result.worker).toBeDefined();
	});

	it("options propagation: headers=false, debug=true affects config output", () => {
		const plugin = asyncDomPlugin({ headers: false, debug: true });
		const configFn = plugin.config as (
			config: Record<string, unknown>,
			env: { mode: string; command: string },
		) => { define: Record<string, string> };
		const result = configFn({}, { mode: "production", command: "build" });

		// debug: true should force __ASYNC_DOM_DEBUG__ to "true" regardless of mode
		expect(result.define.__ASYNC_DOM_DEBUG__).toBe(JSON.stringify(true));
	});

	it("default export equals named export", async () => {
		const mod = await import("../../src/vite-plugin/index.ts");
		expect(mod.default).toBe(mod.asyncDomPlugin);
	});

	it("config() produces valid Vite config structure", () => {
		const plugin = asyncDomPlugin();
		const configFn = plugin.config as (
			config: Record<string, unknown>,
			env: { mode: string; command: string },
		) => { define: Record<string, string>; worker: { format: string } };

		const result = configFn({}, { mode: "development", command: "serve" });

		// define must contain compile-time flags
		expect(result.define).toHaveProperty("__ASYNC_DOM_DEBUG__");
		expect(result.define).toHaveProperty("__ASYNC_DOM_BINARY__");

		// worker format must be "es" for ESM workers
		expect(result.worker.format).toBe("es");

		// In dev mode, debug should be true and binary should be false
		expect(result.define.__ASYNC_DOM_DEBUG__).toBe(JSON.stringify(true));
		expect(result.define.__ASYNC_DOM_BINARY__).toBe(JSON.stringify(false));
	});

	it("config() in production mode: debug=false, binary=true by default", () => {
		const plugin = asyncDomPlugin();
		const configFn = plugin.config as (
			config: Record<string, unknown>,
			env: { mode: string; command: string },
		) => { define: Record<string, string> };

		const result = configFn({}, { mode: "production", command: "build" });

		expect(result.define.__ASYNC_DOM_DEBUG__).toBe(JSON.stringify(false));
		expect(result.define.__ASYNC_DOM_BINARY__).toBe(JSON.stringify(true));
	});

	it("configureServer installs COOP/COEP header middleware", () => {
		const plugin = asyncDomPlugin({ headers: true });
		const configureServer = plugin.configureServer as (server: unknown) => void;

		// Mock a minimal ViteDevServer
		const middlewares: Array<(req: unknown, res: unknown, next: () => void) => void> = [];
		const mockServer = {
			middlewares: {
				use(fn: (req: unknown, res: unknown, next: () => void) => void) {
					middlewares.push(fn);
				},
			},
			hot: {
				on() {},
			},
		};

		configureServer(mockServer);

		// Should have registered at least one middleware
		expect(middlewares.length).toBeGreaterThan(0);

		// Verify the middleware sets COOP/COEP headers
		const headers = new Map<string, string>();
		const mockRes = {
			getHeader(name: string) {
				return headers.get(name);
			},
			setHeader(name: string, value: string) {
				headers.set(name, value);
			},
		};
		let nextCalled = false;
		middlewares[0]({}, mockRes, () => {
			nextCalled = true;
		});

		expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
		expect(headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
		expect(nextCalled).toBe(true);
	});

	it("configureServer with headers=false does not install header middleware", () => {
		const plugin = asyncDomPlugin({ headers: false, workerErrorOverlay: false });
		const configureServer = plugin.configureServer as (server: unknown) => void;

		const middlewares: Array<(req: unknown, res: unknown, next: () => void) => void> = [];
		const mockServer = {
			middlewares: {
				use(fn: (req: unknown, res: unknown, next: () => void) => void) {
					middlewares.push(fn);
				},
			},
			hot: {
				on() {},
			},
		};

		configureServer(mockServer);

		// With both headers=false and workerErrorOverlay=false, no middleware should set headers
		if (middlewares.length > 0) {
			const headers = new Map<string, string>();
			const mockRes = {
				getHeader(name: string) {
					return headers.get(name);
				},
				setHeader(name: string, value: string) {
					headers.set(name, value);
				},
			};
			middlewares[0]({}, mockRes, () => {});
			expect(headers.has("Cross-Origin-Opener-Policy")).toBe(false);
		}
	});
});
