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
- **Event system** -- full bubbling with `stopPropagation` / `stopImmediatePropagation`, declarative `preventDefault`, `addEventListener` options (`once`, `capture`, `passive`), and automatic input state synchronization.
- **Per-app isolation** -- multiple workers render into the same page, each with its own DomRenderer + NodeCache and configurable permissions (including shadow DOM).
- **Binary wire format** -- compact binary mutation codec (22 opcodes) with string deduplication store, numeric Node IDs, and zero-copy `ArrayBuffer` transfer.
- **Security** -- HTML sanitizer strips dangerous tags/attributes/URIs; renderer property allowlist blocks arbitrary property writes; `setAttribute` filters `on*` handlers and `javascript:` URIs.
- **Debug module** -- structured logging for mutations, events, sync reads, and scheduler frames; `__ASYNC_DOM_DEVTOOLS__` global for live inspection.
- **Error forwarding** -- uncaught errors and unhandled rejections in workers are serialized and forwarded to the main thread via `onError` callback.
- **Multi-transport** -- Web Worker `postMessage`, binary `DataView` transport, WebSocket (with exponential-backoff reconnection), optional Comlink adapter.

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

// element.id reads the HTML "id" attribute (not the internal _nodeId)
div.setAttribute("id", "greet");
console.log(div.id); // "greet"

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

**Attributes:** `setAttribute`, `getAttribute`, `hasAttribute`, `removeAttribute`, `setAttributeNS`, `getAttributeNS`, `removeAttributeNS`, `attributes`.

**Properties:** `textContent`, `innerHTML`, `className`, `classList` (add/remove/contains/toggle), `style` (proxy-based).

**`element.id`:** getter/setter mapped to the HTML `id` attribute (not the internal `_nodeId`).

**Children vs childNodes:**

| Property              | Description                                    |
|-----------------------|------------------------------------------------|
| `childNodes`          | All children (elements + text + comment nodes) |
| `children`            | Element-only children (filtered view)          |
| `childElementCount`   | Number of element children                     |
| `firstElementChild`   | First child that is an element (or null)       |
| `lastElementChild`    | Last child that is an element (or null)        |
| `firstChild`          | First child of any type                        |
| `lastChild`           | Last child of any type                         |

**Input properties:** `value`, `checked`, `disabled`, `selectedIndex` -- all round-trip with the main thread on input events.

**`dataset` proxy:** `el.dataset.myValue` maps to `data-my-value` attribute (camelCase to kebab-case conversion).

**`insertAdjacentHTML(position, html)`** -- supports all four insert positions.

**`document.defaultView`** returns the `WorkerWindow` object.

### Style API

The `element.style` object is a `Proxy` supporting both property access and CSSStyleDeclaration methods:

| Method / Property                        | Description                                  |
|------------------------------------------|----------------------------------------------|
| `style.color = "red"`                    | Set via camelCase or kebab-case property      |
| `style.getPropertyValue("color")`        | Read a style property value                  |
| `style.setProperty("color", "red")`      | Set a style property                         |
| `style.removeProperty("color")`          | Remove a style property, returns old value   |
| `style.cssText`                          | Read all styles as a semicolon-joined string |
| `style.cssText = "color: red; ..."`      | Set multiple styles at once                  |

### Document

| Method                              | Description                                    |
|--------------------------------------|------------------------------------------------|
| `document.createEvent(type)`         | Returns a legacy event object with `initEvent` |
| `document.createTreeWalker(root)`    | Returns a tree walker over the virtual DOM     |
| `document.createRange()`             | Returns a range stub with `createContextualFragment` |
| `document.activeElement`             | Returns `document.body`                        |
| `document.querySelector(sel)`        | Query across head and body                     |
| `document.querySelectorAll(sel)`     | Query all across head and body                 |
| `document.getElementById(id)`        | O(1) lookup by `id` attribute                  |
| `document.getElementsByTagName(tag)` | Tag-based query                                |
| `document.getElementsByClassName(c)` | Class-based query                              |

### Selectors

`querySelector` and `querySelectorAll` run in the worker against the virtual DOM tree. Also available: `matches`, `closest`, `getElementsByTagName`, `getElementsByClassName`, `getElementById`.

Supported selectors: tag name, `#id`, `.class`, `[attr]`, `[attr=value]`, descendant (space), child (`>`), comma groups, `:first-child`, `:last-child`, and `*` wildcard.

### Events

- Full bubbling with `stopPropagation()` and `stopImmediatePropagation()`
- `VirtualEvent` and `VirtualCustomEvent` classes
- `addEventListener` supports an `options` object: `{ once, capture, passive }`
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

## Security

async-dom enforces multiple layers of security to prevent malicious or accidental code execution from worker-provided content:

- **HTML sanitizer** -- `innerHTML` and `insertAdjacentHTML` pass through a DOMParser-based sanitizer that strips dangerous tags (`<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<base>`, `<meta>`, `<link>`, `<style>`) and removes `on*` event-handler attributes, `javascript:` / `vbscript:` / `data:text/html` URIs, and dangerous attributes like `srcdoc` and `formaction`. Opt out per-app via `allowUnsafeHTML: true` in renderer permissions.
- **Property allowlist** -- `setProperty` mutations on the main-thread renderer only apply to a curated set of safe DOM properties (input state, scroll, media controls, etc.). Unknown properties are blocked and logged via the debug warning system. Extend the list per-app with `additionalAllowedProperties`.
- **Attribute filtering** -- `setAttribute` on the renderer silently drops `on*` handlers, `srcdoc`, `formaction`, and any URI attribute whose value starts with `javascript:`, `vbscript:`, or `data:text/html`.

## Per-App Isolation

Each app registered via `addApp` gets its own:

- **DomRenderer** + **NodeCache** -- structural isolation prevents cross-app node ID collisions
- **EventBridge** -- event listeners are scoped per app
- **SyncChannelHost** -- independent sync read channels
- **Shadow DOM** -- pass `shadow: true` (or a `ShadowRootInit`) to render each app into its own shadow root for full CSS/DOM encapsulation

```ts
const dom = createAsyncDom({ target: document.getElementById("root")! });

const appA = dom.addApp({
  worker: new Worker("./app-a.ts", { type: "module" }),
  shadow: true,
});
const appB = dom.addApp({
  worker: new Worker("./app-b.ts", { type: "module" }),
});

dom.start();
dom.removeApp(appA); // clean teardown without affecting appB
```

### Renderer Permissions

Control what each app is allowed to do on the main thread:

| Permission                     | Default | Description                        |
|--------------------------------|---------|------------------------------------|
| `allowHeadAppend`              | `false` | Append nodes to `<head>`           |
| `allowBodyAppend`              | `false` | Append nodes to `<body>`           |
| `allowNavigation`              | `true`  | Call `pushState`/`replaceState`    |
| `allowScroll`                  | `true`  | Call `window.scrollTo`             |
| `allowUnsafeHTML`              | `false` | Skip HTML sanitization             |
| `additionalAllowedProperties`  | `[]`    | Extend the property allowlist      |

### Scheduler Fairness

The `FrameScheduler` uses cursor-based O(n) dequeue and tracks the number of registered apps, distributing frame budget proportionally. Single-app deployments hit a fast path with zero per-mutation overhead for app routing.

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

## Wire Format

async-dom uses techniques inspired by [worker-dom](https://github.com/nicejob/nicejob) (AMP's worker-dom) to minimize serialization overhead:

- **Binary mutation encoding** -- mutations are encoded with `DataView` into a compact binary format using 22 opcodes: uint8 opcodes, uint32 node IDs, uint16 string indices. Bounds checking on every read prevents buffer-overrun crashes. This avoids the cost of JSON serialization and structured cloning of large object trees.
- **String deduplication store** -- strings (tag names, attribute names/values, etc.) are sent once and assigned a monotonic uint16 index. Subsequent references transmit only the 2-byte index, dramatically reducing payload size for repetitive DOM operations.
- **Numeric Node IDs** -- nodes are identified by a branded `number` type (`NodeId`) instead of string UUIDs, enabling fast `Map` lookups and compact binary encoding (4 bytes per ID).
- **Expando-based node lookup** -- each real DOM element carries an `__asyncDomId` expando property for O(1) reverse lookups during event handling and subtree cleanup.

### Configurable Transport

| Transport                | Import                | Encoding            | Use case                                    |
|--------------------------|-----------------------|---------------------|---------------------------------------------|
| `WorkerTransport`        | `async-dom/transport` | Structured clone    | Default; good baseline, zero-config         |
| `BinaryWorkerTransport`  | `async-dom/transport` | DataView binary     | Zero-copy binary transfer for high-throughput apps |
| `WebSocketTransport`     | `async-dom/transport` | JSON                | Remote rendering over WebSocket             |

## Debug & DevTools

Enable structured debug logging by passing a `debug` config to `createAsyncDom` or `createWorkerDom`:

```ts
const dom = createAsyncDom({
  target: document.getElementById("app")!,
  worker,
  debug: {
    logMutations: true,
    logEvents: true,
    logSyncReads: true,
    logScheduler: true,
    logWarnings: true,
    exposeDevtools: true,
  },
});
```

When `exposeDevtools: true`, a `__ASYNC_DOM_DEVTOOLS__` global is exposed on both threads:

- **Main thread:** `scheduler.pending()`, `findRealNode(nodeId)`, `stats.snapshot()`
- **Worker thread:** `document`, `tree()`, `findNode(id)`, `stats.snapshot()`

## Performance

- ~11.3 KB gzipped (worker bundle)
- ~10.0 KB gzipped (main thread bundle)
- ~5.6 KB gzipped (binary transport add-on)
- Frame-budgeted rendering (16ms target, adaptive batch sizing)
- Cursor-based O(n) dequeue in the scheduler -- no array splicing per mutation
- Single-app isolation overhead: 0ns per mutation (fast-path avoids Map lookup)
- Priority system: high / normal / low with optional mutation skipping under pressure
- Viewport culling: optional style mutations for off-screen elements are skipped during scroll

## API Reference

### `createAsyncDom(config): AsyncDomInstance`

| Config Property | Type               | Description                            |
|-----------------|--------------------|----------------------------------------|
| `target`        | `Element`          | Root DOM element to render into        |
| `worker`        | `Worker` (opt.)    | Initial worker                         |
| `scheduler`     | `SchedulerConfig` (opt.) | `frameBudgetMs`, `enableViewportCulling`, `enablePrioritySkipping` |
| `debug`         | `DebugOptions` (opt.) | Logging and devtools configuration   |

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
| `debug`         | `DebugOptions` (opt.) | Logging and devtools configuration   |

Returns `{ document: VirtualDocument, window: WorkerWindow }`.

### Transports

| Class                    | Import                | Use case                                |
|--------------------------|-----------------------|-----------------------------------------|
| `WorkerTransport`        | `async-dom/transport` | Main thread side of a Worker connection |
| `BinaryWorkerTransport`  | `async-dom/transport` | Binary-encoded transport (zero-copy)    |
| `WorkerSelfTransport`    | `async-dom/transport` | Worker side (`self.postMessage`)        |
| `WebSocketTransport`     | `async-dom/transport` | WebSocket client with auto-reconnect    |
| `createComlinkEndpoint`  | `async-dom/transport` | Comlink RPC adapter (optional peer dep) |

## Browser Requirements

- **SharedArrayBuffer** (for synchronous DOM reads): requires cross-origin isolation headers:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
  Without these headers, sync reads fall back to returning default values (0 / `{}`).
- **Web Workers** with `type: "module"` support (all modern browsers).

## Development

```bash
npm install          # Install dependencies
npm run dev          # Run dev server
npm run build        # Build (ESM + CJS via tsdown)
npm run test         # Run tests (503 tests across 34 files)
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
