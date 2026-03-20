import { describe, expect, it } from "vitest";
import { createAppId, createNodeId } from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";
import { ThreadManager } from "../../src/main-thread/thread-manager.ts";
import { MutationCollector } from "../../src/worker-thread/mutation-collector.ts";

describe("Error handling", () => {
	describe("MutationCollector", () => {
		it("flush with no transport silently drops mutations", () => {
			const collector = new MutationCollector(createAppId("test"));
			collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
			collector.flushSync();
			expect(collector.pendingCount).toBe(0);
		});
	});

	describe("DomRenderer", () => {
		it("insertBefore where parentId === newId is a no-op", () => {
			const renderer = new DomRenderer();
			const id = createNodeId();
			renderer.apply({ action: "insertBefore", id, newId: id, refId: null });
		});
	});

	describe("FrameScheduler", () => {
		it("flush with no applier keeps mutations pending", () => {
			const scheduler = new FrameScheduler();
			scheduler.enqueue(
				[{ action: "createNode", id: createNodeId(), tag: "div" }],
				createAppId("a"),
			);
			scheduler.flush();
			expect(scheduler.pendingCount).toBe(1);
		});

		it("enqueue with empty array adds nothing", () => {
			const scheduler = new FrameScheduler();
			scheduler.enqueue([], createAppId("a"));
			expect(scheduler.pendingCount).toBe(0);
		});
	});

	describe("ThreadManager", () => {
		it("destroyThread with unknown appId is a no-op", () => {
			const tm = new ThreadManager();
			tm.destroyThread(createAppId("unknown"));
		});

		it("destroyAll on empty manager is a no-op", () => {
			const tm = new ThreadManager();
			tm.destroyAll();
		});
	});
});
