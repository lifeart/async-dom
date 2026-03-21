/**
 * Framework adapter smoke tests.
 *
 * Verify that each framework adapter can be imported and has the correct
 * public API shape. These are structural checks only — no real rendering.
 */
import { describe, expect, it } from "vitest";

describe("React adapter smoke tests", () => {
	it("AsyncDom is a function (React component)", async () => {
		const { AsyncDom } = await import("../../src/react/index.ts");
		expect(typeof AsyncDom).toBe("function");
	});

	it("useAsyncDom is a function", async () => {
		const { useAsyncDom } = await import("../../src/react/index.ts");
		expect(typeof useAsyncDom).toBe("function");
	});
});

describe("Vue adapter smoke tests", () => {
	it("AsyncDom has name property", async () => {
		const { AsyncDom } = await import("../../src/vue/index.ts");
		expect(AsyncDom.name).toBe("AsyncDom");
	});

	it("AsyncDom has props with worker defined", async () => {
		const { AsyncDom } = await import("../../src/vue/index.ts");
		expect(AsyncDom.props).toBeDefined();
		expect(AsyncDom.props.worker).toBeDefined();
	});

	it("AsyncDom has emits array", async () => {
		const { AsyncDom } = await import("../../src/vue/index.ts");
		expect(AsyncDom.emits).toBeDefined();
	});

	it("useAsyncDom is a function", async () => {
		const { useAsyncDom } = await import("../../src/vue/index.ts");
		expect(typeof useAsyncDom).toBe("function");
	});
});

describe("Svelte adapter smoke tests", () => {
	it("asyncDom is a function", async () => {
		const { asyncDom } = await import("../../src/svelte/index.ts");
		expect(typeof asyncDom).toBe("function");
	});

	it("asyncDom returns object with destroy method", async () => {
		const { asyncDom } = await import("../../src/svelte/index.ts");
		const el = document.createElement("div");
		// Use a factory function to avoid Worker constructor (not available in jsdom)
		const fakeWorker = () =>
			({ terminate() {}, postMessage() {}, addEventListener() {} }) as unknown as Worker;
		const result = asyncDom(el, { worker: fakeWorker });
		expect(result).toBeDefined();
		expect(typeof result.destroy).toBe("function");
	});

	it("calling destroy() does not throw", async () => {
		const { asyncDom } = await import("../../src/svelte/index.ts");
		const el = document.createElement("div");
		const fakeWorker = () =>
			({ terminate() {}, postMessage() {}, addEventListener() {} }) as unknown as Worker;
		const result = asyncDom(el, { worker: fakeWorker });
		expect(() => result.destroy()).not.toThrow();
	});
});
