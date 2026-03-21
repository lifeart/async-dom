/**
 * Integration test verifying all exports from the worker-thread entry point.
 */
import { describe, expect, it } from "vitest";
import * as Mod from "../../src/worker-thread/index.ts";

describe("worker-thread entry point exports", () => {
	const EXPECTED_EXPORTS = [
		"createWorkerDom",
		"VirtualDocument",
		"VirtualElement",
		"VirtualTextNode",
		"VirtualCommentNode",
		"MutationCollector",
		"ScopedStorage",
		"detectPlatform",
		"createWorkerPlatform",
		"createNodePlatform",
	];

	it("has all expected exports (guards against accidental removal)", () => {
		for (const name of EXPECTED_EXPORTS) {
			expect(Mod).toHaveProperty(name);
		}
	});

	it("has no unexpected exports (guards against accidental additions)", () => {
		const actualExports = Object.keys(Mod);
		const unexpected = actualExports.filter((k) => !EXPECTED_EXPORTS.includes(k));
		expect(
			unexpected,
			`Unexpected exports found: ${unexpected.join(", ")}. If intentional, add them to EXPECTED_EXPORTS.`,
		).toEqual([]);
	});

	for (const [key, value] of Object.entries(Mod)) {
		it(`export "${key}" is defined`, () => {
			expect(value).toBeDefined();
		});
	}

	it("createWorkerDom is a function", () => {
		expect(typeof Mod.createWorkerDom).toBe("function");
	});

	it("VirtualDocument is a function", () => {
		expect(typeof Mod.VirtualDocument).toBe("function");
	});

	it("VirtualElement is a function", () => {
		expect(typeof Mod.VirtualElement).toBe("function");
	});

	it("VirtualTextNode is a function", () => {
		expect(typeof Mod.VirtualTextNode).toBe("function");
	});

	it("VirtualCommentNode is a function", () => {
		expect(typeof Mod.VirtualCommentNode).toBe("function");
	});

	it("MutationCollector is a function", () => {
		expect(typeof Mod.MutationCollector).toBe("function");
	});

	it("ScopedStorage is a function", () => {
		expect(typeof Mod.ScopedStorage).toBe("function");
	});

	it("detectPlatform is a function", () => {
		expect(typeof Mod.detectPlatform).toBe("function");
	});

	it("createWorkerPlatform is a function", () => {
		expect(typeof Mod.createWorkerPlatform).toBe("function");
	});

	it("createNodePlatform is a function", () => {
		expect(typeof Mod.createNodePlatform).toBe("function");
	});
});
