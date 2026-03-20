import { describe, expect, it } from "vitest";
import {
	createAppId,
	createNodeId,
	type EventMessage,
	isEventMessage,
	isMutationMessage,
	isSystemMessage,
	type Message,
	type MutationMessage,
	type SystemMessage,
} from "../../src/core/protocol.ts";

describe("protocol", () => {
	describe("createNodeId / createAppId", () => {
		it("creates branded types", () => {
			const nodeId = createNodeId();
			const appId = createAppId("app-1");
			expect(typeof nodeId).toBe("number");
			expect(typeof appId).toBe("string");
			expect(appId).toBe("app-1");
		});

		it("auto-increments node IDs", () => {
			const id1 = createNodeId();
			const id2 = createNodeId();
			expect(id2).toBeGreaterThan(id1);
		});
	});

	describe("type guards", () => {
		const mutationMsg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
		};

		const eventMsg: EventMessage = {
			type: "event",
			appId: createAppId("a"),
			listenerId: "l1",
			event: {
				type: "click",
				target: "n1",
				currentTarget: "n1",
			},
		};

		const systemMsg: SystemMessage = {
			type: "ready",
			appId: createAppId("a"),
		};

		it("identifies mutation messages", () => {
			expect(isMutationMessage(mutationMsg)).toBe(true);
			expect(isMutationMessage(eventMsg)).toBe(false);
			expect(isMutationMessage(systemMsg)).toBe(false);
		});

		it("identifies event messages", () => {
			expect(isEventMessage(mutationMsg)).toBe(false);
			expect(isEventMessage(eventMsg)).toBe(true);
			expect(isEventMessage(systemMsg)).toBe(false);
		});

		it("identifies system messages", () => {
			expect(isSystemMessage(mutationMsg)).toBe(false);
			expect(isSystemMessage(eventMsg)).toBe(false);
			expect(isSystemMessage(systemMsg)).toBe(true);
		});
	});

	describe("eventTimingResult is a valid SystemMessage", () => {
		it("is recognized as a system message", () => {
			const timingMsg: SystemMessage = {
				type: "eventTimingResult",
				listenerId: "l1",
				eventType: "click",
				dispatchMs: 2.5,
				mutationCount: 3,
				transportMs: 1.0,
			};
			expect(isSystemMessage(timingMsg)).toBe(true);
			expect(isMutationMessage(timingMsg)).toBe(false);
			expect(isEventMessage(timingMsg)).toBe(false);
		});

		it("can be assigned to Message type", () => {
			const msg: Message = {
				type: "eventTimingResult",
				listenerId: "l1",
				eventType: "click",
				dispatchMs: 2.5,
				mutationCount: 3,
				transportMs: 1.0,
			};
			expect(msg.type).toBe("eventTimingResult");
		});
	});

	describe("mutation types", () => {
		it("supports all mutation actions as discriminated unions", () => {
			const n1 = createNodeId();
			const n2 = createNodeId();
			const c1 = createNodeId();
			const mutations: Message = {
				type: "mutation",
				appId: createAppId("a"),
				uid: 1,
				mutations: [
					{ action: "createNode", id: n1, tag: "div" },
					{ action: "createComment", id: c1, textContent: "hello" },
					{ action: "appendChild", id: n1, childId: n2 },
					{ action: "removeNode", id: n1 },
					{ action: "removeChild", id: n1, childId: n2 },
					{
						action: "insertBefore",
						id: n1,
						newId: n2,
						refId: null,
					},
					{ action: "setAttribute", id: n1, name: "class", value: "foo" },
					{ action: "removeAttribute", id: n1, name: "class" },
					{
						action: "setStyle",
						id: n1,
						property: "color",
						value: "red",
					},
					{
						action: "setProperty",
						id: n1,
						property: "checked",
						value: true,
					},
					{
						action: "setTextContent",
						id: n1,
						textContent: "hello",
					},
					{ action: "setClassName", id: n1, name: "foo bar" },
					{ action: "setHTML", id: n1, html: "<b>bold</b>" },
					{
						action: "addEventListener",
						id: n1,
						name: "click",
						listenerId: "l1",
					},
					{ action: "headAppendChild", id: n1 },
					{ action: "bodyAppendChild", id: n1 },
					{ action: "pushState", state: null, title: "", url: "/foo" },
					{ action: "replaceState", state: null, title: "", url: "/bar" },
					{ action: "scrollTo", x: 0, y: 0 },
				],
			};

			expect(isMutationMessage(mutations)).toBe(true);
			if (isMutationMessage(mutations)) {
				expect(mutations.mutations).toHaveLength(19);
			}
		});
	});
});
