// 批 D 第二组：1457 新配饰行为链 + LoadoutShare + PanControl 四档
//  权威：Terarria1457 Player.cs（:13054-13057 ammoCyclerDamage / :14716-14739 新配饰 /
//  :5679-5758 GetEffectiveArmor/GetEffectiveDye / :2837 hasClickPanOn /
//  :359 PanControl_Keyboard）+ Projectile.cs:13439-13450/:14347-14420 拍击石系 +
//  Main.cs:63719-63778 PanControl 四档门
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { trySnapStrike } from '../src/stats/SnapStrike';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
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
  (hooks as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities = {
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store, player, added };
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; vanillaId?: number;
  realLife?: number | null; onFire3T?: number; acceleratePoisonsT?: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

// ============ 弹药循环四件 + 远程配饰旗（:14634-14725） ============
describe('1457 远程配饰旗', () => {
  it('弹药循环四件 6168/6169/6193/6194：mode 各档 + 共有 rangedDamage+8%（:13054-13057）', () => {
    const cases: Array<[number, number]> = [[6168, 1], [6169, 2], [6193, 3], [6194, 0]];
    for (const [vid, mode] of cases) {
      const p = makeHooks().player;
      p.inv.armor[3] = { id: iid(vid), stack: 1 };
      expect(p.equipStats.ammoCyclerMode).toBe(mode);
      expect(p.equipStats.dmgRanged).toBeCloseTo(0.08);
    }
  });

  it('鹰妖护符 6166 rangedCrit+5+引矢旗；锐刺 6160 rangedCrit+8；炽天使 6180=引矢+无敌延长', () => {
    const a = makeHooks().player;
    a.inv.armor[3] = { id: iid(6166), stack: 1 };
    expect(a.equipStats.critRanged).toBe(5);
    expect(a.equipStats.accHarpyCharm).toBe(true);
    const b = makeHooks().player;
    b.inv.armor[3] = { id: iid(6160), stack: 1 };
    expect(b.equipStats.critRanged).toBe(8);
    expect(b.equipStats.accSharpBarb).toBe(true);
    const c = makeHooks().player;
    c.inv.armor[3] = { id: iid(6180), stack: 1 };
    expect(c.equipStats.accHarpyCharm).toBe(true);
    expect(c.equipStats.accSeraphNecklace).toBe(true);
    expect(c.equipStats.longInvince).toBe(true);
  });

  it('凤凰箭袋 6181 = 引矢 + Molten/Magic 箭袋 + 箭伤 +10%（:14699-14704）', () => {
    const p = makeHooks().player;
    p.inv.armor[3] = { id: iid(6181), stack: 1 };
    expect(p.equipStats.hasPhoenixQuiver).toBe(true);
    expect(p.equipStats.moltenQuiver).toBe(true);
    expect(p.equipStats.quiver).toBe(true);
    expect(p.equipStats.arrowDmg).toBeCloseTo(0.1);
  });

  it('焰爆石 6178 = 岩浆石 + 近战脉冲旗；蜜刺 6184 = 毒刺+蜂蜜+受击放蜂；催化指环 6185 = 毒刺+哲学家石+398', () => {
    const a = makeHooks().player;
    a.inv.armor[3] = { id: iid(6178), stack: 1 };
    expect(a.equipStats.magmaStone).toBe(true);
    expect(a.equipStats.accPyroclast).toBe(true);
    const b = makeHooks().player;
    b.inv.armor[3] = { id: iid(6184), stack: 1 };
    expect(b.equipStats.accPoisonBarb).toBe(true);
    expect(b.equipStats.accHoneyedBarb).toBe(true);
    expect(b.equipStats.bees).toBe(true);
    const c = makeHooks().player;
    c.inv.armor[3] = { id: iid(6185), stack: 1 };
    expect(c.equipStats.pStone).toBe(true);
    expect(c.equipStats.catalystBand).toBe(true);
  });

  it('十字心 6187 = 恐慌+无敌延长；复原之盾 6188 = 免击退（def1/life2 走 itemstats）；神秘腰布 6189 = 10% 闪避', () => {
    const a = makeHooks().player;
    a.inv.armor[3] = { id: iid(6187), stack: 1 };
    expect(a.equipStats.panic).toBe(true);
    expect(a.equipStats.longInvince).toBe(true);
    const b = makeHooks().player;
    b.inv.armor[3] = { id: iid(6188), stack: 1 };
    expect(b.equipStats.noKnockback).toBe(true);
    expect(b.equipStats.def).toBe(1);
    const c = makeHooks().player;
    c.inv.armor[3] = { id: iid(6189), stack: 1 };
    expect(c.equipStats.mysticSashDodge).toBe(true);
    // 10% 闪避（Player.Hurt :38501-38504）——统计意义冒烟（真值掷骰不断言）
    let dodged = 0;
    for (let i = 0; i < 400; i++) if (c.damage(50, 0, 0, false) === 0) dodged++;
    expect(dodged).toBeGreaterThan(10);
  });

  // ★item.defense 面（GrantArmorBenefits :13220 statDefense += armorPiece.defense，
  //   UpdateEquips :13015-13026 k=0..9 全装备槽统一加算）——曾整面缺失=配饰防御不叠，
  //   仅 6188 由 BEHAVIOR_FX 硬补（已删，避免与 itemstats 通道双计）。
  //   数值 = vanilla-itemstats.json（1457 SetDefaults 终值：安卡盾 5/钴盾 1 均为 1.4.5.7 新值）
  it('item.defense 面：经典防御配饰逐件叠入 equipStats.def', () => {
    const CASES: Array<[vid: number, want: number]> = [
      [216, 1],    // Shackle 脚镣
      [156, 1],    // Cobalt Shield 钴盾
      [193, 1],    // Obsidian Skull 黑曜石骷髅头
      [397, 2],    // Obsidian Shield 黑曜石盾
      [1595, 2],   // Magic Cuffs 魔力手铐
      [2221, 2],   // Celestial Cuffs 天界手铐
      [3097, 2],   // EoCShield 克苏鲁护盾
      [1613, 5],   // Ankh Shield 安卡盾
      [938, 6],    // PaladinsShield 圣骑士盾
      [3997, 6],   // FrozenShield 冰冻盾
      [3016, 8],   // FleshKnuckles 肉拳
      [3992, 8],   // Berserker's Glove 狂战士手套
      [3998, 10],  // HeroShield 英雄盾
      [6177, 1],   // 皇家卫队背带（1457）
      [6183, 2],   // 白银之盾（1457）
    ];
    for (const [vid, want] of CASES) {
      const p = makeHooks().player;
      p.inv.armor[3] = { id: iid(vid), stack: 1 };
      expect(p.equipStats.def, `vid ${vid}`).toBe(want);
    }
    // 卸下归零 + 多件叠加（脚镣1+安卡盾5=6，Player.cs:13220 逐槽累加）
    const q = makeHooks().player;
    q.inv.armor[3] = { id: iid(216), stack: 1 };
    q.inv.armor[4] = { id: iid(1613), stack: 1 };
    expect(q.equipStats.def).toBe(6);
    expect(q.defense).toBe(6);
    // ★受理门（UpdateEquips_CanItemGrantBenefits :12977 case 3-9 = item.accessory）：
    //   非配饰占用配饰槽（UI 侧 armorAccepts 已拦,仅存档异常可达）不授 def/前缀/life
    const g = makeHooks().player;
    g.inv.armor[3] = { id: iid(37), stack: 1 };              // 护目镜=头盔部位件,非配饰
    expect(g.equipStats.def).toBe(0);
    g.inv.armor[3] = { id: iid(37), stack: 1, prefix: 65 };  // 险恶+4 同样不授
    expect(g.equipStats.def).toBe(0);
    // 门内配饰词缀照常叠加：脚镣1 + 险恶4 = 5（:13020-13022 if (accessory) 方入）
    const w = makeHooks().player;
    w.inv.armor[3] = { id: iid(216), stack: 1, prefix: 65 };
    expect(w.equipStats.def).toBe(5);
    // acc:0 社交件 vanilla 同样 accessory=true（SetDefaults 208 等抽查）——门放行：
    // 词缀授（存档异常面唯一实差,社交件 itemstats 零 def/life）,裸件 def 恒 0
    const s0 = makeHooks().player;
    s0.inv.armor[3] = { id: iid(208), stack: 1, prefix: 65 };
    expect(s0.equipStats.def).toBe(4);
  });
});

// ============ 拍击石系三脉冲（TryMakingSnappingStoneStrike :14347-14420） ============
describe('拍击石系三脉冲', () => {
  it('毁灭臂镗 kind2（tag 命中触发）：150×召唤伤/400px/2 目标/360t 共用冷却（:14364-14383）', () => {
    const victims = [mkEnemy(1, 60 * 16, 90 * 16), mkEnemy(2, 60 * 16 + 100, 90 * 16), mkEnemy(3, 60 * 16 + 200, 90 * 16)];
    const { hooks, player, added } = makeHooks(victims);
    player.inv.armor[3] = { id: iid(6179), stack: 1 };
    const hit = trySnapStrike(hooks, player, 2, victims[0].cx, victims[0].cy, victims[0].id);
    // ★F1：返回值改为 num14 加伤（150 基座 + 10×misses=0 两发全出 ×minionDamage）
    expect(hit).toBe(Math.trunc(150 * player.summonDamageMult));
    const strikes = added.filter((a) => (a as { projId?: number }).projId === 1132);
    expect(strikes.length).toBe(2);                       // num2 = 2 目标上限
    expect(player.accSnappingStoneCooldown).toBe(360);    // :14382-14383
    // 冷却内再触发 = false
    expect(trySnapStrike(hooks, player, 2, victims[0].cx, victims[0].cy, victims[0].id)).toBe(0);   // 冷却拦下=加伤 0（旧布尔 false 档）
  });

  it('焰爆石 kind1：45×近战伤/300px + 目标 323 Hellfire 180t（:14360-14362/:14396-14401）', () => {
    const victims = [mkEnemy(4, 60 * 16, 90 * 16), mkEnemy(5, 60 * 16 + 100, 90 * 16)];
    const { hooks, player, added } = makeHooks(victims);
    player.inv.armor[3] = { id: iid(6178), stack: 1 };
    // ★F1：misses=1（只找到 victims[1] 一目标）→ (70+10)×max(melee,ranged)
    expect(trySnapStrike(hooks, player, 1, victims[0].cx, victims[0].cy, victims[0].id))
      .toBe(Math.trunc((70 + 10) * Math.max(1 + player.equipStats.dmgMelee, 1 + player.equipStats.dmgRanged)));
    expect(added.some((a) => (a as { projId?: number }).projId === 1131)).toBe(true);
    expect(victims[1].onFire3T).toBe(3);                  // AddBuff(323,180)=3s
  });

  it('无对应饰品 → 不触发（门在调用侧,此处兜底）;拍击石 kind0 伤 = 30×远程伤（:14356-14358）', () => {
    const v = [mkEnemy(6, 60 * 16, 90 * 16), mkEnemy(7, 60 * 16 + 100, 90 * 16)];
    const { hooks, player, added } = makeHooks(v);
    expect(trySnapStrike(hooks, player, 0, v[0].cx, v[0].cy, v[0].id)).toBe(0);   // 无饰品=不触发
    expect(player.accSnappingStoneCooldown).toBe(0);
    player.inv.armor[3] = { id: iid(6167), stack: 1 };    // 拍击石
    // ★F1：扫描候选仅 v[1]（v[0] 本体=skipTargets）→ misses=1 档 = (40+10)
    expect(trySnapStrike(hooks, player, 0, v[0].cx, v[0].cy, v[0].id))
      .toBe(Math.trunc((40 + 10 * (2 - 1)) * (1 + player.equipStats.dmgRanged)));
    expect(added.some((a) => (a as { projId?: number }).projId === 1121)).toBe(true);
  });
});

// ============ LoadoutShare（GetEffectiveArmor/GetEffectiveDye :5679-5758） ============
describe('LoadoutShare 收藏装备跨配装共享', () => {
  it('当前槽空 + 他套同槽收藏件 → 共享生效且属性走共享件（R4-19 裁决:P57:13015-13048）;未收藏不共享', () => {
    const p = makeHooks().player;
    const shield = iid(6188);   // 复原之盾（def+1,armorAccepts 配饰槽内）
    // 他套（loadouts[1]）配饰槽放收藏复原之盾
    p.inv.loadouts[1].armor[3] = { id: shield, stack: 1, favorited: true };
    expect(p.inv.getEffectiveArmor(3)?.id).toBe(shield);
    // ★属性走共享件（R4-19 蓝队裁决,1457 P57:13015-13048 逐行:GrantArmorBenefits
    //  k=0..9 / ApplyEquipFunctional m=3..9 全走 GetEffectiveArmor——共享件给全部
    //  属性;批 D 报告"消费面全在视觉/属性不走共享件"与源码相反,测试锚已改写）
    expect(p.equipStats.def).toBe(1);
    // 取消收藏 → 不共享
    p.inv.loadouts[1].armor[3] = { id: shield, stack: 1 };
    expect(p.inv.getEffectiveArmor(3)).toBeNull();
    expect(p.equipStats.def).toBe(0);
    // 本槽非空 → 恒用本槽
    p.inv.armor[3] = { id: shield, stack: 1 };
    expect(p.inv.getEffectiveArmor(3)?.id).toBe(shield);
    p.inv.armor[3] = null;
    // 染料同语义（GetEffectiveDye :5736-5758 无兼容门）
    p.inv.loadouts[2].dye[0] = { id: iid(1015), stack: 1, favorited: true }; // 蓝染料 1015
    expect(p.inv.getEffectiveDye(0)?.id).toBe(iid(1015));
  });

  it('本槽非空 → 恒用本槽（不叠加）;收藏件入 equipStatsKey（跨套变动失效缓存,R4-19 键段同步）', () => {
    const p = makeHooks().player;
    p.inv.loadouts[1].armor[0] = { id: iid(37), stack: 1, favorited: true };
    expect(p.inv.getEffectiveArmor(0)?.id).toBe(iid(37));  // 共享生效
    // 共享件是聚合输入 → 卸收藏必须失效缓存（键含共享件,与 computeEquipStats 同口径）
    // ★勿钉内部 id 死值（曾钉 1352——注册表增项平移后炸红），动态取 iid(37)
    const k1 = p['equipStatsKey']();
    expect(k1).toContain(iid(37) + 'p0.');
    p.inv.loadouts[1].armor[0] = null;
    expect(p['equipStatsKey']()).not.toBe(k1);
    // 本槽非空 → 恒用本槽
    p.inv.armor[0] = { id: iid(37), stack: 1 };
    expect(p.inv.getEffectiveArmor(0)?.id).toBe(iid(37));
  });
});

// ============ PanControl 四档（Main.cs:63719-63778） ============
describe('PanControl 四档门控', () => {
  it('档位缺省 Hold=0;ButtonControlMode 序 Hold/Click/OnAlways/OffAlways（ButtonControlMode.cs:5-8）', () => {
    const p = makeHooks().player;
    expect(p.panControlMode).toBe(0);
    expect(p.hasClickPanOn).toBe(false);
  });
});
