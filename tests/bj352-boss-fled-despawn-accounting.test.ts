// BJ352 全 boss 消散记账普查——「传送走=击败」家族判别面（2026-09-25）：
//
// 普查范式（BJ347 定谳延续）：boss 非击杀退场（玩家远离/脱战/传送走 → EncourageDespawn/
//  自毁支/离场演出）必须 dead+bossFled 同置；Game bossBlock（Game.ts:10152-10330）以
//  `this.boss.dead && !this.boss.bossFled` 走击败链（downed_<vid>+击败公告+灯笼夜+事件旗）
//  ——bossFled 缺失即「传送走=击败」误账。
//
// 全 boss 记账路径审计结论（原版锚逐条亲读）：
//  - 通用 CheckActive 消散面（Enemy.ts runDespawnFx）：def.boss → bossFled ✓（2026-09-02 已修）
//  - 4 EoC 昼散 / 50 史王 / 125-127 双子吴克 / 222 蜂后 / 266 克脑(:686) / 262 世花
//    ——AI 离场支走 EncourageDespawn → 通用面承接 ✓；克脑死/离猩红支 bossFled ✓
//  - 13-15 世吞：腐化外下潜整链清除 bossFled ✓（Enemy.ts:1192）；14/15 NO_DESPAWN 原版钉活
//  - 113 肉山：世界边(:bossAI_wof.ts:173)/玩家死 3s(:330) bossFled ✓
//  - 134 毁灭者：黎明/玩家死钻地 bossFled ✓（bossAI.ts:2136）；134 在 NO_DESPAWN（原版名单）
//  - 245 石巨人：>3000px 瞬消 bossFled ✓（bossAI_golem.ts:435）
//  - 396/397/398 月总：部件缺失/ai0=3 离场 bossFled ✓（2026-08-22/23 修）
//  - 439 教主：自毁支 bossFled ✓（BJ347）；439 在 NO_DESPAWN（原版名单）→ 自毁支唯一退场口
//  - 636/657 光皇族：13 态淡出 bossFled ✓（2026-08-19 修）
//  - 422/493/507/517 四柱：NO_DESPAWN 钉活（原版 DoesntDespawnToInactivity）→ 无消散面；
//    塔死记账 downedTower_* 走 onTowerKilled 真死链（LunarEvent.ts，BJ351 面）
//  - 664 火把神：本体无生成路径（事件=弹幕 949）→ n/a
//  - DD2/月事件小 boss（325/327/345/346/551-578/139）：SetDefaults 无 boss 位 → 不入 Boss 槽
//    → 无击败记账面（Enemy.ts VANILLA_BOSS_IDS 注）
//  ★误账两例（本刀修）：
//  - 668 鹿角怪 case 8 离场消散（NPC.cs:44821-44830 life=-1+HitEffect+active=false）——
//    668 是 DoesntDespawnToInactivityAndCountsNPCSlots 唯一成员（NPC.cs:78587-78589 →
//    CheckActive :78786-78789 `if (flag) return`）= 通用面永不管 → 本支是唯一非击杀退场口，
//    直置 dead 漏 bossFled → 传送走后（despawnTimer 86400 耗尽）被误记击败
//  - 395 火星飞碟核心 outOfBoundsKill（1458 NPC.cs:36844-36859 越界钳位+active=false 零掉落
//    零计分）——玩家传送走 → -1 态爬升（despawnTimer=300 逐拍回填压住通用消散，原版唯一
//    出口即越界支）→ 出界被误记击败
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { deerclopsAI } from '../src/entities/bossAI_deerclops';
import { martianSaucerAI } from '../src/entities/bossAI_martian';
import { wallOfFleshAI } from '../src/entities/bossAI_wof';
import { lunaticCultistAI, empressOfLightAI } from '../src/entities/bossAI_lategame';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 140, FLOOR = 100;

function makeWorld(): World {
  const w = new World(W, H, 7, 'bj352');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = em.nextId++;
      (bucket === 'enemies' ? enemies : projectiles).push(e);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
  } as unknown as GameHooks['player'];
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    projectiles: () => projectiles,
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxWav: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, player, em };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

// ============================================================
// ① 668 鹿角怪 case 8 离场消散 = bossFled（BJ352 修刀位一）
//    原版：AI_123 case 8（NPC.cs:44821-44830）life=-1+HitEffect+active=false 非击杀；
//    668 免通用 CheckActive（:78587 唯一成员）→ 本支即唯一退场口
// ============================================================
describe('BJ352 ① 鹿角怪 668 离场消散（NPC.cs:44821-44830）', () => {
  it('离家计时耗尽 → case 8 离场演出 → dead+bossFled 同置（不再被 Game 误记击败）', () => {
    const h = makeHooks(makeWorld(), { x: 300, y: 80 });   // 玩家远离（≥2400px = ShouldRunAway）
    const cl = spawn(h, 668, 100, 96);
    cl.bInit = true;
    cl.ai0 = 6; cl.ai1 = 0;                                // 回家态（撤退中）
    cl.ai2 = 100; cl.ai3 = 96;                             // home tile（跳过首帧初始化）
    cl.despawnTimer = 1;                                   // 86400 离场预算已耗尽
    deerclopsAI(cl, h.hooks, h.player);
    expect(cl.ai0).toBe(8);                                // 进入离场消散演出
    expect(cl.dead).toBe(false);
    for (let i = 0; i < 45 && !cl.dead; i++) deerclopsAI(cl, h.hooks, h.player);
    expect(cl.dead).toBe(true);                            // 40t 演出毕 life=-1
    expect(cl.bossFled).toBe(true);                        // ★BJ352 修刀位：非击杀消散
  });

  it('对偶面：玩家在雪原家常驻（≤480px）→ 回家态复归追击，不消散', () => {
    const h = makeHooks(makeWorld(), { x: 102, y: 90 });
    const cl = spawn(h, 668, 100, 96);
    cl.bInit = true;
    cl.ai0 = 6; cl.ai1 = 0;
    cl.ai2 = 100; cl.ai3 = 96;
    cl.despawnTimer = 86400;
    for (let i = 0; i < 3; i++) deerclopsAI(cl, h.hooks, h.player);
    expect(cl.dead).toBe(false);
    expect(cl.bossFled).toBe(false);
    expect(cl.ai0).not.toBe(8);
  });
});

// ============================================================
// ② 395 火星飞碟核心越界消散 = bossFled（BJ352 修刀位二）
//    原版：1458 :36844-36859 越界钳位+active=false（零掉落零计分，全态生效）
// ============================================================
describe('BJ352 ② 火星飞碟核心 395 越界消散（1458 NPC.cs:36844-36859）', () => {
  it('-1 态爬升出世界顶 → 越界直清：dead+bossFled 同置（传送走场景的唯一出口）', () => {
    const h = makeHooks(makeWorld(), { x: 40, y: 80 });
    const sc = spawn(h, 395, 100, 60);
    sc.bInit = true;                                       // 跳过部件生成（部件面与本刀无关）
    sc.ai0 = -1; sc.ai1 = 0; sc.ai2 = 0; sc.ai3 = 0; sc.lai0 = 0;
    sc.y = -200;                                           // 已越世界顶界
    martianSaucerAI(sc, h.hooks, h.player);
    expect(sc.dead).toBe(true);
    expect(sc.bossFled).toBe(true);                        // ★BJ352 修刀位：非击杀消散
    expect(sc.y).toBe(-100);                               // position 钳位（原版同相）
  });

  it('对偶面：界内巡航态 → 照常作战不消散', () => {
    const h = makeHooks(makeWorld(), { x: 90, y: 80 });
    const sc = spawn(h, 395, 100, 60);
    sc.bInit = true;
    sc.ai0 = 0; sc.ai1 = 0; sc.ai2 = 0; sc.ai3 = 0; sc.lai0 = 0;
    martianSaucerAI(sc, h.hooks, h.player);
    martianSaucerAI(sc, h.hooks, h.player);
    expect(sc.dead).toBe(false);
    expect(sc.bossFled).toBe(false);
  });
});

// ============================================================
// ③ 回归锁：已修 boss 消散面的 bossFled 配对不回退
//    （Game bossBlock 以 dead && !bossFled 判击败——配对破缺即误账复发）
// ============================================================
describe('BJ352 ③ 已修面回归锁（肉山边 flee/教主自毁/光皇淡出）', () => {
  it('113 肉山推出世界边 → bossFled+dead（2026-08-13 锁,NPC.cs:25719-25722）', () => {
    const h = makeHooks(makeWorld(), { x: 30, y: 90 });
    const wf = spawn(h, 113, 5, 90);                       // x=80px < 160px
    wallOfFleshAI(wf, h.hooks, h.player);
    expect(wf.dead).toBe(true);
    expect(wf.bossFled).toBe(true);
  });

  it('439 教主玩家死亡自毁 → bossFled+dead（BJ347 锁,NPC.cs:65272-65276）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = 0; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    (h.player as unknown as { dead: boolean }).dead = true;
    lunaticCultistAI(cult, h.hooks, h.player);
    expect(cult.dead).toBe(true);
    expect(cult.bossFled).toBe(true);
  });

  it('657/636 光皇族目标失效淡出 → bossFled+dead（2026-08-19 锁,NPC.cs:47264-47271）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const em = spawn(h, 657, 100, 70);
    for (let i = 0; i < 25; i++) empressOfLightAI(em, h.hooks, null);
    expect(em.dead).toBe(true);
    expect(em.bossFled).toBe(true);
  });
});
