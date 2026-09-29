// ★X4 清偿刀I（2026-09-29）：DroneCameraTracker 通道（配饰 5452 FPV 眼镜）判别测试。
// 定谳锚（Terarria1457 直读）：
//   Terraria.DataStructures/DroneCameraTracker.cs 全文 34 行（Track :11-15 /
//   WorldClear :17-21 / TryTracking :23-33,门集 :26）；
//   Main.cs:1893 单例;GetObjectTrackingCameraPan :63677-63699（观战 :63682-63687 →
//   dead 门 :63688-63691 → 无人机 :63692-63694 → 高尔夫 :63696-63699）;
//   Item.cs:42982-42988 case 5452（accessory/rare 3/faceSlot 21/hasVanityEffects）;
//   Player.cs:2373 字段 / :13044-13049+15574-15577 功能环 case / :13110-13115+
//   14314-14316 虚荣环 case / :5678 GetEffectiveArmor（空槽收藏共享）/ :18828 复位;
//   Projectile.cs:38825（AI_205 车）/ :41688（AI_195 无人机）Track 调用点;
//   WorldGen.cs:6950 WorldClear;Chest.cs:2397-2401 旅行商人 hardmode 栏。
// 变异证红：M1 摘 tryTracking 的 !hasRemoteVisionForDrone 门（装备门整删）→
//   ③装备门组红;M2 摘 Game.ts camTX 链 droneCam 支 → ⑤接线组红。已跑,sha256
//   字节还原对账。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DroneCameraTracker, hasRemoteVisionForDrone,
  type DroneCameraTrackable, type DroneVisionInventory } from '../src/render/DroneCameraTracker';
import { Camera } from '../src/render/Camera';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { statOfInternal } from '../src/data/vanillaItemStats';
import { Inventory } from '../src/items/Inventory';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const gameSrc = read('src/core/Game.ts');

/** vid → 内部 id 权威反查口（勿按键名字面查——桥接批 snake 键/自动注册 Pascal 键并存） */
const vidIdx = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

// ============================================================
// ① 物品 5452 注册面（自动注册循环覆盖,零显式注册=ITEM_DEFS 下标零平移）
// ============================================================
describe('① 物品 5452 FPV 眼镜注册面（Item.cs:42982-42988 case 5452）', () => {
  const idx = vidIdx(5452);

  it('自动注册键在位且 vid=5452（vanilla.json 精灵表驱动,勿手写 item() 平移下标）', () => {
    expect(idx).toBeGreaterThan(-1);
    expect(ITEM_DEFS[idx]?.vid).toBe(5452);
  });

  it('rare=3（vanilla-itemrare.json;Item.cs SetDefaults rare = 3）', () => {
    expect(ITEM_DEFS[idx]?.rare).toBe(3);
  });

  it('maxStack=9999（1.4.4 改制 CommonMaxStack,无覆盖表项）', () => {
    expect(ITEM_DEFS[idx]?.maxStack).toBe(9999);
  });

  it('acc=1 功能配饰（vanilla-itemstats.json;armorAccepts 槽门依赖=可佩 3-9/13-19）', () => {
    expect(statOfInternal(idx)?.acc).toBe(1);
  });
});

// ============================================================
// ② 装备门 hasRemoteVisionForDrone（Player.cs 两环 case 5452 面）
// ============================================================
describe('② remoteVisionForDrone 装备面（功能环 :13044-13049→:15574-15577 + 虚荣环 :13110-13115→:14314-14316）', () => {
  const idx = vidIdx(5452);
  const mkInv = (): Inventory => new Inventory();
  const visorItem = () => ({ id: idx, stack: 1 });

  it('功能配饰槽 3-9 佩戴 → true（ApplyEquipFunctional case :15574-15577）', () => {
    for (const slot of [3, 6, 9]) {
      const inv = mkInv();
      inv.armor[slot] = visorItem();
      expect(hasRemoteVisionForDrone(inv), `slot ${slot}`).toBe(true);
    }
  });

  it('社交配饰槽 13-19 佩戴 → true（ApplyEquipVanity case :14314-14316——虚荣槽亦授权）', () => {
    for (const slot of [13, 16, 19]) {
      const inv = mkInv();
      inv.armor[slot] = visorItem();
      expect(hasRemoteVisionForDrone(inv), `slot ${slot}`).toBe(true);
    }
  });

  it('非配饰域（盔甲 0-2/时装盔甲 10-12）不在扫描域 → false', () => {
    const inv = mkInv();
    inv.armor[0] = visorItem();    // faceSlot=21 件原版不可入盔甲槽;此处钉扫描域边界
    inv.armor[10] = visorItem();
    expect(hasRemoteVisionForDrone(inv)).toBe(false);
  });

  it('全空 → false（ResetEffects :18828 复位相=未佩戴）', () => {
    expect(hasRemoteVisionForDrone(mkInv())).toBe(false);
  });

  it('佩戴他配饰（望远镜 1299）→ false（门=vid 5452 专件）', () => {
    const inv = mkInv();
    inv.armor[3] = { id: vidIdx(1299), stack: 1 };
    expect(hasRemoteVisionForDrone(inv)).toBe(false);
  });

  it('空槽收藏共享件 → true（GetEffectiveArmor :5678-5692 LoadoutShare 面）', () => {
    const inv = mkInv();
    inv.loadouts[0].armor[4] = { id: idx, stack: 1, favorited: true };
    expect(inv.armor[4] ?? null).toBeNull();
    expect(hasRemoteVisionForDrone(inv)).toBe(true);
  });

  it('共享件未收藏 → false（GetEffectiveArmor 只认 favorited 件）', () => {
    const inv = mkInv();
    inv.loadouts[0].armor[4] = { id: idx, stack: 1 };
    expect(hasRemoteVisionForDrone(inv)).toBe(false);
  });

  it('槽非空时共享不生效（IsAir 门 :5681）——槽内他件+loadout 5452 → false', () => {
    const inv = mkInv();
    inv.armor[4] = { id: vidIdx(1299), stack: 1 };
    inv.loadouts[0].armor[4] = { id: idx, stack: 1, favorited: true };
    expect(hasRemoteVisionForDrone(inv)).toBe(false);
  });
});

// ============================================================
// ③ DroneCameraTracker 状态机（DroneCameraTracker.cs :11-33 1:1）
// ============================================================
describe('③ DroneCameraTracker 状态机（Track :11-15 / TryTracking :23-33 / WorldClear :17-21）', () => {
  const idx = vidIdx(5452);
  const LOCAL = { __localPlayer: true };
  const visorInv = (): DroneVisionInventory => {
    const inv = new Inventory();
    inv.armor[5] = { id: idx, stack: 1 };
    return inv;
  };
  const bareInv = (): DroneVisionInventory => new Inventory();
  const mkProj = (over: Partial<DroneCameraTrackable> = {}): DroneCameraTrackable => ({
    projId: 1020, dead: false, cx: 123.5, cy: 456.5, ownerPlayer: LOCAL, ...over,
  });

  it('过门 → cameraPosition=Center（:31 cameraPosition=_trackedProjectile.Center）', () => {
    const t = new DroneCameraTracker();
    const p = mkProj({ cx: 777.25, cy: -888.5 });
    t.track(p);
    expect(t.tryTracking(LOCAL, visorInv())).toEqual({ x: 777.25, y: -888.5 });
  });

  it('弹已死（!active）→ null（:26 !_trackedProjectile.active）', () => {
    const t = new DroneCameraTracker();
    const p = mkProj();
    t.track(p);
    p.dead = true;
    expect(t.tryTracking(LOCAL, visorInv())).toBeNull();
  });

  it('type 中途变异 → null（:26 type != _lastTrackedType 防御面）', () => {
    const t = new DroneCameraTracker();
    const p = mkProj();
    t.track(p);
    (p as { projId: number }).projId = 1105;
    expect(t.tryTracking(LOCAL, visorInv())).toBeNull();
  });

  it('owner 非本地玩家 → null（:26 owner != Main.myPlayer）', () => {
    const t = new DroneCameraTracker();
    const remote = { __remote: true };
    t.track(mkProj({ ownerPlayer: remote }));
    expect(t.tryTracking(LOCAL, visorInv())).toBeNull();
  });

  it('★装备门：无 5452 → null（:26 !Main.LocalPlayer.remoteVisionForDrone——本通道总闸）', () => {
    const t = new DroneCameraTracker();
    t.track(mkProj());
    expect(t.tryTracking(LOCAL, bareInv())).toBeNull();
  });

  it('TryTracking 失败只清 tracked 不清 lastTrackedType（:28 仅 _trackedProjectile=null;全清口唯一=WorldClear）', () => {
    const t = new DroneCameraTracker();
    const p = mkProj();
    t.track(p);
    expect(t.tryTracking(LOCAL, bareInv())).toBeNull();   // 失败相=清 tracked
    expect(t.tryTracking(LOCAL, bareInv())).toBeNull();   // 再查仍 null（tracked 已清,非 gate 抖动）
    const p2 = mkProj();                                  // 重 Track 同型 → 过门恢复
    t.track(p2);
    expect(t.tryTracking(LOCAL, visorInv())).toEqual({ x: 123.5, y: 456.5 });
  });

  it('worldClear 全清（:17-21 双字段）——清后即使有 visor 也不跟（WorldGen.cs:6950 进图复位相）', () => {
    const t = new DroneCameraTracker();
    t.track(mkProj());
    t.worldClear();
    expect(t.tryTracking(LOCAL, visorInv())).toBeNull();
  });

  it('跨型重 Track 不被 lastTrackedType 残留干扰（1020 → 1105 遥控车切换）', () => {
    const t = new DroneCameraTracker();
    t.track(mkProj({ projId: 1020 }));
    t.track(mkProj({ projId: 1105, cx: 10, cy: 20 }));
    expect(t.tryTracking(LOCAL, visorInv())).toEqual({ x: 10, y: 20 });
  });
});

// ============================================================
// ④ Camera 宿主（Main.DroneCameraTracker 单例生命域 ≙ 本仓 Camera 每世界重建）
// ============================================================
describe('④ Camera.droneTracker 宿主（Main.cs:1893 单例;WorldGen.cs:6950 ≙ 每世界重建）', () => {
  it('Camera 持 tracker（消费点 Game fixedUpdate 物体跟踪链）', () => {
    const cam = new Camera(100, 100);
    expect(cam.droneTracker).toBeInstanceOf(DroneCameraTracker);
  });

  it('新 Camera = 全新 tracker（WorldClear 等价相）', () => {
    const idx = vidIdx(5452);
    const inv = new Inventory();
    inv.armor[5] = { id: idx, stack: 1 };
    const LOCAL = {};
    const camA = new Camera(100, 100);
    camA.droneTracker.track({ projId: 1020, dead: false, cx: 1, cy: 2, ownerPlayer: LOCAL });
    expect(camA.droneTracker.tryTracking(LOCAL, inv)).toEqual({ x: 1, y: 2 });
    const camB = new Camera(100, 100);   // 进新世界重建
    expect(camB.droneTracker.tryTracking(LOCAL, inv)).toBeNull();
  });
});

// ============================================================
// ⑤ Game.ts 接线源锚（bj397 范式;GetObjectTrackingCameraPan 全链优先序）
// ============================================================
describe('⑤ Game.ts 接线源锚（Main.cs:63677-63699 优先序 1:1）', () => {
  it('接入行在位：droneCam 支带 dead 门（:63688-63691 先于 :63692-63694）', () => {
    expect(gameSrc).toContain(
      'const droneCam = !player.dead ? this.camera.droneTracker.tryTracking(this.player, player.inv) : null;');
  });

  it('camTX 链优先序 = 观战 → 无人机 → 高尔夫 → 玩家（:63682→:63692→:63696 逐位）', () => {
    const line = gameSrc.split('\n').find((l) => l.includes('const camTX =')) ?? '';
    const iSpec = line.indexOf('specCam ?');
    const iDrone = line.indexOf('droneCam ?');
    const iGolf = line.indexOf('golfCam ?');
    expect(iSpec).toBeGreaterThan(-1);
    expect(iDrone).toBeGreaterThan(iSpec);
    expect(iGolf).toBeGreaterThan(iDrone);
    const lineY = gameSrc.split('\n').find((l) => l.includes('const camTY =')) ?? '';
    expect(lineY.indexOf('specCam ?')).toBeLessThan(lineY.indexOf('droneCam ?'));
    expect(lineY.indexOf('droneCam ?')).toBeLessThan(lineY.indexOf('golfCam ?'));
  });

  it('droneCam 行位于 golfCam 声明之后、camTX 之前（同链内序）', () => {
    const iGolfDecl = gameSrc.indexOf('const golfCam = !player.dead ? this.golfState.tryGetCameraTrackingPosition() : null;');
    const iDrone = gameSrc.indexOf('const droneCam = !player.dead ? this.camera.droneTracker.tryTracking');
    const iTX = gameSrc.indexOf('const camTX =');
    expect(iGolfDecl).toBeGreaterThan(-1);
    expect(iDrone).toBeGreaterThan(iGolfDecl);
    expect(iTX).toBeGreaterThan(iDrone);
  });

  it('BJ397 高尔夫跟踪死门行原样（回归共存锚——golfCam 行本刀零改动）', () => {
    expect(gameSrc).toContain('const golfCam = !player.dead ? this.golfState.tryGetCameraTrackingPosition() : null;');
  });

  it('BJ397 pan 死门行原样（相机零回归共存锚）', () => {
    expect(gameSrc).toContain('if (!player.dead && !this.input.uiBlocking && !this.inpOverDomUi() && !this.uiHeldItemRef?.()');
  });

  it('★清偿刀 A（2026-09-29）Track 归位：出膛位代行退役——spawn 支【无】track 调用，'
    + 'Game.droneCameraTrack 钩子承载（AI_195/205 owner==myPlayer 支逐帧,P.cs:41688/:38825）', () => {
    const iSpawn = gameSrc.indexOf('if (pmVid === 5451 || pmVid === 5738) {');
    expect(iSpawn).toBeGreaterThan(-1);
    // 过渡代行行已退役：spawn 支到 useSwing 之间不得再直调 tracker.track(mech)
    const iSwing = gameSrc.indexOf('this.useSwing(heldDef, pa5);');
    const spawnSeg = gameSrc.slice(iSpawn, iSwing);
    expect(spawnSeg).not.toContain('droneTracker.track(');
    // 归位面：Game.droneCameraTrack 方法（转接 camera.droneTracker.track）在位
    expect(gameSrc).toContain('droneCameraTrack(proj');
    expect(gameSrc).toContain('this.camera.droneTracker.track(proj)');
  });
});
