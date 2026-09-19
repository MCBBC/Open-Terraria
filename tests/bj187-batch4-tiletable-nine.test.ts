/** ★BJ187 登记债 1/2/5 批四（2026-09-19）：tile 副本第四批收编金标。
 *
 *  收编面：
 *   ①tileTable 族——MicroBiomesPass PLACE2X2_TABLE(旧 76 项漏 Main.cs:10125-10131
 *     循环臂 435-439=与 BJ186 PC_TILE_TABLE 同病) 与 DungeonPass TILE_TABLE_D(旧 76 项
 *     同病) → data/tiles.ts:TILE_TABLE_IDS 单源（向 vanilla 修正=81 全本）。
 *   ②平台九件套 {19,239,380,427,435-439}=tileSolid∩tileSolidTop（BJ187 定谳,GenSolid.
 *     VAN_TILE_SOLID_EXTRA 权威）——TouchDamage.TILE_SOLID_TOP_FAMILY / FallingBlock.
 *     TILE_SOLID_TOP_SHEETS / TeleportSpotCheck.PLATFORM_FAMILY_LUT 三副本收编
 *     （逐副本对拍【等价】非子集：九 sheet 全单 def,首定义/全定义平移同构）。
 *   ③JSON 面单向钉——vanilla-journeycat.json tileSolidTop(=84) ↔ SOLID_TOP_SHEETS;
 *     Housing ROOM_BLOCK_SOLIDTOP(=vanilla-tilecollision.json solid∩solidTop 九件套
 *     实证) ↔ 九件套权威。漂移即红。
 *
 *  vanilla 真值=反编译 Terarria1457/Terraria/Main.cs 程序化提取（tileTable 逐条赋值
 *  76 + for 循环臂 tileTable[num2]=true(num2=435..439,:10125) = 81 全本,全树无 =false 写;
 *  本批提取脚本走「赋值行+循环臂双提取×副本逐值 diff」,同 /tmp/bj187-extract.mjs 法）。
 *  变异证红记录见文件尾。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  TILE_TABLE_SHEETS, TILE_TABLE_IDS, SOLID_TOP_SHEETS, TILE_INTERNAL_BY_SHEET, TILE_DEFS,
} from '../src/data/tiles';
import { VAN_TILE_SOLID_EXTRA } from '../src/world/gen/vanilla/GenSolid';
import { TILE_SOLID_TOP_FAMILY, drownCollision } from '../src/stats/TouchDamage';
import { blockBelowMakesSandFall } from '../src/entities/FallingBlock';
import { vanTileSolid } from '../src/world/gen/vanilla/TeleportSpotCheck';
import { ROOM_BLOCK_SOLIDTOP } from '../src/world/Housing';
import { TileStore } from '../src/world/TileStore';

// ---- vanilla Main.tileTable 金标（1457 Main.cs 程序化提取:76 直赋 + 435-439 循环臂;升序） ----
const GOLDEN_TILE_TABLE_81 = [
  14, 18, 19, 87, 88, 101, 114, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376,
  380, 391, 392, 393, 394, 405, 413, 414, 427, 435, 436, 437, 438, 439, 469, 532,
  533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601,
  602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643,
  644, 645, 710,
];
// ---- tileSolid∩tileSolidTop 平台九件套金标（Main.cs:8031-8032/9797-9800/10118-10119/
//      10125-10131;BJ187 定谳,GenSolid.VAN_TILE_SOLID_EXTRA 权威） ----
const GOLDEN_NINE = [19, 239, 380, 427, 435, 436, 437, 438, 439];

const setVals = (s: ReadonlySet<number>) => [...s].sort((a, b) => a - b);
const eqVals = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const idOfSheet = (sheet: number): number => {
  const id = TILE_INTERNAL_BY_SHEET.get(sheet);
  expect({ sheet, registered: id !== undefined }).toEqual({ sheet, registered: true });
  return id!;
};

describe('§A tileTable 族收编（PLACE2X2_TABLE/TILE_TABLE_D 76→81 向 vanilla 修正）', () => {
  it('TILE_TABLE_SHEETS ≡ Main.tileTable 81 全本（逐值钉死;435-439 循环臂在内）', () => {
    expect(TILE_TABLE_SHEETS.size).toBe(81);
    expect(eqVals(setVals(TILE_TABLE_SHEETS), GOLDEN_TILE_TABLE_81)).toBe(true);
  });
  it('TILE_TABLE_IDS 镜像 ≡ sheet 金标平移（81 工作表全单 def,域封闭:成员 sheet 全在金标内）', () => {
    expect(TILE_TABLE_IDS.size).toBe(81);
    const legacy = new Set(
      GOLDEN_TILE_TABLE_81.map((sh) => TILE_INTERNAL_BY_SHEET.get(sh) ?? -1).filter((t) => t >= 0),
    );
    expect(eqVals(setVals(TILE_TABLE_IDS), setVals(legacy))).toBe(true);
    for (const id of TILE_TABLE_IDS) {
      expect(GOLDEN_TILE_TABLE_81.includes(TILE_DEFS[id]?.vanilla?.sheet ?? -1)).toBe(true);
    }
  });
  it('循环臂判别:队伍平台五色 435-439 内部 id 必在镜像（旧 76 副本在此判别位全漏）', () => {
    for (const sh of [435, 436, 437, 438, 439]) expect(TILE_TABLE_IDS.has(idOfSheet(sh))).toBe(true);
  });
  it('结构锁:MicroBiomesPass/DungeonPass 旧 76 项字面禁复活,别名转出口必须在场', () => {
    const mb = srcOf('src/world/gen/vanilla/MicroBiomesPass.ts');
    expect({ mb, stale: /const PLACE2X2_TABLE = idsByVanillaSheet\(/.test(mb) })
      .toEqual({ mb, stale: false });
    expect({ mb, alias: /const PLACE2X2_TABLE = TILE_TABLE_IDS;/.test(mb) })
      .toEqual({ mb, alias: true });
    const dp = srcOf('src/world/gen/vanilla/DungeonPass.ts');
    expect({ dp, stale: /const TILE_TABLE_D = new Set/.test(dp) }).toEqual({ dp, stale: false });
    expect({ dp, alias: /const TILE_TABLE_D = TILE_TABLE_IDS;/.test(dp) })
      .toEqual({ dp, alias: true });
  });
});

describe('§B 平台九件套三副本收编（=VAN_TILE_SOLID_EXTRA 权威,对拍等价）', () => {
  it('VAN_TILE_SOLID_EXTRA ≡ 九件套金标（sheet 域权威逐值钉死）', () => {
    expect(VAN_TILE_SOLID_EXTRA.size).toBe(9);
    expect(eqVals(setVals(VAN_TILE_SOLID_EXTRA), GOLDEN_NINE)).toBe(true);
  });
  it('族界:九件套 ⊆ SOLID_TOP_SHEETS(84);九−tileTable(81) 恰={239}（tileSolidTop 独有面）', () => {
    for (const v of GOLDEN_NINE) expect(SOLID_TOP_SHEETS.has(v)).toBe(true);
    const diff = GOLDEN_NINE.filter((v) => !TILE_TABLE_SHEETS.has(v));
    expect(eqVals(diff, [239])).toBe(true);
  });
  it('TouchDamage.TILE_SOLID_TOP_FAMILY ≡ 九件套内部域平移（逐值等价,非子集）', () => {
    const legacy = new Set(
      GOLDEN_NINE.map((sh) => TILE_INTERNAL_BY_SHEET.get(sh) ?? -1).filter((t) => t >= 0),
    );
    expect(TILE_SOLID_TOP_FAMILY.size).toBe(9);
    expect(eqVals(setVals(TILE_SOLID_TOP_FAMILY), setVals(legacy))).toBe(true);
  });
  it('行为探针:vanTileSolid 九件套真/家具假（TeleportSpotCheck PLATFORM_FAMILY_LUT 消费面）', () => {
    expect(vanTileSolid(idOfSheet(19))).toBe(true);    // 木平台
    expect(vanTileSolid(idOfSheet(436))).toBe(true);   // ★队伍平台蓝（循环臂活判别位）
    expect(vanTileSolid(idOfSheet(239))).toBe(true);   // 矿锭（tileTable 外的第九件）
    expect(vanTileSolid(idOfSheet(14))).toBe(false);   // 桌（tileSolid=false）
    expect(vanTileSolid(idOfSheet(0))).toBe(true);     // 泥土
  });
  it('行为探针:drownCollision 豁免行——dirt 豁免不计水/桌与队伍平台不豁免计水', () => {
    // 头盒 px=52 pw=4 py=33 ph=12 gravDir=1:扫描首行 j0=1,豁免行=该行（Collision.cs:1418）
    const probe = (sheet: number): boolean => {
      const st = new TileStore(8, 48);
      const id = idOfSheet(sheet);
      st.setTile(3, 1, id);
      st.setLiquid(3, 1, 255, 1);
      return drownCollision(st, 52, 33, 4, 12, 1, false);
    };
    expect(probe(0)).toBe(false);   // dirt: solid∧非九件套 → 豁免行整行不计水
    expect(probe(14)).toBe(true);   // 桌: def.solid=false → 豁免不触发,头部计水
    expect(probe(435)).toBe(true);  // 队伍平台: def.solid=false（数据档）→ 不豁免（死表备案位）
  });
  it('行为探针:blockBelowMakesSandFall——队伍平台撑得住/桌撑不住（FallingBlock 九件套腿）', () => {
    const probe = (sheet: number): boolean => {
      const st = new TileStore(8, 48);
      st.setTile(3, 2, idOfSheet(sheet));
      return blockBelowMakesSandFall(st, 3, 1);
    };
    expect(probe(435)).toBe(false);  // tileSolidOf(platform∧九件套)=true → 支撑成立
    expect(probe(14)).toBe(true);    // 家具桌 platform=false → 撑不住
  });
  it('结构锁:FallingBlock/TeleportSpotCheck 旧九件套字面禁复活,单源消费必须在场', () => {
    const fb = srcOf('src/entities/FallingBlock.ts');
    expect({ fb, stale: /const TILE_SOLID_TOP_SHEETS = new Set\(\[19, 239, 380, 427/.test(fb) })
      .toEqual({ fb, stale: false });
    expect({ fb, alias: /const TILE_SOLID_TOP_SHEETS = VAN_TILE_SOLID_EXTRA;/.test(fb) })
      .toEqual({ fb, alias: true });
    const tp = srcOf('src/world/gen/vanilla/TeleportSpotCheck.ts');
    expect({ tp, stale: /PLATFORM_FAMILY_LUT = lutFromSheets\(new Set\(\[19, 239, 380, 427/.test(tp) })
      .toEqual({ tp, stale: false });
    expect({ tp, single: /PLATFORM_FAMILY_LUT = lutFromSheets\(VAN_TILE_SOLID_EXTRA\)/.test(tp) })
      .toEqual({ tp, single: true });
    const td = srcOf('src/stats/TouchDamage.ts');
    expect({ td, stale: /TILE_SOLID_TOP_FAMILY = setOf\(\[19, 239, 380, 427/.test(td) })
      .toEqual({ td, stale: false });
    expect({ td, single: /TILE_SOLID_TOP_FAMILY = setOf\(\[\.\.\.VAN_TILE_SOLID_EXTRA\]\)/.test(td) })
      .toEqual({ td, single: true });
  });
});

describe('§C JSON 面单向钉（漂移即红）', () => {
  it('vanilla-journeycat.json tileSolidTop(84) ≡ SOLID_TOP_SHEETS(84)（双向集合全等,值恒 1）', () => {
    const jc = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-journeycat.json'), 'utf8')) as {
      tileSolidTop: Record<string, number>;
    };
    const keys = Object.keys(jc.tileSolidTop).map(Number);
    expect(keys.length).toBe(84);
    for (const v of Object.values(jc.tileSolidTop)) expect(v).toBe(1);
    expect(eqVals([...keys].sort((a, b) => a - b), setVals(SOLID_TOP_SHEETS))).toBe(true);
    expect(eqVals(setVals(SOLID_TOP_SHEETS), [...keys].sort((a, b) => a - b))).toBe(true);
  });
  it('Housing.ROOM_BLOCK_SOLIDTOP ≡ 九件套权威（vanilla-tilecollision.json solid∩solidTop 实证）', () => {
    expect(ROOM_BLOCK_SOLIDTOP.size).toBe(9);
    expect(eqVals(setVals(ROOM_BLOCK_SOLIDTOP), GOLDEN_NINE)).toBe(true);
    expect(eqVals(setVals(ROOM_BLOCK_SOLIDTOP), setVals(VAN_TILE_SOLID_EXTRA))).toBe(true);
  });
  it('vanilla-tilecollision.json solidTop 总量=84（JSON 面本体防截断）', () => {
    const tc = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-tilecollision.json'), 'utf8')) as {
      tiles: Array<{ id: number; solid: boolean; solidTop: boolean }>;
    };
    const solidTop = tc.tiles.filter((t) => t.solidTop).map((t) => t.id);
    expect(solidTop.length).toBe(84);
    expect(eqVals(solidTop.sort((a, b) => a - b), setVals(SOLID_TOP_SHEETS))).toBe(true);
  });
});

// ★BJ187 批四变异证红记录（2026-09-19,均在验证后还原）：
//   M1 MicroBiomesPass PLACE2X2_TABLE 回绑旧 76 项字面（复现漏臂病灶）→ §A 结构锁两红
//      （stale 签名命中+alias 缺席）;
//   M2 DungeonPass TILE_TABLE_D 回绑旧 76 项 .map(dgTileOfSheet) 字面 → §A 结构锁两红;
//   M3 TILE_TABLE_IDS 镜像错域回退 new Set(TILE_TABLE_SHEETS)（sheet 裸值顶替）→ §A 镜像
//      两红（size 81 恰好同数但 legacy 平移比对+域封闭断言双红）;
//   M4 TouchDamage TILE_SOLID_TOP_FAMILY 回绑旧字面 → §B 结构锁两红;
//   M5 FallingBlock TILE_SOLID_TOP_SHEETS 回绑旧字面 → §B 结构锁两红;
//   M6 TeleportSpotCheck PLATFORM_FAMILY_LUT 回绑旧字面 → §B 结构锁两红;
//   M7 VAN_TILE_SOLID_EXTRA 摘 436（回退循环臂病灶）→ §B 权威金标红+vanTileSolid(436)
//      探针红+§C Housing pin 红（九件套权威联动）;
//   M8 vanilla-journeycat.json tileSolidTop 删键 16 → §C journeycat pin 红（双向差集）;
//   M9 Housing ROOM_BLOCK_SOLIDTOP 派生加 !t.solid 反条件 → §B 探针 435 支撑红+§C pin 红。
