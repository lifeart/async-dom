import { describe, expect, it, vi } from "vitest";
import {
	createAppId,
	createNodeId,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";
import type { Transport } from "../../src/transport/base.ts";
import { createComlinkEndpoint } from "../../src/transport/comlink-adapter.ts";

function createMockTransport(): Transport & {
	sent: Message[];
	triggerMessage: (msg: Message) => void;
} {
	let handler: ((message: Message) => void) | null = null;
	const sent: Message[] = [];
	return {
		sent,
		send(msg: Message) {
			sent.push(msg);
		},
		onMessage(h: (message: Message) => void) {
			handler = h;
		},
		close() {},
		get readyState() {
			return "open" as const;
		},
		triggerMessage(msg: Message) {
			handler?.(msg);
		},
	};
}

describe("createComlinkEndpoint", () => {
	it("postMessage calls transport.send", () => {
		const transport = createMockTransport();
		const endpoint = createComlinkEndpoint(transport);

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
		};

		endpoint.postMessage(msg);
		expect(transport.sent).toHaveLength(1);
		expect(transport.sent[0]).toEqual(msg);
	});

	it("addEventListener registers listener", () => {
		const transport = createMockTransport();
		const endpoint = createComlinkEndpoint(transport);

		const listener = vi.fn();
		endpoint.addEventListener("message", listener);

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};

		transport.triggerMessage(msg);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("removeEventListener removes listener", () => {
		const transport = createMockTransport();
		const endpoint = createComlinkEndpoint(transport);

		const listener = vi.fn();
		endpoint.addEventListener("message", listener);
		endpoint.removeEventListener("message", listener);

		transport.triggerMessage({
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		});

		expect(listener).not.toHaveBeenCalled();
	});

	it("incoming transport messages fire addEventListener callbacks", () => {
		const transport = createMockTransport();
		const endpoint = createComlinkEndpoint(transport);

		const received: MessageEvent[] = [];
		endpoint.addEventListener("message", (e) => {
			received.push(e as MessageEvent);
		});

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};

		transport.triggerMessage(msg);

		expect(received).toHaveLength(1);
		expect(received[0]).toBeInstanceOf(MessageEvent);
		expect(received[0].data).toEqual(msg);
	});

	it("both function and handleEvent listener styles work", () => {
		const transport = createMockTransport();
		const endpoint = createComlinkEndpoint(transport);

		const fnListener = vi.fn();
		const objListener = { handleEvent: vi.fn() };

		endpoint.addEventListener("message", fnListener);
		endpoint.addEventListener("message", objListener);

		const msg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};

		transport.triggerMessage(msg);

		expect(fnListener).toHaveBeenCalledTimes(1);
		expect(objListener.handleEvent).toHaveBeenCalledTimes(1);

		// Both receive MessageEvent with correct data
		const fnArg = fnListener.mock.calls[0][0] as MessageEvent;
		const objArg = objListener.handleEvent.mock.calls[0][0] as MessageEvent;
		expect(fnArg.data).toEqual(msg);
		expect(objArg.data).toEqual(msg);
	});
});
