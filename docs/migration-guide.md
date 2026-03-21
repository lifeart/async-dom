# Migration Guide: Adopting async-dom from React, Vue, or Svelte

This guide is for developers with existing React, Vue, or Svelte applications who want to adopt `@lifeart/async-dom`. It covers both incremental adoption and full rewrites, with honest assessments of what works, what does not, and what to expect.

---

## 1. Before You Start

**async-dom is not a drop-in library that makes your React app run in a Web Worker.**

The worker environment uses vanilla DOM APIs (`document.createElement`, `el.addEventListener`, `el.style.color = "red"`). Your React components, Vue SFCs, and Svelte files do not transfer into the worker. There is no JSX runtime, no reactivity system, and no component lifecycle in the worker — just a virtual `document` and `window` that mirror the browser DOM API.

This means you have two adoption strategies:

### Strategy A: Incremental Adoption (Recommended)

Keep your existing framework app on the main thread. Move specific heavy components into worker-rendered "islands" using the `<AsyncDom>` component. The worker code for those islands is written in vanilla DOM.

**Choose this when:**
- You have a large existing app and cannot justify a rewrite
- Only specific parts of your UI are CPU-heavy (data grids, charts, visualizations)
- You want to protect specific content sections while keeping the rest as-is
- You need framework ecosystem features (routing, state management, dev tools)

### Strategy B: Full Rewrite

Move all interactive content into workers. The main thread becomes a thin shell (routing, auth, layout chrome). All UI rendering happens in vanilla DOM inside workers.

**Choose this when:**
- Building a new application from scratch (greenfield)
- Content protection is a primary requirement
- Building internal tools or dashboards where framework features are not critical
- Building for low-power devices with server-side rendering via WebSocket

### What You Give Up in the Worker

Regardless of strategy, worker-side code does not have access to:
- React hooks, component model, JSX, Context, Suspense
- Vue reactivity, SFCs, directives, Composition API
- Svelte compile-time reactivity, stores, transitions
- Any framework devtools

You gain: main thread liberation, content protection, multi-core utilization, and CSS isolation via shadow DOM.

---

## 2. Incremental Adoption (Recommended)

This is the practical path for most teams. Your existing React/Vue/Svelte app stays exactly where it is. You carve out specific heavy components and replace them with async-dom islands.

### Step 1: Install

```bash
npm install @lifeart/async-dom
```

### Step 2: Add the Vite Plugin

The plugin sets COOP/COEP headers (required for synchronous DOM reads) and injects compile-time flags.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { asyncDomPlugin } from "@lifeart/async-dom/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    asyncDomPlugin(),
  ],
});
```

The plugin does three things:
1. Adds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers
2. Sets `__ASYNC_DOM_DEBUG__` and `__ASYNC_DOM_BINARY__` compile-time flags
3. Forwards worker errors to the Vite error overlay in development

### Step 3: Create a Worker File

The worker file uses `createWorkerDom()` and vanilla DOM APIs. Suppose you have a heavy data grid component that you want to offload.

```ts
// heavy-grid.worker.ts
import { createWorkerDom } from "@lifeart/async-dom/worker";

const { document } = createWorkerDom();

// Build the grid using vanilla DOM
const container = document.createElement("div");
container.setAttribute("style", "font-family: system-ui;");

const table = document.createElement("table");
table.setAttribute("style", "width: 100%; border-collapse: collapse;");

// Generate 1000 rows with sorting/filtering logic
function renderRows(data: Array<Record<string, string>>) {
  // Clear existing rows
  while (table.firstChild) {
    table.removeChild(table.firstChild);
  }
  for (const row of data) {
    const tr = document.createElement("tr");
    for (const value of Object.values(row)) {
      const td = document.createElement("td");
      td.textContent = value;
      td.setAttribute("style", "padding: 4px 8px; border-bottom: 1px solid #eee;");
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
}

container.appendChild(table);
document.body.appendChild(container);

// Sort 10,000 rows — this runs in the worker, not on the main thread
const data = generateLargeDataset();
renderRows(data);

// Handle click events for sorting
table.addEventListener("click", (e) => {
  const target = e.target;
  // Sort logic here — heavy computation stays off the main thread
});
```

### Step 4: Replace the Component with `<AsyncDom>`

In your React app, replace the heavy component with the `<AsyncDom>` wrapper.

**Before:**
```tsx
function Dashboard() {
  return (
    <div>
      <Header />
      <HeavyDataGrid data={data} /> {/* blocks main thread */}
      <Sidebar />
    </div>
  );
}
```

**After:**
```tsx
import { AsyncDom } from "@lifeart/async-dom/react";

function Dashboard() {
  return (
    <div>
      <Header />
      <AsyncDom
        worker={() => new Worker(
          new URL("./heavy-grid.worker.ts", import.meta.url),
          { type: "module" }
        )}
        fallback={<div>Loading grid...</div>}
        onReady={(instance) => console.log("Grid worker ready")}
        onError={(err) => console.error("Grid worker error:", err)}
        style={{ minHeight: "400px" }}
      />
      <Sidebar />
    </div>
  );
}
```

For Vue:
```vue
<template>
  <div>
    <Header />
    <AsyncDom
      worker="./heavy-grid.worker.ts"
      :debug="true"
      @ready="onReady"
    >
      <template #fallback><div>Loading grid...</div></template>
    </AsyncDom>
    <Sidebar />
  </div>
</template>

<script setup>
import { AsyncDom } from "@lifeart/async-dom/vue";

function onReady(instance) {
  console.log("Grid worker ready");
}
</script>
```

For Svelte:
```svelte
<script>
  import { asyncDom } from "@lifeart/async-dom/svelte";
</script>

<Header />
<div use:asyncDom={{ worker: "./heavy-grid.worker.ts" }} />
<Sidebar />
```

### Step 5: Handle Communication Between Host and Worker

The `<AsyncDom>` component creates a worker and connects it to the main thread. DOM mutations flow automatically from worker to main thread. Events flow automatically from main thread to worker. For custom data passing, see Section 5 (Communication Patterns).

### What to Move First

Good candidates for worker islands:
- **CPU-heavy computation**: Mandelbrot renderers, sorting/filtering 10k+ rows, chart calculations
- **Large DOM trees**: Data grids with thousands of cells, complex SVG visualizations
- **Protected content**: Paywalled articles, exam questions, proprietary dashboards
- **Animation-heavy widgets**: Particle systems, game-of-life simulations, real-time data displays

Poor candidates:
- Simple forms and inputs (event round-trip latency makes typing feel laggy)
- Navigation menus and modals (need tight integration with framework routing)
- Components that depend heavily on framework context or global state

---

## 3. Full Rewrite Strategy

In this approach, the main thread is a thin shell. All interactive content renders inside workers.

### When This Makes Sense

- Greenfield dashboards and internal tools
- Content protection is the primary driver
- IoT or SmartTV apps where the server renders via WebSocket
- Multi-framework environments (run React, Vue, and Svelte side by side without conflicts)

### Architecture

```
Main Thread (thin shell)          Worker(s)
+---------------------------+     +------------------------+
| - HTML skeleton            |     | - All UI rendering     |
| - Routing (React Router)  |     | - Business logic       |
| - Auth (token management) |     | - Data processing      |
| - Layout chrome (nav bar) |     | - Event handling       |
| - createAsyncDom()        |     | - State management     |
+---------------------------+     +------------------------+
```

### Main Thread: Shell Setup

```ts
// main.ts
import { createAsyncDom } from "@lifeart/async-dom";

const asyncDom = createAsyncDom({
  target: document.body,
  debug: { exposeDevtools: true },
});

// Each section of your app runs in its own worker with shadow DOM isolation
asyncDom.addApp({
  name: "dashboard",
  worker: new Worker(new URL("./dashboard.worker.ts", import.meta.url), { type: "module" }),
  mountPoint: "#main-content",
  shadow: true,
});

asyncDom.addApp({
  name: "sidebar",
  worker: new Worker(new URL("./sidebar.worker.ts", import.meta.url), { type: "module" }),
  mountPoint: "#sidebar",
  shadow: true,
});

asyncDom.start();
```

### Worker: All UI Logic

```ts
// dashboard.worker.ts
import { createWorkerDom } from "@lifeart/async-dom/worker";

const { document, window } = createWorkerDom();

// Scoped styles — injected into shadow DOM, zero conflicts
const style = document.createElement("style");
style.textContent = `
  :host { display: block; padding: 24px; }
  h1 { color: #333; margin: 0 0 16px; }
  .card { background: white; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
`;
document.head.appendChild(style);

const heading = document.createElement("h1");
heading.textContent = "Dashboard";
document.body.appendChild(heading);

const card = document.createElement("div");
card.classList.add("card");
card.textContent = "Revenue: $142,000";
document.body.appendChild(card);

// Fetch data (fetch is available in workers)
const response = await fetch("/api/metrics");
const metrics = await response.json();
card.textContent = `Revenue: $${metrics.revenue.toLocaleString()}`;
```

### Multi-Framework Coexistence

The framework-showcase example demonstrates React, Vue, and Svelte workers running simultaneously on one page, each in shadow DOM isolation:

```ts
// main.ts — no framework runtime on the main thread at all
const asyncDom = createAsyncDom({ target: document.body });

asyncDom.addApp({
  name: "react-panel",
  worker: new Worker("./react-panel.worker.ts", { type: "module" }),
  mountPoint: "#react-root",
  shadow: true,
});

asyncDom.addApp({
  name: "vue-panel",
  worker: new Worker("./vue-panel.worker.ts", { type: "module" }),
  mountPoint: "#vue-root",
  shadow: true,
});

asyncDom.addApp({
  name: "svelte-panel",
  worker: new Worker("./svelte-panel.worker.ts", { type: "module" }),
  mountPoint: "#svelte-root",
  shadow: true,
});

asyncDom.start();
```

Each worker file uses `createWorkerDom()` and vanilla DOM. The shadow DOM option ensures CSS isolation between panels.

---

## 4. What Won't Work in the Worker

This section is exhaustive. If your existing code uses any of these, you need to either rewrite that part or keep it on the main thread.

### Browser APIs

| API | Status in Worker | Workaround |
|-----|-----------------|------------|
| `localStorage` | Available via `WorkerWindow.localStorage` | Uses sync channel to proxy reads/writes to the real `localStorage`. Scoped per app. |
| `sessionStorage` | Available via `WorkerWindow.sessionStorage` | In-memory only, scoped to worker lifecycle. |
| `document.cookie` | Not available | Pass cookies from main thread via `postMessage` at init. |
| `window.alert()` / `confirm()` / `prompt()` | Not available | Use custom modal UI rendered in the worker, or dispatch a custom event to the main thread. |
| `window.open()` | Not available | Send a message to the main thread to open a new tab. |
| `history.pushState()` | Available via `WorkerWindow.history.pushState()` | Generates a mutation that the main thread applies. See Section 6. |
| `window.location` | Available via `WorkerWindow.location` (read-only sync from main thread) | Updated from main thread on init. `assign()` and `replace()` generate navigation mutations. |
| `window.getComputedStyle()` | Available via sync channel | Requires COOP/COEP headers. Returns a subset of commonly used properties. |
| `getBoundingClientRect()` | Available via sync channel | Requires COOP/COEP headers. Returns real DOMRect values. |
| `offsetWidth`, `clientHeight`, etc. | Available via sync channel | Requires COOP/COEP headers. Without them, returns 0. |

### Canvas and Graphics

| API | Status | Notes |
|-----|--------|-------|
| Canvas 2D (`getContext('2d')`) | Not available | No `<canvas>` element in the virtual DOM. Use CSS-based rendering or `OffscreenCanvas` (separate from async-dom). |
| WebGL | Not available | Same limitation as Canvas 2D. |
| SVG | Works | SVG elements are regular DOM elements. Create them with `document.createElement("svg")` and set attributes normally. |

### Observers

| API | Status | Notes |
|-----|--------|-------|
| `MutationObserver` | Stub (no-op) | `observe()`, `disconnect()`, `takeRecords()` exist but do nothing. Frameworks that feature-detect and fall back gracefully will work. |
| `ResizeObserver` | Stub (no-op) | Same as above. Your resize handlers will never fire. |
| `IntersectionObserver` | Stub (no-op) | Lazy loading and infinite scroll patterns that depend on this will not work. |

### React-Specific Limitations

These apply if you are trying to use React patterns in worker code (which you should not be doing, but for clarity):

- **`useLayoutEffect`** — Does not exist. Worker code has no synchronous layout phase.
- **`React.createPortal`** — No real DOM to portal into from the worker.
- **`ReactDOM.findDOMNode`** — No real DOM nodes in the worker.
- **React DevTools** — Cannot inspect worker-rendered DOM. Use async-dom's built-in DevTools instead (`?debug` query parameter).
- **Concurrent Mode / Suspense** — Framework scheduling does not exist in the worker.
- **`useRef` with DOM access** — `ref.current` would be a `VirtualElement`, not an `HTMLElement`. Standard DOM methods work, but it is not an actual browser element.

### Vue-Specific Limitations

- **Template refs with native DOM methods** — `$refs.myEl` is a `VirtualElement`. Most DOM methods work, but anything requiring layout information needs the sync channel.
- **Transition system** — `<Transition>` and `<TransitionGroup>` rely on `getComputedStyle` and element lifecycle hooks that may not fire as expected.
- **`$el` access** — Returns a `VirtualElement`, not an `HTMLElement`.
- **`v-html` directive** — Works (innerHTML is supported), but content is sanitized: `<script>`, `<iframe>`, `<style>`, `on*` attributes, and `javascript:` URIs are stripped.
- **Vue DevTools** — Not compatible with worker rendering.

### Third-Party Libraries

| Library / Category | Works? | Notes |
|-------------------|--------|-------|
| D3 (DOM manipulation) | Partially | D3 selections that call `document.querySelector` will work against the virtual DOM. D3 transitions that measure layout will not work without the sync channel. |
| jQuery | No | Heavy reliance on `document`, `window`, and real DOM inspection. |
| Analytics scripts (GA, Segment) | No | Inject DOM elements, read cookies, access `navigator` properties. Keep these on the main thread. |
| CSS-in-JS (styled-components, Emotion) | No | Use `insertRule`, `sheet.cssRules`, and `CSSStyleSheet` APIs that do not exist in the worker. |
| Tailwind CSS | Yes | Class-based styling works. Inject a `<link>` or `<style>` element in the worker. |
| Chart.js | No | Depends on `<canvas>`. |
| Three.js | No | Depends on WebGL and `<canvas>`. |
| Lodash / date-fns / zod | Yes | Pure JS utilities work perfectly in workers. |
| Axios / ky | Yes | `fetch` is available in workers. HTTP client libraries work. |

### Other Missing APIs

- `window.matchMedia()` — Stub that always returns `{ matches: false }`. Media query-based responsive logic will not work.
- `window.getSelection()` — Stub returning empty selection. Text selection features will not work.
- `requestAnimationFrame` — Polyfilled with `setTimeout(cb, 16)`. Not tied to actual display refresh.
- `document.execCommand()` — Not available. Rich text editing requires a main-thread solution.

---

## 5. Communication Patterns

### Host to Worker: postMessage via Transport

The main thread can send custom messages to a worker through the transport layer. For the `<AsyncDom>` component, use the `onReady` callback to get the instance.

```tsx
// React main thread
function App() {
  const onReady = useCallback((instance: AsyncDomInstance) => {
    // The instance does not directly expose postMessage to the worker.
    // Instead, use the worker reference you created:
    workerRef.current?.postMessage({ type: "setTheme", theme: "dark" });
  }, []);

  const workerRef = useRef<Worker | null>(null);

  return (
    <AsyncDom
      worker={() => {
        const w = new Worker(new URL("./app.worker.ts", import.meta.url), { type: "module" });
        workerRef.current = w;
        return w;
      }}
      onReady={onReady}
    />
  );
}
```

```ts
// Worker side — listen for custom messages
// Note: async-dom's transport handles system messages internally.
// For custom messages, listen on the global worker scope:
self.addEventListener("message", (e) => {
  if (e.data?.type === "setTheme") {
    document.body.setAttribute("style", `background: ${e.data.theme === "dark" ? "#1a1a2e" : "#fff"}`);
  }
});
```

### Worker to Host: Custom Events

Workers cannot directly call main-thread functions. Use custom DOM events that bubble up through the rendered DOM.

```ts
// Worker side — dispatch a custom event
const button = document.createElement("button");
button.textContent = "Export";
button.addEventListener("click", () => {
  // This event will be dispatched on the real DOM element in the main thread
  const event = new CustomEvent("export-requested", { detail: { format: "csv" } });
  button.dispatchEvent(event);
});
```

### Shared State Patterns

For keeping host and worker in sync:

```ts
// Pattern: Auth token passing at initialization
// main.ts
const worker = new Worker("./app.worker.ts", { type: "module" });
worker.postMessage({ type: "init-auth", token: getAuthToken() });

// worker.ts
let authToken = "";
self.addEventListener("message", (e) => {
  if (e.data?.type === "init-auth") {
    authToken = e.data.token;
  }
});
```

```ts
// Pattern: Theme switching
// main.ts
function setTheme(theme: "light" | "dark") {
  worker.postMessage({ type: "theme-change", theme });
}

// worker.ts
self.addEventListener("message", (e) => {
  if (e.data?.type === "theme-change") {
    document.body.classList.remove("light", "dark");
    document.body.classList.add(e.data.theme);
  }
});
```

```ts
// Pattern: Locale changing
// main.ts
i18n.on("languageChanged", (lng) => {
  worker.postMessage({ type: "locale-change", locale: lng });
});

// worker.ts
let currentLocale = "en";
const translations: Record<string, Record<string, string>> = {};

self.addEventListener("message", (e) => {
  if (e.data?.type === "locale-change") {
    currentLocale = e.data.locale;
    rerenderUI();
  }
});
```

---

## 6. Routing

Worker code has access to `window.location` (read-only, synced from the main thread at init) and `window.history.pushState` / `replaceState` (which generate mutations applied by the main thread). However, `history.back()`, `history.forward()`, and `history.go()` are no-ops in the worker.

### Pattern A: Main-Thread Routing with Worker Content Swapping

This is the most practical approach for incremental adoption. Keep React Router (or Vue Router) on the main thread. Mount different workers for different routes.

```tsx
// React main thread
import { Routes, Route } from "react-router-dom";
import { AsyncDom } from "@lifeart/async-dom/react";

function App() {
  return (
    <Routes>
      <Route path="/dashboard" element={
        <AsyncDom
          worker={() => new Worker("./dashboard.worker.ts", { type: "module" })}
          fallback={<div>Loading dashboard...</div>}
        />
      } />
      <Route path="/analytics" element={
        <AsyncDom
          worker={() => new Worker("./analytics.worker.ts", { type: "module" })}
          fallback={<div>Loading analytics...</div>}
        />
      } />
      <Route path="/settings" element={<SettingsPage />} /> {/* regular React page */}
    </Routes>
  );
}
```

### Pattern B: Hash-Based Routing in the Worker

For full-rewrite apps, use `window.location.hash` to drive routing inside the worker.

```ts
// worker.ts
const { document, window } = createWorkerDom();

function renderRoute(hash: string) {
  document.body.textContent = ""; // clear
  switch (hash) {
    case "#/dashboard":
      renderDashboard(document);
      break;
    case "#/settings":
      renderSettings(document);
      break;
    default:
      renderDashboard(document);
  }
}

// Initial render based on current hash
renderRoute(window.location.hash);

// Listen for hash changes
window.addEventListener("hashchange", (e) => {
  renderRoute(window.location.hash);
});
```

### Pattern C: Worker-Side pushState

The worker can call `window.history.pushState()`, which generates a mutation that the main thread applies to the real `history` object.

```ts
// worker.ts
const link = document.createElement("a");
link.textContent = "Go to Dashboard";
link.addEventListener("click", (e) => {
  e.preventDefault();
  window.history.pushState({}, "", "/dashboard");
  renderDashboard(document);
});
```

Note: the main-thread browser URL will update, but `popstate` events from the browser back button are not automatically forwarded to the worker. You need to set up that bridge manually if you need it.

---

## 7. State Management

### Main-Thread State Stays on the Main Thread

React state (`useState`, `useReducer`, Context), Vue reactivity (`ref`, `reactive`, Pinia), and Svelte stores all stay on the main thread. They do not cross into the worker.

### Worker State Is Plain JavaScript

Inside the worker, manage state with plain variables, classes, or any pure-JS state management pattern.

```ts
// worker.ts
const { document } = createWorkerDom();

// Plain state object
const state = {
  items: [] as Array<{ id: string; text: string; done: boolean }>,
  filter: "all" as "all" | "active" | "done",
};

function addItem(text: string) {
  state.items.push({ id: crypto.randomUUID(), text, done: false });
  renderList();
}

function toggleItem(id: string) {
  const item = state.items.find((i) => i.id === id);
  if (item) item.done = !item.done;
  renderList();
}

function renderList() {
  const filtered = state.filter === "all"
    ? state.items
    : state.items.filter((i) => (state.filter === "done" ? i.done : !i.done));

  listContainer.textContent = "";
  for (const item of filtered) {
    const li = document.createElement("li");
    li.textContent = `${item.done ? "[x]" : "[ ]"} ${item.text}`;
    li.addEventListener("click", () => toggleItem(item.id));
    listContainer.appendChild(li);
  }
}
```

### Syncing State Between Main Thread and Worker

For shared state (e.g., user preferences stored in Redux on the main thread, needed by the worker for rendering), use `postMessage`:

```ts
// main.ts — send relevant Redux state to worker
store.subscribe(() => {
  const { theme, locale, userRole } = store.getState();
  worker.postMessage({ type: "state-sync", payload: { theme, locale, userRole } });
});

// worker.ts — receive and apply
let appConfig = { theme: "light", locale: "en", userRole: "viewer" };

self.addEventListener("message", (e) => {
  if (e.data?.type === "state-sync") {
    appConfig = { ...appConfig, ...e.data.payload };
    rerenderWithConfig(appConfig);
  }
});
```

Do not try to share Redux/Zustand/Pinia store instances across the worker boundary. They rely on synchronous subscriptions and in-memory references that cannot cross `postMessage`.

---

## 8. Testing Your Migration

### Unit Testing Worker Code

Worker code uses the `VirtualDocument` from `@lifeart/async-dom/worker`. You can test it directly in Node.js or any test runner without a browser:

```ts
// heavy-grid.test.ts
import { createWorkerDom } from "@lifeart/async-dom/worker";

test("renders correct number of rows", () => {
  const { document } = createWorkerDom({
    transport: { send() {}, onMessage() {}, close() {}, readyState: "open" },
  });

  // Call your rendering function
  renderGrid(document, testData);

  const rows = document.querySelectorAll("tr");
  expect(rows.length).toBe(testData.length);
});
```

### Integration Testing: Verifying Mutations

The `MutationCollector` records all mutations. You can inspect them to verify your worker produces the correct DOM output:

```ts
test("clicking sort header produces expected mutations", () => {
  const { document } = createWorkerDom({ /* mock transport */ });
  renderGrid(document, unsortedData);

  const headerCell = document.querySelector("th.sortable");
  // Simulate click
  headerCell.dispatchEvent(new Event("click"));

  // Check that rows are now in sorted order
  const cells = document.querySelectorAll("td.name");
  const names = Array.from(cells).map((c) => c.textContent);
  expect(names).toEqual(["Alice", "Bob", "Charlie"]);
});
```

### End-to-End Testing with Playwright

Playwright works with async-dom apps. The key consideration is waiting for worker initialization before asserting on content.

```ts
// e2e/dashboard.spec.ts
import { test, expect } from "@playwright/test";

test("dashboard renders after worker init", async ({ page }) => {
  await page.goto("/dashboard");

  // Wait for worker-rendered content to appear
  await expect(page.locator(".card")).toBeVisible({ timeout: 5000 });

  // Content is in the real DOM after mutation application
  await expect(page.locator(".card")).toContainText("Revenue");
});

test("click interaction works through worker round-trip", async ({ page }) => {
  await page.goto("/dashboard");
  await page.locator("button.sort").click();

  // Wait for worker to process the event and send back mutations
  await expect(page.locator("td.name").first()).toContainText("Alice");
});
```

### Snapshot Testing

Worker mutations are deterministic. Given the same input data, the virtual DOM tree will be identical. You can snapshot the `document.toJSON()` output for regression testing:

```ts
test("grid snapshot matches", () => {
  const { document } = createWorkerDom({ /* mock transport */ });
  renderGrid(document, fixtureData);
  expect(document.toJSON()).toMatchSnapshot();
});
```

---

## 9. Performance Validation

### Before/After Core Web Vitals

Measure these metrics before and after migration:
- **INP (Interaction to Next Paint)** — Should improve significantly since framework execution moves off the main thread.
- **TBT (Total Blocking Time)** — Should decrease because heavy JS execution no longer blocks the main thread.
- **LCP (Largest Contentful Paint)** — May increase slightly due to worker initialization time. Use `fallback` props to provide immediate visual content.
- **CLS (Cumulative Layout Shift)** — Ensure your `<AsyncDom>` containers have explicit dimensions to prevent layout shift when worker content loads.

### Using Built-in DevTools

Add `?debug` to your URL or set `debug: { exposeDevtools: true }` in your `createAsyncDom` config.

The Performance tab shows:
- **Worker-to-main latency** (P50/P95/P99) — If P95 exceeds 8ms, you are spending too much time per frame applying mutations.
- **Frame budget utilization** — The scheduler targets 60 fps. If frames consistently exceed 16ms, consider splitting large renders into smaller batches.
- **Dropped frames** — Indicates the main thread cannot keep up with mutation volume.

Access programmatically:
```ts
// In the browser console
const stats = __ASYNC_DOM_DEVTOOLS__.scheduler.stats();
console.log("Pending mutations:", __ASYNC_DOM_DEVTOOLS__.scheduler.pending());
console.log("Frame log:", __ASYNC_DOM_DEVTOOLS__.scheduler.frameLog());
```

### When the Overhead Exceeds the Benefit

async-dom adds overhead: serialization, transport, deserialization, and scheduling. For simple UIs with minimal computation, this overhead can exceed the benefit. Signs that async-dom is not helping:
- Worker-to-main latency exceeds the time saved by offloading computation
- INP increases due to event round-trip time
- The component does fewer than 100 DOM updates per interaction

In these cases, keep the component on the main thread.

---

## 10. Common Pitfalls

### 1. Missing COOP/COEP Headers

**Symptom:** `el.offsetWidth` returns 0, `getBoundingClientRect()` returns all zeros.

**Cause:** Synchronous DOM reads require `SharedArrayBuffer`, which requires these headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Fix:** Use the Vite plugin (`asyncDomPlugin()`) which sets these automatically. For production, configure your server or CDN to add them. Note: COEP may break third-party resources (images, scripts) that lack `Cross-Origin-Resource-Policy` headers. You may need to add `crossorigin` attributes or proxy those resources.

### 2. Trying to Use React/Vue/Svelte in Worker Code

**Symptom:** Import errors, "document is not defined", hooks called outside component tree.

**Cause:** The worker has a `VirtualDocument`, not a real `document`. React's reconciler, Vue's compiler output, and Svelte's runtime all expect real DOM APIs that the virtual DOM may not fully replicate.

**Fix:** Write worker code using vanilla DOM APIs. If you want framework-like patterns, use simple helper functions:
```ts
function h(tag: string, attrs: Record<string, string>, ...children: Array<string | Node>) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const child of children) {
    if (typeof child === "string") el.appendChild(document.createTextNode(child));
    else el.appendChild(child);
  }
  return el;
}
```

### 3. Not Handling Worker Initialization Delay

**Symptom:** Blank space where the worker content should be for 100-500ms.

**Cause:** Worker scripts must be fetched, parsed, and executed before any mutations are sent.

**Fix:** Always provide a `fallback` prop to `<AsyncDom>`:
```tsx
<AsyncDom
  worker="./app.worker.ts"
  fallback={<Skeleton />}
/>
```

### 4. Large Initial Render Causing Frame Drops

**Symptom:** Page stutters when the worker first renders. Subsequent updates are smooth.

**Cause:** The worker sends thousands of mutations on first render (e.g., a 5000-cell grid). The main-thread scheduler processes these within frame budgets, but the initial burst may still cause visible delay.

**Fix:**
- Render critical content first, then progressively add detail
- Use `requestAnimationFrame` in the worker to spread initial rendering across multiple frames
- Set explicit container dimensions so the browser can render the shell immediately

### 5. Event Round-Trip Latency on Rapid Interactions

**Symptom:** Typing in an input field feels sluggish. Click handlers respond with noticeable delay.

**Cause:** Every event follows this path: main thread DOM event -> serialize -> transport -> worker handler -> mutations -> transport -> main thread render. This adds 2-10ms per interaction.

**Fix:**
- For text inputs that need instant feedback, keep them on the main thread and sync values to the worker via `postMessage`
- For click handlers, the latency is usually acceptable (users do not notice 5ms click delay)
- For drag interactions, consider keeping the drag handler on the main thread and sending final position to the worker

### 6. Worker Code Cannot Access Parent Framework State

**Symptom:** Worker needs data from Redux/Pinia/Context but has no way to access it.

**Fix:** Treat the worker boundary like an API boundary. Send data explicitly:
```ts
// When relevant state changes, send it to the worker
store.subscribe(() => {
  const slice = selectRelevantState(store.getState());
  worker.postMessage({ type: "state-update", payload: slice });
});
```

### 7. Third-Party Scripts Breaking Under COEP

**Symptom:** Google Analytics, ad scripts, or CDN resources fail to load after enabling COOP/COEP.

**Cause:** `Cross-Origin-Embedder-Policy: require-corp` blocks cross-origin resources that don't include `Cross-Origin-Resource-Policy` headers.

**Fix:**
- Add `crossorigin="anonymous"` to `<script>`, `<link>`, and `<img>` tags
- For resources you don't control, use a reverse proxy
- Consider using the `credentialless` COEP value instead of `require-corp` (Chrome 96+)
- As a last resort, disable COOP/COEP headers (sync reads will return fallback values instead of real measurements)

### 8. Shadow DOM CSS Isolation Surprises

**Symptom:** Global styles (reset, fonts, utility classes) do not apply inside worker-rendered content.

**Cause:** When `shadow: true` is set in `addApp()`, the worker content renders inside a shadow root. Global CSS does not penetrate shadow boundaries.

**Fix:** Include all necessary styles in the worker via `<style>` elements appended to `document.head`. This is also a feature: CSS isolation prevents style conflicts between independently developed worker apps.

### 9. Memory Leaks from Undestroyed Workers

**Symptom:** Memory usage grows over time, especially with route-based worker mounting.

**Cause:** `<AsyncDom>` creates a new worker each time it mounts. If the component unmounts without cleanup, the worker continues running.

**Fix:** The `<AsyncDom>` React component handles cleanup on unmount automatically. If using the low-level API directly, call `asyncDom.removeApp(appId)` when you no longer need the app, and `worker.terminate()` to stop the worker.

### 10. Forgetting That `requestAnimationFrame` Is a Polyfill

**Symptom:** Animations in the worker run at slightly irregular intervals. `requestAnimationFrame` callback timestamps are not aligned with display refresh.

**Cause:** In the worker, `requestAnimationFrame` is implemented as `setTimeout(cb, 16)`. It is not synchronized with the browser's actual paint cycle.

**Fix:** For smooth animations, do the animation calculation in the worker and let the main-thread scheduler handle the actual frame timing. The scheduler applies mutations within the real frame budget. For animations that need precise frame alignment, keep them on the main thread.
