// 弓类 Game/Player 域修复批回归（审计 ❌ 清单 2026-08-22，标杆 Terarria1456）：
//   ① 六弓换体全链 resolveBowProjOverride（PickAmmo 尾链 Player.cs:52660-52705 +
//      ItemCheck_Shoot 弹型段 :46525-46545）——此前仅 3019/3052 两特例
//   ② 熔火箭袋 projToShoot=2 换体（:52702-52705，此前只 +2 伤不换体）
//   ③ 海啸 2624 五扇 tsunamiFanShots（:47138-47164）
//   ④ 暮夕 4953 第 3 发强化 eventideShotSpec（:47307-47315）+ 前 4 发免耗档（:52783）
//   ⑤ Archery 药水作用域（:9711-9712 只进 arrowDamage → bowEffectiveDamage
//      :3820-3822 仅箭族消费——枪弹/火箭/飞镖不吃）
//   ⑥ 省弹四档独立旗聚合（:52791-52804）+ magicQuiver 档（:52743）+ 熔火箭袋 4002 旗
//   ⑦ 吹管族身体行恒 2（:35989-35992）
import { describe, it, expect } from 'vitest';
import { resolveBowProjOverride, tsunamiFanShots, eventideShotSpec } from '../src/data/vanillaItemCombat';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { BuffType } from '../src/stats/Buffs';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Renderer } from '../src/render/Renderer';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!] ?? -1;
const mkPlayer = () => new Player(0, 0, new Inventory());

// ---------------------------------------------------------------------------
// ① 六弓换体全链 + ② 熔火箭袋（顺序敏感：尾链 → 蜂膝弓 → 熔火箭袋 → ItemCheck 表）
// ---------------------------------------------------------------------------
describe('① resolveBowProjOverride 六弓换体全链（:52660-52705/:46525-46545）', () => {
  it('熔岩之怒 120：仅木箭 1→火矢 2（:46525-46528）；特殊弹不换', () => {
    expect(resolveBowProjOverride(120, 1, false)).toMatchObject({ projId: 2, ammoBonus: 0 });
    expect(resolveBowProjOverride(120, 5, false).projId).toBe(5);    // 狱炎箭保持
    expect(resolveBowProjOverride(120, 133, false).projId).toBe(133); // 星旋箭保持
  });

  it('骨弓 682→117 / 冰雪弓 725→120 / 脉冲弓 2223→357：恒射无视弹药（:46529-46545）', () => {
    for (const ammo of [1, 2, 5, 133]) {
      expect(resolveBowProjOverride(682, ammo, false).projId, `682←${ammo}`).toBe(117);
      expect(resolveBowProjOverride(725, ammo, false).projId, `725←${ammo}`).toBe(120);
      expect(resolveBowProjOverride(2223, ammo, false).projId, `2223←${ammo}`).toBe(357);
    }
  });

  it('蜂膝弓 2888：木箭→蜂箭 469（:52698-52701）；特殊弹自带弹型不被覆盖', () => {
    expect(resolveBowProjOverride(2888, 1, false).projId).toBe(469);
    expect(resolveBowProjOverride(2888, 41, false).projId).toBe(41);
  });

  it('熔火箭袋：木箭→火矢 +2 伤（:52702-52705）；火矢/特殊弹不加伤', () => {
    expect(resolveBowProjOverride(39, 1, true)).toMatchObject({ projId: 2, ammoBonus: 2 });
    expect(resolveBowProjOverride(39, 2, true)).toMatchObject({ projId: 2, ammoBonus: 0 });
    expect(resolveBowProjOverride(39, 41, true)).toMatchObject({ projId: 41, ammoBonus: 0 });
  });

  it('顺序敏感：2888+熔火箭袋+木箭 → 蜂箭 469 且无 +2（469≠1 不触发 :52702）', () => {
    expect(resolveBowProjOverride(2888, 1, true)).toMatchObject({ projId: 469, ammoBonus: 0 });
  });

  it('顺序敏感：120+熔火箭袋+木箭 → 火矢 +2（:52702 先换体，:46525 的 ==1 门不再触发）', () => {
    expect(resolveBowProjOverride(120, 1, true)).toMatchObject({ projId: 2, ammoBonus: 2 });
  });

  it('尾链两特例不回归：3019 木箭→485（:52660）/ 3052 恒 495（:52664）/ 4953 木箭→932（:52668）', () => {
    expect(resolveBowProjOverride(3019, 1, false).projId).toBe(485);
    expect(resolveBowProjOverride(3019, 41, false).projId).toBe(41);
    for (const ammo of [1, 41]) expect(resolveBowProjOverride(3052, ammo, false).projId).toBe(495);
    expect(resolveBowProjOverride(4953, 1, false).projId).toBe(932);
  });

  it('无特例弓不串扰：木弓 39 木箭→1 无加伤', () => {
    expect(resolveBowProjOverride(39, 1, false)).toMatchObject({ projId: 1, ammoBonus: 0 });
  });
});

// ---------------------------------------------------------------------------
// ③ 海啸 2624 五扇（:47138-47164）
// ---------------------------------------------------------------------------
describe('③ tsunamiFanShots 海啸五扇（:47138-47164）', () => {
  const LOS_CLEAR = () => true;

  it('恒 5 矢、速度全体 = 瞄准速原样（:47142 num42=5 / :47158 num4,num5）', () => {
    const shots = tsunamiFanShots(100, 100, 100, 100, 10, 0, LOS_CLEAR, LOS_CLEAR);
    expect(shots.length).toBe(5);
    for (const s of shots) {
      expect(s.vx).toBe(10);
      expect(s.vy).toBe(0);
    }
  });

  it('扇形错位：出生点 = 锚点 + 40px 瞄准向旋转 π/10×(i−2)（:47144-47147）', () => {
    const shots = tsunamiFanShots(500, 500, 500, 500, 10, 0, LOS_CLEAR, LOS_CLEAR);
    shots.forEach((s, i) => {
      const dx = s.x - 500, dy = s.y - 500;
      expect(Math.hypot(dx, dy)).toBeCloseTo(40, 6);
      const want = (Math.PI / 10) * (i - 2);
      expect(Math.atan2(dy, dx)).toBeCloseTo(want, 6);
    });
  });

  it('斜向瞄准同样成立（旋转基向量随瞄准向）', () => {
    const shots = tsunamiFanShots(0, 0, 0, 0, 3, 4, LOS_CLEAR, LOS_CLEAR);
    shots.forEach((s, i) => {
      expect(Math.hypot(s.x, s.y)).toBeCloseTo(40, 6);
      expect(Math.atan2(s.y, s.x)).toBeCloseTo((Math.PI / 10) * (i - 2) + Math.atan2(4, 3), 6);
    });
  });

  it('起手 CanHit 失败 → 出生点整体回拉一个 40px 瞄准向（:47148-47150）', () => {
    // 第一次检查（锚点→锚点+40px 瞄准向）被墙挡，其余通 → 全体 = rot(v) − v
    const shots = tsunamiFanShots(0, 0, 0, 0, 10, 0,
      (x1, _y1, x2) => !(x1 === 0 && x2 === 40), LOS_CLEAR);
    expect(shots.length).toBe(5);
    shots.forEach((s, i) => {
      const th = (Math.PI / 10) * (i - 2);
      expect(s.x).toBeCloseTo(40 * Math.cos(th) - 40, 6);   // rot(v) − 40px 瞄准向
      expect(s.y).toBeCloseTo(40 * Math.sin(th), 6);
    });
  });

  it('CanHitLine(中心→出生点−速度) 失败 → 仅该矢向心回拉 15px（:47152-47155）', () => {
    // 第二次检查对中矢 i=2（出生点 (40,0)−速度(10,0)=(30,0)）挡，其余通
    const shots = tsunamiFanShots(0, 0, 0, 0, 10, 0, LOS_CLEAR,
      (_x1, _y1, x2, y2) => !(Math.abs(x2 - 30) < 1e-6 && Math.abs(y2) < 1e-6));
    const blocked = shots[2];
    expect(Math.hypot(blocked.x, blocked.y)).toBeCloseTo(40 - 15, 6);   // 40px 半径内缩 15
    for (const i of [0, 1, 3, 4]) {
      expect(Math.hypot(shots[i].x, shots[i].y)).toBeCloseTo(40, 6);    // 其余不回拉
    }
  });
});

// ---------------------------------------------------------------------------
// ④ 暮夕 4953 第 3 发强化（:47307-47315）
// ---------------------------------------------------------------------------
describe('④ eventideShotSpec 暮夕逐发规格（:47307-47315）', () => {
  it('第 3 发（扇位 num60==2）→ 932 月总矢 + 伤×2（:47307-47310）', () => {
    expect(eventideShotSpec(2, 41, 50, 10)).toMatchObject({ pid: 932, dmg: 100, spd: 20 });
  });

  it('其余 4 发保持弹药弹型/伤害/速度（:47317-47320 noDropItem 档）', () => {
    for (const idx of [0, 1, 3, 4]) {
      expect(eventideShotSpec(idx, 41, 50, 10)).toMatchObject({ pid: 41, dmg: 50, spd: 10 });
    }
  });

  it('木箭（PickAmmo 已换 932 :52668）：全 5 发速×2（:47313-47315），第 3 发再 ×2 伤', () => {
    for (const idx of [0, 1, 3, 4]) {
      expect(eventideShotSpec(idx, 932, 50, 10)).toMatchObject({ pid: 932, dmg: 50, spd: 20 });
    }
    expect(eventideShotSpec(2, 932, 50, 10)).toMatchObject({ pid: 932, dmg: 100, spd: 20 });
  });
});

// ---------------------------------------------------------------------------
// ⑤ Archery 药水作用域（:9711-9712 → bowEffectiveDamage :3820-3822 仅箭族）
// ---------------------------------------------------------------------------
describe('⑤ Archery 作用域（:9711-9712/:3820-3824）', () => {
  it('射手 16：仅箭族分道 ×1.1；damageMult(\'ranged\')/弹/火箭/其他不吃（旧实现全吃=❌）', () => {
    const p = mkPlayer();
    p.buffs.apply(BuffType.Archery, 60);
    expect(p.damageMult('ranged')).toBe(1);                    // :9711 只进 arrowDamage
    expect(p.rangedDamageMult('arrow')).toBeCloseTo(1.1, 6);   // bowEffective :3820
    expect(p.rangedDamageMult('bullet')).toBe(1);              // gunEffective :3822 不含
    expect(p.rangedDamageMult('rocket')).toBe(1);              // specialistEffective :3824 不含
    expect(p.rangedDamageMult('other')).toBe(1);               // 飞镖等 rangedDamage 裸档
  });

  it('无射手时箭族分道恒 1（不回归）', () => {
    const p = mkPlayer();
    expect(p.rangedDamageMult('arrow')).toBe(1);
    expect(p.damageMult('ranged')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 省弹四档独立旗 + magicQuiver/熔火箭袋装备旗（:52743/:52791-52804/:14049-14052）
// ---------------------------------------------------------------------------
describe('⑥ 省弹档聚合（equipStats.ammoSave* 四布尔）', () => {
  it('叶绿头 1002 → chloro 1/5、蘑菇矿胸 1549 → cost80 1/5：并戴两档同时成立（:52795/:52799）', () => {
    const p = mkPlayer();
    p.inv.armor[0] = { id: _iid(1002), stack: 1 };
    p.inv.armor[1] = { id: _iid(1549), stack: 1 };
    const es = p.equipStats;
    expect(es.ammoSaveChloro).toBe(true);
    expect(es.ammoSaveCost80).toBe(true);
    expect(es.ammoSaveHuntress).toBe(false);
    expect(es.ammoSaveCost75).toBe(false);
  });

  it('星旋胸 2758 → cost75 1/4（:13486）；换装后旧档退场', () => {
    const p = mkPlayer();
    p.inv.armor[1] = { id: _iid(2758), stack: 1 };
    expect(p.equipStats.ammoSaveCost75).toBe(true);
    p.inv.armor[1] = { id: _iid(3804), stack: 1 };   // 女猎手护甲 → huntress 1/10（:12757）
    expect(p.equipStats.ammoSaveCost75).toBe(false);
    expect(p.equipStats.ammoSaveHuntress).toBe(true);
  });

  it('魔法箭袋 1321 → quiver 旗（magicQuiver，:52708/:52743 消费）；熔火箭袋 4002 → moltenQuiver（:14052）', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: _iid(1321), stack: 1 };
    expect(p.equipStats.quiver).toBe(true);
    expect(p.equipStats.moltenQuiver).toBe(false);
    p.inv.armor[4] = { id: _iid(4002), stack: 1 };
    expect(p.equipStats.moltenQuiver).toBe(true);   // 木箭→火矢 +2 伤链（:52702-52705）
    expect(p.equipStats.quiver).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑦ 吹管族身体行恒 2（:35989-35992）
// ---------------------------------------------------------------------------
describe('⑦ useStyleBodyRow 吹管族恒行 2（:35989-35992）', () => {
  const proto = Renderer.prototype as unknown as {
    useStyleBodyRow(s: { t: number; dur: number; item?: number; useStyle?: number; aim?: number },
      pl: { facing: number; gravDir?: number }): number;
  };
  const call = (swing: Parameters<typeof proto.useStyleBodyRow>[0]): number =>
    proto.useStyleBodyRow.call(Object.create(Renderer.prototype), swing, { facing: 1 });

  it('吹箭筒 281 / 吹箭枪 986：使用中恒行 2（陡指向也不跳行 4）', () => {
    for (const vid of [281, 986]) {
      expect(call({ t: 10, dur: 30, item: _iid(vid), useStyle: 5, aim: 2.5 })).toBe(2);
      expect(call({ t: 10, dur: 30, item: _iid(vid), useStyle: 5, aim: 0 })).toBe(2);
    }
  });

  it('其余 useStyle 5 武器不回归：同姿态仍走 itemRotation 档（aim 2.5 → 行 4）', () => {
    expect(call({ t: 10, dur: 30, item: _iid(2624), useStyle: 5, aim: 2.5 })).toBe(4);
    expect(call({ t: 10, dur: 30, item: _iid(2624), useStyle: 5, aim: 0 })).toBe(3);
  });
});
