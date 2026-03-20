import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

let lastCreatedInstance: ReturnType<typeof createMockInstance>;

function createMockInstance() {
	return {
		start: vi.fn(),
		stop: vi.fn(),
		destroy: vi.fn(),
		addApp: vi.fn(),
		removeApp: vi.fn(),
	};
}

const createAsyncDom = vi.fn(() => {
	lastCreatedInstance = createMockInstance();
	return lastCreatedInstance;
});

// Mock the main-thread module before importing React adapter
vi.mock("../../src/main-thread/index.ts", () => ({
	createAsyncDom: (...args: unknown[]) => createAsyncDom(...args),
}));

function createMockWorker() {
	return {
		postMessage: vi.fn(),
		terminate: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		onmessage: null,
		onerror: null,
		onmessageerror: null,
		dispatchEvent: vi.fn(),
	} as unknown as Worker;
}

describe("react adapter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("exports", () => {
		it("exports AsyncDom component", async () => {
			const mod = await import("../../src/react/index.ts");
			expect(mod.AsyncDom).toBeDefined();
			expect(typeof mod.AsyncDom).toBe("function");
		});

		it("exports useAsyncDom hook", async () => {
			const mod = await import("../../src/react/index.ts");
			expect(mod.useAsyncDom).toBeDefined();
			expect(typeof mod.useAsyncDom).toBe("function");
		});

		it("re-exports key types", async () => {
			const mod = await import("../../src/react/index.ts");
			// Type-only exports don't show at runtime, but named exports should exist
			expect(mod.AsyncDom).toBeDefined();
			expect(mod.useAsyncDom).toBeDefined();
		});
	});

	describe("useAsyncDom", () => {
		it("returns containerRef and null instance initially", async () => {
			const { useAsyncDom } = await import("../../src/react/use-async-dom.ts");

			const { result } = renderHook(() => useAsyncDom({ worker: () => createMockWorker() }));

			expect(result.current.containerRef).toBeDefined();
			expect(result.current.instance).toBeNull();
		});

		it("calls createAsyncDom with target element after mount", async () => {
			const { useAsyncDom } = await import("../../src/react/use-async-dom.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);

			const workerFactory = vi.fn(() => createMockWorker());

			const TestComponent = () => {
				const { containerRef } = useAsyncDom({ worker: workerFactory });
				return createElement("div", { ref: containerRef });
			};

			const root = createRoot(container);
			await act(async () => {
				root.render(createElement(TestComponent));
			});

			// Wait for async import to resolve
			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});

			expect(workerFactory).toHaveBeenCalledOnce();
			expect(createAsyncDom).toHaveBeenCalledOnce();
			expect(createAsyncDom.mock.calls[0][0]).toHaveProperty("target");
			expect(createAsyncDom.mock.calls[0][0]).toHaveProperty("worker");
			expect(lastCreatedInstance.start).toHaveBeenCalledOnce();

			root.unmount();
			container.remove();
		});

		it("calls onReady after instance creation", async () => {
			const { useAsyncDom } = await import("../../src/react/use-async-dom.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);
			const onReady = vi.fn();

			const TestComponent = () => {
				const { containerRef } = useAsyncDom({
					worker: () => createMockWorker(),
					onReady,
				});
				return createElement("div", { ref: containerRef });
			};

			const root = createRoot(container);
			await act(async () => {
				root.render(createElement(TestComponent));
			});
			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});

			expect(onReady).toHaveBeenCalledOnce();
			expect(onReady.mock.calls[0][0]).toHaveProperty("start");
			expect(onReady.mock.calls[0][0]).toHaveProperty("destroy");

			root.unmount();
			container.remove();
		});

		it("calls destroy on unmount", async () => {
			const { useAsyncDom } = await import("../../src/react/use-async-dom.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);

			const TestComponent = () => {
				const { containerRef } = useAsyncDom({
					worker: () => createMockWorker(),
				});
				return createElement("div", { ref: containerRef });
			};

			const root = createRoot(container);
			await act(async () => {
				root.render(createElement(TestComponent));
			});
			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});

			expect(createAsyncDom).toHaveBeenCalled();
			const instanceDestroy = lastCreatedInstance.destroy;

			await act(async () => {
				root.unmount();
			});

			expect(instanceDestroy).toHaveBeenCalled();

			container.remove();
		});

		it("cleans up instance on fast unmount after creation", async () => {
			// With mocked modules, the dynamic import resolves synchronously,
			// so we test the destroy-after-create path.
			const { useAsyncDom } = await import("../../src/react/use-async-dom.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);

			const TestComponent = () => {
				const { containerRef } = useAsyncDom({
					worker: () => createMockWorker(),
				});
				return createElement("div", { ref: containerRef });
			};

			const root = createRoot(container);
			await act(async () => {
				root.render(createElement(TestComponent));
			});
			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});

			const instanceDestroy = lastCreatedInstance.destroy;

			await act(async () => {
				root.unmount();
			});

			expect(instanceDestroy).toHaveBeenCalled();
			container.remove();
		});

		it("resolves debug: true to full debug options", async () => {
			const { useAsyncDom } = await import("../../src/react/use-async-dom.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);

			const TestComponent = () => {
				const { containerRef } = useAsyncDom({
					worker: () => createMockWorker(),
					debug: true,
				});
				return createElement("div", { ref: containerRef });
			};

			const root = createRoot(container);
			await act(async () => {
				root.render(createElement(TestComponent));
			});
			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});

			const config = createAsyncDom.mock.calls[0]?.[0] as { debug?: object };
			expect(config.debug).toEqual({
				logMutations: true,
				logEvents: true,
				exposeDevtools: true,
			});

			root.unmount();
			container.remove();
		});
	});

	describe("AsyncDom component", () => {
		it("renders a wrapper div with an inner container div", async () => {
			const { AsyncDom } = await import("../../src/react/async-dom-component.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);

			const root = createRoot(container);
			await act(async () => {
				root.render(
					createElement(AsyncDom, {
						worker: () => createMockWorker(),
					}),
				);
			});

			// Should render wrapper > container structure
			const wrapper = container.firstElementChild;
			expect(wrapper).toBeTruthy();
			expect(wrapper?.tagName).toBe("DIV");
			// Inner container div for async-dom
			const innerContainer = wrapper?.querySelector("div");
			expect(innerContainer).toBeTruthy();

			root.unmount();
			container.remove();
		});

		it("hides fallback after instance is ready", async () => {
			const { AsyncDom } = await import("../../src/react/async-dom-component.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);

			const root = createRoot(container);
			await act(async () => {
				root.render(
					createElement(AsyncDom, {
						worker: () => createMockWorker(),
						fallback: createElement("p", null, "Loading..."),
					}),
				);
			});

			// Wait for async import + effect to resolve
			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});

			// After instance is ready, fallback should be gone
			expect(container.textContent).not.toContain("Loading...");

			root.unmount();
			container.remove();
		});

		it("does not clear worker-rendered content on re-render", async () => {
			const { AsyncDom } = await import("../../src/react/async-dom-component.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);

			const root = createRoot(container);
			await act(async () => {
				root.render(
					createElement(AsyncDom, {
						worker: () => createMockWorker(),
						fallback: createElement("p", null, "Loading..."),
					}),
				);
			});

			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});

			// Simulate worker having rendered content into the inner container
			const wrapper = container.firstElementChild;
			const innerContainer = wrapper?.children[wrapper.children.length - 1];
			expect(innerContainer).toBeTruthy();

			const workerContent = document.createElement("div");
			workerContent.textContent = "Worker rendered this";
			innerContainer?.appendChild(workerContent);

			// Force a re-render (e.g., by re-rendering the same component)
			await act(async () => {
				root.render(
					createElement(AsyncDom, {
						worker: () => createMockWorker(),
						fallback: createElement("p", null, "Loading..."),
					}),
				);
			});

			// Worker content should still be present in the inner container
			expect(innerContainer?.textContent).toContain("Worker rendered this");

			root.unmount();
			container.remove();
		});

		it("passes className and style to wrapper div", async () => {
			const { AsyncDom } = await import("../../src/react/async-dom-component.ts");

			const container = document.createElement("div");
			document.body.appendChild(container);

			const root = createRoot(container);
			await act(async () => {
				root.render(
					createElement(AsyncDom, {
						worker: () => createMockWorker(),
						className: "my-class",
						style: { maxWidth: "500px" },
					}),
				);
			});

			const wrapper = container.firstElementChild as HTMLElement;
			expect(wrapper.className).toBe("my-class");
			expect(wrapper.style.maxWidth).toBe("500px");

			root.unmount();
			container.remove();
		});
	});
});
