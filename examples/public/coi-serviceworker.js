/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
/*
 * This service worker intercepts all fetch requests and adds
 * Cross-Origin-Embedder-Policy: require-corp
 * Cross-Origin-Opener-Policy: same-origin
 * headers to the response, enabling SharedArrayBuffer on pages served
 * from hosts that do not support custom headers (like GitHub Pages).
 */
let coepCredentialless = false;

if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

  self.addEventListener("message", (ev) => {
    if (ev.data && ev.data.type === "deregister") {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          for (const client of clients) {
            client.navigate(client.url);
          }
        });
    }
  });

  self.addEventListener("fetch", function (event) {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
      return;
    }

    const request =
      coepCredentialless && r.mode === "no-cors"
        ? new Request(r, { credentials: "omit" })
        : r;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set(
            "Cross-Origin-Embedder-Policy",
            coepCredentialless ? "credentialless" : "require-corp"
          );
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
    window.sessionStorage.removeItem("coiReloadedBySelf");

    const coepDegrading = reloadedBySelf === "coepDegrade";

    // You can customize the brower test by setting coi.shouldRegister to
    // return true/false. It is called at registration time.
    const n = navigator;

    if (n.serviceWorker && n.serviceWorker.controller) {
      n.serviceWorker.controller.postMessage({ type: "coepCredentialless", value: coepDegrading });
      if (coepDegrading) {
        return;
      }
    }

    // If we're already cross-origin-isolated, no need to register.
    if (window.crossOriginIsolated !== false) {
      return;
    }

    if (!window.isSecureContext) {
      !coepDegrading &&
        console.log(
          "COOP/COEP Service Worker: Not running in a secure context."
        );
      return;
    }

    // In some environments, registration may not be available.
    if (!n.serviceWorker) {
      console.error(
        "COOP/COEP Service Worker: ServiceWorker API is not available."
      );
      return;
    }

    n.serviceWorker
      .register(new URL("./coi-serviceworker.js", document.currentScript && document.currentScript.src || location.href).href)
      .then(
        (registration) => {
          registration.addEventListener("updatefound", () => {
            const newSW = registration.installing;
            newSW.addEventListener("statechange", () => {
              if (newSW.state === "activated") {
                coepCredentialless = coepDegrading;
                window.sessionStorage.setItem("coiReloadedBySelf", coepDegrading ? "coepDegrade" : "");
                window.location.reload();
              }
            });
          });

          // If the registration is active, but it's not controlling the page
          if (registration.active && !n.serviceWorker.controller) {
            window.sessionStorage.setItem("coiReloadedBySelf", coepDegrading ? "coepDegrade" : "");
            window.location.reload();
          }
        },
        (err) => {
          console.error("COOP/COEP Service Worker: Registration failed: ", err);
        }
      );
  })();
}
