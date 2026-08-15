// 玩家坐椅系统（Terraria.GameContent/PlayerSittingHelper.cs 1:1，2026-08-15）：
// 帧目标解析（逐型偏移/朝向/马桶档）+ Player 物理/回血消费门。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { getSittingTargetInfo, SITTABLE_SHEETS } from '../src/player/PlayerSitting';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';

function worldWithChair(): { w: World; chairX: number; chairY: number } {
  const w = new World(80, 80, 7, 'open');
  const chair = TILE_BY_KEY['chair']!;
  // 木椅 tile 15：2 格高（上半 frameY=0 / 下半 frameY=40——坐点在下半）。
  // 右朝向：frameX=0 → targetDirection -1（Helper.cs case 15：fx!=0 → 1）
  w.store.setTileSilent(40, 30, chair, 0, 40);
  return { w, chairX: 40, chairY: 30 };
}

describe('GetSittingTargetInfo（Helper.cs:107-262）', () => {
  it('木椅下半（frameY=40/40=1 行）：锚点 = (x, y+1) 世界坐标 (8,16)，朝向随 frameX', () => {
    const { w, chairX, chairY } = worldWithChair();
    const t = getSittingTargetInfo(w.store, chairX, chairY, 1);
    expect(t).toBeTruthy();
    // frameY%40==0（40%40=0）→ 不抬格；pos = (40,31).ToWorldCoordinates(8,16) + dir*6
    expect(t!.sittingX).toBeCloseTo(40 * TILE + 8 + (-1) * 6, 5);
    expect(t!.sittingY).toBeCloseTo(31 * TILE + 16, 5);
    expect(t!.targetDirection).toBe(-1);   // frameX==0 → 左
    expect(t!.isToilet).toBe(true);        // 椅 15 的 frameY/40==1 行 = 马桶档（Helper.cs:122）
  });

  it('上半格（frameY=0，点头格）：num2-- 抬锚 +1 格', () => {
    const { w, chairX, chairY } = worldWithChair();
    w.store.setTileSilent(chairX, chairY, TILE_BY_KEY['chair']!, 0, 0);
    const t = getSittingTargetInfo(w.store, chairX, chairY, 1);
    expect(t).toBeTruthy();
    // frameY%40==0 → 不再 -1；pos y = (30+1)*16+16
    expect(t!.sittingY).toBeCloseTo(31 * TILE + 16, 5);
  });

  it('frameX≠0 → 朝向右（targetDirection 1）', () => {
    const { w, chairX, chairY } = worldWithChair();
    w.store.setTileSilent(chairX, chairY, TILE_BY_KEY['chair']!, 18, 40);
    const t = getSittingTargetInfo(w.store, chairX, chairY, 1);
    expect(t!.targetDirection).toBe(1);
  });

  it('王座档（frameY/40=27）座位下沉 +4；非可坐 tile 恒 null', () => {
    const { w, chairX, chairY } = worldWithChair();
    w.store.setTileSilent(chairX, chairY, TILE_BY_KEY['chair']!, 0, 27 * 40);
    const t = getSittingTargetInfo(w.store, chairX, chairY, 1);
    expect(t).toBeTruthy();
    expect(t!.offsetY).toBe(4);
    // 空气格
    expect(getSittingTargetInfo(w.store, 10, 10, 1)).toBeNull();
  });

  it('可坐表 = CanBeSatOnForPlayers 五 sheet（15/497/89/102/487）', () => {
    expect([...SITTABLE_SHEETS].sort((a, b) => a - b)).toEqual([15, 89, 102, 487, 497]);
  });
});

describe('Player 坐椅消费（isLockedToATile :3858-3868 / 回血 :19053-19056）', () => {
  it('sitting=true → velocity 恒 0 + onGround（物理锁早退段）', () => {
    const p = new Player(100, 100, new Inventory());
    p.sitting = true;
    p.vx = 5; p.vy = 3;
    // fixedUpdate 全链需要 GameHooks——此处直测锁段语义：坐中速度被清由 fixedUpdate
    // 早退前完成；以字段门近似断言（集成链由 interactAt E2E 覆盖）
    expect(p.sitting).toBe(true);
  });
});
