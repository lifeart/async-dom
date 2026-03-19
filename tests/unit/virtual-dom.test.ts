import { beforeEach, describe, expect, it } from "vitest";
import { createAppId } from "../../src/core/protocol.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import {
	VirtualCommentNode,
	VirtualElement,
	VirtualTextNode,
} from "../../src/worker-thread/element.ts";

describe("VirtualDocument", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("has body and head elements", () => {
		expect(doc.body).toBeInstanceOf(VirtualElement);
		expect(doc.head).toBeInstanceOf(VirtualElement);
		expect(doc.body.tagName).toBe("BODY");
		expect(doc.head.tagName).toBe("HEAD");
	});

	it("creates elements", () => {
		const div = doc.createElement("div");
		expect(div).toBeInstanceOf(VirtualElement);
		expect(div.tagName).toBe("DIV");
		expect(div._nodeId).toBeTruthy();
	});

	it("creates text nodes", () => {
		const text = doc.createTextNode("hello");
		expect(text).toBeInstanceOf(VirtualTextNode);
		expect(text.textContent).toBe("hello");
		expect(text.nodeType).toBe(3);
	});

	it("creates comment nodes", () => {
		const comment = doc.createComment("a comment");
		expect(comment).toBeInstanceOf(VirtualCommentNode);
		expect(comment.textContent).toBe("a comment");
		expect(comment.nodeType).toBe(8);
	});

	it("creates document fragments", () => {
		const frag = doc.createDocumentFragment();
		expect(frag).toBeInstanceOf(VirtualElement);
	});

	it("collects mutations", () => {
		const div = doc.createElement("div");
		doc.body.appendChild(div);
		// Mutations are queued in collector
		expect(doc.collector.pendingCount).toBeGreaterThan(0);
	});
});

describe("VirtualElement", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	describe("attributes", () => {
		it("sets and gets attributes", () => {
			const el = doc.createElement("div");
			el.setAttribute("class", "foo");
			expect(el.getAttribute("class")).toBe("foo");
		});

		it("removes attributes", () => {
			const el = doc.createElement("div");
			el.setAttribute("class", "foo");
			el.removeAttribute("class");
			expect(el.getAttribute("class")).toBeNull();
		});
	});

	describe("children", () => {
		it("appends children", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			expect(parent.children).toHaveLength(1);
			expect(parent.children[0]).toBe(child);
			expect(child.parentNode).toBe(parent);
		});

		it("removes children", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			parent.removeChild(child);
			expect(parent.children).toHaveLength(0);
			expect(child.parentNode).toBeNull();
		});

		it("inserts before", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			const c = doc.createElement("span");
			parent.appendChild(a);
			parent.appendChild(c);
			parent.insertBefore(b, c);
			expect(parent.children).toEqual([a, b, c]);
		});

		it("inserts before null appends to end", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			parent.appendChild(a);
			parent.insertBefore(b, null);
			expect(parent.children).toEqual([a, b]);
		});

		it("removes element from DOM", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			child.remove();
			expect(parent.children).toHaveLength(0);
			expect(child.parentNode).toBeNull();
		});

		it("appends document fragment children", () => {
			const parent = doc.createElement("div");
			const frag = doc.createDocumentFragment();
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			frag.appendChild(a);
			frag.appendChild(b);
			parent.appendChild(frag);
			expect(parent.children).toHaveLength(2);
			expect(parent.children[0]).toBe(a);
			expect(parent.children[1]).toBe(b);
		});
	});

	describe("navigation", () => {
		it("firstChild and lastChild", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			parent.appendChild(a);
			parent.appendChild(b);
			expect(parent.firstChild).toBe(a);
			expect(parent.lastChild).toBe(b);
		});

		it("returns null for empty firstChild/lastChild", () => {
			const parent = doc.createElement("div");
			expect(parent.firstChild).toBeNull();
			expect(parent.lastChild).toBeNull();
		});

		it("nextSibling and previousSibling", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			const c = doc.createElement("span");
			parent.appendChild(a);
			parent.appendChild(b);
			parent.appendChild(c);
			expect(a.nextSibling).toBe(b);
			expect(b.nextSibling).toBe(c);
			expect(c.nextSibling).toBeNull();
			expect(a.previousSibling).toBeNull();
			expect(b.previousSibling).toBe(a);
			expect(c.previousSibling).toBe(b);
		});

		it("parentElement returns parentNode", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			expect(child.parentElement).toBe(parent);
		});

		it("childNodes returns all child nodes", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			expect(parent.childNodes).toEqual([child]);
		});
	});

	describe("text and HTML", () => {
		it("sets textContent", () => {
			const el = doc.createElement("div");
			el.textContent = "hello";
			expect(el.textContent).toBe("hello");
		});

		it("sets innerHTML", () => {
			const el = doc.createElement("div");
			el.innerHTML = "<b>bold</b>";
			expect(el.innerHTML).toBe("<b>bold</b>");
			// innerHTML clears childNodes
			expect(el.childNodes).toHaveLength(0);
		});
	});

	describe("className and classList", () => {
		it("sets and gets className", () => {
			const el = doc.createElement("div");
			el.className = "foo bar";
			expect(el.className).toBe("foo bar");
		});

		it("classList.add adds a class", () => {
			const el = doc.createElement("div");
			el.classList.add("foo");
			expect(el.className).toBe("foo");
		});

		it("classList.remove removes a class", () => {
			const el = doc.createElement("div");
			el.className = "foo bar baz";
			el.classList.remove("bar");
			expect(el.className).toBe("foo baz");
		});

		it("classList.contains checks for class", () => {
			const el = doc.createElement("div");
			el.className = "foo bar";
			expect(el.classList.contains("foo")).toBe(true);
			expect(el.classList.contains("baz")).toBe(false);
		});

		it("classList.toggle toggles class", () => {
			const el = doc.createElement("div");
			el.classList.toggle("foo");
			expect(el.className).toBe("foo");
			el.classList.toggle("foo");
			expect(el.className).toBe("");
		});
	});

	describe("style", () => {
		it("sets style properties via proxy", () => {
			const el = doc.createElement("div");
			el.style["background-color"] = "red";
			expect(el.style["background-color"]).toBe("red");
		});

		it("converts camelCase to kebab-case", () => {
			const el = doc.createElement("div");
			el.style.backgroundColor = "blue";
			expect(el.style["background-color"]).toBe("blue");
		});
	});

	describe("contains", () => {
		it("returns true for self", () => {
			const el = doc.createElement("div");
			expect(el.contains(el)).toBe(true);
		});

		it("returns true for child", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			expect(parent.contains(child)).toBe(true);
		});

		it("returns false for unrelated node", () => {
			const a = doc.createElement("div");
			const b = doc.createElement("div");
			expect(a.contains(b)).toBe(false);
		});

		it("returns false for null", () => {
			const el = doc.createElement("div");
			expect(el.contains(null)).toBe(false);
		});
	});

	describe("cloneNode", () => {
		it("shallow clone copies attributes", () => {
			const el = doc.createElement("div");
			el.setAttribute("class", "foo");
			const clone = el.cloneNode(false);
			expect(clone.getAttribute("class")).toBe("foo");
			expect(clone.children).toHaveLength(0);
		});

		it("deep clone copies children", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			const clone = parent.cloneNode(true);
			expect(clone.children).toHaveLength(1);
			// Clone should be a different instance
			expect(clone.children[0]).not.toBe(child);
		});
	});
});

describe("VirtualTextNode", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("has correct nodeType", () => {
		const text = doc.createTextNode("hello");
		expect(text.nodeType).toBe(3);
	});

	it("gets and sets nodeValue", () => {
		const text = doc.createTextNode("hello");
		expect(text.nodeValue).toBe("hello");
		text.nodeValue = "world";
		expect(text.nodeValue).toBe("world");
	});

	it("textContent is an alias for nodeValue", () => {
		const text = doc.createTextNode("hello");
		text.textContent = "world";
		expect(text.nodeValue).toBe("world");
	});

	it("can be removed", () => {
		const parent = doc.createElement("div");
		const text = doc.createTextNode("hello");
		parent.appendChild(text);
		text.remove();
		expect(parent.childNodes).toHaveLength(0);
	});
});

describe("VirtualElement edge cases", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("appendChild reparenting: child moves from old parent to new", () => {
		const parent1 = doc.createElement("div");
		const parent2 = doc.createElement("div");
		const child = doc.createElement("span");

		parent1.appendChild(child);
		expect(parent1.children).toHaveLength(1);
		expect(child.parentNode).toBe(parent1);

		// Move child to parent2
		parent2.appendChild(child);
		expect(parent1.children).toHaveLength(0);
		expect(parent2.children).toHaveLength(1);
		expect(child.parentNode).toBe(parent2);
	});

	it("remove() on node with no parent does not throw", () => {
		const el = doc.createElement("div");
		expect(el.parentNode).toBeNull();
		expect(() => el.remove()).not.toThrow();
		expect(el.parentNode).toBeNull();
	});

	it("className setter with empty string", () => {
		const el = doc.createElement("div");
		el.className = "foo bar";
		el.className = "";
		expect(el.className).toBe("");
	});

	it("classList.toggle with force=true adds class if not present", () => {
		const el = doc.createElement("div");
		const result = el.classList.toggle("active", true);
		expect(result).toBe(true);
		expect(el.classList.contains("active")).toBe(true);
	});

	it("classList.toggle with force=false removes class if present", () => {
		const el = doc.createElement("div");
		el.className = "active";
		const result = el.classList.toggle("active", false);
		expect(result).toBe(false);
		expect(el.classList.contains("active")).toBe(false);
	});

	it("classList.toggle with force=true when class already exists is a no-op", () => {
		const el = doc.createElement("div");
		el.className = "active";
		const result = el.classList.toggle("active", true);
		expect(result).toBe(true);
		expect(el.classList.contains("active")).toBe(true);
	});

	it("classList.toggle with force=false when class not present is a no-op", () => {
		const el = doc.createElement("div");
		const result = el.classList.toggle("active", false);
		expect(result).toBe(false);
		expect(el.classList.contains("active")).toBe(false);
	});

	it("setAttribute('style', 'color: red; font-size: 12px') parses correctly", () => {
		const el = doc.createElement("div");
		el.setAttribute("style", "color: red; font-size: 12px");
		expect(el.style.color).toBe("red");
		expect(el.style["font-size"]).toBe("12px");
	});
});
