import type { Transport } from "../transport/base.ts";
import type { WorkerDomResult } from "../worker-thread/index.ts";
import { createWorkerDom } from "../worker-thread/index.ts";

/** Configuration for {@link createServerApp}. */
export interface ServerAppOptions {
	/** The transport connecting this server-side app to its main-thread client. */
	transport: Transport;
	/** The user's application entry point. Receives a virtual DOM environment. May return a Promise. */
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
export function createServerApp(options: ServerAppOptions): {
	destroy: () => void;
	ready: Promise<void>;
} {
	const { transport, appModule } = options;

	const dom = createWorkerDom({ transport });

	// Run the user's app module, catching errors so one connection
	// failure doesn't crash the server process
	let ready: Promise<void>;
	try {
		const result = appModule(dom);
		ready =
			result instanceof Promise
				? result.catch((err) => {
						console.error("[async-dom] Server app module error:", err);
					})
				: Promise.resolve();
	} catch (err) {
		console.error("[async-dom] Server app module error:", err);
		ready = Promise.resolve();
	}

	return {
		ready,
		destroy() {
			dom.destroy();
		},
	};
}
