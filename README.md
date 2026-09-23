# Neuroevolution Snake

A browser-based Snake game where a *population* of snakes evolves a small neural network to play the game — no training data, no backpropagation, no ML libraries. Just a genetic algorithm: mutation, crossover, and survival of the fittest.

Open `index.html` in a browser (no build step, no dependencies) or serve the folder with any static server, e.g. `python3 -m http.server`.

## The big idea

Instead of *telling* the snake how to play, or training it on human games, we:

1. Create a population of, say, 120 snakes, each with a **randomly-initialized brain** (a tiny neural network).
2. Let every snake play a full game of Snake, controlled entirely by its own brain's decisions.
3. Score each snake by how well it did (a **fitness** score).
4. Breed the next generation mostly from the best-performing snakes, with some random mutation thrown in.
5. Repeat, forever. Average and best scores climb over generations as better brains survive and reproduce.

This is *neuroevolution* — evolving a neural network's weights with a genetic algorithm, as an alternative to gradient descent.

## The neural network (`NeuralNetwork` class)

Each snake's brain is a tiny feedforward network:

```
11 inputs → hidden layer (configurable, default 16 neurons) → 3 outputs
```

All the weights and biases live in **one flat array** (`this.weights`), which is what makes the genetic operators trivial: crossover is just picking array elements from two parents, and mutation is just nudging random array elements.

### Inputs (11) — what the snake "sees"

The snake doesn't get raw pixels. It gets a compact, hand-crafted description of its immediate situation, computed fresh every step from the snake's own point of view (relative to its current heading):

| # | Input | Meaning |
|---|-------|---------|
| 1 | danger straight | 1 if moving straight ahead would hit a wall or its own body |
| 2 | danger right | same, for turning right |
| 3 | danger left | same, for turning left |
| 4–7 | moving up / down / left / right | one-hot encoding of current heading |
| 8–11 | food up / down / left / right | is the food above, below, left, or right of the head? |

### Outputs (3) — what the snake decides

```
[ turn left, go straight, turn right ]
```

Turns are relative to the snake's current heading, so the same brain works regardless of which way it's currently facing.

### Forward pass, as matrices

Let $x \in \mathbb{R}^{11}$ be the input vector and $h$ the hidden layer size (default 16). The layers are:

$$
\mathbf{h} = \tanh(W_1 x + b_1), \qquad W_1 \in \mathbb{R}^{h \times 11},\ b_1 \in \mathbb{R}^{h}
$$

$$
\mathbf{y} = \tanh(W_2 \mathbf{h} + b_2), \qquad W_2 \in \mathbb{R}^{3 \times h},\ b_2 \in \mathbb{R}^{3}
$$

$$
\text{action} = \operatorname*{arg\,max}_i\ y_i
$$

Each row of $W_1$ (resp. $W_2$) holds one neuron's weights, so a neuron's pre-activation is the **dot product** of that row with the input vector, plus its bias: $z_j = W_{1,j\cdot} \cdot x + b_{1,j}$. `feedForward` in `script.js` computes exactly this, one dot product per neuron, just without ever materializing $W_1$/$W_2$ as 2-D arrays — $W_1, b_1, W_2, b_2$ are all packed into the single flat array `this.weights`, sliced by offset (`offW1`, `offB1`, `offW2`, `offB2`) rather than stored as separate matrices.

### Why this input/output design?

It's the minimum information needed to play well (danger sensing + food direction) while keeping the input space small, which matters a lot for a gradient-free search like a genetic algorithm — smaller networks evolve faster than ones trying to process a full grid.

## The game (`Snake` class)

Standard Snake rules on a 16×16 grid:

- The snake starts as a 3-segment body in the center, moving right.
- Each step: read the 11 inputs → feed them through the brain → get a turn decision → move one cell.
- Hitting a wall or its own body kills it.
- Eating food grows the snake by one segment and spawns new food at a random empty cell.
- **Anti-stalling rule:** if a snake goes too long without eating (`100 + score × 40` steps), it's killed off. Without this, a network that just "survives" by looping forever (without ever risking a food run) would rack up a huge step count and hijack the fitness scoring. There's also a hard cap of 6000 steps per snake as a final safety net.

## Fitness — how snakes are scored

```js
fitness = steps + score² × 500
```

- `steps` gives a small, continuous reward for staying alive longer — important early on, when almost no snake in generation 0 finds food purely by chance, so there needs to be *some* gradient to select on besides "ate food or didn't."
- `score² × 500` heavily rewards eating food, and rewards it *super-linearly* — eating 4 apples is worth much more than 4× eating 1 apple, which pushes evolution toward snakes that keep chaining food finds rather than settling for one easy apple.

## The genetic algorithm (`evolvePopulation`)

When every snake in a generation has died, the next generation is bred like this:

1. **Elitism** — the top ~6% of snakes (by fitness) are copied into the next generation unchanged. This guarantees the best solution found so far is never lost to bad luck in breeding.
2. **Tournament selection** — to pick a parent, 5 random snakes are sampled from the population and the fittest of those 5 wins. This is repeated to pick two parents per child. (Tournament selection is simple and self-balances selection pressure — it doesn't require normalizing fitness values, and it doesn't let one super-fit outlier dominate every mating as strongly as pure fitness-proportionate selection would.)
3. **Crossover** — the child's weight array is built by going through both parents' weight arrays position-by-position and flipping a coin for each one (uniform crossover), mixing traits from both parents.
4. **Mutation** — after crossover, every weight in the child has a small chance (`mutation rate`, default 6%) of being nudged by a random amount (`mutation amount`, default ±0.25). This is what introduces new variation the population didn't already have — without it, evolution would plateau at whatever combinations already exist in generation 0.
5. Repeat until the new population is full size, then reset every snake to a fresh game and go again.

## Backpropagation — the other training operation (`backprop.js`)

The genetic algorithm above needs zero labeled data — it only ever needs a win/lose signal. `backprop.js` takes the opposite approach: **supervised learning**. It generates its own labeled training set, then trains a brain against it with ordinary gradient descent. The **Training method** dropdown in the UI lets you pick which of the two operations produces the brain you're watching.

### 1. Generating the data

Real gameplay states aren't hand-recorded anywhere — they're synthesized:

- `randomSnakeState()` builds a random, connected, self-avoiding snake body (a random walk over the grid that never revisits a cell) of length 3–11, derives a valid heading from it, and drops food on any empty cell.
- For each random state, an **oracle** decides the "correct" move: `bfsPathToFood()` runs a breadth-first search from the head to the food, treating every body segment as a wall — exactly the same simplification the game itself uses for collision checks — and returns the shortest safe path. The first step of that path is the label. If the food is currently unreachable (walled off by the snake's own body), `greedyFallbackAction()` instead picks whichever safe move reduces Manhattan distance to the food.
- That absolute direction is converted into the network's relative action encoding (left / straight / right) via `relativeActionFromDir()`, matching how the snake itself turns.
- States with no safe move at all are discarded — there's no correct label for "you're already trapped."

Each sample is `{ input: <11 numbers, same encoding as the game>, target: [-1, -1, -1] }` with the chosen action's slot flipped to `+1` (matching the network's `tanh` output range). `generateDataset(n)` repeats this until it has `n` valid samples — by default 4,000.

### 2. Training

`trainBackprop()` runs ordinary mini-batch gradient descent over the generated dataset for a configurable number of epochs, shuffling between epochs. Each batch (`trainBatch()`) does a forward pass, then propagates the error backward through the exact same $W_1, b_1, W_2, b_2$ matrices `feedForward` uses:

$$
\delta_2 = (\mathbf{y} - \mathbf{t}) \odot (1 - \mathbf{y}^2), \qquad \nabla W_2 = \delta_2 \, \mathbf{h}^\top,\quad \nabla b_2 = \delta_2
$$

$$
\delta_1 = (W_2^\top \delta_2) \odot (1 - \mathbf{h}^2), \qquad \nabla W_1 = \delta_1 \, \mathbf{x}^\top,\quad \nabla b_1 = \delta_1
$$

using mean-squared error and the identity $\tanh'(z) = 1 - \tanh(z)^2$ (so the derivative comes for free from activations already computed on the forward pass — no need to cache the pre-activation values). Gradients are averaged over each mini-batch and applied with plain gradient descent: $W \mathrel{-}= \eta \nabla W$.

After training, `evaluateBrain()` plays a handful of real games with the result and reports the best score achieved, so what you see in the status line is measured performance, not just training loss (a low loss doesn't always mean it plays well).

### Combining both operations

Once a backprop-trained brain exists, **"Seed evolution with this brain"** clones it into a full population (each clone lightly mutated) and switches back to evolution mode — a common combined workflow: imitation-learn a decent baseline quickly with backprop, then let the genetic algorithm fine-tune and specialize it further.

## The UI

| Control | What it does |
|---|---|
| **Game canvas** | Shows the current *leader* — whichever alive snake currently has the highest score (ties broken by steps survived) — playing live. In backprop/watch mode, shows the single brain being demonstrated. |
| **Leader's brain panel** | A live node-link diagram of the leader's network: node brightness = activation, line color = weight sign (green = positive, red = negative), line opacity = weight magnitude. The highlighted output node is the decision it just made. |
| **Best score per generation chart** | Green line = best score that generation, blue line = average score — the two lines separating over time is what "learning" looks like here. |
| **Pause / Resume** | Stops or resumes the simulation. |
| **Skip Generation** | Force-kills every remaining snake immediately and breeds the next generation, instead of waiting for them all to die naturally. |
| **Reset Population** | Throws away the current population and starts over from generation 0 with fresh random brains. |
| **Speed slider** | How many simulation steps run per second. |
| **Turbo** | Runs far more steps per tick, with rendering as a lower priority — use this to blast through hundreds of generations quickly when you don't need to watch. |
| **Training method** | Chooses which operation produces the brain: **Genetic algorithm** (the default, evolves a whole population) or **Backpropagation** (trains one brain on generated data). Switching to Backpropagation pauses evolution. |
| **Population size / Hidden neurons** | Applied the next time you hit Reset (changing network size mid-run would make existing brains incompatible with new ones). |
| **Mutation rate / amount** | Applied live, to the *next* generation bred (by evolution, or by "Seed evolution with this brain"). |
| **Training samples / Epochs / Learning rate / Batch size** | Backpropagation-only: how much data to generate and how to train on it — see [Backpropagation](#backpropagation--the-other-training-operation-backpropjs) above. |
| **Generate data & train** | Runs the full supervised pipeline: generate the dataset, train, evaluate in real games, and start watching the result. |
| **Seed evolution with this brain** | Clones the backprop-trained brain into a fresh, mutated population and switches back to evolution mode, so the genetic algorithm can keep refining it. |
| **Watch best** | Pauses evolution and replays the best brain ever found, on loop, so you can see how far it's gotten. |
| **Export / Import JSON** | Save the best brain's weights to a file, or load one back in (e.g. to resume on another day, or show someone else). The best brain is also auto-saved to the browser's `localStorage` whenever a new record is set. |

## Files

- `index.html` — page structure and controls
- `style.css` — dark theme styling
- `script.js` — `NeuralNetwork`/`Matrix`, `Snake`, the genetic algorithm, rendering, and UI wiring
- `backprop.js` — the supervised alternative: data generation (random states + BFS pathfinding oracle), backpropagation training, evaluation, and the "training method" UI wiring. Loaded after `script.js` and reuses its classes and globals directly (both are plain `<script>` tags sharing one global scope — no bundler, no modules).
