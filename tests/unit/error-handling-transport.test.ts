import { describe, expect, it, vi } from "vitest";
import { createAppId, type Message, type MutationMessage } from "../../src/core/protocol.ts";

describe("Multiple onMessage handlers (I7)", () => {
	describe("WorkerTransport", () => {
		it("supports multiple onMessage handlers", async () => {
			const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
			let capturedOnMessage: ((e: MessageEvent) => void) | null = null;

			const mockWorker = {
				postMessage: vi.fn(),
				terminate: vi.fn(),
				set onmessage(fn: ((e: MessageEvent) => void) | null) {
					capturedOnMessage = fn;
				},
				onerror: null as ((e: ErrorEvent) => void) | null,
				onmessageerror: null as ((e: MessageEvent) => void) | null,
			} as unknown as Worker;

			const transport = new WorkerTransport(mockWorker);
			const received1: Message[] = [];
			const received2: Message[] = [];
			transport.onMessage((msg) => received1.push(msg));
			transport.onMessage((msg) => received2.push(msg));

			const msg: MutationMessage = {
				type: "mutation",
				appId: createAppId("a"),
				uid: 1,
				mutations: [],
			};

			capturedOnMessage?.({ data: msg } as MessageEvent);

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);
			expect(received1[0]).toEqual(msg);
			expect(received2[0]).toEqual(msg);
		});
	});

	describe("WorkerSelfTransport", () => {
		it("supports multiple onMessage handlers", async () => {
			const { WorkerSelfTransport } = await import("../../src/transport/worker-transport.ts");
			const scope = {
				postMessage: vi.fn(),
				onmessage: null as ((e: MessageEvent) => void) | null,
			};

			const transport = new WorkerSelfTransport(scope);
			const received1: Message[] = [];
			const received2: Message[] = [];
			transport.onMessage((msg) => received1.push(msg));
			transport.onMessage((msg) => received2.push(msg));

			const msg: MutationMessage = {
				type: "mutation",
				appId: createAppId("a"),
				uid: 1,
				mutations: [],
			};

			scope.onmessage?.({ data: msg } as MessageEvent);

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);
		});
	});

	describe("BinaryWorkerTransport", () => {
		it("supports multiple onMessage handlers", async () => {
			const { BinaryWorkerTransport } = await import(
				"../../src/transport/binary-worker-transport.ts"
			);
			let capturedOnMessage: ((e: MessageEvent) => void) | null = null;

			const mockWorker = {
				postMessage: vi.fn(),
				terminate: vi.fn(),
				set onmessage(fn: ((e: MessageEvent) => void) | null) {
					capturedOnMessage = fn;
				},
				onerror: null as ((e: ErrorEvent) => void) | null,
				onmessageerror: null as ((e: MessageEvent) => void) | null,
			} as unknown as Worker;

			const transport = new BinaryWorkerTransport(mockWorker);
			const received1: Message[] = [];
			const received2: Message[] = [];
			transport.onMessage((msg) => received1.push(msg));
			transport.onMessage((msg) => received2.push(msg));

			const msg: MutationMessage = {
				type: "mutation",
				appId: createAppId("a"),
				uid: 1,
				mutations: [],
			};

			// Simulate a plain object message (non-ArrayBuffer)
			capturedOnMessage?.({ data: msg } as MessageEvent);

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);
		});
	});

	describe("BinaryWorkerSelfTransport", () => {
		it("supports multiple onMessage handlers", async () => {
			const { BinaryWorkerSelfTransport } = await import(
				"../../src/transport/binary-worker-transport.ts"
			);
			const scope = {
				postMessage: vi.fn(),
				onmessage: null as ((e: MessageEvent) => void) | null,
			};

			const transport = new BinaryWorkerSelfTransport(scope);
			const received1: Message[] = [];
			const received2: Message[] = [];
			transport.onMessage((msg) => received1.push(msg));
			transport.onMessage((msg) => received2.push(msg));

			const msg: MutationMessage = {
				type: "mutation",
				appId: createAppId("a"),
				uid: 1,
				mutations: [],
			};

			scope.onmessage?.({ data: msg } as MessageEvent);

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);
		});
	});
});

describe("Worker error forwarding (B4)", () => {
	describe("WorkerTransport", () => {
		it("calls onError when worker.onerror fires", async () => {
			const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
			let capturedOnerror: ((e: ErrorEvent) => void) | null = null;

			const mockWorker = {
				postMessage: vi.fn(),
				terminate: vi.fn(),
				onmessage: null as ((e: MessageEvent) => void) | null,
				set onerror(fn: ((e: ErrorEvent) => void) | null) {
					capturedOnerror = fn;
				},
				onmessageerror: null as ((e: MessageEvent) => void) | null,
			} as unknown as Worker;

			const transport = new WorkerTransport(mockWorker);
			const errors: Error[] = [];
			let closeCalled = false;

			transport.onError = (err) => errors.push(err);
			transport.onClose = () => {
				closeCalled = true;
			};

			capturedOnerror?.({ message: "test error" } as ErrorEvent);

			expect(errors).toHaveLength(1);
			expect(errors[0].message).toBe("test error");
			expect(closeCalled).toBe(true);
			expect(transport.readyState).toBe("closed");
		});

		it("calls onError on messageerror", async () => {
			const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
			let capturedOnmessageerror: (() => void) | null = null;

			const mockWorker = {
				postMessage: vi.fn(),
				terminate: vi.fn(),
				onmessage: null as ((e: MessageEvent) => void) | null,
				onerror: null as ((e: ErrorEvent) => void) | null,
				set onmessageerror(fn: (() => void) | null) {
					capturedOnmessageerror = fn;
				},
			} as unknown as Worker;

			const transport = new WorkerTransport(mockWorker);
			const errors: Error[] = [];
			transport.onError = (err) => errors.push(err);

			capturedOnmessageerror?.();

			expect(errors).toHaveLength(1);
			expect(errors[0].message).toContain("deserialization");
		});
	});

	describe("BinaryWorkerTransport", () => {
		it("calls onError and onClose when worker.onerror fires", async () => {
			const { BinaryWorkerTransport } = await import(
				"../../src/transport/binary-worker-transport.ts"
			);
			let capturedOnerror: ((e: ErrorEvent) => void) | null = null;

			const mockWorker = {
				postMessage: vi.fn(),
				terminate: vi.fn(),
				onmessage: null as ((e: MessageEvent) => void) | null,
				set onerror(fn: ((e: ErrorEvent) => void) | null) {
					capturedOnerror = fn;
				},
				onmessageerror: null as ((e: MessageEvent) => void) | null,
			} as unknown as Worker;

			const transport = new BinaryWorkerTransport(mockWorker);
			const errors: Error[] = [];
			let closeCalled = false;

			transport.onError = (err) => errors.push(err);
			transport.onClose = () => {
				closeCalled = true;
			};

			capturedOnerror?.({ message: "binary error" } as ErrorEvent);

			expect(errors).toHaveLength(1);
			expect(errors[0].message).toBe("binary error");
			expect(closeCalled).toBe(true);
			expect(transport.readyState).toBe("closed");
		});
	});
});
