/**
 * Integration test verifying all exports from the transport entry point.
 */
import { describe, expect, it } from "vitest";
import * as Mod from "../../src/transport/index.ts";

describe("transport entry point exports", () => {
	const EXPECTED_EXPORTS = [
		"WorkerTransport",
		"WorkerSelfTransport",
		"BinaryWorkerTransport",
		"BinaryWorkerSelfTransport",
		"WebSocketTransport",
		"SharedWorkerTransport",
		"SharedWorkerSelfTransport",
		"WebSocketServerTransport",
		"createComlinkEndpoint",
		"encodeBinaryMessage",
		"decodeBinaryMessage",
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

	it("WorkerTransport is a function", () => {
		expect(typeof Mod.WorkerTransport).toBe("function");
	});

	it("WorkerSelfTransport is a function", () => {
		expect(typeof Mod.WorkerSelfTransport).toBe("function");
	});

	it("BinaryWorkerTransport is a function", () => {
		expect(typeof Mod.BinaryWorkerTransport).toBe("function");
	});

	it("BinaryWorkerSelfTransport is a function", () => {
		expect(typeof Mod.BinaryWorkerSelfTransport).toBe("function");
	});

	it("WebSocketTransport is a function", () => {
		expect(typeof Mod.WebSocketTransport).toBe("function");
	});

	it("SharedWorkerTransport is a function", () => {
		expect(typeof Mod.SharedWorkerTransport).toBe("function");
	});

	it("SharedWorkerSelfTransport is a function", () => {
		expect(typeof Mod.SharedWorkerSelfTransport).toBe("function");
	});

	it("WebSocketServerTransport is a function", () => {
		expect(typeof Mod.WebSocketServerTransport).toBe("function");
	});

	it("createComlinkEndpoint is a function", () => {
		expect(typeof Mod.createComlinkEndpoint).toBe("function");
	});

	it("encodeBinaryMessage is a function", () => {
		expect(typeof Mod.encodeBinaryMessage).toBe("function");
	});

	it("decodeBinaryMessage is a function", () => {
		expect(typeof Mod.decodeBinaryMessage).toBe("function");
	});
});
