/**
 * Stub observer classes that prevent crashes when frameworks
 * attempt to use browser observers in a worker context.
 */

type MutationCallback = (mutations: unknown[], observer: unknown) => void;

export class VirtualMutationObserver {
	constructor(_callback: MutationCallback) {}
	observe(_target: unknown, _options?: unknown): void {}
	disconnect(): void {}
	takeRecords(): unknown[] {
		return [];
	}
}

type ResizeCallback = (entries: unknown[], observer: unknown) => void;

export class VirtualResizeObserver {
	constructor(_callback: ResizeCallback) {}
	observe(_target: unknown, _options?: unknown): void {}
	unobserve(_target: unknown): void {}
	disconnect(): void {}
}

type IntersectionCallback = (entries: unknown[], observer: unknown) => void;

export class VirtualIntersectionObserver {
	readonly root = null;
	readonly rootMargin = "0px";
	readonly thresholds: readonly number[] = [0];

	constructor(_callback: IntersectionCallback, _options?: unknown) {}
	observe(_target: unknown): void {}
	unobserve(_target: unknown): void {}
	disconnect(): void {}
	takeRecords(): unknown[] {
		return [];
	}
}
