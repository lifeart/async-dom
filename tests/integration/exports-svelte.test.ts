/**
 * Integration test verifying all exports from the Svelte entry point.
 */
import { describe, expect, it } from "vitest";
import * as Mod from "../../src/svelte/index.ts";

describe("svelte entry point exports", () => {
	const EXPECTED_EXPORTS = ["asyncDom"];

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

	it("asyncDom is a function", () => {
		expect(typeof Mod.asyncDom).toBe("function");
	});
});
