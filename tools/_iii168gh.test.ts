// IIII168 批一次性：iamerror 上游幽灵债(792 格)三模取证仪。
//   A) GHLIST：cap-lc 快照 vs x86 #056 幽灵谱全清单落盘 /tmp/iii168-out/ghost-cells.json
//   B) GHTRACE：整机 generateWorld 逐 pass 末态采 792 格 (act,internal,sheet) → js-ghost-trace.json
//   C) GHPATCH：cap-lc 基座逐组贴 vanilla raw 值后重放乱块海+LC vs x86 #057 8 通道
//      （组归因门 SW_I168_GROUPS=all|p1|226|misc——组间因果隔离）
// 用法：cd game && SW_I168_GHLIST=1 npx vitest run tools/_iii168gh.test.ts
//       SW_I168_GHTRACE=1 npx vitest run tools/_iii168gh.test.ts
//       SW_I168_GHPATCH=1 SW_I168_GROUPS=all npx vitest run tools/_iii168gh.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TileStore } from '../src/world/TileStore';
import { runLifeCrystalsPass } from '../src/world/gen/vanilla/StructuresPass';
import { doErrorWorldShuffleBlocks } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const OUT = process.env.SW_I168_OUT ?? '/tmp/iii168-out';
const G2 = process.env.HOME + '/GoldenChains/i106/x86-iamerror';
const CAP = process.env.SW_165_OUT ?? '/tmp/iii165-out/cap-lc';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
function hydrate(dir: string): TileStore {
  const hdr = JSON.parse(readFileSync(`${dir}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${dir}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gsf = `${dir}/base_gensolid.json`;
  if (existsSync(gsf)) restoreGenSolid(new Map(JSON.parse(readFileSync(gsf, 'utf8')) as Array<[number, boolean]>));
  return st;
}
/** 分组判据（任务书三组）：44/191=门判定组；226 双向=神庙组；其余=杂类 */
function groupOf(van: number, jsSheet: number): string {
  if (van === 0 && (jsSheet === 44 || jsSheet === 191)) return 'gate';
  if (van === 226 || jsSheet === 226) return 'temple';
  return 'misc';
}

it('GHLIST ghost spectrum full list', () => {
  const bt = le16(`${G2}/056_Wall_Variety.typ`);
  const ba = readFileSync(`${G2}/056_Wall_Variety.act`);
  const jt = le16(`${CAP}/base_type.bin`);
  const ja = readFileSync(`${CAP}/base_flags.bin`);
  const cells: Array<{ i: number; x: number; y: number; van: number; jsSheet: number; jsInternal: number; grp: string }> = [];
  const spec = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    if (ba[i] || ja[i]) continue;
    const vg = bt[i]!;
    const jg = jt[i] === 0 ? 0 : (SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999);
    if (vg === jg) continue;
    const grp = groupOf(vg, jg);
    cells.push({ i, x: i % W, y: (i / W) | 0, van: vg, jsSheet: jg, jsInternal: jt[i]!, grp });
    spec.set(`${grp}|van${vg}>js${jg}`, (spec.get(`${grp}|van${vg}>js${jg}`) ?? 0) + 1);
  }
  console.log(`[i168] ghost cells=${cells.length}`);
  for (const [k, c] of [...spec.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k} x${c}`);
  writeFileSync(`${OUT}/ghost-cells.json`, JSON.stringify(cells));
  console.log(`[i168] -> ${OUT}/ghost-cells.json`);
}, 300_000);

it('GHTRACE per-pass ghost state of 792 cells', async () => {
  const list = JSON.parse(readFileSync(`${OUT}/ghost-cells.json`, 'utf8')) as Array<{ i: number; x: number; y: number }>;
  const idxs = list.map((c) => c.i);
  const trace: Array<{ pass: number; name: string; act: number[]; typ: number[] }> = [];
  await generateWorld({
    width: W, height: H, seedText: '1.1.1.0.iamerror|106103', evil: 0,
    seedFlags: { errorWorld: true },
    onWorldPartial: (w, pi, pn) => {
      const st = w.store as unknown as { flags: Uint8Array; type: Uint16Array };
      const act: number[] = [], typ: number[] = [];
      for (const i of idxs) { act.push(st.flags[i]! & 1); typ.push(st.type[i]!); }
      trace.push({ pass: pi, name: pn, act, typ });
    },
  });
  writeFileSync(`${OUT}/js-ghost-trace.json`, JSON.stringify({ idxs, trace }));
  console.log(`[i168] trace passes=${trace.length} -> ${OUT}/js-ghost-trace.json`);
}, 600_000);

it('GHPATCH patch ghost groups then replay shuffle+LC vs x86 #057', () => {
  const groups = (process.env.SW_I168_GROUPS ?? 'all');
  const cells = JSON.parse(readFileSync(`${OUT}/ghost-cells.json`, 'utf8')) as Array<{ i: number; x: number; y: number; van: number; jsSheet: number; grp: string }>;
  const st = hydrate(CAP);
  // JS internal ← vanilla raw sheet：sheet→internal 反查（vanilla raw 0=泥土=JS internal 泥土）
  const sheetToInternal = new Map<number, number>();
  for (let t = 0; t < TILE_DEFS.length; t++) {
    const s = TILE_DEFS[t]?.vanilla?.sheet;
    if (typeof s === 'number' && !sheetToInternal.has(s)) sheetToInternal.set(s, t);
  }
  const DIRT_INTERNAL = sheetToInternal.get(0)!;
  let patched = 0;
  for (const c of cells) {
    if (groups !== 'all' && c.grp !== groups) continue;
    const internal = c.van === 0 ? DIRT_INTERNAL : sheetToInternal.get(c.van)!;
    st.type[c.i] = internal;
    patched++;
  }
  console.log(`[i168] patched ${patched}/${cells.length} cells (groups=${groups})`);
  const gsRaw = JSON.parse(readFileSync(`${CAP}/base_gs.json`, 'utf8')) as unknown as GenState;
  const rng = new RNG(gsRaw.seed);
  if (gsRaw.seedFlags.errorWorld) doErrorWorldShuffleBlocks(st, rng, gsRaw);
  runLifeCrystalsPass(st, rng, gsRaw);
  // 8ch 对拍 x86 #057
  const xt = le16(`${G2}/057_Life_Crystals.typ`), xa = readFileSync(`${G2}/057_Life_Crystals.act`);
  const xw = le16(`${G2}/057_Life_Crystals.wal`), xl = readFileSync(`${G2}/057_Life_Crystals.liq`);
  const xhf = readFileSync(`${G2}/057_Life_Crystals.half`), xsl = readFileSync(`${G2}/057_Life_Crystals.slope`);
  const xlt = readFileSync(`${G2}/057_Life_Crystals.lty`), xia = readFileSync(`${G2}/057_Life_Crystals.inact`);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, first = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    let bad = false;
    if (xa[i] !== ja) { dA++; bad = true; }
    const jt = ja ? (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)) : 0;
    const vt = xa[i] ? xt[i]! : 0;
    if (vt !== jt) {
      dT++; bad = true;
      const k = `T${vt}>${jt}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }
    if (xw[i] !== st.wall[i]) dW++;
    if (xl[i] !== st.liquid[i]) dL++;
    if (xhf[i] !== st.half[i]) dHf++;
    if (xsl[i] !== st.slope[i]) dSl++;
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) dLt++;
    if ((xia[i] ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
    if (bad && first < 0) first = i;
  }
  console.log(`[i168] post#057 vs x86: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=(${first % W},${(first / W) | 0})`);
  console.log(`[i168] pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}x${n}`).join(' ')}`);
}, 600_000);
