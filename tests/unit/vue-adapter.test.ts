import { describe, it, expect, vi } from "vitest";

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

describe("vue adapter", () => {
	it("exports AsyncDom component", async () => {
		const mod = await import("../../src/vue/index.ts");
		expect(mod.AsyncDom).toBeDefined();
		expect(mod.AsyncDom.name).toBe("AsyncDom");
	});

	it("exports useAsyncDom composable", async () => {
		const mod = await import("../../src/vue/index.ts");
		expect(mod.useAsyncDom).toBeDefined();
		expect(typeof mod.useAsyncDom).toBe("function");
	});

	it("AsyncDom component has correct props", async () => {
		const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");
		expect(AsyncDom.props).toBeDefined();
		expect(AsyncDom.props.worker).toBeDefined();
		expect(AsyncDom.props.worker.required).toBe(true);
	});

	it("AsyncDom component has correct emits", async () => {
		const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");
		expect(AsyncDom.emits).toBeDefined();
		expect(AsyncDom.emits.ready).toBeDefined();
		expect(AsyncDom.emits.error).toBeDefined();
	});
});
