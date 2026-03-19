# async-dom

Asynchronous DOM rendering -- offload UI to Web Workers with frame-budgeted scheduling.

---

## Overview

async-dom lets you run application logic in a Web Worker (or stream it over a WebSocket) while rendering to the real DOM on the main thread. The worker operates on a lightweight virtual DOM; mutations are serialized, transported, and applied by a frame-budget scheduler that keeps the main thread at 60 fps.

Key differentiators:

- **Comprehensive DOM API** -- virtual `document` and `window` with querySelector, dataset, input properties, modern mutation methods, and observer stubs so frameworks work out of the box.
- **Synchronous DOM reads** -- `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()`, and `window.innerWidth` return real values via SharedArrayBuffer (Partytown-inspired), with automatic async fallback.
- **Frame budgeting** -- the scheduler measures real execution times, adapts batch sizes per frame, and defers optional mutations when the budget is exceeded.
- **CSS selector engine** -- `querySelector` / `querySelectorAll` run against the virtual tree in the worker, supporting tag, id, class, attribute, descendant, child, comma, and pseudo-class selectors.
- **Event system** -- full bubbling with `stopPropagation` / `stopImmediatePropagation`, declarative `preventDefault`, and automatic input state synchronization.
- **Per-app isolation** -- multiple workers render into the same page, each with its own DomRenderer + NodeCache and configurable permissions.
- **Multi-transport** -- Web Worker `postMessage`, WebSocket (with exponential-backoff reconnection), optional Comlink adapter.

Originally created in 2017, async-dom has been fully rewritten in TypeScript with strict types, a discriminated-union message protocol, and modern tooling (Vite, Vitest, Biome, tsdown).

## Installation

```bash
npm install async-dom
```

The package ships ESM and CJS builds with full TypeScript declarations.

| Import path           | Purpose                         |
|-----------------------|---------------------------------|
| `async-dom`           | Main thread API                 |
| `async-dom/worker`    | Worker thread API (virtual DOM) |
| `async-dom/transport` | Transport backends              |

## Quick Start

### Main thread

```ts
import { createAsyncDom } from "async-dom";

const worker = new Worker(new URL("./my-worker.ts", import.meta.url), {
  type: "module",
});

const dom = createAsyncDom({
  target: document.getElementById("app")!,
  worker,
  scheduler: {
    frameBudgetMs: 16,
    enableViewportCulling: true,
    enablePrioritySkipping: true,
  },
});

dom.start();
```

### Worker thread (`my-worker.ts`)

```ts
import { createWorkerDom } from "async-dom/worker";

const { document, window } = createWorkerDom();

const div = document.createElement("div");
div.setAttribute("class", "greeting");
div.textContent = "Hello from a Web Worker!";
document.body.appendChild(div);

// Modern DOM methods work too
const list = document.createElement("ul");
list.append(
  document.createElement("li"),
  document.createElement("li"),
);
document.body.append(list);

// Synchronous layout reads (via SharedArrayBuffer)
const rect = div.getBoundingClientRect();
console.log(rect.width, rect.height);

// Real computed styles
const styles = window.getComputedStyle(div);
console.log(styles["font-size"]);
```

All DOM mutations are automatically batched via microtask and sent to the main thread for rendering.

## DOM API

### Elements

Standard methods: `createElement`, `createTextNode`, `createComment`, `createDocumentFragment`, `createElementNS`, `cloneNode`.

**Tree manipulation:** `appendChild`, `removeChild`, `insertBefore`, `remove`, `append`, `prepend`, `replaceWith`, `before`, `after`, `replaceChildren`.

**Attributes:** `setAttribute`, `getAttribute`, `hasAttribute`, `removeAttribute`, `attributes`.

**Properties:** `textContent`, `innerHTML`, `className`, `classList` (add/remove/contains/toggle), `style` (proxy-based).

**Input properties:** `value`, `checked`, `disabled`, `selectedIndex` -- all round-trip with the main thread on input events.

**`dataset` proxy:** `el.dataset.myValue` maps to `data-my-value` attribute (camelCase to kebab-case conversion).

**`insertAdjacentHTML(position, html)`** -- supports all four insert positions.

**`document.defaultView`** returns the `WorkerWindow` object.

### Selectors

`querySelector` and `querySelectorAll` run in the worker against the virtual DOM tree. Also available: `matches`, `closest`, `getElementsByTagName`, `getElementsByClassName`, `getElementById`.

Supported selectors: tag name, `#id`, `.class`, `[attr]`, `[attr=value]`, descendant (space), child (`>`), comma groups, `:first-child`, `:last-child`, and `*` wildcard.

### Events

- Full bubbling with `stopPropagation()` and `stopImmediatePropagation()`
- `VirtualEvent` and `VirtualCustomEvent` classes
- Declarative `preventDefault` via `element.preventDefaultFor("submit")` -- prevents default on the main thread before the round-trip to the worker
- Input state synchronization: `value`, `checked`, and `selectedIndex` are automatically synced from main thread to worker on input/change events
- `on*` property setters: `onclick`, `onchange`, `onkeydown`, `onmouseenter`, etc.

### Observer Stubs

`MutationObserver`, `ResizeObserver`, and `IntersectionObserver` are available on `window` as no-op stubs, preventing crashes when frameworks attempt to use them.

### Window

The `WorkerWindow` object provides: `location`, `history` (pushState/replaceState), `localStorage` (in-memory), `screen`, `scrollTo`, `addEventListener`, `removeEventListener`, `requestAnimationFrame` / `cancelAnimationFrame` (setTimeout-based polyfill).

## Synchronous DOM Reads

Inspired by [Partytown](https://partytown.builder.io/), async-dom uses a `SharedArrayBuffer` + `Atomics.wait/notify` channel so the worker can make blocking reads against the real DOM:

| API                              | Returns                       |
|----------------------------------|-------------------------------|
| `el.getBoundingClientRect()`     | Real DOMRect values           |
| `el.offsetWidth`, `clientHeight`, `scrollTop`, etc. | Real layout metrics |
| `window.getComputedStyle(el)`    | Real computed style properties |
| `window.innerWidth` / `innerHeight` | Real viewport dimensions   |

The main thread polls for requests with exponential backoff and responds immediately. On the worker side, `Atomics.wait` blocks until the response arrives (up to 100ms per retry, 5 retries max).

**Fallback:** When `SharedArrayBuffer` is unavailable (missing COOP/COEP headers), an `AsyncChannel` provides a Promise-based alternative. Layout getters return `0` and `getComputedStyle` returns `{}` as defaults.

## Per-App Isolation

Each app registered via `addApp` gets its own:

- **DomRenderer** + **NodeCache** -- structural isolation prevents cross-app node ID collisions
- **EventBridge** -- event listeners are scoped per app
- **SyncChannelHost** -- independent sync read channels

```ts
const dom = createAsyncDom({ target: document.getElementById("root")! });

const appA = dom.addApp({ worker: new Worker("./app-a.ts", { type: "module" }) });
const appB = dom.addApp({ worker: new Worker("./app-b.ts", { type: "module" }) });

dom.start();
dom.removeApp(appA); // clean teardown without affecting appB
```

### Renderer Permissions

Control what each app is allowed to do on the main thread:

| Permission         | Default | Description                     |
|--------------------|---------|---------------------------------|
| `allowHeadAppend`  | `false` | Append nodes to `<head>`        |
| `allowBodyAppend`  | `false` | Append nodes to `<body>`        |
| `allowNavigation`  | `true`  | Call `pushState`/`replaceState` |
| `allowScroll`      | `true`  | Call `window.scrollTo`          |

### Scheduler Fairness

The `FrameScheduler` tracks the number of registered apps and distributes frame budget proportionally. Single-app deployments hit a fast path with zero per-mutation overhead for app routing.

## Architecture

```
Worker Thread                  Main Thread
+--------------------+         +---------------------+
| VirtualDocument    |         |   ThreadManager     |
| (virtual DOM tree) |         |   (per-app comms)   |
|        |           |         |        |            |
| MutationCollector  |         |   FrameScheduler    |
|  (microtask batch) |         |   (budget, sort,    |
+--------|----------+         |    cull, skip)       |
         |                     |        |            |
    Transport ───────────────> |   DomRenderer(s)    |
  (postMessage /               |   (per-app, apply   |
   WebSocket)                  |    to real DOM)     |
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

1. Application code manipulates `VirtualDocument` in the worker.
2. `MutationCollector` batches mutations per microtask and sends them over the transport.
3. `ThreadManager` receives messages and routes them to the `FrameScheduler`.
4. `FrameScheduler` sorts by priority, measures timing, and applies mutations within the frame budget via per-app `DomRenderer` instances.
5. `EventBridge` listens for real DOM events and forwards serialized copies back to the worker, including input state (`value`, `checked`, `selectedIndex`).
6. `SyncChannelHost` handles blocking DOM read requests from the worker via `SharedArrayBuffer`.

## API Reference

### `createAsyncDom(config): AsyncDomInstance`

| Config Property | Type               | Description                            |
|-----------------|--------------------|----------------------------------------|
| `target`        | `Element`          | Root DOM element to render into        |
| `worker`        | `Worker` (opt.)    | Initial worker                         |
| `scheduler`     | `SchedulerConfig` (opt.) | `frameBudgetMs`, `enableViewportCulling`, `enablePrioritySkipping` |

| Instance Method         | Description                              |
|-------------------------|------------------------------------------|
| `start()`               | Begin the render loop                    |
| `stop()`                | Pause the render loop                    |
| `destroy()`             | Stop, flush, and tear down all resources |
| `addApp(config)`        | Register another worker; returns `AppId` |
| `removeApp(appId)`      | Remove an app and its event listeners    |

### `createWorkerDom(config?): WorkerDomResult`

| Config Property | Type               | Description                            |
|-----------------|--------------------|----------------------------------------|
| `appId`         | `AppId` (opt.)     | Explicit app identifier                |
| `transport`     | `Transport` (opt.) | Custom transport (defaults to `WorkerSelfTransport`) |

Returns `{ document: VirtualDocument, window: WorkerWindow }`.

### Transports

| Class                   | Import                | Use case                               |
|-------------------------|-----------------------|----------------------------------------|
| `WorkerTransport`       | `async-dom/transport` | Main thread side of a Worker connection|
| `WorkerSelfTransport`   | `async-dom/transport` | Worker side (`self.postMessage`)       |
| `WebSocketTransport`    | `async-dom/transport` | WebSocket client with auto-reconnect   |
| `createComlinkEndpoint` | `async-dom/transport` | Comlink RPC adapter (optional peer dep)|

## Browser Requirements

- **SharedArrayBuffer** (for synchronous DOM reads): requires cross-origin isolation headers:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
  Without these headers, sync reads fall back to returning default values (0 / `{}`).
- **Web Workers** with `type: "module"` support (all modern browsers).

## Performance

- ~8.7KB gzipped (worker bundle)
- ~6.8KB gzipped (main thread bundle)
- Frame-budgeted rendering (16ms target, adaptive batch sizing)
- Single-app isolation overhead: 0ns per mutation (fast-path avoids Map lookup)
- Priority system: high / normal / low with optional mutation skipping under pressure
- Viewport culling: optional style mutations for off-screen elements are skipped during scroll

## Development

```bash
npm install          # Install dependencies
npm run dev          # Run dev server
npm run build        # Build (ESM + CJS via tsdown)
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run typecheck    # Type-check
npm run lint         # Lint (Biome)
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format (Biome)
npm run ci           # Full CI pipeline (lint + typecheck + test + build)
```

## License

MIT -- see [LICENSE](./LICENSE).

---

Originally created by [Aleksandr Kanunnikov](https://github.com/lifeart) in 2017. Rewritten as a modern TypeScript library in 2025.
