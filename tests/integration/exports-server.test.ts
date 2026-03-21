/**
 * Integration test verifying all exports from the server entry point.
 */
import { describe, expect, it } from "vitest";
import * as Mod from "../../src/server/index.ts";

describe("server entry point exports", () => {
	const EXPECTED_EXPORTS = [
		"createServerApp",
		"createStreamingServer",
		"BroadcastTransport",
		"MutationLog",
		"WebSocketServerTransport",
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

	it("createServerApp is a function", () => {
		expect(typeof Mod.createServerApp).toBe("function");
	});

	it("createStreamingServer is a function", () => {
		expect(typeof Mod.createStreamingServer).toBe("function");
	});

	it("BroadcastTransport is a function", () => {
		expect(typeof Mod.BroadcastTransport).toBe("function");
	});

	it("MutationLog is a function", () => {
		expect(typeof Mod.MutationLog).toBe("function");
	});

	it("WebSocketServerTransport is a function", () => {
		expect(typeof Mod.WebSocketServerTransport).toBe("function");
	});
});
