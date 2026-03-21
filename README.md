# @lifeart/async-dom

[![CI](https://github.com/lifeart/async-dom/actions/workflows/ci.yml/badge.svg)](https://github.com/lifeart/async-dom/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@lifeart/async-dom)](https://www.npmjs.com/package/@lifeart/async-dom)
[![license](https://img.shields.io/npm/l/@lifeart/async-dom)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@lifeart/async-dom)](https://bundlephobia.com/package/@lifeart/async-dom)

**Your application runs in a Web Worker. The DOM is just a projection.**

async-dom moves your entire UI framework — React, Vue, Svelte, or vanilla JS — into a Web Worker. The main thread receives only serialized mutation instructions through a message-passing channel and applies them with a frame-budgeted scheduler targeting 60 fps.

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
| **AI scraping prevention** | Content never exists in initial HTML. `curl` and simple scrapers get an empty shell. Headless browsers must wait for worker initialization and mutation application, raising the cost and complexity of automated extraction. |
| **Copyright & DRM** | Business logic and data stay in the worker. The DOM is a procedural artifact — not a template that maps 1:1 to source content. The architecture enables per-session content variation and server-controlled rendering for content protection scenarios. |
| **NDA UI demos** | Share interactive prototypes where the client cannot copy JS logic — it runs server-side via WebSocket transport or inside an opaque worker. |
| **Exam & education anti-cheat** | Application state and logic run in a worker or on a server via WebSocket, making them inaccessible from browser DevTools or in-page scripts. This supplements (but does not replace) purpose-built proctoring solutions. |
| **Dynamic obfuscation** | The architecture supports per-session variation of non-semantic identifiers (class names, element IDs), increasing maintenance cost for selector-based scrapers. This is an advanced pattern with tradeoffs for CSS tooling and testing. |

### Performance & Architecture

| Use Case | How async-dom helps |
| -------- | ------------------- |
| **Main thread liberation** | Your entire framework (React, Vue, Svelte) runs off the main thread. Framework runtime does not compete with user input or browser rendering on the main thread. Event round-trips add latency compared to same-thread handlers. |
| **Heavy computation** | Sorting, filtering, data processing, fractal rendering — all happen in the worker without dropping frames. |
| **Multi-core utilization** | Modern devices have 4-8+ cores. Traditional web apps use one. async-dom lets you use the rest. |
| **SmartTV & low-power devices** | Run computation on a backend, stream DOM updates via WebSocket to devices with modern browser support. Frame rate depends on network latency and jitter. |
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
| **Parallel editing** | Broadcast a single app instance to multiple viewers via WebSocket. Event forwarding from clients is supported but does not include conflict resolution (events are processed in arrival order). |
| **Marketing & UX analytics** | WebSocket transport broadcasts UI state to multiple observers. Watch exactly what users experience, live. |
| **Time-travel debugging** | Record and replay DOM mutation sequences. Scrub through rendering history with a time-travel scrubber. Compare tree snapshots with visual diff. |
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

async-dom ships adapters for React, Vue, and Svelte. Your framework code runs in the worker with async-dom's virtual DOM API.

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

## Remote Transports

async-dom supports running the worker DOM in a SharedWorker, on a remote server via WebSocket, or any custom transport.

### Remote App (no local Worker)

```ts
import { createAsyncDom } from "@lifeart/async-dom";
import { WebSocketTransport } from "@lifeart/async-dom/transport";

const dom = createAsyncDom({ target: document.getElementById("app")! });

// Connect to a remote server running the app
dom.addRemoteApp({
  transport: new WebSocketTransport("ws://localhost:3000"),
  name: "remote-app",
  mountPoint: "#app",
});

dom.start();
```

### SharedWorker Transport

```ts
import { createAsyncDom } from "@lifeart/async-dom";
import { SharedWorkerTransport } from "@lifeart/async-dom/transport";

const sw = new SharedWorker("/my-worker.js", { type: "module" });
const transport = new SharedWorkerTransport(sw.port);

const dom = createAsyncDom({ target: document.getElementById("app")! });
dom.addRemoteApp({ transport, name: "shared-worker-app" });
dom.start();
```

### Server-Side Rendering (Node.js)

```ts
import { createServerApp } from "@lifeart/async-dom/server";
import { WebSocketServerTransport } from "@lifeart/async-dom/server";

// Inside a WebSocket connection handler:
const transport = new WebSocketServerTransport(socket);
const app = createServerApp({
  transport,
  appModule: ({ document }) => {
    const div = document.createElement("div");
    div.textContent = "Server-rendered via async-dom";
    document.body.appendChild(div);
  },
});

// Clean up on disconnect:
socket.on("close", () => app.destroy());
```

### Multi-Client Streaming (Optional)

Stream one server-side app instance to multiple browser clients simultaneously. Each client receives full DOM mutation replay on connect and can send events back to the shared app.

**Server (`streaming-server.ts`)**

```ts
import { createStreamingServer } from "@lifeart/async-dom/server";
import { WebSocketServer } from "ws";

const streaming = createStreamingServer({
  createApp: ({ document }) => {
    const div = document.createElement("div");
    div.textContent = "Hello from server!";
    document.body.appendChild(div);

    setInterval(() => {
      div.textContent = `Server time: ${new Date().toLocaleTimeString()}`;
    }, 1000);
  },
  broadcast: {
    mutationLog: { maxEntries: 5000 },
    maxClients: 100,
  },
});

const wss = new WebSocketServer({ port: 8080 });
wss.on("connection", (ws) => {
  const clientId = streaming.handleConnection(ws);
  console.log(`Client ${clientId} connected`);
});

await streaming.ready;
```

**Client** — no special client-side code needed, use the standard transport:

```ts
import { createAsyncDom } from "@lifeart/async-dom";
import { WebSocketTransport } from "@lifeart/async-dom/transport";

const asyncDom = createAsyncDom({ target: document.getElementById("app")! });
const transport = new WebSocketTransport("ws://localhost:8080");
asyncDom.addRemoteApp({ transport, name: "shared-app" });
asyncDom.start();
```

**`StreamingServerInstance` API**

| Method / Property | Description |
| ----------------- | ----------- |
| `handleConnection(socket, clientId?)` | Register a new WebSocket client; returns the assigned `clientId` |
| `disconnectClient(clientId)` | Remove a specific client |
| `getClientCount()` | Number of currently connected clients |
| `getClientIds()` | Array of all active client IDs |
| `getDom()` | Access the underlying WorkerDom instance |
| `destroy()` | Shut down the app and disconnect all clients |
| `ready` | Promise that resolves when the app has finished initializing |

**Features**

- Late-joining clients automatically receive a replay of all past mutations before switching to the live stream.
- A client disconnect does not affect the server app or other clients.
- Events from each client are tagged with the originating `clientId` before reaching the app.
- Mutation log size and maximum client count are configurable.
- Backpressure is managed independently per client.

**Limitations & Known Gaps**

- **No conflict resolution** — Events from concurrent clients are processed in arrival order (FIFO). No last-writer-wins or ownership model is implemented.
- **Replay safety** — Late-joining clients receive a full mutation log replay. Non-idempotent mutations (`addEventListener`, `callMethod`, `insertAdjacentHTML`) may cause duplicate side effects during replay.
- **No log compaction** — The mutation log grows linearly up to `maxEntries`. Snapshot-based compaction is not yet implemented.
- **Single-process** — The streaming server runs in a single Node.js process. For high concurrency, external load balancing is needed.
- **No built-in authentication** — `handleConnection` does not validate connections. Authentication must be handled at the WebSocket server level before passing the socket.
- **No per-client backpressure** — A slow client can temporarily degrade broadcast throughput for other clients.

`createServerApp` remains available for single-client (one app per connection) use cases.

---

### Named Apps (DevTools)

```ts
dom.addApp({
  name: "dashboard",  // visible in DevTools instead of random hash
  worker: new Worker("./dashboard.worker.ts", { type: "module" }),
  mountPoint: "#dashboard",
  shadow: true,
});
```

---

## Package Exports

| Import path           | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `@lifeart/async-dom`           | Main thread API (`createAsyncDom`)           |
| `@lifeart/async-dom/worker`    | Worker thread API (virtual `document`)       |
| `@lifeart/async-dom/transport` | Transport backends (Worker, Binary, WS, SharedWorker, Comlink) |
| `@lifeart/async-dom/react`     | React `<AsyncDom>` component + `useAsyncDom` hook |
| `@lifeart/async-dom/vue`       | Vue `<AsyncDom>` component + `useAsyncDom` composable |
| `@lifeart/async-dom/svelte`    | Svelte `asyncDom` action                     |
| `@lifeart/async-dom/vite-plugin` | Vite plugin (COOP/COEP headers, binary transport, error overlay) |
| `@lifeart/async-dom/server`   | Server-side runner (`createServerApp`, `createStreamingServer`, `BroadcastTransport`, `MutationLog`, `WebSocketServerTransport`) |

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
3. **Scheduler** — The main thread applies mutations within a per-frame budget. Priority sorting, viewport culling, and adaptive batch sizing targets 60 fps.
4. **Events** — User interactions on the main thread are serialized and dispatched to worker event handlers.
5. **Sync Reads** — `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()` block in the worker via `SharedArrayBuffer` + `Atomics` and return real values from the main thread.

---

## Security Model

async-dom provides multiple layers of protection:

### Worker Isolation (Architectural)

- **No direct DOM access** — XSS payloads in the page cannot reach worker internal state.
- **Serialized communication only** — all data passes through `postMessage`, a natural sanitization boundary.
- **Separate execution context** — workers are isolated at the browser engine level. Main-thread scripts cannot access worker internal state. Note: browser extensions with appropriate permissions can still read the rendered DOM.
- **Token protection** — auth tokens and session state in the worker are inaccessible to malicious main-thread scripts.

### Content Sanitization (Active)

- **HTML sanitizer** — `innerHTML` strips `<script>`, `<iframe>`, `<style>`, `<object>`, `on*` attributes, and `javascript:`/`data:text/html` URIs.
- **Property allowlist** — `setProperty` only applies safe properties (`value`, `checked`, `textContent`, etc.).
- **Attribute filtering** — `setAttribute` blocks `on*` handlers and dangerous URIs.

### Anti-Scraping (Structural)

Unlike `robots.txt` (voluntary), CDN-level blocks (circumventable), or CAPTCHAs (UX-degrading), worker-based rendering is an **architectural property** that raises the cost of content extraction:

- Empty HTML payload — no content for `curl`, `wget`, or simple GET requests.
- Procedural DOM — the rendered tree is an artifact of the mutation protocol, not a semantic template.
- Dynamic structure — the architecture supports per-session variation of class names and DOM structure, raising the maintenance burden for selector-based scrapers.
- Honeypot injection — the worker can be programmed to insert invisible trap elements that automated tools follow but humans never see.
- Behavioral gating — the worker controls what renders and when, enabling application-level bot detection logic.

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
| **Graph** | Causality DAG: events → mutation batches → affected DOM nodes. |

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

| Feature | async-dom | [Partytown](https://partytown.builder.io/) | @ampproject/worker-dom |
| ------- | --------- | ------------------------------------------- | ------------------------------------------------------------ |
| Scope | Full app rendering | Third-party scripts only | AMP components only |
| Frameworks | React, Vue, Svelte, vanilla | N/A | AMP only |
| DOM API coverage | Broad (see compatibility table) | Proxy forwarding | Subset |
| Sync reads | SharedArrayBuffer | Service Worker + Atomics | No |
| Frame budgeting | Adaptive with priority | No | No |
| Binary protocol | 22 opcodes + string dedup | No | Transfer list |
| Multi-app isolation | Shadow DOM | No | No |
| WebSocket transport | Yes (remote rendering) | No | No |
| Content protection | Structural (worker isolation) | No | No |
| DevTools | Built-in 5-tab panel | No | No |
| Bundle (gzip) | ~21 KB (core, gzip) | ~12 KB | ~12 KB |
| Status | Active | Maintenance | Inactive |

---

## DOM API Compatibility

Layout reads require a SharedArrayBuffer sync channel. Without it, they return zero values. All other APIs work without special setup.

| Category | APIs | Status |
| -------- | ---- | ------ |
| Tree manipulation | appendChild, removeChild, insertBefore, append, prepend, replaceWith, before, after, replaceChildren | Full |
| Attributes | get/set/has/removeAttribute, NS variants, attributes iterable | Full |
| Properties | id, className, textContent, innerHTML, value, checked, disabled, selectedIndex, type | Full |
| ClassList | add, remove, toggle, contains, replace, length | Full |
| Style | style proxy (camelCase + kebab-case), cssText | Full |
| Dataset | Proxy-based data-* attribute access | Full |
| Events | addEventListener, removeEventListener, dispatchEvent, on* handlers, once option | Full |
| Queries | querySelector/All, getElementById, getElementsByTagName/ClassName, matches, closest, contains | Full |
| Layout reads | clientWidth/Height, scrollWidth/Height, offsetWidth/Height/Top/Left, getBoundingClientRect | Sync |
| Scroll | scrollTop, scrollLeft (get/set), scrollIntoView | Full |
| Media | play, pause, load, currentTime, duration, paused, ended, readyState | Full |
| Methods | focus, blur, click, select, showModal, close | Full |
| Clone | cloneNode (shallow + deep) | Full |
| Document | createElement, createTextNode, createComment, createDocumentFragment, createEvent, createRange, createTreeWalker | Full |
| Navigation | parentNode/Element, first/lastChild, next/previousSibling, first/lastElementChild, children, childElementCount, ownerDocument, isConnected, getRootNode | Full |
| insertAdjacentHTML | insertAdjacentHTML | Full |
| normalize | normalize() | Stub |
| Shadow DOM | attachShadow, shadowRoot | -- |
| outerHTML | outerHTML getter (read-only) | Full |
| Animations | animate, getAnimations | -- |
| Fullscreen | requestFullscreen | -- |
| Pointer capture | setPointerCapture, releasePointerCapture | -- |

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
npm test             # 1,310 tests across 67 files
npm run typecheck    # type-check
npm run lint         # lint (Biome)
```

## Contributing

Contributions welcome. Please open an issue first. See the [issue tracker](https://github.com/lifeart/async-dom/issues).

## License

MIT — see [LICENSE](./LICENSE).
