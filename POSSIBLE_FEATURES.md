# async-dom — Possible Future Features

## Virtual Viewport Rendering

**Status:** Designed, not implemented

Only create real DOM nodes for items visible in the scroll area. The worker maintains the full virtual tree; the main thread materializes ~25-50 nodes instead of 10,000.

| Metric | Without | With ViewportManager |
|--------|---------|---------------------|
| DOM nodes (10K list) | 10,000 | ~27 |
| Initial render | ~500ms | ~2ms |
| DOM memory | ~60-100MB | ~0.5MB |

**Architecture:** New `ViewportManager` layer between scheduler and renderer. Intercepts `appendChild` for containers marked with `data-virtual-scroll="true"`. Spacer divs maintain scroll height. Scroll events swap nodes within frame budget.

**Developer API:**
```ts
const list = document.createElement("div");
list.setAttribute("data-virtual-scroll", "true");
list.setAttribute("data-item-height", "40");
list.style.height = "600px";
list.style.overflow = "auto";

for (let i = 0; i < 10000; i++) {
    const item = document.createElement("div");
    item.textContent = `Item ${i}`;
    list.appendChild(item);
}
document.body.appendChild(list);
// Only ~25 DOM nodes created automatically
```

**Phase 1:** Main-thread-only filtering (no protocol changes).
**Phase 2:** Feedback loop — main thread sends `viewportRange` to worker, worker skips mutations for off-screen items (400x transport reduction).

---

## OffscreenCanvas Transfer

**Status:** Researched, not implemented

Transfer `OffscreenCanvas` from main thread to worker for native Canvas 2D / WebGL rendering. No mutation serialization needed for draw calls.

**Approach:** Main thread creates `<canvas>`, calls `transferControlToOffscreen()`, sends via `postMessage` transfer list. Worker draws directly with zero overhead.

**Requires:** Extending `Transport` interface with `sendTransferable()` method. Async `getContext()` API since canvas arrives after element creation.

**Browser support:** Chrome 69+, Firefox 105+, Safari 16.4+.

---

## AudioContext Bridge

**Status:** Infrastructure ready (`src/core/api-bridge.ts`), specific bridge not implemented

Use the generic `createApiBridge()` to proxy `AudioContext` from worker to main thread. Fire-and-forget for playback control, sync reads for `currentTime`/`state`.

```ts
const bridge = createApiBridge({
    apiName: "AudioContext",
    fireMethods: ["resume", "suspend", "close"],
    syncMethods: ["currentTime", "state"],
    properties: ["sampleRate"],
}, nodeId, syncChannel, collector);
```

**Note:** `AudioContext` is not available in workers. The bridge would create and control it on the main thread.

---

## Skia / CanvasKit Renderer

**Status:** Researched, NOT recommended

Render the virtual DOM to a `<canvas>` via CanvasKit (Skia WASM) instead of real DOM. This is Flutter Web's approach.

**Why not:** Contradicts async-dom's design philosophy. +3-6MB WASM, no accessibility, no text selection, no native form inputs, no CSS, no browser DevTools. Would require reimplementing the browser's layout engine.

---

## Numeric Opcode Wire Format (further optimization)

**Status:** Partially implemented (binary codec with 23 opcodes)

The current binary codec uses `DataView` with uint8 opcodes and string dedup. Further optimizations:

- **String table compression:** Delta-encode string indices across batches
- **Run-length encoding:** Consecutive mutations on the same node can share the nodeId
- **Batch-level compression:** LZ4/Brotli on the final buffer (adds decode cost)

---

## Time-Travel Debugging

**Status:** In devtools roadmap (DEVTOOLS_IMPROVEMENTS.md, feature #8)

Record mutation batches in a circular buffer. Replay from any point. Slider to scrub through history. Requires DOM snapshot/restore.

---

## Causality Graph

**Status:** In devtools roadmap (feature #15)

Show which events caused which mutation batches, and which batches affected which DOM subtrees. Full event→mutation→DOM causality chain. Requires instrumentation across worker event handling and mutation collection.

---

## Worker CPU Profiler

**Status:** In devtools roadmap (feature #16)

Use `performance.measure()` in the worker around event handlers and mutation collection. Send performance entries to main thread. Display worker CPU timeline alongside main-thread frame timeline.

---

## Framework-Specific Adapters

**Status:** Not started

Pre-built adapters for major frameworks:

- **React adapter:** Custom renderer that targets async-dom's virtual DOM instead of real DOM
- **Preact adapter:** Drop-in `document`/`window` replacement
- **Vue adapter:** Custom platform runtime
- **Svelte adapter:** Custom element target

These would allow frameworks to run in workers without any application code changes.

---

## Shared State Between Workers

**Status:** Not started

Allow multiple worker apps to share state via a `SharedArrayBuffer`-backed store. Like Redux but across workers with zero-copy reads.

---

## Server-Side Rendering (SSR) Support

**Status:** Not started

Run `createWorkerDom()` in Node.js (not a worker) to generate HTML strings. The virtual DOM's `toJSON()` could be extended to produce HTML for SSR, then hydrate in the browser with the worker taking over.

---

## Plugin System

**Status:** Not started

Allow third-party plugins to:
- Intercept mutations before they're applied
- Add custom mutation types
- Hook into the scheduler
- Extend the virtual DOM API
- Add custom devtools panels
