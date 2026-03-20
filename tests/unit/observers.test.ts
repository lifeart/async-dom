import { describe, expect, it } from "vitest";
import {
	VirtualIntersectionObserver,
	VirtualMutationObserver,
	VirtualResizeObserver,
} from "../../src/worker-thread/observers.ts";

describe("VirtualMutationObserver", () => {
	it("takeRecords returns empty array", () => {
		const observer = new VirtualMutationObserver(() => {});
		expect(observer.takeRecords()).toEqual([]);
	});

	it("observe and disconnect are callable", () => {
		const observer = new VirtualMutationObserver(() => {});
		observer.observe({});
		observer.disconnect();
	});
});

describe("VirtualResizeObserver", () => {
	it("observe, unobserve, and disconnect are callable", () => {
		const observer = new VirtualResizeObserver(() => {});
		observer.observe({});
		observer.unobserve({});
		observer.disconnect();
	});
});

describe("VirtualIntersectionObserver", () => {
	it("has correct default properties", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		expect(observer.root).toBeNull();
		expect(observer.rootMargin).toBe("0px");
		expect(observer.thresholds).toEqual([0]);
	});

	it("takeRecords returns empty array", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		expect(observer.takeRecords()).toEqual([]);
	});

	it("observe, unobserve, and disconnect are callable", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		observer.observe({});
		observer.unobserve({});
		observer.disconnect();
	});
});
