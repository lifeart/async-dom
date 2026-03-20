import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationLogEntry, WarningLogEntry } from "../../src/core/debug.ts";
import { DebugStats, resolveDebugHooks, WarningCode } from "../../src/core/debug.ts";
import { createAppId, createNodeId, HTML_NODE_ID, type Message } from "../../src/core/protocol.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";
import type { Transport } from "../../src/transport/base.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import { MutationCollector } from "../../src/worker-thread/mutation-collector.ts";

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

describe("DebugStats", () => {
	it("starts at zero", () => {
		const stats = new DebugStats();
		const snap = stats.snapshot();
		for (const v of Object.values(snap)) {
			expect(v).toBe(0);
		}
	});

	it("increments and snapshots correctly", () => {
		const stats = new DebugStats();
		stats.mutationsAdded = 5;
		stats.mutationsCoalesced = 2;
		stats.mutationsFlushed = 3;
		stats.mutationsApplied = 3;
		stats.eventsForwarded = 10;
		stats.eventsDispatched = 8;
		stats.syncReadRequests = 4;
		stats.syncReadTimeouts = 1;

		const snap = stats.snapshot();
		expect(snap.mutationsAdded).toBe(5);
		expect(snap.mutationsCoalesced).toBe(2);
		expect(snap.mutationsFlushed).toBe(3);
		expect(snap.mutationsApplied).toBe(3);
		expect(snap.eventsForwarded).toBe(10);
		expect(snap.eventsDispatched).toBe(8);
		expect(snap.syncReadRequests).toBe(4);
		expect(snap.syncReadTimeouts).toBe(1);
	});

	it("resets all counters to zero", () => {
		const stats = new DebugStats();
		stats.mutationsAdded = 10;
		stats.eventsForwarded = 5;
		stats.reset();

		const snap = stats.snapshot();
		for (const v of Object.values(snap)) {
			expect(v).toBe(0);
		}
	});

	it("snapshot returns a copy, not a reference", () => {
		const stats = new DebugStats();
		stats.mutationsAdded = 3;
		const snap = stats.snapshot();
		stats.mutationsAdded = 99;
		expect(snap.mutationsAdded).toBe(3);
	});
});

describe("resolveDebugHooks", () => {
	it("returns all null hooks when no options provided", () => {
		const hooks = resolveDebugHooks();
		expect(hooks.onMutation).toBeNull();
		expect(hooks.onEvent).toBeNull();
		expect(hooks.onSyncRead).toBeNull();
		expect(hooks.onScheduler).toBeNull();
		expect(hooks.onWarning).toBeNull();
	});

	it("returns function hooks when options are enabled", () => {
		const hooks = resolveDebugHooks({
			logMutations: true,
			logEvents: true,
			logSyncReads: true,
			logScheduler: true,
			logWarnings: true,
		});
		expect(hooks.onMutation).toBeTypeOf("function");
		expect(hooks.onEvent).toBeTypeOf("function");
		expect(hooks.onSyncRead).toBeTypeOf("function");
		expect(hooks.onScheduler).toBeTypeOf("function");
		expect(hooks.onWarning).toBeTypeOf("function");
	});

	it("returns null for disabled hooks", () => {
		const hooks = resolveDebugHooks({ logMutations: true });
		expect(hooks.onMutation).toBeTypeOf("function");
		expect(hooks.onEvent).toBeNull();
		expect(hooks.onSyncRead).toBeNull();
		expect(hooks.onScheduler).toBeNull();
		expect(hooks.onWarning).toBeNull();
	});

	it("uses custom logger when provided", () => {
		const customMutation = vi.fn();
		const hooks = resolveDebugHooks({
			logMutations: true,
			logger: { mutation: customMutation },
		});
		const entry: MutationLogEntry = {
			side: "main",
			action: "createNode",
			mutation: { action: "createNode", id: createNodeId(), tag: "div" },
			timestamp: 0,
		};
		hooks.onMutation?.(entry);
		expect(customMutation).toHaveBeenCalledWith(entry);
	});
});

describe("WarningCode", () => {
	it("has expected constants", () => {
		expect(WarningCode.MISSING_NODE).toBe("ASYNC_DOM_MISSING_NODE");
		expect(WarningCode.SYNC_TIMEOUT).toBe("ASYNC_DOM_SYNC_TIMEOUT");
		expect(WarningCode.LISTENER_NOT_FOUND).toBe("ASYNC_DOM_LISTENER_NOT_FOUND");
		expect(WarningCode.EVENT_ATTACH_FAILED).toBe("ASYNC_DOM_EVENT_ATTACH_FAILED");
		expect(WarningCode.TRANSPORT_NOT_OPEN).toBe("ASYNC_DOM_TRANSPORT_NOT_OPEN");
	});
});

describe("VirtualDocument.toJSON", () => {
	it("produces correct tree structure for empty document", () => {
		const doc = new VirtualDocument(createAppId("test"));
		doc.collector.flush(); // drain structural setup mutations

		const tree = doc.toJSON() as Record<string, unknown>;
		expect(tree.type).toBe("element");
		expect(tree.tag).toBe("HTML");
		expect(tree.id).toBe(HTML_NODE_ID);
		const children = tree.children as unknown[];
		expect(children).toHaveLength(2);
		expect((children[0] as Record<string, unknown>).tag).toBe("HEAD");
		expect((children[1] as Record<string, unknown>).tag).toBe("BODY");
	});

	it("serializes elements with attributes and children", () => {
		const doc = new VirtualDocument(createAppId("test"));
		doc.collector.flush();

		const div = doc.createElement("div");
		div.setAttribute("class", "test-class");
		div.className = "my-class";
		const text = doc.createTextNode("hello");
		div.appendChild(text);
		doc.body.appendChild(div);

		const tree = doc.toJSON() as Record<string, unknown>;
		const body = (tree.children as unknown[])[1] as Record<string, unknown>;
		const bodyChildren = body.children as unknown[];
		expect(bodyChildren).toHaveLength(1);

		const divNode = bodyChildren[0] as Record<string, unknown>;
		expect(divNode.type).toBe("element");
		expect(divNode.tag).toBe("DIV");
		expect(divNode.className).toBe("my-class");
		expect(divNode.attributes).toEqual({ class: "test-class" });

		const textChildren = divNode.children as unknown[];
		expect(textChildren).toHaveLength(1);
		expect((textChildren[0] as Record<string, unknown>).type).toBe("text");
		expect((textChildren[0] as Record<string, unknown>).text).toBe("hello");
	});

	it("serializes comment nodes", () => {
		const doc = new VirtualDocument(createAppId("test"));
		doc.collector.flush();

		const comment = doc.createComment("a comment");
		doc.body.appendChild(comment);

		const tree = doc.toJSON() as Record<string, unknown>;
		const body = (tree.children as unknown[])[1] as Record<string, unknown>;
		const bodyChildren = body.children as unknown[];
		expect(bodyChildren).toHaveLength(1);
		expect((bodyChildren[0] as Record<string, unknown>).type).toBe("comment");
		expect((bodyChildren[0] as Record<string, unknown>).text).toBe("a comment");
	});
});

describe("MutationCollector.getStats", () => {
	it("tracks added count", () => {
		const collector = new MutationCollector(createAppId("test"));
		const transport = createMockTransport();
		collector.setTransport(transport);

		collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
		collector.add({ action: "createNode", id: createNodeId(), tag: "span" });

		const stats = collector.getStats();
		expect(stats.added).toBe(2);
	});

	it("tracks coalesced and flushed counts", () => {
		const collector = new MutationCollector(createAppId("test"));
		const transport = createMockTransport();
		collector.setTransport(transport);

		const id = createNodeId();
		collector.add({ action: "setStyle", id, property: "color", value: "red" });
		collector.add({ action: "setStyle", id, property: "color", value: "blue" });
		collector.add({ action: "setStyle", id, property: "color", value: "green" });
		collector.flushSync();

		const stats = collector.getStats();
		expect(stats.added).toBe(3);
		expect(stats.coalesced).toBe(2); // 3 added, 1 flushed = 2 coalesced
		expect(stats.flushed).toBe(1);
	});

	it("returns a copy, not a reference", () => {
		const collector = new MutationCollector(createAppId("test"));
		const transport = createMockTransport();
		collector.setTransport(transport);

		collector.add({ action: "createNode", id: createNodeId(), tag: "div" });
		const stats1 = collector.getStats();
		collector.add({ action: "createNode", id: createNodeId(), tag: "span" });
		expect(stats1.added).toBe(1); // original snapshot unchanged
	});

	it("tracks flushed count when coalescing is disabled", () => {
		const collector = new MutationCollector(createAppId("test"));
		const transport = createMockTransport();
		collector.setTransport(transport);
		collector.enableCoalescing(false);

		const id = createNodeId();
		collector.add({ action: "setStyle", id, property: "color", value: "red" });
		collector.add({ action: "setStyle", id, property: "color", value: "blue" });
		collector.flushSync();

		const stats = collector.getStats();
		expect(stats.added).toBe(2);
		expect(stats.coalesced).toBe(0);
		expect(stats.flushed).toBe(2);
	});
});

describe("DomRenderer debug warnings", () => {
	let renderer: DomRenderer;

	beforeEach(() => {
		renderer = new DomRenderer();
		document.body.innerHTML = "";
	});

	it("fires warning for missing node in appendChild", () => {
		const warnings: WarningLogEntry[] = [];
		renderer.setDebugHooks({
			onWarning: (e) => warnings.push(e),
		});

		renderer.apply({
			action: "appendChild",
			id: createNodeId(),
			childId: createNodeId(),
		});

		expect(warnings).toHaveLength(1);
		expect(warnings[0].code).toBe(WarningCode.MISSING_NODE);
		expect(warnings[0].message).toContain("appendChild");
	});

	it("fires warning for missing node in removeNode", () => {
		const warnings: WarningLogEntry[] = [];
		renderer.setDebugHooks({
			onWarning: (e) => warnings.push(e),
		});

		renderer.apply({ action: "removeNode", id: createNodeId() });

		expect(warnings).toHaveLength(1);
		expect(warnings[0].code).toBe(WarningCode.MISSING_NODE);
		expect(warnings[0].message).toContain("removeNode");
	});

	it("fires warning for missing node in insertBefore", () => {
		const warnings: WarningLogEntry[] = [];
		renderer.setDebugHooks({
			onWarning: (e) => warnings.push(e),
		});

		renderer.apply({
			action: "insertBefore",
			id: createNodeId(),
			newId: createNodeId(),
			refId: null,
		});

		expect(warnings).toHaveLength(1);
		expect(warnings[0].code).toBe(WarningCode.MISSING_NODE);
	});

	it("fires warning for missing node in setAttribute", () => {
		const warnings: WarningLogEntry[] = [];
		renderer.setDebugHooks({
			onWarning: (e) => warnings.push(e),
		});

		renderer.apply({
			action: "setAttribute",
			id: createNodeId(),
			name: "class",
			value: "foo",
		});

		expect(warnings).toHaveLength(1);
		expect(warnings[0].code).toBe(WarningCode.MISSING_NODE);
	});

	it("fires warning for missing node in setStyle", () => {
		const warnings: WarningLogEntry[] = [];
		renderer.setDebugHooks({
			onWarning: (e) => warnings.push(e),
		});

		renderer.apply({
			action: "setStyle",
			id: createNodeId(),
			property: "color",
			value: "red",
		});

		expect(warnings).toHaveLength(1);
		expect(warnings[0].code).toBe(WarningCode.MISSING_NODE);
	});

	it("fires mutation log for each apply when onMutation is set", () => {
		const mutations: MutationLogEntry[] = [];
		renderer.setDebugHooks({
			onMutation: (e) => mutations.push(e),
		});

		const id = createNodeId();
		renderer.apply({ action: "createNode", id, tag: "div" });

		expect(mutations).toHaveLength(1);
		expect(mutations[0].side).toBe("main");
		expect(mutations[0].action).toBe("createNode");
		expect(mutations[0].timestamp).toBeGreaterThan(0);
	});
});
