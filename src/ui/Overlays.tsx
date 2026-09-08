// ─── Pause + game-over overlays, high-score entry & table ───────────────────

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Home, Volume2, VolumeX, Trophy, Crown, Zap, Flame, Layers } from "lucide-react";
import type { GameOverStats } from "../game/engine";
import { addScore, loadScores, qualifies, type ScoreEntry } from "../game/highscore";
import { ScoreOdometer } from "./Hud";

function NeonButton({
  children,
  onClick,
  primary = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`fw-btn flex items-center justify-center gap-2 rounded-lg font-display font-bold tracking-[0.18em] text-xs px-5 py-3 ${
        primary
          ? "text-[#031018] bg-gradient-to-r from-cyan-300 to-violet-300 hover:brightness-110"
          : "fw-panel text-indigo-100 hover:border-cyan-300/50 hover:text-white"
      } ${className}`}
      style={primary ? { boxShadow: "0 0 24px rgba(34,230,255,0.35)" } : undefined}
    >
      {children}
    </button>
  );
}

export function PauseOverlay({
  onResume,
  onRestart,
  onQuit,
  muted,
  onToggleMute,
  isTouch,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#05060e]/70 backdrop-blur-md">
      <div className="pop-in flex flex-col items-center px-6">
        <div className="text-[10px] font-bold tracking-[0.45em] text-cyan-300/80 mb-2">SYSTEMS HELD</div>
        <h2 className="font-display font-black text-5xl text-white text-glow-cyan mb-8">PAUSED</h2>
        <div className="flex flex-col gap-2.5 w-56">
          <NeonButton primary onClick={onResume}>
            <Play size={15} strokeWidth={3} /> RESUME
          </NeonButton>
          <NeonButton onClick={onRestart}>
            <RotateCcw size={14} /> RESTART
          </NeonButton>
          <NeonButton onClick={onToggleMute}>
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />} SOUND {muted ? "OFF" : "ON"}
          </NeonButton>
          <NeonButton onClick={onQuit}>
            <Home size={14} /> ABANDON RUN
          </NeonButton>
        </div>
        {!isTouch && (
          <div className="mt-6 text-[10px] tracking-[0.3em] text-indigo-300/45">ESC / P — RESUME</div>
        )}
      </div>
    </div>
  );
}

export function GameOverOverlay({
  stats,
  prevBest,
  onRestart,
  onQuit,
  isTouch,
}: {
  stats: GameOverStats;
  prevBest: number;
  onRestart: () => void;
  onQuit: () => void;
  isTouch: boolean;
}) {
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [name, setName] = useState(() => localStorage.getItem("fluxwell.name") ?? "");
  const [savedRank, setSavedRank] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const eligible = qualifies(stats.score);
  const isBest = stats.score > prevBest && stats.score > 0;

  useEffect(() => {
    if (eligible && inputRef.current && !isTouch) inputRef.current.focus();
  }, [eligible, isTouch]);

  const save = () => {
    const clean = (name.trim() || "ANON").toUpperCase().slice(0, 8);
    localStorage.setItem("fluxwell.name", clean);
    const { list, rank } = addScore({
      name: clean,
      score: stats.score,
      lines: stats.lines,
      level: stats.level,
      shifts: stats.shifts,
      when: Date.now(),
    });
    setScores(list);
    setSavedRank(rank);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#05060e]/72 backdrop-blur-md overflow-y-auto">
      <div className="pop-in flex flex-col items-center px-5 py-6 max-w-lg w-full">
        <div className="text-[10px] font-bold tracking-[0.45em] text-rose-400/90 mb-1.5">SIGNAL TERMINATED</div>
        <h2 className="fw-title font-display font-black text-4xl sm:text-5xl text-center">WELL COLLAPSED</h2>

        {isBest && (
          <div className="mt-3 flex items-center gap-1.5 text-amber-300 text-xs font-bold tracking-[0.25em] text-glow-gold">
            <Crown size={14} /> NEW PERSONAL BEST
          </div>
        )}

        <div className="mt-5 text-center">
          <div className="text-[10px] tracking-[0.35em] text-indigo-300/60">FINAL SCORE</div>
          <ScoreOdometer value={stats.score} className="font-display text-5xl font-black text-white text-glow-cyan" />
        </div>

        <div className="grid grid-cols-4 gap-2 mt-5 w-full max-w-md">
          {[
            { icon: <Layers size={12} />, label: "LINES", v: stats.lines },
            { icon: <Zap size={12} />, label: "LEVEL", v: stats.level },
            { icon: <RotateCcw size={12} />, label: "FLUXES", v: stats.shifts },
            { icon: <Flame size={12} />, label: "MAX COMBO", v: stats.maxCombo > 0 ? `×${stats.maxCombo}` : "—" },
          ].map((s) => (
            <div key={s.label} className="fw-panel rounded-lg py-2.5 px-1 text-center">
              <div className="flex items-center justify-center gap-1 text-[8px] tracking-[0.2em] text-indigo-300/55 font-bold">
                {s.icon}
                {s.label}
              </div>
              <div className="font-display font-bold text-lg text-indigo-50 mt-0.5">{s.v}</div>
            </div>
          ))}
        </div>

        {/* name entry */}
        {eligible && savedRank < 0 && (
          <form
            className="mt-5 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""))}
              maxLength={8}
              placeholder="YOUR CALLSIGN"
              className="fw-input rounded-lg w-44 px-3 py-2.5 text-center font-display font-bold text-cyan-200 text-sm placeholder:text-indigo-300/30 placeholder:tracking-[0.2em]"
            />
            <button
              type="submit"
              className="fw-btn rounded-lg px-4 py-2.5 font-display font-bold text-xs tracking-[0.15em] text-[#031018] bg-gradient-to-r from-amber-300 to-amber-200 hover:brightness-110"
            >
              ETCH
            </button>
          </form>
        )}

        {/* table */}
        {scores.length > 0 && (
          <div className="mt-5 w-full max-w-md fw-panel fw-notch rounded-xl p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] text-amber-300/90 mb-2">
              <Trophy size={12} /> HALL OF FLUX
            </div>
            <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-1">
              {scores.map((s, i) => (
                <div
                  key={`${s.when}-${i}`}
                  className={`flex items-center gap-3 text-xs rounded px-1.5 py-1 ${
                    i === savedRank ? "bg-cyan-400/15 border border-cyan-300/30" : "border border-transparent"
                  }`}
                >
                  <span className={`w-5 font-display font-bold ${i === 0 ? "text-amber-300" : "text-indigo-300/60"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 font-semibold tracking-widest text-indigo-100 truncate">{s.name}</span>
                  <span className="text-indigo-300/50 text-[10px]">LV{s.level}</span>
                  <span className="font-display font-bold text-cyan-200">{s.score.toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2.5 mt-6">
          <NeonButton primary onClick={onRestart}>
            <RotateCcw size={14} strokeWidth={3} /> RUN IT BACK
          </NeonButton>
          <NeonButton onClick={onQuit}>
            <Home size={14} /> TITLE
          </NeonButton>
        </div>
        {!isTouch && (
          <div className="mt-4 text-[10px] tracking-[0.3em] text-indigo-300/45 blink">ENTER — INSTANT RESTART</div>
        )}
      </div>
    </div>
  );
}
