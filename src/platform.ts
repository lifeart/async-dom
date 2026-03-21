/* eslint-disable no-var */
declare var process:
	| {
			version: string;
			// biome-ignore lint/suspicious/noExplicitAny: Node.js process event signatures
			on(event: string, listener: (...args: any[]) => void): void;
			// biome-ignore lint/suspicious/noExplicitAny: Node.js process event signatures
			removeListener(event: string, listener: (...args: any[]) => void): void;
	  }
	| undefined;

/**
 * PlatformHost abstraction for running async-dom in different environments
 * (Web Worker, Node.js, etc.).
 *
 * Only three things need platform abstraction:
 * 1. navigator (userAgent, language, etc.)
 * 2. Error handlers (onerror, onunhandledrejection)
 * 3. beforeunload / shutdown hook
 */
export interface PlatformHost {
	navigator: {
		userAgent: string;
		language: string;
		languages: readonly string[];
		hardwareConcurrency: number;
	};
	/**
	 * Install global error and unhandled rejection handlers.
	 * Returns a cleanup function that removes the handlers.
	 */
	installErrorHandlers(
		onError: (
			message: string,
			error?: Error,
			filename?: string,
			lineno?: number,
			colno?: number,
		) => void,
		onUnhandledRejection: (reason: unknown) => void,
	): () => void;
	/**
	 * Register a callback to run before the environment shuts down.
	 * Returns a cleanup function that removes the hook.
	 */
	onBeforeUnload(callback: () => void): () => void;
}

/**
 * Create a PlatformHost for Web Worker environments (uses `self`).
 */
export function createWorkerPlatform(): PlatformHost {
	return {
		navigator: {
			userAgent: self.navigator.userAgent,
			language: self.navigator.language,
			languages: self.navigator.languages,
			hardwareConcurrency: self.navigator.hardwareConcurrency,
		},
		installErrorHandlers(onError, onUnhandledRejection) {
			const workerScope = self as unknown as {
				onerror:
					| ((
							event: ErrorEvent | string,
							source?: string,
							lineno?: number,
							colno?: number,
							error?: Error,
					  ) => void)
					| null;
				onunhandledrejection: ((event: PromiseRejectionEvent) => void) | null;
			};

			const prevOnError = workerScope.onerror;
			const prevOnRejection = workerScope.onunhandledrejection;

			workerScope.onerror = (
				event: ErrorEvent | string,
				source?: string,
				lineno?: number,
				colno?: number,
				error?: Error,
			) => {
				const message =
					typeof event === "string"
						? event
						: ((event as ErrorEvent).message ?? "Unknown worker error");
				onError(
					message,
					error,
					source ?? (typeof event !== "string" ? (event as ErrorEvent).filename : undefined),
					lineno ?? (typeof event !== "string" ? (event as ErrorEvent).lineno : undefined),
					colno ?? (typeof event !== "string" ? (event as ErrorEvent).colno : undefined),
				);
			};

			workerScope.onunhandledrejection = (event: PromiseRejectionEvent) => {
				onUnhandledRejection(event.reason);
			};

			return () => {
				workerScope.onerror = prevOnError;
				workerScope.onunhandledrejection = prevOnRejection;
			};
		},
		onBeforeUnload(callback) {
			if (typeof self !== "undefined" && "addEventListener" in self) {
				self.addEventListener("beforeunload", callback);
				return () => {
					self.removeEventListener("beforeunload", callback);
				};
			}
			return () => {};
		},
	};
}

/**
 * Create a PlatformHost for Node.js environments (uses `process`).
 */
export function createNodePlatform(): PlatformHost {
	const os = typeof globalThis !== "undefined" ? (globalThis as Record<string, unknown>) : {};
	return {
		navigator: {
			userAgent: `Node.js/${typeof process !== "undefined" ? process.version : "unknown"}`,
			language: "en-US",
			languages: ["en-US"],
			hardwareConcurrency:
				typeof os.navigator === "object" &&
				os.navigator !== null &&
				"hardwareConcurrency" in (os.navigator as object)
					? ((os.navigator as { hardwareConcurrency: number }).hardwareConcurrency ?? 1)
					: 1,
		},
		installErrorHandlers(onError, onUnhandledRejection) {
			if (typeof process === "undefined") return () => {};
			const proc = process;

			const onUncaught = (err: Error) => {
				onError(err.message, err, undefined, undefined, undefined);
			};
			const onRejection = (reason: unknown) => {
				onUnhandledRejection(reason);
			};

			proc.on("uncaughtException", onUncaught);
			proc.on("unhandledRejection", onRejection);

			return () => {
				proc.removeListener("uncaughtException", onUncaught);
				proc.removeListener("unhandledRejection", onRejection);
			};
		},
		onBeforeUnload(callback) {
			if (typeof process === "undefined") return () => {};
			const proc = process;

			const handler = () => {
				callback();
			};
			proc.on("beforeExit", handler);
			return () => {
				proc.removeListener("beforeExit", handler);
			};
		},
	};
}

/**
 * Auto-detect the current platform and create the appropriate PlatformHost.
 */
export function detectPlatform(): PlatformHost {
	if (typeof self !== "undefined" && typeof self.navigator !== "undefined") {
		return createWorkerPlatform();
	}
	return createNodePlatform();
}
