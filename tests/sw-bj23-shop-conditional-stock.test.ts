// SW-BJ23 2026-09-07：NPC 商店条件库存对账（用户实报「雨天商人说卖雨伞，商店没雨伞」）。
// 原版考古（Terarria1457 逐行对勘，1458 Chest.cs 与 1457 逐字节一致=不受热补丁影响）：
//   Chest.SetupShop(Chest.cs:1354-3533) 槽位映射 = NPCInteractions.cs:489-513 Shop(npcType,shopIndex)
//   （17 商人→槽1 / 19 军火商→2 / 20 树妖→3 / … / 453 骷髅商→20 / 368 旅行商→19 / 227 画家→15+25）。
//
// 【定谳①】商人雨伞=原版本相（对话-库存「不同步」是原版刻意的玩笑）：
//   - 对话面：NPC.HasSpecialEventText（NPC.cs:96081-96105）rain 支 = Main.raining &&
//     !Main.IsItStorming && 1/3 掷骰 → MerchantSpecialText.Rain1「卖雨伞了！卖雨伞了！
//     半价的雨伞！」（en-US/zh-Hans.Town.json 同文）；Storm1「想买避雷针？哦，好像没货了。」同族。
//   - 库存面：Chest.SetupShop case 1（:1365-1477）商人店【任何条件下都无雨伞 946】；
//     雨伞 946 全 SetupShop 唯一上架点 = 骷髅商(453,槽20) moonPhase==1（:2810-2813）。
//   → 修「商店上架雨伞」才是偏离原版；本批不改雨伞，锁死该本相。
//
// 【定谳②】真缺口（本批修复面，SW-BJ23 标记）：
//   a) 蒸汽朋克人(178,槽11)：天磨 2197（ZoneSkyHeight :2197-2200）/ 蓝溶液 781
//      （else-if 链 :2214-2217）/ 沙雪土溶液 5392-5394（downedMoonlord :2222-2227）整缺；
//      溶液 else-if 链被提取器编码失真（780/782/784 门与原版真值表不符）；995 拼装机
//      恒真门（hardMode||!getGoodWorld :2164-2167 普通世界恒真）被误标 hardMode；
//      2195 丛林炉缺 ZoneJungle 合取门（:2189-2192）。
//   b) 树妖(20,槽3)：种子臂三条目（火把 8/猩红火把 4386/腐化火把 4385，Chest.cs:1727-1738
//      vampireSeed&&infectedSeed 门）被提取器静默剥离成 '!hardMode' → 普通肉前世界越货；
//      JSON 侧三行删除，运行时 shopStockFor case 20 种子臂（seedFlags 判定）为唯一来源。
//   c) 旅行商(368,槽19)：帕鲁联动甲 5735/5736（Chest.cs:2785-2795 首段——玩家
//      HasItemInAnyInventory 十种帕鲁召唤物之一 → 先于流动货上架）整缺。
//
// 【同源性】对话面（npcSpecialEventText）与库存门（shopCondOk）的雨/风/风暴条件同读
//   world.weather 的 raining/shouldUseStormMusic/shouldUseWindyDayMusic —— 结构锁+行为矩阵。
// 纯数据/合成 this 直调私有面：不建真实 Game/World（shop-currency.test.ts 同族）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { Game } from '../src/core/Game';
import shopstockJson from '../src/data/vanilla-shopstock.json';
import zhHans from '../public/l10n/zh-Hans.json';

const SHOPS = (shopstockJson as {
  shops: Record<string, Array<{ id: number; price: number | null; cond: string | null; customPrice?: number; currency?: 'DefenderMedals' }>>;
}).shops;

const GAME_SRC = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

// ---- 合成 this（shopCondOk/shopStockFor 只读这些面；LanternNight 静态默认熄灭） ----
interface CtxOver {
  day?: boolean; bloodMoon?: boolean; moonPhase?: number; eclipse?: boolean;
  xMas?: boolean; halloween?: boolean; hardMode?: boolean;
  raining?: boolean; storming?: boolean; windy?: boolean;
  crimson?: boolean; downed398?: boolean; golem?: boolean;
  zones?: Partial<Record<'zoneSnow' | 'zoneJungle' | 'zoneGraveyard' | 'zoneHallow' | 'zoneDesert' | 'zoneSkyHeight' | 'zoneBeach' | 'zoneGlowshroom' | 'zoneCorrupt' | 'zoneCrimson' | 'zoneUnderworldHeight', boolean>>;
  belowSurface?: boolean;
  hasVanilla?: number[];         // playerHasVanillaItem 命中表
  golfer?: number;
}
function makeCtx(over: CtxOver = {}): Record<string, unknown> {
  const zones = over.zones ?? {};
  const ctx: Record<string, unknown> = {
    world: {
      flags: { hardMode: !!over.hardMode, downed_398: !!over.downed398, downed_245: !!over.golem },
      clock: { isDay: over.day ?? true, bloodMoon: !!over.bloodMoon, moonPhase: over.moonPhase ?? 0, eclipse: !!over.eclipse, xMas: !!over.xMas, halloween: !!over.halloween, timeOfDay: 0.5 },
      weather: { raining: !!over.raining, shouldUseStormMusic: !!over.storming, shouldUseWindyDayMusic: !!over.windy },
      seedFlags: {},
      crimson: !!over.crimson,
      groundLevel: 1000,
    },
    scene: {
      belowSurface: !!over.belowSurface,
      zoneSnow: false, zoneJungle: false, zoneGraveyard: false, zoneHallow: false,
      zoneDesert: false, zoneSkyHeight: false, zoneBeach: false, zoneGlowshroom: false,
      zoneCorrupt: false, zoneCrimson: false, zoneUnderworldHeight: false, zoneDungeon: false,
      ...zones,
    },
    player: {
      cx: 0, cy: 0, y: 0, maxHp: 100, maxMana: 20,
      golferScoreAccumulated: over.golfer ?? 0,
      inv: { slots: [] },
    },
    entities: { npcs: [] },
    partyState: { manualParty: false, genuineParty: false, daysOnCooldown: 0, celebratingNpcs: [] },
    playerHasVanillaItem: (vid: number) => (over.hasVanilla ?? []).includes(vid),
    travelStock: [[5043, 1000], [3063, 500]] as Array<[number, number]>,   // 合成流动货（探针不涉其内容）
  };
  (ctx as Record<string, unknown>).shopCondOk = shopCondOk;   // shopStockFor 内部 this.shopCondOk
  return ctx;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const shopCondOk = (Game.prototype as any).shopCondOk as (this: any, cond: string | null) => boolean;
const shopStockFor = (Game.prototype as any).shopStockFor as (this: any, npc: { npcKey: string; vanillaId: number }) => Array<[number, number] | [number, number, number]>;

// ==================== ① 商人(17)：雨伞=原版本相 + 条件件金标 ====================
describe('SW-BJ23 商人(17,槽1)库存金标（Chest.cs:1365-1477 case 1 逐项）', () => {
  const merchant = SHOPS['17'];

  it('31 条件件 id+cond 全表锁（含提取器缺口的运行时补条 4074 风日车菊）', () => {
    expect(merchant.map((e) => [e.id, e.cond])).toEqual([
      [88, null], [87, null], [35, null], [1991, null], [3509, null], [3506, null],
      [8, null], [28, null], [188, 'hardMode'], [110, null], [189, 'hardMode'],
      [40, null], [42, null], [965, null], [967, 'zoneSnow'],
      [33, 'zoneJungle||tenthNotBees'], [279, 'bloodMoon'], [282, 'night'],
      [5643, 'party'], [346, 'downedBoss3'], [488, 'hardMode'], [1786, null],
      [1348, 'hardMode'], [3198, 'hardMode'],
      [4063, 'downedBoss2||downedBoss3||hardMode'], [4673, 'downedBoss2||downedBoss3||hardMode'],
      [4074, 'day&&windyDay'],                       // :1416-1419 Main.dayTime && IsItAHappyWindyDay
      [4388, 'notTheBees'], [931, 'has:930'], [1614, 'has:930'], [3108, 'has:3107'],
    ]);
  });

  it('定谳：任何条件下商人店都无雨伞 946（原版 case 1 无此条目——对话 Rain1 是玩笑）', () => {
    expect(merchant.some((e) => e.id === 946)).toBe(false);
    // 晴/雨/风/夜/血月全态实测：货架永无 946（雨伞面与对话面「不同步」=原版本相）
    for (const over of [
      {}, { raining: true }, { windy: true }, { day: false }, { bloodMoon: true },
      { raining: true, windy: true, bloodMoon: true, day: false },
    ] as CtxOver[]) {
      const ids = shopStockFor.call(makeCtx(over), { npcKey: 'merchant', vanillaId: 17 }).map((e) => e[0]);
      expect(ids).not.toContain(946);
    }
  });

  it('风日车菊 4074：白天+风日上架，风日夜间/无风日不上架（:1416-1419 双门）', () => {
    const idsOf = (o: CtxOver) => shopStockFor.call(makeCtx(o), { npcKey: 'merchant', vanillaId: 17 }).map((e) => e[0]);
    expect(idsOf({ day: true, windy: true })).toContain(4074);
    expect(idsOf({ day: true, windy: false })).not.toContain(4074);
    expect(idsOf({ day: false, windy: true })).not.toContain(4074);  // Main.dayTime 合取
  });

  it('雨伞唯一上架点=骷髅商(453,槽20) moonPhase==1（Chest.cs:2810-2813）', () => {
    const stockOf = (phase: number) => shopStockFor.call(
      makeCtx({ moonPhase: phase, day: false }),
      { npcKey: 'skeleton_merchant', vanillaId: 453 }).map((e) => e[0]);
    expect(stockOf(1)).toContain(946);
    for (const phase of [0, 2, 3, 4, 5, 6, 7]) expect(stockOf(phase)).not.toContain(946);
  });

  it('对话面在台词包里有雨伞行（MerchantSpecialText.Rain1，zh-Hans=原版同文）', () => {
    const mt = (zhHans as Record<string, Record<string, string>>).MerchantSpecialText;
    expect(mt.Rain1).toBe('卖雨伞了！卖雨伞了！半价的雨伞！');
  });
});

// ==================== ② shopCondOk 行为矩阵（含溶液 else-if 链真值表） ====================
describe('SW-BJ23 shopCondOk 行为矩阵（原版 if 语义直判）', () => {
  it('风/雨/风暴 token 与对话面同源（都读 world.weather 同字段）', () => {
    expect(shopCondOk.call(makeCtx({ windy: true, day: true }), 'day&&windyDay')).toBe(true);
    expect(shopCondOk.call(makeCtx({ windy: true, day: false }), 'day&&windyDay')).toBe(false);
    expect(shopCondOk.call(makeCtx({ windy: false }), 'windyDay')).toBe(false);
    expect(shopCondOk.call(makeCtx({ storming: true }), 'storming')).toBe(true);
    expect(shopCondOk.call(makeCtx({ storming: true, raining: true }), '!storming')).toBe(false);
    // 结构锁：对话面 rain 支 = wd.raining && !wd.shouldUseStormMusic（NPC.cs:96081 rain 支）
    expect(GAME_SRC).toContain('if (wd.raining && !wd.shouldUseStormMusic) { const t = pick(\'Rain\'); if (t) return t; }');
    expect(GAME_SRC).toContain('if (wd.shouldUseWindyDayMusic) { const t = pick(\'Windy\'); if (t) return t; }');
    // 结构锁：库存门 windyDay/storming token 读同一 weather 字段（Game.ts shopCondOk）
    expect(GAME_SRC).toContain("case 'windyDay': return !!this.world.weather?.shouldUseWindyDayMusic;");
    expect(GAME_SRC).toContain("case 'storming': return !!this.world.weather?.shouldUseStormMusic;");
  });

  it('蒸汽朋克溶液 else-if 链真值表 = 原版 if(eclipse||bloodMoon){crimson?784:782}else if(hallow)781 else 780（:2201-2221）', () => {
    const CONDS: Record<number, string> = {
      784: 'eclipse&&crimson||bloodMoon&&crimson',
      782: 'eclipse&&!crimson||bloodMoon&&!crimson',
      781: '!eclipse&&!bloodMoon&&zoneHallow',
      780: '!eclipse&&!bloodMoon&&!zoneHallow',
    };
    for (const eclipse of [false, true]) for (const bm of [false, true]) for (const cr of [false, true]) for (const ha of [false, true]) {
      const ctx = makeCtx({ eclipse, bloodMoon: bm, crimson: cr, zones: { zoneHallow: ha } });
      // 原版期望：事件夜压过群系支
      const want = (eclipse || bm) ? (cr ? 784 : 782) : (ha ? 781 : 780);
      const got = Object.entries(CONDS).filter(([, c]) => shopCondOk.call(ctx, c)).map(([id]) => Number(id));
      expect(got).toEqual([want]);
    }
  });

  it('downed_398 月总门 / zoneJungle&&downedGolemBoss 丛林炉门', () => {
    expect(shopCondOk.call(makeCtx({ downed398: true }), 'downed_398')).toBe(true);
    expect(shopCondOk.call(makeCtx({}), 'downed_398')).toBe(false);
    expect(shopCondOk.call(makeCtx({ zones: { zoneJungle: true }, golem: true }), 'zoneJungle&&downedGolemBoss')).toBe(true);
    expect(shopCondOk.call(makeCtx({ zones: { zoneJungle: true }, golem: false }), 'zoneJungle&&downedGolemBoss')).toBe(false);
    expect(shopCondOk.call(makeCtx({ golem: true }), 'zoneJungle&&downedGolemBoss')).toBe(false);
  });
});

// ==================== ③ 蒸汽朋克人(178,槽11) 修复面 ====================
describe('SW-BJ23 蒸汽朋克人(178)缺失条件件补齐（Chest.cs case 11 :2129-2238）', () => {
  const st = SHOPS['178'];
  const condOf = (id: number) => st.find((e) => e.id === id)?.cond;

  it('JSON 结构锁：2197 天磨(zoneSkyHeight)/781 蓝溶液/5392-5394 沙雪土溶液(downed_398) 在表', () => {
    expect(condOf(2197)).toBe('zoneSkyHeight');            // :2197-2200
    expect(condOf(781)).toBe('!eclipse&&!bloodMoon&&zoneHallow'); // :2214-2217
    expect(condOf(5392)).toBe('downed_398');               // :2222-2227
    expect(condOf(5393)).toBe('downed_398');
    expect(condOf(5394)).toBe('downed_398');
  });

  it('JSON 结构锁：995 门 = hardMode||!getGoodWorld（:2164-2167；★SW-RB6a 2026-09-07 起 FTW 世界精确判，曾恒真备案）+2195 丛林合取门（:2189-2192）', () => {
    expect(condOf(995)).toBe('hardMode||!getGoodWorld');
    expect(condOf(2195)).toBe('zoneJungle&&downedGolemBoss');
  });

  it('JSON 顺序锁：溶液族按原版 else-if 链序 784→782→781→780→5392→5393→5394（:2201-2227）', () => {
    const idx = (id: number) => st.findIndex((e) => e.id === id);
    expect([784, 782, 781, 780, 5392, 5393, 5394].map(idx)).toEqual(
      [...[784, 782, 781, 780, 5392, 5393, 5394].map(idx)].sort((a, b) => a - b));
    expect(idx(2198)).toBeLessThan(idx(2197));   // 天磨在雪溶液后、溶液族前
    expect(idx(2197)).toBeLessThan(idx(784));
  });

  it('实表：圣域白昼→781 蓝溶液；血月/日食夜→784(猩红)/782(腐化)；普通森林→780', () => {
    const idsOf = (o: CtxOver) => shopStockFor.call(makeCtx(o), { npcKey: 'steampunker', vanillaId: 178 }).map((e) => e[0]);
    expect(idsOf({ zones: { zoneHallow: true } })).toContain(781);
    expect(idsOf({ bloodMoon: true, crimson: true })).toContain(784);
    expect(idsOf({ bloodMoon: true, crimson: true })).not.toContain(782);
    expect(idsOf({ eclipse: true, crimson: false })).toContain(782);
    expect(idsOf({ eclipse: true, crimson: false })).not.toContain(784);
    expect(idsOf({ zones: { zoneHallow: true, } })).not.toContain(780);
    const forest = idsOf({});
    expect(forest).toContain(780);
    expect(forest).not.toContain(781);
    expect(forest).not.toContain(784);
  });

  it('实表：月总后 5392-5394 三溶液上架；天磨只在天空高度', () => {
    const idsOf = (o: CtxOver) => shopStockFor.call(makeCtx(o), { npcKey: 'steampunker', vanillaId: 178 }).map((e) => e[0]);
    const withMoon = idsOf({ downed398: true });
    expect(withMoon).toEqual(expect.arrayContaining([5392, 5393, 5394]));
    expect(idsOf({})).toEqual(expect.not.arrayContaining([5392, 5393, 5394]));
    expect(idsOf({ zones: { zoneSkyHeight: true } })).toContain(2197);
    expect(idsOf({})).not.toContain(2197);
  });

  it('实表：2195 丛林炉 = 丛林+石人双门；995 拼装机普通世界在架、FTW 肉前不在架（:2164-2167）', () => {
    const idsOf = (o: CtxOver) => shopStockFor.call(makeCtx(o), { npcKey: 'steampunker', vanillaId: 178 }).map((e) => e[0]);
    expect(idsOf({ zones: { zoneJungle: true }, golem: true })).toContain(2195);
    expect(idsOf({ zones: { zoneJungle: true }, golem: false })).not.toContain(2195);
    expect(idsOf({ hardMode: false })).toContain(995);   // 曾误标 hardMode=肉前缺货
  });

  it('★SW-RB6a：995 = hardMode||!getGoodWorld 全真值表（Chest.cs:2164-2167）——FTW+肉前=唯一不可达态', () => {
    const cases: Array<[boolean, boolean, boolean]> = [
      // [hardMode, getGoodWorld, 期望上架]
      [false, false, true], [true, false, true], [false, true, false], [true, true, true],
    ];
    for (const [hm, ftw, want] of cases) {
      const ctx = makeCtx({ hardMode: hm });
      (ctx.world as { seedFlags: Record<string, boolean> }).seedFlags = { getGoodWorld: ftw };
      expect(shopCondOk.call(ctx, 'hardMode||!getGoodWorld'), `hm=${hm} ftw=${ftw}`).toBe(want);
    }
  });
});

// ==================== ④ 树妖(20,槽3) 种子臂越货回归 ====================
describe('SW-BJ23 树妖(20)种子臂三行越货清除（Chest.cs:1727-1738）', () => {
  it('JSON 无火把 8/猩红火把 4386/腐化火把 4385 条目（提取器曾把种子门剥成 !hardMode 恒越货）', () => {
    const ids = SHOPS['20'].map((e) => e.id);
    expect(ids).not.toContain(8);
    expect(ids).not.toContain(4385);
    expect(ids).not.toContain(4386);
  });

  it('普通肉前世界树妖店无火把/邪恶火把；月相轮换货仍按相位出（运行时种子臂为唯一来源）', () => {
    for (const phase of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const ids = shopStockFor.call(makeCtx({ moonPhase: phase, hardMode: false }), { npcKey: 'dryad', vanillaId: 20 }).map((e) => e[0]);
      expect(ids).not.toContain(8);
      expect(ids).not.toContain(4385);
      expect(ids).not.toContain(4386);
      expect(ids).toEqual(expect.arrayContaining([66, 62, 63, 745, 27, 114]));  // 常驻链在
    }
  });

  it('种子臂本体仍按 seedFlags 门直判（vampireSeed+infectedSeed+!hardMode → 8+邪恶火把）', () => {
    // 结构锁：shopStockFor case 20 尾段种子臂表达式原样在源（BJ23 只删 JSON 侧重复行）
    expect(GAME_SRC).toContain('if (npc.vanillaId === 20 && vs && inf && !this.world.flags.hardMode) {');
    expect(GAME_SRC).toContain('add([this.world.crimson ? 4386 : 4385]);');
  });
});

// ==================== ⑤ 旅行商(368,槽19) 帕鲁联动甲 ====================
describe('SW-BJ23 旅行商(368)帕鲁联动甲 5735/5736（Chest.cs:2785-2795）', () => {
  it('触发物十件套 = 原版 HasItemInAnyInventory 逐值（:2786-2792 字面表）', () => {
    const triggers = (Game as unknown as { PALWORLD_VENDOR_TRIGGER_IDS: Set<number> }).PALWORLD_VENDOR_TRIGGER_IDS;
    expect([...triggers].sort((a, b) => a - b)).toEqual(
      [5663, 5664, 5665, 5666, 5667, 6148, 6149, 6150, 6151, 6174]);
  });

  it('持任一帕鲁召唤物 → 帕鲁金属胸甲/护腿先于流动货上架（顺序=原版首段）', () => {
    const stock = shopStockFor.call(makeCtx({ hasVanilla: [5663] }), { npcKey: 'travelling_merchant', vanillaId: 368 });
    expect(stock.slice(0, 2).map((e) => e[0])).toEqual([5735, 5736]);
  });

  it('无帕鲁召唤物 → 店内无 5735/5736（流动货照旧）', () => {
    const stock = shopStockFor.call(makeCtx({}), { npcKey: 'travelling_merchant', vanillaId: 368 });
    expect(stock.some((e) => e[0] === 5735 || e[0] === 5736)).toBe(false);
    expect(stock.length).toBeGreaterThan(0);
  });
});

// ==================== ⑥ 对话-库存同源性收口 ====================
describe('SW-BJ23 对话-库存条件同源收口', () => {  it('HasSpecialEventText 五环境支序 = 墓园→派对→雨→风→风暴（NPC.cs:96081-96105 1:1）', () => {
    const fn = GAME_SRC.slice(GAME_SRC.indexOf('private npcSpecialEventText'), GAME_SRC.indexOf('housingOccupied()'));
    const order = ['Graveyard', 'Party', 'Rain', 'Windy', 'Storm'].map((k) => fn.indexOf(`pick('${k}')`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('商人对话链在事件文案【之后】走原版时段分支（事件优先,NPC.cs GetChat 首位）', () => {
    const idx = {
      special: GAME_SRC.indexOf('const special = this.npcSpecialEventText(npc);'),
      merchant: GAME_SRC.indexOf("if (npc.vanillaId === 17) {\n      // 商人(NPC.cs:95077-95105)"),
    };
    expect(idx.special).toBeGreaterThanOrEqual(0);
    expect(idx.merchant).toBeGreaterThan(idx.special);
  });
});

// ==================== ⑦ SW-RB6a 2026-09-07 红蓝复核：动物学家(633,槽23)去重+越货清除 ====================
// 原版 case 23（Chest.cs:3241-3402）全表由 shopStockFor 运行时臂承载（bestiary 进度门
// 无法以 json cond 表达）——json 侧 14 行系提取器把 moonPhase/2 switch 摊平成无条件行，
// 与运行时臂双写（4767/4829/4736/4701/5466 各 ×2 + 耳套四对全在架）。JSON 清空后运行时
// 臂为唯一来源；另 4744 猎人斗篷越货臂整删（原版上架点=裁缝 case 5 :1971-1976/派对
// 女孩 case 13 :2352，动物学家无此条目）。
describe('SW-RB6a 2026-09-07 动物学家(633)运行时臂唯一来源 + 4744 越货清除（Chest.cs:3241-3402）', () => {
  interface ZCtx extends CtxOver { bestiary?: number; fairySeen?: boolean }
  const stockOf = (over: ZCtx & { party?: boolean }): number[] => {
    const ctx = makeCtx(over);
    (ctx.world as Record<string, unknown>).bestiary = {
      completion: () => ({ percent: over.bestiary ?? 0 }),
      unlockState: () => (over.fairySeen ? 1 : 0),   // 仙灵火把门三件全看
    };
    if (over.party) {
      (ctx as Record<string, unknown>).partyState
        = { manualParty: true, genuineParty: false, daysOnCooldown: 0, celebratingNpcs: [] };
    }
    for (const [k2, v2] of Object.entries((over as { flags?: Record<string, boolean> }).flags ?? {})) {
      ((ctx.world as { flags: Record<string, boolean> }).flags as Record<string, boolean>)[k2] = v2;
    }
    return shopStockFor.call(ctx, { npcKey: 'zoologist', vanillaId: 633 }).map((e) => e[0]);
  };

  it('JSON 侧 633 清空（运行时臂唯一来源——原表 moonPhase/2 switch 不可 json 化）', () => {
    expect(SHOPS['633']).toEqual([]);
  });

  it('无重复上架（图鉴 100%+派对+困难血月+相0 全开态 ids 唯一）', () => {
    const ids = stockOf({ bestiary: 1, fairySeen: true, hardMode: true, bloodMoon: true,
      party: true, moonPhase: 0, day: false } as ZCtx & { party: boolean });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('满进度全开态覆盖面：常驻/图鉴门/相位对齐出，异相耳套不在架', () => {
    const ids = stockOf({ bestiary: 1, fairySeen: true, hardMode: true, bloodMoon: true,
      party: true, moonPhase: 0, day: false, flags: { downedTowerSolar: true, downed_262: true } } as ZCtx & { party: boolean; flags?: Record<string, boolean> });
    for (const id of [4776, 4767, 5253, 5635, 4759, 4672, 4829, 4830, 4910, 4871, 4907,
      4677, 4676, 4762, 4785, 4786, 4787, 4788, 4716, 4763, 4955, 4736, 4701,
      4765, 4766, 5285, 4777, 4735, 4951, 5466, 4768, 4769]) {
      expect(ids, `id ${id}`).toContain(id);
    }
    expect(ids).not.toContain(4770);   // 相 2/3 对——相 0 不出
    expect(ids).not.toContain(4560);   // 相 6/7 对
  });

  it('门槛半开态：图鉴 20% 只出 0.03/0.10 档；无派对无 5466；无世花无 4701', () => {
    const ids = stockOf({ bestiary: 0.2, moonPhase: 0 });
    expect(ids).toContain(4672);
    expect(ids).toContain(4759);
    expect(ids).not.toContain(4830);   // ≥25%
    expect(ids).not.toContain(5466);
    expect(ids).not.toContain(4701);
    expect(ids).not.toContain(4736);   // 困难+血月
  });

  it('越货清除：猎人斗篷 4744 永不在动物学家架（原版上架点=裁缝 golfer2000/派对女孩派对段）', () => {
    expect(stockOf({ bestiary: 1, golfer: 99999, party: true })).not.toContain(4744);
  });

  it('吸血鬼种子臂保留：vampireSeed&&!infectedSeed → 恰一支火把 8（无重复）', () => {
    const ctx = makeCtx({});
    (ctx.world as { seedFlags: Record<string, boolean> }).seedFlags = { vampireSeed: true };
    (ctx.world as Record<string, unknown>).bestiary = {
      completion: () => ({ percent: 0 }), unlockState: () => 0,
    };
    const ids = shopStockFor.call(ctx, { npcKey: 'zoologist', vanillaId: 633 }).map((e) => e[0]);
    expect(ids.filter((v) => v === 8).length).toBe(1);
  });
});

// ==================== ⑧ SW-RB6a 2026-09-07 树妖种子臂单点化（双写清除） ====================
describe('SW-RB6a 2026-09-07 树妖(20)种子世界单份火把/邪恶火把（IIIII61 块唯一来源）', () => {
  it('vampireSeed+infectedSeed+!hardMode → 8/4385 各恰一件（曾 case20 内臂+IIIII61 块双写）', () => {
    const ctx = makeCtx({ hardMode: false });
    (ctx.world as { seedFlags: Record<string, boolean> }).seedFlags = { vampireSeed: true, infectedSeed: true };
    const ids = shopStockFor.call(ctx, { npcKey: 'dryad', vanillaId: 20 }).map((e) => e[0]);
    expect(ids.filter((v) => v === 8).length).toBe(1);
    expect(ids.filter((v) => v === 4385).length).toBe(1);   // 腐化世界（crimson:false）
    expect(ids).not.toContain(4386);
  });
});
