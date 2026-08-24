// KKKKKKK：killTile 尝试日志（pass32 门控版）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_K6 === '1';
const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}
(RUN ? it : it.skip)('kill attempt log (pass32)', async () => {
  const lines: string[] = [];
  let armed = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_kkkk6')) { lab = labelOf(m[1], Number(m[2])); break; }
    }
    if (lab === 'Dungeon') armed = true;
    else if (lab === 'MountainCaveOpenings') armed = false;
    return oReseed.call(this, s);
  };
  (globalThis as { __kkkKT?: unknown }).__kkkKT = (x: number, y: number) => {
    if (armed && ((x >= 3255 && x <= 3305 && y >= 730 && y <= 780) || (x >= 3625 && x <= 3670 && y >= 735 && y <= 785))) {
      lines.push(`KT|${x}|${y}`);
    }
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '1321365005', evil: 0, seedFlags: { theConstant: true } });
  } finally {
    (globalThis as { __kkkKT?: unknown }).__kkkKT = undefined;
    RNGp.reseed = oReseed;
  }
  writeFileSync('/tmp/kkk-out/jkt.txt', lines.join('\n') + '\n');
  console.log(`[k6] ${lines.length} kill attempts → /tmp/kkk-out/jkt.txt`);
}, 600_000);
