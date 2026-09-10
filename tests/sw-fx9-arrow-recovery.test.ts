// ===========================================================================
// SW-FX9（2026-09-10）弹药 1/3 落地回收裁决钉：整链摘除 = 原版恒消耗
//   裁决依据（反编译为唯一锚,Terrarria1457 Projectile.cs Kill() :71752-78995 全文）：
//   · 箭族支 type==1/81/98/980/1073 → Sound 0 + 10×dust7（P.cs:75447-75454）,
//     无任何 Item.NewItem/RequestNewItem;
//   · 投掷支 type==3/48/54/599/909 → Sound 0 + 10×dust1（P.cs:77221-77230）,同上;
//   · !noDropItem 段（P.cs:79099-79360,Kill_ExplodeTiles 前身段）只含 aiStyle10
//     放块族（num18 兜底）/985·965 砂球/3005·2996/3077-3080/75 陨星/859/4743
//     ——箭/投掷家族零回收;
//   · Player.cs 全文件 RequestNewItem 清单无"落地拾取弹药"链（2026-09-01 终零波
//     对账既证,SW-FX9 复核同判）。
//   故本仓旧「木箭/投掷件撞块 rand<1/3 spawnDrop(dropKey)」= 自加 gameplay 偏离,
//   本批按原版整链摘除（dropKey 字段/ctor 参/THROWN_NO_RECOVERY_VIDS/回收掷）。
//   本文件 = 裁决行为钉。撞块几何沿 tests/orphan-b1.test.ts ⑤ 实心泥墙模式。
//   变异证红：恢复旧回收掷（rand<1/3 spawnDrop）后 test#2 必红
//   （240 矢期望 ~80 掉落,全零假绿概率 (2/3)^240 ≈ 1e-42）。
// ===========================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { projectileData } from '../src/data/vanillaProjectiles';
import type { GameHooks } from '../src/entities/types';

const W = 64, H = 32;

function wallWorld(): World {
  const world = new World(W, H, 42, 'sw-fx9-no-recovery');
  const DIRT = TILE_BY_KEY['dirt']!;
  for (let y = 10; y <= 22; y++) {
    world.store.setTile(40, y, DIRT, 0, 0);
    world.store.setTile(41, y, DIRT, 0, 0);
  }
  return world;
}

function spyGame(world: World, drops: string[]): GameHooks {
  return {
    world,
    player: null,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDrop: (_x: number, _y: number, key: string) => void drops.push(key),
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    onProjectileDeath: () => {},
  } as unknown as GameHooks;
}

describe('SW-FX9 弹药恒消耗裁决（P.cs Kill 全文无箭族/投掷族回收）', () => {
  it('①结构钉：Arrow 实体不再持有 dropKey 链（字段已摘）', () => {
    const w = wallWorld();
    const a = new Arrow(39 * 16, 16 * 16 + 6, 5, 0, 10, 0, 1, {});
    expect('dropKey' in a, 'dropKey 字段必须已从 Arrow 摘除（SW-FX9 裁决）').toBe(false);
    void w;
  });

  it('②行为钉：木箭(弹1)撞块 240 矢恒零掉落（旧 1/3 掷期望 ~80 掉,假绿 1e-42）', () => {
    const drops: string[] = [];
    const world = wallWorld();
    const game = spyGame(world, drops);
    const wooden = projectileData(1);
    expect(wooden?.aiStyle, '前置：弹 1 = aiStyle 1 箭族').toBe(1);
    for (let round = 0; round < 240; round++) {
      const a = new Arrow(40 * 16 - 20, 16 * 16 + 6, 5, 0, 10, 0, 1, {});
      let dead = false;
      for (let i = 0; i < 90 && !dead; i++) { a.fixedUpdate(1 / 60, game); dead = a.dead; }
      expect(dead, `第 ${round} 矢应撞块消亡`).toBe(true);
    }
    expect(drops, '原版恒消耗:零落地回收').toEqual([]);
  });

  it('③投掷系样例：手里剑(弹3)撞块零掉落（P.cs:77221-77230 仅音尘）', () => {
    const drops: string[] = [];
    const world = wallWorld();
    const game = spyGame(world, drops);
    for (let round = 0; round < 60; round++) {
      const a = new Arrow(40 * 16 - 20, 16 * 16 + 6, 5, 0, 10, 0, 3,
        { grav: 0.4, gravDelay: 20, drag: 0.97, maxFall: 32 });
      let dead = false;
      for (let i = 0; i < 90 && !dead; i++) { a.fixedUpdate(1 / 60, game); dead = a.dead; }
      expect(dead).toBe(true);
    }
    expect(drops).toEqual([]);
  });

  it('④原版真锚保留：恒星弹 75(陨星)落地掉落链不属本批——Arrow Kill 族无 NewItem 抽样核',
    () => {
      // 原版掉落面在 Kill_ExplodeTiles !noDropItem 段（P.cs:79349 RequestNewItem 75），
      // 承载方=FallingStar/FallingBlock 专链,与 Arrow.Kill 无关——本钉防未来把
      // "75 陨星掉落"误接回 Arrow 撞块支造成双掷。
      const src = readFileSync(new URL('../src/entities/Arrow.ts', import.meta.url), 'utf8');
      expect(src).not.toContain('spawnDrop(this.x, this.y, this.dropKey');
      expect(src, 'dropKey 运行时消费/形参零残留（注释中的裁决记载除外）')
        .not.toContain('this.dropKey');
      expect(src).not.toContain('dropKey: string');
    });
});
