// 矿车轨道系统 1:1 探针（Minecart.cs 全量移植校验）
//   轨道 tile 314 帧语义：frameX = 前轨连接 ID(0-35)、frameY = 后轨(-1=0xFFFF)
//   平轨面高度 = 6px（默认子段高度 5 → (8-5)*2，Minecart.cs:117-123/437-447）
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  frameTrack, frameTrackArea, flipSwitchTrack, placeTrack,
  trackCollision, getOnTrack, onTrack, trackItemId,
  leftConnOf, rightConnOf, trackTypeOf, tileHeightAt,
  isPressureFrame, sourceRectOf, boosterAnimFrame,
  FLAG_ON_TRACK, FLAG_BOUNCY_BUMPER, FLAG_USED_RAMP,
  FLAG_BOOST_LEFT, FLAG_BOOST_RIGHT, PLAYER_DEFAULT_GRAVITY,
  type TrackRider,
} from '../src/world/MinecartTrack';
import { Minecart } from '../src/entities/Minecart';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';

const TRACK = TILE_BY_KEY['v_314_minecart_track'] ?? -1;
expect(TRACK).toBeGreaterThanOrEqual(0);

const W = 20, H = 52;              // 坐骑 hitbox（42 + heightBoost 10）
const FLAT_H = 6;                  // 平轨面高度（默认子段 (8-5)*2）

function mkStore(w = 40, h = 40): TileStore {
  return new TileStore(w, h);
}
/** 手写一帧轨道 */
function seg(st: TileStore, x: number, y: number, frame: number, back = -1): void {
  st.setTile(x, y, TRACK, frame, back < 0 ? 0xFFFF : back);
}
/** 放置链（WorldGen.PlaceTile case 314 → PlaceTrack + SquareTileFrame/邻接重定型） */
function line(st: TileStore, x0: number, y: number, n: number, style = 0): void {
  for (let k = 0; k < n; k++) {
    placeTrack(st, x0 + k, y, style);
    frameTrackArea(st, x0 + k, y);
  }
}
function rider(x: number, y: number, vx: number, vy: number): TrackRider {
  return { x, y, vx, vy, lastBoostX: 0, lastBoostY: 0 };
}
/** 把骑手放到 (tx,ty) 格内指定子段的轨面上。
 *  磁石位 = (x + 10, y + 52)；x 使磁石落在子段 s 起点 → 高度取该帧该子段 */
function seatSub(tx: number, ty: number, frame: number, s: number, vx: number): TrackRider {
  return rider(tx * 16 + s * 2 - 10, ty * 16 + tileHeightAt(frame, s) - 52, vx, PLAYER_DEFAULT_GRAVITY);
}
/** 平轨座位（子段 1） */
function seatFlat(tx: number, ty: number, vx: number): TrackRider {
  return seatSub(tx, ty, 1, 1, vx);
}
/** 一步物理 = TrackCollision（改速度+贴轨 Y）+ 外部位置积分（原版 DryCollision 段） */
function step(st: TileStore, r: TrackRider): number {
  r.vy = PLAYER_DEFAULT_GRAVITY;   // 每帧先加重力（Player.Update 时序）
  const bits = trackCollision(st, r, W, H, false, false, 0, false);
  r.x += r.vx;
  r.y += r.vy;
  return bits;
}

describe('帧族数据表（Minecart.Initialize 1:1）', () => {
  it('平轨 frame 1：左右皆 MIDDLE、全子段高度 6', () => {
    expect(leftConnOf(1)).toBe(1);
    expect(rightConnOf(1)).toBe(1);
    expect(trackTypeOf(1)).toBe(0);
    for (let s = 0; s < 8; s++) expect(tileHeightAt(1, s)).toBe(FLAT_H);
  });
  it('斜坡 frame 8：左 TOP 右 BOTTOM、高度 2px 步进 0→14', () => {
    expect(leftConnOf(8)).toBe(0);
    expect(rightConnOf(8)).toBe(2);
    expect(tileHeightAt(8, 0)).toBe(0);
    expect(tileHeightAt(8, 7)).toBe(14);
  });
  it('端段特殊值：frame 0 两端 OPEN_END(-4)、中段可站', () => {
    expect(tileHeightAt(0, 0)).toBe(-4);
    expect(tileHeightAt(0, 7)).toBe(-4);
    expect(tileHeightAt(0, 3)).toBe(FLAT_H);
  });
  it('斜坡起飞端 frame 16：子段 0/1 正常、2-7 RAMP_END(-3)', () => {
    expect(tileHeightAt(16, 0)).toBe(14);
    expect(tileHeightAt(16, 1)).toBe(12);
    expect(tileHeightAt(16, 2)).toBe(-3);
  });
  it('弹性挡板 frame 25：左平接、右端 BOUNCY_END(-2)', () => {
    expect(leftConnOf(25)).toBe(1);
    expect(rightConnOf(25)).toBe(-1);
    expect(tileHeightAt(25, 0)).toBe(FLAT_H);
    expect(tileHeightAt(25, 7)).toBe(-2);
  });
  it('压板 20-23 / 加速 30-35 分型正确', () => {
    for (const f of [20, 21, 22, 23]) expect(trackTypeOf(f)).toBe(1);
    for (const f of [30, 31, 32, 33, 34, 35]) expect(trackTypeOf(f)).toBe(2);
    expect(isPressureFrame(20)).toBe(true);
    expect(isPressureFrame(21)).toBe(true);
    expect(isPressureFrame(1)).toBe(false);
  });
  it('GetTrackItem：2340 普通 / 2492 压板 / 2739 加速', () => {
    expect(trackItemId(1)).toBe(2340);
    expect(trackItemId(21)).toBe(2492);
    expect(trackItemId(30)).toBe(2739);
  });
  it('GetSourceRect：纹理位 = 帧 ID × 18px 网格；加速帧行随动画滚动', () => {
    const f1 = sourceRectOf(1)!;
    expect(f1.sx).toBe(18);
    expect(f1.sy).toBe(0);
    const boost = sourceRectOf(30, 3)!;
    expect(boost.sx).toBe(36);
    expect(boost.sy).toBe(54 + 18 * 3);
    // 装饰帧 ID ≥ 36 忽略动画参数（Minecart.cs:1533 的 frameID<36 门）
    expect(sourceRectOf(37, 4)!.sy).toBe(108);
    expect(sourceRectOf(38)!.sy).toBe(126);
    expect(boosterAnimFrame()).toBeLessThan(5);
    expect(sourceRectOf(40)).toBeNull();
  });
});

describe('FrameTrack 放置定型（Minecart.FrameTrack 1:1）', () => {
  it('孤格 → 开放端 frame 0（左右皆 -1）', () => {
    const st = mkStore();
    line(st, 8, 8, 1);
    expect(st.frameX[st.idx(8, 8)]).toBe(0);
    expect(st.frameY[st.idx(8, 8)]).toBe(0xFFFF);
  });
  it('三连直轨：中段 frame 1（左右平接）、两端墙挡端盖 2/3（端段子段 -1）', () => {
    const st = mkStore();
    line(st, 8, 8, 3);
    const f = (x: number): number => st.frameX[st.idx(x, 8)];
    expect(f(9)).toBe(1);    // 左右平接
    // 单邻端盖：邻接面平接、悬空面墙挡（frame 2 = 左墙右平 / 3 = 左平右墙）
    expect(f(8)).toBe(2);
    expect(tileHeightAt(f(8), 0)).toBe(-1);
    expect(f(10)).toBe(3);
    expect(tileHeightAt(f(10), 7)).toBe(-1);
  });
  it('邻接重定型：补放第三格后旧端盖自动改道（frameTrackArea 六邻回写）', () => {
    const st = mkStore();
    line(st, 8, 8, 2);
    expect(st.frameX[st.idx(9, 8)]).toBe(3);   // 右端墙挡
    line(st, 10, 8, 1);
    expect(st.frameX[st.idx(9, 8)]).toBe(1);   // 变中段平接
  });
  it('压板轨道孤格保持压板型（frameTrack 不降级为普通）', () => {
    const st = mkStore();
    line(st, 8, 8, 1, 1);
    expect(trackTypeOf(st.frameX[st.idx(8, 8)])).toBe(1);
  });
  it('锤击（pound）：中段平轨可锤（true）但无第二同型全连接项 → 帧不变', () => {
    const st = mkStore();
    line(st, 8, 8, 3);
    const before = st.frameX[st.idx(9, 8)];
    expect(frameTrack(st, 9, 8, true)).toBe(true);
    expect(st.frameX[st.idx(9, 8)]).toBe(before);
  });
});

describe('FlipSwitchTrack（Minecart.FlipSwitchTrack 1:1）', () => {
  it('普通分叉轨：前/后轨互换', () => {
    const st = mkStore();
    line(st, 8, 8, 3);
    st.setTile(9, 8, TRACK, 1, 4);   // 分叉态：前平、后下行
    expect(flipSwitchTrack(st, 9, 8)).toBe(true);
    expect(st.frameX[st.idx(9, 8)]).toBe(4);
    expect(st.frameY[st.idx(9, 8)]).toBe(1);
  });
  it('无后轨的普通轨：不翻转返回 false', () => {
    const st = mkStore();
    line(st, 8, 8, 3);
    expect(flipSwitchTrack(st, 9, 8)).toBe(false);
  });
  it('孤格加速轨：pound 无同型备选 → false 且保持加速型', () => {
    const st = mkStore();
    line(st, 8, 8, 1, 2);   // 左加速 31
    const before = st.frameX[st.idx(8, 8)];
    expect(trackTypeOf(before)).toBe(2);
    expect(flipSwitchTrack(st, 8, 8)).toBe(false);
    expect(st.frameX[st.idx(8, 8)]).toBe(before);
  });
});

describe('TrackCollision 轨道运动学（Minecart.TrackCollision 1:1）', () => {
  it('直段：贴轨前进、vy 清零、onTrack 位', () => {
    const st = mkStore();
    line(st, 8, 12, 10);
    const r = seatFlat(9, 12, 3);
    let bits = 0;
    for (let t = 0; t < 5; t++) bits = step(st, r);
    expect(bits & (1 << FLAG_ON_TRACK)).toBeTruthy();
    expect(r.vx).toBeCloseTo(3, 5);
    expect(r.vy).toBe(0);
    expect(r.x).toBeGreaterThan(9 * 16);
    // 磁石位贴轨面（y + 52 = 12*16 + 6）
    expect(r.y + 52).toBeCloseTo(12 * 16 + FLAT_H, 1);
  });
  it('直段多 tick 匀速：位置推进 ≈ vx × N', () => {
    const st = mkStore();
    line(st, 8, 12, 20);
    const r = seatFlat(9, 12, 5);
    for (let t = 0; t < 30; t++) {
      step(st, r);
      expect(r.vy).toBe(0);
    }
    expect(r.x - (9 * 16 + 2 - 10)).toBeCloseTo(5 * 30, 1);
  });
  it('斜坡：沿面下行 y 随 x 增加、保持 onTrack、速度不增不衰', () => {
    const st = mkStore();
    for (let k = 0; k < 6; k++) seg(st, 10 + k, 10, 8);   // 左高右低 0→14
    const r = seatSub(10, 10, 8, 1, 4);
    const y0 = r.y;
    let onTrackSeen = false;
    for (let t = 0; t < 60; t++) {
      const bits = step(st, r);
      if (bits & (1 << FLAG_ON_TRACK)) onTrackSeen = true;
      if (r.x > 14 * 16) break;
    }
    expect(onTrackSeen).toBe(true);
    expect(r.y).toBeGreaterThan(y0);   // 下行
    expect(r.vx).toBeCloseTo(4, 3);    // 原版沿轨不改变速率
  });
  it('斜坡起飞端（RAMP_END -3）：脱轨跳跃 vy = -|vx|/√2（上行）、vx 保持', () => {
    const st = mkStore();
    seg(st, 10, 10, 16);   // L=BOTTOM、子段 2-7 RAMP_END → 向右走上抛
    const r = seatSub(10, 10, 16, 1, 8);   // 子段 1（高度 12）
    let ramp = false;
    for (let t = 0; t < 30 && !ramp; t++) {
      const bits = step(st, r);
      if (bits & (1 << FLAG_USED_RAMP)) ramp = true;
    }
    expect(ramp).toBe(true);
    expect(r.vx).toBe(8);                                  // 水平保持（Minecart.cs:698）
    expect(r.vy).toBeCloseTo(-8 * Math.SQRT1_2, 3);        // 垂直 = ±|vx|/√2
  });
  it('开放端（OPEN_END -4）：脱轨下落 vy = defaultGravity', () => {
    const st = mkStore();
    line(st, 8, 12, 2);
    seg(st, 10, 12, 14);   // 左开放端（L=-1,R=1，左端子段 -4）
    frameTrack(st, 9, 12, false);   // 左邻端盖改道回平接
    const r = seatFlat(8, 12, 6);
    let derailed = false;
    for (let t = 0; t < 120 && !derailed; t++) {
      const bits = step(st, r);
      if (!(bits & (1 << FLAG_ON_TRACK))) derailed = true;
    }
    expect(derailed).toBe(true);
    expect(r.vy).toBe(PLAYER_DEFAULT_GRAVITY);   // Minecart.cs:911
    expect(r.vx).toBeGreaterThan(0);
  });
  it('墙挡端（BUMPER_END -1）：到端急停（速度清零、不穿透）', () => {
    const st = mkStore();
    line(st, 8, 12, 3);   // 右端盖 = frame 3（右端子段 -1）
    expect(tileHeightAt(st.frameX[st.idx(10, 12)], 7)).toBe(-1);
    const r = seatFlat(8, 12, 6);
    let stopped = false;
    for (let t = 0; t < 120 && !stopped; t++) {
      step(st, r);
      if (r.vx === 0) stopped = true;
    }
    expect(stopped).toBe(true);
    expect(r.x).toBeLessThan(11 * 16);   // 未穿透端盖
  });
  it('弹性挡板（BOUNCY_END -2）：水平反弹 + FLAG_BouncyBumper', () => {
    const st = mkStore();
    line(st, 8, 12, 2);
    seg(st, 10, 12, 25);   // 右端弹性挡板
    frameTrack(st, 9, 12, false);   // 左邻端盖改道回平接（勿动本格弹性帧）
    const r = seatFlat(8, 12, 7);
    let bounced = false;
    for (let t = 0; t < 120 && !bounced; t++) {
      const bits = step(st, r);
      if (bits & (1 << FLAG_BOUNCY_BUMPER)) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(r.vx).toBe(-7);   // Minecart.cs:920 Velocity.X 取反
  });
  it('加速轨道：BOOST 位 + lastBoost 同格去重', () => {
    const st = mkStore();
    line(st, 8, 12, 2);
    seg(st, 10, 12, 30);    // boostRight（frame 30）
    seg(st, 11, 12, 1);
    frameTrack(st, 9, 12, false);   // 左邻端盖改道回平接（本格加速帧保持 30）
    const boostFrame = st.frameX[st.idx(10, 12)];
    expect(trackTypeOf(boostFrame)).toBe(2);
    const r = seatFlat(8, 12, 3);
    let boosted = false;
    for (let t = 0; t < 120 && !boosted; t++) {
      const bits = step(st, r);
      if (bits & (1 << FLAG_BOOST_LEFT) || bits & (1 << FLAG_BOOST_RIGHT)) {
        boosted = true;
        // 原地不动（vx=0 → 不跨格）：lastBoost 已记同格 → 不再置位
        const save = { x: r.x, y: r.y };
        r.vx = 0; r.vy = 0;
        const again = trackCollision(st, r, W, H, false, false, 0, false);
        expect(again & (1 << FLAG_BOOST_LEFT)).toBeFalsy();
        expect(again & (1 << FLAG_BOOST_RIGHT)).toBeFalsy();
        r.x = save.x; r.y = save.y;
      }
    }
    expect(boosted).toBe(true);
  });
  it('压板轨道：FLAG_HitSwitch（Wiring.HitSwitch 钩）', () => {
    const st = mkStore();
    line(st, 8, 12, 2);
    seg(st, 10, 12, 21);   // 压板平段
    frameTrack(st, 9, 12, false);   // 左邻端盖改道回平接
    const r = seatFlat(8, 12, 4);
    let hit = false;
    for (let t = 0; t < 120 && !hit; t++) {
      const bits = step(st, r);
      if (bits & 8) hit = true;   // FLAG_HIT_SWITCH = bit3
    }
    expect(hit).toBe(true);
  });
});

describe('上轨吸附（Minecart.GetOnTrack / OnTrack 1:1）', () => {
  it('GetOnTrack：吸附到最近有效子段的轨面', () => {
    const st = mkStore();
    seg(st, 8, 8, 1);
    const pos = getOnTrack(st, 8, 8, 8 * 16 + 4, 8 * 16 - 20, W, H);
    expect(pos).not.toBeNull();
    // 磁石位 = pos.y + 52 → 轨面 8*16+6
    expect(pos!.y + 52).toBeCloseTo(8 * 16 + FLAT_H, 1);
  });
  it('OnTrack：磁石位所在格判定', () => {
    const st = mkStore();
    seg(st, 8, 8, 1);
    // 磁石位 (x+10, y+52) 落在 (8,8)
    expect(onTrack(st, 8 * 16 + 4 - 10, 8 * 16 + FLAT_H - 52, W, H)).toBe(true);
    expect(onTrack(st, 2 * 16, 2 * 16, W, H)).toBe(false);
  });
  it('端段全无效的帧（RAMP_END 段）向前/向后找最近有效子段', () => {
    const st = mkStore();
    seg(st, 8, 8, 16);   // 子段 0/1 有效、2-7 RAMP_END
    const pos = getOnTrack(st, 8, 8, 8 * 16 + 14, 8 * 16, W, H);   // 磁石 x 落子段 7
    expect(pos).not.toBeNull();
    expect(pos!.y + 52).toBeLessThan(8 * 16 + 14);   // 吸到子段 0/1 的更高轨面
  });
});

describe('Minecart 坐骑实体（Mount 6 + 每帧 TrackCollision）', () => {
  /** 最小 GameHooks 桩：只供实体读输入/写回玩家/播声 */
  function mkHooks(st: TileStore, p: Player): GameHooks {
    return {
      world: { store: st } as unknown as GameHooks['world'],
      player: p,
      enemies: () => [],
      critters: () => [],
      spawnDrop: () => null,
      damagePlayer: () => {},
      addDamageNumber: () => {},
      cutTile: () => {},
      onEnemyKilled: () => {},
      spawnEnemy: () => {},
      spawnParticles: () => {},
      notifyInventoryChanged: () => {},
      playSfx: () => {},
      playSfxFiles: () => {},
      showPickupLabel: () => {},
      hitTrackSwitch: () => {},
    };
  }
  function mkPlayer(): Player {
    const inv = new Inventory();
    const p = new Player(0, 0, inv);
    return p;
  }
  function mountedCart(st: TileStore, tx: number, ty: number): { cart: Minecart; p: Player; game: GameHooks } {
    const p = mkPlayer();
    const cart = new Minecart();
    const snap = getOnTrack(st, tx, ty, tx * 16, ty * 16 - 40, cart.w, cart.h);
    cart.x = snap ? snap.x : tx * 16;
    cart.y = snap ? snap.y : ty * 16 + FLAT_H - cart.h;
    cart.mounted = true;
    return { cart, p, game: mkHooks(st, p) };
  }

  it('上轨 + 持右：贴轨加速（0.04/tick，上限 13），玩家坐骑位回写', () => {
    const st = mkStore(60, 40);
    line(st, 8, 12, 30);
    const { cart, p, game } = mountedCart(st, 9, 12);
    p.inputX = 1;
    const x0 = cart.x;
    for (let t = 0; t < 120; t++) cart.fixedUpdate(1 / 60, game);
    expect(cart.onTrackNow).toBe(true);
    expect(cart.vx).toBeGreaterThan(3);          // ~0.04×120（贴轨期全额累积）
    expect(cart.vx).toBeLessThanOrEqual(13);     // maxRunSpeed 上限
    expect(cart.x).toBeGreaterThan(x0 + 100);
    expect(p.x).toBe(cart.x);                    // 坐骑位锁定
    expect(p.y).toBe(cart.y);
    expect(p.onGround).toBe(true);
    expect(p.vy).toBe(0);
  });
  it('松开输入：速度保持（原版车上无摩擦，Player.cs:19546 起无 else 衰减分支）', () => {
    const st = mkStore(60, 40);
    line(st, 8, 12, 30);
    const { cart, p, game } = mountedCart(st, 9, 12);
    p.inputX = 1;
    for (let t = 0; t < 60; t++) cart.fixedUpdate(1 / 60, game);
    const vx = cart.vx;
    p.inputX = 0;
    for (let t = 0; t < 30; t++) cart.fixedUpdate(1 / 60, game);
    expect(cart.vx).toBeCloseTo(vx, 5);
  });
  it('跳跃（松键重按门）：vy = -5.15、jump = 15；按住续推', () => {
    const st = mkStore(60, 40);
    line(st, 8, 12, 30);
    const { cart, p, game } = mountedCart(st, 9, 12);
    // 先贴轨稳定
    for (let t = 0; t < 5; t++) cart.fixedUpdate(1 / 60, game);
    p.inputJump = true;
    cart.fixedUpdate(1 / 60, game);
    // 原版时序：JumpMovement 先置 -jumpSpeed，重力段其后 +0.4（Player.cs:26422→27033）
    expect(cart.vy).toBeCloseTo(-5.15 + 0.4, 5);
    expect(cart.jump).toBe(15);
    cart.fixedUpdate(1 / 60, game);   // 按住续推（jump>0 段每帧重置 -jumpSpeed）
    expect(cart.vy).toBeCloseTo(-5.15 + 0.4, 5);
    expect(cart.jump).toBe(14);
  });
  it('反向输入：先 runSlowdown 抵消再加速（Player.cs:19567-19573）', () => {
    const st = mkStore(60, 40);
    line(st, 8, 12, 30);
    const { cart, p, game } = mountedCart(st, 9, 12);
    p.inputX = 1;
    for (let t = 0; t < 90; t++) cart.fixedUpdate(1 / 60, game);
    const vx = cart.vx;
    p.inputX = -1;
    cart.fixedUpdate(1 / 60, game);
    // 反推一帧 = -(runSlowdown 0.2 + accel 0.04)
    expect(cart.vx).toBeCloseTo(vx - 0.24, 5);
  });
  it('加速轨道过车：trackBoost ∓/±4 并入（下帧生效、钳 ±13）', () => {
    const st = mkStore(60, 40);
    line(st, 8, 12, 2);
    seg(st, 10, 12, 30);
    seg(st, 11, 12, 1);
    frameTrack(st, 9, 12, false);
    const { cart, p, game } = mountedCart(st, 8, 12);
    p.inputX = 1;
    let sawBoost = false;
    for (let t = 0; t < 300; t++) {
      cart.fixedUpdate(1 / 60, game);
      if (cart.trackBoost !== 0) sawBoost = true;
      if (sawBoost && cart.trackBoost === 0) break;   // 已并入
    }
    expect(sawBoost).toBe(true);
  });
});

// 车上接触伤害（Mount 6 玩家 hitbox 即车 20×52，heightBoost 10——Mount.cs mounts[6]）：
// TouchDamage 采样盒必须用坐骑盒；20×42 玩家盒会漏掉车底 10px（贴轨尖刺扫不到）
import { World } from '../src/world/World';
import { BuffType } from '../src/stats/Buffs';
import { TILE } from '../src/core/constants';

describe('骑乘接触伤害（HurtTiles 采样盒 = 坐骑盒）', () => {
  /** 尖刺格 (20,30)（y ∈ [480,496)）+ 车底探入 4px 的坐骑/玩家对（世界高 120：
   *  HurtTiles 扫描上界 h-40 须 >30 才扫得到该行，Collision.cs:3128）
   *  车盒底 = 480+4 = 484（命中）；42px 玩家盒底 = 474（差 10px 不中） */
  function setup(): { world: World; p: Player; cart: Minecart } {
    const world = new World(60, 120, 42, 'cart-spike');
    const spike = TILE_BY_KEY['v_48_spike'];
    expect(spike).toBeGreaterThanOrEqual(0);
    world.store.setTileSilent(20, 30, spike);
    const cart = new Minecart();
    cart.x = 20 * TILE; cart.y = 480 - 48;   // 车底 484：探入尖刺上缘 4px
    const p = new Player(cart.x, cart.y, new Inventory());
    return { world, p, cart };
  }

  function hooksFor(w: World, p: Player): GameHooks {
    return {
      world: w, player: p,
      enemies: () => [], critters: () => [],
      spawnDrop: () => null,
      damagePlayer: () => {},
      addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    } as unknown as GameHooks;
  }

  it('骑乘中：车底 10px 内的尖刺照常结算（直接伤 + 流血）', () => {
    const { world, p, cart } = setup();
    const hp0 = p.hp;
    p.ridingCart = true;
    p.cart = cart;
    p.fixedUpdate(1 / 60, hooksFor(world, p));
    expect(p.hp).toBeLessThan(hp0);                          // 尖刺 60 直伤
    expect(p.buffs.has(BuffType.Bleeding)).toBe(true);       // TouchDamageBleeding 48
  });

  it('不骑乘对照：同位置 42px 玩家盒差 10px 接不到尖刺（首 tick 无伤）', () => {
    const { world, p } = setup();
    const hp0 = p.hp;
    p.fixedUpdate(1 / 60, hooksFor(world, p));               // 未骑乘：移动积分前采样
    expect(p.hp).toBe(hp0);
    expect(p.buffs.has(BuffType.Bleeding)).toBe(false);
  });
});
