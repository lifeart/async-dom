import { describe, expect, it } from "vitest";
import { MutationEventCorrelation, type MutationLogEntry } from "../../src/core/debug.ts";
import { createNodeId } from "../../src/core/protocol.ts";

describe("MutationEventCorrelation", () => {
	it("indexMutation and getWhyUpdated work together", () => {
		const correlation = new MutationEventCorrelation();
		const nodeId = createNodeId();

		const entry: MutationLogEntry = {
			side: "main",
			action: "setAttribute",
			mutation: { action: "setAttribute", id: nodeId, name: "class", value: "active" },
			timestamp: 1000,
			batchUid: 42,
		};

		// Register a causal event for this batch
		correlation.registerBatchEvent(42, {
			eventType: "click",
			listenerId: "btn_1",
			timestamp: 999,
		});

		correlation.indexMutation(entry);

		const result = correlation.getWhyUpdated(nodeId as number);
		expect(result).toHaveLength(1);
		expect(result[0].batchUid).toBe(42);
		expect(result[0].action).toBe("setAttribute");
		expect(result[0].causalEvent).toEqual({
			eventType: "click",
			listenerId: "btn_1",
			timestamp: 999,
		});
	});

	it("registerBatchEvent records the mapping", () => {
		const correlation = new MutationEventCorrelation();
		const nodeId = createNodeId();

		// Register two different batch events
		correlation.registerBatchEvent(10, {
			eventType: "click",
			listenerId: "btn_click",
			timestamp: 100,
		});
		correlation.registerBatchEvent(20, {
			eventType: "input",
			listenerId: "input_1",
			timestamp: 200,
		});

		// Index mutations for both batches
		correlation.indexMutation({
			side: "main",
			action: "setTextContent",
			mutation: { action: "setTextContent", id: nodeId, textContent: "hello" },
			timestamp: 101,
			batchUid: 10,
		});
		correlation.indexMutation({
			side: "main",
			action: "setAttribute",
			mutation: { action: "setAttribute", id: nodeId, name: "value", value: "x" },
			timestamp: 201,
			batchUid: 20,
		});

		const result = correlation.getWhyUpdated(nodeId as number);
		expect(result).toHaveLength(2);
		expect(result[0].causalEvent?.eventType).toBe("click");
		expect(result[1].causalEvent?.eventType).toBe("input");
	});

	it("returns empty array for unknown nodeId", () => {
		const correlation = new MutationEventCorrelation();
		expect(correlation.getWhyUpdated(99999)).toEqual([]);
	});

	it("returns null causalEvent when batch has no registered event", () => {
		const correlation = new MutationEventCorrelation();
		const nodeId = createNodeId();

		correlation.indexMutation({
			side: "main",
			action: "createNode",
			mutation: { action: "createNode", id: nodeId, tag: "div" },
			timestamp: 500,
			batchUid: 77,
		});

		const result = correlation.getWhyUpdated(nodeId as number);
		expect(result).toHaveLength(1);
		expect(result[0].causalEvent).toBeNull();
	});

	it("skips mutations without an id field", () => {
		const correlation = new MutationEventCorrelation();

		correlation.indexMutation({
			side: "main",
			action: "scrollTo",
			mutation: { action: "scrollTo", x: 0, y: 100 },
			timestamp: 300,
		});

		// No nodeId means nothing should be indexed
		// We can't look it up, but no error should be thrown
		expect(correlation.getWhyUpdated(0)).toEqual([]);
	});

	it("limits entries per node to maxEntriesPerNode", () => {
		const correlation = new MutationEventCorrelation();
		const nodeId = createNodeId();

		// Default maxEntriesPerNode is 20
		for (let i = 0; i < 25; i++) {
			correlation.indexMutation({
				side: "main",
				action: "setAttribute",
				mutation: { action: "setAttribute", id: nodeId, name: "x", value: String(i) },
				timestamp: i,
				batchUid: i,
			});
		}

		const result = correlation.getWhyUpdated(nodeId as number);
		expect(result).toHaveLength(20);
		// The oldest entries (0-4) should have been evicted
		expect(result[0].timestamp).toBe(5);
	});

	it("clear removes all data", () => {
		const correlation = new MutationEventCorrelation();
		const nodeId = createNodeId();

		correlation.registerBatchEvent(1, {
			eventType: "click",
			listenerId: "l1",
			timestamp: 100,
		});
		correlation.indexMutation({
			side: "main",
			action: "createNode",
			mutation: { action: "createNode", id: nodeId, tag: "div" },
			timestamp: 100,
			batchUid: 1,
		});

		correlation.clear();

		expect(correlation.getWhyUpdated(nodeId as number)).toEqual([]);
	});
});
