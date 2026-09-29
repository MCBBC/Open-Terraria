// 帕鲁机件本体 AI 判别锁（清偿刀 A 2026-09-29；标杆=Terarria1457 反编译，行号注内）：
//   AI_195_JimsDrone（Projectile.cs:41652-41804）/ AI_205_RemoteControlCar（:38768-39169）
//   判别面：推力/转向（姿态 (rot−π/2) 向量 :41718-41721）、重力 0.15（:41713/:41734）、
//   落地转正 ×0.7（:41716）、输入字节 ^gravDir（:41675-41682）、y≤640 自毁
//   （:41667-41670）、持机件门 5451/5738（:41671-41673/:38787-38789）、Track 归位
//   （:41688/:38825 → Game.droneCameraTrack → DroneCameraTracker.track）、1020 撞壁
//   反弹 −last×0.25（:18167-18178）、1105 跳边沿翻墙爬 mode+音22+尘226（:38795-38809）、
//   地面加速 ±0.3（:39127-39132）、墙爬过渡 frame→4/dir=1（:38852-38861）、
//   引擎循环轨 JimsDrone(0.1)/RCCar(0.015)（SoundID.cs:1060/:1062）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { JimsDroneProj, RemoteControlCarProj, type DroneBase } from '../src/entities/DroneProjs';
import { DroneCameraTracker } from '../src/render/DroneCameraTracker';
import { VI_ID } from '../src/data/itemKeys';

function makeWorld(): World {
  const w = new World(160, 240, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 200, 1, 0, 0);   // 地面 y=200 格
  return w;
}

interface Rec {
  sfx: Array<{ name: string; vol?: number }>;
  dust: Array<{ type: number; x: number; y: number; alpha?: number; perfect?: boolean; scale?: number }>;
  deaths: Array<{ projId: number; x: number; y: number; w: number; h: number }>;
}

function makeGame(w: World, player: unknown, rec: Rec, tracker: DroneCameraTracker | null,
  loopHandles: Array<Record<string, unknown>>): GameHooks {
  return {
    world: w,
    player: player as unknown as GameHooks['player'],
    enemies: () => [],
    critters: () => [],
    playSfx: (name: string) => { rec.sfx.push({ name }); },
    playSfxFiles: (files: string[], vol?: number) => { rec.sfx.push({ name: files.join(','), vol }); },
    spawnDust: (x: number, y: number, _w: number, _h: number, type: number,
      _sx = 0, _sy = 0, alpha?: number, _c = null, scale = 1, _ng = false, perfect = false) => {
      rec.dust.push({ type, x, y, alpha, perfect, scale });
      return null;
    },
    onProjectileDeath: (projId: number, x: number, y: number, ww: number, hh: number) => {
      rec.deaths.push({ projId, x, y, w: ww, h: hh });
    },
    addLightAt: () => {},
    startTrackedLoop: (name: string, vol: number) => {
      const h = { name, vol, volumes: [] as number[], pitches: [] as number[], stopped: false,
        setVolume(v: number) { h.volumes.push(v); },
        setPos() {}, setPitch(p: number) { h.pitches.push(p); },
        stop() { h.stopped = true; } };
      loopHandles.push(h as unknown as Record<string, unknown>);
      return h as unknown as ReturnType<NonNullable<GameHooks['startTrackedLoop']>>;
    },
    droneCameraTrack: tracker
      ? (p: unknown) => tracker.track(p as Parameters<DroneCameraTracker['track']>[0])
      : undefined,
  } as unknown as GameHooks;
}

/** 本地玩家桩（输入电平面 + 持机件 inv 桩） */
function makePlayer(): Record<string, unknown> {
  return {
    dead: false,
    gravDir: 1,
    inputLeft: false, inputRight: false, inputUp: false, inputDown: false, inputJump: false,
    inv: { heldItem: () => ({ id: -1, stack: 1 }) },
  };
}

/** 持机件：heldItemVid 走 ITEM_DEFS[id].vid（VI_ID 真实 def id=与生产解析同链） */
function playerHolding(itemId: number): Record<string, unknown> {
  const p = makePlayer();
  (p.inv as { heldItem: () => { id: number } }).heldItem = () => ({ id: itemId, stack: 1 });
  return p;
}

const DRONE_ITEM_ID = VI_ID(5451);
const CAR_ITEM_ID = VI_ID(5738);

/** 空中机件（空气格中心,vy=1 保证非落地态） */
function airDrone(cls: 'drone' | 'car', px = 80, py = 100): DroneBase {
  return cls === 'drone'
    ? new JimsDroneProj(px * TILE, py * TILE, 0, 1)
    : new RemoteControlCarProj(px * TILE, py * TILE, 0, 1);
}

const VISION_INV = {
  armor: Array.from({ length: 20 }, (_v, i) => (i === 3 ? { id: VI_ID(5452) } : null)),
  effectiveSharedFrom: () => null,
  loadouts: [],
};
const NO_VISION_INV = { armor: [], effectiveSharedFrom: () => null, loadouts: [] };

// ---------------------------------------------------------------------------
// AI_195 JimsDrone（弹 1020）
// ---------------------------------------------------------------------------
describe('AI_195 JimsDrone（弹 1020）', () => {
  it('上键推力：(rotation−π/2) 方向 +0.5,重力 0.15 → 净 vy −0.35/tick（:41718-41721/:41734）', () => {
    const w = makeWorld();
    const d = airDrone('drone');
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, []);
    (g.player as { inputUp: boolean }).inputUp = true;
    d.ownerPlayer = g.player;
    const vy0 = d.vy;                     // 1（空中）
    d.fixedUpdate(1 / 60, g);
    expect(d.vy).toBeCloseTo(vy0 - 0.5 + 0.15, 6);
    expect(d.rotation).toBe(0);
  });

  it('空中转向：右键 rotation += ramp(local0 0..10)（:41722-41726）,松键停转', () => {
    const w = makeWorld();
    const d = airDrone('drone');
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, []);
    (g.player as { inputRight: boolean }).inputRight = true;
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    const r1 = d.rotation;
    expect(r1).toBeGreaterThan(0);
    d.fixedUpdate(1 / 60, g);
    const r2 = d.rotation;
    expect(r2).toBeGreaterThan(r1 * 2);           // local0=2 ramp 更大
    (g.player as { inputRight: boolean }).inputRight = false;
    d.fixedUpdate(1 / 60, g);
    expect(d.rotation).toBe(r2);                  // 松键归零 → 停转
  });

  it('落地态：转正 ×0.7、vx 阻尼 ×0.97（:41715-41717）', () => {
    const w = makeWorld();
    const d = new JimsDroneProj(80 * TILE, 200 * TILE - 6, 2, 0);   // 底缘贴地
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, []);
    d.ownerPlayer = g.player;
    d.rotation = 0.5;
    d.fixedUpdate(1 / 60, g);
    expect(d.rotation).toBeCloseTo(0.35, 6);      // 0.5×0.7
    const vx1 = d.vx;
    d.fixedUpdate(1 / 60, g);
    expect(d.vx).toBeCloseTo(vx1 * 0.97, 6);
  });

  it('无上键 vy>12 钳 ×0.95（:41737-41739）', () => {
    const w = makeWorld();
    const d = airDrone('drone');
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, []);
    d.ownerPlayer = g.player;
    d.vy = 12.1;
    d.fixedUpdate(1 / 60, g);
    expect(d.vy).toBeCloseTo((12.1 + 0.15) * 0.95, 6);   // 重力后钳（:41734 → :41737）
  });

  it('输入字节 ^gravDir：倒挂时左右互换（:41675-41682）', () => {
    const w = makeWorld();
    const d = airDrone('drone');
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, []);
    (g.player as { inputLeft: boolean }).inputLeft = true;
    (g.player as { gravDir: number }).gravDir = -1;
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(d.ai0 & 1).toBe(0);                    // left^flip = false
    expect(d.ai0 & 2).toBe(2);                    // right^flip = true
  });

  it('y−h ≤ 640 自毁 + Kill 单口 onProjectileDeath（:41667-41670/:71979）', () => {
    const w = makeWorld();
    const d = airDrone('drone', 80, 40);          // 顶 y=640−h → 触线
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, []);
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(d.dead).toBe(true);
    expect(rec.deaths.some((e) => e.projId === 1020)).toBe(true);
  });

  it('持机件门：HeldItem≠5451 → 当拍 Kill（:41671-41673）;持着 → 恒活（timeLeft 钉 2）', () => {
    const w = makeWorld();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(-1), rec, null, []);   // 空手
    const d = airDrone('drone');
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(d.dead).toBe(true);
    const rec2: Rec = { sfx: [], dust: [], deaths: [] };
    const g2 = makeGame(w, playerHolding(DRONE_ITEM_ID), rec2, null, []);
    const d2 = airDrone('drone');
    d2.ownerPlayer = g2.player;
    for (let i = 0; i < 30; i++) d2.fixedUpdate(1 / 60, g2);
    expect(d2.dead).toBe(false);
  });

  it('Track 归位：AI 逐帧 droneCameraTrack（:41688）→ tracker 持弹;装备门 5452', () => {
    const w = makeWorld();
    const tracker = new DroneCameraTracker();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, tracker, []);
    const d = airDrone('drone');
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    // 装备门关 → TryTracking null（且清 tracked——原版 :28 同相）
    expect(tracker.tryTracking(g.player, NO_VISION_INV)).toBeNull();
    // 下一拍 AI 再 Track（原版逐帧语义）→ 戴 5452 后跟拍中心 = 弹心
    d.fixedUpdate(1 / 60, g);
    const cam = tracker.tryTracking(g.player, VISION_INV);
    expect(cam).not.toBeNull();
    expect(Math.abs(cam!.x - d.cx)).toBeLessThan(0.001);
    expect(Math.abs(cam!.y - d.cy)).toBeLessThan(0.001);
  });

  it('撞壁反弹：|last|>1 轴 −last×0.25（HandleMovement :18167-18178）', () => {
    const w = makeWorld();
    const st = w.store;
    for (let j = 96; j <= 104; j++) st.setTileSilent(84, j, 1, 0, 0);   // 右侧墙 x=84
    const d = new JimsDroneProj(84 * TILE - 6, 100 * TILE, 5, 1);       // 右缘贴墙
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, []);
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(d.vx).toBeCloseTo(-1.25, 6);           // −5×0.25
  });

  it('引擎循环轨：推力包络驱动起轨 + killNow 停轨（:41704-41711/:71986）', () => {
    const w = makeWorld();
    const handles: Array<Record<string, unknown>> = [];
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(DRONE_ITEM_ID), rec, null, handles);
    const d = airDrone('drone');
    d.ownerPlayer = g.player;
    (g.player as { inputUp: boolean }).inputUp = true;
    d.fixedUpdate(1 / 60, g);
    expect(handles.length).toBe(1);
    const h = handles[0] as { name: string; vol: number; volumes: number[] };
    expect(h.name).toBe('jimsDrone');
    expect(h.vol).toBe(0.1);                      // SoundID.JimsDrone WithVolume 0.1
    expect(h.volumes.length).toBeGreaterThan(0);  // num4 逐帧透传
    d.killNow(g);
    expect((handles[0] as { stopped: boolean }).stopped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AI_205 RemoteControlCar（弹 1105）
// ---------------------------------------------------------------------------
describe('AI_205 RemoteControlCar（弹 1105）', () => {
  it('地面加速 ±0.3 + 换向 spriteDir（:39051-39054/:39126-39132）', () => {
    const w = makeWorld();
    const d = new RemoteControlCarProj(80 * TILE, 200 * TILE - 13, 0, 0);   // 贴地
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null, []);
    (g.player as { inputRight: boolean }).inputRight = true;
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(d.spriteDir).toBe(1);
    expect(d.vx).toBeGreaterThan(0);
  });

  it('跳边沿翻墙爬 mode：音 22(unlock)+尘 226×2;按住不重翻（:38795-38809）', () => {
    const w = makeWorld();
    const d = airDrone('car');
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null, []);
    (g.player as { inputJump: boolean }).inputJump = true;
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);                     // vy=1 ≠ 0 → 边沿受理
    expect(rec.sfx.some((s) => s.name === 'unlock')).toBe(true);
    expect(rec.dust.filter((x) => x.type === 226).length).toBe(2);
    expect(d.ai0 & 32).toBe(32);                  // mode bit5 置位
    d.fixedUpdate(1 / 60, g);                     // 按住 → 不重翻
    expect(rec.sfx.filter((s) => s.name === 'unlock').length).toBe(1);
    (g.player as { inputJump: boolean }).inputJump = false;
    d.fixedUpdate(1 / 60, g);
    (g.player as { inputJump: boolean }).inputJump = true;
    d.vy = 1;
    d.fixedUpdate(1 / 60, g);
    expect(rec.sfx.filter((s) => s.name === 'unlock').length).toBe(2);
    expect(d.ai0 & 32).toBe(0);                   // 翻回
  });

  it('贴地跳：速度 += (rotation−π/2)×6、当拍 grav=0（:39055-39059）', () => {
    const w = makeWorld();
    const d = new RemoteControlCarProj(80 * TILE, 200 * TILE - 13, 0, 0);
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null, []);
    (g.player as { inputJump: boolean }).inputJump = true;
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    // grounded && jump → vy = −6（rotation=0 → 推力 (0,−1)×6）;grav=0 → 无重力叠加
    expect(d.vy).toBeLessThan(0);
  });

  it('墙爬过渡：跳边沿起 mode + 心格带墙 → frame→4/dir=1（:38852-38861）', () => {
    const w = makeWorld();
    w.store.setWallSilent(80, 100, 1);            // 心格带墙（tile 保持空气）
    const d = new RemoteControlCarProj(80 * TILE, 100 * TILE, 0, 1);
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null, []);
    (g.player as { inputJump: boolean }).inputJump = true;
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);                     // vy≠0 → mode 翻 ON → 墙支 → 过渡
    expect(d.frame).toBe(4);
    expect(d.dir).toBe(1);
    expect(d.spriteDir).toBe(1);
  });

  it('持机件门 5738 + y≤640 自毁（:38787-38789/:38783-38786）', () => {
    const w = makeWorld();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(-1), rec, null, []);
    const d = airDrone('car');
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    expect(d.dead).toBe(true);
    const rec2: Rec = { sfx: [], dust: [], deaths: [] };
    const g2 = makeGame(w, playerHolding(CAR_ITEM_ID), rec2, null, []);
    const d2 = new RemoteControlCarProj(80 * TILE, 40 * TILE, 0, 1);
    d2.ownerPlayer = g2.player;
    d2.fixedUpdate(1 / 60, g2);
    expect(d2.dead).toBe(true);                   // y−h ≤ 640
    expect(rec2.deaths.some((e) => e.projId === 1105)).toBe(true);
  });

  it('Track 归位 + owner 门：本地弹逐帧 Track（:38825）', () => {
    const w = makeWorld();
    const tracker = new DroneCameraTracker();
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, tracker, []);
    const d = airDrone('car');
    d.ownerPlayer = g.player;
    d.fixedUpdate(1 / 60, g);
    const cam = tracker.tryTracking(g.player, VISION_INV);
    expect(cam).not.toBeNull();
    expect(Math.abs(cam!.x - d.cx)).toBeLessThan(0.001);
  });

  it('引擎循环轨 rcCar：RCCar WithVolume 0.015（:38995-38997/:1062）', () => {
    const w = makeWorld();
    const handles: Array<Record<string, unknown>> = [];
    const rec: Rec = { sfx: [], dust: [], deaths: [] };
    const g = makeGame(w, playerHolding(CAR_ITEM_ID), rec, null, handles);
    const d = airDrone('car');
    d.ownerPlayer = g.player;
    (g.player as { inputUp: boolean }).inputUp = true;
    d.fixedUpdate(1 / 60, g);
    // 空中非墙态 → floorBranch 推力档 100 → num4>0 → 起轨
    expect(handles.length).toBe(1);
    expect((handles[0] as { name: string }).name).toBe('rcCar');
    expect((handles[0] as { vol: number }).vol).toBe(0.015);
  });
});
