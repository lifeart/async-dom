/**
 * Integration test verifying all exports from the React entry point.
 */
import { describe, expect, it } from "vitest";
import * as Mod from "../../src/react/index.ts";

describe("react entry point exports", () => {
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

	it("AsyncDom is a function", () => {
		expect(typeof Mod.AsyncDom).toBe("function");
	});

	it("useAsyncDom is a function", () => {
		expect(typeof Mod.useAsyncDom).toBe("function");
	});
});
