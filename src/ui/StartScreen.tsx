// ─── Start screen ───────────────────────────────────────────────────────────

import { Play, Volume2, VolumeX, Trophy, MoveHorizontal, Zap, Grid3x3 } from "lucide-react";
import { useEffect, useState } from "react";
import { loadScores, type ScoreEntry } from "../game/highscore";
import { PiecePreview } from "./Hud";

function FloatingPieces() {
  const pieces = [
    { t: 0, size: 90, x: "6%", y: "12%", cls: "float-slow", rot: "-12deg", o: 0.5 },
    { t: 5, size: 70, x: "84%", y: "16%", cls: "float-slower", rot: "14deg", o: 0.45 },
    { t: 4, size: 64, x: "10%", y: "72%", cls: "float-slower", rot: "8deg", o: 0.4 },
    { t: 3, size: 84, x: "86%", y: "68%", cls: "float-slow", rot: "-18deg", o: 0.5 },
    { t: 2, size: 56, x: "72%", y: "86%", cls: "float-slow", rot: "22deg", o: 0.35 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {pieces.map((p, i) => (
        <div
          key={i}
          className={`absolute ${p.cls}`}
          style={{ left: p.x, top: p.y, opacity: p.o, ["--rot" as string]: p.rot, filter: "blur(0.4px)" }}
        >
          <PiecePreview type={p.t} size={p.size} />
        </div>
      ))}
    </div>
  );
}

export default function StartScreen({
  onStart,
  muted,
  onToggleMute,
  isTouch,
}: {
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}) {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  useEffect(() => setScores(loadScores()), []);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-[#05060e]/55 backdrop-blur-[3px]">
      <FloatingPieces />

      <div className="relative z-10 flex flex-col items-center px-5 py-8 max-w-3xl w-full">
        <div className="rise-in flex items-center gap-2 text-[10px] md:text-xs font-bold tracking-[0.42em] text-cyan-300/90 mb-4">
          <span className="h-px w-8 bg-cyan-300/50" />
          TETRIS // REWIRED IN GRAVITY
          <span className="h-px w-8 bg-cyan-300/50" />
        </div>

        <h1
          className="fw-title font-display font-black text-[15vw] sm:text-7xl md:text-8xl leading-none tracking-tight text-center select-none"
          style={{ animationDelay: "0.05s" }}
        >
          FLUXWELL
        </h1>

        <p className="rise-in text-indigo-200/70 text-sm md:text-base mt-4 text-center max-w-md leading-relaxed" style={{ animationDelay: "0.15s" }}>
          A square well. Four gravities. Slam pieces, then{" "}
          <span className="text-cyan-300 font-semibold">FLIP THE ARENA</span> — the whole stack
          tumbles, and lines shatter on <span className="text-violet-300 font-semibold">both axes</span>.
        </p>

        {/* rule cards */}
        <div className="rise-in grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-7 w-full max-w-xl" style={{ animationDelay: "0.25s" }}>
          {[
            { icon: <MoveHorizontal size={16} />, title: "DROP & SPIN", body: "Tight tetromino control — dash, slam, hold." },
            { icon: <Zap size={16} />, title: "FLUX THE WELL", body: isTouch ? "FLUX buttons rotate the arena 90°." : "Q / E rotates the whole arena 90°." },
            { icon: <Grid3x3 size={16} />, title: "BOTH AXES", body: "Rows AND columns collapse. Chain cascades for glory." },
          ].map((c) => (
            <div key={c.title} className="fw-panel fw-notch rounded-lg p-3.5 text-left">
              <div className="text-cyan-300 mb-1.5">{c.icon}</div>
              <div className="font-display text-[11px] font-bold tracking-[0.18em] text-white">{c.title}</div>
              <div className="text-[11px] text-indigo-200/60 mt-1 leading-snug">{c.body}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onStart}
          className="fw-btn rise-in group mt-8 flex items-center gap-3 px-10 py-4 rounded-xl font-display font-black tracking-[0.2em] text-sm md:text-base text-[#031018] bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 hover:brightness-110"
          style={{ animationDelay: "0.35s", boxShadow: "0 0 34px rgba(34,230,255,0.45), 0 0 90px rgba(120,80,255,0.25)" }}
        >
          <Play size={18} strokeWidth={3} className="transition-transform group-hover:scale-125" />
          ENGAGE
        </button>
        <div className="rise-in mt-3 text-[10px] tracking-[0.3em] text-indigo-300/50 blink" style={{ animationDelay: "0.4s" }}>
          {isTouch ? "OR TAP ANYWHERE ON THE WELL" : "PRESS ENTER"}
        </div>

        {/* keyboard legend / touch legend */}
        {!isTouch && (
          <div className="rise-in mt-7 hidden sm:flex items-center gap-4 text-[10px] text-indigo-200/50" style={{ animationDelay: "0.45s" }}>
            <span className="flex items-center gap-1"><span className="fw-key">←</span><span className="fw-key">→</span></span> move
            <span className="flex items-center gap-1"><span className="fw-key">↑</span><span className="fw-key">Z</span></span> spin
            <span className="flex items-center gap-1"><span className="fw-key">SPC</span></span> slam
            <span className="flex items-center gap-1"><span className="fw-key">C</span></span> hold
            <span className="flex items-center gap-1 text-cyan-300/80"><span className="fw-key">Q</span><span className="fw-key">E</span></span> FLUX
          </div>
        )}

        {/* high scores */}
        <div className="rise-in mt-8 w-full max-w-sm fw-panel fw-notch rounded-xl p-4 fw-marquee-sheen" style={{ animationDelay: "0.5s" }}>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] text-amber-300/90 mb-2">
            <Trophy size={12} />
            LOCAL LEGENDS
          </div>
          {scores.length === 0 ? (
            <div className="text-xs text-indigo-200/45 py-2 text-center tracking-wider">
              No records yet — the well awaits its first legend.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {scores.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className={`w-5 font-display font-bold ${i === 0 ? "text-amber-300" : "text-indigo-300/60"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 font-semibold tracking-widest text-indigo-100 truncate">{s.name}</span>
                  <span className="text-indigo-300/50">LV{s.level}</span>
                  <span className="font-display font-bold text-cyan-200">{s.score.toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onToggleMute}
          className="fw-btn rise-in mt-5 flex items-center gap-2 text-[10px] tracking-[0.3em] text-indigo-300/60 hover:text-indigo-100 transition-colors"
          style={{ animationDelay: "0.55s" }}
        >
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          SOUND {muted ? "OFF" : "ON"}
        </button>
      </div>
    </div>
  );
}
