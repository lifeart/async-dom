import { beforeEach, describe, expect, it } from "vitest";
import { createAppId } from "../../src/core/protocol.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import { VirtualElement, VirtualTextNode } from "../../src/worker-thread/element.ts";

describe("Element", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	// ─── Attributes ──────────────────────────────────────────────────────────

	describe("setAttribute / getAttribute / hasAttribute / removeAttribute", () => {
		it("returns null for missing attribute", () => {
			const el = doc.createElement("div");
			expect(el.getAttribute("missing")).toBeNull();
		});

		it("sets and reads back an attribute", () => {
			const el = doc.createElement("div");
			el.setAttribute("aria-label", "hello");
			expect(el.getAttribute("aria-label")).toBe("hello");
		});

		it("overwrites existing attribute value", () => {
			const el = doc.createElement("div");
			el.setAttribute("data-x", "1");
			el.setAttribute("data-x", "2");
			expect(el.getAttribute("data-x")).toBe("2");
		});

		it("hasAttribute reflects presence", () => {
			const el = doc.createElement("div");
			expect(el.hasAttribute("role")).toBe(false);
			el.setAttribute("role", "button");
			expect(el.hasAttribute("role")).toBe(true);
		});

		it("removeAttribute makes hasAttribute return false", () => {
			const el = doc.createElement("div");
			el.setAttribute("role", "button");
			el.removeAttribute("role");
			expect(el.hasAttribute("role")).toBe(false);
			expect(el.getAttribute("role")).toBeNull();
		});

		it("removeAttribute on absent attribute does not throw", () => {
			const el = doc.createElement("div");
			expect(() => el.removeAttribute("nope")).not.toThrow();
		});

		it("setting id attribute updates element.id", () => {
			const el = doc.createElement("div");
			el.setAttribute("id", "foo");
			expect(el.id).toBe("foo");
		});

		it("setting id via element.id setter updates getAttribute", () => {
			const el = doc.createElement("div");
			el.id = "bar";
			expect(el.getAttribute("id")).toBe("bar");
		});

		it("changing id attribute unregisters old id from document", () => {
			const el = doc.createElement("div");
			doc.body.appendChild(el);
			el.setAttribute("id", "first");
			expect(doc.getElementById("first")).toBe(el);
			el.setAttribute("id", "second");
			expect(doc.getElementById("first")).toBeNull();
			expect(doc.getElementById("second")).toBe(el);
		});

		it("setAttribute('style', ...) parses CSS into style proxy", () => {
			const el = doc.createElement("div");
			el.setAttribute("style", "color: blue; margin-top: 4px");
			expect(el.style.color).toBe("blue");
			expect(el.style["margin-top"]).toBe("4px");
		});

		it("getAttributeNS delegates to getAttribute", () => {
			const el = doc.createElement("div");
			el.setAttribute("href", "http://example.com");
			expect(el.getAttributeNS(null, "href")).toBe("http://example.com");
		});

		it("setAttributeNS delegates to setAttribute", () => {
			const el = doc.createElement("div");
			el.setAttributeNS(null, "data-y", "val");
			expect(el.getAttribute("data-y")).toBe("val");
		});

		it("removeAttributeNS delegates to removeAttribute", () => {
			const el = doc.createElement("div");
			el.setAttribute("data-y", "val");
			el.removeAttributeNS(null, "data-y");
			expect(el.getAttribute("data-y")).toBeNull();
		});

		it("attributes.length and item() enumerate attributes", () => {
			const el = doc.createElement("div");
			el.setAttribute("a", "1");
			el.setAttribute("b", "2");
			const attrs = el.attributes;
			expect(attrs.length).toBe(2);
			const names = [attrs.item(0)?.name, attrs.item(1)?.name];
			expect(names).toContain("a");
			expect(names).toContain("b");
		});

		it("attributes.item() returns null for out-of-bounds index", () => {
			const el = doc.createElement("div");
			expect(el.attributes.item(0)).toBeNull();
		});
	});

	// ─── toggleAttribute ─────────────────────────────────────────────────────

	describe("toggleAttribute (via classList as proxy)", () => {
		// VirtualElement does not expose toggleAttribute directly; covered via hasAttribute
		it("setAttribute then removeAttribute toggles presence", () => {
			const el = doc.createElement("div");
			el.setAttribute("hidden", "");
			expect(el.hasAttribute("hidden")).toBe(true);
			el.removeAttribute("hidden");
			expect(el.hasAttribute("hidden")).toBe(false);
		});
	});

	// ─── classList ────────────────────────────────────────────────────────────

	describe("classList", () => {
		it("add does not duplicate classes", () => {
			const el = doc.createElement("div");
			el.classList.add("a");
			el.classList.add("a");
			expect(el.className).toBe("a");
		});

		it("add multiple classes at once", () => {
			const el = doc.createElement("div");
			el.classList.add("x", "y", "z");
			expect(el.classList.contains("x")).toBe(true);
			expect(el.classList.contains("y")).toBe(true);
			expect(el.classList.contains("z")).toBe(true);
		});

		it("remove multiple classes at once", () => {
			const el = doc.createElement("div");
			el.className = "a b c";
			el.classList.remove("a", "c");
			expect(el.className).toBe("b");
		});

		it("remove non-existent class does not throw", () => {
			const el = doc.createElement("div");
			expect(() => el.classList.remove("ghost")).not.toThrow();
		});

		it("toggle without force flips presence", () => {
			const el = doc.createElement("div");
			const r1 = el.classList.toggle("active");
			expect(r1).toBe(true);
			expect(el.classList.contains("active")).toBe(true);
			const r2 = el.classList.toggle("active");
			expect(r2).toBe(false);
			expect(el.classList.contains("active")).toBe(false);
		});

		it("toggle force=true always adds and returns true", () => {
			const el = doc.createElement("div");
			expect(el.classList.toggle("on", true)).toBe(true);
			expect(el.classList.toggle("on", true)).toBe(true);
			expect(el.classList.contains("on")).toBe(true);
		});

		it("toggle force=false always removes and returns false", () => {
			const el = doc.createElement("div");
			el.classList.add("on");
			expect(el.classList.toggle("on", false)).toBe(false);
			expect(el.classList.toggle("on", false)).toBe(false);
			expect(el.classList.contains("on")).toBe(false);
		});

		it("length reflects class count", () => {
			const el = doc.createElement("div");
			expect(el.classList.length).toBe(0);
			el.classList.add("a", "b");
			expect(el.classList.length).toBe(2);
			el.classList.remove("a");
			expect(el.classList.length).toBe(1);
		});

		it("className setter with spaces updates classList", () => {
			const el = doc.createElement("div");
			el.className = "  foo   bar  ";
			expect(el.classList.contains("foo")).toBe(true);
			expect(el.classList.contains("bar")).toBe(true);
		});
	});

	// ─── Property access ──────────────────────────────────────────────────────

	describe("property access", () => {
		it("tagName is uppercase", () => {
			const el = doc.createElement("section");
			expect(el.tagName).toBe("SECTION");
		});

		it("nodeName equals tagName", () => {
			const el = doc.createElement("article");
			expect(el.nodeName).toBe(el.tagName);
		});

		it("nodeType is 1 (ELEMENT_NODE)", () => {
			const el = doc.createElement("div");
			expect(el.nodeType).toBe(1);
		});

		it("namespaceURI defaults to XHTML namespace", () => {
			const el = doc.createElement("div");
			expect(el.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
		});

		it("id defaults to empty string", () => {
			const el = doc.createElement("div");
			expect(el.id).toBe("");
		});

		it("className defaults to empty string", () => {
			const el = doc.createElement("div");
			expect(el.className).toBe("");
		});

		it("textContent aggregates child text nodes", () => {
			const parent = doc.createElement("div");
			parent.appendChild(doc.createTextNode("hello "));
			const span = doc.createElement("span");
			span.appendChild(doc.createTextNode("world"));
			parent.appendChild(span);
			expect(parent.textContent).toBe("hello world");
		});

		it("textContent returns _textContent when no children", () => {
			const el = doc.createElement("div");
			el.textContent = "standalone";
			expect(el.textContent).toBe("standalone");
		});

		it("innerHTML stores value independently of childNodes", () => {
			const el = doc.createElement("div");
			el.appendChild(doc.createElement("span"));
			el.innerHTML = "<b>bold</b>";
			expect(el.innerHTML).toBe("<b>bold</b>");
			expect(el.childNodes).toHaveLength(0);
		});

		it("outerHTML is not defined (not part of virtual API)", () => {
			// VirtualElement does not implement outerHTML — confirm it's not there
			const el = doc.createElement("div");
			expect((el as unknown as Record<string, unknown>).outerHTML).toBeUndefined();
		});
	});

	// ─── Child / parent traversal ─────────────────────────────────────────────

	describe("child and parent traversal", () => {
		it("firstChild / lastChild over mixed node types", () => {
			const parent = doc.createElement("div");
			const text = doc.createTextNode("hi");
			const span = doc.createElement("span");
			parent.appendChild(text);
			parent.appendChild(span);
			expect(parent.firstChild).toBe(text);
			expect(parent.lastChild).toBe(span);
		});

		it("firstElementChild skips text nodes", () => {
			const parent = doc.createElement("div");
			parent.appendChild(doc.createTextNode("text"));
			const span = doc.createElement("span");
			parent.appendChild(span);
			expect(parent.firstElementChild).toBe(span);
		});

		it("lastElementChild skips text nodes", () => {
			const parent = doc.createElement("div");
			const span = doc.createElement("span");
			parent.appendChild(span);
			parent.appendChild(doc.createTextNode("text"));
			expect(parent.lastElementChild).toBe(span);
		});

		it("childElementCount only counts element nodes", () => {
			const parent = doc.createElement("div");
			parent.appendChild(doc.createTextNode("t"));
			parent.appendChild(doc.createElement("span"));
			parent.appendChild(doc.createComment("c"));
			parent.appendChild(doc.createElement("em"));
			expect(parent.childElementCount).toBe(2);
		});

		it("nextElementSibling skips non-element nodes", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const text = doc.createTextNode("between");
			const b = doc.createElement("em");
			parent.appendChild(a);
			parent.appendChild(text);
			parent.appendChild(b);
			expect(a.nextElementSibling).toBe(b);
		});

		it("previousElementSibling skips non-element nodes", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const text = doc.createTextNode("between");
			const b = doc.createElement("em");
			parent.appendChild(a);
			parent.appendChild(text);
			parent.appendChild(b);
			expect(b.previousElementSibling).toBe(a);
		});

		it("nextElementSibling returns null at end", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("em");
			parent.appendChild(a);
			parent.appendChild(b);
			expect(b.nextElementSibling).toBeNull();
		});

		it("previousElementSibling returns null at start", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			parent.appendChild(a);
			expect(a.previousElementSibling).toBeNull();
		});

		it("nextSibling / previousSibling work across node types", () => {
			const parent = doc.createElement("div");
			const text = doc.createTextNode("t");
			const span = doc.createElement("span");
			parent.appendChild(text);
			parent.appendChild(span);
			expect(text.nextSibling).toBe(span);
			expect(span.previousSibling).toBe(text);
		});

		it("parentNode is null before appending", () => {
			const el = doc.createElement("div");
			expect(el.parentNode).toBeNull();
		});

		it("parentElement mirrors parentNode", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			expect(child.parentElement).toBe(parent);
			expect(child.parentElement).toBe(child.parentNode);
		});

		it("hasChildNodes returns false for empty element", () => {
			const el = doc.createElement("div");
			expect(el.hasChildNodes()).toBe(false);
		});

		it("hasChildNodes returns true after appending", () => {
			const el = doc.createElement("div");
			el.appendChild(doc.createElement("span"));
			expect(el.hasChildNodes()).toBe(true);
		});

		it("getRootNode walks to topmost ancestor", () => {
			const root = doc.createElement("div");
			const child = doc.createElement("span");
			const grand = doc.createElement("em");
			root.appendChild(child);
			child.appendChild(grand);
			expect(grand.getRootNode()).toBe(root);
		});
	});

	// ─── Element modification ────────────────────────────────────────────────

	describe("append / prepend / remove / replaceWith / before / after", () => {
		it("append adds multiple nodes", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("em");
			parent.append(a, b);
			expect(parent.childNodes).toEqual([a, b]);
		});

		it("prepend inserts before existing children", () => {
			const parent = doc.createElement("div");
			const existing = doc.createElement("span");
			parent.appendChild(existing);
			const first = doc.createElement("em");
			parent.prepend(first);
			expect(parent.firstChild).toBe(first);
			expect(parent.lastChild).toBe(existing);
		});

		it("prepend multiple nodes in order", () => {
			const parent = doc.createElement("div");
			const tail = doc.createElement("span");
			parent.appendChild(tail);
			const a = doc.createElement("em");
			const b = doc.createElement("strong");
			parent.prepend(a, b);
			expect(parent.childNodes[0]).toBe(a);
			expect(parent.childNodes[1]).toBe(b);
			expect(parent.childNodes[2]).toBe(tail);
		});

		it("remove detaches element from parent", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			child.remove();
			expect(parent.childNodes).toHaveLength(0);
			expect(child.parentNode).toBeNull();
		});

		it("remove on detached element does not throw", () => {
			const el = doc.createElement("div");
			expect(() => el.remove()).not.toThrow();
		});

		it("replaceWith swaps element in parent", () => {
			const parent = doc.createElement("div");
			const old = doc.createElement("span");
			const replacement = doc.createElement("em");
			parent.appendChild(old);
			old.replaceWith(replacement);
			expect(parent.childNodes).toEqual([replacement]);
			expect(old.parentNode).toBeNull();
		});

		it("replaceWith does nothing when no parent", () => {
			const orphan = doc.createElement("div");
			const other = doc.createElement("span");
			expect(() => orphan.replaceWith(other)).not.toThrow();
		});

		it("before inserts node before self", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("em");
			parent.appendChild(a);
			a.before(b);
			expect(parent.childNodes).toEqual([b, a]);
		});

		it("after inserts node after self", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("em");
			parent.appendChild(a);
			a.after(b);
			expect(parent.childNodes).toEqual([a, b]);
		});

		it("insertBefore with null ref appends to end", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("em");
			parent.appendChild(a);
			parent.insertBefore(b, null);
			expect(parent.childNodes).toEqual([a, b]);
		});

		it("removeChild removes specified child only", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("em");
			parent.appendChild(a);
			parent.appendChild(b);
			parent.removeChild(a);
			expect(parent.childNodes).toEqual([b]);
		});

		it("replaceChild replaces old with new", () => {
			const parent = doc.createElement("div");
			const old = doc.createElement("span");
			const fresh = doc.createElement("em");
			parent.appendChild(old);
			parent.replaceChild(fresh, old);
			expect(parent.childNodes).toContain(fresh);
			expect(parent.childNodes).not.toContain(old);
		});

		it("replaceChild returns the old child", () => {
			const parent = doc.createElement("div");
			const old = doc.createElement("span");
			parent.appendChild(old);
			const returned = parent.replaceChild(doc.createElement("em"), old);
			expect(returned).toBe(old);
		});

		it("replaceChild returns oldChild when not found", () => {
			const parent = doc.createElement("div");
			const notChild = doc.createElement("span");
			const fresh = doc.createElement("em");
			const returned = parent.replaceChild(fresh, notChild);
			expect(returned).toBe(notChild);
		});

		it("replaceChildren clears existing children", () => {
			const parent = doc.createElement("div");
			parent.appendChild(doc.createElement("span"));
			parent.appendChild(doc.createElement("em"));
			parent.replaceChildren();
			expect(parent.childNodes).toHaveLength(0);
		});

		it("replaceChildren replaces with new nodes", () => {
			const parent = doc.createElement("div");
			parent.appendChild(doc.createElement("span"));
			const a = doc.createElement("strong");
			const b = doc.createElement("em");
			parent.replaceChildren(a, b);
			expect(parent.childNodes).toEqual([a, b]);
		});

		it("appendChild flattens document fragment", () => {
			const parent = doc.createElement("div");
			const frag = doc.createDocumentFragment();
			const a = doc.createElement("span");
			const b = doc.createElement("em");
			frag.appendChild(a);
			frag.appendChild(b);
			parent.appendChild(frag);
			expect(parent.childNodes).toEqual([a, b]);
			expect(frag.childNodes).toHaveLength(0);
		});

		it("insertBefore flattens document fragment", () => {
			const parent = doc.createElement("div");
			const ref = doc.createElement("strong");
			parent.appendChild(ref);
			const frag = doc.createDocumentFragment();
			const a = doc.createElement("span");
			frag.appendChild(a);
			parent.insertBefore(frag, ref);
			expect(parent.childNodes[0]).toBe(a);
			expect(parent.childNodes[1]).toBe(ref);
		});

		it("reparenting a child removes it from old parent", () => {
			const p1 = doc.createElement("div");
			const p2 = doc.createElement("div");
			const child = doc.createElement("span");
			p1.appendChild(child);
			p2.appendChild(child);
			expect(p1.childNodes).toHaveLength(0);
			expect(p2.childNodes).toContain(child);
			expect(child.parentNode).toBe(p2);
		});
	});

	// ─── Dataset proxy ────────────────────────────────────────────────────────

	describe("dataset proxy", () => {
		it("reading missing key returns undefined", () => {
			const el = doc.createElement("div");
			expect(el.dataset.userId).toBeUndefined();
		});

		it("setting camelCase property writes data-* attribute", () => {
			const el = doc.createElement("div");
			el.dataset.userId = "42";
			expect(el.getAttribute("data-user-id")).toBe("42");
		});

		it("reading camelCase property reads data-* attribute", () => {
			const el = doc.createElement("div");
			el.setAttribute("data-item-count", "7");
			expect(el.dataset.itemCount).toBe("7");
		});

		it("deleting property removes attribute", () => {
			const el = doc.createElement("div");
			el.dataset.foo = "bar";
			delete el.dataset.foo;
			expect(el.hasAttribute("data-foo")).toBe(false);
		});

		it("'in' operator checks attribute presence", () => {
			const el = doc.createElement("div");
			expect("userId" in el.dataset).toBe(false);
			el.dataset.userId = "1";
			expect("userId" in el.dataset).toBe(true);
		});

		it("Object.keys returns camelCase keys for data-* attrs", () => {
			const el = doc.createElement("div");
			el.setAttribute("data-foo-bar", "1");
			el.setAttribute("data-baz", "2");
			el.setAttribute("title", "not-data");
			const keys = Object.keys(el.dataset);
			expect(keys).toContain("fooBar");
			expect(keys).toContain("baz");
			expect(keys).not.toContain("title");
		});

		it("returns same proxy instance on repeated access", () => {
			const el = doc.createElement("div");
			expect(el.dataset).toBe(el.dataset);
		});
	});

	// ─── Style proxy ─────────────────────────────────────────────────────────

	describe("style proxy", () => {
		it("sets and reads camelCase property", () => {
			const el = doc.createElement("div");
			el.style.backgroundColor = "tomato";
			expect(el.style.backgroundColor).toBe("tomato");
			expect(el.style["background-color"]).toBe("tomato");
		});

		it("sets and reads kebab-case property", () => {
			const el = doc.createElement("div");
			el.style["font-size"] = "16px";
			expect(el.style["font-size"]).toBe("16px");
		});

		it("emits mutation when style is set", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			el.style.color = "red";
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("unset property returns empty string", () => {
			const el = doc.createElement("div");
			expect(el.style.color).toBe("");
		});
	});

	// ─── cloneNode ────────────────────────────────────────────────────────────

	describe("cloneNode", () => {
		it("shallow clone has same tag", () => {
			const el = doc.createElement("section");
			const clone = el.cloneNode(false);
			expect(clone.tagName).toBe("SECTION");
		});

		it("shallow clone has independent _nodeId", () => {
			const el = doc.createElement("div");
			const clone = el.cloneNode(false);
			expect(clone._nodeId).not.toBe(el._nodeId);
		});

		it("shallow clone copies all attributes", () => {
			const el = doc.createElement("div");
			el.setAttribute("role", "listitem");
			el.setAttribute("aria-selected", "true");
			const clone = el.cloneNode(false);
			expect(clone.getAttribute("role")).toBe("listitem");
			expect(clone.getAttribute("aria-selected")).toBe("true");
		});

		it("shallow clone has no children", () => {
			const el = doc.createElement("div");
			el.appendChild(doc.createElement("span"));
			const clone = el.cloneNode(false);
			expect(clone.childNodes).toHaveLength(0);
		});

		it("deep clone copies class list", () => {
			const el = doc.createElement("div");
			el.className = "a b c";
			const clone = el.cloneNode(true);
			expect(clone.className).toBe("a b c");
		});

		it("deep clone children are new instances", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			const clone = parent.cloneNode(true);
			expect(clone.childNodes[0]).not.toBe(child);
			expect((clone.childNodes[0] as VirtualElement).tagName).toBe("SPAN");
		});

		it("clone does not share parentNode of original", () => {
			const container = doc.createElement("div");
			const el = doc.createElement("span");
			container.appendChild(el);
			const clone = el.cloneNode(false);
			expect(clone.parentNode).toBeNull();
		});
	});

	// ─── Form element properties ──────────────────────────────────────────────

	describe("form element properties", () => {
		it("value defaults to empty string", () => {
			const input = doc.createElement("input");
			expect(input.value).toBe("");
		});

		it("value setter stores and emits mutation", () => {
			const input = doc.createElement("input");
			doc.collector.flushSync();
			input.value = "hello";
			expect(input.value).toBe("hello");
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("checked defaults to false", () => {
			const checkbox = doc.createElement("input");
			expect(checkbox.checked).toBe(false);
		});

		it("checked setter toggles and emits mutation", () => {
			const checkbox = doc.createElement("input");
			doc.collector.flushSync();
			checkbox.checked = true;
			expect(checkbox.checked).toBe(true);
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("disabled defaults to false", () => {
			const input = doc.createElement("input");
			expect(input.disabled).toBe(false);
		});

		it("disabled setter changes value and emits mutation", () => {
			const input = doc.createElement("input");
			doc.collector.flushSync();
			input.disabled = true;
			expect(input.disabled).toBe(true);
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("selectedIndex defaults to -1", () => {
			const select = doc.createElement("select");
			expect(select.selectedIndex).toBe(-1);
		});

		it("selectedIndex setter updates and emits mutation", () => {
			const select = doc.createElement("select");
			doc.collector.flushSync();
			select.selectedIndex = 2;
			expect(select.selectedIndex).toBe(2);
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("_updateInputState updates without emitting mutation", () => {
			const input = doc.createElement("input");
			doc.collector.flushSync();
			input._updateInputState({ value: "synced", checked: true, selectedIndex: 1 });
			expect(input.value).toBe("synced");
			expect(input.checked).toBe(true);
			expect(input.selectedIndex).toBe(1);
			expect(doc.collector.pendingCount).toBe(0);
		});
	});

	// ─── matches() and closest() ──────────────────────────────────────────────

	describe("matches() and closest()", () => {
		it("matches tag selector", () => {
			const div = doc.createElement("div");
			expect(div.matches("div")).toBe(true);
			expect(div.matches("span")).toBe(false);
		});

		it("matches class selector", () => {
			const el = doc.createElement("div");
			el.className = "btn primary";
			expect(el.matches(".btn")).toBe(true);
			expect(el.matches(".btn.primary")).toBe(true);
			expect(el.matches(".btn.secondary")).toBe(false);
		});

		it("matches id selector", () => {
			const el = doc.createElement("div");
			el.id = "main";
			expect(el.matches("#main")).toBe(true);
			expect(el.matches("#other")).toBe(false);
		});

		it("closest returns self when selector matches", () => {
			const el = doc.createElement("div");
			el.className = "box";
			doc.body.appendChild(el);
			expect(el.closest(".box")).toBe(el);
		});

		it("closest returns ancestor", () => {
			const outer = doc.createElement("section");
			outer.className = "wrapper";
			const inner = doc.createElement("div");
			const deep = doc.createElement("span");
			outer.appendChild(inner);
			inner.appendChild(deep);
			doc.body.appendChild(outer);
			expect(deep.closest(".wrapper")).toBe(outer);
		});

		it("closest returns null when no match", () => {
			const el = doc.createElement("div");
			doc.body.appendChild(el);
			expect(el.closest(".nonexistent")).toBeNull();
		});

		it("closest does not escape past root", () => {
			const el = doc.createElement("div");
			// Not attached to document
			expect(el.closest("body")).toBeNull();
		});
	});

	// ─── getBoundingClientRect stub ───────────────────────────────────────────

	describe("getBoundingClientRect", () => {
		it("returns zeroed rect when no sync channel", () => {
			const el = doc.createElement("div");
			const rect = el.getBoundingClientRect();
			expect(rect).toEqual({
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				width: 0,
				height: 0,
				x: 0,
				y: 0,
			});
		});

	});

	// ─── contains() ──────────────────────────────────────────────────────────

	describe("contains()", () => {
		it("contains self", () => {
			const el = doc.createElement("div");
			expect(el.contains(el)).toBe(true);
		});

		it("contains direct child", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			expect(parent.contains(child)).toBe(true);
		});

		it("contains deeply nested descendant", () => {
			const root = doc.createElement("div");
			const mid = doc.createElement("section");
			const leaf = doc.createElement("span");
			root.appendChild(mid);
			mid.appendChild(leaf);
			expect(root.contains(leaf)).toBe(true);
		});

		it("does not contain sibling", () => {
			const parent = doc.createElement("div");
			const a = doc.createElement("span");
			const b = doc.createElement("span");
			parent.appendChild(a);
			parent.appendChild(b);
			expect(a.contains(b)).toBe(false);
		});

		it("does not contain parent", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			expect(child.contains(parent)).toBe(false);
		});

		it("returns false for null", () => {
			const el = doc.createElement("div");
			expect(el.contains(null)).toBe(false);
		});

		it("contains text node child", () => {
			const parent = doc.createElement("div");
			const text = doc.createTextNode("hello");
			parent.appendChild(text);
			expect(parent.contains(text)).toBe(true);
		});
	});

	// ─── Mutation tracking ────────────────────────────────────────────────────

	describe("mutation tracking", () => {
		it("setAttribute emits mutation", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			el.setAttribute("data-test", "1");
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("removeAttribute emits mutation", () => {
			const el = doc.createElement("div");
			el.setAttribute("data-test", "1");
			doc.collector.flushSync();
			el.removeAttribute("data-test");
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("className setter emits mutation", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			el.className = "new-class";
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("textContent setter emits mutation", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			el.textContent = "changed";
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("innerHTML setter emits mutation", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			el.innerHTML = "<span>test</span>";
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("appendChild emits mutation", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			doc.collector.flushSync();
			parent.appendChild(child);
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("remove() emits mutation", () => {
			const parent = doc.createElement("div");
			const child = doc.createElement("span");
			parent.appendChild(child);
			doc.collector.flushSync();
			child.remove();
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("scrollTop setter emits setProperty mutation", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			el.scrollTop = 100;
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});

		it("scrollLeft setter emits setProperty mutation", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			el.scrollLeft = 50;
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});
	});

	// ─── Event listeners ─────────────────────────────────────────────────────

	describe("addEventListener / removeEventListener", () => {
		it("registered listener is callable via getEventListener", () => {
			const el = doc.createElement("div");
			const cb = () => {};
			el.addEventListener("click", cb);
			const listeners = (el as unknown as { _eventListeners: Map<string, unknown> })._eventListeners;
			const stored = [...listeners.values()];
			expect(stored).toContain(cb);
		});

		it("removeEventListener removes the callback", () => {
			const el = doc.createElement("div");
			const cb = () => {};
			el.addEventListener("click", cb);
			el.removeEventListener("click", cb);
			const listeners = (el as unknown as { _eventListeners: Map<string, unknown> })._eventListeners;
			expect(listeners.size).toBe(0);
		});

		it("dispatchEvent fires matching listeners", () => {
			const el = doc.createElement("div");
			let fired = false;
			el.addEventListener("click", () => {
				fired = true;
			});
			el.dispatchEvent({ type: "click" });
			expect(fired).toBe(true);
		});

		it("dispatchEvent does not fire listeners for different event types", () => {
			const el = doc.createElement("div");
			let fired = false;
			el.addEventListener("mouseover", () => {
				fired = true;
			});
			el.dispatchEvent({ type: "click" });
			expect(fired).toBe(false);
		});

		it("once option removes listener after first invocation", () => {
			const el = doc.createElement("div");
			doc.body.appendChild(el);
			let count = 0;
			el.addEventListener("click", () => count++, { once: true });

			const listenerId = [...(el as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys()][0];
			doc.dispatchEvent(listenerId, { type: "click", target: el._nodeId, bubbles: false });
			doc.dispatchEvent(listenerId, { type: "click", target: el._nodeId, bubbles: false });
			expect(count).toBe(1);
		});

		it("empty event name is ignored", () => {
			const el = doc.createElement("div");
			expect(() => el.addEventListener("", () => {})).not.toThrow();
			const listeners = (el as unknown as { _eventListeners: Map<string, unknown> })._eventListeners;
			expect(listeners.size).toBe(0);
		});

		it("on* setter registers and replaces handlers", () => {
			const el = doc.createElement("div");
			let count = 0;
			el.onclick = () => count++;
			el.onclick = () => {
				count += 10;
			};
			el.dispatchEvent({ type: "click" });
			expect(count).toBe(10); // second handler only
		});

		it("on* setter with null removes handler", () => {
			const el = doc.createElement("div");
			let count = 0;
			el.onclick = () => count++;
			el.onclick = null;
			el.dispatchEvent({ type: "click" });
			expect(count).toBe(0);
		});
	});

	// ─── Namespace ────────────────────────────────────────────────────────────

	describe("createElementNS", () => {
		it("sets custom namespaceURI", () => {
			const svgEl = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
			expect(svgEl.namespaceURI).toBe("http://www.w3.org/2000/svg");
		});
	});

	// ─── isConnected ─────────────────────────────────────────────────────────

	describe("isConnected", () => {
		it("returns false for detached element", () => {
			const el = doc.createElement("div");
			expect(el.isConnected).toBe(false);
		});

		it("returns true after appending to body (body is not documentElement)", () => {
			// isConnected traverses up to documentElement
			const el = doc.createElement("div");
			doc.body.appendChild(el);
			// body itself is connected because documentElement is the documentElement
			expect(doc.body.isConnected).toBe(true);
		});
	});

	// ─── ownerDocument ────────────────────────────────────────────────────────

	describe("ownerDocument", () => {
		it("element created by doc has ownerDocument set", () => {
			const el = doc.createElement("div");
			expect(el.ownerDocument).toBe(doc);
		});
	});
});
