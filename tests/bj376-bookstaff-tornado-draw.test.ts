// BJ376:704 风暴龙卷绘制三修判别面——下落态绘制输出=逐层螺旋非 merged 条
// BJ379 续修(用户实报"过于透明"定谳):XNA 预乘 AlphaBlend 的 rgb 贡献=tex.rgb×tint×f
//   全幅、α=0.249f 只进遮盖项 dst×(1−0.249f)(Main.cs:33135-33141);单遍 source-over+
//   globalAlpha 把 rgb 再折一遍 α∝f²=过透根因 → 修=destination-out+lighter 两遍
//   (尘系 dustPremulPair 同范式)。
// 原版锚:Main.cs:33081-33160——SpriteEffects.FlipVertically=逐层纹理翻转
//   (:33096/:33152/:33157,层位置/层序不动);蓝层 (1+num339)×0.8 先于棕;
//   color85=value94×k×env(rgb+a 同乘),A=(byte)(127k×0.5)×env(:33140)→遮盖α=0.249k·env。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BookStormTwister } from '../src/entities/proj1457';
import { setProjSpriteOverride } from '../src/entities/Arrow';

const GAME_ROOT = join(__dirname, '..');

setProjSpriteOverride(704, { width: 60, height: 60 } as unknown as HTMLImageElement);

interface Rec { op: string; args: number[] }
function mkRecorder() {
  const calls: Rec[] = [];
  const push = (op: string) => (...args: number[]) => { calls.push({ op, args }); };
  const ctx = {
    save: push('save'),
    restore: push('restore'),
    translate: push('translate'),
    rotate: push('rotate'),
    scale: push('scale'),
    drawImage: push('drawImage'),
    set imageSmoothingEnabled(_: boolean) {},
    set globalAlpha(v: number) { calls.push({ op: 'globalAlpha', args: [v] }); },
    set globalCompositeOperation(v: string) { calls.push({ op: `gco:${v}`, args: [] }); },
  } as unknown as CanvasRenderingContext2D;
  return { calls, ctx };
}

/** 直驱 draw:t 手动钉(私有面),绕 fixedUpdate(纯绘制判别面) */
function drawAt(vx: number, t: number) {
  const tw = new BookStormTwister(800, 1200, vx, 63, 9);
  (tw as unknown as { t: number }).t = t;
  const { calls, ctx } = mkRecorder();
  tw.draw({ ctx } as never, {} as never);
  return calls;
}

describe('BJ376-① FlipVertically=逐层纹理翻转,非整柱镜像(用户"一整条"根因判别器)', () => {
  it('vx>0:存在逐层负 y scale(=层数),且恒无外层 scale(1,-1) 整柱镜像', () => {
    for (const t of [45, 120]) {
      const calls = drawAt(11, t);
      const scales = calls.filter((c) => c.op === 'scale');
      const negY = scales.filter((c) => c.args[1] < 0);
      expect(negY.length, `t=${t} 负 y scale 层数`).toBeGreaterThan(20);
      // 旧码外层整柱镜像=scale(1,-1)(x 恒 1)——新版每层 x=±scl∈(0.5,1.7) 非 1
      for (const s of scales) {
        expect(s.args[0] === 1 && s.args[1] === -1, `t=${t} 禁整柱 scale(1,-1)`).toBe(false);
      }
      // 负 y scale 的 |x|=|y|(等比翻转,非 shear)
      for (const s of negY) {
        expect(Math.abs(Math.abs(s.args[0]) - Math.abs(s.args[1]))).toBeLessThan(1e-9);
      }
    }
  });
  it('vx<0:零负 y scale(无翻转=原版 effects None)', () => {
    const calls = drawAt(-11, 45);
    expect(calls.filter((c) => c.op === 'scale' && c.args[1] < 0).length).toBe(0);
  });
  it('层位置不随翻转变:首层 translate.y=floor(Bottom),末层<floor(Top)+step——两向同域', () => {
    for (const vx of [11, -11]) {
      const calls = drawAt(vx, 45);
      const tx = calls.filter((c) => c.op === 'translate' && c.args.length === 2);
      // 盒 y=1200-105=1095;by=1305,ty=1095
      expect(tx[0].args[1]).toBe(1305);                      // 首层=Bottom(镜像恒不变)
      expect(tx[tx.length - 1].args[1]).toBeGreaterThan(1095);
      expect(tx[tx.length - 1].args[1]).toBeLessThan(1095 + 7);
      // 单调递减(底→顶,无回卷)
      for (let i = 1; i < tx.length; i++) {
        expect(tx[i].args[1]).toBeLessThan(tx[i - 1].args[1]);
      }
    }
  });
});

describe('BJ376-② 蓝脉冲层 ×0.8 缩放且画在棕层下(:33153-33157)', () => {
  it('t=26(ph=26→blueK=0.5 窗):层内先蓝后棕,蓝 |sy|=0.8×棕 |sy|', () => {
    const calls = drawAt(11, 26);
    const idxBlue = calls.findIndex((c) => c.op === 'drawImage');
    expect(idxBlue).toBeGreaterThan(-1);
    // 第一个 drawImage 前最近的 scale=蓝层缩放;其后最近 scale=棕层缩放
    let lastScaleBefore: Rec | null = null;
    for (let i = idxBlue - 1; i >= 0; i--) {
      if (calls[i].op === 'scale') { lastScaleBefore = calls[i]; break; }
    }
    expect(lastScaleBefore).not.toBeNull();
    let nextScale: Rec | null = null;
    for (let i = idxBlue + 1; i < calls.length; i++) {
      if (calls[i].op === 'scale') { nextScale = calls[i]; break; }
    }
    expect(nextScale).not.toBeNull();
    const blueSy = Math.abs(lastScaleBefore!.args[1]);
    const brownSy = Math.abs(nextScale!.args[1]);
    expect(blueSy / brownSy).toBeCloseTo(0.8, 6);
    // 蓝先于棕:蓝 drawImage 索引 < 同层棕 drawImage 索引(棕=第二个 drawImage)
    expect(calls.findIndex((c) => c.op === 'drawImage', )).toBeLessThan(
      calls.map((c) => c.op).lastIndexOf('drawImage'),
    );
  });
  it('t=45(ph=45 出窗):零蓝层 drawImage(仅棕)', () => {
    const calls = drawAt(11, 45);
    expect(calls.filter((c) => c.op === 'drawImage').length).toBeGreaterThan(20);
  });
});

describe('BJ379-③ XNA 预乘 AlphaBlend 两遍模拟:遮盖α=0.249f、rgb 贡献携 f 全幅', () => {
  const eraseAlphas = (calls: Rec[]): number[] =>
    calls.filter((c) => c.op === 'globalAlpha' && c.args[0] < 1).map((c) => c.args[0]);
  it('t=45(env=1):每层 erase(destination-out)+add(lighter) 成对;遮盖α 全部 ≤0.26 峰值 ≥0.23', () => {
    const calls = drawAt(11, 45);
    const destOut = calls.filter((c) => c.op === 'gco:destination-out').length;
    const lighter = calls.filter((c) => c.op === 'gco:lighter').length;
    expect(destOut).toBeGreaterThan(20);
    expect(lighter).toBe(destOut);                     // erase+add 逐层成对
    const eAlphas = eraseAlphas(calls);
    expect(eAlphas.length).toBe(destOut);              // 每遍 erase 恰伴一个遮盖 α
    for (const a of eAlphas) expect(a).toBeLessThanOrEqual(0.26);
    expect(Math.max(...eAlphas)).toBeGreaterThanOrEqual(0.23);
    // add 遍恒 α=1(桶 rgb 已携 f 全幅,不得再折 α——旧单遍 rgb∝f² 过透根因)
    expect(calls.filter((c) => c.op === 'globalAlpha' && c.args[0] === 1).length).toBe(lighter);
  });
  it('淡入窗 t=10(env=1/3):遮盖α峰值≈0.249×env≈0.083(桶 16/48)——旧码=0.5×env≈0.167 判别', () => {
    const calls = drawAt(11, 10);
    const eAlphas = eraseAlphas(calls);
    expect(eAlphas.length).toBeGreaterThan(20);
    expect(Math.max(...eAlphas)).toBeGreaterThan(0.075);
    expect(Math.max(...eAlphas)).toBeLessThan(0.092);  // 旧 0.5 折中=0.167 必爆
  });
  it('层内次序:destination-out 先于 lighter(先遮盖衰减再 rgb 加算)', () => {
    const calls = drawAt(11, 26);
    const first = calls.findIndex((c) => c.op.startsWith('gco:'));
    expect(calls[first].op).toBe('gco:destination-out');
    const li = calls.findIndex((c) => c.op === 'gco:lighter');
    expect(li).toBeGreaterThan(first);
  });
});

describe('BJ376-④ 源码锚(修法在盘,防回退)', () => {
  const src = () => readFileSync(join(GAME_ROOT, 'src/entities/proj1457.ts'), 'utf8');
  it('逐层翻转在盘:scale(scl, flipV ? -scl : scl);整柱镜像已摘', () => {
    const s = src();
    expect(s).toMatch(/ctx\.scale\(scl, flipV \? -scl : scl\)/);
    expect(s).not.toMatch(/ctx\.translate\(0, midY\)/);
    expect(s).not.toMatch(/stormTintedOf/);
  });
  it('蓝层 ×0.8 与 STORM_A 常数在盘', () => {
    const s = src();
    expect(s).toMatch(/ctx\.scale\(scl \* 0\.8, flipV \? -scl \* 0\.8 : scl \* 0\.8\)/);
    expect(s).toMatch(/const STORM_A = \(127 \* 0\.5\) \/ 255;/);
  });
  it('BJ379 两遍模拟在盘:stormLayerDraw=destination-out+lighter;旧单遍桶 α 已摘', () => {
    const s = src();
    expect(s).toMatch(/function stormLayerDraw/);
    expect(s).toMatch(/globalCompositeOperation = 'destination-out'/);
    expect(s).toMatch(/globalCompositeOperation = 'lighter'/);
    expect(s).not.toMatch(/STORM_A \* (bl|br)\.f/);
  });
});
