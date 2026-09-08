// ─── Local high-score table ─────────────────────────────────────────────────

export interface ScoreEntry {
  name: string;
  score: number;
  lines: number;
  level: number;
  shifts: number;
  when: number;
}

const KEY = "fluxwell.highscores.v1";
const BEST_KEY = "fluxwell.best.v1";
export const MAX_ENTRIES = 10;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => typeof e?.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const list = loadScores();
  if (list.length < MAX_ENTRIES) return true;
  return score > list[list.length - 1].score;
}

export function addScore(entry: ScoreEntry): { list: ScoreEntry[]; rank: number } {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* storage unavailable */
  }
  return { list: trimmed, rank: trimmed.indexOf(entry) };
}

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* storage unavailable */
  }
}
