// IIII172 终态帧域取证仪:generateWorld 完成后的**真终态**(store 终值) vs 桶 Final_Cleanup dump
// 逐格帧通道比对,全量差格 JSON 落盘(含 JS 侧 type/active/frames + 邻域)。
// 与 _iii163fx 的差异:①不依赖 reseed 锚/SLOT_END(修 skyblock 槽序+1 错配);②终态单点全量;
// ③差格输出面向分族(css 锚定取证),不跑里程碑。
// 用法: cd game && SW_I172=1 SW_I172_G2=<10ch桶> SW_I172_SEED='<seed>' [SW_I172_EVIL=n]
//   [SW_I172_FLAGS=f1,f2] [SW_I172_PINFLAGS=1] [SW_M8_W=6400 SW_M8_H=1800]
//   SW_I172_TAG=<tag> npx vitest run tools/_iii172term.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { normFrame, frameClass } from './_iii163frame';

const RUN = process.env.SW_I172 === '1';
const G2 = process.env.SW_I172_G2 ?? '';
const SEED = process.env.SW_I172_SEED ?? '0';
const EVIL = process.env.SW_I172_EVIL !== undefined ? Number(process.env.SW_I172_EVIL) : -1;
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
const OUT = process.env.SW_I172_OUT ?? '/tmp/iii172-out/term';
const TAG = process.env.SW_I172_TAG ?? 'tag';
const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps', constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees', tenthanniversary: 'tenthAnniversary',
  celebrationmk10: 'tenthAnniversary', fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
};
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I172_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const JSKEY: string[] = [];
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && s >= 0 && SHEET[i] < 0) { SHEET[i] = s; }
  JSKEY[i] = TILE_DEFS[i]?.key ?? `t${i}`;
}
// sheet→JS key 反表(取首个映射)
const SHEET2KEY = new Map<number, string>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && s >= 0 && !SHEET2KEY.has(s)) SHEET2KEY.set(s, JSKEY[i]);
}

const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
function frameFiles(pre: string): { fx: string; fy: string } | null {
  if (existsSync(`${pre}.fx`) && existsSync(`${pre}.fy`)) return { fx: `${pre}.fx`, fy: `${pre}.fy` };
  if (existsSync(`${pre}.frx`) && existsSync(`${pre}.fry`)) return { fx: `${pre}.frx`, fy: `${pre}.fry` };
  return null;
}
function pickDump(): { idx: number; nm: string; pre: string } {
  let best = -1, nm = '';
  for (const [i, n] of DUMPNAME) {
    if (n === 'Final_Cleanup' && i > best) { best = i; nm = n; continue; }
    if (best < 0 && i > best) { best = i; nm = n; }
  }
  if (best < 0) throw new Error(`no dump in ${G2}`);
  return { idx: best, nm, pre: `${G2}/${String(best).padStart(3, '0')}_${nm}` };
}

interface DiffCell {
  x: number; y: number; act: [number, number]; typ: number; jsKey: string;
  fx: [number, number]; fy: [number, number]; cx: string; cy: string;
  neigh: string[];
}

(RUN ? it : it.skip)('IIIII172 terminal frame diff (true final state vs Final_Cleanup)', async () => {
  const d = pickDump();
  const ff = frameFiles(d.pre);
  if (!ff) throw new Error(`no frame channel for ${d.pre}`);
  const xt = le16(`${d.pre}.typ`), xa = readFileSync(`${d.pre}.act`);
  const xfx = le16(ff.fx), xfy = le16(ff.fy);
  const out: DiffCell[] = [];
  const t0 = Date.now();
  let store: Parameters<typeof cmp>[0] | null = null;
  function cmp(st: {
    type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
  }): DiffCell[] {
    const cells: DiffCell[] = [];
    for (let i = 0; i < N; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      const xv = xfx[i]!, jv = st.frameX[i]!, yv = xfy[i]!, jyv = st.frameY[i]!;
      const cx = frameClass(xv, jv), cy = frameClass(yv, jyv);
      if (cx === 'artifact' && cy === 'artifact') continue;
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] ?? 9999) : 0;
      const typeStrat = va ? vt : (ja ? jt : (vt || (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] ?? 9999))));
      const x = i % W, y = (i / W) | 0;
      const neigh: string[] = [];
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const j = (x + dx) + (y + dy) * W;
        if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H) continue;
        neigh.push(`${st.flags[j]! & 1}|${SHEET[st.type[j]!] ?? 9999}|${normFrame(st.frameX[j]!)},${normFrame(st.frameY[j]!)}`);
      }
      cells.push({
        x, y, act: [va, ja], typ: typeStrat,
        jsKey: ja ? JSKEY[st.type[i]!] ?? '?' : (SHEET2KEY.get(typeStrat) ?? '?'),
        fx: [xv, jv], fy: [yv, jyv], cx, cy, neigh,
      });
    }
    return cells;
  }
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: process.env.SW_I172_PINFLAGS === '1' ? FLAGS
        : (Object.keys(FLAGS).length > 0 ? FLAGS : undefined),
      onWorldPartial: (w) => { if (!store) store = w.store as never as typeof store; },
    });
  } finally { /* pass */ }
  if (!store) throw new Error('no store captured');
  out.push(...cmp(store as never as Parameters<typeof cmp>[0]));
  writeFileSync(`${OUT}/term-${TAG}.json`, JSON.stringify({ dump: d, w: W, h: H, n: out.length, cells: out }, null, 0));
  console.log(`[i172term] ${TAG}: dump=#${d.idx}_${d.nm} diffs=${out.length} (act1=${out.filter(c => c.act[0] === 1).length}) ${(Date.now() - t0) / 1000 | 0}s → ${OUT}/term-${TAG}.json`);
}, 900_000);
