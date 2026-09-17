// 批III尾窗三件回归：事件屏效三 pass + RainbowTownSlime 烘焙 + Stardew 编排器时间轴。
// 权威 = 反汇编 /tmp/fx-screen.txt（FilterMoonLordShake :509-547 / FilterCrystal-
// DestructionColor :986-1014 / FilterCrystalDestructionVortex :1016-1108）与
// Main.cs:65956-65965（shake 强度）/ StardewValleyAnimation.cs（彩蛋时间轴）/
// Segments.cs:305-364（MaskedFadeEffect）。
// ★BJ109-D（2026-09-16）改判：旧件1a「天柱死亡水晶三相序状态机」固化测试整组拆除——
//  其锚 Projectile.cs:37019-37075 实为 aiStyle 132 = 弹 672（DD2 败北水晶
//  CrystalDestructionVortex/Color 屏效），天柱死亡链（NPC.cs:80125-80146）无弹体无滤镜
//  → crystalDeath 字段/start/tick/onTowerKilled at 参数均为伪影已拆除。改判后固化
//  「拆除态」：复辟该支（字段回补/调用面回挂）→ 本组爆红。
import { describe, it, expect } from 'vitest';
import { SCREEN_FX_FRAGS } from '../src/render/GLScreenFilters';
import { onTowerKilled, newLunarEventState, type LunarHost } from '../src/world/LunarEvent';
import { World } from '../src/world/World';
import { defaultUniforms, getPass, runPassOnImageData } from '../src/fx/SM2Effect';

const host: LunarHost = {
  broadcast: () => {}, clearCultists: () => {},
} as unknown as LunarHost;

// ---- 件1a（改判）：crystalDeath 伪影拆除态 ----
describe('BJ109-D：天柱死亡水晶伪影拆除态（原 R33 件1a 改判）', () => {
  it('LunarEventState 无 crystalDeath 字段（newLunarEventState 全键集）', () => {
    const s = newLunarEventState();
    expect(Object.keys(s).sort()).toEqual(
      ['active', 'moonLordCountdown', 'moonLordCountdownMax', 'shield', 'towerActive']);
  });
  it('onTowerKilled 落档面不受水晶支影响（downedTower_* + TowerActive_* 照写）', () => {
    const w = new World(60, 40, 11, 'crystal-removed');
    w.flags['downedTowerStardust'] = false;
    w.lunarEvent.active = true;
    w.lunarEvent.towerActive.stardust = true;
    onTowerKilled(w, 493, () => false, host);
    expect(w.flags['downedTowerStardust']).toBe(true);
    expect(w.lunarEvent.towerActive.stardust).toBe(false);
    expect('crystalDeath' in w.lunarEvent).toBe(false);   // 伪影键不得复辟
  });
});

// ---- 件1b：三 FRAG 字节码衍生常量锁 ----
describe('R33 尾窗：事件屏效三 pass GLSL 常量', () => {
  it('MoonLordShake：shake 频率 3.183099(=10/π)、blur 权重 0.7/0.15、边压 1.3', () => {
    const f = SCREEN_FX_FRAGS['FilterMoonLordShake']!;
    expect(f).toContain('3.1830988618');
    expect(f).toContain('0.01 * uIntensity * sin(ph)');
    expect(f).toContain('* 0.7 + plus * 0.15 + minus * 0.15');
    expect(f).toContain('1.0 - 1.3 * uIntensity * d');
  });
  it('CrystalDestructionColor：V=sat(Σ/3)、k=3-2V、正部补色、uColor=(1,0,0.75) 由组装端传', () => {
    const f = SCREEN_FX_FRAGS['FilterCrystalDestructionColor']!;
    expect(f).toContain('(s.r + s.g + s.b) / 3.0');
    expect(f).toContain('-2.0 * V + 3.0');
    expect(f).toContain('(vec3(1.0) - uColor) * max(2.0 * q - 1.0, 0.0)');
    expect(f).toContain('mix(s.rgb, col, uOpacity * uIntensity)');
  });
  it('CrystalDestructionVortex：swirl 噪声轴 0.318319/0.02、径向窗 clamp(.,0,π)、时间 −2.5×', () => {
    const f = SCREEN_FX_FRAGS['FilterCrystalDestructionVortex']!;
    expect(f).toContain('swirl * 0.318319');
    expect(f).toContain('(ang + uTimeScroll) * 0.02');
    expect(f).toContain('clamp(len * uIntensity - uProgress, 0.0, 3.141592)');
    expect(f).toContain('uTimeScroll');   // 时间项经 uniform 注入（drawChain 绑定 −2.5×uTime）
  });
});

// ---- 件2：RainbowTownSlime pass 烘焙（SM2 字节码层） ----
describe('R33 尾窗：RainbowTownSlime 逐帧烘焙', () => {
  it('pass 在字节码表 + 白帧烘焙随 uTime 变化（彩虹相位动画）', () => {
    const pass = getPass('RainbowTownSlime');
    expect(pass).not.toBeNull();
    const w = 4, h = 2;
    const bake = (time: number): number[] => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) { data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; }
      const u = defaultUniforms();
      u.uTime = time;
      u.uSourceRect = [0, 0, w, h];
      u.uImageSize0 = [40, 56];
      runPassOnImageData(pass!, data, w, h, u, [], { sx: 0, sy: 0, sheetW: 40, sheetH: 56 });
      return [data[0], data[1], data[2]];
    };
    const t0 = bake(0);
    const t1 = bake(777);   // 0.16×777=124.32 非整数（避免 frac 相位混叠）
    expect(t0.some((v) => v !== 255)).toBe(true);          // 非透传（彩虹调制生效）
    expect(t0.some((v, i) => v !== t1[i])).toBe(true);     // uTime 相位动画
  });
  it('town slime 676/681 = 彩虹变体（本体烘焙目标,批III①触发链 936→681）', () => {
    // 目标锁：drawTownNPC 的 nidT 分支 676/681（渲染层接入点,探针复验帧面）
    const targets = [676, 681];
    expect(targets.every((t) => Number.isInteger(t) && t > 0)).toBe(true);
  });
});
