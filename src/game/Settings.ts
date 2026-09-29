import type { Difficulty } from '../config';
import { loadJson, save } from '../core/Storage';

export interface Settings {
  difficulty: Difficulty;
  /** 'auto' = on for touch/gamepad, hold-to-fire on keyboard. */
  autofire: 'auto' | 'on' | 'off';
  shake: boolean;
  flashes: boolean;
  scanlines: boolean;
  quality: 'auto' | 'high' | 'low';
  showFps: boolean;
  seenHelp: boolean;
}

const DEFAULTS: Settings = {
  difficulty: 'normal',
  autofire: 'auto',
  shake: true,
  flashes: true,
  scanlines: true,
  quality: 'auto',
  showFps: false,
  seenHelp: false,
};

export const settings: Settings = loadJson('settings', DEFAULTS);
if (!['easy', 'normal', 'hard'].includes(settings.difficulty)) settings.difficulty = 'normal';

export function saveSettings(): void {
  save('settings', settings);
}

// ── local leaderboard ───────────────────────────────────────────────────────

export interface ScoreEntry {
  score: number;
  rank: string;
  won: boolean;
  loop: number;
  date: string;
}

type Board = Record<Difficulty, ScoreEntry[]>;

const board: Board = loadJson<Board>('scores', { easy: [], normal: [], hard: [] });
for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) if (!Array.isArray(board[d])) board[d] = [];

export function topScores(d: Difficulty): ScoreEntry[] {
  return board[d];
}

export function bestScore(d: Difficulty): number {
  return board[d][0]?.score ?? 0;
}

/** Records a run; returns its 0-based place on the board, or -1. */
export function recordScore(d: Difficulty, e: ScoreEntry): number {
  if (e.score <= 0) return -1;
  const list = board[d];
  list.push(e);
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, 8);
  save('scores', board);
  return list.indexOf(e);
}
