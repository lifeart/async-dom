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
	readonly _nodeId: NodeId;
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
		get(target, prop: string): unknown {
			if (typeof prop !== "string") return "";

			// Method stubs for CSSStyleDeclaration API
			if (prop === "getPropertyValue") {
				return (name: string) => target[toKebabCase(name)] ?? "";
			}
			if (prop === "removeProperty") {
				return (name: string) => {
					const key = toKebabCase(name);
					const old = target[key] ?? "";
					delete target[key];
					const mutation: DomMutation = {
						action: "setStyle",
						id: owner._nodeId,
						property: key,
						value: "",
					};
					collector.add(mutation);
					return old;
				};
			}
			if (prop === "setProperty") {
				return (name: string, value: string, _priority?: string) => {
					const key = toKebabCase(name);
					target[key] = value;
					const mutation: DomMutation = {
						action: "setStyle",
						id: owner._nodeId,
						property: key,
						value: String(value),
					};
					collector.add(mutation);
				};
			}
			if (prop === "cssText") {
				return Object.entries(target)
					.map(([k, v]) => `${k}: ${v}`)
					.join("; ");
			}

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
						id: owner._nodeId,
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
				id: owner._nodeId,
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
