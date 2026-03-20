import { describe, expect, it, vi } from "vitest";
import {
	createAppId,
	createNodeId,
	type MutationMessage,
} from "../../src/core/protocol.ts";

describe("WorkerTransport stats gating", () => {
	function createMockWorker() {
		return {
			postMessage: vi.fn(),
			terminate: vi.fn(),
			onmessage: null as ((e: MessageEvent) => void) | null,
			onerror: null as ((e: ErrorEvent) => void) | null,
			onmessageerror: null as (() => void) | null,
		} as unknown as Worker;
	}

	function makeMsg(uid: number): MutationMessage {
		return {
			type: "mutation",
			appId: createAppId("a"),
			uid,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
		};
	}

	it("stats are initially zero", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerTransport(createMockWorker());
		const stats = transport.getStats();
		expect(stats.messageCount).toBe(0);
		expect(stats.totalBytes).toBe(0);
		expect(stats.largestMessageBytes).toBe(0);
		expect(stats.lastMessageBytes).toBe(0);
	});

	it("stats are NOT tracked when enableStats is not called", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerTransport(createMockWorker());

		transport.send(makeMsg(1));
		transport.send(makeMsg(2));

		const stats = transport.getStats();
		expect(stats.messageCount).toBe(0);
		expect(stats.totalBytes).toBe(0);
	});

	it("stats are tracked after enableStats(true)", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerTransport(createMockWorker());
		transport.enableStats(true);

		transport.send(makeMsg(1));

		const stats = transport.getStats();
		expect(stats.messageCount).toBe(1);
		expect(stats.totalBytes).toBeGreaterThan(0);
		expect(stats.lastMessageBytes).toBeGreaterThan(0);
	});

	it("messageCount increments on each send", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerTransport(createMockWorker());
		transport.enableStats(true);

		transport.send(makeMsg(1));
		transport.send(makeMsg(2));
		transport.send(makeMsg(3));

		expect(transport.getStats().messageCount).toBe(3);
	});

	it("totalBytes accumulates across sends", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerTransport(createMockWorker());
		transport.enableStats(true);

		transport.send(makeMsg(1));
		const after1 = transport.getStats().totalBytes;

		transport.send(makeMsg(2));
		const after2 = transport.getStats().totalBytes;

		expect(after2).toBeGreaterThan(after1);
	});

	it("largestMessageBytes tracks the maximum", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerTransport(createMockWorker());
		transport.enableStats(true);

		const smallMsg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [],
		};
		const largeMsg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 2,
			mutations: Array.from({ length: 20 }, () => ({
				action: "createNode" as const,
				id: createNodeId(),
				tag: "div",
			})),
		};

		transport.send(largeMsg);
		const largestAfterBig = transport.getStats().largestMessageBytes;

		transport.send(smallMsg);
		const largestAfterSmall = transport.getStats().largestMessageBytes;

		expect(largestAfterSmall).toBe(largestAfterBig);
		expect(largestAfterBig).toBeGreaterThan(0);
	});

	it("stats stop tracking after enableStats(false)", async () => {
		const { WorkerTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerTransport(createMockWorker());
		transport.enableStats(true);

		transport.send(makeMsg(1));
		const statsEnabled = transport.getStats();

		transport.enableStats(false);
		transport.send(makeMsg(2));
		transport.send(makeMsg(3));

		const statsDisabled = transport.getStats();
		expect(statsDisabled.messageCount).toBe(statsEnabled.messageCount);
		expect(statsDisabled.totalBytes).toBe(statsEnabled.totalBytes);
	});
});

describe("WorkerSelfTransport stats gating", () => {
	function createMockScope() {
		return {
			postMessage: vi.fn(),
			onmessage: null as ((e: MessageEvent) => void) | null,
		};
	}

	function makeMsg(uid: number): MutationMessage {
		return {
			type: "mutation",
			appId: createAppId("a"),
			uid,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
		};
	}

	it("stats are NOT tracked by default", async () => {
		const { WorkerSelfTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerSelfTransport(createMockScope());

		transport.send(makeMsg(1));

		expect(transport.getStats().messageCount).toBe(0);
	});

	it("stats are tracked after enableStats(true)", async () => {
		const { WorkerSelfTransport } = await import("../../src/transport/worker-transport.ts");
		const transport = new WorkerSelfTransport(createMockScope());
		transport.enableStats(true);

		transport.send(makeMsg(1));

		expect(transport.getStats().messageCount).toBe(1);
		expect(transport.getStats().totalBytes).toBeGreaterThan(0);
	});
});
