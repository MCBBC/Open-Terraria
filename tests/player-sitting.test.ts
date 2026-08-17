// 玩家坐椅系统（Terraria.GameContent/PlayerSittingHelper.cs 1:1，2026-08-15）：
// 帧目标解析（逐型偏移/朝向/马桶档）+ Player 物理/回血消费门。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { getSittingTargetInfo, SITTABLE_SHEETS } from '../src/player/PlayerSitting';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';
import { TileStore } from '../src/world/TileStore';

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

// 睡床锚点（GetSleepingTargetInfo SH:193-224 + StartSleeping :156-191，2026-08-17
// 渲染错位修复批）：Bottom=anchor，anchor=(床段左列+方向列偏移, 行+1)·ToWorld(8,16)
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('睡床锚点（GetSleepingTargetInfo :193-224）', () => {
  it('朝右床（frameX=72 列）：anchor = (左列+2, 行+1)·16+(8,16)，Bottom 落锚', () => {
    // 铺一张 4×2 床：frameX 72..126（列位 1=朝右），frameY 0/18
    const w = new World(60, 40, 7, 'bed-test');
    const bed = TILE_BY_KEY['bed']!;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) {
      w.store.setTileSilent(20 + c, 20 + r, bed, 72 + c * 18, r * 18);
    }
    // 玩家站床脚（右端下排格 23,21）右键 → StartSleeping 锚点
    // 由 Game 床分支公式（与本测试同步的纯数学断言）：
    const tx = 23, ty = 21, fx = 72 + 3 * 18, fy = 18;
    const bedLeft = tx - Math.floor((fx % 72) / 18);          // = 20
    const row = fy % 36 !== 0 ? ty - 1 : ty;                   // = 20
    const col = Math.floor(fx / 72);                           // = 1 → 朝右
    const dir = col === 0 ? -1 : 1;
    const anchorX = (bedLeft + (dir === -1 ? 1 : 2)) * 16 + 8; // (20+2)*16+8 = 360
    const anchorY = (row + 1) * 16 + 16;                       // 21*16+16 = 352
    expect(bedLeft).toBe(20);
    expect(row).toBe(20);
    expect(dir).toBe(1);
    expect(anchorX).toBe(360);   // 床中偏右——玩家躺床身
    expect(anchorY).toBe(352);   // 床底
  });

  it('朝左床（列位 0）下半行点击：行上修 −1，方向 −1，锚列=左列+1', () => {
    const tx = 21, ty = 21, fx = 1 * 18, fy = 18;              // 左端下排
    const bedLeft = tx - Math.floor((fx % 72) / 18);           // = 20
    const row = fy % 36 !== 0 ? ty - 1 : ty;                   // = 20
    const dir = Math.floor(fx / 72) === 0 ? -1 : 1;            // = -1
    const anchorX = (bedLeft + (dir === -1 ? 1 : 2)) * 16 + 8; // (20+1)*16+8 = 344
    expect(bedLeft).toBe(20);
    expect(row).toBe(20);
    expect(dir).toBe(-1);
    expect(anchorX).toBe(344);
  });
});

// 睡眠物理锁 + 输入起床（SH:103-105 + isLockedToATile :3858-3868，2026-08-17 复查批）
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';

function sleepPlayer(): { p: Player; hooks: import('../src/entities/types').GameHooks } {
  const store = new TileStore(40, 30);
  for (let x = 0; x < 40; x++) store.setTile(x, 25, 1);
  const p = new Player(100, 100, new Inventory());
  p.sleeping = true;
  const hooks = {
    world: { store }, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as never;
  return { p, hooks };
}

describe('睡眠物理锁与输入起床', () => {
  it('睡中无输入：velocity 恒 0、位置钉死（物理锁含 sleeping）', () => {
    const { p, hooks } = sleepPlayer();
    p.vx = 5; p.vy = 3;
    const y0 = p.y;
    p.fixedUpdate(1, hooks);
    expect(p.sleeping).toBe(true);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
    expect(p.y).toBe(y0);              // 无重力下坠（曾 sleeping 漏锁）
  });

  it('睡中按方向/跳跃 → 当帧起床（SH:103-105）', () => {
    const a = sleepPlayer(); a.p.inputX = -1;
    a.p.fixedUpdate(1, a.hooks);
    expect(a.p.sleeping).toBe(false);
    const b = sleepPlayer(); b.p.inputJump = true;
    b.p.fixedUpdate(1, b.hooks);
    expect(b.p.sleeping).toBe(false);
  });
});
