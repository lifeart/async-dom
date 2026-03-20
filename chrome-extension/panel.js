(function () {
  "use strict";

  // ==================== Eval Helper ====================

  /**
   * Evaluate an expression in the inspected page's context.
   * Returns a Promise that resolves with the result.
   */
  function pageEval(expr) {
    return new Promise(function (resolve, reject) {
      chrome.devtools.inspectedWindow.eval(expr, function (result, error) {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  function query(command, args) {
    var argsStr = args ? JSON.stringify(args) : "undefined";
    return pageEval(
      "window.__ASYNC_DOM_DEVTOOLS_QUERY__ && window.__ASYNC_DOM_DEVTOOLS_QUERY__(" +
        JSON.stringify(command) + ", " + argsStr + ")"
    );
  }

  // ==================== State ====================

  var detected = false;
  var pollInterval = null;
  var selectedNodeId = null;
  var activeTab = "tree";

  // Performance chart data (ring buffers)
  var CHART_POINTS = 60;
  var queueHistory = new Array(CHART_POINTS).fill(0);
  var frameTimeHistory = new Array(CHART_POINTS).fill(0);

  // Message log state
  var lastMutationSeq = 0;
  var lastEventSeq = 0;
  var lastWarningSeq = 0;
  var messageEntries = [];
  var warningEntries = [];
  var MAX_DISPLAY_ENTRIES = 500;

  // Mutation type counters
  var mutationTypeCounts = {};

  // ==================== Tab Switching ====================

  var tabButtons = document.querySelectorAll(".tab-bar button[data-tab]");
  var tabPanels = document.querySelectorAll(".tab-content[data-panel]");

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeTab = btn.getAttribute("data-tab");
      tabButtons.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      tabPanels.forEach(function (p) {
        p.classList.toggle("active", p.getAttribute("data-panel") === activeTab);
      });
    });
  });

  // ==================== Detection ====================

  var statusDot = document.getElementById("status-dot");
  var statusText = document.getElementById("status-text");
  var notDetected = document.getElementById("not-detected");

  function updateStatus(connected) {
    detected = connected;
    statusDot.className = "status-dot " + (connected ? "connected" : "disconnected");
    statusText.textContent = connected ? "Connected" : "Not detected";
    notDetected.classList.toggle("hidden", connected);
    tabPanels.forEach(function (p) {
      if (connected) return;
      // Keep not-detected visible by hiding panels
    });
  }

  function detectLoop() {
    query("detect").then(function (result) {
      updateStatus(!!result);
    }).catch(function () {
      updateStatus(false);
    });
  }

  // ==================== Tree View ====================

  var treePane = document.getElementById("tree-pane");
  var propsPane = document.getElementById("props-pane");

  function renderTree(data) {
    if (!data) {
      treePane.innerHTML = '<div class="props-empty">No tree data available.</div>';
      return;
    }
    var container = document.createElement("div");
    container.style.padding = "4px 0";
    buildTreeNode(container, data, 0, true);
    treePane.innerHTML = "";
    treePane.appendChild(container);
  }

  function buildTreeNode(parent, node, depth, expanded) {
    if (!node) return;

    var wrapper = document.createElement("div");
    wrapper.className = "tree-node" + (expanded ? " expanded" : "");

    var line = document.createElement("div");
    line.className = "tree-node-line";
    line.style.paddingLeft = (depth * 16 + 4) + "px";

    var nodeId = node.id;

    if (node.type === "text") {
      var toggle = document.createElement("span");
      toggle.className = "tree-toggle";
      line.appendChild(toggle);

      var textSpan = document.createElement("span");
      textSpan.className = "tree-text";
      var displayText = (node.text || "").trim();
      if (displayText.length > 60) displayText = displayText.substring(0, 60) + "...";
      textSpan.textContent = '"' + displayText + '"';
      line.appendChild(textSpan);

      if (nodeId != null) {
        var idSpan = document.createElement("span");
        idSpan.className = "tree-node-id";
        idSpan.textContent = "#" + nodeId;
        line.appendChild(idSpan);
      }

      wrapper.appendChild(line);
      parent.appendChild(wrapper);
      return;
    }

    if (node.type === "comment") {
      var toggleC = document.createElement("span");
      toggleC.className = "tree-toggle";
      line.appendChild(toggleC);

      var commentSpan = document.createElement("span");
      commentSpan.className = "tree-text";
      commentSpan.textContent = "<!-- " + (node.text || "").substring(0, 40) + " -->";
      line.appendChild(commentSpan);

      wrapper.appendChild(line);
      parent.appendChild(wrapper);
      return;
    }

    // Element node
    var children = node.children || [];
    var hasChildren = children.length > 0;

    var toggleEl = document.createElement("span");
    toggleEl.className = "tree-toggle";
    toggleEl.textContent = hasChildren ? (expanded ? "\u25BC" : "\u25B6") : "";
    line.appendChild(toggleEl);

    // Build tag display: <TAG id="..." class="...">
    var tagOpen = document.createElement("span");
    var tag = (node.tag || "???").toLowerCase();

    var html = '<span class="tree-tag">&lt;' + escapeHtml(tag) + '</span>';

    // Show id attribute
    var attrs = node.attributes || {};
    if (attrs.id) {
      html += ' <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"' + escapeHtml(attrs.id) + '"</span>';
    }

    // Show class
    var cls = node.className || attrs.class || "";
    if (cls) {
      var truncCls = cls.length > 30 ? cls.substring(0, 30) + "..." : cls;
      html += ' <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"' + escapeHtml(truncCls) + '"</span>';
    }

    // Show other notable attributes (max 2)
    var shownAttrs = 0;
    for (var attrName in attrs) {
      if (attrName === "id" || attrName === "class" || attrName === "data-async-dom-id") continue;
      if (shownAttrs >= 2) break;
      var val = attrs[attrName];
      if (val.length > 20) val = val.substring(0, 20) + "...";
      html += ' <span class="tree-attr-name">' + escapeHtml(attrName) + '</span>=<span class="tree-attr-value">"' + escapeHtml(val) + '"</span>';
      shownAttrs++;
    }

    html += '<span class="tree-tag">&gt;</span>';
    tagOpen.innerHTML = html;
    line.appendChild(tagOpen);

    // Node ID badge
    if (nodeId != null) {
      var nidSpan = document.createElement("span");
      nidSpan.className = "tree-node-id";
      nidSpan.textContent = "#" + nodeId;
      line.appendChild(nidSpan);
    }

    // Click to select
    line.addEventListener("click", function (e) {
      e.stopPropagation();
      // Toggle expand
      if (hasChildren && e.target === toggleEl) {
        wrapper.classList.toggle("expanded");
        toggleEl.textContent = wrapper.classList.contains("expanded") ? "\u25BC" : "\u25B6";
        return;
      }
      selectNode(nodeId, node);
    });

    // Double-click to highlight in page
    line.addEventListener("dblclick", function (e) {
      e.stopPropagation();
      if (nodeId != null) {
        query("highlightNode", { nodeId: nodeId });
      }
    });

    wrapper.appendChild(line);

    // Children
    if (hasChildren) {
      var childrenDiv = document.createElement("div");
      childrenDiv.className = "tree-children";
      for (var i = 0; i < children.length; i++) {
        buildTreeNode(childrenDiv, children[i], depth + 1, depth < 2);
      }
      // Closing tag
      var closeLine = document.createElement("div");
      closeLine.className = "tree-node-line";
      closeLine.style.paddingLeft = (depth * 16 + 20) + "px";
      closeLine.innerHTML = '<span class="tree-tag">&lt;/' + escapeHtml(tag) + '&gt;</span>';
      childrenDiv.appendChild(closeLine);
      wrapper.appendChild(childrenDiv);
    }

    parent.appendChild(wrapper);
  }

  function selectNode(nodeId, node) {
    selectedNodeId = nodeId;

    // Update selection highlight
    var prevSelected = treePane.querySelector(".tree-node-line.selected");
    if (prevSelected) prevSelected.classList.remove("selected");

    // Find the line for this node and highlight it
    // We rely on the click handler's context
    event && event.currentTarget && event.currentTarget.classList.add("selected");

    renderProps(node, nodeId);
  }

  function renderProps(node, nodeId) {
    if (!node) {
      propsPane.innerHTML = '<div class="props-empty">Select a node to inspect.</div>';
      return;
    }

    var html = "";

    // Node Info section
    html += '<div class="props-section">';
    html += '<div class="props-section-header"><span class="caret">\u25BC</span> Node Info</div>';
    html += '<div class="props-section-body">';
    html += propsRow("_nodeId", nodeId, "number");
    html += propsRow("type", node.type);
    if (node.tag) html += propsRow("tagName", node.tag);
    if (node.text != null) html += propsRow("textContent", truncate(node.text, 100));
    html += propsRow("children", (node.children || []).length, "number");
    html += "</div></div>";

    // Attributes section
    var attrs = node.attributes || {};
    var attrKeys = Object.keys(attrs);
    if (attrKeys.length > 0) {
      html += '<div class="props-section">';
      html += '<div class="props-section-header"><span class="caret">\u25BC</span> Attributes (' + attrKeys.length + ')</div>';
      html += '<div class="props-section-body">';
      for (var i = 0; i < attrKeys.length; i++) {
        html += propsRow(attrKeys[i], attrs[attrKeys[i]]);
      }
      html += "</div></div>";
    }

    // className section
    if (node.className) {
      html += '<div class="props-section">';
      html += '<div class="props-section-header"><span class="caret">\u25BC</span> Classes</div>';
      html += '<div class="props-section-body">';
      var classes = node.className.split(/\s+/).filter(Boolean);
      for (var j = 0; j < classes.length; j++) {
        html += propsRow("." + classes[j], "", "null");
      }
      html += "</div></div>";
    }

    // Actions section
    html += '<div class="props-section">';
    html += '<div class="props-section-header"><span class="caret">\u25BC</span> Actions</div>';
    html += '<div class="props-section-body" style="padding:8px 16px">';
    html += '<button onclick="panelActions.highlight(' + nodeId + ')" style="' + btnStyle() + '">Highlight in Page</button> ';
    html += '<button onclick="panelActions.inspect(' + nodeId + ')" style="' + btnStyle() + '">Inspect in Elements</button>';
    html += "</div></div>";

    propsPane.innerHTML = html;

    // Wire section collapse toggles
    propsPane.querySelectorAll(".props-section-header").forEach(function (header) {
      header.addEventListener("click", function () {
        header.parentElement.classList.toggle("collapsed");
        var caret = header.querySelector(".caret");
        if (caret) {
          caret.textContent = header.parentElement.classList.contains("collapsed") ? "\u25B6" : "\u25BC";
        }
      });
    });
  }

  function propsRow(key, value, type) {
    if (value === undefined || value === null) type = "null";
    else if (type === undefined) type = typeof value;

    var displayVal = value;
    if (type === "null" || value === null || value === undefined) displayVal = "null";
    else displayVal = String(value);

    var cls = "props-value";
    if (type === "number") cls += " number";
    else if (type === "boolean") cls += " boolean";
    else if (type === "null") cls += " null";

    return '<div class="props-row">' +
      '<span class="props-key">' + escapeHtml(key) + ':</span>' +
      '<span class="' + cls + '">' + escapeHtml(String(displayVal)) + '</span>' +
      '</div>';
  }

  function btnStyle() {
    return "background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:4px 10px;border-radius:3px;font-size:11px;cursor:pointer;";
  }

  // Global panel actions for inline onclick handlers
  window.panelActions = {
    highlight: function (nodeId) {
      query("highlightNode", { nodeId: nodeId });
    },
    inspect: function (nodeId) {
      query("inspectNode", { nodeId: nodeId });
    }
  };

  // ==================== Performance ====================

  var chartQueueCanvas = document.getElementById("chart-queue");
  var chartFrameCanvas = document.getElementById("chart-frame");

  function updatePerformance(schedulerStats, debugStats, apps) {
    if (!schedulerStats) return;

    var pending = schedulerStats.pending || 0;
    var frameTime = schedulerStats.lastFrameTimeMs || 0;
    var frameId = schedulerStats.frameId || 0;
    var actions = schedulerStats.lastFrameActions || 0;
    var running = schedulerStats.isRunning;

    // Update metrics
    var pendingEl = document.getElementById("perf-pending");
    pendingEl.textContent = pending;
    pendingEl.className = "perf-metric-value" + (pending > 5000 ? " error" : pending > 1000 ? " warning" : "");

    var ftEl = document.getElementById("perf-frame-time");
    ftEl.textContent = frameTime.toFixed(1) + "ms";
    ftEl.className = "perf-metric-value" + (frameTime > 16 ? " error" : frameTime > 12 ? " warning" : " good");

    document.getElementById("perf-frame-id").textContent = frameId;
    document.getElementById("perf-actions").textContent = actions;
    document.getElementById("perf-running").textContent = running ? "Yes" : "No";
    document.getElementById("perf-running").className = "perf-metric-value" + (running ? " good" : " warning");

    // Push to history
    queueHistory.push(pending);
    if (queueHistory.length > CHART_POINTS) queueHistory.shift();

    frameTimeHistory.push(frameTime);
    if (frameTimeHistory.length > CHART_POINTS) frameTimeHistory.shift();

    // Draw charts
    drawLineChart(chartQueueCanvas, queueHistory, "var(--chart-blue)", null);
    drawLineChart(chartFrameCanvas, frameTimeHistory, "var(--chart-green)", 16);

    // Debug stats
    if (debugStats) {
      var statFields = [
        "mutationsAdded", "mutationsCoalesced", "mutationsFlushed",
        "mutationsApplied", "eventsForwarded", "eventsDispatched",
        "syncReadRequests", "syncReadTimeouts"
      ];
      for (var i = 0; i < statFields.length; i++) {
        var el = document.getElementById("stat-" + statFields[i]);
        if (el && debugStats[statFields[i]] != null) {
          el.textContent = debugStats[statFields[i]];
        }
      }
    }

    // Apps
    if (apps && apps.length > 0) {
      var appsHtml = "";
      for (var j = 0; j < apps.length; j++) {
        appsHtml += '<div class="perf-metric">' +
          '<span class="perf-metric-label">App ' + (j + 1) + '</span>' +
          '<span class="perf-metric-value" style="font-size:12px">' + escapeHtml(String(apps[j])) + '</span>' +
          '</div>';
      }
      document.getElementById("perf-apps").innerHTML = appsHtml;
    }
  }

  function drawLineChart(canvas, data, color, thresholdLine) {
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    var max = Math.max.apply(null, data) || 1;
    if (thresholdLine && thresholdLine > max) max = thresholdLine * 1.2;
    max = max * 1.1;

    var step = w / (data.length - 1);

    // Resolve CSS custom property colors
    var styles = getComputedStyle(document.documentElement);
    var resolvedColor = color.startsWith("var(")
      ? styles.getPropertyValue(color.slice(4, -1)).trim()
      : color;

    // Threshold line
    if (thresholdLine != null) {
      var ty = h - (thresholdLine / max) * h;
      ctx.beginPath();
      ctx.strokeStyle = styles.getPropertyValue("--error").trim() || "#f44747";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(0, ty);
      ctx.lineTo(w, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = styles.getPropertyValue("--error").trim() || "#f44747";
      ctx.font = "9px sans-serif";
      ctx.fillText(thresholdLine + "ms", w - 28, ty - 3);
    }

    // Data line
    ctx.beginPath();
    ctx.strokeStyle = resolvedColor || "#4fc3f7";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    for (var i = 0; i < data.length; i++) {
      var x = i * step;
      var y = h - (data[i] / max) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under line
    ctx.lineTo((data.length - 1) * step, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = (resolvedColor || "#4fc3f7") + "20";
    ctx.fill();
  }

  function updateMutationTypeBars(entries) {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var action = entry.action || (entry.mutation && entry.mutation.action) || "unknown";
      mutationTypeCounts[action] = (mutationTypeCounts[action] || 0) + 1;
    }

    renderMutationBars();
  }

  function renderMutationBars() {
    var container = document.getElementById("mutation-type-bars");
    if (!container) return;

    var keys = Object.keys(mutationTypeCounts);
    if (keys.length === 0) return;

    // Sort by count descending
    keys.sort(function (a, b) { return mutationTypeCounts[b] - mutationTypeCounts[a]; });

    var max = mutationTypeCounts[keys[0]] || 1;
    var colors = [
      "#4fc3f7", "#4ec9b0", "#d7ba7d", "#c586c0", "#f44747",
      "#569cd6", "#ce9178", "#9cdcfe", "#6a9955", "#dcdcaa"
    ];

    var html = "";
    var limit = Math.min(keys.length, 10);
    for (var i = 0; i < limit; i++) {
      var k = keys[i];
      var count = mutationTypeCounts[k];
      var pct = (count / max * 100).toFixed(1);
      var color = colors[i % colors.length];

      html += '<div class="mutation-bar-row">' +
        '<span class="mutation-bar-label">' + escapeHtml(k) + '</span>' +
        '<div class="mutation-bar-track">' +
        '<div class="mutation-bar-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
        '</div>' +
        '<span class="mutation-bar-count">' + count + '</span>' +
        '</div>';
    }

    container.innerHTML = html;
  }

  // ==================== Messages ====================

  var messagesList = document.getElementById("messages-list");
  var msgTypeFilter = document.getElementById("msg-type-filter");
  var msgActionFilter = document.getElementById("msg-action-filter");
  var msgAutoscroll = document.getElementById("msg-autoscroll");

  document.getElementById("msg-clear").addEventListener("click", function () {
    messageEntries = [];
    messagesList.innerHTML = "";
  });

  msgTypeFilter.addEventListener("change", renderMessages);
  msgActionFilter.addEventListener("input", renderMessages);

  function addMessages(mutations, events) {
    var changed = false;

    if (mutations && mutations.length > 0) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        messageEntries.push({
          type: "mutation",
          timestamp: m.timestamp || Date.now(),
          action: m.action || (m.mutation && m.mutation.action) || "?",
          detail: m.mutation ? JSON.stringify(m.mutation) : JSON.stringify(m),
          side: m.side || "?",
          batchUid: m.batchUid,
          nodeId: m.mutation && m.mutation.id,
          raw: m,
        });
      }
      changed = true;
      lastMutationSeq = mutations[mutations.length - 1].seq || lastMutationSeq;
    }

    if (events && events.length > 0) {
      for (var j = 0; j < events.length; j++) {
        var e = events[j];
        messageEntries.push({
          type: "event",
          timestamp: e.timestamp || Date.now(),
          action: e.eventType || e.phase || "?",
          detail: JSON.stringify(e),
          side: e.side || "?",
          raw: e,
        });
      }
      changed = true;
      lastEventSeq = events[events.length - 1].seq || lastEventSeq;
    }

    // Trim
    while (messageEntries.length > MAX_DISPLAY_ENTRIES) {
      messageEntries.shift();
    }

    if (changed) {
      renderMessages();
    }
  }

  function renderMessages() {
    var filter = msgTypeFilter.value;
    var actionFilter = msgActionFilter.value.toLowerCase().trim();

    var fragment = document.createDocumentFragment();

    for (var i = 0; i < messageEntries.length; i++) {
      var entry = messageEntries[i];
      if (filter !== "all" && entry.type !== filter) continue;
      if (actionFilter && entry.action.toLowerCase().indexOf(actionFilter) === -1) continue;

      var div = document.createElement("div");
      div.className = "msg-entry";

      var time = formatTime(entry.timestamp);
      var typeClass = entry.type;

      div.innerHTML =
        '<div class="msg-summary">' +
        '<span class="msg-time">' + time + '</span>' +
        '<span class="msg-type ' + typeClass + '">' + entry.type + '</span>' +
        '<span class="msg-action">' + escapeHtml(entry.action) + '</span>' +
        '<span class="msg-detail">' + escapeHtml(entry.side) + (entry.nodeId != null ? " node:" + entry.nodeId : "") + '</span>' +
        '</div>' +
        '<div class="msg-expand">' + escapeHtml(entry.detail) + '</div>';

      div.addEventListener("click", function () {
        this.classList.toggle("expanded");
      });

      fragment.appendChild(div);
    }

    messagesList.innerHTML = "";
    messagesList.appendChild(fragment);

    if (msgAutoscroll.checked) {
      messagesList.scrollTop = messagesList.scrollHeight;
    }
  }

  // ==================== Warnings ====================

  var warningsList = document.getElementById("warnings-list");

  document.getElementById("warn-clear").addEventListener("click", function () {
    warningEntries = [];
    warningsList.innerHTML = '<div class="warnings-empty">No warnings captured yet.</div>';
    document.getElementById("warn-count").textContent = "0 warnings";
  });

  function addWarnings(entries) {
    if (!entries || entries.length === 0) return;

    if (warningEntries.length === 0) {
      warningsList.innerHTML = "";
    }

    for (var i = 0; i < entries.length; i++) {
      var w = entries[i];
      warningEntries.push(w);
      lastWarningSeq = w.seq || lastWarningSeq;

      var div = document.createElement("div");
      div.className = "warn-entry";

      var codeClass = "generic";
      var msg = w.message || "";
      if (msg.indexOf("MISSING_NODE") !== -1 || msg.indexOf("not found") !== -1) codeClass = "missing-node";
      else if (msg.indexOf("overflow") !== -1 || msg.indexOf("Scheduler") !== -1) codeClass = "overflow";
      else if (msg.indexOf("transport") !== -1 || msg.indexOf("Transport") !== -1 || msg.indexOf("disconnected") !== -1) codeClass = "transport";

      var code = codeClass.toUpperCase().replace("-", "_");

      div.innerHTML =
        '<span class="warn-time">' + formatTime(w.timestamp) + '</span>' +
        '<span class="warn-code ' + codeClass + '">' + code + '</span>' +
        '<span class="warn-message">' + escapeHtml(msg) + '</span>';

      warningsList.appendChild(div);
    }

    // Trim
    while (warningEntries.length > MAX_DISPLAY_ENTRIES) {
      warningEntries.shift();
      if (warningsList.firstChild) warningsList.removeChild(warningsList.firstChild);
    }

    document.getElementById("warn-count").textContent = warningEntries.length + " warning" + (warningEntries.length !== 1 ? "s" : "");
  }

  // ==================== Polling ====================

  function poll() {
    if (!detected) {
      detectLoop();
      return;
    }

    // Always fetch scheduler stats and warnings
    var promises = [
      query("schedulerStats"),
      query("warnings", { sinceSeq: lastWarningSeq }),
      query("apps"),
    ];

    // Tab-specific fetches
    if (activeTab === "tree") {
      promises.push(query("tree"));
    } else {
      promises.push(Promise.resolve(null));
    }

    if (activeTab === "messages" || activeTab === "performance") {
      promises.push(query("mutationLog", { sinceSeq: lastMutationSeq }));
      promises.push(query("eventLog", { sinceSeq: lastEventSeq }));
    } else {
      promises.push(Promise.resolve(null));
      promises.push(Promise.resolve(null));
    }

    // Worker-side stats (debug stats)
    promises.push(query("debugStats"));

    Promise.all(promises).then(function (results) {
      var schedulerStats = results[0];
      var warnings = results[1];
      var apps = results[2];
      var tree = results[3];
      var mutations = results[4];
      var events = results[5];
      var debugStats = results[6];

      if (!schedulerStats && !tree) {
        // Devtools might have been removed
        detectLoop();
      }

      // Update performance
      updatePerformance(schedulerStats, debugStats, apps);

      // Update tree
      if (tree && activeTab === "tree") {
        renderTree(tree);
      }

      // Update messages
      if (mutations && mutations.length > 0) {
        updateMutationTypeBars(mutations);
      }
      addMessages(mutations, events);

      // Update warnings
      addWarnings(warnings);

    }).catch(function (err) {
      // Connection might be lost
      detectLoop();
    });
  }

  // ==================== Utility ====================

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.substring(0, max) + "..." : str;
  }

  function formatTime(ts) {
    if (!ts) return "--:--:--";
    var d = new Date(ts);
    if (isNaN(d.getTime())) {
      // ts might be performance.now() relative value
      d = new Date();
    }
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    var s = String(d.getSeconds()).padStart(2, "0");
    var ms = String(d.getMilliseconds()).padStart(3, "0");
    return h + ":" + m + ":" + s + "." + ms;
  }

  // ==================== Init ====================

  detectLoop();
  pollInterval = setInterval(poll, 1500);

  // Also detect every 5 seconds if not connected
  setInterval(function () {
    if (!detected) detectLoop();
  }, 5000);

})();
