import { describe, expect, it } from "vitest";
import { createAppId, createNodeId } from "../../src/core/protocol.ts";
import { MutationCollector } from "../../src/worker-thread/mutation-collector.ts";
import { createStyleProxy, toKebabCase } from "../../src/worker-thread/style-proxy.ts";

describe("toKebabCase", () => {
	it("converts camelCase to kebab-case", () => {
		expect(toKebabCase("backgroundColor")).toBe("background-color");
		expect(toKebabCase("borderTopWidth")).toBe("border-top-width");
		expect(toKebabCase("color")).toBe("color");
	});

	it("caches results", () => {
		const a = toKebabCase("fontSize");
		const b = toKebabCase("fontSize");
		expect(a).toBe(b);
		expect(a).toBe("font-size");
	});
});

describe("createStyleProxy", () => {
	it("emits setStyle mutations on property set", () => {
		const collector = new MutationCollector(createAppId("test"));
		const id = createNodeId();
		const style = createStyleProxy({ _nodeId: id }, collector);

		style.backgroundColor = "red";

		expect(collector.pendingCount).toBe(1);
	});

	it("reads properties in kebab-case", () => {
		const collector = new MutationCollector(createAppId("test"));
		const id = createNodeId();
		const style = createStyleProxy({ _nodeId: id }, collector, { "background-color": "blue" });

		expect(style.backgroundColor).toBe("blue");
		expect(style["background-color"]).toBe("blue");
	});

	it("returns empty string for unset properties", () => {
		const collector = new MutationCollector(createAppId("test"));
		const id = createNodeId();
		const style = createStyleProxy({ _nodeId: id }, collector);

		expect(style.color).toBe("");
	});
});
