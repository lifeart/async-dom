import { beforeEach, describe, expect, it } from "vitest";
import { createAppId } from "../../src/core/protocol.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import {
	matches,
	querySelector,
	querySelectorAll,
} from "../../src/worker-thread/selector-engine.ts";

describe("Selector Engine", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	describe("tag selector", () => {
		it("matches by tag name", () => {
			const div = doc.createElement("div");
			const span = doc.createElement("span");
			doc.body.appendChild(div);
			doc.body.appendChild(span);
			const results = querySelectorAll(doc.body, "div");
			expect(results).toHaveLength(1);
			expect(results[0]).toBe(div);
		});

		it("matches case-insensitively", () => {
			const div = doc.createElement("div");
			doc.body.appendChild(div);
			expect(querySelectorAll(doc.body, "DIV")).toHaveLength(1);
		});
	});

	describe("id selector", () => {
		it("matches by id", () => {
			const div = doc.createElement("div");
			div.setAttribute("id", "myId");
			doc.body.appendChild(div);
			const result = querySelector(doc.body, "#myId");
			expect(result).toBe(div);
		});
	});

	describe("class selector", () => {
		it("matches by single class", () => {
			const div = doc.createElement("div");
			div.className = "foo bar";
			doc.body.appendChild(div);
			expect(querySelectorAll(doc.body, ".foo")).toHaveLength(1);
			expect(querySelectorAll(doc.body, ".bar")).toHaveLength(1);
			expect(querySelectorAll(doc.body, ".baz")).toHaveLength(0);
		});

		it("matches by multiple classes", () => {
			const div = doc.createElement("div");
			div.className = "foo bar";
			const span = doc.createElement("span");
			span.className = "foo";
			doc.body.appendChild(div);
			doc.body.appendChild(span);
			expect(querySelectorAll(doc.body, ".foo.bar")).toHaveLength(1);
		});
	});

	describe("universal selector", () => {
		it("* matches all elements", () => {
			const div = doc.createElement("div");
			const span = doc.createElement("span");
			div.appendChild(span);
			doc.body.appendChild(div);
			expect(querySelectorAll(doc.body, "*")).toHaveLength(2);
		});
	});

	describe("combined selectors", () => {
		it("matches tag+class+id", () => {
			const div = doc.createElement("div");
			div.className = "foo";
			div.setAttribute("id", "bar");
			doc.body.appendChild(div);
			expect(matches(div, "div.foo#bar")).toBe(true);
			expect(matches(div, "span.foo#bar")).toBe(false);
		});
	});

	describe("attribute selector", () => {
		it("matches by attribute existence", () => {
			const div = doc.createElement("div");
			div.setAttribute("data-x", "");
			doc.body.appendChild(div);
			expect(querySelectorAll(doc.body, "[data-x]")).toHaveLength(1);
		});

		it("matches by attribute value", () => {
			const div = doc.createElement("div");
			div.setAttribute("data-x", "val");
			const div2 = doc.createElement("div");
			div2.setAttribute("data-x", "other");
			doc.body.appendChild(div);
			doc.body.appendChild(div2);
			expect(querySelectorAll(doc.body, '[data-x="val"]')).toHaveLength(1);
		});
	});

	describe("descendant combinator", () => {
		it("matches nested elements", () => {
			const outer = doc.createElement("div");
			const inner = doc.createElement("span");
			const deep = doc.createElement("em");
			outer.appendChild(inner);
			inner.appendChild(deep);
			doc.body.appendChild(outer);
			expect(querySelectorAll(doc.body, "div em")).toHaveLength(1);
			expect(querySelectorAll(doc.body, "div span em")).toHaveLength(1);
		});
	});

	describe("child combinator", () => {
		it("matches direct children only", () => {
			const outer = doc.createElement("div");
			const inner = doc.createElement("span");
			const deep = doc.createElement("em");
			outer.appendChild(inner);
			inner.appendChild(deep);
			doc.body.appendChild(outer);
			expect(querySelectorAll(doc.body, "div > span")).toHaveLength(1);
			expect(querySelectorAll(doc.body, "div > em")).toHaveLength(0);
		});
	});

	describe("comma (selector group)", () => {
		it("matches union of selectors", () => {
			const div = doc.createElement("div");
			const span = doc.createElement("span");
			const p = doc.createElement("p");
			doc.body.appendChild(div);
			doc.body.appendChild(span);
			doc.body.appendChild(p);
			expect(querySelectorAll(doc.body, "div, span")).toHaveLength(2);
		});
	});

	describe(":first-child", () => {
		it("matches first element child", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			parent.appendChild(a);
			parent.appendChild(b);
			doc.body.appendChild(parent);
			const results = querySelectorAll(doc.body, "span:first-child");
			expect(results).toHaveLength(1);
			expect(results[0]).toBe(a);
		});
	});

	describe(":last-child", () => {
		it("matches last element child", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			parent.appendChild(a);
			parent.appendChild(b);
			doc.body.appendChild(parent);
			const results = querySelectorAll(doc.body, "span:last-child");
			expect(results).toHaveLength(1);
			expect(results[0]).toBe(b);
		});
	});

	describe("scoped queries", () => {
		it("querySelector on element scopes to subtree", () => {
			const container = doc.createElement("div");
			const child = doc.createElement("span");
			container.appendChild(child);
			doc.body.appendChild(container);

			const outside = doc.createElement("span");
			doc.body.appendChild(outside);

			const result = querySelector(container, "span");
			expect(result).toBe(child);
		});

		it("querySelectorAll on element scopes to subtree", () => {
			const container = doc.createElement("div");
			const child1 = doc.createElement("span");
			const child2 = doc.createElement("span");
			container.appendChild(child1);
			container.appendChild(child2);
			doc.body.appendChild(container);

			doc.body.appendChild(doc.createElement("span")); // outside

			const results = querySelectorAll(container, "span");
			expect(results).toHaveLength(2);
		});
	});

	describe("matches", () => {
		it("returns true when element matches selector", () => {
			const div = doc.createElement("div");
			div.className = "foo";
			doc.body.appendChild(div);
			expect(matches(div, "div.foo")).toBe(true);
		});

		it("returns false when element does not match", () => {
			const div = doc.createElement("div");
			doc.body.appendChild(div);
			expect(matches(div, "span")).toBe(false);
		});
	});

	describe("document-level queries", () => {
		it("document.querySelector finds elements", () => {
			const div = doc.createElement("div");
			div.setAttribute("id", "test");
			doc.body.appendChild(div);
			expect(doc.querySelector("#test")).toBe(div);
		});

		it("document.querySelectorAll returns all matches", () => {
			doc.body.appendChild(doc.createElement("span"));
			doc.body.appendChild(doc.createElement("span"));
			expect(doc.querySelectorAll("span")).toHaveLength(2);
		});

		it("document.getElementsByTagName works", () => {
			doc.body.appendChild(doc.createElement("div"));
			doc.body.appendChild(doc.createElement("div"));
			doc.body.appendChild(doc.createElement("span"));
			expect(doc.getElementsByTagName("div")).toHaveLength(2);
		});

		it("document.getElementsByClassName works", () => {
			const a = doc.createElement("div");
			a.className = "foo";
			const b = doc.createElement("span");
			b.className = "foo bar";
			doc.body.appendChild(a);
			doc.body.appendChild(b);
			expect(doc.getElementsByClassName("foo")).toHaveLength(2);
		});

		it("document.getElementsByClassName with multiple classes", () => {
			const a = doc.createElement("div");
			a.className = "foo bar";
			const b = doc.createElement("span");
			b.className = "foo";
			doc.body.appendChild(a);
			doc.body.appendChild(b);
			expect(doc.getElementsByClassName("foo bar")).toHaveLength(1);
		});

		it("querySelector returns first match in document order", () => {
			const first = doc.createElement("div");
			first.className = "target";
			const second = doc.createElement("div");
			second.className = "target";
			doc.body.appendChild(first);
			doc.body.appendChild(second);
			expect(doc.querySelector(".target")).toBe(first);
		});
	});

	describe("element-level queries", () => {
		it("element.closest finds ancestor", () => {
			const outer = doc.createElement("div");
			outer.className = "container";
			const inner = doc.createElement("span");
			outer.appendChild(inner);
			doc.body.appendChild(outer);
			expect(inner.closest(".container")).toBe(outer);
		});

		it("element.closest returns self if matches", () => {
			const div = doc.createElement("div");
			div.className = "target";
			doc.body.appendChild(div);
			expect(div.closest(".target")).toBe(div);
		});

		it("element.closest returns null if no match", () => {
			const div = doc.createElement("div");
			doc.body.appendChild(div);
			expect(div.closest(".nonexistent")).toBeNull();
		});

		it("element.matches works", () => {
			const div = doc.createElement("div");
			div.className = "foo";
			doc.body.appendChild(div);
			expect(div.matches("div.foo")).toBe(true);
			expect(div.matches("span")).toBe(false);
		});

		it("element.getElementsByTagName works", () => {
			const parent = doc.createElement("div");
			parent.appendChild(doc.createElement("span"));
			parent.appendChild(doc.createElement("span"));
			doc.body.appendChild(parent);
			expect(parent.getElementsByTagName("span")).toHaveLength(2);
		});
	});
});
