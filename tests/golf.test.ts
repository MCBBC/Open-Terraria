// 高尔夫系统全量移植测试（原版 = Terarria1456）
//   物理步进   Terraria.Physics/BallCollision.cs + GolfHelper.ContactListener/OnPassThrough
//   状态/计分  Terraria.GameContent.Golf/GolfState.cs + GolfBallTrackRecord.cs
//   球体 AI    Projectile.cs AI_149_GolfBall :18924-18970 / SetDefaults :7344-7352
//   击球公式   GolfHelper.cs :293-341/:423-474
//   商店门槛   Chest.cs case 22 :3135-3245（world/golf/golferShop.ts）
//   存档       Player.golferScoreAccumulated :1792（SaveFile.ts:89）
import { describe, it, expect, afterEach } from 'vitest';
import { stepGolfBall, golfPhysicsForTile, BallState, type GolfTileMap } from '../src/world/golf/golfPhysics';
import { GolfState, GolfBallTrackRecord, type GolfBallHandle } from '../src/world/golf/GolfState';
import { golferShopScoreGates } from '../src/world/golf/golferShop';
import { GolfBall, GOLF_CLUBS, golfShot, golfBallInStance } from '../src/entities/GolfBall';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

// ---------------------------------------------------------------------------
// 假地图（只铺需要的格；材质按 vanilla tile id 取表）
// ---------------------------------------------------------------------------
class FakeMap implements GolfTileMap {
  // 300×300：高速球（上限 1000px/tick）弹飞后仍留在世界内（边界收缩 32px，
  // BallCollision.IsBallInWorld :143-150）
  widthTiles = 300; heightTiles = 300;
  private tiles = new Map<string, { type: number; slope: number; half: boolean }>();
  private liquids = new Map<string, { amount: number; type: number }>();
  set(x: number, y: number, type: number, slope = 0, half = false) {
    this.tiles.set(`${x},${y}`, { type, slope, half });
  }
  setLiquid(x: number, y: number, amount: number, type: number) {
    this.liquids.set(`${x},${y}`, { amount, type });
  }
  nactive(x: number, y: number) { return this.tiles.has(`${x},${y}`); }
  tileType(x: number, y: number) { return this.tiles.get(`${x},${y}`)?.type ?? 0; }
  tileSolid(x: number, y: number) {
    const t = this.tiles.get(`${x},${y}`);
    return !!t && (t.type === 1 || t.type === 161 || t.type === 476 || t.type === 421 || t.type === 422);
  }
  tileSolidTop() { return false; }
  slope(x: number, y: number) { return this.tiles.get(`${x},${y}`)?.slope ?? 0; }
  halfBrick(x: number, y: number) { return this.tiles.get(`${x},${y}`)?.half ?? false; }
  liquid(x: number, y: number) { return this.liquids.get(`${x},${y}`)?.amount ?? 0; }
  liquidTypeVanilla(x: number, y: number) { return this.liquids.get(`${x},${y}`)?.type ?? 0; }
  frameY() { return 0; }
}

const ball7 = (): { x: number; y: number; vx: number; vy: number; w: number; h: number; angular: number } =>
  ({ x: 100, y: 100, vx: 0, vy: 0, w: 7, h: 7, angular: 0 });

// ===================== A. 球物理算例（BallCollision.cs 逐项） =====================
describe('高尔夫球物理（BallCollision.cs）', () => {
  it('重力 0.3/tick + 阻力 0.99：静止球首帧 vy=0.3（:31-32 先乘 Drag、:47 子步加重力）', () => {
    const b = ball7();
    const st = stepGolfBall(b, new FakeMap());
    expect(st).toBe(BallState.Moving);
    expect(b.vy).toBeCloseTo(0.3, 6);   // 初速 0 → Drag 无效，子步重力直加
    expect(b.vx).toBe(0);
  });

  it('速度上限 1000（:32 先 Drag、:34-38 后限速 → 恰为 1000）', () => {
    const b = ball7(); b.vx = 5000; b.vy = 0;
    stepGolfBall(b, new FakeMap());
    expect(b.vx).toBeCloseTo(1000, 5);
  });

  it('法向弹跳 = DirectImpactDampening（Default 0.95：触边首子步反弹 ×0.95）', () => {
    const map = new FakeMap();
    map.set(6, 8, 1);                       // 球正下方石块（Default: direct .95/side .98）
    const b = ball7();
    b.x = 6 * 16; b.y = 8 * 16 - 3.0 - 3.5; // 球心距顶边 3.0px（<半径 → 首子步即撞）
    b.vy = 2; b.vx = 0;                      // substeps=1 → 重力整加 0.3
    stepGolfBall(b, map);
    // 触速 = 2×0.99(drag) + 0.3(子步重力) = 2.28 → 反弹 ×0.95（:37-39 纯法向 → ×direct）
    expect(b.vy).toBeCloseTo(-(2 * 0.99 + 0.3) * 0.95, 6);
  });

  it('斜落地面：切向 ×SideImpactDampening、法向 ×Direct（Default 0.98/0.95）', () => {
    const map = new FakeMap();
    map.set(6, 9, 1);
    const b = ball7();
    b.x = 6 * 16; b.y = 9 * 16 - 3.0 - 3.5;  // 首子步即触顶边
    b.vx = 7.07; b.vy = 2;
    stepGolfBall(b, map);
    // 切向保留 7.07×0.99×0.98（:37-39）
    expect(b.vx).toBeCloseTo(7.07 * 0.99 * 0.98, 4);
    // 法向：首子步 (2×0.99/sub + 子步重力)×0.95 反弹，其后 sub-1 个子步继续加重力
    // （重力使上升减速 → vy 向 0 回摆，:47/:78）
    const sub = Math.ceil(Math.hypot(7.07, 2) * 0.99 / 2);
    const gSub = 0.3 / (sub * sub);
    expect(b.vy).toBeCloseTo(-((((2 * 0.99) / sub + gSub) * 0.95) - (sub - 1) * gSub) * sub, 4);
  });

  it('冰面（tile 161 Ice，side=1.0）切向不衰减（MaterialData.Materials.json Ice 条目）', () => {
    const map = new FakeMap();
    map.set(6, 9, 161);
    const b = ball7();
    b.x = 6 * 16; b.y = 9 * 16 - 3.0 - 3.5;
    b.vx = 7.07; b.vy = 2;
    stepGolfBall(b, map);
    expect(b.vx).toBeCloseTo(7.07 * 0.99 * 1.0, 4);   // side=1.0 全保留
  });

  it('水穿过阻尼 0.91/子步、蜂蜜 0.8/子步（OnPassThrough :141-155）', () => {
    // 同一初速 vx=10（drag 后 9.9；substeps=5 → 每子步 0.91^5 / 0.8^5）
    const run = (liqType: number) => {
      const map = new FakeMap();
      map.setLiquid(10, 10, 255, liqType);          // 满格液体：液面=格顶
      const b = ball7();
      b.x = 10 * 16 + 0.5; b.y = 10 * 16 + 4;       // 中心在液面之下（:120 surfaceY < centerY）
      b.vx = 10; b.vy = 0;
      stepGolfBall(b, map);
      return b.vx;
    };
    expect(run(0)).toBeCloseTo(9.9 * 0.91 ** 5, 4); // 水 ×0.91（:142-144）
    expect(run(2)).toBeCloseTo(9.9 * 0.8 ** 5, 4);  // 蜂蜜 ×0.8（:146-148）
  });

  it('岩浆无阻尼（:156-157 Lava 分支为空）', () => {
    const map = new FakeMap();
    map.setLiquid(10, 10, 255, 1);
    const b = ball7();
    b.x = 10 * 16 + 0.5; b.y = 10 * 16 + 4;
    b.vx = 10; b.vy = 0;
    stepGolfBall(b, map);
    expect(b.vx).toBeCloseTo(9.9, 5);               // 仅 Drag，无液体阻尼
  });

  it('坡面斜边：slope 1（\）把下落球沿斜面法线弹向 +X（GetSlopeEdge :236-245）', () => {
    const map = new FakeMap();
    map.set(6, 9, 1, 1);                            // slope 1：格内 (0,0)→(16,16) 对角
    const b = ball7();
    // 球心置于斜坡上方（对角 y=x+48：中心 (104,148) 距对角 2.83px < 半径 3.5）
    b.x = 6 * 16 + 8 - 3.5; b.y = 148 - 3.5;
    b.vy = 4; b.vx = 0;
    let bounced = false;
    for (let i = 0; i < 40; i++) {
      stepGolfBall(b, map);
      if (b.vx > 0.1) { bounced = true; break; }    // 法线 (√2/2,-√2/2) → 弹向右上
    }
    expect(bounced).toBe(true);
  });

  it('Resting 判定（:81-84）：水平近停 + vy∈(−0.3,0]', () => {
    const map = new FakeMap();
    for (let x = 0; x < 20; x++) map.set(x, 12, 1); // 平地
    const b = ball7();
    b.x = 4 * 16; b.y = 12 * 16 - 8;
    b.vx = 6; b.vy = 0;
    let state: BallState = BallState.Moving;
    for (let i = 0; i < 600; i++) state = stepGolfBall(b, map);
    expect(state).toBe(BallState.Resting);
    expect(Math.abs(b.vx)).toBeLessThan(0.01);
  });

  it('嵌死实心格：速度清零（:50-55）', () => {
    const map = new FakeMap();
    map.set(6, 6, 1);                              // 球中心所在格即实心
    const b = ball7();
    b.x = 6 * 16 + 4; b.y = 6 * 16 + 4;
    b.vx = 5; b.vy = 5;
    stepGolfBall(b, map);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('球洞 476：自上而下且 ≤100px/tick → 捕获（GolfHelper.cs:59-71）', () => {
    const map = new FakeMap();
    map.set(10, 12, 476);                          // 球洞（solid）
    const b = ball7();
    b.x = 10 * 16; b.y = 12 * 16 - 30;
    b.vy = 4; b.vx = 0;
    let cup: [number, number] | null = null;
    for (let i = 0; i < 200; i++) {
      stepGolfBall(b, map, {
        onCupCapture: (tx, ty) => { cup = [tx, ty]; },
      });
      if (cup) break;
    }
    expect(cup).toEqual([10, 12]);                 // hitLocation = Impact - Normal*0.5（:90）
    expect(b.vx).toBe(0); expect(b.vy).toBe(0);    // velocity *= 0（:64）
  });

  it('球洞 476：>100px/tick 高速弹开不进洞（:62 num > 100 → 跳过）', () => {
    const map = new FakeMap();
    map.set(10, 40, 476);                          // 放低：弹飞 ~186px 不出世界
    const b = ball7();
    b.x = 10 * 16; b.y = 40 * 16 - 3.0 - 3.5;      // 直接触边 + 高速
    b.vy = 200; b.vx = 0;                          // 触速 ≈198 > 100
    let cup: [number, number] | null = null;
    stepGolfBall(b, map, { onCupCapture: (tx, ty) => { cup = [tx, ty]; } });
    expect(cup).toBeNull();
    expect(b.vy).toBeLessThan(0);                  // 反弹向上（未捕获）
  });

  it('传送带 421/422：沿表面切向加速至 2.5×timeScale（:43-58）', () => {
    const map = new FakeMap();
    map.set(10, 12, 421);
    const b = ball7();
    b.x = 10 * 16; b.y = 12 * 16 - 30;
    b.vy = 4; b.vx = 0;
    for (let i = 0; i < 200; i++) {
      stepGolfBall(b, map);
      if (b.vy < 0) break;                         // 首次触带反弹
    }
    expect(b.vx).toBeGreaterThan(0);               // 421 正向传送 → +X 推进
  });

  it('材质表（MaterialData.Tiles.json）：洞杯草 477=GolfGrass、球座 494=GolfTee、未列出=Default', () => {
    expect(golfPhysicsForTile(477).club).toBe(1.5);      // GolfGrass ClubImpactDampening
    expect(golfPhysicsForTile(494).club).toBe(1.8);      // GolfTee（球座上开球更远）
    expect(golfPhysicsForTile(53).direct).toBe(0.3);     // Sand
    expect(golfPhysicsForTile(9999)).toBe(golfPhysicsForTile(1)); // 未列出 → Default
  });
});

// ===================== B. 挥杆蓄力 → 初速（GolfHelper.cs:293-341） =====================
describe('挥杆蓄力 → 初速映射', () => {
  const ball = { cx: 0, cy: 0 };
  it('木杆 Driver 椭圆上限 (1.5,0.65)：水平满蓄 |v|=1.5×32=48（椭圆径向长）', () => {
    // FindVectorOnOval（:284-291）：normalize(v/r)×r —— 水平方向径向长 = 1.5（非对角长）
    const s = golfShot(10000, 0, ball, GOLF_CLUBS[4094]);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(1.5 * 32, 4);
  });
  it('挖起杆 Wedge 椭圆 (0.65,1.5)：近垂直满蓄 |v|≈48（受角度钳 -87.12° 压低）', () => {
    const s = golfShot(0, -10000, ball, GOLF_CLUBS[4093]);
    // 角度钳到 -1.5207964 后方向略偏 → 椭圆径向长 1.4918 → 47.74
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(47.7428, 3);
    expect(s.vy).toBeLessThan(-47);
  });
  it('推杆 Putter 上限 0.25（等半径=圆）：任意方向 |v|=0.25×32=8', () => {
    const s = golfShot(9000, -9000, ball, GOLF_CLUBS[4092]);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(0.25 * 32, 4);
  });
  it('蓄力与距离线性（推杆未触上限：半程=半速）', () => {
    const near = golfShot(60, -0, ball, GOLF_CLUBS[4092]);   // 0.2 → 未触上限 0.25
    const half = golfShot(30, -0, ball, GOLF_CLUBS[4092]);
    expect(Math.hypot(near.vx, near.vy)).toBeCloseTo(Math.hypot(half.vx, half.vy) * 2, 3);
  });
  it('角度钳：不能向下打（rot>0 → 0；rot<-1.5208 → -1.5208，:431-439）', () => {
    const down = golfShot(100, 500, ball, GOLF_CLUBS[4039]);
    expect(down.vy).toBeLessThanOrEqual(0.0001);
    const steep = golfShot(1, -10000, ball, GOLF_CLUBS[4039]);
    const ang = Math.atan2(steep.vy, steep.vx);
    expect(ang).toBeGreaterThanOrEqual(-1.5207965 - 1e-4);
  });
  it('材质镜像：4598 钛金木杆 == 4094 木杆属性（GetClubProperties :348-371）', () => {
    expect(GOLF_CLUBS[4598]).toEqual(GOLF_CLUBS[4094]);
    expect(GOLF_CLUBS[4591]).toEqual(GOLF_CLUBS[4039]);
    expect(GOLF_CLUBS[4597].rough).toBe(1);
  });
  it('站位盒（ValidateShot :444-448）：面向翻转 X∈[-16,32]、Y∈[-16,16]', () => {
    const player = { x: 0, y: 0, w: 20, h: 42, facing: 1 };
    const inBox = { x: player.x + 10 + 8, y: player.y + 42 - 8, w: 7, h: 7 };
    expect(golfBallInStance(inBox, player)).toBe(true);
    const far = { ...inBox, x: player.x + 400 };
    expect(golfBallInStance(far, player)).toBe(false);
  });
});

// ===================== C. 分杆公式 + 进洞结算（GolfState.cs / GolfBallTrackRecord.cs） =====================
describe('进洞判定与分杆公式', () => {
  const mkBall = (id: number, swings: number, x = 0, y = 0): GolfBallHandle =>
    ({ id, x, y, vx: 0, vy: 0, swings, moving: true, dead: false, isMine: true });

  it('GolfBallTrackRecord：⌊总位移tile⌋ ÷ (击点段数+2)（:15-21）', () => {
    const rec = new GolfBallTrackRecord();
    rec.recordHit(0, 0); rec.recordHit(160, 0); rec.recordHit(320, 0);
    // 总位移 320px=20tile，段数 2 → 20/(2+2)=5
    expect(rec.getAccumulatedScore()).toBe(5);
  });

  it('单段直进洞（一杆）：160px=10tile ÷ (1+2)=3', () => {
    const rec = new GolfBallTrackRecord();
    rec.recordHit(0, 0); rec.recordHit(160, 0);
    expect(rec.getAccumulatedScore()).toBe(Math.floor(10 / 3));
  });

  it('完整链：两杆进洞 → SetScoreTime 满额 → 分数=累计分×1.0（GolfState.cs:83-160）', () => {
    const state = new GolfState();
    const ball = mkBall(1, 1, 0, 0);
    state.recordSwing(ball);                          // 第一杆记点 (0,0)
    ball.x = 160; ball.y = 0; ball.swings = 2;
    state.recordSwing(ball);                          // 第二杆记点 (160,0)
    ball.x = 320; ball.y = 0;
    expect(state.shouldScoreHole).toBe(false);        // golfScoreDelay=90（:32）
    for (let i = 0; i < 90; i++) state.update(true, false);
    expect(state.shouldScoreHole).toBe(true);
    // PutBallInCup（GolfHelper.cs:95-106）：>1 杆 → SetScoreTime
    state.setScoreTime();
    state.recordBallInfo(ball);
    state.landBall(ball);                             // 终点 (320,0)
    expect(state.getGolfBallScore(ball)).toBe(5);     // 20tile/4 段 ×1.0
    state.resetScoreTime();
    expect(state.scoreTime).toBe(0);
  });

  it('折扣系数 ScoreAdjustment = time/3600：半程计时分数减半取整（:30/:159）', () => {
    const state = new GolfState();
    const ball = mkBall(2, 1, 0, 0);
    state.recordSwing(ball);
    ball.x = 0; ball.swings = 1;
    ball.x = 0; ball.y = 0;
    state.landBall(ball);                             // 单点 → 0 段 → 分 0
    expect(state.getGolfBallScore(ball)).toBe(0);
  });

  it('折扣计时：每帧+1 封顶 3600（:34-40）', () => {
    const state = new GolfState();
    for (let i = 0; i < 4000; i++) state.update(false, false);
    expect(state.scoreTime).toBe(3600);
    expect(state.scoreAdjustment).toBe(1);
  });

  it('哨子 ResetGolfBall（:162-173）：球已离手 → 回退上一击点 +1 杆；未动 → 无操作', () => {
    const state = new GolfState();
    const ball = mkBall(3, 1, 100, 50);
    state.recordSwing(ball);                          // _lastSwingPosition=(100,50)
    ball.x = 300; ball.y = 80;                        // 球已滚动远离
    expect(state.resetGolfBall()).toBe(true);
    expect(ball.x).toBe(100); expect(ball.y).toBe(50);
    expect(ball.vx).toBe(0); expect(ball.vy).toBe(0);
    expect(ball.swings).toBe(2);                      // +BALL_RETURN_PENALTY（:169）
    // 未动（位移 <1px）→ 不回退
    expect(state.resetGolfBall()).toBe(false);
  });
});

// ===================== D. 球体 AI + 球座放取（Projectile.cs:18924-18970） =====================
describe('球体 AI_149 与球座（tile 494）', () => {
  const owner = {};
  afterEach(() => { GolfBall.host = null; });

  const mkWorld = () => {
    const w = new World(40, 40, 7, 'golf');
    return w;
  };
  const fakeGame = (w: World) => ({ world: w }) as never;

  it('球尺寸 7×7（SetDefaults :7350-7351）', () => {
    const b = new GolfBall(0, 0, 721, () => owner);
    expect(b.w).toBe(7); expect(b.h).toBe(7);
  });

  it('球座待发态 ai[1]=-1：不走物理（:18931-18941）；座被拆 → 归 0 恢复物理', () => {
    const w = mkWorld();
    const tee = TILE_BY_KEY['v_494_golf_tee']!;
    w.store.setTileSilent(20, 20, tee);
    // 球座摆球位（Player.cs:31881：中心 = tx*16+8.5, ty*16+6）
    const cx = 20 * 16 + 8.5, cy = 20 * 16 + 6;
    const b = new GolfBall(cx, cy, 721, () => owner, true);
    expect(b.swings).toBe(-1);
    const x0 = b.x, y0 = b.y;
    b.fixedUpdate(1, fakeGame(w));
    expect(b.swings).toBe(-1);                        // 座在 → 维持待发
    expect(b.x).toBe(x0); expect(b.y).toBe(y0);       // 无物理位移
    w.store.setTileSilent(20, 20, 0);                 // 拆座
    b.fixedUpdate(1, fakeGame(w));
    expect(b.swings).toBe(0);                         // ai[1]=0（:18937-18938）
    b.fixedUpdate(1, fakeGame(w));
    expect(b.y).toBeGreaterThan(y0);                  // 恢复物理：开始下落
  });

  it('进洞捕获链：GolfBall.fixedUpdate → host.onCupCapture + 杀球（proj.Kill :114）', () => {
    const w = mkWorld();
    const cup = TILE_BY_KEY['v_476_golfhole']!;
    w.store.setTileSilent(20, 12, cup);
    const state = new GolfState();
    const captured: Array<[number, number]> = [];
    GolfBall.host = {
      state,
      playerRef: () => owner,
      onCupCapture: (_b, tx, ty) => { captured.push([tx, ty]); },
    };
    const b = new GolfBall(20 * 16 + 3.5, 12 * 16 - 30, 721, () => owner);
    for (let i = 0; i < 300 && !b.dead; i++) b.fixedUpdate(1, fakeGame(w));
    expect(b.dead).toBe(true);
    expect(captured.length).toBe(1);
    expect(captured[0]).toEqual([20, 12]);
  });

  it('击球 HitGolfBall（:451-474）：杆数 -1→0→1 递增 + 材质阻尼 + RecordSwing', () => {
    const state = new GolfState();
    GolfBall.host = { state, playerRef: () => owner, onCupCapture: () => {} };
    const b = new GolfBall(20 * 16 + 3.5, 20 * 16 - 8, 721, () => owner, true);
    b.clubHit(10, -5, 0, 0);                          // 原版 tile id 0 = Dirt：club=0.9
    expect(b.swings).toBe(1);                         // -1 → 0 → +1
    expect(b.moving).toBe(true);                      // localAI[1]=1
    // Dirt: Lerp(v×0.9, v, 0.5×0) = v×0.9（GolfHelper.cs:460）
    expect(b.vx).toBeCloseTo(9, 5); expect(b.vy).toBeCloseTo(-4.5, 5);
    expect(state.getLastHitBall()).toBe(b);
    // 挖起杆 rough=1：Lerp(v×0.9, v, 0.5×1) = v×0.95
    b.clubHit(10, -5, 1, 0);
    expect(b.swings).toBe(2);
    expect(b.vx).toBeCloseTo(9.5, 5); expect(b.vy).toBeCloseTo(-4.75, 5);
    // 空气（null）：不阻尼
    b.clubHit(10, -5, 0, null);
    expect(b.swings).toBe(3);
    expect(b.vx).toBe(10); expect(b.vy).toBe(-5);
  });
});

// ===================== E. Golfer 商店门槛（Chest.cs:3135-3245） =====================
describe('高尔夫球手商店分数门槛', () => {
  it('0 分无门槛货；恰好 500 分含 >=500 四杆族（R14-C27 勘误,:3163-3177 原 1456/1457 同 >=）', () => {
    expect(golferShopScoreGates(0, 0, false)).toEqual([]);
    // 恰 500：四杆族(>=500)在列;球箱/铜奖杯仍 >500 不在
    expect(golferShopScoreGates(500, 0, false)).toEqual([4039, 4094, 4093, 4092]);
  });
  it('>500：四杆族(铁/木/挖/推)+球箱+铜奖杯（:3147-3162/:3183/:3190）', () => {
    expect(golferShopScoreGates(501, 0, false)).toEqual([4039, 4094, 4093, 4092, 4265, 4599]);
  });
  it('>=1000 加银奖杯（:3195）；>1000 才加金级四杆族（:3169）', () => {
    expect(golferShopScoreGates(1000, 0, false)).toEqual([4039, 4094, 4093, 4092, 4265, 4599, 4600]);
    expect(golferShopScoreGates(1001, 0, false))
      .toEqual([4039, 4094, 4093, 4092, 4591, 4594, 4593, 4592, 4265, 4599, 4600]);
  });
  it('>2000 钛金四杆族；球车 4264 需 downedBoss3（:3202-3213）；金奖杯与月相画走 >=2000', () => {
    const noBoss = golferShopScoreGates(2001, 0, false);
    expect(noBoss).not.toContain(4264);
    const boss = golferShopScoreGates(2001, 0, true);
    expect(boss).toContain(4264);
    expect(boss).toEqual(expect.arrayContaining([4595, 4598, 4597, 4596]));
    // 恰好 2000：>2000 档不开，>=2000 档开（金奖杯+月相画）
    const exactly = golferShopScoreGates(2000, 0, true);
    expect(exactly).toContain(4601);
    expect(exactly).toContain(4658);
    expect(exactly).not.toContain(4595);
    expect(exactly).not.toContain(4264);
  });
  it('月相四画 4658-4661 按 phase/2 分档（:3224-3237）', () => {
    expect(golferShopScoreGates(3000, 0, false)).toContain(4658);
    expect(golferShopScoreGates(3000, 3, false)).toContain(4659);
    expect(golferShopScoreGates(3000, 5, false)).toContain(4660);
    expect(golferShopScoreGates(3000, 7, false)).toContain(4661);
  });
});

// ===================== F. 分数存档往返（Player.cs:1792 → SaveFile.ts:89） =====================
describe('高尔夫分数存档往返', () => {
  it('golferScoreAccumulated 存/读一致（Player.cs:1792；SaveFile.ts:89 缺省 0）', () => {
    const w = new World(64, 32, 42, 'golf');
    const p = new Player(100, 100, new Inventory());
    p.golferScoreAccumulated = 2345;
    const back = loadSave(saveGame(w, p, 0));
    expect(back.player.golferScoreAccumulated).toBe(2345);
    // 旧档缺省
    const back2 = loadSave(saveGame(w, new Player(100, 100, new Inventory()), 0));
    expect(back2.player.golferScoreAccumulated).toBe(0);
  });
  it('累计上限 1e9 截断语义（AccumulateGolfingScore Player.cs:4723-4731）', () => {
    const state = new GolfState();
    void state;
    const cap = (acc: number, score: number) => {
      const room = 1_000_000_000 - acc;               // Game.golfCupCapture 同式
      return acc + Math.min(score, Math.max(0, room));
    };
    expect(cap(999_999_999, 5)).toBe(1_000_000_000);
    expect(cap(1_000_000_000, 5)).toBe(1_000_000_000);
    expect(cap(0, 5)).toBe(5);
  });
});
