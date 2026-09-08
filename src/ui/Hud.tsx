// ─── HUD components: score, previews, flux dial, side panels ───────────────

import { memo, useEffect, useRef, useState } from "react";
import { Trophy, Flame, Zap, Layers, Repeat, ArrowDown } from "lucide-react";
import type { HudState } from "../game/engine";
import { PALETTE, SHAPES } from "../game/pieces";

// older Safari lacks roundRect — minimal polyfill for preview canvases
if (
  typeof CanvasRenderingContext2D !== "undefined" &&
  !CanvasRenderingContext2D.prototype.roundRect
) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    this: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
  ) {
    const rr2 = Math.min(r, w / 2, h / 2);
    this.moveTo(x + rr2, y);
    this.arcTo(x + w, y, x + w, y + h, rr2);
    this.arcTo(x + w, y + h, x, y + h, rr2);
    this.arcTo(x, y + h, x, y, rr2);
    this.arcTo(x, y, x + w, y, rr2);
    this.closePath();
    return this;
  } as typeof CanvasRenderingContext2D.prototype.roundRect;
}

// ── rolling score ────────────────────────────────────────────────────────────

export function ScoreOdometer({ value, className = "" }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const raf = useRef(0);
  const cur = useRef(value);

  useEffect(() => {
    const from = cur.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = Math.min(600, 180 + Math.abs(to - from) * 0.25);
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      cur.current = Math.round(from + (to - from) * e);
      setDisplay(cur.current);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return <span className={className}>{display.toLocaleString("en-US")}</span>;
}

// ── mini piece preview (canvas) ─────────────────────────────────────────────

function drawMini(canvas: HTMLCanvasElement, type: number, px: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = px * dpr;
  canvas.height = px * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, px, px);
  if (type < 0) return;
  const cells = SHAPES[type][0];
  let minX = 9, maxX = -9, minY = 9, maxY = -9;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const cell = Math.min(px / (w + 1.4), px / (h + 1.4));
  const ox = (px - w * cell) / 2;
  const oy = (px - h * cell) / 2;
  const color = PALETTE[type + 1];
  for (const [x, y] of cells) {
    const cx = ox + (x - minX) * cell;
    const cy = oy + (y - minY) * cell;
    const grad = ctx.createLinearGradient(0, cy, 0, cy + cell);
    grad.addColorStop(0, "#ffffffaa");
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, color);
    ctx.shadowColor = color;
    ctx.shadowBlur = cell * 0.55;
    ctx.fillStyle = grad;
    const r = cell * 0.22;
    const inset = cell * 0.06;
    ctx.beginPath();
    ctx.roundRect(cx + inset, cy + inset, cell - inset * 2, cell - inset * 2, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.roundRect(cx + inset, cy + inset, cell - inset * 2, cell - inset * 2, r);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export const PiecePreview = memo(function PiecePreview({
  type,
  size = 56,
  dim = false,
}: {
  type: number;
  size?: number;
  dim?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMini(ref.current, type, size);
  }, [type, size]);
  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, opacity: dim ? 0.35 : 1 }}
      className="transition-opacity duration-150"
    />
  );
});

// ── flux charge dial ─────────────────────────────────────────────────────────

export function FluxDial({ charge, size = 86 }: { charge: number; size?: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const ready = charge >= 1;
  return (
    <div
      className={`relative ${ready ? "pulse-ring rounded-full" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="rgba(10,14,32,0.7)" stroke="rgba(120,140,255,0.18)" strokeWidth="5" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={ready ? "#22e6ff" : "#5a86ff"}
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, charge)} ${c}`}
          style={{
            filter: ready ? "drop-shadow(0 0 6px #22e6ff)" : undefined,
            transition: "stroke-dasharray 160ms linear, stroke 200ms",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Zap size={ready ? 22 : 18} strokeWidth={2.5}
          className={ready ? "text-cyan-300" : "text-indigo-300/50"}
          style={ready ? { filter: "drop-shadow(0 0 8px #22e6ff)" } : undefined} />
        <span className={`text-[9px] font-bold tracking-widest mt-0.5 ${ready ? "text-cyan-300" : "text-indigo-300/50"}`}>
          {ready ? "FLUX" : "CHG"}
        </span>
      </div>
    </div>
  );
}

// ── side panels (desktop) ───────────────────────────────────────────────────

const PanelLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-bold tracking-[0.28em] text-indigo-300/60 mb-1.5">{children}</div>
);

function StatRow({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="flex items-center gap-1.5 text-[11px] tracking-widest text-indigo-200/60 font-semibold">
        {icon}
        {label}
      </span>
      <span className={`font-display text-sm font-bold ${accent ? "text-amber-300 text-glow-gold" : "text-indigo-50"}`}>
        {value}
      </span>
    </div>
  );
}

export const HudLeft = memo(function HudLeft({ hud }: { hud: HudState }) {
  return (
    <div className="flex flex-col gap-3 w-52">
      <div className="fw-panel fw-notch rounded-lg p-3.5">
        <PanelLabel>HOLD — C</PanelLabel>
        <div className="flex items-center justify-center h-16">
          <PiecePreview type={hud.hold} size={58} dim={!hud.canHold && hud.hold >= 0} />
          {hud.hold < 0 && <span className="text-indigo-300/30 text-xs tracking-widest">EMPTY</span>}
        </div>
      </div>

      <div className="fw-panel fw-notch rounded-lg p-3.5 flex flex-col items-center">
        <PanelLabel>GRAVITY FLUX</PanelLabel>
        <FluxDial charge={hud.shiftCharge} />
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-indigo-200/50 tracking-wider">
          <span className="fw-key">Q</span>
          <span className="fw-key">E</span>
          <span>flip the well</span>
        </div>
      </div>

      <div className="fw-panel fw-notch rounded-lg p-3.5">
        <StatRow icon={<Layers size={12} />} label="LEVEL" value={String(hud.level)} />
        <StatRow icon={<Repeat size={12} />} label="LINES" value={String(hud.lines)} />
        <StatRow icon={<Flame size={12} />} label="COMBO" value={hud.combo > 1 ? `×${hud.combo}` : "—"} accent={hud.combo > 1} />
      </div>
    </div>
  );
});

export const HudRight = memo(function HudRight({ hud }: { hud: HudState }) {
  return (
    <div className="flex flex-col gap-3 w-52">
      <div className="fw-panel fw-notch rounded-lg p-3.5">
        <div className="text-[10px] font-bold tracking-[0.28em] text-indigo-300/60">SCORE</div>
        <ScoreOdometer value={hud.score} className="font-display text-[26px] font-black text-white text-glow-cyan leading-tight" />
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-indigo-200/60">
          <Trophy size={11} className="text-amber-300/80" />
          <span className="tracking-wider">BEST</span>
          <span className="font-semibold text-indigo-100/90">{hud.hiScore.toLocaleString("en-US")}</span>
        </div>
      </div>

      <div className="fw-panel fw-notch rounded-lg p-3.5">
        <PanelLabel>NEXT</PanelLabel>
        <div className="flex flex-col items-center divide-y divide-indigo-300/10">
          {hud.next.map((t, i) => (
            <div key={i} className={`flex items-center justify-center w-full ${i === 0 ? "h-16" : "h-12 opacity-60"}`}>
              <PiecePreview type={t} size={i === 0 ? 56 : 40} />
            </div>
          ))}
        </div>
      </div>

      <div className="fw-panel fw-notch rounded-lg p-3.5 text-[10px] text-indigo-200/45 leading-relaxed">
        <PanelLabel>PROTOCOL</PanelLabel>
        <div className="flex items-center gap-1.5 mb-1"><span className="fw-key">←</span><span className="fw-key">→</span> move</div>
        <div className="flex items-center gap-1.5 mb-1"><span className="fw-key">↑</span><span className="fw-key">Z</span> spin</div>
        <div className="flex items-center gap-1.5 mb-1"><span className="fw-key">SPACE</span> slam <span className="fw-key">C</span> hold</div>
        <div className="flex items-center gap-1.5"><span className="fw-key">Q</span><span className="fw-key">E</span> FLUX — gravity flips</div>
      </div>
    </div>
  );
});

// ── mobile top bar ───────────────────────────────────────────────────────────

export const MobileBar = memo(function MobileBar({ hud }: { hud: HudState }) {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-stretch gap-2">
        <div className="fw-panel rounded-lg px-2 py-1 flex flex-col items-center justify-center min-w-[62px]">
          <span className="text-[8px] font-bold tracking-[0.2em] text-indigo-300/60">HOLD</span>
          <PiecePreview type={hud.hold} size={30} dim={!hud.canHold && hud.hold >= 0} />
        </div>
        <div className={`fw-panel rounded-lg flex-1 px-3 py-1 text-center relative ${hud.danger ? "danger-pulse" : ""}`}>
          <ScoreOdometer value={hud.score} className="font-display text-2xl font-black text-white text-glow-cyan leading-none" />
          <div className="flex justify-center gap-3 text-[9px] tracking-[0.18em] text-indigo-200/60 mt-0.5">
            <span>BEST {hud.hiScore.toLocaleString("en-US")}</span>
            <span>LV {hud.level}</span>
            <span>{hud.lines} LN</span>
          </div>
        </div>
        <div className="fw-panel rounded-lg px-2 py-1 flex flex-col items-center justify-center min-w-[62px]">
          <span className="text-[8px] font-bold tracking-[0.2em] text-indigo-300/60">NEXT</span>
          <PiecePreview type={hud.next[0]} size={30} />
        </div>
      </div>
      {/* slim flux meter */}
      <div className="mt-1.5 h-[6px] rounded-full bg-indigo-950/80 border border-indigo-300/15 overflow-hidden relative">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{
            width: `${Math.round(hud.shiftCharge * 100)}%`,
            background: hud.shiftReady
              ? "linear-gradient(90deg,#22e6ff,#7df7ff)"
              : "linear-gradient(90deg,#3b4fd8,#5a86ff)",
            boxShadow: hud.shiftReady ? "0 0 12px #22e6ff" : undefined,
          }}
        />
      </div>
      <div className={`text-center text-[9px] tracking-[0.3em] mt-0.5 font-bold ${hud.shiftReady ? "text-cyan-300 blink" : "text-indigo-300/40"}`}>
        {hud.shiftReady ? "FLUX READY" : "CHARGING FLUX"}
      </div>
    </div>
  );
});

// ── corner hint for desktop drop key ─────────────────────────────────────────

export function DropHint() {
  return (
    <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-indigo-300/40 tracking-widest">
      <ArrowDown size={11} />
      soft drop — ↓ / S
    </div>
  );
}
