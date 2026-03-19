import type { NodeId } from "./protocol.ts";
import { DOCUMENT_NODE_ID } from "./protocol.ts";

/**
 * Cache for mapping NodeIds to real DOM nodes on the main thread.
 */
export class NodeCache {
	private cache = new Map<NodeId, Node>();

	get(id: NodeId): Node | null {
		if (id === DOCUMENT_NODE_ID) return document as unknown as Node;

		return this.cache.get(id) ?? null;
	}

	set(id: NodeId, node: Node): void {
		this.cache.set(id, node);
	}

	delete(id: NodeId): void {
		this.cache.delete(id);
	}

	clear(): void {
		this.cache.clear();
	}

	has(id: NodeId): boolean {
		return this.cache.has(id);
	}
}
