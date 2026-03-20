import { describe, expect, it } from "vitest";
import type { MutationLogEntry } from "../../src/core/debug.ts";
import { createNodeId } from "../../src/core/protocol.ts";
import { exportSession, importSession } from "../../src/debug/session-export.ts";

function makeMinimalSessionData() {
	return {
		mutationLog: [] as MutationLogEntry[],
		warningLog: [],
		eventLog: [],
		syncReadLog: [],
		schedulerStats: {},
	};
}

function makeValidSessionJson(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		version: 1,
		exportedAt: new Date().toISOString(),
		mutationLog: [],
		warningLog: [],
		eventLog: [],
		syncReadLog: [],
		schedulerStats: {},
		...overrides,
	});
}

describe("exportSession", () => {
	it("produces valid JSON", () => {
		const json = exportSession(makeMinimalSessionData());
		const parsed = JSON.parse(json);

		expect(parsed.version).toBe(1);
		expect(parsed.exportedAt).toBeDefined();
		expect(Array.isArray(parsed.mutationLog)).toBe(true);
		expect(Array.isArray(parsed.warningLog)).toBe(true);
		expect(Array.isArray(parsed.eventLog)).toBe(true);
		expect(Array.isArray(parsed.syncReadLog)).toBe(true);
	});

	it("includes mutation data", () => {
		const entry: MutationLogEntry = {
			side: "main",
			action: "createNode",
			mutation: { action: "createNode", id: createNodeId(), tag: "div" },
			timestamp: Date.now(),
		};
		const json = exportSession({
			...makeMinimalSessionData(),
			mutationLog: [entry],
		});
		const parsed = JSON.parse(json);

		expect(parsed.mutationLog).toHaveLength(1);
		expect(parsed.mutationLog[0].action).toBe("createNode");
	});

	it("serializes Maps via replacer", () => {
		const data = makeMinimalSessionData();
		const mapData = new Map<string, number>([
			["a", 1],
			["b", 2],
		]);
		const json = exportSession({
			...data,
			schedulerStats: { timings: mapData } as unknown as Record<string, unknown>,
		});
		const parsed = JSON.parse(json);

		expect(parsed.schedulerStats.timings).toEqual({ a: 1, b: 2 });
	});
});

describe("importSession", () => {
	it("imports a valid session", () => {
		const json = makeValidSessionJson();
		const session = importSession(json);

		expect(session.version).toBe(1);
		expect(Array.isArray(session.mutationLog)).toBe(true);
	});

	it("validates version", () => {
		const json = makeValidSessionJson({ version: 99 });
		expect(() => importSession(json)).toThrow("Unsupported session version: 99");
	});

	it("rejects non-object input (null)", () => {
		expect(() => importSession("null")).toThrow("Invalid session: not an object");
	});

	it("rejects non-object input (string)", () => {
		expect(() => importSession('"hello"')).toThrow("Invalid session: not an object");
	});

	it("rejects non-object input (number)", () => {
		expect(() => importSession("42")).toThrow("Invalid session: not an object");
	});

	it("rejects missing mutationLog", () => {
		const json = JSON.stringify({
			version: 1,
			warningLog: [],
			eventLog: [],
			syncReadLog: [],
		});
		expect(() => importSession(json)).toThrow("mutationLog must be an array");
	});

	it("rejects missing warningLog", () => {
		const json = JSON.stringify({
			version: 1,
			mutationLog: [],
			eventLog: [],
			syncReadLog: [],
		});
		expect(() => importSession(json)).toThrow("warningLog must be an array");
	});

	it("rejects missing eventLog", () => {
		const json = JSON.stringify({
			version: 1,
			mutationLog: [],
			warningLog: [],
			syncReadLog: [],
		});
		expect(() => importSession(json)).toThrow("eventLog must be an array");
	});

	it("rejects missing syncReadLog", () => {
		const json = JSON.stringify({
			version: 1,
			mutationLog: [],
			warningLog: [],
			eventLog: [],
		});
		expect(() => importSession(json)).toThrow("syncReadLog must be an array");
	});

	it("caps large mutationLog arrays", () => {
		const largeMutationLog = Array.from({ length: 15000 }, (_, i) => ({
			side: "main",
			action: "createNode",
			mutation: { action: "createNode", id: i, tag: "div" },
			timestamp: i,
		}));
		const json = makeValidSessionJson({ mutationLog: largeMutationLog });
		const session = importSession(json);

		expect(session.mutationLog).toHaveLength(10000);
		// Should keep the last 10000 entries
		expect(session.mutationLog[0].timestamp).toBe(5000);
	});

	it("caps large warningLog arrays", () => {
		const largeWarnings = Array.from({ length: 12000 }, (_, i) => ({
			code: "TEST",
			message: `warn ${i}`,
			timestamp: i,
		}));
		const json = makeValidSessionJson({ warningLog: largeWarnings });
		const session = importSession(json);

		expect(session.warningLog).toHaveLength(10000);
	});

	it("does not modify arrays within the limit", () => {
		const json = makeValidSessionJson({
			mutationLog: [{ side: "main", action: "createNode", mutation: {}, timestamp: 1 }],
		});
		const session = importSession(json);

		expect(session.mutationLog).toHaveLength(1);
	});

	it("rejects invalid JSON", () => {
		expect(() => importSession("not valid json")).toThrow();
	});
});
