import { describe, expect, it } from "vitest";
import { QueryType } from "../../src/core/sync-channel.ts";
import { ScopedStorage } from "../../src/worker-thread/storage.ts";

describe("ScopedStorage", () => {
	function createStorage(
		prefix = "test_",
		storageType: "localStorage" | "sessionStorage" = "localStorage",
	) {
		return new ScopedStorage(prefix, storageType, () => null, QueryType.WindowProperty);
	}

	it("setItem and getItem round-trip", () => {
		const storage = createStorage();
		storage.setItem("key1", "value1");
		expect(storage.getItem("key1")).toBe("value1");
	});

	it("getItem returns null for missing keys", () => {
		const storage = createStorage();
		expect(storage.getItem("nonexistent")).toBeNull();
	});

	it("setItem converts value to string", () => {
		const storage = createStorage();
		// The Storage spec requires values to be strings
		storage.setItem("num", "42");
		expect(storage.getItem("num")).toBe("42");
	});

	it("removeItem removes a key", () => {
		const storage = createStorage();
		storage.setItem("key1", "value1");
		storage.removeItem("key1");
		expect(storage.getItem("key1")).toBeNull();
	});

	it("removeItem is a no-op for missing keys", () => {
		const storage = createStorage();
		// Should not throw
		storage.removeItem("nonexistent");
		expect(storage.length).toBe(0);
	});

	it("clear removes all keys", () => {
		const storage = createStorage();
		storage.setItem("a", "1");
		storage.setItem("b", "2");
		storage.setItem("c", "3");
		storage.clear();
		expect(storage.length).toBe(0);
		expect(storage.getItem("a")).toBeNull();
		expect(storage.getItem("b")).toBeNull();
		expect(storage.getItem("c")).toBeNull();
	});

	it("length reflects the number of stored items", () => {
		const storage = createStorage();
		expect(storage.length).toBe(0);
		storage.setItem("a", "1");
		expect(storage.length).toBe(1);
		storage.setItem("b", "2");
		expect(storage.length).toBe(2);
		storage.removeItem("a");
		expect(storage.length).toBe(1);
	});

	it("key() returns the key at a given index", () => {
		const storage = createStorage();
		storage.setItem("alpha", "1");
		storage.setItem("beta", "2");
		storage.setItem("gamma", "3");
		// Map preserves insertion order
		expect(storage.key(0)).toBe("alpha");
		expect(storage.key(1)).toBe("beta");
		expect(storage.key(2)).toBe("gamma");
	});

	it("key() returns null for out-of-range index", () => {
		const storage = createStorage();
		storage.setItem("a", "1");
		expect(storage.key(1)).toBeNull();
		expect(storage.key(-1)).toBeNull();
	});

	it("setItem overwrites existing values", () => {
		const storage = createStorage();
		storage.setItem("key", "old");
		storage.setItem("key", "new");
		expect(storage.getItem("key")).toBe("new");
		expect(storage.length).toBe(1);
	});

	describe("prefix isolation", () => {
		it("two storages with different prefixes do not see each other's data", () => {
			const storageA = createStorage("app_a_");
			const storageB = createStorage("app_b_");

			storageA.setItem("shared_key", "from_a");
			storageB.setItem("shared_key", "from_b");

			expect(storageA.getItem("shared_key")).toBe("from_a");
			expect(storageB.getItem("shared_key")).toBe("from_b");
		});

		it("clear on one storage does not affect another", () => {
			const storageA = createStorage("app_a_");
			const storageB = createStorage("app_b_");

			storageA.setItem("key", "value_a");
			storageB.setItem("key", "value_b");

			storageA.clear();

			expect(storageA.length).toBe(0);
			expect(storageA.getItem("key")).toBeNull();
			expect(storageB.getItem("key")).toBe("value_b");
			expect(storageB.length).toBe(1);
		});
	});

	describe("sync channel interaction", () => {
		it("calls sync channel on setItem when available", () => {
			const calls: Array<{ queryType: QueryType; data: string }> = [];
			const mockChannel = {
				request(queryType: QueryType, data: string) {
					calls.push({ queryType, data });
					return null;
				},
			};
			const storage = new ScopedStorage(
				"test_",
				"localStorage",
				() => mockChannel as never,
				QueryType.WindowProperty,
			);

			storage.setItem("foo", "bar");

			expect(calls).toHaveLength(1);
			const parsed = JSON.parse(calls[0].data);
			expect(parsed.property).toBe("localStorage.setItem");
			expect(parsed.args).toEqual(["test_foo", "bar"]);
		});

		it("calls sync channel on removeItem when available", () => {
			const calls: Array<{ queryType: QueryType; data: string }> = [];
			const mockChannel = {
				request(queryType: QueryType, data: string) {
					calls.push({ queryType, data });
					return null;
				},
			};
			const storage = new ScopedStorage(
				"pfx_",
				"localStorage",
				() => mockChannel as never,
				QueryType.WindowProperty,
			);

			storage.setItem("key", "val");
			storage.removeItem("key");

			expect(calls).toHaveLength(2);
			const parsed = JSON.parse(calls[1].data);
			expect(parsed.property).toBe("localStorage.removeItem");
			expect(parsed.args).toEqual(["pfx_key"]);
		});

		it("falls back to cache when sync channel returns non-string for getItem", () => {
			const mockChannel = {
				request() {
					return null; // Simulate no value in real storage
				},
			};
			const storage = new ScopedStorage(
				"test_",
				"localStorage",
				() => mockChannel as never,
				QueryType.WindowProperty,
			);

			// No value in cache or sync channel
			expect(storage.getItem("missing")).toBeNull();

			// Value set locally should be found in cache
			storage.setItem("local", "cached");
			expect(storage.getItem("local")).toBe("cached");
		});

		it("caches values fetched from sync channel", () => {
			let callCount = 0;
			const mockChannel = {
				request() {
					callCount++;
					return "remote_value";
				},
			};
			const storage = new ScopedStorage(
				"test_",
				"localStorage",
				() => mockChannel as never,
				QueryType.WindowProperty,
			);

			// First call goes to sync channel
			expect(storage.getItem("key")).toBe("remote_value");
			expect(callCount).toBe(1);

			// Second call should use cache
			expect(storage.getItem("key")).toBe("remote_value");
			expect(callCount).toBe(1);
		});

		it("does not call sync channel request when getter returns null", () => {
			const requestCalled = false;
			const storage = new ScopedStorage(
				"test_",
				"localStorage",
				() => null, // No sync channel available
				QueryType.WindowProperty,
			);

			storage.setItem("key", "value");
			expect(requestCalled).toBe(false);
			// Value should still be stored in local cache
			expect(storage.getItem("key")).toBe("value");
		});

		it("clear calls removeItem on sync channel for each cached key", () => {
			const calls: string[] = [];
			const mockChannel = {
				request(_queryType: QueryType, data: string) {
					calls.push(data);
					return null;
				},
			};
			const storage = new ScopedStorage(
				"p_",
				"localStorage",
				() => mockChannel as never,
				QueryType.WindowProperty,
			);

			storage.setItem("a", "1");
			storage.setItem("b", "2");
			calls.length = 0; // Reset calls from setItem

			storage.clear();

			expect(calls).toHaveLength(2);
			const methods = calls.map((c) => JSON.parse(c).property);
			expect(methods).toEqual(["localStorage.removeItem", "localStorage.removeItem"]);
		});
	});
});
