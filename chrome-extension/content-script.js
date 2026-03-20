/**
 * Content script injected into the page (MAIN world).
 * Reads __ASYNC_DOM_DEVTOOLS__ and posts data to the DevTools panel
 * via window message passing (panel uses chrome.devtools.inspectedWindow.eval).
 *
 * Since this runs in MAIN world, it has direct access to page globals.
 * The DevTools panel polls this via eval() calls.
 */

(function () {
  "use strict";

  // Mark that the content script is loaded
  window.__ASYNC_DOM_DEVTOOLS_EXTENSION__ = true;

  // Ring buffer for warnings captured from console.warn
  const MAX_WARNINGS = 500;
  const warnings = [];
  let warningSeq = 0;

  // Ring buffer for mutation log entries (captured if debug hooks are wired)
  const MAX_LOG_ENTRIES = 1000;
  const mutationLog = [];
  let mutationSeq = 0;
  const eventLog = [];
  let eventSeq = 0;

  // Intercept console.warn to capture [async-dom] warnings
  const originalWarn = console.warn;
  console.warn = function () {
    const args = Array.from(arguments);
    const firstArg = args[0];
    if (typeof firstArg === "string" && firstArg.indexOf("[async-dom]") !== -1) {
      warningSeq++;
      const entry = {
        seq: warningSeq,
        timestamp: Date.now(),
        message: args.map(function (a) {
          return typeof a === "string" ? a : JSON.stringify(a);
        }).join(" "),
      };
      warnings.push(entry);
      if (warnings.length > MAX_WARNINGS) {
        warnings.shift();
      }
    }
    return originalWarn.apply(console, args);
  };

  // Install a hook that the devtools panel can wire into __ASYNC_DOM_DEVTOOLS__
  // to capture structured mutation and event logs
  function installDebugHooks() {
    const devtools = window.__ASYNC_DOM_DEVTOOLS__;
    if (!devtools || devtools.__extensionHooked) return false;

    devtools.__extensionHooked = true;

    // Store mutation entries from the debug logger callbacks if available
    devtools.__mutationLog = mutationLog;
    devtools.__eventLog = eventLog;
    devtools.__warnings = warnings;

    devtools.__pushMutation = function (entry) {
      mutationSeq++;
      entry.seq = mutationSeq;
      mutationLog.push(entry);
      if (mutationLog.length > MAX_LOG_ENTRIES) {
        mutationLog.shift();
      }
    };

    devtools.__pushEvent = function (entry) {
      eventSeq++;
      entry.seq = eventSeq;
      eventLog.push(entry);
      if (eventLog.length > MAX_LOG_ENTRIES) {
        eventLog.shift();
      }
    };

    return true;
  }

  // Try to install hooks periodically until devtools global appears
  let hookAttempts = 0;
  const hookInterval = setInterval(function () {
    hookAttempts++;
    if (installDebugHooks() || hookAttempts > 300) {
      clearInterval(hookInterval);
    }
  }, 200);

  // Expose query API for the panel to call via chrome.devtools.inspectedWindow.eval
  window.__ASYNC_DOM_DEVTOOLS_QUERY__ = function (command, args) {
    var devtools = window.__ASYNC_DOM_DEVTOOLS__;

    switch (command) {
      case "detect":
        return !!devtools;

      case "tree":
        if (devtools && devtools.tree) return devtools.tree();
        return null;

      case "schedulerStats":
        if (devtools && devtools.scheduler && devtools.scheduler.stats) {
          return devtools.scheduler.stats();
        }
        return null;

      case "schedulerPending":
        if (devtools && devtools.scheduler && devtools.scheduler.pending) {
          return devtools.scheduler.pending();
        }
        return null;

      case "apps":
        if (devtools && devtools.apps) return devtools.apps();
        return [];

      case "findRealNode":
        if (devtools && devtools.findRealNode && args && args.nodeId != null) {
          var node = devtools.findRealNode(args.nodeId);
          if (node) {
            // Highlight the node using the built-in inspect() or a temporary overlay
            return {
              found: true,
              tagName: node.tagName || node.nodeName,
              id: node.id || null,
              className: node.className || null,
            };
          }
        }
        return { found: false };

      case "highlightNode":
        if (devtools && devtools.findRealNode && args && args.nodeId != null) {
          var el = devtools.findRealNode(args.nodeId);
          if (el && el.scrollIntoView) {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
            // Flash highlight
            var prev = el.style ? el.style.outline : "";
            if (el.style) {
              el.style.outline = "2px solid #4fc3f7";
              el.style.outlineOffset = "-1px";
              setTimeout(function () {
                el.style.outline = prev;
                el.style.outlineOffset = "";
              }, 1500);
            }
            return true;
          }
        }
        return false;

      case "inspectNode":
        if (devtools && devtools.findRealNode && args && args.nodeId != null) {
          var inspectEl = devtools.findRealNode(args.nodeId);
          if (inspectEl) {
            inspect(inspectEl);
            return true;
          }
        }
        return false;

      case "workerTree":
        // Worker-side devtools (if exposed via postMessage bridge)
        if (devtools && devtools.document && devtools.document.toJSON) {
          return devtools.document.toJSON();
        }
        return null;

      case "workerStats":
        if (devtools && devtools.stats) return devtools.stats();
        return null;

      case "mutationLog":
        var sinceSeq = (args && args.sinceSeq) || 0;
        var entries = [];
        for (var i = 0; i < mutationLog.length; i++) {
          if (mutationLog[i].seq > sinceSeq) entries.push(mutationLog[i]);
        }
        return entries;

      case "eventLog":
        var sinceEvtSeq = (args && args.sinceSeq) || 0;
        var evtEntries = [];
        for (var j = 0; j < eventLog.length; j++) {
          if (eventLog[j].seq > sinceEvtSeq) evtEntries.push(eventLog[j]);
        }
        return evtEntries;

      case "warnings":
        var sinceWarnSeq = (args && args.sinceSeq) || 0;
        var warnEntries = [];
        for (var k = 0; k < warnings.length; k++) {
          if (warnings[k].seq > sinceWarnSeq) warnEntries.push(warnings[k]);
        }
        return warnEntries;

      case "debugStats":
        if (devtools && devtools.stats) return devtools.stats();
        return null;

      default:
        return null;
    }
  };
})();
