// IIII152：sparkle 链关键槽五点回归仪（叶堆后续 F1/F2 销账批 · 2026-09-04）。
// 五点取 x86 dump 序（G2=~/GoldenChains/golden-sparkle,IIIII105b 重产）：
//   #000_Terrain        —— 槽末#0（原版地形）
//   #042_Living_Trees   —— reseed ▶LivingTreeWalls（结构窗内 pass 边界,state=Living Trees 末态;
//                          IIII100b 叶面堆杀后链主刀域）
//   #049_Settle_Liquids —— 槽末「水体沉降」（F1 液体域,IIIII105b 地牢豁免盒 exclusive 一刀）
//   #097_Micro_Biomes   —— 槽末「微群系」（F2 内容族,IIIII106c DeadMans gateD 一刀）
//   #105_Final_Cleanup  —— 槽末「终清理」（finalize 神圣化臂,Skip 边界 exclusive 判读须带旗）
// 锚机制：槽末四点走 onWorldPartial 槽名（ mile8 SLOT_END 同语义：JS 窗末=窗口内最后一个
//   原版 pass 的 dump 末态）；#042 走 RNG.reseed 栈行号→▶label（_iii100spot 同法）。
// 对拍=mile8 同口径 8 通道独立计数（act/typ/wal/liq/half/slope/lty/inact）。
// 用法：cd game && SW_MB_1457=1 SW_I152=1 npx vitest run tools/_iii152spot.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I152 === '1';
const G2 = process.env.SW_I152_G2 ?? `${process.env.HOME}/GoldenChains/golden-sparkle`;
const SEED = process.env.SW_I152_SEED ?? '771004';
const EVIL = process.env.SW_I152_EVIL !== undefined ? Number(process.env.SW_I152_EVIL) : 0;
const W = Number(process.env.SW_I152_W ?? 4200), H = Number(process.env.SW_I152_H ?? 1200);
const N = W * H;
// 旗面直注（SeedFlags 字段名）。★sparkle mile8 判读必须带 hallowOnTheSurface——
// 无旗=#105 T116>53×48707 全红=旗面缺失伪红（CXII 判读注）。
const FLAGS: Record<string, boolean> = { hallowOnTheSurface: true };

const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}
const POINTS = [0, 42, 49, 97, 105];
/** 槽名 → dump idx（窗末语义）；#042 由 ▶LivingTreeWalls reseed 锚补 */
const SLOT2DUMP = new Map<string, number>([
  ['原版地形', 0], ['水体沉降', 49], ['微群系', 97], ['终清理', 105],
]);
const LEAF_LABEL_DUMP = 42; // ▶LivingTreeWalls

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
for (const i of POINTS) {
  const nm = DUMPNAME.get(i);
  if (nm === undefined) throw new Error(`G2 缺 dump #${i}（dir=${G2}）`);
  const pfx = `${G2}/${String(i).padStart(3, '0')}_${nm}`;
  for (const c of ['act', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'] as const) {
    try { readFileSync(`${pfx}.${c}`); } catch { throw new Error(`#${i}_${nm} 缺通道 .${c}（G2 非 8 通道完整产物）`); }
  }
}

(RUN ? it : it.skip)('sparkle five-key-slot parity (IIIII152)', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  let store: TileStore | null = null;
  const rows: Array<{ idx: number; tag: string; bad: boolean; desc: string }> = [];
  const seen = new Set<number>();

  const cmpDump = (idx: number, tag: string): void => {
    const nm = DUMPNAME.get(idx)!;
    const pfx = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
    const xa = readFileSync(`${pfx}.act`); const xt = le16(`${pfx}.typ`);
    const xw = le16(`${pfx}.wal`); const xl = readFileSync(`${pfx}.liq`);
    const xhf = readFileSync(`${pfx}.half`); const xsl = readFileSync(`${pfx}.slope`);
    const xlt = readFileSync(`${pfx}.lty`); const xia = readFileSync(`${pfx}.inact`);
    const st = store!;
    const cnt = [0, 0, 0, 0, 0, 0, 0, 0];
    let fI = -1; const pairs = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { cnt[0]++; if (fI < 0) fI = i; }
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) { cnt[1]++; if (fI < 0) fI = i; const k = `T${vt}>${jt}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
      if (xw[i] !== st.wall[i]) { cnt[2]++; if (fI < 0) fI = i; }
      if (xl[i] !== st.liquid[i]) { cnt[3]++; if (fI < 0) fI = i; }
      if (xhf[i] !== st.half[i]) { cnt[4]++; if (fI < 0) fI = i; }
      if (xsl[i] !== st.slope[i]) { cnt[5]++; if (fI < 0) fI = i; }
      const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) { cnt[6]++; if (fI < 0) fI = i; }
      const via = xia[i]! ? 1 : 0;
      const jia = (st.wire[i]! >>> 5) & 1;
      if (via !== jia) { cnt[7]++; if (fI < 0) fI = i; }
    }
    const desc = `${cnt.map((v, k) => `${['A', 'T', 'W', 'L', 'Hf', 'Sl', 'Lt', 'Ia'][k]}=${String(v).padStart(6)}`).join(' ')}` +
      (cnt.some(Boolean) ? ` ✗ @(${fI % W},${(fI / W) | 0}) ${[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}×${n}`).join(' ')}` : ' ✓');
    console.log(`#${String(idx).padStart(3, '0')}_${nm} ← ${tag.padEnd(22)} ${desc}`);
    seen.add(idx);
    rows.push({ idx, tag, bad: cnt.some(Boolean), desc });
  };

  // ▶label 锚（_iii100spot 同法）：栈行号→文件源回溯 ▶label
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const labelOf = (file: string, line: number): string => {
    let src: string[] | undefined;
    try { src = readFileSync(file, 'utf8').split('\n'); } catch { return `${file.split('/').pop()}:${line}`; }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  RNGp.reseed = function (this: unknown, s: number) {
    if (store && !seen.has(LEAF_LABEL_DUMP)) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          if (labelOf(m[1], Number(m[2])) === 'LivingTreeWalls') { cmpDump(LEAF_LABEL_DUMP, '▶LivingTreeWalls'); }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };

  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL,
      seedFlags: FLAGS,
      onWorldPartial: (w, _i, pn) => {
        store = w.store as never as TileStore;
        const idx = SLOT2DUMP.get(pn);
        if (idx !== undefined && !seen.has(idx)) cmpDump(idx, `槽末·${pn}`);
      },
    });
  } finally { RNGp.reseed = oReseed; }

  const missing = POINTS.filter((i) => !seen.has(i));
  if (missing.length) throw new Error(`五点未全部取到,缺 ${missing.join(',')}`);
  const bad = rows.filter((r) => r.bad);
  if (bad.length) throw new Error(`sparkle 五点出现差 → ${bad.map((r) => `#${r.idx}`).join(',')}${bad[0]?.desc ?? ''}`);
  console.log('sparkle: 五点全绿 ✓（#000/#042/#049/#097/#105）');
}, 900_000);
