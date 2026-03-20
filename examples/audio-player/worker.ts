import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

// --- Layout ---
const container = document.createElement("div");
container.setAttribute(
	"style",
	"font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #1a1a2e; color: #eee; min-height: 100vh; display: flex; flex-direction: column; align-items: center;",
);

const card = document.createElement("div");
card.setAttribute(
	"style",
	"background: #16213e; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4);",
);

const title = document.createElement("h2");
title.setAttribute("style", "margin: 0 0 4px; font-size: 20px; color: #e94560;");
title.textContent = "Worker Audio Player";

const subtitle = document.createElement("p");
subtitle.setAttribute("style", "margin: 0 0 20px; font-size: 13px; color: #8b8fa3;");
subtitle.textContent = "Audio controlled entirely from a Web Worker via callMethod";

card.appendChild(title);
card.appendChild(subtitle);

// --- Audio element ---
const audio = document.createElement("audio");
audio.setAttribute(
	"src",
	"https://upload.wikimedia.org/wikipedia/commons/4/42/Bird_singing.ogg",
);
audio.setAttribute("preload", "metadata");
card.appendChild(audio);

// --- Progress bar ---
const progressTrack = document.createElement("div");
progressTrack.setAttribute(
	"style",
	"background: #0f3460; border-radius: 4px; height: 6px; width: 100%; margin-bottom: 16px; overflow: hidden; cursor: pointer;",
);

const progressFill = document.createElement("div");
progressFill.setAttribute(
	"style",
	"background: #e94560; height: 100%; width: 0%; border-radius: 4px; transition: width 0.25s linear;",
);
progressTrack.appendChild(progressFill);
card.appendChild(progressTrack);

// --- Time display ---
const timeRow = document.createElement("div");
timeRow.setAttribute(
	"style",
	"display: flex; justify-content: space-between; font-family: monospace; font-size: 13px; color: #8b8fa3; margin-bottom: 20px;",
);

const timeCurrent = document.createElement("span");
timeCurrent.textContent = "0:00";

const timeDuration = document.createElement("span");
timeDuration.textContent = "0:00";

timeRow.appendChild(timeCurrent);
timeRow.appendChild(timeDuration);
card.appendChild(timeRow);

// --- Control buttons ---
const controls = document.createElement("div");
controls.setAttribute(
	"style",
	"display: flex; gap: 12px; align-items: center; justify-content: center; margin-bottom: 16px;",
);

function createButton(label: string, extraStyle = ""): ReturnType<typeof document.createElement> {
	const btn = document.createElement("button");
	btn.textContent = label;
	btn.setAttribute(
		"style",
		`padding: 10px 22px; font-size: 15px; cursor: pointer; background: #0f3460; color: #eee; border: 1px solid #1a1a4e; border-radius: 8px; ${extraStyle}`,
	);
	return btn;
}

const playBtn = createButton("Play", "background: #e94560; border-color: #e94560; min-width: 100px;");
const stopBtn = createButton("Stop");

controls.appendChild(playBtn);
controls.appendChild(stopBtn);
card.appendChild(controls);

// --- Status ---
const status = document.createElement("div");
status.setAttribute("style", "text-align: center; color: #8b8fa3; font-size: 12px;");
status.textContent = "Ready";
card.appendChild(status);

container.appendChild(card);

// --- Footer note ---
const footer = document.createElement("p");
footer.setAttribute("style", "margin-top: 24px; font-size: 12px; color: #555; text-align: center;");
footer.textContent = "play() / pause() / load() are sent as callMethod mutations from the worker thread";
container.appendChild(footer);

document.body.appendChild(container);

// --- State & helpers ---
let isPlaying = false;

function formatTime(seconds: number): string {
	const s = Math.floor(seconds);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// --- Event handlers ---

playBtn.addEventListener("click", () => {
	if (isPlaying) {
		audio.pause();
		playBtn.textContent = "Play";
		status.textContent = "Paused";
	} else {
		audio.play();
		playBtn.textContent = "Pause";
		status.textContent = "Playing...";
	}
	isPlaying = !isPlaying;
});

stopBtn.addEventListener("click", () => {
	audio.pause();
	audio.currentTime = 0;
	isPlaying = false;
	playBtn.textContent = "Play";
	progressFill.style.width = "0%";
	timeCurrent.textContent = "0:00";
	status.textContent = "Stopped";
});

audio.addEventListener("timeupdate", () => {
	const cur = audio.currentTime;
	const dur = audio.duration || 0;
	timeCurrent.textContent = formatTime(cur);
	if (dur > 0) {
		const pct = Math.min((cur / dur) * 100, 100);
		progressFill.style.width = `${pct.toFixed(1)}%`;
	}
});

audio.addEventListener("loadedmetadata", () => {
	timeDuration.textContent = formatTime(audio.duration);
	status.textContent = "Ready";
});

audio.addEventListener("ended", () => {
	isPlaying = false;
	playBtn.textContent = "Play";
	progressFill.style.width = "0%";
	timeCurrent.textContent = "0:00";
	status.textContent = "Ended";
});

audio.addEventListener("play", () => {
	status.textContent = "Playing...";
});

audio.addEventListener("pause", () => {
	if (isPlaying) return; // user already updated state
	status.textContent = "Paused";
});
