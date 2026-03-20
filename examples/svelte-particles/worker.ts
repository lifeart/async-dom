import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

// --- Particle Life Configuration ---
const GRID_SIZE = 60;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const NUM_SPECIES = 6;
const NUM_PARTICLES = 320;
const WORLD_SIZE = 60; // continuous space size matching grid

// Particle state arrays (SoA for performance)
const px = new Float32Array(NUM_PARTICLES);
const py = new Float32Array(NUM_PARTICLES);
const vx = new Float32Array(NUM_PARTICLES);
const vy = new Float32Array(NUM_PARTICLES);
const species = new Uint8Array(NUM_PARTICLES);

// Attraction matrix: species[i] attraction to species[j]
// Positive = attract, negative = repel
let attractionMatrix = new Float32Array(NUM_SPECIES * NUM_SPECIES);

// Simulation parameters
let running = false;
let speed = 50; // ms per tick
let timerId: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
const friction = 0.05;
const forceRange = 12;
const forceFactor = 0.8;

// Grid accumulator for rendering
const gridR = new Float32Array(CELL_COUNT);
const gridG = new Float32Array(CELL_COUNT);
const gridB = new Float32Array(CELL_COUNT);
const gridCount = new Float32Array(CELL_COUNT);

// Species colors (HSL hues)
const speciesColors = [
  { r: 255, g: 60, b: 60 },   // Red
  { r: 60, g: 220, b: 60 },   // Green
  { r: 60, g: 120, b: 255 },  // Blue
  { r: 255, g: 200, b: 40 },  // Yellow
  { r: 200, g: 60, b: 255 },  // Purple
  { r: 60, g: 230, b: 220 },  // Cyan
];

// --- Random attraction matrix with interesting dynamics ---
function randomizeAttraction() {
  for (let i = 0; i < NUM_SPECIES; i++) {
    for (let j = 0; j < NUM_SPECIES; j++) {
      // Range from -1 to 1, biased slightly toward attraction for more clustering
      attractionMatrix[i * NUM_SPECIES + j] = (Math.random() * 2 - 0.8) * 0.8;
    }
  }
}

// --- Preset: Symmetric attraction pattern (creates balanced orbits) ---
function presetSymmetric() {
  attractionMatrix.fill(0);
  for (let i = 0; i < NUM_SPECIES; i++) {
    for (let j = 0; j < NUM_SPECIES; j++) {
      if (i === j) {
        attractionMatrix[i * NUM_SPECIES + j] = -0.2; // mild self-repulsion
      } else if ((j - i + NUM_SPECIES) % NUM_SPECIES === 1) {
        attractionMatrix[i * NUM_SPECIES + j] = 0.8; // attract next species
      } else if ((i - j + NUM_SPECIES) % NUM_SPECIES === 1) {
        attractionMatrix[i * NUM_SPECIES + j] = -0.5; // repel previous species
      } else {
        attractionMatrix[i * NUM_SPECIES + j] = 0.1;
      }
    }
  }
}

// --- Preset: Chains (species form chains chasing each other) ---
function presetChains() {
  attractionMatrix.fill(0);
  for (let i = 0; i < NUM_SPECIES; i++) {
    attractionMatrix[i * NUM_SPECIES + i] = 0.3; // self-attract (cluster)
    const next = (i + 1) % NUM_SPECIES;
    attractionMatrix[i * NUM_SPECIES + next] = 1.0; // strongly chase next
    const prev = (i - 1 + NUM_SPECIES) % NUM_SPECIES;
    attractionMatrix[i * NUM_SPECIES + prev] = -0.6; // flee from prev
  }
}

// --- Initialize particles ---
function initParticles() {
  for (let i = 0; i < NUM_PARTICLES; i++) {
    px[i] = Math.random() * WORLD_SIZE;
    py[i] = Math.random() * WORLD_SIZE;
    vx[i] = 0;
    vy[i] = 0;
    species[i] = Math.floor(Math.random() * NUM_SPECIES);
  }
  generation = 0;
}

// --- Physics step ---
function stepSimulation() {
  for (let i = 0; i < NUM_PARTICLES; i++) {
    let fx = 0;
    let fy = 0;
    const si = species[i];

    for (let j = 0; j < NUM_PARTICLES; j++) {
      if (i === j) continue;

      let dx = px[j] - px[i];
      let dy = py[j] - py[i];

      // Wrap around (toroidal world)
      if (dx > WORLD_SIZE / 2) dx -= WORLD_SIZE;
      if (dx < -WORLD_SIZE / 2) dx += WORLD_SIZE;
      if (dy > WORLD_SIZE / 2) dy -= WORLD_SIZE;
      if (dy < -WORLD_SIZE / 2) dy += WORLD_SIZE;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5 || dist > forceRange) continue;

      const sj = species[j];
      const attraction = attractionMatrix[si * NUM_SPECIES + sj];

      // Force profile: repulsion at very close range, then attraction/repulsion
      let force: number;
      const minDist = 2.0;
      if (dist < minDist) {
        // Universal short-range repulsion to prevent collapse
        force = (dist / minDist - 1) * 5;
      } else {
        // Attraction/repulsion based on matrix
        const normalizedDist = (dist - minDist) / (forceRange - minDist);
        // Bell-curve force profile peaking at midrange
        force = attraction * (1 - Math.abs(2 * normalizedDist - 1));
      }

      fx += (dx / dist) * force * forceFactor;
      fy += (dy / dist) * force * forceFactor;
    }

    vx[i] = (vx[i] + fx * 0.005) * (1 - friction);
    vy[i] = (vy[i] + fy * 0.005) * (1 - friction);
  }

  // Update positions
  for (let i = 0; i < NUM_PARTICLES; i++) {
    px[i] = (px[i] + vx[i] + WORLD_SIZE) % WORLD_SIZE;
    py[i] = (py[i] + vy[i] + WORLD_SIZE) % WORLD_SIZE;
  }

  generation++;
}

// --- Rasterize particles to grid ---
function rasterize() {
  gridR.fill(0);
  gridG.fill(0);
  gridB.fill(0);
  gridCount.fill(0);

  for (let i = 0; i < NUM_PARTICLES; i++) {
    const gx = Math.floor((px[i] / WORLD_SIZE) * GRID_SIZE) % GRID_SIZE;
    const gy = Math.floor((py[i] / WORLD_SIZE) * GRID_SIZE) % GRID_SIZE;
    const idx = gy * GRID_SIZE + gx;
    const col = speciesColors[species[i]];

    // Accumulate with glow: also affect neighboring cells
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = (gx + dx + GRID_SIZE) % GRID_SIZE;
        const ny = (gy + dy + GRID_SIZE) % GRID_SIZE;
        const nIdx = ny * GRID_SIZE + nx;
        const weight = (dx === 0 && dy === 0) ? 1.0 : 0.25;
        gridR[nIdx] += col.r * weight;
        gridG[nIdx] += col.g * weight;
        gridB[nIdx] += col.b * weight;
        gridCount[nIdx] += weight;
      }
    }
  }
}

function cellColor(idx: number): string {
  if (gridCount[idx] < 0.01) return "#0a0e14";
  const intensity = Math.min(gridCount[idx] / 2.5, 1);
  const r = Math.min(255, Math.round((gridR[idx] / gridCount[idx]) * intensity));
  const g = Math.min(255, Math.round((gridG[idx] / gridCount[idx]) * intensity));
  const b = Math.min(255, Math.round((gridB[idx] / gridCount[idx]) * intensity));
  return `rgb(${r},${g},${b})`;
}

// --- Build DOM ---
document.body.setAttribute(
  "style",
  "margin: 0; padding: 0; background: #0a0e14; font-family: system-ui, sans-serif; color: #e6edf3;",
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

const resetBtn = document.createElement("button");
resetBtn.textContent = "\u{1F504} Reset";
resetBtn.setAttribute(
  "style",
  "background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;",
);

const randomRulesBtn = document.createElement("button");
randomRulesBtn.textContent = "\u{1F3B2} Random Rules";
randomRulesBtn.setAttribute(
  "style",
  "background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;",
);

const symmetricBtn = document.createElement("button");
symmetricBtn.textContent = "\u{1F300} Orbits";
symmetricBtn.setAttribute(
  "style",
  "background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;",
);

const chainsBtn = document.createElement("button");
chainsBtn.textContent = "\u{1F517} Chains";
chainsBtn.setAttribute(
  "style",
  "background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;",
);

const speedDownBtn = document.createElement("button");
speedDownBtn.textContent = "\u2212";
speedDownBtn.setAttribute(
  "style",
  "background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 13px; margin-left: auto;",
);

const speedLabel = document.createElement("span");
speedLabel.setAttribute(
  "style",
  "color: #8b949e; font-size: 12px; min-width: 65px; text-align: center;",
);
speedLabel.textContent = `${speed}ms`;

const speedUpBtn = document.createElement("button");
speedUpBtn.textContent = "+";
speedUpBtn.setAttribute(
  "style",
  "background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 13px;",
);

controls.appendChild(playBtn);
controls.appendChild(resetBtn);
controls.appendChild(randomRulesBtn);
controls.appendChild(symmetricBtn);
controls.appendChild(chainsBtn);
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
genDisplay.textContent = "Tick: 0";

const particleDisplay = document.createElement("span");
particleDisplay.textContent = `${NUM_PARTICLES} particles \u00B7 ${NUM_SPECIES} species`;

const gridSizeDisplay = document.createElement("span");
gridSizeDisplay.textContent = `Grid: ${GRID_SIZE}\u00D7${GRID_SIZE} (${CELL_COUNT} cells)`;

statsBar.appendChild(genDisplay);
statsBar.appendChild(particleDisplay);
statsBar.appendChild(gridSizeDisplay);
document.body.appendChild(statsBar);

// Attraction matrix display
const matrixBar = document.createElement("div");
matrixBar.setAttribute(
  "style",
  "display: flex; gap: 3px; padding: 8px 16px; background: #0d1117; border-bottom: 1px solid #21262d; align-items: center; flex-wrap: wrap;",
);

const matrixLabel = document.createElement("span");
matrixLabel.setAttribute("style", "color: #8b949e; font-size: 11px; margin-right: 6px;");
matrixLabel.textContent = "Attraction:";
matrixBar.appendChild(matrixLabel);

// Mini matrix visualization (6x6 colored squares)
const matrixCells: Array<ReturnType<typeof document.createElement>> = [];
for (let i = 0; i < NUM_SPECIES; i++) {
  for (let j = 0; j < NUM_SPECIES; j++) {
    const cell = document.createElement("div");
    cell.setAttribute(
      "style",
      "width: 10px; height: 10px; border-radius: 2px; background: #333;",
    );
    matrixCells.push(cell);
    matrixBar.appendChild(cell);
  }
  if (i < NUM_SPECIES - 1) {
    const spacer = document.createElement("div");
    spacer.setAttribute("style", "width: 3px;");
    matrixBar.appendChild(spacer);
  }
}
document.body.appendChild(matrixBar);

function updateMatrixDisplay() {
  for (let i = 0; i < NUM_SPECIES; i++) {
    for (let j = 0; j < NUM_SPECIES; j++) {
      const val = attractionMatrix[i * NUM_SPECIES + j];
      const cell = matrixCells[i * NUM_SPECIES + j];
      // Green for attraction, red for repulsion, intensity by magnitude
      const mag = Math.min(Math.abs(val), 1);
      if (val > 0) {
        const g = Math.round(100 + 155 * mag);
        cell.style["background"] = `rgb(20,${g},40)`;
      } else {
        const r = Math.round(100 + 155 * mag);
        cell.style["background"] = `rgb(${r},20,30)`;
      }
    }
  }
}

// Grid
const gridEl = document.createElement("div");
gridEl.setAttribute(
  "style",
  `display: grid; grid-template-columns: repeat(${GRID_SIZE}, 1fr); line-height: 0;`,
);
document.body.appendChild(gridEl);

// Create cells
const cells: Array<ReturnType<typeof document.createElement>> = [];
const prevColors: string[] = [];
for (let i = 0; i < CELL_COUNT; i++) {
  const cell = document.createElement("div");
  cell.setAttribute("style", "aspect-ratio: 1; background: #0a0e14;");
  cells.push(cell);
  prevColors.push("#0a0e14");
  gridEl.appendChild(cell);
}

// --- Render ---
function renderGrid() {
  rasterize();
  for (let i = 0; i < CELL_COUNT; i++) {
    const color = cellColor(i);
    if (color !== prevColors[i]) {
      cells[i].style["background"] = color;
      prevColors[i] = color;
    }
  }
}

function updateStats() {
  genDisplay.textContent = `Tick: ${generation}`;
}

// --- Simulation loop ---
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
  stepSimulation();
  renderGrid();
  updateStats();
  timerId = setTimeout(tick, speed);
}

// --- Event handlers ---
playBtn.addEventListener("click", () => {
  running ? stopSimulation() : startSimulation();
});

resetBtn.addEventListener("click", () => {
  stopSimulation();
  initParticles();
  renderGrid();
  updateStats();
});

randomRulesBtn.addEventListener("click", () => {
  stopSimulation();
  randomizeAttraction();
  updateMatrixDisplay();
  initParticles();
  renderGrid();
  updateStats();
});

symmetricBtn.addEventListener("click", () => {
  stopSimulation();
  presetSymmetric();
  updateMatrixDisplay();
  initParticles();
  renderGrid();
  updateStats();
});

chainsBtn.addEventListener("click", () => {
  stopSimulation();
  presetChains();
  updateMatrixDisplay();
  initParticles();
  renderGrid();
  updateStats();
});

speedUpBtn.addEventListener("click", () => {
  speed = Math.max(16, speed - 10);
  speedLabel.textContent = `${speed}ms`;
  if (running && timerId !== null) {
    clearTimeout(timerId);
    timerId = setTimeout(tick, speed);
  }
});

speedDownBtn.addEventListener("click", () => {
  speed = Math.min(500, speed + 10);
  speedLabel.textContent = `${speed}ms`;
  if (running && timerId !== null) {
    clearTimeout(timerId);
    timerId = setTimeout(tick, speed);
  }
});

// --- Initialize ---
randomizeAttraction();
updateMatrixDisplay();
initParticles();
renderGrid();
// Auto-play
startSimulation();
