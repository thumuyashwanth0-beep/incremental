"use strict";

/* ------------------------------------------------------------------ *
 *  Supervised training: generate labeled data, then learn by
 *  backpropagation — an alternative "operation" to the genetic
 *  algorithm in script.js. Loaded after script.js, so it reuses its
 *  globals directly: NeuralNetwork, Matrix, Snake, addVec, tanhVec,
 *  clamp, rand, GRID, DIRS, INPUT_SIZE, OUTPUT_SIZE, HIDDEN_SIZE,
 *  POP_SIZE, MUT_RATE, MUT_AMOUNT, population, el, bestEverBrainData,
 *  bestEverScore, watchMode, watchSnake, running, generation,
 *  bestHistory, avgHistory, saveBestToStorage, toggleWatch,
 *  rescheduleTicks, updateStatsDOM.
 * ------------------------------------------------------------------ */

/* -------------------- 1. Data generation -------------------- */

// A random, connected, self-avoiding snake body + heading + food, used as a
// training state. `dir` is derived from the body itself (head - neck) so it
// is always consistent with how the real game constructs it.
function randomSnakeState() {
  const targetLen = 3 + rand(9); // 3..11 segments
  for (let attempt = 0; attempt < 20; attempt++) {
    const body = [{ x: rand(GRID), y: rand(GRID) }];
    const visited = new Set([body[0].x + "," + body[0].y]);
    let ok = true;
    for (let i = 1; i < targetLen; i++) {
      const last = body[body.length - 1];
      const options = DIRS
        .map((d) => ({ x: last.x + d.x, y: last.y + d.y }))
        .filter((p) => p.x >= 0 && p.y >= 0 && p.x < GRID && p.y < GRID && !visited.has(p.x + "," + p.y));
      if (!options.length) { ok = false; break; }
      const next = options[rand(options.length)];
      body.push(next);
      visited.add(next.x + "," + next.y);
    }
    if (!ok || body.length < 3) continue;

    let food, foodTries = 0;
    do {
      food = { x: rand(GRID), y: rand(GRID) };
      foodTries++;
    } while (visited.has(food.x + "," + food.y) && foodTries < 200);
    if (visited.has(food.x + "," + food.y)) continue;

    const dir = { x: body[0].x - body[1].x, y: body[0].y - body[1].y };
    return { body, dir, food };
  }
  return null;
}

// Breadth-first search for the shortest path from the head to the food,
// treating every body segment as a wall (same simplification the game
// itself uses for collision checks). Returns the sequence of absolute
// direction vectors to walk, or null if food is currently unreachable.
function bfsPathToFood(body, food) {
  const head = body[0];
  const blocked = new Set(body.map((c) => c.x + "," + c.y));
  const startKey = head.x + "," + head.y;
  const visited = new Set([startKey]);
  const cameFrom = new Map(); // key -> { fromKey, dir }
  const queue = [{ x: head.x, y: head.y, key: startKey }];

  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === food.x && cur.y === food.y) {
      const path = [];
      let k = cur.key;
      while (cameFrom.has(k)) {
        const step = cameFrom.get(k);
        path.unshift(step.dir);
        k = step.fromKey;
      }
      return path;
    }
    for (const d of DIRS) {
      const nx = cur.x + d.x, ny = cur.y + d.y;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const key = nx + "," + ny;
      if (visited.has(key) || blocked.has(key)) continue;
      visited.add(key);
      cameFrom.set(key, { fromKey: cur.key, dir: d });
      queue.push({ x: nx, y: ny, key });
    }
  }
  return null;
}

// Convert an absolute direction vector into the relative action encoding
// used by the network's output layer (0 = left, 1 = straight, 2 = right),
// relative to the snake's current heading.
function relativeActionFromDir(currentDir, desiredDir) {
  const curIdx = DIRS.findIndex((d) => d.x === currentDir.x && d.y === currentDir.y);
  const desIdx = DIRS.findIndex((d) => d.x === desiredDir.x && d.y === desiredDir.y);
  const diff = (desIdx - curIdx + 4) % 4;
  if (diff === 3) return 0; // left
  if (diff === 0) return 1; // straight
  if (diff === 1) return 2; // right
  return null; // diff === 2 would mean reversing into its own neck — impossible
}

// When the food is unreachable (walled off by the snake's own body), fall
// back to whichever safe move reduces Manhattan distance to the food.
function greedyFallbackAction(snake) {
  const head = snake.body[0];
  const di = snake.dirIndex();
  const candidates = [
    { action: 0, dir: DIRS[(di + 3) % 4] }, // left
    { action: 1, dir: DIRS[di] },           // straight
    { action: 2, dir: DIRS[(di + 1) % 4] }, // right
  ];
  let best = null;
  for (const c of candidates) {
    const nx = head.x + c.dir.x, ny = head.y + c.dir.y;
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
    if (snake.body.some((b) => b.x === nx && b.y === ny)) continue;
    const dist = Math.abs(nx - snake.food.x) + Math.abs(ny - snake.food.y);
    if (!best || dist < best.dist) best = { action: c.action, dist };
  }
  return best ? best.action : null;
}

// The "expert" whose decisions become training labels: shortest safe path
// to the food, one step at a time (a simple imitation-learning oracle).
function oracleAction(snake) {
  const path = bfsPathToFood(snake.body, snake.food);
  if (path && path.length) {
    const action = relativeActionFromDir(snake.dir, path[0]);
    if (action !== null) return action;
  }
  return greedyFallbackAction(snake);
}

function generateTrainingSample() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = randomSnakeState();
    if (!state) continue;
    const snake = new Snake(new NeuralNetwork(INPUT_SIZE, 1, OUTPUT_SIZE));
    snake.body = state.body;
    snake.dir = state.dir;
    snake.food = state.food;

    const action = oracleAction(snake);
    if (action === null) continue; // trapped with no safe move — not a useful label

    const input = Array.from(snake.getInputs());
    const target = [-1, -1, -1]; // tanh output range
    target[action] = 1;
    return { input, target };
  }
  return null;
}

function generateDataset(n) {
  const data = [];
  while (data.length < n) {
    const sample = generateTrainingSample();
    if (sample) data.push(sample);
  }
  return data;
}

/* -------------------- 2. Backpropagation -------------------- */

function shuffleInPlace(arr) {
  for (let idx = arr.length - 1; idx > 0; idx--) {
    const j = rand(idx + 1);
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
  }
  return arr;
}

// One gradient-descent step over a mini-batch.
// Forward:  h = tanh(W1 x + b1)     y = tanh(W2 h + b2)
// Loss:     L = mean((y - t)^2)
// Backward (chain rule, tanh' (a) = 1 - a^2 using the post-activation value):
//   delta2 = (y - t) * (1 - y^2)          dL/dW2 = delta2 (outer) h    dL/db2 = delta2
//   delta1 = (W2^T delta2) * (1 - h^2)    dL/dW1 = delta1 (outer) x    dL/db1 = delta1
function trainBatch(brain, batch, learningRate) {
  const gW1 = new Float64Array(brain.W1.data.length);
  const gB1 = new Float64Array(brain.b1.length);
  const gW2 = new Float64Array(brain.W2.data.length);
  const gB2 = new Float64Array(brain.b2.length);
  let batchLoss = 0;

  for (const sample of batch) {
    const x = sample.input;
    const t = sample.target;
    const { hidden: h, out: y } = brain.feedForward(x);

    const delta2 = new Float64Array(brain.o);
    for (let k = 0; k < brain.o; k++) {
      const err = y[k] - t[k];
      batchLoss += err * err;
      delta2[k] = ((2 / brain.o) * err) * (1 - y[k] * y[k]);
    }
    for (let k = 0; k < brain.o; k++) {
      for (let j = 0; j < brain.h; j++) gW2[k * brain.h + j] += delta2[k] * h[j];
      gB2[k] += delta2[k];
    }

    const delta1 = new Float64Array(brain.h);
    for (let j = 0; j < brain.h; j++) {
      let sum = 0;
      for (let k = 0; k < brain.o; k++) sum += delta2[k] * brain.W2.get(k, j);
      delta1[j] = sum * (1 - h[j] * h[j]);
    }
    for (let j = 0; j < brain.h; j++) {
      for (let i = 0; i < brain.i; i++) gW1[j * brain.i + i] += delta1[j] * x[i];
      gB1[j] += delta1[j];
    }
  }

  const m = batch.length;
  for (let idx = 0; idx < gW1.length; idx++) brain.W1.data[idx] -= (learningRate * gW1[idx]) / m;
  for (let idx = 0; idx < gB1.length; idx++) brain.b1[idx] -= (learningRate * gB1[idx]) / m;
  for (let idx = 0; idx < gW2.length; idx++) brain.W2.data[idx] -= (learningRate * gW2[idx]) / m;
  for (let idx = 0; idx < gB2.length; idx++) brain.b2[idx] -= (learningRate * gB2[idx]) / m;

  return batchLoss / m;
}

function trainBackprop(brain, dataset, { epochs = 40, learningRate = 0.05, batchSize = 32, onEpoch } = {}) {
  const data = dataset.slice();
  for (let epoch = 0; epoch < epochs; epoch++) {
    shuffleInPlace(data);
    let epochLoss = 0;
    let batches = 0;
    for (let start = 0; start < data.length; start += batchSize) {
      epochLoss += trainBatch(brain, data.slice(start, start + batchSize), learningRate);
      batches++;
    }
    if (onEpoch) onEpoch(epoch, epochLoss / Math.max(1, batches));
  }
  return brain;
}

// Play a few real games with the trained brain and report the best score,
// so the UI can show how it actually performs, not just its training loss.
function evaluateBrain(brain, games = 5) {
  let best = 0;
  for (let g = 0; g < games; g++) {
    const snake = new Snake(brain);
    let steps = 0;
    while (snake.alive && steps < 4000) {
      snake.step();
      steps++;
    }
    if (snake.score > best) best = snake.score;
  }
  return best;
}

/* -------------------- 3. UI: choosing the training operation -------------------- */

const elBP = {
  trainingMethod: document.getElementById("trainingMethod"),
  gaFieldset: document.getElementById("gaFieldset"),
  bpFieldset: document.getElementById("bpFieldset"),
  samples: document.getElementById("bpSamples"),
  epochs: document.getElementById("bpEpochs"),
  lr: document.getElementById("bpLr"),
  lrVal: document.getElementById("bpLrVal"),
  batch: document.getElementById("bpBatch"),
  trainBtn: document.getElementById("bpTrainBtn"),
  seedBtn: document.getElementById("bpSeedBtn"),
  status: document.getElementById("bpStatus"),
};

function pauseEvolutionIfRunning() {
  if (running) {
    running = false;
    el.toggleRun.textContent = "Resume";
    el.toggleRun.classList.remove("primary");
    rescheduleTicks();
  }
}

elBP.trainingMethod.addEventListener("change", () => {
  const mode = elBP.trainingMethod.value;
  elBP.gaFieldset.hidden = mode !== "evolution";
  elBP.bpFieldset.hidden = mode !== "backprop";
  if (mode === "backprop") pauseEvolutionIfRunning();
});

elBP.lr.addEventListener("input", () => {
  elBP.lrVal.textContent = Number(elBP.lr.value).toFixed(3);
});

elBP.trainBtn.addEventListener("click", () => {
  pauseEvolutionIfRunning();
  elBP.trainBtn.disabled = true;
  elBP.status.textContent = "Generating training data from a pathfinding oracle...";

  // Defer so the status text above actually paints before the (synchronous) crunch.
  setTimeout(() => {
    const samples = clamp(parseInt(elBP.samples.value, 10) || 4000, 100, 20000);
    const epochs = clamp(parseInt(elBP.epochs.value, 10) || 40, 1, 500);
    const learningRate = Number(elBP.lr.value) || 0.05;
    const batchSize = clamp(parseInt(elBP.batch.value, 10) || 32, 1, 512);

    const dataset = generateDataset(samples);
    const brain = new NeuralNetwork(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE);

    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let finalLoss = 0;
    trainBackprop(brain, dataset, {
      epochs, learningRate, batchSize,
      onEpoch: (_epoch, loss) => { finalLoss = loss; },
    });
    const elapsedS = (((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0) / 1000).toFixed(1);

    const measuredScore = evaluateBrain(brain, 5);

    bestEverBrainData = { hiddenSize: HIDDEN_SIZE, weights: Array.from(brain.getGenome()) };
    if (measuredScore > bestEverScore) bestEverScore = measuredScore;
    saveBestToStorage();

    el.watchBtn.disabled = false;
    el.exportBtn.disabled = false;
    elBP.seedBtn.disabled = false;
    elBP.trainBtn.disabled = false;
    elBP.status.textContent =
      `Trained on ${dataset.length} samples for ${epochs} epochs in ${elapsedS}s ` +
      `(final loss ${finalLoss.toFixed(4)}) — scored ${measuredScore} in a test game.`;

    if (!watchMode) toggleWatch();
    else watchSnake = new Snake(new NeuralNetwork(INPUT_SIZE, bestEverBrainData.hiddenSize, OUTPUT_SIZE, bestEverBrainData.weights));

    updateStatsDOM();
  }, 30);
});

elBP.seedBtn.addEventListener("click", () => {
  if (!bestEverBrainData) return;
  population = Array.from({ length: POP_SIZE }, () => {
    const clone = new NeuralNetwork(INPUT_SIZE, bestEverBrainData.hiddenSize, OUTPUT_SIZE, bestEverBrainData.weights);
    clone.mutate(MUT_RATE, MUT_AMOUNT);
    return new Snake(clone);
  });
  generation = 0;
  bestHistory = [];
  avgHistory = [];
  watchMode = false;
  watchSnake = null;
  el.watchBtn.textContent = "Watch best";

  elBP.trainingMethod.value = "evolution";
  elBP.trainingMethod.dispatchEvent(new Event("change"));

  running = true;
  el.toggleRun.textContent = "Pause";
  el.toggleRun.classList.add("primary");
  rescheduleTicks();
  updateStatsDOM();
});
