import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

// --- Mandelbrot Configuration ---
const WIDTH = 80;
const HEIGHT = 60;
const MAX_ITER = 150;

let centerX = -0.5;
let centerY = 0;
let zoom = 1;

// --- Color Palette (ultra-black for set, smooth gradient outside) ---
function iterToColor(iter: number, maxIter: number): string {
	if (iter >= maxIter) return "#000000";
	const t = iter / maxIter;
	const r = Math.floor(9 * (1 - t) * t * t * t * 255);
	const g = Math.floor(15 * (1 - t) * (1 - t) * t * t * 255);
	const b = Math.floor(8.5 * (1 - t) * (1 - t) * (1 - t) * t * 255);
	return `rgb(${r},${g},${b})`;
}

// --- Mandelbrot with smooth coloring ---
function mandelbrot(cx: number, cy: number): number {
	let x = 0;
	let y = 0;
	let iter = 0;
	while (x * x + y * y <= 4 && iter < MAX_ITER) {
		const xTemp = x * x - y * y + cx;
		y = 2 * x * y + cy;
		x = xTemp;
		iter++;
	}
	if (iter < MAX_ITER) {
		const logZn = Math.log(x * x + y * y) / 2;
		const nu = Math.log(logZn / Math.log(2)) / Math.log(2);
		iter = iter + 1 - nu;
	}
	return iter;
}

// --- Build UI ---
document.body.setAttribute(
	"style",
	"margin: 0; padding: 0; background: #000; user-select: none;",
);

// Header bar
const header = document.createElement("div");
header.setAttribute(
	"style",
	"display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #161b22; border-bottom: 1px solid #30363d; font-family: system-ui; color: #e6edf3; font-size: 13px;",
);

const coordsDisplay = document.createElement("span");
coordsDisplay.textContent = `Center: (${centerX.toFixed(4)}, ${centerY.toFixed(4)}) | Zoom: ${zoom.toFixed(1)}x`;

const resetBtn = document.createElement("button");
resetBtn.textContent = "Reset View";
resetBtn.setAttribute(
	"style",
	"background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 12px;",
);
resetBtn.addEventListener("click", () => {
	centerX = -0.5;
	centerY = 0;
	zoom = 1;
	render();
});

const iterDisplay = document.createElement("span");
iterDisplay.setAttribute("style", "color: #8b949e;");

header.appendChild(coordsDisplay);
header.appendChild(iterDisplay);
header.appendChild(resetBtn);
document.body.appendChild(header);

// Zoom presets bar
const presetsBar = document.createElement("div");
presetsBar.setAttribute(
	"style",
	"display: flex; gap: 6px; padding: 8px 16px; background: #0d1117; border-bottom: 1px solid #21262d; font-size: 12px;",
);

const presets = [
	{ label: "Full View", x: -0.5, y: 0, z: 1 },
	{ label: "Seahorse Valley", x: -0.745, y: 0.186, z: 80 },
	{ label: "Elephant Valley", x: 0.282, y: 0.007, z: 50 },
	{ label: "Lightning", x: -1.315, y: 0.073, z: 40 },
	{ label: "Spiral", x: -0.0452, y: 0.9868, z: 100 },
];

for (const preset of presets) {
	const btn = document.createElement("button");
	btn.textContent = preset.label;
	btn.setAttribute(
		"style",
		"background: #161b22; color: #8b949e; border: 1px solid #30363d; border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 11px;",
	);
	btn.addEventListener("click", () => {
		centerX = preset.x;
		centerY = preset.y;
		zoom = preset.z;
		render();
	});
	presetsBar.appendChild(btn);
}
document.body.appendChild(presetsBar);

// Grid container
const grid = document.createElement("div");
grid.setAttribute(
	"style",
	`display: grid; grid-template-columns: repeat(${WIDTH}, 1fr); line-height: 0; cursor: crosshair;`,
);
document.body.appendChild(grid);

// Create cells
const cells: Array<ReturnType<typeof document.createElement>> = [];
for (let i = 0; i < WIDTH * HEIGHT; i++) {
	const cell = document.createElement("div");
	cell.setAttribute("style", "aspect-ratio: 1; background: #000;");

	const row = Math.floor(i / WIDTH);
	const col = i % WIDTH;
	cell.addEventListener("click", () => {
		const scale = 3 / zoom;
		centerX = centerX + (col / WIDTH - 0.5) * scale;
		centerY = centerY + (row / HEIGHT - 0.5) * scale * (HEIGHT / WIDTH);
		zoom *= 2.5;
		render();
	});

	cells.push(cell);
	grid.appendChild(cell);
}

// --- Render ---
function render() {
	const startTime = performance.now();
	const scale = 3 / zoom;

	for (let row = 0; row < HEIGHT; row++) {
		for (let col = 0; col < WIDTH; col++) {
			const cx = centerX + (col / WIDTH - 0.5) * scale;
			const cy = centerY + (row / HEIGHT - 0.5) * scale * (HEIGHT / WIDTH);
			const iter = mandelbrot(cx, cy);
			const color = iterToColor(iter, MAX_ITER);
			cells[row * WIDTH + col].style["background"] = color;
		}
	}

	const elapsed = performance.now() - startTime;
	coordsDisplay.textContent = `Center: (${centerX.toFixed(6)}, ${centerY.toFixed(6)}) | Zoom: ${zoom.toFixed(1)}x`;
	iterDisplay.textContent = `${(WIDTH * HEIGHT).toLocaleString()} pixels in ${elapsed.toFixed(1)}ms`;
}

render();
