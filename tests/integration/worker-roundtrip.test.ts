import { beforeEach, describe, expect, it } from "vitest";
import {
	BODY_NODE_ID,
	createAppId,
	HEAD_NODE_ID,
	HTML_NODE_ID,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";

const appId = createAppId("roundtrip");

function createPipeline() {
	const renderer = new DomRenderer(undefined, {
		allowHeadAppend: true,
		allowBodyAppend: true,
	});
	const scheduler = new FrameScheduler({ frameBudgetMs: 16 });
	scheduler.setApplier((m) => renderer.apply(m));

	// Seed the node cache with structural nodes (like createAsyncDom does implicitly)
	renderer.apply({ action: "createNode", id: BODY_NODE_ID, tag: "BODY" });
	renderer.apply({ action: "createNode", id: HEAD_NODE_ID, tag: "HEAD" });
	renderer.apply({ action: "createNode", id: HTML_NODE_ID, tag: "HTML" });

	const doc = new VirtualDocument(appId);

	// Mock transport that routes mutations from collector to scheduler
	const transport: Transport = {
		send(message: Message) {
			if (message.type === "mutation") {
				const mm = message as MutationMessage;
				scheduler.enqueue(mm.mutations, mm.appId, mm.priority ?? "normal");
			}
		},
		onMessage() {},
		close() {},
		get readyState(): TransportReadyState {
			return "open";
		},
	};
	doc.collector.setTransport(transport);

	return { doc, scheduler, renderer };
}

describe("Worker → Main Thread roundtrip", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("createElement + appendChild appears in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId);
		expect(node).toBeTruthy();
		expect(node?.nodeName).toBe("DIV");
	});

	it("setAttribute is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.setAttribute("data-test", "hello");
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.getAttribute("data-test")).toBe("hello");
	});

	it("setStyle is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.style.color = "red";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.style.color).toBe("red");
	});

	it("textContent is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.textContent = "hello world";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.textContent).toBe("hello world");
	});

	it("removeNode removes from real DOM", () => {
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

	it("insertBefore produces correct ordering", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const parent = doc.createElement("div");
		const a = doc.createElement("span");
		const c = doc.createElement("span");
		const b = doc.createElement("span");

		doc.body.appendChild(parent);
		parent.appendChild(a);
		parent.appendChild(c);
		parent.insertBefore(b, c);

		doc.collector.flushSync();
		scheduler.flush();

		const realParent = renderer.getNode(parent._nodeId) as HTMLElement;
		expect(realParent?.children.length).toBe(3);
		expect(realParent?.children[0]?.getAttribute("data-async-dom-id")).toBe(String(a._nodeId));
		expect(realParent?.children[1]?.getAttribute("data-async-dom-id")).toBe(String(b._nodeId));
		expect(realParent?.children[2]?.getAttribute("data-async-dom-id")).toBe(String(c._nodeId));
	});

	it("className is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.className = "foo bar";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.className).toBe("foo bar");
	});

	it("innerHTML is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.innerHTML = "<b>bold</b>";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div._nodeId) as HTMLElement;
		expect(node?.innerHTML).toBe("<b>bold</b>");
	});

	it("multiple mutations batch correctly", () => {
		const { doc, scheduler, renderer } = createPipeline();

		const a = doc.createElement("div");
		const b = doc.createElement("span");
		const c = doc.createElement("p");
		doc.body.appendChild(a);
		doc.body.appendChild(b);
		doc.body.appendChild(c);

		doc.collector.flushSync();
		scheduler.flush();

		expect(renderer.getNode(a._nodeId)).toBeTruthy();
		expect(renderer.getNode(b._nodeId)).toBeTruthy();
		expect(renderer.getNode(c._nodeId)).toBeTruthy();
	});
});
