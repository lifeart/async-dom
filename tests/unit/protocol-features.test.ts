import { describe, expect, it } from "vitest";
import {
	createAppId,
	createNodeId,
	isMutationMessage,
	isSystemMessage,
	type Message,
	type MutationMessage,
	type PerfEntryData,
	type SystemMessage,
} from "../../src/core/protocol.ts";

describe("Protocol types for Features 15-19", () => {
	describe("MutationMessage.causalEvent (Feature 15)", () => {
		it("accepts a causalEvent field on MutationMessage", () => {
			const msg: MutationMessage = {
				type: "mutation",
				appId: createAppId("app1"),
				uid: 1,
				mutations: [{ action: "createNode", id: createNodeId(), tag: "div" }],
				causalEvent: {
					eventType: "click",
					listenerId: "btn_1",
					timestamp: 1000,
				},
			};

			expect(isMutationMessage(msg as Message)).toBe(true);
			expect(msg.causalEvent).toBeDefined();
			expect(msg.causalEvent!.eventType).toBe("click");
		});

		it("causalEvent is optional", () => {
			const msg: MutationMessage = {
				type: "mutation",
				appId: createAppId("app1"),
				uid: 2,
				mutations: [],
			};

			expect(msg.causalEvent).toBeUndefined();
		});
	});

	describe("perfEntries SystemMessage (Feature 16)", () => {
		it("is a valid SystemMessage variant", () => {
			const entries: PerfEntryData[] = [
				{ name: "async-dom:event:click:btn_1", startTime: 0, duration: 1.5, entryType: "measure" },
				{ name: "async-dom:flush:app1", startTime: 2, duration: 0.3, entryType: "measure" },
			];

			const msg: SystemMessage = {
				type: "perfEntries",
				appId: createAppId("app1"),
				entries,
			};

			expect(isSystemMessage(msg as Message)).toBe(true);
			expect(msg.type).toBe("perfEntries");

			// Narrow the type and check entries
			if (msg.type === "perfEntries") {
				expect(msg.entries).toHaveLength(2);
				expect(msg.entries[0].name).toBe("async-dom:event:click:btn_1");
				expect(msg.entries[1].duration).toBe(0.3);
			}
		});

		it("PerfEntryData has required fields", () => {
			const entry: PerfEntryData = {
				name: "test",
				startTime: 0,
				duration: 1,
				entryType: "measure",
			};

			expect(entry.name).toBe("test");
			expect(entry.startTime).toBe(0);
			expect(entry.duration).toBe(1);
			expect(entry.entryType).toBe("measure");
		});
	});
});
