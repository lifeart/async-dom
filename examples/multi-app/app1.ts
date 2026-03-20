import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

// App 1: A color picker with scoped styles
const style = document.createElement("style");
style.textContent = `
  :host { display: block; padding: 24px; }
  h2 { color: #e74c3c; margin: 0 0 16px; }
  .swatch {
    width: 100%; height: 80px; border-radius: 8px;
    margin-bottom: 16px; transition: background-color 0.3s;
  }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; }
  button {
    padding: 8px 16px; border: none; border-radius: 4px;
    cursor: pointer; font-size: 14px; color: white;
  }
`;
document.head.appendChild(style);

const title = document.createElement("h2");
title.textContent = "Color Picker";
document.body.appendChild(title);

const swatch = document.createElement("div");
swatch.classList.add("swatch");
swatch.setAttribute("style", "background-color: #e74c3c;");
document.body.appendChild(swatch);

const controls = document.createElement("div");
controls.classList.add("controls");
document.body.appendChild(controls);

const colors = [
	{ name: "Red", hex: "#e74c3c" },
	{ name: "Blue", hex: "#3498db" },
	{ name: "Green", hex: "#2ecc71" },
	{ name: "Purple", hex: "#9b59b6" },
	{ name: "Orange", hex: "#e67e22" },
];

for (const { name, hex } of colors) {
	const btn = document.createElement("button");
	btn.textContent = name;
	btn.setAttribute("style", `background-color: ${hex};`);
	btn.addEventListener("click", () => {
		swatch.style["background-color"] = hex;
	});
	controls.appendChild(btn);
}
