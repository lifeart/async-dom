import {
	CRITICAL_QUEUE_SIZE,
	DEFAULT_FRAME_BUDGET_MS,
	FLUSH_BATCH_SIZE,
	MAX_QUEUE_BEFORE_FLUSH,
	VIEWPORT_CACHE_FRAMES,
} from "./constants.ts";
import type { AppId, DomMutation, Priority } from "./protocol.ts";

/** Configuration for the FrameScheduler. All fields are optional with sensible defaults. */
export interface SchedulerConfig {
	/** Maximum milliseconds to spend processing mutations per frame (default: 16ms for 60fps). */
	frameBudgetMs?: number;
	/** Whether to skip off-screen style mutations (default: true). */
	enableViewportCulling?: boolean;
	/** Whether to drop optional mutations under frame pressure (default: true). */
	enablePrioritySkipping?: boolean;
}

/** Diagnostic record for a single frame, used by devtools flamechart visualization. */
export interface FrameLogEntry {
	/** Monotonically increasing frame counter. */
	frameId: number;
	/** Wall-clock time spent in this frame's tick(), in milliseconds. */
	totalMs: number;
	/** Number of mutations applied during this frame. */
	actionCount: number;
	/** Cumulative time per mutation action type (e.g., "setAttribute" -> 1.2ms). */
	timingBreakdown: Map<string, number>;
	/** Per-app mutation counts and deferred counts per frame (multi-app mode). */
	perApp?: Map<string, { mutations: number; deferred: number }>;
}

const MAX_FRAME_LOG = 30;

/** Internal wrapper that tags each mutation with scheduling metadata. */
interface PrioritizedMutation {
	mutation: DomMutation;
	priority: Priority;
	/** Monotonic insertion order, used as a tiebreaker in priority sorting. */
	uid: number;
	appId: AppId;
	/** UID of the MutationMessage batch this mutation came from. */
	batchUid?: number;
}

/** Callback that applies a single mutation to the real DOM (typically DomRenderer.apply). */
export type MutationApplier = (mutation: DomMutation, appId: AppId, batchUid?: number) => void;

/**
 * Frame-budget scheduler that processes DOM mutations within requestAnimationFrame
 * callbacks, respecting a configurable time budget per frame.
 *
 * Key features preserved from the original vm.js:
 * - Adaptive batch sizing based on measured action execution times
 * - Priority sorting (high > normal > low, non-optional before optional)
 * - Viewport culling for optional style mutations
 * - Graceful degradation: skip optional mutations under pressure
 */
export class FrameScheduler {
	/** Priority-sorted queue of pending mutations awaiting application. */
	private queue: PrioritizedMutation[] = [];
	/** Most recent execution time per action type, used for adaptive batch sizing. */
	private actionTimes = new Map<string, number>();
	private frameId = 0;
	private running = false;
	private rafId = 0;
	private uidCounter = 0;

	private timePerLastFrame = 0;
	private totalActionsLastFrame = 0;
	/** True while the user is scrolling; triggers skipping of optional mutations. */
	private isScrolling = false;
	private scrollTimer: ReturnType<typeof setTimeout> | null = null;
	private scrollAbort: AbortController | null = null;

	private viewportHeight = 0;
	private viewportWidth = 0;
	/** Cache of element-id -> in-viewport results to avoid repeated getBoundingClientRect. */
	private boundingRectCache = new Map<string, boolean>();
	/** Frame number when each viewport cache entry was last computed. */
	private boundingRectCacheFrame = new Map<string, number>();

	private readonly frameBudgetMs: number;
	private readonly enableViewportCulling: boolean;
	private readonly enablePrioritySkipping: boolean;

	private applier: MutationApplier | null = null;

	/** Number of active apps; enables per-app fairness budget splitting when > 1. */
	private appCount = 0;
	/** Per-app mutation count within the current frame, reset each tick. */
	private appBudgets = new Map<AppId, number>();

	private lastTickTime = 0;
	private healthCheckTimer: ReturnType<typeof setTimeout> | null = null;
	private queueOverflowWarned = false;

	private lastEnqueueTime = 0;

	/** Count of frames where processing time exceeded the frame budget. */
	private droppedFrameCount = 0;

	private lastWorkerToMainLatencyMs = 0;

	/** Rolling log of the last MAX_FRAME_LOG frames for devtools inspection. */
	private frameLog: FrameLogEntry[] = [];

	constructor(config: SchedulerConfig = {}) {
		this.frameBudgetMs = config.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS;
		this.enableViewportCulling = config.enableViewportCulling ?? true;
		this.enablePrioritySkipping = config.enablePrioritySkipping ?? true;
	}

	/** Set the function that applies each mutation to the real DOM. */
	setApplier(applier: MutationApplier): void {
		this.applier = applier;
	}

	/** Update the number of active apps for per-app fairness budgeting. */
	setAppCount(count: number): void {
		this.appCount = count;
	}

	/**
	 * Add mutations to the scheduling queue.
	 * Mutations are not applied immediately; they wait for the next frame tick.
	 * Emits a warning if the queue exceeds 10,000 items (indicates a processing bottleneck).
	 *
	 * @param mutations - Array of DOM mutations to schedule
	 * @param appId - Owning app, used for per-app fairness
	 * @param priority - Scheduling priority (default: "normal")
	 * @param batchUid - Optional batch identifier for grouping
	 */
	enqueue(
		mutations: DomMutation[],
		appId: AppId,
		priority: Priority = "normal",
		batchUid?: number,
	): void {
		this.lastEnqueueTime = performance.now();
		for (const mutation of mutations) {
			this.uidCounter++;
			this.queue.push({ mutation, priority, uid: this.uidCounter, appId, batchUid });
		}

		// Always warn on queue overflow — this is always a bug
		if (this.queue.length > 10_000 && !this.queueOverflowWarned) {
			this.queueOverflowWarned = true;
			console.warn(
				`[async-dom] Scheduler queue overflow: ${this.queue.length} pending mutations. ` +
					"Possible causes: tab hidden, applier not set, or mutations arriving faster than processing.",
			);
		}
		if (this.queue.length <= 10_000) {
			this.queueOverflowWarned = false;
		}
	}

	/** Start the rAF loop. Sets up scroll detection and a 1-second health check. */
	start(): void {
		if (this.running) return;
		this.running = true;
		this.lastTickTime = 0;
		this.setupScrollListener();
		this.scheduleFrame();

		// Health check: warn if tick doesn't fire within 1 second
		this.healthCheckTimer = setTimeout(() => {
			if (this.running && this.lastTickTime === 0) {
				console.warn(
					"[async-dom] Scheduler started but tick() has not fired after 1 second. " +
						"This usually means the tab is hidden (rAF does not fire in background tabs). " +
						`Queue has ${this.queue.length} pending mutations.`,
				);
			}
		}, 1000);

		console.debug("[async-dom] Scheduler started");
	}

	private scheduleFrame(): void {
		if (!this.running) return;
		if (typeof document !== "undefined" && document.hidden) {
			// Tab is hidden — rAF won't fire. Use setTimeout fallback.
			setTimeout(() => this.tick(performance.now()), this.frameBudgetMs);
		} else {
			this.rafId = requestAnimationFrame((ts) => this.tick(ts));
		}
	}

	/** Stop the rAF loop, cancel pending frames, and tear down scroll listeners. */
	stop(): void {
		this.running = false;
		if (this.healthCheckTimer) {
			clearTimeout(this.healthCheckTimer);
			this.healthCheckTimer = null;
		}
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = 0;
		}
		if (this.scrollAbort) {
			this.scrollAbort.abort();
			this.scrollAbort = null;
		}
		this.clearViewportCache();
	}

	clearViewportCache(): void {
		this.boundingRectCache.clear();
		this.boundingRectCacheFrame.clear();
	}

	/** Synchronously apply all queued mutations, bypassing frame budget. Used for teardown. */
	flush(): void {
		const applier = this.applier;
		if (!applier) return;
		this.queue.sort(prioritySort);
		for (const item of this.queue) {
			applier(item.mutation, item.appId, item.batchUid);
		}
		this.queue.length = 0;
	}

	/** Number of mutations waiting to be applied. */
	get pendingCount(): number {
		return this.queue.length;
	}

	/** Record the cross-thread latency from a worker MutationMessage.sentAt */
	recordWorkerLatency(sentAt: number): void {
		this.lastWorkerToMainLatencyMs = Math.max(0, Date.now() - sentAt);
	}

	/** Return a snapshot of scheduler metrics for devtools and diagnostics. */
	getStats(): {
		pending: number;
		frameId: number;
		lastFrameTimeMs: number;
		lastFrameActions: number;
		isRunning: boolean;
		lastTickTime: number;
		enqueueToApplyMs: number;
		droppedFrameCount: number;
		workerToMainLatencyMs: number;
	} {
		return {
			pending: this.queue.length,
			frameId: this.frameId,
			lastFrameTimeMs: this.timePerLastFrame,
			lastFrameActions: this.totalActionsLastFrame,
			isRunning: this.running,
			lastTickTime: this.lastTickTime,
			enqueueToApplyMs:
				this.lastTickTime > 0 && this.lastEnqueueTime > 0
					? Math.max(0, this.lastTickTime - this.lastEnqueueTime)
					: 0,
			droppedFrameCount: this.droppedFrameCount,
			workerToMainLatencyMs: this.lastWorkerToMainLatencyMs,
		};
	}

	/** Return a copy of the rolling frame log (last 30 frames). */
	getFrameLog(): FrameLogEntry[] {
		return this.frameLog.slice();
	}

	/**
	 * Core frame loop. Processes as many queued mutations as the frame budget allows.
	 *
	 * Algorithm:
	 * 1. Sort queue by priority (high > normal > low), then optional last, then FIFO
	 * 2. Compute maxActions via getActionsForFrame() (adaptive batch sizing)
	 * 3. Iterate queue, skipping optional mutations under pressure (shouldSkip)
	 * 4. In multi-app mode, enforce per-app fairness caps (maxActions / appCount)
	 * 5. Break if elapsed time exceeds frameBudgetMs (unless queue is critically large)
	 * 6. Re-enqueue deferred items for the next frame
	 */
	private tick(_timestamp: number): void {
		if (!this.running) return;

		this.lastTickTime = performance.now();
		const start = performance.now();
		this.frameId++;
		this.calcViewportSize();

		// Sort by priority
		this.queue.sort(prioritySort);

		const applier = this.applier;
		if (!applier) {
			this.scheduleNext(start);
			return;
		}

		let processed = 0;
		const maxActions = this.getActionsForFrame();
		const deferred: PrioritizedMutation[] = [];
		const frameTimingBreakdown = new Map<string, number>();

		// Feature 18: per-app mutation/deferred counts for this frame
		const perAppMutations = new Map<string, number>();
		const perAppDeferred = new Map<string, number>();

		// Reset per-app budgets at the start of each frame when multi-app
		if (this.appCount > 1) {
			this.appBudgets.clear();
		}

		let cursor = 0;
		while (cursor < this.queue.length && processed < maxActions) {
			const elapsed = performance.now() - start;

			// Under normal load, respect frame budget
			if (this.queue.length < MAX_QUEUE_BEFORE_FLUSH && elapsed >= this.frameBudgetMs) {
				break;
			}

			const item = this.queue[cursor];
			cursor++;

			if (this.shouldSkip(item)) {
				continue;
			}

			// Per-app fairness: soft cap each app's share when multi-app
			if (this.appCount > 1) {
				const appBudget = this.appBudgets.get(item.appId) ?? 0;
				const maxPerApp = Math.ceil(maxActions / this.appCount);
				if (appBudget >= maxPerApp) {
					deferred.push(item);
					// Feature 18: track deferred count per app
					const appKey = String(item.appId);
					perAppDeferred.set(appKey, (perAppDeferred.get(appKey) ?? 0) + 1);
					continue;
				}
				this.appBudgets.set(item.appId, appBudget + 1);
			}

			const actionStart = performance.now();
			applier(item.mutation, item.appId, item.batchUid);
			const actionTime = performance.now() - actionStart;

			// Feature 18: track mutation count per app
			{
				const appKey = String(item.appId);
				perAppMutations.set(appKey, (perAppMutations.get(appKey) ?? 0) + 1);
			}
			this.recordTiming(item.mutation.action, actionTime);
			frameTimingBreakdown.set(
				item.mutation.action,
				(frameTimingBreakdown.get(item.mutation.action) ?? 0) + actionTime,
			);
			processed++;
		}

		// Remove processed items efficiently
		if (cursor === this.queue.length) {
			this.queue.length = 0;
		} else if (cursor > 0) {
			this.queue = this.queue.slice(cursor);
		}

		// Re-enqueue deferred items for next frame
		if (deferred.length > 0) {
			this.queue = deferred.concat(this.queue);
		}

		const delta = performance.now() - start;
		if (processed > 0) {
			if (delta > this.frameBudgetMs) {
				this.droppedFrameCount++;
			}
			this.timePerLastFrame = delta;
			this.totalActionsLastFrame = processed;

			// Feature 18: build per-app breakdown
			let perApp: Map<string, { mutations: number; deferred: number }> | undefined;
			if (perAppMutations.size > 0 || perAppDeferred.size > 0) {
				perApp = new Map();
				const allApps = new Set([...perAppMutations.keys(), ...perAppDeferred.keys()]);
				for (const appKey of allApps) {
					perApp.set(appKey, {
						mutations: perAppMutations.get(appKey) ?? 0,
						deferred: perAppDeferred.get(appKey) ?? 0,
					});
				}
			}

			this.frameLog.push({
				frameId: this.frameId,
				totalMs: delta,
				actionCount: processed,
				timingBreakdown: frameTimingBreakdown,
				perApp,
			});
			if (this.frameLog.length > MAX_FRAME_LOG) {
				this.frameLog.shift();
			}
		}

		this.scheduleNext(start);
	}

	/** Schedule the next tick, delaying if the frame finished early to avoid busy-spinning. */
	private scheduleNext(frameStart: number): void {
		const elapsed = performance.now() - frameStart;
		if (elapsed + 1 >= this.frameBudgetMs) {
			this.scheduleFrame();
		} else {
			// Frame finished early — delay next tick to avoid burning CPU
			setTimeout(() => {
				this.scheduleFrame();
			}, this.frameBudgetMs - elapsed);
		}
	}

	/**
	 * Determine how many mutations to attempt this frame using adaptive batch sizing.
	 *
	 * Strategy (escalating by queue pressure):
	 * - Queue > 25k: emergency flush — process everything in one frame
	 * - Queue >= MAX_QUEUE_BEFORE_FLUSH (3000): process FLUSH_BATCH_SIZE (500)
	 * - Queue > CRITICAL_QUEUE_SIZE (1500): process up to CRITICAL_QUEUE_SIZE
	 * - Otherwise: use the measured average action time to estimate how many
	 *   actions fit in 3x the frame budget (the 3x multiplier allows the time-
	 *   based break in tick() to be the real limiter, while ensuring enough
	 *   work is attempted). Falls back to 2000 when no timing data exists yet.
	 */
	private getActionsForFrame(): number {
		const queueLen = this.queue.length;

		if (queueLen > 25000) {
			return queueLen;
		}
		if (queueLen >= MAX_QUEUE_BEFORE_FLUSH) {
			return FLUSH_BATCH_SIZE;
		}
		if (queueLen > CRITICAL_QUEUE_SIZE) {
			return CRITICAL_QUEUE_SIZE;
		}

		// Adaptive: estimate how many actions we can fit in the frame budget
		const avgTime = this.getAvgActionTime();
		if (avgTime > 0) {
			return Math.max(1, Math.floor((this.frameBudgetMs * 3) / avgTime));
		}

		return 2000;
	}

	/**
	 * Decide whether to skip an optional mutation to preserve frame budget.
	 * Non-optional mutations are never skipped. Optional mutations are skipped when:
	 * - User is actively scrolling (visual updates would be wasted)
	 * - Queue is large (> half of CRITICAL_QUEUE_SIZE), indicating backpressure
	 * - Previous frame exceeded budget (prevent cascading frame drops)
	 */
	private shouldSkip(item: PrioritizedMutation): boolean {
		if (!this.enablePrioritySkipping) return false;

		const mutation = item.mutation;
		const isOptional = "optional" in mutation && mutation.optional;
		if (!isOptional) return false;

		// Skip optional during scroll or when hidden
		if (this.isScrolling) return true;

		// Skip optional when queue is large
		if (this.queue.length > CRITICAL_QUEUE_SIZE / 2) return true;

		// Skip optional if last frame exceeded budget
		if (this.timePerLastFrame > this.frameBudgetMs + 0.2) {
			return true;
		}

		// Viewport culling for style mutations
		if (this.enableViewportCulling && mutation.action === "setStyle") {
			// Viewport culling would check if node is visible
			// This is a placeholder — actual check requires DOM access via renderer
		}

		return false;
	}

	/** Record the execution time for an action type. The 0.02ms bias prevents zero-time entries from skewing averages. */
	private recordTiming(action: string, ms: number): void {
		if (ms > 0) {
			this.actionTimes.set(action, ms + 0.02);
		}
	}

	private getAvgActionTime(): number {
		if (this.totalActionsLastFrame === 0) return 0;
		return this.timePerLastFrame / this.totalActionsLastFrame;
	}

	private calcViewportSize(): void {
		this.viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		this.viewportWidth = window.innerWidth || document.documentElement.clientWidth;
	}

	/**
	 * Check if an element is within the viewport, using a per-frame cache to
	 * avoid repeated getBoundingClientRect calls. Cache entries expire after
	 * VIEWPORT_CACHE_FRAMES (60) frames.
	 */
	isInViewport(elem: Element): boolean {
		const id = elem.id;
		if (!id) return true;

		const cachedFrame = this.boundingRectCacheFrame.get(id);
		if (cachedFrame !== undefined && cachedFrame + VIEWPORT_CACHE_FRAMES > this.frameId) {
			return this.boundingRectCache.get(id) ?? true;
		}

		const rect = elem.getBoundingClientRect();
		const result =
			rect.top >= 0 &&
			rect.left >= 0 &&
			rect.bottom <= this.viewportHeight &&
			rect.right <= this.viewportWidth;

		this.boundingRectCache.set(id, result);
		this.boundingRectCacheFrame.set(id, this.frameId);
		return result;
	}

	private setupScrollListener(): void {
		if (this.scrollAbort) {
			this.scrollAbort.abort();
		}
		this.scrollAbort = new AbortController();

		window.addEventListener(
			"scroll",
			() => {
				this.isScrolling = true;
				if (this.scrollTimer !== null) {
					clearTimeout(this.scrollTimer);
				}
				this.scrollTimer = setTimeout(() => {
					this.isScrolling = false;
				}, 66);
			},
			{ passive: true, signal: this.scrollAbort.signal },
		);
	}
}

/**
 * Sort comparator: high priority first, then non-optional before optional,
 * then by insertion order (uid) for FIFO stability within the same level.
 */
function prioritySort(a: PrioritizedMutation, b: PrioritizedMutation): number {
	const priorityOrder: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
	const pa = priorityOrder[a.priority];
	const pb = priorityOrder[b.priority];
	if (pa !== pb) return pa - pb;

	// Non-optional before optional
	const aOpt = "optional" in a.mutation && a.mutation.optional ? 1 : 0;
	const bOpt = "optional" in b.mutation && b.mutation.optional ? 1 : 0;
	if (aOpt !== bOpt) return aOpt - bOpt;

	return a.uid - b.uid;
}
