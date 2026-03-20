import type { MutationLogEntry, WarningLogEntry } from "../core/debug.ts";
import { WarningCode } from "../core/debug.ts";
import { sanitizeHTML } from "../core/html-sanitizer.ts";
import { NodeCache } from "../core/node-cache.ts";
import type { DomMutation, InsertPosition, NodeId } from "../core/protocol.ts";

const DANGEROUS_ATTR_NAMES = new Set(["srcdoc", "formaction"]);
const DANGEROUS_URI_ATTR_NAMES = new Set(["href", "src", "data", "action", "xlink:href"]);

function isDangerousURI(value: string): boolean {
	const trimmed = value.trim().toLowerCase();
	return (
		/^\s*javascript\s*:/i.test(trimmed) ||
		/^\s*vbscript\s*:/i.test(trimmed) ||
		/^\s*data\s*:\s*text\/html/i.test(trimmed)
	);
}

export interface RendererPermissions {
	allowHeadAppend: boolean;
	allowBodyAppend: boolean;
	allowNavigation: boolean;
	allowScroll: boolean;
	allowUnsafeHTML: boolean;
	additionalAllowedProperties?: string[];
}

const DEFAULT_PERMISSIONS: RendererPermissions = {
	allowHeadAppend: false,
	allowBodyAppend: false,
	allowNavigation: true,
	allowScroll: true,
	allowUnsafeHTML: false,
};

const ALLOWED_PROPERTIES = new Set([
	// Input
	"value",
	"checked",
	"disabled",
	"selectedIndex",
	"indeterminate",
	"readOnly",
	"required",
	"placeholder",
	"type",
	"name",
	// Scroll
	"scrollTop",
	"scrollLeft",
	// Text
	"textContent",
	"nodeValue",
	// Media
	"src",
	"currentTime",
	"volume",
	"muted",
	"controls",
	"loop",
	"poster",
	"autoplay",
	// Misc safe
	"tabIndex",
	"title",
	"lang",
	"dir",
	"hidden",
	"draggable",
	"contentEditable",
	"htmlFor",
	"open",
	"selected",
	"multiple",
	"width",
	"height",
	"colSpan",
	"rowSpan",
]);

const ALLOWED_METHODS = new Set([
	"play",
	"pause",
	"load",
	"focus",
	"blur",
	"click",
	"scrollIntoView",
	"requestFullscreen",
	"select",
	"setCustomValidity",
	"reportValidity",
	"showModal",
	"close",
]);

const SVG_TAGS = new Set([
	"svg",
	"path",
	"circle",
	"ellipse",
	"line",
	"polygon",
	"polyline",
	"rect",
	"g",
	"defs",
	"use",
	"text",
	"tspan",
	"clippath",
	"mask",
	"image",
	"symbol",
	"marker",
	"lineargradient",
	"radialgradient",
	"stop",
	"filter",
	"fegaussianblur",
	"feoffset",
	"feblend",
	"foreignobject",
]);

const SVG_NS = "http://www.w3.org/2000/svg";

export interface RendererRoot {
	body: Element | ShadowRoot;
	head: Element | ShadowRoot;
	html: Element;
}

/**
 * Applies DOM mutations to the real DOM.
 * Stateless except for the node cache mapping NodeIds to DOM nodes.
 */
export class DomRenderer {
	private nodeCache: NodeCache;
	private permissions: RendererPermissions;
	private root: RendererRoot;
	private _additionalAllowedProperties: Set<string>;
	onNodeRemoved: ((id: NodeId) => void) | null = null;
	private _onWarning: ((entry: WarningLogEntry) => void) | null = null;
	private _onMutation: ((entry: MutationLogEntry) => void) | null = null;
	private highlightEnabled = false;

	setDebugHooks(hooks: {
		onWarning?: ((e: WarningLogEntry) => void) | null;
		onMutation?: ((e: MutationLogEntry) => void) | null;
	}): void {
		this._onWarning = hooks.onWarning ?? null;
		this._onMutation = hooks.onMutation ?? null;
	}

	enableHighlightUpdates(enabled: boolean): void {
		this.highlightEnabled = enabled;
	}

	private highlightNode(id: NodeId): void {
		if (!this.highlightEnabled) return;
		const node = this.nodeCache.get(id) as HTMLElement | null;
		if (!node?.style) return;
		const prev = node.style.outline;
		node.style.outline = "2px solid rgba(78, 201, 176, 0.8)";
		setTimeout(() => {
			node.style.outline = prev;
		}, 300);
	}

	constructor(
		nodeCache?: NodeCache,
		permissions?: Partial<RendererPermissions>,
		root?: RendererRoot,
	) {
		this.nodeCache = nodeCache ?? new NodeCache();
		this.permissions = { ...DEFAULT_PERMISSIONS, ...permissions };
		this._additionalAllowedProperties = new Set(this.permissions.additionalAllowedProperties ?? []);
		this.root = root ?? {
			body: document.body,
			head: document.head,
			html: document.documentElement,
		};
	}

	apply(mutation: DomMutation, batchUid?: number): void {
		if (this._onMutation) {
			this._onMutation({
				side: "main",
				action: mutation.action,
				mutation,
				timestamp: performance.now(),
				batchUid,
			});
		}
		switch (mutation.action) {
			case "createNode":
				this.createNode(mutation.id, mutation.tag, mutation.textContent);
				break;
			case "createComment":
				this.createComment(mutation.id, mutation.textContent);
				break;
			case "appendChild":
				this.appendChild(mutation.id, mutation.childId);
				break;
			case "removeNode":
				this.removeNode(mutation.id);
				break;
			case "removeChild":
				this.removeChild(mutation.id, mutation.childId);
				break;
			case "insertBefore":
				this.insertBefore(mutation.id, mutation.newId, mutation.refId);
				break;
			case "setAttribute":
				this.setAttribute(mutation.id, mutation.name, mutation.value);
				break;
			case "removeAttribute":
				this.removeAttribute(mutation.id, mutation.name);
				break;
			case "setStyle":
				this.setStyle(mutation.id, mutation.property, mutation.value);
				break;
			case "setProperty":
				this.setProperty(mutation.id, mutation.property, mutation.value);
				break;
			case "setTextContent":
				this.setTextContent(mutation.id, mutation.textContent);
				break;
			case "setClassName":
				this.setClassName(mutation.id, mutation.name);
				break;
			case "setHTML":
				this.setHTML(mutation.id, mutation.html);
				break;
			case "addEventListener":
				// Handled by EventBridge, not the renderer
				break;
			case "configureEvent":
				// Handled by EventBridge, not the renderer
				break;
			case "removeEventListener":
				// Handled by EventBridge, not the renderer
				break;
			case "headAppendChild":
				this.headAppendChild(mutation.id);
				break;
			case "bodyAppendChild":
				this.bodyAppendChild(mutation.id);
				break;
			case "pushState":
				if (this.permissions.allowNavigation) {
					window.history.pushState(mutation.state, mutation.title, mutation.url);
				}
				break;
			case "replaceState":
				if (this.permissions.allowNavigation) {
					window.history.replaceState(mutation.state, mutation.title, mutation.url);
				}
				break;
			case "scrollTo":
				if (this.permissions.allowScroll) {
					window.scrollTo(mutation.x, mutation.y);
				}
				break;
			case "insertAdjacentHTML":
				this.insertAdjacentHTML(mutation.id, mutation.position, mutation.html);
				break;
			case "callMethod":
				this.callMethod(mutation.id, mutation.method, mutation.args);
				break;
		}

		// Highlight visual mutations when debug highlighting is enabled
		if (this.highlightEnabled && "id" in mutation) {
			const action = mutation.action;
			if (
				action === "appendChild" ||
				action === "setAttribute" ||
				action === "setStyle" ||
				action === "setClassName" ||
				action === "setTextContent" ||
				action === "setHTML"
			) {
				this.highlightNode(mutation.id);
			}
		}
	}

	getNode(id: NodeId): Node | null {
		return this.nodeCache.get(id);
	}

	clear(): void {
		this.nodeCache.clear();
	}

	getRoot(): RendererRoot {
		return this.root;
	}

	private createNode(id: NodeId, tag: string, textContent?: string): void {
		if (this.nodeCache.has(id)) return;

		if (tag === "HTML") {
			this.nodeCache.set(id, this.root.html);
			return;
		}

		if (tag === "BODY") {
			this.nodeCache.set(id, this.root.body as unknown as Node);
			return;
		}

		if (tag === "HEAD") {
			this.nodeCache.set(id, this.root.head as unknown as Node);
			return;
		}

		// Text node
		if (tag.charAt(0) === "#") {
			const textNode = document.createTextNode(textContent ?? "");
			this.nodeCache.set(id, textNode);
			return;
		}

		const lowerTag = tag.toLowerCase();
		let node: Element;

		if (SVG_TAGS.has(lowerTag)) {
			node = document.createElementNS(SVG_NS, lowerTag);
		} else {
			node = document.createElement(tag);
		}

		// Store internal nodeId for lookup — don't set node.id (would pollute HTML with internal IDs)
		const idStr = String(id);
		node.setAttribute("data-async-dom-id", idStr);
		(node as unknown as Record<string, unknown>).__asyncDomId = id;
		if (textContent) {
			node.textContent = textContent;
		}
		this.nodeCache.set(id, node);
	}

	private createComment(id: NodeId, textContent: string): void {
		if (this.nodeCache.has(id)) return;
		const node = document.createComment(textContent);
		this.nodeCache.set(id, node);
	}

	private appendChild(parentId: NodeId, childId: NodeId): void {
		const parent = this.nodeCache.get(parentId);
		const child = this.nodeCache.get(childId);
		if (!parent || !child) {
			const msg = `appendChild: ${!parent ? "parent" : "child"} not found`;
			console.warn(`[async-dom] ${msg}`, { parentId, childId });
			this._onWarning?.({
				code: WarningCode.MISSING_NODE,
				message: msg,
				context: { parentId, childId },
				timestamp: performance.now(),
			});
			return;
		}
		(parent as Element).appendChild(child);
	}

	private removeNode(id: NodeId): void {
		const node = this.nodeCache.get(id);
		if (!node) {
			const msg = "removeNode: node not found";
			console.warn(`[async-dom] ${msg}`, { id });
			this._onWarning?.({
				code: WarningCode.MISSING_NODE,
				message: msg,
				context: { id },
				timestamp: performance.now(),
			});
			return;
		}
		// Detach listeners on this node and all descendants
		this._cleanupSubtreeListeners(node, id);
		this.nodeCache.delete(id);
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		} else if ("remove" in node && typeof node.remove === "function") {
			(node as Element).remove();
		}
	}

	private removeChild(parentId: NodeId, childId: NodeId): void {
		const parent = this.nodeCache.get(parentId);
		const child = this.nodeCache.get(childId);
		if (parent && child?.parentNode) {
			child.parentNode.removeChild(child);
			this.nodeCache.delete(childId);
			this.onNodeRemoved?.(childId);
		}
	}

	private insertBefore(parentId: NodeId, newId: NodeId, refId: NodeId | null): void {
		if (parentId === newId) return;
		const parent = this.nodeCache.get(parentId);
		const newEl = this.nodeCache.get(newId);
		if (!parent || !newEl) {
			const msg = `insertBefore: ${!parent ? "parent" : "newNode"} not found`;
			console.warn(`[async-dom] ${msg}`, { parentId, newId, refId });
			this._onWarning?.({
				code: WarningCode.MISSING_NODE,
				message: msg,
				context: { parentId, newId, refId },
				timestamp: performance.now(),
			});
			return;
		}

		const refEl = refId ? this.nodeCache.get(refId) : null;
		(parent as Element).insertBefore(newEl, refEl ?? null);
	}

	private setAttribute(id: NodeId, name: string, value: string): void {
		const node = this.nodeCache.get(id) as Element | null;
		if (!node || !("setAttribute" in node)) {
			const msg = "setAttribute: node not found";
			console.warn(`[async-dom] ${msg}`, { id, name, value });
			this._onWarning?.({
				code: WarningCode.MISSING_NODE,
				message: msg,
				context: { id, name, value },
				timestamp: performance.now(),
			});
			return;
		}

		// Block dangerous attributes (on* event handlers, javascript: URIs)
		const lowerName = name.toLowerCase();
		if (/^on/i.test(lowerName)) return;
		if (DANGEROUS_ATTR_NAMES.has(lowerName)) return;
		if (DANGEROUS_URI_ATTR_NAMES.has(lowerName) && isDangerousURI(value)) return;

		if (name === "id") {
			// Create alias in cache for new id — user-facing IDs are strings,
			// but we store them as NodeId for lookup compatibility
			this.nodeCache.set(value as unknown as NodeId, node);
		}
		node.setAttribute(name, value);
	}

	private removeAttribute(id: NodeId, name: string): void {
		const node = this.nodeCache.get(id) as Element | null;
		if (!node || !("removeAttribute" in node)) return;
		node.removeAttribute(name);
	}

	private setStyle(id: NodeId, property: string, value: string): void {
		const node = this.nodeCache.get(id) as HTMLElement | null;
		if (!node?.style) {
			const msg = "setStyle: node not found";
			console.warn(`[async-dom] ${msg}`, { id, property, value });
			this._onWarning?.({
				code: WarningCode.MISSING_NODE,
				message: msg,
				context: { id, property, value },
				timestamp: performance.now(),
			});
			return;
		}
		node.style.setProperty(property, value);
	}

	private setProperty(id: NodeId, property: string, value: unknown): void {
		const node = this.nodeCache.get(id);
		if (!node) return;

		if (!ALLOWED_PROPERTIES.has(property) && !this._additionalAllowedProperties.has(property)) {
			this._onWarning?.({
				code: WarningCode.BLOCKED_PROPERTY,
				message: `setProperty: property "${property}" is not in the allowed list`,
				context: { id, property },
				timestamp: performance.now(),
			});
			return;
		}

		(node as unknown as Record<string, unknown>)[property] = value;
	}

	private setTextContent(id: NodeId, textContent: string): void {
		const node = this.nodeCache.get(id);
		if (!node) return;
		node.textContent = textContent;
	}

	private setClassName(id: NodeId, name: string): void {
		const node = this.nodeCache.get(id) as Element | null;
		if (!node) return;
		node.className = name;
	}

	private setHTML(id: NodeId, html: string): void {
		const node = this.nodeCache.get(id) as Element | null;
		if (!node) return;
		node.innerHTML = this.permissions.allowUnsafeHTML ? html : sanitizeHTML(html);
	}

	private insertAdjacentHTML(id: NodeId, position: InsertPosition, html: string): void {
		const node = this.nodeCache.get(id) as Element | null;
		if (!node || !("insertAdjacentHTML" in node)) return;
		node.insertAdjacentHTML(position, this.permissions.allowUnsafeHTML ? html : sanitizeHTML(html));
	}

	private headAppendChild(id: NodeId): void {
		if (!this.permissions.allowHeadAppend) return;
		const node = this.nodeCache.get(id);
		if (node) (this.root.head as unknown as Node).appendChild(node);
	}

	private bodyAppendChild(id: NodeId): void {
		if (!this.permissions.allowBodyAppend) return;
		const node = this.nodeCache.get(id);
		if (node) (this.root.body as unknown as Node).appendChild(node);
	}

	private callMethod(id: NodeId, method: string, args: unknown[]): void {
		const node = this.nodeCache.get(id);
		if (!node) return;
		if (!ALLOWED_METHODS.has(method)) {
			console.warn(`[async-dom] Blocked callMethod: "${method}" is not allowed`);
			return;
		}
		const fn = (node as unknown as Record<string, unknown>)[method];
		if (typeof fn === "function") {
			(fn as (...a: unknown[]) => unknown).apply(node, args);
		}
	}

	/**
	 * Notify onNodeRemoved for a node and all its descendants.
	 * This ensures EventBridge detaches listeners on the entire subtree.
	 */
	private _cleanupSubtreeListeners(node: Node, id: NodeId): void {
		this.onNodeRemoved?.(id);
		if ("children" in node) {
			const el = node as Element;
			for (let i = 0; i < el.children.length; i++) {
				const child = el.children[i];
				const childId = (child as unknown as Record<string, unknown>).__asyncDomId as
					| NodeId
					| undefined;
				if (childId) {
					this._cleanupSubtreeListeners(child, childId);
					this.nodeCache.delete(childId);
				}
			}
		}
	}
}
