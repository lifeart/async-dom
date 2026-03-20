import { beforeEach, describe, expect, it } from "vitest";
import { createAppId } from "../../src/core/protocol.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import {
	VirtualCommentNode,
	VirtualElement,
	VirtualTextNode,
} from "../../src/worker-thread/element.ts";

describe("DOM API Completeness (Sprint 3)", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test-completeness"));
	});

	describe("isConnected", () => {
		it("returns true for elements in the document tree", () => {
			const div = doc.createElement("div");
			doc.body.appendChild(div);
			expect(div.isConnected).toBe(true);
		});

		it("returns false for detached elements", () => {
			const div = doc.createElement("div");
			expect(div.isConnected).toBe(false);
		});

		it("returns true for deeply nested elements", () => {
			const outer = doc.createElement("div");
			const inner = doc.createElement("span");
			outer.appendChild(inner);
			doc.body.appendChild(outer);
			expect(inner.isConnected).toBe(true);
		});

		it("returns false after removal", () => {
			const div = doc.createElement("div");
			doc.body.appendChild(div);
			expect(div.isConnected).toBe(true);
			doc.body.removeChild(div);
			expect(div.isConnected).toBe(false);
		});

		it("returns true for body and documentElement", () => {
			expect(doc.body.isConnected).toBe(true);
			expect(doc.documentElement.isConnected).toBe(true);
		});
	});

	describe("nextElementSibling / previousElementSibling", () => {
		it("returns the next element sibling skipping text nodes", () => {
			const parent = doc.createElement("div");
			const first = doc.createElement("span");
			const text = doc.createTextNode("hello");
			const second = doc.createElement("em");
			parent.appendChild(first);
			parent.appendChild(text);
			parent.appendChild(second);

			expect(first.nextElementSibling).toBe(second);
		});

		it("returns null when no next element sibling exists", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			const text = doc.createTextNode("end");
			parent.appendChild(child);
			parent.appendChild(text);

			expect(child.nextElementSibling).toBeNull();
		});

		it("returns the previous element sibling skipping text nodes", () => {
			const parent = doc.createElement("div");
			const first = doc.createElement("span");
			const text = doc.createTextNode("hello");
			const second = doc.createElement("em");
			parent.appendChild(first);
			parent.appendChild(text);
			parent.appendChild(second);

			expect(second.previousElementSibling).toBe(first);
		});

		it("returns null when no previous element sibling exists", () => {
			const parent = doc.createElement("div");
			const text = doc.createTextNode("start");
			const child = doc.createElement("span");
			parent.appendChild(text);
			parent.appendChild(child);

			expect(child.previousElementSibling).toBeNull();
		});

		it("returns null for detached elements", () => {
			const el = doc.createElement("div");
			expect(el.nextElementSibling).toBeNull();
			expect(el.previousElementSibling).toBeNull();
		});
	});

	describe("hasChildNodes", () => {
		it("returns false for empty elements", () => {
			const div = doc.createElement("div");
			expect(div.hasChildNodes()).toBe(false);
		});

		it("returns true when element has children", () => {
			const div = doc.createElement("div");
			div.appendChild(doc.createTextNode("text"));
			expect(div.hasChildNodes()).toBe(true);
		});
	});

	describe("replaceChild", () => {
		it("replaces old child with new child", () => {
			const parent = doc.createElement("div");
			const old = doc.createElement("span");
			const replacement = doc.createElement("em");
			parent.appendChild(old);

			const returned = parent.replaceChild(replacement, old);
			expect(returned).toBe(old);
			expect(parent.children).toContain(replacement);
			expect(parent.children).not.toContain(old);
		});

		it("returns old child even if not found", () => {
			const parent = doc.createElement("div");
			const old = doc.createElement("span");
			const replacement = doc.createElement("em");

			const returned = parent.replaceChild(replacement, old);
			expect(returned).toBe(old);
		});

		it("preserves position in children array", () => {
			const parent = doc.createElement("div");
			const first = doc.createElement("a");
			const middle = doc.createElement("b");
			const last = doc.createElement("c");
			parent.appendChild(first);
			parent.appendChild(middle);
			parent.appendChild(last);

			const replacement = doc.createElement("x");
			parent.replaceChild(replacement, middle);

			expect(parent.children[0]).toBe(first);
			expect(parent.children[1]).toBe(replacement);
			expect(parent.children[2]).toBe(last);
		});
	});

	describe("dispatchEvent on element", () => {
		it("fires registered event listeners", () => {
			const div = doc.createElement("div");
			let fired = false;
			div.addEventListener("click", () => {
				fired = true;
			});

			div.dispatchEvent({ type: "click" });
			expect(fired).toBe(true);
		});

		it("passes the event object to listeners", () => {
			const div = doc.createElement("div");
			let receivedType = "";
			div.addEventListener("custom", (e: unknown) => {
				receivedType = (e as { type: string }).type;
			});

			div.dispatchEvent({ type: "custom" });
			expect(receivedType).toBe("custom");
		});

		it("returns true", () => {
			const div = doc.createElement("div");
			expect(div.dispatchEvent({ type: "test" })).toBe(true);
		});
	});

	describe("createEvent + initEvent", () => {
		it("creates an event object with initEvent method", () => {
			const event = doc.createEvent("Event");
			expect(event.type).toBe("");
			expect(typeof event.initEvent).toBe("function");
		});

		it("initEvent sets type, bubbles, cancelable", () => {
			const event = doc.createEvent("Event");
			(event.initEvent as (type: string, bubbles?: boolean, cancelable?: boolean) => void)(
				"click",
				true,
				true,
			);
			expect(event.type).toBe("click");
			expect(event.bubbles).toBe(true);
			expect(event.cancelable).toBe(true);
		});

		it("initEvent defaults bubbles and cancelable to false", () => {
			const event = doc.createEvent("Event");
			(event.initEvent as (type: string) => void)("test");
			expect(event.bubbles).toBe(false);
			expect(event.cancelable).toBe(false);
		});

		it("has preventDefault and stopPropagation methods", () => {
			const event = doc.createEvent("Event");
			expect(event.preventDefault).toBeTypeOf("function");
			expect(event.stopPropagation).toBeTypeOf("function");
			expect(event.stopImmediatePropagation).toBeTypeOf("function");
		});
	});

	describe("node type constants", () => {
		it("all virtual node classes share correct static constants", () => {
			for (const NodeClass of [VirtualElement, VirtualTextNode, VirtualCommentNode]) {
				expect(NodeClass.ELEMENT_NODE).toBe(1);
				expect(NodeClass.TEXT_NODE).toBe(3);
				expect(NodeClass.COMMENT_NODE).toBe(8);
				expect(NodeClass.DOCUMENT_NODE).toBe(9);
				expect(NodeClass.DOCUMENT_FRAGMENT_NODE).toBe(11);
			}
		});
	});

	describe("getAttributeNS / setAttributeNS / removeAttributeNS", () => {
		it("setAttributeNS sets an attribute retrievable by getAttributeNS", () => {
			const div = doc.createElement("div");
			div.setAttributeNS("http://www.w3.org/2000/svg", "viewBox", "0 0 100 100");
			expect(div.getAttributeNS("http://www.w3.org/2000/svg", "viewBox")).toBe("0 0 100 100");
		});

		it("getAttributeNS returns null for missing attributes", () => {
			const div = doc.createElement("div");
			expect(div.getAttributeNS(null, "missing")).toBeNull();
		});

		it("removeAttributeNS removes the attribute", () => {
			const div = doc.createElement("div");
			div.setAttributeNS(null, "role", "button");
			expect(div.getAttributeNS(null, "role")).toBe("button");
			div.removeAttributeNS(null, "role");
			expect(div.getAttributeNS(null, "role")).toBeNull();
		});

		it("interoperates with getAttribute / setAttribute", () => {
			const div = doc.createElement("div");
			div.setAttribute("data-x", "1");
			expect(div.getAttributeNS(null, "data-x")).toBe("1");

			div.setAttributeNS(null, "data-y", "2");
			expect(div.getAttribute("data-y")).toBe("2");
		});
	});

	describe("createTreeWalker", () => {
		it("traverses all nodes in document order", () => {
			const root = doc.createElement("div");
			const child1 = doc.createElement("span");
			const child2 = doc.createElement("em");
			const grandchild = doc.createElement("strong");
			child1.appendChild(grandchild);
			root.appendChild(child1);
			root.appendChild(child2);

			const walker = doc.createTreeWalker(root);
			expect(walker.currentNode).toBe(root);

			const first = walker.nextNode();
			expect(first).toBe(child1);

			const second = walker.nextNode();
			expect(second).toBe(grandchild);

			const third = walker.nextNode();
			expect(third).toBe(child2);

			const end = walker.nextNode();
			expect(end).toBeNull();
		});

		it("includes text nodes in traversal", () => {
			const root = doc.createElement("div");
			const text = doc.createTextNode("hello");
			root.appendChild(text);

			const walker = doc.createTreeWalker(root);
			expect(walker.currentNode).toBe(root);
			expect(walker.nextNode()).toBe(text);
			expect(walker.nextNode()).toBeNull();
		});

		it("works with single node (no children)", () => {
			const root = doc.createElement("div");
			const walker = doc.createTreeWalker(root);
			expect(walker.currentNode).toBe(root);
			expect(walker.nextNode()).toBeNull();
		});
	});

	describe("namespaceURI", () => {
		it("defaults to XHTML namespace for createElement", () => {
			const div = doc.createElement("div");
			expect(div.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
		});

		it("stores namespace from createElementNS", () => {
			const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
			expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
		});
	});

	describe("getRootNode", () => {
		it("returns the topmost ancestor", () => {
			const a = doc.createElement("div");
			const b = doc.createElement("span");
			const c = doc.createElement("em");
			a.appendChild(b);
			b.appendChild(c);
			expect(c.getRootNode()).toBe(a);
		});

		it("returns self for detached nodes", () => {
			const div = doc.createElement("div");
			expect(div.getRootNode()).toBe(div);
		});
	});

	describe("createRange", () => {
		it("returns an object with expected methods", () => {
			const range = doc.createRange() as Record<string, unknown>;
			expect(range.createContextualFragment).toBeTypeOf("function");
			expect(range.setStart).toBeTypeOf("function");
			expect(range.setEnd).toBeTypeOf("function");
			expect(range.collapse).toBeTypeOf("function");
			expect(range.selectNodeContents).toBeTypeOf("function");
			expect(range.cloneRange).toBeTypeOf("function");
		});
	});

	describe("activeElement", () => {
		it("returns body", () => {
			expect(doc.activeElement).toBe(doc.body);
		});
	});

	describe("on* event handler setters", () => {
		it("oninput registers and fires handler", () => {
			const input = doc.createElement("input");
			let fired = false;
			input.oninput = () => {
				fired = true;
			};
			input.dispatchEvent({ type: "input" });
			expect(fired).toBe(true);
		});

		it("oninput null removes handler", () => {
			const input = doc.createElement("input");
			let count = 0;
			input.oninput = () => {
				count++;
			};
			input.dispatchEvent({ type: "input" });
			expect(count).toBe(1);

			input.oninput = null;
			input.dispatchEvent({ type: "input" });
			expect(count).toBe(1);
		});
	});
});
