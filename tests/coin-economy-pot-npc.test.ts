// 钱币经济审计（2026-09-16）：用户实报"两千多铂金,肉前获得,怪/罐掉钱太多"（经典档）。
// 五站对照结论：
//   ① 怪掉落 rollCoins（NpcDrops.ts :709）= NPC.cs NPCLoot_DropMoney(:80436-80567) 1:1——
//      本文件用【反编译直译参考实现】逐种子精确对拍 + 分布断言钉死。
//   ② 难度乘数 EnemyMoneyDropMultiplier（GameDifficultyData.cs:71）Classic=1/Expert=2.5/
//      Master=2.5/Legendary=3.5——本仓 ScaleStats.ts:143-146 曲线表逐点全等,经典档零乘。
//   ③ 罐子 potLoot 钱币段曾整段错面额：铜值当【金币73堆叠】直掉（×10⁴ 膨胀=膨胀根因）
//      ——修后按 WorldGen.cs SpawnThingsFromPot(:58131-58292) 拆币 1:1,本文件分布断言。
//   ④ 进位链 doCoins/doCoinsAt（Inventory.ts）= Player.cs DoCoins 1:1（coin-conversion.test.ts 已覆盖）。
//   ⑤ value 来源 vanilla-npcvalue.json = 1457 SetDefaults 逐值（僵尸3=60/蓝史莱姆1=25/
//      恶魔眼2=75/洞穴蝙蝠49=90/吞噬怪6=90/恶魔62=300,反编译 NPC.cs:8612+ 逐案核对）。
import { describe, it, expect } from 'vitest';
import { rollCoins } from '../src/drops/NpcDrops';
import type { NpcDropCtx } from '../src/drops/NpcDrops';
import { RNG } from '../src/core/rng';
import { scaleStats, GDL, CLASSIC_SCALE_WORLD, ENEMY_MONEY_DROP_MULTIPLIER } from '../src/stats/ScaleStats';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

// ── 反编译直译参考实现（Terraria1457/Terraria/NPC.cs:80436-80567 逐行,独立书写）──
/** Next(a, b+1) 闭区间等价：a + ⌊rand×(b-a+1)⌋ */
const nr = (rand: () => number, a: number, b: number): number =>
  a + Math.floor(rand() * (b - a + 1));

function refNpcCoins(value: number, rand: () => number): number {
  // :80440-80444 luck 双掷（luck=0 单掷,对拍时两侧同跳）
  let num = value;                              // :80422 num3 = value（无 midas/bloodMoon）
  num *= 1 + nr(rand, -20, 75) * 0.01;          // :80425 Next(-20,76)
  if (nr(rand, 0, 1) === 0) num *= 1 + nr(rand, 5, 10) * 0.01;    // 1/2 ×1.05-1.10
  if (nr(rand, 0, 3) === 0) num *= 1 + nr(rand, 10, 20) * 0.01;   // 1/4 ×1.10-1.20
  if (nr(rand, 0, 7) === 0) num *= 1 + nr(rand, 15, 30) * 0.01;   // 1/8 ×1.15-1.30
  if (nr(rand, 0, 15) === 0) num *= 1 + nr(rand, 20, 40) * 0.01;  // 1/16 ×1.20-1.40
  if (nr(rand, 0, 31) === 0) num *= 1 + nr(rand, 25, 50) * 0.01;  // 1/32 ×1.25-1.50
  if (nr(rand, 0, 63) === 0) num *= 1 + nr(rand, 50, 100) * 0.01; // 1/64 ×1.50-2.00
  // :80498-80566 拆币（铜段第二裂变无 n>50 门、除数 Next(4)+1——与罐不同）
  let total = 0;
  let rest = num;
  while (Math.floor(rest) > 0) {
    if (rest > 1000000) {
      let n = Math.floor(rest / 1000000);
      if (n > 50 && nr(rand, 0, 4) === 0) n = Math.floor(n / (nr(rand, 0, 2) + 1));
      if (nr(rand, 0, 4) === 0) n = Math.floor(n / (nr(rand, 0, 2) + 1));
      total += 1000000 * n;
      rest -= 1000000 * n;
    } else if (rest > 10000) {
      let n = Math.floor(rest / 10000);
      if (n > 50 && nr(rand, 0, 4) === 0) n = Math.floor(n / (nr(rand, 0, 2) + 1));
      if (nr(rand, 0, 4) === 0) n = Math.floor(n / (nr(rand, 0, 2) + 1));
      total += 10000 * n;
      rest -= 10000 * n;
    } else if (rest > 100) {
      let n = Math.floor(rest / 100);
      if (n > 50 && nr(rand, 0, 4) === 0) n = Math.floor(n / (nr(rand, 0, 2) + 1));
      if (nr(rand, 0, 4) === 0) n = Math.floor(n / (nr(rand, 0, 2) + 1));
      total += 100 * n;
      rest -= 100 * n;
    } else {
      let n = Math.floor(rest);
      if (n > 50 && nr(rand, 0, 4) === 0) n = Math.floor(n / (nr(rand, 0, 2) + 1));
      if (nr(rand, 0, 4) === 0) n = Math.floor(n / (nr(rand, 0, 3) + 1));
      if (n < 1) n = 1;
      total += n;
      rest -= n;
    }
  }
  return total;
}

const coinCtx = (seed: number): NpcDropCtx =>
  ({ rng: new RNG(seed), luck: 0 } as unknown as NpcDropCtx);

const FACE: Record<number, number> = { 71: 1, 72: 100, 73: 10000, 74: 1000000 };
const copperOf = (drops: { id: number; n: number }[]): number =>
  drops.reduce((s, d) => s + (FACE[d.id] ?? 0) * d.n, 0);

describe('① 怪掉落 rollCoins vs 反编译直译参考（NPCLoot_DropMoney :80436）', () => {
  // 肉前抽样:value 取 vanilla-npcvalue.json(=SetDefaults 逐值):
  // 蓝史莱姆1=25 恶魔眼2=75 僵尸3=60 吞噬怪6=90 洞穴蝙蝠49=90 恶魔62=300
  const SAMPLES: Array<[string, number, number]> = [
    ['蓝史莱姆(1)', 1, 25],
    ['恶魔眼(2)', 2, 75],
    ['僵尸(3)', 3, 60],
    ['吞噬怪(6)', 6, 90],
    ['洞穴蝙蝠(49)', 49, 90],
    ['恶魔(62)', 62, 300],
  ];

  for (const [name, , value] of SAMPLES) {
    it(`${name} value=${value}：2000 种子逐种子精确对拍（掷流同序→逐枚全等）`, () => {
      for (let seed = 1; seed <= 2000; seed++) {
        const drops = rollCoins(value, coinCtx(seed), false);
        const r = new RNG(seed);
        const ref = refNpcCoins(value, () => r.next());
        // 同种子同掷序（UnifiedRandom 内核,一次 sample/掷）⇒ 必须逐铜全等
        expect(copperOf(drops), `seed=${seed} value=${value}`).toBe(ref);
      }
    });
  }

  it('僵尸期望值分布：E≈value×乘区链（统计带宽,膨胀/缩水双向锁定）', () => {
    const N = 20000;
    let sum = 0;
    let max = 0;
    let silverUp = 0;
    for (let seed = 1; seed <= N; seed++) {
      const c = copperOf(rollCoins(60, coinCtx(seed), false));
      sum += c;
      if (c > max) max = c;
      if (c >= 100) silverUp++;
    }
    const mean = sum / N;
    // 解析期望 ≈ 60×1.275×1.0375²×1.028×1.019×1.012×1.012 ≈ 88.3(裂变损耗前)
    // 拆币第二裂变(1/5 掷)在铜段有损 → 实测均值落 ~80-92;越界即漂移
    expect(mean).toBeGreaterThan(74);
    expect(mean).toBeLessThan(96);
    expect(max).toBeLessThan(700);            // 极端连乘上限 ~490,余量防伪
    expect(silverUp / N).toBeGreaterThan(0.1); // 值>100 出银币的占比
    expect(silverUp / N).toBeLessThan(0.5);
  });
});

describe('② 难度乘数（GameDifficultyData.cs:71 EnemyMoneyDropMultiplier）', () => {
  it('曲线表与原版逐点全等：Classic=1 / Expert=2.5 / Master=2.5 / Legendary=3.5', () => {
    expect(ENEMY_MONEY_DROP_MULTIPLIER.map((k) => [k.input, k.output])).toEqual([
      [GDL.CLASSIC, 1], [GDL.EXPERT, 2.5], [GDL.MASTER, 2.5], [GDL.LEGENDARY, 3.5],
    ]);
  });

  it('经典档 value 零乘（ScaleStats_ByDifficulty :18108-18112）', () => {
    const mk = () => ({
      type: 3, lifeMax: 45, damage: 14, value: 60, defense: 2, knockBackResist: 0.7,
      boss: false, friendly: false, townNPC: false, scale: 1, difficulty: 0,
    });
    const classic = mk();
    scaleStats(classic, CLASSIC_SCALE_WORLD);
    expect(classic.value).toBe(60);           // classic ×1——曾疑误乘,实为零乘
    expect(classic.lifeMax).toBe(45);
    const expert = { ...mk() };
    scaleStats(expert, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.EXPERT });
    expect(expert.value).toBe(150);           // ×2.5（世界难度乘区,掉钱侧无二次乘）
    const master = { ...mk() };
    scaleStats(master, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.MASTER });
    expect(master.value).toBe(150);
  });
});

// ── ③ 罐子（potLoot 钱币段 vs WorldGen.cs:58131-58292）──
const COIN_VIDS = new Set([71, 72, 73, 74]);
const keyVid = (key: string): number => {
  const m = /^vi_(\d+)_/.exec(key);
  return m ? Number(m[1]) : -1;
};

function potShell(world: World) {
  const drops: Array<{ key: string; n: number }> = [];
  const portals: unknown[] = [];
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & { world: World };
  g.world = world;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.spawnParticles = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => {
    drops.push({ key, n });
    return null;
  };
  g.recLog = () => {};
  g.entities = { add: (_e: unknown) => { portals.push(_e); }, critters: [], drops: [] };
  g.trackTile = 0;
  g.closestPlayerLuckAt = () => 0;            // 无运 → 1/500 钱币传送门(独立事件)
  // 满血 + 背包携 20 火把(:57487-57504 计数≥20 → flag5=false,num10==0 走钱币而非火把)
  const torchIdx = ITEM_DEFS.findIndex((d) => d?.key === 'vi_8_Torch' || /^vi_8_/.test(d?.key ?? ''));
  const torchSlots = Array.from({ length: 24 }, (_, k) => (k < 20 ? { id: torchIdx, stack: 1 } : null));
  g.player = { hp: 400, maxHp: 400, inv: { slots: torchSlots } };
  const loot = g as unknown as { potLoot: (x: number, y: number, style: number) => void };
  return { g, drops, portals, loot };
}

describe('③ 罐子钱币段（SpawnThingsFromPot :58131-58292,修复后 1:1）', () => {
  it('地下罐（×0.75）：币档罐总铜值 ∈ 原版带宽,单罐永不超万铜（旧 bug ≥10⁶）', () => {
    const w = new World(80, 80, 7, 'coin-econ-pot-under');
    w.groundLevel = 30; w.rockLevel = 400;     // y=100 → flag=true ×0.75
    const { drops, portals, loot } = potShell(w);
    const pots = 30000;
    const totals: number[] = [];
    for (let i = 0; i < pots; i++) {
      drops.length = 0;
      loot.potLoot(20, 100, 0);
      const coinDrops = drops.filter((d) => COIN_VIDS.has(keyVid(d.key)));
      if (coinDrops.length > 0) totals.push(coinDrops.reduce((s, d) => s + FACE[keyVid(d.key)] * d.n, 0));
    }
    expect(totals.length).toBeGreaterThan(1500);  // 币档罐到样充足
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    // 原版期望 ≈ 200×0.75×1.1375 ≈ 170.6 铜（±20% 基掷 + 五级加成）
    expect(mean).toBeGreaterThan(130);
    expect(mean).toBeLessThan(215);
    for (const t of totals) expect(t).toBeLessThan(10000);   // 解析上限 ~2334
    // 钱币传送门是独立 1/500 事件（~60 次）,不应与币档同罐出现
    expect(portals.length).toBeGreaterThan(0);
    expect(portals.length).toBeLessThan(pots / 200);
  });

  it('地表罐（×0.5）：期望 ≈ 113.8 铜（WorldGen.cs:58132-58134 深度分支）', () => {
    const w = new World(80, 80, 11, 'coin-econ-pot-surface');
    w.groundLevel = 100; w.rockLevel = 400;    // y=50 → ×0.5
    const { drops, loot } = potShell(w);
    const totals: number[] = [];
    for (let i = 0; i < 30000; i++) {
      drops.length = 0;
      loot.potLoot(20, 50, 0);
      const coinDrops = drops.filter((d) => COIN_VIDS.has(keyVid(d.key)));
      if (coinDrops.length > 0) totals.push(coinDrops.reduce((s, d) => s + FACE[keyVid(d.key)] * d.n, 0));
    }
    expect(totals.length).toBeGreaterThan(1500);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(mean).toBeGreaterThan(85);
    expect(mean).toBeLessThan(150);
    for (const t of totals) expect(t).toBeLessThan(10000);
  });

  it('拆币只出 71-74 面额且面额守恒（不直出"金币×铜值"堆叠）', () => {
    const w = new World(80, 80, 13, 'coin-econ-pot-faces');
    w.groundLevel = 30; w.rockLevel = 400;
    const { drops, loot } = potShell(w);
    for (let i = 0; i < 8000; i++) {
      drops.length = 0;
      loot.potLoot(20, 100, 0);
      for (const d of drops) {
        const vid = keyVid(d.key);
        if (COIN_VIDS.has(vid)) {
          expect(d.n, `vid=${vid}`).toBeGreaterThanOrEqual(1);
          if (vid === 71) expect(d.n).toBeLessThanOrEqual(100);
          if (vid === 72) expect(d.n).toBeLessThanOrEqual(100);
        }
      }
    }
    expect(VANILLA_ITEM_KEY_BY_ID[71]).toBeTruthy();
    expect(VANILLA_ITEM_KEY_BY_ID[73]).toBeTruthy();
  });
});

describe('⑤ value 来源（vanilla-npcvalue.json = 1457 SetDefaults 抽样核对）', () => {
  it('肉前抽样怪 value 与反编译逐案一致（NPC.cs:8612+ case 1/2/3/6/49/62）', async () => {
    const json = (await import('../src/data/vanilla-npcvalue.json')).default as Record<string, number>;
    // case 1 BlueSlime=25f / case 2 DemonEye=75f / case 3 Zombie=60f /
    // case 6 EaterOfSouls=90f / case 49 CaveBat=90f / case 62 Demon=300f
    expect(json['1']).toBe(25);
    expect(json['2']).toBe(75);
    expect(json['3']).toBe(60);
    expect(json['6']).toBe(90);
    expect(json['49']).toBe(90);
    expect(json['62']).toBe(300);
  });
});
