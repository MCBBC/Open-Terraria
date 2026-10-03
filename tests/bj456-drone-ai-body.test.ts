// ★BJ456（2026-10-03）：AI_195/205 无人机/遥控车本体 + 逐帧 Track + 5452 面部视觉
//  ——X4-债1（通道整缺）与 X4-债16①（Track 调用点归属）④（面部穿戴视觉）清偿验收锁。
// 债面定谳（Terarria1457 亲读,行号均指该树）：
//   · 弹幕 id 定谳：5451/5738 是【物品】id（ItemID.cs:12448 JimsDrone / :13022
//     RemoteControlCar）——对应【弹】id = 1020/1105（ProjectileID.cs:2492/:2662）,
//     SetDefaults 弹 1020 = 12×12/aiStyle 195/friendly/penetrate −1（Projectile.cs:9661-9667）,
//     弹 1105 = 26×26/aiStyle 205/friendly/tileCollide/correctSlopeCollision（:10296-10304）。
//     AI 内 HeldItem 门比对的是物品 id（:41671 `player.HeldItem.type != 5451`、:38787 同构）。
//   · ★「侦测稀有敌怪/宝藏」定谳=债1 登记措辞与实体不符：AI_195_JimsDrone
//     （Projectile.cs:41652-41804）与 AI_205_RemoteControlCar（:38768-39169）全文
//     无任何 NPC/宝箱/稀有度扫描逻辑——本体=纯遥控竞速机（输入字节→姿态/推力/物理）,
//     镜头通道=DroneCameraTracker 纯跟随（TryTracking :23-33）+ 5452 FPV 眼镜装备门
//     （remoteVisionForDrone）。「侦测」面不存在=本批判谳,无落刀面。
//   · Track 调用点（债16①）：两 AI 各在 owner==Main.myPlayer 支内逐帧调
//     Main.DroneCameraTracker.Track(this)（:41688/:38825）——位置序=y≤640 自毁门
//     （:41667-41670/:38783-38786,return 先于 Track）→ 持机件失配置 flag（不拦 Track）
//     → 输入字节装配（先于 Track,Track 观测当拍 ai[0]）→ Track → flag Kill（:41690/
//     :38827 在 Track 后）。本仓落点=DroneBase.fixedUpdate owner 支（entities/
//     DroneProjs.ts,清偿刀 A 实装）→ Game.droneCameraTrack 钩子 → Camera.droneTracker；
//     X4-债1 出膛位代行（清偿刀 I 过渡形态）已退役——spawn 支零 Track（源锚=
//     tests/drone-camera-tracker.test.ts ⑤,行为锚=本文件 ④）。
//   · 5452 面部视觉（债16④）：★清偿刀 N 判谳=伪债（face 槽路由 2026-09-03 已整链
//     落地）——提取器表 vanilla-acc-drawslots.json "5452":{"face":21} 原生在位
//     （ArmorIDs.Face.JimsDroneVisor=21,ArmorIDs.cs:2237）;Item.cs:42982-42988 case 5452
//     faceSlot=21 + hasVanityEffects=true。绘制位深层锁（裸锚零偏移/层序/戴盔门/
//     贴图 sha256）= tests/drone-visor-face-draw.test.ts,本文件只钉表+路由+授权同源。
// 行为面全集（推力/转向/落地/反弹/翻墙爬/循环音等逐钉）= tests/drone-ai.test.ts;
// MP 快照面（刀G kind11）= tests/mp-proj-drone-snapshot.test.ts。本文件=四验收轴
// ①②③④ 一体化判别锁（变异靶：Track 摘除/重力 0.15/地面加速 0.3/face 21）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { JimsDroneProj, RemoteControlCarProj, type DroneBase } from '../src/entities/DroneProjs';
import { DroneCameraTracker, hasRemoteVisionForDrone } from '../src/render/DroneCameraTracker';
import { accDrawSlotsOf } from '../src/data/vanillaAccDrawslots';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { VI_ID } from '../src/data/itemKeys';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DRONE_ITEM_ID = VI_ID(5451);
const CAR_ITEM_ID = VI_ID(5738);
const VISOR_ITEM_ID = VI_ID(5452);

function makeWorld(): World {
  const w = new World(160, 240, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 200, 1, 0, 0);   // 地面 y=200 格
  return w;
}

/** Track 调用 spy 记录（位次判别面：调用时弹的当拍 ai0 快照） */
interface TrackSpy {
  calls: Array<{ ai0: number; cx: number; cy: number }>;
}
interface Rec {
  sfx: Array<{ name: string }>;
  dust: Array<{ type: number }>;
  deaths: Array<{ projId: number }>;
}

function makeGame(w: World, player: unknown, rec: Rec, tracker: DroneCameraTracker | null,
  spy?: TrackSpy): GameHooks {
  return {
    world: w,
    player: player as unknown as GameHooks['player'],
    enemies: () => [],
    critters: () => [],
    playSfx: (name: string) => { rec.sfx.push({ name }); },
    spawnDust: () => null,
    onProjectileDeath: (projId: number) => { rec.deaths.push({ projId }); },
    addLightAt: () => {},
    startTrackedLoop: () => ({
      stop() {}, setPos() {}, setVolume() {}, setPitch() {},
    }) as unknown as ReturnType<NonNullable<GameHooks['startTrackedLoop']>>,
    ...(tracker || spy
      ? {
          droneCameraTrack: (p: unknown) => {
            const d = p as DroneBase;
            spy?.calls.push({ ai0: d.ai0, cx: d.cx, cy: d.cy });
            tracker?.track(p as Parameters<NonNullable<GameHooks['droneCameraTrack']>>[0]);
          },
        }
      : {}),
  } as unknown as GameHooks;
}

/** 本地玩家桩（输入电平面 + 持机件 inv 桩;heldItemVid 走 ITEM_DEFS[id].vid 生产链） */
function playerHolding(itemId: number): Record<string, unknown> {
  return {
    dead: false,
    gravDir: 1,
    inputLeft: false, inputRight: false, inputUp: false, inputDown: false, inputJump: false,
    inv: { heldItem: () => ({ id: itemId, stack: 1 }) },
  };
}

/** 空中机件（空气域,vy=1 保非落地态） */
function airMech(cls: 'drone' | 'car', px = 80, py = 100): DroneBase {
  return cls === 'drone'
    ? new JimsDroneProj(px * TILE, py * TILE, 0, 1)
    : new RemoteControlCarProj(px * TILE, py * TILE, 0, 1);
}

const VISION_INV = {
  armor: Array.from({ length: 20 }, (_v, i) => (i === 3 ? { id: VISOR_ITEM_ID } : null)),
  effectiveSharedFrom: () => null,
  loadouts: [],
};
const NO_VISION_INV = { armor: [], effectiveSharedFrom: () => null, loadouts: [] };

// ---------------------------------------------------------------------------
// ① AI_195 JimsDrone（弹 1020）：Track 调用位次 spy + 行为钉值（Projectile.cs:41652-41804）
// ---------------------------------------------------------------------------
describe('① AI_195（弹 1020）Track 调用位次 + 行为钉值', () => {
  it('Track 位次：owner 支内逐帧恰一次,输入装配先于 Track（spy 观测当拍 ai0,:41674-41687→:41688）', () => {
    const w = makeWorld();
    const spy: TrackSpy = { calls: [] };
    const tracker = new DroneCameraTracker();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, tracker, spy);
    const d = airMech('drone');
    d.ownerPlayer = g.player;
    (g.player as { inputUp: boolean }).inputUp = true;
    for (let i = 0; i < 5; i++) d.fixedUpdate(1 / 60, g);
    expect(spy.calls.length).toBe(5);                 // 每拍恰一次（原版逐帧语义）
    expect(spy.calls[0].ai0).toBe(4);                 // bit2=controlUp 已装配入字节
    expect(tracker.tryTracking(g.player, VISION_INV)).not.toBeNull();
  });

  it('y≤640 自毁拍零 Track（return 先于 Track,:41667-41670）', () => {
    const w = makeWorld();
    const spy: TrackSpy = { calls: [] };
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, spy);
    const d = airMech('drone', 80, 40);               // y−h ≤ 640 触线
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(d.dead).toBe(true);
    expect(spy.calls.length).toBe(0);
  });

  it('owner 死亡拍仍 Track 后当拍坠毁（dead 只置 flag :41660-41663,Track :41688 在 flag Kill :41690 前）', () => {
    const w = makeWorld();
    const spy: TrackSpy = { calls: [] };
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, spy);
    (g.player as { dead: boolean }).dead = true;
    const d = airMech('drone');
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(spy.calls.length).toBe(1);
    expect(d.dead).toBe(true);
    expect(rec.deaths.some((e) => e.projId === 1020)).toBe(true);
  });

  it('持机件失配拍：Track 照跑后当拍 Kill（flag 置位不拦 Track,:41671-41673/:41688/:41690）', () => {
    const w = makeWorld();
    const spy: TrackSpy = { calls: [] };
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(-1), rec, null, spy);   // 空手
    const d = airMech('drone');
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(spy.calls.length).toBe(1);
    expect(d.dead).toBe(true);
  });

  it('傀儡弹零 Track（owner==Main.myPlayer 门 :41666——非本地弹不进支）', () => {
    const w = makeWorld();
    const spy: TrackSpy = { calls: [] };
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, spy);
    const d = airMech('drone');                       // 不置 ownerPlayer=傀儡
    d.fixedUpdate(1 / 60, g);
    expect(spy.calls.length).toBe(0);
    expect(d.dead).toBe(false);
  });

  it('悬停/推力钉值：无输入 vy+=0.15（:41713/:41734）;上键 (rot−π/2)×0.5 → 净 −0.35（:41718-41721）', () => {
    const w = makeWorld();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null);
    const d = airMech('drone');
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);                         // 无输入:重力拍
    expect(d.vy).toBeCloseTo(1.15, 10);               // 1 + 0.15
    const d2 = airMech('drone');
    d2.ownerPlayer = g.player;
    (g.player as { inputUp: boolean }).inputUp = true;
    d2.fixedUpdate(1 / 60, g);                        // 上键:推力 0.5 + 重力 0.15
    expect(d2.vy).toBeCloseTo(0.65, 10);              // 1 − 0.5 + 0.15（rotation=0 → 推力 (0,−1)）
  });

  it('速度钳 16（commonTail,:41740-41742）——空中态 |v|>16 等比缩到 16', () => {
    const w = makeWorld();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null);
    const d = new JimsDroneProj(80 * TILE, 100 * TILE, 20, 1);   // vy=1 保空中态
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(16, 6);           // 16/20.033 等比缩放
  });
});

// ---------------------------------------------------------------------------
// ② AI_205 RemoteControlCar（弹 1105）：同轴判别（Projectile.cs:38768-39169）
// ---------------------------------------------------------------------------
describe('② AI_205（弹 1105）Track 调用位次 + 行为钉值', () => {
  it('Track 位次：跳边沿拍 mode 位已翻转入字节（:38798 翻转→:38822 装配→:38825 Track）', () => {
    const w = makeWorld();
    const spy: TrackSpy = { calls: [] };
    const tracker = new DroneCameraTracker();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, tracker, spy);
    const d = airMech('car');
    d.ownerPlayer = g.player;
    (g.player as { inputJump: boolean }).inputJump = true;
    d.fixedUpdate(1 / 60, g);                         // vy=1 ≠ 0 → 边沿受理
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0].ai0 & 16).toBe(16);           // bit4=jump
    expect(spy.calls[0].ai0 & 32).toBe(32);           // bit5=mode 已翻转（Track 观测当拍值）
    expect(tracker.tryTracking(g.player, VISION_INV)).not.toBeNull();
  });

  it('y≤640 自毁拍零 Track + 傀儡弹零 Track（:38783-38786 return/:38782 门）', () => {
    const w = makeWorld();
    const spy: TrackSpy = { calls: [] };
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null, spy);
    const d = airMech('car', 80, 40);
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(d.dead).toBe(true);
    expect(spy.calls.length).toBe(0);
    const spy2: TrackSpy = { calls: [] };
    const rec2: Rec = { sfx: [], dust: [], deaths: [] };
    const g2 = makeGame(w, playerHolding(CAR_ITEM_ID), rec2, null, spy2);
    const p2 = airMech('car');
    p2.fixedUpdate(1 / 60, g2);
    expect(spy2.calls.length).toBe(0);
    expect(p2.dead).toBe(false);
  });

  it('owner 死亡拍仍 Track 后当拍坠毁（:38776-38779/:38825/:38828-38831）', () => {
    const w = makeWorld();
    const spy: TrackSpy = { calls: [] };
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null, spy);
    (g.player as { dead: boolean }).dead = true;
    const d = airMech('car');
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(spy.calls.length).toBe(1);
    expect(d.dead).toBe(true);
  });

  it('地面加速钉值 0.3（:39126-39132;空中档 0.1 同位形参）', () => {
    const w = makeWorld();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null);
    const d = new RemoteControlCarProj(80 * TILE, 200 * TILE - 13, 0, 0);   // 贴地
    d.ownerPlayer = g.player;
    (g.player as { inputRight: boolean }).inputRight = true;
    d.fixedUpdate(1 / 60, g);
    expect(d.vx).toBeCloseTo(0.3, 10);
  });

  it('贴地跳钉值 (rot−π/2)×6、当拍重力 0（:39055-39059/:39033）', () => {
    const w = makeWorld();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null);
    const d = new RemoteControlCarProj(80 * TILE, 200 * TILE - 13, 0, 0);
    d.ownerPlayer = g.player;
    (g.player as { inputJump: boolean }).inputJump = true;
    d.fixedUpdate(1 / 60, g);
    expect(d.vy).toBeCloseTo(-6, 10);                 // rotation=0 → 推力 (0,−1)×6,grav=0
  });

  it('墙爬支钉值：推力 0.275→阻尼 0.96→首拍过渡 ×0.5（:38848-38851/:38852-38861）', () => {
    const w = makeWorld();
    w.store.setWallSilent(80, 100, 1);                // 心格带墙
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null);
    const d = new RemoteControlCarProj(80 * TILE, 100 * TILE, 0, 1);
    d.ownerPlayer = g.player;
    (g.player as { inputJump: boolean }).inputJump = true;
    (g.player as { inputUp: boolean }).inputUp = true;
    d.fixedUpdate(1 / 60, g);                         // 跳边沿起 mode → 墙支
    expect(d.vx).toBeCloseTo(0.132, 10);              // 0.275×0.96×0.5（首拍 transition）
    expect(d.frame).toBe(5);                          // 过渡钉 4 → anyDir 帧tick1 → 螺旋桨帧 5（:38898-38905）
    expect(d.spriteDir).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ③ 5452 面部表+绘制位（X4-债16④;刀 N 判伪锚=路由本就在位,本批钉值防回归）
// ---------------------------------------------------------------------------
describe('③ 5452 FPV 眼镜面部穿戴视觉（表+绘制路由位）', () => {
  it('提取器表：accDrawSlotsOf(5452).face===21（vanilla-acc-drawslots.json;ArmorIDs.cs:2237）', () => {
    const slots = accDrawSlotsOf(5452);
    expect(slots).not.toBeNull();
    expect(slots!.face).toBe(21);
  });

  it('装备路由：功能槽 3 / 社交槽 13 佩戴 → equipStats.accDraw.face===21（:37216-37230 face 分流;hasVanityEffects 件虚荣环同画）', () => {
    for (const slot of [3, 13]) {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[slot] = { id: VISOR_ITEM_ID, stack: 1 };
      expect(p.equipStats.accDraw.face, `slot ${slot}`).toBe(21);
    }
  });

  it('绘制位贴图在库：Acc_Face_21.png（AssetInitializer.cs:526-528 Acc_Face_{n} 族;深层锁=drone-visor-face-draw.test.ts ③④）', () => {
    expect(existsSync(join(ROOT, 'public/sprites/vanilla/Acc_Face_21.png'))).toBe(true);
  });

  it('视觉与相机授权同装备面：佩戴 → hasRemoteVisionForDrone true（remoteVisionForDrone 两环 case :15574-15577/:14314-14316）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: VISOR_ITEM_ID, stack: 1 };
    expect(p.equipStats.accDraw.face).toBe(21);
    expect(hasRemoteVisionForDrone(p.inv)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ④ 逐帧 Track 接管（X4-债16①：出膛位代行退役,Track 归位 AI owner 支逐帧）
// ---------------------------------------------------------------------------
describe('④ 逐帧 Track 接管：幂等/单实例替换/自愈（出膛位退役判据）', () => {
  it('出膛位零登记：tracker 出生拍前空（TryTracking null）,首拍 AI 才登记（Track 活在 AI 支非 spawn 位）', () => {
    const w = makeWorld();
    const tracker = new DroneCameraTracker();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, tracker);
    const d = airMech('drone');
    d.ownerPlayer = g.player;
    expect(tracker.tryTracking(g.player, VISION_INV)).toBeNull();   // spawn 位无登记（I 刀代行已退役）
    d.fixedUpdate(1 / 60, g);
    const cam = tracker.tryTracking(g.player, VISION_INV);
    expect(cam).not.toBeNull();
    expect(Math.abs(cam!.x - d.cx)).toBeLessThan(0.001);
    expect(Math.abs(cam!.y - d.cy)).toBeLessThan(0.001);
  });

  it('Track 幂等：同实例重复 track 观测面恒等（DroneCameraTracker.cs:11-15 覆写语义）', () => {
    const t = new DroneCameraTracker();
    const owner = {};
    const d = airMech('drone');
    d.ownerPlayer = owner;
    t.track(d);
    t.track(d);
    t.track(d);
    const cam = t.tryTracking(owner, VISION_INV);
    expect(cam).not.toBeNull();
    expect(Math.abs(cam!.x - d.cx)).toBeLessThan(0.001);
    expect(t.tryTracking(owner, NO_VISION_INV)).toBeNull();
  });

  it('单实例替换：同型新实例接管 tracker（ItemCheck_Shoot 先清后生 :49513-49522 → 跟新弹）', () => {
    const t = new DroneCameraTracker();
    const owner = {};
    const d1 = airMech('car');
    d1.ownerPlayer = owner;
    t.track(d1);
    const d2 = new RemoteControlCarProj(90 * TILE, 100 * TILE, 0, 1);   // 替换实例
    d2.ownerPlayer = owner;
    t.track(d2);                                      // 单实例替换语义:后写胜
    const cam = t.tryTracking(owner, VISION_INV);
    expect(Math.abs(cam!.x - d2.cx)).toBeLessThan(0.001);
    expect(Math.abs(cam!.y - d2.cy)).toBeLessThan(0.001);
    expect(Math.abs(cam!.x - d1.cx)).toBeGreaterThan(1);
  });

  it('逐帧自愈=接管面判别：TryTracking 失败清 tracked（:28）后下一 AI 拍自动重登记——出膛位单发代行无此相', () => {
    for (const cls of ['drone', 'car'] as const) {
      const w = makeWorld();
      const tracker = new DroneCameraTracker();
      const rec: Rec = { sfx: [], dust: [], deaths: [] };
      const g = makeGame(w, playerHolding(cls === 'drone' ? DRONE_ITEM_ID : CAR_ITEM_ID),
        rec, tracker);
      const d = airMech(cls);
      d.ownerPlayer = g.player;
      d.fixedUpdate(1 / 60, g);
      expect(tracker.tryTracking(g.player, VISION_INV)).not.toBeNull();
      // 装备门失败拍：tracked 被清（:28 只清 tracked 不清 lastTrackedType）
      expect(tracker.tryTracking(g.player, NO_VISION_INV)).toBeNull();
      // 下一拍 AI 逐帧 Track 自愈重登记——出膛位单发代行会滞留 null 直到重射（退役判据）
      d.fixedUpdate(1 / 60, g);
      const cam = tracker.tryTracking(g.player, VISION_INV);
      expect(cam, `${cls} 自愈`).not.toBeNull();
      expect(Math.abs(cam!.y - d.cy)).toBeLessThan(0.001);
    }
  });
});
