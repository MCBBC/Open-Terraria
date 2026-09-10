// 弹药审计缺口修复批回归（docs/audit/item-audit-2026-08-22 §三 弹药 40 抽样
// ❌1 penetrate 全域 / ❌6 伤害 4 错 / ❌7 三溶液装填 / ⚠️3 proj478 表值）：
//   ① Arrow 构造器缺省穿透读 projectileData(vid).penetrate（Projectile.cs SetDefaults
//     逐型；-1 = 无限——命中侧 pierce>0 才递减消亡、敌方免疫帧冷却再命中）
//   ② 5392-5394 黄/白/棕溶液装填（Item.cs:42744-42752 DefaultToSolution(1015/1016/1017)：
//     shoot = projectileId-145 → 870/871/872、ammo = AmmoID.Solution 780）
//   ③ 伤害 4 错（vanilla-itemcombat.json 旧快照值经桥接层对齐 Item.cs：
//     546=12/:7882、988=7/:12724、1350=15/:16662、3011=7/:27806）
//   ④ proj 478 诅咒镖 penetrate 3→2（Projectile.cs:5264，提取错）
//   ⑤ 91/89/41 Kill 段数据锚（圣箭坠星 starFall 链代 / 水晶碎裂 / 狱炎爆炸弹型档）
import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { itemCombat, resolveAmmoProjId, AMMO_SOLUTION } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';

type ArrowOpts = ConstructorParameters<typeof Arrow>[7];
/** 零场构造（构造器只读数据表，不触世界/DOM） */
const mk = (projId: number, opts?: ArrowOpts): Arrow => new Arrow(0, 0, 5, 0, 10, 1, projId, opts);

// ---------------------------------------------------------------------------
// ① penetrate 全域（11 件清单抽 7 + 不变项对照）
// ---------------------------------------------------------------------------
describe('① penetrate 全域（Arrow 缺省读 SetDefaults，Projectile.cs）', () => {
  it('邪箭 47 → 弹 4 pen 5（:574-584）；水晶镖 3009 → 弹 477 pen 5（正表值不钳）', () => {
    expect(projectileData(4)?.penetrate).toBe(5);
    expect(mk(4).pierceInit).toBe(5);
    expect(projectileData(477)?.penetrate).toBe(5);
    expect(mk(477).pierceInit).toBe(5);
  });

  it('尖桩 1836 → 弹 323 pen 10（vanilla 10 不钳 6）；夜明箭 3568 → 639 pen 4', () => {
    expect(projectileData(323)?.penetrate).toBe(10);
    expect(mk(323).pierceInit).toBe(10);
    expect(mk(639).pierceInit).toBe(4);
  });

  it('高速子弹 1302 → 242 pen 3；玉米糖 1783 → 311 pen 3', () => {
    expect(mk(242).pierceInit).toBe(3);
    expect(mk(311).pierceInit).toBe(3);
  });

  it('流星弹 234 → 36 pen 2；骨箭 3003 → 474 pen 2', () => {
    expect(mk(36).pierceInit).toBe(2);
    expect(mk(474).pierceInit).toBe(2);
  });

  it('小丑之箭 51 / 狱炎箭 265 / 夜明弹 3567 → -1 无限（命中不递减消亡）', () => {
    for (const proj of [5, 41, 638]) {
      expect(projectileData(proj)?.penetrate, `proj ${proj}`).toBe(-1);
      const a = mk(proj);
      expect(a.pierce).toBe(-1);
      // 命中侧语义（Arrow 命中环）：pierce > 0 才递减判亡——-1 恒不触发
      expect(a.pierce > 0 && a.pierce - 1 <= 0, `proj ${proj} 命中即亡?`).toBe(false);
    }
  });

  it('opts 显式 pierce 仍最优先（宝石法珠 addPen/敌方弹旧档不回归）', () => {
    expect(mk(1, { pierce: 3 }).pierceInit).toBe(3);
    expect(mk(4, { pierce: 1 }).pierceInit).toBe(1);   // 表值 5 被显式 1 覆写
  });

  it('木箭 40 → 弹 1 pen 1 / 火枪弹 97 → 弹 14 pen 1（单发弹档不变）', () => {
    expect(mk(1).pierceInit).toBe(1);
    expect(mk(14).pierceInit).toBe(1);
  });

  it('⚠️3 proj 478 诅咒镖 penetrate=3（★1457 基准：Projectile.cs:5531 `penetrate = 3`;旧 1456 钉 2 已随基准切换撤除）', () => {
    expect(projectileData(478)?.penetrate).toBe(3);
    expect(mk(478).pierceInit).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ② 1.4.4 三溶液装填（DefaultToSolution 展开）
// ---------------------------------------------------------------------------
describe('② 5392-5394 溶液装填（Item.cs:42744-42752）', () => {
  it('ammo = AmmoID.Solution 780 → Game 弹药扫描 ammoOf 门可命中（整族可用）', () => {
    for (const vid of [5392, 5393, 5394]) {
      expect(itemCombat(vid)?.ammo, `vid ${vid}`).toBe(AMMO_SOLUTION);
      expect(itemCombat(vid)?.consumable, `vid ${vid}`).toBe(true);
    }
  });

  it('shoot = projectileId - 145 → 870/871/872（PickAmmo 溶液加法链还原 1015-1017）', () => {
    expect(itemCombat(5392)?.shoot).toBe(870);
    expect(itemCombat(5393)?.shoot).toBe(871);
    expect(itemCombat(5394)?.shoot).toBe(872);
    expect(resolveAmmoProjId(779, 5392, AMMO_SOLUTION, 145, 870)).toBe(1015);   // 黄→沙
    expect(resolveAmmoProjId(5134, 5393, AMMO_SOLUTION, 145, 871)).toBe(1016);  // 白→雪
    expect(resolveAmmoProjId(5134, 5394, AMMO_SOLUTION, 145, 872)).toBe(1017);  // 棕→泥
  });

  it('对照：老五色溶液 780-784 ammo 同 780（同族不回归）', () => {
    for (const vid of [780, 781, 782, 783, 784]) {
      expect(itemCombat(vid)?.ammo, `vid ${vid}`).toBe(AMMO_SOLUTION);
    }
  });
});

// ---------------------------------------------------------------------------
// ③ 弹药伤害 4 错（Item.cs SetDefaults 权威值）
// ---------------------------------------------------------------------------
describe('③ 弹药伤害（★1457 基准：json 1457 终值即权威,旧 1456 桥接层补丁已撤）', () => {
  it('546 诅咒弹 15 / 988 霜冻箭 9（1457 Item.cs case:7897 damage=:7899 / case:12740 damage=:12743）', () => {
    expect(itemCombat(546)?.damage).toBe(15);
    expect(itemCombat(988)?.damage).toBe(9);
  });

  it('1350 纳米弹 10（case:16683 damage=:16686）/ 3011 灵液镖 10（case:27828 damage=:27833）', () => {
    expect(itemCombat(1350)?.damage).toBe(10);
    expect(itemCombat(3011)?.damage).toBe(10);
  });

  it('其余弹药伤害不变项（40/47/545/3009 抽样防桥接层误伤）', () => {
    expect(itemCombat(40)?.damage).toBe(5);     // 木箭
    expect(itemCombat(47)?.damage).toBe(12);    // 邪箭
    expect(itemCombat(545)?.damage).toBe(17);   // 诅咒箭（Item.cs case 545 damage=17）
    expect(itemCombat(3009)?.damage).toBe(14);  // 水晶镖（case 3009 damage=14）
  });
});

// ---------------------------------------------------------------------------
// ⑤ 91/89/41 Kill 段数据锚（Game.onProjectileDeath 分支的弹型/弹态前提）
// ---------------------------------------------------------------------------
describe('⑤ 圣箭坠星/水晶碎裂/狱炎爆炸——Kill 链弹型档', () => {
  it('92 坠星：starFall 记账（lineY 过线才恢复撞块）+ SetDefaults tileCollide=false', () => {
    expect(projectileData(92)?.tileCollide).toBe(false);   // :1490（线上方穿墙前提）
    const star = mk(92, { starFall: { lineY: 3000, gen: 1 } });
    expect(star.starFallLine).toBe(3000);
    expect(star.starFallGen).toBe(1);                      // ai[0]=1 → 亡时再链一代
    expect(mk(92, { starFall: { lineY: 0, gen: 0 } }).starFallGen).toBe(0);  // 孙代终止
  });

  it('三弹型档：91 圣箭 pen 1 / 89 水晶子弹 pen 1 / 41 狱炎箭 pen -1', () => {
    expect(mk(91).pierceInit).toBe(1);
    expect(mk(89).pierceInit).toBe(1);
    expect(mk(41).pierce).toBe(-1);                        // 爆炸重结算前置 penetrate=-1（:73290）
  });

  it('90 水晶碎块（碎裂产物）：6×6 / aiStyle 24 / pen 1——Kill 2×生成档', () => {
    const d = projectileData(90);
    expect(d?.width).toBe(6);
    expect(d?.height).toBe(6);
    expect(d?.aiStyle).toBe(24);
    expect(d?.penetrate).toBe(1);
    expect(mk(90).pierceInit).toBe(1);
  });
});
