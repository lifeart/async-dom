/**
 * Integration test verifying all exports from the Vite plugin entry point.
 */
import { describe, expect, it } from "vitest";
import * as Mod from "../../src/vite-plugin/index.ts";

describe("vite-plugin entry point exports", () => {
	const EXPECTED_EXPORTS = ["asyncDomPlugin", "default"];

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

	it("asyncDomPlugin is a function", () => {
		expect(typeof Mod.asyncDomPlugin).toBe("function");
	});

	it("default export equals named export", () => {
		expect(Mod.default).toBe(Mod.asyncDomPlugin);
	});
});
