# async-dom DevTools Panel: Feature Improvement Plan

> Research-driven feature list based on React DevTools, Vue DevTools, Redux DevTools,
> Angular DevTools, Ember Inspector, MobX DevTools, Svelte DevTools, Preact DevTools,
> and Zustand DevTools — filtered for what is **uniquely valuable** to async-dom's
> worker-to-main-thread architecture.

---

## Current State

The existing panel (`src/debug/devtools-panel.ts`) has four tabs:

| Tab | What it does |
|---|---|
| **Tree** | Snapshot of the worker's virtual DOM; click-to-highlight real DOM node |
| **Performance** | Scheduler stats (pending, frame time, frame ID), queue sparkline, coalescing ratio |
| **Log** | Chronological mutation log with filter, pause, auto-scroll |
| **Warnings** | Warning entries with expandable stack traces, badge counter |

Debug types are defined in `src/core/debug.ts` (MutationLogEntry, EventLogEntry, SyncReadLogEntry, SchedulerLogEntry, WarningLogEntry).

---

## MUST-HAVE — High Impact, Feasible

### 1. Mutation Batch Diff View (inspired by Redux DevTools)

**What:** For each mutation batch (grouped by `batchUid`), show a before/after diff of the affected node properties. Redux's action-diff view lets you see exactly what changed per dispatch — async-dom should do the same per batch.

**How in async-dom:**
- Group `MutationLogEntry` items by `batchUid` in the Log tab.
- For each batch, show a collapsible summary: "Batch #42 — 12 mutations (3 coalesced)".
- Inside the batch, color-code additions (green), removals (red), and value changes (yellow) for setAttribute, setStyle, setProperty, setTextContent.
- Clicking a batch jumps to the affected nodes in the Tree tab.

**Complexity:** Medium
**Files:** `src/debug/devtools-panel.ts` (Log tab rendering), `src/core/debug.ts` (ensure batchUid is always set on MutationLogEntry)

---

### 2. Frame Budget Flamechart (inspired by React DevTools Profiler)

**What:** React's flamechart shows per-component render time within a commit. async-dom's equivalent is per-mutation execution time within a frame. Show a horizontal bar chart where each bar is a mutation applied during that frame, colored by how much of the 16ms budget it consumed.

**How in async-dom:**
- In the Performance tab, add a "Frames" sub-view with a scrollable timeline of recent frames.
- Each frame shows: total time, action count, and a stacked bar of individual mutation timings.
- Color bands: green (<4ms), yellow (4-12ms), red (>12ms).
- Clicking a frame shows its mutations grouped by type (createNode, setAttribute, etc.) with timing.
- The FrameScheduler already calls `recordTiming(action, ms)` per mutation — expose this data via the devtools API.

**Complexity:** Medium
**Files:** `src/core/scheduler.ts` (expose per-frame timing breakdown), `src/debug/devtools-panel.ts` (new flamechart sub-view in Performance tab)

---

### 3. Worker-Main Latency Monitor (unique to async-dom)

**What:** No other framework has a visible worker-to-main latency indicator because no other framework runs the app in a worker. Show the round-trip time from when a mutation batch is sent from the worker to when it is applied on the main thread.

**How in async-dom:**
- The MutationMessage already has a `uid`. Stamp `Date.now()` on the worker side when the batch is sent.
- On the main thread, record when the batch is received and when it finishes applying.
- Display in Performance tab: current latency, P50/P95/P99 latency, latency sparkline over time.
- Color: green (<5ms), yellow (5-16ms), red (>16ms — missed a frame).

**Complexity:** Low-Medium
**Files:** `src/worker-thread/mutation-collector.ts` (add timestamp to batch), `src/core/protocol.ts` (add `sentAt` field to MutationMessage), `src/main-thread/renderer.ts` or main-thread index (record receive time), `src/debug/devtools-panel.ts` (latency display)

---

### 4. Mutation Coalescing Visualizer (unique to async-dom)

**What:** MutationCollector coalesces duplicate mutations (e.g., multiple setStyle on the same property). The current panel shows a coalescing ratio as a single number. Instead, show *what* was coalesced — the "eliminated" mutations — so developers can understand whether their code is generating unnecessary work.

**How in async-dom:**
- In MutationCollector.coalesce(), emit debug events for coalesced (eliminated) mutations.
- In the Log tab, show coalesced mutations in a dimmed/strikethrough style alongside the surviving mutation.
- Add a toggle "Show coalesced" to the log toolbar.
- In Performance tab, show a breakdown: "setAttribute: 40 added, 15 coalesced (37%)" per mutation type.

**Complexity:** Medium
**Files:** `src/worker-thread/mutation-collector.ts` (emit coalesce debug events), `src/core/debug.ts` (new CoalescedLogEntry type), `src/debug/devtools-panel.ts` (coalesced rendering in Log tab, per-type breakdown in Performance tab)

---

### 5. Event Round-Trip Tracer (unique to async-dom)

**What:** Events in async-dom travel: real DOM (main) -> serialized -> worker -> handler -> mutations -> main thread -> applied. This is unlike any other framework. Show the full journey of an event from click to DOM update.

**How in async-dom:**
- The debug system already has EventLogEntry with `phase: "serialize" | "dispatch"`. Extend it to also track the resulting mutations.
- In a new "Events" section of the Log tab (or a 5th tab), show each event as a timeline:
  `[click] main:serialize (0.2ms) -> transport (1.1ms) -> worker:dispatch (0.3ms) -> 4 mutations generated`
- Correlate events to the mutation batches they produce by tagging mutations with the originating event's listenerId.

**Complexity:** Medium-High
**Files:** `src/main-thread/event-bridge.ts` (timestamp serialization), `src/worker-thread/events.ts` (timestamp dispatch, tag outgoing mutations), `src/core/debug.ts` (extend EventLogEntry), `src/debug/devtools-panel.ts` (event timeline rendering)

---

### 6. Highlight DOM Updates on Screen (inspired by React DevTools "Highlight Updates")

**What:** React can flash a colored border around components that re-rendered. async-dom should flash elements on the real DOM when mutations are applied to them, making it immediately visible which parts of the page are being updated.

**How in async-dom:**
- In DomRenderer.apply(), after applying a mutation, briefly add an outline/overlay to the affected real DOM node.
- Toggle via a button in the devtools header bar ("Highlight mutations").
- Color by mutation type: blue = attribute/style, green = new node appended, red = node removed, orange = text content.
- Auto-fade after 300ms.

**Complexity:** Low
**Files:** `src/main-thread/renderer.ts` (add highlight logic gated on debug flag), `src/debug/devtools-panel.ts` (toggle button, pass flag to renderer)

---

### 7. Queue Pressure Indicator / Health Dashboard (inspired by Ember Inspector render performance)

**What:** Ember Inspector shows render timing with clear warnings. async-dom needs a persistent, at-a-glance health indicator that shows whether the system is keeping up, falling behind, or in crisis.

**How in async-dom:**
- Add a colored status dot to the collapsed panel tab: green (queue <100, frame time <12ms), yellow (queue 100-1000 or frame time 12-16ms), red (queue >1000 or frame time >16ms).
- In the Performance tab, add threshold lines on the sparkline (16ms frame budget line).
- Show "frames dropped" counter: frames where `lastFrameTimeMs > frameBudgetMs`.

**Complexity:** Low
**Files:** `src/debug/devtools-panel.ts` (status dot, threshold visualization), `src/core/scheduler.ts` (expose dropped frame count)

---

## NICE-TO-HAVE — Medium Impact

### 8. Time-Travel / Batch Replay (inspired by Redux DevTools)

**What:** Redux's killer feature is replaying actions. In async-dom, allow replaying a recorded sequence of mutation batches to reproduce a visual state.

**How in async-dom:**
- Record mutation batches in a circular buffer (already partially done — mutationLog stores entries).
- Add "Replay" button in Log tab: re-applies mutations from a selected batch forward.
- Add a slider to scrub through batch history (like Redux's timeline slider).
- Requires clearing the DOM subtree and re-applying from a snapshot.

**Complexity:** High
**Files:** `src/debug/devtools-panel.ts`, `src/main-thread/renderer.ts` (snapshot/restore), new `src/debug/replay.ts`

---

### 9. Mutation Type Breakdown Chart (inspired by Vue DevTools Performance tab)

**What:** Vue's performance tab shows time spent per operation type. Show a pie or bar chart of mutation types (createNode, setAttribute, setStyle, etc.) by frequency and cumulative time.

**How in async-dom:**
- Aggregate mutation counts and timing by `action` type from the FrameScheduler's `actionTimes` map.
- Display as a simple horizontal bar chart in the Performance tab.
- Useful for identifying if an app is attribute-heavy, style-heavy, or DOM-structure-heavy.

**Complexity:** Low
**Files:** `src/debug/devtools-panel.ts` (chart rendering in Performance tab), `src/core/scheduler.ts` (expose actionTimes map)

---

### 10. Node Inspector Sidebar (inspired by Vue/React component inspector)

**What:** When clicking a node in the Tree tab, show a sidebar with all its attributes, styles, properties, event listeners, and the history of mutations that targeted it.

**How in async-dom:**
- Clicking a tree node opens a detail pane showing: tag, nodeId, all attributes, all styles, attached event listeners (from EventBridge), and a filtered list of mutations from the log that reference this nodeId.
- This is the async-dom equivalent of React's "props/state inspector" — but for DOM nodes across the thread boundary.

**Complexity:** Medium
**Files:** `src/debug/devtools-panel.ts` (sidebar panel in Tree tab), `src/main-thread/event-bridge.ts` (expose listener map for a nodeId)

---

### 11. Transport Message Size Monitor (unique to async-dom)

**What:** The transport layer (WorkerTransport, WebSocketTransport, BinaryWorkerTransport) serializes messages. Large messages slow the system. Show message size per batch.

**How in async-dom:**
- In the transport layer, measure `JSON.stringify(message).length` (or binary size for BinaryWorkerTransport).
- Display in Performance tab: average message size, largest message, cumulative bytes transferred.
- Warn when a single message exceeds a threshold (e.g., 100KB).

**Complexity:** Low
**Files:** `src/transport/worker-transport.ts`, `src/transport/ws-transport.ts`, `src/transport/binary-worker-transport.ts` (add size tracking), `src/debug/devtools-panel.ts` (display)

---

### 12. Sync Read Latency Heatmap (unique to async-dom)

**What:** Synchronous reads (getBoundingClientRect, computedStyle) across the worker boundary are expensive. SyncReadLogEntry already tracks latency. Visualize them as a heatmap so developers can spot and eliminate slow sync reads.

**How in async-dom:**
- In Performance tab, show a timeline of sync reads as colored blocks (green <5ms, yellow 5-50ms, red >50ms).
- Show aggregated stats: total sync reads, timeout rate, P95 latency.
- Clicking a block shows which node and query type triggered it.

**Complexity:** Low-Medium
**Files:** `src/debug/devtools-panel.ts` (heatmap rendering), existing SyncReadLogEntry in `src/core/debug.ts` is sufficient

---

### 13. Deprecation / Migration Warnings Tab (inspired by Ember Inspector)

**What:** Ember Inspector groups deprecation warnings with source links and migration paths. async-dom's Warnings tab could categorize warnings by severity and provide actionable guidance.

**How in async-dom:**
- Group warnings by `code` and show count per code.
- Add inline documentation: for each warning code, show a one-liner explanation and suggested fix.
- Add a "Suppress" button per warning code to reduce noise during development.

**Complexity:** Low
**Files:** `src/debug/devtools-panel.ts` (grouped warning rendering, inline docs), `src/core/debug.ts` (add description map for WarningCodes)

---

### 14. Export / Import Debug Session (inspired by Redux DevTools)

**What:** Redux DevTools lets you export state + action history as JSON for sharing and bug reproduction. async-dom should support exporting a debug session.

**How in async-dom:**
- Add "Export" button to the header bar that serializes: mutation log, warning log, performance snapshots, and virtual DOM tree to a JSON file.
- Add "Import" button that loads a session and displays it in the panel (read-only mode).
- Useful for bug reports and remote debugging.

**Complexity:** Medium
**Files:** `src/debug/devtools-panel.ts` (export/import UI), new `src/debug/session-export.ts`

---

## FUTURE — Complex, Defer

### 15. Dependency Graph: Mutation Causality (inspired by MobX reaction graph)

**What:** MobX shows which observables trigger which reactions. In async-dom, show which events cause which mutation batches, and which batches affect which DOM subtrees — a full causality graph.

**How in async-dom:**
- Tag each mutation batch with its causal event (click, input, timer, etc.).
- Build a DAG: Event -> MutationBatch -> Affected Nodes.
- Render as an interactive graph in a new "Graph" tab.
- Requires instrumentation across worker-thread event handling and mutation collection.

**Complexity:** Very High
**Files:** Nearly all core files need instrumentation; new `src/debug/causality-graph.ts`

---

### 16. Worker CPU Profiler Integration (unique to async-dom)

**What:** No framework devtools profile the *worker thread* CPU separately from the main thread. Integrate with the Performance API to show worker CPU utilization alongside main-thread frame timing.

**How in async-dom:**
- Use `performance.measure()` in the worker thread around event handlers and mutation collection.
- Send performance entries to the main thread via the transport.
- Display worker CPU timeline alongside the main-thread frame timeline in the Performance tab.

**Complexity:** High
**Files:** `src/worker-thread/events.ts`, `src/worker-thread/mutation-collector.ts` (add performance marks), `src/core/protocol.ts` (new performance message type), `src/debug/devtools-panel.ts` (dual timeline)

---

### 17. Virtual DOM Diff Between Snapshots (inspired by Redux state diff)

**What:** Capture the virtual DOM tree at two points in time and show a structural diff — nodes added, removed, or changed. Like Redux's state diff but for a DOM tree.

**How in async-dom:**
- Snapshot the tree on demand (button or timer).
- Diff two snapshots: added nodes (green), removed nodes (red), changed attributes/text (yellow).
- Display inline in the Tree tab with diff markers.

**Complexity:** High
**Files:** `src/debug/devtools-panel.ts` (diff UI), new `src/debug/tree-diff.ts`, `src/worker-thread/document.ts` (snapshot serialization)

---

### 18. Multi-App Message Interleaving Timeline (unique to async-dom)

**What:** When multiple worker apps run concurrently, show a unified timeline of all messages from all apps, color-coded by app. Show how the scheduler interleaves their mutations and whether fairness budgets are balanced.

**How in async-dom:**
- The FrameScheduler already tracks per-app budgets (`appBudgets` map). Expose this per frame.
- In Performance tab, show a stacked bar per frame: each segment is an app's mutation count, colored by appId.
- Show deferred mutations count per app (fairness overflow).

**Complexity:** High
**Files:** `src/core/scheduler.ts` (expose per-app per-frame breakdown), `src/debug/devtools-panel.ts` (multi-app timeline)

---

### 19. "Why Was This Node Updated?" (inspired by React's "Why did this render?")

**What:** Click any node in the real DOM (or tree view) and see the chain of events that caused it to be modified, tracing back through: mutation -> batch -> transport -> worker event handler -> user event.

**How in async-dom:**
- Requires full causality tracking (see Feature 15).
- Simplified version: index mutations by nodeId, and for each mutation show its batchUid, and for each batch show the correlated event.
- Display as a breadcrumb trail in the node inspector sidebar.

**Complexity:** Very High (full version), Medium (simplified — just batch + event lookup)
**Files:** `src/debug/devtools-panel.ts`, `src/core/debug.ts` (mutation-to-event correlation index)

---

## Priority Matrix

| # | Feature | Impact | Complexity | Unique to async-dom? |
|---|---------|--------|-----------|---------------------|
| 1 | Batch Diff View | High | Medium | Partially |
| 2 | Frame Budget Flamechart | High | Medium | Yes |
| 3 | Worker-Main Latency Monitor | High | Low-Med | **Yes** |
| 4 | Coalescing Visualizer | High | Medium | **Yes** |
| 5 | Event Round-Trip Tracer | High | Med-High | **Yes** |
| 6 | Highlight DOM Updates | High | Low | No |
| 7 | Queue Pressure Indicator | High | Low | **Yes** |
| 8 | Time-Travel Replay | Medium | High | No |
| 9 | Mutation Type Chart | Medium | Low | Partially |
| 10 | Node Inspector Sidebar | Medium | Medium | Partially |
| 11 | Transport Size Monitor | Medium | Low | **Yes** |
| 12 | Sync Read Heatmap | Medium | Low-Med | **Yes** |
| 13 | Grouped Warnings | Medium | Low | No |
| 14 | Export/Import Session | Medium | Medium | No |
| 15 | Causality Graph | High | Very High | **Yes** |
| 16 | Worker CPU Profiler | High | High | **Yes** |
| 17 | DOM Tree Diff | Medium | High | Partially |
| 18 | Multi-App Timeline | Medium | High | **Yes** |
| 19 | "Why Updated?" | High | Very High | Partially |

## Recommended Implementation Order

**Phase 1 (Quick wins, 1-2 days each):**
- Feature 7: Queue Pressure Indicator (immediate value, trivial to implement)
- Feature 6: Highlight DOM Updates (high visibility, low effort)
- Feature 3: Worker-Main Latency Monitor (unique selling point for async-dom)

**Phase 2 (Core differentiation, 2-4 days each):**
- Feature 4: Coalescing Visualizer (helps users optimize their apps)
- Feature 1: Batch Diff View (makes the Log tab actually useful for debugging)
- Feature 9: Mutation Type Chart (quick to build, aids performance tuning)

**Phase 3 (Power features, 3-5 days each):**
- Feature 2: Frame Budget Flamechart (the "profiler" equivalent for async-dom)
- Feature 5: Event Round-Trip Tracer (explains the full event lifecycle)
- Feature 10: Node Inspector Sidebar (completes the tree inspection story)

**Phase 4 (Polish and ecosystem, 2-5 days each):**
- Feature 11: Transport Size Monitor
- Feature 12: Sync Read Heatmap
- Feature 13: Grouped Warnings with inline docs
- Feature 14: Export/Import Debug Session

---

## Sources

- [React DevTools Profiler](https://react.dev/reference/react/Profiler)
- [React Performance Profiling](https://dev.to/maurya-sachin/react-performance-profiling-finding-and-fixing-bottlenecks-ja5)
- [Vue DevTools Features](https://devtools.vuejs.org/getting-started/features)
- [Pinia DevTools Integration](https://deepwiki.com/vuejs/pinia/3.2-devtools-integration)
- [Redux DevTools Tips & Tricks](https://blog.logrocket.com/redux-devtools-tips-tricks-for-faster-debugging/)
- [Redux Time-Travel Debugging](https://hmos.dev/en/how-to-time-travel-debugging-at-redux-devtools)
- [Angular DevTools Profiler](https://angular.dev/tools/devtools/profiler)
- [Angular Dependency Injection Tree](https://v19.angular.dev/tools/devtools)
- [Ember Inspector Render Performance](https://guides.emberjs.com/v5.5.0/ember-inspector/render-performance/)
- [Ember Inspector Deprecations](https://guides.emberjs.com/v1.13.0/ember-inspector/deprecations/)
- [MobX Analyzing Reactivity](https://mobx.js.org/analyzing-reactivity.html)
- [MobX React DevTools](https://www.npmjs.com/package/mobx-react-devtools)
