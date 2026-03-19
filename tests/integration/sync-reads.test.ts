import { describe, expect, it } from "vitest";
import { QueryType, SyncChannel, SyncChannelHost } from "../../src/core/sync-channel.ts";

describe("Sync Read Pipeline", () => {
	it("simulates full query round-trip via shared buffer", () => {
		const { buffer } = SyncChannel.create();
		const host = new SyncChannelHost(buffer);

		// Since we're single-threaded in tests, we can't use Atomics.wait
		// (it would block forever). Instead we test the buffer protocol directly.

		// Manually simulate what channel.request() does internally:
		const encoder = new TextEncoder();
		const decoder = new TextDecoder();
		const signal = new Int32Array(buffer, 0, 4);

		// 1. Write request (simulating worker side)
		const requestData = JSON.stringify({ nodeId: "test-node", property: "offsetWidth" });
		const requestBytes = encoder.encode(requestData);
		const requestRegion = new Uint8Array(buffer, 16, 4096);
		requestRegion.set(requestBytes);
		Atomics.store(signal, 1, QueryType.NodeProperty);
		Atomics.store(signal, 2, requestBytes.byteLength);
		Atomics.store(signal, 0, 1); // SIGNAL_REQUEST

		// 2. Host polls and reads request
		const query = host.poll();
		expect(query).not.toBeNull();
		expect(query?.queryType).toBe(QueryType.NodeProperty);
		const parsedData = JSON.parse(query?.data);
		expect(parsedData.nodeId).toBe("test-node");
		expect(parsedData.property).toBe("offsetWidth");

		// 3. Host responds with real value
		host.respond(320);

		// 4. Verify response is in buffer
		expect(Atomics.load(signal, 0)).toBe(2); // SIGNAL_RESPONSE
		const responseLength = Atomics.load(signal, 3);
		const responseRegion = new Uint8Array(buffer, 16 + 4096, buffer.byteLength - 16 - 4096);
		const responseStr = decoder.decode(responseRegion.slice(0, responseLength));
		expect(JSON.parse(responseStr)).toBe(320);
	});

	it("handles boundingRect query type", () => {
		const { buffer } = SyncChannel.create();
		const host = new SyncChannelHost(buffer);
		const signal = new Int32Array(buffer, 0, 4);
		const encoder = new TextEncoder();

		const requestData = JSON.stringify({ nodeId: "el-1" });
		const requestBytes = encoder.encode(requestData);
		new Uint8Array(buffer, 16, 4096).set(requestBytes);
		Atomics.store(signal, 1, QueryType.BoundingRect);
		Atomics.store(signal, 2, requestBytes.byteLength);
		Atomics.store(signal, 0, 1);

		const query = host.poll();
		expect(query?.queryType).toBe(QueryType.BoundingRect);

		const rect = { top: 10, left: 20, right: 120, bottom: 60, width: 100, height: 50 };
		host.respond(rect);

		const responseLength = Atomics.load(signal, 3);
		const responseRegion = new Uint8Array(buffer, 16 + 4096, buffer.byteLength - 16 - 4096);
		const decoder = new TextDecoder();
		const result = JSON.parse(decoder.decode(responseRegion.slice(0, responseLength)));
		expect(result).toEqual(rect);
	});

	it("handles computedStyle query type", () => {
		const { buffer } = SyncChannel.create();
		const host = new SyncChannelHost(buffer);
		const signal = new Int32Array(buffer, 0, 4);
		const encoder = new TextEncoder();

		const requestData = JSON.stringify({ nodeId: "el-2" });
		const requestBytes = encoder.encode(requestData);
		new Uint8Array(buffer, 16, 4096).set(requestBytes);
		Atomics.store(signal, 1, QueryType.ComputedStyle);
		Atomics.store(signal, 2, requestBytes.byteLength);
		Atomics.store(signal, 0, 1);

		const query = host.poll();
		expect(query?.queryType).toBe(QueryType.ComputedStyle);

		const styles = { color: "rgb(0, 0, 0)", display: "block", fontSize: "16px" };
		host.respond(styles);

		const responseLength = Atomics.load(signal, 3);
		const responseRegion = new Uint8Array(buffer, 16 + 4096, buffer.byteLength - 16 - 4096);
		const decoder = new TextDecoder();
		const result = JSON.parse(decoder.decode(responseRegion.slice(0, responseLength)));
		expect(result).toEqual(styles);
	});

	it("handles windowProperty query type", () => {
		const { buffer } = SyncChannel.create();
		const host = new SyncChannelHost(buffer);
		const signal = new Int32Array(buffer, 0, 4);
		const encoder = new TextEncoder();

		const requestData = JSON.stringify({ property: "innerWidth" });
		const requestBytes = encoder.encode(requestData);
		new Uint8Array(buffer, 16, 4096).set(requestBytes);
		Atomics.store(signal, 1, QueryType.WindowProperty);
		Atomics.store(signal, 2, requestBytes.byteLength);
		Atomics.store(signal, 0, 1);

		const query = host.poll();
		expect(query?.queryType).toBe(QueryType.WindowProperty);

		host.respond(1920);

		const responseLength = Atomics.load(signal, 3);
		const responseRegion = new Uint8Array(buffer, 16 + 4096, buffer.byteLength - 16 - 4096);
		const decoder = new TextDecoder();
		const result = JSON.parse(decoder.decode(responseRegion.slice(0, responseLength)));
		expect(result).toBe(1920);
	});

	it("host returns null when no request pending", () => {
		const { buffer } = SyncChannel.create();
		const host = new SyncChannelHost(buffer);
		expect(host.poll()).toBeNull();
	});
});
