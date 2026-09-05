// IIII188 批一次性取证仪：x86 终态「活性越真表底帧」族普查（CLXI 章 1,121 格改判的正当性抽验 + 净化改判刀目标域取证）。
// 只读 dump，零世界生成。四问：
//   F1 活性格帧越【真 XNB 表底】(sheet-dims.json=terraria-assets PNG 实测) —— 按 tile type 分桶（复现 CLXI drunk 1,121）；
//   F2 负帧半区 (32768..65534，65535=未定帧哨兵另计) —— 按 type 分桶（「负帧仍清」域的实存性取证）；
//   F3 无表 type (TILE_DEFS 无 vanilla.sheet) 活性格持非零帧 —— 「非法 tile 仍清」域的实存性取证；
//   F4/F5 模拟 finalize 帧净化现行逻辑：F4=会清(误杀集)按 type 分桶 / F5=越表但分带·折页解码放行(合法集)。
// 用法：
//   cd game && npx vitest run tools/_iii188census.test.ts            # 默认 drunk 链 #105
//   SW_I188_DIR=/Users/vinlic/GoldenChains/golden-remix-fr SW_I188_TAG=remix npx vitest run tools/_iii188census.test.ts
// 产物：/tmp/iii188-out/census-<tag>.json
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import vanillaJson from '../public/sprites/vanilla.json';

const DIR = process.env.SW_I188_DIR ?? `${process.env.HOME}/GoldenChains/golden-drunk-10ch`;
const TAG = process.env.SW_I188_TAG ?? 'drunk';
const IDX = Number(process.env.SW_I188_IDX ?? 105);
const W = Number(process.env.SW_I188_W ?? 4200);
const OUT = process.env.SW_I188_OUT ?? '/tmp/iii188-out';

// 真 XNB 表宽高（terraria-assets PNG 实测，CLXI 批产物原样收编）
const TRUE_DIM: Record<string, [number, number]> = JSON.parse(
  readFileSync(`${OUT}/sheet-dims.json`, 'utf8'),
);

// ── finalize 现行逻辑逐字镜像（WorldGen.ts V_SHEET_DIM/RAW_SHEET_DIM/净化支）────────
const V_SHEET_DIM: Record<number, [number, number]> = (() => {
  const out: Record<number, [number, number]> = {};
  const t = (vanillaJson as unknown as { tiles: Record<string, { grid: [number, number]; cols: number; rows: number }> }).tiles;
  for (const [k, m] of Object.entries(t)) {
    if (!m || !m.cols || !m.rows) continue;
    out[Number(k)] = [m.cols * m.grid[0] + (m.cols - 1) * 2, m.rows * m.grid[1] + (m.rows - 1) * 2];
  }
  return out;
})();
const RAW_SHEET_DIM: Record<number, [number, number]> = { 86: [52, 34], 94: [34, 34], 101: [1996, 142] };
const VERTICAL_STYLE_SHEETS = new Set([92, 93, 453]);

const SHEET = new Int32Array(1000).fill(-1);
// ★x86 dump .typ 通道=vanilla sheet 空间（_iii163fx 同口径:jt=SHEET[JS 内部 id] 对 vt 比对）
//   ⇒ 本仪 sheet 取值=typ 本身;JS 侧只需 sheet→fw/fh 反查（分带解码用,fw/fh 逐表一致）
const VAN = new Map<number, { fw: number; fh: number }>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && s >= 0 && !VAN.has(s)) {
    const fw = TILE_DEFS[i]?.vanilla?.fw, fh = TILE_DEFS[i]?.vanilla?.fh;
    VAN.set(s, { fw: fw ?? 1, fh: fh ?? 1 });
  }
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
};
const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));

it('iii188 census', () => {
  const files = readdirSync(DIR);
  const pref = (files.find((f) => new RegExp(`^${String(IDX).padStart(3, '0')}_.+\\.typ$`).test(f)) ?? '').replace(/\.typ$/, '');
  if (!pref) throw new Error(`no #${IDX} dump in ${DIR}`);
  const fxExt = existsSync(`${DIR}/${pref}.fx`) ? 'fx' : 'frx';
  const fyExt = existsSync(`${DIR}/${pref}.fy`) ? 'fy' : 'fry';
  const typ = le16(`${DIR}/${pref}.typ`);
  const act = u8(`${DIR}/${pref}.act`);
  const fx = le16(`${DIR}/${pref}.${fxExt}`);
  const fy = le16(`${DIR}/${pref}.${fyExt}`);
  const N = typ.length;

  const t1 = new Map<number, number>();   // F1 越真表底 by type
  const f1bySheet = new Map<number, number>();
  const f1coord: Record<number, string> = {};
  const t2 = new Map<number, number>();   // F2 负帧半区 by type
  let sentinel = 0;
  const t3 = new Map<number, number>();   // F3 无表持帧
  const t4 = new Map<number, number>();   // F4 现行净化会清 by type
  const t4coord: Record<number, string> = {};
  let f5legal = 0;                        // F5 越表但解码放行
  const t5bySheet = new Map<number, number>();
  let activeCells = 0;
  let beyondTrue = 0;

  for (let i = 0; i < N; i++) {
    if (act[i] !== 1) continue;
    activeCells++;
    const ty = typ[i];
    let a = fx[i], b = fy[i];
    if (a === 65535 || b === 65535) sentinel++;
    if (a !== 65535 && a >= 32768) t2.set(ty, (t2.get(ty) ?? 0) + 1);
    if (b !== 65535 && b >= 32768) t2.set(ty, (t2.get(ty) ?? 0) + 1);
    const sh = ty;
    if (sh <= 0) {
      if (a !== 0 || b !== 0) t3.set(ty, (t3.get(ty) ?? 0) + 1);
      continue;
    }
    const td = TRUE_DIM[String(sh)];
    if (!td) continue;
    const [tw, th] = td;
    // 归一哨兵后判越表（65535→0）
    const na = a === 65535 ? 0 : a, nb = b === 65535 ? 0 : b;
    if (na >= tw || nb >= th) {
      beyondTrue++;
      t1.set(ty, (t1.get(ty) ?? 0) + 1);
      f1bySheet.set(sh, (f1bySheet.get(sh) ?? 0) + 1);
      if (!f1coord[ty]) {
        const x = i % W, y = Math.floor(i / W);
        f1coord[ty] = `(${x},${y}) f(${na},${nb}) true=[${tw}x${th}]`;
      }
    }
    // ── 现行净化模拟（WorldGen.ts finalize 帧净化支逐字）──
    const m = RAW_SHEET_DIM[sh] ?? V_SHEET_DIM[sh];
    const w = m ? m[0] : 0, h2 = m ? m[1] : 0;
    if (w === 0) continue;
    if (a < 32768 && b < 32768 && (a >= w || b >= h2)) {
      let legal = false;
      if (a >= 0 && a >= w) {
        const dv = VAN.get(ty);
        const objW = (dv?.fw ?? 1) * 18, bandH = (dv?.fh ?? 1) * 18;
        const colsPerBand = objW > 0 ? Math.floor(w / objW) : 0;
        if (colsPerBand > 0) {
          const styleIdx = Math.floor(a / objW);
          if (styleIdx >= colsPerBand) {
            const wx = (styleIdx % colsPerBand) * objW + (a % objW);
            const wy = b + Math.floor(styleIdx / colsPerBand) * bandH;
            if (wx + 16 <= w && wy + 16 <= h2) legal = true;
          }
        }
      }
      if (!legal && b >= 0 && b >= h2 && VERTICAL_STYLE_SHEETS.has(sh)) {
        const dv = VAN.get(ty);
        const objW = (dv?.fw ?? 1) * 18, objH = (dv?.fh ?? 1) * 18;
        const rowsPerBand = objH > 0 ? Math.floor(h2 / objH) : 0;
        if (rowsPerBand > 0) {
          const styleIdx = Math.floor(b / objH);
          if (styleIdx >= rowsPerBand) {
            const wy = (styleIdx % rowsPerBand) * objH + (b % objH);
            const wx = a + Math.floor(styleIdx / rowsPerBand) * objW;
            if (wx + 16 <= w && wy + 16 <= h2) legal = true;
          }
        }
      }
      if (!legal && sh === 139 && b >= 0 && a >= 0) {
        const page = Math.floor(b / 2016);
        const wx = a + 72 * page, wy = b - 2016 * page;
        if (wx + 16 <= w && wy + 16 <= h2) legal = true;
      }
      if (legal) { f5legal++; t5bySheet.set(sh, (t5bySheet.get(sh) ?? 0) + 1); }
      else {
        t4.set(ty, (t4.get(ty) ?? 0) + 1);
        if (!t4coord[ty]) {
          const x = i % W, y = Math.floor(i / W);
          t4coord[ty] = `(${x},${y}) f(${a},${b}) vdim=[${w}x${h2}] sh=${sh}`;
        }
      }
    }
  }
  const map = (m: Map<number, number>) => Object.fromEntries([...m.entries()].sort((x, y) => y[1] - x[1]));
  const res = {
    tag: TAG, dir: DIR, dump: pref, fxExt, activeCells, N,
    F1_beyondTrue: beyondTrue, F1_byType: map(t1), F1_bySheet: map(f1bySheet), F1_coord: f1coord,
    F2_negHalf: [...t2.values()].reduce((s, v) => s + v, 0), F2_byType: map(t2), F2_sentinel65535: sentinel,
    F3_noSheetFramed: [...t3.values()].reduce((s, v) => s + v, 0), F3_byType: map(t3),
    F4_purgeClears: [...t4.values()].reduce((s, v) => s + v, 0), F4_byType: map(t4), F4_coord: t4coord,
    F5_decodedLegal: f5legal, F5_bySheet: map(t5bySheet),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/census-${TAG}.json`, JSON.stringify(res, null, 1));
  console.log(`[iii188 ${TAG}] active=${activeCells} F1_beyondTrue=${beyondTrue} F2_neg=${res.F2_negHalf} (sentinel=${sentinel}) F3_noSheetFramed=${res.F3_noSheetFramed} F4_purgeClears=${res.F4_purgeClears} F5_decodedLegal=${f5legal}`);
  console.log(`  F1_byType=`, JSON.stringify(res.F1_byType));
  console.log(`  F4_byType=`, JSON.stringify(res.F4_byType));
});
