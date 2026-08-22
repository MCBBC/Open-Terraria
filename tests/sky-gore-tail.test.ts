// 近似层收尾验收（天空/gore 尾项四件）：
//   ① VirtualCamera 4096² 出生域（AmbientSky.cs 各族构造器 / Main.cs:3753-3755）
//   ② UnifiedRandom 位级序列（MoonlordDeathDrama.ThrowPieces :231-242）
//   ③ parseSeed 文本种子旗标（WorldSeedOption_DontStarve/Anniversary + 归一化 :69）
//   ④ WoF 死亡屏幕级尘幕（screenGrid 档：相机快照 + 深度门 + 网格展开）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { UnifiedRandom } from '../src/core/rng';
import { parseSeed } from '../src/world/gen/SeedEasterEggs';
import { moonlordThrowSeq, SkyRenderer, type SkyFrameCtx } from '../src/render/SkyRenderer';
import {
  spawnDeathGore, resetGorePool, setGoreScreen, goreScreenValue,
  type GoreNpcSource,
} from '../src/entities/GorePiece';
import goreJson from '../src/data/vanilla-gore.json';

const TABLE = goreJson as unknown as Record<string, Array<Record<string, unknown>>>;

// ---------- ① VirtualCamera 4096² 出生域 ----------

/** node 环境无 DOM：构造 SkyRenderer 前注入 Image 桩（贴图永不 complete，绘制路径自静默） */
function stubImage(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((globalThis as any).Image) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Image = class {
    src = ''; width = 0; height = 0; complete = false;
    naturalWidth = 0; naturalHeight = 0;
  };
}

/** spawnAmbientFamily 经内部状态断言出生 X 距玩家中心恒 ≡ 2148（= 4096/2 + 100），
 *  与视口尺寸无关（HiDef 档 Main.maxScreenW/H=4096）。 */
function makeSky(): SkyRenderer {
  stubImage();
  return new SkyRenderer();
}

describe('① VirtualCamera 4096 平方出生域', () => {
  it('各族出生 X = 玩家中心 ± 2148（与视口无关，Main.cs:3753-3755）', () => {
    const sky = makeSky();
    sky.fx = { monolith: -1, party: false, surfaceY: 600 * TILE, worldW: 4200, worldH: 1200, moonEventKind: 0 };
    sky.amb = {
      dayTime: true, raining: false, eclipse: false, bloodMoon: false, moonEventKind: 0,
      zoneHallow: false, playerX: 50000, playerY: 4000,
    };
    sky.frameCtx = {
      entities: [], world: null, scene: null, player: { cx: 50000, cy: 4000 },
      clock: { dayCount: 1, timeOfDay: 0.5, isDay: true }, camX: 50000, camY: 4000,
      z: 1, viewW: 1920, viewH: 1080,
    };
    // 顺风（wind>0 → dir=1 → 左侧）：edgeX = playerX − 4096/2 − 100
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).spawnAmbientFamily('birds', 50000, 4000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ents: Array<{ x: number; y: number; depth: number }> = (sky as any).ambEntities;
    expect(ents.length).toBeGreaterThan(0);
    // SetPositionInWorldBasedOnScreenSpace（:47-50）：提议位以 Depth/3 缩放后落世界位——
    // 出生提议位须恰为 ±2148（视口 1920 下旧近似只会是 ±1060）
    for (const e of ents) {
      const propose = (e.x - 50000) / (e.depth / 3) + 50000;
      expect(Math.abs(propose - 50000)).toBeCloseTo(2148, 5);
    }
  });

  it('EOC 折线态 y = 玩家中心 − 2048（虚拟相机顶，非视口顶）', () => {
    const sky = makeSky();
    sky.fx = { monolith: -1, party: false, surfaceY: 600 * TILE, worldW: 4200, worldH: 1200, moonEventKind: 0 };
    sky.amb = {
      dayTime: false, raining: false, eclipse: false, bloodMoon: false, moonEventKind: 0,
      zoneHallow: false, playerX: 50000, playerY: 4000,
    };
    sky.frameCtx = {
      entities: [], world: null, scene: null, player: { cx: 50000, cy: 4000 },
      clock: { dayCount: 1, timeOfDay: 0.5, isDay: true }, camX: 50000, camY: 4000,
      z: 1, viewW: 800, viewH: 600,
    };
    // 强制走折线态（BeginZigZag :1260-1276）：采样序 = depth/life/Next(4)掷/方向掷，
    // 全 0.5 → Next(4)=2≠0 折线、方向掷=1（左沿外入屏右飞）
    const randSpy = spyOnGlobalRandom([0.5, 0.5, 0.5, 0.5]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as unknown as { spawnAmbientFamily(k: string, x: number, y: number): void })
      .spawnAmbientFamily('eyeball', 50000, 4000);
    randSpy.restore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ents: Array<{ x: number; y: number; state: number; depth: number }> = (sky as any).ambEntities;
    expect(ents.length).toBe(1);
    expect(ents[0].state).toBe(1);
    const top = (ents[0].y - 4000) / (ents[0].depth / 3) + 4000;   // 反解屏幕空间提议位
    expect(top).toBeCloseTo(4000 - 2048, 4);                        // vcam.Position.Y
  });
});

/** Math.random 桩（顺序消费；超出序列回退真随机） */
function spyOnGlobalRandom(seq: number[]): { restore(): void } {
  const orig = Math.random;
  let i = 0;
  Math.random = () => (i < seq.length ? seq[i++] : orig());
  return { restore() { Math.random = orig; } };
}

// ---------- ② UnifiedRandom 位级序列（ThrowPieces） ----------

describe('② moonlordThrowSeq = UnifiedRandom(DramaSeed) 位级对拍', () => {
  it('逐 seed 对拍：angle/rotV = (float)NextDouble() 经原版算式的逐运算 f32 结果', () => {
    for (const seed of [0, 1, 7, 42, 99]) {
      const rng = new UnifiedRandom(seed);
      const expectOne = () => {
        const nf = Math.fround(rng.nextDouble());                     // Utils.cs:1201 (float)
        const angle = Math.fround(
          Math.fround(Math.fround(Math.fround(nf) * Math.fround(Math.PI / 2)) - Math.fround(Math.PI / 4)) + Math.PI);
        const rotV = Math.fround(Math.fround(Math.fround(rng.nextDouble()) * 0.1) - 0.05);
        return { angle, rotV };
      };
      const expected = [expectOne(), expectOne(), expectOne(), expectOne()];
      expect(moonlordThrowSeq(seed), `seed=${seed}`).toEqual(expected);
    }
  });

  it('同种子同序列、异种子异序列（seed→序列确定性）', () => {
    expect(moonlordThrowSeq(37)).toEqual(moonlordThrowSeq(37));
    expect(moonlordThrowSeq(37)).not.toEqual(moonlordThrowSeq(38));
    const seq = moonlordThrowSeq(37);
    expect(seq.length).toBe(4);
    for (const s of seq) {
      expect(Number.isFinite(s.angle)).toBe(true);
      // nf·(π/2) − π/4 + π，nf∈[0,1) → angle ∈ [3π/4, 5π/4)
      expect(s.angle).toBeGreaterThanOrEqual(Math.PI * 3 / 4 - 1e-6);
      expect(s.angle).toBeLessThan(Math.PI * 5 / 4);
      // rotV = nf·0.1 − 0.05 ∈ [−0.05, 0.05)
      expect(s.rotV).toBeGreaterThanOrEqual(-0.05);
      expect(s.rotV).toBeLessThan(0.05);
    }
  });
});

// ---------- ②' SunVisibilityPixel 遮挡采样（HorizonHelper.cs:46-80） ----------

describe("②' SunVisibilityPixel 采样域（实心 tile 覆盖率代位）", () => {
  const sunSkyWorld = (solidCenter: boolean) => {
    const w = new World(1000, 100, 7, 'sunvis');
    // 采样域 = 太阳世界位 (800,50)tile ±64px（z=1）→ tile 796..804 × 46..54（9×9）；
    // 中心 4×4 实心 = 覆盖率 16/81
    if (solidCenter) {
      for (let y = 50; y < 54; y++) for (let x = 800; x < 804; x++) w.store.setTile(x, y, 1);
    }
    return w;
  };
  const ctxFor = (w: World, z = 1): SkyFrameCtx => ({
    entities: [], world: w, scene: null, player: { cx: 800 * TILE, cy: 50 * TILE },
    clock: { dayCount: 1, timeOfDay: 0.5, isDay: true },
    camX: 800 * TILE, camY: 50 * TILE, z, viewW: 1920, viewH: 1080,
  });

  /** drawWorldFx（lastDayTimeTicks 正午 → 光斑早退，只跑采样；ctx 无需真实画布） */
  const sample = (sky: SkyRenderer, fc: SkyFrameCtx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).frameCtx = fc;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).sunScreen = { x: fc.viewW / 2, y: fc.viewH / 2 };   // 太阳 = 屏中心 → 世界 (camX, camY)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).lastDayTimeTicks = 27000;                            // 正午 → num/num2=0 不触绘制
    sky.drawWorldFx({} as CanvasRenderingContext2D, fc.camX, fc.camY, fc.z, fc.viewW, fc.viewH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { vis: (sky as any).sunVisibility as number, ready: (sky as any).sunVisSampled as boolean };
  };

  it('开空域 → 可见度 1；实心覆盖 → 按覆盖率衰减；首帧前未采样（SunVisibilityEnabled 门）', () => {
    const sky = makeSky();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sky as any).sunVisSampled).toBe(false);   // _targetUpToDate 初值 false → 首帧不画光斑
    const open = sample(sky, ctxFor(sunSkyWorld(false)));
    expect(open.ready).toBe(true);
    expect(open.vis).toBeCloseTo(1, 6);
    const covered = sample(sky, ctxFor(sunSkyWorld(true)));
    expect(covered.vis).toBeCloseTo(1 - 16 / 81, 6);  // 中心 4×4 实心 / 9×9 采样域
  });
});

// ---------- ③ parseSeed 文本种子旗标 ----------

describe('③ parseSeed 旗标解析（稀有云门接线源）', () => {
  it('饥荒世界：constant/theconstant/eye4aneye/eyeforaneye（WorldSeedOption_DontStarve）', () => {
    for (const t of ['constant', 'theconstant', 'eye4aneye', 'eyeforaneye', 'The Constant', 'eye for an eye!']) {
      expect(parseSeed(t).flags.theConstant, `seed=${t}`).toBe(true);
    }
    expect(parseSeed('normal').flags.theConstant).toBeUndefined();
  });

  it('十周年世界：celebrationmk10 + 哈希种子 5162021/5162011（WorldSeedOption_Anniversary）', () => {
    for (const t of ['celebrationmk10', '5162021', '5162011', 'Celebration MK10!!']) {
      expect(parseSeed(t).flags.tenthAnniversary, `seed=${t}`).toBe(true);
    }
    expect(parseSeed('5162020').flags.tenthAnniversary).toBeUndefined();
  });

  it('归一化 = [^a-z0-9]+ 全剥（WorldGenerationOptions.cs:69），非数字串恒空旗标', () => {
    // drunk 文本非原版触发（SpecialSeedNames 为空）；数字路 5162020 才命中（S0-2 int 路）
    expect(parseSeed('05162020').flags.drunkWorld).toBe(true);
    expect(parseSeed('drunk world').flags.drunkWorld).toBeFalsy();
    expect(parseSeed('getfixedboi').flags.everything).toBe(true);
    expect(parseSeed('9293480').flags).toEqual({});
    // 窄归一化（旧实现只剥 空格/._-）下漏网的标点/其他符号形态
    expect(parseSeed("don't dig up").flags.remix).toBe(true);
    expect(parseSeed('no_traps').flags.noTraps).toBe(true);
  });
});

// ---------- ④ WoF 屏幕级尘幕（screenGrid 档） ----------

function makeWorld(): World {
  const w = new World(200, 400, 7, 'wof-tail');
  return w;
}

function wofSrc(over: Partial<GoreNpcSource> = {}): GoreNpcSource {
  return {
    vanillaId: 113, x: 30000, y: 6200, w: 80, h: 80,
    vx: 0, vy: 0, vanillaScale: 1,
    ai0: 0, ai1: 0, ai2: 0, ai3: 0, hitDir: 1, direction: 1,
    ...over,
  };
}

describe('④ WoF 死亡屏幕级尘幕（NPC.cs:88307-88327）', () => {
  it('表项：仅 113 持有 screenGrid，域常量与源码逐项对拍', () => {
    const curtain = (TABLE['113'] ?? []).filter((e) => 'screenGrid' in e);
    expect(curtain.length).toBe(1);
    expect(curtain[0].screenGrid).toEqual({
      yStep: 50, ySpan: 'screenWidth', xSpan: 140, xStep: 46, dirShift: -80,
      gate: 'playerDeepHell', gateTiles: 250,
    });
    expect(curtain[0].idMin).toBe(140);
    expect(curtain[0].idMax).toBe(142);
    expect((TABLE['114'] ?? []).some((e) => 'screenGrid' in e)).toBe(false);
  });

  it('网格展开：相机快照 + 深度门过 → 4 列 × ceil(屏宽/50) 行，位置锚屏顶与 npc 位', () => {
    resetGorePool();
    const w = makeWorld();
    // 相机快照：屏顶世界 Y=6000、屏宽 500（→ 10 行）
    setGoreScreen(30000, 6000, 500, 300);
    const ctx = { screen: goreScreenValue(), playerTileY: 390, maxTilesY: w.store.h };
    const spawned: Array<{ x: number; y: number }> = [];
    const n = spawnDeathGore(wofSrc(), (p) => {
      spawned.push({ x: p.x, y: p.y });
    }, ctx);
    // 4 嘴部碎块（88299-88302）+ 网格 4×10=40
    expect(n).toBe(4 + 40);
    const grid = spawned.slice(4);
    expect(grid.length).toBe(40);
    // 行锚 = 屏顶世界 Y（6000 起、步 50）；列锚 = npc.X（direction>0 时 −80）、步 46、宽 140
    const rows = new Set(grid.map((g) => g.y));
    expect([...rows].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 10 }, (_, i) => 6000 + i * 50));
    const cols = [...new Set(grid.map((g) => g.x))].sort((a, b) => a - b);
    expect(cols).toEqual([30000 - 80, 30000 - 80 + 46, 30000 - 80 + 92, 30000 - 80 + 138]);
  });

  it('深度门：玩家未深于 maxTilesY-250 → 网格档整档不出（嘴部碎块照常）', () => {
    resetGorePool();
    const w = makeWorld();
    setGoreScreen(30000, 6000, 500, 300);
    const ctx = { screen: goreScreenValue(), playerTileY: 100, maxTilesY: w.store.h };
    const spawned: unknown[] = [];
    const n = spawnDeathGore(wofSrc(), (p) => spawned.push(p), ctx);
    expect(n).toBe(4);                       // 仅嘴部四件（:88299-88302）
    expect(spawned.length).toBe(4);
  });

  it('相机快照未注入 → screenGrid 档静默跳过（不崩、不出网格）', () => {
    resetGorePool();
    const w = makeWorld();
    const spawned: unknown[] = [];
    const n = spawnDeathGore(wofSrc(), (p) => spawned.push(p),
      { screen: null, playerTileY: 390, maxTilesY: w.store.h });
    expect(n).toBe(4);
  });

  it('逐格 id 域 140-142、速度域 (±8, [-6,2])（:88322-88324 逐格重采样）', () => {
    resetGorePool();
    const w = makeWorld();
    setGoreScreen(30000, 6000, 500, 300);
    const ctx = { screen: goreScreenValue(), playerTileY: 390, maxTilesY: w.store.h };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spawned: any[] = [];
    spawnDeathGore(wofSrc(), (p) => spawned.push(p), ctx);
    for (const p of spawned.slice(4)) {
      expect(p.goreId).toBeGreaterThanOrEqual(140);
      expect(p.goreId).toBeLessThanOrEqual(142);
      // NewGore 随机扰动叠加前不校验；域宽 8/6 只验证量级（扰动 ±2/±3）
      expect(Math.abs(p.vx)).toBeLessThanOrEqual(8 + 2.01);
      expect(p.vy).toBeGreaterThanOrEqual(-6 - 3.01);
      expect(p.vy).toBeLessThanOrEqual(2 + 3.01);
    }
  });
});
