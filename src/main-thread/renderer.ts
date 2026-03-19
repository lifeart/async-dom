import { NodeCache } from "../core/node-cache.ts";
import type { DomMutation, InsertPosition, NodeId } from "../core/protocol.ts";

export interface RendererPermissions {
	allowHeadAppend: boolean;
	allowBodyAppend: boolean;
	allowNavigation: boolean;
	allowScroll: boolean;
}

const DEFAULT_PERMISSIONS: RendererPermissions = {
	allowHeadAppend: false,
	allowBodyAppend: false,
	allowNavigation: true,
	allowScroll: true,
};

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
	onNodeRemoved: ((id: NodeId) => void) | null = null;

	constructor(
		nodeCache?: NodeCache,
		permissions?: Partial<RendererPermissions>,
		root?: RendererRoot,
	) {
		this.nodeCache = nodeCache ?? new NodeCache();
		this.permissions = { ...DEFAULT_PERMISSIONS, ...permissions };
		this.root = root ?? {
			body: document.body,
			head: document.head,
			html: document.documentElement,
		};
	}

	apply(mutation: DomMutation): void {
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

		node.id = id;
		node.setAttribute("data-async-dom-id", id);
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
		if (!parent || !child) return;
		(parent as Element).appendChild(child);
	}

	private removeNode(id: NodeId): void {
		const node = this.nodeCache.get(id);
		if (!node) return;
		this.onNodeRemoved?.(id);
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
		if (!parent || !newEl) return;

		const refEl = refId ? this.nodeCache.get(refId) : null;
		(parent as Element).insertBefore(newEl, refEl ?? null);
	}

	private setAttribute(id: NodeId, name: string, value: string): void {
		const node = this.nodeCache.get(id) as Element | null;
		if (!node || !("setAttribute" in node)) return;

		if (name === "id") {
			// Create alias in cache for new id
			this.nodeCache.set(value as NodeId, node);
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
		if (!node?.style) return;
		node.style.setProperty(property, value);
	}

	private setProperty(id: NodeId, property: string, value: unknown): void {
		const node = this.nodeCache.get(id);
		if (!node) return;
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
		node.innerHTML = html;
	}

	private insertAdjacentHTML(id: NodeId, position: InsertPosition, html: string): void {
		const node = this.nodeCache.get(id) as Element | null;
		if (!node || !("insertAdjacentHTML" in node)) return;
		node.insertAdjacentHTML(position, html);
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
}
