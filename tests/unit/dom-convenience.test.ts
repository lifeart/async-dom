import { beforeEach, describe, expect, it } from "vitest";
import { createAppId } from "../../src/core/protocol.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";

describe("DOM Convenience Methods", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	describe("append", () => {
		it("appends multiple children", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			parent.append(a, b);
			expect(parent.children).toHaveLength(2);
			expect(parent.children[0]).toBe(a);
			expect(parent.children[1]).toBe(b);
		});
	});

	describe("prepend", () => {
		it("prepends before existing children", () => {
			const parent = doc.createElement("div");
			const existing = doc.createElement("span");
			parent.appendChild(existing);
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			parent.prepend(a, b);
			expect(parent.children).toHaveLength(3);
			expect(parent.children[0]).toBe(a);
			expect(parent.children[1]).toBe(b);
			expect(parent.children[2]).toBe(existing);
		});

		it("prepend on empty element", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			parent.prepend(a);
			expect(parent.children).toHaveLength(1);
			expect(parent.children[0]).toBe(a);
		});
	});

	describe("replaceWith", () => {
		it("replaces element with new nodes", () => {
			const parent = doc.createElement("div");
			const old = doc.createElement("span");
			const replacement = doc.createElement("em");
			parent.appendChild(old);
			old.replaceWith(replacement);
			expect(parent.children).toHaveLength(1);
			expect(parent.children[0]).toBe(replacement);
			expect(old.parentNode).toBeNull();
		});

		it("replaces with multiple nodes", () => {
			const parent = doc.createElement("div");
			const old = doc.createElement("span");
			const a = doc.createElement("em");
			const b = doc.createElement("strong");
			parent.appendChild(old);
			old.replaceWith(a, b);
			expect(parent.children).toHaveLength(2);
			expect(parent.children[0]).toBe(a);
			expect(parent.children[1]).toBe(b);
		});

		it("does nothing if no parent", () => {
			const el = doc.createElement("div");
			const replacement = doc.createElement("span");
			expect(() => el.replaceWith(replacement)).not.toThrow();
		});
	});

	describe("before", () => {
		it("inserts nodes before element", () => {
			const parent = doc.createElement("div");
			const existing = doc.createElement("span");
			parent.appendChild(existing);
			const inserted = doc.createElement("em");
			existing.before(inserted);
			expect(parent.children).toHaveLength(2);
			expect(parent.children[0]).toBe(inserted);
			expect(parent.children[1]).toBe(existing);
		});

		it("does nothing if no parent", () => {
			const el = doc.createElement("div");
			const node = doc.createElement("span");
			expect(() => el.before(node)).not.toThrow();
		});
	});

	describe("after", () => {
		it("inserts nodes after element", () => {
			const parent = doc.createElement("div");
			const existing = doc.createElement("span");
			const tail = doc.createElement("p");
			parent.appendChild(existing);
			parent.appendChild(tail);
			const inserted = doc.createElement("em");
			existing.after(inserted);
			expect(parent.children).toHaveLength(3);
			expect(parent.children[0]).toBe(existing);
			expect(parent.children[1]).toBe(inserted);
			expect(parent.children[2]).toBe(tail);
		});

		it("appends at end if element is last child", () => {
			const parent = doc.createElement("div");
			const existing = doc.createElement("span");
			parent.appendChild(existing);
			const inserted = doc.createElement("em");
			existing.after(inserted);
			expect(parent.children).toHaveLength(2);
			expect(parent.children[1]).toBe(inserted);
		});
	});

	describe("replaceChildren", () => {
		it("replaces all children", () => {
			const parent = doc.createElement("div");
			parent.appendChild(doc.createElement("span"));
			parent.appendChild(doc.createElement("span"));
			const newChild = doc.createElement("em");
			parent.replaceChildren(newChild);
			expect(parent.children).toHaveLength(1);
			expect(parent.children[0]).toBe(newChild);
		});

		it("clears children when called with no args", () => {
			const parent = doc.createElement("div");
			parent.appendChild(doc.createElement("span"));
			parent.replaceChildren();
			expect(parent.children).toHaveLength(0);
		});
	});

	describe("dataset", () => {
		it("sets data attributes", () => {
			const el = doc.createElement("div");
			el.dataset.fooBar = "baz";
			expect(el.getAttribute("data-foo-bar")).toBe("baz");
		});

		it("gets data attributes", () => {
			const el = doc.createElement("div");
			el.setAttribute("data-foo-bar", "baz");
			expect(el.dataset.fooBar).toBe("baz");
		});

		it("returns undefined for missing data attributes", () => {
			const el = doc.createElement("div");
			expect(el.dataset.missing).toBeUndefined();
		});

		it("deletes data attributes", () => {
			const el = doc.createElement("div");
			el.setAttribute("data-test", "val");
			delete el.dataset.test;
			expect(el.hasAttribute("data-test")).toBe(false);
		});
	});

	describe("insertAdjacentHTML", () => {
		it("emits insertAdjacentHTML mutation", () => {
			const el = doc.createElement("div");
			doc.body.appendChild(el);
			doc.collector.flushSync();

			el.insertAdjacentHTML("beforeend", "<span>test</span>");
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});
	});
});
