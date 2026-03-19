import { describe, expect, it } from "vitest";
import {
	VirtualMutationObserver,
	VirtualResizeObserver,
	VirtualIntersectionObserver,
} from "../../src/worker-thread/observers.ts";

describe("VirtualMutationObserver", () => {
	it("can be constructed with a callback", () => {
		const observer = new VirtualMutationObserver(() => {});
		expect(observer).toBeDefined();
	});

	it("observe does not throw", () => {
		const observer = new VirtualMutationObserver(() => {});
		expect(() => observer.observe({})).not.toThrow();
	});

	it("disconnect does not throw", () => {
		const observer = new VirtualMutationObserver(() => {});
		expect(() => observer.disconnect()).not.toThrow();
	});

	it("takeRecords returns empty array", () => {
		const observer = new VirtualMutationObserver(() => {});
		expect(observer.takeRecords()).toEqual([]);
	});
});

describe("VirtualResizeObserver", () => {
	it("can be constructed with a callback", () => {
		const observer = new VirtualResizeObserver(() => {});
		expect(observer).toBeDefined();
	});

	it("observe does not throw", () => {
		const observer = new VirtualResizeObserver(() => {});
		expect(() => observer.observe({})).not.toThrow();
	});

	it("unobserve does not throw", () => {
		const observer = new VirtualResizeObserver(() => {});
		expect(() => observer.unobserve({})).not.toThrow();
	});

	it("disconnect does not throw", () => {
		const observer = new VirtualResizeObserver(() => {});
		expect(() => observer.disconnect()).not.toThrow();
	});
});

describe("VirtualIntersectionObserver", () => {
	it("can be constructed with a callback", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		expect(observer).toBeDefined();
	});

	it("has default properties", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		expect(observer.root).toBeNull();
		expect(observer.rootMargin).toBe("0px");
		expect(observer.thresholds).toEqual([0]);
	});

	it("observe does not throw", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		expect(() => observer.observe({})).not.toThrow();
	});

	it("unobserve does not throw", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		expect(() => observer.unobserve({})).not.toThrow();
	});

	it("disconnect does not throw", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		expect(() => observer.disconnect()).not.toThrow();
	});

	it("takeRecords returns empty array", () => {
		const observer = new VirtualIntersectionObserver(() => {});
		expect(observer.takeRecords()).toEqual([]);
	});
});
