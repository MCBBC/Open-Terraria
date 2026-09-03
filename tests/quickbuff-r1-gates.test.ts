// R1 红队 quickBuff 三缺口回归锁（Game.quickBuff 区——2026-09-03 蓝队清偿）：
//   F2(MAJOR) 入口门缺 cursed||CCed（QuickBuff 1457 Player.cs:5762 / QuickHeal :5495 /
//             QuickMana :5592——门序 pending||cursed||CCed||dead||...）
//   F3(MAJOR) 食物挑选门丢"+1"严格更高档（QuickBuff_PickBestFoodItem :5912-5957：
//             现役扫描 :5921-5923 `if (num <= num2) num = num2 + 1` → 受理 :5933/:5948
//             `num3 >= num` = 必须严格高于现役最高档；同档比 buffTime 长者胜）
//   F11(MINOR) 耗魔未乘 manaCost（QuickBuff_ShouldUseItem :5875/:5878
//             `(int)((float)item.mana * manaCost)` f32 乘后 int 截断）
// Game 构造重（renderer/canvas）不可单测实例化：F3 走 quickBuffPickFood 决策核
// （quickBuff 调用同一函数,非镜像复制）；F2 走载体面（Player.cced + vanillaBuff 映射）；
// F11 走系数源契约（equipStats 中性默认档 + 折扣档 int 截断）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType, BUFF_DEFS } from '../src/stats/Buffs';

const pickFood = (Game as unknown as {
  quickBuffPickFood: (actives: number[], cands: Array<{ prio: number; time: number }>) => number;
}).quickBuffPickFood.bind(Game);

const mk = () => new Player(0, 0, new Inventory());

describe('F3 QuickBuff_PickBestFoodItem +1 严格更高档（1457 :5912-5957）', () => {
  it('无现役食物：全档放行，最高档胜（与槽序无关）', () => {
    expect(pickFood([], [{ prio: 1, time: 60 }, { prio: 3, time: 60 }, { prio: 2, time: 60 }])).toBe(1);
    expect(pickFood([], [{ prio: 3, time: 60 }, { prio: 2, time: 60 }, { prio: 1, time: 60 }])).toBe(0);
  });
  it('★F3 锁定：现役档 2 在身 → 同档 2 拒、档 1 拒、档 3 受（同档不重食）', () => {
    const actives = [2];   // WellFed2（vanilla 206 → 档 2）
    expect(pickFood(actives, [{ prio: 2, time: 9999 }])).toBe(-1);   // 同档拒
    expect(pickFood(actives, [{ prio: 1, time: 9999 }])).toBe(-1);   // 低档拒
    expect(pickFood(actives, [{ prio: 3, time: 1 }])).toBe(0);       // 更高档受
  });
  it('现役档 3 在身：食物无档 4 → 全拒不吃（原版 :5933 num3>=4 恒假）', () => {
    expect(pickFood([3], [{ prio: 3, time: 9999 }, { prio: 2, time: 9999 }, { prio: 1, time: 9999 }])).toBe(-1);
  });
  it('受理后 num=选中档：同档比 buffTime 长者胜（:5933/:5948 tie-break）', () => {
    expect(pickFood([], [{ prio: 2, time: 100 }, { prio: 2, time: 300 }])).toBe(1);
    expect(pickFood([], [{ prio: 2, time: 300 }, { prio: 2, time: 100 }])).toBe(0);
  });
  it('更高档恒胜，即使 buffTime 更短（num3 > num 或门支）', () => {
    expect(pickFood([], [{ prio: 2, time: 9999 }, { prio: 3, time: 1 }])).toBe(1);
  });
  it('非食物现役（档 0）只把下限 0→1，对档 >=1 食物受理面等价（:5921-5923 字面语义）', () => {
    expect(pickFood([0, 0], [{ prio: 1, time: 60 }])).toBe(0);
  });
  it('档 0 候选恒拒（受理门 num3 > 0——非食物不入流）', () => {
    expect(pickFood([], [{ prio: 0, time: 60 }, { prio: 1, time: 60 }])).toBe(1);
  });
});

describe('F2 入口门载体：CCed 三件套 + cursed（1457 :5762/:5495/:5592）', () => {
  it('Player.cced 初值 false；Frozen 置 true（CCed 属性 :3361-3372 frozen||webbed||stoned）', () => {
    const p = mk();
    expect(p.cced).toBe(false);
    p.buffs.apply(BuffType.Frozen, 30);
    expect(p.cced).toBe(true);
  });
  it('Stoned / Webbed 各自独立置 cced', () => {
    const ps = mk();
    ps.buffs.apply(BuffType.Stoned, 30);
    expect(ps.cced).toBe(true);
    const pw = mk();
    pw.buffs.apply(BuffType.Webbed, 30);
    expect(pw.cced).toBe(true);
  });
  it('★Cursed 不入 cced——诅咒是三门各自的独立门（buff 23 → cursed=true :11819-11823）', () => {
    const p = mk();
    p.buffs.apply(BuffType.Cursed, 30);
    expect(p.cced).toBe(false);
    expect(p.buffs.has(BuffType.Cursed)).toBe(true);
  });
  it('vanillaBuff 映射锚：Cursed=23 / Frozen=47 / Webbed=149 / Stoned=156', () => {
    expect(BUFF_DEFS[BuffType.Cursed].vanillaBuff).toBe(23);
    expect(BUFF_DEFS[BuffType.Frozen].vanillaBuff).toBe(47);
    expect(BUFF_DEFS[BuffType.Webbed].vanillaBuff).toBe(149);
    expect(BUFF_DEFS[BuffType.Stoned].vanillaBuff).toBe(156);
  });
});

describe('F11 耗魔系数源契约：(1-manaCostOff)×manaCostMul + int 截断（:5875/:5878）', () => {
  // 与 Game.quickBuff tryBuffs :10075 同式——系数源 = equipStats 同源等价式
  // （equipStats 为冻结对象,折扣档用结构等价系数面注入）
  const costOf = (eq: { manaCostOff: number; manaCostMul: number }, mana: number): number =>
    Math.trunc(mana * (1 - eq.manaCostOff) * eq.manaCostMul);
  it('默认档（mul 1 / off 0）= 原版 manaCost 1f：门与扣恒全额', () => {
    const p = mk();
    expect(p.equipStats.manaCostMul).toBe(1);
    expect(p.equipStats.manaCostOff).toBe(0);
    expect(costOf(p.equipStats, 20)).toBe(20);
  });
  it('折扣档（魔力花族加算池 :14040）→ int 截断：20×0.92=18.4→18（(int) 强转语义）', () => {
    expect(costOf({ manaCostOff: 0.08, manaCostMul: 1 }, 20)).toBe(18);
    expect(costOf({ manaCostOff: 0.08, manaCostMul: 1 }, 10)).toBe(9);   // 9.2 → 9
  });
});
