// 一次性诊断（里程碑定位批 2026-08-18）：JS 管线【8 通道】逐槽对拍 /tmp/sw-slp/g
// （x86 真值，含 slope/half/lty/inact）。槽 0..31：dumps 0/1/13=JS 槽末回调，
// 其余=reseed ▶label 时点（state=上一原版 pass 末态）。收满 31（▶Dungeon）后中止
// 生成省时。通道：act/typ(活性)/wal/liq/half/slope/lty(vanilla 0 基→JS +1 基，
// 仅 liquid>0 格裁决)/inact(致动位)/ghost(非活性残留 type——信息位)。
// 用法：cd game && SW_M8=1 npx vitest run tools/_mile8.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_M8 === '1';
const VG = process.env.SW_M8_VG ?? '/tmp/sw-num4/van_x86_g';  // 名表源
const G2 = process.env.SW_M8_G2 ?? '/tmp/sw-slp/g';            // 8 通道真值
// JJJJ 批旁路参：第二种子对拍（默认 9293480/0 保持原行为不变）
const SEED = process.env.SW_M8_SEED ?? '9293480';
const EVIL = process.env.SW_M8_EVIL !== undefined ? Number(process.env.SW_M8_EVIL) : 0;
// YYYY 批旁路参：中世界链（6400×1800）+大 N 禁缓存（每槽 ~115MB×106 槽会爆 RSS）
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
const NOCACHE = process.env.SW_M8_NOCACHE === '1';
// PPPPP 批旁路参：彩蛋种子旗标直注（S0-1 seedFlags 通道）——逗号分隔旗标名
// （如 SW_M8_FLAGS=theConstant），与 SW_M8_SEED 数字种子配套（对拍秘密种子链用）
// ★BBBBBBB（2026-08-24）键勘误：值必须是 SeedFlags **字段名**（驼峰），直注无解析——
//   曾用触发词 'notraps'（≠noTraps）键不存在被静默忽略 → NOTRAPS 链 mile8 恒跑
//   普通世界（0..57 假绿、#58 雕像×15 全缺）。别名表把常用触发词映射到字段名；
//   精确字段名（theConstant/notTheBees 等）不受影响。getfixedboi 是组合触发词
//   （置 7 件），不在此表——组合链请直接传全字段。
const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps',
  constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', celebrationmk10: 'tenthAnniversary',
  fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
};
const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_M8_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** JS 槽末 → dump idx */
const SLOT_END = new Map<number, number>([
  [0, 0], [1, 1], [2, 13], [3, 35], [5, 37], [6, 38], [7, 39], [8, 48],
  [9, 49], [10, 50], [11, 51], [12, 52], [13, 53],
  // YYYY 批尾段扩展（JS 槽 14..57 ↔ dump 54..105；语义=槽内最后一个原版 pass）：
  // 18 雕像宝箱止于 SpiderCaves(63)；35 向日葵→81（Guide(80)=NPC pass 不动格，
  // 与 79 末态逐格同——JS 无槽）；40 地表植物=Weeds(86)+GlowingMushroomPlants(87)；
  // 45 宝石系统止于 Random_Gems(93)；58 多格残片清扫=JS 补丁无 dump。
  [14, 54], [15, 55], [16, 56], [17, 57], [18, 63], [19, 64], [20, 65],
  [21, 66], [22, 67], [23, 68], [24, 69], [25, 70], [26, 71], [27, 72],
  [28, 73], [29, 74], [30, 75], [31, 76], [32, 77], [33, 78], [34, 79],
  [35, 81], [36, 82], [37, 83], [38, 84], [39, 85], [40, 87], [41, 88],
  [42, 89], [43, 90], [44, 91], [45, 93], [46, 94], [47, 95], [48, 96],
  [49, 97], [50, 98], [51, 99], [52, 100], [53, 101], [54, 102], [55, 103],
  [56, 104], [57, 105],
]);
/** reseed ▶label → dump idx（state=上一原版 pass 末态；_slotdif2/_c33replay 表+IceBiome→14） */
const LABEL2DUMP = new Map<string, number>([
  ['SandPatches', 2], ['Tunnels', 3], ['MountainCaves', 4], ['DirtWallBackgrounds', 5],
  ['RocksInDirt', 6], ['DirtInRocks', 7], ['Clay', 8], ['SmallHoles', 9],
  ['DirtLayerCaves', 10], ['RockLayerCaves', 11], ['SurfaceCaves', 12],
  ['WavyCaves', 13],
  ['IceBiome', 14], ['Grass', 15], ['JunglePass', 16], ['MudCavesToJungleGrass', 17],
  ['DesertBiome', 18], ['GlowingMushroomPatches', 19], ['Marble', 20], ['Granite', 21],
  ['FloatingIslands', 22], ['DirtToMud', 23], ['Silt', 24], ['OresAndShinies', 25],
  ['Webs', 26], ['Underworld', 27], ['CorruptionAndCrimson', 28], ['Lakes', 29],
  ['Slush', 30], ['Dungeon', 31],
  ['MountainCaveOpenings', 32], ['BeachesAndOceanCleanup', 33], ['Gems', 34],
  ['OceanCaves', 36], ['Shimmer', 37], ['DirtWallCleanup', 38], ['Pyramids', 39],
  ['DirtRockWallRunner', 40], ['LivingTrees', 41], ['LivingTreeWalls', 42],
  ['DemonAndCrimsonAltars', 43], ['SurfaceWaterInJungle', 44], ['LihzahrdTemple', 45],
  ['Beehives', 46], ['JungleShrines', 47],
  // YYYY 批尾段扩展（58..69/85..92 段的 pass 头时点；语义=上一原版 pass 末态）：
  // Statues:16947→57 / BuriedChests:17066→58 / SurfaceChests:17226→59 /
  // JungleChestsPlacement:17308→60 / WaterChests:17343→61 / SpiderCaves:17455→62 /
  // UndergroundJungleTrees:17952→67 / QuickCleanup:17987→69 / GrassPlants:20232→85 /
  // GlowingMushroomPlants:20278→86 / ExposedGemsInIceBiome:20842→91 /
  // ExposedGemsUnderground:20874→92
  ['Statues', 57], ['UndergroundHousesAndBuriedChests', 58], ['SurfaceChests', 59],
  ['ChestsInJungleShrines', 60], ['UnderwaterChests', 61], ['SpiderCaves', 62],
  ['UndergroundJungleTrees', 67], ['QuickCleanup', 69], ['GrassPlants', 85],
  ['GlowingMushroomPlants', 86], ['ExposedGemsInIceBiome', 91], ['ExposedGemsUnderground', 92],
]);
const DUMPNAME = new Map<number, string>();
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
/** 8 通道完备集（.typ 名表之外必须齐备的 7 通道）——HHHHHHH 第 4 坑免疫基准 */
const CHAN_FILES = ['act', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'] as const;
const cache = new Map<number, Ch>();
function chans(idx: number): Ch | null {
  const hit = cache.get(idx);
  if (hit) return hit;
  const nm = DUMPNAME.get(idx);
  if (!nm) return null;
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  if (!existsSync(`${pre}.typ`)) return null;
  // ★HHHHHHH（2026-08-24）假绿免疫第 4 坑·逐槽通道完备性：GGG 批实证 g-s22222/
  // g-m20260811 为 4 通道 dump（缺 half/slope/lty/inact）→ 旧门只查 .half 存在性,
  // 整链 '(no dump)' 全零=假绿（AAAAA「s22222/m 106/106 满绿」作废）。缺任一通道
  // 即 throw,禁止静默零差。
  const miss = CHAN_FILES.filter((c) => !existsSync(`${pre}.${c}`));
  if (miss.length > 0) {
    throw new Error(`mile8 假绿免疫(通道完备性): #${idx}_${nm} 缺通道 [${miss.join(',')}] —— dump 目录(${G2})非 8 通道完整产物,禁止静默零差对拍`);
  }
  const c: Ch = {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
  if (!NOCACHE) cache.set(idx, c);
  return c;
}

interface Row {
  idx: number; tag: string; dA: number; dT: number; dW: number; dL: number;
  dHf: number; dSl: number; dLt: number; dIa: number; dGh: number;
  first: string; pairs: Array<[string, number]>; samples: string[];
}
function cmp(tag: string, idx: number, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}): Row {
  const c = chans(idx);
  const r: Row = { idx, tag, dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, dGh: 0, first: '', pairs: [], samples: [] };
  if (!c) { r.first = '(no dump)'; return r; }
  const pair = new Map<string, number>();
  let firstI = -1;
  const mark = (i: number) => { if (firstI < 0) firstI = i; };
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; mark(i); if (r.samples.length < 8) r.samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) {
      r.dT++; mark(i);
      const k = `T${vt}>${jt}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      if (r.samples.length < 8) r.samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`);
    }
    if (c.w[i]! !== st.wall[i]!) { r.dW++; mark(i); if (r.samples.length < 8) r.samples.push(`W(${i % W},${(i / W) | 0}) v${c.w[i]} j${st.wall[i]}`); }
    if (c.l[i]! !== st.liquid[i]!) { r.dL++; mark(i); if (r.samples.length < 8) r.samples.push(`L(${i % W},${(i / W) | 0}) v${c.l[i]} j${st.liquid[i]}`); }
    if (c.hf[i]! !== st.half[i]!) { r.dHf++; mark(i); const k = `H${c.hf[i]}>${st.half[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 8) r.samples.push(`H(${i % W},${(i / W) | 0}) v${c.hf[i]} j${st.half[i]}`); }
    if (c.sl[i]! !== st.slope[i]!) { r.dSl++; mark(i); const k = `S${c.sl[i]}>${st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 8) r.samples.push(`S(${i % W},${(i / W) | 0}) v${c.sl[i]} j${st.slope[i]}`); }
    // lty：仅 liquid>0 的格裁决（vanilla 0 基 ↔ JS +1 基）
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; mark(i); const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 8) r.samples.push(`Y(${i % W},${(i / W) | 0}) v${vl} j${jl} liq${c.l[i]}`); }
    const via = c.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; mark(i); if (r.samples.length < 8) r.samples.push(`I(${i % W},${(i / W) | 0}) v${via} j${jia}`); }
    // ghost（信息位）：非活性残留 type
    const vg = va ? 0 : c.t[i]!;
    const jg = ja ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999);
    if (vg !== jg) r.dGh++;
  }
  if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n] as [string, number]);
  return r;
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

(RUN ? it : it.skip)('JS pipeline 8-channel slot diff vs /tmp/sw-slp/g (0..53)', async () => {
  for (const f of readdirSync(VG)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  console.log(`dump names: ${DUMPNAME.size} (8ch dir=${G2})`);
  // ★YYYYYY（2026-08-23）假绿免疫（XXXXX 批遗留#6 落地）：VG 传错目录（如 home-sec-*
  //  只有 .wld）→ DUMPNAME 空 → chans() 全 '(no dump)' → 全槽假绿。名表必须从
  //  8 通道 dump 目录取——SW_M8_VG 应与 SW_M8_G2 同目录。
  if (DUMPNAME.size < 100) {
    throw new Error(`mile8 假绿免疫：dump names=${DUMPNAME.size} <100——SW_M8_VG(${VG}) 缺 8 通道名表,应指向 dump 目录（与 SW_M8_G2 相同）`);
  }
  // ★HHHHHHH 假绿免疫第 4 坑·全量预检（fail-fast,不烧 2min 生成才炸）：逐槽校验
  // 8 通道齐备——4 通道 dump（如 GGG 批 g-s22222/g-m20260811）曾致整链 '(no dump)'
  // 假绿。任何槽缺 act/wal/liq/half/slope/lty/inact 任一即 throw。
  {
    const incomplete: string[] = [];
    for (const [idx, nm] of DUMPNAME) {
      const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
      const miss = CHAN_FILES.filter((c) => !existsSync(`${pre}.${c}`));
      if (miss.length > 0) incomplete.push(`#${idx}_${nm}[${miss.join(',')}]`);
    }
    if (incomplete.length > 0) {
      throw new Error(`mile8 假绿免疫(通道完备性): ${incomplete.length}/${DUMPNAME.size} 槽通道不全 → ` +
        `${incomplete.slice(0, 6).join(' ')}${incomplete.length > 6 ? ` …共${incomplete.length}槽` : ''} —— ` +
        `dump 目录(${G2})非 8 通道完整产物（4 通道 dump=整链 '(no dump)' 假绿,GGG 批实证）,请重产或换目录`);
    }
    console.log(`channel completeness: ${DUMPNAME.size}/${DUMPNAME.size} 槽 8 通道齐全 ✓`);
  }
  const rows: Row[] = [];
  let curStore: Parameters<typeof cmp>[2] | null = null;
  const seen = new Set<number>();
  const unmapped = new Set<string>();
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_mile8')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = LABEL2DUMP.get(lab);
          if (idx !== undefined && !seen.has(idx)) {
            seen.add(idx);
            rows.push(cmp(lab, idx, curStore!));
          } else if (idx === undefined && !unmapped.has(lab)) {
            unmapped.add(lab);
            console.log(`  [unmapped-label] ${lab} @${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  const t0 = Date.now();
  try {
    try {
      await generateWorld({
        width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
        seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
        onWorldPartial: (w, i) => {
          if (!curStore) curStore = w.store as never as typeof curStore;
          const idx = SLOT_END.get(i);
          if (idx === undefined || seen.has(idx)) return;
          seen.add(idx);
          rows.push(cmp(`槽末#${i}`, idx, w.store as never as typeof curStore));
        },
      });
    } catch (e) { throw e; }
  } finally { RNGp.reseed = oReseed; }
  rows.sort((a, b) => a.idx - b.idx);
  for (const r of rows) {
    const bad = r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa;
    console.log(`${String(r.idx).padStart(3)} ${DUMPNAME.get(r.idx) ?? '?'} ← ${r.tag.padEnd(22)} ` +
      `A=${String(r.dA).padStart(7)} T=${String(r.dT).padStart(7)} W=${String(r.dW).padStart(6)} L=${String(r.dL).padStart(6)} ` +
      `Hf=${String(r.dHf).padStart(6)} Sl=${String(r.dSl).padStart(6)} Lt=${String(r.dLt).padStart(6)} Ia=${String(r.dIa).padStart(4)} (Gh=${r.dGh}) ` +
      `${bad ? '✗ ' + r.first : '✓'}`);
    if (bad) {
      console.log(`     pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}`);
      console.log(`     samples: ${r.samples.join(' | ')}`);
    }
  }
  const firstBad = rows.find((r) => r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa);
  const firstGh = rows.find((r) => r.dGh);
  console.log(`\n★ 8通道首差边界: ${firstBad ? `#${String(firstBad.idx).padStart(3)} ${DUMPNAME.get(firstBad.idx)} @${firstBad.tag} ${firstBad.first} ${firstBad.pairs.slice(0, 4).map(([k, n]) => `${k}×${n}`).join(' ')}` : '无（0..31 全绿）'}`);
  console.log(`★ ghost 首差边界(信息位): ${firstGh ? `#${firstGh.idx} ${DUMPNAME.get(firstGh.idx)} gh=${firstGh.dGh}` : '无'}`);
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  writeFileSync(`/tmp/mile8_${SEED}.json`, JSON.stringify(rows));
}, 900_000);
