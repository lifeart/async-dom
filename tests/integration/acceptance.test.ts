/**
 * End-to-end acceptance tests.
 *
 * Each scenario wires a VirtualDocument (worker side) through an
 * InMemoryTransport pair to a DomRenderer + FrameScheduler (main-thread side),
 * then verifies the complete user journey works against the jsdom real DOM.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
	BODY_NODE_ID,
	createAppId,
	HEAD_NODE_ID,
	HTML_NODE_ID,
	type Message,
	type MutationMessage,
} from "../../src/core/protocol.ts";
import { FrameScheduler } from "../../src/core/scheduler.ts";
import { type ContentVisibilityConfig, DomRenderer } from "../../src/main-thread/renderer.ts";
import { VirtualDocument } from "../../src/worker-thread/document.ts";
import { createWorkerDom } from "../../src/worker-thread/index.ts";
import { createTransportPair } from "./test-helpers.ts";

let pipelineCounter = 0;

function createPipeline(options?: { contentVisibility?: ContentVisibilityConfig }) {
	const appId = createAppId(`acceptance-${++pipelineCounter}`);
	const { workerTransport, mainTransport } = createTransportPair();

	// ---- Main-thread side ----
	const renderer = new DomRenderer(undefined, {
		allowHeadAppend: true,
		allowBodyAppend: true,
	});
	const scheduler = new FrameScheduler({ frameBudgetMs: 16 });
	scheduler.setApplier((m) => renderer.apply(m));

	// Seed structural nodes
	renderer.apply({ action: "createNode", id: BODY_NODE_ID, tag: "BODY" });
	renderer.apply({ action: "createNode", id: HEAD_NODE_ID, tag: "HEAD" });
	renderer.apply({ action: "createNode", id: HTML_NODE_ID, tag: "HTML" });

	if (options?.contentVisibility) {
		renderer.setContentVisibility(options.contentVisibility);
	}

	// Route messages arriving from the "worker" transport to the scheduler
	mainTransport.onMessage((message: Message) => {
		if (message.type === "mutation") {
			const mm = message as MutationMessage;
			scheduler.enqueue(mm.mutations, mm.appId, mm.priority ?? "normal");
		}
	});

	// ---- Worker side ----
	const doc = new VirtualDocument(appId);
	doc.collector.setTransport(workerTransport);

	return { doc, scheduler, renderer };
}

/** Flush mutations from worker to renderer and apply them. */
function flushAll(doc: VirtualDocument, scheduler: FrameScheduler) {
	doc.collector.flushSync();
	scheduler.flush();
}

describe("Acceptance tests", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		pipelineCounter = 0;
	});

	describe('Scenario 1: "Hello World" — simplest possible app', () => {
		it("creates a div with text and renders it to real DOM", () => {
			const { doc, scheduler, renderer } = createPipeline();

			const div = doc.createElement("div");
			div.textContent = "Hello World";
			doc.body.appendChild(div);

			flushAll(doc, scheduler);

			const node = renderer.getNode(div._nodeId) as HTMLElement;
			expect(node).toBeTruthy();
			expect(node.nodeName).toBe("DIV");
			expect(node.textContent).toBe("Hello World");
		});
	});

	describe("Scenario 2: Interactive counter", () => {
		it("increments count on simulated click events", () => {
			const { doc, scheduler, renderer } = createPipeline();

			let count = 0;
			const button = doc.createElement("button");
			const span = doc.createElement("span");
			span.textContent = String(count);

			button.addEventListener("click", () => {
				count++;
				span.textContent = String(count);
			});

			doc.body.appendChild(button);
			doc.body.appendChild(span);
			flushAll(doc, scheduler);

			// Verify initial state on virtual DOM
			expect(span.textContent).toBe("0");
			// Verify initial state on real DOM
			const realSpan = renderer.getNode(span._nodeId) as HTMLElement;
			expect(realSpan).toBeTruthy();
			expect(realSpan.textContent).toBe("0");

			// Simulate click via dispatchEvent on the virtual element
			button.dispatchEvent({ type: "click" });
			flushAll(doc, scheduler);
			expect(span.textContent).toBe("1");
			expect(realSpan.textContent).toBe("1");

			// Another click
			button.dispatchEvent({ type: "click" });
			flushAll(doc, scheduler);
			expect(span.textContent).toBe("2");
			expect(realSpan.textContent).toBe("2");
		});
	});

	describe("Scenario 3: Todo list", () => {
		it("adds and removes todos", () => {
			const { doc, scheduler, renderer } = createPipeline();

			const input = doc.createElement("input");
			const addBtn = doc.createElement("button");
			const ul = doc.createElement("ul");

			let inputValue = "";
			addBtn.addEventListener("click", () => {
				if (!inputValue) return;
				const li = doc.createElement("li");
				li.textContent = inputValue;

				const removeBtn = doc.createElement("button");
				removeBtn.textContent = "x";
				removeBtn.addEventListener("click", () => {
					li.remove();
				});
				li.appendChild(removeBtn);

				ul.appendChild(li);
				inputValue = "";
			});

			doc.body.appendChild(input);
			doc.body.appendChild(addBtn);
			doc.body.appendChild(ul);
			flushAll(doc, scheduler);

			// Add 3 todos
			const todos = ["Buy milk", "Walk dog", "Write tests"];
			for (const text of todos) {
				inputValue = text;
				addBtn.dispatchEvent({ type: "click" });
			}
			flushAll(doc, scheduler);

			const realUl = renderer.getNode(ul._nodeId) as HTMLElement;
			expect(realUl.children.length).toBe(3);
			expect(realUl.children[0].textContent).toContain("Buy milk");
			expect(realUl.children[1].textContent).toContain("Walk dog");
			expect(realUl.children[2].textContent).toContain("Write tests");

			// Remove middle todo ("Walk dog")
			const middleLi = ul.childNodes[1];
			// Find the remove button inside the li (last child)
			const removeButton = middleLi.childNodes[middleLi.childNodes.length - 1];
			removeButton.dispatchEvent({ type: "click" });
			flushAll(doc, scheduler);

			expect(realUl.children.length).toBe(2);
			expect(realUl.children[0].textContent).toContain("Buy milk");
			expect(realUl.children[1].textContent).toContain("Write tests");
		});
	});

	describe("Scenario 4: Style application", () => {
		it("applies inline styles and style elements to real DOM", () => {
			const { doc, scheduler, renderer } = createPipeline();

			// Inline style
			const div = doc.createElement("div");
			div.style.color = "red";
			doc.body.appendChild(div);

			// Style element
			const styleEl = doc.createElement("style");
			styleEl.textContent = ".highlight { background: yellow; }";
			doc.head.appendChild(styleEl);

			flushAll(doc, scheduler);

			const realDiv = renderer.getNode(div._nodeId) as HTMLElement;
			expect(realDiv.style.color).toBe("red");

			const realStyle = renderer.getNode(styleEl._nodeId) as HTMLStyleElement;
			expect(realStyle).toBeTruthy();
			expect(realStyle.tagName).toBe("STYLE");
			expect(realStyle.textContent).toBe(".highlight { background: yellow; }");
		});
	});

	describe("Scenario 5: Multiple apps isolation", () => {
		it("two separate pipelines render independently", () => {
			const mount1 = document.createElement("div");
			const mount2 = document.createElement("div");
			document.body.appendChild(mount1);
			document.body.appendChild(mount2);

			// Pipeline 1
			const pipeline1 = createPipeline();
			const heading1 = pipeline1.doc.createElement("h1");
			heading1.textContent = "App One";
			pipeline1.doc.body.appendChild(heading1);

			// Pipeline 2
			const pipeline2 = createPipeline();
			const heading2 = pipeline2.doc.createElement("h2");
			heading2.textContent = "App Two";
			pipeline2.doc.body.appendChild(heading2);

			flushAll(pipeline1.doc, pipeline1.scheduler);
			flushAll(pipeline2.doc, pipeline2.scheduler);

			// Each renderer has its own content
			const realH1 = pipeline1.renderer.getNode(heading1._nodeId) as HTMLElement;
			const realH2 = pipeline2.renderer.getNode(heading2._nodeId) as HTMLElement;

			expect(realH1).toBeTruthy();
			expect(realH1.textContent).toBe("App One");
			expect(realH1.tagName).toBe("H1");

			expect(realH2).toBeTruthy();
			expect(realH2.textContent).toBe("App Two");
			expect(realH2.tagName).toBe("H2");

			// Renderer 1 does not know about renderer 2's nodes
			expect(pipeline1.renderer.getNode(heading2._nodeId)).toBeNull();
			expect(pipeline2.renderer.getNode(heading1._nodeId)).toBeNull();
		});
	});

	describe("Scenario 6: Dynamic DOM manipulation", () => {
		it("handles remove, insertBefore, and replaceWith correctly", () => {
			const { doc, scheduler, renderer } = createPipeline();

			const parent = doc.createElement("div");
			doc.body.appendChild(parent);

			// Create 10 elements
			const items: ReturnType<typeof doc.createElement>[] = [];
			for (let i = 0; i < 10; i++) {
				const el = doc.createElement("span");
				el.textContent = `item-${i}`;
				parent.appendChild(el);
				items.push(el);
			}
			flushAll(doc, scheduler);

			const realParent = renderer.getNode(parent._nodeId) as HTMLElement;
			expect(realParent.children.length).toBe(10);

			// Remove every other element (indices 0, 2, 4, 6, 8)
			for (let i = 8; i >= 0; i -= 2) {
				items[i].remove();
			}
			flushAll(doc, scheduler);

			// Remaining: items[1], items[3], items[5], items[7], items[9]
			expect(realParent.children.length).toBe(5);
			expect((realParent.children[0] as HTMLElement).textContent).toBe("item-1");
			expect((realParent.children[1] as HTMLElement).textContent).toBe("item-3");
			expect((realParent.children[2] as HTMLElement).textContent).toBe("item-5");
			expect((realParent.children[3] as HTMLElement).textContent).toBe("item-7");
			expect((realParent.children[4] as HTMLElement).textContent).toBe("item-9");

			// insertBefore: move items[9] before items[1]
			parent.insertBefore(items[9], items[1]);
			flushAll(doc, scheduler);

			expect((realParent.children[0] as HTMLElement).textContent).toBe("item-9");
			expect((realParent.children[1] as HTMLElement).textContent).toBe("item-1");

			// replaceWith: replace items[5] with a new element
			const replacement = doc.createElement("span");
			replacement.textContent = "replaced";
			items[5].replaceWith(replacement);
			flushAll(doc, scheduler);

			const texts = Array.from(realParent.children).map((c) => c.textContent);
			expect(texts).toContain("replaced");
			expect(texts).not.toContain("item-5");
		});
	});

	describe("Scenario 7: Attribute and dataset", () => {
		it("sets id, className, data-* attributes and dataset proxy", () => {
			const { doc, scheduler, renderer } = createPipeline();

			const div = doc.createElement("div");
			div.id = "my-element";
			div.className = "alpha beta";
			div.setAttribute("data-color", "blue");
			div.dataset.size = "large";
			doc.body.appendChild(div);

			flushAll(doc, scheduler);

			const realDiv = renderer.getNode(div._nodeId) as HTMLElement;
			expect(realDiv.id).toBe("my-element");
			expect(realDiv.className).toBe("alpha beta");
			expect(realDiv.getAttribute("data-color")).toBe("blue");
			expect(realDiv.getAttribute("data-size")).toBe("large");
		});
	});

	describe("Scenario 8: Content visibility opt-in", () => {
		it("applies content-visibility: auto to top-level block elements", () => {
			const { doc, scheduler, renderer } = createPipeline({
				contentVisibility: { enabled: true, intrinsicSize: "auto 500px" },
			});

			const section = doc.createElement("section");
			section.textContent = "Block content";
			doc.body.appendChild(section);

			const article = doc.createElement("article");
			article.textContent = "Another block";
			doc.body.appendChild(article);

			flushAll(doc, scheduler);

			const realSection = renderer.getNode(section._nodeId) as HTMLElement;
			const realArticle = renderer.getNode(article._nodeId) as HTMLElement;

			expect(realSection).toBeTruthy();
			expect(realArticle).toBeTruthy();

			// content-visibility should be applied to block-level children of body
			expect(realSection.style.contentVisibility).toBe("auto");
			expect(realSection.style.containIntrinsicSize).toBe("auto 500px");
			expect(realArticle.style.contentVisibility).toBe("auto");
			expect(realArticle.style.containIntrinsicSize).toBe("auto 500px");
		});
	});

	describe("Scenario 9: innerHTML setting", () => {
		it("sets innerHTML and renders the HTML to real DOM", () => {
			const { doc, scheduler, renderer } = createPipeline();

			const div = doc.createElement("div");
			doc.body.appendChild(div);
			div.innerHTML = "<p>injected</p>";
			flushAll(doc, scheduler);

			const realDiv = renderer.getNode(div._nodeId) as HTMLElement;
			expect(realDiv).toBeTruthy();
			expect(realDiv.innerHTML).toBe("<p>injected</p>");
		});
	});

	describe("Scenario 10: Comment nodes", () => {
		it("creates comment nodes and renders them to real DOM", () => {
			const { doc, scheduler, renderer } = createPipeline();

			const comment = doc.createComment("my comment");
			doc.body.appendChild(comment);
			flushAll(doc, scheduler);

			const realComment = renderer.getNode(comment._nodeId) as Comment;
			expect(realComment).toBeTruthy();
			expect(realComment.nodeType).toBe(8); // Node.COMMENT_NODE
			expect(realComment.textContent).toBe("my comment");
		});
	});

	describe("Scenario 11: Text node manipulation", () => {
		it("creates text nodes and renders them to real DOM", () => {
			const { doc, scheduler, renderer } = createPipeline();

			const div = doc.createElement("div");
			const text = doc.createTextNode("hello text");
			div.appendChild(text);
			doc.body.appendChild(div);
			flushAll(doc, scheduler);

			const realDiv = renderer.getNode(div._nodeId) as HTMLElement;
			expect(realDiv).toBeTruthy();
			expect(realDiv.textContent).toBe("hello text");

			const realText = renderer.getNode(text._nodeId) as Text;
			expect(realText).toBeTruthy();
			expect(realText.nodeType).toBe(3); // Node.TEXT_NODE
			expect(realText.textContent).toBe("hello text");
		});
	});

	describe("Scenario 12: Large batch of elements", () => {
		it("creates and renders 100+ elements correctly", () => {
			const { doc, scheduler, renderer } = createPipeline();

			const container = doc.createElement("div");
			doc.body.appendChild(container);

			const elements: ReturnType<typeof doc.createElement>[] = [];
			for (let i = 0; i < 150; i++) {
				const el = doc.createElement("span");
				el.textContent = `el-${i}`;
				container.appendChild(el);
				elements.push(el);
			}
			flushAll(doc, scheduler);

			const realContainer = renderer.getNode(container._nodeId) as HTMLElement;
			expect(realContainer.children.length).toBe(150);

			// Spot-check first, middle, and last
			expect((realContainer.children[0] as HTMLElement).textContent).toBe("el-0");
			expect((realContainer.children[75] as HTMLElement).textContent).toBe("el-75");
			expect((realContainer.children[149] as HTMLElement).textContent).toBe("el-149");
		});
	});

	describe("Scenario 13: Public API (createWorkerDom) end-to-end", () => {
		/**
		 * This scenario uses createWorkerDom (the actual published public API)
		 * rather than directly constructing VirtualDocument, proving the real
		 * consumer flow works correctly.
		 */
		function createPublicPipeline() {
			const { workerTransport, mainTransport } = createTransportPair();

			const renderer = new DomRenderer(undefined, {
				allowHeadAppend: true,
				allowBodyAppend: true,
			});
			const scheduler = new FrameScheduler({ frameBudgetMs: 16 });
			scheduler.setApplier((m) => renderer.apply(m));
			renderer.apply({ action: "createNode", id: BODY_NODE_ID, tag: "BODY" });
			renderer.apply({ action: "createNode", id: HEAD_NODE_ID, tag: "HEAD" });
			renderer.apply({ action: "createNode", id: HTML_NODE_ID, tag: "HTML" });

			mainTransport.onMessage((message: Message) => {
				if (message.type === "mutation") {
					const mm = message as MutationMessage;
					scheduler.enqueue(mm.mutations, mm.appId, mm.priority ?? "normal");
				}
			});

			const dom = createWorkerDom({ transport: workerTransport });

			return { dom, scheduler, renderer };
		}

		it("full app lifecycle: create UI, interact, tear down", () => {
			const { dom, scheduler, renderer } = createPublicPipeline();
			const doc = dom.document;

			// Build a mini counter app through the public API
			let count = 0;
			const container = doc.createElement("div");
			const display = doc.createElement("span");
			const btn = doc.createElement("button");

			display.textContent = String(count);
			btn.textContent = "+";
			btn.addEventListener("click", () => {
				count++;
				display.textContent = String(count);
			});

			container.appendChild(display);
			container.appendChild(btn);
			doc.body.appendChild(container);
			doc.collector.flushSync();
			scheduler.flush();

			// Verify initial render
			const realDisplay = renderer.getNode(display._nodeId) as HTMLElement;
			expect(realDisplay.textContent).toBe("0");

			// Simulate clicks
			btn.dispatchEvent({ type: "click" });
			btn.dispatchEvent({ type: "click" });
			btn.dispatchEvent({ type: "click" });
			doc.collector.flushSync();
			scheduler.flush();

			expect(realDisplay.textContent).toBe("3");

			// Tear down
			dom.destroy();
			expect(dom.document.collector.pendingCount).toBe(0);
		});

		it("window object has expected shape", () => {
			const { dom } = createPublicPipeline();
			const win = dom.window;

			expect(win.document).toBe(dom.document);
			expect(typeof win.requestAnimationFrame).toBe("function");
			expect(typeof win.cancelAnimationFrame).toBe("function");
			expect(typeof win.setTimeout).toBe("function");
			expect(typeof win.addEventListener).toBe("function");
			expect(typeof win.scrollTo).toBe("function");
			expect(typeof win.getComputedStyle).toBe("function");
			expect(typeof win.matchMedia).toBe("function");
			expect(win.location).toBeDefined();
			expect(win.history).toBeDefined();
			expect(win.localStorage).toBeDefined();
			expect(win.sessionStorage).toBeDefined();

			dom.destroy();
		});
	});
});
