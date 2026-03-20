import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createAppId,
	createNodeId,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";

function createMockPort() {
	const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
	return {
		postMessage: vi.fn(),
		close: vi.fn(),
		start: vi.fn(),
		onmessage: null as ((e: MessageEvent) => void) | null,
		onmessageerror: null as (() => void) | null,
		addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(handler);
		}),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
		_listeners: listeners,
		simulateMessage(data: unknown): void {
			this.onmessage?.({ data } as MessageEvent);
		},
		simulateMessageError(): void {
			this.onmessageerror?.();
		},
		simulateClose(): void {
			const handlers = listeners.close ?? [];
			for (const h of handlers) h();
		},
	};
}

type MockPort = ReturnType<typeof createMockPort>;

function makeMutationMessage(): MutationMessage {
	return {
		type: "mutation",
		appId: createAppId("a"),
		uid: 1,
		mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
	};
}

describe("SharedWorkerTransport", () => {
	let port: MockPort;

	beforeEach(() => {
		vi.useFakeTimers();
		port = createMockPort();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("sends messages via port.postMessage", async () => {
		const { SharedWorkerTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerTransport(port as unknown as MessagePort);
		const msg = makeMutationMessage();

		transport.send(msg);
		expect(port.postMessage).toHaveBeenCalledWith(msg);
		transport.close();
	});

	it("routes incoming messages to handler", async () => {
		const { SharedWorkerTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerTransport(port as unknown as MessagePort);
		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		const msg = makeMutationMessage();
		port.simulateMessage(msg);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(msg);
		transport.close();
	});

	it("stops sending after close", async () => {
		const { SharedWorkerTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerTransport(port as unknown as MessagePort);
		transport.close();

		expect(transport.readyState).toBe("closed");
		transport.send(makeMutationMessage());
		// postMessage is called by constructor for heartbeat setup, but not for the send
		expect(port.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "mutation" }),
		);
	});

	it("starts with readyState 'open'", async () => {
		const { SharedWorkerTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerTransport(port as unknown as MessagePort);
		expect(transport.readyState).toBe("open");
		transport.close();
	});

	it("close() calls port.close()", async () => {
		const { SharedWorkerTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerTransport(port as unknown as MessagePort);
		transport.close();
		expect(port.close).toHaveBeenCalled();
	});

	it("wires onmessageerror to onError", async () => {
		const { SharedWorkerTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerTransport(port as unknown as MessagePort);
		const errors: Error[] = [];
		transport.onError = (err) => errors.push(err);

		port.simulateMessageError();

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toContain("deserialization failed");
		transport.close();
	});

	it("tracks stats when enabled", async () => {
		const { SharedWorkerTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerTransport(port as unknown as MessagePort);
		transport.enableStats(true);

		const msg = makeMutationMessage();
		transport.send(msg);
		transport.send(msg);

		const stats = transport.getStats();
		expect(stats.messageCount).toBe(2);
		expect(stats.totalBytes).toBeGreaterThan(0);
		expect(stats.largestMessageBytes).toBeGreaterThan(0);
		expect(stats.lastMessageBytes).toBeGreaterThan(0);
		transport.close();
	});

	it("does not track stats when disabled", async () => {
		const { SharedWorkerTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerTransport(port as unknown as MessagePort);

		transport.send(makeMutationMessage());

		const stats = transport.getStats();
		expect(stats.messageCount).toBe(0);
		transport.close();
	});

	describe("heartbeat", () => {
		it("sends ping every 5 seconds", async () => {
			const { SharedWorkerTransport } = await import(
				"../../src/transport/shared-worker-transport.ts"
			);
			const _transport = new SharedWorkerTransport(port as unknown as MessagePort);

			vi.advanceTimersByTime(5_000);
			expect(port.postMessage).toHaveBeenCalledWith({ type: "ping" });

			// Respond with pong to prevent timeout
			port.simulateMessage({ type: "pong" });

			port.postMessage.mockClear();
			vi.advanceTimersByTime(5_000);
			expect(port.postMessage).toHaveBeenCalledWith({ type: "ping" });
			_transport.close();
		});

		it("does not fire onClose when pong is received in time", async () => {
			const { SharedWorkerTransport } = await import(
				"../../src/transport/shared-worker-transport.ts"
			);
			const transport = new SharedWorkerTransport(port as unknown as MessagePort);
			const closeCalls: boolean[] = [];
			transport.onClose = () => closeCalls.push(true);

			// Trigger ping
			vi.advanceTimersByTime(5_000);
			// Respond with pong
			port.simulateMessage({ type: "pong" });

			// Advance past the timeout window
			vi.advanceTimersByTime(15_000);

			expect(transport.readyState).toBe("open");
			expect(closeCalls).toHaveLength(0);
			transport.close();
		});

		it("fires onClose when pong is not received within 15s", async () => {
			const { SharedWorkerTransport } = await import(
				"../../src/transport/shared-worker-transport.ts"
			);
			const transport = new SharedWorkerTransport(port as unknown as MessagePort);
			const closeCalls: boolean[] = [];
			transport.onClose = () => closeCalls.push(true);

			// At 5s: ping sent, _awaitingPong=true, timeout at 20s.
			// Subsequent intervals skip because _awaitingPong is true.
			// At 20s: timeout fires, transport closes.
			vi.advanceTimersByTime(5_000 + 15_000);

			expect(transport.readyState).toBe("closed");
			expect(closeCalls).toHaveLength(1);
		});

		it("pong messages are NOT forwarded to app handlers", async () => {
			const { SharedWorkerTransport } = await import(
				"../../src/transport/shared-worker-transport.ts"
			);
			const transport = new SharedWorkerTransport(port as unknown as MessagePort);
			const received: Message[] = [];
			transport.onMessage((msg) => received.push(msg));

			port.simulateMessage({ type: "pong" });

			expect(received).toHaveLength(0);
			transport.close();
		});

		it("close event from port triggers onClose (Chrome 122+)", async () => {
			const { SharedWorkerTransport } = await import(
				"../../src/transport/shared-worker-transport.ts"
			);
			const transport = new SharedWorkerTransport(port as unknown as MessagePort);
			const closeCalls: boolean[] = [];
			transport.onClose = () => closeCalls.push(true);

			port.simulateClose();

			expect(transport.readyState).toBe("closed");
			expect(closeCalls).toHaveLength(1);
		});
	});
});

describe("SharedWorkerSelfTransport", () => {
	let port: MockPort;

	beforeEach(() => {
		port = createMockPort();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sends messages via port.postMessage", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		const msg = makeMutationMessage();

		transport.send(msg);
		expect(port.postMessage).toHaveBeenCalledWith(msg);
		transport.close();
	});

	it("calls port.start() on construction", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const _transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		expect(port.start).toHaveBeenCalled();
		_transport.close();
	});

	it("routes incoming messages to handler", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		const msg = makeMutationMessage();
		port.simulateMessage(msg);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(msg);
		transport.close();
	});

	it("responds to ping with pong automatically", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const _transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);

		port.simulateMessage({ type: "ping" });

		expect(port.postMessage).toHaveBeenCalledWith({ type: "pong" });
		_transport.close();
	});

	it("does NOT forward ping messages to app handlers", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		port.simulateMessage({ type: "ping" });

		expect(received).toHaveLength(0);
		transport.close();
	});

	it("stops sending after close", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		transport.close();

		expect(transport.readyState).toBe("closed");
		transport.send(makeMutationMessage());
		expect(port.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "mutation" }),
		);
	});

	it("starts with readyState 'open'", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		expect(transport.readyState).toBe("open");
		transport.close();
	});

	it("wires onmessageerror to onError", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		const errors: Error[] = [];
		transport.onError = (err) => errors.push(err);

		port.simulateMessageError();

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toContain("deserialization failed");
		transport.close();
	});

	it("tracks stats when enabled", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		transport.enableStats(true);

		const msg = makeMutationMessage();
		transport.send(msg);

		const stats = transport.getStats();
		expect(stats.messageCount).toBe(1);
		expect(stats.totalBytes).toBeGreaterThan(0);
		transport.close();
	});

	it("close() calls port.close()", async () => {
		const { SharedWorkerSelfTransport } = await import(
			"../../src/transport/shared-worker-transport.ts"
		);
		const transport = new SharedWorkerSelfTransport(port as unknown as MessagePort);
		transport.close();
		expect(port.close).toHaveBeenCalled();
	});
});
