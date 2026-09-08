// ─── Touch control pad ──────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, RotateCw, RotateCcw, ArrowDownToLine, Package, RefreshCw } from "lucide-react";

interface PadProps {
  onHold: (which: "left" | "right" | "down", v: boolean) => void;
  onPress: (name: "rotCW" | "hard" | "hold" | "shiftL" | "shiftR") => void;
  shiftReady: boolean;
}

function HoldButton({
  className = "",
  children,
  onHoldChange,
  label,
  accent,
}: {
  className?: string;
  children: React.ReactNode;
  onHoldChange: (v: boolean) => void;
  label: string;
  accent?: "cyan" | "rose";
}) {
  const [held, setHeld] = useState(false);
  const set = (v: boolean) => {
    setHeld(v);
    onHoldChange(v);
  };
  const ring =
    accent === "cyan"
      ? "text-cyan-200"
      : accent === "rose"
      ? "text-rose-200"
      : "text-indigo-100";
  return (
    <button
      className={`fw-pad-btn fw-panel rounded-xl flex flex-col items-center justify-center gap-0.5 ${ring} ${held ? "fw-held" : ""} ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      <span className="text-[7px] font-bold tracking-[0.22em] opacity-60">{label}</span>
    </button>
  );
}

function TapButton({
  className = "",
  children,
  onTap,
  label,
  glow,
}: {
  className?: string;
  children: React.ReactNode;
  onTap: () => void;
  label: string;
  glow?: boolean;
}) {
  const [held, setHeld] = useState(false);
  return (
    <button
      className={`fw-pad-btn fw-panel rounded-xl flex flex-col items-center justify-center gap-0.5 ${held ? "fw-held" : ""} ${className}`}
      style={glow ? { boxShadow: "0 0 20px rgba(34,230,255,0.35), inset 0 0 14px rgba(34,230,255,0.12)", borderColor: "rgba(34,230,255,0.5)" } : undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        setHeld(true);
        onTap();
      }}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      <span className="text-[7px] font-bold tracking-[0.22em] opacity-60">{label}</span>
    </button>
  );
}

export default function TouchPad({ onHold, onPress, shiftReady }: PadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={padRef} className="w-full max-w-md mx-auto px-1 pb-1 select-none" style={{ touchAction: "none" }}>
      {/* utility row */}
      <div className="flex gap-2 mb-2">
        <TapButton className="h-11 flex-1 text-indigo-100" onTap={() => onPress("hold")} label="HOLD">
          <Package size={17} />
        </TapButton>
        <TapButton
          className={`h-11 flex-1 ${shiftReady ? "text-cyan-200" : "text-indigo-300/50"}`}
          onTap={() => onPress("shiftL")}
          label="FLUX ⟲"
          glow={shiftReady}
        >
          <RotateCcw size={17} />
        </TapButton>
        <TapButton
          className={`h-11 flex-1 ${shiftReady ? "text-cyan-200" : "text-indigo-300/50"}`}
          onTap={() => onPress("shiftR")}
          label="FLUX ⟳"
          glow={shiftReady}
        >
          <RotateCw size={17} />
        </TapButton>
      </div>
      {/* primary row */}
      <div className="flex gap-2">
        <HoldButton className="h-[60px] flex-[1.1] text-indigo-50" onHoldChange={(v) => onHold("left", v)} label="LEFT">
          <ChevronLeft size={22} strokeWidth={2.6} />
        </HoldButton>
        <HoldButton className="h-[60px] flex-1 text-indigo-100" onHoldChange={(v) => onHold("down", v)} label="DROP">
          <ChevronDown size={22} strokeWidth={2.6} />
        </HoldButton>
        <HoldButton className="h-[60px] flex-[1.1] text-indigo-50" onHoldChange={(v) => onHold("right", v)} label="RIGHT">
          <ChevronRight size={22} strokeWidth={2.6} />
        </HoldButton>
        <TapButton className="h-[60px] flex-1 text-violet-200" onTap={() => onPress("rotCW")} label="SPIN">
          <RefreshCw size={19} />
        </TapButton>
        <TapButton className="h-[60px] flex-[1.2] text-rose-200" onTap={() => onPress("hard")} label="SLAM">
          <ArrowDownToLine size={21} strokeWidth={2.6} />
        </TapButton>
      </div>
    </div>
  );
}
