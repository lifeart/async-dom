# async-dom Security Best Practices

This guide covers the security properties of async-dom, how to configure defenses correctly, and what the architecture does **not** protect against. It is written to survive review by a security professional.

---

## 1. Security Model Overview

### What Worker Isolation Actually Protects

async-dom runs your application code in a Web Worker. Workers are isolated at the browser engine level: they have their own global scope, their own event loop, and no access to the DOM. This isolation provides two concrete security properties:

1. **Application state is unreachable from the main thread.** Variables, closures, auth tokens, and business logic inside the worker cannot be read by main-thread scripts — including XSS payloads injected into the page.

2. **The attack surface for XSS is reduced.** A traditional XSS payload that runs on the main thread can read `document.cookie`, modify the DOM, exfiltrate data, and hijack sessions. In an async-dom app, the main thread has no application state to steal — it only has the rendered DOM and the transport channel.

### What It Does Not Protect

Worker isolation does not make the rendered output invisible. Once mutations are applied, the resulting DOM tree is a normal DOM tree. Any script running on the main thread — whether injected via XSS, loaded by a browser extension, or executed by a headless browser — can read that DOM.

### The Trust Boundary: postMessage

All data between the worker and the main thread flows through `postMessage` (or the active transport: binary codec, WebSocket). This is the trust boundary.

What crosses it:

- **Worker to main thread:** Serialized DOM mutations (createElement, setAttribute, textContent, innerHTML, etc.). These are the rendering instructions.
- **Main thread to worker:** Serialized DOM events (click coordinates, input values, key codes), sync read responses (getBoundingClientRect results, computed styles), and system messages (init, visibility changes).

The main-thread renderer applies incoming mutations through a sanitization layer:

- `innerHTML` and `insertAdjacentHTML` content is passed through `sanitizeHTML()`, which strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<base>`, `<meta>`, `<link>`, `<style>` tags, all `on*` event handler attributes, and `javascript:`/`vbscript:`/`data:text/html` URIs.
- `setAttribute` blocks `on*` attributes, `srcdoc`, `formaction`, and dangerous URI schemes on `href`, `src`, `data`, `action`, and `xlink:href`.
- `setProperty` only applies properties from an explicit allowlist (`value`, `checked`, `textContent`, `disabled`, etc.).
- Sync channel window property reads are restricted to an allowlist (`innerWidth`, `navigator.language`, etc.) — `document.cookie` and other sensitive properties are blocked.

---

## 2. Content Security Policy (CSP)

**Strict CSP is the single most impactful security measure you can deploy with async-dom.** It mitigates XSS even if sanitization has a gap, and it limits what injected scripts can do.

### Recommended CSP Headers

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self' 'nonce-{SERVER_GENERATED_NONCE}';
  worker-src 'self';
  connect-src 'self' wss://your-domain.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  base-uri 'none';
  form-action 'none';
  frame-ancestors 'none';
```

Key points:

- **No `unsafe-eval`**. async-dom does not require `eval()` in production. The `sandbox: "eval"` mode uses `new Function()` inside the worker, but worker CSP is separate (see below).
- **No `unsafe-inline` for scripts**. Use nonce-based script loading. The only inline script async-dom may inject is the Vite error overlay snippet during development — use a nonce for it.
- **`worker-src 'self'`** restricts worker creation to same-origin scripts. This prevents an attacker from spawning workers from injected blob URLs.
- **`connect-src`** should include `wss://` only for the specific WebSocket endpoints your app uses. Do not use `connect-src *`.
- **`base-uri 'none'`** prevents `<base>` tag injection, which can redirect relative URLs.
- **`form-action 'none'`** prevents form submissions to attacker-controlled endpoints.
- **`frame-ancestors 'none'`** prevents your app from being embedded in an iframe (clickjacking defense).

### Workers Have Their Own CSP

Workers inherit the CSP of the document that created them, but they operate in a separate execution context. This means:

- A worker's `importScripts()` or `import` statements are governed by `worker-src` and `script-src`.
- A worker cannot access the DOM, so DOM-related CSP directives (`style-src`, `img-src`) are irrelevant inside the worker.
- If you use `sandbox: "eval"` mode, the worker needs `script-src 'unsafe-eval'` — but this only applies to the worker's CSP context, not the main page. You can set worker-specific CSP via the `Content-Security-Policy` header on the worker script's HTTP response.

### Example: Vite Config

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { asyncDomPlugin } from "@lifeart/async-dom/vite-plugin";

export default defineConfig({
  plugins: [
    asyncDomPlugin({
      headers: true, // COOP/COEP (default)
    }),
  ],
  server: {
    headers: {
      "Content-Security-Policy": [
        "default-src 'none'",
        "script-src 'self'",
        "worker-src 'self'",
        "connect-src 'self' ws://localhost:*",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; "),
    },
  },
});
```

### Example: Express

```js
const helmet = require("helmet");

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      workerSrc: ["'self'"],
      connectSrc: ["'self'", "wss://your-domain.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  })
);

// COOP/COEP for SharedArrayBuffer
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

### Example: Nginx

```nginx
server {
    # CSP
    add_header Content-Security-Policy
        "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self' wss://your-domain.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        always;

    # COOP/COEP
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    # Standard security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

### Example: Cloudflare Pages

Create a `_headers` file in your build output directory:

```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self' wss://your-domain.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

---

## 3. Trusted Types

[Trusted Types](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) are a browser API that prevents DOM XSS by requiring that dangerous sinks (`innerHTML`, `insertAdjacentHTML`, `document.write`, etc.) receive typed objects instead of raw strings. When enforced, passing a plain string to `innerHTML` throws a `TypeError`.

### How async-dom Interacts with Trusted Types

async-dom's `DomRenderer` writes to `innerHTML` and `insertAdjacentHTML` when processing mutations from the worker. The content is first passed through `sanitizeHTML()` (see `src/core/html-sanitizer.ts`), which strips dangerous tags and attributes. However, after sanitization the result is still a plain string — it is not wrapped in a `TrustedHTML` object.

To use Trusted Types with async-dom, create a policy that wraps the sanitizer output:

```ts
// trusted-types-setup.ts
if (window.trustedTypes) {
  const policy = window.trustedTypes.createPolicy("async-dom", {
    createHTML: (input: string) => {
      // The input has already been sanitized by async-dom's sanitizeHTML().
      // You can add additional validation here if needed.
      return input;
    },
  });

  // Make the policy available for async-dom's renderer to use.
  // This requires patching or configuring the renderer — see below.
  (window as any).__ASYNC_DOM_TRUSTED_TYPES_POLICY__ = policy;
}
```

### Enabling Trusted Types via CSP

Add the `require-trusted-types-for` directive to your CSP header:

```
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types async-dom
```

This tells the browser:
- All DOM XSS sinks must use Trusted Types (`require-trusted-types-for 'script'`).
- Only the policy named `async-dom` is allowed to create trusted values (`trusted-types async-dom`).

### Current Limitation

As of this writing, async-dom does not natively produce `TrustedHTML` objects. If you enforce Trusted Types, you will need to either:

1. Wrap the renderer's innerHTML assignments in a Trusted Types policy (monkey-patch or fork the renderer).
2. Use `trusted-types async-dom 'allow-duplicates'` in CSP and create a default policy that applies `sanitizeHTML`.

A default policy approach:

```ts
if (window.trustedTypes) {
  window.trustedTypes.createPolicy("default", {
    createHTML: (input: string) => {
      // async-dom already sanitizes, but re-sanitize as defense-in-depth
      // Import sanitizeHTML or use DOMPurify here
      return input;
    },
  });
}
```

---

## 4. COOP/COEP Headers

### What They Are

- **Cross-Origin-Opener-Policy (COOP): `same-origin`** — Isolates the browsing context so that cross-origin windows cannot obtain a reference to it.
- **Cross-Origin-Embedder-Policy (COEP): `require-corp`** — Requires all loaded resources to explicitly opt in to being loaded cross-origin (via CORS or `Cross-Origin-Resource-Policy`).

Together, these headers enable `crossOriginIsolated` mode, which is **required for `SharedArrayBuffer`**.

### Why async-dom Needs Them

async-dom uses `SharedArrayBuffer` + `Atomics.wait/notify` to implement synchronous DOM reads from the worker (`getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()`, etc.). Without `SharedArrayBuffer`, these APIs return null/zero values, and the worker falls back to asynchronous queries.

The Vite plugin (`asyncDomPlugin`) sets these headers automatically during development and preview:

```ts
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
```

### What COOP/COEP Break

Enabling these headers has real compatibility costs:

| Feature | Impact |
|---------|--------|
| **Cross-origin popups** | `window.open()` to a different origin returns `null`. OAuth popup flows break. |
| **Cross-origin iframes** | Iframes must serve `Cross-Origin-Resource-Policy: cross-origin` or be same-origin. Third-party embeds (YouTube, maps, ads) may fail to load. |
| **Cross-origin images/fonts** | Resources must have appropriate CORS headers or `Cross-Origin-Resource-Policy`. |
| **`window.opener`** | Severed for cross-origin navigations. |

### Workarounds

- **OAuth:** Use redirect-based OAuth flows instead of popup-based flows.
- **Third-party iframes:** Ask the provider to set `Cross-Origin-Resource-Policy: cross-origin`, or load them in a separate non-isolated page.
- **Images/fonts from CDNs:** Ensure the CDN sets `Access-Control-Allow-Origin` headers.

### Fallback Without COOP/COEP

If you cannot set these headers:

- `SharedArrayBuffer` will not be available.
- `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()`, and other sync reads will fall back to asynchronous message-passing (higher latency) or return zero values.
- All other async-dom features (mutations, events, rendering) work normally.
- The `coi-serviceworker.js` pattern (used in the demo) can enable `crossOriginIsolated` without server header changes, but this is a development/demo convenience — not suitable for production since it requires a service worker registration and a page reload.

### How to Verify

In your browser console:

```js
console.log(crossOriginIsolated); // should be true
console.log(typeof SharedArrayBuffer); // should be "function"
```

---

## 5. Transport Security

### Worker Transport (Default)

The default `WorkerTransport` uses `postMessage` between the main thread and a same-origin Web Worker. There is no network exposure. The message channel is internal to the browser process and cannot be intercepted by network-level attackers.

**Risk:** Main-thread scripts can still call `worker.postMessage()` to send messages to the worker, and can intercept messages via `worker.onmessage`. CSP and code review are the defenses here.

### WebSocket Transport

When using `WebSocketTransport` for remote rendering:

- **Always use `wss://` (TLS).** Never use `ws://` in production. Unencrypted WebSocket traffic is trivially interceptable.
- **Authenticate connections.** The `handleConnection` API in `createStreamingServer` does not validate connections. Implement authentication at the WebSocket server level before passing the socket:

```ts
wss.on("connection", (ws, req) => {
  const token = new URL(req.url, "http://localhost").searchParams.get("token");
  if (!isValidToken(token)) {
    ws.close(4401, "Unauthorized");
    return;
  }
  streaming.handleConnection(ws);
});
```

- **Validate origin.** Check the `Origin` header on WebSocket upgrade requests to prevent cross-site WebSocket hijacking:

```ts
wss.on("headers", (headers, req) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    req.destroy();
  }
});
```

- **Rate-limit connections.** The streaming server has a `maxClients` option, but no built-in rate limiting. Add connection rate limiting at the reverse proxy or application level.

### SharedArrayBuffer Channel

The `SharedArrayBuffer` used for sync reads is created on the main thread and shared with the worker via the init message. Data written to this buffer is accessible to both threads.

- Do not store sensitive data (tokens, credentials, PII) in the shared buffer. It is designed for layout query responses only.
- The main-thread sync channel host uses an allowlist (`ALLOWED_WINDOW_PROPERTIES`) to restrict what the worker can read. `document.cookie`, `localStorage` key enumeration beyond the allowlisted methods, and other sensitive APIs are blocked.

### Auth Token Handling

Recommended patterns for auth tokens in worker-based apps:

1. **Keep tokens in the worker.** Store auth tokens in worker memory (variables/closures). They are unreachable from the main thread. Send them directly from the worker via `fetch()` (workers have full `fetch` access).

2. **Use `HttpOnly` cookies.** If your auth uses cookies, the browser attaches them automatically to `fetch()` requests from the worker. The token never appears in JavaScript memory.

3. **Do not pass tokens through postMessage.** If you must send a token from the main thread to the worker (e.g., after an OAuth flow), do it once during initialization and do not store it in main-thread variables afterward.

4. **Do not render tokens into the DOM.** This sounds obvious, but if your worker sets `textContent` or an attribute to a value containing a token, that value will appear in the real DOM.

---

## 6. What async-dom Does NOT Protect Against

This section is deliberately blunt. Do not rely on async-dom as a security boundary for these threat vectors.

### Browser Extensions

Browser extensions with appropriate permissions (`activeTab`, `<all_urls>`, `clipboardRead`, `tabs`) have full access to:
- The rendered DOM (via content scripts).
- Network requests (via `webRequest` API).
- The page's JavaScript context (via content scripts with `"world": "MAIN"`).
- Screenshots of the page.

async-dom does not and cannot prevent extension access. Extensions operate at a privilege level above the web platform.

### Headless Browsers (Puppeteer, Playwright, Selenium)

A headless browser runs the full browser engine. It will:
- Execute the worker.
- Wait for mutations to be applied.
- Read the rendered DOM via `page.content()`, `page.evaluate()`, or `page.$eval()`.

async-dom raises the cost of automated scraping (the scraper must wait for worker initialization and mutation application, rather than parsing static HTML), but it does not prevent it. A determined scraper with a headless browser will extract your content.

### Network Interception

- Auth tokens in HTTP headers (Authorization, Cookie) are visible to any MITM with TLS interception capability (corporate proxies, compromised CAs).
- WebSocket message payloads (DOM mutations, events) are visible to network-level observers if not using `wss://`.
- The worker script itself is fetched over HTTP and can be read by anyone who can access your origin.

### Screenshots and Screen Recording

The rendered output is visible on screen. Screen capture APIs (`getDisplayMedia`), OS-level screenshot tools, and physical observation all bypass any software-level protection.

### postMessage Interception

A malicious main-thread script can:
- Override `Worker.prototype.postMessage` before the worker is created to intercept outgoing messages.
- Override `MessagePort.prototype.postMessage` for similar effect.
- Add a `message` event listener on the worker object to read incoming mutation batches.

Defense: strict CSP prevents unauthorized script execution. Code review and Subresource Integrity (SRI) on third-party scripts reduce the risk of prototype pollution.

### MutationObserver on the Rendered DOM

Any main-thread script can attach a `MutationObserver` to the root element and observe every DOM change as it is applied by async-dom's renderer. This provides a real-time stream of all content changes.

Defense: strict CSP. There is no application-level mitigation against a same-origin script using `MutationObserver`.

### DevTools

Browser DevTools provide full access to the worker's source code, network requests, and the rendered DOM. The `Sources` panel shows worker scripts. The `Console` can execute code in the worker context. There is no way to prevent this for a user who controls their own browser.

### Service Worker Interception

A registered service worker can intercept all network requests from the page and the web worker, including `fetch()` calls made by your application code. If an attacker can register a service worker on your origin (via XSS), they can intercept API calls and exfiltrate data.

Defense: `Service-Worker-Allowed` header restrictions, strict CSP, and ensuring no XSS vector exists that could register a rogue service worker.

---

## 7. Deployment Checklist

### Headers

- [ ] `Content-Security-Policy` set with `script-src 'self'` (nonce-based for inline scripts), `worker-src 'self'`, no `unsafe-eval`, no `unsafe-inline`
- [ ] `Cross-Origin-Opener-Policy: same-origin` (required for SharedArrayBuffer)
- [ ] `Cross-Origin-Embedder-Policy: require-corp` (required for SharedArrayBuffer)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY` (or use `frame-ancestors 'none'` in CSP)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` (or `no-referrer`)
- [ ] `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (HSTS)
- [ ] `Permissions-Policy` configured to disable unused APIs (camera, microphone, geolocation, etc.)

### Transport

- [ ] WebSocket connections use `wss://` exclusively in production
- [ ] WebSocket connections are authenticated before being passed to `handleConnection`
- [ ] WebSocket `Origin` header is validated
- [ ] Connection rate limiting is in place

### Application

- [ ] Auth tokens are stored in worker memory, not in the DOM or main-thread variables
- [ ] No sensitive data is rendered as `textContent` or attribute values
- [ ] Third-party scripts are loaded with Subresource Integrity (`integrity` attribute)
- [ ] `sandbox: "eval"` mode is not used unless strictly necessary, and only with worker-scoped CSP allowing `unsafe-eval`
- [ ] The `allowUnsafeHTML` renderer permission is not enabled unless you have a specific, reviewed reason

### Build and Deploy

- [ ] Source maps are not shipped to production (or are behind authentication)
- [ ] Worker scripts are served with correct `Content-Type: application/javascript` and `X-Content-Type-Options: nosniff`
- [ ] The Vite plugin is configured with `headers: true` (default)
- [ ] `crossOriginIsolated` returns `true` in the browser console on the production deployment

### Monitoring

- [ ] CSP violation reporting is configured (`report-uri` or `report-to` directive)
- [ ] WebSocket connection anomalies are logged (high connection rates, invalid auth attempts)
- [ ] Application errors from workers are captured (the Vite plugin forwards these during development; add production error reporting)
