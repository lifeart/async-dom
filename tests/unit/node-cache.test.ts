import { beforeEach, describe, expect, it } from "vitest";
import { NodeCache } from "../../src/core/node-cache.ts";
import { createNodeId } from "../../src/core/protocol.ts";

describe("NodeCache", () => {
	let cache: NodeCache;

	beforeEach(() => {
		cache = new NodeCache();
	});

	it("get() with 'window' returns window", () => {
		const result = cache.get("window" as ReturnType<typeof createNodeId>);
		expect(result).toBe(window);
	});

	it("get() with 'document' returns document", () => {
		const result = cache.get("document" as ReturnType<typeof createNodeId>);
		expect(result).toBe(document);
	});

	it("get() returns null for unknown id (no getElementById fallback)", () => {
		const div = document.createElement("div");
		div.id = "fallback-test";
		document.body.appendChild(div);

		// Should NOT fall back to getElementById — unmanaged nodes stay invisible
		const result = cache.get(createNodeId("fallback-test"));
		expect(result).toBeNull();
		expect(cache.has(createNodeId("fallback-test"))).toBe(false);

		div.remove();
	});

	it("get() returns null for completely nonexistent id", () => {
		const result = cache.get(createNodeId("nonexistent-id"));
		expect(result).toBeNull();
	});

	it("set() and get() round-trip", () => {
		const node = document.createElement("span");
		const id = createNodeId("round-trip");
		cache.set(id, node);
		expect(cache.get(id)).toBe(node);
	});

	it("delete() removes from cache", () => {
		const node = document.createElement("span");
		const id = createNodeId("delete-test");
		cache.set(id, node);
		expect(cache.has(id)).toBe(true);
		cache.delete(id);
		expect(cache.has(id)).toBe(false);
	});

	it("clear() empties the cache", () => {
		cache.set(createNodeId("a"), document.createElement("div"));
		cache.set(createNodeId("b"), document.createElement("div"));
		expect(cache.has(createNodeId("a"))).toBe(true);
		cache.clear();
		expect(cache.has(createNodeId("a"))).toBe(false);
		expect(cache.has(createNodeId("b"))).toBe(false);
	});

	it("has() returns correct boolean", () => {
		const id = createNodeId("has-test");
		expect(cache.has(id)).toBe(false);
		cache.set(id, document.createElement("div"));
		expect(cache.has(id)).toBe(true);
	});
});
