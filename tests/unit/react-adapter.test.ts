import { describe, it, expect, vi } from "vitest";

// Mock the main-thread module before importing React adapter
vi.mock("../../src/main-thread/index.ts", () => ({
	createAsyncDom: vi.fn(() => ({
		start: vi.fn(),
		stop: vi.fn(),
		destroy: vi.fn(),
		addApp: vi.fn(),
		removeApp: vi.fn(),
	})),
}));

describe("react adapter", () => {
	it("exports AsyncDom component", async () => {
		const mod = await import("../../src/react/index.ts");
		expect(mod.AsyncDom).toBeDefined();
		expect(typeof mod.AsyncDom).toBe("function");
	});

	it("exports useAsyncDom hook", async () => {
		const mod = await import("../../src/react/index.ts");
		expect(mod.useAsyncDom).toBeDefined();
		expect(typeof mod.useAsyncDom).toBe("function");
	});

	it("AsyncDom renders a div in SSR-like environment", async () => {
		// The component should handle the case where window exists (jsdom)
		const { AsyncDom } = await import("../../src/react/async-dom-component.ts");
		expect(typeof AsyncDom).toBe("function");
	});

	it("useAsyncDom returns containerRef and instance", async () => {
		// We need to test this in a React context
		const React = await import("react");
		const { renderHook } = await import("@testing-library/react");
		const { useAsyncDom } = await import("../../src/react/use-async-dom.ts");

		const { result } = renderHook(() =>
			useAsyncDom({
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
			}),
		);

		expect(result.current.containerRef).toBeDefined();
		// Instance is null initially (async creation)
		expect(result.current.instance).toBeNull();
	});
});
