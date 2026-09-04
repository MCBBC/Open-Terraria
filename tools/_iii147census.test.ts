// IIII108c 追加批（planetoids #32 家具帧域复验收官）：#32 Dungeon 全量差异格普查仪。
// 复用 tools/_iii101dg capture/hydrate 范式：hydrate base → runDungeonPass → 对拍 G2 #032
// → 输出全部差异格 (x,y) v=vanilla t/a j=JS t/a（不裁 top-N），供四族聚类。
// 用法：cd game && SW_D147REPLAY=1 SW_D147_G2=~/GoldenChains/golden-planetoids \
//   SW_D147_OUT=/tmp/iii147-out/cap-pld147 npx vitest run tools/_iii147census.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_D147REPLAY === '1';
const OUT = process.env.SW_D147_OUT ?? '/tmp/iii147-out/cap-pld147';
const G2 = process.env.SW_D147_G2 ?? '';
const CMP_IDX = Number(process.env.SW_D147_CMP ?? 32);
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(desVal);
  if (v && typeof v === 'object') {
    const o = v as { __t?: string; d?: unknown[] };
    if (o.__t) {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
      const arr = new Ctor(o.d?.length ?? 0) as { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

const dumpName = (idx: number): string => {
  for (const f of require('node:fs').readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m && Number(m[1]) === idx) return m[2];
  }
  throw new Error(`dump #${idx} not found`);
};

(RUN ? it : it.skip)('census all mismatch cells for #32', () => {
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${dumpName(CMP_IDX)}`;
  const prePrev = `${G2}/031_${dumpName(31)}`;
  const xt = le16(`${pre}.typ`), xa = readFileSync(`${pre}.act`), xw = le16(`${pre}.wal`);
  const pt = le16(`${prePrev}.typ`), pa = readFileSync(`${prePrev}.act`);
  const { st, gs } = hydrate();
  if (readFileSync(`${OUT}/base_gensolid.json`, 'utf8')) {
    restoreGenSolid(new Map(JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')) as [number, boolean][]));
  }
  // 基座自检 vs #031
  let bcA = 0, bcT = 0;
  for (let i = 0; i < N; i++) {
    if (pa[i] !== (st.flags[i]! & 1)) bcA++;
    else if (pa[i] && pt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) bcT++;
  }
  console.log(`[base selfcheck vs #031] dAct=${bcA} dTyp=${bcT}`);

  // SW_I179 仪：DR|TRP 逐 attempt 直读（x86 同构）+ 掷序数注记
  const trp: string[] = [];
  let rollN3 = 0;
  const g = globalThis as unknown as { __swI113?: (l: string) => void; __swOnRoll?: (v: number, inst?: object) => void };
  const oOR3 = g.__swOnRoll;
  if (process.env.SW_I179 === '1') {
    g.__swOnRoll = (v, inst) => { rollN3++; if (oOR3) oOR3.call(g, v, inst); };
    g.__swI113 = (l) => { if (l.startsWith('DR|TRP')) trp.push(`${l}|yord=${rollN3}`); };
  }
  // 定序快照：SW_D147_SNAP=<ordinal> 时，该掷落定后抓 x=280..470,y=740..800 区域
  const SNAP_AT = Number(process.env.SW_D147_SNAP ?? 0);
  let snapDump = '';
  if (SNAP_AT > 0) {
    const gp = globalThis as unknown as { __swOnRoll?: (v: number, inst?: object) => void };
    const oOnRoll2 = gp.__swOnRoll;
    let rollN2 = 0;
    gp.__swOnRoll = (v) => {
      rollN2++;
      if (rollN2 === SNAP_AT) {
        const X0 = 150, X1 = 470, Y0 = 745, Y1 = 795;
        const lines: string[] = [`SNAP after roll ${rollN2} v=${v} region x=${X0}..${X1} y=${Y0}..${Y1}`];
        for (let y = Y0; y <= Y1; y++) {
          const cells: string[] = [];
          for (let x = X0; x <= X1; x++) {
            const i = st.idx(x, y);
            const a = st.flags[i] !== 0 ? 1 : 0;
            const t = SHEET[st.type[i]!] ?? -1;
            cells.push(`${x},${y} a=${a} t=${a ? t : t > 0 ? `.${t}` : '-'} w=${st.wall[i]} sl=${st.slope[i]} hf=${st.half[i] ? 1 : 0}`);
          }
          lines.push(cells.join('|'));
        }
        snapDump = lines.join('\n');
      }
      if (oOnRoll2) oOnRoll2.call(gp, v);
    };
  }
  const rng = new RNG(gs.seed);
  runDungeonPass(st, rng, gs, [] as never);
  delete g.__swI113;
  writeFileSync('/tmp/iii147-out/trp-js.txt', `${trp.join('\n')}\n`);
  if (snapDump) { writeFileSync('/tmp/iii147-out/snap-region.txt', `${snapDump}\n`); console.log(snapDump); }
  // JS 侧 135/137 全量
  const tr: string[] = [], pl: string[] = [];
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    if (!ja) continue;
    const jt = SHEET[st.type[i]!] ?? -1;
    if (jt === 137) tr.push(`${i % W},${(i / W) | 0}`);
    if (jt === 135) pl.push(`${i % W},${(i / W) | 0}`);
  }
  console.log(`JS traps(${tr.length}): ${tr.join(' ')}`);
  console.log(`JS plates(${pl.length}): ${pl.join(' ')}`);

  // 全量普查
  const cells: Array<{ x: number; y: number; va: number; vt: number; ja: number; jt: number }> = [];
  let dA = 0, dT = 0, dW = 0;
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (va !== ja) dA++;
    if (vt !== jt) dT++;
    if (va !== ja || vt !== jt) cells.push({ x: i % W, y: (i / W) | 0, va, vt, ja, jt });
    if (xw[i] !== st.wall[i]) dW++;
  }
  console.log(`DIFF A=${dA} T=${dT} W=${dW} cells=${cells.length}`);
  const lines = cells.map(c => `${c.x},${c.y} v:${c.va ? c.vt : '-'} j:${c.ja ? c.jt : '-'}`);
  writeFileSync('/tmp/iii147-out/census32.txt', `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}, 600_000);
