/**
 * Integration tests for `createServerApp` from the server module.
 *
 * Verifies that the public server API correctly wires a virtual DOM through
 * an InMemoryTransport, runs the user's appModule, and produces mutations
 * that flow through the transport.
 */
import { describe, expect, it } from "vitest";
import type { Message, MutationMessage } from "../../src/core/protocol.ts";
import { createServerApp } from "../../src/server/index.ts";
import { createTransportPair } from "./test-helpers.ts";

describe("createServerApp integration", () => {
	it("runs appModule and ready resolves", async () => {
		const { workerTransport } = createTransportPair();
		let appModuleCalled = false;

		const app = createServerApp({
			transport: workerTransport,
			appModule: (dom) => {
				appModuleCalled = true;
				const div = dom.document.createElement("div");
				div.textContent = "hello";
				dom.document.body.appendChild(div);
				dom.document.collector.flushSync();
			},
		});

		await app.ready;
		expect(appModuleCalled).toBe(true);

		app.destroy();
	});

	it("mutations flow through transport to main side", async () => {
		const { workerTransport, mainTransport } = createTransportPair();
		const received: Message[] = [];

		mainTransport.onMessage((msg: Message) => {
			received.push(msg);
		});

		const app = createServerApp({
			transport: workerTransport,
			appModule: (dom) => {
				const div = dom.document.createElement("div");
				div.textContent = "test content";
				dom.document.body.appendChild(div);
				div.setAttribute("data-info", "42");
				dom.document.collector.flushSync();
			},
		});

		await app.ready;

		// Should have received at least a "ready" system message and mutation messages
		const readyMsgs = received.filter((m) => m.type === "ready");
		expect(readyMsgs.length).toBeGreaterThanOrEqual(1);

		const mutationMsgs = received.filter((m) => m.type === "mutation") as MutationMessage[];
		expect(mutationMsgs.length).toBeGreaterThan(0);

		// Flatten all mutations and check for expected actions
		const allMutations = mutationMsgs.flatMap((m) => m.mutations);
		const hasCreateNode = allMutations.some((m) => m.action === "createNode");
		const hasSetAttribute = allMutations.some((m) => m.action === "setAttribute");
		expect(hasCreateNode).toBe(true);
		expect(hasSetAttribute).toBe(true);

		app.destroy();
	});

	it("destroy() closes transport", async () => {
		const { workerTransport } = createTransportPair();

		const app = createServerApp({
			transport: workerTransport,
			appModule: () => {},
		});

		await app.ready;

		expect(workerTransport.readyState).toBe("open");

		app.destroy();

		expect(workerTransport.readyState).toBe("closed");
	});

	it("async appModule: ready resolves after async work completes", async () => {
		const { workerTransport, mainTransport } = createTransportPair();
		const received: Message[] = [];

		mainTransport.onMessage((msg: Message) => {
			received.push(msg);
		});

		let asyncWorkDone = false;

		const app = createServerApp({
			transport: workerTransport,
			appModule: async (dom) => {
				// Simulate async work (e.g. data fetching)
				await new Promise<void>((resolve) => setTimeout(resolve, 10));
				asyncWorkDone = true;

				const p = dom.document.createElement("p");
				p.textContent = "async content";
				dom.document.body.appendChild(p);
				dom.document.collector.flushSync();
			},
		});

		await app.ready;
		expect(asyncWorkDone).toBe(true);

		// Mutations from the async appModule should have arrived
		const mutationMsgs = received.filter((m) => m.type === "mutation") as MutationMessage[];
		expect(mutationMsgs.length).toBeGreaterThan(0);

		const allMutations = mutationMsgs.flatMap((m) => m.mutations);
		const hasCreateNode = allMutations.some((m) => m.action === "createNode");
		expect(hasCreateNode).toBe(true);

		app.destroy();
	});

	it("mutations contain correct tag names and attribute values", async () => {
		const { workerTransport, mainTransport } = createTransportPair();
		const received: Message[] = [];

		mainTransport.onMessage((msg: Message) => {
			received.push(msg);
		});

		const app = createServerApp({
			transport: workerTransport,
			appModule: (dom) => {
				const section = dom.document.createElement("section");
				section.setAttribute("id", "hero");
				section.textContent = "Hello Server";
				dom.document.body.appendChild(section);
				dom.document.collector.flushSync();
			},
		});

		await app.ready;

		const mutationMsgs = received.filter((m) => m.type === "mutation") as MutationMessage[];
		const allMutations = mutationMsgs.flatMap((m) => m.mutations);

		// Verify the specific tag was created
		const createSection = allMutations.find(
			(m) => m.action === "createNode" && "tag" in m && m.tag === "SECTION",
		);
		expect(createSection).toBeTruthy();

		// Verify setAttribute with correct name and value
		const setId = allMutations.find(
			(m) =>
				m.action === "setAttribute" &&
				"name" in m &&
				m.name === "id" &&
				"value" in m &&
				m.value === "hero",
		);
		expect(setId).toBeTruthy();

		// Verify textContent was set
		const setText = allMutations.find(
			(m) =>
				m.action === "setTextContent" && "textContent" in m && m.textContent === "Hello Server",
		);
		expect(setText).toBeTruthy();

		app.destroy();
	});

	it("multiple apps on separate transports are isolated", async () => {
		const pair1 = createTransportPair();
		const pair2 = createTransportPair();
		const received1: Message[] = [];
		const received2: Message[] = [];

		pair1.mainTransport.onMessage((msg: Message) => received1.push(msg));
		pair2.mainTransport.onMessage((msg: Message) => received2.push(msg));

		const app1 = createServerApp({
			transport: pair1.workerTransport,
			appModule: (dom) => {
				const div = dom.document.createElement("div");
				div.textContent = "App One";
				dom.document.body.appendChild(div);
				dom.document.collector.flushSync();
			},
		});

		const app2 = createServerApp({
			transport: pair2.workerTransport,
			appModule: (dom) => {
				const span = dom.document.createElement("span");
				span.textContent = "App Two";
				dom.document.body.appendChild(span);
				dom.document.collector.flushSync();
			},
		});

		await Promise.all([app1.ready, app2.ready]);

		const muts1 = (received1.filter((m) => m.type === "mutation") as MutationMessage[]).flatMap(
			(m) => m.mutations,
		);
		const muts2 = (received2.filter((m) => m.type === "mutation") as MutationMessage[]).flatMap(
			(m) => m.mutations,
		);

		// App1 should have DIV, App2 should have SPAN
		expect(muts1.some((m) => m.action === "createNode" && "tag" in m && m.tag === "DIV")).toBe(
			true,
		);
		expect(muts2.some((m) => m.action === "createNode" && "tag" in m && m.tag === "SPAN")).toBe(
			true,
		);

		// Neither should contain the other's specific tag
		expect(muts1.some((m) => m.action === "createNode" && "tag" in m && m.tag === "SPAN")).toBe(
			false,
		);
		expect(muts2.some((m) => m.action === "createNode" && "tag" in m && m.tag === "DIV")).toBe(
			false,
		);

		app1.destroy();
		app2.destroy();
	});
});
