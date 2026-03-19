import type { NodeId } from "./protocol.ts";

/**
 * Cache for mapping NodeIds to real DOM nodes on the main thread.
 */
export class NodeCache {
	private cache = new Map<NodeId, Node>();

	get(id: NodeId): Node | null {
		if (id === ("window" as NodeId)) return window as unknown as Node;
		if (id === ("document" as NodeId)) return document as unknown as Node;

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
