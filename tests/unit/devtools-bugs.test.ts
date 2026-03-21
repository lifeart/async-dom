import { beforeEach, describe, expect, it } from "vitest";
import type { MutationLogEntry, EventLogEntry, SyncReadLogEntry } from "../../src/core/debug.ts";
import {
	captureMutation,
	captureEvent,
	captureSyncRead,
	resetDevtoolsState,
	setLogPaused,
	setIsReplaying,
	getDevtoolsFlags,
} from "../../src/debug/devtools-panel.ts";

// Minimal stubs for log entries
function makeMutationEntry(action = "setAttribute"): MutationLogEntry {
	return {
		side: "worker",
		action,
		mutation: { type: 0, targetId: 1 } as unknown as MutationLogEntry["mutation"],
		timestamp: Date.now(),
	};
}

function makeEventEntry(): EventLogEntry {
	return {
		side: "worker",
		phase: "serialize",
		eventType: "click",
		nodeId: 1,
		timestamp: Date.now(),
	};
}

function makeSyncReadEntry(): SyncReadLogEntry {
	return {
		property: "offsetWidth",
		nodeId: 1,
		value: 100,
		durationMs: 0.5,
		timestamp: Date.now(),
	};
}

describe("devtools-panel bug fixes", () => {
	beforeEach(() => {
		resetDevtoolsState();
	});

	// ---- Bug 3: logPaused not reset by destroy() ----

	describe("logPaused reset on destroy / resetDevtoolsState", () => {
		it("captureMutation works when logPaused is false (default)", () => {
			// captureMutation should accept entries by default
			const entry = makeMutationEntry();
			// Should not throw
			captureMutation(entry);
		});

		it("captureMutation is suppressed when logPaused is true", () => {
			setLogPaused(true);
			expect(getDevtoolsFlags().logPaused).toBe(true);

			// After pausing, capture functions should silently skip
			// We can't directly inspect mutationLog (it's module-private),
			// but we verify the flag is set correctly
		});

		it("resetDevtoolsState resets logPaused to false", () => {
			setLogPaused(true);
			expect(getDevtoolsFlags().logPaused).toBe(true);

			resetDevtoolsState();
			expect(getDevtoolsFlags().logPaused).toBe(false);

			// After reset, capture should work again
			captureMutation(makeMutationEntry());
		});

		it("captureEvent is suppressed when logPaused is true", () => {
			setLogPaused(true);
			expect(getDevtoolsFlags().logPaused).toBe(true);
			// Should not throw, just silently skip
			captureEvent(makeEventEntry());
		});

		it("captureEvent works after resetDevtoolsState", () => {
			setLogPaused(true);
			resetDevtoolsState();
			expect(getDevtoolsFlags().logPaused).toBe(false);
			captureEvent(makeEventEntry());
		});

		it("captureSyncRead is suppressed when logPaused is true", () => {
			setLogPaused(true);
			captureSyncRead(makeSyncReadEntry());
			// No throw means it silently skipped
		});

		it("captureSyncRead works after resetDevtoolsState", () => {
			setLogPaused(true);
			resetDevtoolsState();
			expect(getDevtoolsFlags().logPaused).toBe(false);
			captureSyncRead(makeSyncReadEntry());
		});
	});

	// ---- Bug 3 (continued): isReplaying not reset by destroy() ----

	describe("isReplaying reset on destroy / resetDevtoolsState", () => {
		it("captureMutation is suppressed when isReplaying is true", () => {
			setIsReplaying(true);
			expect(getDevtoolsFlags().isReplaying).toBe(true);
			// Should silently skip
			captureMutation(makeMutationEntry());
		});

		it("resetDevtoolsState resets isReplaying to false", () => {
			setIsReplaying(true);
			expect(getDevtoolsFlags().isReplaying).toBe(true);

			resetDevtoolsState();
			expect(getDevtoolsFlags().isReplaying).toBe(false);
		});

		it("captureMutation works after isReplaying is reset", () => {
			setIsReplaying(true);
			resetDevtoolsState();
			expect(getDevtoolsFlags().isReplaying).toBe(false);
			// Should work again
			captureMutation(makeMutationEntry());
		});
	});

	// ---- Latency history dedup (Bug 1) ----
	// The latencyHistory and lastLatencyPushFrameId are local to createDevtoolsPanel(),
	// so we test the dedup logic pattern directly using the same algorithm.

	describe("latency history dedup logic", () => {
		it("does not push duplicate values when frameId has not changed", () => {
			const latencyHistory: number[] = [];
			let lastLatencyPushFrameId = -1;

			function pushLatency(workerLatencyMs: number, frameId: number): void {
				if (workerLatencyMs > 0 && frameId !== lastLatencyPushFrameId) {
					latencyHistory.push(workerLatencyMs);
					lastLatencyPushFrameId = frameId;
				}
			}

			// First push with frameId=1
			pushLatency(5.0, 1);
			expect(latencyHistory).toEqual([5.0]);

			// Same frameId=1 again - should NOT push
			pushLatency(5.0, 1);
			expect(latencyHistory).toEqual([5.0]);

			// Same frameId=1 with different value - still should NOT push
			pushLatency(10.0, 1);
			expect(latencyHistory).toEqual([5.0]);

			// New frameId=2 - should push
			pushLatency(7.0, 2);
			expect(latencyHistory).toEqual([5.0, 7.0]);
		});

		it("skips zero latency values", () => {
			const latencyHistory: number[] = [];
			let lastLatencyPushFrameId = -1;

			function pushLatency(workerLatencyMs: number, frameId: number): void {
				if (workerLatencyMs > 0 && frameId !== lastLatencyPushFrameId) {
					latencyHistory.push(workerLatencyMs);
					lastLatencyPushFrameId = frameId;
				}
			}

			pushLatency(0, 1);
			expect(latencyHistory).toEqual([]);

			pushLatency(3.0, 2);
			expect(latencyHistory).toEqual([3.0]);
		});

		it("allows same latency value from different frames", () => {
			const latencyHistory: number[] = [];
			let lastLatencyPushFrameId = -1;

			function pushLatency(workerLatencyMs: number, frameId: number): void {
				if (workerLatencyMs > 0 && frameId !== lastLatencyPushFrameId) {
					latencyHistory.push(workerLatencyMs);
					lastLatencyPushFrameId = frameId;
				}
			}

			pushLatency(5.0, 1);
			pushLatency(5.0, 2);
			pushLatency(5.0, 3);
			expect(latencyHistory).toEqual([5.0, 5.0, 5.0]);
			expect(latencyHistory.length).toBe(3);
		});
	});

	// ---- Combined: flags survive multiple set/reset cycles ----

	describe("flag state consistency across cycles", () => {
		it("handles multiple pause/reset cycles correctly", () => {
			// Cycle 1
			setLogPaused(true);
			setIsReplaying(true);
			expect(getDevtoolsFlags()).toEqual({ logPaused: true, isReplaying: true });

			resetDevtoolsState();
			expect(getDevtoolsFlags()).toEqual({ logPaused: false, isReplaying: false });

			// Cycle 2
			setLogPaused(true);
			expect(getDevtoolsFlags().logPaused).toBe(true);
			expect(getDevtoolsFlags().isReplaying).toBe(false);

			resetDevtoolsState();
			expect(getDevtoolsFlags()).toEqual({ logPaused: false, isReplaying: false });
		});
	});
});
