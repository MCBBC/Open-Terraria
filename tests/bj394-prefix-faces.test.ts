// BJ394（2026-09-28）词缀扫尾三件+l10n 孤儿键判别面：
//   件 1 制作链 TryGet 校验迁移——vanillaCraft roll 通道 rollPrefix(pool,false) →
//     rollNaturalPrefixForVid（CraftingRequests.cs:122-131 CreateResult `stack<=1 →
//     Prefix(-1)` :128 = Item.cs:523-556 自然掷全链,与 NPC 掉落同链;旧 rollPrefix
//     无 TryGet 四门=0kb 吹管族可吃 kb 词缀假词缀+掷序偏离）;
//   件 2 KillTile_DropItems 砖破面接线——WorldGen.cs:64468/:64472 `noPrefix ? -4 : -1`
//     （GetItemDrops :64477-66612 全量普查：可词缀且无 noPrefix 压制者仅 tile 61
//     fx==162→223 Nature's Gift（:66171-66174）与 tile 50 fx==90→165 Water Bolt
//     （:66175-66182）;压制档 703 seg9→223（:65486）/707 fx90→165（:66187）/
//     700→5114（:65493）noPrefix=true→本仓 tile 掉落链本就不掷=自洽零刀;426 系
//     case 4 火把 default `426+num`（num≥1 恒≥427）=普查 false positive）+
//     存物词缀随行（334 帧 Item.NewItem 第 8 参=帧编码 prefix :64147-64151 / TE 族
//     result.DropItem() 真实例——本仓 pop/换件/取出三面原样随行）;
//   件 3 QuickSpawnItem 族普查——Player.cs:7174-7184 int 重载恒 Prefix(-1)（:7180,
//     SetDefaults 后 stack 前）:OpenPresent :7035/OpenLegacyPresent :7156/OpenBossBag
//     :7206(151 掷)/OpenFishingCrate :8052/OpenShadowLockbox :9396/OpenLockBox
//     :9416/OpenHerbBag :9453/OpenCanofWorms :9529/OpenOyster :9543/OpenChilletEgg
//     :9577/OpenGoodieBag+CostumeSet :9588/:9564 全族=本仓 openBagItem give 单口
//     （UI.tryOpenContainer）;Item 重载（:7186/:7191 不掷）消费面=渔夫奖励
//     GetAnglerReward*（:57112 GiftRecieved）/钓鱼捕获（Projectile.cs:54904）→
//     本仓 grantAnglerRewards/Bobber 无词缀=原版同相（备案零刀）;
//   件 4 l10n 孤儿键——SandboxWorld.Toast.BossFled 自 tools/l10n-custom 摘除+重建
//     （BJ388 摘 BossFled 灰字 toast 登记债）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import {
  rollNaturalPrefix, rollNaturalPrefixForVid, rollablePrefixes,
  prefixStat, rollPrefix, PREFIX_POOLS, REDUCED_NATURAL,
} from '../src/data/vanillaPrefixes';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../src/data/items';
import { isPrefixableAccessory } from '../src/items/Inventory';

const iidOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

/** 种子化 [0,1) 源（绑定 this——RNG.next 为方法引用不能裸传） */
const seeded = (seed: number): (() => number) => {
  const r = new RNG(seed);
  return () => r.next();
};

afterEach(() => { vi.restoreAllMocks(); });

// ────────────────────────────── 件 1：制作链 TryGet 校验迁移 ──────────────────────────────

describe('BJ394-件1 vanillaCraft roll 通道迁移（CraftingRequests.cs:122-131 → Item.cs:523-556）', () => {
  const KB0_MAGIC = 1244;   // kb==0 武器（TryGet kb 门判别域,同 BJ390 判例件;吹管 281 kb=3.5 非 0kb）

  it('判别域前提：1244 池内确有 kb 乘子词缀（旧通道假词缀可产出）', () => {
    const pool = rollablePrefixes(KB0_MAGIC, false)!;
    expect(pool).toBeTruthy();
    expect(pool.filter((p) => prefixStat(p).kb !== 1).length).toBeGreaterThan(0);
  });

  it('新通道（rollNaturalPrefixForVid）：0kb 武器 3000 掷恒无 kb 词缀（TryGet kb 门 :1077）', () => {
    for (let i = 0; i < 3000; i++) {
      const r = rollNaturalPrefixForVid(KB0_MAGIC, false, seeded(i * 7919 + 11));
      if (r !== 0) expect(prefixStat(r).kb).toBe(1);
    }
  });

  it('旧通道对照（rollPrefix(pool,false)）：同池可产出 kb 词缀=被迁移缺陷的实证', () => {
    const pool = rollablePrefixes(KB0_MAGIC, false)!;
    const spy = vi.spyOn(Math, 'random');
    // rollPrefix 掷序：池掷→reduced→1/4 门——喂恒 0.49 序列:floor(0.49*len) 固定取池首档族
    // 池首不为 0,reduced→1/4 链全不命中 → 返回池内固定档;若该档 kb≠1 即假词缀直出
    spy.mockReturnValue(0.49);
    const got = rollPrefix(pool, false);
    spy.mockRestore();
    if (got !== 0) {
      // 固定序取到的档要么 kb=1（换种子重试）,要么就是假词缀——用多种子扫,存在 kb 档即判别成立
      expect(prefixStat(got).kb === 1 || pool.some((p) => prefixStat(p).kb !== 1)).toBe(true);
    }
    let kbLeak = false;
    for (let i = 0; i < 2000 && !kbLeak; i++) {
      const rr = new RNG(i * 977 + 3);
      const s2 = vi.spyOn(Math, 'random').mockImplementation(() => rr.next());
      const r = rollPrefix(pool, false);
      s2.mockRestore();
      if (r !== 0 && prefixStat(r).kb !== 1) kbLeak = true;
    }
    expect(kbLeak).toBe(true);   // 旧通道假词缀确可产出（新通道同批种子恒 0 出 kb——上测）
  });

  it('掷序判别子：Next(4) 先于池掷（Item.cs:526→534）;TryGet 失败重进环先耗 Next(4)', () => {
    // 池 [3]（dmg 1.05）+ stat damage=10（10×1.05=10.5 → 银行家 10 == 10 → 门拦）
    // 序列 [0.9(Next4 不退), 0.9(池→3), 门拦重进, 0.1(Next4==0 → 早退 0)] → 结果 0,
    // 恰 3 掷——旧通道无 TryGet 同序列会返回 3（假词缀）
    const calls: number[] = [];
    const r = rollNaturalPrefix([3], () => { const v = [0.9, 0.9, 0.1][calls.length]; calls.push(v); return v; },
      { damage: 10, useAnimation: 20, mana: 0, kb: 4 });
    expect(r).toBe(0);
    expect(calls).toEqual([0.9, 0.9, 0.1]);
  });

  it('mercy 面：ReducedNaturalChance 成员 Next(3)!=0 掷废（:538）——序列判别子', () => {
    // 池 [1]（Large,reduced?先验——若非 reduced 换 81;断言依赖池成员在 reduced 集）
    const reduced = PREFIX_POOLS.PrefixesForSwords.find((p) => REDUCED_NATURAL.has(p));
    expect(reduced).toBeTruthy();
    // 序列 [0.9(Next4 不退), 0(池→reduced), 0.9(Next3 floor(2.7)=2≠0 → 掷废 0)] → 0
    let i = 0;
    const r = rollNaturalPrefix([reduced!], () => [0.9, 0, 0.9][i++]);
    expect(r).toBe(0);
    // 对照：Next3==0（mercy 放行）→ 保留词缀
    i = 0;
    const r2 = rollNaturalPrefix([reduced!], () => [0.9, 0, 0][i++]);
    expect(r2).toBe(reduced);
  });

  it('源码钉：vanillaCraft 用 rollNaturalPrefixForVid+pool 门（CreateResult :126-129 同构）', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    expect(game).toMatch(/r\.createStack <= 1 && pool && pool\.length\s*\n\s*\? \(rollNaturalPrefixForVid\(outVid0, isPrefixableAccessory\(outId\), Math\.random\) \|\| undefined\)/);
    expect(game).not.toMatch(/rollPrefix\(pool, false\)/);   // 旧通道退役（-2 重铸面除外）
    expect(game).toMatch(/item\.prefix = rollPrefix\(pool, true\)/);   // doReforge（BJ392 域,勿回退）
  });
});

// ────────────────────────────── 件 2：KillTile_DropItems 砖破面 ──────────────────────────────

describe('BJ394-件2 砖破面自然掷（WorldGen.cs:64468 noPrefix?-4:-1）+存物词缀随行', () => {
  const NATURES_GIFT = 223;   // 配饰（tile 61 fx==162,无 noPrefix→原版真掷）
  const WATER_BOLT = 165;     // 魔法（tile 50 fx==90,无 noPrefix→原版真掷）
  const ABIGAIL = 5114;       // tile 700,noPrefix=true→压制档（本仓不掷=同相）

  it('普查代表 ①：223 配饰判定+配饰池 19 掷出池内词缀（tile 61 面→rollNaturalPrefixForVid 同参）', () => {
    const iid = iidOf(NATURES_GIFT);
    expect(iid).toBeGreaterThan(0);
    expect(isPrefixableAccessory(iid)).toBe(true);          // 接线判据前腿
    expect(rollablePrefixes(NATURES_GIFT, false)).toBeNull();   // 非配饰位误传=池 null（防御面）
    const pool = rollablePrefixes(NATURES_GIFT, true)!;
    expect(pool).toEqual(PREFIX_POOLS.PrefixesForAccessories);
    expect(pool.length).toBe(19);
    let nonzero = 0;
    for (let i = 0; i < 3000; i++) {
      const r = rollNaturalPrefixForVid(NATURES_GIFT, true, seeded(i * 6271 + 9));
      if (r !== 0) { nonzero++; expect(PREFIX_POOLS.PrefixesForAccessories).toContain(r); }
    }
    expect(nonzero).toBeGreaterThan(1000);   // 配饰池无 mercy/无门拦=75% 词缀率
  });

  it('普查代表 ②：165 魔法池（tile 50 面）自然掷出池内非 kb 门拦词缀', () => {
    const iid = iidOf(WATER_BOLT);
    expect(iid).toBeGreaterThan(0);
    expect(isPrefixableAccessory(iid)).toBe(false);
    const pool = rollablePrefixes(WATER_BOLT, false)!;
    expect(pool).toEqual(PREFIX_POOLS.PrefixesForMagic);
    for (let i = 0; i < 2000; i++) {
      const r = rollNaturalPrefixForVid(WATER_BOLT, false, seeded(i * 3779 + 5));
      if (r !== 0) expect(PREFIX_POOLS.PrefixesForMagic).toContain(r);
    }
  });

  it('压制档 ③：5114/703:223/707:165 原版 noPrefix=true→本仓零掷=同相（备案面只锚池真值）', () => {
    // 池真值备案：压制档不是「不可词缀」,是「此口不掷」（非配饰位 5114 仍属召唤池）
    expect(rollablePrefixes(ABIGAIL, false)).toEqual(PREFIX_POOLS.PrefixesForSummons);
  });

  it('源码钉：两掷站条件精确（sheet 61 的 223 / sheet 50 的 165）,存物词缀四面随行', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    // 植物族 223 掷——条件含 sheet===61（703 的 223=压制档不掷）
    expect(game).toMatch(/if \(dropId === 223 && sheet === 61\) \{[\s\S]{0,200}rollNaturalPrefixForVid\(223, isPrefixableAccessory\(iid223\), Math\.random\)/);
    // 帧表站 165 掷——条件含 sheet===50（707 的 165=压制档不掷）
    expect(game).toMatch(/if \(def\.vanilla\?\.sheet === 50 && sv === 165\) \{/);
    // 存物随行四面：pop / 334 破架带出 / 换件 replaced / 单槽取出 popped（+取出溢出/taken 溢出）
    expect(game.matchAll(/fbr\.item\.prefix\)/g) ? [...game.matchAll(/fbr\.item\.prefix\)/g)].length : 0).toBeGreaterThanOrEqual(2);
    expect(game).toContain('r.replaced.prefix');
    expect(game).toContain('popped.prefix');
    expect(game).toContain('taken.item.prefix');
  });
});

// ────────────────────────────── 件 3：QuickSpawnItem 族普查 ──────────────────────────────

describe('BJ394-件3 QuickSpawnItem 族词缀普查（Player.cs:7174-7184 int 重载恒 Prefix(-1)）', () => {
  it('礼盒代表：1909 拐杖糖剑/1921 暖手宝可掷（int 重载=真掷域）', () => {
    expect(rollablePrefixes(1909, false)).toEqual(PREFIX_POOLS.PrefixesForSwords);
    expect(isPrefixableAccessory(iidOf(1921))).toBe(true);
    expect(rollablePrefixes(1921, true)).toEqual(PREFIX_POOLS.PrefixesForAccessories);
  });

  it('锁盒代表：155 村正（金锁盒 Next(7)==2 支）∈ 剑池（164 系枪弓池=另一代表）', () => {
    expect(rollablePrefixes(155, false)).toEqual(PREFIX_POOLS.PrefixesForSwords);
    expect(rollablePrefixes(164, false)).toBeTruthy();   // 164 同锁盒表（GunsBows 池 35）
  });

  it('不可词缀代表（97 弹/586 块/602 雪球仪）恒 0——QuickSpawnItem 掷了也 0（Pool null）', () => {
    for (const vid of [97, 586, 602]) {
      const iid = iidOf(vid);
      if (iid < 0) continue;   // 未注册键跳过（vanilla.json 域）
      for (let i = 0; i < 200; i++) {
        expect(rollNaturalPrefixForVid(vid, isPrefixableAccessory(iid), seeded(i * 13 + vid))).toBe(0);
      }
    }
  });

  it('源码钉：UI give 单口逐件掷（int 重载同相）;渔夫奖励/钓鱼捕获=Item 重载域不掷（备案）', () => {
    const ui = readFileSync('src/ui/UI.ts', 'utf8');
    expect(ui).toMatch(/rollNaturalPrefixForVid\(id, isPrefixableAccessory\(iid\), Math\.random\)/);
    expect(ui).toMatch(/GetAnglerReward\* 走 Item 重载（:57112 GiftRecieved,不掷）/);   // 备案锚在位
    const game = readFileSync('src/core/Game.ts', 'utf8');
    // grantAnglerRewards（:38047 起,含前置文档注释）无词缀掷——原版 GetAnglerReward*
    // 走 Item 重载（Player.cs:57112 GiftRecieved,不掷）,文档注释已锚
    const start = game.indexOf('private grantAnglerRewards');
    expect(start).toBeGreaterThan(0);
    const docStart = game.lastIndexOf('/**', start);
    const body = game.slice(docStart, game.indexOf('\n  /**', start + 10));
    expect(body).not.toContain('rollNaturalPrefix');
    expect(body).toContain('inv.add');
    expect(body).toContain('GiftRecieved');   // 原版不掷锚（文档注释 :38040-38043）
  });
});

// ────────────────────────────── 件 4：l10n 孤儿键 ──────────────────────────────

describe('BJ394-件4 SandboxWorld.Toast.BossFled 孤儿键摘除（BJ388 登记债）', () => {
  it('源文件（tools/l10n-custom）与产物（public/l10n）双侧零 BossFled', () => {
    for (const p of [
      '../tools/l10n-custom/zh-Hans.json',
      '../tools/l10n-custom/en-US.json',
      'public/l10n/zh-Hans.json',
      'public/l10n/en-US.json',
    ]) {
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      const hit = Object.keys(doc).filter((k) => k.includes('BossFled')
        || (doc[k] && typeof doc[k] === 'object' && Object.keys(doc[k]).some((k2) => k2.includes('BossFled'))));
      expect(hit).toEqual([]);
    }
  });

  it('bossFled 旗本身仍在（记账正确性不回退——Game.ts boss 块消费面保留）', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    expect(game).toContain('this.boss.bossFled');
  });
});
