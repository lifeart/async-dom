import type { DomMutation, NodeId } from "../core/protocol.ts";
import type { MutationCollector } from "./mutation-collector.ts";

const KEBAB_REGEX = /[A-Z\u00C0-\u00D6\u00D8-\u00DE]/g;
const kebabCache = new Map<string, string>();

export function toKebabCase(str: string): string {
	let cached = kebabCache.get(str);
	if (cached === undefined) {
		cached = str.replace(KEBAB_REGEX, (match) => `-${match.toLowerCase()}`);
		kebabCache.set(str, cached);
	}
	return cached;
}

export interface StyleProxyOwner {
	readonly id: NodeId;
}

/**
 * Creates a Proxy-based style object that intercepts property sets
 * and emits setStyle mutations.
 */
export function createStyleProxy(
	owner: StyleProxyOwner,
	collector: MutationCollector,
	initialStyles: Record<string, string> = {},
): Record<string, string> {
	const backing: Record<string, string> = { ...initialStyles };

	return new Proxy(backing, {
		get(target, prop: string): string {
			if (typeof prop !== "string") return "";
			const key = toKebabCase(prop);
			return target[key] ?? "";
		},
		set(target, prop: string, value: string): boolean {
			if (typeof prop !== "string") return true;

			const key = toKebabCase(prop);

			// Handle cssText (setting multiple styles at once)
			if (key === "css-text") {
				parseStyleString(value).forEach(([k, v]) => {
					target[k] = v;
					const mutation: DomMutation = {
						action: "setStyle",
						id: owner.id,
						property: k,
						value: v,
					};
					collector.add(mutation);
				});
				return true;
			}

			target[key] = value;
			const mutation: DomMutation = {
				action: "setStyle",
				id: owner.id,
				property: key,
				value: String(value),
			};
			collector.add(mutation);
			return true;
		},
	});
}

function parseStyleString(value: string): Array<[string, string]> {
	const result: Array<[string, string]> = [];
	for (const part of value.split(";")) {
		const colonIdx = part.indexOf(":");
		if (colonIdx === -1) continue;
		const key = part.slice(0, colonIdx).trim();
		const val = part.slice(colonIdx + 1).trim();
		if (key && val !== undefined) {
			result.push([key, val]);
		}
	}
	return result;
}
