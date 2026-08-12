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
    frameTrackArea(st, 10, 12);
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
