import { describe, expect, it } from "vitest";
import { createAppId, createNodeId } from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";
import { ThreadManager } from "../../src/main-thread/thread-manager.ts";
import { MutationCollector } from "../../src/worker-thread/mutation-collector.ts";

describe("Error handling", () => {
	describe("MutationCollector", () => {
		it("flush with no transport doesn't throw", () => {
			const collector = new MutationCollector(createAppId("test"));
			collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
			expect(() => collector.flushSync()).not.toThrow();
		});

		it("flush with empty queue is a no-op", () => {
			const collector = new MutationCollector(createAppId("test"));
			expect(() => collector.flushSync()).not.toThrow();
			expect(collector.pendingCount).toBe(0);
		});
	});

	describe("DomRenderer", () => {
		it("createNode with unknown id doesn't throw", () => {
			const renderer = new DomRenderer();
			expect(() =>
				renderer.apply({ action: "createNode", id: createNodeId(), tag: "div" }),
			).not.toThrow();
		});

		it("appendChild with missing child is a no-op", () => {
			const renderer = new DomRenderer();
			expect(() =>
				renderer.apply({
					action: "appendChild",
					id: createNodeId(),
					childId: createNodeId(),
				}),
			).not.toThrow();
		});

		it("removeNode on non-existent node doesn't throw", () => {
			const renderer = new DomRenderer();
			expect(() => renderer.apply({ action: "removeNode", id: createNodeId() })).not.toThrow();
		});

		it("setAttribute on missing node doesn't throw", () => {
			const renderer = new DomRenderer();
			expect(() =>
				renderer.apply({
					action: "setAttribute",
					id: createNodeId(),
					name: "class",
					value: "foo",
				}),
			).not.toThrow();
		});

		it("setStyle on missing node doesn't throw", () => {
			const renderer = new DomRenderer();
			expect(() =>
				renderer.apply({
					action: "setStyle",
					id: createNodeId(),
					property: "color",
					value: "red",
				}),
			).not.toThrow();
		});

		it("setTextContent on missing node doesn't throw", () => {
			const renderer = new DomRenderer();
			expect(() =>
				renderer.apply({
					action: "setTextContent",
					id: createNodeId(),
					textContent: "hello",
				}),
			).not.toThrow();
		});

		it("insertBefore where parentId === newId is a no-op", () => {
			const renderer = new DomRenderer();
			const id = createNodeId();
			expect(() =>
				renderer.apply({ action: "insertBefore", id, newId: id, refId: null }),
			).not.toThrow();
		});
	});

	describe("FrameScheduler", () => {
		it("flush with no applier is a no-op", () => {
			const scheduler = new FrameScheduler();
			scheduler.enqueue(
				[{ action: "createNode", id: createNodeId(), tag: "div" }],
				createAppId("a"),
			);
			expect(() => scheduler.flush()).not.toThrow();
			expect(scheduler.pendingCount).toBe(1);
		});

		it("enqueue with empty array adds nothing", () => {
			const scheduler = new FrameScheduler();
			scheduler.enqueue([], createAppId("a"));
			expect(scheduler.pendingCount).toBe(0);
		});
	});

	describe("ThreadManager", () => {
		it("sendToThread with unknown appId is a no-op", () => {
			const tm = new ThreadManager();
			expect(() =>
				tm.sendToThread(createAppId("unknown"), {
					type: "mutation",
					appId: createAppId("unknown"),
					uid: 1,
					mutations: [],
				}),
			).not.toThrow();
		});

		it("destroyThread with unknown appId is a no-op", () => {
			const tm = new ThreadManager();
			expect(() => tm.destroyThread(createAppId("unknown"))).not.toThrow();
		});

		it("destroyAll on empty manager doesn't throw", () => {
			const tm = new ThreadManager();
			expect(() => tm.destroyAll()).not.toThrow();
		});
	});
});
