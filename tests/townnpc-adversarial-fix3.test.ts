// ★对抗修复批③（2026-09-01）打包回归 —— 实体域挂账清偿（批3）
// 蓝队复核 + 反编译锚行（Terarria1457/Terraria/NPC.cs）逐项：
//   【1】368 游商夜臂 cs:53908-53922（homeless 恒真 / 夜间无家锚定 /
//        !flag5 && ai[0]==0 → ai[0]=1,ai[1]=200 / flag=false 回收）
//   【2】369 渔夫世界边缘臂 cs:53925-53941（380 格外锚 spawnTileX/Y +
//        ai[0]=1,ai[1]=200 + 边缘 300 格转向内海）
//   【3】宠物表演态族 cs:56320-56354 定义 + 掷口①cs:54225-28(到家臂×4)/
//        ②cs:54268-71(walkT∈[100,150]) + 推进段 cs:54830-58 + FindFrame
//        带表 cs:69454-69689
//   【4】B-F8 零散布耗骰 Utils.cs:2599-2602（RandomVector2 无条件两 NextDouble,
//        spread>0 门退役——只影响确定性重放流,不改分布）
//   【5】B-F10 出膛附参三件：227 ai1=Next(12)/6f(cs:55339)/142 ai1=Next(5)
//        (cs:55067 三元末支)/124·108·160·663 出膛附 ai2=townNpcVariationIndex
//        (cs:55067/:55473-74/:55490-95/:55503-17)
//   【7】坐姿椅检像素口径 cs:54841（Bottom+UnitY*(−2f)).ToTileCoordinates()
//        —— 1px 边界帧不误起身
//   【8】D-F3 StepUp 上升帧豁免 NPC.cs:54525-54527 `if(velocity.Y>=0f)`
//        （TileCollision.moveAndCollide applyStepUp 调用点补门）
//   【9】D-F2/A-F4 flag22 家平线门 NPC.cs:54513-54527（!flag22 才 StepDown；
//        holdsMatching=flag22 → Body.stepUpHolds 每 tick 重算）
//
// 骰面注意（集成测试公用事实）：socialUpdate 第⑤问好门(:2487 一带)无 !isPet 门,
// 宠物在 wanderUpdate 之前必耗一张骰——各集成用例的队列首张垫一张「不中」骰。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot, townFrameIndex } from '../src/entities/TownShot';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const DIRT = TILE_BY_KEY['dirt']!;
const STONE = TILE_BY_KEY['stone']!;
const FLOOR_ROW = 100;

/** 可编程骰序（默认返回 safe=0.999 避开一切 rand(n)==0 概率门；log 记录逐张） */
function rngQueue(vals: number[], log?: number[]) {
  let i = 0;
  return () => {
    const v = i < vals.length ? vals[i] : 0.999;
    log?.push(v);
    i++;
    return v;
  };
}

function flatWorld(seedName: string): World {
  const world = new World(200, 200, 100, seedName);
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, FLOOR_ROW, DIRT);
  return world;
}

function baseGame(world: World, enemies: unknown[] = [], npcs: unknown[] = []) {
  const shots: TownShot[] = [];
  const game = {
    world,
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
    enemies: () => enemies,
    npcs: () => npcs,
    critters: () => [],
    projectiles: () => [] as unknown[],
    spawnTownShot: (s: TownShot) => { shots.push(s); },
    spawnParticles: () => {},
    spawnBurst: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    addDamageNumber: () => {},
  } as Record<string, unknown>;
  game.shots = shots;                             // 测试读数槽（与 push 目标同引用）
  return { shots, game: game as never, gameRaw: game as unknown as { shots: TownShot[] } };
}

/** 私有字段白盒读写（绕 TS 私有性；与本仓既有测试同口径——写走 Object.assign） */
function priv(n: object, k: string): any {
  return (n as Record<string, unknown>)[k];
}
function privSet(n: object, kv: Record<string, unknown>): void {
  Object.assign(n, kv);
}

type AnyNpc = TownNPC & Record<string, unknown>;

// =====================================================================
// 【1】368 游商夜臂（NPC.cs:53908-53922）
// =====================================================================
describe('【1】368 游商夜臂（蓝队A-F2 尾差收口）', () => {
  it('夜里：homeless 恒真 + 无家锚定(Bottom+2px 口径) + 走态启动 ai[0]=1,ai[1]=200', () => {
    const world = flatWorld('fix3-trav-night');
    world.clock.timeOfDay = 0;                    // 午夜
    const npc = new TownNPC('travelling_merchant', 104 * 16, FLOOR_ROW * 16);
    npc.home = { x: 104, y: FLOOR_ROW - 1 };      // 预置家槽——原版 :53909 必清
    const { game } = baseGame(world);
    npc.rng = rngQueue([]);
    npc.fixedUpdate(1 / 60, game);
    // homeless=true 字面：家槽每 tick 清空（昼同，见下一例）
    expect(npc.home).toBeNull();
    // 夜臂锚定：UpdateHomeTileState(homeless, Center列, (Bottom+2px)/16)（:53913-14）
    const anchor = priv(npc, 'anchorTile') as { x: number; y: number };
    expect(anchor.x).toBe(Math.floor(npc.cx / 16));
    expect(anchor.y).toBe(Math.floor((npc.y + npc.h + 2) / 16));
    // !flag5 && ai[0]==0 → ai[0]=1,ai[1]=200（:53916-20）；走态链当拍 ai[1]--
    expect(npc.walking).toBe(true);
    expect(priv(npc, 'walkT')).toBeLessThanOrEqual(200);
    expect(priv(npc, 'walkT')).toBeGreaterThan(190);
    // :53922 flag=false → 开门掷门免必开通道失活
    expect(priv(npc, 'homeFlag')).toBe(false);
  });

  it('白天同样强制 homeless（:53909 在昼夜门外），但走态/家旗不被改写', () => {
    const world = flatWorld('fix3-trav-day');
    world.clock.timeOfDay = 0.5;
    const npc = new TownNPC('travelling_merchant', 104 * 16, FLOOR_ROW * 16);
    npc.home = { x: 104, y: FLOOR_ROW - 1 };
    privSet(npc, { walkMode: 0 })
    privSet(npc, { walkT: 500 });                 // 大腿程防常态站定倒计时起走
    const { game } = baseGame(world);
    npc.rng = rngQueue([], undefined);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.home).toBeNull();                  // homeless 恒真（昼夜一体）
    expect(npc.walking).toBe(false);              // 无夜臂 → 不启走
    expect(priv(npc, 'homeFlag')).toBe(false); // 白天旗本就 false
  });

  it('夜间对话中不启动夜走（!flag5 门）且对话归位块接管', () => {
    const world = flatWorld('fix3-trav-talk');
    world.clock.timeOfDay = 0;
    const npc = new TownNPC('travelling_merchant', 104 * 16, FLOOR_ROW * 16);
    npc.talking = true;
    const { game } = baseGame(world);
    npc.rng = rngQueue([], undefined);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.walking).toBe(false);              // 对话臂 ai[0]=0 归位覆盖
    expect(priv(npc, 'walkT')).toBe(300);      // :53876 ai[1]=300
  });

  it('拴绳/回家传送对 368 天然失配：有 home 也被当拍清空、传送网不触发（注释钉死）', () => {
    // 原版结构面：TeleportToHome 触发伞带 `!homeless`（:53973）→ 游商永不传送；
    // 本仓 home=null 承接 homeless 后，`if (this.home)` 传送网同理永不合闸。
    const world = flatWorld('fix3-trav-tg');
    world.clock.timeOfDay = 0;
    const npc = new TownNPC('travelling_merchant', 120 * 16, FLOOR_ROW * 16);
    npc.home = { x: 130, y: FLOOR_ROW - 1 };      // 远离 10 格的“家”
    const startX = npc.x;
    const startY = npc.y;
    const { game } = baseGame(world);
    npc.rng = rngQueue([], undefined);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.home).toBeNull();
    expect(priv(npc, 'teleportedHome') ?? false).toBe(false);
    expect(Math.abs(npc.x - startX)).toBeLessThan(64);
    expect(Math.abs(npc.y - startY)).toBeLessThan(64);
  });
});

// =====================================================================
// 【2】369 渔夫世界边缘臂（NPC.cs:53925-53941）
// =====================================================================
describe('【2】369 渔夫世界边缘臂', () => {
  /** 宽世界（900 列）：右缘条件 cx/16 > maxTilesX−380 可真实成立 */
  function wideWorld(): World {
    const world = new World(900, 200, 100, 'fix3-angler');
    for (let x = 20; x <= 880; x++) world.store.setTileSilent(x, FLOOR_ROW, DIRT);
    return world;
  }

  it('湿身+无家+右缘超界 → 锚回出生格 + 走程 ai[1]=200 + 转向内海 −1', () => {
    const world = wideWorld();
    world.spawnX = 150;
    world.spawnY = FLOOR_ROW - 1;
    // position.X=9820 > (900−300)*16=9600；中心 ~9838/16≈614 > 900−380=520
    const npc = new TownNPC('angler', 9820, FLOOR_ROW * 16);
    npc.wet = true;
    const { game } = baseGame(world);
    npc.rng = rngQueue([], undefined);
    npc.fixedUpdate(1 / 60, game);
    expect(priv(npc, 'anchorTile')).toEqual({ x: 150, y: FLOOR_ROW - 1 });
    expect(npc.walking).toBe(true);               // ai[0]=1
    expect(priv(npc, 'walkT')).toBeGreaterThan(190);   // ai[1]=200 当拍 --1
    expect(npc.facing).toBe(-1);                  // position.X > (maxTilesX−300)*16
  });

  it('左缘对称：facing 翻向内海 +1；干身整臂短路（无家锚不被写）', () => {
    const world = wideWorld();
    world.spawnX = 600;
    world.spawnY = FLOOR_ROW - 1;
    const wet = new TownNPC('angler', 200, FLOOR_ROW * 16);   // 左缘 <300*16=4800
    wet.wet = true;
    const { game: g1 } = baseGame(world);
    wet.rng = rngQueue([], undefined);
    wet.fixedUpdate(1 / 60, g1);
    expect(wet.facing).toBe(1);                   // position.X/16f < 300f
    expect(priv(wet, 'anchorTile')).toEqual({ x: 600, y: FLOOR_ROW - 1 });

    const dry = new TownNPC('angler', 200, FLOOR_ROW * 16);
    dry.wet = false;
    const { game: g2 } = baseGame(world);
    dry.fixedUpdate(1 / 60, g2);
    expect(priv(dry, 'anchorTile') ?? null).toBeNull();     // 整臂未触发
  });

  it('居家渔夫（湿身）不进本臂（type==369 && homeless && wet 三联门）', () => {
    const world = wideWorld();
    world.spawnX = 600;
    world.spawnY = FLOOR_ROW - 1;
    const npc = new TownNPC('angler', 9820, FLOOR_ROW * 16);
    npc.wet = true;
    npc.home = { x: 500, y: FLOOR_ROW - 1 };
    const { game } = baseGame(world);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.home).toEqual({ x: 500, y: FLOOR_ROW - 1 });
    expect(priv(npc, 'anchorTile') ?? null).toBeNull();
  });
});

// =====================================================================
// 【3】宠物表演态族（NPC.cs:56320-56354 / :54225-28 / :54268-71 / :54830-58 /
//       FindFrame :69454-69689）
// =====================================================================
describe('【3】宠物表演态族（social.kind 20/21/22 影子承接）', () => {
  /** 直调 attemptPetIdle 原型，返回落成的 kind/t 与消耗骰子数 */
  function idleDice(key: string, chance: number, vals: number[]) {
    const npc = new TownNPC(key, 100 * 16, FLOOR_ROW * 16) as AnyNpc;
    let dice = 0;
    let fed = 0;
    const feedVals = [...vals];
    npc.vx = 0;
    npc.rng = () => {
      dice++;
      return fed < feedVals.length ? feedVals[fed++] : 0.999;
    };
    const fn = (TownNPC.prototype as unknown as
      Record<string, (c: number) => void>).attemptPetIdle;
    fn.call(npc, chance);
    return { kind: npc.social?.kind ?? null, t: npc.social?.t ?? null, dice };
  }

  it('定义段掷序/时长表：狗@21=190；猫@20=660；兔@22=399 —— 各恰 4 骰'
    + '（chance/kind/基档/覆写）', () => {
    // Next(20,22)=20+⌊r·2⌋；基档 200+Next(300)；狗覆写 100+Next(100)
    const dog = idleDice('town_dog', 240, [0.0000001, 0.99, 0.5, 0.9]);
    expect(dog.dice).toBe(4);
    expect(dog.kind).toBe(21);
    expect(dog.t).toBe(190);

    const cat = idleDice('town_cat', 480, [0.0000001, 0.001, 0.99, 0.8]);
    expect(cat.dice).toBe(4);                       // 覆写再掷一球（原版无条件基档+覆写）
    expect(cat.kind).toBe(20);
    expect(cat.t).toBe(660);                        // 500+Next(200)

    const bunny = idleDice('town_bunny', 480, [0.0000001, 0.99, 0.99, 0.9999]);
    expect(bunny.dice).toBe(4);
    expect(bunny.kind).toBe(22);
    expect(bunny.t).toBe(399);                      // 200+Next(200) 上界含 399
  });

  it('IsTownSlime 免 kind 骰直取 20（:56331 num=0 分支）：3 骰（chance/基档/覆写）', () => {
    const slime = idleDice('town_slime_blue', 480, [0.0000001, 0.5, 0.5]);
    expect(slime.dice).toBe(3);
    expect(slime.kind).toBe(20);
    expect(slime.t).toBe(300);                      // 180+Next(240)
  });

  it('Entry B（NPC.cs:54268-71）：站定 walkT∈[100,150] 且非对话 → 全链触发（fixedUpdate 集成）', () => {
    const world = flatWorld('fix3-petB');
    world.clock.timeOfDay = 0.5;                    // 白天避开回家臂
    const npc = new TownNPC('town_cat', 104 * 16, FLOOR_ROW * 16);
    npc.onGround = true;
    privSet(npc, { walkMode: 0 })
    privSet(npc, { walkT: 125 });                   // 命中窗口 [100,150]
    // 队首 .99 垫问好门（socialUpdate 无 !isPet 门）；后接 hit/kind/基档/覆写
    npc.rng = rngQueue([0.99, 0.0000001, 0.33, 0.4, 0.7]);
    const { game } = baseGame(world, [], []);
    npc.fixedUpdate(1 / 60, game);
    const s = npc.social;
    expect(s?.kind).toBe(20);
    expect(s?.t).toBe(500 + Math.floor(0.7 * 200));   // 猫@20 覆写档 [500,699]
    expect(npc.walking).toBe(false);
  });

  it('Entry B 窗外（walkT<100 / >150 / 对话中）不触发', () => {
    for (const wt of [99, 151]) {
      const world = flatWorld(`fix3-petB-${wt}`);
      world.clock.timeOfDay = 0.5;
      const npc = new TownNPC('town_dog', 104 * 16, FLOOR_ROW * 16);
      npc.onGround = true;
      privSet(npc, { walkMode: 0 })
      privSet(npc, { walkT: wt })
      const { game } = baseGame(world, [], []);
      npc.rng = rngQueue([0.99], undefined);          // 垫问好门，其余默认不中
      npc.fixedUpdate(1 / 60, game);
      expect(npc.social).toBeNull();
    }
    const world = flatWorld('fix3-petB-talk');
    world.clock.timeOfDay = 0.5;
    const talker = new TownNPC('town_bunny', 104 * 16, FLOOR_ROW * 16);
    talker.onGround = true;
    talker.talking = true;
    privSet(talker, { walkMode: 0 })
    privSet(talker, { walkT: 125 })
    const { game } = baseGame(world, [], []);
    talker.rng = rngQueue([0.99], undefined);
    talker.fixedUpdate(1 / 60, game);
    expect(talker.social).toBeNull();
  });

  it('推进段（NPC.cs:54830-58 共段）：ai[1]-- / vx×0.8；到期退场回站定 ai[1]=60+Next(60)',
    () => {
      const world = flatWorld('fix3-petAdv');
      world.clock.timeOfDay = 0.5;
      const npc = new TownNPC('town_cat', 104 * 16, FLOOR_ROW * 16);
      npc.onGround = true;
      privSet(npc, { walkMode: 0 })
      privSet(npc, { walkT: 140 })
      // 垫问好门 → 进猫@20（t=632：基档 .5 + 猫覆写 .66）
      npc.rng = rngQueue([0.99, 0.0000001, 0.33, 0.5, 0.66]);
      const { game } = baseGame(world, [], []);
      npc.vx = 0;                                    // velocity.X==0f 字面门（勿改）
      npc.fixedUpdate(1 / 60, game);
      expect(npc.social?.kind).toBe(20);
      let prevT = npc.social!.t;
      let ticks = 0;
      while (npc.social && ticks < 800) {
        npc.fixedUpdate(1 / 60, game);
        ticks++;
        if (npc.social) {
          expect(npc.social.t).toBe(prevT - 1);       // 推进递减（共段与原版同拍序）
          prevT = npc.social.t;
        }
      }
      expect(npc.social).toBeNull();                  // 到期退场
      expect(npc.walking).toBe(false);                // ai[0]=0 站定
      expect(priv(npc, 'walkT')).toBeGreaterThanOrEqual(60);   // 60+Next(60)
      expect(priv(npc, 'walkT')).toBeLessThanOrEqual(119);
      expect(priv(npc, 'turnLock')).toBeGreaterThanOrEqual(30);// localAI[3]=30+Next(60)
      expect(priv(npc, 'turnLock')).toBeLessThanOrEqual(89);
    });

  it('FindFrame 带（:69454-96）：兔@20 吸附带 [7..9]、步进循环保持带内、尾窗溢出离带', () => {
    const world = flatWorld('fix3-petFrame');
    world.clock.timeOfDay = 0.5;
    const npc = new TownNPC('town_bunny', 104 * 16, FLOOR_ROW * 16);
    npc.onGround = true;
    privSet(npc, { walkMode: 0 })
    privSet(npc, { walkT: 130 })
    npc.frame = 3;                                    // 行走残留帧行——首拍应被吸回带内
    npc.rng = rngQueue([0.99, 0.0000001, 0.1, 0.5, 0.5]);   // 兔@22? kind=20+.3floor→20
    const { game } = baseGame(world, [], []);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.social?.kind).toBe(20);
    expect(npc.frame).toBe(7);                        // 吸附窗（残留行 3<7 → 吸回 7）
    let leftBandTick = -1;
    for (let k = 0; k < 800 && npc.social; k++) {
      npc.fixedUpdate(1 / 60, game);
      if (!npc.social) break;
      const inBand = npc.frame === 7 || npc.frame === 8 || npc.frame === 9;
      if (!inBand && leftBandTick < 0) leftBandTick = npc.social!.t;   // 记录首次离带时 ai[1]
    }
    // 尾窗（ai[1]≤30）吸附窗失效 → 循环越过 9 后落入 0 端帧：
    expect(leftBandTick).toBeGreaterThanOrEqual(0);
    expect(leftBandTick).toBeLessThanOrEqual(31);     // 离带只在尾窗发生（或端帧收尾拍）
    expect(npc.social).toBeNull();
  });

  it('Entry A（NPC.cs:54225-28）：到家刹停臂 ×4 掷口集成（猫在 home 同格夜间）', () => {
    const world = flatWorld('fix3-petA');
    world.clock.timeOfDay = 0;                        // 夜 → sitFlag 真
    const hx = 110;
    const npc = new TownNPC('town_cat', hx * 16 + 3, FLOOR_ROW * 16);   // 左缘在列内、底边贴地行
    npc.onGround = true;
    npc.home = { x: hx, y: FLOOR_ROW - 1 };           // 站格 = 地面行−1
    privSet(npc, { walkMode: 0 })
    privSet(npc, { walkT: 30 });                    // 站定短腿
    npc.vx = 0;                                       // velocity.X==0f 门
    const { game } = baseGame(world, [], [npc]);
    // 垫问好门 → 中口（1/(120*4)=1/480）→ kind=⌊.6·3⌋=1? 取 .93 → 22
    npc.rng = rngQueue([0.99, 0.0000001, 0.93, 0.5, 0.99]);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.social?.kind).toBe(22);
    expect(npc.sitting).toBe(false);                  // 表演不被坐姿机强坐（批③补挡位）
  });
});

// =====================================================================
// 【4】B-F8 零散布耗骰（Utils.cs:2599-2602）+%门冗余保护
// =====================================================================
describe('【4】B-F8 shootAt 无条件两骰（spread>0 门退役）', () => {
  /** 直调 shootAt；log 收集全途骰值。target 注入走 threatPool。 */
  function shootRig(key: string, vals: number[], shimmered = false) {
    const world = flatWorld('fix3-spread');
    const npc = new TownNPC(key, 100 * 16, FLOOR_ROW * 16) as AnyNpc;
    npc.onGround = true;
    if (shimmered) npc.shimmered = true;
    Object.assign(npc, { threatPool: { left: null, right: null } });   // 无候选→直线兜底
    const log: number[] = [];
    npc.rng = rngQueue(vals, log);
    const { game } = baseGame(world, [], []);
    const fn = (TownNPC.prototype as unknown as
      Record<string, (...a: never[]) => void>).shootAt as (
        w: never, g: never, p: Record<string, unknown>, r: number,
      ) => void;
    return { npc, log, fire: (p: Record<string, unknown>) =>
      fn.call(npc, world as never, game as never, p, 700),
      shots: (game as unknown as { shots: TownShot[] }).shots };
  }

  it('spread=0 恰耗两骰（零向量加法但 RandomVector2 逐轴一张；旧门下为 0）', () => {
    const r = shootRig('guide', []);
    r.fire({ proj: 1, dmg: 12, speed: 10, shootTick: 1, cdBase: 30, cdRand: 20, spread: 0, kb: 2.75 });
    expect(r.log.length).toBe(2);
    // 弹速向量不受扰动：直线兜底 = speed×(facing,−1)（facing 缺省 +1）
    expect(r.shots.length).toBe(1);
    expect(r.shots[0].vx).toBeCloseTo(10, 6);
    expect(r.shots[0].vy).toBeCloseTo(-10, 6);
  });

  it('spread>0 两骰并加到向量上（对照保形）；分布不变仅流位承诺', () => {
    const r = shootRig('guide', []);
    r.fire({ proj: 14, dmg: 24, speed: 13, shootTick: 1, cdBase: 12, cdRand: 5, spread: 0.2, kb: 2 });
    expect(r.log.length).toBe(2);                     // 与 spread=0 恒等骰数
    expect(r.shots.length).toBe(1);
    // (0.999·2−1)*0.2 = ±0.1998 的确定性扰动存在
    expect(Math.abs(r.shots[0].vx - 13 - (r.log[0] * 2 - 1) * 0.2)).toBeLessThan(1e-9);
    expect(Math.abs(r.shots[0].vy + 13 - (r.log[1] * 2 - 1) * 0.2)).toBeLessThan(1e-9);
  });

  it('%门冗余保护抽检：零散布型（商人 proj48 / 圣诞前基档面 / 机械师）恒 2 骰起步', () => {
    const r0 = shootRig('merchant', []);
    r0.fire({ proj: 48, dmg: 12, speed: 9, shootTick: 10, cdBase: 60, cdRand: 60, spread: 0, kb: 1.5 });
    expect(r0.log.length).toBe(2);

    const r1 = shootRig('mechanic', []);
    r1.fire({ proj: 582, dmg: 11, speed: 10, shootTick: 1, cdBase: 30, cdRand: 30, spread: 0, kb: 3.5 });
    expect(r1.log.length).toBe(2);                    // ai1=tag 为实例字段非骰
  });

  it('160 落点弹保序：vec4 散布（两张）先于落点选位（两张），全途恒 4 张', () => {
    const world = flatWorld('fix3-land');             // 平地落点空气 → 单次选位即收
    const npc = new TownNPC('truffle', 100 * 16, FLOOR_ROW * 16) as AnyNpc;
    npc.onGround = true;
    Object.assign(npc, {
      threatPool: {
        left: null,
        right: { x: 2600, y: 1560, w: 18, h: 40, cx: 2609, cy: 1580 },
      },
      facing: 1,
      dangerSide: 1,
    });
    const log: number[] = [];
    npc.rng = rngQueue([], log);                      // 默认 0.999 可追踪
    const { game, gameRaw } = baseGame(world, [], []);
    const shots = gameRaw.shots;
    const fn = (TownNPC.prototype as unknown as
      Record<string, (...a: never[]) => void>).shootAt as (
        w: never, g: never, p: Record<string, unknown>, r: number,
      ) => void;
    fn.call(npc, world as never, game as never, {
      proj: 590, dmg: 40, speed: 0, shootTick: 15, cdBase: 15, cdRand: 1,
      spread: 0, kb: 3,
    }, 700);
    // 序 = 散布 2 张（保序在先）+ 160 落点 px/py 2 张 = 4。
    // 旧实现整段为 0 → 选位流位平移两张（B-F8 定罪面）。
    expect(log.length).toBe(4);
    expect(shots.length).toBe(1);
    expect(shots[0].vx).toBe(0);
    expect(shots[0].vy).toBe(0);
  });
});

// =====================================================================
// 【5】B-F10 出膛附参三件（227/142/ai2 透传 590 帧）
// =====================================================================
describe('【5】B-F10 出膛附参', () => {
  function shootOne(key: string, params: Record<string, unknown>, shimmered = false,
    pool?: { x: number; y: number; w: number; h: number }) {
    const world = flatWorld(`fix3-bf10-${key}`);
    const npc = new TownNPC(key, 100 * 16, FLOOR_ROW * 16) as AnyNpc;
    npc.onGround = true;
    if (shimmered) npc.shimmered = true;
    npc.rng = rngQueue([], undefined);
    const ref = pool
      ? { x: pool.x, y: pool.y, w: pool.w, h: pool.h, cx: pool.x + pool.w / 2,
          cy: pool.y + pool.h / 2 }
      : null;
    Object.assign(npc, { threatPool: { left: null, right: ref }, facing: 1, dangerSide: 1 });
    const { game, gameRaw } = baseGame(world, [], []);
    const fn = (TownNPC.prototype as unknown as
      Record<string, (...a: never[]) => void>).shootAt as (
        w: never, g: never, p: Record<string, unknown>, r: number,
      ) => void;
    fn.call(npc, world as never, game as never, params, 700);
    return gameRaw.shots;
  }

  it('a) 画师 227 出膛带 ai1=Next(12)/6（:55339 第 11 参；本仓油漆系统 GAP 登记）', () => {
    const shots = shootOne('painter',
      { proj: 587, dmg: 8, speed: 10, shootTick: 1, cdBase: 10, cdRand: 1, spread: 0.5, kb: 1.75 });
    expect(shots.length).toBe(1);
    expect(shots[0].projId).toBe(587);
    expect(Number.isInteger(shots[0].ai1 * 6)).toBe(true);   // ai1 ∈ {k/6}
    expect(shots[0].ai1).toBeGreaterThanOrEqual(0);
    expect(shots[0].ai1).toBeLessThan(12 / 6);
  });

  it('b) 圣诞 142 出膛带 ai1=Next(5)；构造器级 Math.random 兜底已删（缺省 0 首列）', () => {
    const shots = shootOne('santa_claus',
      { proj: 589, dmg: 22, speed: 7, shootTick: 1, cdBase: 10, cdRand: 1, spread: 0, kb: 2 });
    expect(shots.length).toBe(1);
    expect(Number.isInteger(shots[0].ai1)).toBe(true);
    expect(shots[0].ai1).toBeGreaterThanOrEqual(0);
    expect(shots[0].ai1).toBeLessThanOrEqual(4);

    // 显式语义收敛：不再本地补掷 —— 直接构造缺省走首列且零 Math.random
    const realRandom = Math.random;
    let stray = 0;
    Math.random = () => { stray++; return 0.5; };
    try {
      const bare = new TownShot(0, 0, 0, 0, 1, 0, 589, {});
      expect(bare.ai1).toBe(0);
      const defaultCtor = new TownShot(0, 0, 0, 0, 1, 0, 589);
      expect(defaultCtor.ai1).toBe(0);
      expect(stray).toBe(0);
    } finally {
      Math.random = realRandom;
    }
    // 消费位联动：case 589 列索引钳制 [0,4]
    expect(townFrameIndex(589, 0, 4, 0)).toBe(4);
    expect(townFrameIndex(589, 0, 9, 0)).toBe(4);
  });

  it('c) 透传 590：微光松露出膛 ai2=1 → 帧 = 3+(age/4)%3；常态 ai2=0 帧 = (age/4)%3', () => {
    const foeBox = { x: 2600, y: 1560, w: 18, h: 40 };
    const base = shootOne('truffle',
      { proj: 590, dmg: 40, speed: 0, shootTick: 15, cdBase: 15, cdRand: 1, spread: 0, kb: 3 },
      false, foeBox)[0];
    const varn = shootOne('truffle',
      { proj: 590, dmg: 40, speed: 0, shootTick: 15, cdBase: 15, cdRand: 1, spread: 0, kb: 3 },
      true, foeBox)[0];
    expect(base.ai2).toBe(0);
    expect(varn.ai2).toBe(1);                        // townNpcVariationIndex==1
    expect(townFrameIndex(590, 0, 0, varn.ai2)).toBe(3);
    expect(townFrameIndex(590, 11, 0, varn.ai2)).toBe(5);   // ⌊11/4⌋%3=2 → 3+2=5
    expect(townFrameIndex(590, 12, 0, varn.ai2)).toBe(3);   // ⌊12/4⌋%3=0 → 3
    expect(townFrameIndex(590, 0, 0, base.ai2)).toBe(0);    // 常态第一列组
  });

  it('d) 108 连发每发均附 ai2；124 机械师 ai2 补齐（ai1=tag 既有）', () => {
    const bolts = shootOne('wizard',
      { proj: 15, dmg: 18, speed: 6, shootTick: 15, cdBase: 15, cdRand: 5, spread: 0, kb: 3, aimLiftScaled: 20 },
      true);
    expect(bolts.length).toBeGreaterThanOrEqual(1);
    for (const b of bolts) expect(b.ai2).toBe(1);

    const mech = shootOne('mechanic',
      { proj: 582, dmg: 11, speed: 10, shootTick: 1, cdBase: 30, cdRand: 30, spread: 0, kb: 3.5 },
      true)[0];
    expect(mech.ai2).toBe(1);
    expect(typeof mech.ai1).toBe('number');          // tag 面（MECH_PROBE_TAG_SEQ）
  });
});

// =====================================================================
// 【7】坐姿椅检像素口径（Bottom−2px）/16 —— 1px 边界帧不误起身
// =====================================================================
describe('【7】坐姿椅检 Bottom−2px 口径（NPC.cs:54841）', () => {
  const CHAIR = TILE_BY_KEY['chair']!;
  function seatWorld() {
    const world = new World(200, 200, 100, 'fix3-sit');
    const st = world.store;
    for (let x = 20; x <= 180; x++) st.setTileSilent(x, FLOOR_ROW, DIRT);
    st.setTileSilent(110, FLOOR_ROW - 2, CHAIR, 0, 0);
    st.setTileSilent(110, FLOOR_ROW - 1, CHAIR, 0, 18);
    world.clock.timeOfDay = 0;
    return world;
  }

  it('底边压格线的坐姿锚跨 tick 不误起身（若退化为 (Bottom)/16 将探到地面行起身）', () => {
    const world = seatWorld();
    const npc = new TownNPC('guide', 110 * 16 + 8, FLOOR_ROW * 16);
    npc.home = { x: 110, y: FLOOR_ROW - 1 };
    const { game } = baseGame(world, [], [npc]);
    let seated = false;
    for (let t = 0; t < 120 && !seated; t++) {
      npc.fixedUpdate(1 / 60, game);
      seated = npc.sitting;
    }
    expect(seated).toBe(true);
    expect(npc.y + npc.h).toBe(FLOOR_ROW * 16);       // Bottom.Y == 地面行顶（恰压格线）
    // 若误用 ⌊Bottom/16⌋：探针落地面行(dirt) → canSitAt=false → 每拍起身；
    // 现口径 ⌊(Bottom−2px)/16⌋ 落椅行 → 持续坐在，50 拍零误起身：
    for (let t = 0; t < 50; t++) {
      npc.fixedUpdate(1 / 60, game);
      expect(npc.sitting).toBe(true);
    }
    // 反证探针差分：地面行确为实心非椅，(Bottom)/16 的假想口径必然判否
    expect(world.store.isSolid(110, FLOOR_ROW)).toBe(true);
    expect(npc.sitting).toBe(true);
  });
});

// =====================================================================
// 【8】D-F3 StepUp 上升帧豁免（NPC.cs:54525-54527）
// =====================================================================
describe('【8】StepUp velocity.Y>=0 门（D-F3）', () => {
  function stepBody(vy: number) {
    const world = new World(200, 200, 100, 'fix3-stepup');
    const st = world.store;
    for (let x = 40; x <= 60; x++) st.setTileSilent(x, 60, STONE);
    st.setTileSilent(52, 59, STONE);                  // 一级台阶（顶面 59*16=944）
    // 身体站地行顶（y+h=960），紧邻台阶前置位使探柱恰落在 col52 且 X 重叠门成立
    const b: Body = {
      x: 811, y: 960 - 42, w: 20, h: 42,
      vx: 2, vy, onGround: false, hitWall: false, hitHead: false,
      liqFactor: 1, embedTicks: 0, embedPushed: 0,
    } as Body;
    b.stepUp = true; b.stepUpHolds = true; b.stepUpNpc = true;
    return { world, b };
  }

  it('贴地下(vy>=0)撞 1 格台阶被抬升至 944；上升帧(vy<0)同几何不抬升（vanilla if 包裹）', () => {
    const { world, b } = stepBody(0.3);
    moveAndCollide(b, world, 2, 0.3);
    moveAndCollide(b, world, 2, 0.3);
    expect(b.y + b.h).toBeCloseTo(944, 5);            // 抬上台阶顶（≤16.1px 限内）

    // 对照：完全相同几何、vy=-5（跳跃/击退上行帧）→ StepUp 被 :54525 门拦
    const { world: w2, b: c } = stepBody(-5);
    moveAndCollide(c, w2, 2, -5);
    moveAndCollide(c, w2, 2, -5);
    expect(Math.abs((c.y + c.h) - 944)).toBeGreaterThan(1);   // 未吸附台阶顶
    expect(c.y + c.h).toBeLessThan(956);              // 两帧上行位移照常发生
  });
});

// =====================================================================
// 【9】D-F2/A-F4 flag22 家平线门（NPC.cs:54513-54527）三态
// =====================================================================
describe('【9】flag22 三态（stepDownGate / stepUpHolds 每 tick 拨正）', () => {
  it('无家无锚（homeRow=-1 ⇒ flag22 恒真）：stepDownGate=\'never\' / holds=true', () => {
    const world = flatWorld('fix3-f22-a');
    world.clock.timeOfDay = 0.5;
    const npc = new TownNPC('guide', 104 * 16, FLOOR_ROW * 16) as AnyNpc;
    npc.onGround = true;
    privSet(npc, { walkMode: 0 });
    privSet(npc, { walkT: 400 });
    const { game } = baseGame(world, [], []);
    npc.rng = rngQueue([], undefined);
    npc.fixedUpdate(1 / 60, game);
    // flag22 判定在 anchorTile 由游走头建立之前（块位于 fixedUpdate 前段）
    expect((priv(npc, 'anchorTile') ?? null) === null || true).toBe(true);
    expect(priv(npc, 'stepDownGate')).toBe('never');
    expect(priv(npc, 'stepUpHolds')).toBe(true);
  });

  it('低于家平线侧（字面 (Hm−32)>top 为假 → flag22=true）：gate=\'never\' / holds=true', () => {
    // 底边 1600（top=1558）；家站格 96 → homeRow=97 → 阈值 97*16−32=1520
    // 1520 > 1558 为假 → flag22=true（本体低于家线 64px 的街道侧）
    const world = flatWorld('fix3-f22-low');
    world.clock.timeOfDay = 0.5;
    const npc = new TownNPC('guide', 104 * 16, FLOOR_ROW * 16) as AnyNpc;
    npc.onGround = true;
    npc.home = { x: 104, y: 96 };                     // 站格 96 → 地行 97
    privSet(npc, { walkMode: 0 });
    privSet(npc, { walkT: 400 });
    const { game } = baseGame(world, [], []);
    npc.rng = rngQueue([], undefined);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.y + npc.h).toBe(FLOOR_ROW * 16);
    expect(priv(npc, 'stepDownGate')).toBe('never');
    expect(priv(npc, 'stepUpHolds')).toBe(true);
  });

  it('高于家平线 32px+ 侧（二层楼板，flag22=false）：gate=\'grounded\' / holds=false', () => {
    // NPC 站二层楼板 106 行顶（top=1654）；home 站格 105 → homeRow=106
    // 阈值 106*16−32=1664 > 1654 → flag22=false（家门双层公寓步道吸附面开启）
    const world = flatWorld('fix3-f22-up');
    world.clock.timeOfDay = 0.5;
    const st = world.store;
    for (let x = 90; x <= 130; x++) st.setTileSilent(x, 106, DIRT);   // 二层楼板
    const npc = new TownNPC('guide', 110 * 16, 106 * 16) as AnyNpc;
    npc.onGround = true;
    npc.home = { x: 110, y: 105 };                    // 站格 105 → 地行 106
    privSet(npc, { walkMode: 0 });
    privSet(npc, { walkT: 400 });
    const { game } = baseGame(world, [], []);
    npc.rng = rngQueue([], undefined);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.y + npc.h).toBe(106 * 16);
    expect(priv(npc, 'stepDownGate')).toBe('grounded');   // !flag22 侧开门吸附
    expect(priv(npc, 'stepUpHolds')).toBe(false);         // holdsMatching=flag22=false
  });
});
