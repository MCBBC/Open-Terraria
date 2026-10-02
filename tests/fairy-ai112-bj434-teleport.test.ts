// BJ434 仙灵「指路瞬移」定谳判别（2026-10-02）:
//  病灶①= 状态 3/5 旧「绕宝箱绝对点直写速度」——velocity = 绝对目标点 − 当前位置,
//    寻箱窗 ±75×±50 格 → 单帧差值可达 ~1200px,noTileCollide 下逐帧跳位=用户实报瞬移。
//    原版判别锚:AI_112 状态 3/5 velocity = GetFairyCircleOffset(t+Δ)−GetFairyCircleOffset(t)
//    纯相对增量,|v| ≤ 2π·22/65 ≈ 2.127 px/tick（NPC.cs:48726-48727 / :49081-49083 /
//    :49231-49235 亲读）;圆舞绕【入态身位】,不定位宝箱。
//  病灶②= noTileCollide 置旗但 moveAndCollide 只读 tileCollide → 引导态仍撞墙,
//    穿墙引导名存实亡（原版 noTileCollide=position += velocity 直积分）。
//  病灶③= 状态 4 等待臂总速钳 6（原版钳 1,cs:48805）+ 到达盒 80×80（原版 5×5px,
//    cs:48774）+ 状态 6 宝箱重搜 150t 节流（原版逐 tick,cs:48917-48923）。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

function makeGame(): GameHooks {
  const world = new World(96, 48, 7, 'bj434');
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

const drive = (e: Enemy, g: GameHooks, p: Player | null) =>
  (e as unknown as Record<string, (g: GameHooks, p: Player | null) => void>).fairyAI.call(e, g, p);

function mkPlayer(x: number, y: number): Player {
  return { x, y, w: 20, h: 42, cx: x + 10, cy: y + 21, dead: false, vx: 0, vy: 0 } as unknown as Player;
}

function mkFairy(id: 583 | 584 | 585, tx = 40, ty = 20): Enemy {
  const e = Enemy.fromVanilla(id, tx * 16, ty * 16);
  if (!e) throw new Error(`fairy ${id} 构造失败`);
  return e;
}

describe('BJ434 AI_112 仙灵瞬移判别', () => {
  it('A 状态 3 起舞=相对增量小圆舞:|v|≤2.3px/tick、总位移绕入态身位 ≤60px', () => {
    const g = makeGame();
    const f = mkFairy(583);
    const x0 = f.x, y0 = f.y;
    f.ai2 = 3; f.ai3 = 16;                       // 舞段首 tick（≤15 为收势减速）
    f.ai0 = 90; f.ai1 = 20;                      // 宝箱格距 800px——旧实装 |v|≈800px/tick
    f.fairyDanceDir = 1;
    drive(f, g, null);
    const spd = Math.hypot(f.vx, f.vy);
    expect(spd).toBeLessThanOrEqual(2.3);        // 原版 ≤2π·22/65≈2.127（Y 幅 14 档更小）
    // 连续 64 tick 舞步:逐帧位移 ≤3.5px 且总位移绕入态身位（原版 offset 值域
    // X ±6 / Y [−2h,0],h≤22 → 全程不出入态身位 60px 球）
    let maxStep = 0;
    for (let t = 0; t < 64; t++) {
      const px = f.x, py = f.y;
      drive(f, g, null);
      maxStep = Math.max(maxStep, Math.hypot(f.x - px, f.y - py));
    }
    expect(maxStep).toBeLessThanOrEqual(3.5);
    expect(Math.hypot(f.x - x0, f.y - y0)).toBeLessThanOrEqual(60);
  });

  it('B 引导态 noTileCollide=物理直积分:嵌实心墙内仍按 velocity 精确位移、不卡墙', () => {
    const g = makeGame();
    const f = mkFairy(584, 40, 20);
    const dirt = TILE_BY_KEY['dirt']!;
    for (let i = 38; i <= 42; i++) {
      for (let j = 18; j <= 22; j++) g.world.store.setTileSilent(i, j, dirt, 0, 0);
    }
    f.x = 40 * 16; f.y = 20 * 16;                // 构造后钉位（fromVanilla 出生嵌墙清除会挪点）
    const x0 = f.x, y0 = f.y;                    // 身体整个嵌进实心墙
    f.ai2 = 4; f.ai3 = 0;
    f.ai0 = 90; f.ai1 = 20;                      // 宝箱远——不触达 5×5 盒
    f.vx = 2; f.vy = -1;
    f.fairyDanceDir = 1;
    drive(f, g, null);
    expect(f.x).toBeCloseTo(x0 + 2, 4);          // position += velocity 逐位
    expect(f.y).toBeCloseTo(y0 - 1, 4);
    expect(f.hitWall).toBe(false);               // 穿墙态无碰撞旗
    expect(f.collideY).toBe(false);
  });

  it('C 状态 4 等待臂总速钳 1（原版 cs:48805,旧钳 6=自造）+ 追人推力向玩家', () => {
    const g = makeGame();
    const f = mkFairy(585);
    f.ai2 = 4; f.ai3 = 0;
    f.ai0 = 90; f.ai1 = 20;
    f.vx = 6; f.vy = 0;                          // 旧钳 6 档初速
    drive(f, g, mkPlayer(f.x + 500, f.y));       // dp=500>360:追人推 +0.1 后钳 1
    const spd = Math.hypot(f.vx, f.vy);
    expect(spd).toBeLessThanOrEqual(1.0001);
    expect(f.vx).toBeGreaterThan(0.9);           // 推力朝玩家（DirectionFrom×−0.1）
    expect(f.facing).toBe(1);                    // danceFace 面向玩家
  });

  it('D 状态 5 终演圆舞=相对增量:|v|≤2.3px/tick（旧绝对写 ~49px/tick 跳位）', () => {
    const g = makeGame();
    const f = mkFairy(583, 40, 20);
    f.x = 610;                                   // 宝箱格中心 (648,328) 左偏 ~30px
    f.ai2 = 5; f.ai3 = 16;
    f.ai0 = 40; f.ai1 = 20;
    f.fairyDanceDir = 1;
    drive(f, g, null);
    expect(Math.hypot(f.vx, f.vy)).toBeLessThanOrEqual(2.3);
    // 收势段（ai3≤15）仍 ×0.9 衰减（cs:48914-48916）
    const f2 = mkFairy(584, 40, 20);
    f2.ai2 = 5; f2.ai3 = 3;
    f2.vx = 4; f2.vy = -2;
    f2.ai0 = 40; f2.ai1 = 20;
    drive(f2, g, null);
    expect(f2.vx).toBeCloseTo(3.6, 5);
    expect(f2.vy).toBeCloseTo(-1.8, 5);
  });

  it('E 状态 6 宝箱重搜逐 tick（原版 cs:48917 无节流;旧 150t 门漏看新宝箱）', () => {
    // 独立大世界：搜索窗有世界缘 40 格排除（原版 Inflate(−40,−40) 同构）,
    // 96×48 小世界会把 y=20 的仙灵整个罩空（ fairy-treasure.test 同款 200×120 口径）
    const world = new World(200, 120, 11, 'bj434e');
    world.groundLevel = 16;
    const g = { world, player: null } as unknown as GameHooks;
    const chest = TILE_BY_KEY['chest']!;
    world.store.setTileSilent(50, 60, chest, 0, 0);     // 玩家身边 ±75 窗内新宝箱
    const f = mkFairy(583, 40, 60);
    f.ai2 = 6; f.ai3 = 0;                        // ai3=0:旧门 `ai3%150===0 && ai3>0` 恒假
    drive(f, g, mkPlayer(f.x + 80, f.y));        // d≈80≤100 停留段
    expect(f.ai2).toBe(3);                       // 首 tick 即命中 → 态 3 起舞
    expect(f.ai0).toBe(50);
    expect(f.ai1).toBe(60);
    expect(f.fairyDanceDir).toBe(f.facing);      // 入态捕获行进向
  });
});
