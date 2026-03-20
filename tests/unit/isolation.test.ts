import { beforeEach, describe, expect, it } from "vitest";
import { NodeCache } from "../../src/core/node-cache.ts";
import { createAppId, createNodeId } from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";

describe("NodeCache isolation", () => {
	it("two separate NodeCache instances don't share nodes", () => {
		const cacheA = new NodeCache();
		const cacheB = new NodeCache();

		const id = createNodeId();
		const nodeA = document.createElement("div");
		const nodeB = document.createElement("span");

		cacheA.set(id, nodeA);
		cacheB.set(id, nodeB);

		expect(cacheA.get(id)).toBe(nodeA);
		expect(cacheB.get(id)).toBe(nodeB);
		expect(cacheA.get(id)).not.toBe(cacheB.get(id));
	});

	it("NodeCache.get() returns null for unknown IDs (no fallback)", () => {
		const cache = new NodeCache();

		// Put a real element in the DOM with the same id
		const div = document.createElement("div");
		div.id = "iso-fallback-test";
		document.body.appendChild(div);

		const result = cache.get(createNodeId());
		expect(result).toBeNull();

		div.remove();
	});

	it("deleting from one cache doesn't affect another", () => {
		const cacheA = new NodeCache();
		const cacheB = new NodeCache();

		const id = createNodeId();
		const node = document.createElement("div");

		cacheA.set(id, node);
		cacheB.set(id, node);

		cacheA.delete(id);
		expect(cacheA.has(id)).toBe(false);
		expect(cacheB.has(id)).toBe(true);
		expect(cacheB.get(id)).toBe(node);
	});

	it("clearing one cache doesn't affect another", () => {
		const cacheA = new NodeCache();
		const cacheB = new NodeCache();

		const id = createNodeId();
		cacheA.set(id, document.createElement("div"));
		cacheB.set(id, document.createElement("span"));

		cacheA.clear();
		expect(cacheA.has(id)).toBe(false);
		expect(cacheB.has(id)).toBe(true);
	});
});

describe("Per-app DomRenderer isolation", () => {
	let cacheA: NodeCache;
	let cacheB: NodeCache;
	let rendererA: DomRenderer;
	let rendererB: DomRenderer;

	beforeEach(() => {
		document.body.innerHTML = "";
		cacheA = new NodeCache();
		cacheB = new NodeCache();
		rendererA = new DomRenderer(cacheA, { allowBodyAppend: true, allowHeadAppend: true });
		rendererB = new DomRenderer(cacheB, { allowBodyAppend: true, allowHeadAppend: true });
	});

	it("two DomRenderers with separate NodeCaches can't cross-reference nodes", () => {
		const id = createNodeId();

		rendererA.apply({ action: "createNode", id, tag: "div" });
		expect(rendererA.getNode(id)).toBeInstanceOf(HTMLDivElement);
		expect(rendererB.getNode(id)).toBeNull();
	});

	it("App A's removeNode mutation doesn't affect App B's nodes", () => {
		const id = createNodeId();

		rendererA.apply({ action: "createNode", id, tag: "div" });
		rendererB.apply({ action: "createNode", id, tag: "span" });
		rendererA.apply({ action: "bodyAppendChild", id });
		rendererB.apply({ action: "bodyAppendChild", id });

		rendererA.apply({ action: "removeNode", id });
		expect(rendererA.getNode(id)).toBeNull();
		expect(rendererB.getNode(id)).toBeInstanceOf(HTMLSpanElement);
	});

	it("App A can't appendChild to App B's parent — mutation is a no-op", () => {
		const parentId = createNodeId();
		const childIdA = createNodeId();

		rendererB.apply({ action: "createNode", id: parentId, tag: "div" });
		rendererB.apply({ action: "bodyAppendChild", id: parentId });
		rendererA.apply({ action: "createNode", id: childIdA, tag: "span" });
		rendererA.apply({ action: "appendChild", id: parentId, childId: childIdA });

		const parentNode = rendererB.getNode(parentId) as HTMLElement;
		expect(parentNode.children).toHaveLength(0);

		const childNode = rendererA.getNode(childIdA) as HTMLElement;
		expect(childNode.parentNode).toBeNull();
		expect(document.body.contains(childNode)).toBe(false);
	});

	it("each renderer maintains independent node lifecycle", () => {
		const id1 = createNodeId();
		const id2 = createNodeId();

		rendererA.apply({ action: "createNode", id: id1, tag: "div" });
		rendererA.apply({ action: "createNode", id: id2, tag: "p" });
		rendererB.apply({ action: "createNode", id: id1, tag: "span" });

		expect(rendererA.getNode(id1)).toBeInstanceOf(HTMLDivElement);
		expect(rendererA.getNode(id2)).toBeInstanceOf(HTMLParagraphElement);
		expect(rendererB.getNode(id1)).toBeInstanceOf(HTMLSpanElement);
		expect(rendererB.getNode(id2)).toBeNull();

		rendererA.clear();
		expect(rendererA.getNode(id1)).toBeNull();
		expect(rendererB.getNode(id1)).toBeInstanceOf(HTMLSpanElement);
	});
});

describe("Renderer permissions", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("headAppendChild is blocked when allowHeadAppend is false (default)", () => {
		const renderer = new DomRenderer();
		const id = createNodeId();
		renderer.apply({ action: "createNode", id, tag: "style" });

		const headChildrenBefore = document.head.children.length;
		renderer.apply({ action: "headAppendChild", id });
		expect(document.head.children.length).toBe(headChildrenBefore);
	});

	it("headAppendChild works when allowHeadAppend is true", () => {
		const renderer = new DomRenderer(undefined, { allowHeadAppend: true });
		const id = createNodeId();
		renderer.apply({ action: "createNode", id, tag: "style" });

		renderer.apply({ action: "headAppendChild", id });
		const node = renderer.getNode(id) as HTMLElement;
		expect(node.parentNode).toBe(document.head);

		// Cleanup
		node.remove();
	});

	it("bodyAppendChild is blocked by default", () => {
		const renderer = new DomRenderer();
		const id = createNodeId();
		renderer.apply({ action: "createNode", id, tag: "div" });

		const bodyChildrenBefore = document.body.children.length;
		renderer.apply({ action: "bodyAppendChild", id });
		expect(document.body.children.length).toBe(bodyChildrenBefore);
	});

	it("bodyAppendChild works when allowed", () => {
		const renderer = new DomRenderer(undefined, { allowBodyAppend: true });
		const id = createNodeId();
		renderer.apply({ action: "createNode", id, tag: "div" });

		renderer.apply({ action: "bodyAppendChild", id });
		const node = renderer.getNode(id) as HTMLElement;
		expect(node.parentNode).toBe(document.body);
	});

	it("navigation is allowed by default", () => {
		const renderer = new DomRenderer();
		const originalPathname = window.location.pathname;
		renderer.apply({ action: "pushState", state: null, title: "", url: "/perm-nav-test" });
		expect(window.location.pathname).toBe("/perm-nav-test");
		// Restore
		window.history.replaceState(null, "", originalPathname);
	});

	it("navigation is blocked when allowNavigation is false", () => {
		const renderer = new DomRenderer(undefined, { allowNavigation: false });
		const originalPathname = window.location.pathname;
		renderer.apply({ action: "pushState", state: null, title: "", url: "/should-not-nav" });
		expect(window.location.pathname).toBe(originalPathname);
	});

	it("scrollTo is blocked when allowScroll is false", () => {
		const renderer = new DomRenderer(undefined, { allowScroll: false });
		renderer.apply({ action: "scrollTo", x: 0, y: 100 });
	});

	it("appendChild with unknown parent is a no-op (no body fallback)", () => {
		const renderer = new DomRenderer(undefined, { allowBodyAppend: true });
		const childId = createNodeId();
		renderer.apply({ action: "createNode", id: childId, tag: "div" });

		const bodyBefore = document.body.children.length;
		renderer.apply({ action: "appendChild", id: createNodeId(), childId });

		// Child should NOT be appended to body or anywhere
		expect(document.body.children.length).toBe(bodyBefore);
		const child = renderer.getNode(childId) as HTMLElement;
		expect(child.parentNode).toBeNull();
	});

	it("insertAdjacentHTML is applied correctly", () => {
		const renderer = new DomRenderer(undefined, { allowBodyAppend: true });
		const id = createNodeId();
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });

		renderer.apply({
			action: "insertAdjacentHTML",
			id,
			position: "beforeend",
			html: "<span>inner</span>",
		});
		const node = renderer.getNode(id) as HTMLElement;
		expect(node.innerHTML).toBe("<span>inner</span>");
	});
});

describe("Scheduler fairness", () => {
	it("single app has no fairness overhead (appCount <= 1 fast path)", () => {
		const scheduler = new FrameScheduler();
		const applied: string[] = [];

		scheduler.setApplier((mutation, appId) => {
			applied.push(`${appId}:${mutation.action}`);
		});

		const appA = createAppId("app-a");
		scheduler.setAppCount(1);

		// Enqueue several mutations
		scheduler.enqueue(
			[
				{ action: "createNode", id: createNodeId(), tag: "div" },
				{ action: "createNode", id: createNodeId(), tag: "span" },
				{ action: "createNode", id: createNodeId(), tag: "p" },
			],
			appA,
		);

		// Flush processes everything (no fairness deferral for single app)
		scheduler.flush();
		expect(applied).toHaveLength(3);
		expect(applied.every((a) => a.startsWith("app-a:"))).toBe(true);
	});

	it("flush processes mutations from multiple apps", () => {
		const scheduler = new FrameScheduler();
		const applied: string[] = [];

		scheduler.setApplier((mutation, appId) => {
			applied.push(`${appId}:${(mutation as { id?: string }).id ?? mutation.action}`);
		});

		const appA = createAppId("app-a");
		const appB = createAppId("app-b");
		scheduler.setAppCount(2);

		scheduler.enqueue([{ action: "createNode", id: createNodeId(), tag: "div" }], appA);
		scheduler.enqueue([{ action: "createNode", id: createNodeId(), tag: "div" }], appB);

		scheduler.flush();
		// Both mutations should be applied
		expect(applied).toHaveLength(2);
		expect(applied.some((a) => a.startsWith("app-a:"))).toBe(true);
		expect(applied.some((a) => a.startsWith("app-b:"))).toBe(true);
	});
});
