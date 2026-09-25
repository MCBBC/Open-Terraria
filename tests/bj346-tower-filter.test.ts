// BJ346 星云柱（四柱族）屏幕滤镜 FilterTower 判别面（ScreenShader.cso obj9 :342-412）。
// 病史：用户实报星云柱旁满屏实心洋红——preshader 按「dst=末位操作数」完整破译后
// 五处偏离字节码：①组装端 targetPx 传屏幕系（rel 场被相机坐标污染）；②波前半径
// c0=1000·progress+180 被当 progress 直用；③相位 preshader c1=1−progress/c2=−5·time
// 被近似成 fract(len·0.2+t·0.045)（波长 6.28×过密+时向反）；④hi 斜率 c4=1−uColor
// 被写成 (1−uColor)·2−uColor；⑤cmp lo 支（k<0 → sum·uColor）整支丢失（暗像素被推到
// 过饱和洋红=满屏洋红主因，「恒走 hi 支」系 BJ109 误判——cmp sel=r3.w=k/2 明灭可判）。
// 原版锚：
//   - 滤镜注册/分塔预设  ScreenEffectInitializer.cs:14-17（1456；1458 零变更）
//   - 激活/目标位        SceneState.cs:107-110 ManageSpecialBiomeVisuals（塔心−(0,10)）
//   - 盾态驱动三支       Main.cs:24564（盾上）/24573（破盾冲击）/24581（_intensity 0）
//   - 免疫门            NPC.cs:39492-39501 dontTakeDamage = ShieldStrengthTower* != 0
//   - 扣盾              Projectile.cs 629 Kill 段（clamp 0..ShieldStrengthTowerMax）
//   - 发弹映射          NPC.cs:80089-80121（分塔小怪表，LunarEvent.MINION_TOWER 1:1）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TOWER_FILTER_PRESETS,
  towerFilterDrive,
  towerWavefront,
  towerPhaseAngle,
  towerFilterColorPush,
  SCREEN_FX_FRAGS,
} from '../src/render/GLScreenFilters';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const fragTower = () => SCREEN_FX_FRAGS['FilterTower'];

describe('BJ346-①：分塔预设 1:1（ScreenEffectInitializer.cs:14-17）', () => {
  it('四柱 UseColor/UseOpacity 逐值（507 星云/517 日耀/493 星尘/422 星旋）', () => {
    // 14: Nebula   UseColor(1,0,0.9)   UseOpacity(0.35)
    // 15: Solar    UseColor(1,0.7,0)   UseOpacity(0.3)
    // 16: Stardust UseColor(0,0.5,1)   UseOpacity(0.5)
    // 17: Vortex   UseColor(0,0.7,0.7) UseOpacity(0.5)
    expect(TOWER_FILTER_PRESETS.nebula).toEqual({ color: [1, 0, 0.9], useOpacity: 0.35 });
    expect(TOWER_FILTER_PRESETS.solar).toEqual({ color: [1, 0.7, 0], useOpacity: 0.3 });
    expect(TOWER_FILTER_PRESETS.stardust).toEqual({ color: [0, 0.5, 1], useOpacity: 0.5 });
    expect(TOWER_FILTER_PRESETS.vortex).toEqual({ color: [0, 0.7, 0.7], useOpacity: 0.5 });
  });
});

describe('BJ346-②：盾态驱动三支（Main.cs:24564/24573/24581）', () => {
  it('盾上稳态 ai3=0 → intensity 1/progress 0（:24564 UseIntensity(1+0)）', () => {
    expect(towerFilterDrive(true, 0)).toEqual({ intensity: 1, progress: 0 });
  });
  it('盾上重塑闪光 ai3∈(0,30] → intensity=2−ai3/30（num319=1−ai3/30）', () => {
    expect(towerFilterDrive(true, 1)).toEqual({ intensity: 1 + 29 / 30, progress: 0 });
    expect(towerFilterDrive(true, 15)).toEqual({ intensity: 1.5, progress: 0 });
    expect(towerFilterDrive(true, 30)).toEqual({ intensity: 1, progress: 0 });
    // ai3>30（闪光窗已过）→ 回稳态 1
    expect(towerFilterDrive(true, 60)).toEqual({ intensity: 1, progress: 0 });
  });
  it('盾破冲击 ai3>0 → intensity=min(5,15·ai3/120)+1、progress=ai3/120（:24573）', () => {
    expect(towerFilterDrive(false, 1)).toEqual({ intensity: 1 + 15 / 120, progress: 1 / 120 });
    expect(towerFilterDrive(false, 60)).toEqual({ intensity: 6, progress: 0.5 });   // min(5,7.5)+1=6
    expect(towerFilterDrive(false, 120)).toEqual({ intensity: 6, progress: 1 });   // min(5,15)+1
  });
  it('★BJ346 补支：盾破演出毕 ai3==0 → intensity 0（:24581 UseIntensity(0)——旧实现缺=永久涡旋）', () => {
    expect(towerFilterDrive(false, 0)).toEqual({ intensity: 0, progress: 0 });
  });
});

describe('BJ346-③：波前/相位 preshader 直读（c0=1000p+180、c1=1−p、c2=−5t）', () => {
  it('波前半径=180+1000·progress（lit16=1000/lit17=180；旧式 len−progress 恒 0..1px）', () => {
    expect(towerWavefront(0)).toBe(180);        // 盾上稳态：180px 环
    expect(towerWavefront(0.5)).toBe(680);
    expect(towerWavefront(1)).toBe(1180);       // 破盾冲击外扩至 1180px
  });
  it('相位 frac 约简 ≡ sin(X)（X=0.2(1−p)len−5t；采样 200 点全角域 |Δ|<1e-4）', () => {
    for (let i = 0; i < 200; i++) {
      const len = i * 37.7, p = (i % 7) / 7, t = i * 0.311;
      const X = 0.2 * (1 - p) * len - 5 * t;
      expect(Math.abs(towerPhaseAngle(len, p, t) - Math.sin(X))).toBeLessThan(1e-4);
    }
  });
  it('时向/速率锚：dX/dlen=+0.2、dX/dt=−5（旧近似 +0.045t 时向反且 111×过慢）', () => {
    const b = towerPhaseAngle(101, 0, 10);        // X=0.2·101−50=−29.8
    const c = towerPhaseAngle(100, 0, 10.2);      // X=20−51=−31
    expect(b).toBeCloseTo(Math.sin(0.2 * 101 - 5 * 10), 6);
    expect(c).toBeCloseTo(Math.sin(0.2 * 100 - 5 * 10.2), 5);
  });
});

describe('BJ346-④：色推核判别面（obj9 :390-406——⑤cmp lo 支 + ④c4=1−uColor）', () => {
  const NEB: [number, number, number] = [1, 0, 0.9];
  const OP = 0.35;
  /** 变异体=旧实现（恒 hi + 斜率 2−3uColor）——判别力证明用，非产品码 */
  function mutant(s: { r: number; g: number; b: number; a: number },
    uColor: readonly [number, number, number], uOpacity: number): [number, number, number] {
    const V = Math.max(s.r, s.g, s.b), mn = Math.min(s.r, s.g, s.b);
    const k = V + mn - 1;
    const tgt = [
      uColor[0] + k * ((1 - uColor[0]) * 2 - uColor[0]),
      uColor[1] + k * ((1 - uColor[1]) * 2 - uColor[1]),
      uColor[2] + k * ((1 - uColor[2]) * 2 - uColor[2]),
    ];
    return [
      s.r + uOpacity * (tgt[0] * s.a - s.r),
      s.g + uOpacity * (tgt[1] * s.a - s.g),
      s.b + uOpacity * (tgt[2] * s.a - s.b),
    ];
  }
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  it('暗像素走 lo 支：sum<1 → tgt=sum·uColor（暗地形=柔和暗品红，非过饱和洋红）', () => {
    const dark = { r: 0.1, g: 0.1, b: 0.1, a: 1 };
    const out = towerFilterColorPush(dark, NEB, OP);
    // lo=(0.2,0,0.18)；mix(0.1, ·, 0.35)=(0.135,0.065,0.128)
    expect(out[0]).toBeCloseTo(0.135, 10);
    expect(out[1]).toBeCloseTo(0.065, 10);
    expect(out[2]).toBeCloseTo(0.128, 10);
  });
  it('★变异 1 发：同暗像素旧实现（恒 hi）产出过饱和洋红且被输出钳制成实心品红——判别面必异', () => {
    const dark = { r: 0.1, g: 0.1, b: 0.1, a: 1 };
    const good = towerFilterColorPush(dark, NEB, OP);
    const bad = mutant(dark, NEB, OP).map(clamp01);
    // good g 分量 0.065 vs bad g 被钳到 0——用户截图「实心洋红」的数值病灶
    expect(good[1]).toBeGreaterThan(0.05);
    expect(bad[1]).toBeLessThan(0.01);
    expect(good).not.toEqual(bad);
  });
  it('中灰 k=0 → hi=uColor（两实现此点重合=判别面只钉差异区）', () => {
    const mid = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const out = towerFilterColorPush(mid, NEB, OP);
    expect(out[0]).toBeCloseTo(0.5 + 0.35 * 0.5, 10);
    expect(out[1]).toBeCloseTo(0.5 - 0.35 * 0.5, 10);
    expect(out[2]).toBeCloseTo(0.5 + 0.35 * 0.4, 10);
  });
  it('亮像素 hi=uColor+k(1−uColor)：白 k=1 → tgt=白（不动）；旧斜率推成反色绿', () => {
    const white = { r: 1, g: 1, b: 1, a: 1 };
    const out = towerFilterColorPush(white, NEB, OP);
    // hi=(1,1,1)（uColor+(1−uColor)=白）→ out=白；旧式 tgt=(0,2,0.2)→r 被拉低
    expect(out[0]).toBeCloseTo(1, 10);
    expect(out[1]).toBeCloseTo(1, 10);
    expect(out[2]).toBeCloseTo(1, 10);
    const bad = mutant(white, NEB, OP);
    expect(Math.abs(bad[0] - out[0])).toBeGreaterThan(0.3);
  });
  it('正午蓝天端到端锚：s=(0.435,0.518,0.725) → (161,100,202)/255±1（修后观测值）', () => {
    const sky = { r: 0.435, g: 0.518, b: 0.725, a: 1 };
    const out = towerFilterColorPush(sky, NEB, OP);
    expect(out[0] * 255).toBeCloseTo(161, 0);
    expect(out[1] * 255).toBeCloseTo(100, 0);
    expect(out[2] * 255).toBeCloseTo(202, 0);
  });
});

describe('BJ346-⑤：GLSL 源锚锁（防手滑回漂）', () => {
  it('FRAG_TOWER 含 cmp 分支/波前 180+1000/相位 0.15915494/tap 2.25·3.5/斜率 (1−uColor)', () => {
    const f = fragTower();
    expect(f).toContain('(k * 0.5 >= 0.0) ? hi : lo');
    expect(f).toContain('180.0 + 1000.0 * uProgress');
    expect(f).toContain('0.2 * (1.0 - uProgress) * len - 5.0 * uTime');
    expect(f).toContain('0.15915494');
    expect(f).toContain('2.25');
    expect(f).toContain('3.5');
    expect(f).toContain('k * (vec3(1.0) - uColor)');
    // 旧式病灶串禁止回漂
    expect(f).not.toContain('(vec3(1.0) - uColor) * 2.0');
    expect(f).not.toContain('uTime * 0.045');
    expect(f).not.toContain('len - uProgress');
  });
  it('Renderer 组装端 targetPx=世界系（tow.x,tow.y），旧屏幕系换算串绝迹', () => {
    const src = readFileSync(ROOT + '../src/render/Renderer.ts', 'utf8');
    expect(src).toContain('targetPx: [tow.x, tow.y]');
    expect(src).not.toContain('targetPx: [tow.x - screenPos[0]');
    expect(src).toContain('towerFilterDrive(tow.shieldUp, tow.ai3)');
  });
});
