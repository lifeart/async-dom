import { o as DomMutation } from "./base.js";

//#region src/core/debug.d.ts
interface DebugOptions {
  logMutations?: boolean;
  logEvents?: boolean;
  logSyncReads?: boolean;
  logScheduler?: boolean;
  logWarnings?: boolean;
  logger?: Partial<DebugLogger>;
  exposeDevtools?: boolean;
}
interface DebugLogger {
  mutation(entry: MutationLogEntry): void;
  event(entry: EventLogEntry): void;
  syncRead(entry: SyncReadLogEntry): void;
  scheduler(entry: SchedulerLogEntry): void;
  warning(entry: WarningLogEntry): void;
}
interface MutationLogEntry {
  side: "worker" | "main";
  action: string;
  mutation: DomMutation;
  timestamp: number;
  batchUid?: number;
}
interface EventLogEntry {
  side: "worker" | "main";
  phase: "serialize" | "dispatch";
  eventType: string;
  listenerId: string;
  targetId: string | null;
  timestamp: number;
}
interface SyncReadLogEntry {
  queryType: number;
  nodeId: string;
  latencyMs: number;
  result: "success" | "timeout" | "error";
  timestamp: number;
}
interface SchedulerLogEntry {
  frameId: number;
  actionsProcessed: number;
  frameTimeMs: number;
  queueDepth: number;
  timestamp: number;
}
interface WarningLogEntry {
  code: string;
  message: string;
  context: Record<string, unknown>;
  timestamp: number;
}
declare const WarningCode: {
  readonly MISSING_NODE: "ASYNC_DOM_MISSING_NODE";
  readonly SYNC_TIMEOUT: "ASYNC_DOM_SYNC_TIMEOUT";
  readonly LISTENER_NOT_FOUND: "ASYNC_DOM_LISTENER_NOT_FOUND";
  readonly EVENT_ATTACH_FAILED: "ASYNC_DOM_EVENT_ATTACH_FAILED";
  readonly TRANSPORT_NOT_OPEN: "ASYNC_DOM_TRANSPORT_NOT_OPEN";
  readonly BLOCKED_PROPERTY: "ASYNC_DOM_BLOCKED_PROPERTY";
  readonly WORKER_ERROR: "WORKER_ERROR";
  readonly WORKER_UNHANDLED_REJECTION: "WORKER_UNHANDLED_REJECTION";
};
declare class DebugStats {
  mutationsAdded: number;
  mutationsCoalesced: number;
  mutationsFlushed: number;
  mutationsApplied: number;
  eventsForwarded: number;
  eventsDispatched: number;
  syncReadRequests: number;
  syncReadTimeouts: number;
  snapshot(): Record<string, number>;
  reset(): void;
}
//#endregion
export { MutationLogEntry as a, WarningCode as c, EventLogEntry as i, WarningLogEntry as l, DebugOptions as n, SchedulerLogEntry as o, DebugStats as r, SyncReadLogEntry as s, DebugLogger as t };
//# sourceMappingURL=debug.d.ts.map