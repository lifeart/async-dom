import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createAppId,
	createNodeId,
	type DomMutation,
	type NodeId,
} from "../../src/core/protocol.ts";
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
		scheduler.enqueue([{ action: "createNode", id: createNodeId(), tag: "div" }], A);
		expect(scheduler.pendingCount).toBe(1);
	});

	it("flush applies all pending mutations immediately", () => {
		scheduler.enqueue(
			[
				{ action: "createNode", id: createNodeId(), tag: "div" },
				{ action: "createNode", id: createNodeId(), tag: "span" },
			],
			A,
		);
		scheduler.flush();
		expect(applied).toHaveLength(2);
		expect(scheduler.pendingCount).toBe(0);
	});

	it("processes high priority before normal", () => {
		const normalId = createNodeId();
		const highId = createNodeId();
		scheduler.enqueue([{ action: "createNode", id: normalId, tag: "div" }], A, "normal");
		scheduler.enqueue([{ action: "createNode", id: highId, tag: "div" }], A, "high");
		scheduler.flush();
		expect(applied[0].action).toBe("createNode");
		expect((applied[0] as { id: NodeId }).id).toBe(highId);
	});

	it("processes non-optional before optional", () => {
		const optId = createNodeId();
		const reqId = createNodeId();
		scheduler.enqueue(
			[
				{
					action: "setStyle",
					id: optId,
					property: "color",
					value: "red",
					optional: true,
				},
			],
			A,
			"normal",
		);
		scheduler.enqueue(
			[{ action: "setAttribute", id: reqId, name: "class", value: "foo" }],
			A,
			"normal",
		);
		scheduler.flush();
		expect((applied[0] as { id: NodeId }).id).toBe(reqId);
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
		noApplierScheduler.enqueue([{ action: "createNode", id: createNodeId(), tag: "div" }], A);
		expect(() => noApplierScheduler.flush()).not.toThrow();
		expect(noApplierScheduler.pendingCount).toBe(1);
	});

	it("enqueue with 'low' priority processes after normal", () => {
		const lowId = createNodeId();
		const normalId = createNodeId();
		scheduler.enqueue([{ action: "createNode", id: lowId, tag: "div" }], A, "low");
		scheduler.enqueue([{ action: "createNode", id: normalId, tag: "div" }], A, "normal");
		scheduler.flush();
		expect((applied[0] as { id: NodeId }).id).toBe(normalId);
		expect((applied[1] as { id: NodeId }).id).toBe(lowId);
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

	it("processes large queue correctly without data loss", () => {
		const largeApplied: string[] = [];
		scheduler.setApplier((mutation) => {
			if ("id" in mutation) largeApplied.push(String((mutation as { id: unknown }).id));
		});

		const mutations = [];
		for (let i = 0; i < 500; i++) {
			mutations.push({ action: "createNode" as const, id: createNodeId(), tag: "div" });
		}
		scheduler.enqueue(mutations, A);
		scheduler.flush();

		expect(largeApplied).toHaveLength(500);
	});

	it("multiple enqueue/flush cycles preserve ordering", () => {
		const a1 = createNodeId();
		const a2 = createNodeId();
		scheduler.enqueue([{ action: "createNode", id: a1, tag: "div" }], A);
		scheduler.enqueue([{ action: "createNode", id: a2, tag: "div" }], A);
		scheduler.flush();

		const b1 = createNodeId();
		const b2 = createNodeId();
		scheduler.enqueue([{ action: "createNode", id: b1, tag: "div" }], A);
		scheduler.enqueue([{ action: "createNode", id: b2, tag: "div" }], A);
		scheduler.flush();

		expect(applied).toHaveLength(4);
		expect((applied[0] as { id: NodeId }).id).toBe(a1);
		expect((applied[1] as { id: NodeId }).id).toBe(a2);
		expect((applied[2] as { id: NodeId }).id).toBe(b1);
		expect((applied[3] as { id: NodeId }).id).toBe(b2);
	});

	it("getStats() returns droppedFrameCount", () => {
		const stats = scheduler.getStats();
		expect(stats).toHaveProperty("droppedFrameCount");
		expect(stats.droppedFrameCount).toBe(0);
	});

	it("getStats() returns workerToMainLatencyMs", () => {
		const stats = scheduler.getStats();
		expect(stats).toHaveProperty("workerToMainLatencyMs");
		expect(stats.workerToMainLatencyMs).toBe(0);
	});

	it("recordWorkerLatency() updates workerToMainLatencyMs in stats", () => {
		const sentAt = Date.now() - 10;
		scheduler.recordWorkerLatency(sentAt);
		const stats = scheduler.getStats();
		expect(stats.workerToMainLatencyMs).toBeGreaterThanOrEqual(10);
		expect(stats.workerToMainLatencyMs).toBeLessThan(100);
	});

	it("droppedFrameCount does NOT increment for empty frames (no mutations processed)", () => {
		// Simulate a tick with no mutations: just flush an empty queue
		// droppedFrameCount should remain 0
		scheduler.flush();
		const stats = scheduler.getStats();
		expect(stats.droppedFrameCount).toBe(0);
	});
});
