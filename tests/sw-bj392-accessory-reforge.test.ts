// ★BJ392（2026-09-28 用户实报「饰品在哥布林工匠不能重铸」）。
// 定谳链（反编译 1457 唯一基准）：
//   原版饰品可重铸 = IsAPrefixableAccessory（Item.cs:1151-1158
//     `accessory && !vanity` → ItemID.Sets.CanGetPrefixes[type]）→
//     GetRollablePrefixes（Item.cs:1102-1136）accessory 臂 →
//     PrefixesForAccessories（PrefixLegacy.cs:58-60 = 62-80 十九词缀;
//     CanGetPrefixes = CreateBoolSet(true,103 例外) ItemID.cs:179）。
//   重铸链本体（Main.cs:42268-42395 锤钮门仅 type>0/费用 value×stack×0.8×PriceAdj/3
//     min1 :42297-42305/BuyItem→ReforgeItemInReforgeSlot :42370-42372→
//     ResetPrefix+Prefix(-2) :42618-42627）不区分类别——饰品同相。
//   本仓断点 = Game.canReforge/doReforge（+合成光标门/合成词缀 roll 共 4 处）传
//     `!!def.accessory` 当配饰谓词——ItemDef.accessory 是手写效果枚举
//     （items.ts:78 'lucky_horseshoe'|'feral_claws'）,原版 vi_ 配饰全不带 → 恒 false
//     → rollablePrefixes accessory 臂永不进 → UI 两面入槽门（UI.ts:3647 classic/
//     9964 vinv）拦下饰品弹「此物品无法重铸」。swapEquipItem（UI.ts:1706）同族病判例。
//   修 = 单源判据 isPrefixableAccessory（Inventory.ts）= itemstats acc===1
//     ∪ def.accessory 兜底（数据实证:acc:1 336 件与 van:1 零交集、acc:0 35 件全
//     van:1 —— acc===1 ⟺ accessory ∧ ¬vanity）。
// 锚面：
//   ① 池身份:49 → PrefixesForAccessories 全等(19 词缀,错池/缺收录必红);
//   ② canReforge 判别矩阵:6 标志功能配饰正例 + 216 脚镣例外族(CanGetPrefixes
//     excluded,原版同相不可重铸) + 社交配饰(acc:0=vanity)负例 + 武器回归;
//   ③ isPrefixableAccessory 判据分域(功能/社交/例外族/非配饰);
//   ④ doReforge 端到端:49 真价值面 50000/3=16666 + 掷出恒 ∈ 配饰池 + topTier;
//   ⑤ 合成域同病收口:47479 光标门/47507 词缀 roll 的判据同源（配饰成品 pool 非 null）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory, isPrefixableAccessory } from '../src/items/Inventory';

// ---- 确定性掷点钩（★BJ400 劫点迁 rollReforgePrefix:doReforge 掷面 TryGet 门化,其余透传） ----
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

const pfx = await vi.importActual<typeof import('../src/data/vanillaPrefixes')>(
  '../src/data/vanillaPrefixes');
const { ITEM_DEFS } = await import('../src/data/items');

/** vid → 内部 id（canReforge 内部 vid 解析同构:def.vid ?? vi_ 键段） */
function defOfVid(vid: number): { id: number; key: string } | undefined {
  const idx = ITEM_DEFS.findIndex((d) => {
    if (!d) return false;   // ★方案 A:守洞（findIndex 对洞以 undefined 调用）
    const v = (d as { vid?: number }).vid
      ?? ((d as { key: string }).key.startsWith('vi_')
        ? parseInt((d as { key: string }).key.slice(3), 10) : -1);
    return v === vid;
  });
  return idx >= 0 ? { id: idx, key: (ITEM_DEFS[idx] as { key: string }).key } : undefined;
}
function canReforgeOf(vid: number): boolean {
  const e = defOfVid(vid);
  expect(e, `vid ${vid} 应已注册为物品 def`).toBeDefined();
  return (Game.prototype.canReforge as (i: { id: number }) => boolean).call(
    undefined as unknown as Game, { id: e!.id });
}

// 标志功能配饰（ItemID.cs:BandofRegeneration=49:1644/CobaltShield=156:1858/
// LuckyHorseshoe=158:1862/ObsidianSkull=193:1932/Aglet=285:2116/CrossNecklace=554:2654/
// Shackle=216:1978——脚镣不在 CanGetPrefixes 例外表,原版可重铸;
// vanilla-itemstats acc:1 全在表）
const FUNC_ACC = [49, 156, 158, 193, 216, 285, 554] as const;
// CanGetPrefixes 例外族代表（ItemID.cs:179 CreateBoolSet(true,…) 首条 267;
// excluded∩acc:1 全集=[267,576,1307]——可穿 accessory 槽但不可重铸=原版同相）
const EXCLUDED = 267;   // GuideVoodooDoll 向导巫毒娃娃（:2080）;576 音乐盒/1307 裁缝巫毒娃娃同族
// 社交配饰代表（vanilla-itemstats acc:0 全 van:1;原版 vanity=true → ¬IsAPrefixable）
const SOCIAL = [208, 1987, 2276] as const;   // JungleRose:1962/AngelHalo:5520/DiamondRing:6098

describe('BJ392 饰品重铸可达（用户实报:饰品在哥布林工匠不能重铸）', () => {
  it('① 池身份:49 再生手环 → PrefixesForAccessories 全等（19 词缀 62-80,错池必红）', () => {
    expect(pfx.rollablePrefixes(49, true)).toEqual(pfx.PREFIX_POOLS.PrefixesForAccessories);
    expect(pfx.PREFIX_POOLS.PrefixesForAccessories).toEqual([62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80]);
  });

  it('② canReforge 判别矩阵:6 标志功能配饰全可达（修前 !!def.accessory 恒 false 全拦）', () => {
    for (const vid of FUNC_ACC) {
      expect(canReforgeOf(vid), `功能配饰 vid ${vid} 应可重铸`).toBe(true);
    }
  });

  it('③ 例外族+社交配饰负例:267 向导巫毒娃娃(CanGetPrefixes excluded)/社交三件(vanity)不可重铸', () => {
    // 巫毒娃娃:itemstats acc:1（判据真）但 CanGetPrefixes 例外表成员 → rollablePrefixes null
    expect(isPrefixableAccessory(defOfVid(EXCLUDED)!.id)).toBe(true);
    expect(canReforgeOf(EXCLUDED)).toBe(false);
    expect(pfx.rollablePrefixes(EXCLUDED, true)).toBeNull();
    // 社交配饰:acc:0=vanity=true → IsAPrefixableAccessory 假臂（Item.cs:1153 !vanity 门）
    for (const vid of SOCIAL) {
      const e = defOfVid(vid)!;
      expect(isPrefixableAccessory(e.id), `社交 vid ${vid} 判据应假`).toBe(false);
      expect(canReforgeOf(vid), `社交配饰 vid ${vid} 不可重铸`).toBe(false);
    }
  });

  it('④ 武器回归+杂物负例:迷你鲨 98/铜镐 3507 可达,火把 8 不可（reforge-reach-1457 同相）', () => {
    expect(canReforgeOf(98)).toBe(true);      // MusketsGunsBows（ItemID.cs:1937 迷你鲨=98? 见下 expect 池身份）
    expect(pfx.rollablePrefixes(98, false)).toEqual(pfx.PREFIX_POOLS.PrefixesForGunsBows);
    expect(canReforgeOf(3507)).toBe(true);
    expect(canReforgeOf(8)).toBe(false);      // 火把
  });

  it('⑤ doReforge 端到端:49 真价值面 50000/3=16666 + 掷出恒 ∈ 配饰池 + topTier 判定', async () => {
    const e = defOfVid(49)!;
    const wav: string[] = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.player = new Player(60 * 16, 100 * 16, new Inventory());
    g.cb = {};
    g.sfx = { playWavFile: (name: string) => { wav.push(name); } };
    g.coinsOwned = () => 999999;
    g.spendCopper = () => true;
    g.spawnParticles = () => undefined;
    g.spawnDust = () => ({ vx: 0, vy: 0 });
    g.broadcastParticleOrchestra = () => undefined;

    const item = { id: e.id, stack: 1, prefix: undefined as number | undefined };
    // 真价值链（reforgeCost 不桩）:vanilla-itemvalue 49=50000 铜（Band of Regeneration
    //   Item.cs SetDefaults value=1金×5）→ floor(50000/3)=16666,无折扣
    const cost = (g.reforgeCost as (i: { id: number; stack: number }) => number)(item);
    expect(cost).toBe(16666);

    // ★BJ392 X1 补（2026-09-29）：折扣先行阶序（Main.cs:42297-42303——×0.8 在 ÷3 前）
    //   floor(floor(50000×0.8)/3)=13333;旧 ÷3 先行=floor(16666×0.8)=13332（阶序错位实证）
    Object.defineProperty(g.player, 'equipStats', { get: () => ({ discount: true }), configurable: true });
    expect((g.reforgeCost as (i: { id: number; stack: number }) => number)(item)).toBe(13333);
    delete (g.player as { equipStats?: unknown }).equipStats;   // 摘影→回原型 getter（不污后续 doReforge 面）

    // 最优档掷中 → topTier=true + best_reforge 音（Main.cs:42620-42626）
    const pool = pfx.PREFIX_POOLS.PrefixesForAccessories;
    const bestVal = Math.max(...pool.map(pfx.prefixValueMul));
    const top = pool.find((q) => pfx.prefixValueMul(q) === bestVal)!;
    rollHook.pick = () => top;
    const out = { topTier: false };
    const np = (g.doReforge as (
      i: { id: number; stack: number; prefix?: number },
      out?: { topTier: boolean }) => number)(item, out);
    expect(np).toBe(top);
    expect(out.topTier).toBe(true);
    expect(wav).toContain('best_reforge');

    // 20 连掷（钩透传真 rollPrefix）:结果恒 ∈ 配饰池且 ∈ doReforge 可达域
    rollHook.pick = null;
    for (let i = 0; i < 20; i++) {
      const r = (g.doReforge as (
        i: { id: number; stack: number; prefix?: number },
        out?: { topTier: boolean }) => number)(item, { topTier: false });
      expect(pool).toContain(r);
      expect(r).not.toBe(0);   // Prefix(-2) 保底出词缀(重铸支 wantBest=true)
    }
  });

  it('⑥ 合成域同病收口:配饰成品（47479 光标门/47507 词缀 roll 判据同源）pool 非 null', () => {
    // 判据同源面:isPrefixableAccessory(49)=true → 合成词缀 roll 池可达
    // （原版 CraftingRequests.cs:126-133 CreateResult stack<=1 → Prefix(-1) 逐件 roll,
    //  配饰成品同 roll——旧 !!def.accessory 判据=合成配饰永不带词缀）
    expect(isPrefixableAccessory(defOfVid(49)!.id)).toBe(true);
    expect(pfx.rollablePrefixes(49, true)).not.toBeNull();
  });
});
