// IIII43 一次性仪⑦：DirtInRocks 反转带起始行分布取证（pre-Clay 快照导出）。
// 用法：cd game && SW_I43G=1 npx vitest run tools/_i43g.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I43G === '1';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('i43g pre-clay snapshot', async () => {
  const W = 4200, H = 1200;
  let captured = false;
  let cur: { flags: Uint8Array; type: Uint16Array } | null = null;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (cur && !captured) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_i43g')) {
          if (labelOf(m[1], Number(m[2])) === (process.env.SW_I43G_LABEL ?? 'Clay')) {
            captured = true;
            const tag = process.env.SW_I43G_TAG ?? 'preclay';
            const typ = new Uint16Array(W * H);
            for (let i = 0; i < W * H; i++) typ[i] = (cur!.flags[i] & 1) ? Math.max(0, SHEET[cur!.type[i]]) : 0;
            writeFileSync(`/tmp/iii45-out/js-${tag}.typ`, Buffer.from(typ.buffer));
            const act = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) act[i] = cur!.flags[i] & 1;
            writeFileSync(`/tmp/iii45-out/js-${tag}.act`, Buffer.from(act));
            console.log(`snapshot written: js-${tag}`);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '1138154190', evil: 0, seedFlags: { remix: true },
      onWorldPartial: (w) => { if (!cur) cur = w.store as never as { flags: Uint8Array; type: Uint16Array }; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!captured) throw new Error('Clay not captured');
}, 900_000);
