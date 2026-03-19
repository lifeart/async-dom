import { beforeEach, describe, expect, it } from "vitest";
import { createAppId, createNodeId, type Message, type MutationMessage } from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";

const appId = createAppId("roundtrip");

function createPipeline() {
	const renderer = new DomRenderer(undefined, {
		allowHeadAppend: true,
		allowBodyAppend: true,
	});
	const scheduler = new FrameScheduler({ frameBudgetMs: 16 });
	scheduler.setApplier((m) => renderer.apply(m));

	// Seed the node cache with structural nodes (like createAsyncDom does implicitly)
	renderer.apply({ action: "createNode", id: createNodeId("body-node"), tag: "BODY" });
	renderer.apply({ action: "createNode", id: createNodeId("head-node"), tag: "HEAD" });
	renderer.apply({ action: "createNode", id: createNodeId("async-html"), tag: "HTML" });

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
		const { doc, scheduler } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		doc.collector.flushSync();
		scheduler.flush();

		const node = document.getElementById(div.id);
		expect(node).toBeTruthy();
		expect(node?.tagName).toBe("DIV");
	});

	it("setAttribute is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.setAttribute("data-test", "hello");
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div.id) as HTMLElement;
		expect(node?.getAttribute("data-test")).toBe("hello");
	});

	it("setStyle is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.style["color"] = "red";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div.id) as HTMLElement;
		expect(node?.style.color).toBe("red");
	});

	it("textContent is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.textContent = "hello world";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div.id) as HTMLElement;
		expect(node?.textContent).toBe("hello world");
	});

	it("removeNode removes from real DOM", () => {
		const { doc, scheduler } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		doc.collector.flushSync();
		scheduler.flush();

		expect(document.getElementById(div.id)).toBeTruthy();

		div.remove();
		doc.collector.flushSync();
		scheduler.flush();

		expect(document.getElementById(div.id)).toBeNull();
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

		const realParent = renderer.getNode(parent.id) as HTMLElement;
		expect(realParent?.children.length).toBe(3);
		expect(realParent?.children[0]?.id).toBe(a.id);
		expect(realParent?.children[1]?.id).toBe(b.id);
		expect(realParent?.children[2]?.id).toBe(c.id);
	});

	it("className is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.className = "foo bar";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div.id) as HTMLElement;
		expect(node?.className).toBe("foo bar");
	});

	it("innerHTML is reflected in real DOM", () => {
		const { doc, scheduler, renderer } = createPipeline();
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		div.innerHTML = "<b>bold</b>";
		doc.collector.flushSync();
		scheduler.flush();

		const node = renderer.getNode(div.id) as HTMLElement;
		expect(node?.innerHTML).toBe("<b>bold</b>");
	});

	it("multiple mutations batch correctly", () => {
		const { doc, scheduler } = createPipeline();

		const a = doc.createElement("div");
		const b = doc.createElement("span");
		const c = doc.createElement("p");
		doc.body.appendChild(a);
		doc.body.appendChild(b);
		doc.body.appendChild(c);

		doc.collector.flushSync();
		scheduler.flush();

		// All three should be in the DOM
		expect(document.getElementById(a.id)).toBeTruthy();
		expect(document.getElementById(b.id)).toBeTruthy();
		expect(document.getElementById(c.id)).toBeTruthy();
	});
});
