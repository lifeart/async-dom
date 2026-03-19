import type { DomMutation } from "./protocol.ts";

export interface DebugOptions {
	logMutations?: boolean;
	logEvents?: boolean;
	logSyncReads?: boolean;
	logScheduler?: boolean;
	logWarnings?: boolean;
	logger?: Partial<DebugLogger>;
	exposeDevtools?: boolean;
}

export interface DebugLogger {
	mutation(entry: MutationLogEntry): void;
	event(entry: EventLogEntry): void;
	syncRead(entry: SyncReadLogEntry): void;
	scheduler(entry: SchedulerLogEntry): void;
	warning(entry: WarningLogEntry): void;
}

export interface MutationLogEntry {
	side: "worker" | "main";
	action: string;
	mutation: DomMutation;
	timestamp: number;
	batchUid?: number;
}

export interface EventLogEntry {
	side: "worker" | "main";
	phase: "serialize" | "dispatch";
	eventType: string;
	listenerId: string;
	targetId: string | null;
	timestamp: number;
}

export interface SyncReadLogEntry {
	queryType: number;
	nodeId: string;
	latencyMs: number;
	result: "success" | "timeout" | "error";
	timestamp: number;
}

export interface SchedulerLogEntry {
	frameId: number;
	actionsProcessed: number;
	frameTimeMs: number;
	queueDepth: number;
	timestamp: number;
}

export interface WarningLogEntry {
	code: string;
	message: string;
	context: Record<string, unknown>;
	timestamp: number;
}

export const WarningCode = {
	MISSING_NODE: "ASYNC_DOM_MISSING_NODE",
	SYNC_TIMEOUT: "ASYNC_DOM_SYNC_TIMEOUT",
	LISTENER_NOT_FOUND: "ASYNC_DOM_LISTENER_NOT_FOUND",
	EVENT_ATTACH_FAILED: "ASYNC_DOM_EVENT_ATTACH_FAILED",
	TRANSPORT_NOT_OPEN: "ASYNC_DOM_TRANSPORT_NOT_OPEN",
	BLOCKED_PROPERTY: "ASYNC_DOM_BLOCKED_PROPERTY",
} as const;

const defaultLogger: DebugLogger = {
	warning(entry) {
		console.warn(`[async-dom] ${entry.code}: ${entry.message}`, entry.context);
	},
	mutation(entry) {
		console.log(`[async-dom:${entry.side}] mutation:${entry.action}`, entry.mutation);
	},
	event(entry) {
		console.log(
			`[async-dom:${entry.side}] event:${entry.phase} ${entry.eventType} listenerId=${entry.listenerId}`,
		);
	},
	syncRead(entry) {
		console.log(
			`[async-dom] sync:${entry.queryType} node=${entry.nodeId} ${entry.result} (${entry.latencyMs.toFixed(1)}ms)`,
		);
	},
	scheduler(entry) {
		console.log(
			`[async-dom] frame:${entry.frameId} actions=${entry.actionsProcessed} time=${entry.frameTimeMs.toFixed(1)}ms queue=${entry.queueDepth}`,
		);
	},
};

export class DebugStats {
	mutationsAdded = 0;
	mutationsCoalesced = 0;
	mutationsFlushed = 0;
	mutationsApplied = 0;
	eventsForwarded = 0;
	eventsDispatched = 0;
	syncReadRequests = 0;
	syncReadTimeouts = 0;

	snapshot(): Record<string, number> {
		return {
			mutationsAdded: this.mutationsAdded,
			mutationsCoalesced: this.mutationsCoalesced,
			mutationsFlushed: this.mutationsFlushed,
			mutationsApplied: this.mutationsApplied,
			eventsForwarded: this.eventsForwarded,
			eventsDispatched: this.eventsDispatched,
			syncReadRequests: this.syncReadRequests,
			syncReadTimeouts: this.syncReadTimeouts,
		};
	}

	reset(): void {
		this.mutationsAdded = 0;
		this.mutationsCoalesced = 0;
		this.mutationsFlushed = 0;
		this.mutationsApplied = 0;
		this.eventsForwarded = 0;
		this.eventsDispatched = 0;
		this.syncReadRequests = 0;
		this.syncReadTimeouts = 0;
	}
}

export function resolveDebugHooks(options?: DebugOptions): {
	onMutation: ((entry: MutationLogEntry) => void) | null;
	onEvent: ((entry: EventLogEntry) => void) | null;
	onSyncRead: ((entry: SyncReadLogEntry) => void) | null;
	onScheduler: ((entry: SchedulerLogEntry) => void) | null;
	onWarning: ((entry: WarningLogEntry) => void) | null;
} {
	if (!options)
		return {
			onMutation: null,
			onEvent: null,
			onSyncRead: null,
			onScheduler: null,
			onWarning: null,
		};
	const logger = { ...defaultLogger, ...options.logger };
	return {
		onMutation: options.logMutations ? (e) => logger.mutation(e) : null,
		onEvent: options.logEvents ? (e) => logger.event(e) : null,
		onSyncRead: options.logSyncReads ? (e) => logger.syncRead(e) : null,
		onScheduler: options.logScheduler ? (e) => logger.scheduler(e) : null,
		onWarning: options.logWarnings ? (e) => logger.warning(e) : null,
	};
}
