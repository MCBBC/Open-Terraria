// ★SW-FX20（2026-09-10）物理链防 NaN 断言。
// 定谳链：III224 深度重力斜率块（Player.ts :5526s ← Player.cs:24861-24883）读
// world.w / world.groundLevel；真实 Game 面 world 恒为完整 World 实例（worldgen 先于
// 任何 Player.Update → Main.maxTilesX/Main.worldSurface 恒有限正数,原版 NaN 结构性
// 不可达）。但半成品 world 对象（如旧夹具 `{store}`）喂入 → n5/num6=NaN,NaN 穿透
// 两道钳（NaN<0.25 / NaN>1 恒 false）→ grav*=NaN → vy=NaN 整链冻结
// （moveAndCollide 步数 NaN → 循环零执行 → 悬空定身）。
// 守卫面：元数据非有限/非正 → 跳过整段调制（num6≡1）；真实世界条件恒 false。
// 本文件三面：①全物理链 N 拍有限性 ②退化元数据注入被钳住 ③原版公式面仍生效
//（守卫未误杀深度调制）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function makeHooks(world: unknown, p: Player): GameHooks {
  const enemies: unknown[] = [];
  return {
    world: world as never,
    player: p as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

function makeFullWorld() {
  const w = new World(160, 300, 30, 'open');
  for (let x = 0; x < 120; x++) w.store.setTile(x, 100, 1);
  w.groundLevel = 100;   // worldgen 必设位（Main.worldSurface 恒>0,Player.cs:24864 分母）
  return w;
}

function makeWingedPlayer(w: World) {
  const p = new Player(50 * TILE, 90 * TILE, new Inventory());
  p.hp = 100;
  p.x = 50 * TILE; p.y = 96 * TILE;
  const iid = ITEM_BY_KEY['vi_493_天使之翼'];
  p.inv.armor[3] = { id: iid, stack: 1 };
  return p;
}

const finiteAll = (p: Player) =>
  Number.isFinite(p.vy) && Number.isFinite(p.vx)
  && Number.isFinite(p.y) && Number.isFinite(p.x);

describe('SW-FX20 物理链 NaN 防灌', () => {
  it('①完整世界+天使翼 600 拍全链（爬升→滑翔→落地）x/y/vx/vy 逐拍有限', () => {
    const w = makeFullWorld();
    const p = makeWingedPlayer(w);
    const hooks = makeHooks(w, p);
    // 120t 落地 → 300t 按住跳爬升 → 180t 松键滑翔落地
    for (let t = 0; t < 120; t++) p.fixedUpdate(1 / 60, hooks);
    p.inputJump = true;
    for (let t = 0; t < 300; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.wingTime).toBe(0);             // 翅膀全额耗尽（爬升真实发生）——按住跳中判
    p.inputJump = false;
    for (let t = 0; t < 180; t++) p.fixedUpdate(1 / 60, hooks);
    expect(finiteAll(p)).toBe(true);
    expect(p.onGround).toBe(true);          // 链未被冻结（NaN 定身症状的反面）
  });

  it('②退化元数据注入（{store} 半成品 world）→ 被钳住：vy 全程有限、正常落地', () => {
    // 原始毒面（FX20 前此喂法首拍即 vy=NaN）
    const w = makeFullWorld();
    const p = makeWingedPlayer(w);
    const stub = { store: w.store };        // 无 w getter / groundLevel / seedFlags
    const hooks = makeHooks(stub, p);
    for (let t = 0; t < 120; t++) {
      p.fixedUpdate(1 / 60, hooks);
      expect(finiteAll(p)).toBe(true);      // 守卫钳住：NaN 不得入链
    }
    expect(p.onGround).toBe(true);          // 且物理行为正常（落地）
  });

  it('②b 元数据边界值（groundLevel=0 未生成世界 / NaN）→ 钳住', () => {
    for (const gl of [0, Number.NaN]) {
      const w = makeFullWorld();
      w.groundLevel = gl;
      const p = makeWingedPlayer(w);
      const hooks = makeHooks(w, p);
      for (let t = 0; t < 60; t++) {
        p.fixedUpdate(1 / 60, hooks);
        expect(finiteAll(p)).toBe(true);
      }
    }
  });

  it('③守卫不误杀：完整世界深度调制仍按原版公式生效（地表带 grav×num6<1）', () => {
    // y/16=70、gl=100 → num6=(70−60.0145)/(100/6)≈0.599（Player.cs:24864 公式面）
    const w = makeFullWorld();
    const deep = new Player(50 * TILE, 70 * TILE, new Inventory());   // num6≈0.599 带
    const full = new Player(50 * TILE, 200 * TILE, new Inventory());  // 深部 num6 钳 1
    deep.hp = 100; full.hp = 100;
    deep.x = 50 * TILE; full.x = 50 * TILE;
    const h1 = makeHooks(w, deep);
    const h2 = makeHooks(w, full);
    deep.fixedUpdate(1 / 60, h1);
    full.fixedUpdate(1 / 60, h2);
    expect(finiteAll(deep)).toBe(true);
    expect(finiteAll(full)).toBe(true);
    // 静止起拍一拍：|vy| = GRAVITY×num6 → 地表带应显著小于深部满档
    const r = Math.abs(deep.vy) / Math.abs(full.vy);
    expect(r).toBeGreaterThan(0.55);
    expect(r).toBeLessThan(0.65);
  });
});
