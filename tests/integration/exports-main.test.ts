/**
 * Integration test verifying all exports from the main entry point (src/index.ts).
 */
import { describe, expect, it } from "vitest";
import * as Mod from "../../src/index.ts";

describe("main entry point exports", () => {
	// Guard: ensures no exports are silently removed.
	// If an export is intentionally removed, update this list.
	const EXPECTED_EXPORTS = [
		"createAsyncDom",
		"DomRenderer",
		"FrameScheduler",
		"EventBridge",
		"ThreadManager",
		"DebugStats",
		"sanitizeHTML",
		"WarningCode",
		"BODY_NODE_ID",
		"DOCUMENT_NODE_ID",
		"HEAD_NODE_ID",
		"HTML_NODE_ID",
		"createAppId",
		"createClientId",
		"createNodeId",
		"WorkerTransport",
		"WorkerSelfTransport",
		"BinaryWorkerTransport",
		"BinaryWorkerSelfTransport",
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

	it("createAsyncDom is a function", () => {
		expect(typeof Mod.createAsyncDom).toBe("function");
	});

	it("DomRenderer is a function", () => {
		expect(typeof Mod.DomRenderer).toBe("function");
	});

	it("FrameScheduler is a function", () => {
		expect(typeof Mod.FrameScheduler).toBe("function");
	});

	it("EventBridge is a function", () => {
		expect(typeof Mod.EventBridge).toBe("function");
	});

	it("ThreadManager is a function", () => {
		expect(typeof Mod.ThreadManager).toBe("function");
	});

	it("DebugStats is a function", () => {
		expect(typeof Mod.DebugStats).toBe("function");
	});

	it("sanitizeHTML is a function", () => {
		expect(typeof Mod.sanitizeHTML).toBe("function");
	});

	it("WarningCode is an object", () => {
		expect(typeof Mod.WarningCode).toBe("object");
	});

	it("BODY_NODE_ID is a number", () => {
		expect(typeof Mod.BODY_NODE_ID).toBe("number");
	});

	it("DOCUMENT_NODE_ID is a number", () => {
		expect(typeof Mod.DOCUMENT_NODE_ID).toBe("number");
	});

	it("HEAD_NODE_ID is a number", () => {
		expect(typeof Mod.HEAD_NODE_ID).toBe("number");
	});

	it("HTML_NODE_ID is a number", () => {
		expect(typeof Mod.HTML_NODE_ID).toBe("number");
	});

	it("createAppId is a function", () => {
		expect(typeof Mod.createAppId).toBe("function");
	});

	it("createClientId is a function", () => {
		expect(typeof Mod.createClientId).toBe("function");
	});

	it("createNodeId is a function", () => {
		expect(typeof Mod.createNodeId).toBe("function");
	});

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

	it("encodeBinaryMessage is a function", () => {
		expect(typeof Mod.encodeBinaryMessage).toBe("function");
	});

	it("decodeBinaryMessage is a function", () => {
		expect(typeof Mod.decodeBinaryMessage).toBe("function");
	});
});
