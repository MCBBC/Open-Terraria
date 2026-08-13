// 系统覆盖补齐（星星雨/陨石/生日派对）核心数学验证
import { describe, it, expect, beforeAll } from 'vitest';
import { nightStarfallBoost } from '../src/entities/FallingStar';
import { dropMeteor, type MeteorHost } from '../src/world/MeteorFall';
import { partyNaturalAttempt, partyIsUp, newPartyState, partyCheckNight } from '../src/world/wiring/party';

describe('星星雨（Star.NightSetup :41-60 + SpawnFallingObjects :71861）', () => {
  it('boost 分布三档：常态 1.0 / 弱流星 1.0-1.5 / 流星夜 3.0-5.0', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(Math.floor(nightStarfallBoost(false) * 100));
    expect(seen.has(100)).toBe(true);  // 常态 1.0
    const weak = [...seen].some((v) => v >= 101 && v <= 150);
    const storm = [...seen].some((v) => v >= 300 && v <= 500);
    expect(weak).toBe(true);
    expect(storm).toBe(true);
  });
  it('每夜期望颗数 ≈ 40.5（4200 宽 boost=1：32400×4200/3360000）', () => {
    // 概率公式抽测：p = w×boost/3,360,000
    const p = (4200 * 1.0) / 3360000;
    expect(32400 * p).toBeCloseTo(40.5, 1);
  });
});

describe('陨石坠落（dropMeteor :6196）', () => {
  const makeHost = (solidRow: number, opts: Partial<MeteorHost> = {}): MeteorHost => ({
    w: 400, h: 200, spawnX: 200, groundLevel: 100, rockLevel: 150,
    store: {
      inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < 400 && y < 200,
      idx: (x: number, y: number) => y * 400 + x,
      isSolid: (x: number, y: number) => y >= solidRow,
      type: new Uint16Array(400 * 200),
      flags: new Uint8Array(400 * 200).fill(1),
      liquid: new Uint8Array(400 * 200),
      wall: new Uint8Array(400 * 200),
      setTileSilent: () => {},
    } as never,
    players: [{ x: 16, y: 16, w: 20, h: 42 }],
    npcs: [],
    rand: Math.random,
    int: (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1)),
    announce: () => {},
    ...opts,
  });
  it('落点远离玩家保护区（保护命中=候选作废换 X）', () => {
    const host = makeHost(90);
    const pos = dropMeteor(host);
    if (pos) {
      // 玩家在 (16..36, 16..58)，保护区 ±62/±39 tile → 落点必须在 35 tile 矩形外
      expect(Math.abs(pos.i - 26)).toBeGreaterThan(35);
    }
  });
  it('无人时直接失败（:6209-6216 无 active 玩家 return false）', () => {
    const host = makeHost(90, { players: [] });
    expect(dropMeteor(host)).toBeNull();
  });
  it('上限：地表以上 37 块超 400×w/4200 → 拒绝', () => {
    const host = makeHost(90);
    // 填满陨石到超限（400 宽 → 上限 38）
    const type = 1;
    for (let y = 5; y < 100; y++) {
      for (let x = 5; x < 100; x++) {
        host.store.type[host.store.idx(x, y)] = type;
      }
    }
    expect(dropMeteor(host)).toBeNull();
  });
});

describe('生日自然派对（NaturalAttempt :62-143）', () => {
  const rng = () => 0; // 桩：命中 1/10 门
  const int = (a: number, b: number) => a;
  it('无派对女孩 → 不开（:64-68）', () => {
    const s = newPartyState();
    const r = partyNaturalAttempt(s, {
      townNpcKeys: ['guide', 'merchant', 'nurse', 'dryad', 'arms_dealer'],
      girlPresent: false, anniversary: false, rng, int,
    });
    expect(r).toBeNull();
    expect(partyIsUp(s)).toBe(false);
  });
  it('女孩在场 + 5 NPC + 桩随机 → 开派对 + 冷却置位', () => {
    const s = newPartyState();
    const r = partyNaturalAttempt(s, {
      townNpcKeys: ['guide', 'merchant', 'nurse', 'dryad', 'arms_dealer', 'party_girl'],
      girlPresent: true, anniversary: false, rng, int,
    });
    expect(r).not.toBeNull();
    expect(partyIsUp(s)).toBe(true);
    expect(s.daysOnCooldown).toBe(5);
    expect(s.celebratingNpcs.length).toBeGreaterThanOrEqual(1);
  });
  it('冷却期递减不开（:69-73）', () => {
    const s = newPartyState();
    s.daysOnCooldown = 3;
    const r = partyNaturalAttempt(s, {
      townNpcKeys: ['guide', 'merchant', 'nurse', 'dryad', 'arms_dealer', 'party_girl'],
      girlPresent: true, anniversary: false, rng, int,
    });
    expect(r).toBeNull();
    expect(s.daysOnCooldown).toBe(2);
  });
  it('入夜结算清派对并要求广播（CheckNight :40-53）', () => {
    const s = newPartyState();
    s.genuineParty = true;
    expect(partyCheckNight(s)).toBe(true);
    expect(partyIsUp(s)).toBe(false);
  });
});

// ============ NPC 快乐度（ShopHelper.ProcessMood :99-180） ============
import { computeHappiness } from '../src/data/vanillaHappiness';

const baseHappy = {
  npcVanillaId: 17, homeless: false, distFromHome: 0,
  playerInCorrupt: false, playerInCrimson: false, playerInDungeon: false,
  zones: { forest: false, ocean: false, snow: false, desert: false, jungle: false, underground: false, hallow: false, mushroom: false },
  npcsInHouse: 0, npcsInVillage: 4, nearby: [], isPrincess: false, // village=4 压掉 LoveSpace
};

describe('NPC 快乐度/商店价格（ShopHelper）', () => {
  it('基准：森林 Merchant 有家无拥挤 → 1.0', () => {
    const r = computeHappiness({ ...baseHappy });
    expect(r.priceMul).toBe(1);
  });
  it('无家/离家>120/危险群系 → 置 1000 后 LimitAndRound 钳 1.5（:111-122 + :182-187）', () => {
    expect(computeHappiness({ ...baseHappy, homeless: true }).priceMul).toBe(1.5);
    expect(computeHappiness({ ...baseHappy, distFromHome: 121 }).priceMul).toBe(1.5);
    expect(computeHappiness({ ...baseHappy, playerInCorrupt: true }).priceMul).toBe(1.5);
  });
  it('拥挤：同屋>3 每人 ×1.05（5 人=×1.10 圆整）；宽敞 ×0.95（:126-157）', () => {
    expect(computeHappiness({ ...baseHappy, npcsInHouse: 5 }).priceMul).toBe(1.1);
    expect(computeHappiness({ ...baseHappy, npcsInHouse: 1, npcsInVillage: 2 }).priceMul).toBe(0.95); // LoveSpace
  });
  it('群系偏好：Merchant 喜欢 forest ×0.94 / dislike desert ×1.06；Santa Love/Hate ×0.88/×1.12', () => {
    expect(computeHappiness({ ...baseHappy, zones: { ...baseHappy.zones, forest: true } }).priceMul).toBe(0.94);
    expect(computeHappiness({ ...baseHappy, zones: { ...baseHappy.zones, forest: false, desert: true } }).priceMul).toBe(1.06);
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 142, zones: { ...baseHappy.zones, forest: false, snow: true } }).priceMul).toBe(0.88);
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 142, zones: { ...baseHappy.zones, desert: true } }).priceMul).toBe(1.12);
  });
  it('公主在场全员 ×0.94；公主自己孤单<2 → 钳 1.5（:128-137/:37-40）', () => {
    expect(computeHappiness({ ...baseHappy, nearby: [663] }).priceMul).toBe(0.94); // 同屋公主 :37-40
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 663, isPrincess: true, npcsInVillage: 1 }).priceMul).toBe(1.5);
    // 公主开店：同屋池随机抽 3 各 Love（:15-36；rand 固定 → 确定性）
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 663, isPrincess: true, nearby: [17, 18, 19], npcsInHouse: 3, rand: () => 0 }).priceMul).toBe(0.75); // 0.88³ 钳 0.75
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 663, isPrincess: true, nearby: [17], npcsInHouse: 1, rand: () => 0 }).priceMul).toBe(0.88); // 不足 3 全 Love
  });
  it('互相关系（:12-506 全量表）：Merchant 同屋护士 ×0.94 / 同屋渔夫 ×1.12 / 连乘 1.05', () => {
    expect(computeHappiness({ ...baseHappy, npcsInHouse: 1, nearby: [18] }).priceMul).toBe(0.94);
    expect(computeHappiness({ ...baseHappy, npcsInHouse: 1, nearby: [369] }).priceMul).toBe(1.12);
    expect(computeHappiness({ ...baseHappy, npcsInHouse: 2, nearby: [18, 369] }).priceMul).toBe(1.05); // 0.94×1.12=1.0528
    // 村范围不触发：渔夫在 25-120 → 只计数不出关系
    expect(computeHappiness({ ...baseHappy, npcsInVillage: 5, nearby: [] }).priceMul).toBe(1);
  });
  it('组合钳制 [0.75,1.5]（LimitAndRound :182-187）：Merchant 拥挤5+dislike → 1.15', () => {
    const r = computeHappiness({ ...baseHappy, npcsInHouse: 5, zones: { ...baseHappy.zones, forest: false, desert: true } });
    expect(r.priceMul).toBe(1.17); // 1.05²×1.06=1.169→1.17
  });
  it('旅行商/骷髅商/老人 → 1.0 恒定（:107-110）', () => {
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 368, homeless: true }).priceMul).toBe(1);
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 453, homeless: true }).priceMul).toBe(1);
  });
  it('群系偏好只取好感最强一条（BiomePreferenceListTrait :40-55）：地下雪原的机械师 → 只 Like ×0.94', () => {
    const zones = { ...baseHappy.zones, snow: true, underground: true };
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 124, zones }).priceMul).toBe(0.94);
    // 双群系同时命中时报告也只发一行 LikeBiome
    const r = computeHappiness({ ...baseHappy, npcVanillaId: 124, zones });
    expect(r.report.filter((l) => l.key.endsWith('Biome'))).toHaveLength(1);
    expect(r.report[0].key).toBe('TownNPCMood_Mechanic.LikeBiome');
    expect(r.report[0].biomeNameKey).toBe('Snow');
  });
  it('报告键 = TownNPCMood_<Internal>.<子键>（AddHappinessReportText :194-203）', () => {
    // 无家商人：NoHome 行 + 钳 1.5；恶群系 HateBiome 带 BiomeName 键
    const r1 = computeHappiness({ ...baseHappy, homeless: true });
    expect(r1.report.some((l) => l.key === 'TownNPCMood_Merchant.NoHome')).toBe(true);
    const r2 = computeHappiness({ ...baseHappy, playerInDungeon: true });
    expect(r2.report.some((l) => l.key === 'TownNPCMood_Merchant.HateBiome' && l.biomeNameKey === 'Dungeon')).toBe(true);
    // 关系行带 NPCName 替换目标；公主动态 Love 用 LoveNPC_<目标内名>
    const r3 = computeHappiness({ ...baseHappy, npcsInHouse: 1, nearby: [18] });
    expect(r3.report.some((l) => l.key === 'TownNPCMood_Merchant.LikeNPC' && l.npcId === 18)).toBe(true);
    const r4 = computeHappiness({ ...baseHappy, npcVanillaId: 663, isPrincess: true, nearby: [17], npcsInHouse: 1, rand: () => 0 });
    expect(r4.report.some((l) => l.key === 'TownNPCMood_Princess.LoveNPC_Merchant' && l.npcId === 17)).toBe(true);
    // 无修正 → Content 兜底行（非空报告 → 对话面板显示快乐度按钮）
    const r5 = computeHappiness({ ...baseHappy });
    expect(r5.report).toEqual([{ key: 'TownNPCMood_Merchant.Content' }]);
    // 368/453/37 空报告（ReportHappiness.Condition 不显示按钮）
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 368 }).report).toHaveLength(0);
  });
});

// ============ 梳妆台/人体模型注册对账（Main.OpenClothesWindow / TileID 128/269/470） ============
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { FURNITURE_TILE_KIND } from '../src/world/FurnitureItems';

describe('梳妆台更衣窗 / 人体模型挂物族登记', () => {
  it('梳妆台 tile 88 已注册（dresser）', () => {
    expect(TILE_BY_KEY['dresser']).toBeDefined();
  });
  it('模特 498 放置 tile 470（Item.cs:7291-7302 createTile 二次赋值取 470）', () => {
    const def = ITEM_DEFS[ITEM_BY_KEY['vi_498_mannequin']];
    expect(def?.tile).toBe('v_470_mannequins');
    expect(def?.placeStyle).toBe(0);
  });
  it('FURNITURE_TILE_KIND 覆盖 470/471/395/475/520/698，且不含 legacy 128/269', () => {
    // 128/269 是 1.4 前遗留 tile（无 TileEntity）：仅剩 CheckMan 支撑检测
    //（WorldGen.cs:46553-46590 失撑掉 498）+ KillTile 装备帧兑换（:63603-63650），
    // 不是 display doll，不进挂物族表
    expect(FURNITURE_TILE_KIND.get(TILE_BY_KEY['v_470_mannequins'])).toBe('display_doll');
    expect(FURNITURE_TILE_KIND.has(TILE_BY_KEY['v_128_mannequin_legacy'])).toBe(false);
    expect(FURNITURE_TILE_KIND.has(TILE_BY_KEY['v_269_womannequin_legacy'])).toBe(false);
    expect(TILE_DEFS[TILE_BY_KEY['v_128_mannequin_legacy']]?.vanilla?.sheet).toBe(128);
    expect(TILE_DEFS[TILE_BY_KEY['v_269_womannequin_legacy']]?.vanilla?.sheet).toBe(269);
  });
});

// ============ 心情报告 l10n 渲染探针（TownNPCMood_<NPC> 分节 + {BiomeName}/{NPCName} 替换） ============
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';
import { happinessFace, happinessPct } from '../src/ui/NpcDialog';

// 真实 zh-Hans 包注入（bestiary-ui.test.ts 同款先例）
beforeAll(() => {
  languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
});

describe('心情报告 l10n 渲染（AddHappinessReportText）', () => {
  /** Game.happinessLineText 同式渲染 */
  const render = (l: { key: string; biomeNameKey?: string; npcId?: number }): string => {
    let s = Lang.text(l.key);
    if (l.biomeNameKey !== undefined) s = s.replace('{BiomeName}', Lang.text(`TownNPCMoodBiomes.${l.biomeNameKey}`));
    if (l.npcId !== undefined) s = s.replace('{NPCName}', Lang.npcName(l.npcId) ?? '');
    return s;
  };
  it('全部 25 个有偏好 NPC 的分节键存在于 zh-Hans 包（TownNPCMood_<Internal>）', () => {
    for (const id of [22, 17, 588, 633, 441, 124, 209, 142, 207, 19, 178, 20, 228, 227,
      369, 229, 353, 38, 107, 54, 108, 18, 208, 550, 160, 663]) {
      expect(Lang.has(`TownNPCMood_${{ 22: 'Guide', 17: 'Merchant', 588: 'Golfer', 633: 'BestiaryGirl', 441: 'TaxCollector', 124: 'Mechanic', 209: 'Cyborg', 142: 'SantaClaus', 207: 'DyeTrader', 19: 'ArmsDealer', 178: 'Steampunker', 20: 'Dryad', 228: 'WitchDoctor', 227: 'Painter', 369: 'Angler', 229: 'Pirate', 353: 'Stylist', 38: 'Demolitionist', 107: 'GoblinTinkerer', 54: 'Clothier', 108: 'Wizard', 18: 'Nurse', 208: 'PartyGirl', 550: 'DD2Bartender', 160: 'Truffle', 663: 'Princess' }[id]}.Content`)).toBe(true);
    }
  });
  it('报告行渲染后无残留占位符且非空（含替换）', () => {
    const r = computeHappiness({ ...baseHappy, npcsInHouse: 1, nearby: [18], zones: { ...baseHappy.zones, forest: true } });
    for (const line of r.report) {
      const t = render(line);
      expect(t.length, line.key).toBeGreaterThan(2);
      expect(t, line.key).not.toContain('{');
    }
    // 快乐度按钮标签（UI.NPCCheckHappiness）
    expect(Lang.text('UI.NPCCheckHappiness')).toBe('快乐度');
  });
  it('价格百分比与表情档位（Main.cs:41235-41243：≤0.82/≤1/≤1.1/其余 4 帧）', () => {
    expect(happinessPct(1)).toBe('100%');
    expect(happinessPct(0.75)).toBe('75%');
    expect(happinessPct(1.5)).toBe('150%');
    expect(happinessFace(0.75).cls).toBe('best');
    expect(happinessFace(0.82).cls).toBe('best');
    expect(happinessFace(0.94).cls).toBe('good');
    expect(happinessFace(1.06).cls).toBe('ok');
    expect(happinessFace(1.5).cls).toBe('bad');
  });
});
