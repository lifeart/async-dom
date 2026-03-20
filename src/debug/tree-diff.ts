/**
 * Tree Diff — Feature 17
 *
 * Compares two virtual DOM tree snapshots and produces a diff
 * showing added, removed, and changed nodes.
 */

export interface TreeSnapshot {
	type: "element" | "text" | "comment";
	tag?: string;
	id?: number;
	className?: string;
	attributes?: Record<string, string>;
	text?: string;
	children?: TreeSnapshot[];
}

export type DiffType = "added" | "removed" | "changed" | "unchanged";

export interface TreeDiffNode {
	diffType: DiffType;
	node: TreeSnapshot;
	/** For 'changed' nodes, which fields changed */
	changes?: string[];
	children?: TreeDiffNode[];
}

/**
 * Deep-clone a tree snapshot for immutable storage.
 */
export function cloneSnapshot(node: TreeSnapshot): TreeSnapshot {
	const clone: TreeSnapshot = { type: node.type };
	if (node.tag !== undefined) clone.tag = node.tag;
	if (node.id !== undefined) clone.id = node.id;
	if (node.className !== undefined) clone.className = node.className;
	if (node.text !== undefined) clone.text = node.text;
	if (node.attributes) {
		clone.attributes = { ...node.attributes };
	}
	if (node.children) {
		clone.children = node.children.map(cloneSnapshot);
	}
	return clone;
}

/**
 * Compare two tree snapshots and produce a diff tree.
 */
export function diffTrees(
	oldTree: TreeSnapshot | null,
	newTree: TreeSnapshot | null,
): TreeDiffNode | null {
	if (!oldTree && !newTree) return null;

	if (!oldTree && newTree) {
		return markAdded(newTree);
	}

	if (oldTree && !newTree) {
		return markRemoved(oldTree);
	}

	// Both exist — compare
	return compareNodes(oldTree!, newTree!);
}

function markAdded(node: TreeSnapshot): TreeDiffNode {
	const result: TreeDiffNode = {
		diffType: "added",
		node,
	};
	if (node.children) {
		result.children = node.children.map(markAdded);
	}
	return result;
}

function markRemoved(node: TreeSnapshot): TreeDiffNode {
	const result: TreeDiffNode = {
		diffType: "removed",
		node,
	};
	if (node.children) {
		result.children = node.children.map(markRemoved);
	}
	return result;
}

function compareNodes(oldNode: TreeSnapshot, newNode: TreeSnapshot): TreeDiffNode {
	const changes: string[] = [];

	// Check type/tag mismatch — treat as remove + add
	if (oldNode.type !== newNode.type || oldNode.tag !== newNode.tag) {
		// Different node type — this subtree was replaced
		return {
			diffType: "changed",
			node: newNode,
			changes: ["replaced"],
			children: [markRemoved(oldNode), markAdded(newNode)],
		};
	}

	// Compare attributes
	if (oldNode.type === "element" && newNode.type === "element") {
		const oldAttrs = oldNode.attributes ?? {};
		const newAttrs = newNode.attributes ?? {};
		const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);
		for (const key of allKeys) {
			if (oldAttrs[key] !== newAttrs[key]) {
				changes.push(`attr:${key}`);
			}
		}
		if (oldNode.className !== newNode.className) {
			changes.push("className");
		}
	}

	// Compare text
	if (oldNode.text !== newNode.text) {
		changes.push("text");
	}

	// Compare children
	const oldChildren = oldNode.children ?? [];
	const newChildren = newNode.children ?? [];
	const diffChildren = diffChildArrays(oldChildren, newChildren);

	const diffType = changes.length > 0 ? "changed" : "unchanged";

	const result: TreeDiffNode = {
		diffType,
		node: newNode,
	};
	if (changes.length > 0) {
		result.changes = changes;
	}
	if (diffChildren.length > 0) {
		result.children = diffChildren;
	}
	return result;
}

/**
 * Diff two child arrays using node IDs for matching where possible.
 */
function diffChildArrays(oldChildren: TreeSnapshot[], newChildren: TreeSnapshot[]): TreeDiffNode[] {
	const result: TreeDiffNode[] = [];

	// Build index of old children by id for matching
	const oldById = new Map<number, { node: TreeSnapshot; used: boolean }>();
	const oldNoId: TreeSnapshot[] = [];
	for (const child of oldChildren) {
		if (child.id != null) {
			oldById.set(child.id, { node: child, used: false });
		} else {
			oldNoId.push(child);
		}
	}

	let noIdCursor = 0;

	for (const newChild of newChildren) {
		if (newChild.id != null) {
			const oldEntry = oldById.get(newChild.id);
			if (oldEntry) {
				oldEntry.used = true;
				result.push(compareNodes(oldEntry.node, newChild));
			} else {
				result.push(markAdded(newChild));
			}
		} else {
			// Try to match positionally with non-id old children
			if (noIdCursor < oldNoId.length) {
				result.push(compareNodes(oldNoId[noIdCursor], newChild));
				noIdCursor++;
			} else {
				result.push(markAdded(newChild));
			}
		}
	}

	// Old children with IDs that weren't matched
	for (const [, entry] of oldById) {
		if (!entry.used) {
			result.push(markRemoved(entry.node));
		}
	}

	// Remaining old non-id children
	for (let i = noIdCursor; i < oldNoId.length; i++) {
		result.push(markRemoved(oldNoId[i]));
	}

	return result;
}

/**
 * Check if a diff tree has any actual changes.
 */
export function hasChanges(diff: TreeDiffNode): boolean {
	if (diff.diffType !== "unchanged") return true;
	if (diff.children) {
		return diff.children.some(hasChanges);
	}
	return false;
}
