// ★BJ343（2026-09-25）W4 批三件落刀判别面：
//  件 1 原地变型尺寸刷——ItemDrop.refreshDimsFromVid 单源（原版三处变型全走
//        Item.SetDefaults 语义含 w/h 重置：WorldItem.cs:1752 微光转化/EmergencyStacking
//        钱币升面/NetMessage msg21 全态覆写;71-74 钱币盒互异 [10,10]/[10,12]/[10,14]/[12,14]）
//  件 2 词缀舍入族单源——roundCSf32Mul/truncCSf32Mul/truncCSf32MulBias（ScaleStats.ts）
//        f32 操作数 + 银行家/(int) 截断;数值仿真判别面 = (vid, prefix) 对全域扫描
//        + 半值/f32 精密处钉值（旧 Math.round=f64+half-up 双偏离）
//  件 3 EmptyTile 谓词单源——emptyTileEntitiesRect（Collision.cs:1361-1384 亲读：
//        玩家 active&&!dead&&!ghost 豁免 + NPC 全桶（敌怪+城镇+小动物同池）+
//        无 projectile 臂）;overlapsEntity/areaEmptyAt 两壳委托,四门族语义归一
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ItemDrop } from '../src/entities/ItemDrop';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { roundCSf32Mul, truncCSf32Mul, truncCSf32MulBias } from '../src/stats/ScaleStats';
import prefixJson from '../src/data/vanilla-prefix.json';
import combatJson from '../src/data/vanilla-itemcombat.json';
import { Game } from '../src/core/Game';

const ROOT = resolve(__dirname, '..');
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const iidOf = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  const iid = key ? ITEM_BY_KEY[key] : undefined;
  expect(iid, `vid ${vid} 应有内部 id`).toBeDefined();
  return iid!;
};

// ================= 件 1：变型点命中盒重刷 =================
describe('BJ343 件 1：refreshDimsFromVid（变型点 w/h 重刷单源）', () => {
  it('钱币 71-74 盒互异：构造期注入 + 变型重刷逐级跟随（Item.cs:2219-2282）', () => {
    const dims = [[10, 10], [10, 12], [10, 14], [12, 14]] as const;
    for (let v = 71; v <= 74; v++) {
      const d = new ItemDrop(0, 0, iidOf(v));
      expect([d.w, d.h], `vid ${v} 构造期盒`).toEqual([...dims[v - 71]]);
    }
    // 升面链 71→72→73→74：itemId 换 + refreshDimsFromVid 逐级跟随
    const coin = new ItemDrop(0, 0, iidOf(71));
    for (let v = 72; v <= 74; v++) {
      coin.itemId = iidOf(v);
      coin.refreshDimsFromVid();
      expect([coin.w, coin.h], `升面 → vid ${v}`).toEqual([...dims[v - 71]]);
    }
  });

  it('微光转化对 dims 随动（vid 9 → 2：8×10 → 12×12;表内 96 对 dims 互异）', () => {
    const d = new ItemDrop(0, 0, iidOf(9));
    expect([d.w, d.h]).toEqual([8, 10]);
    d.itemId = iidOf(2);
    d.refreshDimsFromVid();
    expect([d.w, d.h]).toEqual([12, 12]);
  });

  it('表外 vid（SW 物品 vid≤0）回落 12×12 统一盒（构造同款缺省语义）', () => {
    const swIid = ITEM_DEFS.findIndex((def) => def && (def.vid ?? -1) <= 0);
    expect(swIid, '仓内应有 SW 自创物品').toBeGreaterThan(0);
    const d = new ItemDrop(0, 0, swIid);
    expect([d.w, d.h]).toEqual([12, 12]);
    const vanilla = new ItemDrop(0, 0, iidOf(75));
    expect([vanilla.w, vanilla.h]).toEqual([18, 18]);
    vanilla.itemId = swIid;
    vanilla.refreshDimsFromVid();
    expect([vanilla.w, vanilla.h]).toEqual([12, 12]);
  });

  it('三变型点接线锁（摘任一 refreshDimsFromVid 调用即红）', () => {
    // ① 微光转化：ItemDrop.getShimmered transformToItem 支
    const drop = codeOf('src/entities/ItemDrop.ts');
    expect(drop).toContain('this.itemId = iid;');
    expect(drop.slice(drop.indexOf('this.itemId = iid;'), drop.indexOf('this.itemId = iid;') + 220))
      .toContain('this.refreshDimsFromVid()');
    // ② 钱币升面（Game.emergencyStackMakeSpace promoteCoin 钩）
    const game = codeOf('src/core/Game.ts');
    const promoteAt = game.indexOf('promoteCoin: (d) => {');
    expect(game.slice(promoteAt, promoteAt + 500)).toContain('d.refreshDimsFromVid()');
    // ③ net msg21 全态覆写（真身回报臂 + 傀儡 upsert 臂两处）
    expect(game).toContain('d.refreshDimsFromVid();   // ★BJ343 件1');
    expect(game).toContain('pup.d.refreshDimsFromVid()');
  });
});

// ================= 件 2：词缀舍入族单源 =================
describe('BJ343 件 2：C# 舍入三式（f32 操作数 + 银行家/(int) 截断）', () => {
  it('roundCSf32Mul 银行家半值 + f32 精密钉值（Math.round 双发散代表对）', () => {
    // 5×0.9：f64 精确 4.5 → Math.round=5（half-up）;f32 域仍 4.5 → 银行家取偶=4
    expect(roundCSf32Mul(5, 0.9)).toBe(4);
    expect(Math.round(5 * 0.9)).toBe(5);          // 旧式（发散对照）
    // 10×1.05：f64≈10.5000000000000004 → old=11;f32(1.05)×10 恰 10.5 → 银行家=10
    expect(roundCSf32Mul(10, 1.05)).toBe(10);
    expect(Math.round(10 * 1.05)).toBe(11);
    // 50×1.15：f64≈57.49999999999999 → old=57;f32 积舍入恰 57.5 → 银行家=58（f32 翻向）
    expect(roundCSf32Mul(50, 1.15)).toBe(58);
    expect(Math.round(50 * 1.15)).toBe(57);
    // 非半值恒同相（不引入额外偏差）
    expect(roundCSf32Mul(22, 1.1)).toBe(Math.round(22 * 1.1));
    expect(roundCSf32Mul(14, 0.85)).toBe(Math.round(14 * 0.85));
  });

  it('truncCSf32Mul（PickAmmo 弹药叠臂,Player.cs:54193 无偏置截断）', () => {
    expect(truncCSf32Mul(3, 1.5)).toBe(4);        // (int)(4.5f)=4
    expect(truncCSf32Mul(10, 0.85)).toBe(8);      // (int)(8.5f)=8（Math.round 会给 9）
    expect(truncCSf32Mul(7, 1.1)).toBe(7);        // (int)(7.700…f)=7
  });

  it('truncCSf32MulBias（GetWeaponDamage 族,Player.cs:54066/Main.cs:20870 偏置截断）', () => {
    expect(truncCSf32MulBias(1.0, 10)).toBe(10);  // 整值 + 5e-6 仍截回整
    expect(truncCSf32MulBias(0.85, 10)).toBe(8);  // 8.5+5e-6 截 8
    expect(truncCSf32MulBias(0.9, 25)).toBe(22);  // 22.5+5e-6 截 22
    // 偏置语义：f64 侧略亏的期望整值被抬回（f32 积 ≈ 期望整值−ε）
    expect(truncCSf32MulBias(1.0, 10)).toBeGreaterThanOrEqual(10);
  });

  it('数值仿真判别面：(vid, prefix) 对全域扫描（itemCombat 全表 × 11 词缀 dmg 档）', () => {
    const dmgVals = new Set<number>();
    for (const s of Object.values(prefixJson.stats)) {
      if (s.dmg !== undefined && s.dmg !== 1) dmgVals.add(s.dmg as number);
    }
    expect(dmgVals.size).toBe(11);
    const oldR = (a: number, b: number) => Math.round(a * b);
    const divergent: Array<[number, number, number, number]> = [];
    const combat = combatJson as Record<string, { damage?: number }>;
    for (const [vidS, c] of Object.entries(combat)) {
      const dmg = c?.damage;
      if (!Number.isFinite(dmg) || (dmg ?? 0) <= 0) continue;
      for (const p of dmgVals) {
        const nw = roundCSf32Mul(dmg!, p);
        if (nw !== oldR(dmg!, p)) divergent.push([Number(vidS), dmg!, p, nw]);
      }
    }
    // 判别面规模钉值（435 对 @ 2026-09-25 表态——表更新即重钉,防单源语义静默漂移;
    //  审计口径「452 对」按掷池/鞭表扩域枚举,本面钉 itemCombat×dmg 档全域）
    //  ★清偿刀 J（2026-09-30）重钉 458：itemcombat 四根修重产后新显影 +23 对,
    //  全部来自新获 damage 的件（3287 悠悠球 70 + 鞭 4678/4680/4911/4914/5477-5480/
    //  5688 九鞭）,零移除（对拍 bak 435=now 子集,增量对=纯加面,无既有对翻向）。
    expect(divergent.length).toBe(458);
    // 抽点钉值（每对 [vid, base, prefix, 新值]——含银行家/f32 翻向两种成因）
    const pin = (vid: number, base: number, p: number, want: number) => {
      const hit = divergent.find(([v, d, pp]) => v === vid && d === base && pp === p);
      expect(hit, `vid ${vid} × ${p}`).toBeDefined();
      expect(hit![3]).toBe(want);
    };
    pin(1, 5, 0.9, 4);      // 半值银行家（4.5→4,旧 half-up 5）
    pin(42, 10, 1.05, 10);  // f32 半值翻转（10.5→10,旧 11）
    pin(65, 25, 0.9, 22);   // 半值银行家
    pin(72, 50, 1.15, 58);  // f32 翻向（f64 57.4999→旧 57;f32 积恰 57.5→取偶 58）
  });

  it('五站收编接线锁（任一站回退 Math.round 即红）', () => {
    const ui = codeOf('src/ui/UI.ts');
    expect(ui).toContain('roundCSf32Mul(def.tool.damage, prefixStat(prefix).dmg)');
    const tip = codeOf('src/ui/itemTooltip.ts');
    expect(tip).toContain('roundCSf32Mul(def.tool.damage, pm(\'dmg\'))');
    expect(tip).toContain('truncCSf32MulBias(multCS, dmgT)');
    expect(tip, '旧 half-up 须绝迹').not.toContain("Math.round(cd!.damage!");
    const game = codeOf('src/core/Game.ts');
    expect(game).toContain('roundCSf32Mul(cwMelee!.damage, ps?.dmg ?? 1)');
    expect(game).toContain('truncCSf32MulBias(this.player.damageMult(\'melee\'), zAff)');
    expect(game).toContain('truncCSf32MulBias(this.player.rangedDamageMult(rKindP), dmgPAff)');
    expect(game).toContain('truncCSf32Mul(this.player.rangedDamageMult(rKindP), (ammoCP?.damage ?? 0))');
  });
});

// ================= 件 3：EmptyTile 谓词单源 =================
/** Game 壳（谓词域纯桩——Object.create 判例,无 canvas/boot） */
function mkPredicateShell(): {
  g: Record<string, unknown>;
  buckets: { enemies: unknown[]; npcs: unknown[]; critters: unknown[]; projectiles: unknown[] };
  player: Record<string, unknown>;
} {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const buckets = { enemies: [] as unknown[], npcs: [] as unknown[], critters: [] as unknown[], projectiles: [] as unknown[] };
  const player = { x: 0, y: 0, w: 20, h: 42, dead: false, isGhostPhase: () => false };
  g.player = player;
  g.world = { stub: true };
  g.entities = buckets;
  return { g, buckets, player };
}
/** 1×1 格实体（tile 坐标占位:16px 格内 16×16） */
const tileBody = (tx: number, ty: number) => ({ x: tx * 16 + 1, y: ty * 16 + 1, w: 14, h: 14 });

describe('BJ343 件 3：emptyTileEntitiesRect 单源（Collision.cs:1361-1384）', () => {
  it('NPC 全桶：敌怪/城镇 NPC/小动物任一占格 → overlapsEntity true（原版 Main.npc 一张表）', () => {
    for (const bucket of ['enemies', 'npcs', 'critters'] as const) {
      const { g, buckets } = mkPredicateShell();
      (buckets[bucket] as unknown[]).push(tileBody(5, 7));
      const o = (g as unknown as { overlapsEntity(x: number, y: number): boolean }).overlapsEntity(5, 7);
      expect(o, `${bucket} 占格`).toBe(true);
      expect((g as unknown as { overlapsEntity(x: number, y: number): boolean }).overlapsEntity(6, 7)).toBe(false);
    }
  });

  it('dead/ghost 玩家豁免（:1368 active&&!dead&&!ghost）——活玩家照占', () => {
    const { g, player } = mkPredicateShell();
    player.x = 5 * 16 + 1; player.y = 7 * 16 + 1; player.w = 14; player.h = 14;
    const ov = (g as unknown as { overlapsEntity(x: number, y: number): boolean }).overlapsEntity(5, 7);
    expect(ov, '活玩家占格').toBe(true);
    player.dead = true;
    expect((g as unknown as { overlapsEntity(x: number, y: number): boolean }).overlapsEntity(5, 7), '死亡豁免').toBe(false);
    player.dead = false;
    player.isGhostPhase = () => true;
    expect((g as unknown as { overlapsEntity(x: number, y: number): boolean }).overlapsEntity(5, 7), '幽灵豁免').toBe(false);
  });

  it('弹幕不占位（原版 EmptyTile 无 projectile 臂）——overlapsEntity false 且 areaEmptyAt true', () => {
    const { g, buckets } = mkPredicateShell();
    (buckets.projectiles as unknown[]).push(tileBody(5, 7));
    const gg = g as unknown as { overlapsEntity(x: number, y: number): boolean; areaEmptyAt(x: number, y: number, w: number, h: number): boolean };
    expect(gg.overlapsEntity(5, 7)).toBe(false);
    expect(gg.areaEmptyAt(5, 7, 1, 1), '导线门域弹幕不咬占位门').toBe(true);
  });

  it('两壳行为对拍（四门族语义归一）：overlapsEntity ≡ !areaEmptyAt(1×1),矩形域照常', () => {
    const { g, buckets } = mkPredicateShell();
    const gg = g as unknown as { overlapsEntity(x: number, y: number): boolean; areaEmptyAt(x: number, y: number, w: number, h: number): boolean };
    // 空场：空
    expect(gg.overlapsEntity(5, 7)).toBe(false);
    expect(gg.areaEmptyAt(5, 7, 1, 1)).toBe(true);
    // 敌怪在 2×2 区域次列 → 矩形域占位
    (buckets.enemies as unknown[]).push(tileBody(6, 7));
    expect(gg.areaEmptyAt(5, 7, 2, 1)).toBe(false);
    expect(gg.areaEmptyAt(5, 7, 1, 1)).toBe(true);
    // 单格等价遍历（占位/非占位两态同相）
    for (const [tx, ty] of [[5, 7], [6, 7], [7, 7]] as const) {
      expect(gg.overlapsEntity(tx, ty)).toBe(!gg.areaEmptyAt(tx, ty, 1, 1));
    }
  });

  it('消费面接线锁（单源委托 + 弹幕臂摘除）', () => {
    const game = codeOf('src/core/Game.ts');
    expect(game).toContain('overlapsEntity(px: number, py: number): boolean {\n    return this.emptyTileEntitiesRect(px * TILE, py * TILE, TILE, TILE);\n  }');
    expect(game).toContain('return !this.emptyTileEntitiesRect(x * TILE, y * TILE, w2 * TILE, h2 * TILE);');
    expect(game, '玩家臂须带 dead/ghost 豁免').toContain('!p.dead && !p.isGhostPhase(this.world) && hit(p)');
    // 谓词体内禁 projectile 桶（原版无此臂——回流即红）
    const predAt = game.indexOf('private emptyTileEntitiesRect');
    const predBody = game.slice(predAt, predAt + 700);
    expect(predBody).not.toContain('projectiles');
    expect(predBody).toContain('entities.critters');
  });
});
