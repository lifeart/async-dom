import { describe, expect, it, vi } from "vitest";
import { createAppId, type Message, type MutationMessage } from "../../src/core/protocol.ts";

function createMockScope() {
	return {
		postMessage: vi.fn(),
		onmessage: null as ((e: MessageEvent) => void) | null,
	};
}

describe("WorkerSelfTransport", () => {
	it("send() calls scope.postMessage", async () => {
		const { WorkerSelfTransport } = await import("../../src/transport/worker-transport.ts");
		const scope = createMockScope();
		const transport = new WorkerSelfTransport(scope);

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};

		transport.send(msg);
		expect(scope.postMessage).toHaveBeenCalledWith(msg);
	});

	it("onMessage handler receives messages", async () => {
		const { WorkerSelfTransport } = await import("../../src/transport/worker-transport.ts");
		const scope = createMockScope();
		const transport = new WorkerSelfTransport(scope);

		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};

		// Simulate incoming message via scope.onmessage
		scope.onmessage?.({ data: msg } as MessageEvent);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(msg);
	});

	it("close() sets readyState to 'closed'", async () => {
		const { WorkerSelfTransport } = await import("../../src/transport/worker-transport.ts");
		const scope = createMockScope();
		const transport = new WorkerSelfTransport(scope);

		expect(transport.readyState).toBe("open");
		transport.close();
		expect(transport.readyState).toBe("closed");
	});

	it("send() after close is a no-op", async () => {
		const { WorkerSelfTransport } = await import("../../src/transport/worker-transport.ts");
		const scope = createMockScope();
		const transport = new WorkerSelfTransport(scope);

		transport.close();
		transport.send({
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		});

		expect(scope.postMessage).not.toHaveBeenCalled();
	});
});
