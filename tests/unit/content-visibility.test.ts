import { beforeEach, describe, expect, it } from "vitest";
import { NodeCache } from "../../src/core/node-cache.ts";
import { BODY_NODE_ID, createNodeId } from "../../src/core/protocol.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";

describe("content-visibility integration", () => {
	let renderer: DomRenderer;
	let nodeCache: NodeCache;
	let mountPoint: HTMLDivElement;

	beforeEach(() => {
		document.body.innerHTML = "";
		mountPoint = document.createElement("div");
		document.body.appendChild(mountPoint);

		nodeCache = new NodeCache();
		renderer = new DomRenderer(nodeCache, undefined, {
			body: mountPoint,
			head: document.head,
			html: document.documentElement,
		});
		// Seed the mount point as BODY so appendChild targets it
		nodeCache.set(BODY_NODE_ID, mountPoint);
	});

	it("does not apply content-visibility when disabled (default)", () => {
		const divId = createNodeId();
		renderer.apply({ action: "createNode", id: divId, tag: "div" });
		renderer.apply({ action: "appendChild", id: BODY_NODE_ID, childId: divId });

		const div = renderer.getNode(divId) as HTMLElement;
		expect(div.style.contentVisibility).toBe("");
	});

	it("applies content-visibility: auto to top-level block elements when enabled", () => {
		renderer.setContentVisibility({ enabled: true, intrinsicSize: "auto 500px" });

		const divId = createNodeId();
		renderer.apply({ action: "createNode", id: divId, tag: "div" });
		renderer.apply({ action: "appendChild", id: BODY_NODE_ID, childId: divId });

		const div = renderer.getNode(divId) as HTMLElement;
		expect(div.style.contentVisibility).toBe("auto");
		expect(div.style.containIntrinsicSize).toBe("auto 500px");
	});

	it("uses a custom intrinsic size", () => {
		renderer.setContentVisibility({ enabled: true, intrinsicSize: "auto 200px" });

		const sectionId = createNodeId();
		renderer.apply({ action: "createNode", id: sectionId, tag: "section" });
		renderer.apply({ action: "appendChild", id: BODY_NODE_ID, childId: sectionId });

		const section = renderer.getNode(sectionId) as HTMLElement;
		expect(section.style.contentVisibility).toBe("auto");
		expect(section.style.containIntrinsicSize).toBe("auto 200px");
	});

	it("skips inline elements", () => {
		renderer.setContentVisibility({ enabled: true, intrinsicSize: "auto 500px" });

		const spanId = createNodeId();
		renderer.apply({ action: "createNode", id: spanId, tag: "span" });
		renderer.apply({ action: "appendChild", id: BODY_NODE_ID, childId: spanId });

		const span = renderer.getNode(spanId) as HTMLElement;
		expect(span.style.contentVisibility).toBe("");
	});

	it("skips text nodes", () => {
		renderer.setContentVisibility({ enabled: true, intrinsicSize: "auto 500px" });

		const textId = createNodeId();
		renderer.apply({ action: "createNode", id: textId, tag: "#text", textContent: "hello" });
		renderer.apply({ action: "appendChild", id: BODY_NODE_ID, childId: textId });

		// Text nodes don't have style — just verify no error is thrown
		const text = renderer.getNode(textId);
		expect(text).toBeInstanceOf(Text);
	});

	it("does not apply to nested children (only direct children of mount point)", () => {
		renderer.setContentVisibility({ enabled: true, intrinsicSize: "auto 500px" });

		const parentId = createNodeId();
		const childId = createNodeId();
		renderer.apply({ action: "createNode", id: parentId, tag: "div" });
		renderer.apply({ action: "createNode", id: childId, tag: "div" });
		renderer.apply({ action: "appendChild", id: BODY_NODE_ID, childId: parentId });
		renderer.apply({ action: "appendChild", id: parentId, childId });

		const parent = renderer.getNode(parentId) as HTMLElement;
		const child = renderer.getNode(childId) as HTMLElement;

		// Parent (top-level) should have it
		expect(parent.style.contentVisibility).toBe("auto");
		// Nested child should not
		expect(child.style.contentVisibility).toBe("");
	});

	it("does not override existing content-visibility", () => {
		renderer.setContentVisibility({ enabled: true, intrinsicSize: "auto 500px" });

		const divId = createNodeId();
		renderer.apply({ action: "createNode", id: divId, tag: "div" });
		// Pre-set content-visibility on the element before appending
		const div = renderer.getNode(divId) as HTMLElement;
		div.style.contentVisibility = "hidden";

		renderer.apply({ action: "appendChild", id: BODY_NODE_ID, childId: divId });

		expect(div.style.contentVisibility).toBe("hidden");
	});
});
