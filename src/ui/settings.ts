import { DEFAULT_REMAP, type Remap } from '../input/standard';

export interface Settings {
  assist: 'assisted' | 'manual';
  invert: boolean;
  rumble: boolean;
  text: 'normal' | 'large';
  remap: Remap;
  introDone: boolean;
}

export const SETTINGS_KEY = 'bluewater.settings.v1';

export function defaultSettings(): Settings {
  return {
    assist: 'assisted',
    invert: false,
    rumble: true,
    text: 'normal',
    remap: { ...DEFAULT_REMAP },
    introDone: false,
  };
}

export interface Kv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): Kv | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function remapOf(value: unknown): Remap {
  const base = { ...DEFAULT_REMAP };
  if (!value || typeof value !== 'object') return base;
  const raw = value as Partial<Remap>;
  for (const key of ['sheetIn', 'sheetOut', 'hike', 'moveIn'] as const) {
    const n = raw[key];
    if (typeof n === 'number' && n >= 0 && n <= 15 && n !== 8 && n !== 9) base[key] = Math.floor(n);
  }
  return base;
}

export function loadSettings(store?: Kv | null): Settings {
  const kv = store === undefined ? browserStore() : store;
  const fresh = defaultSettings();
  if (!kv) return fresh;
  try {
    const raw = kv.getItem(SETTINGS_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      assist: parsed.assist === 'manual' ? 'manual' : 'assisted',
      invert: !!parsed.invert,
      rumble: parsed.rumble === false ? false : true,
      text: parsed.text === 'large' ? 'large' : 'normal',
      remap: remapOf(parsed.remap),
      introDone: !!parsed.introDone,
    };
  } catch {
    return fresh;
  }
}

export function saveSettings(settings: Settings, store?: Kv | null): void {
  const kv = store === undefined ? browserStore() : store;
  if (!kv) return;
  kv.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
