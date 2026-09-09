// IIII231 成就系统全量机制对齐（2026-09-10）回归：
//   ① 注册表 oracle 金标——条件链全 137 条 1:1（金标独立提取自
//      Terarria1458/Terraria.Initializers/AchievementInitializer.cs 注册段原文，
//      编码 F=flag/I=int/FV=float/P=pickup/C=craft(KB=Workbenches 集)/
//      K=killed/KM=killedMany(CreateMany)/E=progressionEvent/D=tileDestroyed）。
//      与 tests/achievements.test.ts（数量/类别/图标序抽查）互补=条件谓词逐字锁。
//   ② 本批修复运行时回归：
//      · THROWING_LINES 事件源订正（原版唯一 ev7 位 = ItemCheck_Shoot
//        Player.cs:49974-49976 aiStyle==99 悠悠球弹；曾误挂钓竿抛竿位——
//        源锚静态锁 + 引擎级 ev7→THROWING_LINES）
//      · 合成双发 Main.cs:43356-43357 NotifyItemCraft+NotifyItemPickup
//        （GET_ZENITH 族 pickup 型合成链成就合成即达成）
//      · 进世界基线补全 OnPlayerEnteredWorld :192-197（GAIN_TORCH_GODS_FAVOR
//        unlockedBiomeTorches 旗 + TryGrantingBestiary100PercentAchievement）
//      · achCheckEquipState 两面谓词：DYE_HARD 进世界查 10 主染料槽（:180-191）
//        vs 装备时刻查 10+miscDyes（:261-279）；TOPPED_OFF 字面 ==500/==200
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Achievements } from '../src/core/Achievements';
import { Game } from '../src/core/Game';
import { ACH_DEFS } from '../src/data/vanillaAchievements';
import { WORKBENCH_ITEMS } from '../src/data/vanillaAchievements';
import type { AchCondDef } from '../src/data/vanillaAchievements';

const WORKBENCH_KEY = new Set([WORKBENCH_ITEMS.join(',')]);

// ---------------------------------------------------------------------------
// ① 注册表条件链 oracle 金标（137 条全量）
// ---------------------------------------------------------------------------
const GOLDEN: Record<string, string> = {
  TIMBER: 'P:9,619,2504,620,2503,2260,621,911,1729,5215',
  BENCHED: 'C:WB',
  NO_HOBO: 'E:8',
  OBTAIN_HAMMER: 'P:2775,2746,5283,3505,654,3517,7,3493,2780,1513,2516,660,3481,657,922,3511,2785,3499,3487,196,367,104,797,2320,787,1234,1262,3465,204,217,1507,3524,3522,3525,3523,4317,1305',
  OOO_SHINY: 'D:7,6,9,8,166,167,168,169,22,204,58,107,108,111,221,222,223,211',
  HEART_BREAKER: 'D:12',
  HEAVY_METAL: 'P:35,716',
  I_AM_LOOT: 'F:Peek',
  STAR_POWER: 'F:Use',
  HOLD_ON_TIGHT: 'F:Equip',
  EYE_ON_YOU: 'K:4',
  SMASHING_POPPET: 'E:7',
  WORM_FODDER: 'K:13,14,15',
  MASTERMIND: 'K:266',
  WHERES_MY_HONEY: 'F:Reach',
  STING_OPERATION: 'K:222',
  BONED: 'K:35',
  DUNGEON_HEIST: 'P:327|E:19',
  ITS_GETTING_HOT_IN_HERE: 'F:Reach',
  MINER_FOR_FIRE: 'C:122',
  STILL_HUNGRY: 'K:113,114',
  ITS_HARD: 'E:9',
  BEGONE_EVIL: 'E:6',
  EXTRA_SHINY: 'D:107,108,111,221,222,223',
  HEAD_IN_THE_CLOUDS: 'F:Equip',
  LIKE_A_BOSS: 'P:1133,1331,1307,267,1293,5334,557,544,556,560,43,70,3601,5120,4961,4988,2673',
  BUCKETS_OF_BOLTS: 'K:125,126|KM:127,134',
  DRAX_ATTAX: 'C:579,990',
  PHOTOSYNTHESIS: 'D:211',
  GET_A_LIFE: 'F:Use',
  THE_GREAT_SOUTHERN_PLANTKILL: 'K:262',
  TEMPLE_RAIDER: 'E:22',
  LIHZAHRDIAN_IDOL: 'K:245',
  ROBBING_THE_GRAVE: 'P:1513,938,963,977,1300,1254,1514,679,759,1446,1445,1444,1183,1266,671,3291,4679,4789',
  BIG_BOOTY: 'E:20',
  FISH_OUT_OF_WATER: 'K:370',
  OBSESSIVE_DEVOTION: 'K:439',
  STAR_DESTROYER: 'KM:517,422,507,493',
  CHAMPION_OF_TERRARIA: 'K:398',
  BLOODBATH: 'E:5',
  SLIPPERY_SHINOBI: 'K:50',
  GOBLIN_PUNTER: 'E:10',
  WALK_THE_PLANK: 'E:11',
  KILL_THE_SUN: 'E:3',
  DO_YOU_WANT_TO_SLAY_A_SNOWMAN: 'E:12',
  TIN_FOIL_HATTER: 'E:13',
  BALEFUL_HARVEST: 'E:15',
  ICE_SCREAM: 'E:14',
  STICKY_SITUATION: 'E:16',
  REAL_ESTATE_AGENT: 'E:17',
  NOT_THE_BEES: 'F:Use',
  JEEPERS_CREEPERS: 'F:Reach',
  FUNKYTOWN: 'F:Reach',
  INTO_ORBIT: 'F:Reach',
  ROCK_BOTTOM: 'F:Reach',
  MECHA_MAYHEM: 'E:21',
  GELATIN_WORLD_TOUR: 'KM:-5,-6,1,81,71,-3,147,138,-10,50,59,16,-7,244,-8,-1,-2,184,204,225,-9,141|K:183,-24,-25|K:-4',
  FASHION_STATEMENT: 'F:Equip',
  VEHICULAR_MANSLAUGHTER: 'F:Hit',
  BULLDOZER: 'I:Pick:10000',
  THERE_ARE_SOME_WHO_CALL_HIM: 'K:45',
  DECEIVER_OF_FOOLS: 'K:196',
  SWORD_OF_THE_HERO: 'P:757',
  LUCKY_BREAK: 'F:Hit',
  THROWING_LINES: 'F:Use',
  DYE_HARD: 'F:Equip',
  SICK_THROW: 'P:3389',
  FREQUENT_FLYER: 'FV:Pay:10000',
  THE_CAVALRY: 'F:Equip',
  COMPLETELY_AWESOME: 'P:98',
  TIL_DEATH: 'K:53',
  ARCHAEOLOGIST: 'K:52',
  PRETTY_IN_PINK: 'K:-4',
  RAINBOWS_AND_UNICORNS: 'F:Use',
  YOU_AND_WHAT_ARMY: 'F:Spawn',
  PRISMANCER: 'P:495',
  IT_CAN_TALK: 'E:18',
  WATCH_YOUR_STEP: 'F:Hit',
  MARATHON_MEDALIST: 'FV:Move:1106688',
  GLORIOUS_GOLDEN_POLE: 'P:2294',
  SERVANT_IN_TRAINING: 'F:Finish',
  GOOD_LITTLE_SLAVE: 'I:Finish:10',
  TROUT_MONKEY: 'I:Finish:25',
  FAST_AND_FISHIOUS: 'I:Finish:50',
  SUPREME_HELPER_MINION: 'I:Finish:200',
  TOPPED_OFF: 'F:Use',
  SLAYER_OF_WORLDS: 'K:13,14,15|K:113,114|K:125,126|KM:4,266,35,50,222,134,127,262,245,439,398,370',
  YOU_CAN_DO_IT: 'E:1',
  MATCHING_ATTIRE: 'F:Equip',
  DEFEAT_EMPRESS_OF_LIGHT: 'K:636',
  DEFEAT_QUEEN_SLIME: 'K:657',
  DEFEAT_DREADNAUTILUS: 'K:618',
  DEFEAT_OLD_ONES_ARMY_TIER3: 'E:23',
  GET_ZENITH: 'P:4956',
  GET_TERRASPARK_BOOTS: 'P:5000',
  FLY_A_KITE_ON_A_WINDY_DAY: 'F:Use',
  FOUND_GRAVEYARD: 'F:Reach',
  GO_LAVA_FISHING: 'F:Do',
  TURN_GNOME_TO_STATUE: 'E:24',
  TALK_TO_NPC_AT_MAX_HAPPINESS: 'F:Do',
  PET_THE_PET: 'F:Do',
  FIND_A_FAIRY: 'F:Do',
  THROW_A_PARTY: 'E:25',
  DIE_TO_DEAD_MANS_CHEST: 'F:Do',
  DEFEAT_DEERCLOPS: 'K:668',
  GET_GOLDEN_DELIGHT: 'P:4022',
  DRINK_BOTTLED_WATER_WHILE_DROWNING: 'F:Use',
  GET_CELL_PHONE: 'P:3124',
  GET_ANKH_SHIELD: 'P:1613',
  GAIN_TORCH_GODS_FAVOR: 'F:Use',
  PLAY_ON_A_SPECIAL_SEED: 'F:Do',
  ALL_TOWN_SLIMES: 'E:26',
  TRANSMUTE_ITEM: 'E:27',
  PURIFY_ENTIRE_WORLD: 'F:Do',
  TO_INFINITY_AND_BEYOND: 'F:Do',
  BOOK_WORM: 'E:29',
  BOULDER_LORD: 'E:30',
  QUEEN_MACHINE: 'E:31',
  ROLLIN_IN_YOUR_GRAVE: 'E:32',
  FEAR_THE_SUN: 'E:33',
  ITS_SHALING_OUTSIDE: 'E:34',
  EXTRA_LIFE: 'E:35',
  GRAVE_MISTAKE: 'E:36',
  SPICY_LICKS: 'E:37',
  ORGANIZED_CHAOS: 'P:1326',
  ON_FLEEK: 'E:38',
  FORTUNE_FAVORS_THE_BOULD: 'E:39',
  TRAINING_DAY: 'E:40',
  MINI_ME: 'E:41',
  TERRARIST: 'E:42',
  NEW_DIGS: 'E:43',
  MY_PEOPLE_NEED_ME: 'E:44',
  GOING_OLDSCHOOL: 'F:Do',
  SEA_YOU_LATER: 'P:5358',
  TRASH_COMPACTOR: 'E:45',
  CONSERVATIONIST: 'I:Do:100',
  INTERDIMENSIONAL_RECYCLING: 'E:46',
};

/** 我方条件 → 金标编码 */
function encodeCond(c: AchCondDef): string {
  switch (c.kind) {
    case 'flag': return `F:${c.name}`;
    case 'int': return `I:${c.name}:${c.value}`;
    case 'float': return `FV:${c.name}:${c.value}`;
    case 'itemPickup': return `P:${c.ids!.join(',')}`;
    case 'itemCraft':
      if (!c.ids) return 'C:WB';
      return WORKBENCH_KEY.has(c.ids.join(',')) ? 'C:WB' : `C:${c.ids.join(',')}`;
    case 'npcKilled': return c.many ? `KM:${c.ids!.join(',')}` : `K:${c.ids!.join(',')}`;
    case 'progressionEvent': return `E:${c.ids![0]}`;
    case 'tileDestroyed': return `D:${c.ids!.join(',')}`;
  }
}

describe('① 注册表条件链 oracle 金标（AchievementInitializer.cs 1458 全量 1:1）', () => {
  it('金标覆盖 137/137 且我方逐条逐位相等', () => {
    const ours = new Map(ACH_DEFS.map((d) => [d.name, d.conditions.map(encodeCond).join('|')]));
    const gold = new Map(Object.entries(GOLDEN));
    expect(gold.size).toBe(137);
    expect(ACH_DEFS.length).toBe(137);
    const problems: string[] = [];
    for (const [name, enc] of gold) {
      if (!ours.has(name)) { problems.push(`${name}: 我方缺注册`); continue; }
      if (ours.get(name) !== enc) problems.push(`${name}:\n  cs  =${enc}\n  ours=${ours.get(name)}`);
    }
    for (const name of ours.keys()) if (!gold.has(name)) problems.push(`${name}: 我方多注册`);
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ② 运行时回归（本批修复）
// ---------------------------------------------------------------------------
const memAch = () => new Achievements(null);
/** Game 原型桩（无构造器副作用;同 achievements-trigger-surface.test.ts 惯例） */
function stubGame(): Record<string, unknown> {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.achievements = memAch();
  return g;
}

describe('② THROWING_LINES 事件源（ItemCheck_Shoot aiStyle 99 悠悠球）', () => {
  it('引擎级：handleSpecialEvent(7) → THROWING_LINES 完成', () => {
    const a = memAch();
    a.handleSpecialEvent(7, { statLifeMax: 100, statManaMax: 20 });
    expect(a.isCompleted('THROWING_LINES')).toBe(true);
  });
  it('源锚：Game.ts 中 handleSpecialEvent(7 恰一处且位于悠悠球掷出位（非钓竿抛竿）', () => {
    const src = readFileSync(join(__dirname, '../src/core/Game.ts'), 'utf8');
    const hits = [...src.matchAll(/handleSpecialEvent\(7,/g)].map((m) => m.index!);
    expect(hits.length).toBe(1);
    // 悠悠球掷出位 = entities.add(yoyo,'projectiles') 之后 200 字符窗内
    const yoyoAdd = src.indexOf("this.entities.add(yoyo, 'projectiles')");
    expect(yoyoAdd).toBeGreaterThan(0);
    const seg = src.slice(yoyoAdd, yoyoAdd + 900);
    expect(seg, 'ev7 锚必须紧跟悠悠球掷出').toContain('handleSpecialEvent(7,');
    // 钓竿抛竿位（bob 入包段）不再挂 ev7
    const bobAdd = src.indexOf("this.entities.add(bob, 'projectiles')");
    const bobSeg = src.slice(bobAdd, bobAdd + 900);
    expect(bobSeg, '抛竿位不得再发 ev7（THROWING_LINES=掷悠悠球非抛竿）').not.toContain('handleSpecialEvent(7,');
  });
});

describe('③ 合成双发（Main.cs:43356-43357 NotifyItemCraft+NotifyItemPickup）', () => {
  it('引擎级：notifyItemCraft 推进 BENCHED（craft 型条件）', () => {
    const a = memAch();
    a.notifyItemCraft(36);   // 工作台
    expect(a.isCompleted('BENCHED')).toBe(true);
  });
  it('引擎级：notifyItemPickup 推进 GET_ZENITH（pickup 型条件）', () => {
    const a = memAch();
    a.notifyItemPickup(4956);
    expect(a.isCompleted('GET_ZENITH')).toBe(true);
  });
  it('源锚：vanillaCraft 逐轮 grant 段持双发对（pickup+craft 各恰一处,shim 不重复发 pickup）', () => {
    const src = readFileSync(join(__dirname, '../src/core/Game.ts'), 'utf8');
    const f0 = src.indexOf('  vanillaCraft(r: VanillaRecipeLike');
    expect(f0).toBeGreaterThan(0);
    const body = src.slice(f0, src.indexOf('\n  }', f0));
    expect(body, 'grant 段须含 pickup 通知（Main.cs:43357 面）').toContain('notifyItemPickup(outVid0)');
    expect(body, 'grant 段须含 craft 通知（:43356 面）').toContain('this.achNotifyCraft(outKey)');
    // shim 内不得有 pickup（vanillaCraft 已逐轮发,shim 再发=每轮双发）
    const shim0 = src.indexOf('private achNotifyCraft(outKey: string): void');
    const shim = src.slice(shim0, src.indexOf('\n  }', shim0));
    expect(shim).not.toContain('notifyItemPickup');
  });
});

describe('④ 进世界基线补全（OnPlayerEnteredWorld :192-197）', () => {
  it('unlockedBiomeTorches 旗 → GAIN_TORCH_GODS_FAVOR 补发', () => {
    const g = stubGame();
    g.entities = { npcs: [], projectiles: [], enemies: [] };
    g.world = { flags: { unlockedBiomeTorches: true }, bestiary: { completion: () => ({ percent: 0 }) } };
    g.player = { inv: { slots: [], armor: [], dye: [], miscEquips: [], miscDyes: [], loadouts: [] }, banks: [], maxHp: 100, maxMana: 20 };
    (g as unknown as { achOnWorldEnter(): void }).achOnWorldEnter();
    expect((g.achievements as Achievements).isCompleted('GAIN_TORCH_GODS_FAVOR')).toBe(true);
  });
  it('未解锁火把神 → 不发', () => {
    const g = stubGame();
    g.entities = { npcs: [], projectiles: [], enemies: [] };
    g.world = { flags: {}, bestiary: { completion: () => ({ percent: 0 }) } };
    g.player = { inv: { slots: [], armor: [], dye: [], miscEquips: [], miscDyes: [], loadouts: [] }, banks: [], maxHp: 100, maxMana: 20 };
    (g as unknown as { achOnWorldEnter(): void }).achOnWorldEnter();
    expect((g.achievements as Achievements).isCompleted('GAIN_TORCH_GODS_FAVOR')).toBe(false);
  });
  it('图鉴 100% → 进世界复查补发 BOOK_WORM（TryGrantingBestiary100Percent :197）', () => {
    const g = stubGame();
    g.entities = { npcs: [], projectiles: [], enemies: [] };
    g.world = { flags: {}, bestiary: { completion: () => ({ percent: 1 }) } };
    g.player = { inv: { slots: [], armor: [], dye: [], miscEquips: [], miscDyes: [], loadouts: [] }, banks: [], maxHp: 100, maxMana: 20 };
    (g as unknown as { achOnWorldEnter(): void }).achOnWorldEnter();
    expect((g.achievements as Achievements).isCompleted('BOOK_WORM')).toBe(true);
  });
});

describe('⑤ achCheckEquipState 两面谓词（DYE_HARD 两面 + TOPPED_OFF 字面 ==）', () => {
  const mkGame = (dyeFull: boolean, miscDyeFull: boolean, maxHp = 400, maxMana = 20) => {
    const g = stubGame();
    const dye = Array(10).fill(null).map((_, i) => (dyeFull || i < 10 - 0) && dyeFull ? { id: 1, stack: 1 } : null);
    const miscDyes = Array(5).fill(null).map(() => (miscDyeFull ? { id: 1, stack: 1 } : null));
    g.player = {
      inv: {
        slots: [], armor: [], miscEquips: [], dye, miscDyes, loadouts: [],
      },
      maxHp, maxMana,
    };
    return g;
  };
  it('10 主染料全满 + miscDyes 空：进世界基线（:180-191 只查主染料槽）→ DYE_HARD', () => {
    const g = mkGame(true, false);
    (g as unknown as { achCheckEquipState(enterWorld?: boolean): void }).achCheckEquipState(true);
    expect((g.achievements as Achievements).isCompleted('DYE_HARD')).toBe(true);
  });
  it('同态装备时刻（HandleOnEquip 12/33 :261-279 查 10+miscDyes）→ 不发', () => {
    const g = mkGame(true, false);
    (g as unknown as { achCheckEquipState(enterWorld?: boolean): void }).achCheckEquipState(false);
    expect((g.achievements as Achievements).isCompleted('DYE_HARD')).toBe(false);
  });
  it('两面全满：装备时刻 → DYE_HARD', () => {
    const g = mkGame(true, true);
    (g as unknown as { achCheckEquipState(enterWorld?: boolean): void }).achCheckEquipState(false);
    expect((g.achievements as Achievements).isCompleted('DYE_HARD')).toBe(true);
  });
  it('TOPPED_OFF 字面 ==500/==200（:152-155）：恰好满发,不超不发', () => {
    const a1 = memAch();
    (a1 as unknown as { handleSpecialEvent(ev: number, p: { statLifeMax: number; statManaMax: number }): void })
      .handleSpecialEvent(2, { statLifeMax: 500, statManaMax: 200 });
    expect(a1.isCompleted('TOPPED_OFF')).toBe(true);
    // 引擎字面 ==：超界不满足（原版 statLifeMax 域内本不可超,锁字面防漂移）
    const a2 = memAch();
    (a2 as unknown as { handleSpecialEvent(ev: number, p: { statLifeMax: number; statManaMax: number }): void })
      .handleSpecialEvent(2, { statLifeMax: 520, statManaMax: 200 });
    expect(a2.isCompleted('TOPPED_OFF')).toBe(false);
  });
  it('装备态检查器同字面：400/20 不发 TOPPED_OFF', () => {
    const g = mkGame(true, true, 400, 20);
    (g as unknown as { achCheckEquipState(enterWorld?: boolean): void }).achCheckEquipState(true);
    expect((g.achievements as Achievements).isCompleted('TOPPED_OFF')).toBe(false);
  });
});
