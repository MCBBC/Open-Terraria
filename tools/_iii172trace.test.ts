// IIII172 槽级写源追踪仪:对给定坐标,记录每个管线槽结束时 store 的
// type/active/frameX/frameY 值序列 → 定位「哪一槽首写/哪一槽改写」。
// 用法: cd game && SW_I172T=1 SW_I172T_SEED='<seed>' [SW_I172T_EVIL=n]
//   [SW_I172T_FLAGS=f] [SW_I172T_POINTS='x,y;x,y'] SW_I172T_TAG=<tag> \
//   npx vitest run tools/_iii172trace.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I172T === '1';
const SEED = process.env.SW_I172T_SEED ?? '0';
const EVIL = process.env.SW_I172T_EVIL !== undefined ? Number(process.env.SW_I172T_EVIL) : -1;
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const OUT = process.env.SW_I172T_OUT ?? '/tmp/iii172-out/trace';
const TAG = process.env.SW_I172T_TAG ?? 'tag';
const PTS = (process.env.SW_I172T_POINTS ?? '')
  .split(';').filter(Boolean).map((s) => s.split(',').map(Number));
const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps', theconstant: 'theConstant', notthebees: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', fortheworthy: 'getGoodWorld',
  drunkworld: 'drunkWorld',
};
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I172T_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;

const JSKEY: string[] = [];
for (let i = 0; i < TILE_DEFS.length; i++) JSKEY[i] = TILE_DEFS[i]?.key ?? `t${i}`;

(RUN ? it : it.skip)('IIIII172 per-slot coordinate trace', async () => {
  const snaps: Array<{ slot: number; name: string; cells: Array<{ x: number; y: number; a: number; t: number; key: string; fx: number; fy: number; w: number }> }> = [];
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
    onWorldPartial: (w, i, pn) => {
      const st = w.store as unknown as {
        w: number; type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array; idx: (x: number, y: number) => number;
      };
      const cells = PTS.map(([x, y]) => {
        const k = st.idx(x, y);
        return { x, y, a: st.flags[k]! & 1, t: st.type[k]!, key: JSKEY[st.type[k]!] ?? '?', fx: st.frameX[k]!, fy: st.frameY[k]!, w: st.wall[k]! };
      });
      snaps.push({ slot: i, name: pn, cells });
    },
  });
  writeFileSync(`${OUT}/trace-${TAG}.json`, JSON.stringify({ seed: SEED, pts: PTS, snaps }, null, 1));
  // 控制台摘要:每个点,值变化序列
  for (let p = 0; p < PTS.length; p++) {
    const [x, y] = PTS[p]!;
    console.log(`\n=== point (${x},${y}) ===`);
    let prev = '';
    for (const s of snaps) {
      const c = s.cells[p]!;
      const line = `#${String(s.slot).padStart(2, '0')} ${s.name.padEnd(24)} a=${c.a} t=${c.t}(${c.key}) fx=${c.fx} fy=${c.fy} wall=${c.w}`;
      if (line !== prev) { console.log(line); prev = line; }
    }
  }
}, 900_000);
