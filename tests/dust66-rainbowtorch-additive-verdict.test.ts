// 尘 66（RainbowTorch）A=0 纯加算机制锁 —— RB-彩虹魔杖批（2026-09-20）判别面。
// 用户实报"彩虹魔杖弹幕=白大圆内红衣人物像"定谳：白大圆=弹 79 disco 点光+白亮拖尾头团；
// "人物像"=每拍 1×d66 十字星簇（Dust.png 66 号帧=白十字,scale2.5）被本仓 GetAlpha 缺档
// （落 default {rgb:num,a:num}≈{0.61,0.61}）画成"擦 61% 背景+暗加"的暗十字剪影。
// 权威 = Terarria1457/Terraria/Dust.cs GetAlpha :2767-2769：
//   if (type == 66) return new Color(newColor.R, newColor.G, newColor.B, 0);
//   ——A=0 纯加算习语（XNA α=0：dst 因子=1 恒不压暗、tex.rgb×光色 纯加）。
//   派生 = Terarria1458/Terraria/Projectile.cs:44390-44406（弹 79 每拍 NewDust
//   α100 / Color(DiscoR,G,B) / 2.5f）；二程 = Main.cs:39697-39704 GetColor 加性钳位。
// 判别力：①删 case 66 → 落 default {num,num} → 测试①红；②摘 Renderer 直绘支成员
//   → 落烘焙对（e<0.5 二值 α=255=半透 worldLayer α 顶满黑十字族禁入）→ 源码锚红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VanillaDust, dustPremulBake } from '../src/fx/VanillaDust';

const GAME_ROOT = join(__dirname, '..');

/** Dust.png 66 号帧同构白十字（8×8,texA=255 亮心+羽化臂）——复合判别面用 */
const PLUS = new Uint8ClampedArray([
  0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
]);

/** XNA 预乘 AlphaBlend 复合（浮点独立推导）：final = dst×(1−texA×cA) + tex.rgb×texA×cRGB（单次 clamp） */
function xna(dst: number, texR: number, texA: number, cR: number, cA: number): number {
  return Math.min(1, dst * (1 - texA * cA) + texR * texA * cR);
}

describe('尘 66 GetAlpha A=0 纯加算机制锁（Dust.cs:2767-2769）', () => {
  it('①alphaOf(66)={rgb:1,a:0} 精确——删 case 落 default {155/255,155/255} 即红', () => {
    const d = { type: 66, alpha: 100, scale: 2.5, noGravity: true } as never;
    const a = VanillaDust.alphaOf(d);
    expect(a).toEqual({ rgb: 1, a: 0 });
    // 旧伪影值对照钉死：default 档 num=(255−100)/255——user-visible 暗十字的数字根源
    expect(a.rgb).not.toBeCloseTo(155 / 255, 3);
    expect(a.a).not.toBeCloseTo(155 / 255, 3);
  });

  it('②数值证伪器：旧档复合在白亮头团上必压暗 ≥50/255，A=0 档恒不压暗（判别力=物理面）', () => {
    // 白亮 dst（拖尾头团/光盘饱和区）+ 十字【灰臂】texel（Dust.png 66 号帧臂≈灰 140/255
    // ——压暗主体是臂非白心；白心 tex=1 时 0.392+0.608=1.0 恰不暗）
    const dst = 1;
    const tex = 140 / 255;
    const oldFinal = xna(dst, tex, 1, 155 / 255, 155 / 255);   // 旧 default 档
    expect(dst - oldFinal).toBeGreaterThanOrEqual(50 / 255);   // 暗十字剪影（用户所见）
    // A=0 档（cA=0）：任何 cRGB 下 final ≥ dst——XNA α=0 惯用法"恒不压暗"的代数面
    for (const cR of [0, 0.25, 155 / 255, 1]) {
      expect(xna(dst, tex, 1, cR, 0)).toBeGreaterThanOrEqual(dst - 1e-12);
    }
  });

  it('③烘焙对 cA=0 面：erase≡0、add.rgb=预乘精确，但 add.A=255——半透 worldLayer 禁入，66 必须走直绘支', () => {
    const { add, erase } = dustPremulBake(PLUS, 1, 1, 1, 0);
    for (let i = 0; i < erase.length; i += 4) expect(erase[i + 3]).toBe(0);   // A=0 零擦除
    for (let i = 0; i < add.length; i += 4) {
      if (add[i] + add[i + 1] + add[i + 2] > 0) expect(add[i + 3]).toBe(255); // e<0.5 二值档
    }
    // 源码锚（防两向回漂）：直绘支成员 + colorPass 扩员缺一即红
    const rs = readFileSync(join(GAME_ROOT, 'src/render/Renderer.ts'), 'utf8');
    expect(rs).toContain('|| d.type === 43 || d.type === 66');                        // 直绘支路由
    expect(rs).toContain('(d.type === 43 || d.type === 66) && d.color');              // GetColor 二程扩员
  });

  it('④GetColor 二程（Main.cs:39697-39704）：base=(1,0) → cp=disco 全额 A=0——门槛必须看 RGB（α 恒 0）', () => {
    const disco = { r: 220, g: 40, b: 90, a: 255 };
    const d = { type: 66, alpha: 100, color: disco, scale: 2.5 } as never;
    const cp = VanillaDust.colorPass(d, 1, 0);
    expect(cp).not.toBeNull();
    expect(cp!.r).toBeCloseTo(220 / 255, 10);
    expect(cp!.g).toBeCloseTo(40 / 255, 10);
    expect(cp!.b).toBeCloseTo(90 / 255, 10);
    expect(cp!.a).toBe(0);                    // α 恒 0——若消费端用 cp.a>0.004 当门槛=漏画 disco 彩色程
    expect(Math.max(cp!.r, cp!.g, cp!.b)).toBeGreaterThan(0.004);   // RGB 内容门槛才放行
  });
});
