import { describe, expect, it } from "vitest";
import type { MutationLogEntry } from "../../src/core/debug.ts";
import { createNodeId } from "../../src/core/protocol.ts";
import { createReplayState, replayReset, replaySeek, replayStep } from "../../src/debug/replay.ts";

function makeMutationEntry(action: string, index: number): MutationLogEntry {
	return {
		side: "main",
		action,
		mutation: { action: "createNode", id: createNodeId(), tag: `div-${index}` },
		timestamp: Date.now() + index,
	};
}

describe("createReplayState", () => {
	it("creates state with correct initial values", () => {
		const entries = [makeMutationEntry("createNode", 0), makeMutationEntry("setAttribute", 1)];
		const state = createReplayState(entries);

		expect(state.currentIndex).toBe(0);
		expect(state.isPlaying).toBe(false);
		expect(state.entries).toHaveLength(2);
	});

	it("copies the entries array (does not share reference)", () => {
		const entries = [makeMutationEntry("createNode", 0)];
		const state = createReplayState(entries);
		entries.push(makeMutationEntry("setAttribute", 1));

		expect(state.entries).toHaveLength(1);
	});

	it("handles empty entries", () => {
		const state = createReplayState([]);
		expect(state.entries).toHaveLength(0);
		expect(state.currentIndex).toBe(0);
		expect(state.isPlaying).toBe(false);
	});
});

describe("replayStep", () => {
	it("returns entries sequentially", () => {
		const entries = [
			makeMutationEntry("createNode", 0),
			makeMutationEntry("setAttribute", 1),
			makeMutationEntry("appendChild", 2),
		];
		const state = createReplayState(entries);

		const first = replayStep(state);
		expect(first).not.toBeNull();
		expect(first?.action).toBe("createNode");
		expect(state.currentIndex).toBe(1);

		const second = replayStep(state);
		expect(second).not.toBeNull();
		expect(second?.action).toBe("setAttribute");
		expect(state.currentIndex).toBe(2);

		const third = replayStep(state);
		expect(third).not.toBeNull();
		expect(third?.action).toBe("appendChild");
		expect(state.currentIndex).toBe(3);
	});

	it("returns null at end", () => {
		const entries = [makeMutationEntry("createNode", 0)];
		const state = createReplayState(entries);

		replayStep(state); // consume the only entry
		const result = replayStep(state);
		expect(result).toBeNull();
		expect(state.currentIndex).toBe(1);
	});

	it("returns null for empty state", () => {
		const state = createReplayState([]);
		expect(replayStep(state)).toBeNull();
	});
});

describe("replaySeek", () => {
	it("seeks to a valid index", () => {
		const entries = [
			makeMutationEntry("createNode", 0),
			makeMutationEntry("setAttribute", 1),
			makeMutationEntry("appendChild", 2),
		];
		const state = createReplayState(entries);

		replaySeek(state, 2);
		expect(state.currentIndex).toBe(2);
	});

	it("clamps to 0 for negative index", () => {
		const entries = [makeMutationEntry("createNode", 0)];
		const state = createReplayState(entries);

		replaySeek(state, -5);
		expect(state.currentIndex).toBe(0);
	});

	it("clamps to entries.length for index beyond end", () => {
		const entries = [makeMutationEntry("createNode", 0), makeMutationEntry("setAttribute", 1)];
		const state = createReplayState(entries);

		replaySeek(state, 100);
		expect(state.currentIndex).toBe(2);
	});
});

describe("replayReset", () => {
	it("returns to start", () => {
		const entries = [makeMutationEntry("createNode", 0), makeMutationEntry("setAttribute", 1)];
		const state = createReplayState(entries);
		state.isPlaying = true;
		replaySeek(state, 2);

		replayReset(state);
		expect(state.currentIndex).toBe(0);
		expect(state.isPlaying).toBe(false);
	});
});
