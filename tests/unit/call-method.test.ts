import { beforeEach, describe, expect, it, vi } from "vitest";
import { BinaryMutationDecoder, BinaryMutationEncoder } from "../../src/core/binary-codec.ts";
import {
	createAppId,
	createNodeId,
	type DomMutation,
	type Message,
	type MutationMessage,
	type NodeId,
} from "../../src/core/protocol.ts";
import { StringStore } from "../../src/core/string-store.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";
import type { Transport } from "../../src/transport/base.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";

function nid(n: number): NodeId {
	return n as NodeId;
}

function roundTrip(mutations: DomMutation[]): DomMutation[] {
	const workerStrings = new StringStore();
	const mainStrings = new StringStore();
	const encoder = new BinaryMutationEncoder(workerStrings);
	const decoder = new BinaryMutationDecoder(mainStrings);
	for (const m of mutations) {
		encoder.encode(m);
	}
	const buffer = encoder.finish();
	const pending = workerStrings.consumePending();
	mainStrings.registerBulk(pending);
	return decoder.decode(buffer);
}

function createMockTransport(): Transport & { sent: Message[] } {
	const sent: Message[] = [];
	return {
		sent,
		send(msg: Message) {
			sent.push(msg);
		},
		onMessage() {},
		close() {},
		get readyState() {
			return "open" as const;
		},
	};
}

function getSentMutations(transport: Transport & { sent: Message[] }): DomMutation[] {
	const all: DomMutation[] = [];
	for (const msg of transport.sent) {
		if (msg.type === "mutation") {
			all.push(...(msg as MutationMessage).mutations);
		}
	}
	return all;
}

describe("callMethod mutation", () => {
	describe("VirtualElement emits callMethod mutations", () => {
		let doc: VirtualDocument;
		let transport: Transport & { sent: Message[] };

		beforeEach(() => {
			doc = new VirtualDocument(createAppId("test"));
			transport = createMockTransport();
			doc.collector.setTransport(transport);
			doc.collector.flushSync(); // clear structural mutations
			transport.sent.length = 0;
		});

		function flushAndGetLast(): DomMutation {
			doc.collector.flushSync();
			const mutations = getSentMutations(transport);
			return mutations[mutations.length - 1];
		}

		it("play() emits callMethod", () => {
			const el = doc.createElement("video");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.play();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "play",
				args: [],
			});
		});

		it("pause() emits callMethod", () => {
			const el = doc.createElement("video");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.pause();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "pause",
				args: [],
			});
		});

		it("click() emits callMethod", () => {
			const el = doc.createElement("button");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.click();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "click",
				args: [],
			});
		});

		it("scrollIntoView() emits callMethod without args", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.scrollIntoView();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "scrollIntoView",
				args: [],
			});
		});

		it("scrollIntoView(options) emits callMethod with args", () => {
			const el = doc.createElement("div");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.scrollIntoView({ behavior: "smooth" });
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "scrollIntoView",
				args: [{ behavior: "smooth" }],
			});
		});

		it("focus() emits callMethod", () => {
			const el = doc.createElement("input");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.focus();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "focus",
				args: [],
			});
		});

		it("blur() emits callMethod", () => {
			const el = doc.createElement("input");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.blur();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "blur",
				args: [],
			});
		});

		it("select() emits callMethod", () => {
			const el = doc.createElement("input");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.select();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "select",
				args: [],
			});
		});

		it("showModal() emits callMethod", () => {
			const el = doc.createElement("dialog");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.showModal();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "showModal",
				args: [],
			});
		});

		it("close() emits callMethod", () => {
			const el = doc.createElement("dialog");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.close();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "close",
				args: [],
			});
		});

		it("load() emits callMethod", () => {
			const el = doc.createElement("video");
			doc.collector.flushSync();
			transport.sent.length = 0;
			el.load();
			expect(flushAndGetLast()).toEqual({
				action: "callMethod",
				id: el._nodeId,
				method: "load",
				args: [],
			});
		});
	});

	describe("Renderer applies callMethod", () => {
		let renderer: DomRenderer;

		beforeEach(() => {
			renderer = new DomRenderer(undefined, {
				allowHeadAppend: true,
				allowBodyAppend: true,
			});
			document.body.innerHTML = "";
		});

		it("calls play() on a real element", () => {
			const id = createNodeId();
			renderer.apply({ action: "createNode", id, tag: "video" });
			renderer.apply({ action: "bodyAppendChild", id });
			const node = renderer.getNode(id) as HTMLVideoElement;
			const playSpy = vi.spyOn(node, "play").mockImplementation(() => Promise.resolve());
			renderer.apply({ action: "callMethod", id, method: "play", args: [] });
			expect(playSpy).toHaveBeenCalled();
		});

		it("calls click() on a real element", () => {
			const id = createNodeId();
			renderer.apply({ action: "createNode", id, tag: "button" });
			renderer.apply({ action: "bodyAppendChild", id });
			const node = renderer.getNode(id) as HTMLButtonElement;
			const clickSpy = vi.spyOn(node, "click");
			renderer.apply({ action: "callMethod", id, method: "click", args: [] });
			expect(clickSpy).toHaveBeenCalled();
		});

		it("blocks non-allowed methods", () => {
			const id = createNodeId();
			renderer.apply({ action: "createNode", id, tag: "div" });
			renderer.apply({ action: "bodyAppendChild", id });
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			renderer.apply({
				action: "callMethod",
				id,
				method: "remove",
				args: [],
			});
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Blocked callMethod"));
			warnSpy.mockRestore();
		});

		it("does nothing if node is not found", () => {
			// Should not throw
			renderer.apply({
				action: "callMethod",
				id: nid(9999),
				method: "play",
				args: [],
			});
		});
	});

	describe("Binary codec round-trip for callMethod", () => {
		it("round-trips callMethod with empty args", () => {
			const mutations: DomMutation[] = [
				{ action: "callMethod", id: nid(42), method: "play", args: [] },
			];
			expect(roundTrip(mutations)).toEqual(mutations);
		});

		it("round-trips callMethod with args", () => {
			const mutations: DomMutation[] = [
				{
					action: "callMethod",
					id: nid(42),
					method: "scrollIntoView",
					args: [{ behavior: "smooth", block: "center" }],
				},
			];
			expect(roundTrip(mutations)).toEqual(mutations);
		});
	});

	describe("Media state sync (_updateMediaState)", () => {
		it("updates media state on VirtualElement", () => {
			const doc = new VirtualDocument(createAppId("test"));
			const el = doc.createElement("video");

			// Default values
			expect(el.currentTime).toBe(0);
			expect(el.duration).toBe(0);
			expect(el.paused).toBe(true);
			expect(el.ended).toBe(false);
			expect(el.readyState).toBe(0);

			el._updateMediaState({
				currentTime: 10.5,
				duration: 120,
				paused: false,
				ended: false,
				readyState: 4,
			});

			expect(el.currentTime).toBe(10.5);
			expect(el.duration).toBe(120);
			expect(el.paused).toBe(false);
			expect(el.ended).toBe(false);
			expect(el.readyState).toBe(4);
		});

		it("setting currentTime emits setProperty mutation", () => {
			const doc = new VirtualDocument(createAppId("test"));
			const transport = createMockTransport();
			doc.collector.setTransport(transport);
			const el = doc.createElement("video");
			doc.collector.flushSync();
			transport.sent.length = 0;

			el.currentTime = 42;
			doc.collector.flushSync();

			const mutations = getSentMutations(transport);
			expect(mutations).toContainEqual({
				action: "setProperty",
				id: el._nodeId,
				property: "currentTime",
				value: 42,
			});
		});

		it("syncs media state via document dispatchEvent", () => {
			const doc = new VirtualDocument(createAppId("test"));
			const video = doc.createElement("video");
			doc.body.appendChild(video);

			// Register a listener to get a listenerId
			let receivedEvent: unknown = null;
			video.addEventListener("timeupdate", (e) => {
				receivedEvent = e;
			});
			doc.collector.flushSync();

			// Find the listener ID
			const listenerIds = Array.from(
				(doc as unknown as { _listenerToElement: Map<string, unknown> })._listenerToElement.keys(),
			);
			const listenerId = listenerIds[listenerIds.length - 1];

			doc.dispatchEvent(listenerId, {
				type: "timeupdate",
				target: String(video._nodeId),
				currentTarget: String(video._nodeId),
				currentTime: 25.3,
				duration: 60,
				paused: false,
				ended: false,
				readyState: 4,
			});

			expect(receivedEvent).not.toBeNull();
			expect(video.currentTime).toBe(25.3);
			expect(video.duration).toBe(60);
			expect(video.paused).toBe(false);
			expect(video.readyState).toBe(4);
		});
	});
});
