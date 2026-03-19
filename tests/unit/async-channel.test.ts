import { describe, expect, it } from "vitest";
import { AsyncChannel } from "../../src/core/async-channel.ts";
import type { Message } from "../../src/core/protocol.ts";
import { createAppId, createNodeId } from "../../src/core/protocol.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";

function createMockTransport(): Transport & { sent: Message[] } {
	const sent: Message[] = [];
	return {
		sent,
		send(msg: Message) {
			sent.push(msg);
		},
		onMessage() {},
		close() {},
		get readyState(): TransportReadyState {
			return "open";
		},
	};
}

describe("AsyncChannel", () => {
	it("sends query message via transport", () => {
		const transport = createMockTransport();
		const channel = new AsyncChannel(createAppId("test"));
		channel.setTransport(transport);

		channel.request(createNodeId("node-1"), "boundingRect");

		expect(transport.sent).toHaveLength(1);
		const msg = transport.sent[0] as Record<string, unknown>;
		expect(msg.type).toBe("query");
		expect(msg.nodeId).toBe("node-1");
		expect(msg.query).toBe("boundingRect");
	});

	it("resolves when handleResult is called", async () => {
		const transport = createMockTransport();
		const channel = new AsyncChannel(createAppId("test"));
		channel.setTransport(transport);

		const promise = channel.request(createNodeId("node-1"), "boundingRect");

		// Extract uid from sent message
		const msg = transport.sent[0] as Record<string, unknown>;
		const uid = msg.uid as number;

		const mockRect = { top: 10, left: 20, width: 100, height: 50 };
		channel.handleResult(uid, mockRect);

		const result = await promise;
		expect(result).toEqual(mockRect);
	});

	it("resolves with null on timeout", async () => {
		const channel = new AsyncChannel(createAppId("test"), 50); // 50ms timeout
		const transport = createMockTransport();
		channel.setTransport(transport);

		const result = await channel.request(createNodeId("node-1"), "boundingRect");
		expect(result).toBeNull();
	});

	it("handles multiple concurrent queries", async () => {
		const transport = createMockTransport();
		const channel = new AsyncChannel(createAppId("test"));
		channel.setTransport(transport);

		const p1 = channel.request(createNodeId("node-1"), "boundingRect");
		const p2 = channel.request(createNodeId("node-2"), "computedStyle");

		expect(transport.sent).toHaveLength(2);

		const uid1 = (transport.sent[0] as Record<string, unknown>).uid as number;
		const uid2 = (transport.sent[1] as Record<string, unknown>).uid as number;

		channel.handleResult(uid2, { color: "red" });
		channel.handleResult(uid1, { top: 0 });

		expect(await p1).toEqual({ top: 0 });
		expect(await p2).toEqual({ color: "red" });
	});

	it("destroy resolves all pending with null", async () => {
		const transport = createMockTransport();
		const channel = new AsyncChannel(createAppId("test"));
		channel.setTransport(transport);

		const p1 = channel.request(createNodeId("node-1"), "boundingRect");
		const p2 = channel.request(createNodeId("node-2"), "computedStyle");

		channel.destroy();

		expect(await p1).toBeNull();
		expect(await p2).toBeNull();
	});

	it("sends property in query message", () => {
		const transport = createMockTransport();
		const channel = new AsyncChannel(createAppId("test"));
		channel.setTransport(transport);

		channel.request(createNodeId("node-1"), "nodeProperty", "offsetWidth");

		const msg = transport.sent[0] as Record<string, unknown>;
		expect(msg.property).toBe("offsetWidth");
	});
});
