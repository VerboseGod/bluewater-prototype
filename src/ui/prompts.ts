export type GlyphId = 'ls' | 'rs' | 'rt' | 'lt' | 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'view' | 'menu' | 'dpad';

export interface Prompt {
  glyph: GlyphId;
  label: string;
}

export interface PromptContext {
  screen: 'main' | 'pause' | 'settings' | 'controls' | 'remap' | 'play' | 'learn-menu' | 'intro';
  mode: 'open' | 'dock' | 'harbour' | 'learn' | 'coop';
  assisted: boolean;
  heeling: boolean;
  /** A tack was just completed, so the tack prompt should leave. */
  afterTack: boolean;
  tacking: boolean;
  intro: boolean;
}

/** Only the actions that do something right now. */
export function promptsFor(ctx: PromptContext): Prompt[] {
  if (ctx.screen === 'main') return [
    { glyph: 'dpad', label: 'Move' },
    { glyph: 'ls', label: 'Move' },
    { glyph: 'a', label: 'Select' },
  ];
  if (ctx.screen === 'pause' || ctx.screen === 'settings' || ctx.screen === 'controls') return [
    { glyph: 'dpad', label: 'Move' },
    { glyph: 'a', label: 'Select' },
    { glyph: 'b', label: 'Back' },
  ];
  if (ctx.screen === 'remap') return [
    { glyph: 'a', label: 'Press the new button' },
    { glyph: 'b', label: 'Cancel' },
  ];
  if (ctx.screen === 'learn-menu') return [
    { glyph: 'dpad', label: 'Move' },
    { glyph: 'a', label: 'Start' },
    { glyph: 'b', label: 'Back' },
  ];
  if (ctx.intro) return [
    { glyph: 'ls', label: 'Steer' },
    { glyph: 'rt', label: 'Trim in' },
    { glyph: 'a', label: 'Tack' },
    { glyph: 'b', label: 'Skip' },
  ];
  if (ctx.mode === 'coop') return [
    { glyph: 'ls', label: 'Helm steers' },
    { glyph: 'rt', label: 'Crew trims in' },
    { glyph: 'lt', label: 'Crew eases' },
    { glyph: 'a', label: 'Hike' },
    { glyph: 'rb', label: 'Ready about' },
    { glyph: 'view', label: 'Controls' },
    { glyph: 'menu', label: 'Pause' },
  ];
  const prompts: Prompt[] = [];
  if (ctx.tacking) prompts.push({ glyph: 'ls', label: 'Through the wind' }, { glyph: 'a', label: 'Tacking' });
  else if (ctx.afterTack) prompts.push({ glyph: 'ls', label: 'Straighten up' });
  else prompts.push({ glyph: 'ls', label: 'Steer' });
  if (!ctx.assisted) {
    prompts.push({ glyph: 'rt', label: 'Trim in' });
    prompts.push({ glyph: 'lt', label: 'Ease sheet' });
    prompts.push({ glyph: 'a', label: 'Hike' });
    prompts.push({ glyph: 'b', label: 'Move in' });
  } else if (ctx.heeling) prompts.push({ glyph: 'a', label: 'Hike' });
  else if (!ctx.tacking && !ctx.afterTack) prompts.push({ glyph: 'a', label: 'Tack' });
  if (ctx.mode === 'dock' || ctx.mode === 'harbour') {
    prompts.push({ glyph: 'rb', label: 'Mooring line' });
    prompts.push({ glyph: 'rs', label: 'Anchor' });
    prompts.push({ glyph: 'lb', label: 'Wind' });
  }
  if (ctx.mode === 'harbour') prompts.push({ glyph: 'dpad', label: 'Paddle' });
  if (ctx.mode === 'dock') prompts.push({ glyph: 'dpad', label: 'Scope' });
  prompts.push({ glyph: 'view', label: 'Controls' });
  prompts.push({ glyph: 'menu', label: 'Pause' });
  return dedupe(prompts);
}

function dedupe(prompts: Prompt[]): Prompt[] {
  const seen = new Set<string>();
  const out: Prompt[] = [];
  for (const prompt of prompts) {
    const key = `${prompt.glyph}:${prompt.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(prompt);
  }
  return out;
}

export const GLYPH_LETTER: Record<GlyphId, string> = {
  ls: 'LS',
  rs: 'RS',
  rt: 'RT',
  lt: 'LT',
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  lb: 'LB',
  rb: 'RB',
  view: 'View',
  menu: 'Menu',
  dpad: 'D-pad',
};
