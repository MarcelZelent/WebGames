// ─── Pooled particles + floating score text. Zero per-frame allocation. ─────

import { PALETTE } from "./pieces";

export const PARTICLE_COLORS = [...PALETTE.slice(1), "#ffffff", "#9db4ff"];
export const WHITE = 7;
export const PALE = 8;

export const K_SQUARE = 0;
export const K_STREAK = 1;
export const K_GLOW = 2;
export const K_RING = 3;
export const K_AFTER = 4;

const MAX = 720;
const TMAX = 14;

export class Particles {
  budget = 1;
  private x = new Float32Array(MAX);
  private y = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private rot = new Float32Array(MAX);
  private vr = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private kind = new Uint8Array(MAX);
  private col = new Uint8Array(MAX);
  private head = 0;

  spawn(
    px: number, py: number,
    opts: {
      vx?: number; vy?: number; life?: number; size?: number; kind?: number;
      color?: number; grav?: number; drag?: number; vr?: number; rot?: number;
    } = {}
  ): void {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.x[i] = px; this.y[i] = py;
    this.vx[i] = opts.vx ?? 0; this.vy[i] = opts.vy ?? 0;
    this.maxLife[i] = opts.life ?? 0.6;
    this.life[i] = this.maxLife[i];
    this.size[i] = opts.size ?? 0.22;
    this.kind[i] = opts.kind ?? K_SQUARE;
    this.col[i] = opts.color ?? WHITE;
    this.grav[i] = opts.grav ?? 26;
    this.drag[i] = opts.drag ?? 0.9;
    this.vr[i] = opts.vr ?? 0;
    this.rot[i] = opts.rot ?? Math.random() * 6.28;
  }

  /** Radial burst of chips (block destruction). Units: cells. */
  burst(px: number, py: number, color: number, count: number, speed = 9): void {
    const n = Math.max(2, Math.round(count * this.budget));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.spawn(px, py, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 3,
        life: 0.45 + Math.random() * 0.5,
        size: 0.1 + Math.random() * 0.2,
        kind: Math.random() < 0.35 ? K_STREAK : K_SQUARE,
        color,
        grav: 24,
        drag: 0.94,
        vr: (Math.random() - 0.5) * 18,
      });
    }
  }

  /** Sparks streaking outward (line clear). */
  streaks(axis: "h" | "v", at: number, from: number, to: number, colorSeed?: number): void {
    const count = Math.round(26 * this.budget);
    for (let i = 0; i < count; i++) {
      const along = from + Math.random() * (to - from);
      const dir = Math.random() < 0.5 ? -1 : 1;
      const s = 14 + Math.random() * 22;
      const color = colorSeed ?? (Math.random() < 0.25 ? WHITE : 1 + Math.floor(Math.random() * 7));
      if (axis === "h") {
        this.spawn(along, at + Math.random() * 0.8, {
          vx: dir * s, vy: (Math.random() - 0.5) * 4,
          life: 0.35 + Math.random() * 0.4, kind: K_STREAK,
          size: 0.5 + Math.random() * 0.5, color, grav: 0, drag: 0.92,
        });
      } else {
        this.spawn(at + Math.random() * 0.8, along, {
          vx: (Math.random() - 0.5) * 4, vy: dir * s,
          life: 0.35 + Math.random() * 0.4, kind: K_STREAK,
          size: 0.5 + Math.random() * 0.5, color, grav: 0, drag: 0.92,
        });
      }
    }
  }

  /** Soft square puff (piece landing). */
  impact(px: number, py: number, color: number, count: number): void {
    const n = Math.max(2, Math.round(count * this.budget));
    for (let i = 0; i < n; i++) {
      this.spawn(px + (Math.random() - 0.5) * 0.8, py + (Math.random() - 0.5) * 0.6, {
        vx: (Math.random() - 0.5) * 8,
        vy: -2 - Math.random() * 7,
        life: 0.3 + Math.random() * 0.35,
        size: 0.08 + Math.random() * 0.16,
        kind: K_SQUARE, color, grav: 30, drag: 0.93,
        vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  afterimage(px: number, py: number, color: number): void {
    this.spawn(px, py, { life: 0.16, size: 1, kind: K_AFTER, color, grav: 0, drag: 1 });
  }

  ring(px: number, py: number, color: number, size = 6): void {
    this.spawn(px, py, { life: 0.45, size, kind: K_RING, color, grav: 0, drag: 1 });
  }

  glowPuff(px: number, py: number, color: number): void {
    this.spawn(px, py, {
      vx: (Math.random() - 0.5) * 3, vy: -1.5 - Math.random() * 2,
      life: 0.5 + Math.random() * 0.4, size: 0.7 + Math.random() * 0.8,
      kind: K_GLOW, color, grav: -2, drag: 0.95,
    });
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const d = Math.pow(this.drag[i], dt * 60);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
    }
  }

  /**
   * Draw in cell-space (ctx already scaled so 1 unit = 1 cell).
   * atlas: pre-rendered block sprites for K_AFTER.
   */
  render(ctx: CanvasRenderingContext2D, atlas: HTMLCanvasElement[], glow: HTMLCanvasElement[]): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      const t = this.life[i] / this.maxLife[i];
      const alpha = t < 0.5 ? t * 2 : 1;
      const k = this.kind[i];
      const s = this.size[i];
      if (k === K_SQUARE) {
        ctx.globalAlpha = alpha * 0.95;
        ctx.fillStyle = PARTICLE_COLORS[this.col[i]];
        const px = this.x[i], py = this.y[i];
        ctx.translate(px, py);
        ctx.rotate(this.rot[i]);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.rotate(-this.rot[i]);
        ctx.translate(-px, -py);
      } else if (k === K_STREAK) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = PARTICLE_COLORS[this.col[i]];
        ctx.lineWidth = 0.075;
        ctx.beginPath();
        ctx.moveTo(this.x[i], this.y[i]);
        ctx.lineTo(this.x[i] - this.vx[i] * 0.035 * s, this.y[i] - this.vy[i] * 0.035 * s);
        ctx.stroke();
      } else if (k === K_GLOW) {
        ctx.globalAlpha = alpha * 0.5;
        const g = glow[this.col[i] % glow.length];
        const sz = s * 1.6;
        ctx.drawImage(g, this.x[i] - sz / 2, this.y[i] - sz / 2, sz, sz);
      } else if (k === K_RING) {
        const p = 1 - t;
        ctx.globalAlpha = t * 0.85;
        ctx.strokeStyle = PARTICLE_COLORS[this.col[i]];
        ctx.lineWidth = 0.14 * t + 0.02;
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], 0.3 + p * this.size[i], 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // K_AFTER — fading block sprite
        ctx.globalAlpha = t * 0.5;
        ctx.drawImage(atlas[this.col[i]], this.x[i] - 0.5, this.y[i] - 0.5, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ─── floating combat text ────────────────────────────────────────────────────

interface FloatText {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  scale: number;
  color: string;
  vy: number;
}

export class FloatTexts {
  private slots: FloatText[] = [];
  budget = 1;

  spawn(text: string, x: number, y: number, color = "#ffffff", scale = 1): void {
    let slot = this.slots.find((s) => s.life <= 0);
    if (!slot) {
      if (this.slots.length < TMAX) {
        slot = { text, x, y, life: 0, maxLife: 1, scale, color, vy: 0 };
        this.slots.push(slot);
      } else {
        slot = this.slots[0];
      }
    }
    slot.text = text;
    slot.x = x;
    slot.y = y;
    slot.maxLife = 0.9 + scale * 0.25;
    slot.life = slot.maxLife;
    slot.scale = scale;
    slot.color = color;
    slot.vy = -2.4;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.y += s.vy * dt;
      s.vy *= Math.pow(0.92, dt * 60);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const s of this.slots) {
      if (s.life <= 0) continue;
      const t = s.life / s.maxLife;
      const pop = t > 0.86 ? 1 + (t - 0.86) * 3.2 : 1;
      ctx.globalAlpha = Math.min(1, t * 2.4);
      ctx.font = `900 ${(0.66 * s.scale * pop).toFixed(3)}px Unbounded, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }
}
