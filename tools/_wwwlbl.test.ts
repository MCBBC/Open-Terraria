// WWW 调试：reseed 栈标签侦测为何未命中（SW_WWWLBL=1）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_WWWLBL === '1';
const W = 4200, H = 1200;
const srcMap = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcMap.get(file);
  if (!src) { src = readFileSync(file, 'utf8').split('\n'); srcMap.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return '';
}

(RUN ? it : it.skip)('label probe', async () => {
  const seen = new Map<string, number>();
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let n = 0;
  class Ab extends Error { constructor() { super('lbl'); } }
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_wwwlbl')) {
        const lab = labelOf(m[1], Number(m[2]));
        if (lab === 'JungleShrines' || lab === 'OceanCaves') {
          seen.set(lab, (seen.get(lab) ?? 0) + 1);
          console.log(`HIT ${lab} @${m[1].replace(/^.*?src\//, 'src/')}:${m[2]}`);
          if (++n >= 2) { RNGp.reseed = oReseed; throw new Ab(); }
        } else if (n === 0 && seen.size === 0 && Math.random() < 0.02) {
          console.log(`frame ${m[1].replace(/^.*?src\//, 'src/')}:${m[2]} label="${lab}"`);
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } catch (e) {
    const c = (e as { cause?: unknown })?.cause;
    if (!(e instanceof Ab || c instanceof Ab)) throw e;
  } finally { RNGp.reseed = oReseed; }
  console.log('seen:', [...seen.entries()]);
}, 300_000);
