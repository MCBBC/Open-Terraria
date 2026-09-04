// IIII81 克隆自 tools/_mile8.test.ts（IIIII78 批 · 一次性诊断,零主路径改动）。
// 差异点：锚按【x86 dump 文件名】解析而非静态数字序——双地牢链在 Dungeon 前插
// Dual_Dungeons_Dither_Snake、十二禁表 pass 冻结 dump 等「管线形状漂移」自动适配：
//   每条 reseed 锚/槽末锚先经标准名表(LAB2NAME/SLOT_TABLE)落到 x86 pass 名，再由
//   目录实际文件反查 dump 序号 ⇒ 链形增删槽位后仍对齐正确快照。
// 用法：cd game && SW_I81=1 SW_I81_G2=/tmp/iii81-out/x86-ddual SW_I81_SEED='doubledaringdangers|20260831'
//        SW_I81_FLAGS=dualDungeons npx vitest run tools/_iii81m8.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';   // ★IIIII106 COAT_* 位常量

const RUN = process.env.SW_I81 === '1';
const VG = process.env.SW_I81_VG ?? '';  // 名表源
const G2 = process.env.SW_I81_G2 ?? '';            // 8 通道真值
// JJJJ 批旁路参：第二种子对拍（默认 9293480/0 保持原行为不变）
const SEED = process.env.SW_I81_SEED ?? '0';
const EVIL = process.env.SW_I81_EVIL !== undefined ? Number(process.env.SW_I81_EVIL) : -1;
// YYYY 批旁路参：中世界链（6400×1800）+大 N 禁缓存（每槽 ~115MB×106 槽会爆 RSS）
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
const NOCACHE = process.env.SW_I81_NOCACHE === '1';
// ★IIIII106：涂装/涂层扩展通道（SW_I81_PAINT=1）——.pnt(块漆)/.pwal(墙漆)/.cbt(涂层四位)
// 仅当链 dump 目录带此三通道文件时参与比较（旧 G2 目录零变化，缺省全跳过）。
// x86 侧由 /tmp/i106rig.app 的 JJHook 扩展 dump（SW_DUMP_PAINT=1）：pnt=color(sTileHeader
// 低5位)、pwal=wallColor(bTileHeader 低5位)、cbt 位包=invisibleBlock|invisibleWall<<1|
// fullbrightBlock<<2|fullbrightWall<<3。JS 侧 TileStore：paint/paintWall 漆值同域；
// coat 常量 INV_B=2/INV_W=4/FB_B=8/FB_W=16 → 位包按位映射。
const PAINT = process.env.SW_I81_PAINT === '1';
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
for (const f of (process.env.SW_I81_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
}
// ★IIIII88 双地牢链形状适配：dual 世界在 Dungeon 前插了 Dual_Dungeons_Dither_Snake 槽
// ——『▶Dungeon』锚（=该 pass 开始时的快照）在此链对应的是蛇槽末态 dump #032。
const IS_DUAL = !!M8_FLAGS.dualDungeons;
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
// ── IIII81 槽末锚（槽位→中文名→x86 pass 名）——dump 序号由 NAME2IDX 现场解析 ──
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
// ── IIII81 reseed 锚标签 → x86 标准序 dump 名（std 表源 rrrr-out/x86-g）──
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
// ★IIIII88 dual 链形状适配（上面 IS_DUAL 计算后注入）：蛇槽落在 Slush 与 Dungeon 之间
if (IS_DUAL) {
  LAB2NAME.set('Dungeon', 'Dual_Dungeons_Dither_Snake');   // ▶Dungeon 锚=蛇槽末态(#032)
  LAB2NAME.set('SnakeEnd', 'Dual_Dungeons_Dither_Snake');
  LAB2NAME.set('DitherSnake', 'Slush');                    // ▶DitherSnake 锚=蛇前态(=#031)
}
/** 每链 dump 目录实际形态（name→idx），列目录后填充 */
const NAME2IDX = new Map<string, number>();
function labIdx(lab: string): number | undefined {
  const nm = LAB2NAME.get(lab);
  return nm === undefined ? undefined : NAME2IDX.get(nm);
}

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
interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array; pnt?: Uint8Array; pwal?: Uint8Array; cbt?: Uint8Array }
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
  // ★IIIII106：paint/coat 扩展三通道（存在才载入；不存在保持 undefined=不裁决）
  if (PAINT) {
    if (existsSync(`${pre}.pnt`) && existsSync(`${pre}.pwal`) && existsSync(`${pre}.cbt`)) {
      c.pnt = readFileSync(`${pre}.pnt`);
      c.pwal = readFileSync(`${pre}.pwal`);
      c.cbt = readFileSync(`${pre}.cbt`);
    } else {
      console.log(`  [i106-paint] #${idx}_${nm} 缺 paint 通道 → 该槽 paint 三通道不参与裁决`);
    }
  }
  if (!NOCACHE) cache.set(idx, c);
  return c;
}

interface Row {
  idx: number; tag: string; dA: number; dT: number; dW: number; dL: number;
  dHf: number; dSl: number; dLt: number; dIa: number; dGh: number;
  dP?: number; dPw?: number; dCb?: number;
  first: string; pairs: Array<[string, number]>; samples: string[];
}
function cmp(tag: string, idx: number, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
} & Partial<Record<'paint' | 'paintWall' | 'coat', Uint8Array>>): Row {
  const c = chans(idx);
  const r: Row = { idx, tag, dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, dGh: 0,
    ...(PAINT ? { dP: -1, dPw: -1, dCb: -1 } : {}), first: '', pairs: [], samples: [] };
  if (!c) { r.first = '(no dump)'; return r; }
  const pair = new Map<string, number>();
  let firstI = -1;
  const mark = (i: number) => { if (firstI < 0) firstI = i; };
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; mark(i); if (r.samples.length < 8) r.samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    // ★IIIII227:type=0 残型格（act=1,type=0,vanilla 烧除 cs:1554 裸 type 写产物）照 0
    //   记——SHEET[0]=-1 曾把它打成 9999 假差（同 344 行 ghost 通道判例:哨兵伪影非内容债;
    //   REMIX #98 定谳后 JS 侧首现此态,11 格全假差实证=res-settle2 终态逐格核对）
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
    // lty：仅 liquid>0 的格裁决（vanilla 0 基 ↔ JS +1 基）
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; mark(i); const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 8) r.samples.push(`Y(${i % W},${(i / W) | 0}) v${vl} j${jl} liq${c.l[i]}`); }
    const via = c.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; mark(i); if (r.samples.length < 8) r.samples.push(`I(${i % W},${(i / W) | 0}) v${via} j${jia}`); }
    // ★IIIII106：paint/coat 三通道（dump 带文件才裁决；-1=该槽未带通道不裁决）
    if (c.pnt && c.pwal && c.cbt && PAINT) {
      const jp = st.paint as Uint8Array | undefined, jpw = st.paintWall as Uint8Array | undefined,
        jc = st.coat as Uint8Array | undefined;
      if (jp && jpw && jc) {
        let p = 0, pw = 0, cb = 0;
        if (c.pnt[i] !== jp[i]) { p++; }
        if (c.pwal[i] !== jpw[i]) { pw++; }
        // x86 位包→JS coat 常量反映射逐位比
        const vcb = c.cbt[i]!;
        const wantCoat = ((vcb & 1) ? TileStore.COAT_INVISIBLE_BLOCK : 0)
          | ((vcb >> 1 & 1) ? TileStore.COAT_INVISIBLE_WALL : 0)
          | ((vcb >> 2 & 1) ? TileStore.COAT_FULLBRIGHT_BLOCK : 0)
          | ((vcb >> 3 & 1) ? TileStore.COAT_FULLBRIGHT_WALL : 0);
        // JS 杂散位也报差：coat 中不属于四位包的位=状态污染
        if (jc[i] !== wantCoat) { cb++; if (r.samples.length < 8) r.samples.push(`Cb(${i % W},${(i / W) | 0}) v${vcb} j${jc[i]}`); }
        if (p) { mark(i); if (r.samples.length < 8) r.samples.push(`P(${i % W},${(i / W) | 0}) v${c.pnt[i]} j${jp[i]}`); }
        if (pw) { mark(i); if (r.samples.length < 8) r.samples.push(`Pw(${i % W},${(i / W) | 0}) v${c.pwal[i]} j${jpw[i]}`); }
        r.dP = (r.dP === -1 ? 0 : r.dP) + p;
        r.dPw = (r.dPw === -1 ? 0 : r.dPw) + pw;
        r.dCb = (r.dCb === -1 ? 0 : r.dCb) + cb;
      }
    }
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

(RUN ? it : it.skip)('IIIII78 per-chain 8ch diff (name-anchored)', async () => {
  for (const f of readdirSync(VG)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) { DUMPNAME.set(Number(m[1]), m[2]); NAME2IDX.set(m[2], Number(m[1])); }
  }
  console.log(`dump names: ${DUMPNAME.size} (8ch dir=${G2})`);
  // ★YYYYYY（2026-08-23）假绿免疫（XXXXX 批遗留#6 落地）：VG 传错目录（如 home-sec-*
  //  只有 .wld）→ DUMPNAME 空 → chans() 全 '(no dump)' → 全槽假绿。名表必须从
  //  8 通道 dump 目录取——SW_M8_VG 应与 SW_M8_G2 同目录。
  if (DUMPNAME.size < Number(process.env.SW_I81_MINNAMES ?? 100)) {   // IIII81:截断链诊断时可用 SW_I81_MINNAMES 放宽(其余免疫仍在)
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
          const idx = labIdx(lab);
          if (idx !== undefined && !seen.has(idx)) {
            seen.add(idx);
            rows.push(cmp(lab, idx, curStore!));
          } else if (idx === undefined && !unmapped.has(lab)) {
            // IIII81：名字级缺失（链形形状漂移导致本链无此 dump）单独归类，不与
            // 「JS 侧未知标签」混淆——前者是预期适配产物。
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
        // ★IIIII110b（2026-09-04）pumpkin 链定谳配套：SW_I81_PINFLAGS=1 = S0-1 直注语义
        //   ——恒传 M8_FLAGS（可为空 {}）作 cfg.seedFlags，压掉 WorldGen.ts 的
        //   parseSeedChain(effSeedText) 文本秘种子路由回退。背景：i78 家族真值桶
        //   （rig BCrypt 文本路由不可达,IIIII163 定谳）对 'pumpkinseason|20260904'
        //   产**无旗**世界（x86 全 110 dump 254=0 实证,active 指纹≡ctl171）;JS 侧
        //   缺省回退会把 halloweenGen 从种子文本路由出来 → 与桶配方漂移（CXV c12345
        //   EVIL 漂移同判例）→ #86 起 20 行伪红。SW_I81_PINFLAGS=1 + 不给
        //   SW_I81_FLAGS = 无旗直注 = mile8 106 槽满绿复现（/tmp/iii140-out）。
        seedFlags: process.env.SW_I81_PINFLAGS === '1' ? M8_FLAGS
          : (Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined),
        // ★IIIIII8：onWorldPartial 第三参=passes[i].name → 槽名实到校验。任何未来
        // 管线增删/搬移槽位在这里立即报「名实不符」(曾因 II6 插「起始镇民」静默错位
        // 烧出四链 #81 T27>0 全线伪红)。默认响亮告警不阻断；SW_M8_STRICT_NAMES=1
        // 升级为 throw（对拍结论须绝对可信时开启）。
        onWorldPartial: (w, i, pn) => {
          if (!curStore) curStore = w.store as never as typeof curStore;
          // ★IIIII102 槽末管线态落盘（SW_I81_SAVE=「中文槽名」→ /tmp 下 serialize 全通道）
          const saveSlot = process.env.SW_I81_SAVE;
          if (saveSlot && pn === saveSlot && !process.env.__swI81Saved) {
            process.env.__swI81Saved = '1';
            const dir = process.env.SW_I81_SAVEOUT ?? `/tmp/iiiiii102-out/pipeslot-${saveSlot}`;
            const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
            mkdirSync(dir, { recursive: true });
            const stv = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
            for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat']) {
              const a = stv[c]!;
              writeFileSync(`${dir}/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
            }
            writeFileSync(`${dir}/base_hdr.json`, JSON.stringify({ w: (w.store as unknown as { w: number }).w, h: (w.store as unknown as { h: number }).h }));
            console.log(`[i81] pipeslot saved: ${pn} -> ${dir}`);
          }
          const ent = SLOT_END.get(i);
          if (ent === undefined) return;
          if (ent.nm !== pn) {
            const msg = `[SLOT_END 名实不符] 槽#${i} 期望「${ent.nm}」实到「${pn}」——管线槽序与本表漂移,mile8 结果不可按本表解读!`;
            console.log(`  ✗✗ ${msg}`);
            if (process.env.SW_I81_STRICT_NAMES === '1') throw new Error(msg);
          }
          const di = ent.d ?? NAME2IDX.get(ent.name);
          if (di === undefined || seen.has(di)) return;
          seen.add(di);
          rows.push(cmp(`槽末#${i}·${pn}`, di, w.store as never as typeof curStore));
        },
      });
    } catch (e) { throw e; }
  } finally { RNGp.reseed = oReseed; }
  rows.sort((a, b) => a.idx - b.idx);
  for (const r of rows) {
    const bad = r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa
      || ((r.dP ?? -1) > 0) || ((r.dPw ?? -1) > 0) || ((r.dCb ?? -1) > 0);
    console.log(`${String(r.idx).padStart(3)} ${DUMPNAME.get(r.idx) ?? '?'} ← ${r.tag.padEnd(22)} ` +
      `A=${String(r.dA).padStart(7)} T=${String(r.dT).padStart(7)} W=${String(r.dW).padStart(6)} L=${String(r.dL).padStart(6)} ` +
      `Hf=${String(r.dHf).padStart(6)} Sl=${String(r.dSl).padStart(6)} Lt=${String(r.dLt).padStart(6)} Ia=${String(r.dIa).padStart(4)} (Gh=${r.dGh})` +
      (PAINT ? ` P=${String(r.dP ?? '?').padStart(6)} Pw=${String(r.dPw ?? '?').padStart(5)} Cb=${String(r.dCb ?? '?').padStart(5)}` : '') +
      ` ${bad ? '✗ ' + r.first : '✓'}`);
    if (bad) {
      console.log(`     pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}`);
      console.log(`     samples: ${r.samples.join(' | ')}`);
    }
  }
  const firstBad = rows.find((r) => r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa
    || ((r.dP ?? -1) > 0) || ((r.dPw ?? -1) > 0) || ((r.dCb ?? -1) > 0));
  const firstGh = rows.find((r) => r.dGh);
  console.log(`\n★ 8通道首差边界: ${firstBad ? `#${String(firstBad.idx).padStart(3)} ${DUMPNAME.get(firstBad.idx)} @${firstBad.tag} ${firstBad.first} ${firstBad.pairs.slice(0, 4).map(([k, n]) => `${k}×${n}`).join(' ')}` : '无（0..31 全绿）'}`);
  console.log(`★ ghost 首差边界(信息位): ${firstGh ? `#${firstGh.idx} ${DUMPNAME.get(firstGh.idx)} gh=${firstGh.dGh}` : '无'}`);
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  writeFileSync(`/tmp/iii81-out/mile8-${process.env.SW_I81_TAG ?? 'tag'}.json`, JSON.stringify(rows));
}, 900_000);
