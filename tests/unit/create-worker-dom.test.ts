import { describe, expect, it } from "vitest";
import { createWorkerDom } from "../../src/worker-thread/index.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import type { Message } from "../../src/core/protocol.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";

function createMockTransport(): Transport & { sent: Message[] } {
	const sent: Message[] = [];
	return {
		sent,
		send(msg: Message) {
			sent.push(msg);
		},
		onMessage() {},
		close() {},
		get readyState(): TransportReadyState {
			return "open";
		},
	};
}

describe("createWorkerDom", () => {
	it("returns document and window", () => {
		const transport = createMockTransport();
		const result = createWorkerDom({ transport });
		expect(result.document).toBeDefined();
		expect(result.window).toBeDefined();
	});

	it("document is a VirtualDocument with body and head", () => {
		const transport = createMockTransport();
		const { document: doc } = createWorkerDom({ transport });
		expect(doc).toBeInstanceOf(VirtualDocument);
		expect(doc.body).toBeDefined();
		expect(doc.body.tagName).toBe("BODY");
		expect(doc.head).toBeDefined();
		expect(doc.head.tagName).toBe("HEAD");
	});

	it("window.location has default values", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });
		expect(win.location.protocol).toBe("http:");
		expect(win.location.hostname).toBe("localhost");
		expect(win.location.pathname).toBe("/");
	});

	it("window.history.pushState emits mutation", () => {
		const transport = createMockTransport();
		const { window: win, document: doc } = createWorkerDom({ transport });
		// Clear any init messages
		transport.sent.length = 0;

		win.history.pushState({ page: 1 }, "title", "/new-url");
		doc.collector.flushSync();

		const mutations = transport.sent.filter((m) => m.type === "mutation");
		expect(mutations.length).toBeGreaterThan(0);
	});

	it("window.localStorage round-trip", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });

		win.localStorage.setItem("key", "value");
		expect(win.localStorage.getItem("key")).toBe("value");

		win.localStorage.removeItem("key");
		expect(win.localStorage.getItem("key")).toBeNull();
	});

	it("window.getComputedStyle returns empty object", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });
		const result = win.getComputedStyle({});
		expect(result).toEqual({});
	});

	it("sends ready message on creation", () => {
		const transport = createMockTransport();
		createWorkerDom({ transport });
		const readyMsg = transport.sent.find((m) => m.type === "ready");
		expect(readyMsg).toBeDefined();
	});
});
