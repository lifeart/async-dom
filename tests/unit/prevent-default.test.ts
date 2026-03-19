import { beforeEach, describe, expect, it } from "vitest";
import { createAppId, createNodeId } from "../../src/core/protocol.ts";
import type { Message } from "../../src/core/protocol.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";

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

describe("Declarative preventDefault", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("preventDefaultFor emits configureEvent mutation", () => {
		const el = doc.createElement("div");
		doc.collector.flushSync();

		el.preventDefaultFor("click");

		expect(doc.collector.pendingCount).toBeGreaterThan(0);
	});

	it("preventDefaultFor emits correct mutation shape", () => {
		const transport = createMockTransport();
		doc.collector.setTransport(transport);
		doc.collector.flushSync();

		const el = doc.createElement("div");
		el.preventDefaultFor("submit");
		doc.collector.flushSync();

		const mutationMsg = transport.sent.find((m) => m.type === "mutation");
		expect(mutationMsg).toBeDefined();
		if (mutationMsg && "mutations" in mutationMsg) {
			const configMutation = mutationMsg.mutations.find(
				(m: Record<string, unknown>) => m.action === "configureEvent",
			);
			expect(configMutation).toBeDefined();
			expect(configMutation).toMatchObject({
				action: "configureEvent",
				name: "submit",
				preventDefault: true,
			});
		}
	});
});
