import { describe, it, expect, vi } from "vitest";
import { asyncDomPlugin } from "../../src/vite-plugin/index.ts";
import type { Plugin } from "vite";

describe("asyncDomPlugin", () => {
	it("returns a plugin with name 'async-dom'", () => {
		const plugin = asyncDomPlugin() as Plugin;
		expect(plugin.name).toBe("async-dom");
	});

	it("sets define and worker.format in config hook", () => {
		const plugin = asyncDomPlugin() as Plugin & {
			config: (config: unknown, env: { mode: string; command: string }) => unknown;
		};
		const result = plugin.config({}, { mode: "development", command: "serve" }) as {
			define: Record<string, string>;
			worker: { format: string };
		};
		expect(result.define.__ASYNC_DOM_DEBUG__).toBe("true");
		expect(result.define.__ASYNC_DOM_BINARY__).toBe("false");
		expect(result.worker.format).toBe("es");
	});

	it("sets binary transport true in production mode", () => {
		const plugin = asyncDomPlugin() as Plugin & {
			config: (config: unknown, env: { mode: string; command: string }) => unknown;
		};
		const result = plugin.config({}, { mode: "production", command: "build" }) as {
			define: Record<string, string>;
		};
		expect(result.define.__ASYNC_DOM_DEBUG__).toBe("false");
		expect(result.define.__ASYNC_DOM_BINARY__).toBe("true");
	});

	it("respects explicit debug and binaryTransport options", () => {
		const plugin = asyncDomPlugin({ debug: true, binaryTransport: false }) as Plugin & {
			config: (config: unknown, env: { mode: string; command: string }) => unknown;
		};
		const result = plugin.config({}, { mode: "production", command: "build" }) as {
			define: Record<string, string>;
		};
		expect(result.define.__ASYNC_DOM_DEBUG__).toBe("true");
		expect(result.define.__ASYNC_DOM_BINARY__).toBe("false");
	});

	it("configures server with COOP/COEP headers", () => {
		const plugin = asyncDomPlugin() as Plugin & {
			configureServer: (server: unknown) => void;
		};

		const middlewareStack: Array<(req: unknown, res: unknown, next: () => void) => void> = [];
		const hotHandlers = new Map<string, (...args: unknown[]) => void>();

		const mockServer = {
			middlewares: {
				use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
					middlewareStack.push(fn);
				},
			},
			hot: {
				on: (event: string, handler: (...args: unknown[]) => void) => {
					hotHandlers.set(event, handler);
				},
				send: vi.fn(),
			},
		};

		plugin.configureServer(mockServer);

		// Verify middleware was added
		expect(middlewareStack.length).toBeGreaterThan(0);

		// Test the middleware sets headers
		const headers = new Map<string, string>();
		const mockRes = {
			getHeader: (name: string) => headers.get(name),
			setHeader: (name: string, value: string) => headers.set(name, value),
		};
		const next = vi.fn();

		middlewareStack[0]({}, mockRes, next);
		expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
		expect(headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
		expect(next).toHaveBeenCalled();
	});

	it("does not override existing COOP/COEP headers", () => {
		const plugin = asyncDomPlugin() as Plugin & {
			configureServer: (server: unknown) => void;
		};

		const middlewareStack: Array<(req: unknown, res: unknown, next: () => void) => void> = [];
		const mockServer = {
			middlewares: {
				use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
					middlewareStack.push(fn);
				},
			},
			hot: { on: vi.fn(), send: vi.fn() },
		};

		plugin.configureServer(mockServer);

		const existingHeaders = new Map<string, string>([
			["Cross-Origin-Opener-Policy", "unsafe-none"],
		]);
		const mockRes = {
			getHeader: (name: string) => existingHeaders.get(name),
			setHeader: (name: string, value: string) => existingHeaders.set(name, value),
		};

		middlewareStack[0]({}, mockRes, vi.fn());
		expect(existingHeaders.get("Cross-Origin-Opener-Policy")).toBe("unsafe-none");
	});

	it("skips headers when headers option is false", () => {
		const plugin = asyncDomPlugin({ headers: false }) as Plugin & {
			configureServer: (server: unknown) => void;
		};

		const middlewareStack: Array<(req: unknown, res: unknown, next: () => void) => void> = [];
		const mockServer = {
			middlewares: {
				use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
					middlewareStack.push(fn);
				},
			},
			hot: { on: vi.fn(), send: vi.fn() },
		};

		plugin.configureServer(mockServer);

		// Only the error overlay handler (no header middleware)
		expect(middlewareStack.length).toBe(0);
	});

	it("forwards async-dom:error to vite error overlay", () => {
		const plugin = asyncDomPlugin() as Plugin & {
			configureServer: (server: unknown) => void;
		};

		const hotHandlers = new Map<string, (...args: unknown[]) => void>();
		const mockServer = {
			middlewares: { use: vi.fn() },
			hot: {
				on: (event: string, handler: (...args: unknown[]) => void) => {
					hotHandlers.set(event, handler);
				},
				send: vi.fn(),
			},
		};

		plugin.configureServer(mockServer);

		const errorHandler = hotHandlers.get("async-dom:error");
		expect(errorHandler).toBeDefined();

		errorHandler!({ message: "Test error", stack: "Error: Test error\n  at worker.ts:1" });

		expect(mockServer.hot.send).toHaveBeenCalledWith({
			type: "error",
			err: {
				message: "Test error",
				stack: "Error: Test error\n  at worker.ts:1",
				plugin: "async-dom",
				id: "worker",
			},
		});
	});

	it("transformIndexHtml injects error snippet in dev mode", () => {
		const plugin = asyncDomPlugin() as Plugin & {
			transformIndexHtml: {
				order: string;
				handler: (html: string, ctx: { server?: unknown }) => unknown[];
			};
		};

		const result = plugin.transformIndexHtml.handler("<html></html>", {
			server: {},
		});

		expect(result.length).toBe(1);
		expect((result[0] as { tag: string }).tag).toBe("script");
	});

	it("transformIndexHtml returns empty in production", () => {
		const plugin = asyncDomPlugin() as Plugin & {
			transformIndexHtml: {
				order: string;
				handler: (html: string, ctx: { server?: unknown }) => unknown[];
			};
		};

		const result = plugin.transformIndexHtml.handler("<html></html>", {});
		expect(result.length).toBe(0);
	});
});
