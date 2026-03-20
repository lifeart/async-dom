import { describe, expect, it } from "vitest";
import {
	cloneSnapshot,
	diffTrees,
	hasChanges,
	type TreeSnapshot,
} from "../../src/debug/tree-diff.ts";

describe("cloneSnapshot", () => {
	it("produces a deep copy", () => {
		const original: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			id: 10,
			className: "container",
			attributes: { "data-x": "1" },
			children: [
				{ type: "text", text: "hello" },
				{
					type: "element",
					tag: "SPAN",
					id: 20,
					attributes: { class: "inner" },
					children: [],
				},
			],
		};

		const clone = cloneSnapshot(original);

		// Should be structurally equal
		expect(clone).toEqual(original);

		// But not the same reference
		expect(clone).not.toBe(original);
		expect(clone.attributes).not.toBe(original.attributes);
		expect(clone.children).not.toBe(original.children);
		expect(clone.children![1]).not.toBe(original.children![1]);

		// Mutating the clone should not affect the original
		clone.attributes!["data-x"] = "modified";
		expect(original.attributes!["data-x"]).toBe("1");
	});

	it("handles nodes with no optional fields", () => {
		const original: TreeSnapshot = { type: "text" };
		const clone = cloneSnapshot(original);
		expect(clone).toEqual(original);
		expect(clone).not.toBe(original);
	});
});

describe("diffTrees", () => {
	it("returns null for two nulls", () => {
		expect(diffTrees(null, null)).toBeNull();
	});

	it("detects added nodes", () => {
		const newNode: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			id: 10,
			children: [{ type: "text", text: "hello" }],
		};

		const diff = diffTrees(null, newNode);
		expect(diff).not.toBeNull();
		expect(diff!.diffType).toBe("added");
		expect(diff!.node).toBe(newNode);
		expect(diff!.children).toHaveLength(1);
		expect(diff!.children![0].diffType).toBe("added");
	});

	it("detects removed nodes", () => {
		const oldNode: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			id: 10,
			children: [{ type: "text", text: "bye" }],
		};

		const diff = diffTrees(oldNode, null);
		expect(diff).not.toBeNull();
		expect(diff!.diffType).toBe("removed");
		expect(diff!.node).toBe(oldNode);
		expect(diff!.children).toHaveLength(1);
		expect(diff!.children![0].diffType).toBe("removed");
	});

	it("detects changed attributes", () => {
		const oldTree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			id: 10,
			attributes: { class: "old", "data-x": "1" },
		};
		const newTree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			id: 10,
			attributes: { class: "new", "data-x": "1" },
		};

		const diff = diffTrees(oldTree, newTree);
		expect(diff).not.toBeNull();
		expect(diff!.diffType).toBe("changed");
		expect(diff!.changes).toContain("attr:class");
		expect(diff!.changes).not.toContain("attr:data-x");
	});

	it("detects changed className", () => {
		const oldTree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			id: 10,
			className: "old",
		};
		const newTree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			id: 10,
			className: "new",
		};

		const diff = diffTrees(oldTree, newTree);
		expect(diff!.diffType).toBe("changed");
		expect(diff!.changes).toContain("className");
	});

	it("detects changed text content", () => {
		const oldTree: TreeSnapshot = { type: "text", text: "old" };
		const newTree: TreeSnapshot = { type: "text", text: "new" };

		const diff = diffTrees(oldTree, newTree);
		expect(diff!.diffType).toBe("changed");
		expect(diff!.changes).toContain("text");
	});

	it("returns unchanged for identical trees", () => {
		const tree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			id: 10,
			attributes: { class: "same" },
			children: [{ type: "text", text: "hello" }],
		};

		const diff = diffTrees(tree, { ...tree, attributes: { class: "same" } });
		expect(diff!.diffType).toBe("unchanged");
	});

	it("handles replaced node (different type/tag)", () => {
		const oldTree: TreeSnapshot = { type: "element", tag: "DIV", id: 10 };
		const newTree: TreeSnapshot = { type: "element", tag: "SPAN", id: 10 };

		const diff = diffTrees(oldTree, newTree);
		expect(diff!.diffType).toBe("changed");
		expect(diff!.changes).toContain("replaced");
		// Should have old (removed) and new (added) as children
		expect(diff!.children).toHaveLength(2);
		expect(diff!.children![0].diffType).toBe("removed");
		expect(diff!.children![1].diffType).toBe("added");
	});

	it("detects added children by id matching", () => {
		const oldTree: TreeSnapshot = {
			type: "element",
			tag: "UL",
			children: [{ type: "element", tag: "LI", id: 1 }],
		};
		const newTree: TreeSnapshot = {
			type: "element",
			tag: "UL",
			children: [
				{ type: "element", tag: "LI", id: 1 },
				{ type: "element", tag: "LI", id: 2 },
			],
		};

		const diff = diffTrees(oldTree, newTree);
		expect(diff!.children).toHaveLength(2);
		expect(diff!.children![0].diffType).toBe("unchanged");
		expect(diff!.children![1].diffType).toBe("added");
	});

	it("detects removed children by id matching", () => {
		const oldTree: TreeSnapshot = {
			type: "element",
			tag: "UL",
			children: [
				{ type: "element", tag: "LI", id: 1 },
				{ type: "element", tag: "LI", id: 2 },
			],
		};
		const newTree: TreeSnapshot = {
			type: "element",
			tag: "UL",
			children: [{ type: "element", tag: "LI", id: 1 }],
		};

		const diff = diffTrees(oldTree, newTree);
		const removed = diff!.children!.filter((c) => c.diffType === "removed");
		expect(removed).toHaveLength(1);
		expect(removed[0].node.id).toBe(2);
	});

	it("detects added attribute keys", () => {
		const oldTree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			attributes: {},
		};
		const newTree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			attributes: { "data-new": "val" },
		};

		const diff = diffTrees(oldTree, newTree);
		expect(diff!.diffType).toBe("changed");
		expect(diff!.changes).toContain("attr:data-new");
	});
});

describe("hasChanges", () => {
	it("returns false for identical trees", () => {
		const tree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			children: [{ type: "text", text: "same" }],
		};

		const diff = diffTrees(tree, { ...tree, children: [{ type: "text", text: "same" }] });
		expect(diff).not.toBeNull();
		expect(hasChanges(diff!)).toBe(false);
	});

	it("returns true when a child has changed", () => {
		const oldTree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			children: [{ type: "text", text: "old" }],
		};
		const newTree: TreeSnapshot = {
			type: "element",
			tag: "DIV",
			children: [{ type: "text", text: "new" }],
		};

		const diff = diffTrees(oldTree, newTree);
		expect(hasChanges(diff!)).toBe(true);
	});

	it("returns true for an added node", () => {
		const diff = diffTrees(null, { type: "element", tag: "DIV" });
		expect(hasChanges(diff!)).toBe(true);
	});

	it("returns true for a removed node", () => {
		const diff = diffTrees({ type: "element", tag: "DIV" }, null);
		expect(hasChanges(diff!)).toBe(true);
	});
});
