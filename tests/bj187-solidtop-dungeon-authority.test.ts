/** ★BJ187（2026-09-19）solidTop/DUNGEON 三表单源收编批金标。
 *  vanilla 真值=/tmp/bj187-extract.mjs 程序化提取（1457 Main.cs 逐条赋值行 +
 *  for 循环臂 tileSolidTop[num2]=true(:10128,435..439) 双提取），非手抄。
 *  变异证红记录见文件尾。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  SOLID_TOP_SHEETS, SOLID_TOP_IDS, TILE_DUNGEON_SHEETS, TILE_DUNGEON_IDS,
  WALL_DUNGEON_SHEETS, TILE_TABLE_SHEETS, TILE_INTERNAL_BY_SHEET, TILE_DEFS,
} from '../src/data/tiles';
import { PC_SOLID_TOP } from '../src/world/gen/vanilla/BuriedChestsPass';
import { VAN_TILE_SOLIDTOP_SHEET_SET } from '../src/world/gen/vanilla/GenSolid';
import { VANILLA_TILE_SOLID_TOP } from '../src/world/spawn/VanillaSpawner';
import { WALL_DUNGEON, DUNGEON_TILE_IDS } from '../src/world/gen/vanilla/TeleportSpotCheck';
import { WALL_DUNGEON_SHEETS as WALL_DUNGEON_SHEETS_DZ } from '../src/world/DungeonDualZones';
import { solidOrSlopedTP } from '../src/world/gen/vanilla/TemplePass';
import { TileStore } from '../src/world/TileStore';

// ---- Main.cs 程序化提取金标（79 直赋 + 435-439 循环臂；升序） ----
const SOLID_TOP_GOLDEN = [
  14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376,
  380, 391, 392, 393, 394, 405, 413, 414, 427, 435, 436, 437, 438, 439, 469, 532,
  533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601,
  602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643,
  644, 645, 710,
];
const TILE_DUNGEON_GOLDEN = [41, 43, 44, 677, 678, 679];
const WALL_DUNGEON_GOLDEN = [7, 8, 9, 94, 95, 96, 97, 98, 99];

const setVals = (s: ReadonlySet<number>) => [...s].sort((a, b) => a - b);
const eqVals = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('§A SOLID_TOP_SHEETS 金标（Main.cs 直赋 79 + 循环臂 5 = 84）', () => {
  it('84 项逐值钉死（循环臂 435-439 补齐=BJ186 真值差#1 定谳）', () => {
    expect(SOLID_TOP_SHEETS.size).toBe(84);
    expect(eqVals(setVals(SOLID_TOP_SHEETS), SOLID_TOP_GOLDEN)).toBe(true);
  });
  it('循环臂断言:435-439 队伍平台五色必在（TeamBlockGreen/Blue/Yellow/Pink/WhitePlatform）', () => {
    for (const sh of [435, 436, 437, 438, 439]) expect(SOLID_TOP_SHEETS.has(sh)).toBe(true);
  });
  it('剔 0 断言:vanilla 无 tileSolidTop[0]（泥土/残型 type0 恒非 solidTop）', () => {
    expect(SOLID_TOP_SHEETS.has(0)).toBe(false);
  });
  it('tileTable(81)⊂tileSolidTop(84),差集恰={16,134,239}（程序化对拍定谳）', () => {
    const diff = [...SOLID_TOP_SHEETS].filter((v) => !TILE_TABLE_SHEETS.has(v)).sort((a, b) => a - b);
    expect(TILE_TABLE_SHEETS.size).toBe(81);
    expect(eqVals(diff, [16, 134, 239])).toBe(true);
    for (const v of TILE_TABLE_SHEETS) expect(SOLID_TOP_SHEETS.has(v)).toBe(true);
  });
});

describe('§B SOLID_TOP_IDS 内部域镜像（旧 .map(TILE_INTERNAL_BY_SHEET) 习语逐值全等）', () => {
  // 旧习语复算（VanillaSpawner 原实现,未注册 sheet 落空）——与镜像恒等
  const legacyIdiom = new Set(
    SOLID_TOP_GOLDEN.map((sh) => TILE_INTERNAL_BY_SHEET.get(sh) ?? -1).filter((t) => t >= 0),
  );
  it('镜像 ≡ 旧习语平移（未注册 sheet 过滤语义一致）', () => {
    expect(eqVals(setVals(SOLID_TOP_IDS), setVals(legacyIdiom))).toBe(true);
  });
  it('域判别:镜像成员的 vanilla.sheet 全部 ∈ 金标;sheet 裸值 14(桌)∉IDS 恒假 14∈SHEETS', () => {
    for (const id of SOLID_TOP_IDS) {
      expect(SOLID_TOP_SHEETS.has(TILE_DEFS[id]?.vanilla?.sheet ?? -1)).toBe(true);
    }
    expect(SOLID_TOP_SHEETS.has(14)).toBe(true);
    expect(SOLID_TOP_IDS.has(TILE_INTERNAL_BY_SHEET.get(14)!)).toBe(true);
  });
});

describe('§C solidTop 副本收编等价（逐值对拍=authority）', () => {
  it('导出面副本:PC_SOLID_TOP/VAN_TILE_SOLIDTOP_SHEET_SET ≡ SOLID_TOP_SHEETS', () => {
    expect(eqVals(setVals(PC_SOLID_TOP), setVals(SOLID_TOP_SHEETS))).toBe(true);
    expect(eqVals(setVals(VAN_TILE_SOLIDTOP_SHEET_SET), setVals(SOLID_TOP_SHEETS))).toBe(true);
  });
  it('内部域副本:VANILLA_TILE_SOLID_TOP ≡ SOLID_TOP_IDS（旅行商站立柱/上3格自由门）', () => {
    expect(eqVals(setVals(VANILLA_TILE_SOLID_TOP), setVals(SOLID_TOP_IDS))).toBe(true);
  });
  it('结构锁:solidTop 收编文件旧 79/截断字面副本禁复活,且仍消费单源名', () => {
    const FILES = [
      'src/world/gen/vanilla/GenSolid.ts',
      'src/world/gen/vanilla/HalfBrickPass.ts',
      'src/world/gen/vanilla/TeleportSpotCheck.ts',
      'src/world/gen/vanilla/LivingTreePass.ts',
      'src/world/gen/vanilla/DungeonPass.ts',
      'src/world/gen/vanilla/BuriedChestsPass.ts',
      'src/world/gen/vanilla/GemPasses.ts',
      'src/world/gen/vanilla/TileCleanupPass.ts',
      'src/world/gen/vanilla/NotTheBeesPass.ts',
      'src/world/gen/vanilla/FinalCleanupPass.ts',
      'src/world/gen/vanilla/TemplePass.ts',
      'src/world/gen/vanilla/TrapsPass.ts',
      'src/world/gen/vanilla/CaveHousePass.ts',
      'src/world/gen/vanilla/FinishNoTrapsPass.ts',
      'src/world/gen/vanilla/SecretSeedDoEndsPass.ts',
      'src/world/spawn/VanillaSpawner.ts',
    ];
    const STALE = /\bnew Set\(\[\s*14,\s*16,\s*18,\s*19,\s*87/;   // 79 项旧副本签名
    const TRUNCATED = /\bPC_SOLID_TOP_F10\s*=\s*new Set\(/;        // F10 截断副本复活签名
    for (const f of FILES) {
      const src = srcOf(f);
      expect({ file: f, stale: STALE.test(src) }).toEqual({ file: f, stale: false });
      expect({ file: f, trunc: TRUNCATED.test(src) }).toEqual({ file: f, trunc: false });
      expect({ file: f, single: src.includes('SOLID_TOP_SHEETS') || src.includes('SOLID_TOP_IDS') })
        .toEqual({ file: f, single: true });
    }
  });
});

describe('§D tileDungeon/wallDungeon 金标（Main.cs:8131-8136 / :10734-10745）', () => {
  it('TILE_DUNGEON_SHEETS=6 项逐值钉死;481-483 裂纹砖不在表（★IIIII165 同案）', () => {
    expect(TILE_DUNGEON_SHEETS.size).toBe(6);
    expect(eqVals(setVals(TILE_DUNGEON_SHEETS), TILE_DUNGEON_GOLDEN)).toBe(true);
    for (const sh of [481, 482, 483]) expect(TILE_DUNGEON_SHEETS.has(sh)).toBe(false);
  });
  it('WALL_DUNGEON_SHEETS=9 项逐值钉死（含导出面 DungeonDualZones/TeleportSpotCheck 转出口）', () => {
    expect(WALL_DUNGEON_SHEETS.size).toBe(9);
    expect(eqVals(setVals(WALL_DUNGEON_SHEETS), WALL_DUNGEON_GOLDEN)).toBe(true);
    expect(eqVals(setVals(WALL_DUNGEON_SHEETS_DZ), WALL_DUNGEON_GOLDEN)).toBe(true);
    expect(eqVals(setVals(WALL_DUNGEON), WALL_DUNGEON_GOLDEN)).toBe(true);
  });
  it('TILE_DUNGEON_IDS 镜像 ≡ 旧 idsByVanillaSheet 平移习语', () => {
    const legacy = new Set(
      TILE_DUNGEON_GOLDEN.map((sh) => TILE_INTERNAL_BY_SHEET.get(sh) ?? -1).filter((t) => t >= 0),
    );
    expect(eqVals(setVals(TILE_DUNGEON_IDS), setVals(legacy))).toBe(true);
  });
  it('结构锁:dungeon 收编文件旧字面副本禁复活,且仍消费单源名', () => {
    const FILES = [
      'src/core/Game.ts',
      'src/world/DungeonDualZones.ts',
      'src/world/SceneMetrics.ts',
      'src/world/gen/WorldGen.ts',
      'src/world/gen/vanilla/DungeonDualLayout.ts',
      'src/world/gen/vanilla/DungeonStyles1457.ts',
      'src/world/gen/vanilla/DungeonPass.ts',
      'src/world/gen/vanilla/NotTheBeesPass.ts',
      'src/world/gen/vanilla/FinalCleanupPass.ts',
      'src/world/gen/vanilla/CorruptionPass.ts',
      'src/world/gen/vanilla/OceanCavesPass.ts',
      'src/world/gen/vanilla/TemplePass.ts',
      'src/world/gen/vanilla/FinishRemixWorldPass.ts',
      'src/world/gen/vanilla/MountCavesPass.ts',
      'src/world/gen/vanilla/LavaLayerCavererPass.ts',
      'src/world/gen/vanilla/TrapsPass.ts',
      'src/world/gen/vanilla/TeleporterPass.ts',
      'src/world/gen/vanilla/PilesPass.ts',
      'src/world/gen/vanilla/LivingTreePass.ts',
      'src/world/gen/vanilla/StructuresPass.ts',
      'src/world/gen/vanilla/PotsPass.ts',
      'src/world/gen/vanilla/GemPasses.ts',
      'src/world/gen/vanilla/BuriedChestsPass.ts',
      'src/world/gen/vanilla/FinishDrunkGenPass.ts',
      'src/world/gen/vanilla/SurfaceDecorPasses.ts',
      'src/world/gen/vanilla/SecretSeedDoEndsPass.ts',
      'src/world/gen/vanilla/MossPass.ts',
      'src/world/gen/vanilla/TeleportSpotCheck.ts',
      'src/world/gen/vanilla/MicroBiomesPass.ts',
      'src/world/gen/vanilla/FinalSeedCleanupPass.ts',
      'src/world/spawn/SpawnPlacement.ts',
      'src/entities/TownNPC.ts',
      'src/entities/Enemy.ts',
      'src/data/wallDrops.ts',
    ];
    const TD = /\bnew Set\(\[\s*41,\s*43,\s*44,\s*677,\s*678,\s*679\s*\]\)/;     // tileDungeon 字面
    const TD_IDS = /\bidsByVanillaSheet\(\s*41,\s*43,\s*44,\s*677,\s*678,\s*679\s*\)/; // 内部域平移字面
    const WD = /\bnew Set\(\[\s*7,\s*8,\s*9,\s*94,\s*95,\s*96,\s*97,\s*98,\s*99\s*\]\)/; // wallDungeon 字面
    for (const f of FILES) {
      const src = srcOf(f);
      expect({ file: f, td: TD.test(src) }).toEqual({ file: f, td: false });
      expect({ file: f, tdIds: TD_IDS.test(src) }).toEqual({ file: f, tdIds: false });
      expect({ file: f, wd: WD.test(src) }).toEqual({ file: f, wd: false });
      expect({ file: f, single: src.includes('TILE_DUNGEON_SHEETS') || src.includes('TILE_DUNGEON_IDS') || src.includes('WALL_DUNGEON_SHEETS') })
        .toEqual({ file: f, single: true });
    }
  });
});

describe('§E 真值差影响面探针（TemplePass solidOrSlopedTP 对 435-439 补臂前后）', () => {
  const st = new TileStore(8, 8);
  const put = (x: number, y: number, sheet: number) => {
    const id = TILE_INTERNAL_BY_SHEET.get(sheet);
    expect(id).toBeDefined();
    st.setTile(x, y, id!);
  };
  it('对照面:泥土地面 solidOrSlopedTP=true（tileSolid 且非 solidTop）', () => {
    put(3, 3, 0);
    expect(solidOrSlopedTP(st, 3, 3)).toBe(true);
  });
  it('★435-439 补臂判别:队伍平台 435 solidOrSlopedTP=false（vanilla tileSolidTop=true 排除）', () => {
    put(4, 4, 435);
    expect(solidOrSlopedTP(st, 4, 4)).toBe(false);
  });
  it('wood 平台 19 同判 false（VAN_TILE_SOLID_EXTRA/SOLID_TOP 双覆盖,平台族对照）', () => {
    put(5, 5, 19);
    expect(solidOrSlopedTP(st, 5, 5)).toBe(false);
  });
  it('家具 14 桌 solidOrSlopedTP=false（genSolidType 前腿拦截,solidTop 独有面）', () => {
    put(6, 6, 14);
    expect(solidOrSlopedTP(st, 6, 6)).toBe(false);
  });
});

// ★BJ187 批变异证红记录（2026-09-19,均在验证后还原）：
//   M1 SOLID_TOP_SHEETS 摘 436（回退漏循环臂病灶）→ §A 金标红+§B 镜像红;
//   M2 SOLID_TOP_SHEETS 添 0（BJ186「多 0」假设性复活）→ §A 剔 0 断言红;
//   M3 SOLID_TOP_IDS 错域回退 new Set(SOLID_TOP_SHEETS)（sheet 裸值顶替）→ §B 镜像+域判别两红;
//   M4 TILE_DUNGEON_SHEETS 摘 679 → §D 金标红+§D 镜像红;
//   M5 WALL_DUNGEON_SHEETS 摘 94 → §D 金标红（含两导出面转出口）+回归 dungeon-walls 红;
//   M6 TemplePass SOLID_TOP_TP 回绑旧 79 项副本 → §E 队伍平台探针红（误实心复现）。
