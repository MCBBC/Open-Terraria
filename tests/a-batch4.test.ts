// A 级近似清零 第四批（收尾批）探针，宿主全确定性（AI 直调 + 脚本化 rnd）：
//   1. 克脑 AI_054（src/entities/bossAI.ts ↔ NPC.cs:32537-32827）
//   2. 爬行者 AI_055（同文件 ↔ NPC.cs:32828-32914，SetDefaults :12388-12400）
//   3. 饥饿者 justHit（bossAI_wof.ts ↔ NPC.cs:26299-26301）
//   4. 毁灭者 135 段激光真值概率（bossAI.ts ↔ NPC.cs:50204-50241）
//   5. 猪鲨爆裂泡泡 371 受击即爆（Enemy.hurt ↔ StrikeNPC cs:82102-82107 /
//      aiStyle 70 :35180-35194）
//   6. 灯笼 demonTorch 调制（TileLightScanner.specialTileLight ↔ cs:2638-2652）
//   7. 风气球 direction/num3（Enemy.windyBalloonAI ↔ NPC.cs:48253-48430）
//   8. 星光斗篷/蜂巢反击/幸运币（Game.ts 纯函数 ↔ Player.cs:37826-37907 / :43892-43916）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { brainOfCthulhuAI, creeperAI, destroyerAI } from '../src/entities/bossAI';
import { hungryAI } from '../src/entities/bossAI_wof';
import { dukeBubbleAI } from '../src/entities/bossAI_duke_moonlord';
import { specialTileLight } from '../src/lighting/TileLightScanner';
import { FlickerClock } from '../src/lighting/SkyColor';
import { beeRetaliateRoll, luckyCoinRoll, starCloakStarInfo } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';

// ---------------------------------------------------------------------------
// 假宿主：enemies/entities 共用同一数组（spawnPart 写入、AI 计数读取）
// ---------------------------------------------------------------------------
function makeGame(w: World, list: unknown[] = [], projectiles: unknown[] = []) {
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: {
      nextId: 1,
      add: (en: unknown, bucket: string) => { (bucket === 'projectiles' ? projectiles : list).push(en); },
    },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

/** 假玩家（CanHit/距离判定只读 x/y/w/h/cx/cy/vx/vy/dead） */
function fakePlayer(x: number, y: number, vx = 0, vy = 0): Player {
  return { x: x - 10, y: y - 21, w: 20, h: 42, cx: x, cy: y, vx, vy, dead: false } as unknown as Player;
}

function emptyWorld(): World {
  const w = new World(200, 200, 42, 'open');
  w.clock.timeOfDay = 0; // 深夜：isDay=false（毁灭者白天离场分支不触发）
  return w;
}

// ===========================================================================
// 1. 克脑 AI_054（NPC.cs:32537-32827）
// ===========================================================================
describe('A4-1 克脑 AI_054（NPC.cs:32537-32827）', () => {
  it('首帧生成 20 只爬行者（GetBrainOfCthuluCreepersCount :51330），锚定本体并带原版初速', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    list.push(brain);
    brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    const creepers = (list as Enemy[]).filter((n) => n.vanillaId === 267);
    expect(creepers.length).toBe(20);                       // :51330-51337 经典档 20
    expect(creepers.every((c) => c.master === brain)).toBe(true); // crimsonBoss 锚定
    expect(creepers.every((c) => c.ai0 === 0)).toBe(true);  // 原版 ai[0] 缺省 0（环绕态）
    expect(creepers.every((c) => Math.abs(c.vx) <= 3 && Math.abs(c.vy) <= 3)).toBe(true); // Next(-30,31)*0.1
  });

  it('一阶段 dontTakeDamage=true（SetDefaults :12372）：hurt 被拒', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    expect(brain.dontTakeDamage).toBe(true);
    const hp0 = brain.hp;
    expect(brain.hurt(500, 0, 0, game)).toBe(false);
    expect(brain.hp).toBe(hp0);
  });

  it('一阶段以 1 速缓追玩家（:32703-32723 num870=1）', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    list.push(brain);
    const p = fakePlayer(140 * TILE, 100 * TILE);
    brainOfCthulhuAI(brain, game, p);
    expect(brain.ai0).toBe(0);                        // 爬行者在场保持一阶段
    expect(Math.hypot(brain.vx, brain.vy)).toBeCloseTo(1, 5);
    expect(brain.vx).toBeGreaterThan(0);              // 玩家在右 → 朝右
  });

  it('爬行者清零 → ai[0]=-1 进二阶段：解除无敌 + 入场门 localAI[2] 置位（:32736-32742/:32589）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    brain.bInit = true; // 跳过爬行者生成（模拟已全灭）
    brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.ai0).toBe(-1);
    expect(brain.spawnAlpha).toBe(0);                 // :32740
    // 解除无敌与入场门在 ai[0]<0 分支（次 tick 才进入，与原版同序）
    brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.dontTakeDamage).toBe(false);         // :32589
    expect(brain.lai2).toBe(1);                       // :32575-32588 一次性门
  });

  it('二阶段 8 速追踪（:32591-32600 (v*50+dir)/51），速度不超过 8', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    brain.bInit = true;
    brainOfCthulhuAI(brain, game, fakePlayer(140 * TILE, 100 * TILE));
    expect(brain.ai0).toBe(-1);
    // 只跑 30t：瞬移阈值 60+Next(120) 尚未到期，保证停在纯追踪段
    for (let t = 0; t < 30; t++) brainOfCthulhuAI(brain, game, fakePlayer(140 * TILE, 100 * TILE));
    const sp = Math.hypot(brain.vx, brain.vy);
    expect(sp).toBeGreaterThan(1);                   // 8×(1-(50/51)^30) ≈ 3.6
    expect(sp).toBeLessThanOrEqual(8.0001);
    expect(brain.vx).toBeGreaterThan(0);
  });

  it('二阶段瞬移循环：计时达阈值 → ai[0]=-2 → ai[3] 25/t 增到 255 → 落点瞬移 → -3 → 回 -1', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    brain.bInit = true; brain.lai2 = 1;
    brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.ai0).toBe(-1);
    brain.lai1 = 1000; // 超过任何 60+Next(120) 阈值 → 本 tick 必触发选点
    brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.ai0).toBe(-2);                       // :32648-32652
    expect(brain.lai1).toBe(0);
    // -2 渐隐段：ai[3] += 25/t（单人档 :32669），到 255 瞬移（:32671-32678）
    for (let t = 0; t < 10; t++) brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.ai3).toBe(250);
    expect(brain.spawnAlpha).toBe(250);               // alpha 跟 ai[3]（:32680）
    const tx = brain.ai1, ty = brain.ai2;
    brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.ai3).toBe(255);
    // 瞬移后本 tick 尾段仍按速度积分（原版 AI 后由碰撞段推进），允许 ≤3px 漂移
    expect(Math.abs(brain.x - (tx * TILE - brain.w / 2))).toBeLessThanOrEqual(3);
    expect(Math.abs(brain.y - (ty * TILE - brain.h / 2))).toBeLessThanOrEqual(3);
    expect(brain.ai0).toBe(-3);
    // -3 渐显段：ai[3] -= 25/t 到 0 回 -1（:32682-32697）
    for (let t = 0; t < 11; t++) brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.ai3).toBe(0);
    expect(brain.ai0).toBe(-1);
  });

  it('一阶段瞬移：计时 120+Next(300) 达阈值 → ai[0]=1 渐隐 +5/t 到 255 → 瞬移 → ai[0]=2', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    const creeper = Enemy.fromVanilla(267, 100 * TILE, 100 * TILE)!;
    creeper.master = brain;
    list.push(brain, creeper);
    brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.ai0).toBe(0);
    brain.lai1 = 500; // 超过任何 120+Next(300) 阈值 → 选点 → ai[0]=1（:32777）
    brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.ai0).toBe(1);
    expect(brain.lai1).toBe(0);
    for (let t = 0; t < 51; t++) brainOfCthulhuAI(brain, game, fakePlayer(110 * TILE, 100 * TILE));
    expect(brain.spawnAlpha).toBe(255);               // :32790-32794
    expect(brain.ai0).toBe(2);
    // 一阶段追踪速 1px/t：瞬移后尾段再积分 1px（允许 ≤1.1px）
    expect(Math.abs(brain.x - (brain.ai1 * TILE - brain.w / 2))).toBeLessThanOrEqual(1.1);
  });

  it('玩家死尾段（:32810-32826）：ai[0]=2、alpha=10、localAI[3] 计数且 >60 后下坠加速', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    brain.bInit = true;
    for (let t = 0; t < 130; t++) brainOfCthulhuAI(brain, game, null);
    expect(brain.ai0).toBe(2);
    expect(brain.spawnAlpha).toBe(10);
    expect(brain.lai3).toBe(120);                     // 钳 120（:32812-32815）
    expect(brain.vy).toBeGreaterThan(0);              // (n-60)*0.25 累积下坠（:32816-32819）
  });
});

// ===========================================================================
// 2. 爬行者 AI_055（NPC.cs:32828-32914）
// ===========================================================================
describe('A4-2 爬行者 AI_055（NPC.cs:32828-32914）', () => {
  it('主体不在 → 消散（:32830-32835 crimsonBoss<0）', () => {
    const game = makeGame(emptyWorld());
    const c = Enemy.fromVanilla(267, 100 * TILE, 100 * TILE)!;
    creeperAI(c, game, null);
    expect(c.dead).toBe(true);
  });

  it('环绕态距主体 >90px：8 速逼近（(v*15+dir)/16 :32843-32850），保持 ai[0]=0', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    const c = Enemy.fromVanilla(267, 140 * TILE, 100 * TILE)!; // 距主体 640px
    c.master = brain;
    creeperAI(c, game, fakePlayer(120 * TILE, 100 * TILE));
    expect(c.ai0).toBe(0);
    expect(c.vx).toBeLessThan(0);                     // 朝主体（向左）
    for (let t = 0; t < 60; t++) creeperAI(c, game, fakePlayer(120 * TILE, 100 * TILE));
    expect(Math.hypot(c.vx, c.vy)).toBeLessThanOrEqual(8.0001); // 逼近速度钳 8
  });

  it('扑咬态：未受击保持直飞（:32897-32900）；justHit 后一击即回环绕（:32909-32912，267 knockBackResist 0.8）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const brain = Enemy.fromVanilla(266, 100 * TILE, 100 * TILE)!;
    const c = Enemy.fromVanilla(267, 110 * TILE, 100 * TILE)!;
    c.master = brain;
    c.ai0 = 1; c.vx = 3; c.vy = 0;                    // 扑咬态、朝玩家直飞中
    creeperAI(c, game, fakePlayer(130 * TILE, 100 * TILE));
    expect(c.ai0).toBe(1);                            // !justHit → 保持直飞
    expect(c.vx).toBe(3);
    c.justHitT = 2;                                   // 原版 justHit 单帧旗标
    creeperAI(c, game, fakePlayer(130 * TILE, 100 * TILE));
    expect(c.ai0).toBe(0);                            // knockBackResist 0.8 ≠ 0 → 立即回环绕
  });
});

// ===========================================================================
// 3. 饥饿者 justHit（NPC.cs:26299-26301）
// ===========================================================================
describe('A4-3 饥饿者 justHit（NPC.cs:26299-26301）', () => {
  it('受击（justHit）→ ai[1]=10 脱落倒计时，随后逐 tick 递减', () => {
    const w = emptyWorld();
    const game = makeGame(emptyWorld());
    const head = Enemy.fromVanilla(113, 100 * TILE, 150 * TILE)!;
    const hungry = Enemy.fromVanilla(115, 100 * TILE, 140 * TILE)!;
    head.id = 1; hungry.id = 2;
    hungry.ai3 = head.id;                             // 锚定槽（文件头说明 2）
    hungry.ai0 = 0.5;
    hungry.bInit = true;
    (game.enemies() as unknown[]).push(head, hungry);
    hungryAI(hungry, game, fakePlayer(120 * TILE, 140 * TILE));
    expect(hungry.ai1).toBe(0);                       // 未受击：保持挂墙
    hungry.justHitT = 2;                              // hurt() 置位的原版 justHit
    hungryAI(hungry, game, fakePlayer(120 * TILE, 140 * TILE));
    // :26301 置 10 后，同 tick 的 ai[1]>0 分支（:26451-26453）立即 -1 → 9
    expect(hungry.ai1).toBe(9);
    hungry.justHitT = 1;                              // fixedUpdate 每 tick -1（次 tick 仍 justHit）
    hungryAI(hungry, game, fakePlayer(120 * TILE, 140 * TILE));
    expect(hungry.ai1).toBe(9);                       // 再置 10 → 同 tick 又 -1
    hungry.justHitT = 0;                              // 第三 tick 旗标耗尽
    hungryAI(hungry, game, fakePlayer(120 * TILE, 140 * TILE));
    expect(hungry.ai1).toBe(8);                       // 纯脱落倒计时递减
    void w;
  });
});

// ===========================================================================
// 4. 毁灭者 135 段激光真值概率（NPC.cs:50204-50241）
// ===========================================================================
describe('A4-4 毁灭者激光概率公式（NPC.cs:50206-50241）', () => {
  it('计数器未爬过 1400 前零发射（阈值下界 Next(1400,26000)）：600t 内 0 发且 lai0 单调累积', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(w, list, projectiles);
    const head = Enemy.fromVanilla(134, 100 * TILE, 100 * TILE)!;
    list.push(head);
    const p = fakePlayer(105 * TILE, 100 * TILE);
    destroyerAI(head, game, p);                       // 首帧建链
    const segs = (list as Enemy[]).filter((n) => n.vanillaId === 135);
    // 原版 :51339 GetDestroyerSegmentsCount=80（FTW 100），建链循环 j<=80（:50212-
    // 50225）→ 80×135 + 尾 136；2026-08-13 bossAI.ts 由 79 修正为 80，同步此断言
    expect(segs.length).toBe(80);
    for (let t = 0; t < 600; t++) destroyerAI(head, game, p);
    expect(projectiles.length).toBe(0);               // lai0 < 1400 → 阈值永不可达
    expect(segs.every((s) => s.lai0 > 0)).toBe(true); // localAI[0] += Next(4) 累积
  });

  it('长期运行会发射：弹型 100、伤害 22（GetAttackDamage_ForProjectiles 经典档）、timeLeft 300', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(w, list, projectiles);
    const head = Enemy.fromVanilla(134, 100 * TILE, 100 * TILE)!;
    list.push(head);
    const p = fakePlayer(105 * TILE, 100 * TILE);
    destroyerAI(head, game, p);
    for (let t = 0; t < 4000 && projectiles.length === 0; t++) destroyerAI(head, game, p);
    expect(projectiles.length).toBeGreaterThan(0);
    const proj = projectiles[0] as { projId: number; damage: number; life: number };
    expect(proj.projId).toBe(100);                    // :50224
    expect(proj.damage).toBe(22);                     // :50223 Remap(Classic→22)
    expect(proj.life).toBe(300);                      // :50235
  });
});

// ===========================================================================
// 4b. 毁灭者出生链门淡入（AI_037 :50162-50182）
//     头恒过 / 段须前段 alpha<128（沿链传播，128 非 85）→ 无条件 -42 钳 0
// ===========================================================================
describe('A4-4b 毁灭者链门淡入（NPC.cs:50162-50182）', () => {
  it('fromVanilla：134-136 保持原版 255 初值且不置通用 alphaFade（AI_037 接管）', () => {
    for (const id of [134, 135, 136]) {
      const e = Enemy.fromVanilla(id, 0, 0)!;
      expect(e.spawnAlpha).toBe(255);        // SetDefaults alpha 原值
      expect(e.alphaFade).toBe(false);       // 通用 -1/t 近似对毁灭者已退役
    }
  });
  it('头无条件 -42/t；段等前段 <128 才启动（链式传播）→ 40t 全链现身', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const head = Enemy.fromVanilla(134, 100 * TILE, 100 * TILE)!;
    list.push(head);
    const p = fakePlayer(105 * TILE, 100 * TILE);
    destroyerAI(head, game, p);                        // 首帧：建链 + 头第一步
    const seg1 = head.wormNext!, seg2 = seg1.wormNext!;
    expect(head.spawnAlpha).toBe(213);                 // 255-42（头恒过）
    expect(seg1.spawnAlpha).toBe(255);                 // 头 213 ≥ 128 → 门未开
    destroyerAI(head, game, p);
    destroyerAI(head, game, p);
    destroyerAI(head, game, p);                        // 第 4 tick：头 129→87 < 128
    expect(head.spawnAlpha).toBe(87);
    expect(seg1.spawnAlpha).toBe(213);                 // 本 tick seg1 门开 → 一步
    expect(seg2.spawnAlpha).toBe(255);                 // seg1 213 ≥ 128 → seg2 仍等
    for (let t = 0; t < 40; t++) destroyerAI(head, game, p);
    expect(head.spawnAlpha).toBe(0);                   // -42 钳 0（255→0 共 7 tick）
    expect(seg1.spawnAlpha).toBe(0);
    expect(seg2.spawnAlpha).toBe(0);
    destroyerAI(head, game, p);                        // 已现身：恒 0 不回退
    expect(head.spawnAlpha).toBe(0);
    expect(seg1.spawnAlpha).toBe(0);
  });
});

// ===========================================================================
// 5. 猪鲨爆裂泡泡 371（StrikeNPC cs:82102-82107 / aiStyle 70 :35180-35194）
// ===========================================================================
describe('A4-5 爆裂泡泡 371 受击即爆（cs:82102-82107）', () => {
  it('受击不扣血（num=0），直接转爆炸态 ai0=1/ai1=4 + 不可再受击', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const b = Enemy.fromVanilla(371, 100 * TILE, 100 * TILE)!;
    const hp0 = b.hp;
    expect(b.hurt(500, 0, 0, game)).toBe(true);       // 受击成立但不掉血
    expect(b.hp).toBe(hp0);
    expect(b.ai0).toBe(1);
    expect(b.ai1).toBe(4);
    expect(b.hurt(500, 0, 0, game)).toBe(false);      // 爆炸窗口不可再受击（dontTakeDamage）
  });

  it('爆炸态体积扩到 100×100（:35187-35193），4t 后消散', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const b = Enemy.fromVanilla(371, 100 * TILE, 100 * TILE)!;
    list.push(b);
    const p = fakePlayer(105 * TILE, 100 * TILE);
    dukeBubbleAI(b, game, p);                         // 初始化漂移
    expect(b.ai0).toBe(0);
    b.ai0 = 1; b.ai1 = 4;                             // StrikeNPC 转爆炸态
    dukeBubbleAI(b, game, p);
    expect(b.w).toBe(100);
    expect(b.h).toBe(100);
    expect(b.dead).toBe(false);
    dukeBubbleAI(b, game, p);
    dukeBubbleAI(b, game, p);
    dukeBubbleAI(b, game, p);
    dukeBubbleAI(b, game, p);                         // ai1 4→0
    expect(b.dead).toBe(true);
    void w;
  });
});

// ===========================================================================
// 6. 灯笼 demonTorch 调制（TileLightScanner.cs:2638-2652）
// ===========================================================================
describe('A4-6 灯笼 style 7/9 demonTorch 三角波调制（cs:2638-2652）', () => {
  const flicker = new FlickerClock();
  it('style 7（demonTorch 0 → (0.9,0.9,0.7)；1 → (0.7,0.7,0.9)）', () => {
    flicker.demonTorch = 0;
    expect(specialTileLight(42, 0, 7 * 36, flicker)).toEqual([0.9, 0.9, 0.7]);
    flicker.demonTorch = 1;
    const c = specialTileLight(42, 0, 7 * 36, flicker)!;
    expect(c[0]).toBeCloseTo(0.7, 10);
    expect(c[1]).toBeCloseTo(0.7, 10);
    expect(c[2]).toBeCloseTo(0.9, 10);
  });
  it('style 9（demonTorch 0 → (1,0.3,0.5)；1 → (0.9,0.1,0.7)）', () => {
    flicker.demonTorch = 0;
    expect(specialTileLight(42, 0, 9 * 36, flicker)).toEqual([1, 0.3, 0.5]);
    flicker.demonTorch = 1;
    const c = specialTileLight(42, 0, 9 * 36, flicker)!;
    expect(c[0]).toBeCloseTo(0.9, 10);
    expect(c[1]).toBeCloseTo(0.1, 10);
    expect(c[2]).toBeCloseTo(0.7, 10);
  });
  it('静态样式不受调制（style 0 恒 (0.7,0.65,0.55)）', () => {
    flicker.demonTorch = 1;
    expect(specialTileLight(42, 0, 0, flicker)).toEqual([0.7, 0.65, 0.55]);
  });
});

// ===========================================================================
// 7. 风气球 AI_113 direction/num3（NPC.cs:48253-48430）
// ===========================================================================
describe('A4-7 风气球 AI_113（NPC.cs:48253-48430）', () => {
  type BalloonAI = { windyBalloonAI(g: GameHooks, p: Player | null): void };
  const callBalloon = (e: Enemy, game: GameHooks, p: Player | null) =>
    (e as unknown as BalloonAI).windyBalloonAI(game, p);

  it('无玩家时 direction 保持原值（SetTargetTrackingValues :78559-78567），不顺风翻转', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    (game.world as unknown as { weather: { windSpeedTarget: number } }).weather.windSpeedTarget = -1;
    const balloon = Enemy.fromVanilla(594, 100 * TILE, 100 * TILE)!;
    list.push(balloon);
    callBalloon(balloon, game, null);                 // 首帧挂史莱姆
    expect(balloon.facing).toBe(1);                   // 缺省 direction=1
    for (let t = 0; t < 300; t++) callBalloon(balloon, game, null);
    expect(balloon.vx).toBeGreaterThan(0);            // 旧实现会随风取 -1
  });

  it('num3（目标高于本体底边的格数）加深前方探测：深度 30 格的实心块触发近距上浮', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    (game.world as unknown as { weather: { windSpeedTarget: number } }).weather.windSpeedTarget = 0;
    const balloon = Enemy.fromVanilla(594, 100 * TILE, 60 * TILE)!;
    list.push(balloon);
    callBalloon(balloon, game, null);                 // 首帧挂史莱姆（缺省 20×20）
    // 目标在右上：num2>400（走探测支），zx 与 direction 同号 → num3 = 高差/16
    const p = fakePlayer(103 * TILE, 10 * TILE);      // 右 3 格、上 50 格
    // 底边下方第 30 格放一块实心：旧深度 8 看不到，新深度 8+num3(≈50) 看得到
    // 探测列 num6 = floor((x + w/2)/16) + direction = 本体中心列 +1（cs:48344）
    const by = Math.floor((balloon.y + balloon.h) / TILE);
    w.store.setTileSilent(101, by + 30, 1);
    callBalloon(balloon, game, p);
    expect(balloon.facing).toBe(1);
    for (let t = 0; t < 40; t++) callBalloon(balloon, game, p);
    expect(balloon.vy).toBeLessThan(0);               // flag2 近距 → 上浮（:48396-48399）
  });

  it('路由回归：Enemy.fixedUpdate 必须把 aiStyle 113 分发到 windyBalloonAI（NPC.AI 按 aiStyle 分发无 critter 门）', () => {
    // 2026-08-13 线上报障：594 只画"灰色吊起史莱姆"无气球——case 113 只登记在
    // critterWanderAI（vanilla.critter 门后），而 594 json 无 critter 字段 → 落入
    // default zombieAI 在地上走，aiInit 恒 false → ai2=0（帧 0=灰壳）且无 slave。
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    (game.world as unknown as { weather: { windSpeedTarget: number } }).weather.windSpeedTarget = 0;
    const balloon = Enemy.fromVanilla(594, 100 * TILE, 60 * TILE)!;
    expect(balloon.vanilla?.critter).toBeFalsy();     // 594 不走 critter 门（原版事实）
    list.push(balloon);
    balloon.fixedUpdate(1, game);                     // 端到端：路由 → 初始化 → 挂载
    expect(balloon.aiInit).toBe(true);                // AI_113 init 已跑（localAI[0]==0 分支）
    expect(balloon.ai2).toBeGreaterThanOrEqual(1);    // ai[2] = Next(7)+1 ∈ 1..7
    expect(balloon.ai2).toBeLessThanOrEqual(7);
    const slave = (list as Enemy[]).find((n) => n !== balloon && n.vanillaId === 1);
    expect(slave).toBeTruthy();                       // 挂载史莱姆已入表
    expect(slave!.ai0).toBe(-999);                    // 冻结标记（:48274）
    expect(balloon.ai3).toBe(slave!.id);              // ai[3] = slave whoAmI（:48276）
    expect(balloon.vanillaScale).toBeCloseTo(slave!.vanillaScale, 5); // ai[1] = slave scale
    // 下一帧 slave 被装进吊篮：Center = 本体底边 + (0,-8+56*scale)（:48414）
    balloon.fixedUpdate(1, game);
    const cy = balloon.y + balloon.h - 8 + 56 * (balloon.vanillaScale ?? 1);
    expect(slave!.y + slave!.h / 2).toBeCloseTo(cy, 1);
  });

  it('路由回归：aiStyle 119 蒲公英 628 也必须走主 switch（同 594 双门坑），喷籽产生 836 弹', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(w, list, projectiles);
    (game.world as unknown as {
      weather: { windSpeedTarget: number; windSpeedCurrent: number; shouldUseWindyDayMusic: boolean };
    }).weather = { windSpeedTarget: 0.8, windSpeedCurrent: 0.8, shouldUseWindyDayMusic: true };
    const dande = Enemy.fromVanilla(628, 100 * TILE, 60 * TILE)!;
    expect(dande.vanilla?.critter).toBeFalsy();
    list.push(dande);
    const p = fakePlayer(110 * TILE, 60 * TILE);          // 玩家在下风右侧 160px 内
    (game as unknown as { player: Player }).player = p;
    dande.fixedUpdate(1, game);
    expect(dande.ai0).toBe(1);                            // 喷籽态（zombieAI 路由则恒 -1120）
    for (let t = 0; t < 40; t++) dande.fixedUpdate(1, game); // ai1==40 出籽（:43291-43308）
    expect(projectiles.length).toBeGreaterThanOrEqual(1); // Dart 836 蒲公英籽
    expect((projectiles[0] as { vanillaProj?: number }).vanillaProj ?? 836).toBeTruthy();
  });

  it('AI_126 雕像宝箱怪 690：伪装不可击+样式随机 → 96px 唤醒解除 → 地面立即跳', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const mimic = Enemy.fromVanilla(690, 100 * TILE, 60 * TILE)!;
    expect(mimic.dontTakeDamage).toBe(true);              // SetDefaults :17615 immortal+dontTakeDamage
    list.push(mimic);
    // 玩家远：伪装态恒续命、样式随机 [0,82]\[43,49]
    (game as unknown as { player: Player }).player = fakePlayer(160 * TILE, 60 * TILE);
    mimic.fixedUpdate(1, game);
    expect(mimic.ai0).toBe(0);
    expect(mimic.ai1).toBeGreaterThanOrEqual(0);
    expect(mimic.ai1).toBeLessThanOrEqual(82);
    expect(mimic.dontTakeDamage).toBe(true);
    expect(mimic.despawnTimer).toBe(750);                 // timeLeft=60 续命等价
    // 玩家近 96px 内有视线：唤醒 + Scare + 解除不可击（:43780-43788/:43873）
    (game as unknown as { player: Player }).player = fakePlayer(100.5 * TILE, 60 * TILE);
    mimic.fixedUpdate(1, game);
    expect(mimic.ai0).toBe(1);
    expect(mimic.dontTakeDamage).toBe(false);
    // 激活态首落地立即跳（ai2=0 → --<=0 → jump；vy=-9.01-lift，
    // lift=(本体Bottom-玩家Bottom)/40 钳 0..10——需本体低于玩家脚底才 >0）
    mimic.vy = 0; mimic.y = 63 * TILE;                    // 底(1046) 低于玩家底(981) → lift≈1.6
    const y0 = mimic.y;
    mimic.fixedUpdate(1, game);
    expect(mimic.vy).toBeLessThan(-9.01);                 // 起跳且带 lift 加成
    expect(mimic.y).toBeLessThan(y0);                     // 穿墙直接位移（noTileCollide）
    // 节奏：ai2 重置 20，后续落地计数到 0 前不再跳
    expect(mimic.ai2).toBe(20);
  });

  it('AI_117 恐惧鹦鹉螺 618：出场渐显 50t → 悬停 60t → 血弹齐射(814)→ 回悬停 ai3+1', () => {
    const w = emptyWorld();
    w.clock.timeOfDay = 0;                                 // 深夜
    w.clock.bloodMoon = true;                              // 血月（目标有效门）
    const list: unknown[] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(w, list, projectiles);
    const boss = Enemy.fromVanilla(618, 100 * TILE, 60 * TILE)!;
    list.push(boss);
    (game as unknown as { player: Player }).player = fakePlayer(120 * TILE, 60 * TILE);
    // 出场（:47502-47509）：ai0=-1 + spawnAlpha=255 + 首帧 ai2=direction（朝玩家=+1）
    boss.fixedUpdate(1, game);
    expect(boss.ai0).toBe(-1);
    expect(boss.spawnAlpha).toBe(255);
    expect(boss.ai2).toBe(2);                             // direction(+1) + 首帧自增
    // ai2 ≥ 50 退出：首帧后 ai2=2，第 49 tick 到 50 → 总计 49 tick
    for (let t = 0; t < 47; t++) boss.fixedUpdate(1, game);
    expect(boss.ai0).toBe(-1);
    boss.fixedUpdate(1, game);
    expect(boss.ai0).toBe(0);                             // 悬停态
    expect(boss.spawnAlpha).toBe(0);                      // 渐显结束
    // 悬停 60t（ai1>60）→ ai3=0 偶数 → 血弹齐射态 2（:47624-47633）
    for (let t = 0; t < 62; t++) boss.fixedUpdate(1, game);
    expect(boss.ai0).toBe(2);
    expect(boss.ai3).toBe(1);                             // 非 0 态迁移 ai3+1
    // 蓄力 90t 无弹（ai1 0→89）→ 第 90t（ai1==90）首脉冲出 814 血弹 5-10 发
    for (let t = 0; t < 89; t++) boss.fixedUpdate(1, game);
    expect(projectiles.length).toBe(0);
    boss.fixedUpdate(1, game);
    expect(projectiles.length).toBeGreaterThanOrEqual(5);
    expect(projectiles.length).toBeLessThanOrEqual(10);
    expect((projectiles[0] as { projId: number }).projId).toBe(814);
    // 齐射段 ai1 到 180 回悬停（90t 后 ai3=2 → 下轮 %2==0 仍齐射、%7==3 时召唤）
    for (let t = 0; t < 90; t++) boss.fixedUpdate(1, game);
    expect(boss.ai0).toBe(0);
  });
});

// ===========================================================================
// 8. 星光斗篷/蜂巢反击/幸运币（Player.cs:37826-37907 / :43892-43916）
// ===========================================================================
describe('A4-8 反击配饰纯函数（Player.cs:37826-37907 / :43892-43916）', () => {
  it('starCloakStarInfo：无 override 件 → 726；862→725 / 1247→724 / 4001→723（后者优先;★V6 勘误 vid：929=炮弹/982=魔力再生带非斗篷,真身 StarVeil=862/ManaCloak=4001）', () => {
    expect(starCloakStarInfo([], true)).toEqual({ active: true, projType: 726 });
    expect(starCloakStarInfo([862], false)).toEqual({ active: true, projType: 725 });
    expect(starCloakStarInfo([1247], false)).toEqual({ active: true, projType: 724 });
    expect(starCloakStarInfo([4001], false)).toEqual({ active: true, projType: 723 });
    // 优先级 manaCloak(723) > beeCloak(724) > starVeil(725)（:37848-37863 后判覆盖）
    expect(starCloakStarInfo([862, 1247, 4001], false).projType).toBe(723);
    expect(starCloakStarInfo([862, 1247], false).projType).toBe(724);
    expect(starCloakStarInfo([], false).active).toBe(false);
  });

  it('beeRetaliateRoll：数量 = 1 + 1/3 + 1/3 (+HivePack 1/3)；基伤 13/18', () => {
    expect(beeRetaliateRoll(false, () => 0.9)).toEqual({ count: 1, base: 13 });
    expect(beeRetaliateRoll(false, () => 0.0)).toEqual({ count: 3, base: 13 });
    expect(beeRetaliateRoll(true, () => 0.0)).toEqual({ count: 4, base: 18 });
    expect(beeRetaliateRoll(true, () => 0.9)).toEqual({ count: 1, base: 18 });
  });

  it('luckyCoinRoll：币种 71/72/73 顺序覆盖、stack=Next(1,11)、速度按原版公式', () => {
    // 脚本化 rnd 队列：0(银命中) 1(金未中) 0.5(stack=6) 0(vx=10*0.2) 0(vy=-20*0.2)
    const q = [0, 1, 0.5, 0, 0];
    const r = luckyCoinRoll(() => q.shift() ?? 0.5, 1);
    expect(r.key).toMatch(/72|vi_72|silver/i);        // Next(10)==0 → 银币 72
    expect(r.stack).toBe(6);                          // 1+floor(0.5*10)=6
    expect(r.vx).toBeCloseTo(2.0, 5);                 // (10+0)*0.2*direction(1)
    expect(r.vy).toBeCloseTo(-4.0, 5);                // (0-20)*0.2
    // 全高值：铜币、stack=10、vx=(10+20)*0.2=6、vy=(20-20)*0.2=0
    const r2 = luckyCoinRoll(() => 0.99, -1);
    expect(r2.stack).toBe(10);
    expect(r2.vx).toBeCloseTo(-6.0, 5);
    expect(r2.vy).toBeCloseTo(0, 5);
  });
});
