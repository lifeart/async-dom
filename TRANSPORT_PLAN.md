# Remote Transport & Multi-Client Streaming — Implementation Plan

## Overview

async-dom currently runs worker DOM in local Web Workers. This plan extends it to support remote execution: cross-tab, SharedWorker, WebSocket server, and WebRTC transports. Additionally, a multi-client streaming mode enables one server-side worker to broadcast DOM mutations to multiple browser clients.

---

## Architecture

```
                    ┌─────────────────────────┐
                    │     Worker App Logic     │
                    │  (createWorkerDom)       │
                    └───────────┬─────────────┘
                                │ Transport interface
                    ┌───────────┴─────────────┐
                    │   Transport Adapters     │
                    ├──────────────────────────┤
                    │ • WorkerTransport (local) │
                    │ • SharedWorkerTransport   │  ← Phase 2
                    │ • CrossTabTransport       │  ← Phase 2b
                    │ • WebSocketServerTransport│  ← Phase 3
                    │ • BroadcastTransport (1:N)│  ← Phase 3b
                    │ • WebRTCTransport         │  ← Phase 4
                    └───────────┬─────────────┘
                                │
                    ┌───────────┴─────────────┐
                    │     Main Thread          │
                    │  (createAsyncDom)        │
                    │  ThreadManager           │
                    │  FrameScheduler          │
                    │  DomRenderer             │
                    └─────────────────────────┘
```

---

## Phase 1: Foundation (Required for All Remote Transports)

### 1.1 `createRemoteThread` on ThreadManager

**File:** `src/main-thread/thread-manager.ts`

```ts
export interface RemoteConfig {
  transport: Transport;
  name?: string;
}

// New method on ThreadManager:
createRemoteThread(config: RemoteConfig): AppId
```

Accepts a pre-built `Transport` without requiring a `Worker` object. Generates appId, wires `transport.onMessage`, stores connection.

### 1.2 `addRemoteApp` on AsyncDomInstance

**File:** `src/main-thread/index.ts`

```ts
export interface RemoteAppConfig {
  transport: Transport;
  name?: string;
  mountPoint?: string | Element;
  shadow?: boolean | ShadowRootInit;
  onError?: (error: SerializedError, appId: AppId) => void;
  enableSyncChannel?: boolean; // only for same-origin cross-tab
}
```

### 1.3 Refactor `addAppInternal` → AppContext Pattern

The current `addAppInternal` is a ~200-line closure capturing 15+ variables. Per browser API expert review, simple function extraction is not feasible. Instead:

```ts
interface AppContext {
  threadManager: ThreadManager;
  scheduler: FrameScheduler;
  eventBridges: Map<AppId, EventBridge>;
  syncHosts: Map<AppId, SyncChannelHost>;
  renderers: Map<AppId, DomRenderer>;
  debugHooks: ResolvedDebugHooks;
  debugStats: DebugStats;
  causalityTracker: CausalityTracker;
  mutationCorrelation: MutationEventCorrelation;
  workerPerfEntries: Map<AppId, PerfEntryData[]>;
  debugData: Map<AppId, DebugDataEntry>;
  config: AsyncDomConfig;
  lastRenderer: { value: DomRenderer | null };
  lastAppId: { value: AppId | null };
}

function setupApp(ctx: AppContext, opts: SetupAppOptions): AppId
```

The `scheduler.setApplier` callback remains in `createAsyncDom` and shares the same `AppContext`.

### 1.4 Skip SyncChannel for Remote Apps

When `enableSyncChannel` is false (default for remote), skip `SharedArrayBuffer` creation. The async query path (`type: "query"` / `type: "queryResult"`) already works as a fallback.

### 1.5 Transport Interface Extensions

**File:** `src/transport/base.ts`

```ts
export type TransportReadyState = "connecting" | "open" | "reconnecting" | "closed";

export interface Transport {
  // existing...
  maxMessageSize?: number;    // chunking threshold (256KB for WebRTC)
  bufferedAmount?: number;    // backpressure signal
}
```

### 1.6 PlatformHost Abstraction for Node.js

**File:** `src/platform.ts` (new)

Per Node.js server expert review, scattered `typeof self` guards are insufficient. Three P0 crashers exist in `createWorkerDom`:

- `self.navigator` (line 439) — unconditional, crashes immediately
- `self` cast for error handlers (lines 195-206)
- Global sandbox mode mutates `self` (lines 539-571)

```ts
interface PlatformHost {
  navigator: { userAgent: string; language: string; languages: readonly string[]; hardwareConcurrency: number };
  installErrorHandlers(onError: ErrorHandler, onRejection: RejectionHandler): () => void;
  installShutdownHook(callback: () => void): void;
  globalScope: Record<string, unknown> | null;
}

function createWorkerPlatform(): PlatformHost { /* uses self.* */ }
function createNodePlatform(): PlatformHost { /* uses process.* */ }
```

Pass into `createWorkerDom` via config. **Files to modify:** `src/worker-thread/index.ts`

---

## Phase 2: SharedWorker Transport (Highest Priority)

Per browser API expert review, **SharedWorker is preferred over cross-tab** for Phase 2. It solves the same problem without popup blockers, tab lifecycle issues, or MessageChannel death.

### 2.1 SharedWorkerTransport

**File:** `src/transport/shared-worker-transport.ts` (new)

```ts
export class SharedWorkerTransport implements Transport {
  constructor(port: MessagePort) { ... }
  // Uses port.postMessage() — structured clone, no serialization
  // port.onmessage for receiving
  // Survives individual tab closures
}
```

Usage:
```ts
const sw = new SharedWorker('/worker.js');
const transport = new SharedWorkerTransport(sw.port);
asyncDom.addRemoteApp({ transport, name: "my-app" });
```

### 2.2 SharedWorkerSelfTransport (worker side)

In the SharedWorker script:
```ts
// worker.js
self.onconnect = (e) => {
  const port = e.ports[0];
  const transport = new SharedWorkerSelfTransport(port);
  createWorkerDom({ transport });
  // run app...
};
```

### 2.3 Advantages over Cross-Tab

| Concern | SharedWorker | Cross-Tab |
|---------|-------------|-----------|
| Popup blockers | No issue | Blocked without user gesture |
| Tab lifecycle | Survives tab close | Must detect tab death |
| MessagePort death | Port stays alive | No close event on port |
| COOP/COEP | Not needed for connection | Required for SAB |
| Browser support | Safari 16+ (2022), all others | All browsers |
| DevTools | chrome://inspect/#workers | Normal DevTools |

### 2.4 SAB Support

SharedWorker can receive SharedArrayBuffer via MessagePort if COOP/COEP headers are set. Transfer SAB in the init message as already done for regular workers. The SharedWorker inherits cross-origin isolation from the creating page. Verify with `self.crossOriginIsolated` in both contexts. `Atomics.wait` is supported in SharedWorker context.

### 2.5 Multi-App in One SharedWorker

Each connecting tab gets its own `MessagePort` via `self.onconnect`. The natural architecture is **one `createWorkerDom()` per port** — each tab is fully isolated.

```
// shared-worker.js
self.onconnect = (e) => {
  const port = e.ports[0];
  const transport = new SharedWorkerSelfTransport(port);
  const { document, window } = createWorkerDom({ transport });
  myApp(document, window);
  port.addEventListener('close', () => document.destroy());
};
```

No routing needed — each MessagePort is a dedicated channel. Shared resources (framework code, utility functions) are deduped in the single JS heap.

### 2.6 Disconnect Detection

`MessagePort.close` event shipped in **Chrome 122** (early 2024). Firefox/Safari support unconfirmed. Required strategy:

1. **Heartbeat** (primary): ping/pong every 5s, timeout at 15s
2. **`close` event** (optimization): `port.addEventListener('close', ...)` for instant detection in Chrome
3. On disconnect: call `VirtualDocument.destroy()`, clean up transport

### 2.7 Browser Compatibility

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | 4+ | **NOT supported on Android** |
| Firefox | 29+ | 147+ |
| Safari | 16+ (reinstated after removal in 6.1-15.6) | 16+ iOS |
| Edge | 79+ | N/A |

**~50% global coverage.** Critical gap: Chrome Android. Mobile must fall back to dedicated Workers. The transport abstraction handles this — caller picks the transport.

### 2.8 Performance

`port.postMessage()` in SharedWorker uses the same MessagePort mechanism as dedicated Worker. **Identical latency and throughput** — 0-1ms for small messages, structured clone cost scales linearly with size.

### 2.9 Error Handling

- Script load errors: `sharedWorker.onerror` fires on the main thread (handled externally, not by transport)
- Runtime errors inside worker: `self.onerror` catches them; must send through MessagePort (already done by `createWorkerDom`)
- Deserialization errors: wire `port.onmessageerror` to transport's `onError`
- `port.start()` is required when using `addEventListener` (implicit with `onmessage =`)

---

## Phase 2b: Cross-Tab Transport (Advanced Option)

For use cases requiring a full window context (e.g., canvas, WebGL, audio APIs).

### 2b.1 Handshake via BroadcastChannel

Per networking and browser experts: **do NOT use `window.opener`** — COOP `same-origin` severs it. Use `BroadcastChannel` for the initial handshake:

1. Main tab creates `BroadcastChannel("async-dom-handshake")`
2. User opens child tab via `window.open()` (must be user gesture — library NEVER calls `window.open`)
3. Child tab creates same `BroadcastChannel`, posts `{ type: "ready", tabId }`
4. Main tab receives "ready", creates `MessageChannel`, transfers `port2` via `BroadcastChannel`
5. Child tab receives port, switches to `MessagePort` for all subsequent communication
6. Both close `BroadcastChannel`

### 2b.2 Lifecycle Detection

- **Application-level heartbeat** through MessagePort (ping/pong every 5s, timeout 15s)
- `tab.closed` polling as supplement (catches user-closed tabs)
- Page Lifecycle API: listen for `freeze`/`resume` events in child tab
- On freeze: child sends "suspending" through port, main tab shows indicator
- On resume: child sends "resumed", communication continues

### 2b.3 API

```ts
// Library accepts WindowProxy — NEVER opens windows itself
const tab = window.open('/worker-page.html'); // user's responsibility
const transport = new CrossTabTransport(tab!, { handshakeTimeout: 5000 });
asyncDom.addRemoteApp({ transport, enableSyncChannel: true });
```

### 2b.4 SAB Transfer

- Both tabs must serve `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
- Check `self.crossOriginIsolated` before attempting
- SAB passed as property in message (NOT in transfer list): `port.postMessage({ buffer: sab })`
- Failure throws `DataCloneError` synchronously — must catch at handshake layer

---

## Phase 3: WebSocket Server Transport

### 3.1 Server-Side Transport

**File:** `src/transport/ws-server-transport.ts` (new)

```ts
export interface WebSocketLike {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  readonly bufferedAmount: number;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export class WebSocketServerTransport implements Transport {
  constructor(socket: WebSocketLike) { ... }
}
```

Includes `bufferedAmount` for backpressure (HIGH_WATER_MARK check before send).

### 3.2 Server Runner

**File:** `src/server/runner.ts` (new)

```ts
export function createServerApp(options: {
  transport: Transport;
  appModule: (dom: WorkerDomResult) => void;
}): { destroy: () => void }
```

- Wraps event dispatch in try/catch (P0: one connection error must not kill server)
- Returns `destroy()` for cleanup on disconnect
- No SharedArrayBuffer — uses async query fallback

### 3.3 Worker-Thread Node.js Guards

**File:** `src/worker-thread/index.ts` — modifications:

- Line 439: `navigator: typeof self !== 'undefined' ? self.navigator : platform.navigator`
- Lines 195-206: `platform.installErrorHandlers(...)` instead of `workerScope.onerror`
- Lines 539-571: `if (platform.globalScope)` guard for sandbox mode

### 3.4 VirtualDocument.destroy()

Per server expert review, add cleanup method:

```ts
class VirtualDocument {
  destroy(): void {
    this._ids.clear();
    this._nodeIdToElement.clear();
    this._listenerMap.clear();
    this._listenerToElement.clear();
    // Stop setInterval for perf entries
    // Close transport
  }
}
```

### 3.5 Production Concerns

| Concern | Recommendation |
|---------|---------------|
| Backpressure | Check `bufferedAmount > HIGH_WATER_MARK` before send |
| Connection limits | Reject with WebSocket close code 1013 at capacity |
| Memory per connection | ~5-10 MB for complex apps, monitor `_nodeIdToElement.size` |
| Concurrency | Single-process for <20 connections, cluster for production |
| Error isolation | try/catch around event dispatch, report via transport |
| Graceful shutdown | Send "shutdown" message, flush pending mutations, close connections |
| Health checks | HTTP `/health` endpoint: connections, node counts, heap usage |

---

## Phase 3b: Multi-Client Streaming

### 3b.1 BroadcastTransport

**File:** `src/server/broadcast-transport.ts` (new)

Implements `Transport`, wraps N client connections:

```ts
export class BroadcastTransport implements Transport {
  addClient(clientId: ClientId, transport: Transport): void;
  removeClient(clientId: ClientId): void;
  getClientCount(): number;
  getMutationLog(): MutationLog;
}
```

- `send(message)`: append to MutationLog + fan out to all clients
- `onMessage(handler)`: events from any client annotated with `clientId` before forwarding to worker

### 3b.2 Late-Joiner Replay

**File:** `src/server/mutation-log.ts` (new)

```ts
interface MutationLog {
  append(message: MutationMessage): void;
  getReplayMessages(): MutationMessage[];
  compact(snapshot: MutationMessage[]): void;
  size(): number;
}
```

On new client connect:
1. Replay all logged mutations (tagged `replay: true`)
2. Send `{ type: "snapshotComplete" }`
3. Switch to live broadcast

Compaction: periodically convert `doc.toJSON()` snapshot into synthetic `createNode`/`setAttribute`/`appendChild` mutations to replace the full log.

### 3b.3 Event Conflict Resolution

**File:** `src/server/conflict-resolver.ts` (new)

Three strategies:
- **sequential** (default): FIFO queue
- **last-writer-wins**: latest input/change event per nodeId wins
- **owner-only**: focus creates ownership, non-owner events dropped

### 3b.4 Protocol Extensions

**File:** `src/core/protocol.ts` — additions:

```ts
export type ClientId = string & { readonly __brand: "ClientId" };

// Extend EventMessage:
export interface EventMessage {
  // existing...
  clientId?: ClientId;
}

// New system messages:
type SystemMessage =
  | { type: "clientConnect"; clientId: ClientId; metadata?: Record<string, unknown> }
  | { type: "clientDisconnect"; clientId: ClientId }
  | { type: "snapshotComplete" }
  | { type: "replay"; mutations: DomMutation[] }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "ack"; lastUid: number }
  // ...existing variants
```

### 3b.5 Server Entry Point

**File:** `src/server/streaming-server.ts` (new)

```ts
export function createStreamingServer(config: {
  createApp: (dom: WorkerDomResult) => void;
  port?: number;
  server?: import("http").Server;
  path?: string;
  maxClients?: number;
  onConnect?: (request: IncomingMessage) => ClientMetadata | null;
  conflictStrategy?: "sequential" | "last-writer-wins" | "owner-only";
}): StreamingServerInstance
```

---

## Phase 4: WebRTC DataChannel Transport (Future)

### 4.1 Transport

**File:** `src/transport/webrtc-transport.ts` (new)

```ts
export class WebRTCTransport implements Transport {
  constructor(dataChannel: RTCDataChannel) { ... }
  replaceChannel(newChannel: RTCDataChannel): void; // for ICE restart
}
```

### 4.2 Critical Requirements (from networking expert)

- **Backpressure**: Check `bufferedAmount` before each `send()`. Use `bufferedAmountLowThreshold` + `onbufferedamountlow` event.
- **Message size**: SCTP max ~256KB. Must chunk large mutation batches.
- **ICE restart**: `replaceChannel()` transfers queue to new channel without firing `onClose`.
- **State mapping**: DataChannel `"closing"` → Transport `"closed"`.
- **Ordered + reliable**: `ordered: true`, no `maxRetransmits` limit.

### 4.3 Signaling

Library does NOT handle signaling. User provides established `RTCDataChannel`.

---

## Sequencing & Dependencies

```
Phase 1 (Foundation)
  ├── AppContext refactoring
  ├── createRemoteThread
  ├── addRemoteApp
  ├── PlatformHost abstraction
  ├── Transport interface extensions
  │
  ├──→ Phase 2 (SharedWorker) — can start immediately after Phase 1
  ├──→ Phase 2b (Cross-Tab) — parallel with Phase 2
  ├──→ Phase 3 (WebSocket Server) — parallel with Phase 2
  │     └──→ Phase 3b (Multi-Client Streaming) — after Phase 3
  └──→ Phase 4 (WebRTC) — anytime after Phase 1
```

Phases 2, 2b, 3 can all proceed in parallel after Phase 1.

---

## New Files Summary

| Phase | File | Purpose |
|-------|------|---------|
| 1 | `src/platform.ts` | PlatformHost interface + Worker/Node.js implementations |
| 2 | `src/transport/shared-worker-transport.ts` | SharedWorkerTransport + SharedWorkerSelfTransport |
| 2b | `src/transport/cross-tab-transport.ts` | CrossTabTransport + CrossTabSelfTransport |
| 3 | `src/transport/ws-server-transport.ts` | WebSocketServerTransport |
| 3 | `src/server/runner.ts` | createServerApp helper |
| 3 | `src/server/index.ts` | Server entry point exports |
| 3b | `src/server/broadcast-transport.ts` | BroadcastTransport (1:N) |
| 3b | `src/server/mutation-log.ts` | MutationLog for late-joiner replay |
| 3b | `src/server/client-session.ts` | Per-client state tracking |
| 3b | `src/server/conflict-resolver.ts` | Event conflict resolution |
| 3b | `src/server/streaming-server.ts` | createStreamingServer orchestrator |
| 4 | `src/transport/webrtc-transport.ts` | WebRTCTransport |

## Modified Files Summary

| Phase | File | Changes |
|-------|------|---------|
| 1 | `src/main-thread/thread-manager.ts` | Add `RemoteConfig`, `createRemoteThread()` |
| 1 | `src/main-thread/index.ts` | Add `RemoteAppConfig`, `addRemoteApp()`, refactor to AppContext |
| 1 | `src/transport/base.ts` | Add `reconnecting` state, `maxMessageSize`, `bufferedAmount` |
| 1 | `src/transport/index.ts` | Export new transports |
| 1 | `src/core/protocol.ts` | Add `ClientId`, `ping`/`pong`/`ack` messages, `clientId` on EventMessage |
| 3 | `src/worker-thread/index.ts` | PlatformHost integration, Node.js guards |
| 3 | `package.json` | Add `./server` export path |
| 3 | `tsdown.config.ts` | Add `server` entry point |

---

## Deep Dive: PlatformHost Audit

### Minimal PlatformHost Interface

Only **3 things** need platform abstraction. Everything else (performance, setTimeout, URL, btoa, console, fetch, queueMicrotask) is globally available in Node.js 18+.

```ts
interface PlatformHost {
  navigator: {
    userAgent: string;
    language: string;
    languages: readonly string[];
    hardwareConcurrency: number;
  };
  installErrorHandlers(
    onError: (message: string, error?: Error, filename?: string, lineno?: number, colno?: number) => void,
    onUnhandledRejection: (reason: unknown) => void,
  ): void;
  onBeforeUnload(callback: () => void): void;
}
```

### P0 Crash Points in `worker-thread/index.ts`

| Line | Global | Issue |
|------|--------|-------|
| 439 | `self.navigator` | Unconditional read — crashes in Node.js |
| 195-228 | `self` cast to `workerScope` | Sets `.onerror`/`.onunhandledrejection` — crashes |
| 271-273 | `self.addEventListener("beforeunload")` | `self` undefined in Node.js |
| 517 | `self` in Proxy fallback | Sandbox eval mode |
| 540-571 | `self` cast to `workerGlobal` | Sandbox global mode — mutates `self` |

### VirtualDocument.destroy() — Complete Cleanup List

| What | Where | Impact if not cleaned |
|------|-------|-----------------------|
| `_ids` Map | document.ts:42 | Retains element refs |
| `_nodeIdToElement` Map | document.ts:43 | Primary memory leak source |
| `_listenerMap` Map | document.ts:44 | Retains closures |
| `_listenerToElement` Map | document.ts:45 | Retains element refs |
| `perfEntriesInterval` | index.ts:243 | **Keeps Node.js event loop alive forever** |
| `workerScope.onerror` | index.ts:208 | Closure retains transport/appId |
| `transport.onMessage` handler | index.ts:129 | Closure retains doc/transport/appId |
| `_syncChannel` | element.ts | Holds SharedArrayBuffer ref |
| `MutationCollector.queue` | mutation-collector.ts:18 | Pending mutations never flushed |

### Module-Level Globals (Shared Across Instances)

| Global | File:Line | Concern |
|--------|-----------|---------|
| `_nodeIdCounter` | protocol.ts:18 | Shared counter, monotonically increasing |
| `listenerCounter` | element.ts:19 | Shared across all VirtualDocuments |
| `kebabCache` | style-proxy.ts:5 | Shared Map, bounded by CSS property count |

---

## Deep Dive: MutationLog & Replay

### DomMutation Actions — Replay Safety Matrix

| Action | Idempotent | Safe to Replay | Notes |
|--------|-----------|---------------|-------|
| `createNode` | Yes | Yes | Has `nodeCache.has(id)` guard |
| `createComment` | Yes | Yes | Same guard |
| `appendChild` | No | Conditional | Re-applying moves node (DOM spec) |
| `removeNode` | Quasi | Yes | No-op if missing |
| `removeChild` | Quasi | Yes | No-op if missing |
| `insertBefore` | No | Conditional | Double-apply reorders siblings |
| `setAttribute` | Yes | Yes | Last-write-wins |
| `removeAttribute` | Yes | Yes | No-op if absent |
| `setStyle` | Yes | Yes | Last-write-wins |
| `setProperty` | Yes | Yes | Last-write-wins |
| `setTextContent` | Yes | Yes | Last-write-wins |
| `setClassName` | Yes | Yes | Last-write-wins |
| `setHTML` | Yes | Yes | innerHTML replacement |
| **`addEventListener`** | **NO** | **DANGEROUS** | **Creates duplicate listeners** |
| `configureEvent` | Yes | Yes | Overwrites config |
| `removeEventListener` | Quasi | Yes | No-op if not found |
| `headAppendChild` | No | Conditional | |
| `bodyAppendChild` | No | Conditional | |
| **`pushState`** | **NO** | **DANGEROUS** | **Creates duplicate history entries** |
| `replaceState` | Yes | Yes | Overwrites current |
| `scrollTo` | Yes | Yes | Last-write-wins |
| **`insertAdjacentHTML`** | **NO** | **DANGEROUS** | **Inserts duplicate content** |
| **`callMethod`** | **NO** | **DANGEROUS** | **Re-executes side effects** |

### The Duplicate Listener Bug

`EventBridge.attach()` does NOT check for existing `listenerId`. Replaying `addEventListener` mutations attaches duplicate real DOM listeners. **Every user event fires twice.**

**Required fix**: Make `EventBridge.attach()` idempotent:
```ts
attach(nodeId, eventName, listenerId) {
  // If this listener already exists, detach old one first
  const existing = this.listeners.get(listenerId);
  if (existing) {
    existing.controller.abort();
  }
  // ... proceed with attach
}
```

### `toJSON()` Snapshot Gaps

`VirtualDocument.toJSON()` exists (document.ts:493) but does NOT capture:
- Event listeners (no listener IDs or event names)
- Inline styles set via `setStyle` (unless reflected as attributes)
- Properties set via `setProperty` (value, checked, etc.)
- History state
- Scroll position

**Compaction must separately track**: active listeners from `_listenerMap`/`_listenerToElement`, and synthesize `addEventListener` mutations.

### Compaction Strategy

**Trigger**: Hybrid — after 5,000 mutations OR on client connect if >1,000 mutations since last compaction.

**Algorithm**:
1. Call `doc.toJSON()` — depth-first tree snapshot
2. Record current mutation log index
3. Convert tree to synthetic mutations: `createNode` → `setAttribute` → `appendChild` (depth-first)
4. Synthesize `addEventListener` mutations from active listener registries
5. Replace `log[0..index]` with synthetic mutations, keep `log[index+1..]` intact

**Cost**: <5ms for typical apps (1,000 nodes). Schedule during idle time for large apps.

**Memory**: ~200-300 bytes per mutation in V8. 10,000 mutations ≈ 2-3 MB.

### Existing Replay Infrastructure

`debug/replay.ts` provides a cursor (`createReplayState`, `replayStep`, `replaySeek`, `replayReset`) but:
- Operates on `MutationLogEntry` (debug wrapper), not raw `DomMutation[]`
- No renderer integration (caller feeds mutations)
- No compaction concept
- No filtering of non-idempotent actions

**Reusable for**: stepping/seeking logic. **Not reusable for**: production replay pipeline.

---

## Expert Review Notes

This plan incorporates feedback from three domain expert reviews and two deep-dive technical audits:

### Expert Reviews
1. **WebRTC/Networking Expert**: MessageChannel handshake race conditions, DataChannel backpressure (`bufferedAmount`), ICE restart handling, message size limits (256KB SCTP), protocol-level `ack` for flow control.

2. **Node.js Server Architecture Expert**: P0 crashers (`self.navigator`, error handlers), PlatformHost abstraction, VirtualDocument.destroy(), backpressure, connection limits, tiered concurrency (single-process → cluster → worker_threads).

3. **Browser API/Security Expert**: SharedWorker as preferred Phase 2 (no popup blockers, no tab lifecycle issues), BroadcastChannel for cross-tab handshake (COOP-safe), `DataCloneError` handling for SAB transfer, AppContext pattern for refactoring, Page Lifecycle API for tab freeze/resume.

### Deep Dive Audits
4. **PlatformHost Audit**: Complete inventory of all browser globals in worker-thread/ (40+ references across 5 files). Only `navigator`, error handlers, and `beforeunload` need abstraction. Full VirtualDocument.destroy() cleanup list. Module-level global leaks identified.

5. **MutationLog & Replay Audit**: All 23 mutation action types classified for replay safety. 4 dangerous actions identified (addEventListener, pushState, insertAdjacentHTML, callMethod). Duplicate listener bug in EventBridge.attach() documented. toJSON() snapshot gaps analyzed. Compaction algorithm specified with cost estimates.

6. **SharedWorker Deep Dive**: MessagePort.close event (Chrome 122+, other browsers unconfirmed). One VirtualDocument per port is the natural multi-app architecture. SAB works if page is cross-origin isolated (SharedWorker inherits). ~50% global browser coverage (Chrome Android gap). Identical performance to dedicated Worker postMessage. Heartbeat required for cross-browser disconnect detection.
