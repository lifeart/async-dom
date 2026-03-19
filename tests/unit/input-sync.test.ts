import { beforeEach, describe, expect, it } from "vitest";
import { createAppId } from "../../src/core/protocol.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";

describe("Input State Synchronization", () => {
	let doc: VirtualDocument;

	beforeEach(() => {
		doc = new VirtualDocument(createAppId("test"));
	});

	describe("value property", () => {
		it("gets and sets value", () => {
			const input = doc.createElement("input");
			expect(input.value).toBe("");
			input.value = "hello";
			expect(input.value).toBe("hello");
		});

		it("emits setProperty mutation on set", () => {
			const input = doc.createElement("input");
			doc.collector.flushSync();
			input.value = "test";
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});
	});

	describe("checked property", () => {
		it("gets and sets checked", () => {
			const checkbox = doc.createElement("input");
			expect(checkbox.checked).toBe(false);
			checkbox.checked = true;
			expect(checkbox.checked).toBe(true);
		});

		it("emits setProperty mutation on set", () => {
			const checkbox = doc.createElement("input");
			doc.collector.flushSync();
			checkbox.checked = true;
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});
	});

	describe("disabled property", () => {
		it("gets and sets disabled", () => {
			const input = doc.createElement("input");
			expect(input.disabled).toBe(false);
			input.disabled = true;
			expect(input.disabled).toBe(true);
		});

		it("emits setProperty mutation on set", () => {
			const input = doc.createElement("input");
			doc.collector.flushSync();
			input.disabled = true;
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});
	});

	describe("selectedIndex property", () => {
		it("gets and sets selectedIndex", () => {
			const select = doc.createElement("select");
			expect(select.selectedIndex).toBe(-1);
			select.selectedIndex = 2;
			expect(select.selectedIndex).toBe(2);
		});

		it("emits setProperty mutation on set", () => {
			const select = doc.createElement("select");
			doc.collector.flushSync();
			select.selectedIndex = 1;
			expect(doc.collector.pendingCount).toBeGreaterThan(0);
		});
	});

	describe("_updateInputState (internal)", () => {
		it("updates value without emitting mutation", () => {
			const input = doc.createElement("input");
			doc.collector.flushSync();
			input._updateInputState({ value: "from-event" });
			expect(input.value).toBe("from-event");
			// Should NOT emit a mutation (internal update only)
			expect(doc.collector.pendingCount).toBe(0);
		});

		it("updates checked without emitting mutation", () => {
			const input = doc.createElement("input");
			doc.collector.flushSync();
			input._updateInputState({ checked: true });
			expect(input.checked).toBe(true);
			expect(doc.collector.pendingCount).toBe(0);
		});

		it("updates selectedIndex without emitting mutation", () => {
			const select = doc.createElement("select");
			doc.collector.flushSync();
			select._updateInputState({ selectedIndex: 3 });
			expect(select.selectedIndex).toBe(3);
			expect(doc.collector.pendingCount).toBe(0);
		});
	});

	describe("event round-trip input state sync", () => {
		it("input event carries value back to virtual element", () => {
			const input = doc.createElement("input");
			doc.body.appendChild(input);

			let receivedEvent: unknown = null;
			input.addEventListener("input", (e) => {
				receivedEvent = e;
			});

			// Simulate main thread sending an event with value
			const listenerId = Array.from(
				(input as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
			)[0];

			doc.dispatchEvent(listenerId, {
				type: "input",
				target: input.id,
				currentTarget: input.id,
				value: "typed-text",
				bubbles: true,
			});

			expect(receivedEvent).not.toBeNull();
			expect(input.value).toBe("typed-text");
		});

		it("change event carries checked back to virtual element", () => {
			const checkbox = doc.createElement("input");
			doc.body.appendChild(checkbox);

			checkbox.addEventListener("change", () => {});

			const listenerId = Array.from(
				(checkbox as unknown as { _eventListeners: Map<string, unknown> })._eventListeners.keys(),
			)[0];

			doc.dispatchEvent(listenerId, {
				type: "change",
				target: checkbox.id,
				currentTarget: checkbox.id,
				checked: true,
				bubbles: true,
			});

			expect(checkbox.checked).toBe(true);
		});
	});
});
