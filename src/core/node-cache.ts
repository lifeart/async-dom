import type { NodeId } from "./protocol.ts";
import { DOCUMENT_NODE_ID } from "./protocol.ts";

/**
 * Cache for mapping NodeIds to real DOM nodes on the main thread.
 * Supports both forward (NodeId → Node) and reverse (Node → NodeId) lookups.
 */
export class NodeCache {
	private cache = new Map<NodeId, Node>();
	private reverseCache = new WeakMap<Node, NodeId>();

	get(id: NodeId): Node | null {
		if (id === DOCUMENT_NODE_ID) return document as unknown as Node;

		return this.cache.get(id) ?? null;
	}

	/** Reverse lookup: get the NodeId for a real DOM node. */
	getId(node: Node): NodeId | null {
		return this.reverseCache.get(node) ?? null;
	}

	set(id: NodeId, node: Node): void {
		this.cache.set(id, node);
		this.reverseCache.set(node, id);
	}

	delete(id: NodeId): void {
		const node = this.cache.get(id);
		if (node) {
			this.reverseCache.delete(node);
		}
		this.cache.delete(id);
	}

	clear(): void {
		this.cache.clear();
		// WeakMap entries are GC'd automatically when nodes are collected
	}

	has(id: NodeId): boolean {
		return this.cache.has(id);
	}
}
