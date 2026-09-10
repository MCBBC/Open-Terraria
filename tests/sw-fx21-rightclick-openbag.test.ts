// SW-FX21（2026-09-10）右键开袋面补齐：BossBag 族走 ItemSlot.TryOpenContainer_
// GrantItems 首支（1457 终值 ItemSlot.cs:1786-1789 = `if (ItemID.Sets.BossBag[
// item.type]) player.OpenBossBag(item.type)`，全树唯一调用面;1458 同域零增量）
// ——仓库旧状：openBagItem 对 BossBag 族回落 false，右键开宝藏袋整死，只有
// Game 持用左键链（FX13 登记项）。
// 金标：
//  - ItemID.cs:1215 BossBag 集 = 21 件（3318-3332/3860-3862/4782/4957/5111）
//  - ItemSlot.cs:1614-1693 RightClick（context==0 门 :1638 / mouseRightRelease
//    :1640 / 先于 HasItemSwap :1646 与装备 :1667——UI 门序既有面已对齐）
//  - ItemSlot.cs:1764-1782 TryOpenContainer（成功 = stack-- + PlaySound(7)，
//    :1842 GrantItems 恒 true → 无 case 的袋也消耗）
//  - Player.cs:7206 OpenBossBag；3861/3862 主战利品 case 整缺 + NPC 576/564
//    value=0f（NPC.cs:16314/:16484）→ 零产出本相（钱币尾 value=0 空转）
//  - Player.cs:56551 HasItem 仅查背包 0-57（moonlord 袋 3384 条件 :7748），
//    与锁盒 HasItemInInventoryOrOpenVoidBag :56575 分流
//  - 与左键链共存：Game.ts 持用链不动，两入口同走 openBossBag 引擎
import { describe, it, expect } from 'vitest';
import { openBagItem, OPENABLE_BAG_VIDS, type BagOpenWorld } from '../src/data/vanillaOpenBags';
import { BOSS_BAG_IDS } from '../src/data/vanillaBossBags';

const W: BagOpenWorld = { hardMode: false };
const collect = (fn: (give: (id: number, n?: number) => void) => void): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  fn((id, n) => out.push([id, n ?? 1]));
  return out;
};

describe('SW-FX21 右键开袋面（TryOpenContainer_GrantItems :1784 首支补齐）', () => {
  it('BossBag 全集 21 件=ItemID.cs:1215，且全部在右键门 OPENABLE_BAG_VIDS 内（UI 门可达）', () => {
    const want = new Set([
      3318, 3319, 3320, 3321, 3322, 3323, 3324, 3325, 3326, 3327, 3328, 3329, 3330, 3331, 3332,
      3860, 3861, 3862, 4782, 4957, 5111,
    ]);
    expect(BOSS_BAG_IDS.size).toBe(21);
    for (const v of want) expect(BOSS_BAG_IDS.has(v), `缺 ${v}`).toBe(true);
    for (const v of BOSS_BAG_IDS) expect(OPENABLE_BAG_VIDS.has(v), `${v} 不在右键门`).toBe(true);
  });

  it('右键开袋矩阵:21 件全部经 openBagItem 首支放行（返回 true）', () => {
    for (const vid of BOSS_BAG_IDS) {
      expect(openBagItem(vid, () => {}, W), `袋 ${vid} 右键应放行`).toBe(true);
    }
  });

  it('3318 史王袋:恒给 998+3090（:7237/:7242 无条件支）,产出 id 全域合法（含共享钱币尾 71-74）', () => {
    const LEGAL = new Set([2430, 2493, 256, 257, 258, 2610, 2585, 998, 1309, 3090, 71, 72, 73, 74]);
    for (let k = 0; k < 100; k++) {
      const got = collect((give) => openBagItem(3318, give, W));
      const ids = got.map((g) => g[0]);
      expect(ids).toContain(998);
      expect(ids).toContain(3090);
      for (const id of ids) expect(LEGAL.has(id), `非法产出 ${id}`).toBe(true);
    }
  });

  it('3861/3862 零产出本相:主战利品 case 整缺+NPC value=0f → 恒 true 且零产出（50 开）', () => {
    for (const vid of [3861, 3862]) {
      let total = 0;
      for (let k = 0; k < 50; k++) {
        expect(openBagItem(vid, () => { total++; }, W), `袋 ${vid} GrantItems 恒 true（:1842）→ 盒照耗`).toBe(true);
      }
      expect(total, `袋 ${vid} 零产出=原版本相`).toBe(0);
    }
  });

  it('3860 贝席袋:恒给 3817 勇者勋章 ×[30,51)（:7625）', () => {
    for (let k = 0; k < 50; k++) {
      const got = collect((give) => openBagItem(3860, give, W));
      const medal = got.find((g) => g[0] === 3817);
      expect(medal, '3817 无条件支必出').toBeTruthy();
      expect(medal![1]).toBeGreaterThanOrEqual(30);
      expect(medal![1]).toBeLessThanOrEqual(50);   // Next(30,51) 上界开
    }
  });

  it('masterMode 传导:3320 克眼袋矿 56 大师 [110,136)/专家 [80,111)（:7271-7279）', () => {
    const stacks = (master: boolean): number[] => {
      const out: number[] = [];
      for (let k = 0; k < 200; k++) {
        const got = collect((give) => openBagItem(3320, give, { ...W, masterMode: master }));
        const ore = got.find((g) => g[0] === 56);
        expect(ore, '56 恒给').toBeTruthy();
        out.push(ore![1]);
      }
      return out;
    };
    for (const s of stacks(true)) { expect(s).toBeGreaterThanOrEqual(110); expect(s).toBeLessThanOrEqual(135); }
    for (const s of stacks(false)) { expect(s).toBeGreaterThanOrEqual(80); expect(s).toBeLessThanOrEqual(110); }
  });

  it('crimson 传导:3319 世界吞噬怪袋矿种臂 crimson?880:56 与 2171:59（:7255/:7260）', () => {
    for (let k = 0; k < 50; k++) {
      const normal = collect((give) => openBagItem(3319, give, { ...W, crimson: false }));
      const crimson = collect((give) => openBagItem(3319, give, { ...W, crimson: true }));
      const nIds = new Set(normal.map((g) => g[0]));
      const cIds = new Set(crimson.map((g) => g[0]));
      expect(nIds.has(56) && nIds.has(59)).toBe(true);
      expect(nIds.has(880) || nIds.has(2171)).toBe(false);
      expect(cIds.has(880) && cIds.has(2171)).toBe(true);
      expect(cIds.has(56) || cIds.has(59)).toBe(false);
    }
  });

  it('hasItemInventory 分流:moonlord 袋 3384 传送门枪条件走 Player.HasItem（仅背包 :7748/:56551）,不受虚空袋 hasItem 污染', () => {
    let invOnly = 0, voidAware = 0;
    for (let k = 0; k < 100; k++) {
      // 虚空袋回调恒 true,但 hasItemInventory=false → 原版 HasItem 查不到 → 必给
      openBagItem(3332, (id) => { if (id === 3384) invOnly++; }, {
        ...W, hasItem: () => true, hasItemInventory: () => false,
      });
      openBagItem(3332, (id) => { if (id === 3384) voidAware++; }, {
        ...W, hasItem: () => true, hasItemInventory: () => true,
      });
    }
    expect(invOnly).toBe(100);
    expect(voidAware).toBe(0);
  });

  it('门序回归:BossBag 首支不吞非袋件——非 OpenableBag vid 仍回落 false;锁盒无钥匙 false（不消耗）', () => {
    expect(openBagItem(3213, () => {}, W)).toBe(false);          // 飞猪钱袋非开包物
    expect(openBagItem(75, () => {}, W)).toBe(false);
    expect(openBagItem(3085, () => {}, W)).toBe(false);          // 金锁盒缺金钥匙 → false（TryOpenContainer :1771 num=false → 不 stack--）
    expect(openBagItem(3085, () => {}, { ...W, consumeItem: () => true })).toBe(true);
    expect(openBagItem(4879, () => {}, W)).toBe(false);          // 黑曜石锁盒缺暗影钥匙
  });

  it('左键链共存:持用链直调 openBossBag 引擎与右键同源（BOSS_BAG_IDS 即 Game.ts:15386 门集）', () => {
    // 持用链开门集 = BOSS_BAG_IDS;右键首支同集路由——两入口对 3861/3862 同步复活
    expect(BOSS_BAG_IDS.has(3861) && BOSS_BAG_IDS.has(3862)).toBe(true);
    for (const vid of BOSS_BAG_IDS) {
      const got = collect((give) => openBagItem(vid, give, W));
      expect(got.every((g) => g[0] > 0)).toBe(true);
    }
  });
});
