import { beforeEach, describe, expect, it } from "vitest";
import { NodeCache } from "../../src/core/node-cache.ts";
import { createNodeId, DOCUMENT_NODE_ID } from "../../src/core/protocol.ts";

describe("NodeCache", () => {
	let cache: NodeCache;

	beforeEach(() => {
		cache = new NodeCache();
	});

	it("get() with DOCUMENT_NODE_ID returns document", () => {
		const result = cache.get(DOCUMENT_NODE_ID);
		expect(result).toBe(document);
	});

	it("get() returns null for unknown id (no getElementById fallback)", () => {
		const div = document.createElement("div");
		div.id = "fallback-test";
		document.body.appendChild(div);

		// Should NOT fall back to getElementById — unmanaged nodes stay invisible
		const id = createNodeId();
		const result = cache.get(id);
		expect(result).toBeNull();
		expect(cache.has(id)).toBe(false);

		div.remove();
	});

	it("get() returns null for completely nonexistent id", () => {
		const result = cache.get(createNodeId());
		expect(result).toBeNull();
	});

	it("set() and get() round-trip", () => {
		const node = document.createElement("span");
		const id = createNodeId();
		cache.set(id, node);
		expect(cache.get(id)).toBe(node);
	});

	it("delete() removes from cache", () => {
		const node = document.createElement("span");
		const id = createNodeId();
		cache.set(id, node);
		expect(cache.has(id)).toBe(true);
		cache.delete(id);
		expect(cache.has(id)).toBe(false);
	});

	it("clear() empties the cache", () => {
		const idA = createNodeId();
		const idB = createNodeId();
		cache.set(idA, document.createElement("div"));
		cache.set(idB, document.createElement("div"));
		expect(cache.has(idA)).toBe(true);
		cache.clear();
		expect(cache.has(idA)).toBe(false);
		expect(cache.has(idB)).toBe(false);
	});

	it("has() returns correct boolean", () => {
		const id = createNodeId();
		expect(cache.has(id)).toBe(false);
		cache.set(id, document.createElement("div"));
		expect(cache.has(id)).toBe(true);
	});
});
