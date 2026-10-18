// IIII189 批探针：waterpark 倒木水景槽末（=dump 075_Place_Fallen_Log）全量 8 通道 diff，
// 列出全部差异格坐标（m8 samples 帽 8 不够用）。一次性诊断，零主路径改动。
// 用法：SW_MB_1457=1 npx vitest run tools/_iii189slot.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I189 === '1';
const G2 = `${process.env.HOME ?? ''}/GoldenChains/golden-waterpark`;
const SEED = 'waterpark|20260905';

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
};
const rd = (p: string): Uint8Array => readFileSync(p);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('III189 slot-end full diff', async () => {
  const pre = `${G2}/075_Place_Fallen_Log`;
  const c = {
    t: le16(`${pre}.typ`), a: rd(`${pre}.act`), w: le16(`${pre}.wal`), l: rd(`${pre}.liq`),
    hf: rd(`${pre}.half`), sl: rd(`${pre}.slope`), lt: rd(`${pre}.lty`), ia: rd(`${pre}.inact`),
  };
  let stRef: import('../src/world/TileStore').TileStore | null = null;
  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: SEED, evil: 0 as const,
      onWorldPartial: (world, _i, name) => {
        if (name === '倒木水景') {
          stRef = world.store as import('../src/world/TileStore').TileStore;
          throw new AbortOK('slot-75-captured');
        }
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
  }
  const st = stRef!;
  const W = st.w, H = st.h, N = W * H;
  const diffs: string[] = [];
  let nA = 0, nT = 0, nL = 0, nLt = 0, nSl = 0, nHf = 0, nW = 0;
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    const x = i % W, y = (i / W) | 0;
    if (va !== ja) { nA++; diffs.push(`A(${x},${y}) v${va} j${ja} vT${vt} jT${jt}`); }
    if (vt !== jt) { nT++; diffs.push(`T(${x},${y}) v${vt} j${jt}`); }
    if (c.w[i]! !== st.wall[i]!) { nW++; diffs.push(`W(${x},${y}) v${c.w[i]} j${st.wall[i]}`); }
    if (c.l[i]! !== st.liquid[i]!) { nL++; diffs.push(`L(${x},${y}) v${c.l[i]} j${st.liquid[i]}`); }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { nLt++; diffs.push(`Y(${x},${y}) v${vl} j${jl}`); }
    if (c.sl[i]! !== st.slope[i]!) { nSl++; diffs.push(`S(${x},${y}) v${c.sl[i]} j${st.slope[i]}`); }
    if (c.hf[i]! !== st.half[i]!) { nHf++; diffs.push(`H(${x},${y}) v${c.hf[i]} j${st.half[i]}`); }
  }
  console.log(`[i189] diff counts A=${nA} T=${nT} W=${nW} L=${nL} Lt=${nLt} Sl=${nSl} Hf=${nHf}`);
  for (const d of diffs) console.log(`[i189] ${d}`);
  // 488/379 双侧坐标集
  const vLog: string[] = [], jLog: string[] = [], vBub: string[] = [], jBub: string[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if (c.a[i] && c.t[i] === 488) vLog.push(`(${x},${y})`);
    if ((st.flags[i] & 1) && SHEET[st.type[i]] === 488) jLog.push(`(${x},${y})`);
    if (c.a[i] && c.t[i] === 379) vBub.push(`(${x},${y})`);
    if ((st.flags[i] & 1) && SHEET[st.type[i]] === 379) jBub.push(`(${x},${y})`);
  }
  console.log(`[i189] x86 log488 (${vLog.length}): ${vLog.join(' ')}`);
  console.log(`[i189] JS  log488 (${jLog.length}): ${jLog.join(' ')}`);
  console.log(`[i189] bubble counts: x86=${vBub.length} JS=${jBub.length}`);
  const vs = new Set(vBub), js = new Set(jBub);
  const onlyV = vBub.filter((s) => !js.has(s));
  const onlyJ = jBub.filter((s) => !vs.has(s));
  console.log(`[i189] bubble only-x86 (${onlyV.length}): ${onlyV.join(' ')}`);
  console.log(`[i189] bubble only-JS (${onlyJ.length}): ${onlyJ.join(' ')}`);
  // —— (3459,299..301) 邻域双方 bubble 环 + pre-pass(074) / x86(075) 窗口态 ——
  {
    const pre = `${G2}/074_Surface_Ore_and_Stone`;
    const p = { t: le16(`${pre}.typ`), a: rd(`${pre}.act`), l: rd(`${pre}.liq`), lt: rd(`${pre}.lty`) };
    const dumpCell = (arr: typeof p, x: number, y: number): string => {
      const i = y * W + x;
      return `${arr.a[i] ? 'T' + arr.t[i] : 'air'}${arr.l[i] ? '/L' + arr.l[i] + 't' + arr.lt[i] : ''}`;
    };
    const jsCell = (x: number, y: number): string => {
      const i = y * W + x;
      return `${(st.flags[i] & 1) ? 'T' + SHEET[st.type[i]] : 'air'}${st.liquid[i] ? '/L' + st.liquid[i] + 't' + st.liquidType[i] : ''}`;
    };
    console.log('[i189] pre-pass(074) x86 window y=296..304 x=3454..3464:');
    for (let y = 296; y <= 304; y++) {
      const row: string[] = [];
      for (let x = 3454; x <= 3464; x++) row.push(dumpCell(p, x, y));
      console.log(`[i189]   y${y}: ${row.join(' | ')}`);
    }
    console.log('[i189] post-pass(075) x86 window:');
    for (let y = 296; y <= 304; y++) {
      const row: string[] = [];
      for (let x = 3454; x <= 3464; x++) row.push(dumpCell(c, x, y));
      console.log(`[i189]   y${y}: ${row.join(' | ')}`);
    }
    console.log('[i189] post-pass(075) JS window:');
    for (let y = 296; y <= 304; y++) {
      const row: string[] = [];
      for (let x = 3454; x <= 3464; x++) row.push(jsCell(x, y));
      console.log(`[i189]   y${y}: ${row.join(' | ')}`);
    }
    // 双方 bubble 在窗口 x∈[3400,3520] y∈[240,360] 的分布（拼出方格环）
    const inWin = (s: string): boolean => {
      const m = s.match(/\((\d+),(\d+)\)/);
      if (!m) return false;
      const x = Number(m[1]), y = Number(m[2]);
      return x >= 3400 && x <= 3520 && y >= 240 && y <= 360;
    };
    const vWin = vBub.filter(inWin).sort();
    const jWin = jBub.filter(inWin).sort();
    console.log(`[i189] x86 bubbles in win (${vWin.length}): ${vWin.join(' ')}`);
    console.log(`[i189] JS bubbles in win (${jWin.length}): ${jWin.join(' ')}`);
  }
}, 900_000);
