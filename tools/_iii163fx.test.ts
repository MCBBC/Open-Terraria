// IIII163 批一次性诊断仪：mile8 **10ch** 扩展（8 通道 + 帧通道 .fx/.fy 第 9/10 通道）。
// 克隆自 tools/_iii81m8.test.ts（IIIII78→IIII81 谱系），差异点：
//   ① G2 dump 目录按 **10ch** 消费：.fx/.fy（rig159 世系,SW_DUMP_ALL 直写 tile.frameX/Y
//      裸 u16LE）或 .frx/.fry（TS37 世系 gen2-m/gen2-g/golden-toadstool）——存在即裁决；
//   ② 帧通道规范映射 = **双侧 0xFFFF→0 归一后整格比对**（未定帧哨兵语义,cs 锚与
//      口径论证见 tools/_iii163frame.ts + content-parity 章 CXXXVIII）；
//   ③ 编码差/真帧差分离：artifact（x86 -1↔JS 0 及双侧 -1 惯用法）不入差集；真帧差按
//      active/inactive × tileType 分层建差集（census JSON 落盘）；
//   ④ JS 侧 .frx/.fry 逐槽捕获落盘（${OUT}/js/${idx}_${name}.frx/.fry,与 x86 dump
//      同名同构,u16LE 裸 store.frameX/frameY）；
//   ⑤ 通道不驻内存缓存（10ch 全槽 ~7GB,禁缓存;逐槽读放）。
// 用法（winter 首链）：
//   cd game && SW_I163=1 SW_I163_G2=/tmp/iii159-out/rig-out/w159 \
//     SW_I163_SEED='1.1.1.0.winteriscoming|20260914' SW_I163_TAG=winter \
//     npx vitest run tools/_iii163fx.test.ts
// spot（关键槽抽查）：
//   … SW_I163_SLOTS='0,13,32,76,105' SW_I163_TAG=spot-g npx vitest run tools/_iii163fx.test.ts
// 口径辅助函数（normFrame/frameEq/frameClass）= tools/_iii163frame.ts,勿在本文件重定义。
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { normFrame, frameClass } from './_iii163frame';

const RUN = process.env.SW_I163 === '1';
const VG = process.env.SW_I163_VG ?? '';            // 名表源（缺省同 G2）
const G2 = process.env.SW_I163_G2 ?? '';            // 10ch 真值（8ch+fx/fy）
const SEED = process.env.SW_I163_SEED ?? '0';
const EVIL = process.env.SW_I163_EVIL !== undefined ? Number(process.env.SW_I163_EVIL) : -1;
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
const OUT = process.env.SW_I163_OUT ?? '/tmp/iii163-out';
const JS_DIR = `${OUT}/js`;
const TAG = process.env.SW_I163_TAG ?? 'tag';
// 关键槽过滤（spot 模式）：dump idx 十进制逗号表；未设=全 106 槽
// ★空串防御：''.split(',')=[''] → Number('')=0 会把全量跑静默缩成 slot0 单槽（首跑实证）
const SLOTS = (process.env.SW_I163_SLOTS ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
const NODUMP = process.env.SW_I163_NODUMP === '1';   // 免 JS 侧 frx/fry 落盘（省 2.1GB）
const EVIL_T = EVIL as -1 | 0 | 1;

const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps',
  constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', celebrationmk10: 'tenthAnniversary',
  fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
};
const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I163_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

// ── 槽末锚 / 名表（IIII81 谱系原表拷贝;含义与防伪注释见原文件）──────────────
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
const NAME2IDX = new Map<string, number>();
function labIdx(lab: string): number | undefined {
  const nm = LAB2NAME.get(lab);
  return nm === undefined ? undefined : NAME2IDX.get(nm);
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

interface Ch {
  t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array;
  sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
  fx?: Uint16Array; fy?: Uint16Array;
}
const CHAN_FILES = ['act', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'] as const;
// 帧通道文件名双世系兼容：rig159=.fx/.fy,TS37=.frx/.fry（同语义裸 u16）
function frameFiles(pre: string): { fx: string; fy: string } | null {
  if (existsSync(`${pre}.fx`) && existsSync(`${pre}.fy`)) return { fx: `${pre}.fx`, fy: `${pre}.fy` };
  if (existsSync(`${pre}.frx`) && existsSync(`${pre}.fry`)) return { fx: `${pre}.frx`, fy: `${pre}.fry` };
  return null;
}

// ★IIIII163：通道禁驻内存缓存（10ch×106 槽 ~7GB）——逐槽读放
function chans(idx: number): Ch | null {
  const nm = DUMPNAME.get(idx);
  if (!nm) return null;
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  if (!existsSync(`${pre}.typ`)) return null;
  const miss = CHAN_FILES.filter((c) => !existsSync(`${pre}.${c}`));
  if (miss.length > 0) {
    throw new Error(`mile8 假绿免疫(通道完备性): #${idx}_${nm} 缺通道 [${miss.join(',')}]`);
  }
  const c: Ch = {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
  const ff = frameFiles(pre);
  if (ff) { c.fx = le16(ff.fx); c.fy = le16(ff.fy); }
  else console.log(`  [i163] #${idx}_${nm} 缺帧通道 → 该槽帧两通道不参与裁决`);
  return c;
}

interface Row {
  idx: number; tag: string; dA: number; dT: number; dW: number; dL: number;
  dHf: number; dSl: number; dLt: number; dIa: number; dGh: number;
  dFx: number; dFy: number; dFxA: number; dFxi: number; dFyA: number; dFyi: number;
  fxAnt: number; fyAnt: number;   // artifact 计数（编码伪影,不入差集）
  fxDiffClass: Record<string, number>; fyDiffClass: Record<string, number>;
  first: string; pairs: Array<[string, number]>; samples: string[];
}

// census：真帧差按 active/inactive × tileType 分层（全局累计;type=vanilla sheet 空间）
type Stratum = { art: number; fx: number; fy: number; firstFx?: string; firstFy?: string };
const CENSUS = new Map<string, Stratum>();
function censusKey(act: boolean, type: number): string {
  return `${act ? 1 : 0}|${type}`;
}

function cmp(tag: string, idx: number, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  frameX: Uint16Array; frameY: Uint16Array;
}): Row {
  const c = chans(idx);
  const r: Row = {
    idx, tag, dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, dGh: 0,
    dFx: 0, dFy: 0, dFxA: 0, dFxi: 0, dFyA: 0, dFyi: 0, fxAnt: 0, fyAnt: 0,
    fxDiffClass: {}, fyDiffClass: {}, first: '', pairs: [], samples: [],
  };
  if (!c) { r.first = '(no dump)'; return r; }
  // ①JS 侧 .frx/.fry 逐槽捕获（与 x86 dump 同名同构,u16LE 裸 store 帧,未定帧保持
  //   store 原值——0 默认/移植 -1 惯用法 65535,不注入哨兵,归一在比对面做）
  if (!NODUMP) {
    const nm0 = DUMPNAME.get(idx) ?? String(idx);
    const pre0 = `${JS_DIR}/${String(idx).padStart(3, '0')}_${nm0}`;
    writeFileSync(`${pre0}.frx`, Buffer.from(st.frameX.buffer, st.frameX.byteOffset, st.frameX.byteLength));
    writeFileSync(`${pre0}.fry`, Buffer.from(st.frameY.buffer, st.frameY.byteOffset, st.frameY.byteLength));
  }
  const pair = new Map<string, number>();
  let firstI = -1;
  const mark = (i: number) => { if (firstI < 0) firstI = i; };
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; mark(i); if (r.samples.length < 8) r.samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)) : 0;
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
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; mark(i); const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 8) r.samples.push(`Y(${i % W},${(i / W) | 0}) v${vl} j${jl} liq${c.l[i]}`); }
    const via = c.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; mark(i); if (r.samples.length < 8) r.samples.push(`I(${i % W},${(i / W) | 0}) v${via} j${jia}`); }
    const vg = va ? 0 : c.t[i]!;
    const jg = ja ? 0 : (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
    if (vg !== jg) r.dGh++;
    // ── IIII163 帧通道（第 9/10 通道）：双侧 0xFFFF→0 归一整格比对;编码伪影分离 ──
    if (c.fx !== undefined && c.fy !== undefined) {
      const xv = c.fx[i]!, jv = st.frameX[i]!, yv = c.fy[i]!, jyv = st.frameY[i]!;
      const cx = frameClass(xv, jv), cy = frameClass(yv, jyv);
      // 分层键：x86 活格=x86 typ;死格=JS 活格用 JS sheet 型,否则 x86 ghost 型
      const typeStrat = va ? vt : (ja ? jt : vt);
      const key = censusKey(va, typeStrat);
      let s = CENSUS.get(key);
      if (!s) { s = { art: 0, fx: 0, fy: 0 }; CENSUS.set(key, s); }
      const coord = `(${i % W},${(i / W) | 0})`;
      if (cx !== 'artifact') {
        r.dFx++; if (va) r.dFxA++; else r.dFxi++;
        r.fxDiffClass[cx] = (r.fxDiffClass[cx] ?? 0) + 1;
        s.fx++;
        if (s.firstFx === undefined) s.firstFx = coord;
        mark(i);
        if (r.samples.length < 8) r.samples.push(`Fx${cx}((${i % W},${(i / W) | 0})) act=${va} typ=${typeStrat} x=${xv} j=${jv}`);
      } else r.fxAnt++;
      if (cy !== 'artifact') {
        r.dFy++; if (va) r.dFyA++; else r.dFyi++;
        r.fyDiffClass[cy] = (r.fyDiffClass[cy] ?? 0) + 1;
        s.fy++;
        if (s.firstFy === undefined) s.firstFy = coord;
        mark(i);
        if (r.samples.length < 8) r.samples.push(`Fy${cy}((${i % W},${(i / W) | 0})) act=${va} typ=${typeStrat} x=${yv} j=${jyv}`);
      } else r.fyAnt++;
      // artifact 累计（C1+C2：x86 -1↔JS 0 与 x86 -1↔JS -1 同并入伪影层）
      if (cx === 'artifact') s.art++;
      if (cy === 'artifact') s.art++;
    }
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

(RUN ? it : it.skip)('IIIII163 per-chain 10ch diff (8ch+frames, name-anchored)', async () => {
  if (!G2 || !existsSync(G2)) throw new Error(`SW_I163_G2 未设或不存在: ${G2}`);
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) { DUMPNAME.set(Number(m[1]), m[2]); NAME2IDX.set(m[2], Number(m[1])); }
  }
  console.log(`dump names: ${DUMPNAME.size} (10ch dir=${G2})`);
  if (DUMPNAME.size < Number(process.env.SW_I163_MINNAMES ?? 100)) {
    throw new Error(`mile8 假绿免疫：dump names=${DUMPNAME.size} <100——SW_I163_G2(${G2}) 缺 8 通道名表`);
  }
  {
    const incomplete: string[] = [];
    let frameSlots = 0;
    for (const [idx, nm] of DUMPNAME) {
      const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
      const miss = CHAN_FILES.filter((c) => !existsSync(`${pre}.${c}`));
      if (miss.length > 0) incomplete.push(`#${idx}_${nm}[${miss.join(',')}]`);
      if (frameFiles(pre)) frameSlots++;
    }
    if (incomplete.length > 0) {
      throw new Error(`mile8 假绿免疫(通道完备性): ${incomplete.length}/${DUMPNAME.size} 槽通道不全 → ${incomplete.slice(0, 6).join(' ')}`);
    }
    console.log(`channel completeness: ${DUMPNAME.size}/${DUMPNAME.size} 槽 8 通道齐全 ✓; 帧通道槽=${frameSlots}/${DUMPNAME.size}`);
    if (frameSlots === 0) throw new Error('i163 假绿免疫：dump 目录零帧通道(.fx/.fy/.frx/.fry)——非 10ch 目录,禁止静默全零对拍');
  }
  if (!NODUMP) mkdirSync(JS_DIR, { recursive: true });
  const rows: Row[] = [];
  let curStore: Parameters<typeof cmp>[2] | null = null;
  const seen = new Set<number>();
  const unmapped = new Set<string>();
  const wantSlot = (idx: number): boolean => SLOTS.length === 0 || SLOTS.includes(idx);
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii163fx')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = labIdx(lab);
          if (idx !== undefined && !seen.has(idx) && wantSlot(idx)) {
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
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL_T,
      seedFlags: process.env.SW_I163_PINFLAGS === '1' ? M8_FLAGS
        : (Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined),
      onWorldPartial: (w, i, pn) => {
        if (!curStore) curStore = w.store as never as typeof curStore;
        const ent = SLOT_END.get(i);
        if (ent === undefined) return;
        if (ent.nm !== pn) {
          const msg = `[SLOT_END 名实不符] 槽#${i} 期望「${ent.nm}」实到「${pn}」——管线槽序与本表漂移!`;
          console.log(`  ✗✗ ${msg}`);
          if (process.env.SW_I163_STRICT_NAMES === '1') throw new Error(msg);
        }
        const di = ent.d ?? NAME2IDX.get(ent.name);
        if (di === undefined || seen.has(di) || !wantSlot(di)) return;
        seen.add(di);
        rows.push(cmp(`槽末#${i}·${pn}`, di, w.store as never as typeof curStore));
      },
    });
  } finally { RNGp.reseed = oReseed; }
  rows.sort((a, b) => a.idx - b.idx);
  let anyBad = false;
  for (const r of rows) {
    const bad = r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa || r.dFx || r.dFy;
    anyBad ||= !!bad;
    console.log(`${String(r.idx).padStart(3)} ${DUMPNAME.get(r.idx) ?? '?'} ← ${r.tag.padEnd(22)} ` +
      `A=${String(r.dA).padStart(7)} T=${String(r.dT).padStart(7)} W=${String(r.dW).padStart(6)} L=${String(r.dL).padStart(6)} ` +
      `Hf=${String(r.dHf).padStart(6)} Sl=${String(r.dSl).padStart(6)} Lt=${String(r.dLt).padStart(6)} Ia=${String(r.dIa).padStart(4)} ` +
      `Fx=${String(r.dFx).padStart(6)}(a${r.dFxA}/i${r.dFxi}) Fy=${String(r.dFy).padStart(6)}(a${r.dFyA}/i${r.dFyi})` +
      ` (Gh=${r.dGh} ant${r.fxAnt}/${r.fyAnt}) ${bad ? '✗ ' + r.first : '✓'}`);
    if (r.dFx || r.dFy) {
      const fxPairs = Object.entries(r.fxDiffClass).map(([k, n]) => `${k}×${n}`).join(' ');
      const fyPairs = Object.entries(r.fyDiffClass).map(([k, n]) => `${k}×${n}`).join(' ');
      console.log(`     fx-class: ${fxPairs || '-'}; fy-class: ${fyPairs || '-'}`);
      console.log(`     samples: ${r.samples.slice(0, 6).join(' | ')}`);
    } else if (bad) {
      console.log(`     pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}`);
      console.log(`     samples: ${r.samples.join(' | ')}`);
    }
  }
  const firstBad = rows.find((r) => r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa || r.dFx || r.dFy);
  const firstGh = rows.find((r) => r.dGh);
  const firstFx = rows.find((r) => r.dFx);
  const firstFy = rows.find((r) => r.dFy);
  console.log(`\n★ 10通道首差边界: ${firstBad ? `#${String(firstBad.idx).padStart(3)} ${DUMPNAME.get(firstBad.idx)} @${firstBad.tag} ${firstBad.first}` : '无（全绿）'}`);
  console.log(`★ 帧通道首差: fx ${firstFx ? `#${firstFx.idx} dFx=${firstFx.dFx}` : '无'}; fy ${firstFy ? `#${firstFy.idx} dFy=${firstFy.dFy}` : '无'}`);
  console.log(`★ ghost 首差边界(信息位): ${firstGh ? `#${firstGh.idx} ${DUMPNAME.get(firstGh.idx)} gh=${firstGh.dGh}` : '无'}`);
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s rows=${rows.length} anyBad=${anyBad}`);
  writeFileSync(`${OUT}/mile8-10ch-${TAG}.json`, JSON.stringify({
    rows: rows.map((r) => ({ ...r, pairs: r.pairs })), census: [...CENSUS.entries()].map(([k, v]) => ({ k, ...v })),
  }));
}, 900_000);
