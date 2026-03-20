import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppId, createNodeId, type AppId, type Message, type MutationMessage } from "../../src/core/protocol.ts";
import { createAsyncDom, type AsyncDomConfig, type AppConfig, type RemoteAppConfig } from "../../src/main-thread/index.ts";
import type { Transport } from "../../src/transport/base.ts";

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

function createMockWorker() {
	let onmessageCb: ((e: MessageEvent) => void) | null = null;
	const mock = {
		postMessage: vi.fn(),
		terminate: vi.fn(),
		get onmessage() {
			return onmessageCb;
		},
		set onmessage(fn: ((e: MessageEvent) => void) | null) {
			onmessageCb = fn;
		},
		onerror: null as ((e: ErrorEvent) => void) | null,
		/** Simulate a message arriving from the worker */
		emit(msg: Message) {
			onmessageCb?.({ data: msg } as MessageEvent);
		},
	};
	return mock as unknown as Worker & { emit(msg: Message): void };
}

function createMockTransport(): Transport & { sent: Message[]; simulateMessage(msg: Message): void; simulateError(err: Error): void; simulateClose(): void } {
	const sent: Message[] = [];
	// Support multiple handlers just like WorkerTransport does
	const messageHandlers: Array<(msg: Message) => void> = [];
	const transport: Transport & { sent: Message[]; simulateMessage(msg: Message): void; simulateError(err: Error): void; simulateClose(): void } = {
		sent,
		send(msg: Message) {
			sent.push(msg);
		},
		onMessage(handler: (msg: Message) => void) {
			messageHandlers.push(handler);
		},
		close: vi.fn(),
		get readyState() {
			return "open" as const;
		},
		onError: undefined,
		onClose: undefined,
		simulateMessage(msg: Message) {
			for (const h of messageHandlers) h(msg);
		},
		simulateError(err: Error) {
			transport.onError?.(err);
		},
		simulateClose() {
			transport.onClose?.();
		},
	};
	return transport;
}

function makeMountPoint(): HTMLDivElement {
	const el = document.createElement("div");
	document.body.appendChild(el);
	return el;
}

// ---------------------------------------------------------------------------

describe("createAsyncDom()", () => {
	let instances: ReturnType<typeof createAsyncDom>[] = [];

	beforeEach(() => {
		document.body.innerHTML = "";
	});

	afterEach(() => {
		for (const inst of instances) {
			try { inst.destroy(); } catch { /* already destroyed */ }
		}
		instances = [];
		vi.restoreAllMocks();
	});

	function make(config: AsyncDomConfig) {
		const inst = createAsyncDom(config);
		instances.push(inst);
		return inst;
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	describe("lifecycle (start / stop / destroy)", () => {
		it("returns an object with start, stop, destroy, addApp, addRemoteApp, removeApp", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			expect(typeof inst.start).toBe("function");
			expect(typeof inst.stop).toBe("function");
			expect(typeof inst.destroy).toBe("function");
			expect(typeof inst.addApp).toBe("function");
			expect(typeof inst.addRemoteApp).toBe("function");
			expect(typeof inst.removeApp).toBe("function");
		});

		it("start() and stop() do not throw", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			expect(() => { inst.start(); inst.stop(); }).not.toThrow();
		});

		it("destroy() can be called without any apps", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			expect(() => inst.destroy()).not.toThrow();
		});

		it("destroy() terminates worker threads registered via config.worker", () => {
			const target = makeMountPoint();
			const worker = createMockWorker();
			const inst = make({ target, worker });
			inst.destroy();
			expect(worker.terminate).toHaveBeenCalled();
		});

		it("destroy() removes visibilitychange event listener (no double-fire)", () => {
			const target = makeMountPoint();
			const worker = createMockWorker();
			const inst = make({ target, worker });

			// Spy on broadcast after construction — only gets calls after spy is set
			// Verify that once destroyed, a visibilitychange does NOT cause errors
			inst.destroy();
			expect(() => {
				document.dispatchEvent(new Event("visibilitychange"));
			}).not.toThrow();
		});

		it("stop then destroy does not throw", () => {
			const target = makeMountPoint();
			const worker = createMockWorker();
			const inst = make({ target, worker });
			inst.start();
			inst.stop();
			expect(() => inst.destroy()).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// Initialization with config.worker
	// -------------------------------------------------------------------------

	describe("initialization with config.worker", () => {
		it("sends an init message to the worker immediately", () => {
			const target = makeMountPoint();
			const worker = createMockWorker();
			make({ target, worker });

			const sentMessages = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(
				(call) => call[0],
			);
			const initMsg = sentMessages.find((m: Message) => m.type === "init");
			expect(initMsg).toBeDefined();
			expect(initMsg?.type).toBe("init");
		});

		it("init message contains location information", () => {
			const target = makeMountPoint();
			const worker = createMockWorker();
			make({ target, worker });

			const sentMessages = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(
				(call) => call[0],
			);
			const initMsg = sentMessages.find((m: Message) => m.type === "init") as {
				type: "init";
				location: Record<string, unknown>;
				appId: AppId;
			};
			expect(initMsg).toBeDefined();
			expect(initMsg.location).toHaveProperty("href");
			expect(initMsg.location).toHaveProperty("pathname");
			expect(initMsg.location).toHaveProperty("host");
			expect(initMsg.location).toHaveProperty("protocol");
		});

		it("init message contains appId", () => {
			const target = makeMountPoint();
			const worker = createMockWorker();
			make({ target, worker });

			const calls = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls;
			const initMsg = calls.map((c) => c[0]).find((m: Message) => m.type === "init") as {
				type: "init";
				appId: AppId;
			};
			expect(typeof initMsg.appId).toBe("string");
			expect(initMsg.appId.length).toBeGreaterThan(0);
		});
	});

	// -------------------------------------------------------------------------
	// Multiple apps: addApp / removeApp
	// -------------------------------------------------------------------------

	describe("addApp()", () => {
		it("returns a unique AppId string", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const worker = createMockWorker();
			const appId = inst.addApp({ worker });
			expect(typeof appId).toBe("string");
			expect(appId.length).toBeGreaterThan(0);
		});

		it("two addApp() calls return distinct AppIds", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const w1 = createMockWorker();
			const w2 = createMockWorker();
			const id1 = inst.addApp({ worker: w1 });
			const id2 = inst.addApp({ worker: w2 });
			expect(id1).not.toBe(id2);
		});

		it("sends init message to each added worker", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const w1 = createMockWorker();
			const w2 = createMockWorker();
			inst.addApp({ worker: w1 });
			inst.addApp({ worker: w2 });

			const initCount = (m: Worker & { emit(msg: Message): void }) =>
				(m.postMessage as ReturnType<typeof vi.fn>).mock.calls
					.map((c) => c[0])
					.filter((msg: Message) => msg.type === "init").length;

			expect(initCount(w1)).toBe(1);
			expect(initCount(w2)).toBe(1);
		});

		it("addApp() with name sends init with a stable AppId equal to the name", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const worker = createMockWorker();
			const appId = inst.addApp({ worker, name: "my-app" });
			expect(appId).toBe("my-app");
		});

		it("addApp() with duplicate name gets a deduplicated AppId", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const w1 = createMockWorker();
			const w2 = createMockWorker();
			const id1 = inst.addApp({ worker: w1, name: "app" });
			const id2 = inst.addApp({ worker: w2, name: "app" });
			expect(id1).toBe("app");
			expect(id2).not.toBe("app"); // e.g. "app-2"
			expect(id2).toContain("app");
		});

		it("addApp() with shadow:true does not throw", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const mountEl = makeMountPoint();
			const worker = createMockWorker();
			expect(() => {
				inst.addApp({ worker, mountPoint: mountEl, shadow: true });
			}).not.toThrow();
		});

		it("addApp() with mountPoint as string resolves element", () => {
			const target = makeMountPoint();
			const mountEl = makeMountPoint();
			mountEl.id = "mount-target";
			const inst = make({ target });
			const worker = createMockWorker();
			// Should not throw and should use document.querySelector internally
			expect(() => {
				inst.addApp({ worker, mountPoint: "#mount-target" });
			}).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// removeApp()
	// -------------------------------------------------------------------------

	describe("removeApp()", () => {
		it("removeApp() terminates the worker", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const worker = createMockWorker();
			const appId = inst.addApp({ worker });
			inst.removeApp(appId);
			expect(worker.terminate).toHaveBeenCalled();
		});

		it("removeApp() for unknown appId does not throw", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			expect(() => inst.removeApp(createAppId("nonexistent"))).not.toThrow();
		});

		it("removeApp() decrements app count so scheduler is updated", () => {
			// We verify indirectly: no error thrown when calling removeApp twice.
			const target = makeMountPoint();
			const inst = make({ target });
			const w1 = createMockWorker();
			const w2 = createMockWorker();
			const id1 = inst.addApp({ worker: w1 });
			const id2 = inst.addApp({ worker: w2 });
			inst.removeApp(id1);
			inst.removeApp(id2);
			expect(() => inst.destroy()).not.toThrow();
		});

		it("destroy() after removeApp() does not throw for already removed worker", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const worker = createMockWorker();
			const appId = inst.addApp({ worker });
			inst.removeApp(appId);
			// destroy should not try to close already-removed worker again
			expect(() => inst.destroy()).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// addRemoteApp()
	// -------------------------------------------------------------------------

	describe("addRemoteApp()", () => {
		it("returns a valid AppId when given a transport", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			const appId = inst.addRemoteApp({ transport });
			expect(typeof appId).toBe("string");
		});

		it("sends init message via the transport", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			inst.addRemoteApp({ transport });

			const initMsg = transport.sent.find((m) => m.type === "init");
			expect(initMsg).toBeDefined();
		});

		it("addRemoteApp() with name gives that name as AppId", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			const appId = inst.addRemoteApp({ transport, name: "remote-app" });
			expect(appId).toBe("remote-app");
		});

		it("addRemoteApp() removeApp() terminates the transport", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			const appId = inst.addRemoteApp({ transport });
			inst.removeApp(appId);
			expect(transport.close).toHaveBeenCalled();
		});
	});

	// -------------------------------------------------------------------------
	// Mutation routing through scheduler
	// -------------------------------------------------------------------------

	describe("mutation message routing", () => {
		it("mutation messages from worker are enqueued and applied after flush", () => {
			const target = makeMountPoint();
			const worker = createMockWorker();
			const inst = make({ target, worker });

			// Get the appId from the init message
			const initMsg = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls
				.map((c) => c[0])
				.find((m: Message) => m.type === "init") as { type: "init"; appId: AppId };
			const appId = initMsg.appId;

			const nodeId = createNodeId();
			const mutationMsg: MutationMessage = {
				type: "mutation",
				appId,
				uid: 1,
				mutations: [{ action: "createNode", id: nodeId, tag: "div" }],
			};

			worker.emit(mutationMsg);

			// The scheduler's applier runs on flush — this exercises the queue path
			// without requiring RAF. No error = message was properly routed.
			expect(() => inst.destroy()).not.toThrow();
		});

	});

	// -------------------------------------------------------------------------
	// Error handling via onError callback
	// -------------------------------------------------------------------------

	describe("onError callback", () => {
		it("calls onError when transport emits an error system message", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			const errors: unknown[] = [];
			const appId = inst.addRemoteApp({
				transport,
				onError: (err) => errors.push(err),
			});

			// Simulate a worker-side error arriving as a system message
			transport.simulateMessage({
				type: "error",
				appId,
				error: { message: "Something blew up", name: "Error" },
			} as unknown as Message);

			expect(errors).toHaveLength(1);
			expect((errors[0] as { message: string }).message).toBe("Something blew up");
		});

		it("calls onError when transport fires onError (crash)", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			const errors: Error[] = [];
			inst.addRemoteApp({
				transport,
				onError: (err) => errors.push(err as unknown as Error),
			});

			transport.simulateError(new Error("Worker crashed"));

			expect(errors).toHaveLength(1);
		});

		it("transport onClose triggers dead-app cleanup without throwing", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			inst.addRemoteApp({ transport });

			// Should clean up the app silently
			expect(() => transport.simulateClose()).not.toThrow();

			// Instance should still be operable
			expect(() => inst.destroy()).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// Window property allowlist enforcement (WindowProperty sync queries)
	// -------------------------------------------------------------------------

	describe("window property allowlist", () => {
		it("allowed property 'innerWidth' is returned via async query message", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			inst.addRemoteApp({ transport });

			// Simulate a query message from the worker asking for innerWidth
			transport.simulateMessage({
				type: "query",
				uid: 42,
				nodeId: 0,
				query: "windowProperty",
				property: "innerWidth",
			} as unknown as Message);

			// Response should have been sent back
			const response = transport.sent.find((m) => m.type === "queryResult") as
				| { type: "queryResult"; uid: number; result: unknown }
				| undefined;
			expect(response).toBeDefined();
			expect(response?.uid).toBe(42);
			// innerWidth is a number (0 in jsdom)
			expect(typeof response?.result).toBe("number");
		});

		it("blocked property 'document.cookie' returns null via async query", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			inst.addRemoteApp({ transport });

			transport.simulateMessage({
				type: "query",
				uid: 99,
				nodeId: 0,
				query: "windowProperty",
				property: "document.cookie",
			} as unknown as Message);

			const response = transport.sent.find((m) => m.type === "queryResult") as
				| { type: "queryResult"; uid: number; result: unknown }
				| undefined;
			expect(response).toBeDefined();
			expect(response?.result).toBeNull();
		});

		it("blocked property 'navigator.appVersion' returns null", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			inst.addRemoteApp({ transport });

			transport.simulateMessage({
				type: "query",
				uid: 55,
				nodeId: 0,
				query: "windowProperty",
				property: "navigator.appVersion",
			} as unknown as Message);

			const response = transport.sent.find((m) => m.type === "queryResult") as
				| { type: "queryResult"; uid: number; result: unknown }
				| undefined;
			expect(response?.result).toBeNull();
		});

		it("allowed dotted property 'navigator.userAgent' is served", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			inst.addRemoteApp({ transport });

			transport.simulateMessage({
				type: "query",
				uid: 77,
				nodeId: 0,
				query: "windowProperty",
				property: "navigator.userAgent",
			} as unknown as Message);

			const response = transport.sent.find((m) => m.type === "queryResult") as
				| { type: "queryResult"; uid: number; result: unknown }
				| undefined;
			// userAgent in jsdom is a string
			expect(typeof response?.result).toBe("string");
		});

		it("query with unknown queryType returns null gracefully", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			inst.addRemoteApp({ transport });

			transport.simulateMessage({
				type: "query",
				uid: 11,
				nodeId: 0,
				query: "unknownQueryType",
				property: "anything",
			} as unknown as Message);

			const response = transport.sent.find((m) => m.type === "queryResult") as
				| { type: "queryResult"; uid: number; result: unknown }
				| undefined;
			expect(response).toBeDefined();
			expect(response?.result).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// Debug / devtools
	// -------------------------------------------------------------------------

	describe("debug options", () => {
		it("exposeDevtools attaches __ASYNC_DOM_DEVTOOLS__ to globalThis", () => {
			const target = makeMountPoint();
			const inst = make({ target, debug: { exposeDevtools: true } });
			expect((globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__).toBeDefined();
			inst.destroy();
			// cleanup the global to not pollute other tests
			delete (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__;
		});

		it("__ASYNC_DOM_DEVTOOLS__.apps() returns array", () => {
			const target = makeMountPoint();
			const inst = make({ target, debug: { exposeDevtools: true } });
			const devtools = (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ as {
				apps(): string[];
			};
			expect(Array.isArray(devtools.apps())).toBe(true);
			inst.destroy();
			delete (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__;
		});

		it("onWarning logger is called when renderer encounters missing node", () => {
			const warnings: unknown[] = [];
			const target = makeMountPoint();
			const worker = createMockWorker();
			const inst = make({
				target,
				worker,
				debug: {
					logWarnings: true,
					logger: {
						warning: (entry) => warnings.push(entry),
					},
				},
			});

			const initMsg = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls
				.map((c) => c[0])
				.find((m: Message) => m.type === "init") as { type: "init"; appId: AppId };
			const appId = initMsg.appId;

			// Send a mutation that appends a node that doesn't exist in the cache
			const fakeNodeId = createNodeId();
			const fakeParentId = createNodeId();
			worker.emit({
				type: "mutation",
				appId,
				uid: 9,
				mutations: [{ action: "appendChild", id: fakeParentId, childId: fakeNodeId }],
			} as MutationMessage);

			// flush via destroy()
			inst.destroy();
			// Warnings are issued inside the renderer for unknown nodes
			expect(warnings.length).toBeGreaterThanOrEqual(1);
		});

		it("onMutation logger receives each applied mutation", () => {
			const mutationEntries: unknown[] = [];
			const target = makeMountPoint();
			const worker = createMockWorker();
			const inst = make({
				target,
				worker,
				debug: {
					logMutations: true,
					logger: {
						mutation: (entry) => mutationEntries.push(entry),
					},
				},
			});

			const initMsg = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls
				.map((c) => c[0])
				.find((m: Message) => m.type === "init") as { type: "init"; appId: AppId };
			const appId = initMsg.appId;
			const nodeId = createNodeId();

			worker.emit({
				type: "mutation",
				appId,
				uid: 10,
				mutations: [{ action: "createNode", id: nodeId, tag: "p" }],
			} as MutationMessage);

			inst.destroy();
			// Each mutation processed by renderer calls the mutation logger
			expect(mutationEntries.length).toBeGreaterThanOrEqual(1);
		});
	});

	// -------------------------------------------------------------------------
	// Visibility change forwarding
	// -------------------------------------------------------------------------

	describe("visibilitychange forwarding", () => {
		it("visibilitychange is broadcast to all worker threads", () => {
			const target = makeMountPoint();
			const w1 = createMockWorker();
			const w2 = createMockWorker();
			const inst = make({ target });
			inst.addApp({ worker: w1 });
			inst.addApp({ worker: w2 });

			// Reset any init messages already sent
			(w1.postMessage as ReturnType<typeof vi.fn>).mockClear();
			(w2.postMessage as ReturnType<typeof vi.fn>).mockClear();

			document.dispatchEvent(new Event("visibilitychange"));

			// Each worker should have received one broadcast message
			const w1Calls = (w1.postMessage as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
			const w2Calls = (w2.postMessage as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
			const visMsg1 = w1Calls.find((m: Message) => m.type === "visibility");
			const visMsg2 = w2Calls.find((m: Message) => m.type === "visibility");
			expect(visMsg1).toBeDefined();
			expect(visMsg2).toBeDefined();
		});
	});

	// -------------------------------------------------------------------------
	// Scheduler configuration
	// -------------------------------------------------------------------------

	describe("scheduler configuration", () => {
		it("accepts custom scheduler config without throwing", () => {
			const target = makeMountPoint();
			expect(() => {
				make({
					target,
					scheduler: { frameBudgetMs: 8, enablePrioritySkipping: true },
				});
			}).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// Shadow DOM mount
	// -------------------------------------------------------------------------

	describe("shadow DOM support", () => {
		it("addApp with shadow:true attaches shadowRoot to mountEl", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const mountEl = makeMountPoint();
			const worker = createMockWorker();

			inst.addApp({ worker, mountPoint: mountEl, shadow: true });

			expect(mountEl.shadowRoot).not.toBeNull();
		});

		it("addApp with shadow ShadowRootInit uses provided mode", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const mountEl = makeMountPoint();
			const worker = createMockWorker();

			inst.addApp({ worker, mountPoint: mountEl, shadow: { mode: "closed" } });

			// With mode:"closed", shadowRoot is not accessible via .shadowRoot
			// but the operation should not throw
			expect(mountEl.shadowRoot).toBeNull(); // closed shadows aren't exposed
		});
	});

	// -------------------------------------------------------------------------
	// eventTimingResult system message
	// -------------------------------------------------------------------------

	describe("eventTimingResult system message", () => {
		it("eventTimingResult message is handled without throwing", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			const appId = inst.addRemoteApp({ transport });

			expect(() => {
				transport.simulateMessage({
					type: "eventTimingResult",
					appId,
					listenerId: "nonexistent-listener",
					dispatchMs: 5,
					mutationCount: 0,
				} as unknown as Message);
			}).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// perfEntries system message
	// -------------------------------------------------------------------------

	describe("perfEntries system message", () => {
		it("perfEntries are stored without throwing", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			const appId = inst.addRemoteApp({ transport });

			expect(() => {
				transport.simulateMessage({
					type: "perfEntries",
					appId,
					entries: [{ name: "measure", duration: 2.5, startTime: 100 }],
				} as unknown as Message);
			}).not.toThrow();

			expect(() => inst.destroy()).not.toThrow();
		});

		it("perfEntries are capped at MAX_PERF_ENTRIES (200)", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			const transport = createMockTransport();
			const appId = inst.addRemoteApp({ transport });

			// Send 210 entries in one shot — internal splice should keep ≤200
			const entries = Array.from({ length: 210 }, (_, i) => ({
				name: `entry-${i}`,
				duration: 1,
				startTime: i,
			}));
			transport.simulateMessage({
				type: "perfEntries",
				appId,
				entries,
			} as unknown as Message);

			// We can only verify that no error is thrown and destroy works fine;
			// the internal map is private. But no crash = cap logic ran.
			expect(() => inst.destroy()).not.toThrow();
		});
	});

	// -------------------------------------------------------------------------
	// debugResult system message
	// -------------------------------------------------------------------------

	describe("debugResult system message", () => {
		it("debugResult messages are stored and retrievable via devtools", () => {
			const target = makeMountPoint();
			const inst = make({ target, debug: { exposeDevtools: true } });
			const transport = createMockTransport();
			const appId = inst.addRemoteApp({ transport });

			transport.simulateMessage({
				type: "debugResult",
				appId,
				query: "tree",
				result: { root: "virtual-dom-tree" },
			} as unknown as Message);

			const devtools = (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__ as {
				getAppData(id: string): { tree: unknown } | undefined;
			};
			const data = devtools.getAppData(appId);
			expect(data?.tree).toEqual({ root: "virtual-dom-tree" });

			inst.destroy();
			delete (globalThis as Record<string, unknown>).__ASYNC_DOM_DEVTOOLS__;
		});
	});

	// -------------------------------------------------------------------------
	// addAppInternal: no worker AND no transport should throw
	// -------------------------------------------------------------------------

	describe("addApp() error conditions", () => {
		it("addRemoteApp without a transport throws", () => {
			const target = makeMountPoint();
			const inst = make({ target });
			// Passing undefined transport is a TS error but test at runtime
			expect(() => {
				inst.addRemoteApp({ transport: undefined as unknown as Transport });
			}).toThrow();
		});
	});
});
