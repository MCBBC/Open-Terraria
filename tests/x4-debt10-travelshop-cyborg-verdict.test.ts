// ★X4-债10#2 翻案定谳（翻案=X4 清偿刀 K 2026-09-29;原债=清偿刀 I 通道判谳批
// 「判后余债」#2,台账两处归档同名同刀）——旅行商人 hardmode 三件套 5452/5451/5738
// 系 X4 清偿刀 I 的 NPC 归属误判,原债不成立:
// （★清偿刀 P4 2026-09-30 注：台账该条已改号 X4-债16——重号勘误,本文件名/编号
// 引用保留历史号;「刀 I=误判方/刀 K=翻案方」两归属经台账亲读复核,勿混）
//
// 【源码定谳】三件=电子人(Cyborg,209)困难模式货架,非旅行商人:
//   - Chest.cs:2396-2400 = Chest.SetupShop 【case 14】hardmode 支(5452/5451/5738 全
//     Chest.cs 唯一出现点——三 id 在 SetupTravelShop(:1269-1382)与 case 19(旅行商,
//     :2785-2803)零出现);
//   - 槽位→NPC 映射 = NPCInteractions.cs:502 `Shop(209, 14)`(NPCID.cs:11489 Cyborg=209)
//     / :507 `Shop(368, 19)`(旅行商=368)——1456 同构(:502/:507);
//   - case 19 旅行商货架全貌 = 帕鲁甲 5735/5736 条件段(:2785-2795)+Main.travelShop[]
//     流动池(:2796-2802),无 hardmode 支;
//   - SetupTravelShop 的 hardmode 面(:1314-1328)= 首件 minimumRarity=2 重试环(随机池
//     消费,与三件无关);vanilla-travelshop.json(GetItem 66+GetPainting 31 池)不缺任何件
//     (extract-travelshop 干跑「重产盖住现库」双向零差)。
//
// 【台账两处误读勘误】
//   ①「买价均 10 银」→ 实为 10 金:Item.buyPrice(platinum, gold, silver, copper)
//     (Item.cs `gold * 100 * 100`),buyPrice(0,10)=100000 铜——本仓 shopstock
//     values['5451'/'5452'/'5738']=100000 恰为原版真值;
//   ②「vanilla-travelshop.json 缺该三件=提取器盲区」→ 三件本就不在随机池,添入反而是
//     新偏离(旅行商卖电子人货)。
//
// 【本仓数据面早已全量在位】vanilla-shopstock.json shops['209'] 含三件
// (cond='hardMode',price=100000,位序 5452→5451→5738=源码序),经 Game.shopStockFor
// →shopCondOk('hardMode') 消费——困难模式前后货架差集=三件集(判别面③)。
//
// 判别面(本文件三轴,任一违反即红;纯数据/合成 this 直调私有面,sw-bj23 同族):
//   ①源码面:Chest.cs 三 id 唯一出现点=case 14 段内+SetupTravelShop/case 19 零出现
//     +NPCInteractions Shop(209,14)/Shop(368,19) 锚;
//   ②数据面:shopstock 209 三件 id 序/cond/price+values 表 100000+buyPrice 形参语义
//     (gold*100*100)+travelshop 池三 id 零出现(66/31 基数+src 锚);
//   ③运行时面:shopStockFor(电子人) hardmode 前后差集恰=三件,hardmode 货架全表锁;
//     旅行商臂 hardmode 前后库存恒同且永不含三件。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { Game } from '../src/core/Game';
import shopstockJson from '../src/data/vanilla-shopstock.json';
import travelshopJson from '../src/data/vanilla-travelshop.json';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const REPO = join(dirname(__dirname), '..');
const CHEST_CS = existsSync(join(REPO, 'Terarria1457', 'Terraria', 'Chest.cs')) ? readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Chest.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const ITEM_CS = existsSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs')) ? readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const NPC_INTERACTIONS = existsSync(join(REPO, 'Terarria1457', 'Terraria.GameContent', 'NPCInteractions.cs')) ? readFileSync(join(REPO, 'Terarria1457', 'Terraria.GameContent', 'NPCInteractions.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

const SHOPS = (shopstockJson as {
  shops: Record<string, Array<{ id: number; price: number | null; cond: string | null }>>;
}).shops;
const VALUES = (shopstockJson as { values: Record<string, number> }).values;
const TRAVEL_POOL = travelshopJson as {
  items: Array<{ id?: number; ids?: number[] }>;
  paintings: Array<{ id?: number; ids?: number[] }>;
  src: string;
};

// ---- 合成 this（shopStockFor 只读这些面;sw-bj23 makeCtx 同族精简版） ----
interface CtxOver {
  hardMode?: boolean;
  day?: boolean;
  eclipse?: boolean;
  bloodMoon?: boolean;
  hasVanilla?: number[];
}
function makeCtx(over: CtxOver = {}): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    world: {
      flags: { hardMode: !!over.hardMode },
      clock: { isDay: over.day ?? true, bloodMoon: !!over.bloodMoon, moonPhase: 0, eclipse: !!over.eclipse, xMas: false, halloween: false, timeOfDay: 0.5 },
      weather: {},
      seedFlags: {},
    },
    scene: {
      belowSurface: false,
      zoneSnow: false, zoneJungle: false, zoneGraveyard: false, zoneHallow: false,
      zoneDesert: false, zoneSkyHeight: false, zoneBeach: false, zoneGlowshroom: false,
      zoneCorrupt: false, zoneCrimson: false, zoneUnderworldHeight: false, zoneDungeon: false,
    },
    player: { maxHp: 100, maxMana: 20, golferScoreAccumulated: 0, inv: { slots: [] } },
    entities: { npcs: [] },
    partyState: { manualParty: false, genuineParty: false, daysOnCooldown: 0, celebratingNpcs: [] },
    playerHasVanillaItem: (vid: number) => (over.hasVanilla ?? []).includes(vid),
    travelStock: [[5043, 1000], [3063, 500]] as Array<[number, number]>,   // 合成流动货
  };
  (ctx as Record<string, unknown>).shopCondOk = shopCondOk;   // shopStockFor 内部 this.shopCondOk
  return ctx;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const shopCondOk = (Game.prototype as any).shopCondOk as (this: any, cond: string | null) => boolean;
const shopStockFor = (Game.prototype as any).shopStockFor as (this: any, npc: { npcKey: string; vanillaId: number }) => Array<[number, number] | [number, number, number]>;
const TRIO = [5452, 5451, 5738] as const;

// ==================== ① 源码面：三件唯一归属=电子人 case 14 ====================
describe.skipIf(EXT_MISSING)('① 源码面（Terarria1457 亲读锚）', () => {
  it('Chest.cs 三 id 唯一出现点=SetupShop case 14 段内（:2396-2400）', () => {
    const lines = CHEST_CS.split('\n');
    const hits: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/SetDefaults\(5452\)|SetDefaults\(5451\)|SetDefaults\(5738\)/.test(lines[i])) hits.push(i);
    }
    expect(hits.length).toBe(3);   // 全文件仅三处=三件各一处
    const setupShopStart2 = lines.findIndex((l) => l.includes('public void SetupShop(int type)'));
    const case14 = lines.findIndex((l, i) => i > setupShopStart2 && l.trim() === 'case 14:');
    const case15 = lines.findIndex((l, i) => i > case14 && l.trim() === 'case 15:');
    expect(case14).toBeGreaterThan(0);
    expect(case15).toBeGreaterThan(case14);
    for (const h of hits) {
      expect(h, `行 ${h + 1} 须落在 case 14 段内（${case14 + 1}-${case15 + 1}）`).toBeGreaterThan(case14);
      expect(h).toBeLessThan(case15);
    }
  });

  it('SetupTravelShop 函数体零三 id（旅行商随机池与三件无关）', () => {
    const start = CHEST_CS.indexOf('public static void SetupTravelShop()');
    const end = CHEST_CS.indexOf('\tpublic void SetupShop(int type)', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = CHEST_CS.slice(start, end);
    for (const id of TRIO) expect(body).not.toContain(`(${id})`);
    // 函数体确含 hardmode 首件重试环（与三件无关的 hardmode 面,锚其存在防段截断假绿）
    expect(body).toContain('while (num2 < 5000)');
    expect(body).toContain('SetupTravelShop_GetItem(playerWithHighestLuck, rarity, ref it, 2)');
  });

  it('case 19（旅行商货架）= 帕鲁甲 5735/5736 + travelShop 流动池,零三 id 零 hardmode 支', () => {
    const lines = CHEST_CS.split('\n');
    const setupShopStart = lines.findIndex((l) => l.includes('public void SetupShop(int type)'));
    expect(setupShopStart).toBeGreaterThan(0);
    const case19 = lines.findIndex((l, i) => i > setupShopStart && l.trim() === 'case 19:');
    const case20 = lines.findIndex((l, i) => i > case19 && l.trim() === 'case 20:');
    expect(case19).toBeGreaterThan(0);
    expect(case20).toBeGreaterThan(case19);
    const body = lines.slice(case19, case20).join('\n');
    expect(body).toContain('Main.travelShop[j]');
    expect(body).toContain('SetDefaults(5735)');
    expect(body).toContain('SetDefaults(5736)');
    for (const id of TRIO) expect(body).not.toContain(`(${id})`);
    expect(body).not.toContain('Main.hardMode');   // 无 hardmode 门
  });

  it('槽位映射锚：NPCInteractions.cs Shop(209, 14) / Shop(368, 19)（1456 同构）', () => {
    expect(NPC_INTERACTIONS).toContain('Shop(209, 14);');
    expect(NPC_INTERACTIONS).toContain('Shop(368, 19);');
  });
});

// ==================== ② 数据面：shopstock/values/travelshop 三表锚 ====================
describe.skipIf(EXT_MISSING)('② 数据面（vanilla-shopstock.json + vanilla-travelshop.json）', () => {
  it('shopstock 209（电子人）hardmode 三件套全表锁：id 序=源码序/cond=hardMode/price=100000（10 金）', () => {
    const cyborg = SHOPS['209'];
    for (const [idx, id] of TRIO.entries()) {
      const e = cyborg.find((s) => s.id === id);
      expect(e, `电子人店须含 ${id}`).toBeTruthy();
      expect(e!.cond).toBe('hardMode');
      expect(e!.price).toBe(100000);              // buyPrice(0,10) 原版真值
      expect(cyborg.findIndex((s) => s.id === id)).toBeGreaterThan(
        cyborg.findIndex((s) => s.id === 1346));  // 位序=源码序（三件在 hardmode 段 1346 之后）
      expect(idx).toBeLessThan(3);
    }
    // 源码序 5452→5451→5738
    const ids = cyborg.map((s) => s.id);
    expect(ids.indexOf(5452)).toBeLessThan(ids.indexOf(5451));
    expect(ids.indexOf(5451)).toBeLessThan(ids.indexOf(5738));
  });

  it('values 表 5451/5452/5738 = 100000（buyPrice(0,10)）——台账「10 银」系形参语义误读', () => {
    for (const id of TRIO) expect(VALUES[String(id)]).toBe(100000);
    // buyPrice 定义锚：第二形参=gold（`gold * 100 * 100`）→ buyPrice(0,10)=10 金=100000 铜
    const m = ITEM_CS.match(/public static int buyPrice\(int platinum = 0, int gold = 0, int silver = 0, int copper = 0\)\s*\{\s*return ([^;]+);/);
    expect(m, 'buyPrice 定义在 Item.cs').toBeTruthy();
    expect(m![1]).toContain('gold * 100 * 100');
    // Item.cs case 5451/5452/5738 的 value=buyPrice(0, 10) 锚（5738 走 SetShopValues 同价）
    expect(ITEM_CS).toMatch(/case 5451:[\s\S]{0,400}?value = buyPrice\(0, 10\);/);
    expect(ITEM_CS).toMatch(/case 5452:[\s\S]{0,400}?value = buyPrice\(0, 10\);/);
    expect(ITEM_CS).toMatch(/case 5738:[\s\S]{0,200}?SetShopValues\([^)]*buyPrice\(0, 10\)\)/);
  });

  it('travelshop 池（GetItem 66 + GetPainting 31）零三 id——旅行商本就不卖,提取器无盲区', () => {
    expect(TRAVEL_POOL.src).toBe('Terarria1457');
    expect(TRAVEL_POOL.items.length).toBe(66);
    expect(TRAVEL_POOL.paintings.length).toBe(31);
    const poolIds = new Set<number>();
    for (const pool of [TRAVEL_POOL.items, TRAVEL_POOL.paintings]) {
      for (const e of pool) {
        if (e.id != null) poolIds.add(e.id);
        if (e.ids) for (const v of e.ids) poolIds.add(v);
      }
    }
    for (const id of TRIO) expect(poolIds.has(id), `${id} 不应在旅行商池`).toBe(false);
  });
});

// ==================== ③ 运行时面：shopStockFor 判别差集 ====================
describe.skipIf(EXT_MISSING)('③ 运行时面（Game.shopStockFor 合成 this）', () => {
  it('电子人(209) hardmode 前后差集恰=三件套;plain hardmode 货架全表锁（case 14 全门关态）', () => {
    const idsOf = (over: CtxOver) =>
      shopStockFor.call(makeCtx(over), { npcKey: 'cyborg', vanillaId: 209 }).map((e) => e[0]);
    const pre = idsOf({});
    const post = idsOf({ hardMode: true });
    const diff = post.filter((id) => !pre.includes(id));
    // hardmode 门全集（case 14 两段 hardmode 支：4459/760/1346 + 三件套）——差集恰为此六件
    expect(new Set(diff)).toEqual(new Set([4459, 760, 1346, ...TRIO]));
    for (const id of TRIO) {
      expect(post, `困难模式须上架 ${id}`).toContain(id);
      expect(pre, `肉前不得上架 ${id}`).not.toContain(id);
    }
    // 全门关态（昼/非血月/非日食/无火星/非墓地/非万圣/无信号灯诱饵件）：case 14 静态+hardmode 段
    expect(post).toEqual([771, 4459, 760, 1346, ...TRIO, 5598, 5599, 5928]);
    // 773「night||eclipse」昼且非日食不上架
    expect(idsOf({ hardMode: true, day: false })).toContain(773);
    expect(idsOf({ hardMode: true, eclipse: true })).toContain(773);
  });

  it('旅行商(368) hardmode 前后库存恒同且永不含三件（帕鲁臂亦然）', () => {
    const idsOf = (over: CtxOver) =>
      shopStockFor.call(makeCtx(over), { npcKey: 'travelling_merchant', vanillaId: 368 }).map((e) => e[0]);
    for (const over of [{}, { hardMode: true }, { hardMode: true, hasVanilla: [5667] }, { hasVanilla: [5667] }] as CtxOver[]) {
      const ids = idsOf(over);
      for (const id of TRIO) expect(ids, `旅行商货架不得出现 ${id}`).not.toContain(id);
      expect(ids).toContain(5043);   // 流动池在位（合成锚）
    }
    expect(idsOf({ hardMode: true })).toEqual(idsOf({}));   // hardmode 前后恒同
    expect(idsOf({ hasVanilla: [5667] }).slice(0, 2)).toEqual([5735, 5736]);   // 帕鲁甲前缀段
  });
});
