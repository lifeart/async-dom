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

		collector.add({ action: "createNode", id: createNodeId("n1"), tag: "div" });
		collector.add({ action: "createNode", id: createNodeId("n2"), tag: "span" });

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

		collector.add({ action: "createNode", id: createNodeId("n1"), tag: "div" });
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

		collector.add({ action: "createNode", id: createNodeId("n1"), tag: "div" });
		await Promise.resolve();

		collector.add({ action: "createNode", id: createNodeId("n2"), tag: "span" });
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

		collector.add({ action: "createNode", id: createNodeId("n1"), tag: "div" });
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

		collector.add({ action: "createNode", id: createNodeId("n1"), tag: "div" });
		collector.add({ action: "createNode", id: createNodeId("n2"), tag: "span" });
		expect(collector.pendingCount).toBe(2);

		collector.flushSync();
		expect(collector.pendingCount).toBe(0);
	});
});
