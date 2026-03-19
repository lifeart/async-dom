import { beforeEach, describe, expect, it } from "vitest";
import { NodeCache } from "../../src/core/node-cache.ts";
import { createAppId, createNodeId } from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";

// ---------------------------------------------------------------------------
// 1. NodeCache isolation
// ---------------------------------------------------------------------------
describe("NodeCache isolation", () => {
	it("two separate NodeCache instances don't share nodes", () => {
		const cacheA = new NodeCache();
		const cacheB = new NodeCache();

		const id = createNodeId("shared-id");
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

		const result = cache.get(createNodeId("iso-fallback-test"));
		expect(result).toBeNull();

		div.remove();
	});

	it("deleting from one cache doesn't affect another", () => {
		const cacheA = new NodeCache();
		const cacheB = new NodeCache();

		const id = createNodeId("del-iso");
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

		const id = createNodeId("clear-iso");
		cacheA.set(id, document.createElement("div"));
		cacheB.set(id, document.createElement("span"));

		cacheA.clear();
		expect(cacheA.has(id)).toBe(false);
		expect(cacheB.has(id)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 2. Per-app DomRenderer isolation
// ---------------------------------------------------------------------------
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
		const id = createNodeId("cross-ref");

		rendererA.apply({ action: "createNode", id, tag: "div" });

		// Renderer A can find the node
		expect(rendererA.getNode(id)).toBeInstanceOf(HTMLDivElement);

		// Renderer B cannot find the node — separate cache
		expect(rendererB.getNode(id)).toBeNull();
	});

	it("App A's removeNode mutation doesn't affect App B's nodes", () => {
		const id = createNodeId("remove-iso");

		// Both apps create a node with the same ID
		rendererA.apply({ action: "createNode", id, tag: "div" });
		rendererB.apply({ action: "createNode", id, tag: "span" });

		// Append both to the body so they're in the DOM
		rendererA.apply({ action: "bodyAppendChild", id });
		rendererB.apply({ action: "bodyAppendChild", id });

		// App A removes its node
		rendererA.apply({ action: "removeNode", id });

		// App A's node is gone from its cache
		expect(rendererA.getNode(id)).toBeNull();

		// App B's node is still in its cache
		expect(rendererB.getNode(id)).toBeInstanceOf(HTMLSpanElement);
	});

	it("App A can't appendChild to App B's parent — mutation is a no-op", () => {
		const parentId = createNodeId("parent-iso");
		const childIdA = createNodeId("child-a");

		// Only App B has the parent
		rendererB.apply({ action: "createNode", id: parentId, tag: "div" });
		rendererB.apply({ action: "bodyAppendChild", id: parentId });

		// App A creates a child
		rendererA.apply({ action: "createNode", id: childIdA, tag: "span" });

		// App A tries to append its child to a parent it doesn't own
		// Since rendererA's cache doesn't have parentId, this is a no-op (parent is null)
		rendererA.apply({ action: "appendChild", id: parentId, childId: childIdA });

		// B's parent should have no children from A
		const parentNode = rendererB.getNode(parentId) as HTMLElement;
		expect(parentNode.children).toHaveLength(0);

		// The child should NOT be attached anywhere in the DOM (no body fallback)
		const childNode = rendererA.getNode(childIdA) as HTMLElement;
		expect(childNode.parentNode).toBeNull();
		expect(document.body.contains(childNode)).toBe(false);
	});

	it("each renderer maintains independent node lifecycle", () => {
		const id1 = createNodeId("lifecycle-1");
		const id2 = createNodeId("lifecycle-2");

		rendererA.apply({ action: "createNode", id: id1, tag: "div" });
		rendererA.apply({ action: "createNode", id: id2, tag: "p" });
		rendererB.apply({ action: "createNode", id: id1, tag: "span" });

		// Renderer A has 2 nodes, renderer B has 1
		expect(rendererA.getNode(id1)).toBeInstanceOf(HTMLDivElement);
		expect(rendererA.getNode(id2)).toBeInstanceOf(HTMLParagraphElement);
		expect(rendererB.getNode(id1)).toBeInstanceOf(HTMLSpanElement);
		expect(rendererB.getNode(id2)).toBeNull();

		// Clear renderer A — renderer B is unaffected
		rendererA.clear();
		expect(rendererA.getNode(id1)).toBeNull();
		expect(rendererB.getNode(id1)).toBeInstanceOf(HTMLSpanElement);
	});
});

// ---------------------------------------------------------------------------
// 3. Renderer permissions
// ---------------------------------------------------------------------------
describe("Renderer permissions", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("headAppendChild is blocked when allowHeadAppend is false (default)", () => {
		const renderer = new DomRenderer();
		const id = createNodeId("head-blocked");
		renderer.apply({ action: "createNode", id, tag: "style" });

		const headChildrenBefore = document.head.children.length;
		renderer.apply({ action: "headAppendChild", id });
		expect(document.head.children.length).toBe(headChildrenBefore);
	});

	it("headAppendChild works when allowHeadAppend is true", () => {
		const renderer = new DomRenderer(undefined, { allowHeadAppend: true });
		const id = createNodeId("head-allowed");
		renderer.apply({ action: "createNode", id, tag: "style" });

		renderer.apply({ action: "headAppendChild", id });
		const node = renderer.getNode(id) as HTMLElement;
		expect(node.parentNode).toBe(document.head);

		// Cleanup
		node.remove();
	});

	it("bodyAppendChild is blocked by default", () => {
		const renderer = new DomRenderer();
		const id = createNodeId("body-blocked");
		renderer.apply({ action: "createNode", id, tag: "div" });

		const bodyChildrenBefore = document.body.children.length;
		renderer.apply({ action: "bodyAppendChild", id });
		expect(document.body.children.length).toBe(bodyChildrenBefore);
	});

	it("bodyAppendChild works when allowed", () => {
		const renderer = new DomRenderer(undefined, { allowBodyAppend: true });
		const id = createNodeId("body-allowed");
		renderer.apply({ action: "createNode", id, tag: "div" });

		renderer.apply({ action: "bodyAppendChild", id });
		const node = renderer.getNode(id) as HTMLElement;
		expect(node.parentNode).toBe(document.body);
	});

	it("default permissions block head and body append", () => {
		const renderer = new DomRenderer();

		const headId = createNodeId("perm-head");
		const bodyId = createNodeId("perm-body");
		renderer.apply({ action: "createNode", id: headId, tag: "style" });
		renderer.apply({ action: "createNode", id: bodyId, tag: "div" });

		const headBefore = document.head.children.length;
		const bodyBefore = document.body.children.length;

		renderer.apply({ action: "headAppendChild", id: headId });
		renderer.apply({ action: "bodyAppendChild", id: bodyId });

		expect(document.head.children.length).toBe(headBefore);
		expect(document.body.children.length).toBe(bodyBefore);
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
		// Should not throw, just be a no-op
		expect(() => {
			renderer.apply({ action: "scrollTo", x: 0, y: 100 });
		}).not.toThrow();
	});

	it("appendChild with unknown parent is a no-op (no body fallback)", () => {
		const renderer = new DomRenderer(undefined, { allowBodyAppend: true });
		const childId = createNodeId("orphan-child");
		renderer.apply({ action: "createNode", id: childId, tag: "div" });

		const bodyBefore = document.body.children.length;
		renderer.apply({ action: "appendChild", id: createNodeId("nonexistent-parent"), childId });

		// Child should NOT be appended to body or anywhere
		expect(document.body.children.length).toBe(bodyBefore);
		const child = renderer.getNode(childId) as HTMLElement;
		expect(child.parentNode).toBeNull();
	});

	it("insertAdjacentHTML is applied correctly", () => {
		const renderer = new DomRenderer(undefined, { allowBodyAppend: true });
		const id = createNodeId("adj-html");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });

		renderer.apply({ action: "insertAdjacentHTML", id, position: "beforeend", html: "<span>inner</span>" });
		const node = renderer.getNode(id) as HTMLElement;
		expect(node.innerHTML).toBe("<span>inner</span>");
	});
});

// ---------------------------------------------------------------------------
// 4. Scheduler fairness
// ---------------------------------------------------------------------------
describe("Scheduler fairness", () => {
	it("setAppCount updates correctly", () => {
		const scheduler = new FrameScheduler();
		// setAppCount should not throw
		scheduler.setAppCount(0);
		scheduler.setAppCount(1);
		scheduler.setAppCount(5);
		// No assertion beyond not throwing — internal state is private
	});

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
				{ action: "createNode", id: createNodeId("n1"), tag: "div" },
				{ action: "createNode", id: createNodeId("n2"), tag: "span" },
				{ action: "createNode", id: createNodeId("n3"), tag: "p" },
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

		scheduler.enqueue(
			[{ action: "createNode", id: createNodeId("a1"), tag: "div" }],
			appA,
		);
		scheduler.enqueue(
			[{ action: "createNode", id: createNodeId("b1"), tag: "div" }],
			appB,
		);

		scheduler.flush();
		// Both mutations should be applied
		expect(applied).toHaveLength(2);
		expect(applied.some((a) => a.startsWith("app-a:"))).toBe(true);
		expect(applied.some((a) => a.startsWith("app-b:"))).toBe(true);
	});
});

// NodeCache CRUD basics are covered in tests/unit/node-cache.test.ts
