import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

const GRID = 40;
const CELLS = GRID * GRID;
const SPECIES = 5;
const PARTICLES = 200;
const WORLD = 40;

const px = new Float32Array(PARTICLES);
const py = new Float32Array(PARTICLES);
const vx = new Float32Array(PARTICLES);
const vy = new Float32Array(PARTICLES);
const sp = new Uint8Array(PARTICLES);

let attraction = new Float32Array(SPECIES * SPECIES);
let running = false;
let speed = 50;
let timerId: ReturnType<typeof setTimeout> | null = null;
let tick = 0;

const COLORS = ["#ff4444", "#44ff44", "#4488ff", "#ffcc00", "#cc44ff"];
const friction = 0.05;
const forceRange = 10;
const forceFactor = 0.6;
const repulseRange = 2;

function randomRules() {
	for (let i = 0; i < SPECIES * SPECIES; i++) attraction[i] = (Math.random() * 2 - 1) * 0.8;
}

function initParticles() {
	for (let i = 0; i < PARTICLES; i++) {
		px[i] = Math.random() * WORLD;
		py[i] = Math.random() * WORLD;
		vx[i] = 0;
		vy[i] = 0;
		sp[i] = i % SPECIES;
	}
	tick = 0;
}

function simulate() {
	for (let i = 0; i < PARTICLES; i++) {
		let fx = 0;
		let fy = 0;
		for (let j = 0; j < PARTICLES; j++) {
			if (i === j) continue;
			let dx = px[j] - px[i];
			let dy = py[j] - py[i];
			if (dx > WORLD / 2) dx -= WORLD;
			if (dx < -WORLD / 2) dx += WORLD;
			if (dy > WORLD / 2) dy -= WORLD;
			if (dy < -WORLD / 2) dy += WORLD;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d > 0 && d < forceRange) {
				const a = attraction[sp[i] * SPECIES + sp[j]];
				let f: number;
				if (d < repulseRange) {
					f = (d / repulseRange - 1) * 5;
				} else {
					f = a * (1 - Math.abs(2 * d - forceRange - repulseRange) / (forceRange - repulseRange));
				}
				fx += (dx / d) * f * forceFactor;
				fy += (dy / d) * f * forceFactor;
			}
		}
		vx[i] = vx[i] * (1 - friction) + fx * 0.05;
		vy[i] = vy[i] * (1 - friction) + fy * 0.05;
		px[i] = ((px[i] + vx[i]) % WORLD + WORLD) % WORLD;
		py[i] = ((py[i] + vy[i]) % WORLD + WORLD) % WORLD;
	}
	tick++;
}

// --- DOM ---
document.body.setAttribute("style", "margin:0;padding:0;background:#0a0e14;font:12px system-ui;color:#e6edf3;");

const bar = document.createElement("div");
bar.setAttribute(
	"style",
	"display:flex;gap:6px;padding:6px 10px;background:#161b22;border-bottom:1px solid #30363d;flex-wrap:wrap;align-items:center;",
);

function makeBtn(text: string, bg?: string) {
	const b = document.createElement("button");
	b.textContent = text;
	b.setAttribute(
		"style",
		`background:${bg || "#21262d"};color:${bg ? "#fff" : "#c9d1d9"};border:${bg ? "none" : "1px solid #30363d"};border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px;`,
	);
	return b;
}

const playBtn = makeBtn("\u25B6 Play", "#238636");
const resetBtn = makeBtn("\u{1F504} Reset");
const rulesBtn = makeBtn("\u{1F3B2} Rules");
const stats = document.createElement("span");
stats.setAttribute("style", "color:#8b949e;margin-left:auto;font-size:11px;");

bar.appendChild(playBtn);
bar.appendChild(resetBtn);
bar.appendChild(rulesBtn);
bar.appendChild(stats);
document.body.appendChild(bar);

const gridEl = document.createElement("div");
gridEl.setAttribute(
	"style",
	`display:grid;grid-template-columns:repeat(${GRID},1fr);line-height:0;`,
);
document.body.appendChild(gridEl);

const cells: Array<ReturnType<typeof document.createElement>> = [];
const cellColors = new Array<string>(CELLS).fill("#0a0e14");

for (let i = 0; i < CELLS; i++) {
	const c = document.createElement("div");
	c.setAttribute("style", "aspect-ratio:1;background:#0a0e14;");
	cells.push(c);
	gridEl.appendChild(c);
}

function rasterize() {
	const newColors = new Array<string>(CELLS).fill("#0a0e14");
	for (let i = 0; i < PARTICLES; i++) {
		const gx = Math.floor((px[i] / WORLD) * GRID) % GRID;
		const gy = Math.floor((py[i] / WORLD) * GRID) % GRID;
		newColors[gy * GRID + gx] = COLORS[sp[i]];
	}
	for (let i = 0; i < CELLS; i++) {
		if (newColors[i] !== cellColors[i]) {
			cellColors[i] = newColors[i];
			cells[i].style["background"] = newColors[i];
		}
	}
}

function updateStats() {
	stats.textContent = `Tick ${tick} | ${PARTICLES} particles`;
}

function start() {
	if (running) return;
	running = true;
	playBtn.textContent = "\u23F8 Pause";
	playBtn.style["background"] = "#da3633";
	doTick();
}

function stop() {
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
	simulate();
	rasterize();
	updateStats();
	timerId = setTimeout(doTick, speed);
}

playBtn.addEventListener("click", () => (running ? stop() : start()));
resetBtn.addEventListener("click", () => {
	stop();
	initParticles();
	rasterize();
	updateStats();
});
rulesBtn.addEventListener("click", () => {
	randomRules();
	initParticles();
	rasterize();
	updateStats();
	if (!running) start();
});

randomRules();
initParticles();
rasterize();
updateStats();
start();
