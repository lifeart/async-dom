import { describe, expect, it } from "vitest";
import {
	buildCausalityGraph,
	CausalityTracker,
	type CausalBatch,
	type CausalEvent,
} from "../../src/debug/causality-graph.ts";

describe("CausalityTracker", () => {
	it("recordBatch stores batches", () => {
		const tracker = new CausalityTracker();
		const event: CausalEvent = {
			eventType: "click",
			listenerId: "btn_click_1",
			timestamp: 1000,
		};

		tracker.recordBatch(1, [10, 20, 30], 5, event);
		tracker.recordBatch(2, [40], 2, null);

		const batches = tracker.getBatches();
		expect(batches).toHaveLength(2);
		expect(batches[0].batchUid).toBe(1);
		expect(batches[0].causalEvent).toEqual(event);
		expect(batches[0].nodeIds).toEqual(new Set([10, 20, 30]));
		expect(batches[0].mutationCount).toBe(5);
		expect(batches[1].batchUid).toBe(2);
		expect(batches[1].causalEvent).toBeNull();
	});

	it("getBatches returns a copy", () => {
		const tracker = new CausalityTracker();
		tracker.recordBatch(1, [10], 1, null);
		const batches1 = tracker.getBatches();
		tracker.recordBatch(2, [20], 1, null);
		expect(batches1).toHaveLength(1);
		expect(tracker.getBatches()).toHaveLength(2);
	});

	it("evicts oldest batch when exceeding maxBatches", () => {
		const tracker = new CausalityTracker();
		for (let i = 0; i < 110; i++) {
			tracker.recordBatch(i, [i], 1, null);
		}
		const batches = tracker.getBatches();
		// Default maxBatches is 100, after 110 inserts the first 10 should be evicted
		expect(batches).toHaveLength(100);
		expect(batches[0].batchUid).toBe(10);
		expect(batches[99].batchUid).toBe(109);
	});

	it("buildGraph returns correct DAG structure", () => {
		const tracker = new CausalityTracker();
		const event: CausalEvent = {
			eventType: "click",
			listenerId: "btn_1",
			timestamp: 1000,
		};

		tracker.recordBatch(1, [10, 20], 3, event);
		tracker.recordBatch(2, [30], 1, event);
		tracker.recordBatch(3, [40], 2, null);

		const graph = tracker.buildGraph();

		// Should have one event root and one orphan batch root
		expect(graph.roots).toHaveLength(2);

		// The event root should have 2 batch children
		const eventRoot = graph.nodes.get(graph.roots[0]);
		expect(eventRoot).toBeDefined();
		expect(eventRoot!.type).toBe("event");
		expect(eventRoot!.children).toHaveLength(2);

		// Batch 1 should have 2 node children
		const batch1Key = eventRoot!.children[0];
		const batch1 = graph.nodes.get(batch1Key);
		expect(batch1).toBeDefined();
		expect(batch1!.type).toBe("batch");
		expect(batch1!.children).toHaveLength(2);
		expect(batch1!.children).toContain("node:10");
		expect(batch1!.children).toContain("node:20");

		// Batch 2 should have 1 node child
		const batch2Key = eventRoot!.children[1];
		const batch2 = graph.nodes.get(batch2Key);
		expect(batch2!.children).toHaveLength(1);
		expect(batch2!.children).toContain("node:30");

		// Orphan batch (no event)
		const orphanKey = graph.roots[1];
		const orphan = graph.nodes.get(orphanKey);
		expect(orphan).toBeDefined();
		expect(orphan!.type).toBe("batch");
		expect(orphan!.children).toContain("node:40");
	});

	it("findBatchesForNode returns batches that affected a given nodeId", () => {
		const tracker = new CausalityTracker();
		tracker.recordBatch(1, [10, 20], 2, null);
		tracker.recordBatch(2, [20, 30], 3, null);
		tracker.recordBatch(3, [40], 1, null);

		const batchesFor20 = tracker.findBatchesForNode(20);
		expect(batchesFor20).toHaveLength(2);
		expect(batchesFor20[0].batchUid).toBe(1);
		expect(batchesFor20[1].batchUid).toBe(2);

		const batchesFor99 = tracker.findBatchesForNode(99);
		expect(batchesFor99).toHaveLength(0);
	});

	it("clear removes all records", () => {
		const tracker = new CausalityTracker();
		tracker.recordBatch(1, [10], 1, null);
		tracker.clear();
		expect(tracker.getBatches()).toHaveLength(0);
	});
});

describe("buildCausalityGraph", () => {
	it("returns empty graph for empty batches", () => {
		const graph = buildCausalityGraph([]);
		expect(graph.nodes.size).toBe(0);
		expect(graph.roots).toHaveLength(0);
	});

	it("deduplicates node entries across batches", () => {
		const event: CausalEvent = {
			eventType: "input",
			listenerId: "input_1",
			timestamp: 2000,
		};

		const batches: CausalBatch[] = [
			{ batchUid: 1, causalEvent: event, nodeIds: new Set([10, 20]), mutationCount: 2, timestamp: 2000 },
			{ batchUid: 2, causalEvent: event, nodeIds: new Set([20, 30]), mutationCount: 3, timestamp: 2001 },
		];

		const graph = buildCausalityGraph(batches);

		// Node 20 should appear only once in the graph's node map
		const node20 = graph.nodes.get("node:20");
		expect(node20).toBeDefined();
		expect(node20!.type).toBe("node");

		// But both batches reference it
		const eventKey = graph.roots[0];
		const eventNode = graph.nodes.get(eventKey)!;
		const batch1 = graph.nodes.get(eventNode.children[0])!;
		const batch2 = graph.nodes.get(eventNode.children[1])!;
		expect(batch1.children).toContain("node:20");
		expect(batch2.children).toContain("node:20");
	});
});
