import { createWorkerDom } from "../../src/worker-thread/index.ts";

// Enable devtools on the worker side too.
// In the worker console you can inspect __ASYNC_DOM_DEVTOOLS__.tree()
// to see the full virtual DOM tree, or .stats() for mutation stats.
const { document } = createWorkerDom({
	debug: {
		logMutations: true,
		exposeDevtools: true,
	},
});

// Build a simple interactive UI that generates mutations for the debug panel
const style = document.createElement("style");
style.textContent = `
  body { font-family: system-ui, sans-serif; padding: 24px; }
  h2 { margin: 0 0 16px; }
  .box {
    width: 120px; height: 120px; border-radius: 12px;
    display: inline-flex; align-items: center; justify-content: center;
    margin: 8px; cursor: pointer; color: white; font-weight: bold;
    font-size: 14px; transition: transform 0.2s;
    user-select: none;
  }
  .box:hover { transform: scale(1.1); }
  p { margin-top: 16px; color: #666; font-size: 14px; }
`;
document.head.appendChild(style);

const title = document.createElement("h2");
title.textContent = "Debug Demo";
document.body.appendChild(title);

const info = document.createElement("p");
info.textContent = "Click boxes to generate DOM mutations. Watch the debug panel on the right.";
document.body.appendChild(info);

const container = document.createElement("div");
document.body.appendChild(container);

const palette = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f39c12", "#1abc9c"];

// Create clickable boxes that spawn/remove children
for (let i = 0; i < 6; i++) {
	const box = document.createElement("div");
	box.classList.add("box");
	box.setAttribute("style", `background-color: ${palette[i]};`);
	box.textContent = `Box ${i + 1}`;

	let clicks = 0;
	box.addEventListener("click", () => {
		clicks++;
		box.textContent = `${clicks} click${clicks !== 1 ? "s" : ""}`;

		// Every 3 clicks, add a new child box below
		if (clicks % 3 === 0) {
			const child = document.createElement("div");
			child.classList.add("box");
			child.setAttribute(
				"style",
				`background-color: ${palette[Math.floor(Math.random() * palette.length)]}; width: 80px; height: 80px; font-size: 11px;`,
			);
			child.textContent = "new!";
			child.addEventListener("click", () => {
				child.remove();
			});
			container.appendChild(child);
		}
	});

	container.appendChild(box);
}
