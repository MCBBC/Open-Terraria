// 矿车轨道系统 1:1 探针（Minecart.cs 全量移植校验）
//   轨道 tile 314 帧语义：frameX = 前轨连接 ID(0-35)、frameY = 后轨(-1=0xFFFF)
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  TRACK_TILE, frameTrack, frameTrackArea, flipSwitchTrack, placeTrack,
  trackCollision, getOnTrack, onTrack, trackItemId,
  leftConnOf, rightConnOf, trackTypeOf, tileHeightAt,
  isPressureFrame, sourceRectOf, boosterAnimFrame,
  FLAG_ON_TRACK, FLAG_BOUNCY_BUMPER, FLAG_USED_RAMP,
  FLAG_BOOST_LEFT, FLAG_BOOST_RIGHT, PLAYER_DEFAULT_GRAVITY,
  type TrackRider,
} from '../src/world/MinecartTrack';

const TRACK = TILE_BY_KEY['v_314_minecart_track'] ?? -1;
expect(TRACK).toBeGreaterThanOrEqual(0);

function mkStore(w = 24, h = 24): TileStore {
  return new TileStore(w, h);
}
/** 平轨一格（frame 1 = 左右皆平接） */
function flat(st: TileStore, x: number, y: number): void {
  st.setTile(x, y, TRACK, 1, 0xFFFF);
}
/** 直线轨道：n 格，全部走 placeTrack + frameTrackArea（放置链） */
function line(st: TileStore, x0: number, y: number, n: number, style = 0): void {
  for (let k = 0; k < n; k++) {
    placeTrack(st, x0 + k, y, style);
    frameTrackArea(st, x0 + k, y);
  }
}
function rider(x: number, y: number, vx: number, vy: number): TrackRider {
  return { x, y, vx, vy, lastBoostX: 0, lastBoostY: 0 };
}
/** 坐骑 hitbox（Mount：20×52）落在平轨轨面上的初始位：轨面 = y*16+14（frame 1 高度 14），
 *  磁石位 = 位 + (10,52) → 位.y = y*16+14-52 */
function onFlat(x: number, ty: number, vx: number): TrackRider {
  return rider(x, ty * 16 + 14 - 52, vx, PLAYER_DEFAULT_GRAVITY);
}

describe('帧族数据表（Minecart.Initialize 1:1）', () => {
  it('平轨 frame 1：左右皆 MIDDLE、无贴轨偏移', () => {
    expect(leftConnOf(1)).toBe(1);
    expect(rightConnOf(1)).toBe(1);
    expect(trackTypeOf(1)).toBe(0);
    for (let s = 0; s < 8; s++) expect(tileHeightAt(1, s)).toBe(14);
  });
  it('斜坡 frame 8：左 TOP 右 BOTTOM、高度 2px 步进 0→14', () => {
    expect(leftConnOf(8)).toBe(0);
    expect(rightConnOf(8)).toBe(2);
    expect(tileHeightAt(8, 0)).toBe(0);
    expect(tileHeightAt(8, 7)).toBe(14);
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
    const decor = sourceRectOf(37, 4)!;
    expect(decor.sy).toBe(108);
    expect(boosterAnimFrame()).toBeGreaterThanOrEqual(0);
    expect(boosterAnimFrame()).toBeLessThan(5);
  });
});

describe('FrameTrack 放置定型（Minecart.FrameTrack 1:1）', () => {
  it('孤格 → 开放端 frame 0（左右皆 -1）', () => {
    const st = mkStore();
    placeTrack(st, 8, 8, 0);
    frameTrackArea(st, 8, 8);
    expect(st.frameX[st.idx(8, 8)]).toBe(0);
    expect(st.frameY[st.idx(8, 8)]).toBe(0xFFFF);
  });
  it('三连直轨：中段 frame 1（左右平接）、两端开放端盖 14/15', () => {
    const st = mkStore();
    line(st, 8, 8, 3);
    const f = (x: number): number => st.frameX[st.idx(x, 8)];
    expect(f(8)).toBe(14);   // 仅右邻 → 左开放（L=-1,R=1）
    expect(f(9)).toBe(1);    // 左右平接
    expect(f(10)).toBe(15);  // 仅左邻 → 右开放（L=1,R=-1）
  });
  it('压板轨道孤格保持压板型（frameTrack 不降级为普通）', () => {
    const st = mkStore();
    placeTrack(st, 8, 8, 1);   // style 1 → firstPressureFrame 20
    frameTrackArea(st, 8, 8);
    expect(trackTypeOf(st.frameX[st.idx(8, 8)])).toBe(1);
  });
  it('锤击（pound）在无可切换项时返回 false 不改帧', () => {
    const st = mkStore();
    placeTrack(st, 8, 8, 0);
    frameTrackArea(st, 8, 8);
    const before = st.frameX[st.idx(8, 8)];
    expect(frameTrack(st, 8, 8, true)).toBe(false);
    expect(st.frameX[st.idx(8, 8)]).toBe(before);
  });
});

describe('FlipSwitchTrack（Minecart.FlipSwitchTrack 1:1）', () => {
  it('普通分叉轨：前/后轨互换', () => {
    const st = mkStore();
    line(st, 8, 8, 3);
    // 中段手动加后轨（分叉态：前 1 平、后 4 下行）
    st.setTile(9, 8, TRACK, 1, 4);
    expect(flipSwitchTrack(st, 9, 8)).toBe(true);
    expect(st.frameX[st.idx(9, 8)]).toBe(4);
    expect(st.frameY[st.idx(9, 8)]).toBe(1);
  });
  it('加速轨：pound 循环换加速向', () => {
    const st = mkStore();
    placeTrack(st, 8, 8, 2);   // 左加速 31
    frameTrackArea(st, 8, 8);
    const before = st.frameX[st.idx(8, 8)];
    expect(trackTypeOf(before)).toBe(2);
    expect(flipSwitchTrack(st, 8, 8)).toBe(true);
    const after = st.frameX[st.idx(8, 8)];
    expect(trackTypeOf(after)).toBe(2);
    // 单格加速轨 pound 无第二同型项 → 不变（num9<2 && num10<2 → false）
    expect(after).toBe(before);
  });
  it('无后轨的普通轨：不翻转返回 false', () => {
    const st = mkStore();
    line(st, 8, 8, 3);
    expect(st.frameY[st.idx(9, 8)]).toBe(0xFFFF);
    expect(flipSwitchTrack(st, 9, 8)).toBe(false);
  });
});

describe('TrackCollision 轨道运动学（Minecart.TrackCollision 1:1）', () => {
  it('直段：贴轨前进、vy 清零、onTrack 位置', () => {
    const st = mkStore(40, 24);
    line(st, 4, 12, 20);
    const r = onFlat(4 * 16 + 2, 12, 3);
    const bits = trackCollision(st, r, 20, 52, false, false, 0, false);
    expect(bits & (1 << FLAG_ON_TRACK)).toBeTruthy();
    expect(r.vx).toBeCloseTo(3, 5);
    expect(r.vy).toBe(0);
    expect(r.x).toBeGreaterThan(4 * 16);
    // 轨面：格底上 2px（frame 1 高度 14）→ 磁石 y = 12*16+14
    expect(r.y + 52 / 2 + 26 - (12 * 16 + 14)).toBeLessThan(2);
  });
  it('直段多 tick 匀速：位置推进 ≈ vx × N', () => {
    const st = mkStore(40, 24);
    line(st, 4, 12, 20);
    const r = onFlat(4 * 16 + 2, 12, 5);
    let x0 = r.x;
    for (let t = 0; t < 30; t++) {
      r.vy = PLAYER_DEFAULT_GRAVITY;   // 每帧先加重力（Player.Update 时序）
      trackCollision(st, r, 20, 52, false, false, 0, false);
      expect(r.vy).toBe(0);
    }
    expect(r.x - x0).toBeCloseTo(5 * 30, 0);
  });
  it('斜坡：沿面下行 y 随 x 增加、保持 onTrack、速度不增不衰', () => {
    const st = mkStore(40, 40);
    // 构造下行斜坡：frame 8（左高右低）×5 连续——手写帧模拟原版斜坡段
    for (let k = 0; k < 5; k++) {
      st.setTile(10 + k, 10, TRACK, 8, 0xFFFF);
    }
    // 入口：从左侧平轨进入（frame 1 @ (9,9)? 简化直接在斜坡首格上方放置）
    const r = rider(10 * 16, 10 * 16 + 0 - 52 + 26 - 26, 4, PLAYER_DEFAULT_GRAVITY);
    r.y = 10 * 16 - 52 + 52 / 2 + 26 - 26 - 26 + 26 - 26 + 26 - 26; // 对齐斜坡首段高度 0
    r.y = 10 * 16 + 0 - 52 / 2 - 26 + 52 / 2 + 26 - 52 / 2 - 26 + 52 / 2 + 26 - 52 / 2 - 26 + 52 / 2 + 26 - 52 / 2 - 26 + 52 / 2;
    r.y = 10 * 16 - 26;   // 磁石位 = y+52 → 10*16+0 处首子段高度 0
    const y0 = r.y;
    let onTrackSeen = false;
    for (let t = 0; t < 40; t++) {
      r.vy = PLAYER_DEFAULT_GRAVITY;
      const bits = trackCollision(st, r, 20, 52, false, false, 0, false);
      if (bits & (1 << FLAG_ON_TRACK)) onTrackSeen = true;
      if (r.x > 15 * 16) break;
    }
    expect(onTrackSeen).toBe(true);
    expect(r.y).toBeGreaterThan(y0);   // 下行
    expect(r.vx).toBeCloseTo(4, 3);    // 原版沿轨不改变速率
  });
  it('斜坡起飞端（RampEnd -3）：脱轨跳跃 vy = |vx|/√2、vx 保持', () => {
    const st = mkStore(40, 40);
    // frame 16：左 BOTTOM 接入 + 右端 RAMP_END（上行起飞）
    st.setTile(10, 10, TRACK, 16, 0xFFFF);
    const r = rider(10 * 16 + 2, 10 * 16 + 2 - 52 / 2 - 26 + 52 / 2 + 26 - 26 + 26 - 26, 8, 0);
    r.y = 10 * 16 + 2 - 26;   // 磁石位落在首子段（高度 2）
    let ramp = false;
    for (let t = 0; t < 20 && !ramp; t++) {
      r.vy = PLAYER_DEFAULT_GRAVITY;
      const bits = trackCollision(st, r, 20, 52, false, false, 0, false);
      if (bits & (1 << FLAG_USED_RAMP)) ramp = true;
    }
    expect(ramp).toBe(true);
    expect(r.vx).toBe(8);                                  // 水平速度保持（Minecart.cs:698）
    expect(r.vy).toBeCloseTo(-8 * Math.SQRT1_2, 3);        // 垂直 = ±|vx|/√2
  });
  it('开放端（OpenEnd -4）：脱轨下落 vy = defaultGravity', () => {
    const st = mkStore(40, 24);
    // 平轨一截 + 端点开放帧 14（右开放）
    line(st, 8, 12, 3);
    const r = onFlat(9 * 16, 12, 6);
    let derailed = false;
    for (let t = 0; t < 30 && !derailed; t++) {
      r.vy = PLAYER_DEFAULT_GRAVITY;
      const bits = trackCollision(st, r, 20, 52, false, false, 0, false);
      if (!(bits & (1 << FLAG_ON_TRACK))) derailed = true;
    }
    expect(derailed).toBe(true);
    expect(r.vy).toBe(PLAYER_DEFAULT_GRAVITY);   // Minecart.cs:911
    expect(r.vx).toBeGreaterThan(0);
  });
  it('弹性挡板（-2）：水平反弹 + FLAG_BouncyBumper', () => {
    const st = mkStore(40, 24);
    // 平轨 + 右端弹性挡板帧 25（L=1,R=-1，右端 -2）
    line(st, 8, 12, 2);
    st.setTile(10, 12, TRACK, 25, 0xFFFF);
    const r = onFlat(8 * 16, 12, 7);
    let bounced = false;
    for (let t = 0; t < 40 && !bounced; t++) {
      r.vy = PLAYER_DEFAULT_GRAVITY;
      const bits = trackCollision(st, r, 20, 52, false, false, 0, false);
      if (bits & (1 << FLAG_BOUNCY_BUMPER)) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(r.vx).toBe(-7);    // Minecart.cs:920 Velocity.X 取反
  });
  it('加速轨道：BOOST 位 + lastBoost 同格去重', () => {
    const st = mkStore(40, 24);
    // 左侧平轨 + 加速带（frame 30 = boostRight）+ 右侧平轨
    line(st, 8, 12, 2);
    st.setTile(10, 12, TRACK, 30, 0xFFFF);
    st.setTile(11, 12, TRACK, 1, 0xFFFF);
    frameTrackArea(st, 10, 12);
    frameTrackArea(st, 11, 12);
    // frameTrack 可能把 30 定型为其他同型帧——只要还是加速型即可
    const boostFrame = st.frameX[st.idx(10, 12)];
    expect(trackTypeOf(boostFrame)).toBe(2);
    const r = onFlat(8 * 16, 12, 3);
    let boosted = false;
    for (let t = 0; t < 60 && !boosted; t++) {
      r.vy = PLAYER_DEFAULT_GRAVITY;
      const bits = trackCollision(st, r, 20, 52, false, false, 0, false);
      if (bits & (1 << FLAG_BOOST_LEFT) || bits & (1 << FLAG_BOOST_RIGHT)) {
        boosted = true;
        // 同 tick 内不会再给（lastBoost 已记）——下一 tick 仍在原格时不再置位
        r.vy = 0;
        r.vx = 0;
        r.x -= 0.001;   // 原地不动（vx=0 → 不跨格）
        const again = trackCollision(st, r, 20, 52, false, false, 0, false);
        expect(again & (1 << FLAG_BOOST_LEFT)).toBeFalsy();
        expect(again & (1 << FLAG_BOOST_RIGHT)).toBeFalsy();
      }
    }
    expect(boosted).toBe(true);
  });
  it('压板轨道：FLAG_HitSwitch（Wiring.HitSwitch 钩）', () => {
    const st = mkStore(40, 24);
    line(st, 8, 12, 2);
    st.setTile(10, 12, TRACK, 21, 0xFFFF);   // 压板平段
    const r = onFlat(8 * 16, 12, 4);
    let hit = false;
    for (let t = 0; t < 60 && !hit; t++) {
      r.vy = PLAYER_DEFAULT_GRAVITY;
      const bits = trackCollision(st, r, 20, 52, false, false, 0, false);
      if (bits & (1 << 3)) hit = true;   // FLAG_HIT_SWITCH
    }
    expect(hit).toBe(true);
  });
});

describe('上轨吸附（Minecart.GetOnTrack / OnTrack 1:1）', () => {
  it('GetOnTrack：吸附到最近有效子段的轨面', () => {
    const st = mkStore();
    flat(st, 8, 8);
    const pos = getOnTrack(st, 8, 8, 8 * 16 + 4, 8 * 16 - 20, 20, 52);
    expect(pos).not.toBeNull();
    // 轨面 y = 8*16+14；pos.y + 52/2 + 26 = 轨面
    expect(pos!.y + 52 / 2 + 26).toBeCloseTo(8 * 16 + 14, 1);
  });
  it('OnTrack：磁石位所在格判定', () => {
    const st = mkStore();
    flat(st, 8, 8);
    // 磁石位 = (x+10, y+52) 落在 (8,8)
    expect(onTrack(st, 8 * 16 + 4 - 10 + 2, 8 * 16 + 14 - 52, 20, 52)).toBe(true);
    expect(onTrack(st, 2 * 16, 2 * 16, 20, 52)).toBe(false);
  });
  it('端点开放帧（frame 0 无有效子段）不可吸附', () => {
    const st = mkStore();
    st.setTile(8, 8, TRACK, 0, 0xFFFF);
    const pos = getOnTrack(st, 8, 8, 8 * 16, 8 * 16, 20, 52);
    expect(pos).toBeNull();
  });
});
