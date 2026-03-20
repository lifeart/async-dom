import { createAsyncDom } from "../../src/main-thread/index.ts";

// No React, Vue, or Svelte runtime on the main thread.
// Each worker runs its own app — async-dom handles everything.

const asyncDom = createAsyncDom({
	target: document.body,
	debug: { exposeDevtools: true, logWarnings: true },
});

// --- Status pills ---
const huePill = document.getElementById("hue-pill")!;
const reactStatus = document.getElementById("react-status")!;
const vueStatus = document.getElementById("vue-status")!;
const svelteStatus = document.getElementById("svelte-status")!;

function markReady(el: HTMLElement, label: string) {
	el.style.background = "#1a3a1a";
	el.style.borderColor = "#2ea043";
	el.textContent = `\u2705 ${label}`;
}

// --- Main-thread hue animation (proves zero jank) ---
let hue = 0;
function tick() {
	hue = (hue + 0.5) % 360;
	const h = Math.round(hue);
	huePill.style.background = `hsl(${h}, 70%, 20%)`;
	huePill.style.borderColor = `hsl(${h}, 70%, 40%)`;
	huePill.textContent = `\u{1F3A8} Main thread alive \u2014 hue: ${h}\u00B0`;
	requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// --- 1. React panel: Mandelbrot worker (shadow DOM isolated) ---
asyncDom.addApp({
	name: "mandelbrot",
	worker: new Worker(new URL("./mandelbrot-worker.ts", import.meta.url), { type: "module" }),
	mountPoint: "#react-root",
	shadow: true,
	onError: (err) => console.error("[mandelbrot]", err),
});
markReady(reactStatus, "React worker");

// --- 2. Vue panel: Game of Life worker (shadow DOM isolated) ---
asyncDom.addApp({
	name: "gameoflife",
	worker: new Worker(new URL("./gameoflife-worker.ts", import.meta.url), { type: "module" }),
	mountPoint: "#vue-root",
	shadow: true,
	onError: (err) => console.error("[gameoflife]", err),
});
markReady(vueStatus, "Vue worker");

// --- 3. Svelte panel: Particles worker (shadow DOM isolated) ---
asyncDom.addApp({
	name: "particles",
	worker: new Worker(new URL("./particles-worker.ts", import.meta.url), { type: "module" }),
	mountPoint: "#svelte-root",
	shadow: true,
	onError: (err) => console.error("[particles]", err),
});
markReady(svelteStatus, "Svelte worker");

asyncDom.start();
