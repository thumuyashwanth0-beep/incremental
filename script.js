"use strict";

/* ------------------------------------------------------------------ *
 *  Config
 * ------------------------------------------------------------------ */
const GRID = 16;
const CELL = 384 / GRID;
const INPUT_SIZE = 11;
const OUTPUT_SIZE = 3; // [turn left, go straight, turn right]
const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]; // up, right, down, left
const STORAGE_KEY = "neuroSnakeBest";

const rand = (n) => Math.floor(Math.random() * n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 *  Matrix / vector helpers — y = W·x + b, elementwise activation
 * ------------------------------------------------------------------ */
class Matrix {
  constructor(rows, cols, data) {
    this.rows = rows;
    this.cols = cols;
    this.data = data || new Float64Array(rows * cols);
  }

  static random(rows, cols) {
    const m = new Matrix(rows, cols);
    for (let idx = 0; idx < m.data.length; idx++) m.data[idx] = Math.random() * 2 - 1;
    return m;
  }

  get(r, c) { return this.data[r * this.cols + c]; }
  set(r, c, v) { this.data[r * this.cols + c] = v; }
  copy() { return new Matrix(this.rows, this.cols, Float64Array.from(this.data)); }

  // W·x — one dot product (row · x) per output component
  multiplyVector(x) {
    const y = new Float64Array(this.rows);
    for (let r = 0; r < this.rows; r++) {
      let sum = 0;
      for (let c = 0; c < this.cols; c++) sum += this.get(r, c) * x[c];
      y[r] = sum;
    }
    return y;
  }
}

const addVec = (a, b) => a.map((v, idx) => v + b[idx]);
const tanhVec = (a) => a.map((v) => Math.tanh(v));

/* ------------------------------------------------------------------ *
 *  Neural network
 *    h = tanh(W1·x + b1)
 *    y = tanh(W2·h + b2)
 *  W1, b1, W2, b2 are the evolvable parameters (the "genome").
 * ------------------------------------------------------------------ */
class NeuralNetwork {
  constructor(inputSize, hiddenSize, outputSize, genome) {
    this.i = inputSize;
    this.h = hiddenSize;
    this.o = outputSize;
    if (genome) {
      this.setGenome(genome);
    } else {
      this.W1 = Matrix.random(hiddenSize, inputSize); // h × i
      this.b1 = Matrix.random(hiddenSize, 1).data;     // h
      this.W2 = Matrix.random(outputSize, hiddenSize); // o × h
      this.b2 = Matrix.random(outputSize, 1).data;      // o
    }
  }

  feedForward(x) {
    const hidden = tanhVec(addVec(this.W1.multiplyVector(x), this.b1));
    const out = tanhVec(addVec(this.W2.multiplyVector(hidden), this.b2));
    return { hidden, out };
  }

  copy() {
    return new NeuralNetwork(this.i, this.h, this.o, this.getGenome());
  }

  mutate(rate, amount) {
    const mutateArray = (arr) => {
      for (let idx = 0; idx < arr.length; idx++) {
        if (Math.random() < rate) {
          arr[idx] = clamp(arr[idx] + (Math.random() * 2 - 1) * amount, -4, 4);
        }
      }
    };
    mutateArray(this.W1.data);
    mutateArray(this.b1);
    mutateArray(this.W2.data);
    mutateArray(this.b2);
  }

  // Flatten W1, b1, W2, b2 into one array — only used for crossover and JSON export/import.
  getGenome() {
    return Float64Array.of(...this.W1.data, ...this.b1, ...this.W2.data, ...this.b2);
  }

  setGenome(genome) {
    const g = Float64Array.from(genome);
    let off = 0;
    this.W1 = new Matrix(this.h, this.i, g.slice(off, (off += this.h * this.i)));
    this.b1 = g.slice(off, (off += this.h));
    this.W2 = new Matrix(this.o, this.h, g.slice(off, (off += this.o * this.h)));
    this.b2 = g.slice(off, (off += this.o));
  }
}

function crossover(brainA, brainB) {
  const genomeA = brainA.getGenome();
  const genomeB = brainB.getGenome();
  const child = new Float64Array(genomeA.length);
  for (let idx = 0; idx < child.length; idx++) {
    child[idx] = Math.random() < 0.5 ? genomeA[idx] : genomeB[idx];
  }
  return new NeuralNetwork(brainA.i, brainA.h, brainA.o, child);
}

/* ------------------------------------------------------------------ *
 *  Snake — self-contained game state, driven by a NeuralNetwork brain
 * ------------------------------------------------------------------ */
class Snake {
  constructor(brain) {
    this.brain = brain;
    this.reset();
  }

  reset() {
    const cx = Math.floor(GRID / 2), cy = Math.floor(GRID / 2);
    this.body = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    this.dir = { x: 1, y: 0 };
    this.alive = true;
    this.score = 0;
    this.steps = 0;
    this.stepsSinceFood = 0;
    this.fitness = 0;
    this.lastHidden = null;
    this.lastOut = null;
    this.lastInputs = null;
    this.placeFood();
  }

  placeFood() {
    let pos;
    let tries = 0;
    do {
      pos = { x: rand(GRID), y: rand(GRID) };
      tries++;
    } while (this.body.some((b) => b.x === pos.x && b.y === pos.y) && tries < 500);
    this.food = pos;
  }

  dirIndex() {
    return DIRS.findIndex((d) => d.x === this.dir.x && d.y === this.dir.y);
  }

  getInputs() {
    const head = this.body[0];
    const di = this.dirIndex();
    const straight = DIRS[di];
    const right = DIRS[(di + 1) % 4];
    const left = DIRS[(di + 3) % 4];

    const danger = (d) => {
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return 1;
      if (this.body.some((b) => b.x === nx && b.y === ny)) return 1;
      return 0;
    };

    return [
      danger(straight), danger(right), danger(left),
      this.dir.y === -1 ? 1 : 0, this.dir.y === 1 ? 1 : 0,
      this.dir.x === -1 ? 1 : 0, this.dir.x === 1 ? 1 : 0,
      this.food.y < head.y ? 1 : 0, this.food.y > head.y ? 1 : 0,
      this.food.x < head.x ? 1 : 0, this.food.x > head.x ? 1 : 0,
    ];
  }

  computeFitness() {
    return this.steps + this.score * this.score * 500;
  }

  step() {
    if (!this.alive) return;
    const inputs = this.getInputs();
    const { hidden, out } = this.brain.feedForward(inputs);
    this.lastInputs = inputs;
    this.lastHidden = hidden;
    this.lastOut = out;

    let choice = 0;
    for (let k = 1; k < out.length; k++) if (out[k] > out[choice]) choice = k;

    const di = this.dirIndex();
    if (choice === 0) this.dir = DIRS[(di + 3) % 4];
    else if (choice === 2) this.dir = DIRS[(di + 1) % 4];

    const head = this.body[0];
    const nx = head.x + this.dir.x, ny = head.y + this.dir.y;
    this.steps++;
    this.stepsSinceFood++;

    const hitWall = nx < 0 || ny < 0 || nx >= GRID || ny >= GRID;
    const hitSelf = !hitWall && this.body.some((b) => b.x === nx && b.y === ny);
    if (hitWall || hitSelf) {
      this.alive = false;
      this.fitness = this.computeFitness();
      return;
    }

    this.body.unshift({ x: nx, y: ny });
    if (nx === this.food.x && ny === this.food.y) {
      this.score++;
      this.stepsSinceFood = 0;
      this.placeFood();
    } else {
      this.body.pop();
    }

    const maxIdle = 100 + this.score * 40;
    if (this.stepsSinceFood > maxIdle || this.steps > 6000) {
      this.alive = false;
      this.fitness = this.computeFitness();
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Genetic algorithm
 * ------------------------------------------------------------------ */
function tournamentSelect(scored, k = 5) {
  let best = null;
  for (let i = 0; i < k; i++) {
    const cand = scored[rand(scored.length)];
    if (!best || cand.fitness > best.fitness) best = cand;
  }
  return best.brain;
}

function evolvePopulation(population, mutationRate, mutationAmount) {
  const scored = population.map((s) => ({ brain: s.brain, fitness: s.fitness || s.computeFitness() }));
  scored.sort((a, b) => b.fitness - a.fitness);

  const nextBrains = [];
  const eliteCount = Math.max(2, Math.round(population.length * 0.06));
  for (let i = 0; i < eliteCount && i < scored.length; i++) {
    nextBrains.push(scored[i].brain.copy());
  }
  while (nextBrains.length < population.length) {
    const parentA = tournamentSelect(scored);
    const parentB = tournamentSelect(scored);
    const child = crossover(parentA, parentB);
    child.mutate(mutationRate, mutationAmount);
    nextBrains.push(child);
  }
  return nextBrains.map((b) => new Snake(b));
}

/* ------------------------------------------------------------------ *
 *  Global state
 * ------------------------------------------------------------------ */
let population = [];
let generation = 0;
let bestHistory = [];
let avgHistory = [];
let bestEverScore = 0;
let bestEverBrainData = null; // { hiddenSize, weights }
let running = true;
let turbo = false;
let watchMode = false;
let watchSnake = null;
let tickTimer = null;

let HIDDEN_SIZE = 16;
let POP_SIZE = 120;
let MUT_RATE = 0.06;
let MUT_AMOUNT = 0.25;

/* ------------------------------------------------------------------ *
 *  DOM references
 * ------------------------------------------------------------------ */
const gameCanvas = document.getElementById("gameCanvas");
const gctx = gameCanvas.getContext("2d");
const nnCanvas = document.getElementById("nnCanvas");
const nctx = nnCanvas.getContext("2d");
const chartCanvas = document.getElementById("chartCanvas");
const cctx = chartCanvas.getContext("2d");

const el = {
  leaderScore: document.getElementById("leaderScore"),
  leaderSteps: document.getElementById("leaderSteps"),
  aliveCount: document.getElementById("aliveCount"),
  popCount: document.getElementById("popCount"),
  generation: document.getElementById("generation"),
  bestEver: document.getElementById("bestEver"),
  avgScore: document.getElementById("avgScore"),
  toggleRun: document.getElementById("toggleRun"),
  nextGenBtn: document.getElementById("nextGenBtn"),
  resetBtn: document.getElementById("resetBtn"),
  speedSlider: document.getElementById("speedSlider"),
  speedVal: document.getElementById("speedVal"),
  turboCheck: document.getElementById("turboCheck"),
  popSize: document.getElementById("popSize"),
  hiddenSize: document.getElementById("hiddenSize"),
  mutRate: document.getElementById("mutRate"),
  mutRateVal: document.getElementById("mutRateVal"),
  mutAmt: document.getElementById("mutAmt"),
  mutAmtVal: document.getElementById("mutAmtVal"),
  watchBtn: document.getElementById("watchBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  bestHint: document.getElementById("bestHint"),
};

/* ------------------------------------------------------------------ *
 *  Setup / reset
 * ------------------------------------------------------------------ */
function freshPopulation() {
  const arr = [];
  for (let i = 0; i < POP_SIZE; i++) {
    arr.push(new Snake(new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE)));
  }
  return arr;
}

function resetAll() {
  HIDDEN_SIZE = clamp(parseInt(el.hiddenSize.value, 10) || 16, 4, 32);
  POP_SIZE = clamp(parseInt(el.popSize.value, 10) || 120, 10, 400);
  population = freshPopulation();
  generation = 0;
  bestHistory = [];
  avgHistory = [];
  watchMode = false;
  el.watchBtn.textContent = "Watch best";
  updateStatsDOM();
}

/* ------------------------------------------------------------------ *
 *  Generation lifecycle
 * ------------------------------------------------------------------ */
function finishGeneration() {
  const scores = population.map((s) => s.score);
  const best = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  bestHistory.push(best);
  avgHistory.push(avg);
  if (bestHistory.length > 400) { bestHistory.shift(); avgHistory.shift(); }

  if (best > bestEverScore) {
    bestEverScore = best;
    const idx = scores.indexOf(best);
    bestEverBrainData = { hiddenSize: HIDDEN_SIZE, weights: Array.from(population[idx].brain.getGenome()) };
    saveBestToStorage();
    el.watchBtn.disabled = false;
    el.exportBtn.disabled = false;
    el.bestHint.textContent = `Best score so far: ${bestEverScore} (generation ${generation}). Auto-saved to this browser.`;
  }

  population = evolvePopulation(population, MUT_RATE, MUT_AMOUNT);
  generation++;
  updateStatsDOM();
}

function tickEvolution() {
  let anyAlive = false;
  for (const s of population) {
    if (s.alive) {
      s.step();
      if (s.alive) anyAlive = true;
    }
  }
  if (!anyAlive) finishGeneration();
}

function tickWatch() {
  if (!watchSnake) return;
  if (!watchSnake.alive) {
    watchSnake.reset();
    return;
  }
  watchSnake.step();
}

function tick() {
  if (watchMode) tickWatch();
  else tickEvolution();
}

/* ------------------------------------------------------------------ *
 *  Leader selection + rendering
 * ------------------------------------------------------------------ */
function getLeader() {
  if (watchMode) return watchSnake;
  let leader = null;
  for (const s of population) {
    if (!s.alive) continue;
    if (!leader || s.score > leader.score || (s.score === leader.score && s.steps > leader.steps)) {
      leader = s;
    }
  }
  return leader || population[0];
}

function drawGame(snake) {
  gctx.fillStyle = "#0f1420";
  gctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  gctx.strokeStyle = "rgba(255,255,255,0.03)";
  for (let i = 1; i < GRID; i++) {
    gctx.beginPath(); gctx.moveTo(i * CELL, 0); gctx.lineTo(i * CELL, gameCanvas.height); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(0, i * CELL); gctx.lineTo(gameCanvas.width, i * CELL); gctx.stroke();
  }

  if (!snake) return;

  gctx.fillStyle = "#ff5470";
  gctx.beginPath();
  gctx.arc((snake.food.x + 0.5) * CELL, (snake.food.y + 0.5) * CELL, CELL * 0.35, 0, Math.PI * 2);
  gctx.fill();

  const n = snake.body.length;
  snake.body.forEach((seg, idx) => {
    if (idx === 0) gctx.fillStyle = "#bffff0";
    else {
      const t = 1 - idx / Math.max(1, n);
      gctx.fillStyle = `hsl(160, 75%, ${28 + t * 30}%)`;
    }
    const pad = idx === 0 ? 1 : 2;
    gctx.fillRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
  });
}

function drawNN(snake) {
  nctx.fillStyle = "#0f1420";
  nctx.fillRect(0, 0, nnCanvas.width, nnCanvas.height);
  if (!snake || !snake.lastHidden) return;

  const brain = snake.brain;
  const inputs = snake.lastInputs;
  const hidden = snake.lastHidden;
  const out = snake.lastOut;

  const W = nnCanvas.width, H = nnCanvas.height;
  const pad = 20;
  const xIn = pad, xHid = W / 2, xOut = W - pad;

  const yPos = (idx, count) => {
    if (count === 1) return H / 2;
    return pad + (idx * (H - pad * 2)) / (count - 1);
  };

  const inPositions = inputs.map((_, idx) => ({ x: xIn, y: yPos(idx, inputs.length) }));
  const hidPositions = Array.from(hidden).map((_, idx) => ({ x: xHid, y: yPos(idx, hidden.length) }));
  const outPositions = Array.from(out).map((_, idx) => ({ x: xOut, y: yPos(idx, out.length) }));

  // connections, colored/opacity by weight sign & magnitude
  for (let k = 0; k < inputs.length; k++) {
    for (let j = 0; j < hidden.length; j++) {
      const w = brain.W1.get(j, k);
      const strength = clamp(Math.abs(w) / 2, 0, 1);
      nctx.strokeStyle = w >= 0 ? `rgba(124,255,203,${0.05 + strength * 0.35})` : `rgba(255,107,122,${0.05 + strength * 0.35})`;
      nctx.lineWidth = 1;
      nctx.beginPath();
      nctx.moveTo(inPositions[k].x, inPositions[k].y);
      nctx.lineTo(hidPositions[j].x, hidPositions[j].y);
      nctx.stroke();
    }
  }
  for (let j = 0; j < hidden.length; j++) {
    for (let m = 0; m < out.length; m++) {
      const w = brain.W2.get(m, j);
      const strength = clamp(Math.abs(w) / 2, 0, 1);
      nctx.strokeStyle = w >= 0 ? `rgba(124,255,203,${0.08 + strength * 0.5})` : `rgba(255,107,122,${0.08 + strength * 0.5})`;
      nctx.lineWidth = 1.2;
      nctx.beginPath();
      nctx.moveTo(hidPositions[j].x, hidPositions[j].y);
      nctx.lineTo(outPositions[m].x, outPositions[m].y);
      nctx.stroke();
    }
  }

  const drawNodes = (positions, values) => {
    positions.forEach((p, idx) => {
      const v = values[idx];
      const act = clamp((v + 1) / 2, 0, 1);
      const r = 5;
      nctx.beginPath();
      nctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      nctx.fillStyle = `rgba(${Math.round(255 - act * 130)}, ${Math.round(140 + act * 115)}, ${Math.round(190 + act * 40)}, 1)`;
      nctx.fill();
    });
  };
  drawNodes(inPositions, inputs);
  drawNodes(hidPositions, Array.from(hidden));

  const outLabels = ["↰", "↑", "↱"]; // left, straight, right glyphs
  let choice = 0;
  for (let m = 1; m < out.length; m++) if (out[m] > out[choice]) choice = m;
  outPositions.forEach((p, idx) => {
    nctx.beginPath();
    nctx.arc(p.x, p.y, idx === choice ? 8 : 5, 0, Math.PI * 2);
    nctx.fillStyle = idx === choice ? "#7cffcb" : "rgba(150,160,190,0.6)";
    nctx.fill();
    nctx.fillStyle = "#0b0e14";
    nctx.font = "bold 9px sans-serif";
    nctx.textAlign = "center";
    nctx.textBaseline = "middle";
    nctx.fillText(outLabels[idx], p.x, p.y);
  });
}

function drawChart() {
  cctx.fillStyle = "#0f1420";
  cctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
  if (bestHistory.length < 2) return;

  const W = chartCanvas.width, H = chartCanvas.height, pad = 8;
  const maxV = Math.max(1, ...bestHistory);

  const plot = (data, color) => {
    cctx.strokeStyle = color;
    cctx.lineWidth = 2;
    cctx.beginPath();
    data.forEach((v, idx) => {
      const x = pad + (idx / (data.length - 1)) * (W - pad * 2);
      const y = H - pad - (v / maxV) * (H - pad * 2);
      if (idx === 0) cctx.moveTo(x, y); else cctx.lineTo(x, y);
    });
    cctx.stroke();
  };
  plot(avgHistory, "rgba(94,161,255,0.7)");
  plot(bestHistory, "#7cffcb");

  cctx.fillStyle = "rgba(255,255,255,0.5)";
  cctx.font = "10px sans-serif";
  cctx.textAlign = "left";
  cctx.fillText(`max ${maxV}`, 6, 12);
}

function updateStatsDOM() {
  const leader = getLeader();
  el.leaderScore.textContent = leader ? leader.score : 0;
  el.leaderSteps.textContent = leader ? leader.steps : 0;
  el.aliveCount.textContent = watchMode ? (watchSnake && watchSnake.alive ? 1 : 0) : population.filter((s) => s.alive).length;
  el.popCount.textContent = watchMode ? 1 : population.length;
  el.generation.textContent = generation;
  el.bestEver.textContent = bestEverScore;
  el.avgScore.textContent = avgHistory.length ? avgHistory[avgHistory.length - 1].toFixed(1) : "0";
}

function render() {
  const leader = getLeader();
  drawGame(leader);
  drawNN(leader);
  drawChart();
  updateStatsDOM();
}

/* ------------------------------------------------------------------ *
 *  Persistence
 * ------------------------------------------------------------------ */
function saveBestToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...bestEverBrainData,
      score: bestEverScore,
      generation,
      savedAt: Date.now(),
    }));
  } catch (e) { /* storage unavailable — ignore */ }
}

function loadBestFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !data.weights || !data.hiddenSize) return;
    bestEverBrainData = { hiddenSize: data.hiddenSize, weights: data.weights };
    bestEverScore = data.score || 0;
    el.watchBtn.disabled = false;
    el.exportBtn.disabled = false;
    el.bestHint.textContent = `Loaded saved brain: score ${data.score} (from a previous session).`;
  } catch (e) { /* corrupt/absent — ignore */ }
}

function exportBest() {
  if (!bestEverBrainData) return;
  const blob = new Blob([JSON.stringify({ ...bestEverBrainData, score: bestEverScore, inputSize: INPUT_SIZE, outputSize: OUTPUT_SIZE })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `snake-brain-score-${bestEverScore}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBest(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.weights || !data.hiddenSize) throw new Error("bad file");
      bestEverBrainData = { hiddenSize: data.hiddenSize, weights: data.weights };
      bestEverScore = data.score || bestEverScore;
      el.watchBtn.disabled = false;
      el.exportBtn.disabled = false;
      el.bestHint.textContent = `Imported brain: score ${bestEverScore}.`;
      saveBestToStorage();
    } catch (e) {
      el.bestHint.textContent = "Could not read that file — expected a JSON brain export.";
    }
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------------ *
 *  Watch mode
 * ------------------------------------------------------------------ */
function toggleWatch() {
  if (!bestEverBrainData) return;
  watchMode = !watchMode;
  if (watchMode) {
    const brain = new NeuralNetwork(INPUT_SIZE, bestEverBrainData.hiddenSize, OUTPUT_SIZE, bestEverBrainData.weights);
    watchSnake = new Snake(brain);
    el.watchBtn.textContent = "Resume evolution";
  } else {
    watchSnake = null;
    el.watchBtn.textContent = "Watch best";
  }
  updateStatsDOM();
}

/* ------------------------------------------------------------------ *
 *  Tick scheduling — logic ticks run on a timer, rendering on rAF
 * ------------------------------------------------------------------ */
function rescheduleTicks() {
  clearInterval(tickTimer);
  if (!running) return;
  if (turbo) {
    tickTimer = setInterval(() => {
      for (let i = 0; i < 40; i++) tick();
    }, 0);
  } else {
    const speed = Number(el.speedSlider.value); // 1..100
    const ticksPerSecond = 2 + speed * 4; // ~6 .. ~402
    const intervalMs = Math.max(1, 1000 / ticksPerSecond);
    tickTimer = setInterval(tick, intervalMs);
  }
}

function renderLoop() {
  render();
  requestAnimationFrame(renderLoop);
}

/* ------------------------------------------------------------------ *
 *  UI wiring
 * ------------------------------------------------------------------ */
el.toggleRun.addEventListener("click", () => {
  running = !running;
  el.toggleRun.textContent = running ? "Pause" : "Resume";
  el.toggleRun.classList.toggle("primary", running);
  rescheduleTicks();
});

el.nextGenBtn.addEventListener("click", () => {
  if (watchMode) return;
  for (const s of population) {
    if (s.alive) { s.alive = false; s.fitness = s.computeFitness(); }
  }
  finishGeneration();
});

el.resetBtn.addEventListener("click", () => {
  if (confirm("Discard the current population and start a fresh generation 0?")) {
    resetAll();
  }
});

el.speedSlider.addEventListener("input", () => {
  el.speedVal.textContent = el.speedSlider.value;
  rescheduleTicks();
});

el.turboCheck.addEventListener("change", () => {
  turbo = el.turboCheck.checked;
  rescheduleTicks();
});

el.mutRate.addEventListener("input", () => {
  MUT_RATE = Number(el.mutRate.value);
  el.mutRateVal.textContent = MUT_RATE.toFixed(2);
});
el.mutAmt.addEventListener("input", () => {
  MUT_AMOUNT = Number(el.mutAmt.value);
  el.mutAmtVal.textContent = MUT_AMOUNT.toFixed(2);
});

el.watchBtn.addEventListener("click", toggleWatch);
el.exportBtn.addEventListener("click", exportBest);
el.importBtn.addEventListener("click", () => el.importFile.click());
el.importFile.addEventListener("change", (e) => {
  if (e.target.files[0]) importBest(e.target.files[0]);
  e.target.value = "";
});

/* ------------------------------------------------------------------ *
 *  Boot
 * ------------------------------------------------------------------ */
loadBestFromStorage();
resetAll();
rescheduleTicks();
requestAnimationFrame(renderLoop);
