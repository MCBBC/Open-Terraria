// BJ340（2026-09-25）F-A 单发弹命中【不写】共享免疫窗 + F-B penetrate 耗尽断环。
// 标杆 Terarria1457/Terraria/Projectile.cs（逐支亲读）：
//   F-A 三不写：命中写分支表三档全不达——组行 :14032-14039（内层 `penetrate != 1`
//   假）/局部行 :14172-14175（flag3 要求 !usesLocalNPCImmunity,不进）/尾档
//   :14176-14182（`penetrate != 1 ||` 假）→ flag3 单发弹（maxPenetrate==1,如 405
//   泡泡）命中后 immune[owner]（本仓承载 = Enemy.iframes 共享窗）【原值保持】。
//   旧写点两向偏差（W3b 场景实证）：通用支 `pierce===1?0:10` 写 0 = 把 404/悠悠球
//   已建剩余窗【擦除】（405 命中解锁共享窗=其它弹提前复中）;假人 488 支 pierce=1
//   写 10 = 无中生有新窗。修复 = 两写点对 pierce===1 跳过写。
//   F-B：环头 `for (i…; i < maxNPCs & keepIterating; i++)`（:12589-12603）+ 尾档
//   `penetrate-- → 0 → keepIterating=false`（:14189-14196）——穿透耗尽止于首个被
//   命中 NPC（耗尽受害者本环尾段照跑）。单发弹首中即耗尽 = 单拍只结算首个重叠敌；
//   旧 hitEnemies 环同拍全部重叠敌各结算一次 = 多打。
// 运行：cd game && npx vitest run tests/bj340-single-hit-window.test.ts
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { FlaironSpike } from '../src/entities/WeaponProj';
import { hitEnemies, HitCooldown } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 160;
const PX = 50 * 16, PY = 90 * 16;

function makeHooks() {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) {
    for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  }
  const player = new Player(PX, PY, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, player, enemies };
}

// ============================================================
// F-A：Enemy.hurt 两写点对 pierce===1 跳过写（共享窗原值保持）
// ============================================================
describe('BJ340 F-A: 单发弹（pierce=1）命中不写共享免疫窗（:14032-14196 三档全不达）', () => {
  it('①僵尸建窗 7t → 405 级命中 → iframes 保持 7（旧刀写 0 = 擦除共享窗）', () => {
    const { hooks } = makeHooks();
    const e = Enemy.fromVanilla(3, 100 * 16, 50 * 16)!;   // 僵尸 type 3
    const hp0 = e.hp;
    e.iframes = 7;                       // 悠悠球/404 等 3 拍前命中,共享窗余 7t
    const landed = e.hurt(10, 1, 0, hooks, 0, false, 1, true);   // flag3 单发弹
    expect(landed).toBe(false);          // 未死,命中落地（flag3 豁免免疫门 :13956）
    expect(e.hp).toBeLessThan(hp0);      // 实扣
    expect(e.iframes).toBe(7);           // ★窗原值保持——写 0/写 10 皆红
  });

  it('②对照:pierce=0 缺省档照写 10t（:14176-14182）;pierce=-2 IDStatic 不写（拍板#1A）', () => {
    const { hooks } = makeHooks();
    const e1 = Enemy.fromVanilla(3, 100 * 16, 50 * 16)!;
    e1.iframes = 0;
    e1.hurt(10, 1, 0, hooks, 0, false, 0, true);
    expect(e1.iframes).toBe(10);         // 缺省档写 10 不受本刀影响
    const e2 = Enemy.fromVanilla(3, 100 * 16, 50 * 16)!;
    e2.iframes = 0;
    e2.hurt(10, 1, 0, hooks, 0, false, -2, true);
    expect(e2.iframes).toBe(0);          // −2 三不写（旧档已对,回归钉）
  });

  it('③训练假人 488:pierce=1 零写（旧支写 10 = 无中生有新窗）;pierce=0 照写 10t', () => {
    const { hooks } = makeHooks();
    const d1 = Enemy.fromVanilla(488, 100 * 16, 50 * 16)!;
    d1.iframes = 0;
    d1.hurt(30, 1, 0, hooks, 0, false, 1, true);   // 假人分支（hurt 返回 true）
    expect(d1.iframes).toBe(0);          // ★零写——分支表对 488 同样适用
    const d2 = Enemy.fromVanilla(488, 100 * 16, 50 * 16)!;
    d2.iframes = 0;
    d2.hurt(30, 1, 0, hooks, 0, false, 0, true);
    expect(d2.iframes).toBe(10);         // 假人缺省档 10t 不变（:13152 对全 NPC 含假人）
  });

  it('④端到端 W3b:FlaironSpike(405) 命中建窗 7t 的真僵尸 → iframes 保持 7 且弹亡', () => {
    const { hooks, player, enemies } = makeHooks();
    const z = Enemy.fromVanilla(3, PX + 62, PY)!;
    z.x = PX + 50; z.y = PY - 20;        // 与下方 spike 盒重叠
    z.iframes = 7;                       // 建窗
    enemies.push(z as never);
    const s = new FlaironSpike(PX + 43, PY - 7, 3, 0, 20, 4.5);
    s.fixedUpdate(1 / 60, hooks);
    expect(z.iframes).toBe(7);           // 共享窗保持——404/悠悠球剩余窗不被 405 解锁
    expect(s.dead).toBe(true);           // 单发弹首中即亡（hitAny → killExplode）
  });
});

// ============================================================
// F-B：hitEnemies penetrate 耗尽断环（keepIterating=false 止于首个 NPC）
// ============================================================
describe('BJ340 F-B: penetrate 耗尽断环（:12589-12603/:14189-14196 keepIterating 语义）', () => {
  function twoFoes() {
    const pierces: number[] = [];
    const foe = (id: number) => ({
      id, x: PX, y: PY, w: 24, h: 40, dead: false, vx: 0, vy: 0,
      hurt: (_d: number, _kx: number, _ky: number, _g: GameHooks, _pen: number,
        _c: boolean, pierce: number) => { pierces.push(pierce); return false; },
    });
    return { pierces, foes: [foe(1), foe(2)] };
  }
  const self = { x: PX, y: PY, w: 20, h: 20, vx: 1, damage: 10, knockback: 1, projId: 405 };

  it('①hurtPierce=1 单发弹:两重叠敌只结算首个（旧环两敌各结算一次=多打）', () => {
    const { hooks, enemies } = makeHooks();
    const { pierces, foes } = twoFoes();
    enemies.push(...foes as never[]);
    let hitAny = false;
    hitEnemies(self, hooks, new HitCooldown(), 10, 1, 0,
      () => { hitAny = true; }, undefined, false, undefined, 1);
    expect(pierces.length).toBe(1);      // ★止于首个
    expect(pierces[0]).toBe(1);
    expect(hitAny).toBe(true);           // 耗尽受害者 onHit 尾段照跑（405 kill 链不破）
  });

  it('②对照:缺省档（hurtPierce=0）两敌都结算——断环不波及回旋镖/悠悠球等穿透载体', () => {
    const { hooks, enemies } = makeHooks();
    const { pierces, foes } = twoFoes();
    enemies.push(...foes as never[]);
    hitEnemies(self, hooks, new HitCooldown(), 10, 1, 0);
    expect(pierces.length).toBe(2);      // 缺省档零漂移
    expect(pierces).toEqual([0, 0]);
  });
});
