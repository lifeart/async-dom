/**
 * Streaming server integration tests.
 *
 * Tests the full streaming pipeline end-to-end:
 *  - createStreamingServer with a real app that creates DOM elements
 *  - MockWebSocket clients connected via handleConnection
 *  - Verification of mutation delivery, replay, snapshotComplete, and cleanup
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Message } from "../../src/core/protocol.ts";
import type { WebSocketLike } from "../../src/transport/ws-server-transport.ts";
import { createStreamingServer } from "../../src/server/streaming-server.ts";

// ---------------------------------------------------------------------------
// MockWebSocket — minimal WebSocketLike for tests (same pattern as unit tests)
// ---------------------------------------------------------------------------

class MockWebSocket implements WebSocketLike {
	readyState = 1; // OPEN
	bufferedAmount = 0;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code: number; reason: string }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	sentMessages: string[] = [];

	get parsedMessages(): Message[] {
		return this.sentMessages.map((s) => JSON.parse(s) as Message);
	}

	send(data: string): void {
		this.sentMessages.push(data);
	}

	close(code?: number, reason?: string): void {
		this.readyState = 3;
		this.onclose?.({ code: code ?? 1000, reason: reason ?? "" });
	}

	simulateMessage(msg: Message): void {
		this.onmessage?.({ data: JSON.stringify(msg) });
	}

	simulateClose(code = 1000, reason = ""): void {
		this.readyState = 3;
		this.onclose?.({ code, reason });
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Streaming server full round-trip", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("first client receives mutations from DOM operations in createApp", () => {
		const server = createStreamingServer({
			createApp: ({ document: doc }) => {
				const div = doc.createElement("div");
				doc.body.appendChild(div);
				doc.collector.flushSync();
			},
		});

		const socket = new MockWebSocket();
		server.handleConnection(socket);

		const mutations = socket.parsedMessages.filter((m) => m.type === "mutation");
		expect(mutations.length).toBeGreaterThan(0);

		server.destroy();
	});

	it("first client receives snapshotComplete after connecting", () => {
		const server = createStreamingServer({ createApp: () => {} });

		const socket = new MockWebSocket();
		server.handleConnection(socket);

		const snapshots = socket.parsedMessages.filter((m) => m.type === "snapshotComplete");
		expect(snapshots).toHaveLength(1);

		server.destroy();
	});

	it("second client receives replay of mutations + snapshotComplete + live mutations", () => {
		const server = createStreamingServer({ createApp: () => {} });

		// First client connects
		const firstSocket = new MockWebSocket();
		server.handleConnection(firstSocket);

		// Produce some mutations with a known tag so we can verify replay content
		const dom = server.getDom();
		const div = dom.document.createElement("div");
		dom.document.body.appendChild(div);
		dom.document.collector.flushSync();

		// Second client connects later — should get replayed mutations
		const secondSocket = new MockWebSocket();
		server.handleConnection(secondSocket);

		const msgs = secondSocket.parsedMessages;
		const mutationIdx = msgs.findIndex((m) => m.type === "mutation");
		const snapshotIdx = msgs.findIndex((m) => m.type === "snapshotComplete");

		// Late client should receive replayed mutations before snapshotComplete
		expect(mutationIdx).toBeGreaterThan(-1);
		expect(snapshotIdx).toBeGreaterThan(mutationIdx);

		// Verify replay content: at least one replayed mutation must reference the
		// "DIV" tag that was created before the second client joined.
		const replayedMutationMsgs = msgs.slice(mutationIdx, snapshotIdx);
		const allReplayedMutations = replayedMutationMsgs.flatMap(
			(m) => (m as { mutations?: { action: string; tag?: string }[] }).mutations ?? [],
		);
		const hasDivCreateNode = allReplayedMutations.some(
			(m) => m.action === "createNode" && m.tag === "DIV",
		);
		expect(hasDivCreateNode).toBe(true);

		// After snapshotComplete: produce more live mutations
		secondSocket.sentMessages.length = 0;

		const span = dom.document.createElement("span");
		dom.document.body.appendChild(span);
		dom.document.collector.flushSync();

		const liveMutations = secondSocket.parsedMessages.filter((m) => m.type === "mutation");
		expect(liveMutations.length).toBeGreaterThan(0);

		server.destroy();
	});

	it("both clients receive live mutations produced after both connected", () => {
		const server = createStreamingServer({ createApp: () => {} });

		const socketA = new MockWebSocket();
		const socketB = new MockWebSocket();
		server.handleConnection(socketA);
		server.handleConnection(socketB);

		// Clear setup messages
		socketA.sentMessages.length = 0;
		socketB.sentMessages.length = 0;

		// Trigger a real DOM mutation
		const dom = server.getDom();
		const p = dom.document.createElement("p");
		dom.document.body.appendChild(p);
		dom.document.collector.flushSync();

		const msgsA = socketA.parsedMessages.filter((m) => m.type === "mutation");
		const msgsB = socketB.parsedMessages.filter((m) => m.type === "mutation");

		expect(msgsA.length).toBeGreaterThan(0);
		expect(msgsB.length).toBeGreaterThan(0);

		server.destroy();
	});

	it("disconnecting one client does not prevent other from receiving mutations", () => {
		const server = createStreamingServer({ createApp: () => {} });

		const socketA = new MockWebSocket();
		const socketB = new MockWebSocket();
		const idA = server.handleConnection(socketA);
		server.handleConnection(socketB);

		// Disconnect client A
		server.disconnectClient(idA);

		// Clear B's setup messages
		socketB.sentMessages.length = 0;

		const dom = server.getDom();
		const el = dom.document.createElement("article");
		dom.document.body.appendChild(el);
		dom.document.collector.flushSync();

		const msgsB = socketB.parsedMessages.filter((m) => m.type === "mutation");
		expect(msgsB.length).toBeGreaterThan(0);

		// A should receive nothing (it was disconnected before the mutation)
		const afterDisconnectMsgsA = socketA.sentMessages.filter((s) => {
			const m = JSON.parse(s) as Message;
			return m.type === "mutation";
		});
		// A should not get the new mutation (disconnected before it)
		// The A socket got snapshotComplete + possibly initial mutations before disconnect
		// but none of the new ones
		expect(
			afterDisconnectMsgsA.filter(() => true).length,
		).toBe(0);

		server.destroy();
	});

	it("disconnected client receives no new mutations after disconnect", () => {
		const server = createStreamingServer({ createApp: () => {} });

		const socket = new MockWebSocket();
		const id = server.handleConnection(socket);

		// Produce some pre-disconnect mutations so the test is not vacuously true
		const dom = server.getDom();
		const pre = dom.document.createElement("div");
		dom.document.body.appendChild(pre);
		dom.document.collector.flushSync();

		const preMutations = socket.parsedMessages.filter((m) => m.type === "mutation");
		expect(preMutations.length).toBeGreaterThan(0);

		// Disconnect and clear message buffer
		server.disconnectClient(id);
		socket.sentMessages.length = 0;

		// Post-disconnect DOM mutation
		const el = dom.document.createElement("span");
		dom.document.body.appendChild(el);
		dom.document.collector.flushSync();

		// Client must receive NO post-disconnect mutations
		const mutations = socket.parsedMessages.filter((m) => m.type === "mutation");
		expect(mutations).toHaveLength(0);

		server.destroy();
	});

	it("destroy() stops further mutations from being forwarded", () => {
		const server = createStreamingServer({ createApp: () => {} });

		const socket = new MockWebSocket();
		server.handleConnection(socket);

		server.destroy();
		socket.sentMessages.length = 0;

		try {
			server.getDom().document.createElement("div");
			server.getDom().document.collector.flushSync();
		} catch {
			// destroy may render dom operations inert — that is acceptable
		}

		const mutations = socket.parsedMessages.filter((m) => m.type === "mutation");
		expect(mutations).toHaveLength(0);
	});

	it("destroy() reduces client count to 0", () => {
		const server = createStreamingServer({ createApp: () => {} });
		server.handleConnection(new MockWebSocket());
		server.handleConnection(new MockWebSocket());

		server.destroy();

		expect(server.getClientCount()).toBe(0);
	});

	it("app that creates nested DOM tree — clients see all mutations", () => {
		const server = createStreamingServer({
			createApp: ({ document: doc }) => {
				const nav = doc.createElement("nav");
				const ul = doc.createElement("ul");
				const li1 = doc.createElement("li");
				const li2 = doc.createElement("li");
				li1.textContent = "Home";
				li2.textContent = "About";
				ul.appendChild(li1);
				ul.appendChild(li2);
				nav.appendChild(ul);
				doc.body.appendChild(nav);
				doc.collector.flushSync();
			},
		});

		const socket = new MockWebSocket();
		server.handleConnection(socket);

		// Should have received createNode + appendChild mutations for the full tree
		const mutations = socket.parsedMessages.filter((m) => m.type === "mutation");
		expect(mutations.length).toBeGreaterThan(0);

		server.destroy();
	});

	it("setAttribute mutations are received by clients", () => {
		const server = createStreamingServer({ createApp: () => {} });

		const socket = new MockWebSocket();
		server.handleConnection(socket);
		socket.sentMessages.length = 0;

		const dom = server.getDom();
		const div = dom.document.createElement("div");
		dom.document.body.appendChild(div);
		div.setAttribute("data-value", "42");
		dom.document.collector.flushSync();

		const mutations = socket.parsedMessages.filter((m) => m.type === "mutation");
		expect(mutations.length).toBeGreaterThan(0);

		// At least one mutation should carry setAttribute
		const allMutationArrays = mutations.flatMap(
			(m) => (m as { mutations?: { action: string }[] }).mutations ?? [],
		);
		const hasSetAttribute = allMutationArrays.some((m) => m.action === "setAttribute");
		expect(hasSetAttribute).toBe(true);

		server.destroy();
	});
});
