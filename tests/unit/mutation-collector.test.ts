import { describe, expect, it } from "vitest";
import { createAppId, createNodeId, type Message } from "../../src/core/protocol.ts";
import type { Transport } from "../../src/transport/base.ts";
import { MutationCollector } from "../../src/worker-thread/mutation-collector.ts";

function createMockTransport(): Transport & { sent: Message[] } {
	const sent: Message[] = [];
	return {
		sent,
		send(msg: Message) {
			sent.push(msg);
		},
		onMessage() {},
		close() {},
		get readyState() {
			return "open" as const;
		},
	};
}

describe("MutationCollector", () => {
	it("batches mutations and flushes on microtask", async () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
		collector.add({ action: "createNode", id: createNodeId(), tag: "span" });

		expect(collector.pendingCount).toBe(2);
		expect(transport.sent).toHaveLength(0);

		// Wait for microtask
		await Promise.resolve();

		expect(transport.sent).toHaveLength(1);
		const msg = transport.sent[0];
		expect(msg.type).toBe("mutation");
		if (msg.type === "mutation") {
			expect(msg.mutations).toHaveLength(2);
		}
	});

	it("flushSync sends immediately", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
		collector.flushSync();

		expect(transport.sent).toHaveLength(1);
		expect(collector.pendingCount).toBe(0);
	});

	it("does not send if no mutations pending", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		collector.flushSync();
		expect(transport.sent).toHaveLength(0);
	});

	it("sequential microtask batches get incrementing uid", async () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
		await Promise.resolve();

		collector.add({ action: "createNode", id: createNodeId(), tag: "span" });
		await Promise.resolve();

		expect(transport.sent).toHaveLength(2);
		const uid1 = (transport.sent[0] as { uid: number }).uid;
		const uid2 = (transport.sent[1] as { uid: number }).uid;
		expect(uid2).toBeGreaterThan(uid1);
	});

	it("flushSync() followed by microtask is a no-op (empty queue)", async () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
		collector.flushSync();

		// The microtask scheduled by add() should find an empty queue
		await Promise.resolve();

		// Only one message was sent (from flushSync), not two
		expect(transport.sent).toHaveLength(1);
	});

	it("pendingCount is 0 after flush", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
		collector.add({ action: "createNode", id: createNodeId(), tag: "span" });
		expect(collector.pendingCount).toBe(2);

		collector.flushSync();
		expect(collector.pendingCount).toBe(0);
	});
});

describe("MutationCollector coalescing", () => {
	it("deduplicates repeated setStyle on same (id, property)", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		const id = createNodeId();
		collector.add({ action: "setStyle", id, property: "color", value: "red" });
		collector.add({ action: "setStyle", id, property: "color", value: "blue" });
		collector.add({ action: "setStyle", id, property: "color", value: "green" });
		collector.flushSync();

		const mutations = (transport.sent[0] as { mutations: unknown[] }).mutations;
		expect(mutations).toHaveLength(1);
		expect((mutations[0] as { value: string }).value).toBe("green");
	});

	it("deduplicates repeated setAttribute on same (id, name)", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		const id = createNodeId();
		collector.add({ action: "setAttribute", id, name: "class", value: "a" });
		collector.add({ action: "setAttribute", id, name: "class", value: "b" });
		collector.flushSync();

		const mutations = (transport.sent[0] as { mutations: unknown[] }).mutations;
		expect(mutations).toHaveLength(1);
		expect((mutations[0] as { value: string }).value).toBe("b");
	});

	it("preserves order of non-deduplicated mutations", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		const id1 = createNodeId();
		const id2 = createNodeId();
		collector.add({ action: "createNode", id: id1, tag: "div" });
		collector.add({ action: "setStyle", id: id1, property: "color", value: "red" });
		collector.add({ action: "createNode", id: id2, tag: "span" });
		collector.add({ action: "setStyle", id: id1, property: "color", value: "blue" });
		collector.flushSync();

		const mutations = (transport.sent[0] as { mutations: { action: string }[] }).mutations;
		expect(mutations).toHaveLength(3);
		expect(mutations[0].action).toBe("createNode");
		expect(mutations[1].action).toBe("createNode");
		expect(mutations[2].action).toBe("setStyle");
	});

	it("eliminates createNode + removeNode pair when node was never attached", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		const id = createNodeId();
		collector.add({ action: "createNode", id, tag: "div" });
		collector.add({ action: "setAttribute", id, name: "class", value: "foo" });
		collector.add({ action: "removeNode", id });
		collector.flushSync();

		// All three should be eliminated (create + orphan setAttribute + remove)
		expect(transport.sent).toHaveLength(0);
	});

	it("keeps createNode + removeNode when node was attached in between", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		const parentId = createNodeId();
		const childId = createNodeId();
		collector.add({ action: "createNode", id: childId, tag: "div" });
		collector.add({ action: "appendChild", id: parentId, childId });
		collector.add({ action: "removeNode", id: childId });
		collector.flushSync();

		const mutations = (transport.sent[0] as { mutations: unknown[] }).mutations;
		expect(mutations).toHaveLength(3);
	});

	it("does not deduplicate structural mutations", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		const parentId = createNodeId();
		const childId = createNodeId();
		collector.add({ action: "appendChild", id: parentId, childId });
		collector.add({ action: "removeChild", id: parentId, childId });
		collector.add({ action: "appendChild", id: parentId, childId });
		collector.flushSync();

		const mutations = (transport.sent[0] as { mutations: unknown[] }).mutations;
		expect(mutations).toHaveLength(3);
	});

	it("enableCoalescing(false) disables deduplication", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);
		collector.enableCoalescing(false);

		const id = createNodeId();
		collector.add({ action: "setStyle", id, property: "color", value: "red" });
		collector.add({ action: "setStyle", id, property: "color", value: "blue" });
		collector.flushSync();

		const mutations = (transport.sent[0] as { mutations: unknown[] }).mutations;
		expect(mutations).toHaveLength(2);
	});

	it("different properties on same node are not deduplicated", () => {
		const transport = createMockTransport();
		const collector = new MutationCollector(createAppId("test"));
		collector.setTransport(transport);

		const id = createNodeId();
		collector.add({ action: "setStyle", id, property: "color", value: "red" });
		collector.add({ action: "setStyle", id, property: "font-size", value: "12px" });
		collector.flushSync();

		const mutations = (transport.sent[0] as { mutations: unknown[] }).mutations;
		expect(mutations).toHaveLength(2);
	});
});
