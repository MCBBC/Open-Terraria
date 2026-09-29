// ★BJ400 件 1（2026-09-29）：重铸 rollPrefix 无 TryGet 偏差清偿（BJ394 登记债）。
// 定谳锚（1457 反编译直读；1458 同构零差）：
//   原版重铸链 = ReforgeItemInReforgeSlot（Main.cs:42618-42627）ResetPrefix +
//   Prefix(-2, out rolledPrefixIsTopTier)。Prefix(-2) while 环（Item.cs:523-556
//   prefixWeWant==-2 臂）：:529 `prefixWeWant < -1` 每轮把 rolledPrefix 复位 -1
//   （:526 Next(4) 早退臂死码）→ :532 RollAPrefix（:1140-1150 池均匀掷）→
//   :1067-1079 TryGetPrefixStatMultipliersForItem 四失败门【掷废重进环】+
//   :551-554 `prefixWeWant==-2 && rolledPrefix==0` 重进环（保底出词缀）。
//   最优档判据 = rolledPrefixIsTopTier = num2 == num（:577），num =
//   BestPrefixValue()（Item.cs:1083-1099）= 可掷池内【TryGet 通过者】的 value
//   乘积最大值（:1094 TryGet 失败不进 Max）。
//   本仓旧病：doReforge rollPrefix(pool,true) 无 TryGet 门——0kb 武器
//   （1244 翡翠法杖族 kb=0）可掷 kb 词缀=零效果假词缀;且 bestVal 未过滤,
//   kb 档（83 Mythic value 1.7602）高于全部可掷档（bestVal 1.2650）时
//   topTier 判据永久失真。
// 变异证红：M1 rollReforgePrefix 摘 TryGet 门 → ①掷域组红；M2 doReforge
//   bestVal 摘过滤 → ④topTier 组红。（原子变异+逐字节还原,sha256 对账）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import {
  rollablePrefixes, rollReforgePrefix, rollPrefix, prefixStat,
  prefixValueMul, prefixTryGetFailsForItem,
} from '../src/data/vanillaPrefixes';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const KB0_MAGIC = 1244;   // kb==0 魔法武器（TryGet kb 门判别域,BJ390/BJ394 同判例件）

/** 种子化 [0,1) 源（RNG.next 为方法引用不能裸传,绑 this） */
const seeded = (seed: number): (() => number) => {
  const r = new RNG(seed);
  return () => r.next();
};

const statOf = (vid: number) => {
  const st = itemCombat(vid);
  return st
    ? { damage: st.damage ?? 0, useAnimation: st.useAnimation ?? 0, mana: st.mana ?? 0, kb: st.knockBack ?? 0 }
    : undefined;
};

beforeEach(() => { vi.restoreAllMocks(); });

// ────────────────────── ① 掷域判别：TryGet 门掷废重进环 ──────────────────────

describe('BJ400-① rollReforgePrefix 掷域（Item.cs:523-556 -2 臂 TryGet 门）', () => {
  it('判别域前提：1244 kb==0 且池内确有 kb 乘子词缀（旧通道假词缀可产出）', () => {
    expect(itemCombat(KB0_MAGIC)!.knockBack).toBe(0);
    const pool = rollablePrefixes(KB0_MAGIC, false)!;
    expect(pool.filter((p) => prefixStat(p).kb !== 1).length).toBeGreaterThan(0);
  });

  it('0kb 武器 3000 重铸掷恒无 kb 词缀（:1067-1079 TryGet kb 门掷废重进环）', () => {
    const pool = rollablePrefixes(KB0_MAGIC, false)!;
    const stat = statOf(KB0_MAGIC);
    for (let i = 0; i < 3000; i++) {
      const r = rollReforgePrefix(pool, seeded(i * 7919 + 11), stat);
      expect(r).not.toBe(0);                          // :551-554 保底出词缀
      expect(prefixStat(r).kb).toBe(1);               // kb 门（kb!=1 ∧ item.kb==0 → 掷废）
    }
  });

  it('多判别件：全 0kb 可重铸武器 500 掷零 kb 词缀（门对全 kb 族生效非单件巧合）', () => {
    let covered = 0;
    for (let vid = 1; vid < 6000; vid++) {
      const st = itemCombat(vid);
      if (!st || (st.knockBack ?? -1) !== 0) continue;
      const pool = rollablePrefixes(vid, false);
      if (!pool || !pool.some((p) => prefixStat(p).kb !== 1)) continue;   // 无 kb 档池无判别力
      covered++;
      const stat = { damage: st.damage ?? 0, useAnimation: st.useAnimation ?? 0, mana: st.mana ?? 0, kb: 0 };
      for (let i = 0; i < 500; i++) {
        const r = rollReforgePrefix(pool, seeded(vid * 977 + i), stat);
        expect(prefixStat(r).kb).toBe(1);
      }
      if (covered >= 6) break;
    }
    expect(covered).toBeGreaterThanOrEqual(2);
  });

  it('保底出词缀：任意池 3000 掷恒非 0（-2 臂 ≠ -1 臂,1/4 无词缀早退不存在）', () => {
    for (const vid of [1244, 160, 29, 368, 4956]) {
      const pool = rollablePrefixes(vid, false);
      if (!pool) continue;
      for (let i = 0; i < 3000; i++) {
        expect(rollReforgePrefix(pool, seeded(vid * 31337 + i), statOf(vid))).not.toBe(0);
      }
    }
  });

  it('旧通道对照（rollPrefix(pool,true)）：同池可产出 kb 假词缀=被清偿缺陷的实证', () => {
    const pool = rollablePrefixes(KB0_MAGIC, false)!;
    let kbLeak = false;
    for (let i = 0; i < 2000 && !kbLeak; i++) {
      const rr = new RNG(i * 977 + 3);
      const spy = vi.spyOn(Math, 'random').mockImplementation(() => rr.next());
      const r = rollPrefix(pool, true);
      spy.mockRestore();
      if (r !== 0 && prefixStat(r).kb !== 1) kbLeak = true;
    }
    expect(kbLeak).toBe(true);   // 旧通道真实漏 kb 档（rollReforgePrefix 同序恒不漏）
  });

  it('空池 → 0（!CanHavePrefixes 面）', () => {
    expect(rollReforgePrefix([], seeded(1), statOf(KB0_MAGIC))).toBe(0);
  });

  it('源码钉：Game.doReforge 走 rollReforgePrefix+TryGet 过滤 bestVal,旧通道全退役', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    expect(game).toContain('item.prefix = rollReforgePrefix(pool, Math.random, stat);');
    expect(game).toContain('prefixTryGetFailsForItem(pfx, stat) ? mx : Math.max(mx, prefixValueMul(pfx))');
    expect(game).not.toContain('rollPrefix(pool, true)');
    expect(game).not.toMatch(/\brollPrefix\(/);   // 生产链零 rollPrefix 直调（注释除外）
  });
});

// ────────────────────── ② topTier 判据：BestPrefixValue TryGet 过滤 ──────────────────────

describe('BJ400-② topTier 判据（Item.cs:1083-1099 BestPrefixValue 只取 TryGet 通过档）', () => {
  it('1244 的 kb 档 83（Mythic 1.7602）被 TryGet 排除,bestVal=可掷档最大 1.2650', () => {
    const pool = rollablePrefixes(KB0_MAGIC, false)!;
    const stat = statOf(KB0_MAGIC)!;
    expect(prefixTryGetFailsForItem(83, stat)).toBe(true);
    expect(prefixValueMul(83)).toBeGreaterThan(1.7);            // 未过滤时它必是 max
    const bestVal = pool.reduce((mx, p) =>
      prefixTryGetFailsForItem(p, stat) ? mx : Math.max(mx, prefixValueMul(p)), 0);
    expect(bestVal).toBeCloseTo(1.2649999856948853, 10);        // f32 域金标
    expect(bestVal).toBeLessThan(prefixValueMul(83));           // 过滤确实改变了判据域
  });
});

// ────────────────────── ③ doReforge 行为面（Game harness,fx60 同构） ──────────────────────

// ---- 确定性掷点劫持（rollReforgePrefix 单点 hook,其余透传原模块） ----
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

async function findReforgable() {
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('../src/data/items');
  const derVid = (k: string, idx: number): number => {
    const d = (ITEM_DEFS as unknown as Record<number, { vid?: number; key?: string } | undefined>)[idx];
    return d?.vid ?? -1;
  };
  // ★判别件：池内【TryGet 失败档的 value】严格高于【通过档 bestVal】——旧通道
  //   （无过滤 bestVal）掷到失败档会误判 topTier=true,新通道恒 false
  for (const [key, idRaw] of Object.entries(ITEM_BY_KEY)) {
    const id = Number(idRaw);
    if (!Number.isFinite(id)) continue;
    const vid = derVid(key, id);
    if (!Number.isFinite(vid) || vid <= 0) continue;
    const pool = rollablePrefixes(vid, false);
    if (!pool || pool.length < 3) continue;
    const stat = statOf(vid);
    if (!stat) continue;
    const fail = pool.filter((p) => prefixTryGetFailsForItem(p, stat));
    const pass = pool.filter((p) => !prefixTryGetFailsForItem(p, stat));
    if (!fail.length || !pass.length) continue;
    const bestVal = pass.reduce((mx, p) => Math.max(mx, prefixValueMul(p)), 0);
    const bad = fail.find((p) => prefixValueMul(p) > bestVal
      && !pass.some((q) => prefixValueMul(q) === prefixValueMul(p)));
    if (bad !== undefined) return { id, vid, pool, bad, pass, bestVal };
  }
  throw new Error('无判别件（失败档 value 全不高于 bestVal）');
}

async function makeGame(): Promise<{ g: Record<string, unknown>; wav: string[] }> {
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

describe('BJ400-③ doReforge topTier 过滤判别（bestVal=TryGet 通过域,BestPrefixValue 同构）', () => {
  it('掷中 TryGet 通过的最优档 → topTier=true（best_reforge 音,判据正向回归）', async () => {
    const pick = await findReforgable();
    const top = pick.pass.reduce((mx, p) => prefixValueMul(p) > prefixValueMul(mx) ? p : mx, pick.pass[0]);
    rollHook.pick = () => top;
    const { g, wav } = await makeGame();
    const out = { topTier: false };
    const np = (g as unknown as {
      doReforge(i: { id: number; stack: number; prefix?: number }, out?: { topTier: boolean }): number;
    }).doReforge({ id: pick.id, stack: 1 }, out);
    expect(np).toBe(top);
    expect(out.topTier).toBe(true);
    expect(wav).toContain('best_reforge');
  });

  it('掷中 TryGet 失败的高 value 档（旧通道会误判 topTier）→ 新通道 topTier=false', async () => {
    const pick = await findReforgable();
    rollHook.pick = () => pick.bad;                 // hook 直返失败档（模拟旧无门通道产物）
    const { g, wav } = await makeGame();
    const out = { topTier: false };
    (g as unknown as {
      doReforge(i: { id: number; stack: number; prefix?: number }, out?: { topTier: boolean }): number;
    }).doReforge({ id: pick.id, stack: 1 }, out);
    expect(out.topTier).toBe(false);                // 失败档不进 BestPrefixValue（:1094）
    expect(wav).not.toContain('best_reforge');
    expect(wav).toContain('Item_37');
  });
});
