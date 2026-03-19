import { beforeEach, describe, expect, it } from "vitest";
import { NodeCache } from "../../src/core/node-cache.ts";
import { createNodeId } from "../../src/core/protocol.ts";
import { DomRenderer } from "../../src/main-thread/renderer.ts";

describe("Shadow DOM Support", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	describe("RendererRoot with shadow root", () => {
		it("createNode BODY maps to shadow root instead of document.body", () => {
			const host = document.createElement("div");
			document.body.appendChild(host);
			const shadow = host.attachShadow({ mode: "open" });

			const cache = new NodeCache();
			const renderer = new DomRenderer(
				cache,
				{ allowBodyAppend: true, allowHeadAppend: true },
				{
					body: shadow,
					head: shadow,
					html: host,
				},
			);

			const bodyId = createNodeId("body-node");
			renderer.apply({ action: "createNode", id: bodyId, tag: "BODY" });

			// BODY should map to shadow root, not document.body
			expect(cache.get(bodyId)).toBe(shadow);
		});

		it("createNode HTML maps to host element", () => {
			const host = document.createElement("div");
			document.body.appendChild(host);
			const shadow = host.attachShadow({ mode: "open" });

			const cache = new NodeCache();
			const renderer = new DomRenderer(
				cache,
				{},
				{
					body: shadow,
					head: shadow,
					html: host,
				},
			);

			const htmlId = createNodeId("html-node");
			renderer.apply({ action: "createNode", id: htmlId, tag: "HTML" });
			expect(cache.get(htmlId)).toBe(host);
		});

		it("createNode HEAD maps to shadow root", () => {
			const host = document.createElement("div");
			document.body.appendChild(host);
			const shadow = host.attachShadow({ mode: "open" });

			const cache = new NodeCache();
			const renderer = new DomRenderer(
				cache,
				{ allowHeadAppend: true },
				{
					body: shadow,
					head: shadow,
					html: host,
				},
			);

			const headId = createNodeId("head-node");
			renderer.apply({ action: "createNode", id: headId, tag: "HEAD" });
			expect(cache.get(headId)).toBe(shadow);
		});

		it("appendChild adds elements inside shadow root", () => {
			const host = document.createElement("div");
			document.body.appendChild(host);
			const shadow = host.attachShadow({ mode: "open" });

			const cache = new NodeCache();
			const renderer = new DomRenderer(
				cache,
				{ allowBodyAppend: true },
				{
					body: shadow,
					head: shadow,
					html: host,
				},
			);

			// Seed body
			const bodyId = createNodeId("body-node");
			renderer.apply({ action: "createNode", id: bodyId, tag: "BODY" });

			// Create and append a child
			const childId = createNodeId("shadow-child");
			renderer.apply({ action: "createNode", id: childId, tag: "div" });
			renderer.apply({ action: "appendChild", id: bodyId, childId });

			// Child should be inside shadow root
			expect(shadow.children).toHaveLength(1);
			expect(shadow.children[0].tagName).toBe("DIV");
		});

		it("headAppendChild adds style to shadow root (CSS isolation)", () => {
			const host = document.createElement("div");
			document.body.appendChild(host);
			const shadow = host.attachShadow({ mode: "open" });

			const cache = new NodeCache();
			const renderer = new DomRenderer(
				cache,
				{ allowHeadAppend: true },
				{
					body: shadow,
					head: shadow,
					html: host,
				},
			);

			const styleId = createNodeId("shadow-style");
			renderer.apply({ action: "createNode", id: styleId, tag: "style" });
			renderer.apply({ action: "headAppendChild", id: styleId });

			// Style should be in shadow root, not document.head
			const styleNode = cache.get(styleId) as HTMLStyleElement;
			expect(styleNode.parentNode).toBe(shadow);

			// Style should NOT be in document.head
			expect(Array.from(document.head.children)).not.toContain(styleNode);
		});

		it("bodyAppendChild adds to shadow root", () => {
			const host = document.createElement("div");
			document.body.appendChild(host);
			const shadow = host.attachShadow({ mode: "open" });

			const cache = new NodeCache();
			const renderer = new DomRenderer(
				cache,
				{ allowBodyAppend: true },
				{
					body: shadow,
					head: shadow,
					html: host,
				},
			);

			const divId = createNodeId("shadow-body-child");
			renderer.apply({ action: "createNode", id: divId, tag: "div" });
			renderer.apply({ action: "bodyAppendChild", id: divId });

			expect(shadow.children).toHaveLength(1);
		});
	});

	describe("CSS isolation between apps", () => {
		it("styles in one shadow root don't affect another", () => {
			const host1 = document.createElement("div");
			const host2 = document.createElement("div");
			document.body.appendChild(host1);
			document.body.appendChild(host2);
			const shadow1 = host1.attachShadow({ mode: "open" });
			const shadow2 = host2.attachShadow({ mode: "open" });

			const cache1 = new NodeCache();
			const cache2 = new NodeCache();
			const renderer1 = new DomRenderer(
				cache1,
				{ allowHeadAppend: true, allowBodyAppend: true },
				{ body: shadow1, head: shadow1, html: host1 },
			);
			const _renderer2 = new DomRenderer(
				cache2,
				{ allowHeadAppend: true, allowBodyAppend: true },
				{ body: shadow2, head: shadow2, html: host2 },
			);

			// App 1 adds a style
			const styleId = createNodeId("style-1");
			renderer1.apply({ action: "createNode", id: styleId, tag: "style" });
			renderer1.apply({ action: "headAppendChild", id: styleId });

			// Style should be in shadow1 only
			expect(shadow1.querySelector("style")).toBeTruthy();
			expect(shadow2.querySelector("style")).toBeNull();
		});
	});

	describe("default root (no shadow)", () => {
		it("renderer without root uses document.body/head", () => {
			const cache = new NodeCache();
			const renderer = new DomRenderer(cache, { allowBodyAppend: true });

			const bodyId = createNodeId("default-body");
			renderer.apply({ action: "createNode", id: bodyId, tag: "BODY" });
			expect(cache.get(bodyId)).toBe(document.body);
		});
	});

	describe("mount point without shadow", () => {
		it("mount point element becomes the body root", () => {
			const mount = document.createElement("div");
			mount.id = "mount";
			document.body.appendChild(mount);

			const cache = new NodeCache();
			const renderer = new DomRenderer(
				cache,
				{ allowBodyAppend: true },
				{
					body: mount,
					head: document.head,
					html: mount,
				},
			);

			const bodyId = createNodeId("mount-body");
			renderer.apply({ action: "createNode", id: bodyId, tag: "BODY" });

			const childId = createNodeId("mount-child");
			renderer.apply({ action: "createNode", id: childId, tag: "span" });
			renderer.apply({ action: "appendChild", id: bodyId, childId });

			expect(mount.children).toHaveLength(1);
			expect(mount.children[0].tagName).toBe("SPAN");
		});
	});
});
