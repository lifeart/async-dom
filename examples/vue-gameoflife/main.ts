import { createApp, h, ref, onMounted, onBeforeUnmount } from "vue";
import { AsyncDom } from "../../src/vue/AsyncDom.ts";
import type { AsyncDomInstance } from "../../src/main-thread/index.ts";

const App = {
	setup() {
		const ready = ref(false);
		const hueEl = ref<HTMLDivElement | null>(null);
		let hue = 0;
		let rafId = 0;

		const onReady = (inst: AsyncDomInstance) => {
			ready.value = true;
			console.log("async-dom Vue instance ready:", inst);
		};

		onMounted(() => {
			function tick() {
				hue = (hue + 0.5) % 360;
				const el = hueEl.value;
				if (el) {
					const h = Math.round(hue);
					el.style.background = `hsl(${h}, 70%, 20%)`;
					el.style.borderColor = `hsl(${h}, 70%, 40%)`;
					el.textContent = `\u{1F3A8} Main thread alive \u2014 hue: ${h}\u00B0`;
				}
				rafId = requestAnimationFrame(tick);
			}
			rafId = requestAnimationFrame(tick);
		});

		onBeforeUnmount(() => cancelAnimationFrame(rafId));

		return () =>
			h(
				"div",
				{
					style: {
						fontFamily: "system-ui, -apple-system, sans-serif",
						background: "#0d1117",
						color: "#e6edf3",
						minHeight: "100vh",
						padding: "20px",
					},
				},
				[
					// Header
					h("div", { style: { textAlign: "center", marginBottom: "20px" } }, [
						h("h1", { style: { fontSize: "1.8rem", fontWeight: "700" } }, [
							h("span", { style: { color: "#42b883" } }, "Vue"),
							" + async-dom: Game of Life",
						]),
						h(
							"p",
							{ style: { color: "#8b949e", marginTop: "6px" } },
							"Cellular automata simulation running entirely in a Web Worker. This Vue UI stays responsive.",
						),
					]),

					// Status bar
					h(
						"div",
						{
							style: {
								display: "flex",
								justifyContent: "center",
								gap: "16px",
								marginBottom: "16px",
								flexWrap: "wrap",
							},
						},
						[
							h("div", {
								ref: hueEl,
								style: {
									padding: "8px 16px",
									borderRadius: "8px",
									background: "hsl(0, 70%, 20%)",
									border: "1px solid hsl(0, 70%, 40%)",
									fontSize: "0.85rem",
								},
							}),
							h(
								"div",
								{
									style: {
										padding: "8px 16px",
										borderRadius: "8px",
										background: ready.value ? "#1a3a1a" : "#3a1a1a",
										border: `1px solid ${ready.value ? "#2ea043" : "#da3633"}`,
										fontSize: "0.85rem",
									},
								},
								ready.value ? "\u2705 Worker ready" : "\u23F3 Loading worker...",
							),
						],
					),

					// Info
					h(
						"p",
						{
							style: {
								textAlign: "center",
								color: "#8b949e",
								fontSize: "0.85rem",
								marginBottom: "16px",
							},
						},
						[
							"Click cells to toggle. Use worker-side controls. The worker manages a ",
							h("strong", null, "60\u00D740"),
							" grid (2,400 cells) and runs the simulation + DOM updates.",
						],
					),

					// AsyncDom with fallback slot
					h(
						AsyncDom,
						{
							worker: () =>
								new Worker(new URL("./worker.ts", import.meta.url), {
									type: "module",
								}),
							onReady,
							style: {
								maxWidth: "720px",
								margin: "0 auto",
								border: "1px solid #30363d",
								borderRadius: "8px",
								overflow: "hidden",
								background: "#161b22",
							},
						},
						{
							fallback: () => [
								h(
									"div",
									{
										style: {
											textAlign: "center",
											padding: "60px 20px",
											color: "#8b949e",
										},
									},
									[
										h(
											"div",
											{ style: { fontSize: "2rem", marginBottom: "12px" } },
											"\u{1F9EC}",
										),
										h("p", null, "Initializing Game of Life worker..."),
									],
								),
							],
						},
					),

					// API showcase
					h(
						"div",
						{
							style: {
								maxWidth: "720px",
								margin: "16px auto 0",
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: "12px",
							},
						},
						[
							h(
								"div",
								{
									style: {
										background: "#161b22",
										border: "1px solid #30363d",
										borderRadius: "8px",
										padding: "14px",
									},
								},
								[
									h(
										"h3",
										{
											style: {
												fontSize: "0.8rem",
												color: "#42b883",
												marginBottom: "6px",
											},
										},
										"API: <AsyncDom> Component",
									),
									h(
										"code",
										{
											style: {
												fontSize: "0.7rem",
												color: "#8b949e",
												display: "block",
												whiteSpace: "pre-wrap",
												lineHeight: "1.5",
											},
										},
										'<AsyncDom\n  :worker="() => new Worker(...)"\n  @ready="onReady"\n>\n  <template #fallback>\n    <p>Loading...</p>\n  </template>\n</AsyncDom>',
									),
								],
							),
							h(
								"div",
								{
									style: {
										background: "#161b22",
										border: "1px solid #30363d",
										borderRadius: "8px",
										padding: "14px",
									},
								},
								[
									h(
										"h3",
										{
											style: {
												fontSize: "0.8rem",
												color: "#42b883",
												marginBottom: "6px",
											},
										},
										"API: useAsyncDom Composable",
									),
									h(
										"code",
										{
											style: {
												fontSize: "0.7rem",
												color: "#8b949e",
												display: "block",
												whiteSpace: "pre-wrap",
												lineHeight: "1.5",
											},
										},
										'const { containerRef, instance }\n  = useAsyncDom({\n    worker: "./worker.ts",\n    onReady: (inst) => ...\n  });\n// <div ref="containerRef" />',
									),
								],
							),
						],
					),
				],
			);
	},
};

createApp(App).mount("#app");
