# async-dom

[![CI](https://github.com/lifeart/async-dom/actions/workflows/ci.yml/badge.svg)](https://github.com/lifeart/async-dom/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/async-dom)](https://www.npmjs.com/package/async-dom)
[![license](https://img.shields.io/npm/l/async-dom)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/async-dom)](https://bundlephobia.com/package/async-dom)

Offload UI to Web Workers with frame-budgeted scheduling. Your application logic runs in a worker; mutations are serialized, transported, and applied by a scheduler that keeps the main thread at 60 fps.

## Key Features

- **Comprehensive DOM API** -- virtual `document` and `window` with querySelector, dataset, classList, input properties, and observer stubs so frameworks work out of the box.
- **Synchronous DOM reads** -- `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()` return real values via SharedArrayBuffer, with automatic async fallback.
- **Frame budgeting** -- adaptive batch sizing per frame with priority levels and optional viewport culling.
- **CSS selector engine** -- `querySelector` / `querySelectorAll` run against the virtual tree in the worker.
- **Binary wire format** -- 22-opcode binary codec with string deduplication and numeric Node IDs.
- **Per-app isolation** -- multiple workers render into the same page, each with its own renderer and optional shadow DOM.
- **Security** -- HTML sanitizer, property allowlist, and attribute filtering block dangerous content.
- **Multi-transport** -- Worker `postMessage`, binary `DataView`, WebSocket with auto-reconnect, optional Comlink adapter.

## Getting Started

```bash
npm install async-dom
```

The package ships ESM and CJS builds with full TypeScript declarations.

| Import path        | Purpose                         |
| ------------------ | ------------------------------- |
| `async-dom`        | Main thread API                 |
| `async-dom/worker` | Worker thread API (virtual DOM) |
| `async-dom/transport` | Transport backends           |

### main.ts

```ts
import { createAsyncDom } from "async-dom";

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
import { createWorkerDom } from "async-dom/worker";

const { document } = createWorkerDom();

const div = document.createElement("div");
div.setAttribute("class", "greeting");
div.textContent = "Hello from a Web Worker!";
document.body.appendChild(div);

// element.id maps to the HTML "id" attribute
div.id = "greet";
console.log(div.id); // "greet"

// Modern DOM methods
const list = document.createElement("ul");
list.append(
  document.createElement("li"),
  document.createElement("li"),
);
document.body.append(list);
```

All DOM mutations are automatically batched via microtask and sent to the main thread.

## Examples

Working examples are in the [`examples/`](./examples) directory:

- **[vanilla](./examples/vanilla)** -- 7 000-node interactive grid with click scoring, hover effects, and periodic color updates. A good starting point for understanding the API.

Run the dev server to try them:

```bash
npm run dev
```

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

## Synchronous DOM Reads

Inspired by [Partytown](https://partytown.builder.io/), async-dom uses `SharedArrayBuffer` + `Atomics.wait/notify` so the worker can make blocking reads against the real DOM:

| API                                       | Returns                        |
| ----------------------------------------- | ------------------------------ |
| `el.getBoundingClientRect()`              | Real DOMRect values            |
| `el.offsetWidth`, `clientHeight`, etc.    | Real layout metrics            |
| `window.getComputedStyle(el)`             | Real computed style properties |
| `window.innerWidth` / `innerHeight`       | Real viewport dimensions       |

**Fallback:** When `SharedArrayBuffer` is unavailable (missing COOP/COEP headers), sync reads return default values (`0` / `{}`).

## Security

- **HTML sanitizer** -- `innerHTML` and `insertAdjacentHTML` strip dangerous tags (`<script>`, `<iframe>`, `<object>`, etc.) and `on*` attributes. Opt out per-app with `allowUnsafeHTML: true`.
- **Property allowlist** -- `setProperty` mutations only apply to a curated set of safe DOM properties. Extend with `additionalAllowedProperties`.
- **Attribute filtering** -- `setAttribute` drops `on*` handlers and `javascript:` URIs.

## Per-App Isolation

Each app gets its own `DomRenderer`, `NodeCache`, `EventBridge`, and `SyncChannelHost`. Pass `shadow: true` to render into a shadow root for full CSS/DOM encapsulation.

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

| Permission                    | Default | Description                     |
| ----------------------------- | ------- | ------------------------------- |
| `allowHeadAppend`             | `false` | Append nodes to `<head>`        |
| `allowBodyAppend`             | `false` | Append nodes to `<body>`        |
| `allowNavigation`             | `true`  | Call `pushState`/`replaceState` |
| `allowScroll`                 | `true`  | Call `window.scrollTo`          |
| `allowUnsafeHTML`             | `false` | Skip HTML sanitization          |
| `additionalAllowedProperties` | `[]`    | Extend the property allowlist   |

## Transports

| Class                   | Import                | Use case                                |
| ----------------------- | --------------------- | --------------------------------------- |
| `WorkerTransport`       | `async-dom/transport` | Main thread side of a Worker connection |
| `BinaryWorkerTransport` | `async-dom/transport` | Binary-encoded transport (zero-copy)    |
| `WorkerSelfTransport`   | `async-dom/transport` | Worker side (`self.postMessage`)        |
| `WebSocketTransport`    | `async-dom/transport` | WebSocket client with auto-reconnect    |
| `createComlinkEndpoint` | `async-dom/transport` | Comlink RPC adapter (optional peer dep) |

## Debug & DevTools

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

When `exposeDevtools: true`, a `__ASYNC_DOM_DEVTOOLS__` global is exposed on both threads for live inspection.

## API Reference

### `createAsyncDom(config): AsyncDomInstance`

| Config Property | Type                   | Description                                                                     |
| --------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `target`        | `Element`              | Root DOM element to render into                                                 |
| `worker`        | `Worker` (opt.)        | Initial worker                                                                  |
| `scheduler`     | `SchedulerConfig` (opt.) | `frameBudgetMs`, `enableViewportCulling`, `enablePrioritySkipping`            |
| `debug`         | `DebugOptions` (opt.)  | Logging and devtools configuration                                              |

| Instance Method    | Description                              |
| ------------------ | ---------------------------------------- |
| `start()`          | Begin the render loop                    |
| `stop()`           | Pause the render loop                    |
| `destroy()`        | Stop, flush, and tear down all resources |
| `addApp(config)`   | Register another worker; returns `AppId` |
| `removeApp(appId)` | Remove an app and its event listeners    |

### `createWorkerDom(config?): WorkerDomResult`

| Config Property | Type                   | Description                                    |
| --------------- | ---------------------- | ---------------------------------------------- |
| `appId`         | `AppId` (opt.)         | Explicit app identifier                        |
| `transport`     | `Transport` (opt.)     | Custom transport (defaults to `WorkerSelfTransport`) |
| `debug`         | `DebugOptions` (opt.)  | Logging and devtools configuration             |

Returns `{ document: VirtualDocument, window: WorkerWindow }`.

## Comparison with Alternatives

| Feature                  | async-dom             | [Partytown](https://partytown.builder.io/) | [worker-dom](https://github.com/nicejob/nicejob) |
| ------------------------ | --------------------- | ------------------------------------------- | ------------------------------------------------- |
| Primary use case         | Full app rendering    | Third-party scripts                         | AMP components                                    |
| DOM API coverage         | Comprehensive         | Proxy-based forwarding                      | Subset                                            |
| Sync DOM reads           | SharedArrayBuffer     | Service Worker + Atomics                    | No                                                |
| Frame-budget scheduling  | Yes (adaptive)        | No                                          | No                                                |
| Binary wire format       | Yes (22 opcodes)      | No                                          | Transfer list                                     |
| Multi-app isolation      | Yes (shadow DOM opt.)  | No                                          | No                                                |
| CSS selector engine      | In-worker             | Forwarded to main                           | No                                                |
| Bundle size (gzip)       | ~11 KB worker, ~10 KB main | ~12 KB                                 | ~12 KB                                            |

## Browser Support

| Browser         | Minimum Version | Notes                                       |
| --------------- | --------------- | ------------------------------------------- |
| Chrome          | 80+             | Full support including SharedArrayBuffer     |
| Firefox         | 79+             | Full support including SharedArrayBuffer     |
| Safari          | 15.2+           | SharedArrayBuffer requires COOP/COEP headers |
| Edge            | 80+             | Full support (Chromium-based)               |

**Required for sync DOM reads:** Cross-origin isolation headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Without these headers, sync reads fall back to returning default values.

**Required:** Web Workers with `type: "module"` support.

## Performance

- ~11 KB gzipped (worker bundle), ~10 KB gzipped (main thread bundle)
- Frame-budgeted rendering (16 ms target, adaptive batch sizing)
- Priority system: high / normal / low with optional mutation skipping under pressure
- Viewport culling: off-screen style mutations are deferred during scroll

## Development

```bash
npm install          # install dependencies
npm run dev          # dev server with examples
npm run build        # build (ESM + CJS via tsdown)
npm run test         # run tests (503 tests across 34 files)
npm run typecheck    # type-check
npm run lint         # lint (Biome)
npm run ci           # full CI pipeline (lint + typecheck + test + build)
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change. See the [issue tracker](https://github.com/lifeart/async-dom/issues).

## License

MIT -- see [LICENSE](./LICENSE).

---

Originally created by [Aleksandr Kanunnikov](https://github.com/lifeart) in 2017. Rewritten as a modern TypeScript library in 2025.
