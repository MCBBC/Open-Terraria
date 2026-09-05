// IIII198: #105 Final_Cleanup 残差几何取证（pot 28 / bubble 379 / moss 族 / 草 60 / 石 1）
// ——x86 金标 105_Final_Cleanup ↔ JS 槽末#58 快照逐格对拍 + 局部 5×5 窗显影。
// 用法：SW_I198P_GOLD=<dumpPrefix> SW_I198P_JS=<saveDir> npx vitest run tools/_iii198pot.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const GOLD = process.env.SW_I198P_GOLD ?? `${process.env.HOME}/GoldenChains/i106/x86-iamerror/105_Final_Cleanup`;
const JSD = process.env.SW_I198P_JS ?? '/tmp/iii195-out/js-slot105';
const OUT = process.env.SW_I198P_OUT ?? '/tmp/iii198-out/pot-geo.txt';
const W = Number(process.env.SW_I198P_W ?? 4200), H = Number(process.env.SW_I198P_H ?? 1200);
const SAMPLE = Number(process.env.SW_I198P_SAMPLE ?? 24);

it('iii198 pot geometry', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const N = W * H;
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const gt = rd16(`${GOLD}.typ`), ga = readFileSync(`${GOLD}.act`), gl = rd16(`${GOLD}.liq`);
  const jtRaw = new Uint16Array(readFileSync(`${JSD}/base_type.bin`).buffer);
  const jf = new Uint8Array(readFileSync(`${JSD}/base_flags.bin`).buffer);
  const jfx = new Uint16Array(readFileSync(`${JSD}/base_frameX.bin`).buffer);
  const jfy = new Uint16Array(readFileSync(`${JSD}/base_frameY.bin`).buffer);
  const jl = rd16(`${JSD}/base_liquid.bin`);

  // 活性+sheet 化的双方 type 场
  const vt = new Int32Array(N), jty = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const va = (ga[i] & 1) !== 0;
    vt[i] = va ? gt[i] : 0;
    const ja = (jf[i] & 1) !== 0;
    jty[i] = ja ? (SHEET[jtRaw[i]] >= 0 ? SHEET[jtRaw[i]] : 9999) : 0;
  }

  const lines: string[] = [];
  const P = (s: string) => { lines.push(s); };

  const FAMILIES: Array<[string, number[]]> = [
    ['pot28', [28]],
    ['bubble379', [379]],
    ['grass60', [60]],
    ['stone1', [1]],
    ['moss', [182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]],
  ];

  const win = (t: Int32Array, x: number, y: number, r: number): string[] => {
    const rows: string[] = [];
    for (let yy = y - r; yy <= y + r; yy++) {
      let s = '';
      for (let xx = x - r; xx <= x + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) { s += ' #'; continue; }
        const v = t[yy * W + xx];
        s += ' ' + (v >= 1000 ? '@' : v === 0 ? '.' : v < 10 ? String(v) : v < 36 ? String.fromCharCode(87 + v) : v < 62 ? String.fromCharCode(29 + v) : v < 88 ? String.fromCharCode(63 + v) : String(v));
      }
      rows.push(s);
    }
    return rows;
  };
  // 符号表: .=0, 0-9=0..9, a-z=10..35, A-Z=36..61, @=9999, 其他=数值
  const decodeSym = (c: string): number => c === '.' ? 0 : c === '#' ? -1 : c === '@' ? 9999
    : c >= '0' && c <= '9' ? c.charCodeAt(0) - 48
    : c >= 'a' && c <= 'z' ? c.charCodeAt(0) - 87
    : c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 29 : -2;

  for (const [fam, ids] of FAMILIES) {
    const set = new Set(ids);
    let both = 0, vOnly = 0, jOnly = 0, jOther = 0;
    const vOnlyList: number[] = [], jOnlyList: number[] = [];
    for (let i = 0; i < N; i++) {
      const v = set.has(vt[i]), j = set.has(jty[i]);
      if (v && j) both++;
      else if (v && !j) { vOnly++; if (vOnlyList.length < 4000) vOnlyList.push(i); }
      else if (!v && j) {
        jOnly++;
        if (vt[i] !== 0) jOther++;
        if (jOnlyList.length < 4000) jOnlyList.push(i);
      }
    }
    P(`\n===== ${fam} ids=[${ids.join(',')}] both=${both} x86only=${vOnly} JSonly=${jOnly} (JSonly 中 x86 非空=${jOther}) =====`);
    // 几何: x86-only 簇内正交/对角邻计数
    const geo = (list: number[]) => {
      let ortho = 0, diag = 0, lone = 0;
      for (const i of list) {
        const x = i % W, y = (i / W) | 0;
        const t = vt;
        const isV = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && set.has(t[yy * W + xx]);
        const o = isV(x - 1, y) || isV(x + 1, y) || isV(x, y - 1) || isV(x, y + 1);
        const d = isV(x - 1, y - 1) || isV(x + 1, y - 1) || isV(x - 1, y + 1) || isV(x + 1, y + 1);
        if (o) ortho++;
        else if (d) diag++;
        else lone++;
      }
      return `正交邻=${ortho} 仅对角邻=${diag} 孤立=${lone}`;
    };
    P(`  x86-only 几何: ${geo(vOnlyList)}`);
    P(`  JS-only  几何: ${geo(jOnlyList)}`);
    // 对角配对率: x86-only 格的对角位置是否恰为 JS-only（=残形对角化证据）
    const pair = (list: number[], tA: Int32Array, tB: Int32Array) => {
      let dPair = 0, oPair = 0, offEmpty = 0, offOther = 0;
      for (const i of list) {
        const x = i % W, y = (i / W) | 0;
        const has = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && set.has(tB[yy * W + xx]);
        const d = has(x - 1, y - 1) || has(x + 1, y - 1) || has(x - 1, y + 1) || has(x + 1, y + 1);
        const o = has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1);
        if (d) dPair++;
        if (o) oPair++;
        if (!d && !o) {
          if (tB[i] === 0) offEmpty++; else offOther++;
        }
      }
      return `对角侧同族=${dPair} 正交侧同族=${oPair} 对侧空=${offEmpty} 对侧他物=${offOther}`;
    };
    P(`  x86-only ↔ JS 侧: ${pair(vOnlyList, vt, jty)}`);
    P(`  JS-only  ↔ x86 侧: ${pair(jOnlyList, jty, vt)}`);
    // 采样窗
    const dumpWin = (list: number[], tA: Int32Array, tB: Int32Array, lA: Int32Array | null, lB: Int32Array | null, tag: string) => {
      const n = Math.min(SAMPLE, list.length);
      P(`  ${tag} 采样 ${n}:`);
      for (let s = 0; s < n; s++) {
        const i = list[s * Math.max(1, ((list.length / SAMPLE) | 0))];
        const x = i % W, y = (i / W) | 0;
        P(`  --- ${tag} cell(${x},${y}) x86=${tA[i]} js=${tB[i]} x86liq=${lA ? lA[i] : '-'} jsliq=${lB ? lB[i] : '-'}`);
        const wa = win(tA, x, y, 2), wb = win(tB, x, y, 2);
        for (let r = 0; r < wa.length; r++) P(`    x86${wa[r]}   |  js${wb[r]}`);
      }
    };
    dumpWin(vOnlyList, vt, jty, gl, jl, 'x86only');
    dumpWin(jOnlyList, vt, jty, gl, jl, 'JSonly');
  }
  writeFileSync(OUT, lines.join('\n'));
  console.log(`[i198p] wrote ${lines.length} lines -> ${OUT}`);
}, 600_000);
