// 清偿刀 P3（2026-09-30）：无人机 1020 绘制三件判别锁。标杆=Terarria1457 反编译：
//   F3 fade 序  Main.cs:28309-28328 DrawTrail——oldPos[0]=最新（Projectile.cs:17252-17264
//               逐槽下移+[0]=当前）,num4=Remap(num2,0,num,1,0)（:28324）键在段旧端索引
//               num2=段龄 ⇒ 机身段最亮、尾端最暗;本仓 posRing push 序=尾→头（ring[0] 最旧）
//               ⇒ 段龄=ring.length−i。旧码 remap(i) 沿尾迹倒置（机身最暗）。预热面定谳：
//               旧码段数 0,1,…,19 与原版逐帧全等（Zero 门只跳未填槽,非「整段不画」）,
//               预热期倒置由同一序修吸收。
//   F4 fade 曲线 baseColor*num4（:28325）rgba 四通道全乘 → (SrcAlpha,InvSrcAlpha)
//               （PrepareDrawnEntityDrawing Main.cs:38678 BlendState.AlphaBlend）⇒
//               rgb 有效贡献 ∝ fade²、遮蔽 src.a ∝ fade¹。旧码仅 globalAlpha 乘（白带
//               贡献 ∝ fade¹,中段 ~2× 偏亮）。修=顶点色×fade 四通道直乘 fillStyle、
//               globalAlpha 恒 1（原版语义逐式;ga=fade·fade 会把 src.a 过遮蔽,弃）。
//   F7 uDirection ArmorShaderData.cs:109 Apply 尾 entity.direction（带/体同源）——
//               direction 每拍由 AutomaticallyChangesDirection 重导（Projectile.cs:
//               17387-17401 aiStyle 195 不豁免 → :17121-17132 velocity.X<0?−1:1）。
//               旧码 dir/spriteDir 恒 0→||1 恒 1,向左发射染料方向反。
// 判别面：段序 alpha 表（emission 序=offset A i=19..1 → offset B i=19..1,38 rect 满环）、
//   四通道乘 rgb 钉值、globalAlpha 恒 1、机位距离序（trans[0] 最近机身=最亮段）、
//   dyedSolidBand/dyedProjCanvas facing 透传（vx<0→−1/vx>0→+1）+ 白带 rgba(243,243,243,.95)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import type { Renderer } from '../src/render/Renderer';
import type { Camera } from '../src/render/Camera';
import { JimsDroneProj } from '../src/entities/DroneProjs';
import { ITEM_DEFS } from '../src/data/items';
import { dyedSolidBand, dyedProjCanvas } from '../src/data/projDye';
import { remap } from '../src/stats/ScaleStats';

vi.mock('../src/entities/Arrow', () => ({
  projSprite: () => ({ width: 32, height: 20 }),   // 本体支 img 桩（尾迹面不消费）
}));
vi.mock('../src/data/projDye', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/data/projDye')>();
  return {
    ...real,
    dyeChannelsOf: () => ({ cPet: 1 }),
    getProjDesiredDyeVid: () => 3457,
    dyedSolidBand: vi.fn(() => [255, 255, 255, 255]),        // 白带输出桩（ArmorColored 终 α=255 同相）
    dyedProjCanvas: vi.fn(() => null),                        // 本体染桩 → 回退原图直绘
  };
});

const realRandom = Math.random;
beforeEach(() => { Math.random = realRandom; });
afterEach(() => { Math.random = realRandom; vi.clearAllMocks(); });

type Cap = { fillStyle: string; globalAlpha: number; rect: number[]; tx: number; ty: number };

/** 记录型 ctx：fillRect 时快照 fillStyle/globalAlpha/translate（face-layer-routing 同族假体） */
function recordingCtx(): { ctx: CanvasRenderingContext2D; caps: Cap[] } {
  const caps: Cap[] = [];
  const transStack: Array<[number, number]> = [];
  const t: Record<string, unknown> = { fillStyle: '#000', globalAlpha: 1 };
  const ctx = new Proxy(t, {
    get(o, k) {
      if (k === 'fillStyle' || k === 'globalAlpha') return (o as Record<string, unknown>)[k as string];
      return (...args: unknown[]) => {
        if (k === 'translate') transStack.push([args[0] as number, args[1] as number]);
        if (k === 'fillRect') {
          const prev = transStack.pop() ?? [NaN, NaN];
          caps.push({ fillStyle: o.fillStyle as string, globalAlpha: o.globalAlpha as number,
            rect: args as number[], tx: prev[0], ty: prev[1] });
        }
        return undefined;
      };
    },
    set(o, k, v) { (o as Record<string, unknown>)[k as string] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, caps };
}

function flatWorld(): World {
  const w = new World(160, 240, 30, 'p3-trail');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 200, 1, 0, 0);   // 地面 y=200 格
  return w;
}

function makeGame(w: World, player?: Record<string, unknown>): GameHooks {
  return {
    world: w,
    player: player ?? { dead: false },
    enemies: () => [], critters: () => [],
    spawnDust: () => null, addLightAt: () => {},
  } as unknown as GameHooks;
}

/** rgba() 解析（fillStyle α 走 toFixed(4) 量化 → 断言精度对齐 4 位） */
function parseRgba(s: string): { r: number; g: number; b: number; a: number } {
  const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(s);
  if (!m) throw new Error(`not rgba: ${s}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}

// ===========================================================================
// ① P3-F3+F4：满环 38 段 fade 序（机身最亮→尾端最暗）+ 四通道乘 + ga 恒 1（绿带档）
// ===========================================================================
describe('P3-F3/F4 1020 尾迹 fade 序与四通道曲线（DrawTrail Main.cs:28309-28328）', () => {
  it('满环 38 rect：段 i 顶点色 alpha=(127/255)·(i/20) 机身端最亮、rgb 四通道×fade、globalAlpha 恒 1', () => {
    const d = new JimsDroneProj(1600, 1400, 2, 0);   // 绿带档（ownerPlayer 不设 → dyeVid 0;构造=(cx,cy,vx,vy) 无 projId 位）
    const game = makeGame(flatWorld());
    for (let k = 0; k < 20; k++) d.fixedUpdate(1 / 60, game);   // 满环 20 槽
    const { ctx, caps } = recordingCtx();
    d.draw({ ctx } as unknown as Renderer, {} as unknown as Camera);
    expect(caps.length).toBe(38);                          // 2 偏移 × 19 段（num2=1..19 :28313）
    // emission 序 = offset(10,2) i=19..1 → offset(−10,2) i=19..1（i=新端索引;旧端段龄=20−i）
    for (let j = 0; j < 38; j++) {
      const i = 19 - (j % 19);
      const f = remap(20 - i, 0, 20, 1, 0);                // Remap(num2,0,20,1,0),num2=段龄=20−i（f32 管线同源）
      const c = parseRgba(caps[j].fillStyle);
      expect(c.r).toBe(Math.round(177 * f));               // ★F4 四通道乘（baseColor*num4 :28325）
      expect(c.g).toBe(Math.round(255 * f));
      expect(c.b).toBe(Math.round(32 * f));
      expect(c.a).toBeCloseTo((127 / 255) * f, 4);         // α 通道 ×fade（src.a ∝ f¹ 同原版）
      expect(caps[j].globalAlpha).toBe(1);                 // ★F4：fade 不进 ga
      expect(caps[j].rect[2]).toBe(4);                     // scale x=4 :28327
    }
    // 机身端最亮/尾端最暗（vanilla 序;j=0=新端段=紧贴本体）
    const f0 = remap(1, 0, 20, 1, 0), f18 = remap(19, 0, 20, 1, 0);
    const a0 = parseRgba(caps[0].fillStyle).a, a18 = parseRgba(caps[18].fillStyle).a;
    expect(a0).toBeCloseTo((127 / 255) * f0, 4);
    expect(a18).toBeCloseTo((127 / 255) * f18, 4);
    for (let j = 1; j < 19; j++) {
      expect(parseRgba(caps[j].fillStyle).a).toBeLessThan(parseRgba(caps[j - 1].fillStyle).a);
    }
    // 位置序：最亮段最近本体（旧码倒置面=机身最近处最暗,变异红判据）
    const dcx = d.cx, dcy = d.cy;
    const dist = (c: Cap) => Math.hypot(c.tx - dcx, c.ty - dcy);
    expect(dist(caps[0])).toBeLessThan(dist(caps[18]));
    expect(dist(caps[0])).toBeLessThan(dist(caps[9]));
  });

  it('预热逐段点亮：2 拍 2 rect / 5 拍 8 rect（段数与原版逐帧全等）+ 未满环新端段已 0.95', () => {
    const game = makeGame(flatWorld());
    for (const frames of [2, 5]) {
      const d = new JimsDroneProj(1600, 1400, 2, 0);
      for (let k = 0; k < frames; k++) d.fixedUpdate(1 / 60, game);
      const { ctx, caps } = recordingCtx();
      d.draw({ ctx } as unknown as Renderer, {} as unknown as Camera);
      expect(caps.length).toBe(2 * (frames - 1));          // k 帧 → k−1 段 × 2 带（vanilla 同值）
      // 新端段（i=frames−1,段龄 1）fade=Remap(1,0,20,1,0)（vanilla num2=1 同值）
      const f1 = remap(1, 0, 20, 1, 0);
      const c0 = parseRgba(caps[0].fillStyle);
      expect(c0.a).toBeCloseTo((127 / 255) * f1, 4);
      expect(c0.r).toBe(Math.round(177 * f1));
    }
  });
});

// ===========================================================================
// ② P3-F7：uDirection=direction=每拍 velocity.X 符号（带/体同源透传）+ 白带 fade² 曲面
// ===========================================================================
describe('P3-F7 染料 facing 透传（ArmorShaderData.cs:109 entity.direction;Projectile.cs:17121-17132）', () => {
  it('vx<0 → dyedSolidBand/dyedProjCanvas facing=−1;vx>0 → +1（白带 rgba(243,243,243,0.95)、ga=1）', () => {
    const heldId = ITEM_DEFS.findIndex((d) => d && d.vid === 5451);
    expect(heldId).toBeGreaterThan(0);
    const inv = { heldItem: () => ({ id: heldId, stack: 1 }) };
    const player = {
      dead: false, gravDir: 1,
      inputLeft: false, inputRight: false, inputUp: false, inputDown: false, inputJump: false,
      inv,
    };
    const game = makeGame(flatWorld(), player);
    const d = new JimsDroneProj(1600, 1400, -1, 0);   // 向左发射
    (d as unknown as { ownerPlayer: object }).ownerPlayer = { inv };
    for (let k = 0; k < 2; k++) d.fixedUpdate(1 / 60, game);   // ring=2（band 支活）
    const { ctx, caps } = recordingCtx();
    d.draw({ ctx } as unknown as Renderer, {} as unknown as Camera);
    expect(dyedSolidBand).toHaveBeenCalledWith(3457, -1);   // 出膛速度符号 −1（旧码恒 1）
    expect(dyedProjCanvas).toHaveBeenCalledTimes(1);
    expect((dyedProjCanvas as ReturnType<typeof vi.fn>).mock.calls[0][6].facing).toBe(-1);
    // 白带段（k=2,i=1 → f=Remap(1,0,20,1,0)）：rgb×f、α=1×f、ga 恒 1
    expect(caps.length).toBe(2);
    const f1 = remap(1, 0, 20, 1, 0);
    const c = parseRgba(caps[0].fillStyle);
    expect(c).toEqual({ r: Math.round(255 * f1), g: Math.round(255 * f1), b: Math.round(255 * f1), a: +f1.toFixed(4) });
    expect(caps[0].globalAlpha).toBe(1);

    d.vx = 2;                                               // 逐拍重导面：速度翻正 → facing 翻 +1
    d.draw({ ctx } as unknown as Renderer, {} as unknown as Camera);
    expect(dyedSolidBand).toHaveBeenLastCalledWith(3457, 1);
    expect((dyedProjCanvas as ReturnType<typeof vi.fn>).mock.calls[1][6].facing).toBe(1);
  });
});
