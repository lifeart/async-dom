import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

const mockInstance = {
	start: vi.fn(),
	stop: vi.fn(),
	destroy: vi.fn(),
	addApp: vi.fn(),
	removeApp: vi.fn(),
};

const createAsyncDom = vi.fn(() => ({ ...mockInstance }));

// Mock the main-thread module
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

describe("vue adapter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("exports", () => {
		it("exports AsyncDom component", async () => {
			const mod = await import("../../src/vue/index.ts");
			expect(mod.AsyncDom).toBeDefined();
			expect(mod.AsyncDom.name).toBe("AsyncDom");
		});

		it("exports useAsyncDom composable", async () => {
			const mod = await import("../../src/vue/index.ts");
			expect(mod.useAsyncDom).toBeDefined();
			expect(typeof mod.useAsyncDom).toBe("function");
		});

		it("exports AsyncDomProps type", async () => {
			// Type-only export — just verify module loads without error
			const mod = await import("../../src/vue/index.ts");
			expect(mod).toBeDefined();
		});
	});

	describe("AsyncDom component", () => {
		it("has correct props definition", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");
			expect(AsyncDom.props).toBeDefined();
			expect(AsyncDom.props.worker).toBeDefined();
			expect(AsyncDom.props.worker.required).toBe(true);
			expect(AsyncDom.props.scheduler).toBeDefined();
			expect(AsyncDom.props.debug).toBeDefined();
		});

		it("has correct emits", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");
			expect(AsyncDom.emits).toBeDefined();
			expect(AsyncDom.emits.ready).toBeDefined();
			expect(AsyncDom.emits.error).toBeDefined();
		});

		it("renders wrapper with inner container div", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");

			const wrapper = mount(AsyncDom, {
				props: { worker: () => createMockWorker() },
			});

			// Outer wrapper div > inner container div
			const outerDiv = wrapper.element;
			expect(outerDiv.tagName).toBe("DIV");
			const innerDiv = outerDiv.querySelector("div");
			expect(innerDiv).toBeTruthy();

			wrapper.unmount();
		});

		it("renders fallback slot while instance is loading", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");

			const wrapper = mount(AsyncDom, {
				props: { worker: () => createMockWorker() },
				slots: {
					fallback: () => h("p", null, "Loading..."),
				},
			});

			// Before async import resolves, fallback should be visible
			expect(wrapper.text()).toContain("Loading...");

			wrapper.unmount();
		});

		it("removes fallback after instance is ready", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");

			const wrapper = mount(AsyncDom, {
				props: { worker: () => createMockWorker() },
				slots: {
					fallback: () => h("p", null, "Loading..."),
				},
			});

			// Wait for async import + onMounted
			await new Promise((r) => setTimeout(r, 20));
			await nextTick();

			expect(wrapper.text()).not.toContain("Loading...");

			wrapper.unmount();
		});

		it("does not clear worker-rendered content when instance becomes ready", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");

			const wrapper = mount(AsyncDom, {
				props: { worker: () => createMockWorker() },
				slots: {
					fallback: () => h("p", null, "Loading..."),
				},
			});

			// Wait for instance creation
			await new Promise((r) => setTimeout(r, 20));
			await nextTick();

			// Simulate worker having rendered content into the inner container
			const innerDiv = wrapper.element.querySelector("div");
			expect(innerDiv).toBeTruthy();

			const workerContent = document.createElement("span");
			workerContent.textContent = "Worker rendered this";
			innerDiv?.appendChild(workerContent);

			// Trigger another re-render
			await nextTick();

			// Worker content should still be in the inner container
			expect(innerDiv?.textContent).toContain("Worker rendered this");

			wrapper.unmount();
		});

		it("emits ready event after instance creation", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");

			const wrapper = mount(AsyncDom, {
				props: { worker: () => createMockWorker() },
			});

			await new Promise((r) => setTimeout(r, 20));
			await nextTick();

			const readyEvents = wrapper.emitted("ready");
			expect(readyEvents).toBeTruthy();
			expect(readyEvents?.length).toBe(1);
			expect(readyEvents?.[0][0]).toHaveProperty("start");
			expect(readyEvents?.[0][0]).toHaveProperty("destroy");

			wrapper.unmount();
		});

		it("calls createAsyncDom with the inner container as target", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");

			const wrapper = mount(AsyncDom, {
				props: { worker: () => createMockWorker() },
			});

			await new Promise((r) => setTimeout(r, 20));
			await nextTick();

			expect(createAsyncDom).toHaveBeenCalledOnce();
			const config = createAsyncDom.mock.calls[0][0] as { target: Element };
			// Target should be the inner container div, not the outer wrapper
			expect(config.target.tagName).toBe("DIV");
			expect(config.target.parentElement).toBe(wrapper.element);

			wrapper.unmount();
		});

		it("destroys instance on unmount", async () => {
			const { AsyncDom } = await import("../../src/vue/AsyncDom.ts");

			const wrapper = mount(AsyncDom, {
				props: { worker: () => createMockWorker() },
			});

			await new Promise((r) => setTimeout(r, 20));
			await nextTick();

			expect(mockInstance.start).toHaveBeenCalled();

			wrapper.unmount();

			expect(mockInstance.destroy).toHaveBeenCalled();
		});
	});

	describe("useAsyncDom composable", () => {
		it("returns containerRef and instance ref", async () => {
			const { useAsyncDom } = await import("../../src/vue/use-async-dom.ts");

			let result: ReturnType<typeof useAsyncDom> | null = null;

			const TestComponent = defineComponent({
				setup() {
					// biome-ignore lint/correctness/useHookAtTopLevel: Vue composable, not React hook
					result = useAsyncDom({ worker: () => createMockWorker() });
					return () => h("div", { ref: result?.containerRef });
				},
			});

			const wrapper = mount(TestComponent);
			expect(result).toBeTruthy();
			expect(result?.containerRef.value).toBeInstanceOf(HTMLDivElement);
			expect(result?.instance.value).toBeNull();

			wrapper.unmount();
		});

		it("sets instance after mount", async () => {
			const { useAsyncDom } = await import("../../src/vue/use-async-dom.ts");

			let result: ReturnType<typeof useAsyncDom> | null = null;

			const TestComponent = defineComponent({
				setup() {
					// biome-ignore lint/correctness/useHookAtTopLevel: Vue composable, not React hook
					result = useAsyncDom({ worker: () => createMockWorker() });
					return () => h("div", { ref: result?.containerRef });
				},
			});

			const wrapper = mount(TestComponent);

			await new Promise((r) => setTimeout(r, 20));
			await nextTick();

			expect(result?.instance.value).toBeTruthy();
			expect(result?.instance.value).toHaveProperty("start");

			wrapper.unmount();
		});

		it("calls onReady callback", async () => {
			const { useAsyncDom } = await import("../../src/vue/use-async-dom.ts");
			const onReady = vi.fn();

			const TestComponent = defineComponent({
				setup() {
					// biome-ignore lint/correctness/useHookAtTopLevel: Vue composable, not React hook
					const { containerRef } = useAsyncDom({
						worker: () => createMockWorker(),
						onReady,
					});
					return () => h("div", { ref: containerRef });
				},
			});

			const wrapper = mount(TestComponent);

			await new Promise((r) => setTimeout(r, 20));
			await nextTick();

			expect(onReady).toHaveBeenCalledOnce();

			wrapper.unmount();
		});

		it("resolves debug: true to full debug options", async () => {
			const { useAsyncDom } = await import("../../src/vue/use-async-dom.ts");

			const TestComponent = defineComponent({
				setup() {
					// biome-ignore lint/correctness/useHookAtTopLevel: Vue composable, not React hook
					const { containerRef } = useAsyncDom({
						worker: () => createMockWorker(),
						debug: true,
					});
					return () => h("div", { ref: containerRef });
				},
			});

			const wrapper = mount(TestComponent);

			await new Promise((r) => setTimeout(r, 20));
			await nextTick();

			const config = createAsyncDom.mock.calls[0]?.[0] as { debug?: object };
			expect(config.debug).toEqual({
				logMutations: true,
				logEvents: true,
				exposeDevtools: true,
			});

			wrapper.unmount();
		});

		it("terminates worker if unmounted before async import resolves", async () => {
			const { useAsyncDom } = await import("../../src/vue/use-async-dom.ts");
			const mockWorker = createMockWorker();

			createAsyncDom.mockClear();

			const TestComponent = defineComponent({
				setup() {
					// biome-ignore lint/correctness/useHookAtTopLevel: Vue composable, not React hook
					const { containerRef } = useAsyncDom({
						worker: () => mockWorker,
					});
					return () => h("div", { ref: containerRef });
				},
			});

			const wrapper = mount(TestComponent);
			// Unmount immediately
			wrapper.unmount();

			// Wait for async import to resolve
			await new Promise((r) => setTimeout(r, 20));

			expect(mockWorker.terminate).toHaveBeenCalled();
		});
	});
});
