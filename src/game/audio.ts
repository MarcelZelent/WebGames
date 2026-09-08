// ─── FLUXWELL procedural audio — WebAudio synth, zero assets ────────────────

export type SfxName =
  | "move"
  | "rotate"
  | "deny"
  | "hold"
  | "soft"
  | "harddrop"
  | "lock"
  | "clear"
  | "cross"
  | "perfect"
  | "shift_go"
  | "shift_land"
  | "charged"
  | "levelup"
  | "danger"
  | "gameover"
  | "ready"
  | "go"
  | "ui";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  muted = localStorage.getItem("fluxwell.muted") === "1";

  // music state
  private musicTimer: number | null = null;
  private nextNoteT = 0;
  private step = 0;
  tempo = 104;
  private musicOn = false;
  private intense = false;

  /** Must be called from a user gesture at least once. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(comp);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.34;
    this.musicBus.connect(this.master);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem("fluxwell.muted", m ? "1" : "0");
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  // ── low-level voices ──────────────────────────────────────────────────────

  private tone(opts: {
    f0: number;
    f1?: number;
    t?: OscillatorType;
    dur: number;
    vol: number;
    at?: number;
    bus?: GainNode | null;
    curve?: "exp" | "lin";
  }): void {
    if (!this.ctx || !this.sfxBus) return;
    const t0 = this.ctx.currentTime + (opts.at ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = opts.t ?? "square";
    osc.frequency.setValueAtTime(Math.max(20, opts.f0), t0);
    if (opts.f1 !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.f1), t0 + opts.dur);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.vol, t0);
    if (opts.curve === "lin") g.gain.linearRampToValueAtTime(0.0001, t0 + opts.dur);
    else g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    g.connect(opts.bus ?? this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  private noise(opts: { dur: number; vol: number; freq: number; q?: number; at?: number; bus?: GainNode | null; sweepTo?: number }): void {
    if (!this.ctx || !this.sfxBus) return;
    const t0 = this.ctx.currentTime + (opts.at ?? 0);
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * opts.dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(opts.freq, t0);
    if (opts.sweepTo) filt.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + opts.dur);
    filt.Q.value = opts.q ?? 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(opts.bus ?? this.sfxBus);
    src.start(t0);
  }

  // ── public SFX ────────────────────────────────────────────────────────────

  play(name: SfxName, opt?: { n?: number; chain?: number }): void {
    if (!this.ctx || this.muted) return;
    const n = opt?.n ?? 1;
    const chain = opt?.chain ?? 0;
    switch (name) {
      case "move":
        this.tone({ f0: 220, f1: 180, t: "square", dur: 0.045, vol: 0.05 });
        break;
      case "soft":
        this.tone({ f0: 160, f1: 140, t: "square", dur: 0.03, vol: 0.028 });
        break;
      case "rotate":
        this.tone({ f0: 320, f1: 520, t: "square", dur: 0.06, vol: 0.06 });
        this.tone({ f0: 640, t: "sine", dur: 0.05, vol: 0.03, at: 0.03 });
        break;
      case "deny":
        this.tone({ f0: 110, f1: 80, t: "sawtooth", dur: 0.16, vol: 0.09 });
        this.tone({ f0: 116, f1: 83, t: "sawtooth", dur: 0.16, vol: 0.07 });
        break;
      case "hold":
        this.tone({ f0: 520, f1: 340, t: "triangle", dur: 0.09, vol: 0.08 });
        this.tone({ f0: 340, f1: 520, t: "triangle", dur: 0.09, vol: 0.06, at: 0.06 });
        break;
      case "harddrop":
        this.noise({ dur: 0.09, vol: 0.22, freq: 2400, sweepTo: 300 });
        this.tone({ f0: 160, f1: 42, t: "sine", dur: 0.16, vol: 0.5 });
        break;
      case "lock":
        this.noise({ dur: 0.05, vol: 0.14, freq: 1600 });
        this.tone({ f0: 190, f1: 90, t: "triangle", dur: 0.09, vol: 0.22 });
        break;
      case "clear": {
        // pentatonic riser, higher with combo chain
        const base = 392 * Math.pow(1.059, chain * 2);
        for (let i = 0; i < Math.min(n + 2, 7); i++) {
          this.tone({
            f0: base * Math.pow(1.335, i),
            t: "triangle",
            dur: 0.14,
            vol: 0.14,
            at: i * 0.045,
          });
        }
        this.noise({ dur: 0.25, vol: 0.12, freq: 900, sweepTo: 4200, q: 1.4 });
        this.tone({ f0: 120, f1: 55, t: "sine", dur: 0.2, vol: 0.35 });
        break;
      }
      case "cross":
        this.tone({ f0: 1244, f1: 660, t: "sawtooth", dur: 0.3, vol: 0.08 });
        this.noise({ dur: 0.4, vol: 0.16, freq: 3000, sweepTo: 500, q: 2 });
        this.tone({ f0: 98, f1: 38, t: "sine", dur: 0.35, vol: 0.5 });
        break;
      case "perfect": {
        const notes = [523, 659, 784, 1046, 1318, 1568];
        notes.forEach((f, i) => this.tone({ f0: f, t: "triangle", dur: 0.3, vol: 0.12, at: i * 0.07 }));
        this.noise({ dur: 0.7, vol: 0.14, freq: 2000, sweepTo: 6000, q: 0.6 });
        break;
      }
      case "shift_go":
        this.tone({ f0: 180, f1: 980, t: "sawtooth", dur: 0.32, vol: 0.12, curve: "lin" });
        this.noise({ dur: 0.34, vol: 0.1, freq: 500, sweepTo: 5200, q: 2 });
        break;
      case "shift_land":
        this.tone({ f0: 90, f1: 34, t: "sine", dur: 0.38, vol: 0.6 });
        this.noise({ dur: 0.2, vol: 0.2, freq: 800, sweepTo: 120 });
        this.tone({ f0: 660, f1: 990, t: "sine", dur: 0.14, vol: 0.07, at: 0.05 });
        break;
      case "charged":
        this.tone({ f0: 660, t: "sine", dur: 0.09, vol: 0.07 });
        this.tone({ f0: 990, t: "sine", dur: 0.14, vol: 0.07, at: 0.08 });
        break;
      case "levelup": {
        const notes = [392, 523, 659, 784];
        notes.forEach((f, i) => this.tone({ f0: f, t: "square", dur: 0.12, vol: 0.09, at: i * 0.06 }));
        break;
      }
      case "danger":
        this.tone({ f0: 65, f1: 45, t: "sine", dur: 0.18, vol: 0.4 });
        this.tone({ f0: 65, f1: 45, t: "sine", dur: 0.14, vol: 0.28, at: 0.22 });
        break;
      case "gameover":
        this.tone({ f0: 440, f1: 55, t: "sawtooth", dur: 0.9, vol: 0.16, curve: "lin" });
        this.tone({ f0: 446, f1: 58, t: "sawtooth", dur: 0.9, vol: 0.12, curve: "lin" });
        this.noise({ dur: 0.8, vol: 0.1, freq: 1200, sweepTo: 100 });
        break;
      case "ready":
        this.tone({ f0: 523, t: "sine", dur: 0.12, vol: 0.12 });
        break;
      case "go":
        this.tone({ f0: 784, f1: 1046, t: "square", dur: 0.16, vol: 0.14 });
        break;
      case "ui":
        this.tone({ f0: 880, f1: 660, t: "sine", dur: 0.05, vol: 0.06 });
        break;
    }
  }

  // ── adaptive music loop ───────────────────────────────────────────────────

  startMusic(): void {
    this.ensure();
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextNoteT = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      const ahead = 0.14;
      while (this.nextNoteT < this.ctx.currentTime + ahead) {
        this.scheduleStep(this.step, this.nextNoteT);
        const beatSec = 60 / this.tempo;
        this.nextNoteT += beatSec / 2; // 8th notes
        this.step = (this.step + 1) % 32;
      }
      this.musicTimer = window.setTimeout(tick, 40);
    };
    tick();
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setIntense(v: boolean): void {
    this.intense = v;
  }

  private scheduleStep(step: number, t: number): void {
    if (!this.ctx || !this.musicBus) return;
    const at = t - this.ctx.currentTime;
    const bus = this.musicBus;
    // bassline — A minor pentatonic-ish motion, 32-step loop
    const bassNotes = [55, 0, 55, 65.4, 0, 55, 0, 49, 55, 0, 55, 65.4, 0, 82.4, 73.4, 65.4, 55, 0, 55, 65.4, 0, 55, 0, 49, 43.7, 0, 49, 55, 0, 65.4, 0, 82.4];
    const bn = bassNotes[step];
    if (bn > 0) {
      this.tone({ f0: bn, t: "triangle", dur: 0.16, vol: 0.5, at, bus });
      this.tone({ f0: bn * 2.01, t: "sine", dur: 0.1, vol: 0.1, at, bus });
    }
    // kick on quarters
    if (step % 4 === 0) {
      this.tone({ f0: 130, f1: 40, t: "sine", dur: 0.11, vol: 0.75, at, bus });
    }
    // hats
    const hatEvery = this.intense ? 1 : 2;
    if (step % hatEvery === 0) {
      this.noise({ dur: 0.025, vol: step % 4 === 2 ? 0.09 : 0.045, freq: 8000, q: 1.2, at, bus });
    }
    // sparkle arp every bar when intense
    if (this.intense && step % 8 === 0) {
      const arp = [440, 523.25, 659.25, 880];
      arp.forEach((f, i) =>
        this.tone({ f0: f, t: "sine", dur: 0.09, vol: 0.05, at: at + i * 0.05, bus })
      );
    }
  }
}
