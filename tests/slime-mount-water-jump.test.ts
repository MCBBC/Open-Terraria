// 史莱姆坐骑出水起跳完整链回归（★D2，2026-08-31 清零批二波）：
//   JumpMovement 干门（1457 Player.cs:20845）`(sliding||vy==0)|flag || … ||
//   (flag2&flag3)` ——flag = controlJump 头部湿史莱姆清零帧置真（:20813-20818），
//   flag2&flag3 = wet∧accFlipper ∧ 非矿车。旧近似只认 vy==0/脚蹼 ⇒ 水中任意 vy
//   按跳无法起跳；本批把 justClearedWetSlime 并入水下起跳门（Player.ts water 分支）。
//   集成位走真实 Player.fixedUpdate（makeLandHooks 精简桩，同 mount-combat R3 口径）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';

/** 真实 Player 最小钩桩 */
function makeHooks(w: World) {
  return {
    world: w, player: null as unknown,
    enemies: () => [], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    addDamageNumber: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    notifyInventoryChanged: () => {}, onEnemyKilled: () => {},
    spawnEnemy: () => {}, cutTile: () => {},
  } as never as Parameters<import('../src/entities/Player').Player['fixedUpdate']>[1];
}

async function makePlayer(xTile = 21, yTile = 99) {
  const { Player } = await import('../src/entities/Player');
  const { Inventory } = await import('../src/items/Inventory');
  return new Player(xTile * 16, yTile * 16, new Inventory());
}

/** 水池：y=96..102 水列（x 14..28），池底 103 实心。
 *  ★世界高 180——底部 offLimit 带（hPx−640）之上的深层水域才可活（越界=直死） */
function fillPool(w: World) {
  for (let x = 14; x <= 28; x++) w.store.setTileSilent(x, 103, 1, 0, 0);
  for (let y = 96; y <= 102; y++) {
    for (let x = 14; x <= 28; x++) w.store.setLiquid(x, y, 200, 0);
  }
}

describe('D2 史莱姆坐骑水中起跳门（justClearedWetSlime ≡ JumpMovement flag 支）', () => {
  it('骑史莱姆坐骑 + 湿残余按跳：清湿帧即起跳（湿段参数档 −6.01、jumpHold 置位）', async () => {
    const w = new World(60, 180, 44, 'd2a');
    fillPool(w);
    const game = makeHooks(w);
    const p = await makePlayer();
    for (let i = 0; i < 10; i++) p.fixedUpdate(1 / 60, game);      // 入水稳定
    expect(p.inWater).toBe(true);

    p.mount.active = true;
    p.mount.type = 3;                              // SlimySaddle
    p.wetSlime = 30;

    p.inputJump = false;
    p.fixedUpdate(1 / 60, game);                   // 无按键帧不触发清湿跳
    p.inputJump = true;                            // 边沿帧 ≡ releaseJump
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeLessThan(-4);                 // 起跳速度写入（wet 档 −6.01；同帧受水阻/重力积分回摆 −5.8±）
    expect(p.jumpHold).toBeGreaterThan(0);
  }, 30000);

  it('无坐骑且未踩底：同门不放行（清湿旗只属坐骑链，近似不被外提扩权）', async () => {
    const w = new World(60, 180, 45, 'd2b');
    fillPool(w);
    const game = makeHooks(w);
    const p = await makePlayer();
    for (let i = 0; i < 10; i++) p.fixedUpdate(1 / 60, game);      // 沉入水中踩底前后的中间态不可靠，
    expect(p.inWater).toBe(true);                                   // 用「已入水」作门面锚即可

    // 人造悬停态：水中非脚蹼、非落地、非清湿帧 —— 门应拒绝起跳
    p.onGround = false;
    p.wetSlime = 0;
    p.inputJump = true;
    p.jumpEdgePrev = false;
    p.fixedUpdate(1 / 60, game);
    // 未踩底(vy≠0)/无脚蹼 ⇒ 本帧不应出现 −5.9 以上的干起跳速度写入（vy 只受浮力档缓动）
    expect(p.vy).toBeGreaterThan(-5.9);
  }, 30000);
});

// ---------------------------------------------------------------------------
// ★附带① 出水截跳限高（Player.cs:28074）：wet 翻转帧 `if (jump > jumpHeight/5 &&
//   wetSlime==0) jump = jumpHeight/5` ——对当帧（含新起跳预算）剩余 jumpHold 截到
//   ⌊cap/5⌋；骑史莱姆湿态豁免。真实 Player.fixedUpdate 驱动。
// ---------------------------------------------------------------------------
describe('附带① 出水截跳限高', () => {
  /** 浅水池（水行 101..102 两行，池底 103 实心）——水下上跃在预算耗尽前即出水面 */
  function fillShallowPool(w: World) {
    for (let x = 14; x <= 28; x++) w.store.setTileSilent(x, 103, 1, 0, 0);
    for (let y = 101; y <= 102; y++) {
      for (let x = 14; x <= 28; x++) w.store.setLiquid(x, y, 200, 0);
    }
  }

  it('持键从水下上跃冲出水面：出水帧剩余 jumpHold 被截到 ⌊30/5⌋=6', async () => {
    const w = new World(60, 180, 44, 'clip-a');
    fillShallowPool(w);
    const game = makeHooks(w);
    const p = await makePlayer(21, 103 * 64 / 16 - 42 >= 0 ? 1655 / 16 : 99);   // 脚贴池底（170 太深,直接算 px）
    p.x = 21 * 16;
    p.y = 103 * 16 - p.h;
    p.fixedUpdate(1 / 60, game);
    expect(p.inWater).toBe(true);
    // 水下踩底按跳（边沿帧）：湿态水中档 jumpHold=30
    p.inputJump = false;
    p.fixedUpdate(1 / 60, game);
    p.inputJump = true;
    p.fixedUpdate(1 / 60, game);
    expect(p.jumpHold).toBeGreaterThan(6);            // 预算满档在手
    let clippedAt = -1;
    for (let i = 0; i < 60; i++) {
      p.fixedUpdate(1 / 60, game);
      if (!p.inWater && p.jumpHold > 0) {             // 离开水面首帧
        clippedAt = p.jumpHold;
        break;
      }
    }
    expect(clippedAt).toBeGreaterThan(-1);
    expect(clippedAt).toBeLessThanOrEqual(Math.floor(30 / 5));   // :28074 截断
  }, 30000);

  it('陆上常规跳跃不受截断影响（对照：无出水事件时满档保持）', async () => {
    const w = new World(60, 180, 44, 'clip-b');
    const game = makeHooks(w);
    const { Player } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    for (let x = 14; x <= 28; x++) w.store.setTileSilent(x, 170, 1, 0, 0);   // 干地实心带
    const p = new Player(21 * 16, 170 * 16 - 42, new Inventory());
    p.fixedUpdate(1 / 60, game);                      // 贴地稳定态
    p.inputJump = false;
    p.fixedUpdate(1 / 60, game);
    p.inputJump = true;
    p.fixedUpdate(1 / 60, game);                      // 干地起跳
    expect(p.jumpHold).toBeGreaterThan(6);            // 未发生 wet→false，无截断
  });
});
