import type { Kv } from '../core/learn/progress';

/** Browser persistence. The core only sees the Kv interface. */
export function browserStore(): Kv | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}
