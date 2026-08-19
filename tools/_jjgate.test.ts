// JJJJ 批：门级拒绝归因探针（配合 CaveHousePass __swHouseGate dormant 钩）。
// SW_JJG=1 SW_JJ_SEED=20260811 SW_JJ_EVIL=0 SW_JJ_W=6400 SW_JJ_H=1800 \
//   SW_JJG_XY=1178,1120 npx vitest run tools/_jjgate.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_JJG === '1';
const SEED = process.env.SW_JJ_SEED ?? '20260811';
const EVIL = Number(process.env.SW_JJ_EVIL ?? 0);
const W = Number(process.env.SW_JJ_W ?? 6400), H = Number(process.env.SW_JJ_H ?? 1800);
const XY = (process.env.SW_JJG_XY ?? '').split(',').map(Number);
const ROOM_DUMP = process.env.SW_JJG_ROOM === '1';

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

(RUN ? it : it.skip)(`gate attribution ${SEED}`, async () => {
  const hits: string[] = [];
  (globalThis as { __swHouseGate?: (g: string, x: number, y: number) => void }).__swHouseGate
    = (g, x, y) => { hits.push(`${g} ${x} ${y}`); };
  const roomsAt: string[] = [];
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let stop = false;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const ln of stack.split('\n')) {
      const m = ln.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_jjgate')) {
        if (labelOf(m[1], Number(m[2])) === 'SurfaceChests') stop = true;
        break;
      }
    }
    return oReseed.call(this, s);
  };
  const oNext = RNG.prototype.next;
  RNG.prototype.next = function (...a: unknown[]) { if (stop) throw new Error('jj-gate-stop'); return (oNext as (...x: unknown[]) => number).apply(this, a); };
  try {
    await generateWorld({ width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1 });
  } catch { /* stop */ }
  finally {
    RNGp.reseed = oReseed;
    RNG.prototype.next = oNext;
  }
  const near = hits.filter((l) => {
    const [g, x, y] = l.split(' ');
    return Math.abs(Number(x) - XY[0]) <= 40 && Math.abs(Number(y) - XY[1]) <= 40;
  });
  console.log(`gate 拒绝事件 (近 ${XY}): ${near.length}`);
  console.log(near.slice(0, 40).join('\n'));
  writeFileSync(`/tmp/jjgate-${SEED}.txt`, hits.join('\n') + '\n');
}, 900_000);
