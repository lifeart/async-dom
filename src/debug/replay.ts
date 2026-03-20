import type { MutationLogEntry } from "../core/debug.ts";

export interface ReplayState {
	entries: MutationLogEntry[];
	currentIndex: number;
	isPlaying: boolean;
}

export function createReplayState(entries: MutationLogEntry[]): ReplayState {
	return { entries: [...entries], currentIndex: 0, isPlaying: false };
}

export function replayStep(state: ReplayState): MutationLogEntry | null {
	if (state.currentIndex >= state.entries.length) return null;
	return state.entries[state.currentIndex++];
}

export function replaySeek(state: ReplayState, index: number): void {
	state.currentIndex = Math.max(0, Math.min(index, state.entries.length));
}

export function replayReset(state: ReplayState): void {
	state.currentIndex = 0;
	state.isPlaying = false;
}
