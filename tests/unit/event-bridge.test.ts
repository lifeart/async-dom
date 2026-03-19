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

	it("constructor creates instance with appId", () => {
		const b = new EventBridge(createAppId("my-app"));
		expect(b).toBeInstanceOf(EventBridge);
	});

	it("setTransport stores transport", () => {
		// If transport was not stored, sending an event would not work
		const div = document.createElement("div");
		div.id = "transport-test";
		document.body.appendChild(div);
		nodeCache.set(createNodeId("transport-test"), div);

		bridge.attach(createNodeId("transport-test"), "click", "listener-1");
		div.click();

		expect(transport.sent).toHaveLength(1);
	});

	it("attach() adds event listener to node", () => {
		const div = document.createElement("div");
		div.id = "attach-test";
		document.body.appendChild(div);
		nodeCache.set(createNodeId("attach-test"), div);

		bridge.attach(createNodeId("attach-test"), "click", "listener-attach");
		div.click();

		expect(transport.sent).toHaveLength(1);
		expect(transport.sent[0].type).toBe("event");
	});

	it("attach() with non-existent node is a no-op", () => {
		// Should not throw
		bridge.attach(createNodeId("nonexistent"), "click", "listener-noop");
		expect(transport.sent).toHaveLength(0);
	});

	it("detach() aborts the listener via AbortController", () => {
		const div = document.createElement("div");
		div.id = "detach-test";
		document.body.appendChild(div);
		nodeCache.set(createNodeId("detach-test"), div);

		bridge.attach(createNodeId("detach-test"), "click", "listener-detach");
		bridge.detach("listener-detach");

		div.click();
		expect(transport.sent).toHaveLength(0);
	});

	it("detachAll() aborts all listeners", () => {
		const div1 = document.createElement("div");
		div1.id = "detach-all-1";
		document.body.appendChild(div1);
		nodeCache.set(createNodeId("detach-all-1"), div1);

		const div2 = document.createElement("div");
		div2.id = "detach-all-2";
		document.body.appendChild(div2);
		nodeCache.set(createNodeId("detach-all-2"), div2);

		bridge.attach(createNodeId("detach-all-1"), "click", "listener-a");
		bridge.attach(createNodeId("detach-all-2"), "click", "listener-b");
		bridge.detachAll();

		div1.click();
		div2.click();
		expect(transport.sent).toHaveLength(0);
	});

	it("serialized event includes correct properties for click events", () => {
		const div = document.createElement("div");
		div.id = "click-props";
		document.body.appendChild(div);
		nodeCache.set(createNodeId("click-props"), div);

		bridge.attach(createNodeId("click-props"), "click", "listener-click-props");
		div.click();

		expect(transport.sent).toHaveLength(1);
		const msg = transport.sent[0];
		expect(msg.type).toBe("event");
		if (msg.type === "event") {
			expect(msg.event.type).toBe("click");
			expect(msg.event).toHaveProperty("bubbles");
			expect(msg.event).toHaveProperty("cancelable");
			// Mouse event properties
			expect(msg.event).toHaveProperty("clientX");
			expect(msg.event).toHaveProperty("clientY");
			expect(msg.event).toHaveProperty("button");
		}
	});

	it("serialized event includes keyboard properties for keydown", () => {
		const div = document.createElement("div");
		div.id = "kbd-test";
		document.body.appendChild(div);
		nodeCache.set(createNodeId("kbd-test"), div);

		bridge.attach(createNodeId("kbd-test"), "keydown", "listener-kbd");
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
		// We can't directly verify the passive flag, but we can verify that
		// attaching scroll/touchstart listeners does not throw.
		// The implementation uses isPassiveEvent to set passive: true.
		const div = document.createElement("div");
		div.id = "passive-test";
		document.body.appendChild(div);
		nodeCache.set(createNodeId("passive-test"), div);

		// These should not throw
		bridge.attach(createNodeId("passive-test"), "scroll", "listener-scroll");
		bridge.attach(createNodeId("passive-test"), "touchstart", "listener-touch");

		// Dispatch scroll event
		const scrollEvent = new Event("scroll", { bubbles: true });
		div.dispatchEvent(scrollEvent);

		expect(transport.sent).toHaveLength(1);
		expect(transport.sent[0].type).toBe("event");
	});

	it("preventDefault only called on anchor click events, not other event types", () => {
		// Test with an anchor element
		const anchor = document.createElement("a");
		anchor.id = "anchor-test";
		anchor.href = "https://example.com";
		document.body.appendChild(anchor);
		nodeCache.set(createNodeId("anchor-test"), anchor);

		bridge.attach(createNodeId("anchor-test"), "click", "listener-anchor");

		const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
		const preventSpy = vi.spyOn(clickEvent, "preventDefault");
		anchor.dispatchEvent(clickEvent);

		expect(preventSpy).toHaveBeenCalled();

		// Now test with a non-anchor element
		const div = document.createElement("div");
		div.id = "non-anchor-test";
		document.body.appendChild(div);
		nodeCache.set(createNodeId("non-anchor-test"), div);

		bridge.attach(createNodeId("non-anchor-test"), "click", "listener-non-anchor");

		const divClickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
		const preventSpy2 = vi.spyOn(divClickEvent, "preventDefault");
		div.dispatchEvent(divClickEvent);

		expect(preventSpy2).not.toHaveBeenCalled();
	});
});
