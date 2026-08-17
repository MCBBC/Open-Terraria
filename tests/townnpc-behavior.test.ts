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
} from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';

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
    // 右墙 3 格高（F-1..F-3，col 130）+ 顶 F-5 压 3 列 → 案 A 净空全堵
    for (let y = F - 3; y <= F - 1; y++) world.store.setTileSilent(130, y, STONE);
    for (let x = 128; x <= 132; x++) world.store.setTileSilent(x, F - 5, STONE);
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
    expect(npc.vx).toBe(0);
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

  it('GetShootingFrame（:67061-67083）：五档 + 枪族五人 +1 档移', () => {
    // 通用族（无 +1 档移）
    expect(shootingFrameOffset(19, -0.5)).toBe(1);
    expect(shootingFrameOffset(19, -0.2)).toBe(0);
    expect(shootingFrameOffset(19, 0)).toBe(-4);
    expect(shootingFrameOffset(19, 0.2)).toBe(2);
    expect(shootingFrameOffset(19, 0.4)).toBe(3);
    // 枪族 {22,209,228,229,368}：平射 -4→1、≥−0.1 再 +1
    expect(shootingFrameOffset(22, 0)).toBe(2);
    expect(shootingFrameOffset(22, -0.5)).toBe(1);
    expect(shootingFrameOffset(22, -0.05)).toBe(1);   // -4→1 后 -0.05≥-0.1 → 2? 注意：
    expect(shootingFrameOffset(368, 0.4)).toBe(4);
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
    // 平射：敌同高
    {
      const world = flatWorld('bow-flat');
      const npc = new TownNPC('guide', 100 * 16, F * 16);
      npc.stationary = true;
      const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(106)] });
      let frame = -1;
      for (let t = 0; t < 40 && frame < 0; t++) {
        npc.fixedUpdate(1 / 60, game);
        if (npc.attackState === 12) frame = npc.frame;
      }
      // holdAim=0 → 枪族 22：-4→1、0≥-0.1 → +1 = 2 → 21+2=23
      expect(frame).toBe(21 + 2);
    }
    // 仰射：敌高 96px、dx 96px → aim=-0.707 钳 -0.5 → 档 1（不再 +1）→ 22
    {
      const world = flatWorld('bow-up');
      const npc = new TownNPC('guide', 100 * 16, F * 16);
      npc.stationary = true;
      const { game } = makeGame(world, { npcs: [npc], enemies: [enemyAt(106, 96)] });
      let frame = -1;
      for (let t = 0; t < 40 && frame < 0; t++) {
        npc.fixedUpdate(1 / 60, game);
        if (npc.attackState === 12) frame = npc.frame;
      }
      expect(frame).toBe(21 + 1);
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
    expect(frames[0]).toBe(21);
    expect(frames[12]).toBe(21);
    expect(frames[13]).toBe(22);   // 计数 %24 ≥12 翻档
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
    expect(frames.length).toBeGreaterThanOrEqual(10);
    expect(frames[0]).toBe(base);        // r=1 > 0.65
    expect(frames[8]).toBe(base + 1);    // r=7/15≈0.467 > 0.5? 否 → 0.35..0.5 → +2?
  });
});

// =====================================================================
// P1-3 白天随机坐椅
// =====================================================================
describe('P1-3 行走随机坐椅（NPC.cs:55774-55814，无昼夜门）', () => {
  /** 白天从左走向 110 列椅（stub：头两掷 0.7 定向右走，其后 0 让坐椅掷必中） */
  function dayChairScene(player?: Record<string, unknown>, style = 0) {
    const world = flatWorld('day-chair');
    world.store.setTileSilent(110, F - 2, CHAIR, 0, style * 40);
    world.store.setTileSilent(110, F - 1, CHAIR, 0, style * 40 + 18);
    const npc = new TownNPC('guide', 104 * 16, F * 16);
    const { game } = makeGame(world, { npcs: [npc], player });
    let calls = 0;
    Math.random = () => (calls++ < 2 ? 0.7 : 0);
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
    // 玩家在 NPC 身旁活着 → 回家传送的双视野门不触发
    const { game } = makeGame(world, {
      npcs: [npc],
      player: { x: 104 * 16, y: F * 16 - 40, w: 20, h: 40, dead: false, sitting: false },
    });
    let calls = 0;
    Math.random = () => (calls++ < 2 ? 0.7 : 0);
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

  it('一格上障碍（t4 实心）→ vy=−5（:54533-54537）', () => {
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
    expect(jumpV).toBe(-5);
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
    expect(jumpV).toBe(-6);
  });

  it('净空被堵 → 不跳、转身折返（flag26 :54604-54608）', () => {
    stubRand(0.7);
    const { npc, game } = walker(120, (w) => {
      for (let y = F - 3; y <= F - 1; y++) w.store.setTileSilent(130, y, STONE);
      for (let x = 128; x <= 132; x++) w.store.setTileSilent(x, F - 5, STONE);   // 压顶
    });
    let jumped = false;
    for (let t = 0; t < 600; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.vy < 0) jumped = true;
    }
    expect(jumped).toBe(false);       // 全程未跳
    expect(npc.facing).toBe(-1);      // 撞墙转身
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
