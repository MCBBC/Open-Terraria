// 天龙之怒 3858（Sky Dragon's Fury）全链回归：
//   · 707 旋剑（AI_140 :66249-66337）：50t 两整圈（Δrot=4π×dir）、t=25 松手提前收剑
//     （held 门）、持按重瞄换向（rot−=π）；线段命中 ±110 厚 23 + 6t 同敌冷却；
//     owner.facing 每 tick 跟随（ChangeDir）
//   · 708 椭圆弧（AI_142 :66562-66641）：anim 2/6/10 各出一发 709、anim≤2 收势
//   · 709 天龙弹（:51809-51839）：30 AI 次（=15t）寿命亡爆 → 1110 星圈 + 消费旧圈；
//     aiStyle1 重力 0.3/update
//   · 1110 星圈（aiStyle 77 :29583-29700）：尺寸脉动 [64,80]、8t 同敌免疫、
//     consume（ai1=1）渐隐退场
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { SkyDragonSpin, SkyDragonSwing, SkyDragonShot, SkyDragonCircle } from '../src/entities/SkyDragonFury';

function makeGame(w: World, list: unknown[] = []) {
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: (e: unknown, b: string) => { if (b !== 'projectiles') list.push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 180, 1, 0, 0);
  return w;
}

/** 玩家挂点（facing 可变引用） */
function mkOwner(cx: number, cy: number) {
  return { cx, cy, facing: 1, dead: false, vx: 0, vy: 0 };
}

/** 大盒敌（盖住旋剑全轨——线段恒穿玩家中心邻域） */
function bigEnemy(id: number, x: number, y: number) {
  return { id, x, y, w: 80, h: 80, dead: false, hp: 1000, hurt: () => true };
}

describe('天龙之怒 707 旋剑（AI_140_MonkStaffT1）', () => {
  it('持按：50t 两整圈后收剑，Δrot = 初始角 + 4π（2 整圈）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const spin = new SkyDragonSpin(owner, 24, 0, 100, 5, () => true, () => ({ x: owner.cx + 500, y: owner.cy }), () => {});
    spin.critChance = 0;
    let ticks = 0;
    for (let t = 0; t < 49; t++) { spin.fixedUpdate(1, game); ticks++; if (spin.dead) break; }
    expect(ticks).toBe(49);
    expect(spin.dead).toBe(false);
    spin.fixedUpdate(1, game);                       // 第 50 tick：ai[0]>=50 → Kill
    expect(spin.dead).toBe(true);
    const rot = (spin as unknown as { rot: number }).rot;
    // 初始角（首 tick 内赋：atan2(−1,1)−π/4+π = π/2）+ 旋进 4π/50×50 = 4π
    expect(Math.abs(rot - (Math.PI / 2 + Math.PI * 4))).toBeLessThan(1e-6);
  });

  it('半程松手：t=25 即收剑（held 门 :66272-66276）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const spin = new SkyDragonSpin(owner, 24, 0, 100, 5, () => false, () => ({ x: owner.cx, y: owner.cy }), () => {});
    spin.critChance = 0;
    for (let t = 0; t < 24 && !spin.dead; t++) spin.fixedUpdate(1, game);
    expect(spin.dead).toBe(false);                   // 24t 仍未到半程门
    spin.fixedUpdate(1, game);                       // t=25：half && !held → Kill
    expect(spin.dead).toBe(true);
  });

  it('半程持按重瞄：鼠标在身后 → 换向 + rot−=π（:66277-66288）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let mouseRight = true;
    const spin = new SkyDragonSpin(owner, 24, 0, 100, 5, () => true,
      () => ({ x: owner.cx + (mouseRight ? 500 : -500), y: owner.cy }), () => {});
    spin.critChance = 0;
    for (let t = 0; t < 24; t++) spin.fixedUpdate(1, game);   // t 到 24，flag2 未触发
    expect((spin as unknown as { dir: number }).dir).toBe(1);
    mouseRight = false;                              // 第 25 tick 前鼠标移到左侧
    spin.fixedUpdate(1, game);                       // t=25：half && held → 重瞄换向
    expect((spin as unknown as { dir: number }).dir).toBe(-1);
    expect(owner.facing).toBe(-1);                   // ChangeDir(num13)
  });

  it('线段命中 + 6t 同敌冷却（localNPCHitCooldown=6）', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const en = bigEnemy(1, owner.cx - 40, owner.cy - 40);
    let hits = 0;
    (en as { hurt: () => boolean }).hurt = () => { hits++; return true; };
    list.push(en);
    const spin = new SkyDragonSpin(owner, 24, 0, 100, 5, () => true, () => ({ x: owner.cx + 500, y: owner.cy }), () => {});
    spin.critChance = 0;
    spin.fixedUpdate(1, game);
    expect(hits).toBe(1);
    for (let t = 0; t < 5; t++) spin.fixedUpdate(1, game);   // 冷却中
    expect(hits).toBe(1);
    spin.fixedUpdate(1, game);                       // 第 7 tick：冷却完再中
    expect(hits).toBe(2);
  });

  it('onEnd 在 Kill 时回调（reuseDelay=2 语义）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let ended = 0;
    const spin = new SkyDragonSpin(owner, 24, 0, 100, 5, () => true, () => ({ x: owner.cx, y: owner.cy }), () => { ended++; });
    for (let t = 0; t < 60 && !spin.dead; t++) spin.fixedUpdate(1, game);
    expect(ended).toBe(1);
  });
});

describe('天龙之怒 708 椭圆弧（AI_142_MonkStaffT2And3）', () => {
  it('anim 10/6/2 各出一发 709（共 3 发）后收势', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let animT = 30;
    const shots: Array<{ x: number; y: number; vx: number; vy: number }> = [];
    const sw = new SkyDragonSwing(owner, 36, 0, 70, 9,
      () => animT, (x, y, vx, vy) => shots.push({ x, y, vx, vy }));
    sw.critChance = 0;
    for (let t = 0; t < 40 && !sw.dead; t++) {
      animT--;                                       // swing.t 递减代理
      sw.fixedUpdate(1, game);
    }
    expect(shots.length).toBe(3);                    // anim 2/6/10
    expect(sw.dead).toBe(true);                      // anim≤2 → Kill
    // 出射速度模长 ∈ [10,13]（10+Next(4)，:66603）
    for (const s of shots) {
      const sp = Math.hypot(s.vx, s.vy);
      expect(sp).toBeGreaterThanOrEqual(10);
      expect(sp).toBeLessThanOrEqual(13);
    }
  });

  it('椭圆弧位置跟随动画进度（π+prog·2π 分量椭圆）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let animT = 30;
    const sw = new SkyDragonSwing(owner, 36, 0, 70, 9, () => animT, () => {});
    sw.critChance = 0;
    animT = 30; sw.fixedUpdate(1, game);             // prog=0：起点在手心后方
    const p0 = { x: sw.cx, y: sw.cy };
    animT = 15; sw.fixedUpdate(1, game);             // prog=0.5：对侧
    const p1 = { x: sw.cx, y: sw.cy };
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeGreaterThan(30);   // 弧上明显移位
  });
});

describe('天龙之怒 709 天龙弹 + 1110 星圈', () => {
  it('30 AI 次（15t）寿命亡爆 → 新圈；aiStyle1 重力 0.3/update', () => {
    const game = makeGame(emptyWorld());
    const shot = new SkyDragonShot(80 * TILE, 100 * TILE, 12, 0, 70);
    shot.critChance = 0;
    const circles: Array<[number, number, number]> = [];
    shot.spawnCircle = (x, y, dmg) => { circles.push([x, y, dmg]); };
    shot.consumeCircles = () => {};
    for (let t = 0; t < 14 && !shot.dead; t++) shot.fixedUpdate(1, game);
    expect(shot.dead).toBe(false);                   // 14t = 28 updates
    expect(shot.vy).toBeGreaterThan(0);              // 0.3×28
    shot.fixedUpdate(1, game);                       // 15t = 30 updates → 亡爆
    expect(shot.dead).toBe(true);
    expect(circles.length).toBe(1);
    expect(circles[0][2]).toBe(70);                  // 圈伤 = 弹伤（:70280）
  });

  it('撞块亡爆 + 消费 80×80 内旧圈（:70255-70264）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    // 旧圈放在弹道前方 30px
    const circle = new SkyDragonCircle(80 * TILE + 30, 100 * TILE, 70, 90);
    const shot = new SkyDragonShot(80 * TILE, 100 * TILE, 12, 0, 70);
    shot.critChance = 0;
    shot.spawnCircle = () => {};
    shot.consumeCircles = () => { circle.consume(); };
    for (let t = 0; t < 60 && !shot.dead; t++) shot.fixedUpdate(1, game);   // 12px/t → 撞 x=180 墙
    expect(shot.dead).toBe(true);                    // 撞块 Kill（12×0.3 竖坠入墙/寿命）
    expect(circle.dead).toBe(false);                 // 消费 = 渐隐开始（尚未死）
    let guard = 0;
    while (!circle.dead && guard++ < 20) circle.fixedUpdate(1, game);      // +51/t → 5t 隐没
    expect(circle.dead).toBe(true);
  });

  it('1110：尺寸脉动 [64,80] + 8t 同敌免疫 + timeLeft 到期', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const en = bigEnemy(1, 80 * TILE - 40, 100 * TILE - 40);
    let hits = 0;
    (en as { hurt: () => boolean }).hurt = () => { hits++; return true; };
    list.push(en);
    const circle = new SkyDragonCircle(80 * TILE, 100 * TILE, 70, 300);
    circle.critChance = 0;
    let min = 999, max = 0;
    for (let t = 0; t < 40; t++) {
      circle.fixedUpdate(1, game);
      min = Math.min(min, circle.w); max = Math.max(max, circle.w);
    }
    expect(min).toBeGreaterThanOrEqual(62);          // 80×min(max(0.75+.25v,0.8−.2v))=floor(62.2)
    expect(max).toBeLessThanOrEqual(80);
    expect(hits).toBeGreaterThanOrEqual(4);          // 8t 免疫 → 40t 至少 4 跳
    expect(hits).toBeLessThanOrEqual(6);
    for (let t = 0; t < 400 && !circle.dead; t++) circle.fixedUpdate(1, game);
    expect(circle.dead).toBe(true);                  // timeLeft 300 耗尽
  });
});
