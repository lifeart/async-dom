// Create the async-dom DevTools panel
chrome.devtools.panels.create(
  "async-dom",
  "icons/icon16.png",
  "panel.html",
  function (panel) {
    // Panel created
  }
);
