import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

const COLS = 40;
const ROWS = 30;
const COUNT = COLS * ROWS;

let grid = new Uint8Array(COUNT);
let next = new Uint8Array(COUNT);
let running = false;
let gen = 0;
let speed = 150;
let timerId: ReturnType<typeof setTimeout> | null = null;
let aliveCount = 0;

function recount() {
	aliveCount = 0;
	for (let i = 0; i < COUNT; i++) aliveCount += grid[i];
}

function seedRandom() {
	for (let i = 0; i < COUNT; i++) grid[i] = Math.random() > 0.65 ? 1 : 0;
	gen = 0;
	recount();
	renderFull();
	updateStats();
}

function step() {
	next.set(grid);
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			let n = 0;
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					if (!dr && !dc) continue;
					n += grid[((r + dr + ROWS) % ROWS) * COLS + ((c + dc + COLS) % COLS)];
				}
			}
			const idx = r * COLS + c;
			const alive = grid[idx];
			const v = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
			next[idx] = v;
			aliveCount += v - alive;
		}
	}
	const tmp = grid;
	grid = next;
	next = tmp;
	gen++;
}

document.body.setAttribute(
	"style",
	"margin:0;padding:0;background:#0d1117;font:12px system-ui;color:#e6edf3;",
);

// Controls
const bar = document.createElement("div");
bar.setAttribute(
	"style",
	"display:flex;gap:6px;padding:6px 10px;background:#161b22;border-bottom:1px solid #30363d;flex-wrap:wrap;align-items:center;",
);

function makeBtn(text: string, bg?: string): ReturnType<typeof document.createElement> {
	const b = document.createElement("button");
	b.textContent = text;
	b.setAttribute(
		"style",
		`background:${bg || "#21262d"};color:${bg ? "#fff" : "#c9d1d9"};border:${bg ? "none" : "1px solid #30363d"};border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px;`,
	);
	return b;
}

const playBtn = makeBtn("\u25B6 Play", "#238636");
const stepBtn = makeBtn("\u23ED Step");
const randomBtn = makeBtn("\u{1F3B2} Random");
const clearBtn = makeBtn("\u{1F5D1} Clear");
const stats = document.createElement("span");
stats.setAttribute("style", "color:#8b949e;margin-left:auto;font-size:11px;");

bar.appendChild(playBtn);
bar.appendChild(stepBtn);
bar.appendChild(randomBtn);
bar.appendChild(clearBtn);
bar.appendChild(stats);
document.body.appendChild(bar);

// Grid
const gridEl = document.createElement("div");
gridEl.setAttribute(
	"style",
	`display:grid;grid-template-columns:repeat(${COLS},1fr);line-height:0;cursor:pointer;padding:2px;`,
);
document.body.appendChild(gridEl);

const cells: Array<ReturnType<typeof document.createElement>> = [];
for (let i = 0; i < COUNT; i++) {
	const c = document.createElement("div");
	c.setAttribute("style", "aspect-ratio:1;background:#0d1117;border:1px solid #161b22;");
	c.addEventListener("click", () => {
		aliveCount += grid[i] ? -1 : 1;
		grid[i] = grid[i] ? 0 : 1;
		c.style["background"] = grid[i] ? "#39d353" : "#0d1117";
		updateStats();
	});
	cells.push(c);
	gridEl.appendChild(c);
}

function renderFull() {
	for (let i = 0; i < COUNT; i++) cells[i].style["background"] = grid[i] ? "#39d353" : "#0d1117";
}

function renderDirty() {
	for (let i = 0; i < COUNT; i++) {
		if (grid[i] !== next[i]) cells[i].style["background"] = grid[i] ? "#39d353" : "#0d1117";
	}
}

function updateStats() {
	stats.textContent = `Gen ${gen} | ${aliveCount}/${COUNT}`;
}

function startSim() {
	if (running) return;
	running = true;
	playBtn.textContent = "\u23F8 Pause";
	playBtn.style["background"] = "#da3633";
	doTick();
}

function stopSim() {
	running = false;
	playBtn.textContent = "\u25B6 Play";
	playBtn.style["background"] = "#238636";
	if (timerId !== null) {
		clearTimeout(timerId);
		timerId = null;
	}
}

function doTick() {
	if (!running) return;
	step();
	renderDirty();
	updateStats();
	timerId = setTimeout(doTick, speed);
}

playBtn.addEventListener("click", () => (running ? stopSim() : startSim()));
stepBtn.addEventListener("click", () => {
	stopSim();
	step();
	renderDirty();
	updateStats();
});
randomBtn.addEventListener("click", () => {
	stopSim();
	seedRandom();
});
clearBtn.addEventListener("click", () => {
	stopSim();
	grid.fill(0);
	gen = 0;
	aliveCount = 0;
	renderFull();
	updateStats();
});

// Seed R-pentomino
grid.fill(0);
const cx = Math.floor(COLS / 2);
const cy = Math.floor(ROWS / 2);
grid[cy * COLS + cx + 1] = 1;
grid[cy * COLS + cx + 2] = 1;
grid[(cy + 1) * COLS + cx] = 1;
grid[(cy + 1) * COLS + cx + 1] = 1;
grid[(cy + 2) * COLS + cx + 1] = 1;
recount();
renderFull();
updateStats();
startSim();
