// AI_003 战士凹槽卡死双修回归（2026-08-25 用户报"两只僵尸卡在地形不动弹"，
// debug-report-…04-00-25 现场重放定罪）：
//   ① flag5 地面扫描门（NPC.cs:60213-60255 + :60412 `if (flag5)`）：跳跃四级/
//      卡死小跳/专家跳扑/攻门整段被"脚下+7px 有地 && 头上-9px 净空"门住——
//      曾缺此门，磕檐后 vy===0 被磕檐本身满足 + vxSign 取碰撞前值 → 每 tick
//      重新起跳 -8 → 永久钉死天花板（重放 t16 起 y/hitHead/vy 三量 900t 恒定）。
//   ② 游荡转向计数（:57783-57797）：原版 vx≠0 才清零、vx==0&&vy≠0（空中未移动）
//      计数【保持】——曾误加内层 else 清零，贴墙跳循环每周期被空中 tick 归零，
//      卡死计数满（ai3≥60）后永不转向 = 永不出槽。
//   现场地形（报告 areaCamera 解码）：左墙 1 列 6 高 + 头顶石檐 + 4 宽土台 +
//   右侧悬空；僵尸 18×40 恰卡檐下 24px 跳跃窗。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeGame(): GameHooks {
  const world = new World(96, 64, 13, 'fighter-notch');
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world, player: null, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

/** 报告同构凹槽：地板 row32（cols 40-43 土）、左墙 col39 rows26-31（石）、
 *  石檐 row27 cols40-41；僵尸 18×40 落 32 顶=脚 512，头顶 472 恰贴檐底 432+40 */
function buildNotch(w: World): void {
  const st = w.store;
  const DIRT = 1, STONE = 2;
  for (let x = 39; x <= 43; x++) st.setTileSilent(x, 32, DIRT, 0, 0);   // 地板
  for (let y = 26; y <= 31; y++) st.setTileSilent(39, y, STONE, 0, 0);  // 左墙
  st.setTileSilent(40, 27, STONE, 0, 0);                                 // 石檐
  st.setTileSilent(41, 27, STONE, 0, 0);
}

describe('AI_003 战士凹槽卡死双修（flag5 扫描门 + 游荡计数保持）', () => {
  it('① 不再钉死天花板：120t 内不存在 ≥60t 的 y 恒定+vy=-8+hitHead 冻结窗', () => {
    const game = makeGame();
    buildNotch(game.world);
    const z = Enemy.fromVanilla(3, 40 * 16 + 9, 30 * 16 + 12);
    if (!z) throw new Error('zombie 构造失败');
    // 玩家在左上（引其向左撞墙跳）
    const player = { x: 36 * 16, y: 24 * 16, w: 20, h: 42, cx: 36.5 * 16, cy: 25 * 16, dead: false };
    (game as { player: unknown }).player = player;
    let frozenRun = 0, maxFrozen = 0, lastY = -1;
    for (let t = 0; t < 120; t++) {
      z.fixedUpdate(1 / 60, game);
      if (z.y === lastY && z.vy === -8 && !z.onGround) frozenRun++;
      else frozenRun = 0;
      maxFrozen = Math.max(maxFrozen, frozenRun);
      lastY = z.y;
    }
    expect(maxFrozen).toBeLessThan(60);   // 修前=900t 恒钉（重放实测）
  });

  it('② 卡死计数满后转向：ai3≥60 游荡态 200t 内 facing 必翻转（曾恒 -1）', () => {
    const game = makeGame();
    buildNotch(game.world);
    const z = Enemy.fromVanilla(3, 40 * 16 + 9, 30 * 16 + 12);
    if (!z) throw new Error('zombie 构造失败');
    const player = { x: 36 * 16, y: 24 * 16, w: 20, h: 42, cx: 36.5 * 16, cy: 25 * 16, dead: false };
    (game as { player: unknown }).player = player;
    let flipped = false;
    for (let t = 0; t < 200; t++) {
      z.fixedUpdate(1 / 60, game);
      if (z.facing === 1) { flipped = true; break; }
    }
    expect(flipped).toBe(true);
  });

  it('③ 逃逸：600t 内离开凹槽（x 越过左墙或 y 离开槽带）', () => {
    const game = makeGame();
    buildNotch(game.world);
    const z = Enemy.fromVanilla(3, 40 * 16 + 9, 30 * 16 + 12);
    if (!z) throw new Error('zombie 构造失败');
    const player = { x: 36 * 16, y: 24 * 16, w: 20, h: 42, cx: 36.5 * 16, cy: 25 * 16, dead: false };
    (game as { player: unknown }).player = player;
    let escaped = false;
    for (let t = 0; t < 600; t++) {
      z.fixedUpdate(1 / 60, game);
      const tx = Math.floor((z.x + z.w / 2) / 16);
      if (tx < 39 || tx > 43 || z.y > 33 * 16) { escaped = true; break; }
    }
    expect(escaped).toBe(true);
  });
});
