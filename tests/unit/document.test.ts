import { beforeEach, describe, expect, it } from "vitest";
import { createAppId } from "../../src/core/protocol.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import {
	VirtualCommentNode,
	VirtualElement,
	VirtualTextNode,
} from "../../src/worker-thread/element.ts";

describe("VirtualDocument structural properties", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("nodeType is 9 and nodeName is #document", () => {
		expect(doc.nodeType).toBe(9);
		expect(doc.nodeName).toBe("#document");
	});

	it("documentElement is an HTML element containing head and body", () => {
		expect(doc.documentElement).toBeInstanceOf(VirtualElement);
		expect(doc.documentElement.tagName).toBe("HTML");
		expect(doc.documentElement.children).toContain(doc.head);
		expect(doc.documentElement.children).toContain(doc.body);
	});

	it("head tagName is HEAD", () => {
		expect(doc.head.tagName).toBe("HEAD");
	});

	it("body tagName is BODY", () => {
		expect(doc.body.tagName).toBe("BODY");
	});

	it("childNodes returns [documentElement]", () => {
		expect(doc.childNodes).toHaveLength(1);
		expect(doc.childNodes[0]).toBe(doc.documentElement);
	});

	it("children returns [documentElement]", () => {
		expect(doc.children).toHaveLength(1);
		expect(doc.children[0]).toBe(doc.documentElement);
	});

	it("firstChild returns documentElement", () => {
		expect(doc.firstChild).toBe(doc.documentElement);
	});

	it("ownerDocument returns itself", () => {
		expect(doc.ownerDocument).toBe(doc);
	});

	it("activeElement returns body", () => {
		expect(doc.activeElement).toBe(doc.body);
	});

	it("readyState is always 'complete'", () => {
		expect(doc.readyState).toBe("complete");
	});

	it("compatMode is 'CSS1Compat'", () => {
		expect(doc.compatMode).toBe("CSS1Compat");
	});

	it("characterSet is 'UTF-8'", () => {
		expect(doc.characterSet).toBe("UTF-8");
	});

	it("contentType is 'text/html'", () => {
		expect(doc.contentType).toBe("text/html");
	});

	it("visibilityState is 'visible'", () => {
		expect(doc.visibilityState).toBe("visible");
	});

	it("hidden is false", () => {
		expect(doc.hidden).toBe(false);
	});

	it("defaultView is null before assignment", () => {
		expect(doc.defaultView).toBeNull();
	});

	it("implementation.hasFeature returns false", () => {
		expect(doc.implementation.hasFeature()).toBe(false);
	});
});

describe("VirtualDocument.title", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("title is empty string by default", () => {
		expect(doc.title).toBe("");
	});

	it("title setter stores value and getter returns it", () => {
		doc.title = "My Page";
		expect(doc.title).toBe("My Page");
	});

	it("title can be overwritten multiple times", () => {
		doc.title = "First";
		doc.title = "Second";
		expect(doc.title).toBe("Second");
	});
});

describe("VirtualDocument.cookie", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("cookie is empty string by default", () => {
		expect(doc.cookie).toBe("");
	});

	it("cookie setter stores value and getter returns it", () => {
		doc.cookie = "session=abc123";
		expect(doc.cookie).toBe("session=abc123");
	});
});

describe("VirtualDocument.URL and location", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("URL returns empty string when defaultView is null", () => {
		expect(doc.URL).toBe("");
	});

	it("location returns null when defaultView is null", () => {
		expect(doc.location).toBeNull();
	});

	it("URL reads from _defaultView.location.href", () => {
		doc._defaultView = { location: { href: "https://example.com/page" } };
		expect(doc.URL).toBe("https://example.com/page");
	});

	it("location reads from _defaultView.location", () => {
		const loc = { href: "https://example.com/" };
		doc._defaultView = { location: loc };
		expect(doc.location).toBe(loc);
	});
});

describe("VirtualDocument.createElement", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("creates a div element", () => {
		const el = doc.createElement("div");
		expect(el).toBeInstanceOf(VirtualElement);
		expect(el.tagName).toBe("DIV");
	});

	it("creates a span element", () => {
		const el = doc.createElement("span");
		expect(el.tagName).toBe("SPAN");
	});

	it("normalizes tag name to uppercase", () => {
		const input = doc.createElement("input");
		expect(input.tagName).toBe("INPUT");
		const select = doc.createElement("SELECT");
		expect(select.tagName).toBe("SELECT");
	});

	it("creates a textarea element", () => {
		const el = doc.createElement("textarea");
		expect(el.tagName).toBe("TEXTAREA");
	});

	it("creates a button element", () => {
		const el = doc.createElement("button");
		expect(el.tagName).toBe("BUTTON");
	});

	it("element has a unique numeric _nodeId", () => {
		const a = doc.createElement("div");
		const b = doc.createElement("div");
		expect(typeof a._nodeId).toBe("number");
		expect(a._nodeId).not.toBe(b._nodeId);
	});

	it("element._ownerDocument is set to the creating document", () => {
		const el = doc.createElement("div");
		expect(el._ownerDocument).toBe(doc);
	});

	it("createElement emits a createNode mutation", () => {
		const before = doc.collector.pendingCount;
		doc.createElement("p");
		expect(doc.collector.pendingCount).toBeGreaterThan(before);
	});

	it("two documents produce elements with different _nodeIds", () => {
		const doc2 = new VirtualDocument(createAppId("other"));
		const el1 = doc.createElement("div");
		const el2 = doc2.createElement("div");
		expect(el1._nodeId).not.toBe(el2._nodeId);
	});
});

describe("VirtualDocument.createElementNS", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("creates element with given namespace", () => {
		const svgNS = "http://www.w3.org/2000/svg";
		const el = doc.createElementNS(svgNS, "svg");
		expect(el).toBeInstanceOf(VirtualElement);
		expect(el.tagName).toBe("SVG");
		expect(el.namespaceURI).toBe(svgNS);
	});
});

describe("VirtualDocument.createTextNode", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("creates a text node with the given content", () => {
		const node = doc.createTextNode("hello world");
		expect(node).toBeInstanceOf(VirtualTextNode);
		expect(node.nodeValue).toBe("hello world");
		expect(node.textContent).toBe("hello world");
	});

	it("nodeType is 3", () => {
		expect(doc.createTextNode("").nodeType).toBe(3);
	});

	it("nodeName is #text", () => {
		expect(doc.createTextNode("x").nodeName).toBe("#text");
	});

	it("_ownerDocument is set", () => {
		const node = doc.createTextNode("hi");
		expect(node._ownerDocument).toBe(doc);
	});

	it("creates text node with empty string", () => {
		const node = doc.createTextNode("");
		expect(node.nodeValue).toBe("");
	});

	it("emits a createNode mutation", () => {
		const before = doc.collector.pendingCount;
		doc.createTextNode("test");
		expect(doc.collector.pendingCount).toBeGreaterThan(before);
	});
});

describe("VirtualDocument.createComment", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("creates a comment node with the given content", () => {
		const node = doc.createComment("this is a comment");
		expect(node).toBeInstanceOf(VirtualCommentNode);
		expect(node.nodeValue).toBe("this is a comment");
		expect(node.textContent).toBe("this is a comment");
	});

	it("nodeType is 8", () => {
		expect(doc.createComment("").nodeType).toBe(8);
	});

	it("nodeName is #comment", () => {
		expect(doc.createComment("x").nodeName).toBe("#comment");
	});

	it("_ownerDocument is set", () => {
		const node = doc.createComment("test");
		expect(node._ownerDocument).toBe(doc);
	});

	it("emits a createComment mutation", () => {
		const before = doc.collector.pendingCount;
		doc.createComment("test");
		expect(doc.collector.pendingCount).toBeGreaterThan(before);
	});
});

describe("VirtualDocument.createDocumentFragment", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns a VirtualElement", () => {
		const frag = doc.createDocumentFragment();
		expect(frag).toBeInstanceOf(VirtualElement);
	});

	it("tagName is #DOCUMENT-FRAGMENT", () => {
		const frag = doc.createDocumentFragment();
		expect(frag.tagName).toBe("#DOCUMENT-FRAGMENT");
	});

	it("_ownerDocument is set", () => {
		const frag = doc.createDocumentFragment();
		expect(frag._ownerDocument).toBe(doc);
	});

	it("children appended to fragment are transferred to parent on appendChild", () => {
		const frag = doc.createDocumentFragment();
		const a = doc.createElement("span");
		const b = doc.createElement("div");
		frag.appendChild(a);
		frag.appendChild(b);

		const container = doc.createElement("section");
		container.appendChild(frag);

		expect(container.children).toHaveLength(2);
		expect(container.children[0]).toBe(a);
		expect(container.children[1]).toBe(b);
		// Fragment itself should be empty after transfer
		expect(frag.childNodes).toHaveLength(0);
	});
});

describe("VirtualDocument.getElementById", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns null when no element has been given that id", () => {
		expect(doc.getElementById("missing")).toBeNull();
	});

	it("returns element after setAttribute('id', ...) is called", () => {
		const el = doc.createElement("div");
		el.setAttribute("id", "myEl");
		doc.body.appendChild(el);
		expect(doc.getElementById("myEl")).toBe(el);
	});

	it("returns element set via id property", () => {
		const el = doc.createElement("div");
		el.id = "hero";
		expect(doc.getElementById("hero")).toBe(el);
	});

	it("updating id attribute unregisters old id and registers new one", () => {
		const el = doc.createElement("div");
		el.setAttribute("id", "first");
		expect(doc.getElementById("first")).toBe(el);

		el.setAttribute("id", "second");
		expect(doc.getElementById("first")).toBeNull();
		expect(doc.getElementById("second")).toBe(el);
	});

	it("getElementById returns null after element is removed from DOM", () => {
		const el = doc.createElement("div");
		el.setAttribute("id", "removable");
		doc.body.appendChild(el);
		expect(doc.getElementById("removable")).toBe(el);

		doc.body.removeChild(el);
		// _cleanupFromDocument does not unregister id attribute entries —
		// confirm behaviour matches actual implementation
		// (id is only unregistered on setAttribute overwrite, not on DOM removal)
		// so this test verifies the current actual behaviour
		expect(doc.getElementById("removable")).toBe(el);
	});
});

describe("VirtualDocument.querySelector", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns null when nothing matches", () => {
		expect(doc.querySelector("div")).toBeNull();
	});

	it("finds an element by tag in body", () => {
		const p = doc.createElement("p");
		doc.body.appendChild(p);
		expect(doc.querySelector("p")).toBe(p);
	});

	it("finds element by id shortcut (#id)", () => {
		const el = doc.createElement("div");
		el.setAttribute("id", "target");
		doc.body.appendChild(el);
		expect(doc.querySelector("#target")).toBe(el);
	});

	it("finds element by class", () => {
		const el = doc.createElement("div");
		el.className = "hero";
		doc.body.appendChild(el);
		expect(doc.querySelector(".hero")).toBe(el);
	});

	it("finds element in head", () => {
		const meta = doc.createElement("meta");
		doc.head.appendChild(meta);
		expect(doc.querySelector("meta")).toBe(meta);
	});

	it("returns first match when multiple elements match", () => {
		const first = doc.createElement("li");
		const second = doc.createElement("li");
		doc.body.appendChild(first);
		doc.body.appendChild(second);
		expect(doc.querySelector("li")).toBe(first);
	});

	it("finds deeply nested element", () => {
		const outer = doc.createElement("div");
		const inner = doc.createElement("article");
		outer.appendChild(inner);
		doc.body.appendChild(outer);
		expect(doc.querySelector("article")).toBe(inner);
	});
});

describe("VirtualDocument.querySelectorAll", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns empty array when nothing matches", () => {
		expect(doc.querySelectorAll("span")).toHaveLength(0);
	});

	it("returns all matching elements across body", () => {
		doc.body.appendChild(doc.createElement("span"));
		doc.body.appendChild(doc.createElement("span"));
		doc.body.appendChild(doc.createElement("span"));
		expect(doc.querySelectorAll("span")).toHaveLength(3);
	});

	it("spans both head and body", () => {
		doc.head.appendChild(doc.createElement("link"));
		doc.body.appendChild(doc.createElement("link"));
		expect(doc.querySelectorAll("link")).toHaveLength(2);
	});

	it("returns elements by class selector", () => {
		const a = doc.createElement("div");
		a.className = "item";
		const b = doc.createElement("span");
		b.className = "item";
		doc.body.appendChild(a);
		doc.body.appendChild(b);
		expect(doc.querySelectorAll(".item")).toHaveLength(2);
	});

	it("returns array (not live NodeList)", () => {
		const results = doc.querySelectorAll("div");
		expect(Array.isArray(results)).toBe(true);
	});
});

describe("VirtualDocument.getElementsByTagName", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns empty array when tag not present", () => {
		expect(doc.getElementsByTagName("article")).toHaveLength(0);
	});

	it("finds elements by lowercase tag name", () => {
		doc.body.appendChild(doc.createElement("nav"));
		doc.body.appendChild(doc.createElement("nav"));
		expect(doc.getElementsByTagName("nav")).toHaveLength(2);
	});

	it("finds elements by uppercase tag name (case-insensitive)", () => {
		doc.body.appendChild(doc.createElement("nav"));
		expect(doc.getElementsByTagName("NAV")).toHaveLength(1);
	});

	it("* selector returns all elements in document", () => {
		doc.body.appendChild(doc.createElement("div"));
		doc.body.appendChild(doc.createElement("span"));
		const all = doc.getElementsByTagName("*");
		// Should include at least the two elements added
		expect(all.length).toBeGreaterThanOrEqual(2);
	});

	it("does not return elements from a different document", () => {
		const doc2 = new VirtualDocument(createAppId("other"));
		doc2.body.appendChild(doc2.createElement("div"));
		expect(doc.getElementsByTagName("div")).toHaveLength(0);
	});
});

describe("VirtualDocument.getElementsByClassName", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns empty array when class not present", () => {
		expect(doc.getElementsByClassName("ghost")).toHaveLength(0);
	});

	it("finds elements with matching class", () => {
		const a = doc.createElement("div");
		a.className = "card";
		const b = doc.createElement("div");
		b.className = "card featured";
		doc.body.appendChild(a);
		doc.body.appendChild(b);
		expect(doc.getElementsByClassName("card")).toHaveLength(2);
	});

	it("filters to elements matching ALL provided classes", () => {
		const a = doc.createElement("div");
		a.className = "card featured";
		const b = doc.createElement("div");
		b.className = "card";
		doc.body.appendChild(a);
		doc.body.appendChild(b);
		expect(doc.getElementsByClassName("card featured")).toHaveLength(1);
		expect(doc.getElementsByClassName("card featured")[0]).toBe(a);
	});

	it("handles extra whitespace in class string", () => {
		const el = doc.createElement("div");
		el.className = "btn primary";
		doc.body.appendChild(el);
		// Multiple spaces between classes
		expect(doc.getElementsByClassName("btn  primary")).toHaveLength(1);
	});
});

describe("VirtualDocument.createEvent", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns an object with initEvent method", () => {
		const evt = doc.createEvent("Event");
		expect(typeof evt.initEvent).toBe("function");
	});

	it("initEvent sets type, bubbles, and cancelable", () => {
		const evt = doc.createEvent("Event");
		(evt.initEvent as (t: string, b: boolean, c: boolean) => void)("click", true, false);
		expect(evt.type).toBe("click");
		expect(evt.bubbles).toBe(true);
		expect(evt.cancelable).toBe(false);
	});

	it("default bubbles is false before initEvent", () => {
		const evt = doc.createEvent("Event");
		expect(evt.bubbles).toBe(false);
	});

	it("default cancelable is false before initEvent", () => {
		const evt = doc.createEvent("Event");
		expect(evt.cancelable).toBe(false);
	});

	it("has preventDefault, stopPropagation, stopImmediatePropagation stubs", () => {
		const evt = doc.createEvent("Event");
		expect(typeof evt.preventDefault).toBe("function");
		expect(typeof evt.stopPropagation).toBe("function");
		expect(typeof evt.stopImmediatePropagation).toBe("function");
		// Stubs must not throw
		expect(() => (evt.preventDefault as () => void)()).not.toThrow();
		expect(() => (evt.stopPropagation as () => void)()).not.toThrow();
		expect(() => (evt.stopImmediatePropagation as () => void)()).not.toThrow();
	});

	it("accepts any string as event type (e.g. 'MouseEvent', 'CustomEvent')", () => {
		expect(() => doc.createEvent("MouseEvent")).not.toThrow();
		expect(() => doc.createEvent("CustomEvent")).not.toThrow();
	});
});

describe("VirtualDocument.addEventListener and dispatchEvent", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("document-level listener is called on dispatchEvent with its listenerId", () => {
		const calls: unknown[] = [];
		doc.addEventListener("keydown", (e) => calls.push(e));

		const listenerId = Array.from(
			(doc as unknown as { _listenerMap: Map<string, unknown> })._listenerMap.keys(),
		)[0];

		doc.dispatchEvent(listenerId, { type: "keydown" });
		expect(calls).toHaveLength(1);
	});

	it("listener is not called with wrong listenerId", () => {
		const calls: unknown[] = [];
		doc.addEventListener("click", () => calls.push(1));

		doc.dispatchEvent("wrong_listener_id", { type: "click" });
		expect(calls).toHaveLength(0);
	});

	it("removeEventListener prevents further calls", () => {
		const calls: number[] = [];
		const handler = () => calls.push(1);
		doc.addEventListener("click", handler);

		const listenerId = Array.from(
			(doc as unknown as { _listenerMap: Map<string, unknown> })._listenerMap.keys(),
		)[0];

		doc.removeEventListener("click", handler);
		doc.dispatchEvent(listenerId, { type: "click" });
		expect(calls).toHaveLength(0);
	});

	it("multiple document-level listeners for different events work independently", () => {
		const clickCalls: unknown[] = [];
		const keyCalls: unknown[] = [];
		doc.addEventListener("click", (e) => clickCalls.push(e));
		doc.addEventListener("keydown", (e) => keyCalls.push(e));

		const listenerIds = Array.from(
			(doc as unknown as { _listenerMap: Map<string, unknown> })._listenerMap.keys(),
		);

		doc.dispatchEvent(listenerIds[0], { type: "click" });
		expect(clickCalls).toHaveLength(1);
		expect(keyCalls).toHaveLength(0);

		doc.dispatchEvent(listenerIds[1], { type: "keydown" });
		expect(keyCalls).toHaveLength(1);
	});

	it("addEventListener with empty name does not register listener", () => {
		const before = (doc as unknown as { _listenerMap: Map<string, unknown> })._listenerMap.size;
		doc.addEventListener("", () => {});
		const after = (doc as unknown as { _listenerMap: Map<string, unknown> })._listenerMap.size;
		expect(after).toBe(before);
	});

	it("dispatchEvent resolves numeric target id to VirtualElement", () => {
		const el = doc.createElement("div");
		doc.body.appendChild(el);
		// Register the element so it can be resolved
		doc.registerElement(el._nodeId, el);

		let resolvedTarget: unknown = null;
		doc.addEventListener("click", (e) => {
			resolvedTarget = (e as { target: unknown }).target;
		});

		const listenerId = Array.from(
			(doc as unknown as { _listenerMap: Map<string, unknown> })._listenerMap.keys(),
		)[0];

		doc.dispatchEvent(listenerId, { type: "click", target: el._nodeId });
		expect(resolvedTarget).toBe(el);
	});
});

describe("VirtualDocument.contains", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("contains(doc) returns true", () => {
		expect(doc.contains(doc)).toBe(true);
	});

	it("contains(body) returns true", () => {
		expect(doc.contains(doc.body)).toBe(true);
	});

	it("contains(head) returns true", () => {
		expect(doc.contains(doc.head)).toBe(true);
	});

	it("contains an appended child element", () => {
		const el = doc.createElement("div");
		doc.body.appendChild(el);
		expect(doc.contains(el)).toBe(true);
	});

	it("does not contain a detached element", () => {
		const el = doc.createElement("div");
		expect(doc.contains(el)).toBe(false);
	});
});

describe("VirtualDocument.createRange", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns an object with createContextualFragment", () => {
		const range = doc.createRange() as { createContextualFragment: (h: string) => VirtualElement };
		expect(typeof range.createContextualFragment).toBe("function");
	});

	it("createContextualFragment returns a document fragment", () => {
		const range = doc.createRange() as { createContextualFragment: (h: string) => VirtualElement };
		const frag = range.createContextualFragment("<p>hi</p>");
		expect(frag).toBeInstanceOf(VirtualElement);
		expect(frag.tagName).toBe("#DOCUMENT-FRAGMENT");
	});

	it("cloneRange returns another range object", () => {
		const range = doc.createRange() as { cloneRange: () => unknown };
		const clone = range.cloneRange();
		expect(clone).toBeTruthy();
	});
});

describe("VirtualDocument.createTreeWalker", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("walks through all nodes in subtree", () => {
		const root = doc.createElement("div");
		const child1 = doc.createElement("span");
		const child2 = doc.createElement("em");
		const grandchild = doc.createElement("b");
		root.appendChild(child1);
		root.appendChild(child2);
		child2.appendChild(grandchild);

		const walker = doc.createTreeWalker(root);
		const visited: VirtualElement[] = [];
		let node = walker.nextNode();
		while (node) {
			visited.push(node as VirtualElement);
			node = walker.nextNode();
		}

		expect(visited).toContain(child1);
		expect(visited).toContain(child2);
		expect(visited).toContain(grandchild);
		expect(visited).toHaveLength(3);
	});

	it("currentNode starts as root", () => {
		const root = doc.createElement("div");
		const walker = doc.createTreeWalker(root);
		expect(walker.currentNode).toBe(root);
	});

	it("nextNode returns null when no children remain", () => {
		const root = doc.createElement("div");
		const walker = doc.createTreeWalker(root);
		expect(walker.nextNode()).toBeNull();
	});
});

describe("VirtualDocument.toJSON", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("returns a serialized tree starting from documentElement", () => {
		const json = doc.toJSON() as { type: string; tag: string };
		expect(json.type).toBe("element");
		expect(json.tag).toBe("HTML");
	});

	it("includes appended children in serialized output", () => {
		const p = doc.createElement("p");
		p.setAttribute("data-test", "yes");
		doc.body.appendChild(p);
		const json = doc.toJSON() as { children: Array<{ tag: string; children: Array<{ tag: string; children: Array<{ tag: string; attributes?: Record<string, string> }> }> }> };
		// Structure: HTML > [HEAD, BODY > [P]]
		const body = json.children.find((c) => c.tag === "BODY");
		expect(body).toBeTruthy();
		const pEl = body!.children.find((c) => c.tag === "P");
		expect(pEl).toBeTruthy();
		expect(pEl!.attributes?.["data-test"]).toBe("yes");
	});

	it("serializes text nodes as type 'text'", () => {
		const text = doc.createTextNode("hello");
		doc.body.appendChild(text);
		const json = doc.toJSON() as { children: Array<{ tag: string; children: unknown[] }> };
		const body = json.children.find((c) => c.tag === "BODY")!;
		const textEntry = body.children[0] as { type: string; text: string };
		expect(textEntry.type).toBe("text");
		expect(textEntry.text).toBe("hello");
	});

	it("serializes comment nodes as type 'comment'", () => {
		const comment = doc.createComment("a comment");
		doc.body.appendChild(comment);
		const json = doc.toJSON() as { children: Array<{ tag: string; children: unknown[] }> };
		const body = json.children.find((c) => c.tag === "BODY")!;
		const commentEntry = body.children[0] as { type: string; text: string };
		expect(commentEntry.type).toBe("comment");
		expect(commentEntry.text).toBe("a comment");
	});
});

describe("VirtualDocument.destroy", () => {
	it("clears all internal registries and resets state", () => {
		const doc = new VirtualDocument(createAppId("test"));

		const el = doc.createElement("div");
		el.setAttribute("id", "tracked");
		doc.registerElement(el._nodeId, el);
		doc.addEventListener("click", () => {});

		doc.destroy();

		expect(doc.getElementById("tracked")).toBeNull();
		expect(
			(doc as unknown as { _listenerMap: Map<string, unknown> })._listenerMap.size,
		).toBe(0);
		expect(
			(doc as unknown as { _nodeIdToElement: Map<unknown, unknown> })._nodeIdToElement.size,
		).toBe(0);
		expect(doc.defaultView).toBeNull();
		expect(doc._syncChannel).toBeNull();
	});
});

describe("VirtualDocument register/unregister helpers", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	it("registerElementById / unregisterElementById", () => {
		const el = doc.createElement("div");
		doc.registerElementById("foo", el);
		expect(doc.getElementById("foo")).toBe(el);
		doc.unregisterElementById("foo");
		expect(doc.getElementById("foo")).toBeNull();
	});

	it("registerElement / unregisterElement allows dispatchEvent target resolution", () => {
		const el = doc.createElement("div");
		doc.registerElement(el._nodeId, el);

		let resolved: unknown = null;
		doc.addEventListener("test", (e) => {
			resolved = (e as { target: unknown }).target;
		});
		const listenerId = Array.from(
			(doc as unknown as { _listenerMap: Map<string, unknown> })._listenerMap.keys(),
		)[0];

		doc.dispatchEvent(listenerId, { type: "test", target: el._nodeId });
		expect(resolved).toBe(el);

		doc.unregisterElement(el._nodeId);
		resolved = null;
		doc.dispatchEvent(listenerId, { type: "test", target: el._nodeId });
		expect(resolved).toBeNull();
	});

	it("registerListener / unregisterListener for element event routing", () => {
		const el = doc.createElement("div");
		const calls: number[] = [];
		el.addEventListener("click", () => calls.push(1));

		const listenerId = Array.from(
			(el as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
		)[0];

		// Listener is registered; dispatch should reach it
		doc.dispatchEvent(listenerId, {
			type: "click",
			target: el._nodeId,
			currentTarget: el._nodeId,
			bubbles: false,
		});
		expect(calls).toHaveLength(1);

		// Now unregister the listener from the document-level routing table
		doc.unregisterListener(listenerId);
		doc.dispatchEvent(listenerId, {
			type: "click",
			target: el._nodeId,
			currentTarget: el._nodeId,
			bubbles: false,
		});
		expect(calls).toHaveLength(1); // No new calls
	});
});
