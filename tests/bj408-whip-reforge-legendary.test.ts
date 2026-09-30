// ★BJ408（2026-09-29）：月总掉落鞭「私有物」（vid 5480,en Possession;zh wiki 别名
// 支配之鞭）重铸最佳修饰语误判「巨大」——真值=「传奇」（Legendary,81）。
// 定谳锚（1457 反编译直读）：
//   · 物品身份: ItemID.cs:12506 `MoonLordWhip = 5480`;zh-Hans Items.json:5720
//     "MoonLordWhip":"私有物"/en-US "Possession";月总宝藏袋 Player.cs:7756
//     {3063,3389,3065,1553,3930,3541,3570,3571,3569,5480} pick2（本仓
//     vanilla-bossbags.json 同表全等）。
//   · SetDefaults: Item.cs:43188 case 5480 → DefaultToWhip(1035,110,4f,4f)+
//     useStyle=5（DefaultToWhip :47811-47826：damage/kb/useTime=useAnimation=anim
//     缺省 30/shoot/noMelee=true/summon=true/noUseGraphic=true）。
//   · 池分类: GetRollablePrefixes（Item.cs:1102-1131）【顺序判定】SwordsHammersAxesPicks
//     先于 Summon——PrefixLegacy.cs:81（218 id,含全 18 鞭）→ 鞭子池 =
//     PrefixesForSwords（非召唤池;Summon set 46 id 零鞭）。18 鞭 census 权威 =
//     Player.cs:49150 鞭 use 分支 id 全表。
//   · 最优档: BestPrefixValue（Item.cs:1083-1099）= 池内 TryGet 通过档 value 最大;
//     PrefixesForSwords 内 81 Legendary value 3.5205 > 59 Godly 3.3459 > 37/60…
//     → best=传奇（zh l10n Prefix.Legendary=传奇/Prefix.Massive=巨大;useStyle=5
//     不进任何门——本版 TryGet 只读 damage/useAnimation/mana/knockBack 四面板）。
// 本仓错位层: vanilla-itemcombat.json 提取器只解析 case 内字面赋值,DefaultToWhip
//   形参链全漏 → 18 鞭仅落 noUseGraphic 一键 → 旧 stat {0,0,0,0} 把 TryGet 四门
//   全压死 → 池塌缩到 size-only 四档（1 Large 1.12/2 Massive 1.18/7 Tiny/9 Small）
//   → bestVal=1.18=「巨大」误判 topTier（用户实报 phenotype）。
// 落刀: vanillaPrefixes.prefixCombatStatForVid（鞭系经 vanilla-whips.json 回填,
//   已过 1457 recon 闸门;非鞭原样=itemCombat 面,武器面零回归）+
//   doReforge/rollNaturalPrefixForVid 同源换线（掷域与 bestVal 恒同 stat）。
// 变异证红: M1 prefixCombatStatForVid 摘鞭系回填 → ③④⑤⑦ 红;M2 doReforge 换回
//   裸 itemCombat stat → ⑥ 红+⑧ 源码钉红;M3 rollNaturalPrefixForVid 摘回填 →
//   ⑦ 红。（原子变异+逐字节还原+sha256 对拍,见 BJ408 档案）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import {
  rollablePrefixes, rollReforgePrefix, prefixStat,
  prefixValueMul, prefixTryGetFailsForItem, prefixCombatStatForVid,
  rollNaturalPrefixForVid, PREFIX_POOLS, PREFIX_ITEM_SETS,
} from '../src/data/vanillaPrefixes';
import { itemCombat } from '../src/data/vanillaItemCombat';
import whipsJson from '../src/data/vanilla-whips.json';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

/** 1457 Player.cs:49150 鞭 use 分支 18 id（全鞭族 census 金标,逐字照抄） */
const WHIP_VIDS_GOLD = [
  5688, 4672, 5473, 5474, 5475, 5476, 5477, 5478, 5479, 5480,
  5074, 4911, 4912, 4913, 4914, 4678, 4679, 4680,
];
const MOONLORD_WHIP = 5480;
const SWORDS_POOL = PREFIX_POOLS.PrefixesForSwords;

/** BestPrefixValue 同构（Item.cs:1083-1099：池内 TryGet 通过档 value 最大） */
function bestPrefixValue(pool: number[], stat?: { damage: number; useAnimation: number; mana: number; kb: number }): number {
  return pool.reduce((mx, p) =>
    prefixTryGetFailsForItem(p, stat) ? mx : Math.max(mx, prefixValueMul(p)), 0);
}

const seeded = (seed: number): (() => number) => {
  const r = new RNG(seed);
  return () => r.next();
};

beforeEach(() => { vi.restoreAllMocks(); });

// ────────────────── ① 物品身份 + 鞭 census + 回填源定谳 ──────────────────

describe('BJ408-① 身份/census（ItemID.cs:12506 + Player.cs:49150 + Item.cs:43188）', () => {
  it('vanilla-whips.json 18 键 ≡ Player.cs:49150 金标（回填源 census 全等）', () => {
    const keys = Object.keys(whipsJson as Record<string, unknown>).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([...WHIP_VIDS_GOLD].sort((a, b) => a - b));
  });

  it('5480 DefaultToWhip 实参金标（Item.cs:43190 DefaultToWhip(1035,110,4f,4f)+anim 缺省 30）', () => {
    expect(whipsJson['5480']).toEqual({ proj: 1035, dmg: 110, kb: 4, speed: 4, anim: 30 });
  });

  it('回填解析：prefixCombatStatForVid(5480) = {110,30,0,4}（TryGet 四门输入面）', () => {
    expect(prefixCombatStatForVid(MOONLORD_WHIP)).toEqual({ damage: 110, useAnimation: 30, mana: 0, kb: 4 });
  });

  it('非鞭原样=零回归前提：4788（矛）/3822（无 combat 条目,仅 width/height）不走鞭回填', () => {
    const spear = prefixCombatStatForVid(4788)!;
    expect(spear.damage).toBe((itemCombat(4788) as { damage?: number }).damage!);
    // ★清偿刀 J（2026-09-30）勘误：旧断言钉 2320「无 combat 条目」——J 刀守卫链数值
    //   面根修后 2320 战锤原生全条目（damage24/kb6/anim24/time14,Item.cs:23100-23117
    //   if(type==2320) 块,extract-itemcombat 头注⑦d）,改钉 3822（源 case 仅
    //   width/height,Item.cs:33947-33951,combat 恒 null → undefined 同旧相）。
    expect(prefixCombatStatForVid(3822)).toBeUndefined();   // itemCombat null ∧ 非鞭 → undefined 同旧相
    expect(prefixCombatStatForVid(2320)).toEqual({ damage: 24, useAnimation: 24, mana: 0, kb: 6 });
  });
});

// ────────────────── ② 池分类定谳（Item.cs:1102 顺序判定 → PrefixesForSwords） ──────────────────

describe('BJ408-② 池分类（SwordsHammersAxesPicks 先于 Summon,1457 PrefixLegacy.cs:81 全等）', () => {
  it('5480 ∈ SwordsHammersAxesPicks ∧ ∉ Summon;池 = PrefixesForSwords 同一引用', () => {
    expect(PREFIX_ITEM_SETS.SwordsHammersAxesPicks.includes(MOONLORD_WHIP)).toBe(true);
    expect(PREFIX_ITEM_SETS.Summon.includes(MOONLORD_WHIP)).toBe(false);
    expect(rollablePrefixes(MOONLORD_WHIP, false)).toBe(SWORDS_POOL);
  });

  it('全 18 鞭逐把：池 ≡ PrefixesForSwords（同引用断言=分类无漂移）', () => {
    for (const vid of WHIP_VIDS_GOLD) {
      expect(rollablePrefixes(vid, false), `whip ${vid}`).toBe(SWORDS_POOL);
    }
  });
});

// ────────────────── ③ TryGet 门判别（Item.cs:1067-1079 零值病复现对照） ──────────────────

describe('BJ408-③ TryGet 门（真 stat 放行传奇;零 stat 病灶面=旧 bestVal 1.18）', () => {
  const zeroStat = { damage: 0, useAnimation: 0, mana: 0, kb: 0 };

  it('真 stat：81 传奇/59 神级 过门（dmg 110×1.15=126.5→127≠110 等）', () => {
    const stat = prefixCombatStatForVid(MOONLORD_WHIP)!;
    expect(prefixTryGetFailsForItem(81, stat)).toBe(false);
    expect(prefixTryGetFailsForItem(59, stat)).toBe(false);
  });

  it('病灶复现（旧通道对照）：零 stat 下 81 被门杀,存活档最大=2 Massive 1.18', () => {
    expect(prefixTryGetFailsForItem(81, zeroStat)).toBe(true);      // dmg 门 round(0×1.15)==0
    expect(prefixTryGetFailsForItem(2, zeroStat)).toBe(false);      // size-only 档全过
    expect(bestPrefixValue(SWORDS_POOL, zeroStat)).toBe(prefixValueMul(2));
    expect(prefixValueMul(2)).toBeCloseTo(1.18, 5);                 // 1.18f
  });

  it('重铸掷域 3000 掷：真 stat 下 81 在掷域内（旧病=仅 size-only 四档）', () => {
    const stat = prefixCombatStatForVid(MOONLORD_WHIP)!;
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const r = rollReforgePrefix(SWORDS_POOL, seeded(MOONLORD_WHIP * 31337 + i), stat);
      expect(r).not.toBe(0);
      seen.add(r);
    }
    expect(seen.has(81)).toBe(true);
    expect(seen.has(59)).toBe(true);
  });
});

// ────────────────── ④ 最佳修饰语定谳（BestPrefixValue=3.5205 传奇档） ──────────────────

describe('BJ408-④ 私有物最佳=传奇 81（Item.cs:1083-1099;zh l10n Prefix.Legendary=传奇）', () => {
  it('bestVal 严格 ≡ prefixValueMul(81);Massive/Godly 均非 top', () => {
    const stat = prefixCombatStatForVid(MOONLORD_WHIP)!;
    const bestVal = bestPrefixValue(SWORDS_POOL, stat);
    expect(bestVal).toBe(prefixValueMul(81));            // 浮点恒等（同 f32 链）
    expect(prefixValueMul(81)).toBeGreaterThan(prefixValueMul(59));   // 传奇>神级
    expect(prefixValueMul(2)).not.toBe(bestVal);         // 巨大不再是 top
    expect(prefixValueMul(81)).toBeCloseTo(1.7602474689483643, 10);   // f32 域金标（1.15×1.1×1.1×1.15×1.1）
  });
});

// ────────────────── ⑤ 全鞭族对拍表（18 把逐鞭 best=传奇 81） ──────────────────

describe('BJ408-⑤ 全鞭族 best 对拍（18 鞭 × 池/门/best 三轴,锚 1457 census）', () => {
  it('逐鞭：stat 真值 ∧ 81 过门 ∧ bestVal ≡ value(81)', () => {
    const table: Array<{ vid: number; dmg: number; kb: number; anim: number; best: number }> = [];
    for (const vid of WHIP_VIDS_GOLD) {
      const stat = prefixCombatStatForVid(vid)!;
      expect(stat, `whip ${vid} stat`).toBeDefined();
      expect(stat.damage, `whip ${vid} damage`).toBeGreaterThan(0);
      expect(stat.useAnimation, `whip ${vid} anim`).toBeGreaterThan(0);
      expect(stat.kb, `whip ${vid} kb`).toBeGreaterThan(0);
      expect(prefixTryGetFailsForItem(81, stat), `whip ${vid} legendary gate`).toBe(false);
      expect(rollablePrefixes(vid, false), `whip ${vid} pool`).toBe(SWORDS_POOL);
      expect(bestPrefixValue(SWORDS_POOL, stat), `whip ${vid} best`).toBe(prefixValueMul(81));
      table.push({ vid, dmg: stat.damage, kb: stat.kb, anim: stat.useAnimation, best: 81 });
    }
    expect(table).toHaveLength(18);
    expect(table.filter((r) => r.best === 81)).toHaveLength(18);
  });

  it('鞭族自然掷 500 种子：dmg 档在场（旧病=仅 1/2/7/9 四档）∧ 全部 ∈ 池', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const r = rollNaturalPrefixForVid(MOONLORD_WHIP, false, seeded(i * 97 + 5));
      if (r !== 0) {
        expect(SWORDS_POOL.includes(r), `roll ${r}`).toBe(true);
        seen.add(r);
      }
    }
    expect(seen.size).toBeGreaterThan(4);              // 池未塌缩
    expect([...seen].some((p) => prefixStat(p).dmg !== 1)).toBe(true);
  });
});

// ────────────────── ⑥ doReforge 行为面（Game harness,BJ400-③ 同构） ──────────────────

const rollHook = vi.hoisted(() => ({ pick: null as null | ((pool: number[]) => number) }));
vi.mock('../src/data/vanillaPrefixes', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/data/vanillaPrefixes')>();
  const origReforge = m.rollReforgePrefix;
  return {
    ...m,
    rollReforgePrefix: (pool: number[], rand: () => number, stat?: Parameters<typeof origReforge>[2]) =>
      rollHook.pick ? rollHook.pick(pool) : origReforge(pool, rand, stat),
  };
});
beforeEach(() => { rollHook.pick = null; });

function findPossession(): { id: number } {
  for (const [, idRaw] of Object.entries(ITEM_BY_KEY)) {
    const id = Number(idRaw);
    const def = (ITEM_DEFS as unknown as Record<number, { vid?: number } | undefined>)[id];
    if (def?.vid === MOONLORD_WHIP) return { id };
  }
  throw new Error('私有物 def 未注册（vid 5480 缺席 ITEM_DEFS=掉落链断裂,另行立案）');
}

function makeGame(): { g: Record<string, unknown>; wav: string[] } {
  const wav: string[] = [];
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.player = new Player(60 * 16, 100 * 16, new Inventory());
  g.cb = {};
  g.sfx = { playWavFile: (name: string) => { wav.push(name); } };
  g.reforgeCost = () => 10;
  g.coinsOwned = () => 999999;
  g.spendCopper = () => true;
  g.spawnParticles = () => undefined;
  g.spawnDust = () => ({ vx: 0, vy: 0 });
  g.broadcastParticleOrchestra = () => undefined;
  return { g, wav };
}

describe('BJ408-⑥ doReforge topTier（私有物：传奇=金色档;巨大=普通档）', () => {
  it('掷中 81 传奇 → topTier=true + best_reforge 音（:42620-42631 直译）', () => {
    const { id } = findPossession();
    rollHook.pick = () => 81;
    const { g, wav } = makeGame();
    const out = { topTier: false };
    const np = (g as unknown as {
      doReforge(i: { id: number; stack: number; prefix?: number }, out?: { topTier: boolean }): number;
    }).doReforge({ id, stack: 1 }, out);
    expect(np).toBe(81);
    expect(out.topTier).toBe(true);
    expect(wav).toContain('best_reforge');
  });

  it('掷中 2 巨大 → topTier=false + Item_37（用户实报病面=旧通道此处误金）', () => {
    const { id } = findPossession();
    rollHook.pick = () => 2;
    const { g, wav } = makeGame();
    const out = { topTier: false };
    const np = (g as unknown as {
      doReforge(i: { id: number; stack: number; prefix?: number }, out?: { topTier: boolean }): number;
    }).doReforge({ id, stack: 1 }, out);
    expect(np).toBe(2);
    expect(out.topTier).toBe(false);
    expect(wav).not.toContain('best_reforge');
    expect(wav).toContain('Item_37');
  });
});

// ────────────────── ⑦ 武器面零回归（非鞭 best 档不变） ──────────────────

describe('BJ408-⑦ 武器面零回归（3389/5323/4788/1244/3287 best 档金标不变）', () => {
  it('泰拉悠悠球 3389：池=TerrarianYoyo,best=84 传奇2', () => {
    expect(rollablePrefixes(3389, false)).toBe(PREFIX_POOLS.PrefixesForBoomeransAndChakrums_TerrarianYoyo);
    const stat = prefixCombatStatForVid(3389)!;
    expect(stat.damage).toBeGreaterThan(0);
    expect(prefixTryGetFailsForItem(84, stat)).toBe(false);
    expect(bestPrefixValue(PREFIX_POOLS.PrefixesForBoomeransAndChakrums_TerrarianYoyo, stat)).toBe(prefixValueMul(84));
  });

  it('巨鲨 533（枪炮池 best=82 虚幻）/ 鱼叉枪 4788（矛池 best=59 神级）', () => {
    for (const [vid, poolKey, top] of [
      [533, 'PrefixesForGunsBows', 82],
      [4788, 'PrefixesForSpears', 59],
    ] as const) {
      const pool = PREFIX_POOLS[poolKey];
      expect(rollablePrefixes(vid, false)).toBe(pool);
      const stat = prefixCombatStatForVid(vid)!;
      expect(stat.damage).toBeGreaterThan(0);
      expect(bestPrefixValue(pool, stat)).toBe(prefixValueMul(top));
    }
  });

  it('翡翠法杖 1244（kb==0 判别件,BJ400 金标 1.2650 不变）/ Reds 悠悠球 3287（★J 刀勘误：best=59 Godly）', () => {
    const stat1244 = prefixCombatStatForVid(1244)!;
    expect(stat1244.kb).toBe(0);
    expect(bestPrefixValue(PREFIX_POOLS.PrefixesForMagic, stat1244)).toBeCloseTo(1.2649999856948853, 10);
    // ★清偿刀 J（2026-09-30）暴击-only 档勘误（BJ400/BJ408 旧注作废）：旧注断言
    //   3287「缺 damage/knockBack,仅暴击档 36/61 过门,best=61 Zealous」=病灶相,
    //   非 vanilla 相。真值（Item.cs:30170-30174 case 3287: case 3288: 贯穿组共享体
    //   knockBack=4.5f/damage=70,J 刀嵌套贯穿组根修后原生归位）→ dmg/kb 档全过门,
    //   best = 59 Godly（1.15×1.15×1.1=1.4549...）> 61 Zealous（1.1）。
    //   旧断言 damage=0/kb=0/best=61 三行全翻,金标改钉 vanilla 终值。
    const stat3287 = prefixCombatStatForVid(3287)!;
    expect(stat3287.damage).toBe(70);
    expect(stat3287.kb).toBe(4.5);
    expect(stat3287.useAnimation).toBe(25);
    expect(prefixTryGetFailsForItem(61, stat3287)).toBe(false);
    expect(bestPrefixValue(PREFIX_POOLS.PrefixesForBoomeransAndChakrums, stat3287)).toBe(prefixValueMul(59));
    expect(prefixValueMul(59)).toBeGreaterThan(prefixValueMul(61));
  });
});

// ────────────────── ⑧ 源码钉（三面同源单函数） ──────────────────

describe('BJ408-⑧ 源码钉（prefixCombatStatForVid 单源;旧内联 stat 全退役）', () => {
  it('vanillaPrefixes.ts：导出鞭系回填函数 ∧ rollNaturalPrefixForVid 走之', () => {
    const src = readFileSync('src/data/vanillaPrefixes.ts', 'utf8');
    expect(src).toContain('export function prefixCombatStatForVid(');
    expect(src).toContain('return rollNaturalPrefix(pool, rand, prefixCombatStatForVid(vid));');
    expect(src).toContain("import whipsJson from './vanilla-whips.json'");
  });

  it('Game.ts：doReforge stat 行 = prefixCombatStatForVid(vid) 单行', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    expect(game).toContain('const stat = prefixCombatStatForVid(vid);');
    expect(game).not.toContain('const stat = st\n');   // 旧内联三目已摘
  });
});
