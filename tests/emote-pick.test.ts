// IIII233（2026-09-09）：EmoteBubble.PickNPCEmote 全量池 1:1（world/EmotePick.ts）
// 断言口径：入参 rand 全程脚本化（vanilla Main.rand 序）。
// ★脚本会计：九 Probe 门各恒消费 1 次 rand（跳门也消费）；命中 Probe 的内部掷
// 紧随其后按原版式消费；终选在池非空时再消费 1 次。seq() 构造器封装该序。
import { describe, it, expect } from 'vitest';
import {
  buildEmotePool, pickNpcEmote, FACE_EMOTE,
  type EmotePickContext, type EmotePickPlayer, type EmotePickNpc,
} from '../src/world/EmotePick';

/** 脚本 rand（逐次消费,耗尽抛错防隐式漂移） */
function scriptedRand(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error(`rand 脚本耗尽（idx=${i}）`);
    return values[i++];
  };
}

/** seq(runs)：runs = Probe 序号(1..9) → 内部掷值数组。门值 0.1=命中（Next(2/3/5) 均
 *  归 0），0.9=跳门。返回完整 rand 脚本（含尾随终选掷 0.0 = 取池首项）。 */
function seq(runs: Record<number, number[]> = {}, finalPick = 0): number[] {
  const out: number[] = [];
  for (let k = 1; k <= 9; k++) {
    const hit = runs[k] !== undefined;
    out.push(hit ? 0.1 : 0.9);
    if (hit) out.push(...runs[k]);
  }
  out.push(finalPick);
  return out;
}

const PLR: EmotePickPlayer = {
  x: 8000, y: 1000, cx: 8008, cy: 1010,
  zoneSnow: false, zoneHallow: false, zoneCorrupt: false,
  zoneCrimson: false, zoneJungle: false, zoneDesert: false,
  onFire: false, onFire2: false, poisoned: false,
  statLife: 400, statLifeMax2: 400, heldVanillaItemId: 0,
};

function ctx(over: Partial<EmotePickContext> = {}): EmotePickContext {
  return {
    flags: {},
    dayTime: true,
    mainTime: 20000,
    bloodMoon: false, eclipse: false, pumpkinMoon: false, snowMoon: false,
    spawnMeteor: false,
    raining: false, cloudBGActive: 0,
    worldSurface: 300, rockLayer: 900, maxTilesX: 8400, maxTilesY: 2400,
    expertMode: false,
    crimson: false,
    partyIsUp: false, dd2Active: false,
    census: () => 0,
    anyBossActive: false,
    plr: PLR,
    ...over,
  };
}

// 自锚 = 动物学家 633（FaceEmote 有映射、ProbeExceptions 无专属池 → 纯净底池）
const SELF: EmotePickNpc = { vanillaId: 633, y: 1000, cy: 1010, onFire: false, poisoned: false };

describe('PickNPCEmote 主流程（EmoteBubble.cs:295-355）', () => {
  it('boss 在场 → 整池换 ProbeCombat [16,1,2,91,93,84,84]（:347-349）', () => {
    const pool = buildEmotePool(ctx({ anyBossActive: true }), scriptedRand([]), SELF);
    expect(pool).toEqual([16, 1, 2, 91, 93, 84, 84]);
  });

  it('全部 Probe 门掷不中 → 空池回退 emote 0（:351-354,NewBubbleNPC 构造值）', () => {
    const emote = pickNpcEmote(ctx(), scriptedRand(seq()), SELF);
    expect(emote).toBe(0);
  });

  it('门序 = TownNPCs/Emotions/Biomes(Next3) → Critters/Items(Next2) → Bosses(Next5) → Debuffs/Events/Weather(Next2)（:309-344）', () => {
    // 全门命中：Critters 内部两掷 [0, 0.9]（surface 命中/cave 跳）、Debuffs 内部 [0, 0]（11/10 入池）
    const pool = buildEmotePool(ctx({ plr: { ...PLR, y: 16 * 250, cy: 16 * 250 + 10 } }),
      scriptedRand(seq({
        2: [], 3: [], 4: [0, 0.9], 5: [], 6: [], 7: [0, 0], 8: [], 9: [],
      })), SELF);
    // TownNPCs 无在场不加；Emotions 15 项在池首；Biomes 加 1（地表 23）
    expect(pool.slice(0, 15)).toEqual([0, 1, 2, 3, 15, 16, 17, 87, 91, 136, 134, 135, 137, 138, 139]);
    expect(pool[15]).toBe(23);
    expect(pool).toContain(11);
    expect(pool).toContain(10);
    expect(pool).toContain(95);   // Weather：无雨 → 95
  });
});

describe('ProbeBiomes 群系梯（:489-535）', () => {
  // ★注意：vanilla ProbeBiomes(list, plr) 读的是最近玩家 position.Y（非气泡锚 NPC）
  const cases: Array<{ name: string; y: number; over: Partial<EmotePickContext>; want: number }> = [
    { name: '天空 <worldSurface×0.45', y: 16 * 100, over: {}, want: 22 },
    { name: '岩浆层 >rockLayer+maxTilesY/2−100', y: 16 * (900 + 1200 - 90), over: {}, want: 31 },
    { name: '洞穴 >rockLayer', y: 16 * 910, over: {}, want: 30 },
    { name: '神圣', y: 16 * 250, over: { plr: { ...PLR, y: 16 * 250, zoneHallow: true } }, want: 27 },
    { name: '腐化', y: 16 * 250, over: { plr: { ...PLR, y: 16 * 250, zoneCorrupt: true } }, want: 26 },
    { name: '猩红', y: 16 * 250, over: { plr: { ...PLR, y: 16 * 250, zoneCrimson: true } }, want: 25 },
    { name: '丛林', y: 16 * 250, over: { plr: { ...PLR, y: 16 * 250, zoneJungle: true } }, want: 24 },
    { name: '雪原', y: 16 * 250, over: { plr: { ...PLR, y: 16 * 250, zoneSnow: true } }, want: 32 },
    { name: '海滩（地表+东缘 250 tile 内）', y: 16 * 250, over: { plr: { ...PLR, y: 16 * 250, x: 8400 * 16 - 1000 } }, want: 29 },
    { name: '沙漠', y: 16 * 250, over: { plr: { ...PLR, y: 16 * 250, zoneDesert: true } }, want: 28 },
    { name: '其他世界（地表无群系）', y: 16 * 250, over: { plr: { ...PLR, y: 16 * 250 } }, want: 23 },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const base = ctx(c.over);
      const pool = buildEmotePool({ ...base, plr: { ...base.plr, y: c.y } },
        scriptedRand(seq({ 3: [] })), SELF);
      expect(pool).toContain(c.want);
    });
  }
});

describe('ProbeTownNPCs × FaceEmote（:466-487 + NPCID.cs:4835）', () => {
  it('FaceEmote 表逐字：17→101 商人、107→109 哥布林工匠、453→124 骷髅商人、588→140 高尔夫球手', () => {
    expect(FACE_EMOTE[17]).toBe(101);
    expect(FACE_EMOTE[107]).toBe(109);
    expect(FACE_EMOTE[124]).toBe(111);
    expect(FACE_EMOTE[453]).toBe(124);
    expect(FACE_EMOTE[441]).toBe(125);
    expect(FACE_EMOTE[588]).toBe(140);
    expect(FACE_EMOTE[633]).toBe(141);
    expect(FACE_EMOTE[663]).toBe(145);
  });

  it('在场 NPC 映射入池且排除自身（k != type）', () => {
    const c = ctx({ census: (id) => (id === 17 ? 1 : id === 18 ? 2 : 0) });
    const pool = buildEmotePool(c, scriptedRand(seq({ 1: [] })),
      { ...SELF, vanillaId: 17 });
    expect(pool).toEqual([102, 80, 85, 85, 85, 85]);   // FaceEmote 102 + 商人专属池（自身 17 排除出 FaceEmote 面）
  });
});

describe('ProbeEvents / ProbeWeather / ProbeDebuffs', () => {
  it('血月 → 18；日食 → 19；南瓜月 → 20；霜月 → 21；DD2 → 133（:406-429）', () => {
    for (const [over, want] of [
      [{ bloodMoon: true }, 18],
      [{ eclipse: true }, 19],
      [{ pumpkinMoon: true }, 20],
      [{ snowMoon: true }, 21],
      [{ dd2Active: true }, 133],
    ] as Array<[Partial<EmotePickContext>, number]>) {
      const pool = buildEmotePool(ctx(over), scriptedRand(seq({ 8: [] })), SELF);
      expect(pool).toContain(want);
    }
  });

  it('雨中 + 雪原 → 4+98；无雨 → 95；雨夜 → 5（:368-398）', () => {
    const rainy = buildEmotePool(ctx({ raining: true, plr: { ...PLR, zoneSnow: true } }),
      scriptedRand(seq({ 9: [] })), SELF);
    expect(rainy).toContain(4);
    expect(rainy).toContain(98);
    expect(rainy).not.toContain(5);            // 白天不加雷
    const clear = buildEmotePool(ctx(), scriptedRand(seq({ 9: [] })), SELF);
    expect(clear).toContain(95);
    const night = buildEmotePool(ctx({ raining: true, dayTime: false }), scriptedRand(seq({ 9: [] })), SELF);
    expect(night).toContain(5);
  });

  it('★原版异纲 quirk 照录：海岸风暴支 position.Y(px)<worldSurface(tile)/16 恒假（:385）', () => {
    // 东缘 + y 极小（16px）：16 < 300/16=18.75 为真 → 97 入池
    const edge = ctx({ raining: true, plr: { ...PLR, x: 8400 * 16 - 1000, y: 16 } });
    expect(buildEmotePool(edge, scriptedRand(seq({ 9: [] })), SELF)).toContain(97);
    // 同几何但 y=1000px：1000 < 18.75 恒假 → 无 97
    const deep = ctx({ raining: true, plr: { ...PLR, x: 8400 * 16 - 1000, y: 1000 } });
    expect(buildEmotePool(deep, scriptedRand(seq({ 9: [] })), SELF)).not.toContain(97);
  });

  it('ProbeDebuffs：锚 NPC.onFire → 9；玩家 poisoned → 8；手持 215 → 10（:432-450）', () => {
    const burning = buildEmotePool(ctx(), scriptedRand(seq({ 7: [0.9, 0.9] })), { ...SELF, onFire: true });
    expect(burning).toContain(9);
    const poisoned = buildEmotePool(ctx({ plr: { ...PLR, poisoned: true } }), scriptedRand(seq({ 7: [0.9, 0.9] })), SELF);
    expect(poisoned).toContain(8);
    const silenced = buildEmotePool(ctx({ plr: { ...PLR, heldVanillaItemId: 215 } }), scriptedRand(seq({ 7: [0.9, 0.9] })), SELF);
    expect(silenced).toContain(10);
  });

  it('ProbeDebuffs 内部子掷：Next(2)==0 → 11、Next(3)==0 → 10（:438/:446）', () => {
    const pool = buildEmotePool(ctx(), scriptedRand(seq({ 7: [0, 0] })), SELF);
    expect(pool).toContain(11);
    expect(pool).toContain(10);
  });
});

describe('ProbeItems / ProbeCritters / ProbeBosses', () => {
  it('ProbeItems：固定 6 项 + 半血补 84（:452-464）', () => {
    const full = buildEmotePool(ctx(), scriptedRand(seq({ 5: [] })), SELF);
    expect(full).toEqual([7, 73, 74, 75, 78, 90]);
    const hurt = buildEmotePool(ctx({ plr: { ...PLR, statLife: 100 } }), scriptedRand(seq({ 5: [] })), SELF);
    expect(hurt).toEqual([7, 73, 74, 75, 78, 90, 84]);
  });

  it('ProbeCritters：白天地上带 7 项 + downedPirates 65 + 猩红 67；cave 掷 0.9 跳（:537-592）', () => {
    const pool = buildEmotePool(ctx({ flags: { downedPirates: true }, crimson: true }),
      scriptedRand(seq({ 4: [0, 0.9] })), SELF);
    expect(pool).toEqual(expect.arrayContaining([13, 12, 68, 62, 63, 69, 70, 65, 67]));
    expect(pool).not.toContain(72);            // cave 掷跳过 → 无骷髅 72
  });

  it('ProbeCritters 僵尸晨昏带：白天 Main.time<5400 → 61（:562-565）', () => {
    const pool = buildEmotePool(ctx({ mainTime: 3000 }), scriptedRand(seq({ 4: [0, 0.9] })), SELF);
    expect(pool).toContain(61);
    const noon = buildEmotePool(ctx({ mainTime: 20000 }), scriptedRand(seq({ 4: [0, 0.9] })), SELF);
    expect(noon).not.toContain(61);
  });

  it('ProbeCritters：地下（cy>rockLayer×16）cave 权重 1/surface 0.2（:540-549）', () => {
    const pool = buildEmotePool(ctx(), scriptedRand(seq({ 4: [0.9, 0] })),
      { ...SELF, cy: 16 * 1200 });             // 锚 NPC 在地下（>rockLayer×16）
    expect(pool).toEqual([72, 69]);            // surface 掷 0.9>0.2 跳,cave 掷 0 命中
  });

  it('ProbeBosses：downedBoss1（已败）→ num=1 必出 39/40/51（:623-672）', () => {
    const pool = buildEmotePool(ctx({ flags: { downed_4: true } }), scriptedRand(seq({ 6: [] })), SELF);
    expect(pool).toEqual(expect.arrayContaining([39, 40, 51]));
    expect(pool).not.toContain(41);            // 腐化世界 → 无猩红脑 41
  });

  it('ProbeBosses：hardMode num=4 → 仅 b3 必出段 44/47/45/46（滚动臂 Next(10)=9 全不中）（:678-684）', () => {
    // 内部掷消耗 = b1、b2 各 1（b3 必出支短路；b4..b8 num>=5 门假不掷）
    const pool = buildEmotePool(ctx({ flags: { hardMode: true }, crimson: true }),
      scriptedRand(seq({ 6: [0.9, 0.9] })), SELF);
    expect(pool).toEqual([44, 47, 45, 46]);
    expect(pool).not.toContain(39);            // b1 滚动臂不中 → 无克眼组
  });

  it('ProbeBosses：机械族全败 → 不补 47/45/46（:687-699）；未败 → 逐项补（:687-695）', () => {
    const allDown = buildEmotePool(ctx({ flags: { hardMode: true, downed_134: true, downed_125: true, downed_126: true, downed_127: true, downedMechBossAny: true, downed_262: true } }),
      scriptedRand(seq({ 6: [0.9, 0.9, 0.9, 0.9] })), SELF);
    expect(allDown).toContain(48);             // num==6 必出段 48/49/50
    expect(allDown).not.toContain(47);         // downedMechBoss1 已败 → 补段 47 跳过
    expect(allDown).not.toContain(45);
    expect(allDown).not.toContain(46);
    const someUp = buildEmotePool(ctx({ flags: { hardMode: true } }),
      scriptedRand(seq({ 6: [0.9, 0.9, 0.9, 0.9, 0.9] })), SELF);
    expect(someUp).toEqual(expect.arrayContaining([44, 47, 45, 46]));   // b3 num∈[4,5] 必出
    expect(someUp).not.toContain(48);          // b4/b5 滚动臂掷 9 不中 → 48 不出
  });

  it('ProbeBosses：血月夜情绪三连 = SelectRandom(16,1,138) ×4 份（:611-617）', () => {
    const pool = buildEmotePool(ctx({ bloodMoon: true, dayTime: false }),
      scriptedRand(seq({ 2: [0.5] })), SELF);    // 内部掷 0.5 → floor(1.5)=1 号位=1（怒）
    expect(pool.filter((e) => e === 1).length).toBe(4);       // 基池 1 + 三连 3
  });
});

describe('ProbeExceptions（:760-1065）', () => {
  const gate = seq();   // 九 Probe 全跳,只走专属池

  it('商人 17 → [80,85,85,85,85]；护士 18 → [73,73,84,75]（:763-777）', () => {
    expect(buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 17 })).toEqual([80, 85, 85, 85, 85]);
    expect(buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 18 })).toEqual([73, 73, 84, 75]);
  });

  it('哥布林工匠 107 × 机械师 124 对话特判（:882-952）：Remove(111)+爱心三连+吻/戒指', () => {
    const tinker = buildEmotePool(ctx(), scriptedRand(gate),
      { ...SELF, vanillaId: 107 }, 124);
    expect(tinker).toEqual([0, 0, 0, 17, 17, 86, 88, 88]);
    // 无对话对象 → 标准池（含 91,92,91,92）
    const alone = buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 107 });
    expect(alone).toEqual([91, 92, 91, 92]);
  });

  it('机械师 124 提前 return 支（:928）：对话特判后不再追加 43/2', () => {
    const mech = buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 124 }, 107);
    expect(mech).toEqual([0, 0, 0, 17, 17, 88, 88]);
    const mechAlone = buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 124 });
    expect(mechAlone).toEqual([43, 2]);
  });

  it('★反编译死码照录：军火商 19 的 other==22 两支同条件等价一支（:780-793）', () => {
    const paired = buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 19 }, 22);
    expect(paired).toEqual([1, 1, 93, 92]);
    expect(buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 19 })).toEqual([82, 82, 85, 85, 77, 93]);
  });

  it('★异纲 quirk 照录：渔夫 369 `position.Y(px) < worldSurface(tile)`（:1043）', () => {
    const anglerNearTop = buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 369, y: 100 });
    expect(anglerNearTop).toContain(29);       // 100 < 300 → 真
    const anglerDeep = buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 369, y: 100000 });
    expect(anglerDeep).not.toContain(29);      // 100000 < 300 恒假
  });

  it('向导 22：白天出 79、血月不出 79、夜出 16×3（:814-836,两门独立）', () => {
    const day = buildEmotePool(ctx(), scriptedRand(gate), { ...SELF, vanillaId: 22 });
    expect(day).toEqual([79]);
    const blood = buildEmotePool(ctx({ bloodMoon: true }), scriptedRand(gate), { ...SELF, vanillaId: 22 });
    expect(blood).toEqual([]);                 // 血月压 79,白天压 16
    const night = buildEmotePool(ctx({ dayTime: false }), scriptedRand(gate), { ...SELF, vanillaId: 22 });
    expect(night).toEqual([79, 16, 16, 16]);   // 非血流月夜 → 79 + 16×3
  });
});

describe('TownNPC.emotePickFor 接线面（no-host 回退）', () => {
  it('host 未注入 → 回退 ProbeEmotions 基池（TownNPC.NPC_EMOTE_POOL）', async () => {
    const { TownNPC } = await import('../src/entities/TownNPC');
    // emoteHost 缺省 null（单测环境无 Game 构造）
    expect(TownNPC.emoteHost).toBeNull();
  });
});
