import type { Message } from "../core/protocol.ts";
import type { Transport, TransportReadyState } from "./base.ts";

/**
 * Adapts a Transport into a Comlink-compatible Endpoint.
 *
 * This allows using Comlink's RPC-style API over any async-dom transport.
 * Requires `comlink` as a peer dependency.
 *
 * Usage:
 * ```ts
 * import * as Comlink from 'comlink';
 * import { createComlinkEndpoint } from 'async-dom/transport';
 *
 * const endpoint = createComlinkEndpoint(transport);
 * const api = Comlink.wrap(endpoint);
 * ```
 */
export interface ComlinkEndpoint {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions,
	): void;
}

export function createComlinkEndpoint(transport: Transport): ComlinkEndpoint {
	const listeners = new Set<EventListenerOrEventListenerObject>();

	transport.onMessage((message: Message) => {
		const event = new MessageEvent("message", { data: message });
		for (const listener of listeners) {
			if (typeof listener === "function") {
				listener(event);
			} else {
				listener.handleEvent(event);
			}
		}
	});

	return {
		postMessage(message: unknown) {
			transport.send(message as Message);
		},
		addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
			listeners.add(listener);
		},
		removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
			listeners.delete(listener);
		},
	};
}

export type { Transport, TransportReadyState };
