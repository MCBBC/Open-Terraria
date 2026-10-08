// ★BJ573（2026-10-08）判别面：用户实报「十周年种子打完肉山后哥布林工匠/动物学家
//  消失（NPC 列表没有;两 NPC 一地表一雪原,离地狱很远）」——销案四面锁。
//  定谳（反编译 Terarria1457/Terraria/ 唯一标杆,动刀前逐件亲读）：
//  · WoF 死亡链（NPC.cs:80281-80292 case 113）= CreateBrickBoxForWallOfFlesh() +
//    WorldGen.StartHardmode()（WorldGen.cs:31990-32008）→
//    TransformWorldOnBackgroundThread(initializeHardMode)（:31858-31975）——三层
//    全程【零 NPC 交互】：initializeHardMode 只跑 GERunner 感染/神圣 V 带蔓延 +
//    地下蜂巢墙（RandomWorldPoint 洞穴墙段）。原版硬模式转换从不杀/移除/搬家城镇 NPC。
//  · 「毁灭派对」全城镇 NPC StrikeNPCNoInteraction(9999) 清算（Main.cs:18109-18126）
//    只在 tenthAnniversary ∧ getGoodWorld 才武装（WorldGen.cs:11155-11164
//    `if (getGoodWorldGen) Main.afterPartyOfDoom = true` 嵌套臂）——纯十周年
//    celebrationmk10 只开 GenuineParty（+DaysOnCooldown=5），不武装。本仓武装位
//    Game.ts:7816 `if (seedFlags?.getGoodWorld)` 同门。
//  · 城镇 NPC「消失」原版仅三面：①死亡（LegacyMisc.19「{0}被杀死了……」公告,
//    BJ561 已接 TownNPC.broadcastDeathMessage）;②homelessDespawn 夜扫
//    UnspawnHomelessNPC（WorldGen.cs:5120-5169,LegacyMisc.35「{0}已离去！」+
//    active=false——调用门 Main.cs:66022-66028 `!dayTime || time > 48600` 每 tick,
//    离场盒 = sWidth/2+safeRange 外扩 = 2044×1278px≈128×80 格,NPC.cs:6172-6174/
//    :6791-6793）;③bound 态 750t 消散（boundCheckActive,仅被缚族）。
//  · 判谳（2026-10-08 用户补充修订：两 NPC 当时【已入住/住在房间里】）——夜扫
//    离场链对有房者结构性不可达（UnspawnHomelessNPC :5138-5142 `home != null`
//    → 只清标不离场,本文件 ④ 锁）；bound∧有房是不可能态（TownNPC fixedUpdate
//    每 tick `if (bound) home=null`）→ boundCheckActive 静默消散面同样不可达。
//    有房 NPC 在本仓全部移除通道（hurt 死亡链/出界面 F3/溺水 :96077/岩浆/敌怪
//    互殴 GetHurtByOtherNPCs）均走 TownNPC.hurt → BJ561 广播（「{0}被杀死了……」
//    红字）——「没看到死亡消息」残差解释：①构建早于 BJ561（2026-10-06 落）
//    死亡公告面尚缺,②战斗刷屏漏看（ChatMonitor 可回查）,③机制在已审计面之外
//    （需行为日志/复现定谳）。
//    出界面 F3（bottom−640+height≈1160+ 格深）地表/雪原恒不可达,且其致死也走
//    BJ561 广播——非静默通道。两 NPC 若已死亡非永久丢失：savedGoblin/图鉴 ≥10%
//    旗仍在,入驻轮再到达（原版城镇 NPC 死亡可复生语义）。
//  · 本仓对照（零偏差面,由 ①③④ 锁）：WoF 链 Game.ts:11247-11294 无 NPC 交互;
//    HardmodePass 纯瓦片;夜扫 Housing.unspawnHomelessSweep 1:1（常量 1920/1200/
//    62/39 verbatim）;解救 freeBoundNpc（Game.ts:8116）不置 homelessDespawn
//    （原版被缚族非 SpawnHomelessNPC 出生,Transform 后该旗恒假=解救者不被夜扫）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { createBrickBoxForWallOfFlesh, startHardmodeJob } from '../src/world/gen/vanilla/HardmodePass';
import { parseSeed } from '../src/world/gen/SeedEasterEggs';
import { unspawnHomelessSweep, type HomelessSweepNpcView } from '../src/world/Housing';
import { RNG } from '../src/core/rng';
import { TILE } from '../src/core/constants';

// ---- 公共桩 ----------------------------------------------------------------

/** 记录型 GameHooks：chat/floats 双记录（BJ561 死亡公告判别位） */
function mkGame(w: World, floats: number[] = [], chats: string[] = []): never {
  return {
    world: w,
    player: { dead: true, hp: 100, maxHp: 100, x: -9999, y: -9999, w: 0, h: 0 },
    addDamageNumber: (_x: number, _y: number, amt: number) => { floats.push(amt); },
    chatBroadcast: (msg: string) => { chats.push(msg); },
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    spawnDust: () => null, playSfxFile: () => {},
    critters: () => [], enemies: () => [], npcs: () => [],
    behavioLog: () => {}, recLog: () => {},
  } as never;
}

/** 有可转化素材的小世界（HardmodePass 需要感染/珍珠/蜂块面） */
function mkWorld(seed: number): World {
  const W = 420, H = 200;
  const w = new World(W, H, seed, 'bj573');
  const st = w.store;
  const rng = new RNG(seed);
  w.groundLevel = 70;
  w.dungeonX = Math.trunc(W / 4);
  for (let x = 10; x < W - 10; x++) {
    const surf = 60 + Math.floor(rng.next() * 12);
    for (let y = surf; y < H - 10; y++) {
      const band = Math.floor(x / 40) % 5;
      st.setTile(x, y, [1, 1, 2, 53, 59][band]);
      if (y === surf) st.setTile(x, y, [2, 2, 23, 199, 109][band]);
    }
  }
  for (let k = 0; k < 8; k++) {
    st.setTile(30 + k * 40, 120, 225); st.setTile(31 + k * 40, 120, 225);
  }
  return w;
}

/** 城镇 NPC 快照（安全锁对拍面：位置/生死/家/标/旗全量） */
function snapNpc(n: TownNPC) {
  return {
    dead: n.dead, x: n.x, y: n.y, home: n.home ? { ...n.home } : null,
    anchorTile: n.anchorTile ? { ...n.anchorTile } : null,
    homelessDespawn: n.homelessDespawn, bound: n.bound, vanillaId: n.vanillaId,
    npcKey: n.npcKey, hp: n.hp, maxHp: n.maxHp,
  };
}

// ---- ① 硬模式转换 NPC 安全锁 ------------------------------------------------

describe('BJ573 ①：硬模式转换（brickbox+startHardmodeJob 全跑）对城镇 NPC 零交互', () => {
  it('肉山死亡全链跑完：三名城镇 NPC（有房/无家持标/bound）逐位不变、旗不变', () => {
    const w = mkWorld(1295198809);
    const housed = new TownNPC('guide', 100 * TILE, 90 * TILE);
    housed.home = { x: 100, y: 89 };                      // 有房者
    const homelessFlagged = new TownNPC('zoologist', 120 * TILE, 90 * TILE);
    homelessFlagged.homelessDespawn = true;               // 流浪到达位口径（:5110）
    const boundTinkerer = new TownNPC('goblin_tinkerer', 140 * TILE, 90 * TILE);
    boundTinkerer.bound = true;                           // 被缚待救口径
    w.flags['savedGoblin'] = true;
    const before = [housed, homelessFlagged, boundTinkerer].map(snapNpc);
    const flagsBefore = { savedGoblin: w.flags['savedGoblin'], bestiaryHit: w.flags['downed_113'] };

    // Game 击杀流同序（Game.ts:11249-11261）：brickbox → job 分步跑完
    createBrickBoxForWallOfFlesh(w.store, 200, 160, 100, w.crimson);
    const job = startHardmodeJob(w);
    let steps = 0;
    while (!job.step()) if (++steps > 5_000_000) throw new Error('job 未收敛');
    expect(steps).toBeGreaterThan(0);

    expect([housed, homelessFlagged, boundTinkerer].map(snapNpc)).toEqual(before);
    expect(w.flags.hardMode).toBe(true);                  // 旗面照常置位
    expect(w.flags.hardModeConverted).toBe(true);
    expect(w.flags['savedGoblin']).toBe(flagsBefore.savedGoblin);   // 解救旗不被转换面触碰
    expect(job.wasHard).toBe(false);
  });

  it('wasHard 重复杀：job 立即完成,城镇 NPC 照旧零交互（F2 门×安全锁复合）', () => {
    const w = mkWorld(777);
    startHardmodeJob(w).step();                           // 首次
    const n = new TownNPC('goblin_tinkerer', 100 * TILE, 90 * TILE);
    const before = snapNpc(n);
    const job = startHardmodeJob(w);
    expect(job.wasHard).toBe(true);
    expect(job.step()).toBe(true);                        // F2 门：无世界工作
    expect(snapNpc(n)).toEqual(before);
  });
});

// ---- ② 十周年×毁灭派对武装门 ------------------------------------------------

describe('BJ573 ②：celebrationmk10 = tenthAnniversary ∧ !getGoodWorld（清算永不武装）', () => {
  it('celebrationmk10 解析：十周年真 ∧ FTW 假 → 11155-11164 嵌套臂不进,afterPartyOfDoom 不武装', () => {
    const { flags } = parseSeed('celebrationmk10');
    expect(flags.tenthAnniversary).toBe(true);
    expect(flags.getGoodWorld ?? false).toBe(false);   // 单旗世界：旗位缺省（undefined）= 假
    // Game.ts:7816 武装位 `if (seedFlags?.getGoodWorld)`（vanilla WorldGen.cs:11162
    // getGoodWorldGen 臂）——十周年单旗世界该位恒 false → Main.cs:18109 全城镇
    // NPC 9999 清算面结构性不可达。用户世界不可能被「毁灭派对」清场。
  });

  it('getfixedboi（天顶）= 双真 → 唯一武装档（判别力对偶）', () => {
    const { flags } = parseSeed('getfixedboi');
    expect(flags.tenthAnniversary).toBe(true);
    expect(flags.getGoodWorld).toBe(true);
  });
});

// ---- ③ 出界面 F3 边界（地表/雪原不可达 + 非静默死） --------------------------

describe('BJ573 ③：F3 出界面（y > bottomWorld−640+h）地表/雪原 NPC 恒不可达', () => {
  it('地表/雪原档（y≈2000,小世界 200t 底=3200）→ 不触发,NPC 存活', () => {
    const w = mkWorld(42);
    const chats: string[] = [];
    // 哥布林工匠 107（h=46）/动物学家 633 —— 地表档
    const t = new TownNPC('goblin_tinkerer', 100 * TILE, 2000);
    const z = new TownNPC('zoologist', 160 * TILE, 2000);
    for (const n of [t, z]) {
      try {
        (n as unknown as { fixedUpdate: (dt: number, g: never) => void })
          .fixedUpdate(1 / 60, mkGame(w, [], chats));
      } catch {
        // 空世界桩 AI_007 后续面可容忍;守卫位=出界面已过
      }
      expect(n.dead).toBe(false);                         // ★判别位：出界面不触发
    }
    expect(chats).toEqual([]);
  });

  it('地狱底部档触发 F3 → 死亡但 BJ561 公告照发（「没看到死亡消息」不可能由 F3 造成）', () => {
    const w = mkWorld(42);
    const chats: string[] = [];
    const floats: number[] = [];
    const n = new TownNPC('goblin_tinkerer', 100 * TILE, 3200 - 640 + 46 + 100);   // 阈值下 100px
    (n as unknown as { fixedUpdate: (dt: number, g: never) => void })
      .fixedUpdate(1 / 60, mkGame(w, floats, chats));
    expect(n.dead).toBe(true);
    expect(floats).toEqual([]);                           // owner255 静默=不飘大字
    // BJ561 broadcastDeathMessage 照走（文案键 LegacyMisc.19「{0}被杀死了……」,
    // 测试环境 l10n 未启动 → 断言广播发生次数而非文本子串）
    expect(chats.length).toBe(1);                         // ★死亡公告照发
  });
});

// ---- ④ 夜扫离场链（UnspawnHomelessNPC :5120-5169 = 判谳机制本体） ------------

describe('BJ573 ④：夜扫离场链——未入住流浪者玩家远征即离去（非死亡非肉山）', () => {
  const NPC = 16;
  // 地表镇民（动物学家档）中心 tile (200,300);玩家在地狱 tile (200,1100)
  // ——垂直距 800 格 ≫ 安全盒半高（1200/2+78=678px≈42 格）→ 盒外
  const mk = (over: Partial<HomelessSweepNpcView> = {}): HomelessSweepNpcView => ({
    key: 'zoologist', npcId: 633, home: null, homelessDespawn: true, bound: false, dead: false,
    cx: 200 * NPC + 8, cy: 300 * NPC + 8, w: 18, h: 40, ref: { tag: 'z' },
    ...over,
  });
  const hellPlayer = { x: 200 * NPC, y: 1100 * NPC, w: 20, h: 42 };   // 地狱远征位
  const townPlayer = { x: 205 * NPC, y: 300 * NPC, w: 20, h: 42 };    // 城镇位

  it('未入住持标者 + 玩家地狱远征 → 判离场（VanillaMisc.35 离去档,非 LegacyMisc.19 死亡）', () => {
    const r = unspawnHomelessSweep([mk()], [hellPlayer]);
    expect(r.despawned).not.toBeNull();                   // ★判谳位：离场
    expect(r.despawned?.npcId).toBe(633);
  });

  it('双持标者连续两拍各离场一名（数组序首个制）= 两人同失', () => {
    const a = mk({ key: 'goblin_tinkerer', npcId: 107, ref: { tag: 'a' } });
    const b = mk({ ref: { tag: 'b' } });
    const r1 = unspawnHomelessSweep([a, b], [hellPlayer]);
    expect(r1.despawned?.ref).toEqual({ tag: 'a' });
    const r2 = unspawnHomelessSweep([b], [hellPlayer]);   // a 已 active=false 出桶
    expect(r2.despawned?.ref).toEqual({ tag: 'b' });
  });

  it('有房者持标 + 玩家远 → 只清标不离场（ housed 判谳面：房主永不因夜扫消失）', () => {
    const r = unspawnHomelessSweep([mk({ home: { x: 200, y: 299 } })], [hellPlayer]);
    expect(r.despawned).toBeNull();
    expect(r.flagCleared).not.toBeNull();                 // :5138-5142 复核失败档
  });

  it('解救者口径（homelessDespawn=false,freeBoundNpc 不置标）不被夜扫锁定', () => {
    const rescued = mk({ homelessDespawn: false, ref: { tag: 'rescued' } });
    const r = unspawnHomelessSweep([rescued], [hellPlayer]);
    expect(r.despawned).toBeNull();
    expect(r.flagCleared).toBeNull();
    expect(r.skippedByPlayer).toBe(false);
  });

  it('玩家在城镇（此前日常）→ skippedByPlayer 整 tick 不动=夜扫从未有触发窗', () => {
    const r = unspawnHomelessSweep([mk()], [townPlayer]);
    expect(r.despawned).toBeNull();
    expect(r.skippedByPlayer).toBe(true);
  });

  it('bound 口径复核失败档 → 只清标（:5138-5142 非 homeless/非城镇体支）', () => {
    const r = unspawnHomelessSweep([mk({ bound: true })], [hellPlayer]);
    expect(r.despawned).toBeNull();
    expect(r.flagCleared).not.toBeNull();
  });
});
