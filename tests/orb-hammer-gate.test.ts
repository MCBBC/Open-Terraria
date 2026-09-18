// 暗影珠/猩红之心 工具门回归（2026-09-02 用户实报：镐能砸暗影珠）：
// 原版 Main.tileHammer 全表 = {26, 695, 31, 696}（Main.cs:7343-7346，猩红之心=tile 31
// 的 frameX≥36 样式，AddShadowOrb WorldGen.cs:32384 无独立 tile id）。分派次序
// tileHammer→tileAxe→pick（Player.cs:46052-46166 ItemCheck_UseMiningTools_ActuallyUseMiningTool）：
//   - 镐/斧打 tileHammer 格 = 整支无动作（无音无尘无积累）——此前 31/695/696 缺路由，
//     落通用镐支直接挖碎（26 祭坛早有特支）；
//   - 锤任意锤力>0 逐击累积 ≥100 → KillTile（祭坛外无反噬门，:46062 仅 tile.type==26）；
//   - PickTile 直调通道（钻头坐骑 Mount.cs:3115 / 挖地龟 petPickTile）无 tileHammer 门
//     = 镐力可入（DCU 钻碎珠为原版铁则）→ toolMatchesTile 的 drillMount 豁免。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS, TILE_HAMMER_SHEETS } from '../src/data/tiles';   // ★BJ158② 单源迁移（旧从 Game 导出）

/** Game.toolMatchesTile（private 但无 this 依赖——原型侧借调） */
const toolMatchesTile = (type: number, toolType: 'pick' | 'axe' | 'hammer', drillMount = false): boolean =>
  (Game.prototype as unknown as {
    toolMatchesTile: (type: number, toolType: string, drillMount?: boolean) => boolean;
  }).toolMatchesTile.call(null, type, toolType, drillMount);

describe('tileHammer 族权威表（Main.cs:7343-7346）', () => {
  it('全表仅 {26, 695, 31, 696}，多一件少一件都算漂移', () => {
    expect([...TILE_HAMMER_SHEETS].sort((a, b) => a - b)).toEqual([26, 31, 695, 696]);
  });

  it('同族排除项不误伤：神庙祭坛 237/叶簇等不在 tileHammer（镐 210 档可挖）', () => {
    expect(TILE_HAMMER_SHEETS.has(237)).toBe(false);
    expect(TILE_DEFS[TILE_BY_KEY['v_237_lihzahrd_altar']].pick).toBe(210); // GetPickaxeDamage :54585
  });
});

describe('暗影珠/猩红之心（tile 31）分派门', () => {
  const ORB = TILE_BY_KEY['v_31_orb_heart'];

  it('镐/斧 = 无动作（toolMatchesTile 拒入——实报 bug 根因回归锚）', () => {
    expect(toolMatchesTile(ORB, 'pick')).toBe(false);
    expect(toolMatchesTile(ORB, 'axe')).toBe(false);
  });

  it('钻头坐骑/挖地龟 PickTile 直调豁免（DCU 钻碎珠）', () => {
    expect(toolMatchesTile(ORB, 'pick', true)).toBe(true);
  });

  it('数据面 pick 档保持 0（镐力门槛不在数据侧，门在分派）', () => {
    expect(TILE_DEFS[ORB].pick).toBe(0);
  });
});

describe('恶魔/猩红祭坛（tile 26）分派门', () => {
  const ALTAR = TILE_BY_KEY['v_26_altars'];

  it('手持镐拒入；drill 谓词豁免（PickTile 直调语义）但祭坛拦截在 tryMine 特支（空转位）', () => {
    expect(toolMatchesTile(ALTAR, 'pick')).toBe(false);
    // ★SW-FX8 D-12：drill 臂前置=原版 PickTile（Player.cs:54398）头无分派门——
    // 谓词对 (祭坛, drill) 现按直调语义返回 true（注释"可钻珠祭坛"=原版铁则）。
    // 但该答案在实链【空转】：tryMine 祭坛特支（Game.ts,先于 :19077 通用镐支）
    // 对镐/钻/锤三路各自 return——非困难反噬半血 / 困难内联 PickTile 累积 → smashAltar。
    // 谓词不再承载祭坛拦截职责（行为面由祭坛特支测试承载）。
    expect(toolMatchesTile(ALTAR, 'pick', true)).toBe(true);
    expect(TILE_DEFS[ALTAR].pick).toBe(-1); // 手持镐被 d.pick<0 双保险
  });
});

describe('普通格不受伤', () => {
  it('泥土镐可挖（drill 前后一致）、仙人掌斧族镐仍拒', () => {
    expect(toolMatchesTile(TILE_BY_KEY['dirt'], 'pick')).toBe(true);
    expect(toolMatchesTile(TILE_BY_KEY['dirt'], 'pick', true)).toBe(true);
    expect(toolMatchesTile(TILE_BY_KEY['v_80_cactus'], 'pick')).toBe(false);
  });
});
