import { describe, expect, it } from "vitest";
import { BinaryMutationDecoder, BinaryMutationEncoder } from "../../src/core/binary-codec.ts";
import type { DomMutation, NodeId } from "../../src/core/protocol.ts";
import { StringStore } from "../../src/core/string-store.ts";

function createEncoderDecoder() {
	const workerStrings = new StringStore();
	const mainStrings = new StringStore();
	const encoder = new BinaryMutationEncoder(workerStrings);
	const decoder = new BinaryMutationDecoder(mainStrings);
	return { workerStrings, mainStrings, encoder, decoder };
}

function roundTrip(mutations: DomMutation[]): DomMutation[] {
	const { workerStrings, mainStrings, encoder, decoder } = createEncoderDecoder();
	for (const m of mutations) {
		encoder.encode(m);
	}
	const buffer = encoder.finish();

	// Sync string store
	const pending = workerStrings.consumePending();
	mainStrings.registerBulk(pending);

	return decoder.decode(buffer);
}

function nid(n: number): NodeId {
	return n as NodeId;
}

describe("BinaryMutationEncoder / BinaryMutationDecoder", () => {
	it("round-trips createNode", () => {
		const mutations: DomMutation[] = [{ action: "createNode", id: nid(11), tag: "div" }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips createNode with textContent", () => {
		const mutations: DomMutation[] = [
			{ action: "createNode", id: nid(11), tag: "#text", textContent: "hello" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips createNode without textContent (omitted key)", () => {
		const result = roundTrip([{ action: "createNode", id: nid(11), tag: "div" }]);
		expect(result[0]).toEqual({ action: "createNode", id: nid(11), tag: "div" });
		expect("textContent" in result[0]).toBe(false);
	});

	it("round-trips createComment", () => {
		const mutations: DomMutation[] = [
			{ action: "createComment", id: nid(12), textContent: "a comment" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips appendChild", () => {
		const mutations: DomMutation[] = [{ action: "appendChild", id: nid(1), childId: nid(11) }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips removeNode", () => {
		const mutations: DomMutation[] = [{ action: "removeNode", id: nid(11) }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips removeChild", () => {
		const mutations: DomMutation[] = [{ action: "removeChild", id: nid(1), childId: nid(11) }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips insertBefore with refId", () => {
		const mutations: DomMutation[] = [
			{ action: "insertBefore", id: nid(1), newId: nid(11), refId: nid(12) },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips insertBefore with null refId", () => {
		const mutations: DomMutation[] = [
			{ action: "insertBefore", id: nid(1), newId: nid(11), refId: null },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setAttribute", () => {
		const mutations: DomMutation[] = [
			{ action: "setAttribute", id: nid(11), name: "class", value: "foo bar" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setAttribute with optional flag", () => {
		const mutations: DomMutation[] = [
			{ action: "setAttribute", id: nid(11), name: "data-x", value: "y", optional: true },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips removeAttribute", () => {
		const mutations: DomMutation[] = [{ action: "removeAttribute", id: nid(11), name: "class" }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setStyle", () => {
		const mutations: DomMutation[] = [
			{ action: "setStyle", id: nid(11), property: "color", value: "red" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setStyle with optional flag", () => {
		const mutations: DomMutation[] = [
			{ action: "setStyle", id: nid(11), property: "display", value: "none", optional: true },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setProperty with string value", () => {
		const mutations: DomMutation[] = [
			{ action: "setProperty", id: nid(11), property: "value", value: "hello" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setProperty with complex JSON value", () => {
		const mutations: DomMutation[] = [
			{
				action: "setProperty",
				id: nid(11),
				property: "value",
				value: { nested: [1, 2, { deep: true }] },
			},
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setProperty with boolean value", () => {
		const mutations: DomMutation[] = [
			{ action: "setProperty", id: nid(11), property: "checked", value: true },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setProperty with numeric value", () => {
		const mutations: DomMutation[] = [
			{ action: "setProperty", id: nid(11), property: "selectedIndex", value: 3 },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setTextContent", () => {
		const mutations: DomMutation[] = [
			{ action: "setTextContent", id: nid(11), textContent: "hello world" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setClassName", () => {
		const mutations: DomMutation[] = [
			{ action: "setClassName", id: nid(11), name: "active primary" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips setHTML", () => {
		const mutations: DomMutation[] = [{ action: "setHTML", id: nid(11), html: "<b>bold</b>" }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips addEventListener", () => {
		const mutations: DomMutation[] = [
			{ action: "addEventListener", id: nid(11), name: "click", listenerId: "l1" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips headAppendChild", () => {
		const mutations: DomMutation[] = [{ action: "headAppendChild", id: nid(11) }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips bodyAppendChild", () => {
		const mutations: DomMutation[] = [{ action: "bodyAppendChild", id: nid(11) }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips pushState", () => {
		const mutations: DomMutation[] = [
			{ action: "pushState", state: { page: 2 }, title: "Page 2", url: "/page/2" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips replaceState", () => {
		const mutations: DomMutation[] = [
			{ action: "replaceState", state: null, title: "", url: "/new" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips scrollTo", () => {
		const mutations: DomMutation[] = [{ action: "scrollTo", x: 100, y: 200 }];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips insertAdjacentHTML", () => {
		const mutations: DomMutation[] = [
			{
				action: "insertAdjacentHTML",
				id: nid(11),
				position: "beforeend",
				html: "<span>hi</span>",
			},
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips configureEvent", () => {
		const mutations: DomMutation[] = [
			{ action: "configureEvent", id: nid(11), name: "click", preventDefault: true },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips configureEvent with passive", () => {
		const mutations: DomMutation[] = [
			{
				action: "configureEvent",
				id: nid(11),
				name: "scroll",
				preventDefault: false,
				passive: true,
			},
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips removeEventListener", () => {
		const mutations: DomMutation[] = [
			{ action: "removeEventListener", id: nid(11), listenerId: "l1" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("round-trips multiple mutations in one buffer", () => {
		const mutations: DomMutation[] = [
			{ action: "createNode", id: nid(11), tag: "div" },
			{ action: "setAttribute", id: nid(11), name: "class", value: "container" },
			{ action: "createNode", id: nid(12), tag: "#text", textContent: "Hello" },
			{ action: "appendChild", id: nid(11), childId: nid(12) },
			{ action: "bodyAppendChild", id: nid(11) },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("handles empty mutation list", () => {
		expect(roundTrip([])).toEqual([]);
	});

	it("deduplicates strings — same string uses same index", () => {
		const workerStrings = new StringStore();
		const encoder = new BinaryMutationEncoder(workerStrings);

		// Encode multiple mutations using the same strings
		encoder.encode({ action: "setAttribute", id: nid(11), name: "class", value: "foo" });
		encoder.encode({ action: "setAttribute", id: nid(12), name: "class", value: "foo" });
		encoder.encode({ action: "setAttribute", id: nid(13), name: "class", value: "bar" });

		// "class" and "foo" should each appear only once in the string store
		expect(workerStrings.size).toBe(3); // "class", "foo", "bar"
	});

	it("preserves large NodeIds", () => {
		const largeId = 100000 as NodeId;
		const mutations: DomMutation[] = [
			{ action: "createNode", id: largeId, tag: "div" },
			{ action: "removeNode", id: largeId },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("handles large batch (100+ mutations)", () => {
		const mutations: DomMutation[] = [];
		for (let i = 0; i < 150; i++) {
			mutations.push({ action: "createNode", id: nid(100 + i), tag: "div" });
			mutations.push({
				action: "setAttribute",
				id: nid(100 + i),
				name: "class",
				value: `item-${i}`,
			});
			mutations.push({ action: "appendChild", id: nid(1), childId: nid(100 + i) });
		}
		const result = roundTrip(mutations);
		expect(result).toHaveLength(450);
		expect(result).toEqual(mutations);
	});

	it("encoder reset allows reuse", () => {
		const { workerStrings, mainStrings, encoder, decoder } = createEncoderDecoder();

		// First batch
		encoder.encode({ action: "createNode", id: nid(11), tag: "div" });
		const buf1 = encoder.finish();
		const pending1 = workerStrings.consumePending();
		mainStrings.registerBulk(pending1);
		const result1 = decoder.decode(buf1);
		expect(result1).toEqual([{ action: "createNode", id: nid(11), tag: "div" }]);

		// Reset and encode second batch
		encoder.reset();
		encoder.encode({ action: "createNode", id: nid(12), tag: "span" });
		const buf2 = encoder.finish();
		const pending2 = workerStrings.consumePending();
		mainStrings.registerBulk(pending2);
		const result2 = decoder.decode(buf2);
		expect(result2).toEqual([{ action: "createNode", id: nid(12), tag: "span" }]);
	});

	it("throws on unknown opcode", () => {
		const strings = new StringStore();
		const decoder = new BinaryMutationDecoder(strings);
		const buffer = new ArrayBuffer(1);
		new DataView(buffer).setUint8(0, 255); // invalid opcode
		expect(() => decoder.decode(buffer)).toThrow("Unknown mutation opcode: 255");
	});

	it("handles unicode strings in mutations", () => {
		const mutations: DomMutation[] = [
			{ action: "setTextContent", id: nid(11), textContent: "Hello \u{1F600} \u4F60\u597D" },
			{ action: "setAttribute", id: nid(11), name: "title", value: "\u00FC\u00F6\u00E4" },
		];
		expect(roundTrip(mutations)).toEqual(mutations);
	});

	it("binary is smaller than JSON for typical mutations", () => {
		const workerStrings = new StringStore();
		const encoder = new BinaryMutationEncoder(workerStrings);

		const mutations: DomMutation[] = [
			{ action: "createNode", id: nid(11), tag: "div" },
			{ action: "setAttribute", id: nid(11), name: "class", value: "container" },
			{ action: "createNode", id: nid(12), tag: "span" },
			{ action: "setAttribute", id: nid(12), name: "class", value: "label" },
			{ action: "setTextContent", id: nid(12), textContent: "Hello World" },
			{ action: "appendChild", id: nid(11), childId: nid(12) },
			{ action: "bodyAppendChild", id: nid(11) },
		];

		for (const m of mutations) {
			encoder.encode(m);
		}
		const binarySize = encoder.finish().byteLength;
		const jsonSize = new TextEncoder().encode(JSON.stringify(mutations)).byteLength;

		// Binary should be meaningfully smaller
		expect(binarySize).toBeLessThan(jsonSize);
	});
});
