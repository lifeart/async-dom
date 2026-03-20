import { describe, expect, it } from "vitest";
import type { Message } from "../../src/core/protocol.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import { createWorkerDom } from "../../src/worker-thread/index.ts";

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
	it("document is a VirtualDocument with body and head", () => {
		const transport = createMockTransport();
		const { document: doc, window: win } = createWorkerDom({ transport });
		expect(doc).toBeInstanceOf(VirtualDocument);
		expect(doc.body.tagName).toBe("BODY");
		expect(doc.head.tagName).toBe("HEAD");
		expect(win).toBeTruthy();
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

	it("location.toString() returns href", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });
		expect(win.location.toString()).toBe(win.location.href);
	});

	it("location.host and location.origin are set from init message", () => {
		let messageHandler: ((msg: Message) => void) | null = null;
		const transport: Transport & { sent: Message[] } = {
			sent: [],
			send(msg: Message) {
				this.sent.push(msg);
			},
			onMessage(handler: (msg: Message) => void) {
				messageHandler = handler;
			},
			close() {},
			get readyState(): TransportReadyState {
				return "open";
			},
		};

		const { window: win } = createWorkerDom({ transport });

		messageHandler?.({
			type: "init",
			location: {
				href: "https://example.com:8080/path?q=1#frag",
				protocol: "https:",
				hostname: "example.com",
				port: "8080",
				host: "example.com:8080",
				origin: "https://example.com:8080",
				pathname: "/path",
				search: "?q=1",
				hash: "#frag",
			},
		} as unknown as Message);

		expect(win.location.host).toBe("example.com:8080");
		expect(win.location.origin).toBe("https://example.com:8080");
		expect(win.location.protocol).toBe("https:");
		expect(win.location.hostname).toBe("example.com");
		expect(win.location.pathname).toBe("/path");
		expect(win.location.search).toBe("?q=1");
		expect(win.location.hash).toBe("#frag");
	});

	it("history.pushState updates location pathname", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });

		win.history.pushState(null, "", "/new-path");

		expect(win.location.pathname).toBe("/new-path");
	});

	it("history.replaceState updates location pathname", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });

		win.history.replaceState(null, "", "/replaced-path");

		expect(win.location.pathname).toBe("/replaced-path");
	});

	it("history.pushState updates location search and hash", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });

		win.history.pushState(null, "", "/new-path?foo=bar#section");

		expect(win.location.pathname).toBe("/new-path");
		expect(win.location.search).toBe("?foo=bar");
		expect(win.location.hash).toBe("#section");
	});

	it("history.state is updated after pushState/replaceState", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });

		expect(win.history.state).toBeNull();

		win.history.pushState({ page: 1 }, "", "/page-1");
		expect(win.history.state).toEqual({ page: 1 });

		win.history.replaceState({ page: 2 }, "", "/page-2");
		expect(win.history.state).toEqual({ page: 2 });
	});

	it("location.assign(url) updates location and emits pushState mutation", () => {
		const transport = createMockTransport();
		const { window: win, document: doc } = createWorkerDom({ transport });
		transport.sent.length = 0;

		win.location.assign("/assigned-path?key=val#top");
		doc.collector.flushSync();

		expect(win.location.pathname).toBe("/assigned-path");
		expect(win.location.search).toBe("?key=val");
		expect(win.location.hash).toBe("#top");

		const mutations = transport.sent.filter((m) => m.type === "mutation");
		expect(mutations.length).toBeGreaterThan(0);
		const mutationPayload = mutations[0] as unknown as { mutations: Array<{ action: string }> };
		const pushStateMutation = mutationPayload.mutations.find(
			(m: { action: string }) => m.action === "pushState",
		);
		expect(pushStateMutation).toBeDefined();
	});

	it("location.replace(url) updates location and emits replaceState mutation", () => {
		const transport = createMockTransport();
		const { window: win, document: doc } = createWorkerDom({ transport });
		transport.sent.length = 0;

		win.location.replace("/replaced-path?a=b#bottom");
		doc.collector.flushSync();

		expect(win.location.pathname).toBe("/replaced-path");
		expect(win.location.search).toBe("?a=b");
		expect(win.location.hash).toBe("#bottom");

		const mutations = transport.sent.filter((m) => m.type === "mutation");
		expect(mutations.length).toBeGreaterThan(0);
		const mutationPayload = mutations[0] as unknown as { mutations: Array<{ action: string }> };
		const replaceStateMutation = mutationPayload.mutations.find(
			(m: { action: string }) => m.action === "replaceState",
		);
		expect(replaceStateMutation).toBeDefined();
	});

	it("location.reload() does not throw", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport });

		expect(() => win.location.reload()).not.toThrow();
	});
});
