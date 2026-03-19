/**
 * Stub observer classes that prevent crashes when frameworks
 * attempt to use browser observers in a worker context.
 */

export class VirtualMutationObserver {
	// biome-ignore lint/complexity/noUselessConstructor: Stub needs constructor signature for API compatibility
	constructor(_callback: (mutations: unknown[], observer: unknown) => void) {}
	observe(_target: unknown, _options?: unknown): void {}
	disconnect(): void {}
	takeRecords(): unknown[] {
		return [];
	}
}

export class VirtualResizeObserver {
	// biome-ignore lint/complexity/noUselessConstructor: Stub needs constructor signature for API compatibility
	constructor(_callback: (entries: unknown[], observer: unknown) => void) {}
	observe(_target: unknown, _options?: unknown): void {}
	unobserve(_target: unknown): void {}
	disconnect(): void {}
}

export class VirtualIntersectionObserver {
	readonly root = null;
	readonly rootMargin = "0px";
	readonly thresholds: readonly number[] = [0];
	// biome-ignore lint/complexity/noUselessConstructor: Stub needs constructor signature for API compatibility
	constructor(_callback: (entries: unknown[], observer: unknown) => void, _options?: unknown) {}
	observe(_target: unknown): void {}
	unobserve(_target: unknown): void {}
	disconnect(): void {}
	takeRecords(): unknown[] {
		return [];
	}
}
