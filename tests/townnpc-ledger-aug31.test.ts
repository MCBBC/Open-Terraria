// 城镇 NPC 台账清偿七件批（2026-08-31）回归锚——原版真值 Terarria1458/NPC.cs AI_007：
//  D① 开门掷门第二操作数（:54576-54608 掷门四象限）：(Next(10)==0 | 回家旗)→
//      成功 ai[1]+=80f、全败 direction*=-1；hitWall 必开兜底退役
//  D② stinky 双路消费（:54033 敌怪支 / :54081-54100 玩家支 + :55769 !flag17
//      停打 + flag16 强逃）——此前 C3② 已落实体面，本批钉行为防回滚
//  D③ 社交演出两态：550 酒馆老板 ai[0]=18(300t)（:55886-55905）/ 229 海盗
//      ai[0]=11=30×Next(1,4)（:55908-55915）；退出口 {2,11} 族 localAI[3]=40
//  D⑤ 问好窗口收窄：Player.CanBeTalkedTo(:3872 stealth==1f)+uiBlocking 工程门 +
//      CanHitLine 端点 Top 中心
//  D⑥ 结对聊天泡 NewBubbleNPC 三事件：t70 锚对方头顶 life90 / t216 self life70 /
//      t320 self life100，表情 PickNPCEmote 随机非字面 id
//  D⑦ 树妖 Stardew 施法态（HaveDryadDoStardewAnimation :19220 → ai[0]==24，
//      :55687-55703 推进+GetMagicAuraColor 施法光）+ 敌怪 186 DryadBane else-if 臂
//      （Projectile.cs:41961-41972）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC, townNpcBaseFrame } from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';
import { emoteCount, emoteSnapshot, emoteClearAll } from '../src/render/EmoteBubble';
import { getDryadsBaneDamagePerSecond } from '../src/stats/DryadsBane';
import { mainDifficulty } from '../src/stats/ScaleStats';
import type { GameHooks } from '../src/entities/types';

const DIRT = TILE_BY_KEY['dirt']!;
const STONE = TILE_BY_KEY['stone']!;
const DOOR_CLOSED = TILE_BY_KEY['door_closed']!;
const F = 60;   // 地面行

function flatWorld(label = 'tnpc-ledger') {
  const world = new World(120, 120, 80, label);
  for (let x = 10; x <= 110; x++) world.store.setTileSilent(x, F, DIRT);
  world.clock.timeOfDay = 0.5;
  return world;
}

type Cast = Record<string, unknown>;

/** 序列随机源（逐次弹出，耗尽后停留尾值） */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function makeGame(world: World, opts: {
  enemies?: unknown[];
  npcs?: unknown[];
  player?: Record<string, unknown>;
} = {}): GameHooks {
  return {
    world,
    player: opts.player ?? { x: -99999, y: -99999, w: 16, h: 24, cx: -99991, cy: -99987, dead: true },
    enemies: () => opts.enemies ?? [],
    npcs: () => opts.npcs ?? [],
    critters: () => [],
    spawnTownShot: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    playSfx: () => {},
    addDamageNumber: () => {},
    achievements: { notifyProgressionEvent: () => {} },
    vanillaDust: undefined,
  } as never;
}

/** 关闭木门立柱：col 列 ay..ay+2 三格（顶格 frameY%54==0），side 砖可堵两侧 */
function buildDoor(st: World['store'], col: number, topRow: number, block: boolean) {
  for (let dy = 0; dy < 3; dy++) {
    st.setTile(col, topRow + dy, DOOR_CLOSED, 0, dy * 18);
  }
  if (block) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTile(col - 1, topRow + dy, STONE);
      st.setTile(col + 1, topRow + dy, STONE);
    }
  }
}

describe('D① 开门掷门第二操作数错配四点（NPC.cs:54576-54608）', () => {
  function setup(block = false) {
    const world = flatWorld();
    const st = world.store;
    const doorCol = 50;
    buildDoor(st, doorCol, F - 3, block);
    // 探列公式（:54515）n25 = floor(x+w/2+15*dir /16)：把本体钉到 n25 精确落门列；
    // 行向 n26=floor(y+h−8)=F−1，探测三行 {F−3,F−2,F−1} 与门柱三格对齐
    const npc = new TownNPC('guide', 0, 0);
    npc.x = doorCol * 16 - 15 - npc.w / 2;
    npc.y = F * 16 - npc.h;
    npc.rng = seqRng([0.999]);
    const game = makeGame(world);
    return { world, st, npc, game };
  }

  const callProbe = (npc: TownNPC, st: World['store'], game: GameHooks): boolean =>
    (npc as never as { tryOpenDoorAhead(s: typeof st, g: GameHooks): boolean })
      .tryOpenDoorAhead(st, game);

  it('Q1 回家旗开=雨夜族天气免掷必开+走程奖励+80+carry', () => {
    const { st, npc, game } = setup();
    (npc as never as Cast).homeFlag = true;        // 雨/夜/日食/史莱姆雨任一真
    (npc as never as Cast).walkT = 200;
    const opened = callProbe(npc, st, game);
    expect(opened).toBe(true);
    expect(st.get(50, F - 3)).not.toBe(DOOR_CLOSED);          // 门已开成开门两列族
    expect((npc as never as Cast).closeDoor).toBe(true);      // closeDoor=true
    expect((npc as never as { walkT: number }).walkT).toBe(280); // ai[1]+=80f(:54610)
  });

  it('Q2 白天好天掷未中 → 不动门不翻向', () => {
    const { st, npc, game } = setup();
    (npc as never as Cast).homeFlag = false;
    const before = npc.facing;
    const opened = callProbe(npc, st, game);
    expect(opened).toBe(false);
    expect(st.get(50, F - 3)).toBe(DOOR_CLOSED);
    expect(npc.facing).toBe(before);
    expect((npc as never as Cast).closeDoor).toBeFalsy();
  });

  it('Q3 白天好天但 1/10 掷中 → 照常开（含 +80 走程）', () => {
    const { st, npc, game } = setup();
    (npc as never as Cast).homeFlag = false;
    (npc as never as { walkT: number }).walkT = 10;
    npc.rng = seqRng([0.05]);
    const opened = callProbe(npc, st, game);
    expect(opened).toBe(true);
    expect((npc as never as { walkT: number }).walkT).toBe(90);
  });

  it('Q4 两方向全堵 → direction *= -1 重试（:54629 全败支）', () => {
    const { st, npc, game } = setup(true);
    (npc as never as Cast).homeFlag = false;
    npc.rng = seqRng([0.05]);
    const before = npc.facing;
    const opened = callProbe(npc, st, game);
    expect(opened).toBe(false);
    expect(st.get(50, F - 3)).toBe(DOOR_CLOSED);
    expect(npc.facing).toBe(-before);                // 仅翻向不写 vx（原版同）
  });
});

describe('D② stinky 双路 NPC 消费（:54033/:54081/:55769，C3② 行为钉死）', () => {
  const MELEE_ENEMY = { x: 0, y: 0, w: 20, h: 40, dead: false, damage: 40 };

  it('带臭味敌怪进入险情扫描并挡下自卫攻击触发（flag17 停打）', () => {
    stubRandAlways(0.999);
    const world = flatWorld();
    const npc = new TownNPC('guide', 60 * 16, F * 16 - 56);
    const foe = { ...MELEE_ENEMY, x: 62 * 16, y: F * 16 - 40, cx: 62 * 16 + 10,
      cy: F * 16 - 20, vanillaId: 1, stinkyT: 4.5, friendly: false, wet: false };
    const game = makeGame(world, { enemies: [foe] });
    (npc as never as { fixedUpdate(dt: number, g: GameHooks): void }).fixedUpdate(1 / 60, game);
    expect((npc as never as { dangerStinky: boolean }).dangerStinky).toBe(true);
    // 攻击触发门被 !flag17 拦截（即使有可打敌在窗内）
    npc.rng = seqRng([0]);                            // 掷门必中也不行
    (npc as never as { attackUpdate(w: World, g: GameHooks): boolean }).attackUpdate(world, game);
    expect(npc.attackState).toBe(0);
    stubReset();
  });

  it('stinky 玩家视作威胁置 flag16 强逃（玩家第二扫 :54081-96）', () => {
    stubRandAlways(0.999);
    const world = flatWorld();
    const npc = new TownNPC('party_girl', 60 * 16, F * 16 - 56);
    const game = makeGame(world, {
      player: {
        x: 64 * 16, y: F * 16 - 44, w: 20, h: 42, cx: 64 * 16 + 10, cy: F * 16 - 23,
        dead: false, buffs: { has: (b: number) => b === 76 }, stealth: 1,   // BuffType.Stinky=76（原版 120）
      },
    });
    (npc as never as { fixedUpdate(dt: number, g: GameHooks): void }).fixedUpdate(1 / 60, game);
    expect((npc as never as { threatRaw: boolean }).threatRaw).toBe(true);   // flag16
    expect((npc as never as { dangerNear: boolean }).dangerNear).toBe(true);
    expect((npc as never as { dangerStinky: boolean }).dangerStinky).toBe(true);
    expect((npc as never as { dangerSide: number }).dangerSide).toBe(1);     // 玩家在右侧
    stubReset();
  });
});

function stubRandAlways(v: number): void { Math.random = () => v; }
function stubReset(): void { Math.random = ORIG_RAND; }
const ORIG_RAND = Math.random;

describe('D③ 社交演出两态（550 ai0=18 / 229 ai0=11，:55886-55915）', () => {
  it('酒馆老板站定 1/600 + 玩家近旁 LOS → ai[0]=18 / 300t 面向玩家', () => {
    stubRandAlways(0.999);
    const world = flatWorld();
    const npc = new TownNPC('tavernkeep', 60 * 16, F * 16 - 56);
    const game = makeGame(world, {
      player: { x: 63 * 16, y: F * 16 - 44, w: 20, h: 42, cx: 63 * 16 + 10,
        cy: F * 16 - 23, dead: false },
    });
    // 链序掷位：R1 聊天 R2 RPS R3 舞 全 miss，R4 酒保 1/600 命中
    (npc as unknown as { onGround: boolean }).onGround = true;
    npc.rng = seqRng([0.9, 0.9, 0.9, 0.0005]);
    const inState = (npc as never as { socialUpdate(w: World, g: GameHooks): boolean })
      .socialUpdate(world, game);
    expect(inState).toBe(true);
    expect(npc.socialKind).toBe(18);
    expect((npc as never as { social: { t: number } }).social.t).toBe(300);
    expect(npc.facing).toBe(1);
    stubReset();
  });

  it('海盗站定 1/600 → ai[0]=11 / 30×Next(1,4)，推进共段起身 localAI[3]=40', () => {
    stubRandAlways(0.999);
    const world = flatWorld();
    const npc = new TownNPC('pirate', 60 * 16, F * 16 - 56);
    const game = makeGame(world);
    // 掷位：R1 聊天 R2 RPS R3 舞 R4 酒保 R5 发呆 全 miss，R6 海盗 hit，
    // R7 = Next(1,4) 幂 → t=30（30×1）
    (npc as unknown as { onGround: boolean }).onGround = true;
    npc.rng = seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.0005, 0.95]);
    const inState = (npc as never as { socialUpdate(w: World, g: GameHooks): boolean })
      .socialUpdate(world, game);
    expect(inState).toBe(true);
    expect(npc.socialKind).toBe(11);
    const t0 = (npc as never as { social: { t: number } }).social.t;
    expect([30, 60, 90]).toContain(t0);
    // 穷尽态长 → 退出走 {2,11} 族形状（localAI[3]=40 直值，非 30+Next(60)）
    (npc as never as { social: { t: number } }).social.t = 1;
    npc.rng = seqRng([0.9, 0.9]);
    (npc as never as { socialUpdate(w: World, g: GameHooks): boolean }).socialUpdate(world, game);
    expect(npc.socialKind).toBe(0);
    expect((npc as never as { turnLock: number }).turnLock).toBe(40);   // :54828
    stubReset();
  });

  it('树妖 Stardew 彩蛋施法态（D⑦ 前半）：置入锁向 + GetMagicAuraColor 光 + 结束退口', () => {
    stubRandAlways(0.999);
    const world = flatWorld();
    const npc = new TownNPC('dryad', 60 * 16, F * 16 - 56);
    const game = makeGame(world);
    expect(npc.enterStardewCast()).toBe(true);
    expect(npc.enterStardewCast()).toBe(false);       // ai[0]==24 门防重入
    expect(npc.ai0).toBe(24);
    expect(npc.facing).toBe(1);                       // direction=spriteDirection=1
    // 施法光主体（ai[0]==24 块 :55693）：树妖基色 (40,255,80)/255
    expect(npc.lightRGB).toEqual([40 / 255, 1, 80 / 255]);
    // 帧带：魔法光环族 base/base+1 每 6t 交替（FindFrame :69943-69955 共带）
    npc.rng = seqRng(Array.from({ length: 400 }, () => 0.9));
    const total = VANILLA_NPCS['20']!.frames;
    const base = townNpcBaseFrame(20, total);
    (npc as never as { socialFrame(b: number, g?: GameHooks): void }).socialFrame(base, game);
    expect([base, base + 1]).toContain(npc.frame);
    // 穷尽 480t → 退口 ai[0]=0/ai[1]=480/localAI[1]=480（:55695-55703）
    (npc as never as { social: { t: number } }).social.t = 1;
    npc.rng = seqRng([0.9]);
    (npc as never as { socialUpdate(w: World, g: GameHooks): boolean }).socialUpdate(world, game);
    expect(npc.socialKind).toBe(0);
    expect((npc as never as { walkT: number }).walkT).toBe(480);
    expect((npc as never as { atkCd: number }).atkCd).toBe(480);
    stubReset();
  });
});

describe('D⑥ 结对聊天泡 NewBubbleNPC（:70033-70054 新批）', () => {
  const ANCHORS_F = 60;

  function pair() {
    const world = flatWorld();
    const a = new TownNPC('guide', 60 * 16, ANCHORS_F * 16 - 56);
    const b = new TownNPC('merchant', 65 * 16, ANCHORS_F * 16 - 56);
    a.onGround = b.onGround = true;
    const dur = 420;
    a.social = { kind: 3, t: dur, other: b, frameT: 0, prevFrame: 0, rpsA: 0, rpsB: 0 };
    b.social = { kind: 4, t: dur, other: a, frameT: 0, prevFrame: 0, rpsA: 0, rpsB: 0 };
    const game = makeGame(world, { npcs: [a, b] });
    return { world, a, b, game };
  }

  it('t70 泡锚在对方头顶（life90）、t216/t320 锚在自己（life70/100），表情为随机池项', () => {
    emoteClearAll();
    const POOL = [0, 1, 2, 3, 15, 16, 17, 87, 91, 134, 135, 136, 137, 138, 139];
    const { a, game } = pair();
    a.rng = seqRng(Array.from({ length: 500 }, (_, i) => (i % 15) / 15));
    const base = townNpcBaseFrame(22, VANILLA_NPCS['22']!.frames);
    const step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        (a as never as { socialFrame(b: number, g?: GameHooks): void })
          .socialFrame(base, game);
      }
    };
    step(69);                                            // frameT 到 70 的前一拍
    expect(emoteCount()).toBe(0);
    step(1);                                             // t===70 → 对方头顶冒泡
    let snap = emoteSnapshot();
    expect(snap.length).toBe(1);
    expect(snap[0].lifeTime).toBe(90);
    expect(POOL).toContain(snap[0].emote);
    step(216 - 70);                                      // t===216 → 自己冒泡 life70
    snap = emoteSnapshot();
    expect(snap.length).toBe(2);
    expect(snap.some((s) => s.lifeTime === 70)).toBe(true);
    step(320 - 216);                                     // t===320 → 自己冒泡 life100
    snap = emoteSnapshot();
    expect(snap.some((s) => s.lifeTime === 100)).toBe(true);
  });

  it('对方不可对话（腾空）→ t70 不冒泡（nPC.CanTalk 门）', () => {
    emoteClearAll();
    const { a, b, game } = pair();
    b.onGround = false;
    a.rng = seqRng(Array.from({ length: 500 }, (_, i) => (i % 15) / 15));
    const base = townNpcBaseFrame(22, VANILLA_NPCS['22']!.frames);
    for (let i = 0; i < 71; i++) {
      (a as never as { socialFrame(b: number, g?: GameHooks): void })
        .socialFrame(base, game);
    }
    expect(emoteCount()).toBe(0);
  });
});

describe('D⑦ 敌怪 186 DryadBane（Projectile.cs:41961-41972 else-if 臂）', () => {
  function wardFixture(enemies: unknown[]) {
    const world = flatWorld();
    const dryad = new TownNPC('dryad', 60 * 16, F * 16 - 56);
    (dryad as never as { wardT: number }).wardT = 40;   // ≥30 且 %10==0 → 受理拍
    const game = makeGame(world, { enemies });
    return { world, dryad, game };
  }

  it('视野内普通敌吃 186：时长合并 2s + dps 写入；重授窗内不复写', () => {
    const e = {
      x: 66 * 16, y: F * 16 - 40, w: 20, h: 40, cx: 66 * 16 + 10, cy: F * 16 - 20,
      dead: false, maxHp: 100, hp: 100, dontTakeDamage: false, vanillaId: 1,
      dryadBaneT: 0, dryadBaneDoT: 0, dryadBaneDps: 0,
    };
    const { world, dryad, game } = wardFixture([e]);
    (dryad as never as { updateDryadWardAura(w: World, g: GameHooks): void })
      .updateDryadWardAura(world, game);
    expect(e.dryadBaneT).toBeCloseTo(2, 5);                       // AddBuff(186,120)
    // dps=GetDryadsBaneDamagePerSecond（NPC.cs:92898-92963 专用进度链）。
    // ★2026-09-01 F11 翻正：旧断言走自卫攻击链 townNpcProgressionBoost(:53400)
    // 是误链——空旗世界两链基值同为 4 恰未爆雷；旗标三态表+战斗书反证例见
    // tests/town-npc-dryads-bane.test.ts。本 fixture 无任何 downed/hardMode/
    // seedFlags → 原文静态位全默认 false（:92900 num=4、:92901 num2=1f）
    const expected = getDryadsBaneDamagePerSecond({}, mainDifficulty(world));
    expect(e.dryadBaneDps).toBe(expected);                        // dps 写入与链条恒等
    const tBurst = e.dryadBaneT, dps = e.dryadBaneDps;
    (e as unknown as { dryadBaneT: number }).dryadBaneT = 1.5;     // >20t 余量
    (dryad as never as { updateDryadWardAura(w: World, g: GameHooks): void })
      .updateDryadWardAura(world, game);
    expect(e.dryadBaneT).toBe(1.5);                                // 未刷新
    expect(e.dryadBaneDps).toBe(dps);
    expect(tBurst).toBeGreaterThan(0);
  });

  it('LOS 隔墙不打（CanHit 弹心对敌盒）；蜂后 488 豁免；dontTakeDamage 豁免', () => {
    const world = flatWorld();
    const st = world.store;
    // 隔墙敌（干掉 LOS）：
    const hidden = {
      x: 68 * 16, y: F * 16 - 40, w: 20, h: 40, cx: 68 * 16 + 10, cy: F * 16 - 20,
      dead: false, maxHp: 100, hp: 100, dontTakeDamage: false, vanillaId: 1,
      dryadBaneT: 0, dryadBaneDoT: 0, dryadBaneDps: 0,
    };
    for (let j = F - 12; j <= F; j++) st.setTileSilent(66, j, STONE);
    const qb = {                                                   // 蜂后 488
      x: 70 * 16, y: F * 16 - 40, w: 20, h: 40, cx: 70 * 16 + 10, cy: F * 16 - 20,
      dead: false, maxHp: 3409, hp: 3409, dontTakeDamage: false, vanillaId: 488,
      dryadBaneT: 0, dryadBaneDoT: 0, dryadBaneDps: 0,
    };
    const protectedFoe = {
      x: 74 * 16, y: F * 16 - 40, w: 20, h: 40, cx: 74 * 16 + 10, cy: F * 16 - 20,
      dead: false, maxHp: 100, hp: 100, dontTakeDamage: true, vanillaId: 1,
      dryadBaneT: 0, dryadBaneDoT: 0, dryadBaneDps: 0,
    };
    const { dryad, game } = wardFixture([hidden, qb, protectedFoe]);
    (dryad as never as { updateDryadWardAura(w: World, g: GameHooks): void })
      .updateDryadWardAura(world, game);
    expect(hidden.dryadBaneT).toBe(0);
    expect(qb.dryadBaneT).toBe(0);
    expect(protectedFoe.dryadBaneT).toBe(0);
  });
});

describe('D⑤ 问好窗口收窄（Player.CanBeTalkedTo + uiBlocking）', () => {
  it('玩家潜行 stealth<1 不触发面向玩家问好（:3872 面）', () => {
    stubRandAlways(0.999);
    const world = flatWorld();
    const npc = new TownNPC('guide', 60 * 16, F * 16 - 56);
    const plr = { x: 63 * 16, y: F * 16 - 44, w: 20, h: 42, cx: 63 * 16 + 10,
      cy: F * 16 - 23, dead: false, stealth: 0.85 };               // 星璇潜行中
    const game = makeGame(world, { player: plr });
    // R1..R6 全 miss，R7 命中面向玩家支（stealth 门在掷后拒入）
    (npc as unknown as { onGround: boolean }).onGround = true;
    npc.rng = seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.0002]);
    const inState = (npc as never as { socialUpdate(w: World, g: GameHooks): boolean })
      .socialUpdate(world, game);
    expect(inState).toBe(false);
    expect(npc.socialKind).toBe(0);
    stubReset();
  });

  it('UI 占用（背包/挂牌/商店 uiBlocking）不点头（工程收窄叠加面）', () => {
    stubRandAlways(0.999);
    const world = flatWorld();
    const npc = new TownNPC('guide', 60 * 16, F * 16 - 56);
    const game = makeGame(world, {
      player: { x: 63 * 16, y: F * 16 - 44, w: 20, h: 42, cx: 63 * 16 + 10,
        cy: F * 16 - 23, dead: false, stealth: 1 },
    });
    (game as never as { input: { uiBlocking: boolean } }).input = { uiBlocking: true };
    (npc as unknown as { onGround: boolean }).onGround = true;
    npc.rng = seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.0002]);
    const inState = (npc as never as { socialUpdate(w: World, g: GameHooks): boolean })
      .socialUpdate(world, game);
    expect(inState).toBe(false);
    expect(npc.socialKind).toBe(0);
    stubReset();
  });
});
