import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message, MutationMessage } from "../../src/core/protocol.ts";
import { createAppId, createClientId } from "../../src/core/protocol.ts";
import { createStreamingServer } from "../../src/server/streaming-server.ts";
import type { WebSocketLike } from "../../src/transport/ws-server-transport.ts";

// ---------------------------------------------------------------------------
// MockWebSocket — minimal WebSocketLike for tests
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
// Helpers
// ---------------------------------------------------------------------------

function _makeMutation(uid: number): MutationMessage {
	return {
		type: "mutation",
		appId: createAppId("test-app"),
		uid,
		mutations: [],
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createStreamingServer", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("returned interface shape", () => {
		it("returns an object with the expected methods and properties", () => {
			const server = createStreamingServer({ createApp: () => {} });

			expect(typeof server.handleConnection).toBe("function");
			expect(typeof server.disconnectClient).toBe("function");
			expect(typeof server.getClientCount).toBe("function");
			expect(typeof server.getClientIds).toBe("function");
			expect(typeof server.getDom).toBe("function");
			expect(typeof server.destroy).toBe("function");
			expect(server.ready).toBeInstanceOf(Promise);

			server.destroy();
		});

		it("getDom() returns a WorkerDomResult with document and window", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const dom = server.getDom();

			expect(dom.document).toBeDefined();
			expect(dom.window).toBeDefined();
			expect(dom.document.body.tagName).toBe("BODY");

			server.destroy();
		});
	});

	describe("handleConnection()", () => {
		it("returns a ClientId string", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const socket = new MockWebSocket();

			const id = server.handleConnection(socket);
			expect(typeof id).toBe("string");
			expect(id.length).toBeGreaterThan(0);

			server.destroy();
		});

		it("increments a counter for auto-generated clientIds", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const id1 = server.handleConnection(new MockWebSocket());
			const id2 = server.handleConnection(new MockWebSocket());

			expect(id1).not.toBe(id2);

			server.destroy();
		});

		it("uses the custom clientId parameter when provided", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const socket = new MockWebSocket();
			const id = server.handleConnection(socket, "my-custom-id");

			expect(id).toBe("my-custom-id");

			server.destroy();
		});

		it("increments getClientCount() for each new connection", () => {
			const server = createStreamingServer({ createApp: () => {} });

			expect(server.getClientCount()).toBe(0);

			server.handleConnection(new MockWebSocket());
			expect(server.getClientCount()).toBe(1);

			server.handleConnection(new MockWebSocket());
			expect(server.getClientCount()).toBe(2);

			server.destroy();
		});

		it("sends snapshotComplete to every newly connected client", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const socket = new MockWebSocket();

			server.handleConnection(socket);

			const snapshots = socket.parsedMessages.filter((m) => m.type === "snapshotComplete");
			expect(snapshots).toHaveLength(1);

			server.destroy();
		});
	});

	describe("mutation broadcasting", () => {
		it("multiple clients receive the same mutations emitted by the app", () => {
			const server = createStreamingServer({
				createApp: () => {},
			});

			const socketA = new MockWebSocket();
			const socketB = new MockWebSocket();

			server.handleConnection(socketA);
			server.handleConnection(socketB);

			// Clear setup messages
			socketA.sentMessages.length = 0;
			socketB.sentMessages.length = 0;

			// Trigger a real DOM mutation via the document
			const dom = server.getDom();
			const el = dom.document.createElement("div");
			dom.document.body.appendChild(el);
			dom.document.collector.flushSync();

			const msgsA = socketA.parsedMessages.filter((m) => m.type === "mutation");
			const msgsB = socketB.parsedMessages.filter((m) => m.type === "mutation");

			expect(msgsA.length).toBeGreaterThan(0);
			expect(msgsB.length).toBeGreaterThan(0);

			server.destroy();
		});

		it("late joiner receives replayed mutations then a snapshotComplete then live mutations", () => {
			const server = createStreamingServer({ createApp: () => {} });

			// First client connects early
			const earlySocket = new MockWebSocket();
			server.handleConnection(earlySocket);

			// Produce mutations
			const dom = server.getDom();
			const el = dom.document.createElement("p");
			dom.document.body.appendChild(el);
			dom.document.collector.flushSync();

			// Late client connects after mutations already in the log
			const lateSocket = new MockWebSocket();
			server.handleConnection(lateSocket);

			const msgs = lateSocket.parsedMessages;
			const mutationIdx = msgs.findIndex((m) => m.type === "mutation");
			const snapshotIdx = msgs.findIndex((m) => m.type === "snapshotComplete");

			// Late client should have received at least one mutation replayed
			expect(mutationIdx).toBeGreaterThan(-1);
			// snapshotComplete should follow the replayed mutations
			expect(snapshotIdx).toBeGreaterThan(mutationIdx);

			server.destroy();
		});
	});

	describe("disconnectClient()", () => {
		it("removes the client so getClientCount() decreases", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const socket = new MockWebSocket();
			const id = server.handleConnection(socket);

			expect(server.getClientCount()).toBe(1);

			server.disconnectClient(id);

			expect(server.getClientCount()).toBe(0);

			server.destroy();
		});

		it("after disconnect the client no longer receives new mutations", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const socket = new MockWebSocket();
			const id = server.handleConnection(socket);

			server.disconnectClient(id);
			socket.sentMessages.length = 0;

			const dom = server.getDom();
			const el = dom.document.createElement("span");
			dom.document.body.appendChild(el); // triggers a broadcast mutation
			dom.document.collector.flushSync();

			const mutations = socket.parsedMessages.filter((m) => m.type === "mutation");
			expect(mutations).toHaveLength(0);

			server.destroy();
		});
	});

	describe("getClientIds()", () => {
		it("returns the ids of all connected clients", () => {
			const server = createStreamingServer({ createApp: () => {} });

			const id1 = server.handleConnection(new MockWebSocket(), "alice");
			const id2 = server.handleConnection(new MockWebSocket(), "bob");

			const ids = server.getClientIds();
			expect(ids).toContain(id1);
			expect(ids).toContain(id2);

			server.destroy();
		});
	});

	describe("destroy()", () => {
		it("reduces client count to 0", () => {
			const server = createStreamingServer({ createApp: () => {} });
			server.handleConnection(new MockWebSocket());
			server.handleConnection(new MockWebSocket());

			server.destroy();

			expect(server.getClientCount()).toBe(0);
		});

		it("can be called multiple times without throwing", () => {
			const server = createStreamingServer({ createApp: () => {} });
			server.destroy();
			expect(() => server.destroy()).not.toThrow();
		});

		it("DOM mutations after destroy() are not forwarded to clients", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const socket = new MockWebSocket();
			server.handleConnection(socket);

			server.destroy();
			socket.sentMessages.length = 0;

			// Attempting DOM ops after destroy should not forward anything
			try {
				server.getDom().document.createElement("div");
				server.getDom().document.collector.flushSync();
			} catch {
				// destroy may make dom operations throw — that is acceptable
			}

			const mutations = socket.parsedMessages.filter((m) => m.type === "mutation");
			expect(mutations).toHaveLength(0);
		});
	});

	describe("ready promise", () => {
		it("resolves after a synchronous createApp finishes", async () => {
			const server = createStreamingServer({ createApp: () => {} });
			await expect(server.ready).resolves.toBeUndefined();
			server.destroy();
		});

		it("resolves after an async createApp resolves", async () => {
			let resolve!: () => void;
			const p = new Promise<void>((r) => {
				resolve = r;
			});

			const server = createStreamingServer({ createApp: () => p });
			resolve();

			await expect(server.ready).resolves.toBeUndefined();
			server.destroy();
		});

		it("resolves even when createApp throws synchronously", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			const server = createStreamingServer({
				createApp: () => {
					throw new Error("app crash");
				},
			});

			await expect(server.ready).resolves.toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(
				"[async-dom] Streaming server app error:",
				expect.any(Error),
			);

			server.destroy();
		});

		it("resolves even when createApp returns a rejecting promise", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			const server = createStreamingServer({
				createApp: () => Promise.reject(new Error("async crash")),
			});

			await expect(server.ready).resolves.toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(
				"[async-dom] Streaming server app error:",
				expect.any(Error),
			);

			server.destroy();
		});
	});

	describe("edge cases", () => {
		it("handleConnection after destroy() does not crash", () => {
			const server = createStreamingServer({ createApp: () => {} });
			server.destroy();

			const socket = new MockWebSocket();
			expect(() => server.handleConnection(socket)).not.toThrow();
		});

		it("disconnectClient with an unknown ID does not throw", () => {
			const server = createStreamingServer({ createApp: () => {} });

			expect(() => server.disconnectClient(createClientId("no-such-client"))).not.toThrow();

			server.destroy();
		});

		it("destroy() actually cleans up DOM — document is still accessible but _defaultView is null", () => {
			const server = createStreamingServer({ createApp: () => {} });
			const dom = server.getDom();

			server.destroy();

			// getDom() still returns the same object
			expect(server.getDom()).toBe(dom);
			// destroy() clears _defaultView on the document
			expect((dom.document as unknown as { _defaultView: unknown })._defaultView).toBeNull();
		});

		it("resolves after sync createApp and createApp was actually called", async () => {
			let called = false;
			const server = createStreamingServer({
				createApp: () => {
					called = true;
				},
			});

			await expect(server.ready).resolves.toBeUndefined();
			expect(called).toBe(true);

			server.destroy();
		});
	});

	describe("events from clients carry different clientIds", () => {
		it("events forwarded from two clients have distinct clientIds", () => {
			// Capture the clientIds seen on forwarded event messages by tapping into
			// the BroadcastTransport (which IS the collector transport) via its
			// onMessage API, accessed through the collector's internal transport field.
			const forwardedClientIds: (string | undefined)[] = [];

			const server = createStreamingServer({
				createApp: () => {},
			});

			// The BroadcastTransport is the transport set on doc.collector.
			// Access it via the (private) field through a cast so we can register
			// an additional onMessage handler to capture forwarded events before
			// they are processed by createWorkerDom's internal handler.
			const dom = server.getDom();
			const broadcastTransport = (
				dom.document.collector as unknown as {
					transport: import("../../src/transport/base.ts").Transport;
				}
			).transport;
			broadcastTransport.onMessage((msg) => {
				if (msg.type === "event") {
					forwardedClientIds.push((msg as { clientId?: string }).clientId);
				}
			});

			const socketA = new MockWebSocket();
			const socketB = new MockWebSocket();
			const idA = server.handleConnection(socketA, "client-alice");
			const idB = server.handleConnection(socketB, "client-bob");

			const makeEventMsg = () => ({
				type: "event" as const,
				appId: createAppId("test-app"),
				listenerId: "click-1",
				event: { type: "click", target: null, currentTarget: null },
			});

			socketA.simulateMessage(makeEventMsg());
			socketB.simulateMessage(makeEventMsg());

			// Both events must have been forwarded with the correct clientId stamped
			expect(forwardedClientIds).toContain(idA);
			expect(forwardedClientIds).toContain(idB);
			expect(forwardedClientIds[0]).not.toBe(forwardedClientIds[1]);

			server.destroy();
		});
	});
});
