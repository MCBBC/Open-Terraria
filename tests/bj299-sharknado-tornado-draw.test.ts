// BJ299 鲨鱼龙卷 384/386 绘制定谳刀回归。
// 用户实报"猪鲨龙卷风贴图有问题"定谳：本仓 draw 曾用 fillRect 双色占位柱
// （旧注"384 族贴图未解包"=陈旧——Projectile_384/386.png 162×264×6 帧早在盘）。
// 原版每段=独立弹幕走专支（Main.cs:32580-32589）：
//   帧窗 H/projFrames=264/6=44px（Main.cs:8651/8653 projFrames 384/386=6）、
//   origin=帧中心、scale=段缩放((25−ai1)/25 或 (32−ai1)·1.5/32 P.cs:29907-29916)、
//   rotation=0、色=GetAlpha 缺省尾 rgb×(255−α)/255（P.cs:81509）。
// 段账：段 k 生成拍 s_k=15+9(k−1)（根段 ai0=16 P.cs:75191/:75228;子段 ai0=10
// :29970）、帧每 3 拍进 1 mod 6（:29908-29916）；段中心链=子中心−42(sP+sC)/2+2
// 反演（:29958-29968，段间重叠 2px）；层序=基座先画、列顶后画（DrawProjectiles
// index 升序）。翻转=spriteDirection 恒 1 → 无（Entity.cs:20 / P.cs:752 /
// :75191 vx=(−dir)·0.01 反号仍 1 / :75228 vx=0 缺省）。Kill 尘 20×d212
// （P.cs:75381-75390,vx=direction·2=2,α=100,scale=1.4,CornflowerBlue lerp
// White 0.3=(146,180,242),noGravity）。
import { describe, it, expect, beforeEach } from 'vitest';
import { DukeSharknadoTornado } from '../src/entities/bossAI_duke_moonlord';
import { setProjSpriteOverride } from '../src/entities/Arrow';

type Call = {
  img: unknown;
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
};

/** recording ctx：捕获 drawImage 全参 + fillRect（兜底面）+ globalAlpha 末值 */
function recCtx() {
  const images: Call[] = [];
  const fills: Array<{ x: number; y: number; w: number; h: number }> = [];
  let alpha = -1;
  return {
    images, fills, alphaRef: () => alpha,
    ctx: {
      drawImage: (img: unknown, sx: number, sy: number, sw: number, sh: number,
        dx: number, dy: number, dw: number, dh: number) => {
        images.push({ img, sx, sy, sw, sh, dx, dy, dw, dh });
      },
      fillRect: (x: number, y: number, w: number, h: number) => {
        fills.push({ x, y, w, h });
      },
      set globalAlpha(v: number) { alpha = v; },
      get globalAlpha() { return alpha; },
      imageSmoothingEnabled: false,
      save: () => {}, restore: () => {},
      fillStyle: '' as string,
    } as unknown as CanvasRenderingContext2D,
  };
}

const TEX = { width: 162, height: 264 } as unknown as HTMLImageElement;

/** 跑 n 拍 fixedUpdate（非固体世界,无玩家） */
function run(t: DukeSharknadoTornado, ticks: number, game: object): void {
  for (let i = 0; i < ticks; i++) t.fixedUpdate(1 / 60, game as never);
}

function mkGame() {
  return {
    world: { difficulty: 0, store: { inBounds: () => false, isSolid: () => false } },
    player: null,
    damagePlayer: () => 0,
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number,
      vx: number, _vy: number, _a: number, _c: unknown, _s: number, ng: boolean) => {
      dusts.push({ type, vx, ng });
      return null;
    },
  };
}

const dusts: Array<{ type: number; vx: number; ng: boolean }> = [];

describe('BJ299 鲨鱼龙卷绘制（384/386 帧切片 1:1）', () => {
  beforeEach(() => {
    dusts.length = 0;
    setProjSpriteOverride(384, TEX);
    setProjSpriteOverride(386, TEX);
  });

  it('贴图帧切片：帧窗 44px、origin=帧中心×scale、globalAlpha=(255−α)/255', () => {
    const t = new DukeSharknadoTornado(100 * 16, 100 * 16, false, null as never);
    const rc = recCtx();
    // 10 拍：根段（segs=0）age=10 → frame=⌊10/3⌋=3
    run(t, 10, mkGame());
    t.draw({ ctx: rc.ctx } as never, null as never);
    expect(rc.images.length).toBe(1);
    const c = rc.images[0];
    expect(c.sx).toBe(0);
    expect(c.sy).toBe(3 * 44);              // frame 3 × 44（:29908-29916 每 3 拍进帧）
    expect(c.sw).toBe(162); expect(c.sh).toBe(44);
    // scale=scaleOf(15)=(25−15)/25=0.4 → dw=162·0.4=64.8 dh=44·0.4=17.6
    expect(c.dw).toBeCloseTo(64.8, 5);
    expect(c.dh).toBeCloseTo(17.6, 5);
    // origin=帧中心 → dx = cx − dw/2
    expect(c.dx).toBeCloseTo(t.cx - 64.8 / 2, 5);
    expect(c.dy).toBeCloseTo(t.cy - 17.6 / 2, 5);
    // α 推移 10 拍：−30/t 至 7 拍触底钳 60（255−210=45→60,P.cs:29936-29946）→ (255−60)/255
    expect(rc.alphaRef()).toBeCloseTo(195 / 255, 5);
  });

  it('塔段帧账与中心链：段 k 帧=⌊(age−s_k)/3⌋ mod 6、段间 2px 重叠、层序基座先画', () => {
    const t = new DukeSharknadoTornado(100 * 16, 100 * 16, false, null as never);
    const rc = recCtx();
    // 段生成拍：k=1@15、k=2@24 → 跑 30 拍得 3 段（segs=2）
    run(t, 30, mkGame());
    t.draw({ ctx: rc.ctx } as never, null as never);
    expect(rc.images.length).toBe(3);
    // 帧：根 ⌊30/3⌋=10%6=4;k1 s=15 → ⌊15/3⌋=5;k2 s=24 → ⌊6/3⌋=2
    expect(rc.images.map(c => c.sy)).toEqual([4 * 44, 5 * 44, 2 * 44]);
    // 层序：images[0]=基座（最小 scale=0.4）、images[2]=列顶（scaleOf(13)=0.48）
    expect(rc.images[0].dw).toBeCloseTo(162 * 0.4, 5);
    expect(rc.images[2].dw).toBeCloseTo(162 * 12 / 25, 5);
    // 中心链：cy[0] = cy[2] + 42·(s2+s1)/2 − 2 − (42·(s1+s0)/2 − 2)
    const s0 = 10 / 25, s1 = 11 / 25, s2 = 12 / 25;
    const cy2 = t.cy;
    const cy1 = cy2 + (42 * (s2 + s1)) / 2 - 2;
    const cy0 = cy1 + (42 * (s1 + s0)) / 2 - 2;
    expect(rc.images[2].dy).toBeCloseTo(cy2 - (44 * s2) / 2, 5);
    expect(rc.images[1].dy).toBeCloseTo(cy1 - (44 * s1) / 2, 5);
    expect(rc.images[0].dy).toBeCloseTo(cy0 - (44 * s0) / 2, 5);
  });

  it('大塔 386：scale=(32−ai1)·1.5/32、同帧账', () => {
    const t = new DukeSharknadoTornado(100 * 16, 100 * 16, true, null as never);
    const rc = recCtx();
    run(t, 16, mkGame());   // 根段 ai0=16→0 前夜：段 1 于 age=15 生成 → segs=1
    t.draw({ ctx: rc.ctx } as never, null as never);
    expect(rc.images.length).toBe(2);
    // 基座 scaleOf(24)=(32−24)·1.5/32=0.375;列顶 scaleOf(23)
    expect(rc.images[0].dw).toBeCloseTo(162 * 0.375, 5);
    expect(rc.images[1].dw).toBeCloseTo(162 * (32 - 23) * 1.5 / 32, 5);
    // 帧：根 ⌊16/3⌋=5;段1 s=15 → ⌊1/3⌋=0
    expect(rc.images[0].sy).toBe(5 * 44);
    expect(rc.images[1].sy).toBe(0);
  });

  it('帧循环 mod 6：age 推进 60+ 拍帧不越界（≥6 回 0,:29914-29916）', () => {
    const t = new DukeSharknadoTornado(100 * 16, 100 * 16, false, null as never);
    const rc = recCtx();
    run(t, 200, mkGame());
    t.draw({ ctx: rc.ctx } as never, null as never);
    for (const c of rc.images) {
      expect(c.sy).toBeGreaterThanOrEqual(0);
      expect(c.sy).toBeLessThan(264);
      expect(c.sy % 44).toBe(0);
    }
  });

  it('Kill 尘：整塔亡时 20×d212（vx=2、noGravity）——P.cs:75381-75390', () => {
    const t = new DukeSharknadoTornado(100 * 16, 100 * 16, false, null as never);
    run(t, 540, mkGame());   // timeLeft 540 到期
    expect(dusts.length).toBe(20);
    expect(dusts[0]).toEqual({ type: 212, vx: 2, ng: true });
  });

  it('贴图未就绪兜底：回落占位柱（fillRect）不炸', () => {
    setProjSpriteOverride(384, { width: 0, height: 0 } as unknown as HTMLImageElement);
    const t = new DukeSharknadoTornado(100 * 16, 100 * 16, false, null as never);
    const rc = recCtx();
    run(t, 3, mkGame());
    t.draw({ ctx: rc.ctx } as never, null as never);
    expect(rc.images.length).toBe(0);
    expect(rc.fills.length).toBe(1);   // segs=0 仅根段
  });

  it('netStateSync 帧相位重建：age 由 (segs, ai0) 反解', () => {
    const host = new DukeSharknadoTornado(100 * 16, 100 * 16, false, null as never);
    run(host, 30, mkGame());           // 房主 30 拍：segs=2, ai0=10−(30−24)=4
    const guest = new DukeSharknadoTornado(100 * 16, 100 * 16, false, null as never);
    guest.netStateSync(host['ai1'], host['ai0'], 100 * 16 - 30, 100 * 16 - 8);
    expect(guest['segs']).toBe(2);
    expect(guest['age']).toBe(30);
    // 帧同相：两侧列顶帧一致
    const rcH = recCtx(), rcG = recCtx();
    host.draw({ ctx: rcH.ctx } as never, null as never);
    guest.draw({ ctx: rcG.ctx } as never, null as never);
    expect(rcG.images.map(c => c.sy)).toEqual(rcH.images.map(c => c.sy));
  });
});
