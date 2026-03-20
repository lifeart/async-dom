import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

// --- Grid Configuration ---
const COLS = 60;
const ROWS = 40;
const CELL_COUNT = COLS * ROWS;

// --- State ---
let grid = new Uint8Array(CELL_COUNT);
let nextGrid = new Uint8Array(CELL_COUNT);
let running = false;
let generation = 0;
let speed = 200;
let timerId: ReturnType<typeof setTimeout> | null = null;
let aliveCount = 0;

// --- Initialize with random pattern ---
function randomize() {
	for (let i = 0; i < CELL_COUNT; i++) {
		grid[i] = Math.random() > 0.65 ? 1 : 0;
	}
	generation = 0;
	recount();
	renderFullGrid();
	updateStats();
}

// --- Classic patterns ---
function addGlider(startRow: number, startCol: number) {
	const pattern = [
		[0, 1, 0],
		[0, 0, 1],
		[1, 1, 1],
	];
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			const row = (startRow + r) % ROWS;
			const col = (startCol + c) % COLS;
			grid[row * COLS + col] = pattern[r][c];
		}
	}
}

function seedPatterns() {
	grid.fill(0);
	generation = 0;
	addGlider(2, 2);
	addGlider(2, 15);
	addGlider(10, 8);
	addGlider(20, 30);
	addGlider(15, 45);
	// R-pentomino in center
	const cx = Math.floor(COLS / 2);
	const cy = Math.floor(ROWS / 2);
	grid[cy * COLS + cx + 1] = 1;
	grid[cy * COLS + cx + 2] = 1;
	grid[(cy + 1) * COLS + cx] = 1;
	grid[(cy + 1) * COLS + cx + 1] = 1;
	grid[(cy + 2) * COLS + cx + 1] = 1;
	recount();
	renderFullGrid();
	updateStats();
}

// --- Game of Life rules ---
function step() {
	// Save current grid into nextGrid so we can diff after swap
	nextGrid.set(grid);

	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			let neighbors = 0;
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					if (dr === 0 && dc === 0) continue;
					const nr = (row + dr + ROWS) % ROWS;
					const nc = (col + dc + COLS) % COLS;
					neighbors += grid[nr * COLS + nc];
				}
			}
			const idx = row * COLS + col;
			const alive = grid[idx];
			const next = alive
				? neighbors === 2 || neighbors === 3
					? 1
					: 0
				: neighbors === 3
					? 1
					: 0;
			// Write new state back into nextGrid (overwriting the copy)
			nextGrid[idx] = next;
			aliveCount += next - alive;
		}
	}
	// Swap: grid = new state, nextGrid = old state (for dirty diffing)
	const tmp = grid;
	grid = nextGrid;
	nextGrid = tmp;
	generation++;
}

function recount(): void {
	aliveCount = 0;
	for (let i = 0; i < CELL_COUNT; i++) aliveCount += grid[i];
}

// --- Build DOM ---
document.body.setAttribute(
	"style",
	"margin: 0; padding: 0; background: #0d1117; font-family: system-ui, sans-serif; color: #e6edf3;",
);

// Controls bar
const controls = document.createElement("div");
controls.setAttribute(
	"style",
	"display: flex; gap: 8px; align-items: center; padding: 10px 16px; background: #161b22; border-bottom: 1px solid #30363d; flex-wrap: wrap; font-size: 13px;",
);

const playBtn = document.createElement("button");
playBtn.textContent = "\u25B6 Play";
playBtn.setAttribute(
	"style",
	"background: #238636; color: #fff; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px; font-weight: 600;",
);

const stepBtn = document.createElement("button");
stepBtn.textContent = "\u23ED Step";
stepBtn.setAttribute(
	"style",
	"background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;",
);

const randomBtn = document.createElement("button");
randomBtn.textContent = "\u{1F3B2} Random";
randomBtn.setAttribute(
	"style",
	"background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;",
);

const patternsBtn = document.createElement("button");
patternsBtn.textContent = "\u{1F9EC} Gliders + R-pentomino";
patternsBtn.setAttribute(
	"style",
	"background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;",
);

const clearBtn = document.createElement("button");
clearBtn.textContent = "\u{1F5D1} Clear";
clearBtn.setAttribute(
	"style",
	"background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;",
);

const speedUpBtn = document.createElement("button");
speedUpBtn.textContent = "+";
speedUpBtn.setAttribute(
	"style",
	"background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 13px; margin-left: auto;",
);

const speedLabel = document.createElement("span");
speedLabel.setAttribute("style", "color: #8b949e; font-size: 12px; min-width: 75px; text-align: center;");
speedLabel.textContent = `${speed}ms/gen`;

const speedDownBtn = document.createElement("button");
speedDownBtn.textContent = "\u2212";
speedDownBtn.setAttribute(
	"style",
	"background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 13px;",
);

controls.appendChild(playBtn);
controls.appendChild(stepBtn);
controls.appendChild(randomBtn);
controls.appendChild(patternsBtn);
controls.appendChild(clearBtn);
controls.appendChild(speedDownBtn);
controls.appendChild(speedLabel);
controls.appendChild(speedUpBtn);
document.body.appendChild(controls);

// Stats bar
const statsBar = document.createElement("div");
statsBar.setAttribute(
	"style",
	"display: flex; justify-content: space-between; padding: 6px 16px; background: #0d1117; border-bottom: 1px solid #21262d; font-size: 12px; color: #8b949e;",
);

const genDisplay = document.createElement("span");
genDisplay.textContent = "Generation: 0";

const aliveDisplay = document.createElement("span");
aliveDisplay.textContent = "Alive: 0";

const gridSizeDisplay = document.createElement("span");
gridSizeDisplay.textContent = `Grid: ${COLS}\u00D7${ROWS} (${CELL_COUNT} cells)`;

statsBar.appendChild(genDisplay);
statsBar.appendChild(aliveDisplay);
statsBar.appendChild(gridSizeDisplay);
document.body.appendChild(statsBar);

// Grid
const gridEl = document.createElement("div");
gridEl.setAttribute(
	"style",
	`display: grid; grid-template-columns: repeat(${COLS}, 1fr); line-height: 0; cursor: pointer; padding: 4px;`,
);
document.body.appendChild(gridEl);

const cells: Array<ReturnType<typeof document.createElement>> = [];
for (let i = 0; i < CELL_COUNT; i++) {
	const cell = document.createElement("div");
	cell.setAttribute(
		"style",
		"aspect-ratio: 1; background: #0d1117; border: 1px solid #161b22;",
	);
	cell.addEventListener("click", () => {
		aliveCount += grid[i] ? -1 : 1;
		grid[i] = grid[i] ? 0 : 1;
		renderCell(i);
		updateStats();
	});
	cells.push(cell);
	gridEl.appendChild(cell);
}

// --- Rendering (dirty-cell tracking: only update changed cells) ---
function renderCell(i: number) {
	cells[i].style["background"] = grid[i] ? "#39d353" : "#0d1117";
}

function renderFullGrid() {
	for (let i = 0; i < CELL_COUNT; i++) renderCell(i);
}

function renderDirtyGrid() {
	for (let i = 0; i < CELL_COUNT; i++) {
		if (grid[i] !== nextGrid[i]) {
			renderCell(i);
		}
	}
}

function updateStats() {
	genDisplay.textContent = `Generation: ${generation}`;
	aliveDisplay.textContent = `Alive: ${aliveCount} / ${CELL_COUNT}`;
}

// --- Simulation controls ---
function startSimulation() {
	if (running) return;
	running = true;
	playBtn.textContent = "\u23F8 Pause";
	playBtn.style["background"] = "#da3633";
	tick();
}

function stopSimulation() {
	running = false;
	playBtn.textContent = "\u25B6 Play";
	playBtn.style["background"] = "#238636";
	if (timerId !== null) {
		clearTimeout(timerId);
		timerId = null;
	}
}

function tick() {
	if (!running) return;
	step();
	// nextGrid now holds the old state after swap — diff against it
	renderDirtyGrid();
	updateStats();
	timerId = setTimeout(tick, speed);
}

playBtn.addEventListener("click", () => {
	running ? stopSimulation() : startSimulation();
});

stepBtn.addEventListener("click", () => {
	stopSimulation();
	step();
	renderDirtyGrid();
	updateStats();
});

randomBtn.addEventListener("click", () => {
	stopSimulation();
	randomize();
});

patternsBtn.addEventListener("click", () => {
	stopSimulation();
	seedPatterns();
});

clearBtn.addEventListener("click", () => {
	stopSimulation();
	grid.fill(0);
	generation = 0;
	aliveCount = 0;
	renderFullGrid();
	updateStats();
});

speedUpBtn.addEventListener("click", () => {
	speed = Math.max(16, speed - 50);
	speedLabel.textContent = `${speed}ms/gen`;
	if (running && timerId !== null) {
		clearTimeout(timerId);
		timerId = setTimeout(tick, speed);
	}
});

speedDownBtn.addEventListener("click", () => {
	speed = Math.min(1000, speed + 50);
	speedLabel.textContent = `${speed}ms/gen`;
	if (running && timerId !== null) {
		clearTimeout(timerId);
		timerId = setTimeout(tick, speed);
	}
});

// Initialize
seedPatterns();
