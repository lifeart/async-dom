import { NodeCache } from "../core/node-cache.ts";
import type { AppId, NodeId, SerializedEvent } from "../core/protocol.ts";
import type { Transport } from "../transport/base.ts";

export interface EventTraceEntry {
	eventType: string;
	listenerId: string;
	serializeMs: number;
	timestamp: number;
	sentAt: number;
	transportMs?: number;
	dispatchMs?: number;
	mutationCount?: number;
}

const MAX_EVENT_TRACES = 100;

/**
 * Bridges real DOM events on the main thread to the worker thread.
 * Uses AbortController for clean listener removal.
 */
export class EventBridge {
	private listeners = new Map<
		string,
		{ controller: AbortController; nodeId: NodeId; eventName: string }
	>();
	private eventConfig = new Map<string, { preventDefault: boolean; passive?: boolean }>();
	private nodeCache: NodeCache;
	private transport: Transport | null = null;
	private appId: AppId;
	private eventTraces: EventTraceEntry[] = [];
	private _onTimingResult: ((trace: EventTraceEntry) => void) | null = null;

	constructor(appId: AppId, nodeCache?: NodeCache) {
		this.appId = appId;
		this.nodeCache = nodeCache ?? new NodeCache();
	}

	/**
	 * Set a callback that is invoked whenever a trace entry is fully
	 * populated with worker timing data.  This allows callers (e.g. the
	 * devtools debug hooks) to emit EventLogEntry objects.
	 */
	set onTimingResult(cb: ((trace: EventTraceEntry) => void) | null) {
		this._onTimingResult = cb;
	}

	setTransport(transport: Transport): void {
		this.transport = transport;
	}

	setNodeCache(nodeCache: NodeCache): void {
		this.nodeCache = nodeCache;
	}

	configureEvent(
		nodeId: NodeId,
		eventName: string,
		config: { preventDefault: boolean; passive?: boolean },
	): void {
		this.eventConfig.set(`${nodeId}_${eventName}`, config);

		// If setting preventDefault on a passive event, re-attach as non-passive
		if (config.preventDefault && isPassiveEvent(eventName)) {
			for (const [listenerId, meta] of this.listeners.entries()) {
				if (meta.nodeId === nodeId && meta.eventName === eventName) {
					// Abort old listener
					meta.controller.abort();
					// Re-attach as non-passive
					this.attach(nodeId, eventName, listenerId);
					break;
				}
			}
		}
	}

	attach(nodeId: NodeId, eventName: string, listenerId: string): void {
		const node = this.nodeCache.get(nodeId) as EventTarget | null;
		if (!node) return;

		const controller = new AbortController();
		this.listeners.set(listenerId, { controller, nodeId, eventName });

		const passive = this._isPassiveForListener(listenerId, eventName);

		node.addEventListener(
			eventName,
			(domEvent: Event) => {
				const configKey = `${nodeId}_${eventName}`;
				const config = this.eventConfig.get(configKey);
				if (config?.preventDefault) {
					domEvent.preventDefault();
				}
				const serializeStart = performance.now();
				const serialized = serializeEvent(domEvent);
				const serializeMs = performance.now() - serializeStart;
				const sentAt = Date.now();
				this.eventTraces.push({
					eventType: domEvent.type,
					listenerId,
					serializeMs,
					timestamp: performance.now(),
					sentAt,
				});
				if (this.eventTraces.length > MAX_EVENT_TRACES) {
					this.eventTraces.shift();
				}
				this.transport?.send({
					type: "event",
					appId: this.appId,
					listenerId,
					event: serialized,
				});
			},
			{ signal: controller.signal, passive },
		);
	}

	detach(listenerId: string): void {
		const meta = this.listeners.get(listenerId);
		if (meta) {
			meta.controller.abort();
			this.listeners.delete(listenerId);
		}
	}

	detachByNodeId(nodeId: NodeId): void {
		for (const [listenerId, meta] of this.listeners) {
			if (meta.nodeId === nodeId) {
				meta.controller.abort();
				this.listeners.delete(listenerId);
			}
		}
	}

	getEventTraces(): EventTraceEntry[] {
		return this.eventTraces.slice();
	}

	/**
	 * Update the most recent trace entry for a given listener with
	 * dispatch and mutation count timing from the worker.
	 * Transport time is computed on the main thread to avoid cross-origin
	 * timing issues between main thread and worker `performance.now()`.
	 */
	updateTraceWithWorkerTiming(listenerId: string, dispatchMs: number, mutationCount: number): void {
		const receivedAt = Date.now();
		// Find the most recent trace that matches by listenerId, walking backwards
		for (let i = this.eventTraces.length - 1; i >= 0; i--) {
			const trace = this.eventTraces[i];
			if (trace.listenerId === listenerId && trace.transportMs === undefined) {
				trace.transportMs = Math.max(0, receivedAt - trace.sentAt - dispatchMs);
				trace.dispatchMs = dispatchMs;
				trace.mutationCount = mutationCount;
				this._onTimingResult?.(trace);
				return;
			}
		}
	}

	getListenersForNode(nodeId: NodeId): Array<{ listenerId: string; eventName: string }> {
		const result: Array<{ listenerId: string; eventName: string }> = [];
		for (const [listenerId, meta] of this.listeners) {
			if (meta.nodeId === nodeId) {
				result.push({ listenerId, eventName: meta.eventName });
			}
		}
		return result;
	}

	detachAll(): void {
		for (const meta of this.listeners.values()) {
			meta.controller.abort();
		}
		this.listeners.clear();
	}

	private _isPassiveForListener(_listenerId: string, eventName: string): boolean {
		// Check if this event has been configured with preventDefault
		// If so, it cannot be passive
		for (const [key, config] of this.eventConfig.entries()) {
			if (key.endsWith(`_${eventName}`) && config.preventDefault) {
				return false;
			}
		}
		return isPassiveEvent(eventName);
	}
}

const PASSIVE_EVENTS = new Set(["scroll", "touchstart", "touchmove", "wheel", "mousewheel"]);

function isPassiveEvent(name: string): boolean {
	return PASSIVE_EVENTS.has(name);
}

function getNodeId(el: Element | null): string | null {
	if (!el) return null;
	const asyncId = (el as unknown as Record<string, unknown>).__asyncDomId;
	if (asyncId != null) return String(asyncId);
	return el.getAttribute("data-async-dom-id") ?? el.id ?? null;
}

/**
 * Serialize a DOM event to a plain object that can be transferred via postMessage.
 * Only includes properties relevant to the event type.
 */
function serializeEvent(e: Event): SerializedEvent {
	// Use composedPath()[0] for correct target when events cross shadow boundaries
	const composedTarget = (e.composedPath?.()[0] ?? e.target) as Element;
	const base: SerializedEvent = {
		type: e.type,
		target: getNodeId(composedTarget),
		currentTarget: getNodeId(e.currentTarget as Element),
		bubbles: e.bubbles,
		cancelable: e.cancelable,
		composed: e.composed,
		eventPhase: e.eventPhase,
		isTrusted: e.isTrusted,
		timeStamp: e.timeStamp,
	};

	// Only preventDefault on click events on anchors
	if (e.type === "click") {
		if (e.target instanceof HTMLAnchorElement || e.currentTarget instanceof HTMLAnchorElement) {
			e.preventDefault();
		}
	}

	if (e instanceof MouseEvent) {
		base.clientX = e.clientX;
		base.clientY = e.clientY;
		base.pageX = e.pageX;
		base.pageY = e.pageY;
		base.screenX = e.screenX;
		base.screenY = e.screenY;
		base.offsetX = e.offsetX;
		base.offsetY = e.offsetY;
		base.button = e.button;
		base.buttons = e.buttons;
		base.altKey = e.altKey;
		base.ctrlKey = e.ctrlKey;
		base.metaKey = e.metaKey;
		base.shiftKey = e.shiftKey;
		base.relatedTarget = getNodeId(e.relatedTarget as Element);
		base.detail = e.detail;
	}

	if (e instanceof KeyboardEvent) {
		base.key = e.key;
		base.code = e.code;
		base.keyCode = e.keyCode;
		base.altKey = e.altKey;
		base.ctrlKey = e.ctrlKey;
		base.metaKey = e.metaKey;
		base.shiftKey = e.shiftKey;
	}

	if (e instanceof InputEvent) {
		base.data = e.data ?? undefined;
		base.inputType = e.inputType;
	}

	// Serialize input element state for input/change events
	const target = e.target;
	if (target instanceof HTMLInputElement) {
		base.value = target.value;
		base.checked = target.checked;
	} else if (target instanceof HTMLTextAreaElement) {
		base.value = target.value;
	} else if (target instanceof HTMLSelectElement) {
		base.value = target.value;
		base.selectedIndex = target.selectedIndex;
	}

	// Serialize media element state for media events
	const mediaTarget = e.target;
	if (mediaTarget instanceof HTMLMediaElement) {
		base.currentTime = mediaTarget.currentTime;
		base.duration = Number.isFinite(mediaTarget.duration) ? mediaTarget.duration : 0;
		base.paused = mediaTarget.paused;
		base.ended = mediaTarget.ended;
		base.readyState = mediaTarget.readyState;
	}

	if (e instanceof FocusEvent) {
		base.relatedTarget = e.relatedTarget instanceof Element ? getNodeId(e.relatedTarget) : null;
	}

	if (e instanceof WheelEvent) {
		Object.assign(base, {
			deltaX: e.deltaX,
			deltaY: e.deltaY,
			deltaZ: e.deltaZ,
			deltaMode: e.deltaMode,
		});
	}

	return base;
}
