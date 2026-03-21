/**
 * Integration test verifying all exports from the Vue entry point.
 */
import { describe, expect, it } from "vitest";
import * as Mod from "../../src/vue/index.ts";

describe("vue entry point exports", () => {
	const EXPECTED_EXPORTS = ["AsyncDom", "useAsyncDom"];

	it("has all expected exports (guards against accidental removal)", () => {
		for (const name of EXPECTED_EXPORTS) {
			expect(Mod).toHaveProperty(name);
		}
	});

	for (const [key, value] of Object.entries(Mod)) {
		it(`export "${key}" is defined`, () => {
			expect(value).toBeDefined();
		});
	}

	it("AsyncDom is an object", () => {
		expect(typeof Mod.AsyncDom).toBe("object");
	});

	it("useAsyncDom is a function", () => {
		expect(typeof Mod.useAsyncDom).toBe("function");
	});
});
