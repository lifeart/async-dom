/**
 * Binary codec integration tests.
 *
 * Verifies that DomMutation objects survive a full encode → decode round-trip
 * through BinaryMutationEncoder / BinaryMutationDecoder with a shared
 * StringStore, producing mutations that are structurally identical to the
 * originals.
 */
import { describe, expect, it } from "vitest";
import { BinaryMutationDecoder, BinaryMutationEncoder } from "../../src/core/binary-codec.ts";
import type { DomMutation, NodeId } from "../../src/core/protocol.ts";
import { createAppId } from "../../src/core/protocol.ts";
import { StringStore } from "../../src/core/string-store.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTrip(mutations: DomMutation[]): DomMutation[] {
	const strings = new StringStore();
	const encoder = new BinaryMutationEncoder(strings);

	for (const m of mutations) {
		encoder.encode(m);
	}

	const buffer = encoder.finish();
	const decoder = new BinaryMutationDecoder(strings);
	return decoder.decode(buffer);
}

const id = (n: number) => n as NodeId;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Binary codec round-trip", () => {
	describe("individual mutation types", () => {
		it("createNode survives round-trip", () => {
			const original: DomMutation = { action: "createNode", id: id(10), tag: "DIV" };
			const [decoded] = roundTrip([original]);
			expect(decoded).toEqual({ action: "createNode", id: id(10), tag: "DIV" });
		});

		it("createNode with textContent survives round-trip", () => {
			const original: DomMutation = {
				action: "createNode",
				id: id(11),
				tag: "#text",
				textContent: "hello world",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "createNode",
				id: id(11),
				tag: "#text",
				textContent: "hello world",
			});
		});

		it("createComment survives round-trip", () => {
			const original: DomMutation = {
				action: "createComment",
				id: id(12),
				textContent: "<!-- comment -->",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "createComment",
				id: id(12),
				textContent: "<!-- comment -->",
			});
		});

		it("appendChild survives round-trip", () => {
			const original: DomMutation = { action: "appendChild", id: id(1), childId: id(10) };
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "appendChild", id: id(1), childId: id(10) });
		});

		it("removeNode survives round-trip", () => {
			const original: DomMutation = { action: "removeNode", id: id(10) };
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "removeNode", id: id(10) });
		});

		it("removeChild survives round-trip", () => {
			const original: DomMutation = { action: "removeChild", id: id(1), childId: id(10) };
			const [decoded] = roundTrip([original]);
			expect(decoded).toEqual({ action: "removeChild", id: id(1), childId: id(10) });
		});

		it("insertBefore with refId survives round-trip", () => {
			const original: DomMutation = {
				action: "insertBefore",
				id: id(1),
				newId: id(15),
				refId: id(10),
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "insertBefore",
				id: id(1),
				newId: id(15),
				refId: id(10),
			});
		});

		it("insertBefore with null refId survives round-trip", () => {
			const original: DomMutation = {
				action: "insertBefore",
				id: id(1),
				newId: id(15),
				refId: null,
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "insertBefore",
				id: id(1),
				newId: id(15),
				refId: null,
			});
		});

		it("setAttribute survives round-trip", () => {
			const original: DomMutation = {
				action: "setAttribute",
				id: id(10),
				name: "data-value",
				value: "hello",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toEqual({
				action: "setAttribute",
				id: id(10),
				name: "data-value",
				value: "hello",
			});
		});

		it("setAttribute with optional flag survives round-trip", () => {
			const original: DomMutation = {
				action: "setAttribute",
				id: id(10),
				name: "class",
				value: "foo bar",
				optional: true,
			};
			const [decoded] = roundTrip([original]);
			expect((decoded as typeof original).optional).toBe(true);
		});

		it("removeAttribute survives round-trip", () => {
			const original: DomMutation = { action: "removeAttribute", id: id(10), name: "class" };
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "removeAttribute", id: id(10), name: "class" });
		});

		it("setStyle survives round-trip", () => {
			const original: DomMutation = {
				action: "setStyle",
				id: id(10),
				property: "color",
				value: "red",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "setStyle",
				id: id(10),
				property: "color",
				value: "red",
			});
		});

		it("setStyle with optional flag survives round-trip", () => {
			const original: DomMutation = {
				action: "setStyle",
				id: id(10),
				property: "display",
				value: "none",
				optional: true,
			};
			const [decoded] = roundTrip([original]);
			expect((decoded as typeof original).optional).toBe(true);
		});

		it("setProperty survives round-trip", () => {
			const original: DomMutation = {
				action: "setProperty",
				id: id(10),
				property: "value",
				value: "test input",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "setProperty",
				id: id(10),
				property: "value",
				value: "test input",
			});
		});

		it("setProperty with numeric value survives round-trip", () => {
			const original: DomMutation = {
				action: "setProperty",
				id: id(10),
				property: "scrollTop",
				value: 42,
			};
			const [decoded] = roundTrip([original]);
			expect((decoded as typeof original).value).toBe(42);
		});

		it("setTextContent survives round-trip", () => {
			const original: DomMutation = { action: "setTextContent", id: id(10), textContent: "hello" };
			const [decoded] = roundTrip([original]);
			expect(decoded).toEqual({ action: "setTextContent", id: id(10), textContent: "hello" });
		});

		it("setClassName survives round-trip", () => {
			const original: DomMutation = { action: "setClassName", id: id(10), name: "foo bar baz" };
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "setClassName", id: id(10), name: "foo bar baz" });
		});

		it("setHTML survives round-trip", () => {
			const original: DomMutation = { action: "setHTML", id: id(10), html: "<b>bold</b>" };
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "setHTML", id: id(10), html: "<b>bold</b>" });
		});

		it("addEventListener survives round-trip", () => {
			const original: DomMutation = {
				action: "addEventListener",
				id: id(10),
				name: "click",
				listenerId: "listener-1",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "addEventListener",
				id: id(10),
				name: "click",
				listenerId: "listener-1",
			});
		});

		it("headAppendChild survives round-trip", () => {
			const original: DomMutation = { action: "headAppendChild", id: id(10) };
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "headAppendChild", id: id(10) });
		});

		it("bodyAppendChild survives round-trip", () => {
			const original: DomMutation = { action: "bodyAppendChild", id: id(10) };
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "bodyAppendChild", id: id(10) });
		});

		it("pushState survives round-trip", () => {
			const original: DomMutation = {
				action: "pushState",
				state: { page: 1 },
				title: "Page 1",
				url: "/page/1",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "pushState", title: "Page 1", url: "/page/1" });
			expect((decoded as typeof original).state).toEqual({ page: 1 });
		});

		it("replaceState survives round-trip", () => {
			const original: DomMutation = {
				action: "replaceState",
				state: null,
				title: "",
				url: "/home",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "replaceState", url: "/home" });
		});

		it("scrollTo survives round-trip", () => {
			const original: DomMutation = { action: "scrollTo", x: 100, y: 200 };
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "scrollTo", x: 100, y: 200 });
		});

		it("insertAdjacentHTML survives round-trip", () => {
			const original: DomMutation = {
				action: "insertAdjacentHTML",
				id: id(10),
				position: "beforeend",
				html: "<span>hi</span>",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "insertAdjacentHTML",
				id: id(10),
				position: "beforeend",
				html: "<span>hi</span>",
			});
		});

		it("configureEvent survives round-trip", () => {
			const original: DomMutation = {
				action: "configureEvent",
				id: id(10),
				name: "click",
				preventDefault: true,
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "configureEvent",
				id: id(10),
				name: "click",
				preventDefault: true,
			});
		});

		it("removeEventListener survives round-trip", () => {
			const original: DomMutation = {
				action: "removeEventListener",
				id: id(10),
				listenerId: "listener-2",
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({
				action: "removeEventListener",
				id: id(10),
				listenerId: "listener-2",
			});
		});

		it("callMethod survives round-trip", () => {
			const original: DomMutation = {
				action: "callMethod",
				id: id(10),
				method: "focus",
				args: [],
			};
			const [decoded] = roundTrip([original]);
			expect(decoded).toMatchObject({ action: "callMethod", id: id(10), method: "focus" });
			expect((decoded as typeof original).args).toEqual([]);
		});

		it("configureEvent with passive:true survives round-trip", () => {
			const original: DomMutation = {
				action: "configureEvent",
				id: id(20),
				name: "touchstart",
				preventDefault: false,
				passive: true,
			};
			const [decoded] = roundTrip([original]);
			expect((decoded as typeof original).passive).toBe(true);
			expect((decoded as typeof original).preventDefault).toBe(false);
			expect((decoded as typeof original).name).toBe("touchstart");
		});

		it("setProperty with boolean value (checked:true) survives round-trip", () => {
			const original: DomMutation = {
				action: "setProperty",
				id: id(30),
				property: "checked",
				value: true,
			};
			const [decoded] = roundTrip([original]);
			expect((decoded as typeof original).value).toBe(true);
			expect((decoded as typeof original).property).toBe("checked");
		});

		it("setProperty with boolean value (disabled:false) survives round-trip", () => {
			const original: DomMutation = {
				action: "setProperty",
				id: id(31),
				property: "disabled",
				value: false,
			};
			const [decoded] = roundTrip([original]);
			expect((decoded as typeof original).value).toBe(false);
			expect((decoded as typeof original).property).toBe("disabled");
		});

		it("empty batch encodes and decodes to empty array", () => {
			const decoded = roundTrip([]);
			expect(decoded).toEqual([]);
		});
	});

	describe("batch encoding", () => {
		it("encodes and decodes multiple mutations in sequence", () => {
			const mutations: DomMutation[] = [
				{ action: "createNode", id: id(10), tag: "DIV" },
				{ action: "createNode", id: id(11), tag: "SPAN" },
				{ action: "appendChild", id: id(10), childId: id(11) },
				{ action: "setAttribute", id: id(11), name: "class", value: "highlight" },
				{ action: "setTextContent", id: id(11), textContent: "hello" },
			];

			const decoded = roundTrip(mutations);

			expect(decoded).toHaveLength(5);
			expect(decoded[0]).toMatchObject({ action: "createNode", tag: "DIV" });
			expect(decoded[1]).toMatchObject({ action: "createNode", tag: "SPAN" });
			expect(decoded[2]).toMatchObject({ action: "appendChild", id: id(10), childId: id(11) });
			expect(decoded[3]).toMatchObject({
				action: "setAttribute",
				name: "class",
				value: "highlight",
			});
			expect(decoded[4]).toMatchObject({ action: "setTextContent", textContent: "hello" });
		});

		it("string deduplication works across multiple mutations", () => {
			// The string "click" should be stored only once in the StringStore
			const mutations: DomMutation[] = [
				{ action: "addEventListener", id: id(10), name: "click", listenerId: "l1" },
				{ action: "addEventListener", id: id(11), name: "click", listenerId: "l2" },
				{ action: "removeEventListener", id: id(10), listenerId: "l1" },
			];

			const strings = new StringStore();
			const encoder = new BinaryMutationEncoder(strings);
			for (const m of mutations) encoder.encode(m);
			const buffer = encoder.finish();

			const decoder = new BinaryMutationDecoder(strings);
			const decoded = decoder.decode(buffer);

			expect(decoded[0]).toMatchObject({
				action: "addEventListener",
				name: "click",
				listenerId: "l1",
			});
			expect(decoded[1]).toMatchObject({
				action: "addEventListener",
				name: "click",
				listenerId: "l2",
			});
			expect(decoded[2]).toMatchObject({ action: "removeEventListener", listenerId: "l1" });

			// "click" should appear only once in the string store
			expect(strings.size).toBe(["click", "l1", "l2"].length);
		});

		it("encoder can be reset and reused for a second batch", () => {
			const strings = new StringStore();
			const encoder = new BinaryMutationEncoder(strings);

			encoder.encode({ action: "createNode", id: id(10), tag: "DIV" });
			const buf1 = encoder.finish();

			encoder.reset();
			encoder.encode({ action: "createNode", id: id(11), tag: "SPAN" });
			const buf2 = encoder.finish();

			const decoder = new BinaryMutationDecoder(strings);

			const batch1 = decoder.decode(buf1);
			const batch2 = decoder.decode(buf2);

			expect(batch1[0]).toMatchObject({ action: "createNode", tag: "DIV" });
			expect(batch2[0]).toMatchObject({ action: "createNode", tag: "SPAN" });
		});
	});

	describe("mutations from VirtualDocument", () => {
		it("real DOM operations produce mutations that survive binary round-trip", () => {
			const appId = createAppId("binary-test");
			const doc = new VirtualDocument(appId);

			// Collect mutations directly by capturing what the collector sends
			const collectedMutations: DomMutation[] = [];

			const mockTransport = {
				send(message: { type: string; mutations?: DomMutation[] }) {
					if (message.type === "mutation" && message.mutations) {
						collectedMutations.push(...message.mutations);
					}
				},
				onMessage() {},
				close() {},
				get readyState() {
					return "open" as const;
				},
			};

			doc.collector.setTransport(mockTransport);

			// Perform various DOM operations
			const div = doc.createElement("div");
			const span = doc.createElement("span");
			doc.body.appendChild(div);
			div.appendChild(span);
			div.setAttribute("id", "main");
			span.textContent = "hello";
			span.style.color = "blue";
			div.className = "container";

			doc.collector.flushSync();

			expect(collectedMutations.length).toBeGreaterThan(0);

			// Encode and decode the batch
			const decoded = roundTrip(collectedMutations);

			// Decoded length matches original
			expect(decoded.length).toBe(collectedMutations.length);

			// Key mutations are preserved
			const createActions = decoded.filter((m) => m.action === "createNode");
			expect(createActions.length).toBeGreaterThanOrEqual(2);

			const appendActions = decoded.filter((m) => m.action === "appendChild");
			expect(appendActions.length).toBeGreaterThanOrEqual(1);

			const setAttr = decoded.find(
				(m) => m.action === "setAttribute" && (m as { name: string }).name === "id",
			);
			expect(setAttr).toBeTruthy();
		});
	});
});
