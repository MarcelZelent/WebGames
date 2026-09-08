// ─── FLUXWELL — app shell & orchestration ───────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Volume2, VolumeX } from "lucide-react";
import { GameEngine, type HudState, type GameOverStats } from "./game/engine";
import { Renderer, Backdrop } from "./game/renderer";
import { Sfx } from "./game/audio";
import { loadBest, saveBest } from "./game/highscore";
import { HudLeft, HudRight, MobileBar } from "./ui/Hud";
import StartScreen from "./ui/StartScreen";
import { PauseOverlay, GameOverOverlay } from "./ui/Overlays";
import TouchPad from "./ui/TouchPad";

type Screen = "start" | "playing" | "paused" | "gameover";

const DEFAULT_HUD: HudState = {
  score: 0, lines: 0, level: 1, combo: 0, hiScore: 0,
  next: [0, 1, 2], hold: -1, canHold: true,
  shiftCharge: 1, shiftReady: true, danger: false,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [stats, setStats] = useState<GameOverStats | null>(null);
  const [muted, setMuted] = useState(() => localStorage.getItem("fluxwell.muted") === "1");
  const [isTouch, setIsTouch] = useState(
    () => window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window
  );

  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);

  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const backdropRef = useRef<Backdrop | null>(null);
  const sfxRef = useRef<Sfx | null>(null);
  const screenRef = useRef<Screen>("start");
  const prevBestRef = useRef(0);
  const cellCssRef = useRef(24);

  screenRef.current = screen;

  if (!sfxRef.current) sfxRef.current = new Sfx();
  const sfx = sfxRef.current;

  // ── engine lifecycle + render loop ────────────────────────────────────────

  useEffect(() => {
    const canvas = stageCanvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!canvas || !bgCanvas) return;

    const best = loadBest();
    prevBestRef.current = best;
    const engine = new GameEngine(
      {
        onHud: (h) => setHud(h),
        onPhase: () => {},
        onGameOver: (st) => {
          saveBest(Math.max(loadBest(), st.score));
          setStats(st);
          setScreen("gameover");
        },
      },
      best
    );
    engine.sfx = sfxRef.current;
    engineRef.current = engine;

    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    const backdrop = new Backdrop(bgCanvas);
    backdropRef.current = backdrop;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.8 : 2);
    if (coarse) {
      engine.particles.budget = 0.65;
      engine.texts.budget = 1;
    }

    // size stage square inside its box
    const box = stageBoxRef.current;
    const sizeStage = () => {
      if (!box) return;
      const r = box.getBoundingClientRect();
      const side = Math.max(180, Math.floor(Math.min(r.width, r.height)));
      cellCssRef.current = side / 14;
      canvas.style.width = `${side}px`;
      canvas.style.height = `${side}px`;
      renderer.resize(side, dpr);
    };
    sizeStage();
    const ro = new ResizeObserver(sizeStage);
    if (box) ro.observe(box);

    const sizeBg = () => backdrop.resize(window.innerWidth, window.innerHeight, Math.min(dpr, 1.6));
    sizeBg();
    window.addEventListener("resize", sizeBg);

    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      let dt = t - last;
      last = t;
      if (dt > 66) dt = 66; // tab-switch clamp
      if (screenRef.current === "playing") engine.update(dt);
      renderer.render(engine, t / 1000);
      backdrop.render(t / 1000, engine.shakeX, engine.shakeY);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", sizeBg);
      engine.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // touch detection upgrade + audio unlock on any gesture
  useEffect(() => {
    const onTouch = () => setIsTouch(true);
    const unlock = () => sfx.ensure();
    window.addEventListener("touchstart", onTouch, { once: true, passive: true });
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("pointerdown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-pause when tab hidden
  useEffect(() => {
    const vis = () => {
      if (document.hidden && screenRef.current === "playing") setScreen("paused");
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  // ── actions ───────────────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    sfx.ensure();
    prevBestRef.current = loadBest();
    e.newGame();
    sfx.startMusic();
    setScreen("playing");
  }, [sfx]);

  const resume = useCallback(() => {
    sfx.ensure();
    engineRef.current?.resumeFromPause();
    setScreen("playing");
  }, [sfx]);

  const quitToMenu = useCallback(() => {
    engineRef.current?.abort();
    sfx.stopMusic();
    setScreen("start");
  }, [sfx]);

  const toggleMute = useCallback(() => {
    sfx.ensure();
    const m = !sfx.muted;
    sfx.setMuted(m);
    setMuted(m);
  }, [sfx]);

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) return;
      const e = engineRef.current;
      if (!e) return;
      const s = screenRef.current;
      const c = ev.code;

      if (c === "KeyM") {
        toggleMute();
        return;
      }

      if (s === "start") {
        if (c === "Enter" || c === "Space") {
          ev.preventDefault();
          startGame();
        }
        return;
      }
      if (s === "gameover") {
        if (c === "Enter" || c === "KeyR") startGame();
        if (c === "Escape") quitToMenu();
        return;
      }
      if (s === "paused") {
        if (c === "Escape" || c === "KeyP" || c === "Enter") resume();
        if (c === "KeyR") startGame();
        return;
      }

      // playing
      switch (c) {
        case "ArrowLeft":
        case "KeyA":
          e.input.left = true;
          ev.preventDefault();
          break;
        case "ArrowRight":
        case "KeyD":
          e.input.right = true;
          ev.preventDefault();
          break;
        case "ArrowDown":
        case "KeyS":
          e.input.down = true;
          ev.preventDefault();
          break;
        case "ArrowUp":
        case "KeyX":
          if (!ev.repeat) e.press("rotCW");
          ev.preventDefault();
          break;
        case "KeyZ":
          if (!ev.repeat) e.press("rotCCW");
          break;
        case "Space":
          if (!ev.repeat) e.press("hard");
          ev.preventDefault();
          break;
        case "KeyC":
        case "ShiftLeft":
        case "ShiftRight":
          if (!ev.repeat) e.press("hold");
          break;
        case "KeyQ":
          if (!ev.repeat) e.press("shiftL");
          break;
        case "KeyE":
          if (!ev.repeat) e.press("shiftR");
          break;
        case "KeyP":
        case "Escape":
          setScreen("paused");
          break;
      }
    };
    const up = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (!e) return;
      switch (ev.code) {
        case "ArrowLeft":
        case "KeyA":
          e.input.left = false;
          break;
        case "ArrowRight":
        case "KeyD":
          e.input.right = false;
          break;
        case "ArrowDown":
        case "KeyS":
          e.input.down = false;
          break;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startGame, resume, quitToMenu, toggleMute]);

  // ── board gestures (touch + mouse drag) ───────────────────────────────────

  const gesture = useRef<{
    id: number; startX: number; startY: number; lastX: number; lastY: number;
    startT: number; accumX: number; soft: boolean; hard: boolean; moved: number;
    lastTapT: number;
  } | null>(null);

  const onStageDown = useCallback((ev: React.PointerEvent) => {
    if (screenRef.current !== "playing") return;
    const e = engineRef.current;
    if (!e) return;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    gesture.current = {
      id: ev.pointerId, startX: ev.clientX, startY: ev.clientY,
      lastX: ev.clientX, lastY: ev.clientY, startT: performance.now(),
      accumX: 0, soft: false, hard: false, moved: 0,
      lastTapT: gesture.current?.lastTapT ?? 0,
    };
  }, []);

  const onStageMove = useCallback((ev: React.PointerEvent) => {
    const g = gesture.current;
    const e = engineRef.current;
    if (!g || !e || ev.pointerId !== g.id) return;
    const step = cellCssRef.current;
    g.accumX += ev.clientX - g.lastX;
    g.moved += Math.abs(ev.clientX - g.lastX) + Math.abs(ev.clientY - g.lastY);
    const now = performance.now();

    while (g.accumX >= step) { g.accumX -= step; e.nudge(1); }
    while (g.accumX <= -step) { g.accumX += step; e.nudge(-1); }

    if (!g.hard) {
      const dyTotal = ev.clientY - g.startY;
      // fast downward flick = slam; slow drag = soft drop
      if (dyTotal > step * 1.9 && now - g.startT < 250) {
        g.hard = true;
        e.press("hard");
      } else if (dyTotal > step * 1.4) {
        g.soft = true;
        e.setSoft(true);
      }
    }
    g.lastX = ev.clientX;
    g.lastY = ev.clientY;
  }, []);

  const onStageUp = useCallback((ev: React.PointerEvent) => {
    const g = gesture.current;
    const e = engineRef.current;
    if (!g || !e || ev.pointerId !== g.id) return;
    if (g.soft) e.setSoft(false);
    const dt = performance.now() - g.startT;
    const dist = Math.hypot(ev.clientX - g.startX, ev.clientY - g.startY);
    if (dt < 230 && dist < 16 && !g.hard) {
      const now = performance.now();
      if (now - g.lastTapT < 300) {
        e.press("hold");
        g.lastTapT = 0;
      } else {
        e.press("rotCW");
        g.lastTapT = now;
      }
    }
    gesture.current = { ...g, id: -1 };
  }, []);

  // ── render ────────────────────────────────────────────────────────────────

  const inGame = screen === "playing" || screen === "paused" || screen === "gameover";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05060e]" style={{ height: "100dvh" }}>
      <canvas ref={bgCanvasRef} className="fixed inset-0 z-0" />

      {/* scanlines + vignette flavor */}
      <div className="pointer-events-none fixed inset-0 z-40 fw-scanlines fw-vignette rounded-none" />

      {/* game layer */}
      <div
        className={`relative z-10 h-full flex flex-col transition-opacity duration-500 ${inGame ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        {/* top area */}
        <div className="px-3 pt-3 lg:pt-4 lg:px-6 flex items-start justify-center relative">
          <div className="lg:hidden w-full max-w-md flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <MobileBar hud={hud} />
            </div>
            {screen === "playing" && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setScreen("paused")}
                  className="fw-btn fw-panel rounded-lg w-9 h-9 flex items-center justify-center text-indigo-200/80"
                  aria-label="pause"
                >
                  <Pause size={15} />
                </button>
                <button
                  onClick={toggleMute}
                  className="fw-btn fw-panel rounded-lg w-9 h-9 flex items-center justify-center text-indigo-200/80"
                  aria-label="mute"
                >
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              </div>
            )}
          </div>
          <div className="hidden lg:flex absolute left-6 top-4 items-center gap-3">
            <span className="fw-title font-display font-black text-xl tracking-tight">FLUXWELL</span>
          </div>
        </div>

        {/* middle: panels + stage */}
        <div className="flex-1 min-h-0 flex items-center justify-center gap-6 px-3 py-2 relative">
          <div className="hidden lg:flex"><HudLeft hud={hud} /></div>

          <div ref={stageBoxRef} className="flex-1 min-w-0 min-h-0 h-full flex items-center justify-center">
            <div
              className={`relative fw-stage-frame fw-scanlines rounded-[10px] no-touch ${hud.danger && screen === "playing" ? "danger-pulse" : ""}`}
              style={{ boxShadow: hud.danger ? "0 0 44px rgba(255,45,80,0.28), inset 0 0 46px rgba(8,10,24,0.9)" : undefined }}
              onPointerDown={onStageDown}
              onPointerMove={onStageMove}
              onPointerUp={onStageUp}
              onPointerCancel={onStageUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              <canvas ref={stageCanvasRef} />
            </div>
          </div>

          <div className="hidden lg:flex"><HudRight hud={hud} /></div>
        </div>

        {/* touch pad */}
        <div className={`${isTouch ? "block" : "hidden"} pb-[max(10px,env(safe-area-inset-bottom))]`}>
          <TouchPad
            shiftReady={hud.shiftReady}
            onHold={(w, v) => {
              const e = engineRef.current;
              if (!e) return;
              if (w === "left") e.input.left = v;
              else if (w === "right") e.input.right = v;
              else e.input.down = v;
            }}
            onPress={(name) => engineRef.current?.press(name)}
          />
        </div>

        {/* floating pause / mute (desktop) */}
        {screen === "playing" && (
          <div className="hidden lg:flex absolute right-5 top-4 z-20 gap-2">
            <button
              onClick={toggleMute}
              className="fw-btn fw-panel rounded-lg w-9 h-9 flex items-center justify-center text-indigo-200/80 hover:text-white"
              aria-label="mute"
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <button
              onClick={() => setScreen("paused")}
              className="fw-btn fw-panel rounded-lg w-9 h-9 flex items-center justify-center text-indigo-200/80 hover:text-white"
              aria-label="pause"
            >
              <Pause size={15} />
            </button>
          </div>
        )}
      </div>

      {/* screens */}
      {screen === "start" && (
        <StartScreen onStart={startGame} muted={muted} onToggleMute={toggleMute} isTouch={isTouch} />
      )}
      {screen === "paused" && (
        <PauseOverlay
          onResume={resume}
          onRestart={startGame}
          onQuit={quitToMenu}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
        />
      )}
      {screen === "gameover" && stats && (
        <GameOverOverlay
          stats={stats}
          prevBest={prevBestRef.current}
          onRestart={startGame}
          onQuit={quitToMenu}
          isTouch={isTouch}
        />
      )}

    </div>
  );
}
