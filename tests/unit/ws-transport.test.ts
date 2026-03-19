import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createAppId,
	createNodeId,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";

// Mock WebSocket class
class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	// Instance constants matching the static ones
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;

	url: string;
	readyState = MockWebSocket.CONNECTING;
	onopen: ((ev: Event) => void) | null = null;
	onclose: ((ev: CloseEvent) => void) | null = null;
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;
	sentMessages: string[] = [];

	constructor(url: string) {
		this.url = url;
	}

	send(data: string): void {
		this.sentMessages.push(data);
	}

	close(): void {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.({} as CloseEvent);
	}

	// Test helpers
	simulateOpen(): void {
		this.readyState = MockWebSocket.OPEN;
		this.onopen?.({} as Event);
	}

	simulateMessage(data: unknown): void {
		this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
	}

	simulateError(): void {
		this.onerror?.({} as Event);
	}
}

describe("WebSocketTransport", () => {
	let originalWebSocket: typeof globalThis.WebSocket;
	let lastCreatedWs: MockWebSocket;

	beforeEach(() => {
		originalWebSocket = globalThis.WebSocket;
		(globalThis as unknown as Record<string, unknown>).WebSocket = class extends MockWebSocket {
			constructor(url: string) {
				super(url);
				lastCreatedWs = this;
			}
		};
		// Also set static constants on the replacement
		(globalThis.WebSocket as unknown as Record<string, number>).OPEN = MockWebSocket.OPEN;
		(globalThis.WebSocket as unknown as Record<string, number>).CONNECTING =
			MockWebSocket.CONNECTING;
		(globalThis.WebSocket as unknown as Record<string, number>).CLOSED = MockWebSocket.CLOSED;
		(globalThis.WebSocket as unknown as Record<string, number>).CLOSING = MockWebSocket.CLOSING;
	});

	afterEach(() => {
		(globalThis as unknown as Record<string, unknown>).WebSocket = originalWebSocket;
		vi.restoreAllMocks();
	});

	it("send() queues messages when not connected", async () => {
		const { WebSocketTransport } = await import("../../src/transport/ws-transport.ts");
		const transport = new WebSocketTransport("ws://localhost:1234", { maxRetries: 0 });

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId("n1"), tag: "div" }],
		};

		// WebSocket is still connecting, message should be queued
		transport.send(msg);
		expect(lastCreatedWs.sentMessages).toHaveLength(0);

		// Now open the connection, queued message should be flushed
		lastCreatedWs.simulateOpen();
		expect(lastCreatedWs.sentMessages).toHaveLength(1);
		expect(JSON.parse(lastCreatedWs.sentMessages[0])).toEqual(msg);

		transport.close();
	});

	it("send() delivers messages when open", async () => {
		const { WebSocketTransport } = await import("../../src/transport/ws-transport.ts");
		const transport = new WebSocketTransport("ws://localhost:1234", { maxRetries: 0 });

		lastCreatedWs.simulateOpen();

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};

		transport.send(msg);
		expect(lastCreatedWs.sentMessages).toHaveLength(1);

		transport.close();
	});

	it("close() sets readyState to 'closed'", async () => {
		const { WebSocketTransport } = await import("../../src/transport/ws-transport.ts");
		const transport = new WebSocketTransport("ws://localhost:1234", { maxRetries: 0 });

		lastCreatedWs.simulateOpen();
		expect(transport.readyState).toBe("open");

		transport.close();
		expect(transport.readyState).toBe("closed");
	});

	it("close() clears message queue", async () => {
		const { WebSocketTransport } = await import("../../src/transport/ws-transport.ts");
		const transport = new WebSocketTransport("ws://localhost:1234", { maxRetries: 0 });

		// Queue messages while connecting
		transport.send({
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		});

		transport.close();

		// Messages should not be flushed even if we somehow open the ws
		expect(lastCreatedWs.sentMessages).toHaveLength(0);
	});

	it("onMessage handler receives parsed JSON messages", async () => {
		const { WebSocketTransport } = await import("../../src/transport/ws-transport.ts");
		const transport = new WebSocketTransport("ws://localhost:1234", { maxRetries: 0 });

		const received: Message[] = [];
		transport.onMessage((msg) => received.push(msg));

		lastCreatedWs.simulateOpen();

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};
		lastCreatedWs.simulateMessage(msg);

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual(msg);

		transport.close();
	});

	it("readyState transitions: connecting -> open -> closed", async () => {
		const { WebSocketTransport } = await import("../../src/transport/ws-transport.ts");
		const transport = new WebSocketTransport("ws://localhost:1234", { maxRetries: 0 });

		expect(transport.readyState).toBe("connecting");

		lastCreatedWs.simulateOpen();
		expect(transport.readyState).toBe("open");

		transport.close();
		expect(transport.readyState).toBe("closed");
	});
});
