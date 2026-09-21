// BJ227（2026-09-21 用户实报「水上漂靴/泰拉靴在液体表面站一会慢慢沉」）定谳守卫：
// 原版水面站立 = 【干态】液面钉位——Player.DryCollision 两处（Player.cs:23738 有限元步进支 /
// :23774 单步支）`if (waterWalk || waterWalk2)` → Collision.WaterCollision（Collision.cs:2793-2820）
// 把下坠跨越液面的 velocity.Y 替换为 `面顶 − 旧盒底`（position += 后盒底恰停在液面上）；
// 湿态运动路径 Player.WetCollision（:23622-23640）无任何钉位（:23625 TileCollision → :23629
// 位移×movementSpeed → TryFloatingInFluid,完）。钉位豁免面：①fallThrough=controlDown（:28296,
// 按 ↓ 主动下潜）；②湿路由走 WetCollision 不经 DryCollision（:28395-28404）。
// 旧仓实现（本刀前）：湿支内「悬停钉」只清 vy 不钉位置 → 每拍钉后湿重力链 +lGrav、
// liqFactor×0.5 → 净沉 0.1px/t（6px/s）,头部没水（headUnderwater）后钉失能加速直沉 =
// 实报「站一会→慢慢沉→没顶」。原版水面站立是干态（盒底=面顶时 WetCollision 居中探针
// 底=面顶−h/4 < 面顶 → 探针干 → 恒不入湿支）,wet 恒假、无湿态面。
// 变异证红（本文件）：
//   M1 摘钉位站（waterSurfacePinCrossed 恒 null）→ 水面站立/行走/泰拉靴岩浆面 三红；
//   M2 摘下潜豁免（dropThrough 门）→ 「按 ↓ 可下潜」红；
//   M3 waterWalkLava 并入 waterWalk2（水上漂靴超授岩浆面）→ 水上漂靴岩浆红。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

// ★世界尺寸纪律：bordersMovement 的边框钳 B=640px（40 格）在小世界 <80 格轴向才豁免
//（Player.bordersMovement `wPx<=2B || hPx<=2B` 门）——本表 80×80 格=豁免域,池任凭摆
const W = 80, H = 80;
const SURF = 30;              // 液面行（液面顶像素 = SURF*TILE,255 满液 num2=16）
const FLOOR = SURF + 4;       // 池底行
const POOL_X0 = 15, POOL_X1 = 78;

function liquidWorld(type: number, name: string): World {
  const w = new World(W, H, 11, name);
  const st = w.store;
  for (let x = POOL_X0; x < POOL_X1; x++) {
    st.setTile(x, FLOOR, 1);
    for (let y = SURF; y < FLOOR; y++) st.setLiquid(x, y, 255, type);
  }
  return w;
}

function makePlayer(w: World, vid: number | null, liquidType = 1) {
  const p = new Player(40 * TILE, (SURF - 9) * TILE, new Inventory());
  if (vid !== null) p.inv.armor[3] = { id: _iid(vid), stack: 1 };
  p.hp = 500;
  const hooks = {
    world: w, player: p, enemies: () => [], critters: () => [], npcs: () => [],
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
  } as unknown as GameHooks;
  void liquidType;
  return { p, hooks };
}

const bottom = (p: Player): number => p.y + p.h;

describe('BJ227 水面站立（干态液面钉位,Player.cs:23738/:23774 + Collision.cs:2793-2820）', () => {
  it('①水上漂靴 863：落水面钉位,600t 不沉（逐拍底=面顶）、干态站（无湿探针/无没顶）', () => {
    const w = liquidWorld(1, 'bj227-stand');
    const { p, hooks } = makePlayer(w, 863);
    for (let t = 0; t < 600; t++) p.fixedUpdate(1 / 60, hooks);
    const surfY = SURF * TILE;
    expect(p.onWaterSurface).toBe(true);
    expect(p.inWater, '原版水面站立=干态（居中探针底=面顶−h/4<面顶）').toBe(false);
    expect((p as unknown as { wetSticky: boolean }).wetSticky).toBe(false);
    expect(p.headUnderwater, '水面站立不没顶不溺').toBe(false);
    // 逐拍窗口（落地后 120t 起录 480t）：y 不下降超阈 + 钉在面顶
    let minB = Infinity, maxB = -Infinity;
    for (let t = 0; t < 480; t++) {
      p.fixedUpdate(1 / 60, hooks);
      minB = Math.min(minB, bottom(p));
      maxB = Math.max(maxB, bottom(p));
    }
    expect(maxB - minB, '600t 站立期逐拍 y 漂移不得超 0.5px（旧实现 6px/t 慢沉=红）').toBeLessThanOrEqual(0.5);
    expect(Math.abs(maxB - surfY), '盒底必须钉在液面顶（原版面顶钉位）').toBeLessThanOrEqual(0.5);
  });

  it('①b 水上行走：按 → 300t 推进 ≥8 格、全程不触发湿态、盒底恒面顶', () => {
    const w = liquidWorld(1, 'bj227-walk');
    const { p, hooks } = makePlayer(w, 863);
    p.inputRight = true; p.inputX = 1;        // Run 段消费 inputX 合值（Game 输入合成同源）
    let sawWet = false, maxB = -Infinity;
    for (let t = 0; t < 160; t++) {   // 160t×≈3px/t≈480px < 泳道 630px（不出池缘）
      p.fixedUpdate(1 / 60, hooks);
      sawWet = sawWet || (p as unknown as { wetSticky: boolean }).wetSticky;
      maxB = Math.max(maxB, bottom(p));
    }
    expect(p.x - 40 * TILE, '水面上行走必须正常推进（干态移速,无 0.5 液体减速）').toBeGreaterThanOrEqual(8 * TILE);
    expect(sawWet, '原版水面行走不触发湿态面（wet 探针干）').toBe(false);
    expect(Math.abs(maxB - SURF * TILE)).toBeLessThanOrEqual(0.5);
  });

  it('①c 水面站立可直接起跳（原版起跳外门 velocity.Y==0 :20845 无 onGround 要求）', () => {
    const w = liquidWorld(1, 'bj227-jump');
    const { p, hooks } = makePlayer(w, 863);
    for (let t = 0; t < 120; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onWaterSurface).toBe(true);
    const y0 = p.y;
    p.inputJump = true;                       // press 边沿（jumpEdge = inputJump && !prev）
    p.fixedUpdate(1 / 60, hooks);
    p.fixedUpdate(1 / 60, hooks);
    expect(p.vy, '水面站立拍起跳必须离面（旧仓干支 onGround 门恒假=水面跳不出去）').toBeLessThan(0);
    expect(p.y).toBeLessThan(y0);
  });

  it('③按住 ↓ 主动下潜（fallThrough=controlDown :28296 豁免面）：钉位让位、入湿态', () => {
    const w = liquidWorld(1, 'bj227-dive');
    const { p, hooks } = makePlayer(w, 863);
    for (let t = 0; t < 120; t++) p.fixedUpdate(1 / 60, hooks);   // 先落定水面
    expect(p.onWaterSurface).toBe(true);
    p.inputDown = true;
    let sawWet = false;
    for (let t = 0; t < 120; t++) {
      p.fixedUpdate(1 / 60, hooks);
      sawWet = sawWet || (p as unknown as { wetSticky: boolean }).wetSticky;
    }
    expect(bottom(p), '按 ↓ 必须能下潜（钉位豁免）').toBeGreaterThan(SURF * TILE + 16);
    expect(sawWet, '下潜入水=湿态').toBe(true);
    expect(p.onWaterSurface).toBe(false);
  });

  it('④无靴对照：同一水面正常下沉到池底（钉位非无条件）', () => {
    const w = liquidWorld(1, 'bj227-control');
    const { p, hooks } = makePlayer(w, null);
    for (let t = 0; t < 600; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onGround, '无靴必须沉到池底落地').toBe(true);
    expect(bottom(p)).toBeGreaterThan(SURF * TILE + 32);
    expect((p as unknown as { wetSticky: boolean }).wetSticky).toBe(true);
  });

  it('⑤泰拉靴 5000（纯 waterWalk）：岩浆面钉位站立、inLava 假（探针缩高 6px :27875-27881）', () => {
    const w = liquidWorld(2, 'bj227-terraspark');
    const { p, hooks } = makePlayer(w, 5000);
    expect(p.equipStats.waterWalkLava).toBe(true);
    let sawLava = false;
    for (let t = 0; t < 600; t++) {
      p.fixedUpdate(1 / 60, hooks);
      sawLava = sawLava || p.inLava;
    }
    expect(Math.abs(bottom(p) - SURF * TILE), '泰拉靴必须站在岩浆面上').toBeLessThanOrEqual(0.5);
    expect(sawLava, '岩浆探针缩高 6px=面顶站立不触浆（inLava 恒假）').toBe(false);
    expect(p.onWaterSurface).toBe(true);
  });

  it("⑥水上漂靴 863（waterWalk2）:岩浆面不钉位、照常下沉入浆（WaterCollision 第 7 参只传 waterWalk）", () => {
    const w = liquidWorld(2, 'bj227-wwb-lava');
    const { p, hooks } = makePlayer(w, 863);
    expect(p.equipStats.waterWalkLava, '863 是 waterWalk2 源,不得进纯 waterWalk 档').toBe(false);
    for (let t = 0; t < 600; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onGround, '无 lavaWalk 必须沉到池底').toBe(true);
    expect(bottom(p)).toBeGreaterThan(SURF * TILE + 32);
    expect(p.inLava).toBe(true);
  });

  it('⑦水上行走药水 buff15（原版 :10102 置 waterWalk=纯源）:水面钉位+岩浆面钉位双通', () => {
    const w = liquidWorld(1, 'bj227-potion');
    const { p, hooks } = makePlayer(w, null);
    p.buffs.apply(BuffType.WaterWalking, 3600);
    for (let t = 0; t < 300; t++) p.fixedUpdate(1 / 60, hooks);
    expect(Math.abs(bottom(p) - SURF * TILE)).toBeLessThanOrEqual(0.5);
    expect(p.onWaterSurface).toBe(true);
  });
});
