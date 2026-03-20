import { describe, expect, it } from "vitest";
import type { DomMutation, MutationMessage } from "../../src/core/protocol.ts";
import { createAppId } from "../../src/core/protocol.ts";
import { MutationLog } from "../../src/server/mutation-log.ts";

function makeMutation(uid: number, mutations: DomMutation[] = []): MutationMessage {
	return {
		type: "mutation",
		appId: createAppId("test-app"),
		uid,
		mutations,
	};
}

describe("MutationLog", () => {
	describe("append and retrieve", () => {
		it("returns messages in insertion order", () => {
			const log = new MutationLog();
			log.append(makeMutation(1));
			log.append(makeMutation(2));
			log.append(makeMutation(3));

			const messages = log.getReplayMessages();
			expect(messages.map((m) => m.uid)).toEqual([1, 2, 3]);
		});

		it("returns a copy — mutations to returned array do not affect the log", () => {
			const log = new MutationLog();
			log.append(makeMutation(1));

			const messages = log.getReplayMessages();
			messages.push(makeMutation(99));

			expect(log.size()).toBe(1);
		});

		it("returns empty array when no messages have been appended", () => {
			const log = new MutationLog();
			expect(log.getReplayMessages()).toEqual([]);
		});
	});

	describe("size()", () => {
		it("tracks the number of stored entries", () => {
			const log = new MutationLog();
			expect(log.size()).toBe(0);

			log.append(makeMutation(1));
			expect(log.size()).toBe(1);

			log.append(makeMutation(2));
			expect(log.size()).toBe(2);
		});
	});

	describe("clear()", () => {
		it("empties the log", () => {
			const log = new MutationLog();
			log.append(makeMutation(1));
			log.append(makeMutation(2));

			log.clear();

			expect(log.size()).toBe(0);
			expect(log.getReplayMessages()).toEqual([]);
		});
	});

	describe("maxEntries eviction", () => {
		it("evicts the oldest entry when maxEntries is exceeded", () => {
			const log = new MutationLog({ maxEntries: 3 });
			log.append(makeMutation(1));
			log.append(makeMutation(2));
			log.append(makeMutation(3));
			log.append(makeMutation(4)); // should evict uid=1

			const uids = log.getReplayMessages().map((m) => m.uid);
			expect(uids).toEqual([2, 3, 4]);
			expect(log.size()).toBe(3);
		});

		it("caps size at maxEntries even with many appends", () => {
			const log = new MutationLog({ maxEntries: 5 });
			for (let i = 1; i <= 20; i++) {
				log.append(makeMutation(i));
			}

			expect(log.size()).toBe(5);
			const uids = log.getReplayMessages().map((m) => m.uid);
			expect(uids).toEqual([16, 17, 18, 19, 20]);
		});

		it("stores nothing when maxEntries is 0", () => {
			const log = new MutationLog({ maxEntries: 0 });
			log.append(makeMutation(1));
			log.append(makeMutation(2));

			expect(log.size()).toBe(0);
			expect(log.getReplayMessages()).toEqual([]);
		});

		it("uses default maxEntries of 10000", () => {
			const log = new MutationLog();
			for (let i = 1; i <= 10_000; i++) {
				log.append(makeMutation(i));
			}

			expect(log.size()).toBe(10_000);

			// Adding one more should evict the oldest
			log.append(makeMutation(10_001));
			expect(log.size()).toBe(10_000);
			expect(log.getReplayMessages()[0].uid).toBe(2);
		});

		it("allows maxEntries of 1 — only the most recent message is kept", () => {
			const log = new MutationLog({ maxEntries: 1 });
			log.append(makeMutation(1));
			log.append(makeMutation(2));

			const messages = log.getReplayMessages();
			expect(messages).toHaveLength(1);
			expect(messages[0].uid).toBe(2);
		});

		it("clamps negative maxEntries to 0 — stores nothing", () => {
			const log = new MutationLog({ maxEntries: -5 });
			log.append(makeMutation(1));
			log.append(makeMutation(2));

			expect(log.size()).toBe(0);
			expect(log.getReplayMessages()).toEqual([]);
		});
	});

	describe("mutation payload integrity", () => {
		it("round-trips a non-empty mutations array unchanged", () => {
			const log = new MutationLog();
			const mutations: DomMutation[] = [
				{ action: "createNode", id: 11 as import("../../src/core/protocol.ts").NodeId, tag: "DIV", textContent: "" },
				{ action: "appendChild", id: 1 as import("../../src/core/protocol.ts").NodeId, childId: 11 as import("../../src/core/protocol.ts").NodeId },
			];
			const msg = makeMutation(7, mutations);
			log.append(msg);

			const replayed = log.getReplayMessages();
			expect(replayed).toHaveLength(1);
			expect(replayed[0].uid).toBe(7);
			expect(replayed[0].mutations).toEqual(mutations);
		});
	});
});
