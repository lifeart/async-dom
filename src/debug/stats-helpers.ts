/**
 * Shared helper functions for devtools statistics computation.
 * Extracted to a separate module for testability.
 */

/** Compute the value at a given percentile from a sorted array. */
export function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, idx)];
}

/** Compute P50, P95, P99 from an unsorted data array. */
export function computePercentiles(data: number[]): { p50: number; p95: number; p99: number } {
	if (data.length === 0) return { p50: 0, p95: 0, p99: 0 };
	const sorted = [...data].sort((a, b) => a - b);
	return {
		p50: percentile(sorted, 50),
		p95: percentile(sorted, 95),
		p99: percentile(sorted, 99),
	};
}

/** Color class for latency values: green/yellow/red. */
export function latencyColorClass(ms: number): string {
	if (ms > 16) return "red";
	if (ms > 5) return "yellow";
	return "green";
}

/** Color class for sync read latency values: green/yellow/red. */
export function syncReadColorClass(ms: number): string {
	if (ms > 50) return "red";
	if (ms > 5) return "yellow";
	return "green";
}
