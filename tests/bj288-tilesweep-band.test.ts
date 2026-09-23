// BJ288 tileSweep 扫描带两修正（Collision.cs:2315-2324 逐字复核;1458 交叉同面）：
//  F1 右/底【独占】界：value2/value4 = (int)((Position+Size)/16)+2 为独占上界
//    （i<value2/j<value4）——旧 `<=` 循环把 floor+2 当闭末槽 = 右/底各多扫一列/行,
//    vanilla 从不扫描的列面曾把 79 引导星锁在墙面上（T1 实证 bj277① 旧金标 rx=30
//    系 deviating 冻结,已按原版语义重产为 14）。独占界下「目的盒只压越界列 → 整速
//    穿墙」= 原版快弹隧穿 quirk（刻意保留,非缺陷）。
//  F2 底钳：value3/value4 双双 Utils.Clamp(·,0,maxTilesY−40)——底 40 行 TileCollision
//    永不扫（physics/TileCollision.ts:1299-1302 同习语;旧钳 st.h−1 系 tileSweep 孤例;
//    num6=(value4+3)×16 同用钳后 value4 = :2319）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { MagicMissileProj } from '../src/entities/MissileProj';
import type { GameHooks } from '../src/entities/types';

/** 200×200 世界 + x=100 起竖实心墙（y=50..150,厚度 thick）——bj277 同布景 */
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
    player: { dead: true, iframes: 0, cx: 93 * TILE, cy: 100 * TILE, x: 93 * TILE - 10, y: 100 * TILE - 21, w: 20, h: 42 },
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
  } as unknown as GameHooks;
}

/** 弹心 (cx,cy)、初速 (vx,vy) */
function mk(game: GameHooks, projId: 79 | 16, cx: number, cy: number, vx: number, vy: number,
  channelOn: boolean, aim: { x: number; y: number }): MagicMissileProj {
  return new MagicMissileProj(cx - 16, cy - 16, vx, vy, {
    projId, damage: 50, knockback: 4, useTime: 20,
    channelCb: () => channelOn, aimCb: () => aim, payMana: () => true,
  }) as MagicMissileProj;
}

describe('BJ288 F1 扫描带右界独占（i<value2,Collision.cs:2318/:2326）', () => {
  it('目的盒只压「越界列」→ 原版从不扫描 → 无夹速整速穿墙（79 引导档不 ×0.1 不 Kill）', () => {
    const game = makeGame(wallWorld(2));
    // 弹心 1587：目的盒 [1617,1621) 只与列 101（1616..1632）相交——
    // value2 = floor((1585+4)/16)+2 = 101 → i<101 → 列 101 不入带
    // （旧闭末槽曾扫到 → rx=27×0.1=2.7 锁面,已退役）
    const m = mk(game, 79, 1587, 100 * TILE, 32, 0, true, { x: 200 * TILE, y: 100 * TILE });
    m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    expect(m.vx).toBe(32);                       // 零夹速 = 隧穿 quirk 保留（非 ×0.1 贴面）
    expect(m.cx).toBeCloseTo(1587 + 32, 6);      // 整速穿入墙列（原版同款）
    // 续 5 拍：嵌入盒自由穿出（:2388-2456 方位分支语义,BJ277④ 同款）恒存活
    for (let t = 0; t < 5; t++) m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    expect(m.cx).toBeGreaterThan(102 * TILE);    // 已穿出 2 格厚墙
  });

  it('对照：目的盒压【界内】列 → 照常夹速 ×0.1（独占界不豁免正常碰撞）', () => {
    // 弹心 1584：目的盒 [1614,1618) 与列 100（1600..1616）相交=带内 → rx=14×0.1=1.4
    // （=bj277① 重产金标同几何,双锁互证）。★注：续拍重瞄后目的盒前缘跨过列 100
    // （1616.66≥1616）且列 101 越界 → 整速隧穿（vanilla quirk,见上）——故只钉首拍
    const game = makeGame(wallWorld(2));
    const m = mk(game, 79, 95 * TILE + 64, 100 * TILE, 32, 0, true, { x: 200 * TILE, y: 100 * TILE });
    m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    expect(m.vx).toBeCloseTo(1.4, 9);            // rx=1600−1586=14 → ×0.1
    expect(m.cx).toBeCloseTo(95 * TILE + 64 + 1.4, 6);
    for (let t = 0; t < 5; t++) m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);                  // 引导档恒存活（creep+隧穿混合）
  });
});

describe('BJ288 F2 扫描带底钳（value3/value4 钳 maxTilesY−40,Collision.cs:2321-2324）', () => {
  it('底 40 行不入带：小世界（h−40=60）行 90 地板对 tileSweep 不可见 → 直下穿行不 Kill', () => {
    const w = new World(100, 100, 7, 'test');
    for (let x = 5; x <= 95; x++) w.store.setTileSilent(x, 90, 1);   // 行 90 ≥ h−40=60
    const game = makeGame(w);
    // 79 松手（mode=1 → flag22 支）vy=32 直下；弹心钉 85*TILE=1360 → t3 碰撞拍
    // by=1420（≡12 mod 16,目的行 90=带内末行——★避开 32px/拍对单行的独占界隧穿,
    // 否则底钳失效面被隧穿 quirk 掩盖=变异存活）。修前（st.h−1 闭带）t3 目的盒
    // [1452,1456) 压行 90 → ry=16 → 反应链 Kill;修后带=[60,60) 空 → 整速穿过
    const m = mk(game, 79, 50 * TILE, 85 * TILE, 0, 32, false, { x: 50 * TILE, y: 100 * TILE });
    for (let t = 0; t < 4; t++) m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(false);
    expect(m.cy).toBeGreaterThan(90 * TILE);     // 已穿过地板行（底 40 行无 TileCollision 面）
  });

  it('对照：行 <h−40 的地板照常夹速 Kill（底钳不豁免带内碰撞）', () => {
    const w = new World(100, 100, 7, 'test');
    // 地板 2 行（50..51）：★32px/拍 4×4 盒对 1 行地板=目的行恰落独占界 value4 → 隧穿
    // （vanilla quirk,见 F1）;2 行厚让 t3 目的盒 [814,818) 压行 50=带内末行（value4=51）
    for (let y = 50; y <= 51; y++) for (let x = 5; x <= 95; x++) w.store.setTileSilent(x, y, 1);
    const game = makeGame(w);
    const m = mk(game, 79, 50 * TILE, 44 * TILE, 0, 32, false, { x: 50 * TILE, y: 100 * TILE });
    for (let t = 0; t < 6; t++) m.fixedUpdate(1 / 60, game);
    expect(m.dead).toBe(true);                   // t3 从上支夹速 ry=14 → flag22 反应链 Kill
  });
});
