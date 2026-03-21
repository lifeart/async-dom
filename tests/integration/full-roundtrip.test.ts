/**
 * Full pipeline integration tests.
 *
 * These tests wire a real VirtualDocument (worker side) through an
 * InMemoryTransportPair to a real DomRenderer + FrameScheduler (main-thread
 * side) and then verify that mutations produced by the virtual DOM actually
 * appear in the jsdom real DOM.
 *
 * The pattern intentionally mirrors worker-roundtrip.test.ts but exercises
 * the InMemoryTransport helper instead of an inline mock, giving confidence
 * that the helper itself is correct.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
	BODY_NODE_ID,
	HEAD_NODE_ID,
	HTML_NODE_ID,
	createAppId,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import { createTransportPair } from "./test-helpers.ts";

const appId = createAppId("full-roundtrip");

function createPipeline() {
	const { workerTransport, mainTransport } = createTransportPair();

	// ---- Main-thread side ----
	const renderer = new DomRenderer(undefined, {
		allowHeadAppend: true,
		allowBodyAppend: true,
	});
	const scheduler = new FrameScheduler({ frameBudgetMs: 16 });
	scheduler.setApplier((m) => renderer.apply(m));

	// Seed structural nodes so mutations targeting body/head/html resolve
	renderer.apply({ action: "createNode", id: BODY_NODE_ID, tag: "BODY" });
	renderer.apply({ action: "createNode", id: HEAD_NODE_ID, tag: "HEAD" });
	renderer.apply({ action: "createNode", id: HTML_NODE_ID, tag: "HTML" });

	// Route messages arriving from the "worker" transport to the scheduler
	mainTransport.onMessage((message: Message) => {
		if (message.type === "mutation") {
			const mm = message as MutationMessage;
			scheduler.enqueue(mm.mutations, mm.appId, mm.priority ?? "normal");
		}
	});

	// ---- Worker side ----
	const doc = new VirtualDocument(appId);
	doc.collector.setTransport(workerTransport);

	return { doc, scheduler, renderer };
}

describe("Full pipeline round-trip (InMemoryTransport → DomRenderer)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("createElement + appendChild → real DOM has the element", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId);
		expect(node).toBeTruthy();
		expect(node?.nodeName).toBe("DIV");
	});

	it("setAttribute → real DOM element has the attribute", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.setAttribute("data-test", "hello");
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.getAttribute("data-test")).toBe("hello");
	});

	it("textContent assignment → real DOM text", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.textContent = "hello world";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.textContent).toBe("hello world");
	});

	it("setStyle → real DOM style", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.style.color = "red";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.style.color).toBe("red");
	});

	it("removeChild → real DOM element is gone", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		doc.collector.flushSync();
		scheduler.flush();

		expect(renderer.getNode(div._nodeId)).toBeTruthy();

		div.remove();
		doc.collector.flushSync();
		scheduler.flush();

		expect(renderer.getNode(div._nodeId)).toBeNull();
	});

	it("multiple sequential operations produce correct final DOM tree", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const parent = doc.createElement("section");
		const child1 = doc.createElement("p");
		const child2 = doc.createElement("span");

		doc.body.appendChild(parent);
		parent.appendChild(child1);
		parent.appendChild(child2);
		child1.textContent = "first";
		child2.setAttribute("class", "highlight");

		doc.collector.flushSync();
		scheduler.flush();

		const realParent = renderer.getNode(parent._nodeId) as HTMLElement;
		expect(realParent).toBeTruthy();
		expect(realParent.children.length).toBe(2);
		expect(realParent.children[0]).toBe(renderer.getNode(child1._nodeId));
		expect(realParent.children[1]).toBe(renderer.getNode(child2._nodeId));
		expect((realParent.children[0] as HTMLElement).textContent).toBe("first");
		expect((realParent.children[1] as HTMLElement).getAttribute("class")).toBe("highlight");
	});

	it("classList operations reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.classList.add("foo");
		div.classList.add("bar");
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		// classList.add is implemented via className on the virtual side
		expect(node?.classList.contains("foo")).toBe(true);
		expect(node?.classList.contains("bar")).toBe(true);
	});

	it("className assignment reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.className = "alpha beta";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.className).toBe("alpha beta");
	});

	it("insertBefore produces correct ordering", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const parent = doc.createElement("ul");
		const a = doc.createElement("li");
		const b = doc.createElement("li");
		const c = doc.createElement("li");

		doc.body.appendChild(parent);
		parent.appendChild(a);
		parent.appendChild(c);
		parent.insertBefore(b, c);

		doc.collector.flushSync();
		scheduler.flush();

		const realParent = renderer.getNode(parent._nodeId) as HTMLElement;
		expect(realParent.children.length).toBe(3);
		expect(realParent.children[0]).toBe(renderer.getNode(a._nodeId));
		expect(realParent.children[1]).toBe(renderer.getNode(b._nodeId));
		expect(realParent.children[2]).toBe(renderer.getNode(c._nodeId));
	});

	it("multiple batched mutations are all applied correctly", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const nodes = Array.from({ length: 5 }, () => doc.createElement("div"));
		for (const n of nodes) {
			doc.body.appendChild(n);
		}

		doc.collector.flushSync();
		scheduler.flush();

		for (const n of nodes) {
			expect(renderer.getNode(n._nodeId)).toBeTruthy();
		}
	});

	it("messages are structuredClone'd through the transport (serialisation boundary)", () => {
		// Verifies InMemoryTransport clones data; mutations referencing object
		// values are still correctly received by the renderer.
		const { doc, scheduler, renderer } = createPipeline();

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.setAttribute("data-complex", JSON.stringify({ a: 1 }));
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.getAttribute("data-complex")).toBe('{"a":1}');
	});
});
