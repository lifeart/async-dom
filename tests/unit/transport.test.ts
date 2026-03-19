import { describe, expect, it, vi } from "vitest";
import {
	createAppId,
	createNodeId,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";

describe("WorkerTransport", () => {
	it("sends messages via worker.postMessage", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const mockWorker = {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			onmessage: null as ((e: MessageEvent) => void) | null,
			onerror: null as ((e: ErrorEvent) => void) | null,
		} as unknown as Worker;

		const transport = new WorkerTransport(mockWorker);
		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
		};

		transport.send(msg);
		expect(mockWorker.postMessage).toHaveBeenCalledWith(msg);
	});

	it("routes incoming messages to handler", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		let capturedOnMessage: ((e: MessageEvent) => void) | null = null;

		const mockWorker = {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			set onmessage(fn: ((e: MessageEvent) => void) | null) {
				capturedOnMessage = fn;
			},
			onerror: null as ((e: ErrorEvent) => void) | null,
		} as unknown as Worker;

		const transport = new WorkerTransport(mockWorker);
		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};

		// Simulate incoming message
		capturedOnMessage?.({ data: msg } as MessageEvent);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(msg);
	});

	it("stops sending after close", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const mockWorker = {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			onmessage: null,
			onerror: null,
		} as unknown as Worker;

		const transport = new WorkerTransport(mockWorker);
		transport.close();

		expect(transport.readyState).toBe("closed");
		transport.send({
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		});
		expect(mockWorker.postMessage).not.toHaveBeenCalled();
	});
});
