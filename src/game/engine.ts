// ─── FLUXWELL core engine ───────────────────────────────────────────────────
// Tetris re-imagined on a 14×14 square well.
// The revolution: SHIFT rotates the ENTIRE well 90°. Gravity re-settles every
// block toward the new floor, and lines clear on BOTH axes — a full row or a
// full column collapses, cascading into chains.

import { COLS, ROWS, SHAPES, KICKS, spawnX, newBag, PALETTE, type PieceType } from "./pieces";
import { Particles, FloatTexts, WHITE } from "./particles";
import type { Sfx } from "./audio";

export type Phase =
  | "idle"
  | "ready"
  | "active"
  | "lockbeat"
  | "clearing"
  | "settling"
  | "shifting"
  | "gameover";

export interface HudState {
  score: number;
  lines: number;
  level: number;
  combo: number;
  hiScore: number;
  next: number[];
  hold: number;
  canHold: boolean;
  shiftCharge: number;
  shiftReady: boolean;
  danger: boolean;
}

export interface GameOverStats {
  score: number;
  lines: number;
  level: number;
  shifts: number;
  maxCombo: number;
}

interface CellAnim {
  x: number;      // final cell x
  y: number;      // final cell y
  color: number;
  fx: number;     // from x (cells)
  fy: number;     // from y
  t: number;      // elapsed ms
  dur: number;
  kind: "fall" | "rot";
}

export interface EngineCallbacks {
  onHud: (h: HudState) => void;
  onPhase: (p: Phase) => void;
  onGameOver: (stats: GameOverStats) => void;
}

const LOCK_DELAY = 440;
const MAX_LOCK_RESETS = 15;
const DAS = 130;
const ARR = 28;
const CLEAR_TIME = 230;
const LOCK_BEAT = 72;
const SHIFT_TIME = 340;
const READY_TIME = 1000;
const PRESS_BUFFER = 130;

const CLEAR_BASE = [0, 100, 300, 500, 800, 1200, 1700, 2300, 3000];

export class GameEngine {
  grid = new Uint8Array(COLS * ROWS);
  phase: Phase = "idle";
  phaseT = 0;
  now = 0;

  // active piece
  piece: { type: PieceType; rot: number; x: number; y: number } | null = null;
  private queue: PieceType[] = [];
  private bag: PieceType[] = [];
  hold = -1;
  holdUsed = false;

  // scoring
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  shiftsUsed = 0;
  hiScore: number;

  // gravity + locking
  private gravAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  grounded = false;

  // input
  input = { left: false, right: false, down: false };
  private presses: Record<string, number> = {};
  private dasDir = 0;
  private dasT = 0;
  private arrT = 0;
  shiftCharge = 1; // start charged — the trick is available immediately
  shiftFlash = 0;   // >0 while "READY" pop should show (renderer/hud reads charge anyway)

  // resolving
  private clearRows: number[] = [];
  private clearCols: number[] = [];
  clearMask = new Uint8Array(COLS * ROWS);
  clearProgress = 0; // 0..1 during 'clearing'
  private chain = 0;
  private linesThisResolve = 0;
  private settleUntil = 0;

  // animations (renderer reads these; grid already holds final state)
  anims: CellAnim[] = [];
  animLookup = new Int16Array(COLS * ROWS).fill(-1);

  particles = new Particles();
  texts = new FloatTexts();

  // screen shake
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  shakeRot = 0;
  spin = 0; // rotational impulse for shift

  danger = false;
  private hbT = 0;
  private overT = 0;

  private cb: EngineCallbacks;
  sfx: Sfx | null = null;
  private lastHudKey = "";

  constructor(cb: EngineCallbacks, hiScore: number) {
    this.cb = cb;
    this.hiScore = hiScore;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  newGame(): void {
    this.grid.fill(0);
    this.anims.length = 0;
    this.animLookup.fill(-1);
    this.clearMask.fill(0);
    this.queue = [];
    this.bag = [];
    this.piece = null;
    this.hold = -1;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.maxCombo = 0;
    this.shiftsUsed = 0;
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.shiftCharge = 1;
    this.shiftFlash = 0;
    this.danger = false;
    this.trauma = 0;
    this.spin = 0;
    this.chain = 0;
    this.presses = {};
    this.refillQueue();
    this.setPhase("ready");
    this.sfx?.play("ready");
    this.texts.spawn("READY", COLS / 2, ROWS / 2 - 1.5, "#25e6ff", 1.7);
    if (this.sfx) this.sfx.tempo = 104;
    this.emitHud();
  }

  /** graceful re-entry after pause — brief READY beat, piece intact */
  resumeFromPause(): void {
    if (this.phase === "active" && this.piece) {
      this.sfx?.play("ready");
      this.texts.spawn("READY", COLS / 2, ROWS / 2 - 1.5, "#25e6ff", 1.5);
      this.setPhase("ready");
    }
  }

  abort(): void {
    this.setPhase("idle");
    this.piece = null;
  }

  press(name: string): void {
    this.presses[name] = this.now;
  }

  /** single-step sideways nudge (touch drag) */
  nudge(dir: number): void {
    if (this.phase === "active") this.tryMove(dir < 0 ? -1 : 1, 0, true);
  }

  setSoft(v: boolean): void {
    this.input.down = v;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.cb.onPhase(p);
  }

  private refillQueue(): void {
    while (this.queue.length < 7) {
      if (this.bag.length === 0) this.bag = newBag();
      this.queue.push(this.bag.pop()!);
    }
  }

  private nextType(): PieceType {
    this.refillQueue();
    const t = this.queue.shift()!;
    this.refillQueue();
    return t;
  }

  private collides(type: PieceType, rot: number, x: number, y: number): boolean {
    const cells = SHAPES[type][rot & 3];
    for (let i = 0; i < 4; i++) {
      const cx = x + cells[i][0];
      const cy = y + cells[i][1];
      if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
      if (cy >= 0 && this.grid[cy * COLS + cx] !== 0) return true;
    }
    return false;
  }

  ghostY(): number {
    if (!this.piece) return 0;
    let gy = this.piece.y;
    while (!this.collides(this.piece.type, this.piece.rot, this.piece.x, gy + 1)) gy++;
    return gy;
  }

  private tryMove(dx: number, dy: number, sfxOn = false): boolean {
    const p = this.piece;
    if (!p) return false;
    if (this.collides(p.type, p.rot, p.x + dx, p.y + dy)) return false;
    p.x += dx;
    p.y += dy;
    if (dx !== 0) {
      if (sfxOn) this.sfx?.play("move");
      this.bumpLockFresh();
    }
    if (dy !== 0) this.gravAcc = 0;
    return true;
  }

  private tryRotate(dir: 1 | -1): boolean {
    const p = this.piece;
    if (!p) return false;
    const newRot = (p.rot + (dir === 1 ? 1 : 3)) & 3;
    for (const [kx, ky] of KICKS) {
      if (!this.collides(p.type, newRot, p.x + kx, p.y + ky)) {
        p.rot = newRot;
        p.x += kx;
        p.y += ky;
        this.sfx?.play("rotate");
        this.bumpLockFresh();
        return true;
      }
    }
    this.sfx?.play("deny");
    return false;
  }

  private bumpLockFresh(): void {
    if (this.grounded && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private gravityInterval(): number {
    const base = 760 * Math.pow(0.82, this.level - 1);
    return Math.max(42, base);
  }

  addTrauma(n: number): void {
    this.trauma = Math.min(1, this.trauma + n);
  }

  // ── main update ───────────────────────────────────────────────────────────

  update(dt: number): void {
    this.now += dt;

    // shake decay (dt is ms; rates are per-second)
    this.trauma = Math.max(0, this.trauma - dt * 0.0017);
    const amp = this.trauma * this.trauma * 0.5;
    this.shakeX += ((Math.random() - 0.5) * 2 * amp - this.shakeX) * 0.55;
    this.shakeY += ((Math.random() - 0.5) * 2 * amp - this.shakeY) * 0.55;
    this.shakeRot += ((Math.random() - 0.5) * amp * 0.05 - this.shakeRot) * 0.5;
    this.spin *= Math.pow(0.05, dt / 1000);
    if (this.spin > -0.001 && this.spin < 0.001) this.spin = 0;

    this.particles.update(dt / 1000);
    this.texts.update(dt / 1000);
    this.tickAnims(dt);
    if (this.shiftFlash > 0) this.shiftFlash -= dt;

    this.phaseT += dt;

    switch (this.phase) {
      case "ready": {
        if (this.phaseT > READY_TIME * 0.6 && this.phaseT - dt <= READY_TIME * 0.6) {
          this.sfx?.play("go");
          this.texts.spawn("FLUX ON", COLS / 2, ROWS / 2 + 1.2, "#c96bff", 1.35);
        }
        if (this.phaseT >= READY_TIME) {
          if (this.piece) {
            this.setPhase("active");
          } else {
            this.spawnNext();
            if (this.phase === "ready") this.setPhase("active"); // spawn handles gameover
          }
        }
        break;
      }
      case "active": {
        this.handlePresses();
        this.handleDAS(dt);
        this.applyGravity(dt);
        // passive flux trickle (main recharge is clearing lines)
        if (this.shiftCharge < 1) this.shiftCharge = Math.min(0.995, this.shiftCharge + dt * 0.000055);
        break;
      }
      case "lockbeat": {
        if (this.phaseT >= LOCK_BEAT) this.beginResolve();
        break;
      }
      case "clearing": {
        this.clearProgress = Math.min(1, this.phaseT / CLEAR_TIME);
        if (this.phaseT >= CLEAR_TIME) this.applyClearRemoval();
        break;
      }
      case "settling": {
        if (this.now >= this.settleUntil) this.postSettleScan();
        break;
      }
      case "shifting": {
        if (this.phaseT >= SHIFT_TIME) this.afterShift();
        break;
      }
      case "gameover": {
        this.overT += dt;
        if (this.overT > 46) {
          this.overT = 0;
          if (!this.collapseStep()) {
            this.setPhase("idle");
            this.sfx?.stopMusic();
            this.cb.onGameOver({
              score: this.score,
              lines: this.lines,
              level: this.level,
              shifts: this.shiftsUsed,
              maxCombo: this.maxCombo,
            });
          }
        }
        break;
      }
      case "idle":
        break;
    }

    if (this.danger && this.phase === "active") {
      this.hbT += dt;
      if (this.hbT > 1150) {
        this.hbT = 0;
        this.sfx?.play("danger");
      }
    }

    this.emitHud();
  }

  // ── anims ─────────────────────────────────────────────────────────────────

  private pushAnim(color: number, x: number, y: number, fx: number, fy: number, dur: number, kind: CellAnim["kind"]): void {
    const idx = this.anims.length;
    this.anims.push({ x, y, color, fx, fy, t: 0, dur, kind });
    this.animLookup[y * COLS + x] = idx;
  }

  private tickAnims(dt: number): void {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      if (a.t >= a.dur) {
        const last = this.anims.length - 1;
        this.animLookup[a.y * COLS + a.x] = -1;
        if (i !== last) {
          this.anims[i] = this.anims[last];
          const sw = this.anims[i];
          this.animLookup[sw.y * COLS + sw.x] = i;
        }
        this.anims.pop();
      }
    }
  }

  // ── input pipeline ────────────────────────────────────────────────────────

  private consume(name: string): boolean {
    const t = this.presses[name];
    if (t !== undefined && this.now - t < PRESS_BUFFER) {
      delete this.presses[name];
      return true;
    }
    return false;
  }

  private handlePresses(): void {
    if (this.consume("rotCW")) this.tryRotate(1);
    if (this.consume("rotCCW")) this.tryRotate(-1);
    if (this.consume("hard")) this.hardDrop();
    if (this.consume("hold")) this.holdSwap();
    if (this.consume("shiftL")) this.shift(-1);
    if (this.consume("shiftR")) this.shift(1);
  }

  private handleDAS(dt: number): void {
    const l = this.input.left ? 1 : 0;
    const r = this.input.right ? 1 : 0;
    const dir = l !== r ? (l ? -1 : 1) : 0;

    if (dir === 0) {
      this.dasDir = 0;
      this.dasT = 0;
      this.arrT = 0;
      return;
    }
    if (dir !== this.dasDir) {
      this.dasDir = dir;
      this.dasT = 0;
      this.arrT = 0;
      this.tryMove(dir, 0, true);
      return;
    }
    this.dasT += dt;
    if (this.dasT >= DAS) {
      this.arrT += dt;
      let guard = 0;
      while (this.arrT >= ARR && guard < COLS) {
        this.arrT -= ARR;
        guard++;
        if (!this.tryMove(dir, 0, true)) {
          this.arrT = 0;
          break;
        }
      }
    }
  }

  private applyGravity(dt: number): void {
    const p = this.piece;
    if (!p) return;
    const soft = this.input.down;
    const interval = soft ? Math.max(22, this.gravityInterval() / 22) : this.gravityInterval();

    this.grounded = this.collides(p.type, p.rot, p.x, p.y + 1);

    if (this.grounded) {
      this.gravAcc = 0;
      this.lockTimer += dt * (soft ? 2.4 : 1);
      if (this.lockTimer >= LOCK_DELAY) this.lockPiece(false);
      return;
    }
    this.lockTimer = 0;

    this.gravAcc += dt;
    const prevY = p.y;
    let fell = 0;
    let guard = 0;
    while (this.gravAcc >= interval && guard < ROWS) {
      this.gravAcc -= interval;
      guard++;
      if (this.collides(p.type, p.rot, p.x, p.y + 1)) {
        this.gravAcc = 0;
        break;
      }
      p.y++;
      fell++;
    }
    if (fell > 0 && soft) {
      this.score += fell;
      if (prevY !== p.y && Math.random() < 0.5) this.sfx?.play("soft");
    }
  }

  // ── piece actions ─────────────────────────────────────────────────────────

  private spawnNext(): void {
    const type = this.nextType();
    const x = spawnX(type);
    const y = -1;
    if (this.collides(type, 0, x, y)) {
      this.startGameOver();
      return;
    }
    this.piece = { type, rot: 0, x, y };
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.holdUsed = false;
    if (this.phase !== "gameover") this.setPhase("active");
    this.refreshDanger();
  }

  private holdSwap(): void {
    if (!this.piece || this.holdUsed) {
      this.sfx?.play("deny");
      return;
    }
    const cur = this.piece.type;
    const stored = this.hold;
    this.hold = cur;
    this.sfx?.play("hold");
    if (stored < 0) {
      this.spawnNext();
    } else {
      const t = stored as PieceType;
      const x = spawnX(t);
      if (this.collides(t, 0, x, -1)) {
        this.startGameOver();
        return;
      }
      this.piece = { type: t, rot: 0, x, y: -1 };
      this.gravAcc = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
    }
    this.holdUsed = true;
  }

  private hardDrop(): void {
    const p = this.piece;
    if (!p) return;
    const dist = this.ghostY() - p.y;
    const cells = SHAPES[p.type][p.rot];
    // afterimage trail down the drop path
    const steps = Math.min(dist, 8);
    for (let s = 0; s < steps; s++) {
      const ty = p.y + ((s + 1) / steps) * dist;
      for (let i = 0; i < 4; i++) {
        this.particles.afterimage(p.x + cells[i][0] + 0.5, ty + cells[i][1] + 0.5, p.type + 1);
      }
    }
    p.y += dist;
    this.score += dist * 2;
    this.sfx?.play("harddrop");
    this.addTrauma(0.32 + Math.min(0.25, dist * 0.012));
    this.lockPiece(true);
  }

  private lockPiece(hard: boolean): void {
    const p = this.piece;
    if (!p) return;
    const cells = SHAPES[p.type][p.rot];
    let minY = ROWS, maxY = -1;
    let toppedOut = false;
    for (let i = 0; i < 4; i++) {
      const cx = p.x + cells[i][0];
      const cy = p.y + cells[i][1];
      if (cy < 0) {
        toppedOut = true;
        continue;
      }
      this.grid[cy * COLS + cx] = p.type + 1;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      this.particles.impact(cx + 0.5, cy + 0.85, p.type + 1, hard ? 3 : 2);
    }
    this.piece = null;
    if (toppedOut) {
      this.startGameOver();
      return;
    }
    if (!hard) this.sfx?.play("lock");
    this.addTrauma(hard ? 0.1 : 0.06);
    this.setPhase("lockbeat");
  }

  // ── THE SHIFT — rotate the whole well 90° ─────────────────────────────────

  shift(dir: 1 | -1): void {
    if (this.phase !== "active") return;
    if (this.shiftCharge < 1) {
      this.sfx?.play("deny");
      this.addTrauma(0.12);
      return;
    }
    this.shiftCharge = 0;
    this.shiftsUsed++;
    this.chain = 0;

    // freeze current piece into the grid immediately
    const p = this.piece;
    if (p) {
      const cells = SHAPES[p.type][p.rot];
      for (let i = 0; i < 4; i++) {
        const cx = p.x + cells[i][0];
        const cy = p.y + cells[i][1];
        if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) {
          this.grid[cy * COLS + cx] = p.type + 1;
          this.particles.glowPuff(cx + 0.5, cy + 0.5, p.type + 1);
        }
      }
      this.piece = null;
    }

    // rotate grid; record rot animations from old to new positions
    const ng = new Uint8Array(COLS * ROWS);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = this.grid[y * COLS + x];
        if (v === 0) continue;
        // CW:  (x,y) -> (COLS-1-y, x)
        // CCW: (x,y) -> (y, ROWS-1-x)
        const nx = dir === 1 ? COLS - 1 - y : y;
        const ny = dir === 1 ? x : ROWS - 1 - x;
        ng[ny * COLS + nx] = v;
        const dx = nx - x;
        const dist = Math.abs(dx) + Math.abs(ny - y);
        this.pushAnim(v, nx, ny, x, y, 180 + Math.min(160, dist * 14), "rot");
      }
    }
    this.grid = ng;

    this.sfx?.play("shift_go");
    this.addTrauma(0.55);
    this.spin = dir * 1.6;
    this.particles.ring(COLS / 2, ROWS / 2, WHITE, 8);
    this.texts.spawn(dir === 1 ? "FLUX ⟶" : "⟵ FLUX", COLS / 2, ROWS / 2, "#25e6ff", 1.15);
    this.setPhase("shifting");
  }

  private afterShift(): void {
    this.sfx?.play("shift_land");
    this.addTrauma(0.5);
    this.particles.ring(COLS / 2, ROWS / 2, WHITE, 10);
    for (let i = 0; i < 10; i++) {
      this.particles.spawn(Math.random() * COLS, ROWS - 0.3, {
        vx: (Math.random() - 0.5) * 22,
        vy: -4 - Math.random() * 14,
        life: 0.4 + Math.random() * 0.4,
        kind: 1,
        size: 0.8,
        color: WHITE,
        grav: 0,
        drag: 0.9,
      });
    }
    this.applyGravityFall();
  }

  // ── clearing / resolving ──────────────────────────────────────────────────

  /** Pack every column downward; spawn fall anims; enter settling phase. */
  private applyGravityFall(): void {
    let maxDur = 0;
    for (let x = 0; x < COLS; x++) {
      let write = ROWS - 1;
      for (let y = ROWS - 1; y >= 0; y--) {
        const v = this.grid[y * COLS + x];
        if (v === 0) continue;
        if (write !== y) {
          this.grid[write * COLS + x] = v;
          this.grid[y * COLS + x] = 0;
          const dist = write - y;
          const dur = 70 + Math.min(310, dist * 34);
          this.pushAnim(v, x, write, x, y, dur, "fall");
          if (dur > maxDur) maxDur = dur;
        }
        write--;
      }
    }
    this.settleUntil = this.now + Math.max(90, maxDur) + 24;
    this.setPhase("settling");
  }

  rowInClear(y: number): boolean {
    return this.clearRows.indexOf(y) >= 0;
  }

  colInClear(x: number): boolean {
    return this.clearCols.indexOf(x) >= 0;
  }

  private scanLines(): void {
    this.clearRows.length = 0;
    this.clearCols.length = 0;
    for (let y = 0; y < ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y * COLS + x] === 0) { full = false; break; }
      }
      if (full) this.clearRows.push(y);
    }
    for (let x = 0; x < COLS; x++) {
      let full = true;
      for (let y = 0; y < ROWS; y++) {
        if (this.grid[y * COLS + x] === 0) { full = false; break; }
      }
      if (full) this.clearCols.push(x);
    }
  }

  private beginResolve(): void {
    this.chain = 0;
    this.linesThisResolve = 0;
    this.scanLines();
    if (this.clearRows.length === 0 && this.clearCols.length === 0) {
      this.combo = 0;
      this.finishResolve();
      return;
    }
    this.startClear();
  }

  private startClear(): void {
    this.chain++;
    const rows = this.clearRows;
    const cols = this.clearCols;
    const k = rows.length + cols.length;
    const isCross = rows.length > 0 && cols.length > 0;

    // mark cells
    this.clearMask.fill(0);
    for (const y of rows) for (let x = 0; x < COLS; x++) this.clearMask[y * COLS + x] = 1;
    for (const x of cols) for (let y = 0; y < ROWS; y++) this.clearMask[y * COLS + x] = 1;

    // scoring
    const base = CLEAR_BASE[Math.min(k, CLEAR_BASE.length - 1)];
    const chainMul = 1 + 0.5 * (this.chain - 1);
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const comboBonus = this.combo > 1 ? 50 * this.combo * this.level : 0;
    const crossBonus = isCross ? 400 * this.level : 0;
    const gained = Math.round(base * this.level * chainMul + comboBonus + crossBonus);
    this.score += gained;
    this.lines += k;
    this.linesThisResolve += k;

    // fx
    const my = rows.length ? rows[rows.length - 1] : ROWS / 2;
    const names = ["", "SINGLE", "DOUBLE", "TRIPLE", "QUAD", "HYPER", "HYPER+", "MEGA", "MEGA+"];
    if (isCross) {
      this.texts.spawn("CRUX ✦", COLS / 2, my - 1.6, "#ffe14d", 1.35);
      this.sfx?.play("cross");
      this.addTrauma(0.6);
    } else {
      const label = names[Math.min(k, names.length - 1)];
      const col = this.chain > 1 ? "#c96bff" : k >= 4 ? "#ffe14d" : "#25e6ff";
      this.texts.spawn(label, COLS / 2, my - 1.4, col, 0.9 + k * 0.12);
      this.sfx?.play("clear", { n: k, chain: this.chain });
      this.addTrauma(0.22 + k * 0.09);
    }
    if (this.chain > 1) {
      this.texts.spawn(`CHAIN ×${this.chain}`, COLS / 2, my - 3.1, "#c96bff", 1.05);
    }
    this.texts.spawn(`+${gained}`, COLS / 2, my + 0.4, "#ffffff", 0.85);

    for (const y of rows) this.particles.streaks("h", y, 0, COLS);
    for (const x of cols) this.particles.streaks("v", x, 0, ROWS);

    // chainable shift recharge comes at finishResolve
    this.clearProgress = 0;
    this.setPhase("clearing");
  }

  private applyClearRemoval(): void {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        if (this.clearMask[i] === 1) {
          const v = this.grid[i];
          if (v !== 0) this.particles.burst(x + 0.5, y + 0.5, v, 4, 8);
          this.grid[i] = 0;
        }
      }
    }
    this.clearMask.fill(0);
    this.applyGravityFall();
  }

  private postSettleScan(): void {
    this.scanLines();
    if (this.clearRows.length > 0 || this.clearCols.length > 0) {
      this.startClear();
      return;
    }
    this.finishResolve();
  }

  private finishResolve(): void {
    // perfect clear — the holy grail
    let empty = true;
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] !== 0) { empty = false; break; }
    }
    if (empty && this.lines > 0) {
      const bonus = 4000 * this.level;
      this.score += bonus;
      this.texts.spawn("PURGE!", COLS / 2, ROWS / 2 - 1, "#ffe14d", 1.5);
      this.texts.spawn(`+${bonus}`, COLS / 2, ROWS / 2 + 0.6, "#ffffff", 0.9);
      this.particles.ring(COLS / 2, ROWS / 2, 4, 12);
      this.particles.ring(COLS / 2, ROWS / 2, WHITE, 8);
      this.sfx?.play("perfect");
      this.addTrauma(0.8);
    }

    // shift recharge
    const wasReady = this.shiftCharge >= 1;
    this.shiftCharge = Math.min(1, this.shiftCharge + this.linesThisResolve * 0.3 + this.chain * 0.06);
    if (!wasReady && this.shiftCharge >= 1) {
      this.sfx?.play("charged");
      this.shiftFlash = 800;
      this.texts.spawn("FLUX READY", COLS / 2, 1.6, "#25e6ff", 0.85);
    }
    this.linesThisResolve = 0;

    // level up
    const newLevel = 1 + Math.floor(this.lines / 10);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.sfx?.play("levelup");
      this.texts.spawn(`LEVEL ${this.level}`, COLS / 2, ROWS / 2 - 2.6, "#52ffa0", 1.15);
      if (this.sfx) {
        this.sfx.tempo = 104 + (this.level - 1) * 5;
      }
    }

    if (this.score > this.hiScore) this.hiScore = this.score;

    this.spawnNext();
  }

  // ── danger & game over ────────────────────────────────────────────────────

  private refreshDanger(): void {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y * COLS + x] !== 0) {
          if (!this.danger) {
            this.danger = true;
            this.sfx?.setIntense(true);
          }
          return;
        }
      }
    }
    if (this.danger) {
      this.danger = false;
      this.sfx?.setIntense(false);
    }
  }

  private startGameOver(): void {
    this.piece = null;
    this.danger = false;
    this.sfx?.setIntense(false);
    this.sfx?.play("gameover");
    this.sfx?.stopMusic();
    this.addTrauma(1);
    this.overT = 0;
    this.setPhase("gameover");
  }

  /** Disintegrate one occupied row (lowest first). Returns false when done. */
  private collapseStep(): boolean {
    let any = false;
    for (let y = ROWS - 1; y >= 0; y--) {
      let rowHas = false;
      for (let x = 0; x < COLS; x++) if (this.grid[y * COLS + x] !== 0) { rowHas = true; break; }
      if (!rowHas) continue;
      any = true;
      for (let x = 0; x < COLS; x++) {
        const v = this.grid[y * COLS + x];
        if (v !== 0) {
          this.particles.burst(x + 0.5, y + 0.5, v, 3, 7);
          this.grid[y * COLS + x] = 0;
        }
      }
      this.addTrauma(0.18);
      break;
    }
    return any;
  }

  // ── hud ───────────────────────────────────────────────────────────────────

  private emitHud(): void {
    const next0 = this.queue.length > 0 ? this.queue[0] : 0;
    const next1 = this.queue.length > 1 ? this.queue[1] : 0;
    const next2 = this.queue.length > 2 ? this.queue[2] : 0;
    const key = [
      this.score, this.lines, this.level, this.combo, this.hiScore,
      next0, next1, next2, this.hold, this.holdUsed,
      this.shiftCharge.toFixed(2), this.danger ? 1 : 0,
    ].join("|");
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;
    this.cb.onHud({
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: this.combo,
      hiScore: this.hiScore,
      next: [next0, next1, next2],
      hold: this.hold,
      canHold: !this.holdUsed && this.hold >= -1,
      shiftCharge: this.shiftCharge,
      shiftReady: this.shiftCharge >= 1,
      danger: this.danger,
    });
  }

  // visual smoothing helpers for renderer
  pieceVisualY(): number {
    const p = this.piece;
    if (!p) return 0;
    const interval = this.input.down ? Math.max(22, this.gravityInterval() / 22) : this.gravityInterval();
    const frac = this.grounded ? 0 : Math.min(1, this.gravAcc / interval);
    return p.y + frac * 0.85;
  }

  paletteOf(i: number): string {
    return PALETTE[Math.min(Math.max(i, 0), PALETTE.length - 1)];
  }
}
