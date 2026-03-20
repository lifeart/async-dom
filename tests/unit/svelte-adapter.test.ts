import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInstance = {
	start: vi.fn(),
	stop: vi.fn(),
	destroy: vi.fn(),
	addApp: vi.fn(),
	removeApp: vi.fn(),
};

const createAsyncDom = vi.fn(() => ({ ...mockInstance }));

// Mock the main-thread module
vi.mock("../../src/main-thread/index.ts", () => ({
	createAsyncDom: (...args: unknown[]) => createAsyncDom(...args),
}));

function createMockWorker() {
	return {
		postMessage: vi.fn(),
		terminate: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		onmessage: null,
		onerror: null,
		onmessageerror: null,
		dispatchEvent: vi.fn(),
	} as unknown as Worker;
}

describe("svelte adapter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("exports", () => {
		it("exports asyncDom action", async () => {
			const mod = await import("../../src/svelte/index.ts");
			expect(mod.asyncDom).toBeDefined();
			expect(typeof mod.asyncDom).toBe("function");
		});
	});

	describe("asyncDom action", () => {
		it("returns object with destroy method", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");

			const node = document.createElement("div");
			const result = asyncDom(node, {
				worker: () => createMockWorker(),
			});

			expect(result).toBeDefined();
			expect(typeof result.destroy).toBe("function");

			result.destroy();
		});

		it("calls createAsyncDom with the node as target", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");

			const node = document.createElement("div");
			document.body.appendChild(node);

			const result = asyncDom(node, {
				worker: () => createMockWorker(),
			});

			await vi.waitFor(() => {
				expect(createAsyncDom).toHaveBeenCalledOnce();
			});

			const config = createAsyncDom.mock.calls[0][0] as { target: HTMLElement };
			expect(config.target).toBe(node);
			expect(mockInstance.start).toHaveBeenCalledOnce();

			result.destroy();
			node.remove();
		});

		it("calls onReady with instance after creation", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");
			const onReady = vi.fn();

			const node = document.createElement("div");
			const result = asyncDom(node, {
				worker: () => createMockWorker(),
				onReady,
			});

			await vi.waitFor(() => {
				expect(onReady).toHaveBeenCalledOnce();
			});

			expect(onReady.mock.calls[0][0]).toHaveProperty("start");
			expect(onReady.mock.calls[0][0]).toHaveProperty("destroy");

			result.destroy();
		});

		it("calls instance.destroy() when destroy is called", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");

			const node = document.createElement("div");
			const result = asyncDom(node, {
				worker: () => createMockWorker(),
			});

			await vi.waitFor(() => {
				expect(createAsyncDom).toHaveBeenCalled();
			});

			result.destroy();
			expect(mockInstance.destroy).toHaveBeenCalled();
		});

		it("terminates worker if destroyed before async import resolves", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");
			const mockWorker = createMockWorker();

			createAsyncDom.mockClear();

			const node = document.createElement("div");
			const result = asyncDom(node, {
				worker: () => mockWorker,
			});

			// Destroy immediately before async import resolves
			result.destroy();

			// Wait for async import
			await new Promise((r) => setTimeout(r, 20));

			expect(mockWorker.terminate).toHaveBeenCalled();
		});

		it("resolves debug: true to full debug options", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");

			const node = document.createElement("div");
			const result = asyncDom(node, {
				worker: () => createMockWorker(),
				debug: true,
			});

			await vi.waitFor(() => {
				expect(createAsyncDom).toHaveBeenCalled();
			});

			const config = createAsyncDom.mock.calls[0]?.[0] as { debug?: object };
			expect(config.debug).toEqual({
				logMutations: true,
				logEvents: true,
				exposeDevtools: true,
			});

			result.destroy();
		});

		it("passes scheduler option through", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");

			const scheduler = { frameBudgetMs: 8 };
			const node = document.createElement("div");
			const result = asyncDom(node, {
				worker: () => createMockWorker(),
				scheduler,
			});

			await vi.waitFor(() => {
				expect(createAsyncDom).toHaveBeenCalled();
			});

			const config = createAsyncDom.mock.calls[0]?.[0] as {
				scheduler?: { frameBudgetMs: number };
			};
			expect(config.scheduler).toBe(scheduler);

			result.destroy();
		});

		it("does not call createAsyncDom after destroy", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");

			createAsyncDom.mockClear();

			const node = document.createElement("div");
			const result = asyncDom(node, {
				worker: () => createMockWorker(),
			});

			result.destroy();

			await new Promise((r) => setTimeout(r, 20));

			// createAsyncDom should not have been called because destroyed was set
			expect(createAsyncDom).not.toHaveBeenCalled();
		});

		it("is safe to call destroy multiple times", async () => {
			const { asyncDom } = await import("../../src/svelte/index.ts");

			const node = document.createElement("div");
			const result = asyncDom(node, {
				worker: () => createMockWorker(),
			});

			await vi.waitFor(() => {
				expect(createAsyncDom).toHaveBeenCalled();
			});

			result.destroy();
			result.destroy(); // Should not throw

			expect(mockInstance.destroy).toHaveBeenCalledTimes(1);
		});
	});
});
