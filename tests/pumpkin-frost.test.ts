// 南瓜月（Pumpkin Moon）+ 霜月（Frost Moon）事件全量移植回归。
// 反编译源 = /Terarria1457/（★树基准 1457;南瓜月/霜月链数值 1456/1457 同值,行号锚 1456 段）：
//  - 分数表  MoonEventRequiredPointsPerWaveLookup   NPC.cs:6534-6539
//  - 难度乘区 GetMoonEventPointScalar                NPC.cs:79230-79241
//  - 计分/进波 CheckProgressFrostMoon               NPC.cs:79243-79384
//  -            CheckProgressPumpkinMoon             NPC.cs:79386-79518
//  - 波次公告  GetInvasionWaveText                   Lang.cs:1131-1153
//  - 入侵组号  GetNPCInvasionGroup 尾段              NPC.cs:79146-79174
//  - 出怪表    霜月 SpawnNPC :2714-3132 / 南瓜月 :3134-3457
//  - Boss 上限 reachedInvasionBossCap               NPC.cs:159-183
//  - 掉落总门  Pumpkin/FrostMoonDropGatingChance     Conditions.cs:55-125
//  - 纪念碑门  *MoonDropGateForTrophies              Conditions.cs:127-229
//  - 召唤      Player.cs:43294（1844）/ 43361（1958）；Main.cs:10905-10940
//  - 启停/黎明 stopMoonEvent Main.cs:10879-10903；UpdateTime_StartDay :64867-64871
//  - BGM       MusicID.cs:72/76（30/32）；Main.cs:12914-12921
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MOON_KIND_FROST, MOON_KIND_PUMPKIN, REQUIRED_POINTS,
  PUMPKIN_POINTS_BY_NPC, FROST_POINTS_BY_NPC,
  MOON_EVENT_GROUP, WAVE_ANNOUNCE, invasionWaveText, startMoonEvent,
  stopMoonEvent, addMoonEventKill, newMoonEventState,
  pickFrostMoonSpawns, pickPumpkinMoonSpawns, type MoonSpawnDeps,
} from '../src/world/MoonEvent';
import { World } from '../src/world/World';
import { MUSIC } from '../src/data/Music';
import { evalCond, type NpcDropCtx } from '../src/drops/NpcDrops';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';

beforeAll(() => {
  // 真实 zh-Hans 包注入（node 无 fetch，同 value-to-coins.test 模式）
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

// ---------------------------------------------------------------------------
// 出怪表测试桩：deps.next() 控制所有 Main.rand.Next(n)==0 判定，
// deps.int() 控制选型（稻草人/精灵僵尸/Boss 三选一）
// ---------------------------------------------------------------------------
/** 全 miss 桩：next()=0.5 → 任意 N(n≥2) 恒不命中；int(lo,hi) 恒取 lo */
function allMissDeps(over: Partial<MoonSpawnDeps> = {}): MoonSpawnDeps {
  return {
    count: () => 0,
    any: () => false,
    bossCap: false,
    next: () => 0.5,
    int: (lo) => lo,
    ...over,
  };
}

/** 顺序命中桩：values 依次供 next()（耗尽后回退 miss=0.5） */
function seqDeps(values: number[], over: Partial<MoonSpawnDeps> = {}): MoonSpawnDeps {
  let i = 0;
  return allMissDeps({
    next: () => (i < values.length ? values[i++] : 0.5),
    ...over,
  });
}

/** 击杀 n 只 netId（返回最后一条进波公告，无进波返回 null） */
function kills(w: World, id: number, n: number, expert = false, master = false) {
  let ann: ReturnType<typeof addMoonEventKill> = null;
  for (let i = 0; i < n; i++) ann = addMoonEventKill(w, id, expert, master);
  return ann;
}

function moonWorld(kind: 1 | 2) {
  const w = new World(32, 32, 7, 'moon-test');
  startMoonEvent(w, kind);
  return w;
}

// ---------------------------------------------------------------------------
// ① 分数表 / 分值表 / 入侵组号（数据表逐值转录）
// ---------------------------------------------------------------------------
describe('数据表转录', () => {
  it('MoonEventRequiredPointsPerWaveLookup 21 项逐值（NPC.cs:6534-6539）', () => {
    expect(REQUIRED_POINTS).toEqual([
      0, 25, 40, 50, 80, 100, 160, 180, 200, 250,
      300, 375, 450, 525, 675, 850, 1025, 1325, 1550, 2000,
      0,
    ]);
    expect(REQUIRED_POINTS).toHaveLength(21);
  });

  it('南瓜月分值表（NPC.cs:79455-79488）：稻草人族 1/无头骑士 50/哀木 75/南瓜王 150', () => {
    expect(PUMPKIN_POINTS_BY_NPC[305]).toBe(1);
    for (const id of [306, 307, 308, 309, 310, 311, 312, 313, 314]) {
      expect(PUMPKIN_POINTS_BY_NPC[id], `id ${id}`).toBe(1);
    }
    expect(PUMPKIN_POINTS_BY_NPC[315]).toBe(50);   // 无头骑士
    expect(PUMPKIN_POINTS_BY_NPC[325]).toBe(75);   // 哀木
    expect(PUMPKIN_POINTS_BY_NPC[326]).toBe(2);    // 树精
    expect(PUMPKIN_POINTS_BY_NPC[327]).toBe(150);  // 南瓜王
    expect(PUMPKIN_POINTS_BY_NPC[329]).toBe(5);    // 地狱犬
    expect(PUMPKIN_POINTS_BY_NPC[330]).toBe(10);   // 胡闹鬼
    expect(Object.keys(PUMPKIN_POINTS_BY_NPC)).toHaveLength(16);
  });

  it('霜月分值表（NPC.cs:79312-79354）：冰女王 150/圣诞坦克 100/常绿尖叫怪 50', () => {
    expect([FROST_POINTS_BY_NPC[338], FROST_POINTS_BY_NPC[339], FROST_POINTS_BY_NPC[340]])
      .toEqual([1, 1, 1]);                          // 精灵僵尸三型
    expect(FROST_POINTS_BY_NPC[341]).toBe(20);      // 礼物宝箱怪
    expect(FROST_POINTS_BY_NPC[342]).toBe(2);       // 姜饼人
    expect(FROST_POINTS_BY_NPC[343]).toBe(18);      // 雪怪
    expect(FROST_POINTS_BY_NPC[344]).toBe(50);      // 常绿尖叫怪（圣诞树）
    expect(FROST_POINTS_BY_NPC[345]).toBe(150);     // 冰雪女王
    expect(FROST_POINTS_BY_NPC[346]).toBe(100);     // 圣诞坦克
    expect(FROST_POINTS_BY_NPC[347]).toBe(8);       // 精灵直升机
    expect([FROST_POINTS_BY_NPC[348], FROST_POINTS_BY_NPC[349]]).toEqual([4, 4]); // 胡桃夹士两型
    expect(FROST_POINTS_BY_NPC[350]).toBe(3);       // 精灵弓箭手
    expect(FROST_POINTS_BY_NPC[351]).toBe(10);      // 坎卜斯
    expect(FROST_POINTS_BY_NPC[352]).toBe(5);       // 弗洛科
    expect(Object.keys(FROST_POINTS_BY_NPC)).toHaveLength(15);
  });

  it('入侵组号（GetNPCInvasionGroup 尾段 NPC.cs:79146-79174）：霜月 -1 / 南瓜月 -2，328 除外', () => {
    expect(MOON_EVENT_GROUP[338]).toBe(-1);
    expect(MOON_EVENT_GROUP[352]).toBe(-1);
    expect(MOON_EVENT_GROUP[305]).toBe(-2);
    expect(MOON_EVENT_GROUP[330]).toBe(-2);
    expect(MOON_EVENT_GROUP[328]).toBeUndefined();   // 南瓜王之刃不进组（npcSlots 计 Boss 上限）
    expect(MOON_EVENT_GROUP[316]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ② 计分 / 进波门槛 / 难度乘区（CheckProgress*）
// ---------------------------------------------------------------------------
describe('计分与进波（NPC.cs:79243-79518）', () => {
  it('wave1 需 25 分：25 只稻草人各 1 分 → 进 wave2 且 waveKills 清零不结转', () => {
    const w = moonWorld(MOON_KIND_PUMPKIN);
    expect(w.moonEvent.waveNumber).toBe(1);
    kills(w, 305, 24);
    expect(w.moonEvent.waveNumber).toBe(1);
    expect(w.moonEvent.waveKills).toBe(24);
    const ann = kills(w, 305, 1);
    expect(w.moonEvent.waveNumber).toBe(2);
    expect(w.moonEvent.waveKills).toBe(0);            // 清零，溢出分不带入下一波
    expect(w.moonEvent.totalInvasionPoints).toBe(25);
    expect(ann?.wave).toBe(2);
  });

  it('进波公告取「旧波号+1」的表项（switch 在 waveNumber++ 之前取旧值）', () => {
    const w = moonWorld(MOON_KIND_PUMPKIN);
    const ann = kills(w, 305, 25);
    expect(ann).toEqual(WAVE_ANNOUNCE[MOON_KIND_PUMPKIN][2]);   // {wave:2, ids:[326,305]}
    expect(ann?.ids).toEqual([326, 305]);
  });

  it('难度乘区（GetMoonEventPointScalar NPC.cs:79230-79241）：专家 ×2 / 大师 ×2.5 / 普通 ×1', () => {
    const w = moonWorld(MOON_KIND_FROST);
    // 霜月 350 精灵弓手 = 3 分：专家 6/大师 7.5/普通 3
    addMoonEventKill(w, 350, true, false);
    expect(w.moonEvent.waveKills).toBe(6);
    addMoonEventKill(w, 350, false, true);
    expect(w.moonEvent.waveKills).toBe(13.5);
    addMoonEventKill(w, 350);
    expect(w.moonEvent.waveKills).toBe(16.5);
  });

  it('专家可由非整数分进波：wave1 need 25，精灵弓手 ×2=6 → 4 杀 24 不进、5 杀 30 进', () => {
    const w = moonWorld(MOON_KIND_FROST);
    kills(w, 350, 4, true);
    expect(w.moonEvent.waveNumber).toBe(1);
    kills(w, 350, 1, true);
    expect(w.moonEvent.waveNumber).toBe(2);
  });

  it('wave 20 终波：lookup[20]=0 → 不再进波，waveKills/总分继续累计', () => {
    const w = moonWorld(MOON_KIND_PUMPKIN);
    w.moonEvent.waveNumber = 20;
    kills(w, 305, 500);
    expect(w.moonEvent.waveNumber).toBe(20);
    expect(w.moonEvent.waveKills).toBe(500);
    expect(w.moonEvent.totalInvasionPoints).toBe(500);
  });

  it('0 分怪（316）与异事件怪（南瓜月杀 338）不推进度不计总分', () => {
    const w = moonWorld(MOON_KIND_PUMPKIN);
    expect(addMoonEventKill(w, 316)).toBeNull();
    expect(addMoonEventKill(w, 338)).toBeNull();
    expect(w.moonEvent.waveKills).toBe(0);
    expect(w.moonEvent.totalInvasionPoints).toBe(0);
    expect(w.moonEvent.waveNumber).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ③ 启停 / 黎明收场
// ---------------------------------------------------------------------------
describe('启停（Main.cs:10879-10903 / 10905-10940）', () => {
  it('startMoonEvent：三字段复位 + 清血月 + 返回 wave1 公告；已激活返回 null', () => {
    const w = new World(32, 32, 7, 'moon-start');
    w.clock.bloodMoon = true;
    w.moonEvent.totalInvasionPoints = 99;
    const ann = startMoonEvent(w, MOON_KIND_PUMPKIN);
    expect(ann).toEqual({ wave: 1, ids: [305] });
    expect(w.moonEvent).toMatchObject({ kind: MOON_KIND_PUMPKIN, waveNumber: 1, waveKills: 0, totalInvasionPoints: 0 });
    expect(w.clock.bloodMoon).toBe(false);
    expect(startMoonEvent(w, MOON_KIND_FROST)).toBeNull();   // 进行中不可再开（互斥）
    expect(w.moonEvent.kind).toBe(MOON_KIND_PUMPKIN);
  });

  it('霜月启动公告为 (338,342) 双怪（Main.cs:10938 GetInvasionWaveText(1,338,342)）', () => {
    const w = new World(32, 32, 7, 'moon-frost');
    expect(startMoonEvent(w, MOON_KIND_FROST)?.ids).toEqual([338, 342]);
  });

  it('stopMoonEvent（黎明强制结束 Main.cs:64871→10879-10901）：三字段全清', () => {
    const w = moonWorld(MOON_KIND_FROST);
    kills(w, 338, 30);
    stopMoonEvent(w);
    expect(w.moonEvent).toEqual(newMoonEventState());
    stopMoonEvent(w);   // 幂等
    expect(w.moonEvent.kind).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ④ 波次公告表逐条 + 文案格式
// ---------------------------------------------------------------------------
describe('波次公告表（CheckProgress* switch 段 1:1）', () => {
  it('南瓜月 20 条逐条（NPC.cs:79395-79453，键=进入的波号）', () => {
    expect(WAVE_ANNOUNCE[MOON_KIND_PUMPKIN]).toEqual({
      1: { wave: 1, ids: [305] },
      2: { wave: 2, ids: [326, 305] },
      3: { wave: 3, ids: [329, 326] },
      4: { wave: 4, ids: [330, 326, 305] },
      5: { wave: 5, ids: [315, 329] },
      6: { wave: 6, ids: [325, 326, 305] },
      7: { wave: 7, ids: [325, 330, 329] },
      8: { wave: 8, ids: [315, 330, 329] },
      9: { wave: 9, ids: [325, 330, 329, 326, 305] },
      10: { wave: 10, ids: [327, 329, 326] },
      11: { wave: 11, ids: [325, 330, 326] },
      12: { wave: 12, ids: [327, 330] },
      13: { wave: 13, ids: [325, 315, 330, 329, 326] },
      14: { wave: 14, ids: [327, 325, 315, 330, 329, 326, 305] },
      15: { wave: 15, ids: [327, 325, 330, 326, 305] },
      16: { wave: 16, ids: [327, 315, 330, 329, 326] },
      17: { wave: 17, ids: [327, 325, 315, 330, 329] },
      18: { wave: 18, ids: [327, 325, 315, 330] },
      19: { wave: 19, ids: [327, 325, 315] },
      20: { wave: -1, ids: [327, 325, 315] },   // -1 = Game.FinalWave
    });
  });

  it('霜月 20 条逐条（NPC.cs:79252-79310）', () => {
    expect(WAVE_ANNOUNCE[MOON_KIND_FROST]).toEqual({
      1: { wave: 1, ids: [338, 342] },
      2: { wave: 2, ids: [338, 350] },
      3: { wave: 3, ids: [338, 350, 342, 348] },
      4: { wave: 4, ids: [344, 338, 350, 342] },
      5: { wave: 5, ids: [344, 338, 350, 348] },
      6: { wave: 6, ids: [344, 350, 348, 347] },
      7: { wave: 7, ids: [346, 342, 350, 338] },
      8: { wave: 8, ids: [346, 347, 350, 348, 351] },
      9: { wave: 9, ids: [346, 344, 348, 347, 342] },
      10: { wave: 10, ids: [346, 344, 351, 338, 347] },
      11: { wave: 11, ids: [345, 352, 338, 342] },
      12: { wave: 12, ids: [345, 344, 342, 343, 338] },
      13: { wave: 13, ids: [345, 346, 342, 352, 343, 347] },
      14: { wave: 14, ids: [345, 346, 344, 343, 351] },
      15: { wave: 15, ids: [345, 346, 344, 343, 347] },
      16: { wave: 16, ids: [345, 346, 344, 343, 352] },
      17: { wave: 17, ids: [345, 346, 344, 343, 351, 347] },
      18: { wave: 18, ids: [345, 346, 344, 343, 348, 351] },
      19: { wave: 19, ids: [345, 346, 344, 343] },
      20: { wave: -1, ids: [345, 346, 344] },
    });
  });

  it('invasionWaveText 格式（Lang.cs:1131-1153）：FirstWave/FinalWave/Wave + TypeN 顿号链', () => {
    expect(invasionWaveText({ wave: 1, ids: [305] })).toBe('第一波：稻草人');
    expect(invasionWaveText({ wave: -1, ids: [345, 346, 344] }))
      .toBe('最后一波：冰雪女王、圣诞坦克和常绿尖叫怪');
    expect(invasionWaveText({ wave: 9, ids: [325, 330, 329, 326, 305] }))
      .toBe('第9波：哀木、胡闹鬼、地狱犬、树精和稻草人');
    expect(invasionWaveText({ wave: 14, ids: [327, 325, 315, 330, 329, 326, 305] }))
      .toBe('第14波：南瓜王、哀木、无头骑士、胡闹鬼、地狱犬、树精和稻草人');
    expect(invasionWaveText({ wave: 8, ids: [346, 347, 350, 348, 351] }))
      .toBe('第8波：圣诞坦克、精灵直升机、精灵弓箭手、胡桃夹士和坎卜斯');
  });

  it('召唤/结算文案键（LegacyMisc 31/34 + Misc.*MoonScore，zh-Hans 真实包）', () => {
    expect(Lang.text('LegacyMisc.31')).toBe('南瓜月正在升起……');
    expect(Lang.text('LegacyMisc.34')).toBe('霜月正在升起……');
    expect(Lang.text('Misc.PumpkinMoonScore', 100)).toBe('南瓜月过去了！（得分：100)');
    expect(Lang.text('Misc.FrostMoonScore', 42)).toBe('霜月过去了！（得分：42)');
  });
});

// ---------------------------------------------------------------------------
// ⑤ 出怪表逐波（SpawnNPC 霜月 :2714-3132 / 南瓜月 :3134-3457）
// ---------------------------------------------------------------------------
describe('霜月出怪表（NPC.cs:2714-3132）', () => {
  it('逐波「全 miss」终支：14 波无 else 空刷是原版行为', () => {
    const d = allMissDeps();
    // int(lo,hi) 恒取 lo → int(338,340)=338；wave20 int(0,2)=0 → 冰女王 345
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(
      (wv) => pickFrostMoonSpawns(wv, d),
    )).toEqual([
      [338], [338], [338], [338], [338], [350], [338], [350], [342], [338],
      [338], [338], [347], [], [343], [343], [343], [343], [343], [345],
    ]);
  });

  it('任意波 1/30 且 CountNPCS(341)<4 → 礼物宝箱怪 341 提前返回（:2717-2721）', () => {
    expect(pickFrostMoonSpawns(19, seqDeps([0]))).toEqual([341]);
    expect(pickFrostMoonSpawns(1, seqDeps([0]))).toEqual([341]);
    // 场上已有 4 只 341 → 门关闭，回到波内链
    expect(pickFrostMoonSpawns(1, seqDeps([0], { count: (id) => (id === 341 ? 4 : 0) })))
      .toEqual([338]);
  });

  it('wave≥15 上限族：19 波 345<4 / 346<5 / 344<7，全占满落雪怪兜底（:2742-2761）', () => {
    const full = { count: () => 99 };
    expect(pickFrostMoonSpawns(19, allMissDeps(full))).toEqual([343]);
    expect(pickFrostMoonSpawns(19, seqDeps([0], full))).toEqual([343]);
    // 命中第一支且 345<4 → 345
    expect(pickFrostMoonSpawns(19, seqDeps([0.5, 0]))).toEqual([345]);
  });

  it('wave20：bossCap 满则空刷；否则三 Boss 等权（int 0/1/2 → 345/346/344，:2722-2741）', () => {
    expect(pickFrostMoonSpawns(20, allMissDeps({ bossCap: true }))).toEqual([]);
    expect(pickFrostMoonSpawns(20, allMissDeps())).toEqual([345]);          // int(0,2)=0
    expect(pickFrostMoonSpawns(20, allMissDeps({ int: (_l, h) => h }))).toEqual([344]);  // =2 → 常世吼
  });

  it('wave15 AnyNPCs 唯一门：场上已有 345 → 跳过首支（:2842-2865）', () => {
    // 前 1 次掷骰被 1/30 的 341 门消耗 → 第三次命中 346
    expect(pickFrostMoonSpawns(15, seqDeps([0.5, 0.5, 0], { any: (id) => id === 345 }))).toEqual([346]);
  });
});

describe('南瓜月出怪表（NPC.cs:3134-3457）', () => {
  it('逐波「全 miss」终支：19 波无 else 但第三支（!bossCap && 315<5）仍放行', () => {
    const d = allMissDeps();
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(
      (wv) => pickPumpkinMoonSpawns(wv, d),
    )).toEqual([
      [305], [305], [326], [305], [329], [305], [329], [329], [305], [305],
      [326], [330], [326], [305], [305], [326], [329], [330], [315], [325],
    ]);
  });

  it('★14/15/17/18 波 327 独立 if 双刷（:3172-3188 / 3190-3211 / 3234-3255 / 3256-3285）', () => {
    // 首支 N(7/N10) 命中 + 链支命中 → 同刻两只
    expect(pickPumpkinMoonSpawns(18, seqDeps([0, 0]))).toEqual([327, 325]);
    expect(pickPumpkinMoonSpawns(17, seqDeps([0, 0, 0]))).toEqual([327, 325]);
    expect(pickPumpkinMoonSpawns(15, seqDeps([0, 0]))).toEqual([327, 325]);
    expect(pickPumpkinMoonSpawns(14, seqDeps([0, 0]))).toEqual([327, 325]);
    // 327 命中但链支全 miss → 落终支稻草人，仍两只
    expect(pickPumpkinMoonSpawns(18, seqDeps([0, 0.9, 0.9, 0.9]))).toEqual([327, 330]);
  });

  it('其余波次 327 走 else-if 链：命中即单只（:3158-3171 / 3212-3233 等）', () => {
    expect(pickPumpkinMoonSpawns(19, seqDeps([0]))).toEqual([327]);
    expect(pickPumpkinMoonSpawns(16, seqDeps([0]))).toEqual([327]);
    expect(pickPumpkinMoonSpawns(12, seqDeps([0]))).toEqual([327]);
    expect(pickPumpkinMoonSpawns(10, seqDeps([0]))).toEqual([327]);
  });

  it('wave20（:3137-3155）：N(2) 327 → Next(3)!=0 325 → 兜底 315；bossCap 满空刷', () => {
    expect(pickPumpkinMoonSpawns(20, seqDeps([0]))).toEqual([327]);
    expect(pickPumpkinMoonSpawns(20, allMissDeps())).toEqual([325]);   // next=0.5 ≥ 1/3
    // 327/325 双双占满 → 兜底无头骑士 315
    expect(pickPumpkinMoonSpawns(20, seqDeps([0.9, 0], { count: (id) => (id === 315 ? 0 : 99) })))
      .toEqual([315]);
    expect(pickPumpkinMoonSpawns(20, allMissDeps({ bossCap: true }))).toEqual([]);
  });

  it('wave19：bossCap 满且 327/325 落空 → 空刷（:3167 的 !bossCap 门）', () => {
    expect(pickPumpkinMoonSpawns(19, allMissDeps({ bossCap: true }))).toEqual([]);
    expect(pickPumpkinMoonSpawns(19, allMissDeps())).toEqual([315]);   // bossCap 未满 → 315<5
    expect(pickPumpkinMoonSpawns(19, allMissDeps({ count: () => 99 }))).toEqual([]);
  });

  it('wave4 原版怪癖：判定 !AnyNPCs(325) 却刷 330（:3421-3423，照抄不修）', () => {
    expect(pickPumpkinMoonSpawns(4, seqDeps([0]))).toEqual([330]);
    expect(pickPumpkinMoonSpawns(4, seqDeps([0], { any: () => true }))).toEqual([305]); // 325 在场 → 回稻草人
  });

  it('CountNPCS 上限门：wave16 C(327)≥2 跳过首支（:3212-3214）', () => {
    expect(pickPumpkinMoonSpawns(16, seqDeps([0], { count: () => 99 }))).not.toContain(327);
    expect(pickPumpkinMoonSpawns(16, seqDeps([0]))).toEqual([327]);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 掉落总门 / 纪念碑门（Conditions.cs）
// ---------------------------------------------------------------------------
function dropCtx(over: Partial<NpcDropCtx>): NpcDropCtx {
  const rng = { next: () => 0, int: (a: number) => a } as never;
  return {
    rng, netId: 305, type: 305, isExpert: false, isMaster: false, hardMode: true,
    crimson: false, flags: {}, x: 0, y: 0, worldSurfaceTile: 100, rockLayerTile: 200,
    underworldTileY: 400, maxTilesX: 4200, maxTilesY: 1200, lifeMax: 100, friendly: false,
    boss: false, damage: 50, value: 500, hp: 400, hpMax: 400, mana: 100, manaMax: 100,
    luck: 0, moonEvent: { kind: 2, wave: 15 },
    ...over,
  };
}

describe('掉落条件（Conditions.cs:55-229）', () => {
  it('PumpkinMoonDropGatingChance：基数 24，专家 wave+5 且 denom-1，下限 1（:91-125）', () => {
    // rng.int(0,denom-1)=0 恒命中（桩 int 取 lo）→ 只验公式放行的 denom
    expect(evalCond('PumpkinMoonDropGatingChance', [], dropCtx({}))).toBe(true);
    // 普通 wave15 → ⌊(24-15)/2.5⌋=3；专家 wave15 → ⌊(24-20)/2.5⌋=1，再 -1 → 钳 1
    const expert = dropCtx({ isExpert: true });
    expect(expert.moonEvent).toMatchObject({ kind: 2, wave: 15 });
    expect(evalCond('PumpkinMoonDropGatingChance', [], expert)).toBe(true);
    // 无事件 / 霜月期间 → false
    expect(evalCond('PumpkinMoonDropGatingChance', [], dropCtx({ moonEvent: undefined }))).toBe(false);
    expect(evalCond('PumpkinMoonDropGatingChance', [], dropCtx({ moonEvent: { kind: 1, wave: 15 } }))).toBe(false);
  });

  it('FrostMoonDropGatingChance：基数 28，专家 denom-2（:55-89）', () => {
    const frost = dropCtx({ moonEvent: { kind: 1, wave: 15 } });
    expect(evalCond('FrostMoonDropGatingChance', [], frost)).toBe(true);
    expect(evalCond('FrostMoonDropGatingChance', [], dropCtx({ moonEvent: { kind: 2, wave: 15 } }))).toBe(false);
    expect(evalCond('FrostMoonDropGatingChance', [], dropCtx({ moonEvent: undefined }))).toBe(false);
  });

  it('掷骰语义：RollLuck(denom)==0（denom>1 时未命中 0 → 不放行）', () => {
    // 桩 int 恒返回 lo=1 → Next(denom)=1 ≠ 0 → 不放行（denom≥2 时）
    const missRng = { next: () => 0, int: () => 1 } as never;
    expect(evalCond('PumpkinMoonDropGatingChance', [], dropCtx({ rng: missRng }))).toBe(false);
  });

  it('*MoonDropGateForTrophies：wave<15 false；denom 4/3/2 阶梯；专家 1/3 再 -1（:127-229）', () => {
    // int(lo)=0 → Next(denom)=0 放行；wave 15/16→4、17/18→3、19/20→2
    for (const [wv, denom] of [[15, 4], [16, 4], [17, 3], [18, 3], [19, 2], [20, 2]] as const) {
      const c = dropCtx({ moonEvent: { kind: 1, wave: wv } });
      expect(evalCond('FrostMoonDropGateForTrophies', [], c), `wave ${wv}`).toBe(true);
      // denom=1 时（专家 -1 后）恒放行；否则未掷中 0 → false
      const miss = dropCtx({ moonEvent: { kind: 1, wave: wv }, rng: { next: () => 0, int: () => denom } as never });
      expect(evalCond('FrostMoonDropGateForTrophies', [], miss), `wave ${wv} miss`).toBe(denom <= 1);
    }
    expect(evalCond('FrostMoonDropGateForTrophies', [], dropCtx({ moonEvent: { kind: 1, wave: 14 } }))).toBe(false);
    expect(evalCond('PumpkinMoonDropGateForTrophies', [], dropCtx({ moonEvent: { kind: 2, wave: 19 } }))).toBe(true);
    expect(evalCond('PumpkinMoonDropGateForTrophies', [], dropCtx({ moonEvent: { kind: 1, wave: 19 } }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ⑦ 召唤物品 / BGM
// ---------------------------------------------------------------------------
describe('召唤物品与 BGM', () => {
  it('召唤物 id（Player.cs:43294/43361）：1844 南瓜月勋章→南瓜月 / 1958 顽皮礼物→霜月', () => {
    expect(VANILLA_ITEM_KEY_BY_ID[1844]).toBe('vi_1844_PumpkinMoonMedallion');
    expect(VANILLA_ITEM_KEY_BY_ID[1958]).toBe('vi_1958_NaughtyPresent');
    expect(VANILLA_ITEM_KEY_BY_ID[1844]).not.toBe(VANILLA_ITEM_KEY_BY_ID[1958]);
  });

  it('BGM（MusicID.cs:72/76 + Main.cs:12914-12921）：南瓜月 30 / 霜月 32', () => {
    expect(MUSIC.PumpkinMoon).toBe(30);
    expect(MUSIC.FrostMoon).toBe(32);
    // DecideOnNewMusic 链尾覆盖：霜月在后，两事件同时置位时以霜月曲为准
    expect(MUSIC.FrostMoon).not.toBe(MUSIC.PumpkinMoon);
  });
});

// ---------------------------------------------------------------------------
// ⑧ 存档往返：事件不持久化（对齐原版 WorldFile 不写 pumpkinMoon/snowMoon）
// ---------------------------------------------------------------------------
describe('存档往返', () => {
  it('事件进行中存档 → 读档后 kind=0/wave=0（Main.cs:48332 主菜单即重置）', () => {
    const w = moonWorld(MOON_KIND_PUMPKIN);
    kills(w, 305, 40);                       // 推到 wave2
    expect(w.moonEvent.waveNumber).toBe(2);
    const json = saveGame(w, new Player(0, 0, new Inventory()), 0);
    expect(w.moonEvent.waveNumber).toBe(2);  // 存档本身不重置运行时态
    const { world: w2 } = loadSave(json);
    expect(w2.moonEvent).toEqual(newMoonEventState());
    expect(w2.moonEvent.kind).toBe(0);
    expect(w2.moonEvent.waveNumber).toBe(0);
  });
});
