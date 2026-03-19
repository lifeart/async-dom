import { describe, expect, it } from "vitest";
import { QueryType, SyncChannel, SyncChannelHost } from "../../src/core/sync-channel.ts";

describe("SyncChannel", () => {
	it("creates channel with SharedArrayBuffer", () => {
		const { channel, buffer } = SyncChannel.create();
		expect(channel).toBeDefined();
		expect(buffer).toBeInstanceOf(SharedArrayBuffer);
		expect(buffer.byteLength).toBe(65536);
	});

	it("creates channel with custom size", () => {
		const { buffer } = SyncChannel.create(32768);
		expect(buffer.byteLength).toBe(32768);
	});

	it("creates channel from existing buffer", () => {
		const { buffer } = SyncChannel.create();
		const channel = SyncChannel.fromBuffer(buffer);
		expect(channel).toBeDefined();
	});

	it("host polls returns null when idle", () => {
		const { buffer } = SyncChannel.create();
		const host = new SyncChannelHost(buffer);
		expect(host.poll()).toBeNull();
	});

	it("round-trip: request and respond", () => {
		const { channel, buffer } = SyncChannel.create();
		const host = new SyncChannelHost(buffer);

		// Simulate: worker writes request, main thread polls and responds
		// We need to do this in the right order since we're single-threaded in tests

		// Use a timeout to respond after the request starts waiting
		// In single-threaded tests, Atomics.wait will timeout, so we set up the response first
		const signal = new Int32Array(buffer, 0, 4);

		// Manually write a response scenario:
		// 1. Worker writes request data
		const encoder = new TextEncoder();
		const decoder = new TextDecoder();
		const requestData = JSON.stringify({ nodeId: "test-1" });
		const requestBytes = encoder.encode(requestData);
		const requestRegion = new Uint8Array(buffer, 16, 4096);
		requestRegion.set(requestBytes);

		// 2. Set metadata
		Atomics.store(signal, 1, QueryType.BoundingRect);
		Atomics.store(signal, 2, requestBytes.byteLength);
		Atomics.store(signal, 0, 1); // SIGNAL_REQUEST

		// 3. Host polls and gets the query
		const query = host.poll();
		expect(query).not.toBeNull();
		expect(query?.queryType).toBe(QueryType.BoundingRect);
		expect(query?.data).toBe(requestData);

		// 4. Host responds
		const responseData = { top: 10, left: 20, width: 100, height: 50 };
		host.respond(responseData);

		// 5. Verify response was written
		const responseLength = Atomics.load(signal, 3);
		expect(responseLength).toBeGreaterThan(0);
		const responseRegion = new Uint8Array(buffer, 16 + 4096, buffer.byteLength - 16 - 4096);
		const responseStr = decoder.decode(responseRegion.slice(0, responseLength));
		expect(JSON.parse(responseStr)).toEqual(responseData);

		// 6. Signal should be SIGNAL_RESPONSE (2)
		expect(Atomics.load(signal, 0)).toBe(2);
	});

	it("host startPolling and stopPolling lifecycle", () => {
		const { buffer } = SyncChannel.create();
		const host = new SyncChannelHost(buffer);

		// Should not throw
		host.startPolling(() => ({ result: "ok" }));
		host.stopPolling();
	});

	it("request returns null when response times out", () => {
		const { channel } = SyncChannel.create(8192);
		// No host responding, so request will timeout
		const result = channel.request(QueryType.BoundingRect, JSON.stringify({ nodeId: "x" }));
		expect(result).toBeNull();
	});

	it("request returns null when data exceeds region size", () => {
		const { channel } = SyncChannel.create();
		// Create a string larger than REQUEST_REGION_SIZE (4096 bytes)
		const largeData = "x".repeat(5000);
		const result = channel.request(QueryType.BoundingRect, largeData);
		expect(result).toBeNull();
	});
});
