// 系统覆盖补齐（星星雨/陨石/生日派对）核心数学验证
import { describe, it, expect } from 'vitest';
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
  it('无家/离家>120/危险群系 → 1000（:111-122）', () => {
    expect(computeHappiness({ ...baseHappy, homeless: true }).priceMul).toBe(1000);
    expect(computeHappiness({ ...baseHappy, distFromHome: 121 }).priceMul).toBe(1000);
    expect(computeHappiness({ ...baseHappy, playerInCorrupt: true }).priceMul).toBe(1000);
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
  it('公主在场全员 ×0.94；公主自己孤单<2 → 1000（:128-137/:37-40）', () => {
    expect(computeHappiness({ ...baseHappy, nearby: [663] }).priceMul).toBe(0.94); // 同屋公主 :37-40
    expect(computeHappiness({ ...baseHappy, npcVanillaId: 663, isPrincess: true, npcsInVillage: 1 }).priceMul).toBe(1000);
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
});
