export interface SaveData {
  best: Record<number, { score: number; rank: string }>;
  endlessBest: number;
  issue: number;
}
const KEY = 'bob_save_v1';

export function loadSave(): SaveData {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') return { best: d.best || {}, endlessBest: d.endlessBest || 0, issue: d.issue || 0 };
  } catch { /* ignore */ }
  return { best: {}, endlessBest: 0, issue: 0 };
}

export function writeSave(d: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
