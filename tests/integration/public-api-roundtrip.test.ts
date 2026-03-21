/**
 * Public API integration tests.
 *
 * Tests the public `createWorkerDom` API (not internal classes) wired through
 * an InMemoryTransport pair to a real DomRenderer + FrameScheduler, verifying
 * that mutations produced via the public interface appear in the jsdom DOM.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
	BODY_NODE_ID,
	HEAD_NODE_ID,
	HTML_NODE_ID,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";
import { createWorkerDom } from "../../src/worker-thread/index.ts";
import { createTransportPair } from "./test-helpers.ts";

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

	// ---- Worker side (public API) ----
	const dom = createWorkerDom({ transport: workerTransport });

	return { dom, scheduler, renderer };
}

describe("Public API round-trip (createWorkerDom + InMemoryTransport → DomRenderer)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("basic element creation: createElement + textContent + appendChild", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const div = doc.createElement("div");
		div.textContent = "hello";
		doc.body.appendChild(div);
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node).toBeTruthy();
		expect(node.nodeName).toBe("DIV");
		expect(node.textContent).toBe("hello");

		dom.destroy();
	});

	it("attributes and styles: setAttribute + style.color", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.setAttribute("data-role", "banner");
		div.style.color = "blue";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node.getAttribute("data-role")).toBe("banner");
		expect(node.style.color).toBe("blue");

		dom.destroy();
	});

	it("classList: add, remove, toggle", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.classList.add("alpha");
		div.classList.add("beta");
		div.classList.add("gamma");
		doc.collector.flushSync();
		scheduler.flush();

		let node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node.classList.contains("alpha")).toBe(true);
		expect(node.classList.contains("beta")).toBe(true);
		expect(node.classList.contains("gamma")).toBe(true);

		div.classList.remove("beta");
		doc.collector.flushSync();
		scheduler.flush();

		node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node.classList.contains("alpha")).toBe(true);
		expect(node.classList.contains("beta")).toBe(false);
		expect(node.classList.contains("gamma")).toBe(true);

		div.classList.toggle("alpha");
		doc.collector.flushSync();
		scheduler.flush();

		node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node.classList.contains("alpha")).toBe(false);

		dom.destroy();
	});

	it("addEventListener produces a mutation that reaches the renderer", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.addEventListener("click", () => {});
		doc.collector.flushSync();
		scheduler.flush();

		// The real DOM element should exist (proving mutations flowed end-to-end)
		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node).toBeTruthy();
		expect(node.nodeName).toBe("DIV");

		// The collector should have drained after flush
		expect(doc.collector.pendingCount).toBe(0);

		dom.destroy();
	});

	it("input value sync: create input and set value", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const input = doc.createElement("input");
		doc.body.appendChild(input);
		input.setAttribute("type", "text");
		input.setAttribute("value", "test-value");
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(input._nodeId) as HTMLInputElement;
		expect(node).toBeTruthy();
		expect(node.getAttribute("type")).toBe("text");
		expect(node.getAttribute("value")).toBe("test-value");

		dom.destroy();
	});

	it("destroy() closes transport", () => {
		const { workerTransport } = createTransportPair();

		const renderer = new DomRenderer(undefined, {
			allowHeadAppend: true,
			allowBodyAppend: true,
		});
		const scheduler = new FrameScheduler({ frameBudgetMs: 16 });
		scheduler.setApplier((m) => renderer.apply(m));
		renderer.apply({ action: "createNode", id: BODY_NODE_ID, tag: "BODY" });
		renderer.apply({ action: "createNode", id: HEAD_NODE_ID, tag: "HEAD" });
		renderer.apply({ action: "createNode", id: HTML_NODE_ID, tag: "HTML" });

		const dom = createWorkerDom({ transport: workerTransport });

		expect(workerTransport.readyState).toBe("open");

		dom.destroy();

		expect(workerTransport.readyState).toBe("closed");
	});

	it("multiple elements: parent > child > grandchild hierarchy", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const parent = doc.createElement("div");
		const child = doc.createElement("section");
		const grandchild = doc.createElement("span");

		grandchild.textContent = "deep";
		child.appendChild(grandchild);
		parent.appendChild(child);
		doc.body.appendChild(parent);
		doc.collector.flushSync();
		scheduler.flush();

		const realParent = renderer.getNode(parent._nodeId) as HTMLElement;
		const realChild = renderer.getNode(child._nodeId) as HTMLElement;
		const realGrandchild = renderer.getNode(grandchild._nodeId) as HTMLElement;

		expect(realParent).toBeTruthy();
		expect(realChild).toBeTruthy();
		expect(realGrandchild).toBeTruthy();
		expect(realParent.children[0]).toBe(realChild);
		expect(realChild.children[0]).toBe(realGrandchild);
		expect(realGrandchild.textContent).toBe("deep");

		dom.destroy();
	});

	it("removeChild: element is gone from real DOM", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const parent = doc.createElement("div");
		const child = doc.createElement("span");
		parent.appendChild(child);
		doc.body.appendChild(parent);
		doc.collector.flushSync();
		scheduler.flush();

		expect(renderer.getNode(child._nodeId)).toBeTruthy();

		parent.removeChild(child);
		doc.collector.flushSync();
		scheduler.flush();

		expect(renderer.getNode(child._nodeId)).toBeNull();

		dom.destroy();
	});

	it("insertBefore: verify element ordering", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const list = doc.createElement("ul");
		const first = doc.createElement("li");
		const third = doc.createElement("li");
		const second = doc.createElement("li");

		first.textContent = "1";
		second.textContent = "2";
		third.textContent = "3";

		doc.body.appendChild(list);
		list.appendChild(first);
		list.appendChild(third);
		// Insert second before third
		list.insertBefore(second, third);

		doc.collector.flushSync();
		scheduler.flush();

		const realList = renderer.getNode(list._nodeId) as HTMLElement;
		expect(realList.children.length).toBe(3);
		expect(realList.children[0]).toBe(renderer.getNode(first._nodeId));
		expect(realList.children[1]).toBe(renderer.getNode(second._nodeId));
		expect(realList.children[2]).toBe(renderer.getNode(third._nodeId));

		dom.destroy();
	});

	it("replaceWith: verify element replacement", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const parent = doc.createElement("div");
		const original = doc.createElement("span");
		const replacement = doc.createElement("em");

		original.textContent = "old";
		replacement.textContent = "new";

		doc.body.appendChild(parent);
		parent.appendChild(original);
		doc.collector.flushSync();
		scheduler.flush();

		// Verify original is in the DOM
		expect(renderer.getNode(original._nodeId)).toBeTruthy();

		// Replace
		original.replaceWith(replacement);
		doc.collector.flushSync();
		scheduler.flush();

		const realParent = renderer.getNode(parent._nodeId) as HTMLElement;
		expect(renderer.getNode(original._nodeId)).toBeNull();
		expect(realParent.children.length).toBe(1);
		expect(realParent.children[0]).toBe(renderer.getNode(replacement._nodeId));
		expect((realParent.children[0] as HTMLElement).textContent).toBe("new");

		dom.destroy();
	});

	it("create → modify → remove lifecycle in a single flush", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const div = doc.createElement("div");
		div.textContent = "initial";
		doc.body.appendChild(div);
		div.setAttribute("data-step", "1");
		div.textContent = "modified";
		div.style.color = "red";
		div.classList.add("active");

		// Remove the element within the same flush batch
		div.remove();

		doc.collector.flushSync();
		scheduler.flush();

		// After create+modify+remove in a single batch, the node should be gone
		expect(renderer.getNode(div._nodeId)).toBeNull();

		dom.destroy();
	});

	it("rapid sequential textContent changes: final value wins", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		doc.collector.flushSync();
		scheduler.flush();

		// Rapidly update textContent many times before flushing
		for (let i = 0; i < 50; i++) {
			div.textContent = `update-${i}`;
		}
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node.textContent).toBe("update-49");

		dom.destroy();
	});

	it("create → reparent: move child from one parent to another", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const parentA = doc.createElement("div");
		const parentB = doc.createElement("div");
		const child = doc.createElement("span");
		child.textContent = "moveable";

		doc.body.appendChild(parentA);
		doc.body.appendChild(parentB);
		parentA.appendChild(child);

		doc.collector.flushSync();
		scheduler.flush();

		const realA = renderer.getNode(parentA._nodeId) as HTMLElement;
		expect(realA.children.length).toBe(1);

		// Move child from parentA to parentB
		parentB.appendChild(child);
		doc.collector.flushSync();
		scheduler.flush();

		const realA2 = renderer.getNode(parentA._nodeId) as HTMLElement;
		const realB2 = renderer.getNode(parentB._nodeId) as HTMLElement;
		expect(realA2.children.length).toBe(0);
		expect(realB2.children.length).toBe(1);
		expect(realB2.children[0].textContent).toBe("moveable");

		dom.destroy();
	});

	it("innerHTML assignment replaces children in real DOM", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.innerHTML = "<b>bold</b>";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node.innerHTML).toBe("<b>bold</b>");

		dom.destroy();
	});

	it("createTextNode and createComment produce correct real DOM nodes", () => {
		const { dom, scheduler, renderer } = createPipeline();
		const doc = dom.document;

		const div = doc.createElement("div");
		const text = doc.createTextNode("plain text");
		const comment = doc.createComment("a comment");
		div.appendChild(text);
		div.appendChild(comment);
		doc.body.appendChild(div);

		doc.collector.flushSync();
		scheduler.flush();

		const realDiv = renderer.getNode(div._nodeId) as HTMLElement;
		expect(realDiv).toBeTruthy();
		// Text node + comment node
		const textNode = realDiv.childNodes[0];
		expect(textNode.nodeType).toBe(3); // TEXT_NODE
		expect(textNode.textContent).toBe("plain text");

		const commentNode = realDiv.childNodes[1];
		expect(commentNode.nodeType).toBe(8); // COMMENT_NODE
		expect(commentNode.textContent).toBe("a comment");

		dom.destroy();
	});
});
