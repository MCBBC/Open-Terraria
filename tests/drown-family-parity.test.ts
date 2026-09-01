// 蓝队六轮批 F1+F4 回归（2026-09-01）：
//  F1  TILE_SOLID_TOP_FAMILY 四件套→九件套（Main.cs:10126-10136 对 435-439 团队平台
//      五色同批 tileSolidTop+tileSolid,TileID.cs:1307-1315）——九件断言 + 潜伏场景
//      模拟（临时置 solid:true 走 DrownCollision 豁免判定位,验证 solidTop 反豁免
//      不误放行=带液计水）。
//  F4  DrownCollision 三副本归一（TownNPC 本地副本退役 → stats/TouchDamage 单源）：
//      ①致动实心头顶不淹（L1 纯在场口径）;②includeSlopes 坡面/半砖计水两港对照
//      （NPC.cs:54361/:54285 传 true）;③中心项 C# 整数除（奇宽/奇高 0.5px 边界）。
// 几何标定（w=20,h=42 体 @160,320,gravDir=1）：探针 [165,175]×[318,330],扫描首行
// j0=19=豁免行;液格 (10,19) 带 [304.06,320.06] 与探针相交。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { drownCollision } from '../src/stats/TouchDamage';
import { drownCollision as townDrown } from '../src/entities/TownNPC';

const W = 60, H = 160;

/** TouchDamage.BY_SHEET 同式：sheet → 首个 v_ 内部 id */
const idBySheet = (sheet: number): number => {
  for (let i = 1; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === sheet) return i;
  return -1;
};

/** 平台行为族九件套（vanilla sheet id）——TouchDamage TILE_SOLID_TOP_FAMILY 同源 */
const FAMILY_SHEETS = [19, 239, 380, 427, 435, 436, 437, 438, 439];

function mk(): TileStore {
  const st = new TileStore(W, H);
  return st;
}

/** 标定态：(10,19)（扫描首行=豁免行）放 tile + 满液格 */
function seedHeadRowLiquid(st: TileStore, id: number): void {
  st.setTileSilent(10, 19, id);
  st.liquid[st.idx(10, 19)] = 255;
  st.liquidType[st.idx(10, 19)] = 1;
}

// =====================================================================
// F1：TILE_SOLID_TOP_FAMILY 九件套
// =====================================================================
describe('★F1 平台行为族九件套（Main.cs:10126-10136 / TileID.cs:1307-1315）', () => {
  it('九件断言：sheets 19/239/380/427/435-439 在 TILE_DEFS 全部可解析（非死映射）', () => {
    for (const sheet of FAMILY_SHEETS) {
      const id = idBySheet(sheet);
      expect(id, `sheet ${sheet} 须有 TILE_DEFS 定义`).toBeGreaterThan(0);
    }
    // 团队平台五色的内部 id 互异且与四件套不重叠
    const ids = FAMILY_SHEETS.map(idBySheet);
    expect(new Set(ids).size).toBe(9);
  });

  it('潜伏场景模拟：临时置 solid:true 走豁免判定位——九件全为 solidTop 反豁免（带液计水,不误放行）', () => {
    for (const sheet of FAMILY_SHEETS) {
      const id = idBySheet(sheet);
      const st = mk();
      seedHeadRowLiquid(st, id);
      const def = TILE_DEFS[id]!;
      const saved = def.solid;
      try {
        def.solid = true;   // 潜伏雷引爆：按原版 Main.cs 把该平台 tileSolid 改真
        // 豁免行判定位 = active && tileSolid && !tileSolidTop && !(includeSlopes&&blockType)
        // ——族内件 tileSolidTop=true ⇒ 反豁免 ⇒ 该行液体计水 → 淹（true）。
        // 若九件表缺件,此处会误判豁免返回 false（红队 F1 定义的失效形态）。
        expect(drownCollision(st, 160, 320, 20, 42, 1), `sheet ${sheet} solid:true 应计水`).toBe(true);
      } finally {
        def.solid = saved;  // 还原数据面,零残留
      }
      // 复位后（solid:false 现口径）同样计水——豁免门要求 solid 先行成立
      expect(drownCollision(st, 160, 320, 20, 42, 1)).toBe(true);
    }
  });

  it('对照组：非族实心（dirt）在豁免行照常豁免——证明上组断言走的是族表分支而非豁免失效', () => {
    const st = mk();
    seedHeadRowLiquid(st, TILE_BY_KEY['dirt']!);
    expect(drownCollision(st, 160, 320, 20, 42, 1)).toBe(false);
  });
});

// =====================================================================
// F4：DrownCollision 归一（单源 stats/TouchDamage）
// =====================================================================
describe('★F4① 归一：TownNPC 端口 = TouchDamage 同一函数对象', () => {
  it('re-export 恒等（旧本地副本退役,无第二实现可漂移）', () => {
    expect(townDrown).toBe(drownCollision);
  });
});

describe('★F4① 致动实心头顶不淹（L1 纯在场口径,豁免行无 inActive 检查）', () => {
  it('致动 dirt 头顶带液 → 不计水（旧 st.isSolid 致动闸形态会误判淹）', () => {
    const st = mk();
    seedHeadRowLiquid(st, TILE_BY_KEY['dirt']!);
    st.setActuated(10, 19, true);
    expect(drownCollision(st, 160, 320, 20, 42, 1)).toBe(false);
    // 非致动对照：同样豁免（豁免行实心排除）
    st.setActuated(10, 19, false);
    expect(drownCollision(st, 160, 320, 20, 42, 1)).toBe(false);
  });
});

describe('★F4② includeSlopes 坡面/半砖带液计水（NPC.cs:54361 flag21 / :54285 传 true）', () => {
  it('坡面（slope=2）：false 豁免 / true 计水（两港对照）', () => {
    const st = mk();
    seedHeadRowLiquid(st, TILE_BY_KEY['dirt']!);
    st.setSlope(10, 19, 2);
    expect(drownCollision(st, 160, 320, 20, 42, 1, false)).toBe(false);
    expect(drownCollision(st, 160, 320, 20, 42, 1, true)).toBe(true);
    expect(townDrown(st, 160, 320, 20, 42, 1, true)).toBe(true);   // TownNPC 港同判
  });

  it('半砖（halfBrick）：blockType()=1 同臂——false 豁免 / true 计水', () => {
    const st = mk();
    seedHeadRowLiquid(st, TILE_BY_KEY['dirt']!);
    st.setHalfBrick(10, 19, true);
    expect(drownCollision(st, 160, 320, 20, 42, 1, false)).toBe(false);
    expect(drownCollision(st, 160, 320, 20, 42, 1, true)).toBe(true);
  });
});

describe('★F4③ 中心项 C# 整数除（Collision.cs:1387/:1394/:1397 (float)(Width/2) 族）', () => {
  it('奇宽城镇体（w=21）：探针右缘=tile 左缘的 0.5px 边界——截断口径不计水', () => {
    const st = mk();
    seedHeadRowLiquid(st, TILE_BY_KEY['dirt']!);
    // x=145：trunc 探针 [150,160] → 160>160 不成立 = 不淹（浮点错版 [150.5,160.5] 误判淹）
    expect(drownCollision(st, 145, 311, 21, 42, 1)).toBe(false);
    // x=146：探针 [151,161] → 真相交 = 淹
    expect(drownCollision(st, 146, 311, 21, 42, 1)).toBe(true);
  });

  it('奇高玩家档（h=21,gravDir=-1）：Height/2 整数除——探针底=液面底的 0.5px 边界计水', () => {
    const st = mk();
    seedHeadRowLiquid(st, TILE_BY_KEY['dirt']!);
    // y=318：trunc vy=318−2+10−6=320 → 探针 [320,332] vs 带 [304.06,320.06]：320<320.06 = 淹
    //（浮点错版 vy=320.5 → 320.5<320.06 不成立 = 漏判）
    expect(drownCollision(st, 155, 318, 20, 21, -1)).toBe(true);
  });
});
