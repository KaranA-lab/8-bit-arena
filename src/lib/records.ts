// Local best records, shown in the menu. Purely a per-browser convenience.
export interface Records {
  cricket: { played: number; won: number; best: number };
  football: { played: number; won: number; goals: number };
  golf: { holes: number; aces: number; underPar: number };
  /** bestLevel: hardest bot beaten (-1 none, 0 beginner, 1 intermediate, 2 extreme) */
  badminton: { played: number; won: number; bestLevel: number };
}

const KEY = 'arena.records.v1';
const fresh = (): Records => ({
  cricket: { played: 0, won: 0, best: 0 },
  football: { played: 0, won: 0, goals: 0 },
  golf: { holes: 0, aces: 0, underPar: 0 },
  badminton: { played: 0, won: 0, bestLevel: -1 },
});

export function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const r = JSON.parse(raw);
    const f = fresh();
    return {
      cricket: { ...f.cricket, ...r.cricket },
      football: { ...f.football, ...r.football },
      golf: { ...f.golf, ...r.golf },
      badminton: { ...f.badminton, ...r.badminton },
    };
  } catch {
    return fresh();
  }
}

export function updateRecords(fn: (r: Records) => void) {
  const r = loadRecords();
  fn(r);
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* ignore */ }
}
