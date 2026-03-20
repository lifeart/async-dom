import type { Transport } from "../transport/base.ts";
import type { WorkerDomResult } from "../worker-thread/index.ts";
import { createWorkerDom } from "../worker-thread/index.ts";

export interface ServerAppOptions {
	transport: Transport;
	appModule: (dom: WorkerDomResult) => void | Promise<void>;
}

/**
 * Creates a server-side async-dom app instance.
 *
 * Wraps `createWorkerDom` with the provided transport and runs the user's
 * app module. Returns a destroy handle for cleanup on disconnect.
 *
 * Note: No SharedArrayBuffer is used — the async query fallback is used instead.
 */
export function createServerApp(options: ServerAppOptions): { destroy: () => void } {
	const { transport, appModule } = options;

	const dom = createWorkerDom({ transport });

	// Run the user's app module, catching errors so one connection
	// failure doesn't crash the server process
	try {
		const result = appModule(dom);
		// Handle async app modules
		if (result && typeof result === "object" && "catch" in result) {
			(result as Promise<void>).catch((err) => {
				console.error("[async-dom] Server app module error:", err);
			});
		}
	} catch (err) {
		console.error("[async-dom] Server app module error:", err);
	}

	return {
		destroy() {
			// If dom.destroy() exists (added in Phase 3.4 of transport plan), use it
			const domAny = dom as unknown as Record<string, unknown>;
			if (typeof domAny.destroy === "function") {
				(domAny.destroy as () => void)();
			} else {
				// Fallback: close the transport directly
				transport.close();
			}
		},
	};
}
