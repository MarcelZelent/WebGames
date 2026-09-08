// ─── FLUXWELL canvas renderer ───────────────────────────────────────────────
// Everything draw-costly is pre-baked: block atlases, glow sprites, board
// background, vignette. Per frame = drawImage + fillRect only.

import { COLS, ROWS, SHAPES, PALETTE } from "./pieces";
import type { GameEngine } from "./engine";

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: [number, number, number], amt: number): string {
  const [r, g, b] = hexRgb(hex);
  const m = (c: number, t: number) => Math.round(c + (t - c) * amt);
  return `rgb(${m(r, target[0])},${m(g, target[1])},${m(b, target[2])})`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const BLOCK = 64;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  size = 300;
  private bgSprite: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  core: HTMLCanvasElement[] = [];
  glow: HTMLCanvasElement[] = [];
  ghost: HTMLCanvasElement[] = [];
  /** particle color index (same as palette index for blocks) → sprite */
  particleGlow: HTMLCanvasElement[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.buildAtlases();
  }

  resize(cssSize: number, dpr: number): void {
    const px = Math.max(120, Math.round(cssSize * dpr));
    this.canvas.width = px;
    this.canvas.height = px;
    this.size = px;
    this.buildBgSprite(px);
    this.buildVignette(px);
  }

  // ── atlas baking ──────────────────────────────────────────────────────────

  private buildAtlases(): void {
    const total = PALETTE.length; // 0 unused, plus white/pale appended for particles
    const extra = ["#ffffff", "#9db4ff"];
    for (let i = 0; i < total + extra.length; i++) {
      const color = i < total ? PALETTE[Math.max(1, i)] : extra[i - total];
      // core
      const c = document.createElement("canvas");
      c.width = BLOCK; c.height = BLOCK;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 4, 0, BLOCK - 4);
      grad.addColorStop(0, mix(color, [255, 255, 255], 0.42));
      grad.addColorStop(0.45, color);
      grad.addColorStop(1, mix(color, [0, 0, 20], 0.32));
      rr(g, 3, 3, BLOCK - 6, BLOCK - 6, 12);
      g.fillStyle = grad;
      g.fill();
      // top-left specular
      const spec = g.createLinearGradient(0, 3, 0, BLOCK * 0.55);
      spec.addColorStop(0, "rgba(255,255,255,0.5)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      rr(g, 6, 5, BLOCK - 12, BLOCK * 0.42, 9);
      g.fillStyle = spec;
      g.fill();
      // inner border
      rr(g, 5, 5, BLOCK - 10, BLOCK - 10, 10);
      g.strokeStyle = "rgba(255,255,255,0.28)";
      g.lineWidth = 2;
      g.stroke();
      // bottom shadow lip
      rr(g, 5, 5, BLOCK - 10, BLOCK - 10, 10);
      g.strokeStyle = "rgba(0,0,10,0.4)";
      g.lineWidth = 2.5;
      g.stroke();
      this.core.push(c);

      // glow (blur baked once)
      const gs = document.createElement("canvas");
      gs.width = BLOCK * 1.9; gs.height = BLOCK * 1.9;
      const gg = gs.getContext("2d")!;
      gg.filter = "blur(13px)";
      gg.fillStyle = color;
      const off = (gs.width - BLOCK) / 2;
      rr(gg, off + 3, off + 3, BLOCK - 6, BLOCK - 6, 12);
      gg.fill();
      gg.filter = "none";
      gg.globalAlpha = 0.4;
      rr(gg, off + 3, off + 3, BLOCK - 6, BLOCK - 6, 12);
      gg.fill();
      this.glow.push(gs);
      this.particleGlow.push(gs);

      // ghost outline
      const gh = document.createElement("canvas");
      gh.width = BLOCK; gh.height = BLOCK;
      const hg = gh.getContext("2d")!;
      rr(hg, 5, 5, BLOCK - 10, BLOCK - 10, 10);
      hg.strokeStyle = mix(color, [255, 255, 255], 0.15);
      hg.globalAlpha = 0.75;
      hg.lineWidth = 3;
      hg.stroke();
      hg.globalAlpha = 0.12;
      hg.fillStyle = color;
      rr(hg, 5, 5, BLOCK - 10, BLOCK - 10, 10);
      hg.fill();
      this.ghost.push(gh);
    }
  }

  private buildBgSprite(px: number): void {
    const c = document.createElement("canvas");
    c.width = px;
    c.height = px;
    const g = c.getContext("2d")!;
    // deep well gradient
    const rad = g.createRadialGradient(px / 2, px * 0.42, px * 0.05, px / 2, px / 2, px * 0.75);
    rad.addColorStop(0, "#0d1230");
    rad.addColorStop(0.6, "#090d22");
    rad.addColorStop(1, "#05060e");
    g.fillStyle = rad;
    g.fillRect(0, 0, px, px);
    // checker
    const cell = px / COLS;
    g.fillStyle = "rgba(140,160,255,0.028)";
    for (let y = 0; y < ROWS; y++) {
      for (let x = (y % 2); x < COLS; x += 2) {
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // grid lines
    g.strokeStyle = "rgba(130,150,255,0.075)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < COLS; i++) {
      g.moveTo(i * cell + 0.5, 0);
      g.lineTo(i * cell + 0.5, px);
      g.moveTo(0, i * cell + 0.5);
      g.lineTo(px, i * cell + 0.5);
    }
    g.stroke();
    this.bgSprite = c;
  }

  private buildVignette(px: number): void {
    const c = document.createElement("canvas");
    c.width = px;
    c.height = px;
    const g = c.getContext("2d")!;
    const rad = g.createRadialGradient(px / 2, px / 2, px * 0.28, px / 2, px / 2, px * 0.72);
    rad.addColorStop(0, "rgba(255,45,80,0)");
    rad.addColorStop(1, "rgba(255,45,80,0.5)");
    g.fillStyle = rad;
    g.fillRect(0, 0, px, px);
    this.vignette = c;
  }

  // ── per-frame render ──────────────────────────────────────────────────────

  render(e: GameEngine, t: number): void {
    const ctx = this.ctx;
    const px = this.size;
    const cell = px / COLS;
    const bleed = cell * 0.6;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, px, px);

    // camera: shake + rotational spin (shift flourish)
    const rot = e.shakeRot + e.spin * 0.16;
    const sx = e.shakeX * cell * 0.5;
    const sy = e.shakeY * cell * 0.5;
    ctx.translate(px / 2 + sx, px / 2 + sy);
    ctx.rotate(rot);
    ctx.translate(-px / 2, -px / 2);

    if (this.bgSprite) ctx.drawImage(this.bgSprite, -bleed, -bleed, px + bleed * 2, px + bleed * 2);

    // switch to cell-space for board contents
    ctx.save();
    ctx.beginPath();
    ctx.rect(-2, -2, px + 4, px + 4);
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // re-apply camera in cell space: scale first
    ctx.translate(px / 2 + sx, px / 2 + sy);
    ctx.rotate(rot);
    ctx.scale(cell, cell);
    ctx.translate(-COLS / 2, -ROWS / 2);

    const ph = e.phase;

    // ghost piece
    if (e.piece && ph === "active") {
      const gy = e.ghostY();
      if (gy !== e.piece.y) {
        const cells = SHAPES[e.piece.type][e.piece.rot];
        const sprite = this.ghost[e.piece.type + 1];
        for (let i = 0; i < 4; i++) {
          const gx = e.piece.x + cells[i][0];
          const gyy = gy + cells[i][1];
          if (gyy >= 0) ctx.drawImage(sprite, gx, gyy, 1, 1);
        }
      }
    }

    // settled blocks
    const grid = e.grid;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = grid[y * COLS + x];
        if (v === 0 || e.animLookup[y * COLS + x] >= 0) continue;
        if (e.clearMask[y * COLS + x] === 1) {
          this.drawBlockFlash(x, y, v, e.clearProgress);
        } else {
          this.drawBlock(x, y, v, false);
        }
      }
    }

    // animated blocks (rotation / fall / mint)
    for (const a of e.anims) {
      const p = Math.min(1, a.t / a.dur);
      const ease = a.kind === "fall" ? p * p : p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const ax = a.fx + (a.x - a.fx) * ease;
      const ay = a.fy + (a.y - a.fy) * ease;
      this.drawBlock(ax, ay, a.color, true);
    }

    // active piece (smooth y)
    if (e.piece && (ph === "active" || ph === "lockbeat" || ph === "ready")) {
      const cells = SHAPES[e.piece.type][e.piece.rot];
      const vy = e.pieceVisualY();
      const lockGlow = e.grounded ? 0.5 + 0.5 * Math.sin(t * 18) : 0;
      for (let i = 0; i < 4; i++) {
        const cx = e.piece.x + cells[i][0];
        const cy = vy + cells[i][1];
        this.drawBlock(cx, cy, e.piece.type + 1, true);
        if (lockGlow > 0) {
          ctx.globalAlpha = lockGlow * 0.35;
          ctx.drawImage(this.core[e.piece.type + 1], cx, cy, 1, 1);
          ctx.globalAlpha = 1;
        }
      }
    }

    // clearing beams
    if (ph === "clearing") {
      const prog = e.clearProgress;
      const beamA = (1 - prog) * 0.85;
      ctx.globalCompositeOperation = "lighter";
      for (let y = 0; y < ROWS; y++) {
        let rowMarked = false;
        for (let x = 0; x < COLS; x++) if (e.clearMask[y * COLS + x] === 1) { rowMarked = true; break; }
        if (rowMarked && e.rowInClear(y)) {
          ctx.globalAlpha = beamA;
          ctx.fillStyle = "#ffffff";
          const w = COLS * (0.25 + prog * 0.75);
          ctx.fillRect(COLS / 2 - w / 2, y + 0.14, w, 0.72);
        }
      }
      for (let x = 0; x < COLS; x++) {
        if (!e.colInClear(x)) continue;
        ctx.globalAlpha = beamA;
        ctx.fillStyle = "#ffe14d";
        const h = ROWS * (0.25 + prog * 0.75);
        ctx.fillRect(x + 0.14, ROWS / 2 - h / 2, 0.72, h);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // particles + text
    e.particles.render(ctx, this.core, this.particleGlow);
    e.texts.render(ctx);

    ctx.restore();

    // danger vignette pulse
    if (e.danger && this.vignette) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.32 + 0.2 * Math.sin(t * 5.5);
      ctx.drawImage(this.vignette, 0, 0, px, px);
      ctx.globalAlpha = 1;
    }

    // white impact flash on heavy trauma (crux, purges, shifts)
    const flash = Math.max(0, e.trauma - 0.72) * 0.5;
    if (flash > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(0.35, flash);
      ctx.fillStyle = "#dbe9ff";
      ctx.fillRect(0, 0, px, px);
      ctx.globalAlpha = 1;
    }
  }

  private drawBlock(x: number, y: number, v: number, withGlow: boolean): void {
    const ctx = this.ctx;
    if (withGlow) {
      const g = this.glow[v];
      ctx.globalAlpha = 0.5;
      ctx.drawImage(g, x - 0.45, y - 0.45, 1.9, 1.9);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.core[v], x, y, 1, 1);
  }

  private drawBlockFlash(x: number, y: number, v: number, prog: number): void {
    const ctx = this.ctx;
    this.drawBlock(x, y, v, false);
    ctx.globalAlpha = 0.4 + prog * 0.6;
    const g = this.glow[v];
    ctx.drawImage(g, x - 0.45, y - 0.45, 1.9, 1.9);
    ctx.globalAlpha = prog * 0.85;
    ctx.fillStyle = "#ffffff";
    rr(ctx, x + 0.08, y + 0.08, 0.84, 0.84, 0.2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ─── ambient background: nebula + parallax starfield ────────────────────────

export class Backdrop {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private base: HTMLCanvasElement | null = null;
  private blobs: { sprite: HTMLCanvasElement; x: number; y: number; r: number; sp: number; ph: number; s: number }[] = [];
  private stars: { x: number; y: number; z: number; tw: number; ph: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    this.ctx = ctx;
    this.buildBlobSprites();
    for (let i = 0; i < 130; i++) {
      this.stars.push({
        x: Math.random(), y: Math.random(),
        z: 0.25 + Math.random() * 0.75,
        tw: 0.4 + Math.random() * 1.6,
        ph: Math.random() * 6.28,
      });
    }
  }

  private blobSprites: HTMLCanvasElement[] = [];
  private buildBlobSprites(): void {
    const hues = ["#2430a8", "#5a1f8c", "#0c4d66", "#143a7a", "#6c1d4e"];
    for (const h of hues) {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const g = c.getContext("2d")!;
      const rad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
      rad.addColorStop(0, h);
      rad.addColorStop(0.55, h + "55");
      rad.addColorStop(1, "transparent");
      g.fillStyle = rad;
      g.fillRect(0, 0, 256, 256);
      this.blobSprites.push(c);
    }
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.dpr = dpr;
    // base gradient bake
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, c.width * 0.3, c.height);
    grad.addColorStop(0, "#070a1c");
    grad.addColorStop(0.5, "#05060e");
    grad.addColorStop(1, "#0a0716");
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    this.base = c;
    // scatter blobs
    this.blobs = [];
    for (let i = 0; i < 6; i++) {
      this.blobs.push({
        sprite: this.blobSprites[i % this.blobSprites.length],
        x: Math.random() * w, y: Math.random() * h,
        r: (0.2 + Math.random() * 0.35) * Math.max(w, h),
        sp: 0.008 + Math.random() * 0.012,
        ph: Math.random() * 6.28,
        s: 0.55 + Math.random() * 0.5,
      });
    }
  }

  private dpr = 1;

  render(t: number, shakeX: number, shakeY: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.base) ctx.drawImage(this.base, 0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.blobs) {
      const bx = b.x + Math.cos(t * b.sp + b.ph) * 60;
      const by = b.y + Math.sin(t * b.sp * 1.3 + b.ph) * 46;
      ctx.globalAlpha = 0.16 * b.s;
      ctx.drawImage(b.sprite, bx - b.r, by - b.r, b.r * 2, b.r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    // stars
    for (const s of this.stars) {
      const drift = t * 0.004 * s.z;
      let sy = (s.y + drift) % 1;
      const px = s.x * this.w + shakeX * 18 * s.z;
      const py = sy * this.h + shakeY * 18 * s.z;
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
      ctx.globalAlpha = a * s.z;
      ctx.fillStyle = s.z > 0.8 ? "#cfe4ff" : "#7688cc";
      const sz = s.z > 0.85 ? 2 : 1.2;
      ctx.fillRect(px, py, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
}
