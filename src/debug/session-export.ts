import type {
	EventLogEntry,
	MutationLogEntry,
	SyncReadLogEntry,
	WarningLogEntry,
} from "../core/debug.ts";

export interface DebugSession {
	version: 1;
	exportedAt: string;
	mutationLog: MutationLogEntry[];
	warningLog: WarningLogEntry[];
	eventLog: EventLogEntry[];
	syncReadLog: SyncReadLogEntry[];
	schedulerStats: Record<string, unknown>;
	tree?: unknown;
	appData?: Record<string, unknown>;
}

export function exportSession(data: {
	mutationLog: MutationLogEntry[];
	warningLog: WarningLogEntry[];
	eventLog: EventLogEntry[];
	syncReadLog: SyncReadLogEntry[];
	schedulerStats: Record<string, unknown>;
	tree?: unknown;
	appData?: Record<string, unknown>;
}): string {
	const session: DebugSession = {
		version: 1,
		exportedAt: new Date().toISOString(),
		...data,
	};
	return JSON.stringify(session, replacer, 2);
}

function replacer(_key: string, value: unknown): unknown {
	if (value instanceof Map) return Object.fromEntries(value);
	return value;
}

export function importSession(json: string): DebugSession {
	const raw = JSON.parse(json);
	if (!raw || typeof raw !== "object") throw new Error("Invalid session: not an object");
	if (raw.version !== 1) throw new Error(`Unsupported session version: ${raw.version}`);
	if (!Array.isArray(raw.mutationLog))
		throw new Error("Invalid session: mutationLog must be an array");
	if (!Array.isArray(raw.warningLog))
		throw new Error("Invalid session: warningLog must be an array");
	if (!Array.isArray(raw.eventLog)) throw new Error("Invalid session: eventLog must be an array");
	if (!Array.isArray(raw.syncReadLog))
		throw new Error("Invalid session: syncReadLog must be an array");
	// Cap array sizes to prevent OOM
	const MAX_ENTRIES = 10_000;
	if (raw.mutationLog.length > MAX_ENTRIES) raw.mutationLog = raw.mutationLog.slice(-MAX_ENTRIES);
	if (raw.warningLog.length > MAX_ENTRIES) raw.warningLog = raw.warningLog.slice(-MAX_ENTRIES);
	if (raw.eventLog.length > MAX_ENTRIES) raw.eventLog = raw.eventLog.slice(-MAX_ENTRIES);
	if (raw.syncReadLog.length > MAX_ENTRIES) raw.syncReadLog = raw.syncReadLog.slice(-MAX_ENTRIES);
	return raw as DebugSession;
}

export function downloadJson(content: string, filename: string): void {
	const blob = new Blob([content], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
