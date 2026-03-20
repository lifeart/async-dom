import { describe, expect, it, vi } from "vitest";
import {
	createAppId,
	createNodeId,
	type EventMessage,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";
import {
	BinaryWorkerSelfTransport,
	BinaryWorkerTransport,
	decodeBinaryMessage,
	encodeBinaryMessage,
} from "../../src/transport/binary-worker-transport.ts";

describe("encodeBinaryMessage / decodeBinaryMessage", () => {
	it("round-trips a mutation message", () => {
		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("app1"),
			uid: 42,
			mutations: [
				{ action: "createNode", id: createNodeId(), tag: "div" },
				{
					action: "setAttribute",
					id: createNodeId(),
					name: "class",
					value: "hello",
				},
			],
		};

		const buffer = encodeBinaryMessage(msg);
		expect(buffer).toBeInstanceOf(ArrayBuffer);
		expect(buffer.byteLength).toBeGreaterThan(0);

		const decoded = decodeBinaryMessage(buffer);
		expect(decoded).toEqual(msg);
	});

	it("round-trips an event message", () => {
		const msg: EventMessage = {
			type: "event",
			appId: createAppId("app1"),
			listenerId: "l1",
			event: {
				type: "click",
				target: "n1",
				currentTarget: "n1",
				clientX: 100,
				clientY: 200,
			},
		};

		const buffer = encodeBinaryMessage(msg);
		const decoded = decodeBinaryMessage(buffer);
		expect(decoded).toEqual(msg);
	});

	it("round-trips a system message", () => {
		const msg: Message = {
			type: "ready",
			appId: createAppId("app1"),
		};

		const buffer = encodeBinaryMessage(msg);
		const decoded = decodeBinaryMessage(buffer);
		expect(decoded).toEqual(msg);
	});

	it("handles mutations with unicode text content", () => {
		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("app1"),
			uid: 1,
			mutations: [
				{
					action: "setTextContent",
					id: createNodeId(),
					textContent: "Hello \u{1F600} \u4F60\u597D \u00FC\u00F6\u00E4",
				},
			],
		};

		const buffer = encodeBinaryMessage(msg);
		const decoded = decodeBinaryMessage(buffer);
		expect(decoded).toEqual(msg);
	});

	it("handles empty mutations array", () => {
		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("app1"),
			uid: 0,
			mutations: [],
		};

		const buffer = encodeBinaryMessage(msg);
		const decoded = decodeBinaryMessage(buffer);
		expect(decoded).toEqual(msg);
	});
});

describe("BinaryWorkerTransport", () => {
	function createMockWorker() {
		return {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			onmessage: null as ((e: MessageEvent) => void) | null,
			onerror: null as ((e: ErrorEvent) => void) | null,
		} as unknown as Worker;
	}

	it("sends mutation messages as ArrayBuffer with transfer", () => {
		const mockWorker = createMockWorker();
		const transport = new BinaryWorkerTransport(mockWorker);

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
		};

		transport.send(msg);

		expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);
		const [data, transfer] = (mockWorker.postMessage as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(data).toBeInstanceOf(ArrayBuffer);
		expect(transfer).toEqual([data]);

		// Verify the buffer decodes correctly
		const decoded = decodeBinaryMessage(data);
		expect(decoded).toEqual(msg);
	});

	it("sends non-mutation messages via structured clone", () => {
		const mockWorker = createMockWorker();
		const transport = new BinaryWorkerTransport(mockWorker);

		const msg: EventMessage = {
			type: "event",
			appId: createAppId("a"),
			listenerId: "l1",
			event: { type: "click", target: "n1", currentTarget: "n1" },
		};

		transport.send(msg);

		expect(mockWorker.postMessage).toHaveBeenCalledWith(msg);
	});

	it("decodes incoming ArrayBuffer messages", () => {
		let capturedOnMessage: ((e: MessageEvent) => void) | null = null;
		const mockWorker = {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			set onmessage(fn: ((e: MessageEvent) => void) | null) {
				capturedOnMessage = fn;
			},
			onerror: null,
		} as unknown as Worker;

		const transport = new BinaryWorkerTransport(mockWorker);
		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		const original: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
		};

		const buffer = encodeBinaryMessage(original);
		capturedOnMessage?.({ data: buffer } as MessageEvent);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(original);
	});

	it("passes through non-ArrayBuffer incoming messages", () => {
		let capturedOnMessage: ((e: MessageEvent) => void) | null = null;
		const mockWorker = {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			set onmessage(fn: ((e: MessageEvent) => void) | null) {
				capturedOnMessage = fn;
			},
			onerror: null,
		} as unknown as Worker;

		const transport = new BinaryWorkerTransport(mockWorker);
		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		const msg: EventMessage = {
			type: "event",
			appId: createAppId("a"),
			listenerId: "l1",
			event: { type: "click", target: "n1", currentTarget: "n1" },
		};

		capturedOnMessage?.({ data: msg } as MessageEvent);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(msg);
	});

	it("stops sending after close", () => {
		const mockWorker = createMockWorker();
		const transport = new BinaryWorkerTransport(mockWorker);
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

describe("BinaryWorkerSelfTransport", () => {
	function createMockScope() {
		return {
			postMessage: vi.fn(),
			onmessage: null as ((e: MessageEvent) => void) | null,
		};
	}

	it("sends mutation messages as ArrayBuffer with transfer", () => {
		const scope = createMockScope();
		const transport = new BinaryWorkerSelfTransport(scope);

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
		};

		transport.send(msg);

		expect(scope.postMessage).toHaveBeenCalledTimes(1);
		const [data, transfer] = scope.postMessage.mock.calls[0];
		expect(data).toBeInstanceOf(ArrayBuffer);
		expect(transfer).toEqual([data]);
	});

	it("sends non-mutation messages via structured clone", () => {
		const scope = createMockScope();
		const transport = new BinaryWorkerSelfTransport(scope);

		const msg: Message = {
			type: "ready",
			appId: createAppId("a"),
		};

		transport.send(msg);

		expect(scope.postMessage).toHaveBeenCalledWith(msg);
	});

	it("decodes incoming ArrayBuffer messages", () => {
		const scope = createMockScope();
		const transport = new BinaryWorkerSelfTransport(scope);
		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		const original: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "span" }],
		};

		const buffer = encodeBinaryMessage(original);
		scope.onmessage?.({ data: buffer } as MessageEvent);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(original);
	});

	it("passes through non-ArrayBuffer incoming messages", () => {
		const scope = createMockScope();
		const transport = new BinaryWorkerSelfTransport(scope);
		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		const msg: EventMessage = {
			type: "event",
			appId: createAppId("a"),
			listenerId: "l1",
			event: { type: "click", target: "n1", currentTarget: "n1" },
		};

		scope.onmessage?.({ data: msg } as MessageEvent);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(msg);
	});

	it("stops sending after close", () => {
		const scope = createMockScope();
		const transport = new BinaryWorkerSelfTransport(scope);
		transport.close();

		expect(transport.readyState).toBe("closed");
		transport.send({
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		});
		expect(scope.postMessage).not.toHaveBeenCalled();
	});
});
