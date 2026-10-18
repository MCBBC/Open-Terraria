// ★BJ429（2026-09-23 用户实报"虚空保险库只剩一个底座,上面的悬浮部分不见了"）判别闸。
//
// 定谳锚（Terarria1457 亲读）：
//   · 悬浮透镜本体从不在 Tiles_491 内——tile 面采样带（右半,TileDrawing.cs:5405-5407
//     addFrX=54,BJ248 已对齐）只有底座行（本文件 T-B1 用盘上 PNG 逐格 alpha 钉死）；
//     悬浮体 = 独立绘制面：TileDrawing.cs:700-705 对中心格（frameX==18&&frameY==18）
//     登记 VoidLens special point → DrawVoidLenses（TileDrawing.cs:8876-8902）以
//     Projectile_734 贴图（34×48×8）画悬浮体。左半 sheet=整库旧画,原版永不采样。
//   · VoidLensHelper.cs：心=中心格 ToWorldCoordinates(+8,+8) 再 Y−2（:28）；帧=
//     (int)((tileFrameCounter[491]+pos.X+pos.Y)%40)/5（:31;计数器 Main.cs:19410 回卷
//     40=8 帧×5t）;点光 0.4/0.2/0.9（:36）;尘 86/88（:40-63）;本体色 Lerp(光照,
//     White,0.5)（:83）;回声×3 A=0 纯加法 tint(127,50,127)、scale×1.1、α=0.3+0.1x、
//     轨道 (GTW/5+num)·2π 向量×(x+2)（:87-97）;选中辉光 Extra_93 同帧栅格
//     （:99-105;Colors.cs:127 GetSelectionGlowColor）。
//   · 病灶=绘制层缺面（BJ248 只对齐 tile 面,special point 尾扫整缺）⇒ 新放/存档
//     皆同缺——与锚/存档无关（BJ377 repairLegacyContainerAnchorsInStore 只触 21 箱
//     锚,491 不在判别域;用户底座帧完好=帧面无罪）。
//
// 变异证红映射：
//   M1  摘 drawVoidLenses 层/摘中心格判据      → T-C1 红（本体/光/尘整缺）
//   M2  帧式 %40 或 ÷5 破坏（如 %30、÷4）      → T-A1 红（钉值）
//   M3  心位 Y−2 摘除（回 +8）                 → T-A2 红
//   M4  尾序 pos+=v×10/v×−1 摘除或支互换       → T-A4 红（钉值）
//   M5  回声 'lighter' 改 source-over/α 式破坏 → T-C6 红（echo 序列;BJ449-D5 移 7b0）
//   M6  tile 面 addFrX=54 回左半（BJ248 回退）  → T-B1+旧 bj248 T1 双红（防连带）
//   M7  尘支方向向量 (0.5,1) 摘除/SafeNormalize 摘除 → T-A4 红
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore pngjs 无类型声明（同 tests/bj248-voidvault-rainbowcloud-draw.test.ts 用法）
import { PNG } from 'pngjs';
import {
  VOID_LENS_FW, VOID_LENS_FH, VOID_LENS_ECHO_PHASES,
  voidLensCenterOf, voidLensFrameOf, voidLensEchoPulse,
  voidLensEchoAlpha, voidLensEchoRadius, voidLensEchoAngle, voidLensDustSpec,
} from '../src/render/VoidLens';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { tileAnim } from '../src/render/TileAnim';
import { smartInteractTileFrame } from '../src/core/SmartInteractTiles';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457', 'terraria-assets'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = TILE_BY_KEY['v_491_void_vault']!;

// ============================================================ A：纯算面（VoidLensHelper.cs 钉值）
describe.skipIf(EXT_MISSING)('★BJ429 A：透镜纯算面 1:1（VoidLensHelper.cs）', () => {
  it('T-A1 帧式=(int)((cnt+pos.X+pos.Y)%40)/5（:31;计数器 Main.cs:19410 回卷 40）', () => {
    // 中心格(0,0)：wx=8,wy=6 → 和 14 → tick0:14%40=14→⌊14/5⌋=2
    expect(voidLensFrameOf(0, 8, 6)).toBe(2);
    // tick=26 → 40%40=0 → 0（回卷临界）
    expect(voidLensFrameOf(26, 8, 6)).toBe(0);
    // 中心格(100,50)：1608+806=2414 → tick0:14→2;tick5:19→3;tick39:13→2
    expect(voidLensFrameOf(0, 1608, 806)).toBe(2);
    expect(voidLensFrameOf(5, 1608, 806)).toBe(3);
    expect(voidLensFrameOf(39, 1608, 806)).toBe(2);
    // 逐库错相：相邻库（中心格 +1 列=+16px）同 tick 相位可异（和 +16 → 2414+16=2430%40=30→6）
    expect(voidLensFrameOf(0, 1624, 806)).toBe(6);
    // 域=0..7
    for (let tk = 0; tk < 40; tk++) {
      const f = voidLensFrameOf(tk, 1608, 806);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(7);
    }
  });

  it('T-A2 心=中心格 (+8,+8) 再 Y−2（ctor :28）——3×3 库体几何中心上移 2px', () => {
    expect(voidLensCenterOf(0, 0)).toEqual([8, 6]);
    expect(voidLensCenterOf(5, 7)).toEqual([88, 118]);   // 5·16+8 / 7·16+6
    expect(voidLensCenterOf(11, 21)).toEqual([184, 342]);
  });

  it('T-A3 回声：x=cos(GTW·2π/5)（:92）;α=0.3+0.1x（:93）;半径=x+2（:94）;相位=(GTW/5+num)·2π（:94）', () => {
    expect(voidLensEchoPulse(0)).toBeCloseTo(1, 12);
    expect(voidLensEchoPulse(2.5)).toBeCloseTo(-1, 12);      // cos(π)
    expect(voidLensEchoAlpha(1)).toBeCloseTo(0.4, 12);
    expect(voidLensEchoAlpha(-1)).toBeCloseTo(0.2, 12);      // 0.2..0.4 呼吸域
    expect(voidLensEchoRadius(1)).toBeCloseTo(3, 12);
    expect(voidLensEchoRadius(-1)).toBeCloseTo(1, 12);       // 1..3px 轨道域
    expect([...VOID_LENS_ECHO_PHASES]).toEqual([0, 0.34, 0.68]);   // :87 三圈步进
    expect(voidLensEchoAngle(0, 0)).toBe(0);
    expect(voidLensEchoAngle(0, 0.34)).toBeCloseTo(0.34 * Math.PI * 2, 12);
    expect(voidLensEchoAngle(0, 0.68)).toBeCloseTo(0.68 * Math.PI * 2, 12);
  });

  it('T-A4 尘掷序/算式 1:1（:40-63）——A 支钉值/B 支钉值/1-门-null/域', () => {
    const cx = 184, cy = 342;
    // A 支（rand 序=门0.1→支0.2→型0.9→向0.5→半径0.0→scale0.25）：dir=0.5·4π−2π=0
    // → n=(−0,1) → v=(−ny·2,nx·2)=(−2,−0) → pos=(cx−0·10+(−2)·10, cy−1·10+0)=(164,332)
    // → vel=−v=(2,0);r=Next(10,21)=10;scale=0.75;type=88
    {
      const seq = [0.1, 0.2, 0.9, 0.5, 0.0, 0.25];
      let k = 0;
      const d = voidLensDustSpec(cx, cy, () => seq[k++]!);
      expect(d).not.toBeNull();
      expect(d!.type).toBe(88);
      expect(d!.x).toBeCloseTo(164, 12);
      expect(d!.y).toBeCloseTo(332, 12);
      expect(d!.vx).toBeCloseTo(2, 12);
      expect(d!.vy).toBeCloseTo(0, 12);
      expect(d!.scale).toBeCloseTo(0.75, 12);
      expect(d!.fadeIn).toBe(0.5);
      expect(k).toBe(6);
    }
    // B 支（门0.32→支0.7→型0.1→向0.25→半径0.99→scale0.1）：dir=0.25·4π−2π=−π
    // → n=(0,−1) → v=(ny·3,−nx·3)=(−3,0) → pos=(cx−30, cy+9)=(154,351);r=Next(5,10)=9
    {
      const seq = [0.32, 0.7, 0.1, 0.25, 0.99, 0.1];
      let k = 0;
      const d = voidLensDustSpec(cx, cy, () => seq[k++]!);
      expect(d!.type).toBe(86);
      expect(d!.x).toBeCloseTo(154, 12);
      expect(d!.y).toBeCloseTo(351, 12);
      expect(d!.vx).toBeCloseTo(3, 12);
      expect(d!.vy).toBeCloseTo(0, 12);
      expect(d!.scale).toBeCloseTo(0.6, 12);
    }
    // 1/3 门：首掷 ≥1/3 → null（零后续掷）
    {
      let k = 0;
      expect(voidLensDustSpec(cx, cy, () => (k++ === 0 ? 1 / 3 : 0))).toBeNull();
      expect(k).toBe(1);
    }
    // 域：半径支 A∈10..20/支 B∈5..9、scale∈0.5..1.5（全序扫描）
    for (let i = 0; i < 200; i++) {
      const d = voidLensDustSpec(cx, cy, Math.random);
      if (!d) continue;
      expect(d.scale).toBeGreaterThanOrEqual(0.5);
      expect(d.scale).toBeLessThan(1.5);
      expect([86, 88]).toContain(d.type);
      const dx = d.x - cx, dy = d.y - cy;
      const dist = Math.hypot(dx, dy);
      expect(dist).toBeLessThanOrEqual(30 + 30);   // |心−n·r|≤20 + |v·10|≤30
      expect(dist).toBeGreaterThanOrEqual(5);
    }
  });
});

// ============================================================ B：贴图面（盘上 PNG alpha 逐格）
describe.skipIf(EXT_MISSING)('★BJ429 B：贴图面——tile 面只含底座,悬浮体在 Projectile_734（判别核心）', () => {
  const png = (rel: string): ReturnType<typeof PNG.sync.read> =>
    PNG.sync.read(readFileSync(join(ROOT, rel)));

  it('T-B1 Tiles_491 108×54：右半行 0-1 全透明（tile 面本就画空格）/行 2 有底座;左半整库', () => {
    const img = png('public/sprites/vanilla/Tiles_491.png');
    expect(img.width).toBe(108);
    expect(img.height).toBe(54);
    const alphaAt = (px: number, py: number): number =>
      img.data[(py * img.width + px) * 4 + 3];
    const cellNonzero = (cx: number, cy: number): number => {
      let n = 0;
      for (let py = cy * 18; py < cy * 18 + 18; py++) {
        for (let px = cx * 18; px < cx * 18 + 18; px++) {
          if (alphaAt(px, py) > 0) n++;
        }
      }
      return n;
    };
    // 右半（列 3-5=tile 面采样带 addFrX=54）：行 0-1（悬浮体位）全透明 → 「帧错指空区」
    // 假设出局——原版本就画透明格,悬浮体必来自独立贴图;行 2=底座（有内容）
    for (const cx of [3, 4, 5]) {
      expect(cellNonzero(cx, 0), `右半(${cx},0)`).toBe(0);
      expect(cellNonzero(cx, 1), `右半(${cx},1)`).toBe(0);
      expect(cellNonzero(cx, 2), `右半(${cx},2) 底座`).toBeGreaterThan(0);
    }
    // 左半（列 0-2=整库旧画,原版永不采样）：三行皆有内容
    for (const cx of [0, 1, 2]) {
      for (const cy of [0, 1, 2]) {
        expect(cellNonzero(cx, cy), `左半(${cx},${cy})`).toBeGreaterThan(0);
      }
    }
  });

  it('T-B2 Projectile_734/Extra_93=34×384=8 帧×34×48 且逐帧有内容;repo 副本与原版 md5 全等', () => {
    for (const [name, w, h] of [
      ['Projectile_734', 34, 384], ['Extra_93', 34, 384], ['Tiles_491', 108, 54],
    ] as const) {
      const repo = readFileSync(join(ROOT, `public/sprites/vanilla/${name}.png`));
      const src = readFileSync(join(ROOT, `../terraria-assets/Images/${name}.png`));
      expect(createHash('md5').update(repo).digest('hex'), `${name} md5`)
        .toBe(createHash('md5').update(src).digest('hex'));
      if (name === 'Tiles_491') continue;   // T-B1 已逐格
      const img = PNG.sync.read(repo);
      expect(img.width, `${name} 宽`).toBe(w);
      expect(img.height, `${name} 高`).toBe(h);
      for (let f = 0; f < 8; f++) {
        let n = 0;
        for (let py = f * 48; py < f * 48 + 48; py++) {
          for (let px = 0; px < 34; px++) {
            if (img.data[(py * img.width + px) * 4 + 3] > 0) n++;
          }
        }
        expect(n, `${name} 帧${f}`).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================ C：Renderer 集成（录制画布）
// ---- 录制桩（bj114 同构;set 赋值亦录） ----
interface Call { fn: string; args: unknown[] }
type RecCtx = CanvasRenderingContext2D & { __calls: Call[] };
function makeCtx(): RecCtx {
  const calls: Call[] = [];
  return new Proxy({ __calls: calls }, {
    get(t, k) {
      if (k === '__calls') return calls;
      return (...args: unknown[]) => { calls.push({ fn: String(k), args }); };
    },
    set(t, k, v) { calls.push({ fn: `set.${String(k)}`, args: [v] }); return true; },
  }) as unknown as RecCtx;
}
interface RecCanvas {
  width: number; height: number; style: Record<string, string>;
  parentElement: { appendChild(c: unknown): void } | null;
  getContext(): RecCtx;
}
function makeCanvas(w = 300, h = 150): RecCanvas {
  const ctx = makeCtx();
  return {
    width: w, height: h, style: {}, parentElement: null,
    getContext: () => ctx,
  } as unknown as RecCanvas;
}

const IMG734 = { __tag: 'proj734', width: 34, height: 384 };
const IMG93 = { __tag: 'extra93', width: 34, height: 384 };

let RendererCtor: typeof import('../src/render/Renderer').Renderer;
let r: import('../src/render/Renderer').Renderer;
let mainCtx: RecCtx;
const lightCalls: Array<[number, number, number, number, number]> = [];
const spawnCalls: Array<{ args: unknown[]; dust: Record<string, number | boolean> }> = [];
const created: RecCanvas[] = [];

function makeVaultWorld(vaultCells: Array<{ x: number; y: number; fx: number; fy: number; active?: boolean }>) {
  const st = new TileStore(200, 200);
  for (const c of vaultCells) {
    st.setTileSilent(c.x, c.y, VAULT, c.fx, c.fy);
    if (c.active === false) st.flags[st.idx(c.x, c.y)] = 0;
  }
  return { store: st, w: 200, h: 200 };
}
const CAM = { x: 184, y: 342 };   // 透镜心（=库体中心格 11,21 的心）
const draw = (world: { store: TileStore; w: number; h: number }, paused = false) => {
  (r as unknown as Record<string, unknown>)._worldPaused = paused;
  (r as unknown as { drawVoidLenses(...args: unknown[]): void })
    .drawVoidLenses(CAM, world, 800, 600, 1);
};
const flush = () => {
  (r as unknown as { flushVoidLensComplements(): void }).flushVoidLensComplements();
};

beforeAll(async () => {
  (globalThis as Record<string, unknown>).Image = class {
    src = ''; onload: (() => void) | null = null;
    width = 0; height = 0;
    addEventListener() { /* noop */ }
  };
  (globalThis as Record<string, unknown>).document = {
    createElement: (_tag: string) => { const c = makeCanvas(); created.push(c); return c; },
  };
  (globalThis as Record<string, unknown>).window = {
    addEventListener: () => {}, removeEventListener: () => {},
    innerWidth: 1280, innerHeight: 720,
  };
  ({ Renderer: RendererCtor } = await import('../src/render/Renderer'));
  r = new RendererCtor(null as never);
  mainCtx = makeCtx();
  const rAny = r as unknown as Record<string, unknown>;
  rAny.ctx = mainCtx;
  rAny.atlas = {
    vmisc(path: string) {
      if (path === 'vanilla/Projectile_734.png') {
        return { img: IMG734, sx: 0, sy: 0, sw: 34, sh: 384 };
      }
      if (path === 'vanilla/Extra_93.png') {
        return { img: IMG93, sx: 0, sy: 0, sw: 34, sh: 384 };
      }
      return null;
    },
  };
  rAny.lighting = {
    clock: { globalTimeWrappedHourly: 0 },
    addLight: (x: number, y: number, r2: number, g: number, b: number) => {
      lightCalls.push([x, y, r2, g, b]);
    },
    lightAt: () => [200, 200, 200],
  };
  rAny.vanillaDust = {
    spawn: (...args: unknown[]) => {
      const dust: Record<string, number | boolean> = {
        x: 0, y: 0, vx: 0, vy: 0, scale: 0, fadeIn: 0, noGravity: false, noLightEmittance: false,
      };
      spawnCalls.push({ args, dust });
      return dust;
    },
  };
}, 120000);

afterEach(() => {
  vi.restoreAllMocks();
  mainCtx.__calls.length = 0;
  lightCalls.length = 0;
  spawnCalls.length = 0;
  smartInteractTileFrame.tileWon = false;
  smartInteractTileFrame.coords = [];
  smartInteractTileFrame.selected = new Set<string>();
  tileAnim.tick = 0;
});

describe.skipIf(EXT_MISSING)("★BJ429 C：Renderer.drawVoidLenses 集成（render 2c'.0 层）", () => {
  it("T-C1 中心格触发：本体 sy=帧×48 落位心±半宽 + 点光 0.4/0.2/0.9 + 尘（回声移 7b0 flush=T-C6）", () => {
    // 库体 3×3 @ (10,20)..(12,22),中心格 (11,21) fx=fy=18;tick=0 → 帧=(0+184+342)%40/5=1
    const world = makeVaultWorld([
      { x: 10, y: 20, fx: 0, fy: 0 }, { x: 11, y: 20, fx: 18, fy: 0 }, { x: 12, y: 20, fx: 36, fy: 0 },
      { x: 10, y: 21, fx: 0, fy: 18 }, { x: 11, y: 21, fx: 18, fy: 18 }, { x: 12, y: 21, fx: 36, fy: 18 },
      { x: 10, y: 22, fx: 0, fy: 36 }, { x: 11, y: 22, fx: 18, fy: 36 }, { x: 12, y: 22, fx: 36, fy: 36 },
    ]);
    // Math.random 序（单尘）：门0.1→支0.2→型0.9→向0.5→半径0.0→scale0.25（=T-A4 A 支钉值）
    const rnd = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1).mockReturnValueOnce(0.2).mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.5).mockReturnValueOnce(0.0).mockReturnValueOnce(0.25);
    draw(world);
    expect(rnd).toHaveBeenCalledTimes(6);
    // 点光（Helper.Update :36;tile 坐标=中心格）
    expect(lightCalls).toEqual([[11, 21, 0.4, 0.2, 0.9]]);
    // 主画布 drawImage：1 本体（9 参）——★BJ449-D5 回声已撤出世界层（防 ×light 乘暗）
    const draws = mainCtx.__calls.filter((c) => c.fn === 'drawImage');
    expect(draws).toHaveLength(1);
    const b = draws[0]!.args as [unknown, number, number, number, number, number, number, number, number];
    expect(b[0]).toBe(IMG734);
    expect(b[1]).toBe(0);            // tex.sx
    expect(b[2]).toBe(48);           // sy=帧 1 ×48（帧式 M2 变异红）
    expect(b[3]).toBe(34); expect(b[4]).toBe(48);
    expect(b[5]).toBe(400 + 0 - 17); // xd=ox+round((184−184)·1)−17（心位 M3 变异红）
    expect(b[6]).toBe(300 + 0 - 24); // yd=oy+round((342−342)·1)−24
    expect(b[7]).toBe(34); expect(b[8]).toBe(48);
    // 回声×3 断言移 T-C6（★BJ449-D5：原版回声不吃 light,7b0 乘光后补画）
    // 尘：spawn(164,332,0,0,88) + 字段全覆写（T-A4 A 支钉值）
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]!.args).toEqual([164, 332, 0, 0, 88]);
    const d = spawnCalls[0]!.dust;
    expect(d.x).toBeCloseTo(164, 12);
    expect(d.y).toBeCloseTo(332, 12);
    expect(d.vx).toBeCloseTo(2, 12);
    expect(d.vy).toBeCloseTo(0, 12);
    expect(d.scale).toBeCloseTo(0.75, 12);
    expect(d.fadeIn).toBe(0.5);
    expect(d.noGravity).toBe(true);
    expect(d.noLightEmittance).toBe(true);
  });

  it("T-C6 回声×3 = 7b0 乘光后 'lighter' 补画（★BJ449-D5：原版回声零 GetColor 不吃 light,VoidLensHelper.cs:90/:93）", () => {
    const world = makeVaultWorld([{ x: 11, y: 21, fx: 18, fy: 18 }]);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);   // ≥1/3 → 无尘
    draw(world);
    expect(mainCtx.__calls.filter((c) => c.fn === 'drawImage')).toHaveLength(1);   // 扫描期零回声直绘
    flush();
    const draws = mainCtx.__calls.filter((c) => c.fn === 'drawImage');
    // flush 段 = 1 白化补差（lightAt 200 → 补差 28）+ 3 回声
    expect(draws).toHaveLength(5);
    for (let e = 2; e <= 4; e++) {
      const args = draws[e]!.args as [unknown, number, number, number, number];
      expect(args[0]).toBeTruthy();                  // = _voidLensCompScratch 布
      expect(args[3]).toBe(37);                      // 尺寸 ×1.1=37×53（M5 红）
      expect(args[4]).toBe(53);
    }
    // 回声 lighter 置位 + α0.4（t=0 呼吸峰,x=cos0=1 → 0.3+0.1）+ 尾置 1
    const lighterSets = mainCtx.__calls
      .filter((c) => c.fn === 'set.globalCompositeOperation' && c.args[0] === 'lighter');
    expect(lighterSets.length).toBeGreaterThanOrEqual(2);   // 补差 1 + 回声批 1
    const alphas = mainCtx.__calls
      .filter((c) => c.fn === 'set.globalAlpha')
      .map((c) => c.args[0] as number);
    expect(alphas).toContain(0.4);
    expect(alphas[alphas.length - 1]).toBe(1);
    // 回声 tint 烘焙在 _voidLensCompScratch（补差 28 → 回声 127,50,127 序）
    const scratch = created.find((c) =>
      c.getContext().__calls.some((k) => k.fn === 'set.fillStyle' && k.args[0] === 'rgb(127,50,127)'));
    expect(scratch).toBeTruthy();
    const fills = scratch!.getContext().__calls
      .filter((k) => k.fn === 'set.fillStyle')
      .map((k) => k.args[0] as string);
    expect(fills).toContain('rgb(28,28,28)');        // 补差先行（0.5×(255−200)）
    expect(fills[fills.length - 1]).toBe('rgb(127,50,127)');
  });

  it('T-C2 非中心格/失活中心格零触发（TileDrawing.cs:701 frameX==18&&frameY==18 门）', () => {
    const world = makeVaultWorld([
      { x: 10, y: 20, fx: 0, fy: 0 },    // 角格
      { x: 20, y: 20, fx: 18, fy: 18, active: false },   // 失活中心格
    ]);
    draw(world);
    expect(mainCtx.__calls.filter((c) => c.fn === 'drawImage')).toHaveLength(0);
    expect(lightCalls).toHaveLength(0);
    expect(spawnCalls).toHaveLength(0);
  });

  it('T-C3 暂停门（:429 !gamePaused）：光/尘停,本体/回声仍画（DrawToDrawData 无暂停门）', () => {
    const world = makeVaultWorld([{ x: 11, y: 21, fx: 18, fy: 18 }]);
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    draw(world, true);
    flush();                                  // 回声/补差在 7b0 段（BJ449-D5）
    expect(lightCalls).toHaveLength(0);
    expect(spawnCalls).toHaveLength(0);
    expect(rnd).not.toHaveBeenCalled();       // 尘掷在 spec 生成前被消费端门拦
    expect(mainCtx.__calls.filter((c) => c.fn === 'drawImage').length).toBeGreaterThanOrEqual(4);
  });

  it("T-C5 源文本锚（层序锁）：2c'.0 调用块 verbatim 且在晶塔水晶 2c'.1 之前（PostDrawTiles :427-429 序）", () => {
    // 绘制接线变异（摘 call/换序/死码化）在直调 harness 下不可见——以源文本锚补位（bj114 ③同构）
    const src = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
    const block = src.match(/if \(this\.atlas\) \{\n\s*this\.drawVoidLenses\(cam, world, viewW, viewH, z\);\n\s*\}/);
    expect(block, "drawVoidLenses 调用块缺失/被改（M1：摘 call/条件死码化均红）").not.toBeNull();
    const lensIdx = src.indexOf('this.drawVoidLenses(cam, world, viewW, viewH, z)');
    const pylonIdx = src.indexOf('this.drawPylonCrystals(cam, world, viewW, viewH, z)');
    expect(lensIdx).toBeGreaterThan(-1);
    expect(pylonIdx).toBeGreaterThan(-1);
    expect(lensIdx, '透镜层须在晶塔水晶层之前（原版 DrawVoidLenses→DrawTeleportationPylons）')
      .toBeLessThan(pylonIdx);
    expect(src.includes("2c'.0 虚空保险库悬浮透镜层")).toBe(true);
  });

  it('T-C4 智能光标选中：Extra_93 同帧栅格 ×GetSelectionGlowColor（:99-105;Colors.cs:127）', () => {
    const world = makeVaultWorld([{ x: 11, y: 21, fx: 18, fy: 18 }]);
    smartInteractTileFrame.tileWon = true;
    smartInteractTileFrame.coords = [{ x: 11, y: 21 }];
    smartInteractTileFrame.selected = new Set(['11,21']);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);   // ≥1/3 → 无尘（只验选中面）
    draw(world);
    // lightAt mock=[200,200,200] → avg=200>10;selected → [avg,avg,⌊avg/3⌋,avg]=[200,200,66,200]
    // fillStyle 营业在刮擦布 ctx（tint 三步管线）;scratch=收到 Extra_93 切片的画布
    const scratch = created.find((c) =>
      c.getContext().__calls.some((k) => k.fn === 'drawImage' && k.args[0] === IMG93));
    expect(scratch).toBeTruthy();
    const fills = scratch!.getContext().__calls
      .filter((k) => k.fn === 'set.fillStyle')
      .map((k) => k.args[0] as string);
    expect(fills[fills.length - 1]).toBe('rgb(200,200,66)');   // 末次=选中 tint（echo 先行 127,50,127）
    const selAlpha = mainCtx.__calls
      .filter((c) => c.fn === 'set.globalAlpha' && c.args[0] === 200 / 255);
    expect(selAlpha.length).toBeGreaterThanOrEqual(1);         // ga/255 回主画布
  });
});
