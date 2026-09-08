// ─── FLUXWELL board + piece data ────────────────────────────────────────────

export const COLS = 14;
export const ROWS = 14;

export type PieceType = 0 | 1 | 2 | 3 | 4 | 5 | 6; // I J L O S T Z

export const PIECE_NAMES = ["I", "J", "L", "O", "S", "T", "Z"] as const;

// Neon palette. Index 0 = empty; 1..7 map to piece colors.
export const PALETTE = [
  "#000000",
  "#25e6ff", // I — cyan
  "#5a86ff", // J — azure
  "#ffa03d", // L — amber
  "#ffe14d", // O — gold
  "#4dffa4", // S — mint
  "#c96bff", // T — violet
  "#ff4d6d", // Z — rose
];

// Rotation states, SRS-style coordinates inside bounding boxes.
// Each entry: 4 rotations × 4 cells of [x, y].
export const SHAPES: ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = [
  // I
  [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  // J
  [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  // L
  [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  // O
  [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  // S
  [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  // T
  [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  // Z
  [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
];

export const BOX_SIZE = [4, 3, 3, 4, 3, 3, 3] as const;

// Pragmatic wall-kick table (subset of SRS — feels right, stays robust).
export const KICKS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
  [-2, 0],
  [2, 0],
  [0, -2],
  [0, 1],
];

export function spawnX(type: PieceType): number {
  return Math.floor((COLS - BOX_SIZE[type]) / 2);
}

// 7-bag randomizer (pure — returns a shuffled bag)
export function newBag(): PieceType[] {
  const bag: PieceType[] = [0, 1, 2, 3, 4, 5, 6];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = bag[i];
    bag[i] = bag[j];
    bag[j] = t;
  }
  return bag;
}
