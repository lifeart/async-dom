import type { DebugOptions } from "../core/debug.ts";
import { resolveDebugHooks } from "../core/debug.ts";
import type { AppId, EventMessage, SerializedLocation } from "../core/protocol.ts";
import { createAppId, isEventMessage, isSystemMessage } from "../core/protocol.ts";
import { QueryType, SyncChannel } from "../core/sync-channel.ts";
import type { Transport } from "../transport/base.ts";
import { WorkerSelfTransport } from "../transport/worker-transport.ts";
import { VirtualDocument } from "./document.ts";
import {
	VirtualIntersectionObserver,
	VirtualMutationObserver,
	VirtualResizeObserver,
} from "./observers.ts";

export interface WorkerDomConfig {
	appId?: AppId;
	transport?: Transport;
	debug?: DebugOptions;
}

export interface WorkerDomResult {
	document: VirtualDocument;
	window: WorkerWindow;
}

export interface WorkerWindow {
	document: VirtualDocument;
	location: WorkerLocation;
	history: WorkerHistory;
	screen: { width: number; height: number };
	innerWidth: number;
	innerHeight: number;
	localStorage: WorkerLocalStorage;
	addEventListener(name: string, callback: (e: unknown) => void): void;
	removeEventListener(name: string, callback: (e: unknown) => void): void;
	scrollTo(x: number, y: number): void;
	getComputedStyle(el: unknown): Record<string, string>;
	requestAnimationFrame(cb: (time: number) => void): number;
	cancelAnimationFrame(id: number): void;
	MutationObserver: typeof VirtualMutationObserver;
	ResizeObserver: typeof VirtualResizeObserver;
	IntersectionObserver: typeof VirtualIntersectionObserver;
}

interface WorkerLocation {
	hash: string;
	href: string;
	port: string;
	host: string;
	origin: string;
	hostname: string;
	pathname: string;
	protocol: string;
	search: string;
	toString(): string;
	assign(url: string): void;
	replace(url: string): void;
	reload(): void;
}

interface WorkerHistory {
	state: unknown;
	pushState(state: unknown, title: string, url: string): void;
	replaceState(state: unknown, title: string, url: string): void;
}

interface WorkerLocalStorage {
	setItem(key: string, value: string): void;
	getItem(key: string): string | null;
	removeItem(key: string): void;
}

/**
 * Creates a virtual DOM environment inside a Web Worker.
 *
 * Returns a `document` and `window` that can be used by frameworks
 * or vanilla JS. All DOM mutations are automatically collected and
 * sent to the main thread for rendering.
 */
export function createWorkerDom(config?: WorkerDomConfig): WorkerDomResult {
	const appId = config?.appId ?? createAppId("worker");
	const transport = config?.transport ?? new WorkerSelfTransport();

	const doc = new VirtualDocument(appId);
	doc.collector.setTransport(transport);

	// Route incoming events from main thread to virtual DOM
	transport.onMessage((message) => {
		// Handle debug queries from the main thread devtools panel
		if (isSystemMessage(message) && message.type === "debugQuery") {
			const debugMsg = message as { type: "debugQuery"; query: string };
			let result: unknown = null;
			if (debugMsg.query === "tree") {
				result = doc.toJSON();
			} else if (debugMsg.query === "stats") {
				result = doc.collector.getStats();
			} else if (debugMsg.query === "pendingCount") {
				result = doc.collector.pendingCount;
			} else if (debugMsg.query === "coalescedLog") {
				result = doc.collector.getCoalescedLog();
			} else if (debugMsg.query === "perTypeCoalesced") {
				result = doc.collector.getPerTypeCoalesced();
			}
			transport.send({ type: "debugResult", query: debugMsg.query, result });
			return;
		}

		// Handle init messages with location data
		if (isSystemMessage(message) && message.type === "init" && "location" in message) {
			const initMsg = message as { location: SerializedLocation; sharedBuffer?: SharedArrayBuffer };
			const initLoc = initMsg.location;
			if (initLoc) {
				location.href = initLoc.href;
				location.protocol = initLoc.protocol;
				location.hostname = initLoc.hostname;
				location.port = initLoc.port;
				location.host = initLoc.host;
				location.origin = initLoc.origin;
				location.pathname = initLoc.pathname;
				location.search = initLoc.search;
				location.hash = initLoc.hash;
			}
			// Initialize sync channel if SharedArrayBuffer was provided
			if (initMsg.sharedBuffer) {
				doc._syncChannel = SyncChannel.fromBuffer(initMsg.sharedBuffer);
			}
			return;
		}

		if (isEventMessage(message)) {
			const eventMsg = message as EventMessage;
			doc.dispatchEvent(eventMsg.listenerId, eventMsg.event);
		}
	});

	// Install global error handlers to forward crashes to main thread
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

	workerScope.onerror = (
		event: ErrorEvent | string,
		source?: string,
		lineno?: number,
		colno?: number,
		error?: Error,
	) => {
		const message =
			typeof event === "string" ? event : ((event as ErrorEvent).message ?? "Unknown worker error");
		const serializedError: import("../core/protocol.ts").SerializedError = {
			message,
			stack: error?.stack,
			name: error?.name,
			filename: source ?? (typeof event !== "string" ? (event as ErrorEvent).filename : undefined),
			lineno: lineno ?? (typeof event !== "string" ? (event as ErrorEvent).lineno : undefined),
			colno: colno ?? (typeof event !== "string" ? (event as ErrorEvent).colno : undefined),
		};
		transport.send({ type: "error", appId, error: serializedError });
	};

	workerScope.onunhandledrejection = (event: PromiseRejectionEvent) => {
		const reason = event.reason;
		const serializedError: import("../core/protocol.ts").SerializedError = {
			message: reason instanceof Error ? reason.message : String(reason),
			stack: reason instanceof Error ? reason.stack : undefined,
			name: reason instanceof Error ? reason.name : "UnhandledRejection",
			isUnhandledRejection: true,
		};
		transport.send({ type: "error", appId, error: serializedError });
	};

	// Send ready message after setup
	transport.send({ type: "ready", appId });

	// localStorage polyfill
	const storage = new Map<string, string>();
	const localStorage: WorkerLocalStorage = {
		setItem(key: string, value: string) {
			storage.set(key, value);
		},
		getItem(key: string): string | null {
			return storage.get(key) ?? null;
		},
		removeItem(key: string) {
			storage.delete(key);
		},
	};

	function updateLocationFromURL(loc: WorkerLocation, url: string): void {
		try {
			const parsed = new URL(url, loc.href);
			loc.href = parsed.href;
			loc.protocol = parsed.protocol;
			loc.hostname = parsed.hostname;
			loc.port = parsed.port;
			loc.host = parsed.host;
			loc.origin = parsed.origin;
			loc.pathname = parsed.pathname;
			loc.search = parsed.search;
			loc.hash = parsed.hash;
		} catch {
			// Invalid URL — ignore
		}
	}

	const location: WorkerLocation = {
		hash: "",
		href: "http://localhost/",
		port: "",
		host: "localhost",
		origin: "http://localhost",
		hostname: "localhost",
		pathname: "/",
		protocol: "http:",
		search: "",
		toString() {
			return this.href;
		},
		assign(url: string) {
			updateLocationFromURL(location, url);
			doc.collector.add({ action: "pushState", state: null, title: "", url });
		},
		replace(url: string) {
			updateLocationFromURL(location, url);
			doc.collector.add({ action: "replaceState", state: null, title: "", url });
		},
		reload() {
			// No-op in worker — can't reload the main page from here
		},
	};

	const history: WorkerHistory = {
		state: null,
		pushState(state: unknown, title: string, url: string) {
			history.state = state;
			updateLocationFromURL(location, url);
			doc.collector.add({
				action: "pushState",
				state,
				title,
				url,
			});
		},
		replaceState(state: unknown, title: string, url: string) {
			history.state = state;
			updateLocationFromURL(location, url);
			doc.collector.add({
				action: "replaceState",
				state,
				title,
				url,
			});
		},
	};

	const win: WorkerWindow = {
		document: doc,
		location,
		history,
		screen: {
			get width() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(
						QueryType.WindowProperty,
						JSON.stringify({ property: "screen.width" }),
					);
					if (typeof result === "number") return result;
				}
				return 1280;
			},
			get height() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(
						QueryType.WindowProperty,
						JSON.stringify({ property: "screen.height" }),
					);
					if (typeof result === "number") return result;
				}
				return 720;
			},
		},
		innerWidth: 1280,
		innerHeight: 720,
		localStorage,
		addEventListener(name: string, callback: (e: unknown) => void) {
			doc.addEventListener(name, callback);
		},
		removeEventListener(name: string, callback: (e: unknown) => void) {
			doc.removeEventListener(name, callback);
		},
		scrollTo(x: number, y: number) {
			doc.collector.add({ action: "scrollTo", x, y });
		},
		getComputedStyle(el: unknown) {
			if (doc._syncChannel && el && typeof el === "object" && "_nodeId" in el) {
				const result = doc._syncChannel.request(
					QueryType.ComputedStyle,
					JSON.stringify({ nodeId: (el as { _nodeId: unknown })._nodeId }),
				);
				if (result && typeof result === "object") {
					return result as Record<string, string>;
				}
			}
			return {};
		},
		requestAnimationFrame(cb: (time: number) => void): number {
			return setTimeout(() => cb(performance.now()), 16) as unknown as number;
		},
		cancelAnimationFrame(id: number): void {
			clearTimeout(id);
		},
		MutationObserver: VirtualMutationObserver,
		ResizeObserver: VirtualResizeObserver,
		IntersectionObserver: VirtualIntersectionObserver,
	};

	// Override innerWidth/innerHeight with sync-channel-aware getters
	Object.defineProperties(win, {
		innerWidth: {
			get() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(
						QueryType.WindowProperty,
						JSON.stringify({ property: "innerWidth" }),
					);
					if (typeof result === "number") return result;
				}
				return 1280;
			},
			configurable: true,
		},
		innerHeight: {
			get() {
				if (doc._syncChannel) {
					const result = doc._syncChannel.request(
						QueryType.WindowProperty,
						JSON.stringify({ property: "innerHeight" }),
					);
					if (typeof result === "number") return result;
				}
				return 720;
			},
			configurable: true,
		},
	});

	doc._defaultView = win;

	if (config?.debug?.exposeDevtools) {
		(globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ = {
			document: doc,
			tree: () => doc.toJSON(),
			findNode: (id: string) => doc.getElementById(id) ?? doc.querySelector(`[id="${id}"]`),
			stats: () => doc.collector.getStats(),
			mutations: () => ({ pending: doc.collector.pendingCount }),
			flush: () => doc.collector.flushSync(),
		};
	}

	if (config?.debug?.logMutations) {
		resolveDebugHooks(config.debug);
	}

	return { document: doc, window: win };
}

export { VirtualDocument } from "./document.ts";
export type { VirtualNode } from "./element.ts";
export { VirtualCommentNode, VirtualElement, VirtualTextNode } from "./element.ts";
export { MutationCollector } from "./mutation-collector.ts";
