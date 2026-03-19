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
		it("creates branded string types", () => {
			const nodeId = createNodeId("node-1");
			const appId = createAppId("app-1");
			expect(nodeId).toBe("node-1");
			expect(appId).toBe("app-1");
			// They're still strings at runtime
			expect(typeof nodeId).toBe("string");
			expect(typeof appId).toBe("string");
		});
	});

	describe("type guards", () => {
		const mutationMsg: MutationMessage = {
			type: "mutation",
			appId: createAppId("a"),
			uid: 1,
			mutations: [{ action: "createNode", id: createNodeId("n1"), tag: "div" }],
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

	describe("mutation types", () => {
		it("supports all mutation actions as discriminated unions", () => {
			const mutations: Message = {
				type: "mutation",
				appId: createAppId("a"),
				uid: 1,
				mutations: [
					{ action: "createNode", id: createNodeId("n1"), tag: "div" },
					{ action: "createComment", id: createNodeId("c1"), textContent: "hello" },
					{ action: "appendChild", id: createNodeId("n1"), childId: createNodeId("n2") },
					{ action: "removeNode", id: createNodeId("n1") },
					{ action: "removeChild", id: createNodeId("n1"), childId: createNodeId("n2") },
					{
						action: "insertBefore",
						id: createNodeId("n1"),
						newId: createNodeId("n2"),
						refId: null,
					},
					{ action: "setAttribute", id: createNodeId("n1"), name: "class", value: "foo" },
					{ action: "removeAttribute", id: createNodeId("n1"), name: "class" },
					{
						action: "setStyle",
						id: createNodeId("n1"),
						property: "color",
						value: "red",
					},
					{
						action: "setProperty",
						id: createNodeId("n1"),
						property: "checked",
						value: true,
					},
					{
						action: "setTextContent",
						id: createNodeId("n1"),
						textContent: "hello",
					},
					{ action: "setClassName", id: createNodeId("n1"), name: "foo bar" },
					{ action: "setHTML", id: createNodeId("n1"), html: "<b>bold</b>" },
					{
						action: "addEventListener",
						id: createNodeId("n1"),
						name: "click",
						listenerId: "l1",
					},
					{ action: "headAppendChild", id: createNodeId("n1") },
					{ action: "bodyAppendChild", id: createNodeId("n1") },
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
