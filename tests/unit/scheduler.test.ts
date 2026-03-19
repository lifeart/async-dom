import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppId, createNodeId, type DomMutation } from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";

const A = createAppId("test");

describe("FrameScheduler", () => {
	let scheduler: FrameScheduler;
	const applied: DomMutation[] = [];

	beforeEach(() => {
		applied.length = 0;
		scheduler = new FrameScheduler({
			frameBudgetMs: 16,
			enablePrioritySkipping: true,
			enableViewportCulling: false,
		});
		scheduler.setApplier((m, _appId) => applied.push(m));
	});

	it("enqueues mutations", () => {
		scheduler.enqueue([{ action: "createNode", id: createNodeId("n1"), tag: "div" }], A);
		expect(scheduler.pendingCount).toBe(1);
	});

	it("flush applies all pending mutations immediately", () => {
		scheduler.enqueue(
			[
				{ action: "createNode", id: createNodeId("n1"), tag: "div" },
				{ action: "createNode", id: createNodeId("n2"), tag: "span" },
			],
			A,
		);
		scheduler.flush();
		expect(applied).toHaveLength(2);
		expect(scheduler.pendingCount).toBe(0);
	});

	it("processes high priority before normal", () => {
		scheduler.enqueue(
			[{ action: "createNode", id: createNodeId("normal"), tag: "div" }],
			A,
			"normal",
		);
		scheduler.enqueue([{ action: "createNode", id: createNodeId("high"), tag: "div" }], A, "high");
		scheduler.flush();
		expect(applied[0].action).toBe("createNode");
		expect((applied[0] as { id: string }).id).toBe("high");
	});

	it("processes non-optional before optional", () => {
		scheduler.enqueue(
			[
				{
					action: "setStyle",
					id: createNodeId("opt"),
					property: "color",
					value: "red",
					optional: true,
				},
			],
			A,
			"normal",
		);
		scheduler.enqueue(
			[{ action: "setAttribute", id: createNodeId("req"), name: "class", value: "foo" }],
			A,
			"normal",
		);
		scheduler.flush();
		expect((applied[0] as { id: string }).id).toBe("req");
	});

	it("start and stop control the RAF loop", () => {
		const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
		const cafSpy = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

		scheduler.start();
		expect(rafSpy).toHaveBeenCalled();

		scheduler.stop();
		expect(cafSpy).toHaveBeenCalled();

		rafSpy.mockRestore();
		cafSpy.mockRestore();
	});

	it("flush() with no applier set returns silently", () => {
		const noApplierScheduler = new FrameScheduler({
			frameBudgetMs: 16,
			enablePrioritySkipping: true,
			enableViewportCulling: false,
		});
		noApplierScheduler.enqueue([{ action: "createNode", id: createNodeId("n1"), tag: "div" }], A);
		expect(() => noApplierScheduler.flush()).not.toThrow();
		expect(noApplierScheduler.pendingCount).toBe(1);
	});

	it("enqueue with 'low' priority processes after normal", () => {
		scheduler.enqueue([{ action: "createNode", id: createNodeId("low"), tag: "div" }], A, "low");
		scheduler.enqueue(
			[{ action: "createNode", id: createNodeId("normal"), tag: "div" }],
			A,
			"normal",
		);
		scheduler.flush();
		expect((applied[0] as { id: string }).id).toBe("normal");
		expect((applied[1] as { id: string }).id).toBe("low");
	});

	it("start() when already running is a no-op", () => {
		const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);

		scheduler.start();
		const callCount = rafSpy.mock.calls.length;
		scheduler.start();
		expect(rafSpy.mock.calls.length).toBe(callCount);

		scheduler.stop();
		rafSpy.mockRestore();
	});

	it("multiple enqueue/flush cycles preserve ordering", () => {
		scheduler.enqueue([{ action: "createNode", id: createNodeId("a1"), tag: "div" }], A);
		scheduler.enqueue([{ action: "createNode", id: createNodeId("a2"), tag: "div" }], A);
		scheduler.flush();

		scheduler.enqueue([{ action: "createNode", id: createNodeId("b1"), tag: "div" }], A);
		scheduler.enqueue([{ action: "createNode", id: createNodeId("b2"), tag: "div" }], A);
		scheduler.flush();

		expect(applied).toHaveLength(4);
		expect((applied[0] as { id: string }).id).toBe("a1");
		expect((applied[1] as { id: string }).id).toBe("a2");
		expect((applied[2] as { id: string }).id).toBe("b1");
		expect((applied[3] as { id: string }).id).toBe("b2");
	});
});
