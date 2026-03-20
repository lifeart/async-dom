import { describe, expect, it } from "vitest";
import type { Message } from "../../src/core/protocol.ts";
import type { Transport, TransportReadyState } from "../../src/transport/base.ts";
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

describe("Sandbox: global mode", () => {
	it("patches self.document to virtual document", () => {
		const transport = createMockTransport();
		const { document: doc } = createWorkerDom({ transport, sandbox: "global" });
		expect((self as unknown as Record<string, unknown>).document).toBe(doc);
	});

	it("patches self.window to virtual window", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport, sandbox: "global" });
		expect((self as unknown as Record<string, unknown>).window).toBe(win);
	});

	it("patched globals include MutationObserver", () => {
		const transport = createMockTransport();
		createWorkerDom({ transport, sandbox: "global" });
		expect((self as unknown as Record<string, unknown>).MutationObserver).toBeDefined();
	});
});

describe("Sandbox: eval mode", () => {
	it("window.eval executes code with virtual document", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport, sandbox: "eval" });
		const result = win.eval("return typeof document !== 'undefined' ? document.nodeName : 'none'");
		expect(result).toBe("#document");
	});

	it("window.eval can create elements", () => {
		const transport = createMockTransport();
		const { window: win, document: doc } = createWorkerDom({ transport, sandbox: "eval" });
		win.eval("var div = document.createElement('div'); document.body.appendChild(div);");
		expect(doc.body.childNodes.length).toBeGreaterThan(0);
	});

	it("window.eval can access builtins from worker globals", () => {
		const transport = createMockTransport();
		const { window: win } = createWorkerDom({ transport, sandbox: "eval" });
		const result = win.eval("return typeof Array");
		expect(result).toBe("function");
	});
});

describe("Sandbox: true enables both modes", () => {
	it("patches globals AND provides eval", () => {
		const transport = createMockTransport();
		const { document: doc, window: win } = createWorkerDom({ transport, sandbox: true });
		expect((self as unknown as Record<string, unknown>).document).toBe(doc);
		expect(typeof win.eval).toBe("function");
	});
});
