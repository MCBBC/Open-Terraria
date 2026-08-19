// JJJJ 批：门级拒绝归因探针（配合 CaveHousePass __swHouseGate dormant 钩）。
// SW_JJG=1 SW_JJ_SEED=20260811 SW_JJ_EVIL=0 SW_JJ_W=6400 SW_JJ_H=1800 \
//   SW_JJG_XY=1178,1120 npx vitest run tools/_jjgate.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld, __setGenStateForProbe } from '../src/world/gen/WorldGen';
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
  // SW_JJG_DUMP=x0,y0,x1,y1 → try 事件时快照区域（type(active)/wall/liquid）
  const DUMPR = (process.env.SW_JJG_DUMP ?? '').split(',').map(Number);
  let dumped = false;
  let curStore: { store: { flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array } } | null = null;
  if (DUMPR.length === 4) {
    (globalThis as { __swHouseEv?: (p: string, x: number, y: number) => void }).__swHouseEv = (p, x, y) => {
      if (p !== 'try' || dumped || !curStore) return;
      if (Math.abs(x - XY[0]) > 45 || Math.abs(y - XY[1]) > 45) return;
      dumped = true;
      const s = curStore.store;
      const lines: string[] = [];
      for (let yy = DUMPR[1]!; yy <= DUMPR[3]!; yy++) {
        const rowT: string[] = [], rowL: string[] = [];
        for (let xx = DUMPR[0]!; xx <= DUMPR[2]!; xx++) {
          const i = yy * W + xx;
          rowT.push(`${s.flags[i] ? s.type[i] : 'x'}|${s.wall[i]}`);
          rowL.push(s.liquid[i] ? `L${s.liquid[i]}.${s.liquidType[i]}` : '.');
        }
        lines.push(`${yy} T ${rowT.join(' ')}`);
        lines.push(`${yy} L ${rowL.join(' ')}`);
      }
      writeFileSync(`/tmp/jjgate-${SEED}-region.txt`, lines.join('\n') + '\n');
      console.log(`dumped region @try (${x},${y}) → /tmp/jjgate-${SEED}-region.txt`);
    };
  }
  const roomsAt: string[] = [];
  // 捕获 #59 入口 gs 的保护矩形（看 JS 是否在 (1200-1270,530-580) 有矩形）
  (globalThis as { __swStatCap?: (gs: unknown, st: unknown) => void }).__swStatCap = (gs) => {
    const g = gs as { protectedRects?: Array<{ x0: number; y0: number; x1: number; y1: number }> };
    if (!g?.protectedRects) return;
    const near = g.protectedRects.filter((r) => r.x0 < 1300 && r.x1 > 1150 && r.y0 < 620 && r.y1 > 480);
    console.log(`#入口保护矩形(近 1150-1300×480-620): ${near.length} 个`);
    for (const r of near) console.log(`  rect (${r.x0}-${r.x1},${r.y0}-${r.y1})`);
  };
  (globalThis as { __swHouseRooms?: (ox: number, oy: number, rooms: string) => void }).__swHouseRooms
    = (ox, oy, rooms) => { roomsAt.push(`${ox},${oy}: ${rooms}`); };
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
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w) => { if (!curStore) curStore = w as never; },
    });
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
  writeFileSync(`/tmp/jjgate-${SEED}-rooms.txt`, roomsAt.join('\n') + '\n');
  const nearR = roomsAt.filter((l) => l.startsWith(`${XY[0]},${XY[1]}:`));
  console.log(`房形 (近 ${XY}): ${nearR.join(' | ')}`);
}, 900_000);
