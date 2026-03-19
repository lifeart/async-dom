import { beforeEach, describe, expect, it } from "vitest";
import { createNodeId } from "../../src/core/protocol.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";

describe("DomRenderer", () => {
	let renderer: DomRenderer;

	beforeEach(() => {
		renderer = new DomRenderer(undefined, {
			allowHeadAppend: true,
			allowBodyAppend: true,
		});
		document.body.innerHTML = "";
	});

	it("creates an element and adds it to node cache", () => {
		const id = createNodeId("test-1");
		renderer.apply({ action: "createNode", id, tag: "div" });
		const node = renderer.getNode(id);
		expect(node).toBeInstanceOf(HTMLDivElement);
	});

	it("creates a text node", () => {
		const id = createNodeId("text-1");
		renderer.apply({ action: "createNode", id, tag: "#text", textContent: "hello" });
		const node = renderer.getNode(id);
		expect(node).toBeInstanceOf(Text);
		expect(node?.textContent).toBe("hello");
	});

	it("creates a comment node", () => {
		const id = createNodeId("comment-1");
		renderer.apply({ action: "createComment", id, textContent: "a comment" });
		const node = renderer.getNode(id);
		expect(node).toBeInstanceOf(Comment);
		expect(node?.textContent).toBe("a comment");
	});

	it("appends child to parent", () => {
		const parentId = createNodeId("parent");
		const childId = createNodeId("child");

		renderer.apply({ action: "createNode", id: parentId, tag: "div" });
		renderer.apply({ action: "createNode", id: childId, tag: "span" });
		renderer.apply({ action: "bodyAppendChild", id: parentId });
		renderer.apply({ action: "appendChild", id: parentId, childId });

		const parent = renderer.getNode(parentId) as HTMLElement;
		expect(parent.children).toHaveLength(1);
		expect(parent.children[0].tagName).toBe("SPAN");
	});

	it("sets attributes", () => {
		const id = createNodeId("attr-test");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });
		renderer.apply({ action: "setAttribute", id, name: "data-test", value: "hello" });

		const node = renderer.getNode(id) as HTMLElement;
		expect(node.getAttribute("data-test")).toBe("hello");
	});

	it("removes attributes", () => {
		const id = createNodeId("remove-attr");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });
		renderer.apply({ action: "setAttribute", id, name: "data-x", value: "y" });
		renderer.apply({ action: "removeAttribute", id, name: "data-x" });

		const node = renderer.getNode(id) as HTMLElement;
		expect(node.getAttribute("data-x")).toBeNull();
	});

	it("sets style properties", () => {
		const id = createNodeId("style-test");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });
		renderer.apply({ action: "setStyle", id, property: "color", value: "red" });

		const node = renderer.getNode(id) as HTMLElement;
		expect(node.style.color).toBe("red");
	});

	it("sets text content", () => {
		const id = createNodeId("text-content");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });
		renderer.apply({ action: "setTextContent", id, textContent: "hello world" });

		const node = renderer.getNode(id) as HTMLElement;
		expect(node.textContent).toBe("hello world");
	});

	it("sets className", () => {
		const id = createNodeId("class-test");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });
		renderer.apply({ action: "setClassName", id, name: "foo bar" });

		const node = renderer.getNode(id) as HTMLElement;
		expect(node.className).toBe("foo bar");
	});

	it("sets innerHTML", () => {
		const id = createNodeId("html-test");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });
		renderer.apply({ action: "setHTML", id, html: "<b>bold</b>" });

		const node = renderer.getNode(id) as HTMLElement;
		expect(node.innerHTML).toBe("<b>bold</b>");
	});

	it("removes a node", () => {
		const id = createNodeId("remove-test");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });

		expect(document.body.children).toHaveLength(1);
		renderer.apply({ action: "removeNode", id });
		expect(document.body.children).toHaveLength(0);
	});

	it("inserts before a reference node", () => {
		const parentId = createNodeId("ib-parent");
		const aId = createNodeId("ib-a");
		const bId = createNodeId("ib-b");
		const cId = createNodeId("ib-c");

		renderer.apply({ action: "createNode", id: parentId, tag: "div" });
		renderer.apply({ action: "createNode", id: aId, tag: "span" });
		renderer.apply({ action: "createNode", id: cId, tag: "span" });
		renderer.apply({ action: "createNode", id: bId, tag: "span" });

		renderer.apply({ action: "bodyAppendChild", id: parentId });
		renderer.apply({ action: "appendChild", id: parentId, childId: aId });
		renderer.apply({ action: "appendChild", id: parentId, childId: cId });
		renderer.apply({ action: "insertBefore", id: parentId, newId: bId, refId: cId });

		const parent = renderer.getNode(parentId) as HTMLElement;
		expect(parent.children).toHaveLength(3);
		expect(parent.children[1].id).toBe("ib-b");
	});

	it("sets properties", () => {
		const id = createNodeId("prop-test");
		renderer.apply({ action: "createNode", id, tag: "input" });
		renderer.apply({ action: "bodyAppendChild", id });
		renderer.apply({ action: "setProperty", id, property: "checked", value: true });

		const node = renderer.getNode(id) as HTMLInputElement;
		expect(node.checked).toBe(true);
	});

	it("does not duplicate nodes on repeated createNode", () => {
		const id = createNodeId("dup-test");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "createNode", id, tag: "div" }); // duplicate
		// Should not throw, second call is a no-op
		const node = renderer.getNode(id);
		expect(node).toBeInstanceOf(HTMLDivElement);
	});

	it("clears cache on clear()", () => {
		const id = createNodeId("clear-test");
		renderer.apply({ action: "createNode", id, tag: "div" });
		expect(renderer.getNode(id)).toBeTruthy();
		renderer.clear();
		// After clear, node is not in cache
		expect(renderer.getNode(id)).toBeNull();
	});

	it("maps BODY tag to document.body", () => {
		const id = createNodeId("body-test");
		renderer.apply({ action: "createNode", id, tag: "BODY" });
		expect(renderer.getNode(id)).toBe(document.body);
	});

	it("removeChild action removes child from parent", () => {
		const parentId = createNodeId("rc-parent");
		const childId = createNodeId("rc-child");

		renderer.apply({ action: "createNode", id: parentId, tag: "div" });
		renderer.apply({ action: "createNode", id: childId, tag: "span" });
		renderer.apply({ action: "bodyAppendChild", id: parentId });
		renderer.apply({ action: "appendChild", id: parentId, childId });

		const parent = renderer.getNode(parentId) as HTMLElement;
		expect(parent.children).toHaveLength(1);

		renderer.apply({ action: "removeChild", id: parentId, childId });
		expect(parent.children).toHaveLength(0);
	});

	it("SVG element creation uses createElementNS", () => {
		const id = createNodeId("svg-test");
		renderer.apply({ action: "createNode", id, tag: "svg" });
		const node = renderer.getNode(id) as Element;
		expect(node).toBeTruthy();
		expect(node.namespaceURI).toBe("http://www.w3.org/2000/svg");
	});

	it("pushState action calls history.pushState", () => {
		const originalPathname = window.location.pathname;
		renderer.apply({ action: "pushState", state: { page: 1 }, title: "", url: "/test-push" });
		expect(window.location.pathname).toBe("/test-push");
		// Restore
		window.history.pushState(null, "", originalPathname);
	});

	it("replaceState action calls history.replaceState", () => {
		const originalPathname = window.location.pathname;
		renderer.apply({ action: "replaceState", state: { page: 2 }, title: "", url: "/test-replace" });
		expect(window.location.pathname).toBe("/test-replace");
		// Restore
		window.history.replaceState(null, "", originalPathname);
	});

	it("scrollTo action does not throw", () => {
		expect(() => {
			renderer.apply({ action: "scrollTo", x: 0, y: 100 });
		}).not.toThrow();
	});

	it("headAppendChild action appends to document.head", () => {
		const id = createNodeId("head-child");
		renderer.apply({ action: "createNode", id, tag: "style" });
		renderer.apply({ action: "headAppendChild", id });

		const node = renderer.getNode(id) as HTMLElement;
		expect(node.parentNode).toBe(document.head);

		// Cleanup
		node.remove();
	});

	it("setAttribute with name 'id' creates cache alias", () => {
		const id = createNodeId("id-alias-test");
		renderer.apply({ action: "createNode", id, tag: "div" });
		renderer.apply({ action: "bodyAppendChild", id });
		renderer.apply({ action: "setAttribute", id, name: "id", value: "new-id-alias" });

		// The node should now be accessible via the new id alias
		const node = renderer.getNode(createNodeId("new-id-alias"));
		expect(node).toBeTruthy();
		expect(node).toBe(renderer.getNode(id));
	});

	it("mutations on non-existent nodes do not throw", () => {
		const fakeId = createNodeId("does-not-exist");
		expect(() => {
			renderer.apply({ action: "appendChild", id: fakeId, childId: createNodeId("also-missing") });
			renderer.apply({ action: "removeNode", id: fakeId });
			renderer.apply({ action: "removeChild", id: fakeId, childId: createNodeId("nope") });
			renderer.apply({ action: "setAttribute", id: fakeId, name: "x", value: "y" });
			renderer.apply({ action: "removeAttribute", id: fakeId, name: "x" });
			renderer.apply({ action: "setStyle", id: fakeId, property: "color", value: "red" });
			renderer.apply({ action: "setProperty", id: fakeId, property: "value", value: "abc" });
			renderer.apply({ action: "setTextContent", id: fakeId, textContent: "text" });
			renderer.apply({ action: "setClassName", id: fakeId, name: "cls" });
			renderer.apply({ action: "setHTML", id: fakeId, html: "<b>x</b>" });
			renderer.apply({ action: "headAppendChild", id: fakeId });
			renderer.apply({ action: "bodyAppendChild", id: fakeId });
			renderer.apply({
				action: "insertBefore",
				id: fakeId,
				newId: createNodeId("missing-new"),
				refId: null,
			});
		}).not.toThrow();
	});
});
