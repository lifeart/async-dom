import type { DomMutation } from "./protocol.ts";

/**
 * Options for enabling debug logging and the in-page devtools panel.
 *
 * Each `log*` flag enables a category of structured log output. Provide a
 * custom `logger` to redirect output (e.g. to a remote telemetry service).
 */
export interface DebugOptions {
	/** Log every DOM mutation applied by the renderer. */
	logMutations?: boolean;
	/** Log event serialization and dispatch timing. */
	logEvents?: boolean;
	/** Log synchronous DOM read requests (getBoundingClientRect, computedStyle, etc.). */
	logSyncReads?: boolean;
	/** Log per-frame scheduler statistics (actions processed, frame time, queue depth). */
	logScheduler?: boolean;
	/** Log warnings such as missing nodes, sync timeouts, and blocked properties. */
	logWarnings?: boolean;
	/** Custom logger implementation. Unset methods fall back to `console.*`. */
	logger?: Partial<DebugLogger>;
	/** Expose `__ASYNC_DOM_DEVTOOLS__` on `globalThis` and inject the in-page devtools panel. */
	exposeDevtools?: boolean;
}

/**
 * Custom logger that receives structured debug entries.
 *
 * Implement any subset of these methods and pass via `DebugOptions.logger`.
 */
export interface DebugLogger {
	/** Called for each DOM mutation applied on the main thread. */
	mutation(entry: MutationLogEntry): void;
	/** Called for event serialization and dispatch timing. */
	event(entry: EventLogEntry): void;
	/** Called for each synchronous DOM read request. */
	syncRead(entry: SyncReadLogEntry): void;
	/** Called once per scheduler frame with aggregate statistics. */
	scheduler(entry: SchedulerLogEntry): void;
	/** Called for async-dom warnings (missing nodes, timeouts, etc.). */
	warning(entry: WarningLogEntry): void;
}

/** A single DOM mutation log entry emitted by the debug system. */
export interface MutationLogEntry {
	/** Which thread generated this entry. */
	side: "worker" | "main";
	/** The mutation action name (e.g. "createElement", "setAttribute"). */
	action: string;
	/** The full mutation payload. */
	mutation: DomMutation;
	/** High-resolution timestamp (via `performance.now()`). */
	timestamp: number;
	/** Batch UID that groups related mutations from a single flush. */
	batchUid?: number;
}

/** A single event timing log entry emitted by the debug system. */
export interface EventLogEntry {
	/** Which thread generated this entry. */
	side: "worker" | "main";
	/** Whether this captures serialization or dispatch timing. */
	phase: "serialize" | "dispatch";
	/** The DOM event type (e.g. "click", "input"). */
	eventType: string;
	/** Unique listener identifier. */
	listenerId: string;
	/** Node ID of the event target, or `null` if unavailable. */
	targetId: string | null;
	/** High-resolution timestamp (via `performance.now()`). */
	timestamp: number;
	/** Time in ms the event spent in transport between threads. */
	transportMs?: number;
	/** Time in ms the worker spent dispatching the event handler. */
	dispatchMs?: number;
	/** Number of DOM mutations produced by the event handler. */
	mutationCount?: number;
}

/** A single synchronous DOM read log entry. */
export interface SyncReadLogEntry {
	/** The query type enum value (BoundingRect, ComputedStyle, etc.). */
	queryType: number;
	/** The target node ID as a string. */
	nodeId: string;
	/** Round-trip latency in milliseconds. */
	latencyMs: number;
	/** Whether the read succeeded, timed out, or threw an error. */
	result: "success" | "timeout" | "error";
	/** High-resolution timestamp (via `performance.now()`). */
	timestamp: number;
}

/** A single scheduler frame log entry. */
export interface SchedulerLogEntry {
	/** Monotonically increasing frame counter. */
	frameId: number;
	/** Number of mutations processed in this frame. */
	actionsProcessed: number;
	/** Total wall-clock time spent processing this frame in ms. */
	frameTimeMs: number;
	/** Number of mutations remaining in the queue after this frame. */
	queueDepth: number;
	/** High-resolution timestamp (via `performance.now()`). */
	timestamp: number;
}

/** A warning entry emitted when async-dom detects a potential problem. */
export interface WarningLogEntry {
	/** Machine-readable warning code (see `WarningCode`). */
	code: string;
	/** Human-readable description of the problem. */
	message: string;
	/** Additional context data relevant to the warning. */
	context: Record<string, unknown>;
	/** High-resolution timestamp (via `performance.now()`). */
	timestamp: number;
}

export const WarningCode = {
	MISSING_NODE: "ASYNC_DOM_MISSING_NODE",
	SYNC_TIMEOUT: "ASYNC_DOM_SYNC_TIMEOUT",
	LISTENER_NOT_FOUND: "ASYNC_DOM_LISTENER_NOT_FOUND",
	EVENT_ATTACH_FAILED: "ASYNC_DOM_EVENT_ATTACH_FAILED",
	TRANSPORT_NOT_OPEN: "ASYNC_DOM_TRANSPORT_NOT_OPEN",
	BLOCKED_PROPERTY: "ASYNC_DOM_BLOCKED_PROPERTY",
	WORKER_ERROR: "WORKER_ERROR",
	WORKER_UNHANDLED_REJECTION: "WORKER_UNHANDLED_REJECTION",
} as const;

export const WarningDescriptions: Record<
	(typeof WarningCode)[keyof typeof WarningCode],
	{ description: string; suggestion: string }
> = {
	ASYNC_DOM_MISSING_NODE: {
		description: "A DOM mutation referenced a node ID that doesn't exist in the node cache.",
		suggestion:
			"Ensure nodes are created before being referenced. Check for race conditions between create and update mutations.",
	},
	ASYNC_DOM_SYNC_TIMEOUT: {
		description:
			"A synchronous read (getBoundingClientRect, computedStyle) timed out waiting for the main thread response.",
		suggestion: "Reduce sync read frequency, increase timeout, or use cached values when possible.",
	},
	ASYNC_DOM_LISTENER_NOT_FOUND: {
		description: "An event was received for a listener ID that is not registered.",
		suggestion:
			"This may indicate a timing issue where a listener was removed before its event was processed.",
	},
	ASYNC_DOM_EVENT_ATTACH_FAILED: {
		description: "Failed to attach an event listener to a DOM node.",
		suggestion: "Verify the target node exists in the DOM when the listener is being attached.",
	},
	ASYNC_DOM_TRANSPORT_NOT_OPEN: {
		description: "Attempted to send a message through a closed or connecting transport.",
		suggestion: "Ensure the transport connection is established before sending mutations.",
	},
	ASYNC_DOM_BLOCKED_PROPERTY: {
		description: "A setProperty call was blocked because the property is not in the allowed list.",
		suggestion:
			"Add the property to additionalAllowedProperties in the renderer permissions if it's safe.",
	},
	WORKER_ERROR: {
		description: "An unhandled error occurred in the worker thread.",
		suggestion:
			"Check the stack trace for the error source. Add error handling in your worker code.",
	},
	WORKER_UNHANDLED_REJECTION: {
		description: "An unhandled promise rejection occurred in the worker thread.",
		suggestion:
			"Add .catch() handlers to promises or use try/catch with async/await in your worker code.",
	},
};

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

/**
 * Mutation-to-event correlation index (Feature 19: "Why Was This Node Updated?").
 *
 * Indexes mutations by nodeId and links them to their batch and causal event,
 * allowing reverse lookups: given a nodeId, find why it was updated.
 */
export class MutationEventCorrelation {
	/** Map from nodeId -> list of { batchUid, action, timestamp, causalEvent } */
	private nodeIndex = new Map<
		number,
		Array<{
			batchUid: number | undefined;
			action: string;
			timestamp: number;
			causalEvent: { eventType: string; listenerId: string; timestamp: number } | null;
		}>
	>();

	private maxEntriesPerNode = 20;
	private batchEventMap = new Map<
		number,
		{ eventType: string; listenerId: string; timestamp: number }
	>();

	/** Register a batch's causal event for later correlation. */
	registerBatchEvent(
		batchUid: number,
		causalEvent: { eventType: string; listenerId: string; timestamp: number },
	): void {
		this.batchEventMap.set(batchUid, causalEvent);
		// Limit size
		if (this.batchEventMap.size > 500) {
			const firstKey = this.batchEventMap.keys().next().value;
			if (firstKey !== undefined) this.batchEventMap.delete(firstKey);
		}
	}

	/** Index a mutation entry for a specific node. */
	indexMutation(entry: MutationLogEntry): void {
		const m = entry.mutation as Record<string, unknown>;
		const nodeId = m.id as number | undefined;
		if (nodeId == null) return;

		const causalEvent =
			entry.batchUid != null ? (this.batchEventMap.get(entry.batchUid) ?? null) : null;

		let list = this.nodeIndex.get(nodeId);
		if (!list) {
			list = [];
			this.nodeIndex.set(nodeId, list);
		}
		list.push({
			batchUid: entry.batchUid,
			action: entry.action,
			timestamp: entry.timestamp,
			causalEvent,
		});
		if (list.length > this.maxEntriesPerNode) {
			list.shift();
		}
	}

	/** Look up the chain: mutation -> batch -> event for a given nodeId. */
	getWhyUpdated(nodeId: number): Array<{
		batchUid: number | undefined;
		action: string;
		timestamp: number;
		causalEvent: { eventType: string; listenerId: string; timestamp: number } | null;
	}> {
		return this.nodeIndex.get(nodeId) ?? [];
	}

	/** Clear all data. */
	clear(): void {
		this.nodeIndex.clear();
		this.batchEventMap.clear();
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
