// 城镇 NPC 四项行为对齐回归（2026-08-17 批）：
//  P0-1 危险逃离（NPC.cs:53864-53990 扫描 / :53990-54024 背向逃 / :54319-54326
//       逃速 1.5+失血×0.9 / :54597-54603+54682-54690 被逼停 ai[0]==8 冻结站定仍还击
//       / :55621 flag31 的 (flag16||flag18) 门 + PrettySafe 收口 :53998-54002）
//  P0-2 坐姿/攻击帧（FindFrame :69320 num58 = frames−AttackFrameCount；坐 :69638-69644
//       帧 num58−3；近战 10 四档 :69765-69786；挥击 15 比例四档 :69787-69802；
//       弓 12 = num58+GetShootingFrame(ai[2]) :69827/表 :67061；魔法 14 交替 :69832-69847）
//  P1-3 白天随机坐椅（:55774-55814：行走态 rand(300)==0 → 脚下格（Bottom−2px）
//       椅 15/马桶 497 + 占位门；原版无昼夜门——夜间走回家的同样触发）
//  P1-7 越障三档跳 + 卡墙折返（:54514-54611 两格上 −6/一格上 −5/半格 −4.4 +
//       净空失败转身 flag26 / 逃命中冻结 flag27；StepUp 无位移 10t 折返 :54409-54422）
import { describe, it, expect, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot } from '../src/entities/TownShot';
import {
  TOWN_ATTACK_FRAME_COUNT, townNpcBaseFrame, shootingFrameOffset,
  WALK_SPEED, walkPrediction,
} from '../src/entities/TownNPC';
import { emoteCount } from '../src/render/EmoteBubble';
import { TILE_BY_KEY } from '../src/data/tiles';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';
import { GRAVITY } from '../src/core/constants';

const DIRT = TILE_BY_KEY['dirt']!;
const STONE = TILE_BY_KEY['stone']!;
const CHAIR = TILE_BY_KEY['chair']!;
const F = 100;              // 地面行（实心）

/** 敌 mock：damage>0 即算威胁（friendly NPC 不会出现在 enemies 桶） */
function enemyAt(col: number, dy = 0, dmg = 40) {
  return { x: col * 16, y: F * 16 - 40 - dy, w: 20, h: 40, dead: false, damage: dmg, hurt: () => true };
}

function makeGame(world: World, extra: Partial<{
  enemies: unknown[]; npcs: unknown[];
  player: Record<string, unknown>;
  vanillaDust: unknown;
}> = {}) {
  const shots: TownShot[] = [];
  const game = {
    world,
    player: extra.player ?? { x: -9999, y: -9999, w: 0, h: 0, dead: true, sitting: false },
    enemies: () => extra.enemies ?? [],
    npcs: () => extra.npcs ?? [],
    critters: () => [],
    spawnTownShot: (s: TownShot) => shots.push(s),
    spawnParticles: () => {},
    spawnBurst: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    addDamageNumber: () => {},
    achievements: { notifyProgressionEvent: () => {} },
    vanillaDust: extra.vanillaDust,
  } as never;
  return { game, shots };
}

/** 平地世界（20..180 列实心地面行 F）+ 白天 */
function flatWorld(label = 'flee-test') {
  const world = new World(200, 200, 100, label);
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, F, DIRT);
  world.clock.timeOfDay = 0.5;   // 正午
  return world;
}

const realRandom = Math.random;
/** 掷骰接管：v=0.7 → 攻击 1/60 与坐椅 1/300 掷全不中、白天游走恒 facing=1 向右；
 *  v=0 → 全命中（攻击触发门/坐椅掷）；v=0.999 → 同 0.7 但更保守 */
function stubRand(v: number) { Math.random = () => v; }
afterEach(() => { Math.random = realRandom; });

// =====================================================================
// P0-1 危险逃离
// =====================================================================
describe('P0-1 危险逃离（NPC.cs:53864-54024/:54319-54326/:54597-54603）', () => {
  it('敌在右 96px（< PrettySafe 200）→ 背向左逃 + 提速越 0.8 常帽（满血帽=0.8×1.5=1.2）', () => {
    stubRand(0.999);   // 不触发攻击（隔离纯逃跑）
    const world = flatWorld();
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.stationary = true;    // 隔离白天游走——移动只能来自逃离
    const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(106)] });
    const x0 = npc.cx;
    let minVx = 0;
    for (let t = 0; t < 200; t++) {
      npc.fixedUpdate(1 / 60, game);
      minVx = Math.min(minVx, npc.vx);
    }
    expect(npc.cx).toBeLessThan(x0 - 5 * 16);   // 200t 向左 ≥5 格
    expect(minVx).toBeLessThanOrEqual(-1.1);    // 常走帽 0.8 装不下——逃速提档生效
  });

  it('敌在左 → 向右逃（侧选 num15 :53960-53963）', () => {
    stubRand(0.999);
    const world = flatWorld();
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.stationary = true;
    const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(94)] });
    const x0 = npc.cx;
    for (let t = 0; t < 120; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.cx).toBeGreaterThan(x0 + 2 * 16);
  });

  it('失血提档：半血 → 帽 0.8×(1.5+0.45)=1.56（:54319-54326 num24 比例）', () => {
    stubRand(0.999);
    const world = flatWorld();
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.stationary = true;
    npc.hp = Math.floor(npc.maxHp / 2);
    const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(106)] });
    let minVx = 0;
    for (let t = 0; t < 200; t++) {
      npc.fixedUpdate(1 / 60, game);
      minVx = Math.min(minVx, npc.vx);
    }
    expect(minVx).toBeLessThanOrEqual(-1.5);
  });

  it('PrettySafe 收口（:53998-54002）：向导敌距 320px > 200 → 不逃也不还击', () => {
    stubRand(0);      // 攻击掷骰恒命中——若门失守必触发
    const world = flatWorld();
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.stationary = true;
    const { game, shots } = makeGame(world, { npcs: [npc], enemies: [enemyAt(120)] });
    const x0 = npc.cx;
    for (let t = 0; t < 300; t++) npc.fixedUpdate(1 / 60, game);
    expect(Math.abs(npc.cx - x0)).toBeLessThan(1);   // 不逃
    expect(npc.attackState).toBe(0);                 // flag31 的 flag16 门同源关闭
    expect(shots).toHaveLength(0);
  });

  it('近距敌 + 掷骰命中 → 逃命中仍还击（flag31 不设 flee 门）', () => {
    stubRand(0);
    const world = flatWorld();
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.stationary = true;
    const { game, shots } = makeGame(world, { npcs: [npc], enemies: [enemyAt(106)] });
    for (let t = 0; t < 60; t++) npc.fixedUpdate(1 / 60, game);
    expect(shots.length).toBeGreaterThan(0);   // 木箭已出手
  });

  it('被逼停（flag27 :54597-54603）：逃向前方跳不过 → ai[0]==8 冻结 240t、vx=0、仍可还击', () => {
    const world = flatWorld();
    // 右墙 3 格高（F-1..F-3，col 122）+ 顶 F-5 压 3 列 → 案 A 净空全堵；
    // 墙距起位 6 格——撞墙时敌距 ~184px < PrettySafe 200，危险持续在
    for (let y = F - 3; y <= F - 1; y++) world.store.setTileSilent(122, y, STONE);
    for (let x = 120; x <= 124; x++) world.store.setTileSilent(x, F - 5, STONE);
    const npc = new TownNPC('guide', 116 * 16, F * 16);
    npc.stationary = true;
    const foe = enemyAt(110);   // 左侧 96px → 向右逃进墙
    const { game, shots } = makeGame(world, { npcs: [npc], enemies: [foe] });
    stubRand(0.999);            // 先纯逃（不攻击）
    let corneredAt = -1;
    for (let t = 0; t < 900 && corneredAt < 0; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.cornered) corneredAt = t;
    }
    expect(corneredAt).toBeGreaterThanOrEqual(0);   // 撞墙跳不过 → 冻结
    expect(Math.abs(npc.vx)).toBe(0);               // 冻结 vx=0（转身翻转产生 −0）
    // 冻结中危险未消 → :54686-54690 在险续冻（<60 续 180，永不自行解冻）
    for (let t = 0; t < 400; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.cornered).toBe(true);
    // 站定仍可还击（flag31 含 ai[0]==8，:55621）——换掷骰 0 让触发门必中
    stubRand(0);
    for (let t = 0; t < 90 && shots.length === 0; t++) npc.fixedUpdate(1 / 60, game);
    expect(shots.length).toBeGreaterThan(0);
    // 危险消除 → 冻结倒计时走完恢复常态（:54682-54710）
    foe.dead = true;
    stubRand(0.999);
    for (let t = 0; t < 300 && npc.cornered; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.cornered).toBe(false);
  });
});

// =====================================================================
// P0-2 坐姿/攻击帧
// =====================================================================
describe('P0-2 帧带基准（FindFrame :69320 num58 族）', () => {
  it('AttackFrameCount 表关键值（NPCID.cs:4833）+ num58/坐姿帧推导', () => {
    expect(TOWN_ATTACK_FRAME_COUNT[22]).toBe(5);    // 向导
    expect(TOWN_ATTACK_FRAME_COUNT[18]).toBe(4);    // 护士
    expect(TOWN_ATTACK_FRAME_COUNT[108]).toBe(2);   // 巫师
    expect(TOWN_ATTACK_FRAME_COUNT[207]).toBe(4);   // 染料商
    expect(TOWN_ATTACK_FRAME_COUNT[209]).toBe(5);   // 电子人
    // 向导 frames 26（vanilla-npcs.json = Main.npcFrameCount）→ num58=21、坐姿帧 18
    expect(VANILLA_NPCS['22']!.frames).toBe(26);
    expect(townNpcBaseFrame(22, 26)).toBe(21);
  });

  it('GetShootingFrame（:67061-67083）：顺序 if 链（<-0.3 的 1 档被 <-0.1 的 0 档覆写=原版死分支）+ 枪族 +1 档移', () => {
    // 通用族（无 +1 档移）：< -0.1 → 0（含深仰射——-0.3 档恒被覆盖）
    expect(shootingFrameOffset(19, -0.5)).toBe(0);
    expect(shootingFrameOffset(19, -0.2)).toBe(0);
    expect(shootingFrameOffset(19, 0)).toBe(-4);
    expect(shootingFrameOffset(19, 0.2)).toBe(2);
    expect(shootingFrameOffset(19, 0.4)).toBe(3);
    // 枪族 {22,209,228,229,368}：平射 -4→1、≥−0.1 再 +1
    expect(shootingFrameOffset(22, 0)).toBe(2);
    expect(shootingFrameOffset(22, -0.05)).toBe(2);   // ≥−0.1：-4→1 后再 +1
    expect(shootingFrameOffset(22, -0.5)).toBe(0);    // <−0.1 档 0，不吃 +1
    expect(shootingFrameOffset(368, 0.4)).toBe(4);    // 3 → +1
  });

  it('坐姿帧 = num58−3（:69638-69644）：向导夜间入座 → 帧 18', () => {
    const world = flatWorld('sit-frame');
    world.clock.timeOfDay = 0;    // 夜
    world.store.setTileSilent(110, F - 2, CHAIR, 0, 0);
    world.store.setTileSilent(110, F - 1, CHAIR, 0, 18);
    const npc = new TownNPC('guide', 110 * 16 + 8 - 10, F * 16);
    npc.home = { x: 110, y: F - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 180 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    expect(npc.frame).toBe(26 - 5 - 3);   // 18——修复前坐姿落帧 0
  });

  it('近战态 10 四档（:69765-69786）：护士 windup 10t 帧 0 → 19/20/21/22 各 6t', () => {
    stubRand(0);
    const world = flatWorld();
    const npc = new TownNPC('nurse', 100 * 16, F * 16);
    npc.stationary = true;
    const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(106)] });
    const frames: number[] = [];
    let t0 = -1;
    for (let t = 0; t < 80 && frames.length < 34; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.attackState === 10) {
        if (t0 < 0) t0 = t;
        frames.push(npc.frame);
      }
    }
    expect(t0).toBeGreaterThanOrEqual(0);
    const base = townNpcBaseFrame(18, VANILLA_NPCS['18']!.frames);   // 23−4=19
    expect(frames[0]).toBe(0);          // windup
    expect(frames[10]).toBe(base);
    expect(frames[16]).toBe(base + 1);
    expect(frames[22]).toBe(base + 2);
    expect(frames[28]).toBe(base + 3);
  });

  it('弓态 12 = num58+GetShootingFrame(ai[2])（:69827）：向导平射帧 23 / 仰射帧 22', () => {
    stubRand(0);
    // 平射：敌同高（帧取态内第 2t——发射档 :55191 已写 ai[2]=0）
    {
      const world = flatWorld('bow-flat');
      const npc = new TownNPC('guide', 100 * 16, F * 16);
      npc.stationary = true;
      const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(106)] });
      const frames: number[] = [];
      for (let t = 0; t < 40; t++) {
        npc.fixedUpdate(1 / 60, game);
        if (npc.attackState === 12) frames.push(npc.frame);
      }
      expect(frames[0]).toBe(21 + 2);   // holdAim=0：-4→1、0≥-0.1 → +1
      expect(frames[1]).toBe(21 + 2);   // 发射档写入 aim 0 同档
    }
    // 仰射：敌高 96px、dx 96px → aim 钳 -0.5 → <−0.1 档 0（-0.3 的 1 档被覆写）
    {
      const world = flatWorld('bow-up');
      const npc = new TownNPC('guide', 100 * 16, F * 16);
      npc.stationary = true;
      const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(106, 96)] });
      const frames: number[] = [];
      for (let t = 0; t < 40; t++) {
        npc.fixedUpdate(1 / 60, game);
        if (npc.attackState === 12) frames.push(npc.frame);
      }
      expect(frames[0]).toBe(21 + 2);   // 入态 ai[2]=0（:54931 清零）→ 平射档
      expect(frames[1]).toBe(21 + 0);   // 发射档 aim=-0.5 → <−0.1 档 0
    }
  });

  it('魔法态 14 每 12t 交替 num58/num58+1（:69832-69847）：巫师 21/22', () => {
    stubRand(0);
    const world = flatWorld();
    const npc = new TownNPC('wizard', 100 * 16, F * 16);
    npc.stationary = true;
    const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(104)] });
    const frames: number[] = [];
    for (let t = 0; t < 40; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.attackState === 14) frames.push(npc.frame);
    }
    expect(frames.length).toBeGreaterThan(13);
    expect(frames[0]).toBe(21);         // 态内计数 0
    expect(frames[11]).toBe(21);        // 计数 11 仍在下档
    expect(frames[12]).toBe(22);        // 计数 %24 ≥12 翻档
  });

  it('挥击态 15 按 ai[1]/AttackTime 比例四档（:69787-69802）：染料商 15t 内 21→22→23→24', () => {
    stubRand(0);
    const world = flatWorld();
    const npc = new TownNPC('dyer', 100 * 16, F * 16);
    npc.stationary = true;
    // 染料商 DangerDetectRange=60 → 敌须 <60px（3 格 = 48px）
    const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(103)] });
    const frames: number[] = [];
    let t0 = -1;
    for (let t = 0; t < 60; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.attackState === 15) {
        if (t0 < 0) t0 = t;
        frames.push(npc.frame);
      }
    }
    expect(t0).toBeGreaterThanOrEqual(0);
    const base = townNpcBaseFrame(207, VANILLA_NPCS['207']!.frames);   // 25−4=21
    expect(frames.length).toBeGreaterThanOrEqual(12);
    expect(frames[0]).toBe(base);        // r = 15/15 = 1 > 0.65
    expect(frames[6]).toBe(base + 1);    // r = 9/15 = 0.6 ∈ (0.5,0.65]
    expect(frames[8]).toBe(base + 2);    // r = 7/15 ≈ 0.467 ∈ (0.35,0.5]
    expect(frames[11]).toBe(base + 3);   // r = 4/15 ≈ 0.267 ∈ (0,0.35]
  });
});

// =====================================================================
// P1-3 白天随机坐椅
// =====================================================================
describe('P1-3 行走随机坐椅（NPC.cs:55774-55814，无昼夜门）', () => {
  /** 白天从左走向 110 列椅（起点 108 列）。rng 序列注入（2026-08-17 游走双态批）：
   *  走态每 tick 恰 3 掷（站定态社交掷全被 walkMode 短路）= ①看家具 1/600
   *  ②拴绳转身 1/80 ③随机坐椅 1/300——循环 [0.9, 0.9, 0]：家具/拴绳恒不中、
   *  坐椅恒中（踩上椅格即坐）。setWalking(3000) 钉死走态防相位漂移 */
  function dayChairScene(player?: Record<string, unknown>, style = 0) {
    const world = flatWorld('day-chair');
    world.store.setTileSilent(110, F - 2, CHAIR, 0, style * 40);
    world.store.setTileSilent(110, F - 1, CHAIR, 0, style * 40 + 18);
    const npc = new TownNPC('guide', 108 * 16, F * 16);
    npc.setWalking(3000);
    const { game } = makeGame(world, { npcs: [npc], player });
    const seq = [0.9, 0.9, 0];
    let i = 0;
    npc.rng = () => seq[i++ % 3];
    return { world, npc, game };
  }

  it('白天行走踩上椅子列 → 坐下（锚/朝向/时长同夜路径；修复前白天恒不坐）', () => {
    const { npc, game } = dayChairScene();
    for (let t = 0; t < 600 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    expect(npc.facing).toBe(-1);                 // frameX=0 → 朝左（:55809）
    expect(npc.cx).toBe(110 * 16 + 6);           // Bottom.X = x*16+8+2*dir（:55810）
    expect(npc.y + npc.h).toBe(F * 16);          // Bottom.Y = y*16+16
    expect(npc.frame).toBe(18);                  // 坐姿帧（同 P0-2）
  });

  it('夜间走回家路过椅子同样触发（原版无昼夜门）', () => {
    const world = flatWorld('night-chair');
    world.clock.timeOfDay = 0;    // 夜
    world.store.setTileSilent(110, F - 2, CHAIR, 0, 0);
    world.store.setTileSilent(110, F - 1, CHAIR, 0, 18);
    const npc = new TownNPC('guide', 104 * 16, F * 16);
    npc.home = { x: 140, y: F - 1 };   // home 在右 → 向右走
    // 玩家在 NPC 身旁活着 → 回家传送的双视野门不触发；夜归不掷游走骰——
    // 恒 0 让坐椅掷必中
    const { game } = makeGame(world, {
      npcs: [npc],
      player: { x: 104 * 16, y: F * 16 - 40, w: 20, h: 40, dead: false, sitting: false },
    });
    Math.random = () => 0;
    for (let t = 0; t < 600 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);   // 中途坐上 110 列椅
    expect(npc.cx).toBe(110 * 16 + 6);
  });

  it('玩家坐着占位 → 不坐、走过去（:55791-55799 Center 同格门）', () => {
    const { npc, game } = dayChairScene({
      x: 110 * 16 - 8, y: (F - 1) * 16 - 10, w: 16, h: 40, dead: false, sitting: true,
    });
    for (let t = 0; t < 900; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(false);
    expect(npc.cx).toBeGreaterThan(112 * 16);   // 已走过椅子
  });

  it('style 27 椅（frameY 1080/1098）排除（:55805-55807）', () => {
    const { npc, game } = dayChairScene(undefined, 27);
    for (let t = 0; t < 900; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(false);
    expect(npc.cx).toBeGreaterThan(112 * 16);
  });
});

// =====================================================================
// P1-7 越障三档跳 + 卡墙折返
// =====================================================================
describe('P1-7 越障三档跳 + 转身/逼停/卡墙折返（NPC.cs:54514-54611/:54409-54422）', () => {
  /** 白天无 home 向右走（stub 0.7：facing 恒 1、坐椅/攻击掷不中） */
  function walker(col: number, wall: (world: World) => void, label = 'jump-test') {
    const world = flatWorld(label);
    wall(world);
    const npc = new TownNPC('guide', col * 16, F * 16);
    const { game } = makeGame(world, { npcs: [npc] });
    return { npc, game };
  }

  it('一格上障碍（t4 实心）→ vy=−5（:54533-54537；观测值含当 tick 重力 +GRAVITY）', () => {
    stubRand(0.7);
    const { npc, game } = walker(120, (w) => {
      w.store.setTileSilent(130, F - 1, STONE);
      w.store.setTileSilent(130, F - 2, STONE);
    });
    let jumpV = 0;
    for (let t = 0; t < 900 && jumpV === 0; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.vy < 0) jumpV = npc.vy;
    }
    expect(jumpV).toBe(-5 + GRAVITY);
  });

  it('两格上障碍（t5+t4 实心，矮身门）→ vy=−6（:54522-54526）', () => {
    stubRand(0.7);
    const { npc, game } = walker(120, (w) => {
      for (let y = F - 3; y <= F - 1; y++) w.store.setTileSilent(130, y, STONE);
    });
    let jumpV = 0;
    for (let t = 0; t < 900 && jumpV === 0; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.vy < 0) jumpV = npc.vy;
    }
    expect(jumpV).toBe(-6 + GRAVITY);
  });

  it('净空被堵 → 不跳、转身折返（flag26 :54604-54608）', () => {
    stubRand(0.7);
    const { npc, game } = walker(120, (w) => {
      for (let y = F - 3; y <= F - 1; y++) w.store.setTileSilent(130, y, STONE);
      for (let x = 128; x <= 132; x++) w.store.setTileSilent(x, F - 5, STONE);   // 压顶
    });
    let jumped = false, turned = false;
    for (let t = 0; t < 600; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.vy < 0) jumped = true;
      if (npc.facing === -1) turned = true;
    }
    expect(jumped).toBe(false);       // 全程未跳
    expect(turned).toBe(true);        // 撞墙转身
  });

  it('StepUp 无位移卡墙 10t → 强制折返（:54409-54422）', () => {
    stubRand(0.7);
    // 1 格台阶（F-1）+ 其上 2 格留空 + F-3 悬浮盖板：三档跳全不命中、StepUp 头顶净空被堵
    const { npc, game } = walker(120, (w) => {
      w.store.setTileSilent(130, F - 1, STONE);
      w.store.setTileSilent(130, F - 3, STONE);
    });
    let flipped = false;
    for (let t = 0; t < 600 && !flipped; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.facing === -1) flipped = true;
    }
    expect(flipped).toBe(true);       // 卡住 ≥10t 后转身
  });
});

// =====================================================================
// P1-1/P1-4 游走双态+拴绳常量（NPC.cs:54032-54288）+ 雨天白天回家（:54056-54091）
// =====================================================================
describe('P1-1 游走双态+拴绳（NPC.cs:54135-54288）', () => {
  /** 走态钉死 + 全掷不中（序列 [0.9]：社交/拴绳/坐椅恒不中） */
  function walker(col: number, label = 'walk-parity') {
    const world = flatWorld(label);
    const npc = new TownNPC('guide', col * 16, F * 16);
    npc.setWalking(3000);
    const { game } = makeGame(world, { npcs: [npc] });
    npc.rng = () => 0.9;
    return { world, npc, game };
  }

  it('雨天白天也走回家（:54056-54091 sitFlag 门；修复前白天恒自由游走不回家）', () => {
    const world = flatWorld('rain-home');
    world.weather.raining = true;                 // 白天雨天
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.home = { x: 130, y: F - 1 };
    const { game } = makeGame(world, {
      npcs: [npc],
      // 活玩家在 NPC 旁 → 双矩形视野门命中 → 不传送，只能走回去
      player: { x: 100 * 16, y: F * 16 - 40, w: 20, h: 40, dead: false, sitting: false },
    });
    npc.rng = () => 0.9;   // 拴绳/坐椅掷不中（sitFlag 屏蔽拴绳）
    for (let t = 0; t < 800; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.cx).toBeGreaterThanOrEqual(128 * 16);   // 800t 内走完 30 格
  });

  it('走速上限 1.0 / 加速 0.07（:54280-54281 常态档）', () => {
    const { npc, game } = walker(100);
    let maxVx = 0;
    for (let t = 0; t < 200; t++) {
      npc.fixedUpdate(1 / 60, game);
      maxVx = Math.max(maxVx, npc.vx);
    }
    expect(maxVx).toBeCloseTo(WALK_SPEED, 1);    // 稳态贴帽 1.0
  });

  it('拴绳 ±50 强制折返（:54177-54187）：离锚 51 格朝外走 → 折返朝锚', () => {
    const { npc, game } = walker(100);
    for (let t = 0; t < 3; t++) npc.fixedUpdate(1 / 60, game);   // 落地锚定 col≈100
    npc.x = 152 * 16;                                            // 推到锚+52 格
    npc.facing = 1;                                              // 朝外
    npc.setWalking(3000);
    for (let t = 0; t < 2; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.facing).toBe(-1);                 // 强制折返
  });

  it('走程下限 200t（:54146 ai[1]=200+Next(300)）：走态 200t 内不转停态', () => {
    const { npc, game } = walker(100);
    let stillWalking = true;
    for (let t = 0; t < 200; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (!npc.walking) { stillWalking = false; break; }
    }
    expect(stillWalking).toBe(true);
  });
});

// =====================================================================
// P1-2 悬崖/坑洞避让（GetWalkPrediction :56093-56165 + 停走 :54444-54467）
// =====================================================================
describe('P1-2 悬崖避让（NPC.cs:56093-56165/:54444-54467）', () => {
  it('keepwalking 三路（:56098-56117）：起步贴 AvoidedByNPCs 块 / 挤站定友方 / 溺水', () => {
    const world = flatWorld('keepwalk');
    const st = world.store;
    const CHEST = TILE_BY_KEY['chest']!;
    // ①② 起步期（walkT<30）贴 AvoidedByNPCs 块或前方站定友方（调用方合算
    //    crowdedOrBlocked 传入：宝箱 sheet 21 ∈ 集合，plotAvoidClear 反相为 true）
    st.setTileSilent(101, F - 2, CHEST);
    expect(walkPrediction(st, 100, 100, false, 1, 101, F - 1, 42,
      true, false, true).keepwalking).toBe(true);
    // ③ 溺水恒续走（无视起步门）
    expect(walkPrediction(st, 100, 100, false, 1, 120, F - 1, 42,
      false, true, false).keepwalking).toBe(true);
    // ④ 常态起步（无贴块无挤人）不续走
    st.setTileSilent(101, F - 2, 0);
    expect(walkPrediction(st, 100, 100, false, 1, 101, F - 1, 42,
      true, false, false).keepwalking).toBe(false);
  });

  it('keepwalking 消费（:54609-54613）：起步贴宝箱 → 走程重置 90t（25t 走程走出 80t+）', () => {
    const mkNpc = (chest: boolean) => {
      const world = flatWorld(chest ? 'keepwalk2' : 'keepwalk2b');
      if (chest) world.store.setTileSilent(101, F - 2, TILE_BY_KEY['chest']!);
      const npc = new TownNPC('guide', 100 * 16, F * 16);
      npc.setWalking(25);                             // 起步期（<30）
      const { game } = makeGame(world, { npcs: [npc] });
      npc.rng = () => 0.9;
      let walkTicks = 0;
      for (let t = 0; t < 200; t++) {
        npc.fixedUpdate(1 / 60, game);
        if (npc.walking) walkTicks++;
      }
      return walkTicks;
    };
    const withChest = mkNpc(true), noChest = mkNpc(false);
    // 重置后走程 90t：贴宝箱组 ≥80t 走；对照组 25t 走程 + 站定起身掷（0.9 不中
    // avoidFalling 门为起身……起身掷不消费 rng——起身直接走态 200+rand300）——
    // 对照组首停后立即起身（站定 ai[1] 初始 60 递减），窗口内也会再走——只断
    // 贴宝箱组显著更长
    expect(withChest).toBeGreaterThanOrEqual(80);
    expect(withChest - noChest).toBeGreaterThanOrEqual(30);
  });

  it('walkPrediction：悬空列避 / 实心落点放行 / 岩浆避 / 深水没身避 / 远处赶路豁免', () => {
    // 悬崖世界（20..119 地面；120 列 F 行起全空）
    const world = new World(200, 200, 100, 'pred');
    for (let x = 20; x <= 119; x++) world.store.setTileSilent(x, F, DIRT);
    const st = world.store;
    // ① 悬空 → avoidFalling
    expect(walkPrediction(st, 100, 100, false, 1, 120, F - 1, 42).avoidFalling).toBe(true);
    // ② 前方列有实心落点 → 放行
    expect(walkPrediction(st, 100, 100, false, 1, 110, F - 1, 42).avoidFalling).toBe(false);
    // ③ 岩浆（liquidType 2）→ 恒避
    st.setLiquid(120, F - 1, 255, 2);
    expect(walkPrediction(st, 100, 100, false, 1, 120, F - 1, 42).avoidFalling).toBe(true);
    st.setLiquid(120, F - 1, 0, 1);
    // ④ 深水没身（3 格 = ceil(42/16)）→ 避（120 列 F−1/F/F+1 三格水无实心）；
    // 浅水 1 格 + 实心落点（110 列）→ 放行
    for (let j = 0; j < 3; j++) st.setLiquid(120, F - 1 + j, 255, 1);
    expect(walkPrediction(st, 100, 100, false, 1, 120, F - 1, 42).avoidFalling).toBe(true);
    st.setLiquid(110, F - 1, 255, 1);
    expect(walkPrediction(st, 100, 100, false, 1, 110, F - 1, 42).avoidFalling).toBe(false);
    // ⑤ 豁免（:56120-56123）：不在 home±35 且正朝 home 走 → 悬空列也不避（远处赶路跳坑）
    expect(walkPrediction(st, 80, 200, false, 1, 120, F - 1, 42).avoidFalling).toBe(false);
    // ⑥ 城镇宠物恒不避（TownCritter）
    expect(walkPrediction(st, 100, 100, true, 1, 120, F - 1, 42).avoidFalling).toBe(false);
  });

  it('走到悬崖口：停走/转身、永不下坠（:54444-54467 停走 + :54575-54579 转身）', () => {
    const world = new World(200, 200, 100, 'cliff');
    for (let x = 20; x <= 119; x++) world.store.setTileSilent(x, F, DIRT);   // 120 起断崖
    world.clock.timeOfDay = 0.5;
    const npc = new TownNPC('guide', 116 * 16, F * 16);
    npc.setWalking(3000);
    const { game } = makeGame(world, { npcs: [npc] });
    npc.rng = () => 0.9;
    let fell = false;
    for (let t = 0; t < 600; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.cx >= 120 * 16 || npc.y > F * 16 + 8) { fell = true; break; }   // 越缘/下坠
    }
    expect(fell).toBe(false);
    expect(npc.cx).toBeLessThan(120 * 16);
  });
});

// =====================================================================
// P1-3' 回家传送矩形视野门（:53830-53856）+ 落位失败置无家（:56087-56090）
// =====================================================================
describe('P1-3\' 回家传送（NPC.cs:53828-53856/:56063-56090）', () => {
  it('夜间远玩家（两矩形均不含玩家）→ 静默传回家（2044×1278 矩形门）', () => {
    const world = flatWorld('tp-home');
    world.clock.timeOfDay = 0;    // 夜
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.home = { x: 130, y: F - 1 };
    const { game } = makeGame(world, { npcs: [npc] });   // 玩家 dead → 矩形门开
    npc.rng = () => 0.9;
    npc.fixedUpdate(1 / 60, game);
    expect(Math.abs(npc.cx - (130 * 16 + 8))).toBeLessThanOrEqual(16);   // 三列内落位
  });

  it('玩家在 NPC 屏幕矩形内 → 不传送（走回去，不瞬移）', () => {
    const world = flatWorld('tp-near');
    world.clock.timeOfDay = 0;
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.home = { x: 130, y: F - 1 };
    const { game } = makeGame(world, {
      npcs: [npc],
      player: { x: 100 * 16, y: F * 16 - 40, w: 20, h: 40, dead: false, sitting: false },
    });
    npc.rng = () => 0.9;
    for (let t = 0; t < 10; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.cx).toBeLessThan(102 * 16);   // 10t 只走了 <2 格——没瞬移
  });

  it('home 三列头顶全堵 → 落位失败置无家（:56087-56090 home+QuickFindHome 等价）', () => {
    const world = flatWorld('tp-blocked');
    world.clock.timeOfDay = 0;
    for (let x = 128; x <= 132; x++) {
      for (let y = F - 5; y <= F - 1; y++) world.store.setTileSilent(x, y, STONE);
    }
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.home = { x: 130, y: F - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    npc.rng = () => 0.9;
    npc.fixedUpdate(1 / 60, game);
    expect(npc.home).toBeNull();    // homeless=true → Game 入驻轮接管重找房
  });
});

// =====================================================================
// P1-5 社交掷骰（NPC.cs:55630-55835 掷骰 / :54660-54748 推进 / 表情帧）
// =====================================================================
describe('P1-5 社交掷骰（NPC.cs:55630-55835）', () => {
  /** 双 NPC 场景：相距 dist px、双方落地站定后接 rng 序列 */
  function pair(dist = 60) {
    const world = flatWorld('social');
    const a = new TownNPC('guide', 100 * 16, F * 16);
    const b = new TownNPC('nurse', Math.round(100 * 16 + dist), F * 16);
    const { game } = makeGame(world, { npcs: [a, b] });
    const tick = () => { a.fixedUpdate(1 / 60, game); b.fixedUpdate(1 / 60, game); };
    return { world, a, b, game, tick };
  }

  it('结对聊天 1/300（:55630-55673）：发起 3/应答 4、时长 420×(1..3)、互指', () => {
    const { a, b, tick } = pair();
    a.rng = () => 0; b.rng = () => 0.9;   // A 掷中（B 不掷——A 先 tick 抢发起）
    for (let t = 0; t < 6; t++) tick();
    expect(a.socialKind).toBe(3);
    expect(b.socialKind).toBe(4);
    expect(a.facing).toBe(1);            // A 左 B 右 → A 朝右
    expect(b.facing).toBe(-1);
    // 420t（最短档）后双双退场回站定（恒 0 掷会立即再发起——退场即停循环，
    // 再换 0.9 验证态已清）
    let ended = false;
    for (let t = 0; t < 420 && !ended; t++) {
      tick();
      ended = a.socialKind === 0;
    }
    expect(ended).toBe(true);
    a.rng = () => 0.9; b.rng = () => 0.9;
    tick();
    expect(a.socialKind).toBe(0);
    expect(b.socialKind).toBe(0);
  });

  it('石头剪刀布 1/1800（:55675-55701）：发起 16/应答 17，掷表情 36/37/38 族', () => {
    const { a, b, tick } = pair();
    a.rng = () => 0.9; b.rng = () => 0.9;
    // A 站定掷序 = 聊天(300)/RPS(1800)/舞(1200)：[0.9, 0] 周期 2 → RPS 中
    let i = 0;
    a.rng = () => [0.9, 0][i++ % 2];
    for (let t = 0; t < 6; t++) tick();
    expect(a.socialKind).toBe(16);
    expect(b.socialKind).toBe(17);
    // 推进到 frameT=40 → 发起方掷表情对（NewBubble 36/37/38 族）
    const before = emoteCount();
    for (let t = 0; t < 50; t++) tick();
    expect(emoteCount()).toBeGreaterThanOrEqual(before + 2);   // A+B 各一泡
  });

  it('发呆 1/1800 → 45t（:55757-55762 ai[1]=45×Next(1,2)）', () => {
    const world = flatWorld('daze');
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    const { game } = makeGame(world, { npcs: [npc] });
    npc.rng = () => 0.9;
    for (let t = 0; t < 3; t++) npc.fixedUpdate(1 / 60, game);   // 落地
    let i = 0;
    npc.rng = () => [0.9, 0.9, 0.9, 0][i++ % 4];   // 聊天/RPS/舞不中 → 发呆中
    for (let t = 0; t < 3 && npc.socialKind !== 2; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.socialKind).toBe(2);
    for (let t = 0; t < 44; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.socialKind).toBe(2);    // 44t 仍在
    npc.fixedUpdate(1 / 60, game);
    expect(npc.socialKind).toBe(0);    // 45t 退场
  });

  it('面向玩家 1/1200 → 220t + tick16 冒 112 头像气泡（:55765-55788/:69697）', () => {
    const world = flatWorld('face');
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    const { game } = makeGame(world, {
      npcs: [npc],
      player: { x: 100 * 16 + 80, y: F * 16 - 40, w: 20, h: 40, dead: false, sitting: false },
    });
    npc.rng = () => 0.9;
    for (let t = 0; t < 3; t++) npc.fixedUpdate(1 / 60, game);
    let i = 0;
    npc.rng = () => [0.9, 0.9, 0.9, 0.9, 0][i++ % 5];   // 聊天/RPS/舞/发呆不中 → 看玩家中
    for (let t = 0; t < 3 && npc.socialKind !== 7; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.socialKind).toBe(7);
    expect(npc.facing).toBe(1);       // 玩家在右
    const before = emoteCount();
    for (let t = 0; t < 20; t++) npc.fixedUpdate(1 / 60, game);
    expect(emoteCount()).toBeGreaterThan(before);   // 112 头像泡已冒
  });

  it('驻足看家具 1/600（:55816-55835）：前方 10px 格 InteractableByNPCs（祭坛 sheet 26）', () => {
    const world = flatWorld('furn');
    // InteractableByNPCs 表（TileID.cs:375）不含 18 工作台——用表内 sheet 26 祭坛
    const ALTAR = TILE_BY_KEY['v_26_altars']!;
    world.store.setTileSilent(102, F - 2, ALTAR);   // 前方一格（中心行 F−2）
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.setWalking(3000);
    const { game } = makeGame(world, { npcs: [npc] });
    // 走态掷序 [家具, 拴绳, 坐椅]：家具恒中（前方格未到工作台列时无副作用）、
    // 拴绳/坐椅 0.9 不中——不触翻向/落座
    const seq = [0, 0.9, 0.9];
    let i = 0;
    npc.rng = () => seq[i++ % 3];
    for (let t = 0; t < 20 && npc.socialKind !== 9; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.socialKind).toBe(9);
  });
});

// =====================================================================
// P1-6 派对跳舞（NPC.cs:55704-55730 触发 + :69645-69700 舞帧+音符尘）
// =====================================================================
describe('P1-6 派对跳舞（NPC.cs:55704-55730/:69645-69700）', () => {
  function dancer(party: boolean, key = 'nurse') {
    const world = flatWorld(party ? 'party' : 'noparty');
    if (party) (world as { scene: unknown }).scene = { partyUp: true };
    const npc = new TownNPC(key, 100 * 16, F * 16);
    const dusts: number[] = [];
    const { game } = makeGame(world, {
      npcs: [npc],
      player: { x: 100 * 16 + 60, y: F * 16 - 40, w: 20, h: 40, dead: false, sitting: false },
      vanillaDust: { spawn: (_x: number, _y: number, _w: number, _h: number, type: number) => {
        dusts.push(type);
        return { vx: 0, vy: 0, x: 0, y: 0, scale: 1 };
      } },
    });
    return { world, npc, game, dusts };
  }

  it('派对中 AttackType==0 族（护士）+玩家 150px → 舞态 300t + 帧 −5/−4 交替', () => {
    const { npc, game, dusts } = dancer(true);
    npc.rng = () => 0.9;
    for (let t = 0; t < 3; t++) npc.fixedUpdate(1 / 60, game);
    let i = 0;
    npc.rng = () => [0.9, 0.9, 0][i++ % 3];   // 聊天/RPS 不中 → 舞掷中
    for (let t = 0; t < 3 && npc.socialKind !== 6; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.socialKind).toBe(6);
    const frames: number[] = [];
    for (let t = 0; t < 20; t++) {
      npc.fixedUpdate(1 / 60, game);
      frames.push(npc.frame);
    }
    const base = townNpcBaseFrame(18, VANILLA_NPCS['18']!.frames);   // 23−4=19
    expect(frames).toContain(base - 5);   // 10..16t 摊手
    expect(frames).toContain(base - 4);   // 16t 起舞
    // 音符尘（:69665-69678）：t=16 的 −5→−4 切换当帧 8 尘 139-143
    expect(dusts.length).toBeGreaterThanOrEqual(8);
    expect(dusts.every((d) => d >= 139 && d <= 142)).toBe(true);
  });

  it('非派对时派对女孩(208)仍可舞（type==208 无条件支 :55708）', () => {
    const { npc, game } = dancer(false, 'party_girl');
    npc.rng = () => 0.9;
    for (let t = 0; t < 3; t++) npc.fixedUpdate(1 / 60, game);
    let i = 0;
    npc.rng = () => [0.9, 0.9, 0][i++ % 3];
    for (let t = 0; t < 3 && npc.socialKind !== 6; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.socialKind).toBe(6);
  });
});

// =====================================================================
// P1-7' NPC 液体物理（NPC.cs:91940-91956 + npcLiquid 同 Enemy 侧）
// =====================================================================
describe('P1-7\' 液体物理（NPC.cs:91940-91956）', () => {
  it('入水：wet + liqFactor 0.5 + 落速帽 7（重力档 0.2）+ 溺水跳出上浮', () => {
    const world = flatWorld('pool');
    const st = world.store;
    for (let x = 110; x <= 114; x++) {
      for (let y = F - 3; y <= F - 1; y++) st.setTileSilent(x, y, 0);
      st.setLiquid(x, F - 3, 255, 1);
      st.setLiquid(x, F - 2, 255, 1);
      st.setLiquid(x, F - 1, 255, 1);
    }
    // ① 静置 NPC（stationary 不游走）：稳定湿态断 wet/liqFactor/落速帽/重力档
    const npc = new TownNPC('guide', 112 * 16, F * 16);
    npc.stationary = true;
    const { game } = makeGame(world, { npcs: [npc] });
    npc.rng = () => 0.9;
    for (let t = 0; t < 30; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.wet).toBe(true);
    expect(npc.liqFactor).toBe(0.5);        // waterMovementSpeed（NPC.cs:5946）
    expect(npc.vy).toBeLessThanOrEqual(7);  // maxFallSpeed=7（:91944）
    // ② 走动 NPC：溺水（没顶）→ 跳出上浮 −sqrt(depth×16+16)×2×0.3（:54408-54427）
    const swimmer = new TownNPC('nurse', 112 * 16, F * 16);
    swimmer.setWalking(3000);
    (game as { npcs?: () => unknown[] }).npcs = () => [npc, swimmer];
    swimmer.rng = () => 0.9;
    let sawJump = false;
    for (let t = 0; t < 300 && !sawJump; t++) {
      swimmer.fixedUpdate(1 / 60, game);
      if (swimmer.wet && swimmer.vy < -5) sawJump = true;
    }
    expect(sawJump).toBe(true);
  });
});

// =====================================================================
// P1-8 受击细节（StrikeNPC :82143-82241 + Boss 防御链 :53437-53534）
// =====================================================================
describe('P1-8 受击（NPC.cs:82143-82241/:53419-53534）', () => {
  it('无敌帧 10t（Projectile 侧 npc.immune=10 同档）', () => {
    const world = flatWorld('iframe');
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    const { game } = makeGame(world, { npcs: [npc] });
    npc.rng = () => 0.9;
    expect(npc.hurt(20, 0, 0, game)).toBe(true);
    expect(npc.hurt(20, 0, 0, game)).toBe(false);   // 无敌中
    for (let t = 0; t < 9; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.hurt(20, 0, 0, game)).toBe(false);   // iframes=1
    npc.fixedUpdate(1 / 60, game);
    expect(npc.hurt(20, 0, 0, game)).toBe(true);    // iframes=0
  });

  it('击退置换式（:82229-82238 常规门）：vx=kb×hitDir、vy=−kb×0.75', () => {
    const world = flatWorld('kb');
    const npc = new TownNPC('guide', 100 * 16, F * 16);
    npc.vx = 0.5;                       // 原值被置换（旧版为 += 叠加）
    const { game } = makeGame(world, { npcs: [npc] });
    npc.rng = () => 0.9;
    npc.hurt(20, 6, 0, game);           // 20×10=200 < 250 常规门
    expect(npc.vx).toBe(6);
    expect(npc.vy).toBe(-4.5);
  });

  it('Boss 防御链（:53437-53534）：史莱姆王 +2 / 硬模式 +12 从 world.flags 读', () => {
    const mk = (flags: Record<string, boolean>) => {
      const world = flatWorld('defchain');
      Object.assign(world.flags, flags);
      const npc = new TownNPC('guide', 100 * 16, F * 16);
      const { game } = makeGame(world, { npcs: [npc] });
      npc.rng = () => 0.9;
      return { npc, game };
    };
    const def0 = VANILLA_NPCS['22']!.defense;
    const a = mk({});                      // 基线 def0
    const hp0 = a.npc.hp;
    a.npc.hurt(61, 0, 0, a.game);
    expect(hp0 - a.npc.hp).toBe(Math.round(61 - def0 * 0.5));
    const b = mk({ downed_50: true, hardMode: true });   // def0+2+12
    const hp1 = b.npc.hp;
    b.npc.hurt(61, 0, 0, b.game);
    expect(hp1 - b.npc.hp).toBe(Math.round(61 - (def0 + 14) * 0.5));
  });
});
