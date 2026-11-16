import type { LessonId } from './model';

export interface Progress {
  stars: Partial<Record<LessonId, number>>;
  done: LessonId[];
}

export interface Kv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROGRESS_KEY = 'bluewater.learn.v1';

export function emptyProgress(): Progress {
  return { stars: {}, done: [] };
}

function browserStore(): Kv | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(store?: Kv | null): Progress {
  const kv = store === undefined ? browserStore() : store;
  if (!kv) return emptyProgress();
  try {
    const raw = kv.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const stars = parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {};
    const done = Array.isArray(parsed.done) ? parsed.done.filter((id): id is LessonId => typeof id === 'string') : [];
    return { stars, done };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: Progress, store?: Kv | null): void {
  const kv = store === undefined ? browserStore() : store;
  if (!kv) return;
  kv.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function recordPass(progress: Progress, id: LessonId, stars: number): Progress {
  const prev = progress.stars[id] ?? 0;
  return {
    stars: { ...progress.stars, [id]: Math.max(prev, stars) },
    done: progress.done.includes(id) ? progress.done : [...progress.done, id],
  };
}
