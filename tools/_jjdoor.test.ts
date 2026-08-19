// JJJJ 批：小屋阶段流 + 目标格逐阶段状态（定位 vanilla 门杀触发面用——JS 侧透视）。
// SW_JJD=1 SW_JJ_SEED=22222 SW_JJ_EVIL=1 SW_JJ_W=4200 SW_JJ_H=1200 SW_JJ_G2=... \
//   SW_JJD_HOUSE=1920,726 SW_JJD_CELLS=1918,726;1919,726;1919,727;1919,730;1919,731;1917,733
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_JJD === '1';
const SEED = process.env.SW_JJ_SEED ?? '22222';
const EVIL = Number(process.env.SW_JJ_EVIL ?? 0);
const W = Number(process.env.SW_JJ_W ?? 4200), H = Number(process.env.SW_JJ_H ?? 1200);
const HOUSE = (process.env.SW_JJD_HOUSE ?? '0,0').split(',').map(Number);
const CELLS = (process.env.SW_JJD_CELLS ?? '').split(';').filter(Boolean).map((c) => {
  const [x, y] = c.split(',').map(Number);
  return { x, y };
});
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
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

(RUN ? it : it.skip)(`door stage watch ${SEED}`, async () => {
  const lines: string[] = [];
  let curStore: { store: { flags: Uint8Array; type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array } } | null = null;
  const rngRolls = { n: 0 };
  const fmt = () => CELLS.map(({ x, y }) => {
    if (!curStore) return '?';
    const i = y * W + x;
    const t = curStore.store;
    return `(${x},${y})=${t.flags[i] ? SHEET[t.type[i]!] : 'x'}f${t.frameX[i]}/${t.frameY[i]}w${t.wall[i]}`;
  }).join(' ');
  (globalThis as { __swHouseStage?: (t: string, a: number, b: number, c: number, d: number) => void }).__swHouseStage
    = (t, a, b, c, d) => {
      if (a !== HOUSE[0] || b !== HOUSE[1]) return;
      lines.push(`roll${rngRolls.n} ${t} ${a} ${b} ${c}: ${fmt()}`);
    };
  // 记录小屋之间的掷骰数（阶段事件间的增量）
  const houseEv: string[] = [];
  (globalThis as { __swHouseEv?: (p: string, x: number, y: number) => void }).__swHouseEv
    = (p, x, y) => { houseEv.push(`${p} ${x} ${y}`); };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let stop = false;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const ln of stack.split('\n')) {
      const m = ln.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_jjdoor')) {
        const lab = labelOf(m[1], Number(m[2]));
        if (lab === 'SurfaceChests') { stop = true; }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  const oNext = RNG.prototype.next;
  RNG.prototype.next = function (...a: unknown[]) { rngRolls.n++; if (stop) throw new Error('jj-door-stop'); return (oNext as (...x: unknown[]) => number).apply(this, a); };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w) => { if (!curStore) curStore = w as never; },
    });
  } catch { /* jj-door-stop */ }
  finally {
    RNGp.reseed = oReseed;
    RNG.prototype.next = oNext;
  }
  console.log(lines.join('\n'));
  const fs = await import('node:fs');
  fs.writeFileSync(`/tmp/jjdoor-${SEED}.txt`, lines.join('\n') + '\n');
}, 900_000);
