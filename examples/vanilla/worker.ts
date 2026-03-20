import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

const NODE_COUNT = 7000;
const COLOR_UPDATE_INTERVAL = 45000;

let score = 0;

function getRandomColor(): string {
	const letters = "0123456789ABCDEF";
	let color = "#";
	for (let i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}
	return color;
}

function updateScoreDisplay(): void {
	const el = document.getElementById("score-board");
	if (el) {
		el.textContent = `Score: ${score}`;
	}
}

// Create colored grid
document.body.setAttribute(
	"style",
	"font-family: system-ui; background-color: #1a1a1a;",
);

for (let i = 0; i < NODE_COUNT; i++) {
	const node = document.createElement("div");
	node.setAttribute("id", `node-${i}`);

	node.setAttribute(
		"style",
		`cursor:pointer;display:inline-block;margin:1px;width:10px;height:10px;transition:background-color 0.5s ease;background-color:${getRandomColor()};`,
	);

	document.body.appendChild(node);

	// Click handler
	node.addEventListener("click", () => {
		const color = node.style["background-color"];
		if (color === "black") {
			score += 10;
		} else if (color === "white") {
			score += 5;
		} else {
			score -= 2;
		}
		updateScoreDisplay();
		node.remove();
	});

	// Mouse enter — turn white
	node.addEventListener("mouseenter", () => {
		node.style["background-color"] = "white";
	});

	// Mouse leave — random color after delay
	node.addEventListener("mouseleave", () => {
		setTimeout(() => {
			node.style["background-color"] = getRandomColor();
		}, 2500);
	});

	// Schedule periodic color updates
	if (i % 10 === 0) {
		scheduleColorUpdate(node);
	}
}

function scheduleColorUpdate(node: { style: Record<string, string> }): void {
	setTimeout(() => {
		node.style["background-color"] =
			Math.random() > 0.5 ? "black" : getRandomColor();
		scheduleColorUpdate(node);
	}, COLOR_UPDATE_INTERVAL * Math.abs(Math.sin(Date.now())));
}
