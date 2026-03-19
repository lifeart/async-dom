import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppId, createNodeId, type AppId, type Message, type MutationMessage } from "../../src/core/protocol.ts";
import { ThreadManager } from "../../src/main-thread/thread-manager.ts";

function createMockWorker() {
	const mock = {
		postMessage: vi.fn(),
		terminate: vi.fn(),
		onmessage: null as ((e: MessageEvent) => void) | null,
		onerror: null as ((e: ErrorEvent) => void) | null,
	};
	return mock as unknown as Worker;
}

describe("ThreadManager", () => {
	let manager: ThreadManager;

	beforeEach(() => {
		manager = new ThreadManager();
	});

	it("createWorkerThread returns an AppId", () => {
		const worker = createMockWorker();
		const appId = manager.createWorkerThread({ worker });
		expect(typeof appId).toBe("string");
		expect(appId.length).toBeGreaterThan(0);
	});

	it("sendToThread routes message to correct worker", () => {
		const worker1 = createMockWorker();
		const worker2 = createMockWorker();

		const appId1 = manager.createWorkerThread({ worker: worker1 });
		const appId2 = manager.createWorkerThread({ worker: worker2 });

		const msg: MutationMessage = {
			type: "mutation",
			appId: appId1,
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId("n1"), tag: "div" }],
		};

		manager.sendToThread(appId1, msg);
		expect(worker1.postMessage).toHaveBeenCalledWith(msg);
		expect(worker2.postMessage).not.toHaveBeenCalled();
	});

	it("broadcast sends to all workers", () => {
		const worker1 = createMockWorker();
		const worker2 = createMockWorker();

		manager.createWorkerThread({ worker: worker1 });
		manager.createWorkerThread({ worker: worker2 });

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("broadcast"),
			uid: 1,
			mutations: [],
		};

		manager.broadcast(msg);
		expect(worker1.postMessage).toHaveBeenCalledWith(msg);
		expect(worker2.postMessage).toHaveBeenCalledWith(msg);
	});

	it("destroyThread terminates worker and removes from map", () => {
		const worker = createMockWorker();
		const appId = manager.createWorkerThread({ worker });

		manager.destroyThread(appId);
		expect(worker.terminate).toHaveBeenCalled();
		expect(manager.getTransport(appId)).toBeNull();
	});

	it("destroyAll cleans up everything", () => {
		const worker1 = createMockWorker();
		const worker2 = createMockWorker();

		const appId1 = manager.createWorkerThread({ worker: worker1 });
		const appId2 = manager.createWorkerThread({ worker: worker2 });

		manager.destroyAll();
		expect(worker1.terminate).toHaveBeenCalled();
		expect(worker2.terminate).toHaveBeenCalled();
		expect(manager.getTransport(appId1)).toBeNull();
		expect(manager.getTransport(appId2)).toBeNull();
	});

	it("onMessage handler receives messages from workers", () => {
		let capturedOnMessage: ((e: MessageEvent) => void) | null = null;
		const mockWorker = {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			set onmessage(fn: ((e: MessageEvent) => void) | null) {
				capturedOnMessage = fn;
			},
			onerror: null as ((e: ErrorEvent) => void) | null,
		} as unknown as Worker;

		const received: Array<{ appId: AppId; message: Message }> = [];
		manager.onMessage((appId, message) => {
			received.push({ appId, message });
		});

		const appId = manager.createWorkerThread({ worker: mockWorker });

		const msg: MutationMessage = {
			type: "mutation",
			appId,
			uid: 1,
			mutations: [],
		};

		capturedOnMessage?.({ data: msg } as MessageEvent);

		expect(received).toHaveLength(1);
		expect(received[0].appId).toBe(appId);
		expect(received[0].message).toEqual(msg);
	});

	it("getTransport returns the transport for an appId", () => {
		const worker = createMockWorker();
		const appId = manager.createWorkerThread({ worker });

		const transport = manager.getTransport(appId);
		expect(transport).not.toBeNull();
		expect(transport?.readyState).toBe("open");
	});

	it("getTransport returns null for unknown appId", () => {
		const transport = manager.getTransport(createAppId("unknown"));
		expect(transport).toBeNull();
	});

	it("sendToThread with unknown appId is a no-op", () => {
		// Should not throw
		manager.sendToThread(createAppId("unknown"), {
			type: "mutation",
			appId: createAppId("unknown"),
			uid: 1,
			mutations: [],
		});
	});
});
