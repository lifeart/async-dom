import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

// App 2: A stopwatch with scoped styles (completely isolated from App 1)
const style = document.createElement("style");
style.textContent = `
  :host { display: block; padding: 24px; }
  h2 { color: #3498db; margin: 0 0 16px; }
  .time {
    font-size: 48px; font-weight: bold; font-variant-numeric: tabular-nums;
    text-align: center; margin-bottom: 16px; color: #333;
  }
  .controls { display: flex; gap: 8px; justify-content: center; }
  button {
    padding: 8px 20px; border: 2px solid #3498db; border-radius: 4px;
    cursor: pointer; font-size: 14px; background: white; color: #3498db;
  }
  button:hover { background: #3498db; color: white; }
`;
document.head.appendChild(style);

const title = document.createElement("h2");
title.textContent = "Stopwatch";
document.body.appendChild(title);

const timeDisplay = document.createElement("div");
timeDisplay.classList.add("time");
timeDisplay.textContent = "00:00.0";
document.body.appendChild(timeDisplay);

const controls = document.createElement("div");
controls.classList.add("controls");
document.body.appendChild(controls);

const startBtn = document.createElement("button");
startBtn.textContent = "Start";
const resetBtn = document.createElement("button");
resetBtn.textContent = "Reset";
controls.append(startBtn, resetBtn);

let running = false;
let elapsed = 0;
let lastTick = 0;
let timerId: ReturnType<typeof setTimeout> | null = null;

function formatTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	const tenths = Math.floor((ms % 1000) / 100);
	return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${tenths}`;
}

function tick() {
	const now = Date.now();
	elapsed += now - lastTick;
	lastTick = now;
	timeDisplay.textContent = formatTime(elapsed);
	if (running) {
		timerId = setTimeout(tick, 100);
	}
}

startBtn.addEventListener("click", () => {
	if (running) {
		running = false;
		startBtn.textContent = "Start";
		if (timerId !== null) clearTimeout(timerId);
	} else {
		running = true;
		startBtn.textContent = "Stop";
		lastTick = Date.now();
		tick();
	}
});

resetBtn.addEventListener("click", () => {
	running = false;
	elapsed = 0;
	startBtn.textContent = "Start";
	if (timerId !== null) clearTimeout(timerId);
	timeDisplay.textContent = formatTime(0);
});
