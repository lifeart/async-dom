import { beforeEach, describe, expect, it } from "vitest";
import { createAppId } from "../../src/core/protocol.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import { VirtualEvent, VirtualCustomEvent } from "../../src/worker-thread/events.ts";

describe("VirtualEvent", () => {
	it("creates event with type", () => {
		const event = new VirtualEvent("click");
		expect(event.type).toBe("click");
		expect(event.bubbles).toBe(false);
		expect(event.cancelable).toBe(true);
	});

	it("preventDefault sets defaultPrevented", () => {
		const event = new VirtualEvent("click");
		event.preventDefault();
		expect(event.defaultPrevented).toBe(true);
	});

	it("preventDefault does nothing if not cancelable", () => {
		const event = new VirtualEvent("click", { cancelable: false });
		event.preventDefault();
		expect(event.defaultPrevented).toBe(false);
	});

	it("stopPropagation sets flag", () => {
		const event = new VirtualEvent("click");
		expect(event.propagationStopped).toBe(false);
		event.stopPropagation();
		expect(event.propagationStopped).toBe(true);
	});

	it("stopImmediatePropagation sets both flags", () => {
		const event = new VirtualEvent("click");
		event.stopImmediatePropagation();
		expect(event.propagationStopped).toBe(true);
		expect(event.immediatePropagationStopped).toBe(true);
	});

	it("copies extra properties from init", () => {
		const event = new VirtualEvent("click", { clientX: 100, clientY: 200 });
		expect((event as unknown as Record<string, unknown>).clientX).toBe(100);
		expect((event as unknown as Record<string, unknown>).clientY).toBe(200);
	});
});

describe("VirtualCustomEvent", () => {
	it("has detail property", () => {
		const event = new VirtualCustomEvent("custom", { detail: { foo: "bar" } });
		expect(event.detail).toEqual({ foo: "bar" });
	});

	it("detail defaults to null", () => {
		const event = new VirtualCustomEvent("custom");
		expect(event.detail).toBeNull();
	});
});

describe("Event Bubbling", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("event bubbles up parent chain", () => {
		const grandparent = doc.createElement("div");
		const parent = doc.createElement("div");
		const child = doc.createElement("span");
		grandparent.appendChild(parent);
		parent.appendChild(child);
		doc.body.appendChild(grandparent);

		const calls: string[] = [];

		child.addEventListener("click", () => calls.push("child"));
		parent.addEventListener("click", () => calls.push("parent"));
		grandparent.addEventListener("click", () => calls.push("grandparent"));

		// Get the child's click listener ID
		const listenerId = Array.from(
			(child as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
		)[0];

		doc.dispatchEvent(listenerId, {
			type: "click",
			target: child.id,
			currentTarget: child.id,
			bubbles: true,
		});

		expect(calls).toEqual(["child", "parent", "grandparent"]);
	});

	it("multiple listeners on same element all fire", () => {
		const el = doc.createElement("div");
		doc.body.appendChild(el);

		const calls: string[] = [];
		el.addEventListener("click", () => calls.push("first"));
		el.addEventListener("click", () => calls.push("second"));

		const listenerId = Array.from(
			(el as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
		)[0];

		doc.dispatchEvent(listenerId, {
			type: "click",
			target: el.id,
			currentTarget: el.id,
			bubbles: true,
		});

		expect(calls).toEqual(["first", "second"]);
	});

	it("stopImmediatePropagation prevents other listeners on same element", () => {
		const el = doc.createElement("div");
		doc.body.appendChild(el);

		const calls: string[] = [];
		el.addEventListener("click", (e: unknown) => {
			calls.push("first");
			(e as VirtualEvent).stopImmediatePropagation();
		});
		el.addEventListener("click", () => calls.push("second"));

		const listenerId = Array.from(
			(el as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
		)[0];

		doc.dispatchEvent(listenerId, {
			type: "click",
			target: el.id,
			currentTarget: el.id,
			bubbles: true,
		});

		expect(calls).toEqual(["first"]);
	});

	it("stopPropagation halts bubbling", () => {
		const parent = doc.createElement("div");
		const child = doc.createElement("span");
		parent.appendChild(child);
		doc.body.appendChild(parent);

		const calls: string[] = [];

		child.addEventListener("click", (e: unknown) => {
			calls.push("child");
			(e as VirtualEvent).stopPropagation();
		});
		parent.addEventListener("click", () => calls.push("parent"));

		const listenerId = Array.from(
			(child as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
		)[0];

		doc.dispatchEvent(listenerId, {
			type: "click",
			target: child.id,
			currentTarget: child.id,
			bubbles: true,
		});

		expect(calls).toEqual(["child"]);
	});

	it("currentTarget updates during bubbling", () => {
		const parent = doc.createElement("div");
		const child = doc.createElement("span");
		parent.appendChild(child);
		doc.body.appendChild(parent);

		const currentTargets: unknown[] = [];

		child.addEventListener("click", (e: unknown) => {
			currentTargets.push((e as VirtualEvent).currentTarget);
		});
		parent.addEventListener("click", (e: unknown) => {
			currentTargets.push((e as VirtualEvent).currentTarget);
		});

		const listenerId = Array.from(
			(child as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
		)[0];

		doc.dispatchEvent(listenerId, {
			type: "click",
			target: child.id,
			currentTarget: child.id,
			bubbles: true,
		});

		expect(currentTargets).toHaveLength(2);
		// First currentTarget is the child (set by dispatchEvent), second is parent
		expect(currentTargets[1]).toBe(parent);
	});

	it("non-bubbling events do not bubble", () => {
		const parent = doc.createElement("div");
		const child = doc.createElement("span");
		parent.appendChild(child);
		doc.body.appendChild(parent);

		const calls: string[] = [];

		child.addEventListener("focus", () => calls.push("child"));
		parent.addEventListener("focus", () => calls.push("parent"));

		const listenerId = Array.from(
			(child as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
		)[0];

		doc.dispatchEvent(listenerId, {
			type: "focus",
			target: child.id,
			currentTarget: child.id,
			bubbles: false,
		});

		expect(calls).toEqual(["child"]);
	});
});
