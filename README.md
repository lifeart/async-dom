# async-dom

[![CI](https://github.com/lifeart/async-dom/actions/workflows/ci.yml/badge.svg)](https://github.com/lifeart/async-dom/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@lifeart/async-dom)](https://www.npmjs.com/package/@lifeart/async-dom)
[![license](https://img.shields.io/npm/l/@lifeart/async-dom)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@lifeart/async-dom)](https://bundlephobia.com/package/@lifeart/async-dom)

**Your application runs in a Web Worker. The DOM is just a projection.**

async-dom moves your entire UI framework — React, Vue, Svelte, or vanilla JS — into a Web Worker. The main thread receives only serialized mutation instructions through a message-passing channel and applies them with a frame-budgeted scheduler at 60 fps.

This architecture doesn't just improve performance. It fundamentally changes what is accessible to scrapers, bots, browser extensions, and anyone inspecting your page.

**[Live Demo](https://lifeart.github.io/async-dom/)** · **[Demo with DevTools](https://lifeart.github.io/async-dom/?debug)** · **[npm](https://www.npmjs.com/package/@lifeart/async-dom)**

---

## Why async-dom?

### The web has a content protection problem

Cloudflare blocked **416 billion AI bot requests** in the past year. OpenAI's crawl-to-referral ratio is 1,700:1 — they consume vastly more content than they return in traffic. `robots.txt` is voluntarily ignored. Legal battles (NYT vs OpenAI, Danish publishers vs OpenAI) are slow. The industry needs structural defenses, not polite requests.

### The web has a performance problem

JavaScript is single-threaded. The main thread handles rendering, user input, framework execution, and third-party scripts — all competing for the same 16ms frame budget. The result: jank, poor Core Web Vitals, and frustrated users.

### The web has a security problem

Traditional web apps expose everything: business logic in bundled JS, data structures in the DOM tree, auth tokens accessible to any XSS payload, and source code available to anyone with DevTools.

**async-dom addresses all three.**

---

## Real-World Use Cases

### Content Protection & Anti-Scraping

| Use Case | How async-dom helps |
| -------- | ------------------- |
| **AI scraping prevention** | Content never exists in initial HTML. `curl` and simple scrapers get an empty shell. Headless browsers see only rendered pixels, not structured data. |
| **Copyright & DRM** | Business logic and data stay in the worker. The DOM is a procedural artifact — not a template that maps 1:1 to source content. Per-session watermarking at the render layer makes leaked content traceable. |
| **NDA UI demos** | Share interactive prototypes where the client cannot copy JS logic — it runs server-side via WebSocket transport or inside an opaque worker. |
| **Exam & education anti-cheat** | Students interact with the UI but cannot access APIs, source code, or application state — the logic runs outside their reach. |
| **Dynamic obfuscation** | Class names, element IDs, and DOM structure can change on every page load, breaking CSS-selector-based scrapers without affecting the user experience. |

### Performance & Architecture

| Use Case | How async-dom helps |
| -------- | ------------------- |
| **Main thread liberation** | Your entire framework (React, Vue, Svelte) runs off the main thread. No framework runtime competes with user input or browser rendering. |
| **Heavy computation** | Sorting, filtering, data processing, fractal rendering — all happen in the worker without dropping frames. |
| **Multi-core utilization** | Modern devices have 4-8+ cores. Traditional web apps use one. async-dom lets you use the rest. |
| **SmartTV & low-power devices** | Run computation on a backend, stream DOM updates via WebSocket to constrained hardware for smooth 60fps UI. |
| **IoT streaming** | Execute the app on a server, stream rendered output to any connected device — TVs, kiosks, embedded displays. |

### Multi-Framework & Isolation

| Use Case | How async-dom helps |
| -------- | ------------------- |
| **Framework zoo** | Run React, Vue, and Svelte simultaneously on one page — each in its own worker with shadow DOM isolation. Zero conflicts, zero iframes. |
| **Micro-frontend isolation** | Each team ships a worker. CSS is encapsulated via shadow DOM. No shared global state. Independent deployment. |
| **Version coexistence** | Run different versions of the same framework side by side — React 18 and React 19 on one page, no conflicts. |
| **Cross-platform bridge** | Use async-dom as a rendering bridge for React Native, embedded views, or custom renderers. DOM mutations become platform events. |

### Collaboration & Debugging

| Use Case | How async-dom helps |
| -------- | ------------------- |
| **Parallel editing** | Capture events from multiple users via WebSocket and apply them to a single app instance — real-time collaborative UI. |
| **Marketing & UX analytics** | WebSocket transport broadcasts UI state to multiple observers. Watch exactly what users experience, live. |
| **Time-travel debugging** | Record and replay DOM mutation sequences. Scrub through rendering history. Compare tree snapshots. |
| **Rendering regression tests** | If mutation batches are identical, the UI is identical. Deterministic rendering without pixel comparison. |

---

## Quick Start

```bash
npm install @lifeart/async-dom
```

### main.ts

```ts
import { createAsyncDom } from "@lifeart/async-dom";

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});

const dom = createAsyncDom({
  target: document.getElementById("app")!,
  worker,
});

dom.start();
```

### worker.ts

```ts
import { createWorkerDom } from "@lifeart/async-dom/worker";

const { document } = createWorkerDom();

const div = document.createElement("div");
div.textContent = "Hello from a Web Worker!";
document.body.appendChild(div);

const input = document.createElement("input");
input.addEventListener("input", () => {
  console.log("Value:", input.value); // real value from main thread
});
document.body.appendChild(input);
```

That's it. Your app now runs entirely in a worker.

---

## Framework Adapters

async-dom ships first-class adapters for React, Vue, and Svelte.

### React

```tsx
import { AsyncDom } from "@lifeart/async-dom/react";

function App() {
  return (
    <AsyncDom
      worker="./app.worker.ts"
      debug
      fallback={<div>Loading...</div>}
      onReady={(instance) => console.log("ready")}
    />
  );
}
```

### Vue

```vue
<template>
  <AsyncDom worker="./app.worker.ts" :debug="true" @ready="onReady">
    <template #fallback><div>Loading...</div></template>
  </AsyncDom>
</template>

<script setup>
import { AsyncDom } from "@lifeart/async-dom/vue";
</script>
```

### Svelte

```svelte
<script>
  import { asyncDom } from "@lifeart/async-dom/svelte";
</script>

<div use:asyncDom={{ worker: "./app.worker.ts" }} />
```

---

## Package Exports

| Import path           | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `@lifeart/async-dom`           | Main thread API (`createAsyncDom`)           |
| `@lifeart/async-dom/worker`    | Worker thread API (virtual `document`)       |
| `@lifeart/async-dom/transport` | Transport backends (Worker, Binary, WS, Comlink) |
| `@lifeart/async-dom/react`     | React `<AsyncDom>` component + `useAsyncDom` hook |
| `@lifeart/async-dom/vue`       | Vue `<AsyncDom>` component + `useAsyncDom` composable |
| `@lifeart/async-dom/svelte`    | Svelte `asyncDom` action                     |
| `@lifeart/async-dom/vite-plugin` | Vite plugin (COOP/COEP headers, binary transport, error overlay) |

---

## How It Works

```
Worker Thread                  Main Thread
+--------------------+         +---------------------+
| VirtualDocument    |         |   ThreadManager     |
| (virtual DOM tree) |         |   (per-app comms)   |
|        |           |         |        |            |
| MutationCollector  |         |   FrameScheduler    |
|  (batch + coalesce)|         |   (budget, sort,    |
+--------|----------+         |    cull, fairness)   |
         |                     |        |            |
    Transport ───────────────> |   DomRenderer(s)    |
  (postMessage /               |   (per-app, apply   |
   binary / WS)                |    to real DOM)     |
         |                     |        |            |
         | <─── Events ─────── |   EventBridge       |
         |                     |   (DOM → Worker)    |
         |                     |        |            |
         | <─── Sync Reads ──> |   SyncChannelHost   |
         |  (SharedArrayBuffer |   (Atomics.notify)  |
         |   + Atomics.wait)   |                     |
+--------|----------+         +---------------------+
| SyncChannel       |
| (blocking reads)  |
+--------------------+
```

1. **Worker** — Your framework runs here. Virtual `document` and `window` provide the full DOM API. Mutations are batched and coalesced automatically.
2. **Transport** — Mutations are serialized (structured clone, binary codec, or WebSocket) and sent to the main thread.
3. **Scheduler** — The main thread applies mutations within a per-frame budget. Priority sorting, viewport culling, and adaptive batch sizing keep paint at 60 fps.
4. **Events** — User interactions on the main thread are serialized and dispatched to worker event handlers.
5. **Sync Reads** — `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()` block in the worker via `SharedArrayBuffer` + `Atomics` and return real values from the main thread.

---

## Security Model

async-dom provides multiple layers of protection:

### Worker Isolation (Architectural)

- **No direct DOM access** — XSS payloads in the page cannot reach worker internal state.
- **Serialized communication only** — all data passes through `postMessage`, a natural sanitization boundary.
- **Separate execution context** — workers are isolated at the browser engine level. No `shadowRoot` workaround, no extension bypass.
- **Token protection** — auth tokens and session state in the worker are inaccessible to malicious main-thread scripts.

### Content Sanitization (Active)

- **HTML sanitizer** — `innerHTML` strips `<script>`, `<iframe>`, `<style>`, `<object>`, `on*` attributes, and `javascript:`/`data:text/html` URIs.
- **Property allowlist** — `setProperty` only applies safe properties (`value`, `checked`, `textContent`, etc.).
- **Attribute filtering** — `setAttribute` blocks `on*` handlers and dangerous URIs.

### Anti-Scraping (Structural)

Unlike `robots.txt` (voluntary), CDN-level blocks (circumventable), or CAPTCHAs (UX-degrading), worker-based rendering is a **structural defense**:

- Empty HTML payload — no content for `curl`, `wget`, or simple GET requests.
- Procedural DOM — the rendered tree is an artifact of the mutation protocol, not a semantic template.
- Dynamic structure — class names, nesting, and attributes can randomize per session.
- Honeypot injection — the worker can insert invisible trap elements that bots follow but humans never see.
- Behavioral gating — the worker controls what renders and when, enabling real-time bot detection at the application layer.

---

## Transports

| Transport | Use case |
| --------- | -------- |
| `WorkerTransport` | Default — structured clone via `postMessage` |
| `BinaryWorkerTransport` | Production — 22-opcode binary codec with string deduplication |
| `WebSocketTransport` | Remote rendering — WebSocket with auto-reconnect and exponential backoff |
| `createComlinkEndpoint` | RPC — Comlink adapter (optional peer dependency) |

WebSocket transport enables powerful patterns: server-side rendering to any device, collaborative multi-user editing, and IoT streaming.

---

## Per-App Isolation

Run multiple independent applications on one page. Each gets its own renderer, node cache, event bridge, and optional shadow DOM:

```ts
const dom = createAsyncDom({ target: document.body });

dom.addApp({
  worker: new Worker("./react-app.ts", { type: "module" }),
  mountPoint: "#panel-a",
  shadow: true,
});

dom.addApp({
  worker: new Worker("./vue-app.ts", { type: "module" }),
  mountPoint: "#panel-b",
  shadow: { mode: "closed" },
});

dom.start();
```

---

## Sandbox Mode

Run third-party scripts that expect bare `document`/`window` globals — no modifications needed:

```ts
// Patch worker globals — bare `document` resolves to virtual DOM
const { document } = createWorkerDom({ sandbox: "global" });

// Sandboxed eval — Proxy + with for full variable interception
const { window } = createWorkerDom({ sandbox: "eval" });
window.eval(`document.body.innerHTML = "<h1>Works!</h1>"`);
```

| Mode | Bare `document` | `eval()` sandbox | Use case |
| ---- | ---------------- | ---------------- | -------- |
| `"global"` | Yes | No | Framework code with bare globals |
| `"eval"` | No | Yes | Third-party analytics/ads scripts |
| `true` | Yes | Yes | Maximum compatibility |

---

## Synchronous DOM Reads

Via `SharedArrayBuffer` + `Atomics.wait/notify` — real values, not guesses:

| API | Returns |
| --- | ------- |
| `el.getBoundingClientRect()` | Real DOMRect |
| `el.offsetWidth`, `clientHeight`, etc. | Real layout metrics |
| `window.getComputedStyle(el)` | Real computed styles |
| `window.innerWidth` / `innerHeight` | Real viewport size |

**Requires** COOP/COEP headers (automatic with the Vite plugin):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## Built-in DevTools

Add `?debug` to the URL or set `debug: { exposeDevtools: true }`:

| Tab | What it shows |
| --- | ------------- |
| **Tree** | Virtual DOM tree with node inspector — attributes, styles, event listeners, mutation history, "why updated?" trail. Snapshot & diff. |
| **Performance** | Frame budget flamechart, worker-to-main latency (P50/P95/P99), dropped frames, mutation type chart, coalescing breakdown, sync read heatmap, worker CPU profiler. |
| **Log** | Live mutation stream, color-coded diffs, event round-trip tracer, time-travel replay with scrubber. |
| **Warnings** | Grouped by code with docs and fixes. Suppressible. |
| **Graph** | Causality DAG: events --> mutation batches --> affected DOM nodes. |

Console API available via `__ASYNC_DOM_DEVTOOLS__` for programmatic inspection.

---

## Examples

**[Live examples hub](https://lifeart.github.io/async-dom/)**

| Example | Description | Tags |
| ------- | ----------- | ---- |
| [7000 Nodes Grid](./examples/vanilla) | Interactive color grid with 7,000 DOM nodes from a worker | performance, events |
| [Counter](./examples/counter) | Minimal example — click handlers, textContent updates | beginner |
| [Todo List](./examples/todo) | Input sync, dynamic DOM, classList, keyboard events | input sync, dynamic DOM |
| [Multi-App](./examples/multi-app) | Two workers in shadow DOM — CSS isolation | isolation, shadow DOM |
| [Audio Player](./examples/audio-player) | Audio playback controlled from a worker | media API, callMethod |
| [React: Mandelbrot](./examples/react-mandelbrot) | Fractal renderer — 4,800 pixels computed in a worker | React, heavy compute |
| [Vue: Game of Life](./examples/vue-gameoflife) | 60x40 grid simulation — 2,400 cell DOM updates | Vue, simulation |
| [Svelte: Particle Life](./examples/svelte-particles) | 320 particles with attraction/repulsion rules | Svelte, simulation |
| [Framework Showcase](./examples/framework-showcase) | React + Vue + Svelte on one page, zero framework runtime on main thread | multi-framework |
| [DevTools Panel](./examples/vanilla/?debug) | 7000-node grid with built-in debug panel | devtools |

```bash
npm run dev    # run all examples locally
```

---

## Comparison

| Feature | async-dom | [Partytown](https://partytown.builder.io/) | [@ampproject/worker-dom](https://github.com/nicejob/nicejob) |
| ------- | --------- | ------------------------------------------- | ------------------------------------------------------------ |
| Scope | Full app rendering | Third-party scripts only | AMP components only |
| Frameworks | React, Vue, Svelte, vanilla | N/A | AMP only |
| DOM API | Comprehensive | Proxy forwarding | Subset |
| Sync reads | SharedArrayBuffer | Service Worker + Atomics | No |
| Frame budgeting | Adaptive with priority | No | No |
| Binary protocol | 22 opcodes + string dedup | No | Transfer list |
| Multi-app isolation | Shadow DOM | No | No |
| WebSocket transport | Yes (remote rendering) | No | No |
| Content protection | Structural (worker isolation) | No | No |
| DevTools | Built-in 5-tab panel | No | No |
| Bundle (gzip) | ~11 KB + ~10 KB | ~12 KB | ~12 KB |
| Status | Active | Maintenance | Inactive |

---

## CLI Scaffold

```bash
npx @lifeart/async-dom init my-app --template react-ts
```

Templates: `vanilla-ts`, `react-ts`, `vue-ts`

---

## Browser Support

| Browser | Minimum | Notes |
| ------- | ------- | ----- |
| Chrome | 80+ | Full support |
| Firefox | 79+ | Full support |
| Safari | 15.2+ | Requires COOP/COEP for sync reads |
| Edge | 80+ | Full support (Chromium) |

---

## Development

```bash
npm install          # install dependencies
npm run dev          # dev server with examples
npm run build        # build ESM + CJS + declarations
npm test             # 634 tests across 46 files
npm run typecheck    # type-check
npm run lint         # lint (Biome)
```

## Contributing

Contributions welcome. Please open an issue first. See the [issue tracker](https://github.com/lifeart/async-dom/issues).

## License

MIT — see [LICENSE](./LICENSE).
