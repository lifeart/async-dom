import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../src/core/protocol.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";
import { createServerApp } from "../../src/server/runner.ts";
import type { WorkerDomResult } from "../../src/worker-thread/index.ts";

function createMockTransport(): Transport & { sent: Message[] } {
	const sent: Message[] = [];
	return {
		sent,
		send(msg: Message) {
			sent.push(msg);
		},
		onMessage() {},
		close() {},
		get readyState(): TransportReadyState {
			return "open";
		},
	};
}

describe("createServerApp", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("initialization", () => {
		it("returns an object with destroy and ready properties", () => {
			const transport = createMockTransport();
			const app = createServerApp({ transport, appModule: () => {} });

			expect(app).toHaveProperty("destroy");
			expect(app).toHaveProperty("ready");
			expect(typeof app.destroy).toBe("function");
			expect(app.ready).toBeInstanceOf(Promise);

			app.destroy();
		});

		it("calls appModule with WorkerDomResult containing document and window", () => {
			const transport = createMockTransport();
			let capturedDom: WorkerDomResult | null = null;

			const app = createServerApp({
				transport,
				appModule: (dom) => {
					capturedDom = dom;
				},
			});

			expect(capturedDom).not.toBeNull();
			expect(capturedDom!.document).toBeDefined();
			expect(capturedDom!.window).toBeDefined();
			expect(typeof capturedDom!.destroy).toBe("function");

			app.destroy();
		});

		it("sends ready message to transport during initialization", () => {
			const transport = createMockTransport();
			const app = createServerApp({ transport, appModule: () => {} });

			const readyMsg = transport.sent.find((m) => m.type === "ready");
			expect(readyMsg).toBeDefined();

			app.destroy();
		});

		it("ready promise resolves when synchronous appModule completes", async () => {
			const transport = createMockTransport();
			const app = createServerApp({ transport, appModule: () => {} });

			await expect(app.ready).resolves.toBeUndefined();

			app.destroy();
		});

		it("ready promise resolves when async appModule resolves", async () => {
			const transport = createMockTransport();
			let resolveModule!: () => void;
			const modulePromise = new Promise<void>((resolve) => {
				resolveModule = resolve;
			});

			const app = createServerApp({
				transport,
				appModule: () => modulePromise,
			});

			resolveModule();
			await expect(app.ready).resolves.toBeUndefined();

			app.destroy();
		});

		it("appModule receives a dom with functional document body and head", () => {
			const transport = createMockTransport();
			let domResult: WorkerDomResult | null = null;

			const app = createServerApp({
				transport,
				appModule: (dom) => {
					domResult = dom;
				},
			});

			expect(domResult!.document.body.tagName).toBe("BODY");
			expect(domResult!.document.head.tagName).toBe("HEAD");

			app.destroy();
		});
	});

	describe("destroy", () => {
		it("destroy() closes the transport", () => {
			const transport = createMockTransport();
			const closeSpy = vi.spyOn(transport, "close");

			const app = createServerApp({ transport, appModule: () => {} });
			app.destroy();

			expect(closeSpy).toHaveBeenCalledOnce();
		});

		it("destroy() can be called multiple times without throwing", () => {
			const transport = createMockTransport();
			const app = createServerApp({ transport, appModule: () => {} });

			expect(() => {
				app.destroy();
				app.destroy();
			}).not.toThrow();
		});

		it("destroy() stops the dom from sending further messages", () => {
			const transport = createMockTransport();
			let capturedDom: WorkerDomResult | null = null;

			const app = createServerApp({
				transport,
				appModule: (dom) => {
					capturedDom = dom;
				},
			});

			app.destroy();
			transport.sent.length = 0;

			// Perform a DOM operation after destroy — it should not produce any messages
			capturedDom!.document.createElement("div");

			expect(transport.sent).toHaveLength(0);
			expect(capturedDom).not.toBeNull();
		});
	});

	describe("error handling in appModule", () => {
		it("does not throw when synchronous appModule throws", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const transport = createMockTransport();

			expect(() => {
				createServerApp({
					transport,
					appModule: () => {
						throw new Error("boom");
					},
				}).destroy();
			}).not.toThrow();

			expect(consoleSpy).toHaveBeenCalledWith(
				"[async-dom] Server app module error:",
				expect.any(Error),
			);
		});

		it("ready resolves even when synchronous appModule throws", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const transport = createMockTransport();

			const app = createServerApp({
				transport,
				appModule: () => {
					throw new Error("sync failure");
				},
			});

			await expect(app.ready).resolves.toBeUndefined();

			app.destroy();
			consoleSpy.mockRestore();
		});

		it("ready resolves even when async appModule rejects", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const transport = createMockTransport();

			const app = createServerApp({
				transport,
				appModule: () => Promise.reject(new Error("async failure")),
			});

			await expect(app.ready).resolves.toBeUndefined();

			app.destroy();
			consoleSpy.mockRestore();
		});

		it("logs async appModule rejection with the error", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const transport = createMockTransport();
			const asyncError = new Error("async module crash");

			const app = createServerApp({
				transport,
				appModule: () => Promise.reject(asyncError),
			});

			await app.ready;

			expect(consoleSpy).toHaveBeenCalledWith(
				"[async-dom] Server app module error:",
				asyncError,
			);

			app.destroy();
			consoleSpy.mockRestore();
		});

		it("does not crash server when one connection's appModule fails while another succeeds", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const transport1 = createMockTransport();
			const transport2 = createMockTransport();

			// First app throws
			const app1 = createServerApp({
				transport: transport1,
				appModule: () => {
					throw new Error("connection 1 error");
				},
			});

			// Second app works fine
			let app2Called = false;
			const app2 = createServerApp({
				transport: transport2,
				appModule: () => {
					app2Called = true;
				},
			});

			expect(app2Called).toBe(true);

			app1.destroy();
			app2.destroy();
			consoleSpy.mockRestore();
		});
	});

	describe("ready promise management", () => {
		it("ready promise is always a Promise instance regardless of appModule return value", () => {
			const transport1 = createMockTransport();
			const transport2 = createMockTransport();
			const transport3 = createMockTransport();

			const syncApp = createServerApp({ transport: transport1, appModule: () => {} });
			const asyncApp = createServerApp({
				transport: transport2,
				appModule: () => Promise.resolve(),
			});
			const throwingApp = createServerApp({
				transport: transport3,
				appModule: () => {
					throw new Error("fail");
				},
			});

			expect(syncApp.ready).toBeInstanceOf(Promise);
			expect(asyncApp.ready).toBeInstanceOf(Promise);
			expect(throwingApp.ready).toBeInstanceOf(Promise);

			syncApp.destroy();
			asyncApp.destroy();
			throwingApp.destroy();
		});

		it("ready resolves only after async appModule resolves", async () => {
			const transport = createMockTransport();
			const events: string[] = [];

			let resolveModule!: () => void;
			const modulePromise = new Promise<void>((resolve) => {
				resolveModule = resolve;
			});

			const app = createServerApp({
				transport,
				appModule: async () => {
					await modulePromise;
					events.push("module-done");
				},
			});

			app.ready.then(() => events.push("ready-resolved"));

			// Confirm ready hasn't resolved yet
			expect(events).toHaveLength(0);

			resolveModule();
			await app.ready;

			expect(events).toEqual(["module-done", "ready-resolved"]);

			app.destroy();
		});

		it("multiple calls to destroy() after ready resolves do not throw", async () => {
			const transport = createMockTransport();
			const app = createServerApp({ transport, appModule: () => {} });

			await app.ready;

			expect(() => {
				app.destroy();
				app.destroy();
			}).not.toThrow();
		});
	});
});
