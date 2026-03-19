import { describe, expect, it } from "vitest";
import { StringStore } from "../../src/core/string-store.ts";

describe("StringStore", () => {
	it("store() returns an index for a new string", () => {
		const store = new StringStore();
		const idx = store.store("hello");
		expect(idx).toBe(0);
	});

	it("store() returns the same index for the same string", () => {
		const store = new StringStore();
		const idx1 = store.store("hello");
		const idx2 = store.store("hello");
		expect(idx1).toBe(idx2);
	});

	it("store() assigns monotonically increasing indices", () => {
		const store = new StringStore();
		expect(store.store("a")).toBe(0);
		expect(store.store("b")).toBe(1);
		expect(store.store("c")).toBe(2);
		expect(store.store("a")).toBe(0); // still 0
	});

	it("get() returns the correct string by index", () => {
		const store = new StringStore();
		store.store("foo");
		store.store("bar");
		expect(store.get(0)).toBe("foo");
		expect(store.get(1)).toBe("bar");
	});

	it("get() returns empty string for unknown index", () => {
		const store = new StringStore();
		expect(store.get(999)).toBe("");
	});

	it("consumePending() returns new strings and clears pending list", () => {
		const store = new StringStore();
		store.store("a");
		store.store("b");
		const pending1 = store.consumePending();
		expect(pending1).toEqual(["a", "b"]);

		// Second call returns empty since pending was consumed
		const pending2 = store.consumePending();
		expect(pending2).toEqual([]);

		// Storing an existing string does not add to pending
		store.store("a");
		expect(store.consumePending()).toEqual([]);

		// Storing a new string after consume adds to pending
		store.store("c");
		expect(store.consumePending()).toEqual(["c"]);
	});

	it("registerBulk() syncs strings from the other side", () => {
		const store = new StringStore();
		store.registerBulk(["x", "y", "z"]);
		expect(store.get(0)).toBe("x");
		expect(store.get(1)).toBe("y");
		expect(store.get(2)).toBe("z");
		expect(store.size).toBe(3);
	});

	it("registerBulk() does not track strings as pending", () => {
		const store = new StringStore();
		store.registerBulk(["x", "y"]);
		expect(store.consumePending()).toEqual([]);
	});

	it("registerBulk() skips already-known strings", () => {
		const store = new StringStore();
		store.store("a");
		store.registerBulk(["a", "b"]);
		expect(store.size).toBe(2);
		expect(store.get(0)).toBe("a");
		expect(store.get(1)).toBe("b");
	});

	it("round-trip: store on worker side, registerBulk on main side", () => {
		const workerStore = new StringStore();
		const mainStore = new StringStore();

		// Worker stores strings
		workerStore.store("div");
		workerStore.store("class");
		workerStore.store("container");
		workerStore.store("div"); // duplicate

		// Transfer pending strings to main
		const pending = workerStore.consumePending();
		expect(pending).toEqual(["div", "class", "container"]);

		mainStore.registerBulk(pending);

		// Both stores should resolve the same indices
		expect(mainStore.get(0)).toBe("div");
		expect(mainStore.get(1)).toBe("class");
		expect(mainStore.get(2)).toBe("container");
		expect(mainStore.size).toBe(workerStore.size);
	});

	it("size returns the number of stored strings", () => {
		const store = new StringStore();
		expect(store.size).toBe(0);
		store.store("a");
		expect(store.size).toBe(1);
		store.store("a"); // duplicate
		expect(store.size).toBe(1);
		store.store("b");
		expect(store.size).toBe(2);
	});

	it("handles empty strings", () => {
		const store = new StringStore();
		const idx = store.store("");
		expect(idx).toBe(0);
		expect(store.get(0)).toBe("");
	});

	it("handles unicode strings", () => {
		const store = new StringStore();
		store.store("\u{1F600}");
		store.store("\u4F60\u597D");
		expect(store.get(0)).toBe("\u{1F600}");
		expect(store.get(1)).toBe("\u4F60\u597D");
	});
});
