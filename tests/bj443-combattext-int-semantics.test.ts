// BJ443 伤害飘字出现小数（用户实报：红色飘字 "1.4333333333333333"，位图字体
// '.' 窄字形视觉成空格读作 "1 4333333333333333"）。
//
// 定谳（原版锚）：
//   · CombatText.NewText(Rectangle, Color, int amount, …)（CombatText.cs:59）——
//     C# int 形参强制整数化，文本 = amount.ToString() 恒整数；
//   · 调用侧 NPC.StrikeNPC_Inner `int num = (int)Math.Max(1.0, …)`（NPC.cs:82067）、
//     Player.Hurt `(int)num2`（Player.cs:38671）——全部先向零截断再传入。
// 根因链（本仓唯一浮点源）：Buffs.tick 蜂蜜流率对冲 cancel（Buffs.ts，
// honeyOffsetAccum += 2×dt 浮点累加）→ dotChunkOut 携分数 → Player.fixedUpdate
// DoT 分块飘字（Player.cs HurtLifeRegen 语义）+ 同源浮点流入 hp 真值面（登记债）。
//
// 修两层：
//   ① 兜底层 Game.addDamageNumber 入口 Math.trunc（原版 int 形参语义，向零截断）；
//   ② 根因层·显示面 Player.ts consumeDotChunk 调用点截断【在 dot>0 门之前】——
//      C# 的截断发生在调用侧，门看到的是截后值；分数块（0<x<1）若过门后截断会
//      冒出 "0" 飘字（原版蜂蜜对冲=延迟弹出，无弹无字）。
// ★BJ447（2026-10-03）：真值面整数化收官——Buffs.tick 蜂蜜对冲改整数位账
//   （honeyOffsetUnits,+4 单位/tick 整数计提 + 整 HP 差额延迟弹出,原版
//   lifeRegen(:1919 int)/lifeRegenCount(:1921 int) 同构）,浮点源头消除,①②
//   双截断保留为兜底（对整数输入恒等）。本文件 ② 的夹具探针已按新 oracle 重产
//   （旧探针 `raws.some(!isInteger)` 锁的是浮点 dust 本身=病灶,非金标）。
// 本测试①用 Game 原型壳直判入口截断；②用真实 Player.fixedUpdate + fakeHooks
// 捕获调用点出参（绕开入口层，独立判别调用点截断）。
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { BuffType } from '../src/stats/Buffs';

// ---- ① 兜底层：Game.addDamageNumber 入口 int 语义（CombatText.cs:59） ----

interface DmgShell {
  dmgNumbers: Array<{ value: number; crit: boolean; dot: boolean; color: string }>;
}

const addNum = (amount: number, crit = false, dot = false) => {
  const shell = Object.create(Game.prototype) as unknown as DmgShell & {
    addDamageNumber: (x: number, y: number, a: number, c: boolean, col?: string, d?: boolean) => void;
  };
  shell.dmgNumbers = [];
  shell.addDamageNumber(0, 0, amount, crit, '#FFF', dot);
  return shell.dmgNumbers[0];
};

describe('BJ443 兜底层：addDamageNumber 入口向零截断（原版 int 形参语义）', () => {
  it('用户实报值 1.4333333333333333 → 文本 "1"（截断非四舍五入）', () => {
    const d = addNum(1.4333333333333333);
    expect(d.value).toBe(1);
    expect(String(d.value)).toBe('1');
  });

  it('round/floor 会错的值：1.7→1（非 2）、2.0000001→2', () => {
    // Math.round(1.7)=2 会与原版 (int) 截断分叉
    expect(addNum(1.7).value).toBe(1);
    expect(addNum(2.0000001).value).toBe(2);
  });

  it('负值边界：向零截断（C# 语义），floor 会错（-3.7 应 -3 非 -4）', () => {
    expect(addNum(-3.7).value).toBe(-3);   // dd2 塔自疗传负 heal
    expect(addNum(-0.5).value).toBe(-0);   // 向零，非 floor 的 -1
    expect(Object.is(addNum(-0.5).value, -0)).toBe(true);
  });

  it('0/小数边界：0.9→0、0→0', () => {
    expect(addNum(0.9).value).toBe(0);
    expect(addNum(0).value).toBe(0);
  });

  it('普通整数调用逐字节不变（crit/dot 形态各验一）', () => {
    expect(addNum(4333).value).toBe(4333);
    expect(addNum(4333, true).value).toBe(4333);
    expect(addNum(4333, false, true).value).toBe(4333);
    expect(addNum(100, true, false).value).toBe(100);
    expect(addNum(1).value).toBe(1);
  });
});

// ---- ② 根因层·显示面：DoT 分块飘字调用点截断（Player.ts，门在截后值上） ----

const fakeHooks = (w: World, p: Player, captured: number[]) => ({
  world: w,
  player: p,
  enemies: () => [],
  critters: () => [],
  spawnDrop: () => null,
  damagePlayer: (): number => 0,
  addDamageNumber: (_x: number, _y: number, a: number) => { captured.push(a); },
  cutTile: () => {},
  onEnemyKilled: () => {},
  spawnEnemy: () => {},
  spawnParticles: () => {},
  notifyInventoryChanged: () => {},
  playSfx: () => {},
  playSfxFiles: () => {},
  showPickupLabel: () => {},
});

describe('BJ443 根因层：Burning+Honey DoT 分块飘字恒整数（调用点截断在门之前）', () => {
  it('dotChunkOut 携分数时飘字仍全整数且无 "0" 字（分数块不冒字）', () => {
    const w = new World(60, 60, 42, 'bj443');
    const p = new Player(20 * 16, 27 * 16, new Inventory());
    p.buffs.apply(BuffType.Burning, 30);   // −30 HP/s，块 5（DOT_CHUNK）——分数对冲可判别
    p.buffs.apply(BuffType.Honey, 30);     // 整数位对冲 2HP/s（BJ447）+ flat 1HP/s

    // 夹具有效性探针：包一层 consumeDotChunk 记录原始（未截断）分块值
    const raws: number[] = [];
    const orig = p.buffs.consumeDotChunk.bind(p.buffs);
    (p.buffs as { consumeDotChunk: () => number }).consumeDotChunk = () => {
      const c = orig();
      raws.push(c);
      return c;
    };

    const captured: number[] = [];
    for (let i = 0; i < 300; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p, captured) as never);

    // 夹具确实踩中了蜂蜜对冲路径（★BJ447 后 oracle 重产）：对冲按原版 +4 单位/tick
    // （Player.cs:19214,120 单位=1HP）延迟兑付——Burning 块 5 在兑付拍被抵减为 4,
    // 且全流程原始分块恒整数（旧浮点 cancel=2×dt 携分数已被 BJ447 整数化消除）
    expect(raws.some((c) => c < 5)).toBe(true);
    for (const r of raws) expect(Number.isInteger(r)).toBe(true);
    // 至少有一块真实弹出（否则判别力为零）
    expect(captured.length).toBeGreaterThanOrEqual(1);
    // 判别面：调用点出参全部整数（修复前此处出 4.666666666666667 → 红）
    for (const v of captured) expect(Number.isInteger(v)).toBe(true);
    // 无 "0" 飘字：分数块（0<x<1）过门即被截断在门内（修复前冒 "0" 字）
    for (const v of captured) expect(v).not.toBe(0);
    // 显示值 = 截断(原始分块)（非 round——原版 (int) 语义）
    for (const v of captured) {
      const raw = raws.find((r) => Math.trunc(r) === v);
      expect(raw).toBeDefined();
    }
  });

  it('无蜂蜜时整数块原样透传（不伤既有整数路径）', () => {
    const w = new World(60, 60, 42, 'bj443b');
    const p = new Player(20 * 16, 27 * 16, new Inventory());
    p.buffs.apply(BuffType.Burning, 30);   // 无 Honey：块 5 恒整数
    const captured: number[] = [];
    for (let i = 0; i < 120; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p, captured) as never);
    expect(captured).toContain(5);         // DOT_CHUNK[Burning]=5 原样
    for (const v of captured) expect(Number.isInteger(v)).toBe(true);
  });
});
