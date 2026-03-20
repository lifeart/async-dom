import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createAppId,
	createNodeId,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";
import type { WebSocketLike } from "../../src/transport/ws-server-transport.ts";
import { WebSocketServerTransport } from "../../src/transport/ws-server-transport.ts";

/**
 * Mock WebSocketLike that simulates a server-side WebSocket.
 */
class MockServerSocket implements WebSocketLike {
	readyState = 1; // OPEN
	bufferedAmount = 0;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code: number; reason: string }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	sentMessages: string[] = [];
	closeCalled = false;
	closeCode?: number;
	closeReason?: string;

	send(data: string): void {
		this.sentMessages.push(data);
	}

	close(code?: number, reason?: string): void {
		this.closeCalled = true;
		this.closeCode = code;
		this.closeReason = reason;
		this.readyState = 3; // CLOSED
		this.onclose?.({ code: code ?? 1000, reason: reason ?? "" });
	}

	simulateMessage(data: unknown): void {
		this.onmessage?.({ data: JSON.stringify(data) });
	}

	simulateClose(code = 1000, reason = ""): void {
		this.readyState = 3;
		this.onclose?.({ code, reason });
	}

	simulateError(error?: unknown): void {
		this.onerror?.(error ?? new Error("mock error"));
	}
}

function createMutationMessage(uid = 1): MutationMessage {
	return {
		type: "mutation",
		appId: createAppId("test-app"),
		uid,
		mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
	};
}

describe("WebSocketServerTransport", () => {
	let socket: MockServerSocket;
	let transport: WebSocketServerTransport;

	beforeEach(() => {
		socket = new MockServerSocket();
		transport = new WebSocketServerTransport(socket);
	});

	afterEach(() => {
		// Ensure timers are cleaned up
		if (transport.readyState !== "closed") {
			transport.close();
		}
		vi.restoreAllMocks();
	});

	describe("send/receive", () => {
		it("sends messages as JSON strings", () => {
			const msg = createMutationMessage();
			transport.send(msg);

			expect(socket.sentMessages).toHaveLength(1);
			expect(JSON.parse(socket.sentMessages[0])).toEqual(msg);
		});

		it("receives and parses incoming JSON messages", () => {
			const received: Message[] = [];
			transport.onMessage((msg) => received.push(msg));

			const msg = createMutationMessage();
			socket.simulateMessage(msg);

			expect(received).toHaveLength(1);
			expect(received[0]).toEqual(msg);
		});

		it("supports multiple message handlers", () => {
			const received1: Message[] = [];
			const received2: Message[] = [];
			transport.onMessage((msg) => received1.push(msg));
			transport.onMessage((msg) => received2.push(msg));

			const msg = createMutationMessage();
			socket.simulateMessage(msg);

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);
		});

		it("handles handler errors without breaking other handlers", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const received: Message[] = [];

			transport.onMessage(() => {
				throw new Error("handler boom");
			});
			transport.onMessage((msg) => received.push(msg));

			socket.simulateMessage(createMutationMessage());

			expect(received).toHaveLength(1);
			expect(consoleSpy).toHaveBeenCalled();
		});

		it("handles malformed JSON gracefully", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			socket.onmessage?.({ data: "not valid json{{{" });

			expect(consoleSpy).toHaveBeenCalledWith("[async-dom] Failed to parse WebSocket message");
		});

		it("does not send messages when closed", () => {
			transport.close();
			transport.send(createMutationMessage());

			// Only the close itself may have been called, no send
			expect(socket.sentMessages).toHaveLength(0);
		});
	});

	describe("close", () => {
		it("closes the socket with code 1000", () => {
			transport.close();

			expect(socket.closeCalled).toBe(true);
			expect(socket.closeCode).toBe(1000);
		});

		it("sets readyState to closed", () => {
			transport.close();
			expect(transport.readyState).toBe("closed");
		});

		it("clears the message queue on close", () => {
			// Force messages into queue via backpressure
			socket.bufferedAmount = 2 * 1024 * 1024; // 2MB
			transport.send(createMutationMessage(1));
			transport.send(createMutationMessage(2));

			expect(socket.sentMessages).toHaveLength(0); // queued, not sent

			transport.close();

			// Reduce buffer — nothing should drain after close
			socket.bufferedAmount = 0;
			// Wait a tick for any drain check
			expect(socket.sentMessages).toHaveLength(0);
		});

		it("is idempotent — double close does not throw", () => {
			transport.close();
			expect(() => transport.close()).not.toThrow();
		});

		it("fires onClose callback when socket closes", () => {
			const onClose = vi.fn();
			transport.onClose = onClose;

			socket.simulateClose(1001, "going away");

			expect(onClose).toHaveBeenCalledOnce();
			expect(transport.readyState).toBe("closed");
		});
	});

	describe("readyState mapping", () => {
		it("maps readyState 0 (CONNECTING) to 'connecting'", () => {
			const connectingSocket = new MockServerSocket();
			connectingSocket.readyState = 0;
			const t = new WebSocketServerTransport(connectingSocket);
			expect(t.readyState).toBe("connecting");
			t.close();
		});

		it("maps readyState 1 (OPEN) to 'open'", () => {
			expect(transport.readyState).toBe("open");
		});

		it("maps readyState 2 (CLOSING) to 'closed'", () => {
			const closingSocket = new MockServerSocket();
			closingSocket.readyState = 2;
			const t = new WebSocketServerTransport(closingSocket);
			expect(t.readyState).toBe("closed");
			t.close();
		});

		it("maps readyState 3 (CLOSED) to 'closed'", () => {
			const closedSocket = new MockServerSocket();
			closedSocket.readyState = 3;
			const t = new WebSocketServerTransport(closedSocket);
			expect(t.readyState).toBe("closed");
		});
	});

	describe("backpressure", () => {
		it("queues messages when bufferedAmount exceeds HIGH_WATER_MARK (1MB)", () => {
			socket.bufferedAmount = 1.5 * 1024 * 1024; // 1.5MB > 1MB

			transport.send(createMutationMessage(1));
			transport.send(createMutationMessage(2));

			expect(socket.sentMessages).toHaveLength(0);
		});

		it("sends messages normally when bufferedAmount is below HIGH_WATER_MARK", () => {
			socket.bufferedAmount = 0;

			transport.send(createMutationMessage(1));

			expect(socket.sentMessages).toHaveLength(1);
		});

		it("drains queued messages when bufferedAmount drops below LOW_WATER_MARK (256KB)", async () => {
			vi.useFakeTimers();

			// Queue messages with high backpressure
			socket.bufferedAmount = 1.5 * 1024 * 1024;
			transport.send(createMutationMessage(1));
			transport.send(createMutationMessage(2));
			expect(socket.sentMessages).toHaveLength(0);

			// Drop buffer below LOW_WATER_MARK
			socket.bufferedAmount = 0;

			// Advance past drain check interval (50ms)
			vi.advanceTimersByTime(100);

			expect(socket.sentMessages).toHaveLength(2);
			expect(JSON.parse(socket.sentMessages[0]).uid).toBe(1);
			expect(JSON.parse(socket.sentMessages[1]).uid).toBe(2);

			vi.useRealTimers();
			transport.close();
		});

		it("re-queues during flush if bufferedAmount rises again", async () => {
			vi.useFakeTimers();

			// Queue 3 messages
			socket.bufferedAmount = 1.5 * 1024 * 1024;
			transport.send(createMutationMessage(1));
			transport.send(createMutationMessage(2));
			transport.send(createMutationMessage(3));

			// Mock send to raise bufferedAmount after first message
			let sendCount = 0;
			const origSend = socket.send.bind(socket);
			socket.send = (data: string) => {
				origSend(data);
				sendCount++;
				if (sendCount === 1) {
					// After first send, raise backpressure again
					socket.bufferedAmount = 1.5 * 1024 * 1024;
				}
			};

			// Drop below LOW_WATER_MARK to trigger drain
			socket.bufferedAmount = 0;
			vi.advanceTimersByTime(100);

			// Only 1 message should have been sent (then backpressure returned)
			expect(socket.sentMessages).toHaveLength(1);

			// Now drop again
			socket.bufferedAmount = 0;
			vi.advanceTimersByTime(100);

			// Remaining 2 should be sent
			expect(socket.sentMessages).toHaveLength(3);

			vi.useRealTimers();
			transport.close();
		});
	});

	describe("error handling", () => {
		it("fires onError when socket error occurs", () => {
			const onError = vi.fn();
			transport.onError = onError;

			const error = new Error("connection reset");
			socket.simulateError(error);

			expect(onError).toHaveBeenCalledWith(error);
		});

		it("wraps non-Error objects in Error", () => {
			const onError = vi.fn();
			transport.onError = onError;

			socket.simulateError("string error");

			expect(onError).toHaveBeenCalledOnce();
			expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
			expect(onError.mock.calls[0][0].message).toBe("WebSocket error");
		});

		it("fires onError when send fails", () => {
			const onError = vi.fn();
			transport.onError = onError;

			socket.send = () => {
				throw new Error("send failed");
			};

			transport.send(createMutationMessage());

			expect(onError).toHaveBeenCalledOnce();
			expect(onError.mock.calls[0][0].message).toBe("send failed");
		});
	});

	describe("stats tracking", () => {
		it("does not track stats when disabled (default)", () => {
			transport.send(createMutationMessage());

			const stats = transport.getStats();
			expect(stats.messageCount).toBe(0);
			expect(stats.totalBytes).toBe(0);
		});

		it("tracks stats when enabled", () => {
			transport.enableStats(true);

			transport.send(createMutationMessage(1));
			transport.send(createMutationMessage(2));

			const stats = transport.getStats();
			expect(stats.messageCount).toBe(2);
			expect(stats.totalBytes).toBeGreaterThan(0);
			expect(stats.lastMessageBytes).toBeGreaterThan(0);
			expect(stats.largestMessageBytes).toBeGreaterThan(0);
		});

		it("tracks largestMessageBytes correctly", () => {
			transport.enableStats(true);

			// Send a small message
			const small: MutationMessage = {
				type: "mutation",
				appId: createAppId("a"),
				uid: 1,
				mutations: [],
			};
			transport.send(small);
			const statsAfterSmall = transport.getStats();

			// Send a larger message
			const large = createMutationMessage(2);
			transport.send(large);
			const statsAfterLarge = transport.getStats();

			expect(statsAfterLarge.largestMessageBytes).toBeGreaterThanOrEqual(
				statsAfterSmall.largestMessageBytes,
			);
		});

		it("returns a copy of stats (not a reference)", () => {
			transport.enableStats(true);
			transport.send(createMutationMessage());

			const stats1 = transport.getStats();
			transport.send(createMutationMessage(2));
			const stats2 = transport.getStats();

			expect(stats1.messageCount).toBe(1);
			expect(stats2.messageCount).toBe(2);
		});

		it("can be toggled off after being enabled", () => {
			transport.enableStats(true);
			transport.send(createMutationMessage(1));

			transport.enableStats(false);
			transport.send(createMutationMessage(2));

			const stats = transport.getStats();
			expect(stats.messageCount).toBe(1); // only the first one counted
		});
	});

	describe("bufferedAmount", () => {
		it("exposes the socket bufferedAmount", () => {
			socket.bufferedAmount = 12345;
			expect(transport.bufferedAmount).toBe(12345);
		});
	});
});
