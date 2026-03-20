import {
	CRITICAL_QUEUE_SIZE,
	DEFAULT_FRAME_BUDGET_MS,
	FLUSH_BATCH_SIZE,
	MAX_QUEUE_BEFORE_FLUSH,
	VIEWPORT_CACHE_FRAMES,
} from "./constants.ts";
import type { AppId, DomMutation, Priority } from "./protocol.ts";

export interface SchedulerConfig {
	frameBudgetMs?: number;
	enableViewportCulling?: boolean;
	enablePrioritySkipping?: boolean;
}

interface PrioritizedMutation {
	mutation: DomMutation;
	priority: Priority;
	uid: number;
	appId: AppId;
}

export type MutationApplier = (mutation: DomMutation, appId: AppId) => void;

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
	private queue: PrioritizedMutation[] = [];
	private actionTimes = new Map<string, number>();
	private frameId = 0;
	private running = false;
	private rafId = 0;
	private uidCounter = 0;

	// Performance tracking
	private timePerLastFrame = 0;
	private totalActionsLastFrame = 0;
	private isScrolling = false;
	private scrollTimer: ReturnType<typeof setTimeout> | null = null;
	private scrollAbort: AbortController | null = null;

	// Viewport culling
	private viewportHeight = 0;
	private viewportWidth = 0;
	private boundingRectCache = new Map<string, boolean>();
	private boundingRectCacheFrame = new Map<string, number>();

	private readonly frameBudgetMs: number;
	private readonly enableViewportCulling: boolean;
	private readonly enablePrioritySkipping: boolean;

	private applier: MutationApplier | null = null;

	// Per-app fairness tracking
	private appCount = 0;
	private appBudgets = new Map<AppId, number>();

	constructor(config: SchedulerConfig = {}) {
		this.frameBudgetMs = config.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS;
		this.enableViewportCulling = config.enableViewportCulling ?? true;
		this.enablePrioritySkipping = config.enablePrioritySkipping ?? true;
	}

	setApplier(applier: MutationApplier): void {
		this.applier = applier;
	}

	setAppCount(count: number): void {
		this.appCount = count;
	}

	enqueue(mutations: DomMutation[], appId: AppId, priority: Priority = "normal"): void {
		for (const mutation of mutations) {
			this.uidCounter++;
			this.queue.push({ mutation, priority, uid: this.uidCounter, appId });
		}
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.setupScrollListener();
		this.scheduleFrame();
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

	stop(): void {
		this.running = false;
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

	flush(): void {
		const applier = this.applier;
		if (!applier) return;
		this.queue.sort(prioritySort);
		for (const item of this.queue) {
			applier(item.mutation, item.appId);
		}
		this.queue.length = 0;
	}

	get pendingCount(): number {
		return this.queue.length;
	}

	private tick(_timestamp: number): void {
		if (!this.running) return;

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
					continue;
				}
				this.appBudgets.set(item.appId, appBudget + 1);
			}

			const actionStart = performance.now();
			applier(item.mutation, item.appId);
			const actionTime = performance.now() - actionStart;
			this.recordTiming(item.mutation.action, actionTime);
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
			this.timePerLastFrame = delta;
			this.totalActionsLastFrame = processed;
		}

		this.scheduleNext(start);
	}

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
