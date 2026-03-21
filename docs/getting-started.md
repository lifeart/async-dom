# Getting Started with async-dom

## 1. Mental Model

async-dom moves your application code off the main thread into a Web Worker. The worker builds a virtual DOM using **standard DOM APIs** (`createElement`, `addEventListener`, `textContent`). Mutations are serialized and sent to the main thread, which applies them to the real DOM.

```
┌─────────────────────────┐         postMessage         ┌──────────────────────────┐
│       Web Worker        │  ─────────────────────────>  │       Main Thread        │
│                         │                              │                          │
│  const { document }     │   serialized mutations       │  DomRenderer applies     │
│    = createWorkerDom()  │   (createElement, setText,   │  mutations to real DOM   │
│                         │    setAttribute, ...)        │                          │
│  document.createElement │                              │  EventBridge serializes  │
│  el.textContent = "hi"  │   serialized events          │  DOM events and sends    │
│  el.addEventListener    │  <─────────────────────────  │  them back to worker     │
│  document.body.append   │   (click, input, keydown)    │                          │
└─────────────────────────┘                              └──────────────────────────┘
     Virtual Document                                         Real Document
```

### Three Rules

**1. Worker code uses standard DOM APIs.** Your worker calls `document.createElement("div")`, `el.textContent = "hello"`, `el.addEventListener("click", handler)`. These are vanilla DOM operations on a `VirtualDocument`, not a framework API.

**2. Framework adapters are main-thread mount points only.** React's `<AsyncDom>`, Vue's `<AsyncDom>`, and Svelte adapters exist solely to mount the rendering target and manage the worker lifecycle on the main thread. They do not run inside the worker.

**3. The worker never imports React, Vue, or Svelte.** The worker file imports `createWorkerDom` from `@lifeart/async-dom/worker` and nothing else from any UI framework. All UI logic in the worker is vanilla DOM manipulation.

> **Common misconception:** "I write React components in the worker and async-dom renders them."
> No. The worker uses plain DOM APIs. The React/Vue/Svelte adapter is a host-side component that
> creates a `<div>` and a `Worker`, then wires them together. Your worker code is framework-free.

### What `createWorkerDom` Returns

`createWorkerDom` returns a `WorkerDomResult`:

```typescript
// src/worker-thread/index.ts
interface WorkerDomResult {
  /** Virtual document implementing a subset of the DOM Document API. */
  document: VirtualDocument;
  /** Virtual window providing location, history, screen, timers, observers, and more. */
  window: WorkerWindow;
  /** Tear down the virtual DOM, cancel timers, and close the transport. */
  destroy: () => void;
}
```

The `document` supports `createElement`, `createTextNode`, `getElementById`, `querySelector`, `querySelectorAll`, `body`, `head`, and other standard DOM APIs. The `window` provides `location`, `history`, `localStorage`, `sessionStorage`, `fetch`, `setTimeout`, `requestAnimationFrame`, `MutationObserver`, `ResizeObserver`, `IntersectionObserver`, and more.

### What `createAsyncDom` Returns

On the main thread, `createAsyncDom` returns an `AsyncDomInstance`:

```typescript
// src/main-thread/index.ts
interface AsyncDomInstance {
  start(): void;       // Start applying mutations to the DOM
  stop(): void;        // Pause mutation application
  destroy(): void;     // Tear down everything
  addApp(config: AppConfig): AppId;          // Add a worker-backed app
  addRemoteApp(config: RemoteAppConfig): AppId;  // Add a remote app
  removeApp(appId: AppId): void;             // Remove an app
}
```

---

## 2. Quick Start -- Vanilla

### Scaffold a Project

```bash
npx @lifeart/async-dom init my-app --template vanilla-ts
cd my-app
npm install
npm run dev
```

This generates four key files. Here is each one, annotated.

### `src/main.ts` -- Main Thread Entry

```typescript
// src/main.ts
import { createAsyncDom } from "@lifeart/async-dom";

// 1. Create a Web Worker pointing at the worker entry file.
//    Vite handles the URL resolution and bundling.
const worker = new Worker(new URL("./app.worker.ts", import.meta.url), {
  type: "module",
});

// 2. Create the async-dom instance. `target` is the DOM element
//    where worker-produced mutations will be rendered.
const instance = createAsyncDom({
  target: document.getElementById("app")!,
  worker,
});

// 3. Start the frame-budget scheduler. Without this call,
//    mutations are queued but never applied.
instance.start();
```

### `src/app.worker.ts` -- Worker Entry

```typescript
// src/app.worker.ts
import { createWorkerDom } from "@lifeart/async-dom/worker";

// 1. Create the virtual document. This sets up the transport
//    back to the main thread via postMessage.
const { document } = createWorkerDom();

// 2. Use standard DOM APIs. No framework imports.
const heading = document.createElement("h1");
heading.textContent = "Hello from async-dom!";
document.body.appendChild(heading);

// 3. Events work the same way. The main thread serializes the
//    real DOM event and sends it to the worker via postMessage.
const counter = document.createElement("button");
counter.textContent = "Count: 0";
let count = 0;
counter.addEventListener("click", () => {
  count++;
  counter.textContent = `Count: ${count}`;
});
document.body.appendChild(counter);
```

### `vite.config.ts`

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { asyncDomPlugin } from "@lifeart/async-dom/vite-plugin";

export default defineConfig({
  plugins: [asyncDomPlugin()],
});
```

The plugin sets COOP/COEP headers for `SharedArrayBuffer` support and injects compile-time debug flags. See section 4 for details.

### Run

```bash
npm run dev
```

Open `http://localhost:5173`. You should see a heading and a clickable counter button.

---

## 3. Quick Start -- React Host

### Scaffold a Project

```bash
npx @lifeart/async-dom init my-app --template react-ts
cd my-app
npm install
npm run dev
```

### `src/App.tsx` -- React Mount Point

```tsx
// src/App.tsx
import { AsyncDom } from "@lifeart/async-dom/react";

export function App() {
  return (
    <AsyncDom
      worker="./app.worker.ts"
      fallback={<p>Loading...</p>}
      onReady={(instance) => console.log("async-dom ready", instance)}
    />
  );
}
```

`<AsyncDom>` is a React component that:
1. Renders a `<div>` as the mount target.
2. Creates a `Worker` from the `worker` prop URL.
3. Calls `createAsyncDom` internally and starts the scheduler.
4. Calls `onReady` when the worker sends its `ready` message.
5. Cleans up on unmount (calls `destroy`).

### `src/app.worker.ts` -- Worker Entry (Same as Vanilla)

```typescript
// src/app.worker.ts
import { createWorkerDom } from "@lifeart/async-dom/worker";

const { document } = createWorkerDom();

const heading = document.createElement("h1");
heading.textContent = "Hello from async-dom + React!";
document.body.appendChild(heading);
```

**The worker does NOT import React.** It uses `document.createElement`, `textContent`, `addEventListener` -- standard DOM APIs only. React runs exclusively on the main thread as the host for the `<AsyncDom>` mount point.

### `vite.config.ts`

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { asyncDomPlugin } from "@lifeart/async-dom/vite-plugin";

export default defineConfig({
  plugins: [react(), asyncDomPlugin()],
});
```

For a more complex example, see `examples/react-mandelbrot/` -- a fractal renderer that computes the Mandelbrot set entirely in the worker and renders an 80x60 interactive grid using vanilla DOM APIs.

---

## 4. Vite Configuration

The `asyncDomPlugin` configures your Vite project for async-dom. Import it from `@lifeart/async-dom/vite-plugin`.

```typescript
// vite.config.ts
import { asyncDomPlugin } from "@lifeart/async-dom/vite-plugin";

export default defineConfig({
  plugins: [
    asyncDomPlugin({
      headers: true,            // default
      debug: undefined,         // default: auto (true in dev, false in prod)
      binaryTransport: true,    // default
      workerErrorOverlay: true, // default
    }),
  ],
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headers` | `boolean` | `true` | Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. Required for `SharedArrayBuffer` support (synchronous DOM reads like `getBoundingClientRect`, `getComputedStyle`). |
| `debug` | `boolean` | Auto | Force debug mode on or off. When auto (unset), debug is enabled in development (`vite dev`) and disabled in production (`vite build`). Controls the `__ASYNC_DOM_DEBUG__` compile-time flag. |
| `binaryTransport` | `boolean` | `true` | Use the binary codec for mutation transport in production builds. Binary encoding is more compact and faster than JSON. Controls the `__ASYNC_DOM_BINARY__` compile-time flag. Only applies in production; dev always uses JSON. |
| `workerErrorOverlay` | `boolean` | `true` | Forward unhandled worker errors to the Vite error overlay during development. Injects a small script into `index.html` that listens for `async-dom:error` events on the Vite HMR channel. |

### Dev vs Production Behavior

| Behavior | Development | Production |
|----------|-------------|------------|
| `__ASYNC_DOM_DEBUG__` | `true` | `false` |
| `__ASYNC_DOM_BINARY__` | `false` | `true` (if `binaryTransport` enabled) |
| COOP/COEP headers | Set by dev server middleware | Must be set by your hosting provider |
| Worker error overlay | Active (injected into HTML) | Not injected |
| Worker format | ES modules | ES modules |

---

## 5. Styling

All styling is done from worker code using standard DOM APIs. There are no special styling imports or abstractions.

### `<style>` Elements

Create a `<style>` element and append it to `document.head`:

```typescript
// worker.ts
const style = document.createElement("style");
style.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f5f5f5; }
  .app { max-width: 480px; margin: 0 auto; }
  h1 { font-size: 28px; color: #333; }
  .input-row { display: flex; gap: 8px; }
  .input-row input {
    flex: 1; padding: 10px 14px; font-size: 16px;
    border: 2px solid #ddd; border-radius: 6px;
  }
  .input-row button {
    padding: 10px 20px; background: #4a90d9; color: white;
    border: none; border-radius: 6px; cursor: pointer;
  }
`;
document.head.appendChild(style);
```

This is taken directly from `examples/todo/worker.ts`. The `<style>` element is serialized as a mutation and applied to the real DOM's `<head>`.

### Inline Styles

Use the `style` property or `setAttribute`:

```typescript
// Property access (individual properties)
el.style.color = "red";
el.style.backgroundColor = "#f0f0f0";
el.style.display = "flex";

// setAttribute for bulk inline styles
el.setAttribute("style", "display: flex; gap: 8px; padding: 10px;");
```

### classList API

```typescript
const div = document.createElement("div");
div.classList.add("active");
div.classList.add("highlighted");
div.classList.remove("active");
div.classList.toggle("done", isDone);
div.classList.contains("highlighted"); // true

// className for bulk assignment
div.className = "card card-primary";
```

### External CSS via `<link>` Tags

```typescript
const link = document.createElement("link");
link.setAttribute("rel", "stylesheet");
link.setAttribute("href", "/styles/main.css");
document.head.appendChild(link);
```

Note: external stylesheets must be served with appropriate CORS headers if COEP is enabled (see section 11).

### Tailwind CSS

Tailwind works normally. Include the Tailwind build in your main HTML or via a `<link>` tag, then apply utility classes in worker code:

```typescript
const card = document.createElement("div");
card.className = "bg-white rounded-lg shadow-md p-6 max-w-sm mx-auto";

const title = document.createElement("h2");
title.className = "text-xl font-bold text-gray-800 mb-2";
title.textContent = "Card Title";
card.appendChild(title);
```

### CSS-in-JS

Create `<style>` elements with generated content. Do not use `insertRule` -- it is not supported on the virtual `CSSStyleSheet`. Instead, build CSS strings and set them as `textContent`:

```typescript
function css(className: string, rules: Record<string, string>): string {
  const body = Object.entries(rules)
    .map(([prop, val]) => `${prop}: ${val};`)
    .join(" ");
  return `.${className} { ${body} }`;
}

const style = document.createElement("style");
style.textContent = css("my-button", {
  background: "#4a90d9",
  color: "white",
  padding: "8px 16px",
  "border-radius": "4px",
});
document.head.appendChild(style);
```

### Shadow DOM Scoping

When adding an app with `shadow: true`, its DOM is mounted inside a Shadow Root. Styles defined inside the worker are scoped to that shadow tree:

```typescript
// main thread
instance.addApp({
  worker: myWorker,
  shadow: true, // or { mode: "open" }
});
```

Styles created by the worker's `<style>` elements will be scoped to the shadow root and will not leak to the rest of the page.

---

## 6. Form Handling

Form inputs require a round-trip between the main thread and the worker. Here is the flow:

```
User types in <input>
        │
        ▼
Main thread: EventBridge serializes the event
  ├── Reads target.value, target.checked, target.selectedIndex
  ├── Sends serialized event via postMessage
  │
  ▼
Worker: event handler receives deserialized event
  ├── e.value contains the current input value
  ├── e.checked contains checkbox state
  ├── Worker updates its own state
  ├── Worker updates virtual DOM (e.g., el.textContent = ...)
  │
  ▼
Main thread: DomRenderer applies resulting mutations
```

### Supported Form Elements

The `EventBridge` (in `src/main-thread/event-bridge.ts`) serializes state for:

- **`<input>`**: `value` and `checked` are included in the serialized event.
- **`<textarea>`**: `value` is included.
- **`<select>`**: `value` and `selectedIndex` are included.

### Code Example

From the todo app (`examples/todo/worker.ts`):

```typescript
// Text input
const input = document.createElement("input");
input.setAttribute("type", "text");
input.setAttribute("placeholder", "What needs to be done?");

input.addEventListener("keydown", (e: unknown) => {
  const event = e as { key?: string };
  if (event.key === "Enter") {
    addTodo(input.value);
    input.value = "";  // Clear input after adding
  }
});

// Checkbox
const toggle = document.createElement("input");
toggle.setAttribute("type", "checkbox");
toggle.addEventListener("click", () => {
  const todo = todos.get(id);
  if (todo) {
    todo.done = !todo.done;
    li.classList.toggle("done", todo.done);
  }
});
```

### Latency

The `postMessage` round-trip for events typically takes 1-3ms. This is fast enough that users do not perceive any input lag for typing, clicking, or selecting. The `EventBridge` tracks timing data per-event (serialize time, transport time, worker dispatch time) which you can inspect in the devtools panel.

### `preventDefault`

By default, passive events (`scroll`, `touchstart`, `touchmove`, `wheel`) are registered with `{ passive: true }`. If you need `preventDefault` on these events, configure it on the main thread via the `configureEvent` API. For click events on `<a>` elements, `preventDefault` is called automatically to prevent navigation.

### File Inputs and Drag-and-Drop

`File` objects cannot be serialized via `postMessage` structured clone, and the `DataTransfer` API is main-thread only. This means file inputs and drag-and-drop require main-thread handling with manual data forwarding to the worker.

**File inputs:** Handle the `change` event on the main thread, read the file contents, and send the data to the worker via a custom message:

```typescript
// main.ts — after creating the worker
worker.addEventListener("message", (e) => {
  // ... normal async-dom message handling
});

// Listen for file input changes on the real DOM
document.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.type === "file" && input.files?.length) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      worker.postMessage({
        type: "file-data",
        name: file.name,
        size: file.size,
        mimeType: file.type,
        data: reader.result, // ArrayBuffer
      }, [reader.result as ArrayBuffer]); // Transfer, not copy
    };
    reader.readAsArrayBuffer(file);
  }
});
```

```typescript
// worker.ts — receive the file data
self.addEventListener("message", (e) => {
  if (e.data?.type === "file-data") {
    const { name, size, data } = e.data;
    statusEl.textContent = `Received ${name} (${size} bytes)`;
    // Process the ArrayBuffer as needed
  }
});
```

**Drag and drop:** Handle `dragover` and `drop` on the main thread, extract the relevant data, and forward it to the worker:

```typescript
// main.ts
const target = document.getElementById("app")!;
target.addEventListener("dragover", (e) => e.preventDefault());
target.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (files?.length) {
    // Read and forward each file as shown above
  }
  const text = e.dataTransfer?.getData("text/plain");
  if (text) {
    worker.postMessage({ type: "drop-text", text });
  }
});
```

The worker creates the file input element via the virtual DOM as usual. The main thread intercepts the actual file selection or drop, reads the data, and sends it through a custom message channel.

---

## 7. Data Fetching

### `fetch()` in Workers

`fetch()` is natively available in Web Workers. Use it directly in your worker code:

```typescript
// worker.ts
const { document } = createWorkerDom();

const list = document.createElement("ul");
document.body.appendChild(list);

const res = await fetch("/api/items");
const items: Array<{ name: string }> = await res.json();

for (const item of items) {
  const li = document.createElement("li");
  li.textContent = item.name;
  list.appendChild(li);
}
```

### WebSocket

WebSocket is available in workers. Open connections, send messages, and update the DOM in response:

```typescript
const ws = new WebSocket("wss://example.com/stream");
ws.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  statusEl.textContent = data.status;
});
```

### Cookie Handling

Workers cannot access `document.cookie` directly. However, `fetch()` requests from workers automatically include cookies set by the server (same-origin requests). For auth flows, prefer `HttpOnly` cookies -- the browser attaches them to `fetch()` automatically and the token never appears in JavaScript memory. See the [security guide](./security-guide.md) section 5 for details.

### CORS with COOP/COEP

When COEP (`require-corp`) is enabled, all cross-origin resources loaded by the page must either:
- Include `Cross-Origin-Resource-Policy: cross-origin` in their response headers, or
- Be requested with CORS (`crossorigin` attribute or `mode: "cors"` in `fetch`).

This applies to images, fonts, scripts, and API endpoints. If a third-party API does not support CORS, you may need to proxy it through your own server.

---

## 8. State Management Patterns

Worker state is plain JavaScript -- variables, objects, `Map`s, arrays. There are no special state primitives or stores. Framework-specific state libraries (Redux, Zustand, Jotai, Pinia) run on the main thread and cannot be imported in the worker.

### Worker-Side State

The simplest pattern: keep state in the worker and render directly to the virtual DOM.

```typescript
// worker.ts
const { document } = createWorkerDom();

// State is just variables
let count = 0;
const todos = new Map<number, { text: string; done: boolean }>();

function render() {
  countEl.textContent = `Count: ${count}`;
  // Re-render todo list, update classList, etc.
}

button.addEventListener("click", () => {
  count++;
  render();
});
```

This works well for self-contained worker apps. The worker owns both state and rendering.

### Main-Thread State to Worker

When the main thread owns state (e.g., from a React/Vue parent component), send updates to the worker via `postMessage`:

```typescript
// main.ts
const worker = new Worker(new URL("./app.worker.ts", import.meta.url), {
  type: "module",
});

// Send state changes to the worker
function updateWorkerState(state: { user: string; theme: string }) {
  worker.postMessage({ type: "state-update", payload: state });
}
```

```typescript
// worker.ts
let currentUser = "";
let currentTheme = "light";

self.addEventListener("message", (e) => {
  if (e.data?.type === "state-update") {
    const { user, theme } = e.data.payload;
    currentUser = user;
    currentTheme = theme;
    render();
  }
});
```

### Guidelines

- **Keep state close to where it is used.** If only the worker reads and writes it, keep it in the worker.
- **Avoid mirroring state.** Do not keep the same state in both the main thread and the worker -- pick one owner.
- **Serialize conservatively.** `postMessage` uses structured clone. Send only the data the worker needs, not entire application state trees.
- **Use Transferable objects for large data.** `ArrayBuffer`, `OffscreenCanvas`, and `MessagePort` can be transferred (zero-copy) instead of cloned.

---

## 9. Debugging

### Chrome DevTools

Workers appear in Chrome DevTools under **Sources > Workers** (or **Sources > Page > Workers**). You can set breakpoints, step through code, and inspect variables in worker code just like main-thread code.

The **Console** panel has a context dropdown (top-left). Select the worker context to run commands in the worker's scope.

### Built-in Devtools Panel

Enable the built-in devtools panel by passing `debug: { exposeDevtools: true }` to `createAsyncDom` (main thread) or `createWorkerDom` (worker):

```typescript
// Main thread
const instance = createAsyncDom({
  target: document.getElementById("app")!,
  worker,
  debug: { exposeDevtools: true },
});

// Or use debug: true for sensible defaults (logMutations + logEvents + exposeDevtools)
const instance = createAsyncDom({
  target: document.getElementById("app")!,
  worker,
  debug: true,
});
```

When `debug: true`, this is equivalent to `{ logMutations: true, logEvents: true, exposeDevtools: true }`.

### Devtools Panel Tabs

The in-page devtools panel has 5 tabs:

| Tab | Purpose |
|-----|---------|
| **Tree** | Displays the virtual DOM tree from the worker. Click "refresh" to load the current tree structure. Useful for verifying that the virtual DOM matches your expectations. |
| **Performance** | Shows frame-budget scheduler stats: pending mutations, frame timing, and worker performance entries prefixed with `async-dom:`. |
| **Log** | Real-time stream of mutations and events flowing through the system. Supports filtering and pause/resume. Shows mutation type, target node, and timing. |
| **Warnings** | Collects warnings emitted during rendering (e.g., sanitized HTML, blocked attributes). A badge shows the count of unread warnings. |
| **Graph** | Causality graph showing the relationship between events and the mutations they triggered. Helps trace which user interaction caused which DOM update. |

### Console API

When `exposeDevtools` is enabled, `__ASYNC_DOM_DEVTOOLS__` is available on `globalThis`:

```javascript
// In browser console (main-thread context)
__ASYNC_DOM_DEVTOOLS__.scheduler.pending()  // Number of pending mutations
__ASYNC_DOM_DEVTOOLS__.nodeCache            // Inspect the node cache

// In browser console (worker context)
__ASYNC_DOM_DEVTOOLS__.tree()      // JSON representation of the virtual DOM
__ASYNC_DOM_DEVTOOLS__.stats()     // Mutation collector statistics
__ASYNC_DOM_DEVTOOLS__.mutations() // { pending: number }
__ASYNC_DOM_DEVTOOLS__.flush()     // Force-flush pending mutations
__ASYNC_DOM_DEVTOOLS__.findNode("my-id")  // Find a virtual node by ID
```

### Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `SharedArrayBuffer is not defined` | COOP/COEP headers are missing. | Ensure `asyncDomPlugin({ headers: true })` is set, or configure headers on your server. Check `crossOriginIsolated` in the console. |
| Worker error overlay shows "Worker error" | Unhandled exception in worker code. | Check the worker console context in DevTools. The stack trace is forwarded by the Vite plugin. |
| Events not firing | The listener was added after the element was removed, or the element was not appended to the document. | Ensure elements are in the DOM tree (`document.body.appendChild`) before expecting events. |
| Styles not appearing | `<style>` element was appended to `document.body` instead of `document.head`. | Append `<style>` and `<link>` elements to `document.head`. |
| `insertRule` not working | `CSSStyleSheet.insertRule` is not supported on virtual stylesheets. | Use `style.textContent` to set CSS rules as a string. |

---

## 10. Testing

### Unit Testing: VirtualDocument Directly

Create a `VirtualDocument` and a mock transport to test worker-side logic without a real browser:

```typescript
// my-component.test.ts
import { describe, it, expect } from "vitest";
import { VirtualDocument } from "@lifeart/async-dom/worker";
import { createAppId } from "@lifeart/async-dom";

describe("my component", () => {
  it("creates a heading", () => {
    const doc = new VirtualDocument(createAppId("test"));
    const h1 = doc.createElement("h1");
    h1.textContent = "Hello";
    doc.body.appendChild(h1);

    expect(doc.body.children.length).toBe(1);
    expect(doc.body.children[0].textContent).toBe("Hello");
  });
});
```

### Integration Testing: Full Round-Trip

The project's integration tests (`tests/integration/`) demonstrate the pattern. Use an `InMemoryTransport` pair to wire a `VirtualDocument` to a `DomRenderer`:

```typescript
// Based on tests/integration/test-helpers.ts
import { InMemoryTransport } from "./test-helpers";

function createTransportPair() {
  const workerTransport = new InMemoryTransport();
  const mainTransport = new InMemoryTransport();
  workerTransport._setPeer(mainTransport);
  mainTransport._setPeer(workerTransport);
  return { workerTransport, mainTransport };
}
```

Then connect them to a `VirtualDocument` and `DomRenderer`:

```typescript
// Based on tests/integration/full-roundtrip.test.ts
const { workerTransport, mainTransport } = createTransportPair();

// Worker side
const doc = new VirtualDocument(appId);
doc.collector.setTransport(workerTransport);

// Main-thread side
const renderer = new DomRenderer();
const scheduler = new FrameScheduler({ frameBudgetMs: 16 });
scheduler.setApplier((m) => renderer.apply(m));

mainTransport.onMessage((message) => {
  if (message.type === "mutation") {
    scheduler.enqueue(message.mutations, message.appId, "normal");
  }
});

// Test
const div = doc.createElement("div");
div.textContent = "hello";
doc.body.appendChild(div);
doc.collector.flushSync();
scheduler.flush();

const node = renderer.getNode(div._nodeId);
expect(node?.textContent).toBe("hello");
```

### E2E Testing: Playwright

For end-to-end tests, use Playwright and wait for worker-rendered DOM elements. Workers introduce async initialization -- the worker must start, build the virtual DOM, and send mutations before elements appear in the real DOM. Always use `waitForSelector` before interacting with worker-rendered content.

```typescript
// tests/e2e/counter.spec.ts
import { test, expect } from '@playwright/test';

test('counter increments on click', async ({ page }) => {
  await page.goto('/counter/');
  // Wait for worker to initialize
  await page.waitForSelector('button');

  await page.click('button:has-text("+")');
  await expect(page.locator('.count')).toHaveText('1');
});
```

A simpler variant when the page has a single button:

```typescript
import { test, expect } from "@playwright/test";

test("counter increments on click", async ({ page }) => {
  await page.goto("http://localhost:5173");

  // Wait for worker-rendered content to appear
  const button = await page.waitForSelector("button");
  await expect(button).toHaveText("Count: 0");

  await button.click();
  await expect(button).toHaveText("Count: 1");
});
```

Worker-rendered DOM is real DOM once applied, so standard Playwright selectors work. The key difference from testing a traditional SPA is the async initialization: without `waitForSelector`, tests may run before the worker has finished rendering, causing flaky failures.

---

## 11. Deployment

### Required Headers

async-dom requires two HTTP headers for full functionality (synchronous DOM reads via `SharedArrayBuffer`):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, `SharedArrayBuffer` is unavailable. `getBoundingClientRect()`, `getComputedStyle()`, and `offsetWidth` will return zero/empty values. All other features (mutations, events, rendering) work normally.

### Vercel

```json
// vercel.json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
```

### Netlify

Create a `_headers` file in your publish directory:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Content-Type-Options: nosniff
```

### Cloudflare Pages

Create a `_headers` file in your build output directory:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

See the [security guide](./security-guide.md) for a full deployment checklist including CSP, Trusted Types, and transport security.

### CDN Considerations

When COEP (`require-corp`) is enabled, all cross-origin resources must opt in:

- **Images/fonts from CDNs**: The CDN must return `Access-Control-Allow-Origin` headers, and you must load them with `crossorigin` attributes.
- **Third-party scripts**: Must be served with CORS headers or `Cross-Origin-Resource-Policy: cross-origin`.
- **Third-party iframes**: Must serve `Cross-Origin-Resource-Policy: cross-origin`. Many third-party embeds (YouTube, Google Maps, ad networks) do not support this yet.

### `coi-serviceworker.js` Fallback

For development or demo deployments where you cannot control server headers, the `coi-serviceworker.js` pattern enables `crossOriginIsolated` mode via a service worker that injects COOP/COEP headers. The examples in this repository use this approach:

```html
<!-- index.html -->
<script src="/coi-serviceworker.js"></script>
```

This is a **development/demo convenience only**. It requires a service worker registration and a page reload on first visit. Do not rely on it in production -- configure headers on your server instead.

### Build Output

```bash
npm run build     # Produces dist/ with main bundle + worker bundle
npm run preview   # Serves dist/ locally with COOP/COEP headers (via the Vite plugin)
```

The Vite plugin configures `worker: { format: "es" }` so worker scripts are bundled as ES modules. The worker bundle is a separate file that the browser loads when `new Worker(...)` is called.

---

## 12. When NOT to Use async-dom

async-dom adds architectural complexity. It is not the right tool for every project.

### SEO-Dependent Pages

Worker-rendered content is not present in the initial HTML response. Search engine crawlers that do not execute JavaScript (or do not wait for workers to initialize) will see an empty page. If SEO is critical, use server-side rendering or static generation instead.

### Simple Applications

If your app does not have CPU-intensive rendering, heavy computation, or complex animation, the overhead of worker communication (serialization, postMessage, deserialization, mutation application) exceeds the benefit. A counter app does not need async-dom -- it is used here only as a teaching example.

### Heavy DOM Measurement

If your application relies heavily on synchronous DOM measurements (`getBoundingClientRect`, `offsetWidth`, `getComputedStyle`), every measurement requires a sync-channel round-trip through `SharedArrayBuffer` + `Atomics.wait`. This adds latency to each read. Applications that measure dozens of elements per frame (e.g., virtualized list libraries, drag-and-drop with snapping) may perform worse than a main-thread implementation.

### Synchronous Third-Party Libraries

Libraries that synchronously read from the DOM during rendering (e.g., some charting libraries that measure SVG text, layout engines that read `offsetHeight` in a loop) will either fail or perform poorly. The virtual DOM's measurements go through the sync channel, which is slower than direct DOM access. Verify that your dependencies work in a worker environment before committing to async-dom.

### Accessibility Tooling

Screen readers and accessibility testing tools interact with the real DOM. Worker-rendered DOM is real DOM once applied, so accessibility generally works. However, ARIA live regions and focus management require careful handling -- focus changes initiated by the worker are applied asynchronously, which can cause brief timing gaps that affect screen reader announcements.
