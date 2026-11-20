import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', 'core');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** Drop comments and string literals so a phase named "window" is not a global. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '""')
    .replace(/'(?:\\.|[^'\n])*'/g, '""')
    .replace(/"(?:\\.|[^"\n])*"/g, '""');
}

const BROWSER = /\b(window|document|navigator|localStorage|sessionStorage|HTMLElement|Document|Gamepad|CanvasRenderingContext2D|requestAnimationFrame|DOMParser|indexedDB|fetch|alert|location|history)\b/;

describe('core stays engine-free', () => {
  const files = walk(ROOT);

  it('has the sailing modules and no three.js or browser globals', () => {
    expect(files.length).toBeGreaterThan(20);
    const hits: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const rel = file.slice(ROOT.length + 1);
      if (/from\s+['"]three(\/|['"])/.test(source)) hits.push(`${rel} imports three`);
      if (/from\s+['"][^'"]*\/src\//.test(source)) hits.push(`${rel} imports the browser shell`);
      const bare = codeOnly(source);
      const found = bare.match(BROWSER);
      if (found) hits.push(`${rel} uses ${found[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it('ships a schema beside each content file', () => {
    const pairs: [string, string][] = [
      ['data/boat.json', 'schemas/boat.schema.json'],
      ['data/lessons.json', 'schemas/lessons.schema.json'],
      ['data/coaching.json', 'schemas/coaching.schema.json'],
      ['data/scenarios.json', 'schemas/scenarios.schema.json'],
    ];
    for (const [dataPath, schemaPath] of pairs) {
      const data = JSON.parse(readFileSync(join(ROOT, dataPath), 'utf8')) as Record<string, unknown>;
      const schema = JSON.parse(readFileSync(join(ROOT, schemaPath), 'utf8')) as { required?: string[] };
      expect(schema.required?.length ?? 0).toBeGreaterThan(0);
      for (const key of schema.required ?? []) expect(data, dataPath).toHaveProperty(key);
    }
    const fixtureSchema = JSON.parse(readFileSync(join(ROOT, 'schemas/fixture.schema.json'), 'utf8')) as { required?: string[] };
    for (const name of ['tack', 'gybe', 'dock', 'capsize']) {
      const fixture = JSON.parse(readFileSync(join(ROOT, 'fixtures', `${name}.json`), 'utf8')) as Record<string, unknown>;
      for (const key of fixtureSchema.required ?? []) expect(fixture, name).toHaveProperty(key);
    }
    const osm = JSON.parse(readFileSync(join(ROOT, '..', 'data/herzliya/osm.json'), 'utf8')) as { overpass?: { elements?: unknown[] } };
    const bathy = JSON.parse(readFileSync(join(ROOT, '..', 'data/herzliya/bathy.json'), 'utf8')) as { values?: number[]; width?: number; height?: number };
    expect(osm.overpass?.elements?.length).toBeGreaterThan(0);
    expect(bathy.values?.length).toBe((bathy.width ?? 0) * (bathy.height ?? 0));
  });
});
