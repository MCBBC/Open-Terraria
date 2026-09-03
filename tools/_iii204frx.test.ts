// IIIII199 克隆自 tools/_iii81m8.test.ts（★勿动原文件——mile8 共享热文件,多车道共用）。
// 增量：**帧维（frx/fry）全槽对拍通道**——LXXXI §⑥ 移交首刀「帧维全 106 槽对拍仪」。
//   x86 侧 JJHook dump 恒产 .frx/.fry（(ushort)frameX LE16,含 -1→65535 哨兵位型）；
//   本仪在每条锚（reseed/槽末）同点比对 st.frameX/st.frameY（JS 亦 u16 位型域）。
//   ★帧域语义：JS frameX 存原版像素域（与 x86 同域）;唯一已知合法位型差=x86 KillTile
//   尾 frameX/Y=-1（WorldGen.cs:64400-64401）vs JS setTileSilent 尾 0——真分歧类,
//   由 F@T 聚类按 tile 型归属显影,勿在本仪"洗"掉。
//   缺 .frx/.fry 的槽 → dFx=dFy=-1（不裁决,通道缺失显式报表,禁止静默零差）。
//   SW_I204_DUMP=<dir>：额外把 JS 侧每锚 frx/fry 落盘（u16 LE,106 槽≈2.1GB,按需开）。
// 用法：cd game && SW_I199=1 SW_I81_G2=<dump dir> SW_I81_SEED='tooeasy|20260911'
//        SW_I81_EVIL=0 SW_I81_FLAGS=startInHardmode SW_I81_TAG=iii199-tse \
//        npx vitest run tools/_iii204frx.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I204 === '1';
const VG = process.env.SW_I81_VG ?? '';
const G2 = process.env.SW_I81_G2 ?? '';
const SEED = process.env.SW_I81_SEED ?? '0';
const EVIL = process.env.SW_I81_EVIL !== undefined ? Number(process.env.SW_I81_EVIL) : -1;
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
const NOCACHE = process.env.SW_I81_NOCACHE === '1';
const DUMPDIR = process.env.SW_I204_DUMP ?? '';
const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps',
  constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', celebrationmk10: 'tenthAnniversary',
  fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
};
const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I81_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
}
const IS_DUAL = !!M8_FLAGS.dualDungeons;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const SLOT_END = new Map<number, { nm?: string; name: string }>([
  [0, { nm: '原版地形', name: 'Terrain' }],
  [1, { nm: '沙丘', name: 'Dunes' }],
  [2, { nm: '洞穴', name: 'Surface_Caves' }],
  [3, { nm: '生物群系', name: 'Gems' }],
  [5, { nm: '引力沙', name: 'Create_Ocean_Caves' }],
  [6, { nm: '微光', name: 'Shimmer' }],
  [7, { nm: '清理', name: 'Clean_Up_Dirt' }],
  [8, { nm: '结构', name: 'Jungle_Chests' }],
  [9, { nm: '水体沉降', name: 'Settle_Liquids' }],
  [10, { nm: '沙上清水', name: 'Remove_Water_From_Sand' }],
  [11, { nm: '绿洲', name: 'Oasis' }],
  [12, { nm: '海滩装饰', name: 'Shell_Piles' }],
  [13, { nm: '半砖平滑', name: 'Smooth_World' }],
  [14, { nm: '瀑布唇缘', name: 'Waterfalls' }],
  [15, { nm: '薄冰', name: 'Ice' }],
  [16, { nm: '洞穴墙变体', name: 'Wall_Variety' }],
  [17, { nm: '生命水晶', name: 'Life_Crystals' }],
  [18, { nm: '雕像宝箱', name: 'Spider_Caves' }],
  [19, { nm: '宝石洞', name: 'Gem_Caves' }],
  [20, { nm: '苔藓', name: 'Moss' }],
  [21, { nm: '神庙陈设', name: 'Temple' }],
  [22, { nm: '洞穴墙', name: 'Cave_Walls' }],
  [23, { nm: '地下丛林树', name: 'Jungle_Trees' }],
  [24, { nm: '浮空岛屋', name: 'Floating_Island_Houses' }],
  [25, { nm: '快清理', name: 'Quick_Cleanup' }],
  [26, { nm: '瓦罐', name: 'Pots' }],
  [27, { nm: '地狱熔炉', name: 'Hellforge' }],
  [28, { nm: '表面', name: 'Spreading_Grass' }],
  [29, { nm: '地表矿石', name: 'Surface_Ore_and_Stone' }],
  [30, { nm: '倒木水景', name: 'Place_Fallen_Log' }],
  [31, { nm: '地表装饰', name: 'Traps' }],
  [32, { nm: '矿骨堆', name: 'Piles' }],
  [33, { nm: '出生点', name: 'Spawn_Point' }],
  [34, { nm: '草墙', name: 'Grass_Wall' }],
  [35, { nm: '起始镇民', name: 'Guide' }],
  [36, { nm: '向日葵', name: 'Sunflowers' }],
  [37, { nm: '栽树', name: 'Planting_Trees' }],
  [38, { nm: '炼金草药', name: 'Herbs' }],
  [39, { nm: '染料植物', name: 'Dye_Plants' }],
  [40, { nm: '蛛网蜂巢', name: 'Webs_And_Honey' }],
  [41, { nm: '地表植物', name: 'Glowing_Mushrooms_and_Jungle_Plants' }],
  [42, { nm: '丛林植物P2', name: 'Jungle_Plants' }],
  [43, { nm: '藤蔓', name: 'Vines' }],
  [44, { nm: '地表花', name: 'Flowers' }],
  [45, { nm: '地表蘑菇', name: 'Mushrooms' }],
  [46, { nm: '宝石系统', name: 'Random_Gems' }],
  [47, { nm: '长苔藓', name: 'Moss_Grass' }],
  [48, { nm: '丛林墙', name: 'Muds_Walls_In_Jungle' }],
  [49, { nm: '蜂巢幼虫', name: 'Larva' }],
  [50, { nm: '微群系', name: 'Micro_Biomes' }],
  [51, { nm: '二次沉降', name: 'Settle_Liquids_Again' }],
  [52, { nm: '仙人掌珊瑚', name: 'Cactus__Palm_Trees____Coral' }],
  [53, { nm: '瓦片清理', name: 'Tile_Cleanup' }],
  [54, { nm: '蜥蜴祭坛', name: 'Lihzahrd_Altars' }],
  [55, { nm: '水生植物', name: 'Water_Plants' }],
  [56, { nm: '钟乳石宝石树', name: 'Stalac' }],
  [57, { nm: '断线陷阱清理', name: 'Remove_Broken_Traps' }],
  [58, { nm: '终清理', name: 'Final_Cleanup' }],
]);
const LAB2NAME = new Map<string, string>([
  ['SandPatches', 'Ocean_Sand'],
  ['Tunnels', 'Sand_Patches'],
  ['MountainCaves', 'Tunnels'],
  ['DirtWallBackgrounds', 'Mount_Caves'],
  ['RocksInDirt', 'Dirt_Wall_Backgrounds'],
  ['DirtInRocks', 'Rocks_In_Dirt'],
  ['Clay', 'Dirt_In_Rocks'],
  ['SmallHoles', 'Clay'],
  ['DirtLayerCaves', 'Small_Holes'],
  ['RockLayerCaves', 'Dirt_Layer_Caves'],
  ['SurfaceCaves', 'Rock_Layer_Caves'],
  ['WavyCaves', 'Surface_Caves'],
  ['IceBiome', 'Wavy_Caves'],
  ['Grass', 'Generate_Ice_Biome'],
  ['JunglePass', 'Grass'],
  ['MudCavesToJungleGrass', 'Jungle'],
  ['DesertBiome', 'Mud_Caves_To_Grass'],
  ['GlowingMushroomPatches', 'Full_Desert'],
  ['Marble', 'Mushroom_Patches'],
  ['Granite', 'Marble'],
  ['FloatingIslands', 'Granite'],
  ['DirtToMud', 'Floating_Islands'],
  ['Silt', 'Dirt_To_Mud'],
  ['OresAndShinies', 'Silt'],
  ['Webs', 'Shinies'],
  ['Underworld', 'Webs'],
  ['CorruptionAndCrimson', 'Underworld'],
  ['Lakes', 'Corruption'],
  ['Slush', 'Lakes'],
  ['Dungeon', 'Slush'],
  ['MountainCaveOpenings', 'Dungeon'],
  ['BeachesAndOceanCleanup', 'Mountain_Caves'],
  ['Gems', 'Beaches'],
  ['OceanCaves', 'Gravitating_Sand'],
  ['Shimmer', 'Create_Ocean_Caves'],
  ['DirtWallCleanup', 'Shimmer'],
  ['Pyramids', 'Clean_Up_Dirt'],
  ['DirtRockWallRunner', 'Pyramids'],
  ['LivingTrees', 'Dirt_Rock_Wall_Runner'],
  ['LivingTreeWalls', 'Living_Trees'],
  ['DemonAndCrimsonAltars', 'Wood_Tree_Walls'],
  ['SurfaceWaterInJungle', 'Altars'],
  ['LihzahrdTemple', 'Wet_Jungle'],
  ['Beehives', 'Jungle_Temple'],
  ['JungleShrines', 'Hives'],
  ['Statues', 'Life_Crystals'],
  ['UndergroundHousesAndBuriedChests', 'Statues'],
  ['SurfaceChests', 'Buried_Chests'],
  ['ChestsInJungleShrines', 'Surface_Chests'],
  ['UnderwaterChests', 'Jungle_Chests_Placement'],
  ['SpiderCaves', 'Water_Chests'],
  ['UndergroundJungleTrees', 'Cave_Walls'],
  ['QuickCleanup', 'Floating_Island_Houses'],
  ['GrassPlants', 'Webs_And_Honey'],
  ['GlowingMushroomPlants', 'Weeds'],
  ['ExposedGemsInIceBiome', 'Mushrooms'],
  ['ExposedGemsUnderground', 'Gems_In_Ice_Biome'],
]);
if (IS_DUAL) {
  LAB2NAME.set('Dungeon', 'Dual_Dungeons_Dither_Snake');
  LAB2NAME.set('SnakeEnd', 'Dual_Dungeons_Dither_Snake');
  LAB2NAME.set('DitherSnake', 'Slush');
}
const NAME2IDX = new Map<string, number>();
function labIdx(lab: string): number | undefined {
  const nm = LAB2NAME.get(lab);
  return nm === undefined ? undefined : NAME2IDX.get(nm);
}

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
interface Ch {
  t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
  frx?: Uint16Array; fry?: Uint16Array;
}
const CHAN_FILES = ['act', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'] as const;
const cache = new Map<number, Ch>();
function chans(idx: number): Ch | null {
  const hit = cache.get(idx);
  if (hit) return hit;
  const nm = DUMPNAME.get(idx);
  if (!nm) return null;
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  if (!existsSync(`${pre}.typ`)) return null;
  const miss = CHAN_FILES.filter((c) => !existsSync(`${pre}.${c}`));
  if (miss.length > 0) {
    throw new Error(`iii199 假绿免疫(通道完备性): #${idx}_${nm} 缺通道 [${miss.join(',')}]`);
  }
  const c: Ch = {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
  // ★III199 帧维通道：存在才载入（旧 dump 目录无 frx/fry → dFx=dFy=-1 不裁决）
  if (existsSync(`${pre}.frx`) && existsSync(`${pre}.fry`)) {
    c.frx = le16(`${pre}.frx`);
    c.fry = le16(`${pre}.fry`);
  }
  if (!NOCACHE) cache.set(idx, c);
  return c;
}

interface Row {
  idx: number; tag: string;
  dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number; dGh: number;
  dFx: number; dFy: number; dFxS: number; dFyS: number; dFxT: number; dFyT: number;
  firstFx: string; pairs: Array<[string, number]>; samples: string[];
}
function cmp(tag: string, idx: number, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  frameX: Uint16Array; frameY: Uint16Array;
}): Row {
  const c = chans(idx);
  const r: Row = {
    idx, tag, dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, dGh: 0,
    dFx: c?.frx ? 0 : -1, dFy: c?.fry ? 0 : -1, dFxS: 0, dFyS: 0, dFxT: c?.frx ? 0 : -1, dFyT: c?.fry ? 0 : -1,
    firstFx: '', pairs: [], samples: [],
  };
  if (!c) { r.firstFx = '(no dump)'; return r; }
  if (!c.frx || !c.fry) { r.firstFx = '(no frx/fry)'; return r; }
  const pair = new Map<string, number>();
  let firstFxI = -1;
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { r.dT++; }
    if (c.w[i]! !== st.wall[i]!) { r.dW++; }
    if (c.l[i]! !== st.liquid[i]!) { r.dL++; }
    if (c.hf[i]! !== st.half[i]!) { r.dHf++; }
    if (c.sl[i]! !== st.slope[i]!) { r.dSl++; }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; }
    const via = c.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; }
    const vg = va ? 0 : c.t[i]!;
    const jg = ja ? 0 : (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
    if (vg !== jg) r.dGh++;
    // ── IIIII199 帧维双通道 ──
    //  域语义：帧哨兵 -1 在 x86 是 short -1（dump 位型 65535），JS 侧两形态并存
    //  （「从未帧过」≡0；「显式写 -1」≡65535 位型）。故两侧 65535 与 0 折算等价
    //  （哨兵域 S 类，另计质量不进差账）；其余位型直比。活性格单侧哨兵
    //  （x86 -1 vs JS 真值 / JS -1 vs x86 真值）仍进差账——帧重要 tile 的活性格
    //  -1 在原版是异常态，正是要抓的分歧。
    const vx = c.frx![i]!, vy = c.fry![i]!, jx = st.frameX[i]!, jy = st.frameY[i]!;
    const nx = vx === 65535 ? 0 : vx;
    const ny = vy === 65535 ? 0 : vy;
    const mjx = jx === 65535 ? 0 : jx;
    const mjy = jy === 65535 ? 0 : jy;
    if (nx !== mjx) {
      r.dFx++;
      if (firstFxI < 0) firstFxI = i;
      if (vt === jt) r.dFxT++;                       // 纯帧债（类型同格）
      const k = `FX@T${vt}:${vx === 65535 ? 'S' : ''}${nx}>${mjx}${va ? '' : '|d'}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      if (r.samples.length < 8) r.samples.push(`FX(${i % W},${(i / W) | 0}) T${vt} v${vx} j${jx}`);
    } else if (vx === 65535 && mjx === 0) {
      r.dFxS++;                                       // 哨兵等价质量（不进差账）
    }
    if (ny !== mjy) {
      r.dFy++;
      if (firstFxI < 0) firstFxI = i;
      if (vt === jt) r.dFyT++;
      const k = `FY@T${vt}:${vy === 65535 ? 'S' : ''}${ny}>${mjy}${va ? '' : '|d'}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      if (r.samples.length < 8) r.samples.push(`FY(${i % W},${(i / W) | 0}) T${vt} v${vy} j${jy}`);
    } else if (vy === 65535 && mjy === 0) {
      r.dFyS++;
    }
  }
  if (firstFxI >= 0) r.firstFx = `(${firstFxI % W},${Math.floor(firstFxI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n] as [string, number]);
  return r;
}

function dumpFrames(idx: number, nm: string, st: { frameX: Uint16Array; frameY: Uint16Array }): void {
  const pre = `${DUMPDIR}/${String(idx).padStart(3, '0')}_${nm}`;
  writeFileSync(`${pre}.jfrx`, Buffer.from(st.frameX.buffer, st.frameX.byteOffset, st.frameX.byteLength));
  writeFileSync(`${pre}.jfry`, Buffer.from(st.frameY.buffer, st.frameY.byteOffset, st.frameY.byteLength));
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


// ── IIIII204 增量：死格/活格分账 + **终态** F@T 全聚类 + 各格首现槽台账 ──
//   （聚类只在 idx 最大的锚上聚合=终态 saved-world 债面；中途消散的瞬态帧差只进
//    new 台账不进债面——IIII199 观测的峰值 #32 Fx=1084 大头被 FinalCleanup 收敛。）
interface CellInfo { vt: number; va: boolean; vx: number; jx: number; }
interface Cluster { n: number; dead: number; first: number; coords: string[]; }
let lastRowIdx = -1;
let lastFx = new Map<number, CellInfo>();
let lastFy = new Map<number, CellInfo>();
const clusters = new Map<string, Cluster>();
const firstSeen = new Map<string, number>();   // `fx:i`/`fy:i` → 首现锚 idx
const norm = (v: number): string => (v === 65535 ? 'S0' : String(v));
interface Row2 {
  idx: number; tag: string; dFx: number; dFy: number; dFxT: number; dFyT: number;
  fxLive: number; fxDead: number; fyLive: number; fyDead: number; fxS: number; fyS: number;
  newFx: number; newFy: number; newByType: Record<string, number>; firstFx: string;
}
const rows: Row2[] = [];
function cmp204(tag: string, idx: number, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  frameX: Uint16Array; frameY: Uint16Array;
}): Row2 {
  const c = chans(idx);
  const r: Row2 = {
    idx, tag, dFx: 0, dFy: 0, dFxT: 0, dFyT: 0, fxLive: 0, fxDead: 0, fyLive: 0, fyDead: 0,
    fxS: 0, fyS: 0, newFx: 0, newFy: 0, newByType: {}, firstFx: '',
  };
  if (!c || !c.frx || !c.fry) { r.firstFx = c ? '(no frx/fry)' : '(no dump)'; rows.push(r); return r; }
  const frx = c.frx, fry = c.fry, a = c.a, t = c.t;
  let firstFxI = -1;
  const newByType = new Map<string, number>();
  const curFx = new Map<number, CellInfo>(), curFy = new Map<number, CellInfo>();
  for (let i = 0; i < N; i++) {
    const va = a[i]! === 1;
    const vt = va ? t[i]! : 0;
    const jt = va ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    const vx = frx[i]!, vy = fry[i]!, jx = st.frameX[i]!, jy = st.frameY[i]!;
    const nx = vx === 65535 ? 0 : vx, ny = vy === 65535 ? 0 : vy;
    const mjx = jx === 65535 ? 0 : jx, mjy = jy === 65535 ? 0 : jy;
    if (nx !== mjx) {
      r.dFx++;
      if (vt === jt) r.dFxT++;
      if (firstFxI < 0) firstFxI = i;
      curFx.set(i, { vt, va, vx, jx });
      if (va) r.fxLive++; else r.fxDead++;
      const nk = `fx:${i}`;
      if (!firstSeen.has(nk)) {
        firstSeen.set(nk, idx); r.newFx++;
        const ty = va ? `T${vt}` : `dead`;
        newByType.set(ty, (newByType.get(ty) ?? 0) + 1);
      }
      if (vx === 65535 && mjx === 0) r.fxS++;
    } else if (vx === 65535 && mjx === 0) r.fxS++;
    if (ny !== mjy) {
      r.dFy++;
      if (vt === jt) r.dFyT++;
      if (firstFxI < 0) firstFxI = i;
      curFy.set(i, { vt, va, vx: vy, jx: jy });
      if (va) r.fyLive++; else r.fyDead++;
      const nk = `fy:${i}`;
      if (!firstSeen.has(nk)) {
        firstSeen.set(nk, idx); r.newFy++;
        const ty = va ? `T${vt}` : `dead`;
        newByType.set(ty, (newByType.get(ty) ?? 0) + 1);
      }
      if (vy === 65535 && mjy === 0) r.fyS++;
    } else if (vy === 65535 && mjy === 0) r.fyS++;
  }
  if (firstFxI >= 0) r.firstFx = `(${firstFxI % W},${Math.floor(firstFxI / W)})`;
  r.newByType = Object.fromEntries([...newByType.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10));
  rows.push(r);
  if (idx > lastRowIdx) { lastRowIdx = idx; lastFx = curFx; lastFy = curFy; }
  return r;
}

(RUN ? it : it.skip)('IIIII204 per-chain frame-dim dead/live debt scan (name-anchored)', async () => {
  for (const f of readdirSync(VG)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) { DUMPNAME.set(Number(m[1]), m[2]); NAME2IDX.set(m[2], Number(m[1])); }
  }
  console.log(`dump names: ${DUMPNAME.size} (8ch+frx dir=${G2})`);
  if (DUMPNAME.size < Number(process.env.SW_I81_MINNAMES ?? 100)) {
    throw new Error(`iii204 假绿免疫：dump names=${DUMPNAME.size} <100——SW_I81_VG(${VG}) 缺名表`);
  }
  let curStore: Parameters<typeof cmp204>[2] | null = null;
  const seen = new Set<number>();
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii204frx') && !m[1].includes('_mile8')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = labIdx(lab);
          if (idx !== undefined && !seen.has(idx)) {
            seen.add(idx);
            cmp204(lab, idx, curStore!);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (w, i, pn) => {
        if (!curStore) curStore = w.store as never as typeof curStore;
        const ent = SLOT_END.get(i);
        if (ent === undefined) return;
        if (ent.nm !== pn) {
          const msg = `[SLOT_END 名实不符] 槽#${i} 期望「${ent.nm}」实到「${pn}」`;
          console.log(`  ✗✗ ${msg}`);
          if (process.env.SW_I81_STRICT_NAMES === '1') throw new Error(msg);
        }
        const di = ent.d ?? NAME2IDX.get(ent.name);
        if (di === undefined || seen.has(di)) return;
        seen.add(di);
        const store = w.store as unknown as Parameters<typeof cmp204>[2];
        if (DUMPDIR && ent.name) dumpFrames(di, ent.name, store);
        cmp204(`槽末#${i}·${pn}`, di, store);
      },
    });
  } finally { RNGp.reseed = oReseed; }
  rows.sort((x, y) => x.idx - y.idx);
  for (const r of rows) {
    const fr = r.dFx >= 0 && r.firstFx !== '(no dump)' && r.firstFx !== '(no frx/fry)';
    console.log(`${String(r.idx).padStart(3)} ${DUMPNAME.get(r.idx) ?? '?'} ← ${r.tag.padEnd(22)} ` +
      (fr
        ? `Fx=${String(r.dFx).padStart(7)} (L${String(r.fxLive).padStart(6)}/D${String(r.fxDead).padStart(6)}) Fy=${String(r.dFy).padStart(6)} (L${r.fyLive}/D${r.fyDead}) new=+${r.newFx}/+${r.newFy} ${r.dFx || r.dFy ? '✗ ' + r.firstFx : '✓'}`
        : 'Fx/Fy=(缺通道)'));
    if (r.newFx || r.newFy) console.log(`     new: ${Object.entries(r.newByType).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  }
  const last = rows[rows.length - 1];
  console.log(`\n★ 终态账：Fx=${last?.dFx ?? '?'} (活 ${last?.fxLive} / 死 ${last?.fxDead})  Fy=${last?.dFy ?? '?'} (活 ${last?.fyLive} / 死 ${last?.fyDead})`);
  // 终态聚类（lastRowIdx 锚上的 cell 全集）+ 首现槽归因
  const bucket = (cells: Map<number, CellInfo>, dim: 'FX' | 'FY') => {
    for (const [i, ci] of cells) {
      const v = dim === 'FX' ? ci.vx : ci.vx;
      const key = `${dim} T${ci.vt}${ci.va ? '' : '|D'} v${norm(v)}>j${norm(ci.jx)}`;
      let c = clusters.get(key);
      if (!c) { c = { n: 0, dead: 0, first: 99999, coords: [] }; clusters.set(key, c); }
      c.n++;
      if (!ci.va) c.dead++;
      c.first = Math.min(c.first, firstSeen.get(`${dim === 'FX' ? 'fx' : 'fy'}:${i}`) ?? -1);
      if (c.coords.length < 16) c.coords.push(`${i % W},${(i / W) | 0}`);
    }
  };
  bucket(lastFx, 'FX');
  bucket(lastFy, 'FY');
  const sorted = [...clusters.entries()].sort((x, y) => y[1].n - x[1].n);
  console.log(`★ 终态 F@T 聚类（${sorted.length} 类）：`);
  for (const [k, c] of sorted) {
    console.log(`  ${k} ×${c.n}${c.dead ? ` (死 ${c.dead})` : ' (活)'}  首现# ${c.first === 99999 ? '?' : c.first}  @ ${c.coords.slice(0, 6).join(' | ')}`);
  }
  writeFileSync(`/tmp/iii204-out/frx204-${process.env.SW_I81_TAG ?? 'tag'}.json`,
    JSON.stringify({ rows, clusters: [...clusters.entries()].map(([k, c]) => ({ k, ...c })) }));
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s slots=${rows.length} clusters=${clusters.size}`);
}, 900_000);
