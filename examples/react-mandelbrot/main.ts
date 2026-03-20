import { createElement, useState, useCallback, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AsyncDom } from "../../src/react/async-dom-component.ts";
import type { AsyncDomInstance } from "../../src/main-thread/index.ts";

function App() {
	const [ready, setReady] = useState(false);
	const hueRef = useRef(0);
	const hueElRef = useRef<HTMLDivElement | null>(null);

	const onReady = useCallback((inst: AsyncDomInstance) => {
		setReady(true);
		console.log("async-dom React instance ready:", inst);
	}, []);

	const onError = useCallback((err: unknown) => {
		console.error("async-dom error:", err);
	}, []);

	// Animate hue via rAF to prove main thread responsiveness (no re-renders)
	useEffect(() => {
		let rafId = 0;
		function tick() {
			hueRef.current = (hueRef.current + 0.5) % 360;
			const el = hueElRef.current;
			if (el) {
				const h = Math.round(hueRef.current);
				el.style.background = `hsl(${h}, 70%, 20%)`;
				el.style.borderColor = `hsl(${h}, 70%, 40%)`;
				el.textContent = `\u{1F3A8} Main thread alive \u2014 hue: ${h}\u00B0`;
			}
			rafId = requestAnimationFrame(tick);
		}
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, []);

	return createElement(
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
		// Header
		createElement(
			"div",
			{ style: { textAlign: "center", marginBottom: "20px" } },
			createElement(
				"h1",
				{ style: { fontSize: "1.8rem", fontWeight: 700 } },
				createElement("span", { style: { color: "#58a6ff" } }, "React"),
				" + async-dom: Mandelbrot Explorer",
			),
			createElement(
				"p",
				{ style: { color: "#8b949e", marginTop: "6px" } },
				"The fractal is computed & rendered entirely in a Web Worker. This React UI stays responsive.",
			),
		),

		// Status bar
		createElement(
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
			createElement("div", {
				ref: hueElRef,
				style: {
					padding: "8px 16px",
					borderRadius: "8px",
					background: "hsl(0, 70%, 20%)",
					border: "1px solid hsl(0, 70%, 40%)",
					fontSize: "0.85rem",
				},
			}),
			createElement(
				"div",
				{
					style: {
						padding: "8px 16px",
						borderRadius: "8px",
						background: ready ? "#1a3a1a" : "#3a1a1a",
						border: `1px solid ${ready ? "#2ea043" : "#da3633"}`,
						fontSize: "0.85rem",
					},
				},
				ready ? "\u2705 Worker ready" : "\u23F3 Loading worker...",
			),
		),

		// Info
		createElement(
			"p",
			{
				style: {
					textAlign: "center",
					color: "#8b949e",
					fontSize: "0.85rem",
					marginBottom: "16px",
				},
			},
			"Click on any region of the fractal to zoom in. The worker recomputes all ",
			createElement("strong", null, "4,800"),
			" pixels on every click.",
		),

		// AsyncDom component
		createElement(AsyncDom, {
			worker: () =>
				new Worker(new URL("./worker.ts", import.meta.url), {
					type: "module",
				}),
			onReady,
			onError,
			fallback: createElement(
				"div",
				{
					style: {
						textAlign: "center",
						padding: "60px 20px",
						color: "#8b949e",
					},
				},
				createElement(
					"div",
					{
						style: {
							fontSize: "2rem",
							marginBottom: "12px",
							animation: "pulse 1.5s ease-in-out infinite",
						},
					},
					"\u{1F300}",
				),
				createElement("p", null, "Initializing Mandelbrot worker..."),
				createElement(
					"style",
					null,
					"@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }",
				),
			),
			style: {
				maxWidth: "720px",
				margin: "0 auto",
				border: "1px solid #30363d",
				borderRadius: "8px",
				overflow: "hidden",
				background: "#161b22",
			},
		}),

		// API showcase footer
		createElement(
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
			createElement(
				"div",
				{
					style: {
						background: "#161b22",
						border: "1px solid #30363d",
						borderRadius: "8px",
						padding: "14px",
					},
				},
				createElement(
					"h3",
					{ style: { fontSize: "0.8rem", color: "#58a6ff", marginBottom: "6px" } },
					"API: <AsyncDom> Component",
				),
				createElement(
					"code",
					{
						style: {
							fontSize: "0.7rem",
							color: "#8b949e",
							display: "block",
							whiteSpace: "pre-wrap",
							lineHeight: 1.5,
						},
					},
					'<AsyncDom\n  worker={() => new Worker(...)}\n  fallback={<Loading />}\n  onReady={(inst) => ...}\n  onError={(err) => ...}\n/>',
				),
			),
			createElement(
				"div",
				{
					style: {
						background: "#161b22",
						border: "1px solid #30363d",
						borderRadius: "8px",
						padding: "14px",
					},
				},
				createElement(
					"h3",
					{ style: { fontSize: "0.8rem", color: "#58a6ff", marginBottom: "6px" } },
					"API: useAsyncDom Hook",
				),
				createElement(
					"code",
					{
						style: {
							fontSize: "0.7rem",
							color: "#8b949e",
							display: "block",
							whiteSpace: "pre-wrap",
							lineHeight: 1.5,
						},
					},
					'const { containerRef, instance } =\n  useAsyncDom({\n    worker: "./worker.ts",\n    onReady: (inst) => ...\n  });\nreturn <div ref={containerRef} />;',
				),
			),
		),
	);
}

const root = createRoot(document.getElementById("app")!);
root.render(createElement(App));
