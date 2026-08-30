// 一次性诊断（里程碑定位批 2026-08-18）：JS 管线【8 通道】逐槽对拍 /tmp/sw-slp/g
// （x86 真值，含 slope/half/lty/inact）。槽 0..31：dumps 0/1/13=JS 槽末回调，
// 其余=reseed ▶label 时点（state=上一原版 pass 末态）。收满 31（▶Dungeon）后中止
// 生成省时。通道：act/typ(活性)/wal/liq/half/slope/lty(vanilla 0 基→JS +1 基，
// 仅 liquid>0 格裁决)/inact(致动位)/ghost(非活性残留 type——信息位)。
// 用法：cd game && SW_M8=1 npx vitest run tools/_mile8.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I67X === '1';
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

/** JS 槽末 → {d: dump idx, nm: 期望槽名}。
 * ★IIIIII8（2026-08-28）定罪修复：本表曾纯按【数字槽位】锚定——IIIIII6 批在
 * 「草墙」(34) 与「向日葵」之间插入「起始镇民」新槽后，≥35 的数字键未随迁：
 * 槽末#35（起始镇民，普通种子零副作用≈079_Grass_Wall 同值）被对到
 * 081_Sunflowers、后续全体错一位 → g/s22222/const/m 四链 #81 T27>0×N「全线
 * 伪红」（向日葵整批"被杀"假象；#82 起 T5×2140/T51×12177 型"万物被杀"扩散同源）
 * ——而标签驱动行（GlowingMushroomPlants 等）照常全绿=纯对位伪影铁证。
 * 修复三件：①新增 [35,80]（080_Guide=SpawnStarterNPCs 出口快照；原注「JS 无槽」
 * 已失效，该槽现已落地）；②原 ≥35 键全体 +1（[36,81]..[58,105]）；③onWorldPartial
 * 现携 passes[i].name → 逐槽校验期望名，不符即 throw——今后任何管线增删/搬移槽位
 * 立刻爆红指名道姓，不再静默错位烧全链假红。表内名字按 **SW_MB_1457=1** 口径
 * （g1457-* 认证链全部走该门；OOOOOOO 批已把「微群系」搬至「二次沉降」前，
 * 窗口 50..54 名单随门取变体）。多格残片清扫（59）仍无对应 dump（JS 补丁无）。 */
const SLOT_END = new Map<number, { d: number; nm: string }>([
  [0, { d: 0, nm: '原版地形' }], [1, { d: 1, nm: '沙丘' }],
  [2, { d: 13, nm: '洞穴' }], [3, { d: 35, nm: '生物群系' }],
  [5, { d: 37, nm: '引力沙' }], [6, { d: 38, nm: '微光' }],
  [7, { d: 39, nm: '清理' }], [8, { d: 48, nm: '结构' }],
  [9, { d: 49, nm: '水体沉降' }], [10, { d: 50, nm: '沙上清水' }],
  [11, { d: 51, nm: '绿洲' }], [12, { d: 52, nm: '海滩装饰' }],
  [13, { d: 53, nm: '半砖平滑' }],
  // YYYY 批尾段扩展（语义=槽内最后一个原版 pass）：18 雕像宝箱止于 SpiderCaves(63)；
  // 40 地表植物=Weeds(86)+GlowingMushroomPlants(87)（86 无 JS 子槽钩）；
  // 46 宝石系统止于 Random_Gems(93)；★IIIIII6 起新增 35=起始镇民→080_Guide；
  // ★IIIIII8 起 35..58 数字键全体 +1（36 向日葵→81 … 58 终清理→105）。
  [14, { d: 54, nm: '瀑布唇缘' }], [15, { d: 55, nm: '薄冰' }],
  [16, { d: 56, nm: '洞穴墙变体' }], [17, { d: 57, nm: '生命水晶' }],
  [18, { d: 63, nm: '雕像宝箱' }], [19, { d: 64, nm: '宝石洞' }],
  [20, { d: 65, nm: '苔藓' }], [21, { d: 66, nm: '神庙陈设' }],
  [22, { d: 67, nm: '洞穴墙' }], [23, { d: 68, nm: '地下丛林树' }],
  [24, { d: 69, nm: '浮空岛屋' }], [25, { d: 70, nm: '快清理' }],
  [26, { d: 71, nm: '瓦罐' }], [27, { d: 72, nm: '地狱熔炉' }],
  [28, { d: 73, nm: '表面' }], [29, { d: 74, nm: '地表矿石' }],
  [30, { d: 75, nm: '倒木水景' }], [31, { d: 76, nm: '地表装饰' }],
  [32, { d: 77, nm: '矿骨堆' }], [33, { d: 78, nm: '出生点' }],
  [34, { d: 79, nm: '草墙' }],
  // ↓↓ IIIIII6 插入的新槽（080_Guide=SpawnStarterNPCs 出口；十周年零 tile 写入，
  //    与 079 逐格同值是普通种子的构造性质而非巧合）
  [35, { d: 80, nm: '起始镇民' }],
  [36, { d: 81, nm: '向日葵' }], [37, { d: 82, nm: '栽树' }],
  [38, { d: 83, nm: '炼金草药' }], [39, { d: 84, nm: '染料植物' }],
  [40, { d: 85, nm: '蛛网蜂巢' }], [41, { d: 87, nm: '地表植物' }],
  [42, { d: 88, nm: '丛林植物P2' }], [43, { d: 89, nm: '藤蔓' }],
  [44, { d: 90, nm: '地表花' }], [45, { d: 91, nm: '地表蘑菇' }],
  [46, { d: 93, nm: '宝石系统' }], [47, { d: 94, nm: '长苔藓' }],
  [48, { d: 95, nm: '丛林墙' }], [49, { d: 96, nm: '蜂巢幼虫' }],
  // 50..54 = SW_MB_1457 执行序窗口：gate-on 为 {微群系,二次沉降,仙人掌珊瑚,
  //   瓦片清理,蜥蜴祭坛}；gate-off 则该五名右移一位（微群系落 54），校验放行两者。
  [50, { d: 97, nm: '微群系' }], [51, { d: 98, nm: '二次沉降' }],
  [52, { d: 99, nm: '仙人掌珊瑚' }], [53, { d: 100, nm: '瓦片清理' }],
  [54, { d: 101, nm: '蜥蜴祭坛' }], [55, { d: 102, nm: '水生植物' }],
  [56, { d: 103, nm: '钟乳石宝石树' }], [57, { d: 104, nm: '断线陷阱清理' }],
  [58, { d: 105, nm: '终清理' }],
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


// —— IIII67 附加：把被比较的 JS store 八通道原样落盘（对照 rig JJHook.Snap 布局）——
const __I67DUMPS: Record<number,string> = {};
function i67Dump(tag:string, idx:number, st:{type:Uint16Array;flags:Uint8Array;wall:Uint16Array;liquid:Uint8Array;liquidType:Uint8Array;half:Uint8Array;slope:Uint8Array;wire:Uint8Array}, W2:number,H2:number){
  const N0=W2*H2;
  const typ=new Uint8Array(N0*2), wal=new Uint8Array(N0*2);
  const act=new Uint8Array(N0), liq=new Uint8Array(N0), hf=new Uint8Array(N0), sl=new Uint8Array(N0), lt=new Uint8Array(N0), ia=new Uint8Array(N0);
  let p=0;
  const SHEETL=(globalThis as unknown as {__i67Sheet?:Int32Array}).__i67Sheet!;
  for(let y=0;y<H2;y++)for(let x=0;x<W2;x++,p++){
    const i=st.idx(x,y);
    const t=st.type[i]===0?0:(SHEETL[st.type[i]]>=0?SHEETL[st.type[i]]!:9999);
    typ[p*2]=t&0xff;typ[p*2+1]=(t>>>8)&0xff;
    wal[p*2]=st.wall[i]!&0xff;wal[p*2+1]=(st.wall[i]!>>>8)&0xff;
    act[p]=st.flags[i]!&1;
    liq[p]=st.liquid[i]!;
    hf[p]=st.half[i]!;sl[p]=st.slope[i]!;
    lt[p]=st.liquid[i]!>0?st.liquidType[i]!-1:0;
    ia[p]=(st.wire[i]!>>>5)&1;
  }
  __I67DUMPS[idx]=`${tag}|${W2}x${H2}`;
  const dir=process.env.SW_I67_DUMPDIR??'/tmp/iii67-out/js-mile-dump';
  mkdirSync(dir,{recursive:true});
  const fs={ writeFileSync };
  const base=`${dir}/${String(idx).padStart(3,'0')}_slot`;
  const wr=(nm:string,v:Uint8Array)=>{const b=Buffer.alloc(v.byteLength);Buffer.from(v.buffer,v.byteOffset,v.byteLength).copy(b);fs.writeFileSync(`${base}.${nm}`,b);};
  wr('typ',typ);wr('wal',wal);wr('act',act);wr('liq',liq);wr('half',hf);wr('slope',sl);wr('lty',lt);wr('inact',ia);
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
    // ghost（信息位）：非活性残留 type。
    // ★IIIII54 伪影修正：旧式把 JS st.type==0(空气,TILE_DEFS[0] 无 vanilla sheet)
    //   经 SHEET 映射 -1→9999 哨兵——而 x86 Tile.type 缺省 0，结果「gh 差」恒等于
    //   非 active 格计数（七链 slot0 全部 ~103万-116万、midworld 216 万，全是空格
    //   哨兵伪影而非内容债）。现按真值语义：空气照 0 记；未注册 sheet 才 9999。
    //   （Gh 不参与 ✗ 裁决，本修正只改报表口径。）
    const vg = va ? 0 : c.t[i]!;
    const jg = ja ? 0 : (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
    if (vg !== jg) r.dGh++;
  }
  if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n] as [string, number]);
  return r;
}

(globalThis as unknown as {__i67Sheet?:Int32Array}).__i67Sheet = SHEET;
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
            if ((process.env.SW_I67_DUMPON === '1')) i67Dump(lab, idx, curStore!, W, H);
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
        // ★IIIIII8：onWorldPartial 第三参=passes[i].name → 槽名实到校验。任何未来
        // 管线增删/搬移槽位在这里立即报「名实不符」(曾因 II6 插「起始镇民」静默错位
        // 烧出四链 #81 T27>0 全线伪红)。默认响亮告警不阻断；SW_M8_STRICT_NAMES=1
        // 升级为 throw（对拍结论须绝对可信时开启）。
        onWorldPartial: (w, i, pn) => {
          if (!curStore) curStore = w.store as never as typeof curStore;
          const ent = SLOT_END.get(i);
          if (ent === undefined) return;
          if (ent.nm !== pn) {
            const msg = `[SLOT_END 名实不符] 槽#${i} 期望「${ent.nm}」实到「${pn}」——管线槽序与本表漂移,mile8 结果不可按本表解读!`;
            console.log(`  ✗✗ ${msg}`);
            if (process.env.SW_M8_STRICT_NAMES === '1') throw new Error(msg);
          }
          if (seen.has(ent.d)) return;
          seen.add(ent.d);
          rows.push(cmp(`槽末#${i}·${pn}`, ent.d, w.store as never as typeof curStore));
          if ((process.env.SW_I67_DUMPON === '1')) i67Dump(`SLOT${i}_${pn}`, ent.d, w.store as never as typeof curStore, W, H);
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
