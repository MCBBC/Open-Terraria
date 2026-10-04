// ★C9 光照 Worker 对拍（2026-09-23）：同输入下 worker 侧驱动路径 ≡ 本地引擎路径,
// 逐字节比对（引擎纯函数可测;Worker 消息层 node 不可测,由浏览器探针覆盖）。
//
// 双图结构：本地路径用测试静态导入的模块图;worker 侧经 vi.resetModules + 动态导入
// 取【全新模块注册表】——模拟 worker 线程的模块实例分立（lightTables 模块级衰减/
// shimmer 状态、SkyColor 模块级帧状态、FastRandom 种子链全部各自演化,恰为生产态）。
// 对拍前提（确定性钉）：
//   · FlickerClock 全字段手设 + globalTimeWrappedHourly 以实例自有属性钉死
//     （worker 侧由快照 hourly 通道经 shim 遮蔽,两侧同值）;
//   · LightMap 水 flicker 种子 = Math.random（构造期）——两侧 cast 钉同一种子;
//   · updateLightDecay 每场景两侧恰好各 1 次同参调用（模块级状态 1:1 演化）;
//   · scanner.random 种子链 = advance^N(0x9e3779b9),两侧各恰好 1 次 exportTo → 同种子;
//     localRandom/shimmerBaseColor 经坐标平移 shim 还原绝对坐标 → 位级同值;
//   · 水母笼 316-318/彩虹云 719 直接消费 rebase 坐标（协议头注混沌类 d）——夹具排除。
import { describe, it, expect, vi } from 'vitest';
import { LightingEngine, type LightingWorld } from '../src/lighting/LightingEngine';
import { buildEngineSnapshot, type EngineCaptureView } from '../src/lighting/LightWorkerProtocol';
import { LightWorkerLink } from '../src/lighting/LightWorkerLink';
import { updateLightDecay } from '../src/lighting/lightTables';
import {
  setFrameAtmo, setFrameAurora, setFrameBiome, setFrameCloudDim, setFrameDontStarve,
  setFrameHorizon, setFrameLightning, setFrameRemix,
} from '../src/lighting/SkyColor';
import { TileStore } from '../src/world/TileStore';
import { FastRandom } from '../src/lighting/FastRandom';
import { TILE_DEFS } from '../src/data/tiles';

const W = 96, H = 80;
const GROUND = 30, LAVA = 70;
const bySheet = (s: number): number => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);

type Feat = Partial<Record<'frameX' | 'frameY' | 'wall' | 'liquid' | 'liquidType' | 'half' | 'slope' | 'coat' | 'wire' | 'paint' | 'paintWall', number>>;

/** 特征格（sheet 世界坐标装配;覆盖读表面全支路——水母笼 316-318/彩虹云 719 除外,
 *  见头注混沌类 d） */
function buildWorld(): TileStore {
  const st = new TileStore(W, H);
  const put = (sheet: number, x: number, y: number, extra: Feat = {}) => {
    const id = bySheet(sheet);
    if (id < 0) throw new Error(`sheet ${sheet} 未映射`);
    const i = y * W + x;
    st.type[i] = id; st.flags[i] = 1;
    st.frameX[i] = extra.frameX ?? 0; st.frameY[i] = extra.frameY ?? 0;
    if (extra.wall !== undefined) st.wall[i] = extra.wall;
    if (extra.liquid !== undefined) { st.liquid[i] = extra.liquid; st.liquidType[i] = extra.liquidType ?? 1; }
    if (extra.half !== undefined) st.half[i] = extra.half;
    if (extra.slope !== undefined) st.slope[i] = extra.slope;
    if (extra.coat !== undefined) st.coat[i] = extra.coat;
    if (extra.wire !== undefined) st.wire[i] = extra.wire;
    if (extra.paint !== undefined) st.paint[i] = extra.paint;
    if (extra.paintWall !== undefined) st.paintWall[i] = extra.paintWall;
  };
  // —— 天空域：火把 24 档采样（含 demon7/disco14/shimmer23 动态）+ 蜡烛族动态档 ——
  for (const style of [0, 3, 7, 14, 20, 23]) put(4, 4 + style * 3, 6, { frameY: style * 22, wall: 1 });
  for (const style of [0, 25, 30, 42]) put(33, 4 + style * 3, 12, { frameY: style * 22, wall: 1 });
  put(93, 40, 12, { frameY: 54, wall: 1 }); put(100, 44, 12, { frameY: 36, wall: 1 });
  put(34, 48, 12, { frameX: 0, frameY: 108, wall: 1 }); put(34, 52, 12, { frameX: 108, frameY: 54, wall: 1 });
  put(42, 56, 12, { frameY: 72, wall: 1 });            // 灯笼
  put(174, 60, 12, { frameX: 0, wall: 1 });             // 白金蜡烛
  // 动态特例：迪斯科球/导线灯泡/传送门炮/药草/水晶球(gb-override)/节日灯(localRand)/
  // 陨石(localRand)/祭坛(localRand)/熔岩装饰(localRand)/香蒲(localRand)/火星导管
  put(126, 4, 4, { frameX: 0 }); put(429, 8, 4, { frameX: 54 }); put(209, 12, 4, { frameX: 234 });
  put(84, 16, 4, { frameX: 36 }); put(83, 20, 4, { frameX: 90 }); put(125, 24, 4, { frameX: 0 });
  put(149, 28, 4, { frameX: 18 }); put(37, 32, 4, { frameX: 0 }); put(26, 36, 4, { frameX: 54 });
  put(31, 40, 4, { frameX: 36 }); put(327, 44, 4, { frameX: 0 }); put(519, 48, 4, { frameY: 90 });
  put(592, 52, 4, { frameY: 18 }); put(350, 56, 4, { frameX: 0 }); put(620, 60, 4, { wall: 1 });
  put(663, 64, 4, { wall: 1 }); put(646, 68, 4, { frameX: 0, wall: 1 }); put(372, 72, 4, { frameX: 0 });
  // 微光族（shimmerBaseColor shim 消费面）/ 苔藓 / 瓶中魂 / 传送塔
  put(659, 76, 4, {}); put(667, 80, 4, {}); put(708, 84, 4, {});
  put(184, 88, 4, { frameX: 154 }); put(572, 92, 4, { frameY: 72 }); put(597, 4, 16, { frameX: 108 });
  // 迪斯科石族 / 世纪之花球茎 / 圣诞灯（origin 回溯:原点格 frameY 高位段=样式 5）
  put(160, 8, 16, {}); put(628, 12, 16, {}); put(238, 16, 16, {});
  put(171, 20, 20, { frameX: 0, frameY: 54 });
  st.type[17 * W + 20] = bySheet(1); st.flags[17 * W + 20] = 1; st.frameY[17 * W + 20] = 0x1400;
  // 718 昼云（夜→挡光动态 + 上邻 SolidTile3 读面）
  put(718, 26, 20, { frameX: 0 });
  put(1, 26, 19, {});
  // 地表带：水坑四档/蜂蜜/微光液体/半砖/坡面（surfaceSky 邻格读面）/裂纹砖/致动火把/
  // 隐形涂层/涂装矿/蘑菇组/篝火/壁炉
  [100, 150, 200, 255].forEach((d, i) => put(0, 4 + i * 3, GROUND - 1, { liquid: d, liquidType: 1, wall: 1 }));
  put(0, 20, GROUND - 1, { liquid: 255, liquidType: 3, wall: 1 });
  put(0, 24, GROUND - 1, { liquid: 255, liquidType: 4, wall: 1 });
  for (let i = 0; i < 4; i++) put(1, 30 + i * 2, GROUND - 1, { half: 1, liquid: i === 3 ? 220 : 0, liquidType: 1, wall: 1 });
  for (let s = 1; s <= 4; s++) put(1, 40 + s, GROUND - 1, { slope: s, wall: 1 });
  for (const s of [481, 482, 483]) put(s, 50, GROUND - 1, { wall: 1 });
  put(4, 56, GROUND - 1, { frameY: 44, wire: 32, wall: 1 });   // 致动火把
  put(1, 60, GROUND - 1, { coat: 2, wall: 1 });                 // 隐形涂层块(showInvisibleBlocks=false)
  put(22, 64, GROUND - 1, { paint: 26, wall: 1 });              // 魔矿白漆（R=0 门）
  put(739, 68, GROUND - 1, { paint: 3, wall: 1 });              // 水母块涂装覆写
  for (const s of [70, 348]) put(s, 72, GROUND - 1, { wall: 1 });
  put(215, 76, GROUND - 1, { frameX: 108, wall: 1 });           // 篝火（点燃门+localRand）
  put(405, 80, GROUND - 1, { frameX: 0, wall: 1 });             // 壁炉
  put(4, 84, GROUND - 1, { frameY: 110, wall: 1 });             // 生物群系火把档
  // 洞穴带（零环境光域）：发光矿/微光蜡烛/微光火把块
  put(166, 10, 50, { wall: 1 }); put(658, 14, 50, { frameY: 54, wall: 1 }); put(660, 18, 50, {});
  // 地狱带：岩浆（地狱天光支路 + 岩浆发射色）
  for (let x = 4; x < 40; x += 4) put(0, x, LAVA + 2, { liquid: 255, liquidType: 2 });
  // 底板
  for (let x = 0; x < W; x++) { put(1, x, GROUND, {}); put(1, x, H - 1, {}); }
  return st;
}

const CLOCK = { timeOfDay: 0.85, dayCount: 7, eclipse: false, bloodMoon: true, moonPhase: 4, isDay: false };
const HELD = { tx: 30, ty: 28, r: 1, g: 0.95, b: 0.8 };
const BUFFS = [{ tx: 20, ty: 25, r: 0.3, g: 0.1, b: 0.5 }, { tx: 60, ty: 60, r: 0.2, g: 0.6, b: 0.2 }];
const PER = [[12, 12, 1, 0.6, 0.3], [40, 30, 0.2, 0.9, 0.4], [5, 74, 0.8, 0.2, 0.1]] as const;
const DECAY_ARGS = { waterStyle: 6, nightVision: false, blackout: false, blind: false, opts: { headcovered: false, inShimmer: true } as { headcovered?: boolean; inShimmer?: boolean } };

function pinClock(f: import('../src/lighting/SkyColor').FlickerClock): void {
  f.mouseTextColor = 210; f.demonTorch = 0.37;
  f.discoR = 200; f.discoG = 80; f.discoB = 40;
  f.essScale = 0.9; f.masterColor = 0.6; f.timeForVisualEffects = 12345;
  Object.defineProperty(f, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
}

function pinMaps(e: LightingEngine): void {
  (e as unknown as { work: { random: FastRandom } }).work.random = new FastRandom(12345);
  (e as unknown as { active: { random: FastRandom } }).active.random = new FastRandom(12345);
}

/** 本地路径引擎（绝对坐标 + 真实 TileStore）——装配不 compute,由调用方控序。
 *  ★C9d：区域走快照面（setSnapshotRegion）——公共采样对由 compute 的本地原子发布
 *  装配,不再手工预分配（旧 e.r/g/b 手工 new 已删,发布面等价产出） */
function makeLocalEngine(st: TileStore, rx: number, ry: number, rw: number, rh: number): LightingEngine {
  updateLightDecay(DECAY_ARGS.waterStyle, DECAY_ARGS.nightVision, DECAY_ARGS.blackout, DECAY_ARGS.blind, DECAY_ARGS.opts);
  const world = { store: st, groundLevel: GROUND, lavaLine: LAVA, clock: { ...CLOCK }, sundialCooldown: 5, moondialCooldown: 3, weather: { raining: true } };
  const e = new LightingEngine(world as unknown as LightingWorld);
  pinClock((e as unknown as { flicker: import('../src/lighting/SkyColor').FlickerClock }).flicker);
  e.setSnapshotRegion(rx, ry, rw, rh);
  e.heldLight = HELD; e.buffLights = BUFFS;
  e.dirty = true;
  for (const p of PER) e.addLight(p[0], p[1], p[2], p[3], p[4]);
  pinMaps(e);
  return e;
}

describe('C9 光照 Worker 快照对拍（worker 驱动路径 ≡ 本地路径,逐字节）', () => {
  it('内部区域（切片含完整 padding）+ 世界边缘区域（px=py=0 折叠带）双场景', async () => {
    // 天空帧状态（验证 SkyColor 模块级状态捕获/重放链;worker 侧经 applySkyFrameState 重放）
    setFrameCloudDim(0.75);
    setFrameBiome({ corrupt: 0.5, crimson: 0.2, jungle: 0.1, mushroom: 0, graveyard: 0.3 });
    setFrameRemix(true, true);
    setFrameDontStarve(false);
    setFrameLightning(0.5);
    setFrameAtmo(0.8);
    setFrameHorizon({ sunrise: 0.2, sunset: 0.3, phase: 1 });
    setFrameAurora({ rgb: [120, 180, 240], opacity: 0.5, phase: 0 });

    // worker 侧 = 全新模块注册表（模拟线程分立;须在本图状态设置后重置）
    vi.resetModules();
    const WP = await import('../src/lighting/LightWorkerProtocol');
    const WE = await import('../src/lighting/LightingEngine');
    const WF = await import('../src/lighting/FastRandom');

    const scenarios = [
      { name: '内部区域(px=16,py=16)', rx: 24, ry: 20, rw: 32, rh: 24, wantPx: 16, wantPy: 16 },
      { name: '边缘区域(px=0,py=0)', rx: 0, ry: 0, rw: 40, rh: 30, wantPx: 0, wantPy: 0 },
      { name: '洞穴+地狱区域(px=16,py=16)', rx: 16, ry: 56, rw: 40, rh: 24, wantPx: 16, wantPy: 16 },
    ];
    for (const sc of scenarios) {
      // —— 本地路径：装配（pre-tick 捕获）→ compute ——
      const A = makeLocalEngine(buildWorld(), sc.rx, sc.ry, sc.rw, sc.rh);
      const cap: EngineCaptureView = {
        rx: sc.rx, ry: sc.ry, rw: sc.rw, rh: sc.rh,
        world: A.world,
        flicker: (A as unknown as { flicker: import('../src/lighting/SkyColor').FlickerClock }).flicker,
        heldLight: HELD, buffLights: BUFFS,
        perFrame: (A as unknown as { perFrame: EngineCaptureView['perFrame'] }).perFrame,
        decay: DECAY_ARGS,
      };
      const link = new LightWorkerLink();
      const tiles = link.buildSlice(A.world.store, sc.rx, sc.ry, sc.rw, sc.rh);
      expect(tiles.px).toBe(sc.wantPx); expect(tiles.py).toBe(sc.wantPy);
      const msg = buildEngineSnapshot(cap, tiles, 0);
      expect(msg.hourly).toBe(987.654);   // 钉值经 getter 通道进快照
      A.compute(0);                        // 本地完整周期（tick + scan + blur + present）

      // —— worker 驱动路径（fresh 图引擎 + 快照 store;水 flicker 种子跑前钉） ——
      const st2 = new WP.SnapshotTileStore();
      const world2 = { store: st2, groundLevel: 0, lavaLine: 0, clock: { timeOfDay: 0.5, dayCount: 1 } };
      const B = new WE.LightingEngine(world2 as never);
      (B as unknown as { work: { random: FastRandom } }).work.random = new WF.FastRandom(12345);
      (B as unknown as { active: { random: FastRandom } }).active.random = new WF.FastRandom(12345);
      const out = WP.runSnapshotOnEngine(B, msg, WP.createWorkerDriveState());

      // —— 非平凡性（防全零伪绿：天空/地狱/点光三域至少一域产出光） ——
      const maxOf = (a: Uint8Array): number => a.reduce((m, v) => (v > m ? v : m), 0);
      expect(maxOf(A.r) + maxOf(A.g) + maxOf(A.b)).toBeGreaterThan(0);
      // —— 逐字节比对（首差报格坐标） ——
      for (const [ch, a, b] of [['R', A.r, out.R], ['G', A.g, out.G], ['B', A.b, out.B]] as const) {
        expect(a.length).toBe(b.length);
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            const cx = sc.rx + (i % sc.rw), cy = sc.ry + Math.floor(i / sc.rw);
            throw new Error(`${sc.name} ${ch}[${i}](格 ${cx},${cy}) 分歧: local=${a[i]} worker=${b[i]}`);
          }
        }
      }
      // 结果区域回显 = 绝对区域
      expect([out.rx, out.ry, out.rw, out.rh]).toEqual([sc.rx, sc.ry, sc.rw, sc.rh]);
    }
  });

  // ★C9d2 二期差量（2026-09-28;?lightdelta=1 灰度）:同输入多帧演化——本地全量路径 ≡
  // 「主线程写日志+暴露带差量编码 → worker 解码重建」路径,R/G/B 逐位同;且每帧
  // worker 侧重建切片 ≡ 同帧 fresh buildSlice（位等价硬判据,编码器/解码器两侧锁）。
  // 演化脚本覆盖:全量锚帧/纯移动（暴露带）/写帧（原语记账格）/移动+写/静置空
  // delta/尺寸重锚/世界边缘 px=0 折叠带（区域跳变>48 格的 plan 全量决策在
  // tests/c9d2-light-delta 单测锁,本脚本世界 96 宽放不下合法跳变）。
  // 衰减状态机收敛前奏:updateLightDecay 带状态记忆（sceneAirDecay/shimmerAlpha
  // 渐进）,双注册表起点不同——恒参预热 320 拍（≥最慢步长 0.005 的收敛上界 200
  // 拍）双側落到同一不动点后,每帧恰好各 1 次同参调用 → 1:1 演化。
  it('差量重建 ≡ 全量（多帧演化:移动/写/重锚/边缘,逐位）', async () => {
    // worker 侧 = 全新模块注册表
    vi.resetModules();
    const WP = await import('../src/lighting/LightWorkerProtocol');
    const WE = await import('../src/lighting/LightingEngine');
    const WF = await import('../src/lighting/FastRandom');
    const WLT = await import('../src/lighting/lightTables');

    const NEUTRAL = { waterStyle: 6, nightVision: false, blackout: false, blind: false, opts: {} };
    for (let i = 0; i < 320; i++) {
      // 主注册表 = 顶层导入的活绑定（resetModules 后的动态导入全是 worker 注册表,
      // 主侧必须经顶层绑定收敛——否则 sceneSolidDecay 相位差一拍=DECAY_SOLID 差 0.0028）
      updateLightDecay(NEUTRAL.waterStyle, NEUTRAL.nightVision, NEUTRAL.blackout, NEUTRAL.blind, NEUTRAL.opts);
      WLT.updateLightDecay(NEUTRAL.waterStyle, NEUTRAL.nightVision, NEUTRAL.blackout, NEUTRAL.blind, NEUTRAL.opts);
    }

    // —— 本地全量路径引擎 A（主注册表,绝对坐标）——
    const worldA = { store: buildWorld(), groundLevel: GROUND, lavaLine: LAVA, clock: { ...CLOCK }, sundialCooldown: 5, moondialCooldown: 3, weather: { raining: true } };
    const A = new LightingEngine(worldA as unknown as LightingWorld);
    const fkA = (A as unknown as { flicker: import('../src/lighting/SkyColor').FlickerClock }).flicker;
    pinMaps(A);
    A.heldLight = HELD; A.buffLights = BUFFS;

    // —— 演化脚本（写面在快照装配前落 store=随当帧快照走）——
    const stone = bySheet(1);
    const st0 = worldA.store;
    const frames: Array<{ rx: number; ry: number; rw?: number; write?: () => void; expectFull?: boolean; expectEmptyDelta?: boolean }> = [
      { rx: 24, ry: 20, expectFull: true },                                        // f0 全量锚
      { rx: 26, ry: 20 },                                                          // f1 纯移动(暴露带)
      { rx: 26, ry: 20, write: () => {                                             // f2 静置+写
        st0.setTile(30, 25, stone); st0.setLiquid(28, 24, 128, 1); } },
      { rx: 28, ry: 20, write: () => {                                             // f3 移动+写
        st0.setPaint(30, 25, 5); st0.setWall(29, 24, 1); st0.setWire(31, 26, 1);
        st0.setHalfBrick(32, 25, true); st0.setCoat(33, 25, 2, 2); } },
      { rx: 28, ry: 20, expectEmptyDelta: true },                                  // f4 静置空 delta
      { rx: 31, ry: 20 }, { rx: 34, ry: 20 }, { rx: 37, ry: 20 },                  // f5-7 连续移动
      // f8:窗口收窄（sw 56→46）→ 全量重锚;窗左沿贴 sx=0 为 f9 的 px=0 同尺寸窗铺垫
      { rx: 16, ry: 20, rw: 14, expectFull: true },
      { rx: 0, ry: 20, rw: 30 },                                                   // f9 px=0 折叠带（同窗 sw=46）
      { rx: 0, ry: 20, rw: 30, expectEmptyDelta: true },                           // f10 静置
    ];

    // —— 主线程差量驱动（link + 注入编码器;bindStore 挂写日志）——
    const link = new LightWorkerLink(new WP.LightDeltaEncoder());
    link.bindStore(worldA.store);

    // —— worker 驱动路径（fresh 图引擎 + 快照 store）——
    const st2 = new WP.SnapshotTileStore();
    const world2 = { store: st2, groundLevel: 0, lavaLine: 0, clock: { timeOfDay: 0.5, dayCount: 1 } };
    const B = new WE.LightingEngine(world2 as never);
    (B as unknown as { work: { random: unknown } }).work.random = new WF.FastRandom(12345);
    (B as unknown as { active: { random: unknown } }).active.random = new WF.FastRandom(12345);
    const ds = WP.createWorkerDriveState();

    const fullBytesOf = (g: { sw: number; sh: number }): number => g.sw * g.sh * 17;   // 全量载荷=17B/格
    let fulls = 0, deltas = 0;
    for (let f = 0; f < frames.length; f++) {
      const fr = frames[f];
      if (fr.write) fr.write();
      const rx = fr.rx, ry = fr.ry, rw = fr.rw ?? 24, rh = 18;
      // —— 两侧时钟/衰减同参（每帧恰好各 1 次）——
      pinClock(fkA);
      updateLightDecay(DECAY_ARGS.waterStyle, DECAY_ARGS.nightVision, DECAY_ARGS.blackout, DECAY_ARGS.blind, DECAY_ARGS.opts);
      // —— 主线程:plan → 全量切片 or 差量编码（快照在 A.compute 前=pre-tick 捕获,
      //      与生产 send→tick 同序;后置会把 tick 后钟面喂给 worker=差一步分歧）——
      const tiles = link.buildWorkerTiles(rx, ry, rw, rh);
      A.setSnapshotRegion(rx, ry, rw, rh);                // 快照面（C9d 后区域走 setSnapshotRegion）
      const cap: EngineCaptureView = {
        rx, ry, rw, rh, world: worldA,
        flicker: fkA, heldLight: HELD, buffLights: BUFFS,
        perFrame: PER.map(([x, y, r, g, b]) => ({ x, y, r, g, b })),
        decay: DECAY_ARGS,
      };
      let msg: Record<string, unknown>;
      if (tiles.type.length > 0) {
        // 全量锚帧（数组留主线程作影子——生产 send() 同款）
        (link as unknown as { _enc: { adoptFull(t: typeof tiles): void } })._enc.adoptFull(tiles);
        msg = { ...buildEngineSnapshot(cap, tiles, f), enc: 'full' };
        fulls++;
      } else {
        const enc = (link as unknown as { _enc: import('../src/lighting/LightWorkerProtocol').LightDeltaEncoder })._enc;
        const log = worldA.store.tileWriteLog!;
        const out = enc.encodeDelta(worldA.store, tiles, log);
        log.length = 0;
        if (fr.expectEmptyDelta) expect(out.meta[0]).toBe(0);
        else expect(out.metaLen * 4 + out.dataLen).toBeLessThan(fullBytesOf(tiles));
        // ★债2 池化:meta/data=整块 scratch 过境,有效长度随消息携带（生产 send 同构）
        msg = { ...buildEngineSnapshot(cap, tiles, f), enc: 'delta', delta: { dv: 1, meta: out.meta, data: out.data, metaLen: out.metaLen, dataLen: out.dataLen } };
        deltas++;
      }
      A.dirty = true;                                     // 本地路径每帧全周期（与 worker 同拍）
      for (const p of PER) A.addLight(p[0], p[1], p[2], p[3], p[4]);
      A.compute(0);
      // —— worker 侧:解码重建 + 全周期 ——
      const out2 = WP.runSnapshotOnEngine(B, msg as never, ds);
      // —— 位等价①:worker 重建切片 ≡ 同帧 fresh buildSlice ——
      const fresh = link.buildSlice(worldA.store, rx, ry, rw, rh);
      for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
        const a = fresh[k], b = (st2 as unknown as Record<string, Uint16Array | Uint8Array>)[k];
        expect(b.length).toBe(a.length);
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) throw new Error(`f${f} ${k}[${i}] 分歧: fresh=${a[i]} decoded=${b[i]}`);
        }
      }
      // —— 位等价②:worker 光照输出 ≡ 本地全量路径 ——
      for (const [ch, a, b] of [['R', A.r, out2.R], ['G', A.g, out2.G], ['B', A.b, out2.B]] as const) {
        expect(a.length).toBe(b.length);
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            const cx = rx + (i % rw), cy = ry + Math.floor(i / rw);
            throw new Error(`f${f} ${ch}[${i}](格 ${cx},${cy}) 分歧: local=${a[i]} workerDelta=${b[i]}`);
          }
        }
      }
    }
    expect(fulls).toBe(2);       // f0 锚 + f8 尺寸重锚（plan 全量决策锁定）
    expect(deltas).toBe(frames.length - 2);
    // 非平凡性（防全零伪绿）
    expect(maxOfArr(A.r) + maxOfArr(A.g) + maxOfArr(A.b)).toBeGreaterThan(0);
  });
});

function maxOfArr(a: Uint8Array): number { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
