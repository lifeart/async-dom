import { describe, expect, it } from "vitest";
import {
	computePercentiles,
	latencyColorClass,
	percentile,
	syncReadColorClass,
} from "../../src/debug/stats-helpers.ts";

describe("percentile", () => {
	it("returns 0 for empty array", () => {
		expect(percentile([], 50)).toBe(0);
	});

	it("returns the single value for a 1-element array", () => {
		expect(percentile([42], 50)).toBe(42);
		expect(percentile([42], 99)).toBe(42);
	});

	it("computes P50 of a sorted array", () => {
		const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		expect(percentile(sorted, 50)).toBe(5);
	});

	it("computes P95 of a sorted array", () => {
		const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
		expect(percentile(sorted, 95)).toBe(95);
	});

	it("computes P99 of a sorted array", () => {
		const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
		expect(percentile(sorted, 99)).toBe(99);
	});
});

describe("computePercentiles", () => {
	it("returns zeros for empty data", () => {
		expect(computePercentiles([])).toEqual({ p50: 0, p95: 0, p99: 0 });
	});

	it("computes percentiles from unsorted data", () => {
		const data = [10, 1, 5, 3, 8, 2, 7, 4, 9, 6];
		const result = computePercentiles(data);
		expect(result.p50).toBe(5);
		expect(result.p95).toBeLessThanOrEqual(10);
		expect(result.p99).toBeLessThanOrEqual(10);
	});

	it("does not mutate the input array", () => {
		const data = [5, 3, 1, 4, 2];
		const copy = [...data];
		computePercentiles(data);
		expect(data).toEqual(copy);
	});

	it("handles single-element data", () => {
		const result = computePercentiles([42]);
		expect(result.p50).toBe(42);
		expect(result.p95).toBe(42);
		expect(result.p99).toBe(42);
	});
});

describe("latencyColorClass", () => {
	it("returns green for ms <= 5", () => {
		expect(latencyColorClass(0)).toBe("green");
		expect(latencyColorClass(3)).toBe("green");
		expect(latencyColorClass(5)).toBe("green");
	});

	it("returns yellow for 5 < ms <= 16", () => {
		expect(latencyColorClass(6)).toBe("yellow");
		expect(latencyColorClass(10)).toBe("yellow");
		expect(latencyColorClass(16)).toBe("yellow");
	});

	it("returns red for ms > 16", () => {
		expect(latencyColorClass(17)).toBe("red");
		expect(latencyColorClass(100)).toBe("red");
	});
});

describe("syncReadColorClass", () => {
	it("returns green for ms <= 5", () => {
		expect(syncReadColorClass(0)).toBe("green");
		expect(syncReadColorClass(3)).toBe("green");
		expect(syncReadColorClass(5)).toBe("green");
	});

	it("returns yellow for 5 < ms <= 50", () => {
		expect(syncReadColorClass(6)).toBe("yellow");
		expect(syncReadColorClass(25)).toBe("yellow");
		expect(syncReadColorClass(50)).toBe("yellow");
	});

	it("returns red for ms > 50", () => {
		expect(syncReadColorClass(51)).toBe("red");
		expect(syncReadColorClass(200)).toBe("red");
	});
});
