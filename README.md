# async-dom

[![CI](https://github.com/lifeart/async-dom/actions/workflows/ci.yml/badge.svg)](https://github.com/lifeart/async-dom/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/async-dom)](https://www.npmjs.com/package/async-dom)
[![license](https://img.shields.io/npm/l/async-dom)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/async-dom)](https://bundlephobia.com/package/async-dom)

Offload UI to Web Workers with frame-budgeted scheduling. Your application logic runs in a worker; mutations are serialized, transported, and applied by a scheduler that keeps the main thread at 60 fps.

**[Live Demo](https://lifeart.github.io/async-dom/)** · **[Demo with DevTools](https://lifeart.github.io/async-dom/?debug)**

## Key Features

- **Comprehensive DOM API** — virtual `document` and `window` with querySelector, dataset, classList, input properties, and observer stubs so frameworks work out of the box.
- **Synchronous DOM reads** — `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()` return real values via SharedArrayBuffer.
- **Frame budgeting** — adaptive batch sizing per frame with priority levels and optional viewport culling.
- **Binary wire format** — 22-opcode binary codec with string deduplication and numeric Node IDs.
- **Per-app isolation** — multiple workers render into the same page, each with its own renderer and optional shadow DOM.
- **Built-in DevTools** — in-page debug panel with virtual DOM tree, scheduler profiler, mutation log, event tracer, causality graph, time-travel replay, and session export/import.
- **Security** — HTML sanitizer, property allowlist, and attribute filtering block dangerous content.

## Getting Started

```bash
npm install async-dom
```

| Import path           | Purpose                         |
| --------------------- | ------------------------------- |
| `async-dom`           | Main thread API                 |
| `async-dom/worker`    | Worker thread API (virtual DOM) |
| `async-dom/transport` | Transport backends              |

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
div.textContent = "Hello from a Web Worker!";
div.id = "greet";
document.body.appendChild(div);

// Input elements sync state with main thread
const input = document.createElement("input");
input.addEventListener("input", (e) => {
  console.log("Value:", input.value); // real value from main thread
});
document.body.appendChild(input);
```

## Examples

Working examples in [`examples/`](./examples):

| Example | Description |
| ------- | ----------- |
| **[vanilla](./examples/vanilla)** | 7,000-node interactive grid — click scoring, hover effects, periodic updates |
| **[counter](./examples/counter)** | Minimal counter — click handlers, textContent updates |
| **[todo](./examples/todo)** | Todo list — input sync, dynamic DOM, classList, event handling |
| **[multi-app](./examples/multi-app)** | Two isolated apps in shadow DOM — CSS isolation demo |
| **[debug](./examples/debug)** | Debug panel with devtools, mutation logging, stats |
| **[audio-player](./examples/audio-player)** | Audio playback from worker — play/pause, progress, media events |

```bash
npm run dev          # run vanilla example
```

## Debugging

### In-Page DevTools Panel

Add `?debug` to the URL or pass `debug: { exposeDevtools: true }`:

```ts
const dom = createAsyncDom({
  target: document.getElementById("app")!,
  worker,
  debug: { exposeDevtools: true, logWarnings: true },
});
```

This injects a collapsible panel in the bottom-right corner with 5 tabs:

| Tab | What it shows |
| --- | ------------- |
| **Tree** | Virtual DOM tree from the worker with node inspector sidebar (attributes, computed styles, event listeners, mutation history, "why updated?" trail). Snapshot & diff two tree states. |
| **Performance** | Scheduler stats, frame budget flamechart, worker-to-main latency (P50/P95/P99), dropped frames, mutation type chart, coalescing breakdown, sync read heatmap, transport message sizes, worker CPU profiler, multi-app interleaving timeline |
| **Log** | Live mutation stream grouped by batch with color-coded diffs, event round-trip tracer with visual timeline bars, coalesced mutation display, time-travel replay with scrubber |
| **Warnings** | Warnings grouped by code with inline docs and suggested fixes, suppress per code, filter |
| **Graph** | Causality DAG: events → mutation batches → affected DOM nodes |

Additional header controls: highlight DOM updates toggle, export/import debug sessions, health status dot.

Multi-app: when multiple workers are running, the panel shows a per-app selector with separate trees and stats.

### Always-On Warnings

These fire via `console.warn` regardless of debug config — they indicate real bugs:

| Warning | Meaning |
| ------- | ------- |
| `appendChild: parent not found` | Mutation targets a node not in the cache |
| `Scheduler queue overflow: N pending` | Queue > 10K — tab hidden or applier broken |
| `Scheduler not ticking after 1 second` | `requestAnimationFrame` not firing (hidden tab) |
| `App X worker error: ...` | Runtime error in worker with stack trace |
| `App X worker disconnected` | Worker crashed or was terminated |

### Worker Error Reporting

Worker runtime errors (syntax, logical, uncaught exceptions, unhandled promise rejections) are automatically:
1. Captured via `self.onerror` and `self.onunhandledrejection`
2. Serialized with name, message, stack, filename, line, column
3. Forwarded to the main thread via the error protocol
4. Displayed in the DevTools Warnings tab with expandable stack traces
5. Passed to your `onError` callback if provided

```ts
dom.addApp({
  worker: new Worker("./app.ts", { type: "module" }),
  onError: (error, appId) => {
    console.error(`[${appId}] ${error.name}: ${error.message}`);
    console.error(error.stack);
    // error.filename, error.lineno, error.colno available
    // error.isUnhandledRejection for promise rejections
  },
});
```

### Debug Options

```ts
interface DebugOptions {
  logMutations?: boolean;    // Log every mutation applied on main thread
  logEvents?: boolean;       // Log event serialization and dispatch
  logSyncReads?: boolean;    // Log SharedArrayBuffer read requests
  logScheduler?: boolean;    // Log per-frame scheduler stats
  logWarnings?: boolean;     // Log structured warnings
  exposeDevtools?: boolean;  // Inject in-page debug panel + __ASYNC_DOM_DEVTOOLS__ global
}
```

### Console DevTools API

When `exposeDevtools: true`, inspect from the browser console:

```js
// Main thread console:
__ASYNC_DOM_DEVTOOLS__.scheduler.stats()       // {pending, frameId, frameTime, isRunning, droppedFrameCount, workerToMainLatencyMs}
__ASYNC_DOM_DEVTOOLS__.scheduler.frameLog()    // Per-frame timing breakdown
__ASYNC_DOM_DEVTOOLS__.scheduler.flush()       // Manual drain for debugging
__ASYNC_DOM_DEVTOOLS__.apps()                  // List all app IDs
__ASYNC_DOM_DEVTOOLS__.findRealNode(42)        // Find real DOM element by nodeId
__ASYNC_DOM_DEVTOOLS__.getAllAppsData()         // Virtual DOM trees + worker stats
__ASYNC_DOM_DEVTOOLS__.getEventTraces()        // Event round-trip timing data
__ASYNC_DOM_DEVTOOLS__.getTransportStats()     // Per-app transport message sizes
__ASYNC_DOM_DEVTOOLS__.getWorkerPerfEntries()  // Worker CPU performance entries
__ASYNC_DOM_DEVTOOLS__.getCausalityTracker()   // Event → mutation causality graph
__ASYNC_DOM_DEVTOOLS__.getMutationCorrelation() // "Why was this node updated?" data
__ASYNC_DOM_DEVTOOLS__.enableHighlightUpdates(true)  // Flash DOM nodes on mutation

// Worker console:
__ASYNC_DOM_DEVTOOLS__.tree()               // Virtual DOM tree snapshot
__ASYNC_DOM_DEVTOOLS__.stats()              // Mutation coalescing stats
__ASYNC_DOM_DEVTOOLS__.flush()              // Force-send pending mutations
```

### Chrome Extension

A standalone Chrome DevTools extension is available in [`chrome-extension/`](./chrome-extension). Load it as an unpacked extension for a dedicated DevTools panel with tree view, performance charts, and mutation log.

## Sandbox Mode

Run third-party scripts that access bare `document`/`window` globals without modification:

```ts
// Mode 1: Patch worker globals — bare `document` resolves to virtual DOM
const { document, window } = createWorkerDom({ sandbox: "global" });
// Now self.document === document, self.window === window
// Third-party scripts "just work"

// Mode 2: Sandboxed eval — Proxy + with for full variable interception
const { window } = createWorkerDom({ sandbox: "eval" });
window.eval(`
  var div = document.createElement("div");
  div.textContent = "Created by third-party script";
  document.body.appendChild(div);
`);

// Mode 3: Both modes enabled
const { document, window } = createWorkerDom({ sandbox: true });
```

| Mode | Bare `document` works | `window.eval()` sandbox | Use case |
| ---- | --------------------- | ----------------------- | -------- |
| `"global"` | Yes (patches `self`) | No | Framework code that uses bare globals |
| `"eval"` | No | Yes (Proxy + with) | Third-party analytics/ads scripts |
| `true` | Yes | Yes | Maximum compatibility |

## Architecture

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

## Synchronous DOM Reads

Inspired by [Partytown](https://partytown.builder.io/), async-dom uses `SharedArrayBuffer` + `Atomics.wait/notify` for blocking reads:

| API | Returns |
| --- | ------- |
| `el.getBoundingClientRect()` | Real DOMRect values |
| `el.offsetWidth`, `clientHeight`, etc. | Real layout metrics |
| `window.getComputedStyle(el)` | Real computed styles |
| `window.innerWidth` / `innerHeight` | Real viewport dimensions |
| `window.screen.width` / `height` | Real screen dimensions |

**Fallback:** Without COOP/COEP headers, sync reads return default values (`0` / `{}`).

## Security

- **HTML sanitizer** — `innerHTML` and `insertAdjacentHTML` strip `<script>`, `<iframe>`, `<style>`, `<object>`, `on*` attributes, and `javascript:`/`data:text/html` URIs. Opt out with `allowUnsafeHTML: true`.
- **Property allowlist** — `setProperty` only applies safe properties (`value`, `checked`, `textContent`, etc.). Extend with `additionalAllowedProperties`.
- **Attribute filtering** — `setAttribute` blocks `on*` handlers and dangerous URIs.

## Per-App Isolation

Each app gets its own `DomRenderer`, `NodeCache`, `EventBridge`, and `SyncChannelHost`. Shadow DOM provides CSS encapsulation:

```ts
const dom = createAsyncDom({ target: document.body });

dom.addApp({
  worker: new Worker("./app-a.ts", { type: "module" }),
  mountPoint: "#container-a",
  shadow: true,  // CSS fully isolated
});

dom.addApp({
  worker: new Worker("./app-b.ts", { type: "module" }),
  mountPoint: "#container-b",
  shadow: { mode: "closed" },
});

dom.start();
```

## Transports

| Class | Use case |
| ----- | -------- |
| `WorkerTransport` | Default — structured clone via `postMessage` |
| `BinaryWorkerTransport` | Zero-copy binary codec (22 opcodes + string dedup) |
| `WebSocketTransport` | WebSocket with auto-reconnect and exponential backoff |
| `createComlinkEndpoint` | Comlink RPC adapter (optional peer dependency) |

## Comparison

| Feature | async-dom | [Partytown](https://partytown.builder.io/) | [@ampproject/worker-dom](https://github.com/nicejob/nicejob) |
| ------- | --------- | ------------------------------------------- | ------------------------------------------------------------ |
| Use case | Full app rendering | Third-party scripts | AMP components |
| DOM API | Comprehensive | Proxy forwarding | Subset |
| Sync reads | SharedArrayBuffer | Service Worker + Atomics | No |
| Frame budgeting | Adaptive | No | No |
| Binary wire format | 22 opcodes + string dedup | No | Transfer list |
| Multi-app isolation | Shadow DOM | No | No |
| In-page devtools | Built-in panel | No | No |
| Bundle (gzip) | ~11 KB + ~10 KB | ~12 KB | ~12 KB |

## Browser Support

| Browser | Minimum | Notes |
| ------- | ------- | ----- |
| Chrome | 80+ | Full support |
| Firefox | 79+ | Full support |
| Safari | 15.2+ | Requires COOP/COEP headers for sync reads |
| Edge | 80+ | Full support (Chromium) |

**Required for sync reads:**
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

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
