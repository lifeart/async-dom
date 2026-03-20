import { asyncDom } from "../../src/svelte/index.ts";
import type { AsyncDomInstance } from "../../src/main-thread/index.ts";

// --- Build the UI with vanilla DOM (no Svelte compiler needed) ---
const app = document.getElementById("app")!;
app.style.fontFamily = "system-ui, -apple-system, sans-serif";
app.style.background = "#0d1117";
app.style.color = "#e6edf3";
app.style.minHeight = "100vh";
app.style.padding = "20px";

// Header
const header = document.createElement("div");
header.style.textAlign = "center";
header.style.marginBottom = "20px";
header.innerHTML = `
  <h1 style="font-size: 1.8rem; font-weight: 700;">
    <span style="color: #ff3e00;">Svelte</span> + async-dom: Particle Life
  </h1>
  <p style="color: #8b949e; margin-top: 6px;">
    Particle simulation with emergent behaviors — computed &amp; rendered entirely in a Web Worker. This UI stays responsive.
  </p>
`;
app.appendChild(header);

// Status bar
const statusBar = document.createElement("div");
statusBar.style.cssText =
  "display: flex; justify-content: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;";

const hueEl = document.createElement("div");
hueEl.style.cssText =
  "padding: 8px 16px; border-radius: 8px; background: hsl(0, 70%, 20%); border: 1px solid hsl(0, 70%, 40%); font-size: 0.85rem;";

const readyEl = document.createElement("div");
readyEl.style.cssText =
  "padding: 8px 16px; border-radius: 8px; background: #3a1a1a; border: 1px solid #da3633; font-size: 0.85rem;";
readyEl.textContent = "\u23F3 Loading worker...";

statusBar.appendChild(hueEl);
statusBar.appendChild(readyEl);
app.appendChild(statusBar);

// Info
const info = document.createElement("p");
info.style.cssText =
  "text-align: center; color: #8b949e; font-size: 0.85rem; margin-bottom: 16px;";
info.innerHTML =
  'Colored particles follow attraction/repulsion rules creating emergent life-like patterns. The worker manages <strong>300+</strong> particles and renders a <strong>60\u00D760</strong> grid (3,600 cells).';
app.appendChild(info);

// Container for async-dom (the worker will render into this)
const container = document.createElement("div");
container.style.cssText =
  "max-width: 720px; margin: 0 auto; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; background: #161b22;";

// Loading fallback
const fallback = document.createElement("div");
fallback.style.cssText =
  "text-align: center; padding: 60px 20px; color: #8b949e;";
fallback.innerHTML = `
  <div style="font-size: 2rem; margin-bottom: 12px; animation: pulse 1.5s ease-in-out infinite;">\u2728</div>
  <p>Initializing Particle Life worker...</p>
  <style>@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }</style>
`;
container.appendChild(fallback);
app.appendChild(container);

// API showcase footer
const footer = document.createElement("div");
footer.style.cssText =
  "max-width: 720px; margin: 16px auto 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;";
footer.innerHTML = `
  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px;">
    <h3 style="font-size: 0.8rem; color: #ff3e00; margin-bottom: 6px;">API: use:asyncDom Action</h3>
    <code style="font-size: 0.7rem; color: #8b949e; display: block; white-space: pre-wrap; line-height: 1.5;">&lt;div use:asyncDom={{
  worker: "./worker.ts",
  onReady: (inst) =&gt; ...,
  onError: (err) =&gt; ...
}} /&gt;</code>
  </div>
  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px;">
    <h3 style="font-size: 0.8rem; color: #ff3e00; margin-bottom: 6px;">API: Direct Action Call</h3>
    <code style="font-size: 0.7rem; color: #8b949e; display: block; white-space: pre-wrap; line-height: 1.5;">import { asyncDom } from
  "async-dom/svelte";

const { destroy } = asyncDom(
  node, {
    worker: () =&gt; new Worker(...),
    onReady: (inst) =&gt; ...
  });</code>
  </div>
`;
app.appendChild(footer);

// --- Animate hue via rAF to prove main-thread responsiveness ---
let hue = 0;
let rafId = 0;
function tick() {
  hue = (hue + 0.5) % 360;
  const h = Math.round(hue);
  hueEl.style.background = `hsl(${h}, 70%, 20%)`;
  hueEl.style.borderColor = `hsl(${h}, 70%, 40%)`;
  hueEl.textContent = `\u{1F3A8} Main thread alive \u2014 hue: ${h}\u00B0`;
  rafId = requestAnimationFrame(tick);
}
rafId = requestAnimationFrame(tick);

// --- Apply the Svelte asyncDom action directly ---
const onReady = (inst: AsyncDomInstance) => {
  // Remove fallback
  if (fallback.parentNode) fallback.remove();
  // Update status
  readyEl.style.background = "#1a3a1a";
  readyEl.style.borderColor = "#2ea043";
  readyEl.textContent = "\u2705 Worker ready";
  console.log("async-dom Svelte action instance ready:", inst);
};

const onError = (err: unknown) => {
  console.error("async-dom error:", err);
};

const action = asyncDom(container, {
  worker: () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  onReady,
  onError,
});

// Cleanup on page unload
window.addEventListener("unload", () => {
  cancelAnimationFrame(rafId);
  action.destroy();
});
