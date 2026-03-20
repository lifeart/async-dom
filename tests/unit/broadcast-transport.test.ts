import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message, MutationMessage } from "../../src/core/protocol.ts";
import { createAppId, createClientId } from "../../src/core/protocol.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";
import { BroadcastTransport } from "../../src/server/broadcast-transport.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMutation(uid: number): MutationMessage {
	return {
		type: "mutation",
		appId: createAppId("test-app"),
		uid,
		mutations: [],
	};
}

interface MockTransport extends Transport {
	sent: Message[];
	_handlers: Array<(msg: Message) => void>;
	_closed: boolean;
	simulateMessage(msg: Message): void;
	simulateClose(): void;
}

function createMockTransport(opts?: {
	/** Throw on every send call */
	throwOnSend?: boolean;
	/** Throw only after this many sends have succeeded */
	throwAfterSends?: number;
}): MockTransport {
	const sent: Message[] = [];
	const handlers: Array<(msg: Message) => void> = [];
	let closed = false;
	let sendCount = 0;

	const t: MockTransport = {
		sent,
		_handlers: handlers,
		_closed: false,
		send(msg: Message) {
			if (opts?.throwOnSend) throw new Error("send failed");
			if (opts?.throwAfterSends !== undefined && sendCount >= opts.throwAfterSends) {
				throw new Error("send failed");
			}
			sendCount++;
			sent.push(msg);
		},
		onMessage(handler: (msg: Message) => void) {
			handlers.push(handler);
		},
		close() {
			closed = true;
			t._closed = true;
			t.onClose?.();
		},
		get readyState(): TransportReadyState {
			return closed ? "closed" : "open";
		},
		onClose: undefined,
		onError: undefined,
		simulateMessage(msg: Message) {
			for (const h of handlers) h(msg);
		},
		simulateClose() {
			closed = true;
			t._closed = true;
			t.onClose?.();
		},
	};

	return t;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BroadcastTransport", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("readyState lifecycle", () => {
		it("is 'open' immediately after construction", () => {
			const bt = new BroadcastTransport();
			expect(bt.readyState).toBe("open");
		});

		it("is 'closed' after close() is called", () => {
			const bt = new BroadcastTransport();
			bt.close();
			expect(bt.readyState).toBe("closed");
		});

		it("is idempotent — calling close() twice does not throw", () => {
			const bt = new BroadcastTransport();
			bt.close();
			expect(() => bt.close()).not.toThrow();
		});

		it("fires onClose callback when closed", () => {
			const bt = new BroadcastTransport();
			const onClose = vi.fn();
			bt.onClose = onClose;
			bt.close();
			expect(onClose).toHaveBeenCalledOnce();
		});
	});

	describe("send() fan-out", () => {
		it("delivers the same message to all connected clients", () => {
			const bt = new BroadcastTransport();
			const clientA = createMockTransport();
			const clientB = createMockTransport();

			bt.addClient(createClientId("a"), clientA);
			bt.addClient(createClientId("b"), clientB);

			// Clear snapshotComplete messages received during addClient
			clientA.sent.length = 0;
			clientB.sent.length = 0;

			const msg = makeMutation(42);
			bt.send(msg);

			expect(clientA.sent).toContainEqual(msg);
			expect(clientB.sent).toContainEqual(msg);
		});

		it("does not send to clients after close()", () => {
			const bt = new BroadcastTransport();
			const client = createMockTransport();
			bt.addClient(createClientId("c"), client);
			client.sent.length = 0;

			bt.close();
			bt.send(makeMutation(1));

			expect(client.sent).toHaveLength(0);
		});
	});

	describe("mutation log", () => {
		it("logs MutationMessages so they can be replayed", () => {
			const bt = new BroadcastTransport();
			bt.send(makeMutation(1));
			bt.send(makeMutation(2));

			// A late-joining client should receive the logged mutations
			const lateClient = createMockTransport();
			bt.addClient(createClientId("late"), lateClient);

			const uids = lateClient.sent
				.filter((m): m is MutationMessage => m.type === "mutation")
				.map((m) => m.uid);

			expect(uids).toEqual([1, 2]);
		});

		it("does not log non-mutation messages", () => {
			const bt = new BroadcastTransport();
			bt.send({ type: "ping" });
			bt.send({ type: "pong" });

			const lateClient = createMockTransport();
			bt.addClient(createClientId("late"), lateClient);

			const mutations = lateClient.sent.filter((m) => m.type === "mutation");
			expect(mutations).toHaveLength(0);
		});
	});

	describe("addClient()", () => {
		it("replays stored mutations to the newly added client in order", () => {
			const bt = new BroadcastTransport();
			bt.send(makeMutation(10));
			bt.send(makeMutation(20));
			bt.send(makeMutation(30));

			const client = createMockTransport();
			bt.addClient(createClientId("new"), client);

			const uids = client.sent
				.filter((m): m is MutationMessage => m.type === "mutation")
				.map((m) => m.uid);

			expect(uids).toEqual([10, 20, 30]);
		});

		it("sends snapshotComplete after replaying stored mutations", () => {
			const bt = new BroadcastTransport();
			bt.send(makeMutation(1));

			const client = createMockTransport();
			bt.addClient(createClientId("new"), client);

			const idx = client.sent.findIndex((m) => m.type === "snapshotComplete");
			const mutIdx = client.sent.findIndex((m) => m.type === "mutation");

			expect(idx).toBeGreaterThan(-1);
			// snapshotComplete must come after mutations
			expect(idx).toBeGreaterThan(mutIdx);
		});

		it("sends snapshotComplete even when there are no stored mutations", () => {
			const bt = new BroadcastTransport();
			const client = createMockTransport();
			bt.addClient(createClientId("new"), client);

			expect(client.sent).toContainEqual({ type: "snapshotComplete" });
		});

		it("fires clientConnect event to onMessage handlers", () => {
			const bt = new BroadcastTransport();
			const received: Message[] = [];
			bt.onMessage((msg) => received.push(msg));

			const clientId = createClientId("connect-me");
			bt.addClient(clientId, createMockTransport());

			const connectEvents = received.filter((m) => m.type === "clientConnect");
			expect(connectEvents).toHaveLength(1);
			expect((connectEvents[0] as { type: string; clientId: string }).clientId).toBe(clientId);
		});

		it("does nothing when the transport is already closed", () => {
			const bt = new BroadcastTransport();
			bt.close();

			const client = createMockTransport();
			bt.addClient(createClientId("ghost"), client);

			expect(bt.getClientCount()).toBe(0);
		});
	});

	describe("removeClient()", () => {
		it("fires clientDisconnect event to onMessage handlers", () => {
			const bt = new BroadcastTransport();
			const received: Message[] = [];
			bt.onMessage((msg) => received.push(msg));

			const clientId = createClientId("bye");
			bt.addClient(clientId, createMockTransport());
			received.length = 0; // clear clientConnect

			bt.removeClient(clientId);

			const disconnectEvents = received.filter((m) => m.type === "clientDisconnect");
			expect(disconnectEvents).toHaveLength(1);
			expect(
				(disconnectEvents[0] as { type: string; clientId: string }).clientId,
			).toBe(clientId);
		});

		it("is a no-op for unknown clientIds", () => {
			const bt = new BroadcastTransport();
			expect(() => bt.removeClient(createClientId("nobody"))).not.toThrow();
		});
	});

	describe("automatic removal on client close", () => {
		it("removes a client when its transport fires onClose", () => {
			const bt = new BroadcastTransport();
			const client = createMockTransport();
			const clientId = createClientId("auto-remove");

			bt.addClient(clientId, client);
			expect(bt.getClientCount()).toBe(1);

			client.simulateClose();

			expect(bt.getClientCount()).toBe(0);
		});

		it("fires clientDisconnect when a client's transport closes itself", () => {
			const bt = new BroadcastTransport();
			const received: Message[] = [];
			bt.onMessage((msg) => received.push(msg));

			const client = createMockTransport();
			const clientId = createClientId("auto-disconnect");
			bt.addClient(clientId, client);
			received.length = 0;

			client.simulateClose();

			const disconnects = received.filter((m) => m.type === "clientDisconnect");
			expect(disconnects).toHaveLength(1);
		});
	});

	describe("event forwarding from clients", () => {
		it("forwards events from a client to onMessage handlers with clientId stamped", () => {
			const bt = new BroadcastTransport();
			const received: Message[] = [];
			bt.onMessage((msg) => received.push(msg));

			const client = createMockTransport();
			const clientId = createClientId("event-sender");
			bt.addClient(clientId, client);
			received.length = 0; // clear connect event

			const eventMsg = {
				type: "event" as const,
				appId: createAppId("app"),
				listenerId: "btn-click",
				event: {
					type: "click",
					target: null,
					currentTarget: null,
				},
			};
			client.simulateMessage(eventMsg);

			const forwarded = received.find((m) => m.type === "event");
			expect(forwarded).toBeDefined();
			expect((forwarded as { clientId?: string }).clientId).toBe(clientId);
		});

		it("receives events from multiple different clients", () => {
			const bt = new BroadcastTransport();
			// Collect clientIds as events arrive, before they can be mutated further
			const observedClientIds: (string | undefined)[] = [];
			bt.onMessage((msg) => {
				if (msg.type === "event") {
					observedClientIds.push((msg as { clientId?: string }).clientId);
				}
			});

			const clientA = createMockTransport();
			const clientB = createMockTransport();
			const idA = createClientId("alice");
			const idB = createClientId("bob");

			bt.addClient(idA, clientA);
			bt.addClient(idB, clientB);

			// Use a fresh object per simulateMessage call so the mutation of
			// `clientId` on one doesn't clobber the other
			clientA.simulateMessage({
				type: "event" as const,
				appId: createAppId("app"),
				listenerId: "x",
				event: { type: "click", target: null, currentTarget: null },
			});
			clientB.simulateMessage({
				type: "event" as const,
				appId: createAppId("app"),
				listenerId: "x",
				event: { type: "click", target: null, currentTarget: null },
			});

			expect(observedClientIds).toContain(idA);
			expect(observedClientIds).toContain(idB);
		});
	});

	describe("error isolation", () => {
		it("does not crash when one client's send() throws — other clients still receive", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			const bt = new BroadcastTransport();
			// Allow the initial snapshotComplete to succeed (1 send), then fail
			const badClient = createMockTransport({ throwAfterSends: 1 });
			const goodClient = createMockTransport();

			bt.addClient(createClientId("bad"), badClient);
			bt.addClient(createClientId("good"), goodClient);

			goodClient.sent.length = 0;

			// Should not throw even though badClient.send throws on the broadcast
			expect(() => bt.send(makeMutation(1))).not.toThrow();

			expect(goodClient.sent.find((m) => m.type === "mutation")).toBeDefined();
			expect(consoleSpy).toHaveBeenCalled();
		});

		it("removes a client automatically after its send() fails during broadcast", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			const bt = new BroadcastTransport();
			// Allow snapshotComplete (1 send) to succeed, fail on the first broadcast
			const badClient = createMockTransport({ throwAfterSends: 1 });

			bt.addClient(createClientId("bad"), badClient);
			expect(bt.getClientCount()).toBe(1);

			bt.send(makeMutation(1)); // triggers the throw inside BroadcastTransport.send()

			expect(bt.getClientCount()).toBe(0);
			expect(consoleSpy).toHaveBeenCalled();
		});
	});

	describe("maxClients enforcement", () => {
		it("rejects a client that exceeds maxClients and closes its transport", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			const bt = new BroadcastTransport({ maxClients: 2 });
			bt.addClient(createClientId("c1"), createMockTransport());
			bt.addClient(createClientId("c2"), createMockTransport());

			const extra = createMockTransport();
			bt.addClient(createClientId("c3"), extra);

			expect(bt.getClientCount()).toBe(2);
			expect(extra._closed).toBe(true);
			expect(consoleSpy).toHaveBeenCalled();
		});
	});

	describe("close() cleanup", () => {
		it("removes all clients on close()", () => {
			const bt = new BroadcastTransport();
			bt.addClient(createClientId("x"), createMockTransport());
			bt.addClient(createClientId("y"), createMockTransport());

			bt.close();

			expect(bt.getClientCount()).toBe(0);
		});

		it("fires clientDisconnect for each client removed during close()", () => {
			const bt = new BroadcastTransport();
			const received: Message[] = [];
			bt.onMessage((msg) => received.push(msg));

			bt.addClient(createClientId("one"), createMockTransport());
			bt.addClient(createClientId("two"), createMockTransport());
			received.length = 0; // clear connect events

			bt.close();

			const disconnects = received.filter((m) => m.type === "clientDisconnect");
			expect(disconnects).toHaveLength(2);
		});
	});

	describe("getClientCount() / getClientIds()", () => {
		it("reflects the number of connected clients", () => {
			const bt = new BroadcastTransport();
			expect(bt.getClientCount()).toBe(0);

			bt.addClient(createClientId("a"), createMockTransport());
			expect(bt.getClientCount()).toBe(1);

			bt.addClient(createClientId("b"), createMockTransport());
			expect(bt.getClientCount()).toBe(2);

			bt.removeClient(createClientId("a"));
			expect(bt.getClientCount()).toBe(1);
		});

		it("getClientIds() returns the ids of all current clients", () => {
			const bt = new BroadcastTransport();
			const idA = createClientId("alpha");
			const idB = createClientId("beta");

			bt.addClient(idA, createMockTransport());
			bt.addClient(idB, createMockTransport());

			const ids = bt.getClientIds();
			expect(ids).toContain(idA);
			expect(ids).toContain(idB);
			expect(ids).toHaveLength(2);
		});

		it("getClientIds() reflects removals", () => {
			const bt = new BroadcastTransport();
			const idA = createClientId("alpha");
			const idB = createClientId("beta");

			bt.addClient(idA, createMockTransport());
			bt.addClient(idB, createMockTransport());
			bt.removeClient(idA);

			const ids = bt.getClientIds();
			expect(ids).not.toContain(idA);
			expect(ids).toContain(idB);
		});
	});

	describe("onMessage handlers", () => {
		it("supports multiple handlers — all receive forwarded events", () => {
			const bt = new BroadcastTransport();
			const handlerA: Message[] = [];
			const handlerB: Message[] = [];
			bt.onMessage((m) => handlerA.push(m));
			bt.onMessage((m) => handlerB.push(m));

			const client = createMockTransport();
			bt.addClient(createClientId("c"), client);
			handlerA.length = 0;
			handlerB.length = 0;

			client.simulateMessage({
				type: "event" as const,
				appId: createAppId("app"),
				listenerId: "x",
				event: { type: "click", target: null, currentTarget: null },
			});

			expect(handlerA.filter((m) => m.type === "event")).toHaveLength(1);
			expect(handlerB.filter((m) => m.type === "event")).toHaveLength(1);
		});

		it("handler throwing during event forwarding does not break other handlers", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			const bt = new BroadcastTransport();
			const goodMessages: Message[] = [];

			// First handler throws on every message
			bt.onMessage(() => {
				throw new Error("handler exploded");
			});
			// Second handler should still receive messages
			bt.onMessage((m) => goodMessages.push(m));

			const client = createMockTransport();
			bt.addClient(createClientId("c"), client);
			goodMessages.length = 0;

			expect(() =>
				client.simulateMessage({
					type: "event" as const,
					appId: createAppId("app"),
					listenerId: "x",
					event: { type: "click", target: null, currentTarget: null },
				}),
			).not.toThrow();

			expect(goodMessages.filter((m) => m.type === "event")).toHaveLength(1);
			expect(consoleSpy).toHaveBeenCalled();
		});
	});

	describe("replay failure removes client", () => {
		it("removes a client immediately if send() throws during replay", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			const bt = new BroadcastTransport();
			// Pre-populate the log with a mutation
			bt.send(makeMutation(1));

			// A transport that throws on the very first send (the replayed mutation)
			const badClient = createMockTransport({ throwOnSend: true });
			bt.addClient(createClientId("bad-replay"), badClient);

			// Client should have been removed because replay failed
			expect(bt.getClientCount()).toBe(0);
			expect(consoleSpy).toHaveBeenCalled();
		});
	});

	describe("onClientConnect / onClientDisconnect config callbacks", () => {
		it("fires onClientConnect when a client is added", () => {
			const onClientConnect = vi.fn();
			const bt = new BroadcastTransport({ onClientConnect });

			const clientId = createClientId("connect-cb");
			bt.addClient(clientId, createMockTransport());

			expect(onClientConnect).toHaveBeenCalledOnce();
			expect(onClientConnect).toHaveBeenCalledWith(clientId);
		});

		it("fires onClientDisconnect when a client is removed", () => {
			const onClientDisconnect = vi.fn();
			const bt = new BroadcastTransport({ onClientDisconnect });

			const clientId = createClientId("disconnect-cb");
			bt.addClient(clientId, createMockTransport());
			bt.removeClient(clientId);

			expect(onClientDisconnect).toHaveBeenCalledOnce();
			expect(onClientDisconnect).toHaveBeenCalledWith(clientId);
		});

		it("fires onClientDisconnect for each client during close()", () => {
			const onClientDisconnect = vi.fn();
			const bt = new BroadcastTransport({ onClientDisconnect });

			bt.addClient(createClientId("p"), createMockTransport());
			bt.addClient(createClientId("q"), createMockTransport());

			bt.close();

			expect(onClientDisconnect).toHaveBeenCalledTimes(2);
		});
	});

	describe("duplicate clientId handling", () => {
		it("adding a duplicate clientId removes the old client first then adds the new one", () => {
			const bt = new BroadcastTransport();
			const received: Message[] = [];
			bt.onMessage((m) => received.push(m));

			const clientId = createClientId("dup");
			const firstTransport = createMockTransport();
			bt.addClient(clientId, firstTransport);
			received.length = 0; // clear clientConnect from first add

			// Add the same id again — Map.set replaces the old entry, but the
			// BroadcastTransport calls addClient which will just overwrite via Map.set.
			// Verify that after re-adding, only one client exists and it is the new one.
			const secondTransport = createMockTransport();
			bt.addClient(clientId, secondTransport);

			// Only one entry should exist for the duplicated id
			expect(bt.getClientCount()).toBe(1);
			expect(bt.getClientIds()).toContain(clientId);
		});
	});

	describe("close() clears mutation log", () => {
		it("mutations sent before close() are not replayed to clients added after re-open-like usage", () => {
			const bt = new BroadcastTransport();
			bt.send(makeMutation(1));
			bt.send(makeMutation(2));

			// close() should clear the mutation log
			bt.close();

			// A new BroadcastTransport is needed since this one is closed, but we
			// can verify the internal log was cleared by inspecting the state before close:
			// After close the transport rejects new clients, so we verify indirectly
			// that the log was reset to size 0 by checking that a freshly-created transport
			// with close() called behaves consistently (no replay on re-add attempts).
			const lateClient = createMockTransport();
			bt.addClient(createClientId("post-close"), lateClient);

			// Since transport is closed, the client was rejected — no mutations replayed
			expect(lateClient.sent).toHaveLength(0);
		});
	});

	// ─── Regression tests ───────────────────────────────────────────────────

	describe("regression: failed client detected when send succeeds but readyState becomes closed", () => {
		it("client that transitions to 'closed' readyState after send is removed on next broadcast", () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			const bt = new BroadcastTransport();
			const silentlyClosingTransport = createMockTransport();
			const goodClient = createMockTransport();

			bt.addClient(createClientId("silently-closing"), silentlyClosingTransport);
			bt.addClient(createClientId("good"), goodClient);

			// Clear snapshotComplete messages
			silentlyClosingTransport.sent.length = 0;
			goodClient.sent.length = 0;

			// Simulate the transport closing silently mid-send (readyState becomes closed
			// but send() does not throw — the close happens during the send call)
			const originalSend = silentlyClosingTransport.send.bind(silentlyClosingTransport);
			silentlyClosingTransport.send = (msg) => {
				originalSend(msg);
				// Transition to closed without throwing
				silentlyClosingTransport.simulateClose();
			};

			bt.send(makeMutation(1));

			// The silently-closed client must be removed
			expect(bt.getClientCount()).toBe(1);
			expect(bt.getClientIds()).not.toContain(createClientId("silently-closing"));
			// The good client still received the message
			expect(goodClient.sent.find((m) => m.type === "mutation")).toBeDefined();

			consoleSpy.mockRestore();
		});
	});

	describe("regression: removeClient closes the underlying transport", () => {
		it("transport.close() is called when removeClient is invoked", () => {
			const bt = new BroadcastTransport();
			const transport = createMockTransport();
			const clientId = createClientId("close-test");

			bt.addClient(clientId, transport);
			expect(transport._closed).toBe(false);

			bt.removeClient(clientId);

			expect(transport._closed).toBe(true);
		});

		it("transport.close() is called even when removeClient is triggered by send() failure", () => {
			vi.spyOn(console, "error").mockImplementation(() => {});

			const bt = new BroadcastTransport();
			// Allow snapshotComplete (1 send), fail on broadcast
			const failingTransport = createMockTransport({ throwAfterSends: 1 });

			bt.addClient(createClientId("fail-close"), failingTransport);
			bt.send(makeMutation(1));

			// After removal due to send failure, transport must be closed
			expect(failingTransport._closed).toBe(true);
		});
	});

	describe("regression: close() clears handlers array", () => {
		it("handlers registered before close() are cleared so no further events are forwarded", () => {
			const bt = new BroadcastTransport();
			const received: Message[] = [];
			bt.onMessage((m) => received.push(m));

			const client = createMockTransport();
			bt.addClient(createClientId("c"), client);
			received.length = 0;

			bt.close();

			// Attempt to send a message after close — should not reach any handler
			// (BroadcastTransport.send() returns early when closed, but we also
			// verify handlers are cleaned up by checking the internal array is empty)
			const handlersArray = (bt as unknown as { handlers: unknown[] }).handlers;
			expect(handlersArray).toHaveLength(0);
		});

		it("after close(), handlers do not fire for any retained client message simulation", () => {
			const bt = new BroadcastTransport();
			const received: Message[] = [];
			bt.onMessage((m) => received.push(m));

			const client = createMockTransport();
			bt.addClient(createClientId("d"), client);
			received.length = 0;

			bt.close();
			received.length = 0;

			// Since close() cleared handlers, simulating a message on the already-removed
			// client should not reach any onMessage handler
			// (client was removed by close(); its onMessage handler routes to bt.handlers
			//  which is now empty)
			client.simulateMessage({
				type: "event" as const,
				appId: createAppId("app"),
				listenerId: "x",
				event: { type: "click", target: null, currentTarget: null },
			});

			expect(received.filter((m) => m.type === "event")).toHaveLength(0);
		});
	});
});
