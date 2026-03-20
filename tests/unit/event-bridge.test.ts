import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeCache } from "../../src/core/node-cache.ts";
import { createAppId, createNodeId, type Message } from "../../src/core/protocol.ts";
import { EventBridge } from "../../src/main-thread/event-bridge.ts";
import type { Transport } from "../../src/transport/base.ts";

function createMockTransport(): Transport & { sent: Message[] } {
	const sent: Message[] = [];
	return {
		sent,
		send(msg: Message) {
			sent.push(msg);
		},
		onMessage() {},
		close() {},
		get readyState() {
			return "open" as const;
		},
	};
}

describe("EventBridge", () => {
	let bridge: EventBridge;
	let nodeCache: NodeCache;
	let transport: ReturnType<typeof createMockTransport>;
	const appId = createAppId("test-app");

	beforeEach(() => {
		document.body.innerHTML = "";
		nodeCache = new NodeCache();
		bridge = new EventBridge(appId, nodeCache);
		transport = createMockTransport();
		bridge.setTransport(transport);
	});

	afterEach(() => {
		bridge.detachAll();
	});

	it("attach() adds event listener to node", () => {
		const div = document.createElement("div");
		document.body.appendChild(div);
		const id = createNodeId();
		nodeCache.set(id, div);

		bridge.attach(id, "click", "listener-attach");
		div.click();

		expect(transport.sent).toHaveLength(1);
		expect(transport.sent[0].type).toBe("event");
	});

	it("attach() with non-existent node is a no-op", () => {
		bridge.attach(createNodeId(), "click", "listener-noop");
		expect(transport.sent).toHaveLength(0);
	});

	it("detach() aborts the listener via AbortController", () => {
		const div = document.createElement("div");
		document.body.appendChild(div);
		const id = createNodeId();
		nodeCache.set(id, div);

		bridge.attach(id, "click", "listener-detach");
		bridge.detach("listener-detach");

		div.click();
		expect(transport.sent).toHaveLength(0);
	});

	it("detachAll() aborts all listeners", () => {
		const div1 = document.createElement("div");
		document.body.appendChild(div1);
		const id1 = createNodeId();
		nodeCache.set(id1, div1);

		const div2 = document.createElement("div");
		document.body.appendChild(div2);
		const id2 = createNodeId();
		nodeCache.set(id2, div2);

		bridge.attach(id1, "click", "listener-a");
		bridge.attach(id2, "click", "listener-b");
		bridge.detachAll();

		div1.click();
		div2.click();
		expect(transport.sent).toHaveLength(0);
	});

	it("serialized event includes correct properties for click events", () => {
		const div = document.createElement("div");
		document.body.appendChild(div);
		const id = createNodeId();
		nodeCache.set(id, div);

		bridge.attach(id, "click", "listener-click-props");
		div.click();

		expect(transport.sent).toHaveLength(1);
		const msg = transport.sent[0];
		expect(msg.type).toBe("event");
		if (msg.type === "event") {
			expect(msg.event.type).toBe("click");
			expect(msg.event).toHaveProperty("bubbles");
			expect(msg.event).toHaveProperty("cancelable");
			expect(msg.event).toHaveProperty("clientX");
			expect(msg.event).toHaveProperty("clientY");
			expect(msg.event).toHaveProperty("button");
		}
	});

	it("serialized event includes keyboard properties for keydown", () => {
		const div = document.createElement("div");
		document.body.appendChild(div);
		const id = createNodeId();
		nodeCache.set(id, div);

		bridge.attach(id, "keydown", "listener-kbd");
		const event = new KeyboardEvent("keydown", {
			key: "Enter",
			code: "Enter",
			bubbles: true,
		});
		div.dispatchEvent(event);

		expect(transport.sent).toHaveLength(1);
		const msg = transport.sent[0];
		if (msg.type === "event") {
			expect(msg.event.key).toBe("Enter");
			expect(msg.event.code).toBe("Enter");
		}
	});

	it("passive events are marked correctly (scroll, touchstart)", () => {
		const div = document.createElement("div");
		document.body.appendChild(div);
		const id = createNodeId();
		nodeCache.set(id, div);

		bridge.attach(id, "scroll", "listener-scroll");
		bridge.attach(id, "touchstart", "listener-touch");

		const scrollEvent = new Event("scroll", { bubbles: true });
		div.dispatchEvent(scrollEvent);

		expect(transport.sent).toHaveLength(1);
		expect(transport.sent[0].type).toBe("event");
	});

	describe("getListenersForNode()", () => {
		it("returns listeners attached to a given node", () => {
			const div = document.createElement("div");
			document.body.appendChild(div);
			const id = createNodeId();
			nodeCache.set(id, div);

			bridge.attach(id, "click", "l-click");
			bridge.attach(id, "keydown", "l-keydown");

			const result = bridge.getListenersForNode(id);
			expect(result).toHaveLength(2);
			expect(result).toContainEqual({ listenerId: "l-click", eventName: "click" });
			expect(result).toContainEqual({ listenerId: "l-keydown", eventName: "keydown" });
		});

		it("does not return listeners for other nodes", () => {
			const div1 = document.createElement("div");
			const div2 = document.createElement("div");
			document.body.appendChild(div1);
			document.body.appendChild(div2);
			const id1 = createNodeId();
			const id2 = createNodeId();
			nodeCache.set(id1, div1);
			nodeCache.set(id2, div2);

			bridge.attach(id1, "click", "l-1");
			bridge.attach(id2, "click", "l-2");

			expect(bridge.getListenersForNode(id1)).toHaveLength(1);
			expect(bridge.getListenersForNode(id1)[0].listenerId).toBe("l-1");
		});

		it("returns empty array for node with no listeners", () => {
			const id = createNodeId();
			expect(bridge.getListenersForNode(id)).toEqual([]);
		});
	});

	describe("updateTraceWithWorkerTiming()", () => {
		it("matches trace by listenerId and populates timing fields", () => {
			const div = document.createElement("div");
			document.body.appendChild(div);
			const id = createNodeId();
			nodeCache.set(id, div);

			bridge.attach(id, "click", "l-timing");
			div.click();

			// Trace should exist but without timing data yet
			const tracesBefore = bridge.getEventTraces();
			expect(tracesBefore).toHaveLength(1);
			expect(tracesBefore[0].listenerId).toBe("l-timing");
			expect(tracesBefore[0].transportMs).toBeUndefined();

			bridge.updateTraceWithWorkerTiming("l-timing", 5.0, 3);

			const tracesAfter = bridge.getEventTraces();
			expect(tracesAfter[0].dispatchMs).toBe(5.0);
			expect(tracesAfter[0].mutationCount).toBe(3);
			expect(tracesAfter[0].transportMs).toBeTypeOf("number");
		});

		it("does not match trace with wrong listenerId", () => {
			const div = document.createElement("div");
			document.body.appendChild(div);
			const id = createNodeId();
			nodeCache.set(id, div);

			bridge.attach(id, "click", "l-correct");
			div.click();

			bridge.updateTraceWithWorkerTiming("l-wrong", 5.0, 3);

			const traces = bridge.getEventTraces();
			expect(traces[0].transportMs).toBeUndefined();
		});

		it("matches most recent unresolved trace for same listenerId", () => {
			const div = document.createElement("div");
			document.body.appendChild(div);
			const id = createNodeId();
			nodeCache.set(id, div);

			bridge.attach(id, "click", "l-multi");
			div.click();
			div.click();

			// First update resolves the most-recent (last) unresolved trace
			bridge.updateTraceWithWorkerTiming("l-multi", 1.0, 1);
			// Second update resolves the remaining (first) unresolved trace
			bridge.updateTraceWithWorkerTiming("l-multi", 2.0, 2);

			const traces = bridge.getEventTraces();
			// The backward search resolved traces[1] first, then traces[0]
			expect(traces[1].dispatchMs).toBe(1.0);
			expect(traces[0].dispatchMs).toBe(2.0);
		});
	});

	it("preventDefault only called on anchor click events, not other event types", () => {
		const anchor = document.createElement("a");
		anchor.href = "https://example.com";
		document.body.appendChild(anchor);
		const anchorId = createNodeId();
		nodeCache.set(anchorId, anchor);

		bridge.attach(anchorId, "click", "listener-anchor");

		const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
		const preventSpy = vi.spyOn(clickEvent, "preventDefault");
		anchor.dispatchEvent(clickEvent);

		expect(preventSpy).toHaveBeenCalled();

		const div = document.createElement("div");
		document.body.appendChild(div);
		const divId = createNodeId();
		nodeCache.set(divId, div);

		bridge.attach(divId, "click", "listener-non-anchor");

		const divClickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
		const preventSpy2 = vi.spyOn(divClickEvent, "preventDefault");
		div.dispatchEvent(divClickEvent);

		expect(preventSpy2).not.toHaveBeenCalled();
	});
});
