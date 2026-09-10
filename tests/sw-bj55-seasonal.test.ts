// ★SW-BJ55（2026-09-10）现实时间（DateTime.Now）驱动功能面：窗口/强制旗/替代/消费面
//   全链测试。金标锚：
//   - checkXMas ★1457 Main.cs:13290-13310（现实臂 12/15-31 ∪ forceXMasForToday ∪ Forever）
//   - isHalloweenDateNow ★1457 Main.cs:13315-13327（10/10-31 ∪ 11/1——★任务书假想窗
//     「10/20-11/10」与反编译不符,以反编译为准）
//   - checkHalloween ★1457 Main.cs:13329-13344
//   - 调用面 Main.cs:66369-66370（UpdateTime_StartDay 每黎明）/WorldGen.cs:3273-3274
//     （OnWorldLoad）/Main.cs:11057-11095（月事件 wave≥15 → 强制当日位）
//   - Item.NewItem 节日替代 ★1457 Item.cs:49670-49720（1458 同位零漂移）
//   - 洞穴幽灵节日臂 ★1457 NPC.cs:5078（!noWorms && (halloween||graveyard) && 1/30）
//   - Santa 季末自灭 ★1457 NPC.cs:53708（type==142 && netMode!=1 && !xMas → 9999）
//   - 1458 同域核对：Main.cs:13290/13313/13329/Item.cs:49677/NPC.cs:53708 全部同行号。
// 变异证红：边界日逐日翻转/替代矩阵逐支关旗/幽灵臂关 halloween → 必红。
import { describe, it, expect } from 'vitest';
import {
  isHalloweenDateNow, isXMasDateNow, seasonalHolidayFlags,
} from '../src/world/World';
import { isHalloweenDateNow as isHalloweenDateNowUI, applyHalloweenSeasonSeed } from '../src/ui/WorldCreation';
import { holidayPickupSubstitute, isPickupVid } from '../src/drops/SeasonalPickups';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { T } from '../src/data/tiles';
import { TownNPC } from '../src/entities/TownNPC';
import shopstockJson from '../src/data/vanilla-shopstock.json';
import npcDropsJson from '../src/data/vanilla-npcdrops.json';

const D = (y: number, m1: number, d: number) => new Date(y, m1 - 1, d);   // (年, 月1-12, 日)

// ── A. 万圣窗边界（Main.cs:13315-13327 逐日翻转）────────────────────────────

describe('SW-BJ55 A: isHalloweenDateNow 窗界（10/10 起,11/1 关）', () => {
  it('10/9=false → 10/10=true（窗开日）', () => {
    expect(isHalloweenDateNow(D(2026, 10, 9))).toBe(false);
    expect(isHalloweenDateNow(D(2026, 10, 10))).toBe(true);
  });
  it('10/31=true → 11/1=true → 11/2=false（11/1 是最后一天）', () => {
    expect(isHalloweenDateNow(D(2026, 10, 31))).toBe(true);
    expect(isHalloweenDateNow(D(2026, 11, 1))).toBe(true);
    expect(isHalloweenDateNow(D(2026, 11, 2))).toBe(false);
  });
  it('10/1-10/8=false（窗内早段不开）、12/1=false、9/30=false', () => {
    for (const day of [1, 8, 9]) expect(isHalloweenDateNow(D(2026, 10, day))).toBe(false);
    expect(isHalloweenDateNow(D(2026, 12, 1))).toBe(false);
    expect(isHalloweenDateNow(D(2026, 9, 30))).toBe(false);
  });
  it('单源：UI 包装（WorldCreation）与 world/World 权威函数全等', () => {
    const days: Array<[number, number]> = [[10, 9], [10, 10], [11, 1], [11, 2], [12, 15]];
    for (const [m, d] of days) {
      expect(isHalloweenDateNowUI(D(2026, m, d))).toBe(isHalloweenDateNow(D(2026, m, d)));
    }
  });
});

// ── B. 圣诞窗边界（Main.cs:13292-13299 逐日翻转）────────────────────────────

describe('SW-BJ55 B: isXMasDateNow 窗界（12/15 起,跨年 1/1 关）', () => {
  it('12/14=false → 12/15=true（窗开日）', () => {
    expect(isXMasDateNow(D(2026, 12, 14))).toBe(false);
    expect(isXMasDateNow(D(2026, 12, 15))).toBe(true);
  });
  it('12/31=true → 1/1=false（不跨年）', () => {
    expect(isXMasDateNow(D(2026, 12, 31))).toBe(true);
    expect(isXMasDateNow(D(2027, 1, 1))).toBe(false);
  });
  it('11/30=false、12/1-12/14 全 false', () => {
    expect(isXMasDateNow(D(2026, 11, 30))).toBe(false);
    for (const day of [1, 10, 14]) expect(isXMasDateNow(D(2026, 12, day))).toBe(false);
  });
});

// ── C. 强制旗覆写（checkXMas/checkHalloween 全式 Main.cs:13290-13344）────────

describe('SW-BJ55 C: seasonalHolidayFlags 强制位三路或', () => {
  it('窗外 + forceXMasForToday → xMas=true（覆写）；仅 halloween 位同理', () => {
    const off = D(2026, 6, 1);   // 两窗全关
    expect(seasonalHolidayFlags(off, { forceXMasForToday: true }, {}).xMas).toBe(true);
    expect(seasonalHolidayFlags(off, { forceHalloweenForToday: true }, {}).halloween).toBe(true);
    expect(seasonalHolidayFlags(off, {}, {})).toEqual({ halloween: false, xMas: false });
  });
  it('forceForever 同效（种子/存档持久位）且与 ForToday 互不干扰', () => {
    const off = D(2026, 6, 1);
    expect(seasonalHolidayFlags(off, {}, { forceXMasForever: true }).xMas).toBe(true);
    expect(seasonalHolidayFlags(off, {}, { forceHalloweenForever: true }).halloween).toBe(true);
  });
  it('窗内日期直通（无强制位也开窗）；halloweenGen 种子日期臂消费同窗', () => {
    const hw = D(2026, 10, 15);
    const f = seasonalHolidayFlags(hw, {}, {});
    expect(f.halloween).toBe(true);
    expect(f.xMas).toBe(false);
    // applyHalloweenSeasonSeed 的日期臂同一窗（WorldFileData.cs:417-425）
    expect(applyHalloweenSeasonSeed('', hw).startsWith('pumpkinseason|')).toBe(true);
    expect(applyHalloweenSeasonSeed('', D(2026, 6, 1))).toBe('');
  });
});

// ── D. 心/星节日替代矩阵（Item.cs:49670-49720 三分支）────────────────────────

describe('SW-BJ55 D: holidayPickupSubstitute（心 58/星 184 → 糖果变体）', () => {
  const det = (seed: number) => { const r = new RNG(seed); return () => r.next(); };

  it('两窗全关 → 恒原样（58/184 不动）', () => {
    const ctx = { halloween: false, xMas: false, tenthAnniversaryWorld: false };
    for (let k = 0; k < 50; k++) {
      expect(holidayPickupSubstitute(58, ctx, det(k))).toBe(58);
      expect(holidayPickupSubstitute(184, ctx, det(k))).toBe(184);
    }
  });
  it('仅万圣（含月事件强制位传导）→ 心→糖苹果 1734 / 星→灵魂蛋糕 1735', () => {
    const ctx = { halloween: true, xMas: false, tenthAnniversaryWorld: false };
    for (let k = 0; k < 50; k++) {
      expect(holidayPickupSubstitute(58, ctx, det(k))).toBe(1734);
      expect(holidayPickupSubstitute(184, ctx, det(k))).toBe(1735);
    }
  });
  it('仅圣诞 → 心→拐杖糖 1867 / 星→糖梅 1868', () => {
    const ctx = { halloween: false, xMas: true, tenthAnniversaryWorld: false };
    for (let k = 0; k < 50; k++) {
      expect(holidayPickupSubstitute(58, ctx, det(k))).toBe(1867);
      expect(holidayPickupSubstitute(184, ctx, det(k))).toBe(1868);
    }
  });
  it('双季叠加（如强制万圣撞圣诞窗）→ {1734,1867}/{1735,1868} 二选一,两值均可达', () => {
    const ctx = { halloween: true, xMas: true, tenthAnniversaryWorld: false };
    const hearts = new Set<number>(), stars = new Set<number>();
    for (let k = 0; k < 200; k++) {
      hearts.add(holidayPickupSubstitute(58, ctx, det(k)));
      stars.add(holidayPickupSubstitute(184, ctx, det(k)));
    }
    expect([...hearts].sort()).toEqual([1734, 1867]);
    expect([...stars].sort()).toEqual([1735, 1868]);
  });
  it('十周年世界 → {1734,1867,58}/{1735,1868,184} 三选一,原版 pickup 仍在池', () => {
    const ctx = { halloween: false, xMas: false, tenthAnniversaryWorld: true };
    const hearts = new Set<number>(), stars = new Set<number>();
    for (let k = 0; k < 400; k++) {
      hearts.add(holidayPickupSubstitute(58, ctx, det(k)));
      stars.add(holidayPickupSubstitute(184, ctx, det(k)));
    }
    expect([...hearts].sort((a, b) => a - b)).toEqual([58, 1734, 1867]);
    expect([...stars].sort((a, b) => a - b)).toEqual([184, 1735, 1868]);
  });
  it('isPickupVid 判别（仅 58/184 进替代管）', () => {
    expect(isPickupVid(58)).toBe(true);
    expect(isPickupVid(184)).toBe(true);
    expect(isPickupVid(1734)).toBe(false);
    expect(isPickupVid(71)).toBe(false);
  });
});

// ── E. 消费面矩阵（数据级锁：季节货/掉袋/圣诞老人生成门）────────────────────

describe('SW-BJ55 E: 季节消费面数据锁', () => {
  const shops = (shopstockJson as { shops: Record<string, Array<{ id: number; cond: string | null }>> }).shops;

  it('Goodie Bag 1774 全局 1/80 + Present 1869 全局 1/13（ItemDropDatabase.cs:693-694）', () => {
    const entries = (npcDropsJson as { entries: Array<{ global?: boolean; rule: { item: number; denom: number; cond?: { name: string } } }> }).entries
      .filter((e) => e.global && (e.rule.item === 1774 || e.rule.item === 1869));
    const bag = entries.find((e) => e.rule.item === 1774);
    const pres = entries.find((e) => e.rule.item === 1869);
    expect(bag?.rule.denom).toBe(80);
    expect(bag?.rule.cond?.name).toBe('HalloweenGoodieBagDrop');
    expect(pres?.rule.denom).toBe(13);
    expect(pres?.rule.cond?.name).toBe('XmasPresentDrop');
  });

  it('城镇商店季节货矩阵（Clothier/ArmsDealer/Dryad/Wizard/Steampunker/DyeTrader/Cyborg/WitchDoctor）', () => {
    const condItems = (shop: string, cond: string) =>
      (shops[shop] ?? []).filter((e) => e.cond === cond).map((e) => e.id);
    // 万圣装束（Chest.SetupShop 各 case 条件行,halloween 门）
    expect(condItems('19', 'halloween')).toEqual([1736, 1737, 1738]);   // ArmsDealer: 护士装
    expect(condItems('20', 'halloween')).toEqual([1853, 1854]);         // Dryad: 树妖遮盖物
    expect(condItems('54', 'halloween')).toEqual([1740, 3246, 3247]);   // Clothier: 盖伊福克斯面具+裁缝装
    expect(condItems('108', 'halloween')).toEqual([1739]);              // Wizard: 法师帽
    expect(condItems('178', 'halloween')).toEqual([1742]);              // Steampunker: 蒸汽护目镜
    expect(condItems('207', 'halloween')).toEqual([3248, 1741]);        // DyeTrader: 头巾+长袍
    expect(condItems('209', 'halloween')).toEqual([1743, 1744, 1745]);  // Cyborg: 电子人头/身/腿整装（Chest.cs:2415-2423）
    expect(condItems('228', 'halloween')).toEqual([1791]);              // WitchDoctor: 女巫锅
    // 派对货（party 门,非日期驱动——BirthdayParty 随机事件）
    expect(condItems('54', 'party')).toContain(3735);                   // 派对中心
    expect(condItems('208', 'party').length).toBeGreaterThanOrEqual(9); // 派对女孩货架
    // 画家装饰专柜圣诞墙纸 1948-1957（Chest.cs:2477-2488,xMas 门）
    expect((shops['227'] ?? []).filter((e) => e.cond === 'xMas').map((e) => e.id))
      .toEqual(Array.from({ length: 10 }, (_, i) => 1948 + i));
  });

  it('圣诞老人商店 39 槽全量（Chest.SetupShop case 9 = NPCInteractions Shop(142,9)）', () => {
    const santa = shops['142'];
    expect(santa.map((e) => e.id)).toEqual([588, 589, 590, 597, 598, 596,
      ...Array.from({ length: 1905 - 1873 + 1 }, (_, i) => 1873 + i)]);
    expect(santa.every((e) => e.cond === null)).toBe(true);   // 圣诞老人店内无季节门（生成门在 xMas）
  });
});

// ── F. 洞穴幽灵节日臂（★1457 NPC.cs:5078——SW-BJ55 补刀）────────────────────

function ghostCaveWorld(): World {
  const w = new World(1300, 600, 42, 'sw-bj55-ghost');
  w.groundLevel = 100;
  w.rockLevel = 200;
  const st = w.store;
  // 深洞穴：y=300 石地板 + 顶部留 5 格净空（肉前链,hardMode=false）
  for (let x = 420; x < 580; x++) {
    st.setTileSilent(x, 300, T.STONE);
    st.setTileSilent(x, 301, T.STONE);
  }
  return w;
}

describe('SW-BJ55 F: 洞穴幽灵 316 节日臂（NPC.cs:5078 (halloween||graveyard)&&1/30）', () => {
  it('万圣季开窗 → 洞穴刷幽灵（1/2 主池门 × 1/30）', () => {
    const w = ghostCaveWorld();
    w.clock.halloween = true;                    // checkSeasonal 合算后的世界位
    const sp = new VanillaSpawner(w);
    sp.setPlayerFlags(false, false);
    let ghosts = 0;
    let spawned = 0;
    for (let k = 0; k < 6000; k++) {
      const e = sp.spawn(500 * 16 + 8, 297 * 16, new RNG(k * 7919 + 13), 24, 14);
      if (!e) continue;
      spawned++;
      if ((e as unknown as { vanillaId: number }).vanillaId === 316) ghosts++;
    }
    expect(spawned).toBeGreaterThan(300);        // 链活性哨兵：洞穴主池整体在出怪
    expect(ghosts).toBeGreaterThan(8);           // ~1/60 量级,6000 掷期望 ≈60-100
  });

  it('★变异证红：关掉 halloween（无墓地）→ 幽灵恒 0（补刀前此臂恒死）', () => {
    const w = ghostCaveWorld();
    w.clock.halloween = false;
    const sp = new VanillaSpawner(w);
    sp.setPlayerFlags(false, false);
    let ghosts = 0;
    let spawned = 0;
    for (let k = 0; k < 4000; k++) {
      const e = sp.spawn(500 * 16 + 8, 297 * 16, new RNG(k * 7919 + 13), 24, 14);
      if (!e) continue;
      spawned++;
      if ((e as unknown as { vanillaId: number }).vanillaId === 316) ghosts++;
    }
    expect(spawned).toBeGreaterThan(200);
    expect(ghosts).toBe(0);
  });
});

// ── G. 圣诞老人季末自灭（★1457 NPC.cs:53708——SW-BJ55 补刀）──────────────────

function santaStub(xMas: boolean) {
  const npc = new TownNPC('santa_claus', 100 * 16, 90 * 16);
  const game = {
    world: new World(200, 200, 110, 'sw-bj55-santa'),
    player: { hp: 100, maxHp: 100, dead: true, x: -9999, y: -9999, w: 0, h: 0 },
    npcs: () => [], enemies: () => [], critters: () => [],
    addDamageNumber: () => {}, spawnParticles: () => {}, playSfxFiles: () => {},
    behavioLog: () => {}, recLog: () => {},
  } as never;
  (game as unknown as { world: World }).world.clock.xMas = xMas;
  return { npc, game };
}

describe('SW-BJ55 G: Santa 142 季末自灭（NPC.cs:53708 !xMas → StrikeNPCNoInteraction(9999)）', () => {
  it('xMas=false → fixedUpdate 首拍即死（owner=255 静默清算,force 通道）', () => {
    const { npc, game } = santaStub(false);
    expect(npc.dead).toBe(false);
    (npc as unknown as { fixedUpdate: (dt: number, g: never) => void }).fixedUpdate(1 / 60, game);
    expect(npc.dead).toBe(true);
  });
  it('xMas=true → 不触发自灭通道（hurt 零调用,后续 AI 正常走）', () => {
    const { npc, game } = santaStub(true);
    const calls: number[] = [];
    (npc as unknown as { hurt: (dmg: number, ...a: unknown[]) => boolean }).hurt =
      (dmg: number, ..._a: unknown[]) => { calls.push(dmg); return false; };
    try {
      (npc as unknown as { fixedUpdate: (dt: number, g: never) => void }).fixedUpdate(1 / 60, game);
    } catch {
      // stub hooks 只为守卫位服务;后续 AI 走空世界缺面可容忍（守卫在 fixedUpdate 首行）
    }
    expect(calls).toEqual([]);          // 开窗期不进自灭臂
    expect(npc.dead).toBe(false);
  });
});
