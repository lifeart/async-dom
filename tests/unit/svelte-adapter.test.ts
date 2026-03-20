import { describe, expect, it, vi } from "vitest";

// Mock the main-thread module
vi.mock("../../src/main-thread/index.ts", () => ({
	createAsyncDom: vi.fn(() => ({
		start: vi.fn(),
		stop: vi.fn(),
		destroy: vi.fn(),
		addApp: vi.fn(),
		removeApp: vi.fn(),
	})),
}));

describe("svelte adapter", () => {
	it("exports asyncDom action", async () => {
		const mod = await import("../../src/svelte/index.ts");
		expect(mod.asyncDom).toBeDefined();
		expect(typeof mod.asyncDom).toBe("function");
	});

	it("asyncDom action returns destroy function", async () => {
		const { asyncDom } = await import("../../src/svelte/index.ts");

		const mockNode = document.createElement("div");
		const result = asyncDom(mockNode, {
			worker: () =>
				({
					postMessage: vi.fn(),
					terminate: vi.fn(),
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
					onmessage: null,
					onerror: null,
					onmessageerror: null,
					dispatchEvent: vi.fn(),
				}) as unknown as Worker,
		});

		expect(result).toBeDefined();
		expect(typeof result.destroy).toBe("function");

		// Cleanup
		result.destroy();
	});

	it("asyncDom action calls onReady when instance is created", async () => {
		const { asyncDom } = await import("../../src/svelte/index.ts");
		const onReady = vi.fn();

		const mockNode = document.createElement("div");
		const result = asyncDom(mockNode, {
			worker: () =>
				({
					postMessage: vi.fn(),
					terminate: vi.fn(),
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
					onmessage: null,
					onerror: null,
					onmessageerror: null,
					dispatchEvent: vi.fn(),
				}) as unknown as Worker,
			onReady,
		});

		// onReady is called asynchronously after dynamic import resolves
		await vi.waitFor(() => {
			expect(onReady).toHaveBeenCalled();
		});

		result.destroy();
	});
});
