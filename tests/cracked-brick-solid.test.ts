// 裂砖 481-483 运行期【实心】——生成期翻转是临时的，终态被整表还原。
// 机制链（WorldGen.cs）：
//   Reset() :11128  tileSolidBackup = Main.tileSolid.Clone()（克隆 Main.cs 初始表）
//   → 生成期各翻转：SmoothWorld :16510 SetCrackedBrickSolidity(true)（平滑扫描要实心）
//     / :16695 SetCrackedBrickSolidity(false)（Waterfalls 前的 pass）/ DungeonCrawler.cs:344
//   → generateWorld 的 finally :11108 RestoreTemporaryStateChanges() :22678-22684
//     Array.Copy(backup → Main.tileSolid) —— 整表还原到 Main.cs 初始值
//   Main.cs :7865-7869 tileSolid[481/482/483] = true（初始=终态）
// ⇒ 运行时裂砖实心（挡路、易碎快挖——原版语义即"挖穿"而非"穿行"）。
// 曾按 :16695 的临时翻转误判为非实心并改 tiles.ts solid=false（走廊堵路"修复"
// 方向错误），2026-08-14 通行性全量对账（vanilla-tilecollision.json）纠正。
import { describe, it, expect } from 'vitest';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

describe('裂砖实心（Main.cs 初始=终态；生成期翻转被 tileSolidBackup 还原）', () => {
  it('481/482/483 solid=true（蓝/绿/粉三主题裂砖）', () => {
    for (const k of ['v_481_cracked_blue_brick', 'v_482_cracked_green_brick', 'v_483_cracked_pink_brick']) {
      expect(TILE_DEFS[TILE_BY_KEY[k]!].solid, k).toBe(true);
    }
  });
});
