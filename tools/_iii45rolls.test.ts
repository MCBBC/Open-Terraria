// IIIII45 一次性仪：DRUNK 全程掷流对拍（JS 侧）。
// 与 rig SW_ROLLWIN 同口径（UnifiedRandom.internalSample → __swOnRoll），
// 里程碑边界复用 mile8 的 LABEL2DUMP/SLOT_END 表（标签/槽名 → x86 dump idx）。
// 产物 /tmp/iii47-out/js-drunk-rolls.txt：'---PASS <dumpIdx> <name>' 标记 + 值序列，
// 与 x86-drunk-rolls/rolls.txt（SW_ROLLWIN=1-105）逐段 FNV/计数对拍。
// 用法：cd game && SW_III45R=1 npx vitest run tools/_iii45rolls.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_III45R === '1';
const SEED = process.env.SW_III45R_SEED ?? '51620200';

void TILE_DEFS;

const SLOT_END = new Map<number, { d: number; nm: string }>([
  [0, { d: 0, nm: '原版地形' }], [1, { d: 1, nm: '沙丘' }],
  [2, { d: 13, nm: '洞穴' }], [3, { d: 35, nm: '生物群系' }],
  [5, { d: 37, nm: '引力沙' }], [6, { d: 38, nm: '微光' }],
  [7, { d: 39, nm: '清理' }], [8, { d: 48, nm: '结构' }],
  [9, { d: 49, nm: '水体沉降' }], [10, { d: 50, nm: '沙上清水' }],
  [11, { d: 51, nm: '绿洲' }], [12, { d: 52, nm: '海滩装饰' }],
  [13, { d: 53, nm: '半砖平滑' }],
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
  [34, { d: 79, nm: '草墙' }], [35, { d: 80, nm: '起始镇民' }],
  [36, { d: 81, nm: '向日葵' }], [37, { d: 82, nm: '栽树' }],
  [38, { d: 83, nm: '炼金草药' }], [39, { d: 84, nm: '染料植物' }],
  [40, { d: 85, nm: '蛛网蜂巢' }], [41, { d: 87, nm: '地表植物' }],
  [42, { d: 88, nm: '丛林植物P2' }], [43, { d: 89, nm: '藤蔓' }],
  [44, { d: 90, nm: '地表花' }], [45, { d: 91, nm: '地表蘑菇' }],
  [46, { d: 93, nm: '宝石系统' }], [47, { d: 94, nm: '长苔藓' }],
  [48, { d: 95, nm: '丛林墙' }], [49, { d: 96, nm: '蜂巢幼虫' }],
  [50, { d: 97, nm: '微群系' }], [51, { d: 98, nm: '二次沉降' }],
  [52, { d: 99, nm: '仙人掌珊瑚' }], [53, { d: 100, nm: '瓦片清理' }],
  [54, { d: 101, nm: '蜥蜴祭坛' }], [55, { d: 102, nm: '水生植物' }],
  [56, { d: 103, nm: '钟乳石宝石树' }], [57, { d: 104, nm: '断线陷阱清理' }],
  [58, { d: 105, nm: '终清理' }],
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

(RUN ? it : it.skip)('JS full roll-stream capture (drunk)', async () => {
  const OUTP = process.env.SW_III45R_OUT ?? '/tmp/iii47-out/js-drunk-rolls.txt';
  const { createWriteStream } = await import('node:fs');
  const ws = createWriteStream(OUTP);
  // 直接流式写：值即到即写（chunk 缓冲会爆 JS 最大串长）
  let pendingCount = 0;
  let bufLines: string[] = [];
  const seen = new Set<number>();
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  g.__swOnRoll = (v: number) => {
    bufLines.push(String(v));
    if (bufLines.length >= 4096) { ws.write(bufLines.join('\n') + '\n'); bufLines.length = 0; }
    pendingCount++;
  };
  function mark(d: number, nm: string): void {
    if (seen.has(d)) return;
    seen.add(d);
    if (bufLines.length > 0) { ws.write(bufLines.join('\n') + '\n'); bufLines.length = 0; }
    ws.write(`---PASS ${d} ${nm}\n`);
  }
  const markRef = mark;
  void markRef;

  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii45rolls')) {
        const lab = labelOf(m[1], Number(m[2]));
        const idx = LABEL2DUMP.get(lab);
        if (idx !== undefined && !seen.has(idx)) mark(idx, lab);
        break;
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1,
      seedFlags: { drunkWorld: true },
      onWorldPartial: (_w, i, pn) => {
        const ent = SLOT_END.get(i);
        if (ent === undefined) return;
        mark(ent.d, `槽末#${i}·${pn}`);
      },
    });
  } finally {
    RNGp.reseed = oReseed;
    delete g.__swOnRoll;
  }
  if (bufLines.length > 0) { ws.write(bufLines.join('\n') + '\n'); bufLines.length = 0; }
  await new Promise<void>((res) => ws.end(res));
  console.log(`milestones=${seen.size} samples=${pendingCount} → ${OUTP}`);
}, 900_000);
