// BJ277 彩虹魔杖引导期碰墙 1:1（Projectile.cs :19439-19462 aiStyle 9 反应支 +
// HandleMovement TileCollision :17578/:Collision.cs:2299 逐语义;1458 同 :19441-19464
// ——2026-09-22 用户实报定谳：引导星碰实心块爆炸消散 = 旧「中心格实心即灭」杀位
// 不分相位,原版引导档无此死面）：
//  ① 79 引导档（ai[0]>=0 ↔ mode 0）碰实心块【不 Kill】——TileCollision 夹速至贴面
//     + 命中轴 ×0.1（:19448-19455）→ 下一拍 steer amount=1 重瞄 → 星体贴墙渐近跟随;
//  ② 79 松手档碰块 Kill（:19458-19461 flag22 支;BJ255 迸散面）——死亡位=贴面位
//     （UpdatePosition :20549 在反应链后恒跑 → 夹后残量位移照走,盒缘恰达墙面）;
//  ③ 16 引导档碰墙照 Kill——79 豁免是全 aiStyle 9 唯一特支（:19442 flag23 只查 79）;
//  ④ 嵌墙出生逃逸：嵌入盒四向分支全不中 → 无夹速自由穿出（TileCollision :2388-2456
//     分支判定=当前盒与格方位关系）;旧中心格杀位对此曾即死=已退役。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { MagicMissileProj } from '../src/entities/MissileProj';
import type { GameHooks } from '../src/entities/types';

const WALL_FACE = 100 * TILE;   // 墙列 x=100 左缘 px=1600

/** 200×200 世界 + x=100 起竖实心墙（y=50..150,土块,厚度 thick）。
 *  ★① 引导档用 2 格厚：TileCollision 夹速为【逐格覆写,末格胜出】（:2416-2418）——
 *  目的位盒 [bx+32,bx+36) 跨压两列时取【最远】列面（原版字面,wiki「Wall-piercing
 *  weapons」穿墙 quirk 成因）→ t3 夹至 x=1616 面（残量 30）;2 格厚保证跨压可复现。
 *  ②③④ 用 1 格厚（首触单列夹速,死亡位=近墙面 1598 干净钉值）。 */
function wallWorld(thick: 1 | 2): World {
  const w = new World(200, 200, 30, 'open');
  for (let x = 100; x < 100 + thick; x++) {
    for (let y = 50; y <= 150; y++) w.store.setTileSilent(x, y, 1, 0, 0);
  }
  return w;
}

function makeGame(w: World): GameHooks {
  return {
    world: w,
    player: { dead: true, iframes: 0, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 10, h: 20 },
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
  } as unknown as GameHooks;
}

/** 弹心落在 (cx,cy)、初速 (vx,0) 的弹;channel 电平经 channelRef 可变,aimRef 可改瞄 */
function mk(game: GameHooks, projId: 79 | 16, cx: number, cy: number, vx: number,
  channelRef: { on: boolean }, aimRef: { x: number; y: number }): MagicMissileProj {
  return new MagicMissileProj(cx - 16, cy - 16, vx, 0, {
    projId, damage: 50, knockback: 4, useTime: 20,
    channelCb: () => channelRef.on,
    aimCb: () => aimRef,
    payMana: () => true,
  }) as MagicMissileProj;
}

describe('BJ277 ①79 引导档碰实心墙不消亡+贴墙跟随（:19442-19456 特支）', () => {
  it('首触夹速×0.1（多列跨压取最远面=原版覆写序）,恒存活,改瞄即继续跟随光标', () => {
    const game = makeGame(wallWorld(2));
    const ch = { on: true };
    const aimRef = { x: 200 * TILE, y: 100 * TILE };
    const m = mk(game, 79, 95 * TILE, 100 * TILE, 32, ch, aimRef);
    // t1/t2 无碰撞直进（目的盒 [1550,1554)/[1582,1586) 未及墙面 1600）
    m.fixedUpdate(1 / 60, game);
    m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    expect(m.cx).toBeCloseTo(95 * TILE + 64, 6);
    // t3：目的盒 [1614,1618) 跨压 x=100/101 两列 → 从左覆写取最远列面 1616:
    // rx = 1616−1586 = 30 → ×0.1（:19448-19455 字面;多列末格胜出 = :2416 原版序）
    m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);                          // 引导档不 Kill（用户实报面）
    expect(m.vx).toBeCloseTo(3.0, 9);                    // 30×0.1
    expect(m.cx).toBeCloseTo(95 * TILE + 64 + 3, 6);     // 只走夹后残量的一成
    // 续 60 拍按压穿墙（原版覆写序 → ~2.5px/拍渐渗后自由穿出,wiki 穿墙 quirk）:
    // 全程【永不消亡】= 本刀核心
    for (let t = 0; t < 60; t++) m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    // 改瞄上方空域 → 星继续跟随光标（引导语义完好）
    aimRef.x = m.cx; aimRef.y = 40 * TILE;
    for (let t = 0; t < 5; t++) m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    expect(m.cy).toBeLessThan(100 * TILE - 100);         // 已向上跟随
  });
});

describe('BJ277 ②79 松手档碰墙 Kill（:19458-19461 flag22 支）', () => {
  it('松手直射入墙：t3 夹速拍 Kill,死亡位=贴面位（盒缘恰达墙面,不穿格）', () => {
    const game = makeGame(wallWorld(1));
    const ch = { on: false };
    const m = mk(game, 79, 95 * TILE, 100 * TILE, 32, ch, { x: 95 * TILE + 600, y: 100 * TILE });
    m.fixedUpdate(1 / 60, game);   // t1 松手:mode→1,无目标 → 速度归一 32 直飞
    m.fixedUpdate(1 / 60, game);   // t2 直进
    expect(m.dead).toBe(false);
    m.fixedUpdate(1 / 60, game);   // t3 夹速 rx=14 → 反应支 Kill;UpdatePosition 残量照走
    expect(m.dead).toBe(true);
    expect(m.cx).toBeCloseTo(95 * TILE + 64 + 14, 6);    // 1598:盒右缘 1600 恰贴墙面
    expect(m.cx).toBeLessThan(WALL_FACE);                // 恒不穿入墙格
  });
});

describe('BJ277 ③非 79 对照：16 引导档碰墙照 Kill（79 豁免是 aiStyle 9 唯一特支）', () => {
  it('16 引导直射入墙：t3 反应支 Kill（:19442 flag23 只查 type 79）', () => {
    const game = makeGame(wallWorld(1));
    const ch = { on: true };
    const m = mk(game, 16, 95 * TILE, 100 * TILE, 32, ch, { x: 200 * TILE, y: 100 * TILE });
    m.fixedUpdate(1 / 60, game);
    m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(true);                           // 引导档无豁免 → 照常 Kill
    expect(m.cx).toBeLessThan(WALL_FACE + TILE);         // 贴面死,未深入墙内
  });
});

describe('BJ277 ④嵌墙出生逃逸（TileCollision 方位分支语义;旧中心格杀位即死已退役）', () => {
  it('弹心嵌墙格出生：四向分支全不中 → 无夹速自由穿出,不即死', () => {
    const game = makeGame(wallWorld(1));
    const ch = { on: true };
    const m = mk(game, 79, 100.5 * TILE, 100 * TILE, 32, ch, { x: 130 * TILE, y: 100 * TILE });
    for (let t = 0; t < 5; t++) m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    expect(m.cx).toBeGreaterThan(101 * TILE);            // 已自由穿出墙面
  });
});
