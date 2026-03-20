import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

// Build counter UI
const container = document.createElement("div");
container.setAttribute("style", "text-align: center; padding: 40px; font-family: system-ui;");

const display = document.createElement("h1");
display.textContent = "0";

const incBtn = document.createElement("button");
incBtn.textContent = "+1";
incBtn.setAttribute("style", "font-size: 24px; padding: 10px 20px; margin: 10px;");

const decBtn = document.createElement("button");
decBtn.textContent = "-1";
decBtn.setAttribute("style", "font-size: 24px; padding: 10px 20px; margin: 10px;");

let count = 0;
incBtn.addEventListener("click", () => {
	count++;
	display.textContent = String(count);
});
decBtn.addEventListener("click", () => {
	count--;
	display.textContent = String(count);
});

container.append(display, decBtn, incBtn);
document.body.appendChild(container);
