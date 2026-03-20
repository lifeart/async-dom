import { describe, expect, it, vi } from "vitest";
import { createApiBridge, type BridgeConfig } from "../../src/core/api-bridge.ts";
import { QueryType } from "../../src/core/sync-channel.ts";
import type { NodeId } from "../../src/core/protocol.ts";

function nid(n: number): NodeId {
	return n as NodeId;
}

function createMockCollector() {
	const mutations: unknown[] = [];
	return {
		add(mutation: unknown) {
			mutations.push(mutation);
		},
		mutations,
	};
}

function createMockSyncChannel(returnValue: unknown = null) {
	return {
		request: vi.fn().mockReturnValue(returnValue),
	};
}

const AUDIO_CONFIG: BridgeConfig = {
	apiName: "AudioContext",
	fireMethods: ["start", "stop", "connect"],
	syncMethods: ["getFrequencyData", "analyzeBuffer"],
	properties: ["sampleRate", "state", "destination"],
};

const CANVAS_CONFIG: BridgeConfig = {
	apiName: "CanvasRenderingContext2D",
	fireMethods: ["fillRect", "clearRect", "beginPath", "stroke", "fill"],
	syncMethods: ["getImageData", "measureText"],
	properties: ["fillStyle", "strokeStyle", "lineWidth", "font"],
};

describe("createApiBridge", () => {
	describe("fire-and-forget methods", () => {
		it("calling a fire method adds a callMethod mutation to collector", () => {
			const collector = createMockCollector();
			const nodeId = nid(42);
			const bridge = createApiBridge(AUDIO_CONFIG, nodeId, null, collector);

			(bridge.start as (...args: unknown[]) => void)();

			expect(collector.mutations).toHaveLength(1);
			expect(collector.mutations[0]).toEqual({
				action: "callMethod",
				id: nodeId,
				method: "AudioContext.start",
				args: [],
			});
		});

		it("passes arguments to the callMethod mutation", () => {
			const collector = createMockCollector();
			const nodeId = nid(10);
			const bridge = createApiBridge(CANVAS_CONFIG, nodeId, null, collector);

			(bridge.fillRect as (...args: unknown[]) => void)(0, 0, 100, 50);

			expect(collector.mutations[0]).toEqual({
				action: "callMethod",
				id: nodeId,
				method: "CanvasRenderingContext2D.fillRect",
				args: [0, 0, 100, 50],
			});
		});

		it("namespaces the method name with the apiName", () => {
			const collector = createMockCollector();
			const bridge = createApiBridge(CANVAS_CONFIG, nid(1), null, collector);

			(bridge.clearRect as (...args: unknown[]) => void)(0, 0, 200, 100);

			const mutation = collector.mutations[0] as { method: string };
			expect(mutation.method).toBe("CanvasRenderingContext2D.clearRect");
		});

		it("accumulates multiple fire method calls in collector", () => {
			const collector = createMockCollector();
			const nodeId = nid(7);
			const bridge = createApiBridge(CANVAS_CONFIG, nodeId, null, collector);

			(bridge.beginPath as () => void)();
			(bridge.stroke as () => void)();
			(bridge.fill as () => void)();

			expect(collector.mutations).toHaveLength(3);
			expect((collector.mutations[0] as { method: string }).method).toBe(
				"CanvasRenderingContext2D.beginPath",
			);
			expect((collector.mutations[1] as { method: string }).method).toBe(
				"CanvasRenderingContext2D.stroke",
			);
			expect((collector.mutations[2] as { method: string }).method).toBe(
				"CanvasRenderingContext2D.fill",
			);
		});

		it("does not require a sync channel for fire methods", () => {
			const collector = createMockCollector();
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), null, collector);

			// null syncChannel — should not throw
			expect(() => (bridge.stop as () => void)()).not.toThrow();
		});
	});

	describe("sync methods", () => {
		it("calls syncChannel.request with NodeProperty query type", () => {
			const nodeId = nid(99);
			const syncChannel = createMockSyncChannel({ data: [1, 2, 3] });
			const bridge = createApiBridge(AUDIO_CONFIG, nodeId, syncChannel, createMockCollector());

			(bridge.getFrequencyData as () => void)();

			expect(syncChannel.request).toHaveBeenCalledWith(
				QueryType.NodeProperty,
				expect.any(String),
			);
		});

		it("encodes nodeId, property name and args in the request payload", () => {
			const nodeId = nid(55);
			const syncChannel = createMockSyncChannel(null);
			const bridge = createApiBridge(AUDIO_CONFIG, nodeId, syncChannel, createMockCollector());

			(bridge.analyzeBuffer as (...args: unknown[]) => void)(1024, "blackman");

			const callArgs = syncChannel.request.mock.calls[0];
			const payload = JSON.parse(callArgs[1] as string) as {
				nodeId: number;
				property: string;
				args: unknown[];
			};

			expect(payload.nodeId).toBe(nodeId);
			expect(payload.property).toBe("AudioContext.analyzeBuffer");
			expect(payload.args).toEqual([1024, "blackman"]);
		});

		it("returns the value from syncChannel.request", () => {
			const expectedResult = { width: 42, fontBoundingBoxAscent: 10 };
			const syncChannel = createMockSyncChannel(expectedResult);
			const bridge = createApiBridge(CANVAS_CONFIG, nid(3), syncChannel, createMockCollector());

			const result = (bridge.measureText as (text: string) => unknown)("Hello");

			expect(result).toEqual(expectedResult);
		});

		it("returns null when syncChannel is not provided", () => {
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), null, createMockCollector());

			const result = (bridge.getFrequencyData as () => unknown)();

			expect(result).toBeNull();
		});

		it("does not add mutations to collector when calling sync methods", () => {
			const collector = createMockCollector();
			const syncChannel = createMockSyncChannel("ok");
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), syncChannel, collector);

			(bridge.getFrequencyData as () => void)();

			expect(collector.mutations).toHaveLength(0);
		});
	});

	describe("property access", () => {
		it("returns undefined for an unconfigured property before any set", () => {
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), null, createMockCollector());

			// sampleRate is in properties list but never set — should return undefined initially
			expect(bridge.sampleRate).toBeUndefined();
		});

		it("stores a set property value and returns it on get", () => {
			const collector = createMockCollector();
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), null, collector);

			(bridge as Record<string, unknown>).sampleRate = 44100;

			expect(bridge.sampleRate).toBe(44100);
		});

		it("emits a setProperty mutation when a property is set", () => {
			const collector = createMockCollector();
			const nodeId = nid(20);
			const bridge = createApiBridge(CANVAS_CONFIG, nodeId, null, collector);

			(bridge as Record<string, unknown>).fillStyle = "#ff0000";

			expect(collector.mutations).toHaveLength(1);
			expect(collector.mutations[0]).toEqual({
				action: "setProperty",
				id: nodeId,
				property: "CanvasRenderingContext2D.fillStyle",
				value: "#ff0000",
			});
		});

		it("namespaces the property name with apiName in setProperty mutation", () => {
			const collector = createMockCollector();
			const bridge = createApiBridge(CANVAS_CONFIG, nid(2), null, collector);

			(bridge as Record<string, unknown>).lineWidth = 3;

			const mutation = collector.mutations[0] as { property: string };
			expect(mutation.property).toBe("CanvasRenderingContext2D.lineWidth");
		});

		it("setting a property multiple times updates the cached value and emits per-set mutations", () => {
			const collector = createMockCollector();
			const bridge = createApiBridge(CANVAS_CONFIG, nid(3), null, collector);

			(bridge as Record<string, unknown>).fillStyle = "red";
			(bridge as Record<string, unknown>).fillStyle = "blue";

			// Cache holds the latest value
			expect(bridge.fillStyle).toBe("blue");
			// Two separate mutations emitted
			expect(collector.mutations).toHaveLength(2);
		});

		it("does not emit a mutation when setting an unknown property", () => {
			const collector = createMockCollector();
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), null, collector);

			(bridge as Record<string, unknown>).unknownProp = "value";

			expect(collector.mutations).toHaveLength(0);
		});

		it("does not return unknown properties", () => {
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), null, createMockCollector());

			expect(bridge.unknownProp).toBeUndefined();
		});
	});

	describe("symbol key access", () => {
		it("returns undefined for symbol property gets", () => {
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), null, createMockCollector());

			const sym = Symbol("test");
			expect(bridge[sym as unknown as string]).toBeUndefined();
		});

		it("silently ignores symbol property sets", () => {
			const collector = createMockCollector();
			const bridge = createApiBridge(AUDIO_CONFIG, nid(1), null, collector);

			const sym = Symbol("test");
			expect(() => {
				(bridge as unknown as Record<symbol, unknown>)[sym] = "value";
			}).not.toThrow();

			expect(collector.mutations).toHaveLength(0);
		});
	});

	describe("method/property precedence", () => {
		it("fire methods take precedence over properties of the same name", () => {
			const config: BridgeConfig = {
				apiName: "TestApi",
				fireMethods: ["overlap"],
				syncMethods: [],
				properties: ["overlap"],
			};
			const collector = createMockCollector();
			const bridge = createApiBridge(config, nid(1), null, collector);

			// Should be treated as a fire method (returns a function)
			expect(typeof bridge.overlap).toBe("function");
		});

		it("sync methods take precedence over properties of the same name", () => {
			const syncChannel = createMockSyncChannel("result");
			const config: BridgeConfig = {
				apiName: "TestApi",
				fireMethods: [],
				syncMethods: ["overlap"],
				properties: ["overlap"],
			};
			const bridge = createApiBridge(config, nid(1), syncChannel, createMockCollector());

			// Should be treated as a sync method (returns a function)
			expect(typeof bridge.overlap).toBe("function");
		});
	});

	describe("nodeId propagation", () => {
		it("embeds nodeId in fire method mutations", () => {
			const collector = createMockCollector();
			const nodeId = nid(777);
			const bridge = createApiBridge(CANVAS_CONFIG, nodeId, null, collector);

			(bridge.fillRect as (...args: unknown[]) => void)(10, 10, 50, 50);

			expect((collector.mutations[0] as { id: NodeId }).id).toBe(nodeId);
		});

		it("embeds nodeId in setProperty mutations", () => {
			const collector = createMockCollector();
			const nodeId = nid(888);
			const bridge = createApiBridge(CANVAS_CONFIG, nodeId, null, collector);

			(bridge as Record<string, unknown>).fillStyle = "green";

			expect((collector.mutations[0] as { id: NodeId }).id).toBe(nodeId);
		});

		it("embeds nodeId in sync method request payload", () => {
			const nodeId = nid(999);
			const syncChannel = createMockSyncChannel(null);
			const bridge = createApiBridge(AUDIO_CONFIG, nodeId, syncChannel, createMockCollector());

			(bridge.getFrequencyData as () => void)();

			const payload = JSON.parse(syncChannel.request.mock.calls[0][1] as string) as {
				nodeId: number;
			};
			expect(payload.nodeId).toBe(nodeId);
		});
	});
});
