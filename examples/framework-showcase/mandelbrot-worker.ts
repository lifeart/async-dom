import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

const WIDTH = 50;
const HEIGHT = 40;
const MAX_ITER = 120;

let centerX = -0.5;
let centerY = 0;
let zoom = 1;

function iterToColor(iter: number, maxIter: number): string {
	if (iter >= maxIter) return "#000";
	const t = iter / maxIter;
	const hue = (240 + 360 * t) % 360;
	const lum = 10 + 40 * Math.sqrt(t);
	return `hsl(${hue | 0},80%,${lum | 0}%)`;
}

function mandelbrot(cx: number, cy: number): number {
	let x = 0;
	let y = 0;
	let iter = 0;
	while (x * x + y * y <= 4 && iter < MAX_ITER) {
		const t = x * x - y * y + cx;
		y = 2 * x * y + cy;
		x = t;
		iter++;
	}
	if (iter < MAX_ITER) {
		const zn = x * x + y * y;
		if (zn > 1) {
			const nu = Math.log(Math.log(zn) / 2 / Math.log(2)) / Math.log(2);
			iter = iter + 1 - nu;
		}
	}
	return iter;
}

document.body.setAttribute("style", "margin:0;padding:0;background:#000;user-select:none;");

// Mini header
const hdr = document.createElement("div");
hdr.setAttribute(
	"style",
	"padding:6px 10px;background:#161b22;border-bottom:1px solid #30363d;font:12px system-ui;color:#8b949e;display:flex;justify-content:space-between;",
);
const coords = document.createElement("span");
const resetBtn = document.createElement("button");
resetBtn.textContent = "Reset";
resetBtn.setAttribute(
	"style",
	"background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;",
);
resetBtn.addEventListener("click", () => {
	centerX = -0.5;
	centerY = 0;
	zoom = 1;
	render();
});
hdr.appendChild(coords);
hdr.appendChild(resetBtn);
document.body.appendChild(hdr);

const grid = document.createElement("div");
grid.setAttribute(
	"style",
	`display:grid;grid-template-columns:repeat(${WIDTH},1fr);line-height:0;cursor:crosshair;`,
);
document.body.appendChild(grid);

const cells: Array<ReturnType<typeof document.createElement>> = [];
for (let i = 0; i < WIDTH * HEIGHT; i++) {
	const c = document.createElement("div");
	c.setAttribute("style", "aspect-ratio:1;background:#000;");
	const row = Math.floor(i / WIDTH);
	const col = i % WIDTH;
	c.addEventListener("click", () => {
		const s = 3 / zoom;
		centerX += (col / WIDTH - 0.5) * s;
		centerY += (row / HEIGHT - 0.5) * s * (HEIGHT / WIDTH);
		zoom *= 2.5;
		render();
	});
	cells.push(c);
	grid.appendChild(c);
}

function render() {
	const s = 3 / zoom;
	for (let r = 0; r < HEIGHT; r++) {
		for (let c = 0; c < WIDTH; c++) {
			const cx = centerX + (c / WIDTH - 0.5) * s;
			const cy = centerY + (r / HEIGHT - 0.5) * s * (HEIGHT / WIDTH);
			cells[r * WIDTH + c].style["background"] = iterToColor(mandelbrot(cx, cy), MAX_ITER);
		}
	}
	coords.textContent = `(${centerX.toFixed(4)}, ${centerY.toFixed(4)}) ${zoom.toFixed(0)}x`;
}

render();
