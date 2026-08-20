// S 级天幕三件锁测试:SlimeSky(史莱姆雨剪影族)/ MartianSky(火星入侵 UFO)/
// 沙尘暴+暴风雪全屏色罩。
// 锚:SlimeSky.cs:87-112(GenerateSlimes)/:114-160(Update)/:193-221(着色投影);
//   MartianSky.cs:26-96(Zip/Hover)/:221-256(Update)/:302-327(GenerateUfos+排序);
//   SandstormSky.cs:49-60 / BlizzardSky.cs:48-60(色罩公式);
//   SceneState.cs:102/120(暴风雪门)/Main.cs:58757-58763(火星门)/:64221(史莱姆雨激活)。
import { describe, it, expect } from 'vitest';
import { SlimeSky, slimeSilhouetteTint, slimeProject } from '../src/render/SlimeSky';
import { MartianSky, ufoTintColor, ufoProject } from '../src/render/MartianSky';
import {
  SkyRenderer, sandstormSkyTint, blizzardSkyTint,
  blizzardSkyGate, sandstormSkyGate, type SkyFrameCtx,
} from '../src/render/SkyRenderer';
import { SCREEN_FX_FRAGS, type ScreenFxPass } from '../src/render/GLScreenFilters';
import type { WeatherState } from '../src/world/weather/Weather';

/** node 环境无 DOM:构造 SkyRenderer 前注入 Image 桩(贴图永不 complete,绘制路径自静默) */
function stubImage(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((globalThis as any).Image) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Image = class {
    src = ''; width = 0; height = 0; complete = false;
    naturalWidth = 0; naturalHeight = 0;
  };
}

/** 顺序队列 rng(耗尽后回落 fallback)——精确驱动掷序 */
function queueRng(queue: number[], fallback = 0.5): () => number {
  return () => (queue.length ? queue.shift()! : fallback);
}

/** SkyWeatherTint pass 断言辅助(收窄联合类型) */
function tintPass(p: ScreenFxPass): { color: readonly [number, number, number]; alpha: number } {
  if (p.kind !== 'SkyWeatherTint') throw new Error(`expected SkyWeatherTint, got ${p.kind}`);
  return { color: p.color, alpha: p.alpha };
}

// ================= SlimeSky:GenerateSlimes :87-112 =================

describe('SlimeSky 生成参数(GenerateSlimes :87-112)', () => {
  it('数量 = maxTilesY/6 整除;深度基带 i/N×1.75+1.6;速度/位置带', () => {
    const sky = new SlimeSky(() => 0.42);
    sky.activate({ maxTilesX: 4200, maxTilesY: 1200, surfacePx: 4800, screenTopY: 0, screenHeight: 1080 });
    expect(sky.entities.length).toBe(200);                       // 1200/6
    expect(sky.remaining).toBe(200);
    expect(sky.isActive).toBe(true);
    expect(sky.isLeaving).toBe(false);
    const n = 200;
    expect(sky.entities[0].depth).toBeCloseTo(0 / n * 1.75 + 1.6, 12);
    expect(sky.entities[199].depth).toBeCloseTo(199 / n * 1.75 + 1.6, 12);
    // :92-94 num = screenTopY×0.7−screenHeight = −1080;min = num−surfacePx = −5880;
    // y = min + floor(0.42×4800) = −5880+2016 = −3864;x = floor(0.42×4200)×16
    expect(sky.entities[0].y).toBe(-5880 + Math.floor(0.42 * 4800));
    expect(sky.entities[0].x).toBe(Math.floor(0.42 * 4200) * 16);
    // :95 speed = 5+3r;:97 tex = Next(2);稀有支 0.42 均不中
    expect(sky.entities[0].speed).toBeCloseTo(5 + 3 * 0.42, 12);
    expect(sky.entities.every((e) => e.tex === 0)).toBe(true);
    expect(sky.entities.every((e) => e.active)).toBe(true);
  });

  it('稀有 1/60 → 大史莱姆(tex3/speed 6+3r/depth+0.5, :98-103)', () => {
    // 掷序:x, y, speed, tex, rare60[, speed2]
    const sky = new SlimeSky(queueRng([0.9, 0.5, 0.5, 0.5, 0.0, 0.5]));
    sky.activate({ maxTilesX: 4200, maxTilesY: 6, surfacePx: 4800, screenTopY: 0, screenHeight: 1080 });
    const e = sky.entities[0];
    expect(e.tex).toBe(3);
    expect(e.speed).toBeCloseTo(6 + 3 * 0.5, 12);
    expect(e.depth).toBeCloseTo(1.6 + 0.5, 12);
  });

  it('稀有 1/30 → 中史莱姆(tex2/speed 6+2r, :104-108)', () => {
    // 掷序:x, y, speed, tex, rare60(不中), rare30(中)[, speed2]
    const sky = new SlimeSky(queueRng([0.9, 0.5, 0.5, 0.5, 0.5, 0.0, 0.7]));
    sky.activate({ maxTilesX: 4200, maxTilesY: 6, surfacePx: 4800, screenTopY: 0, screenHeight: 1080 });
    const e = sky.entities[0];
    expect(e.tex).toBe(2);
    expect(e.speed).toBeCloseTo(6 + 2 * 0.7, 12);
  });
});

// ================= SlimeSky:Update :114-160 =================

describe('SlimeSky 推进(Update :114-160)', () => {
  function mk(surfacePx = 4800): SlimeSky {
    const sky = new SlimeSky(() => 0.42);
    sky.activate({ maxTilesX: 4200, maxTilesY: 120, surfacePx, screenTopY: 0, screenHeight: 1080 });
    return sky;
  }
  it('帧 %24 环绕 + 速度下落(25t 不落地)', () => {
    const sky = mk();
    for (let i = 0; i < 25; i++) sky.update();
    const e = sky.entities[0];
    expect(e.frame).toBe(25 % 24);                               // :126 Frame++ setter %24
    expect(e.y).toBeCloseTo(-3864 + 25 * (5 + 3 * 0.42), 6);     // :127(带内不重生)
  });
  it('落地重生:depth 复位基带、y=-100、x/速度重掷(:132-148)', () => {
    const sky = mk(0);
    const e = sky.entities[7];
    e.depth = 9.9;
    e.y = 1;                                                     // > surfacePx(0)
    sky.update();
    expect(e.y).toBe(-100);                                      // :135
    expect(e.depth).toBeCloseTo(7 / 20 * 1.75 + 1.6, 12);        // :134 基带公式复位(n=120/6=20)
    expect(e.x).toBe(Math.floor(0.42 * 4200) * 16);              // :135 重掷
    expect(e.speed).toBeCloseTo(5 + 3 * 0.42, 12);               // :137
  });
  it('离场:落地即熄、remaining 归零 → isActive=false(:150-158)', () => {
    const sky = mk(0);
    sky.deactivate();                                            // :237-240
    expect(sky.isLeaving).toBe(true);
    for (const e of sky.entities) e.y = 1;
    sky.update();
    expect(sky.entities.every((e) => !e.active)).toBe(true);
    expect(sky.remaining).toBe(0);
    expect(sky.isActive).toBe(false);
  });
});

// ================= SlimeSky:着色/投影纯函数(:193-221) =================

describe('SlimeSky 剪影着色(slimeSilhouetteTint :193-212)', () => {
  const W: [number, number, number] = [255, 255, 255];
  it('深度档全表(>3→0.6 / >2.5→0.7 / >2→0.8 / >1.5→0.9 / 其余 1,再 ×0.8)', () => {
    // a = 1×0.8×(档×0.8);rgb = (1×0.9+0.1)×0.8×(档×0.8)
    expect(slimeSilhouetteTint(W, 1.4).a).toBeCloseTo(0.8 * 0.8, 12);
    expect(slimeSilhouetteTint(W, 1.6).a).toBeCloseTo(0.8 * 0.9 * 0.8, 12);
    expect(slimeSilhouetteTint(W, 2.2).a).toBeCloseTo(0.8 * 0.8 * 0.8, 12);
    expect(slimeSilhouetteTint(W, 2.6).a).toBeCloseTo(0.8 * 0.7 * 0.8, 12);
    expect(slimeSilhouetteTint(W, 3.1).a).toBeCloseTo(0.8 * 0.6 * 0.8, 12);
    // 2.5 不入 >2.5 档(C# (double)d > 2.5 严格大于)
    expect(slimeSilhouetteTint(W, 2.5).a).toBeCloseTo(0.8 * 0.8 * 0.8, 12);
  });
  it('rgb = (cots×0.9+0.1)×0.64×档;黑夜地板 = 0.1 起(:193)', () => {
    const t = slimeSilhouetteTint([255, 255, 255], 1.0);
    expect(t.r).toBeCloseTo(1.0 * 0.64, 12);
    const dark = slimeSilhouetteTint([0, 0, 0], 1.0);
    expect(dark.r).toBeCloseTo(0.1 * 0.64, 12);
    const mixed = slimeSilhouetteTint([128, 64, 32], 1.0);
    expect(mixed.r).toBeCloseTo((128 / 255 * 0.9 + 0.1) * 0.64, 12);
    expect(mixed.g).toBeCloseTo((64 / 255 * 0.9 + 0.1) * 0.64, 12);
    expect(mixed.b).toBeCloseTo((32 / 255 * 0.9 + 0.1) * 0.64, 12);
  });
});

describe('SlimeSky 视差投影(slimeProject :213-221)', () => {
  it('绕屏中心 (1/d, 0.9/d) 视差', () => {
    const p = slimeProject(100, 100, 1, 100, 100, 1920, 1080);
    expect(p.x).toBeCloseTo(960, 12);
    expect(p.y).toBeCloseTo(540, 12);
    const q = slimeProject(1100, 1100, 2, 100, 100, 1920, 1080);
    expect(q.x).toBeCloseTo((1100 - 100) / 2 + 960, 12);
    expect(q.y).toBeCloseTo((1100 - 100) * 0.9 / 2 + 540, 12);
  });
  it('X 4000 环绕((px+500)%4000 负补 +−500, :216-221)', () => {
    // depth=1/camX=0 → px = x+960;x=3000 → px=3960 → (4460%4000)−500 = −40
    expect(slimeProject(3000, 0, 1, 0, 0, 1920, 1080).x).toBe(-40);
    // px=−500(恰环绕折返点)→ 0%4000=0 → −500
    expect(slimeProject(-1460, 0, 1, 0, 0, 1920, 1080).x).toBe(-500);
    // 负向出带(px=−5040):(−4540%4000=−540)→+4000=3460→−500=2960
    expect(slimeProject(-6000, 0, 1, 0, 0, 1920, 1080).x).toBe(2960);
  });
});

// ================= MartianSky:GenerateUfos :302-327 + Update :221-256 =================

describe('MartianSky 生成(GenerateUfos :302-327)', () => {
  it('数量 256×maxTilesX/4200;近档 1/16(Extra_5/depth+6.6/Glow90),远档 Scale 0.5', () => {
    const m = new MartianSky(() => 0.999);
    m.activate(4200);
    expect(m.maxUfos).toBe(256);
    expect(m.ufos.filter((u) => u.tex === 0).length).toBe(16);   // 256>>4
    expect(m.ufos.filter((u) => u.tex === 1).length).toBe(240);
    // :311/:317 depth = rand×4+6.6 / rand×5+1.6;:318 远档 Scale 0.5
    expect(m.ufos.every((u) => u.tex === 0
      ? u.depth === 0.999 * 4 + 6.6 : u.depth === 0.999 * 5 + 1.6)).toBe(true);
    expect(m.ufos.every((u) => u.tex === 0
      ? u.scale === 1 && u.glow === 0 : u.scale === 0.5 && u.glow === 1)).toBe(true);
    // :327 Depth 降序排序
    for (let i = 1; i < m.ufos.length; i++) {
      expect(m.ufos[i - 1].depth).toBeGreaterThanOrEqual(m.ufos[i].depth);
    }
    expect(m.activeUfos).toBe(0);
    expect(m.isActive).toBe(true);
  });
  it('世界宽换算:8400→512/近32;2100→128/近8;105→6/近0', () => {
    const a = new MartianSky(() => 0.5); a.activate(8400);
    expect(a.maxUfos).toBe(512);
    expect(a.ufos.filter((u) => u.tex === 0).length).toBe(32);
    const b = new MartianSky(() => 0.5); b.activate(2100);
    expect(b.maxUfos).toBe(128);
    expect(b.ufos.filter((u) => u.tex === 0).length).toBe(8);
    const c = new MartianSky(() => 0.5); c.activate(105);
    expect(c.maxUfos).toBe(6);
    expect(c.ufos.filter((u) => u.tex === 0).length).toBe(0);
  });
});

describe('MartianSky 行为与推进(Zip :18-61 / Hover :63-96 / Update :221-256)', () => {
  /** 小世界(6 台)逐掷驱动:activate 耗 6 掷(深度),之后逐 update 消费行为掷。
   *  ★补位语义:Update 尾段 spawn(ufos[num] 激活+InitializeUfo)——出生 tick
   *  不再 stepUfo,行为推进从下一 update 起。
   *  D6 = 6 个 0.9 深度掷(等深 → sort 稳定 → ufos[0] 仍首台) */
  const D6 = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
  function mk(queue: number[], fallback = 0.5): MartianSky {
    const m = new MartianSky(queueRng([...D6, ...queue], fallback));
    m.activate(105);          // maxUfos=6,近档 6>>4=0 → 全远档
    return m;
  }
  it('Zip 初始化(:26-41):角度 ±0.3、50% +π、速度 10-15、寿命 Next(400,500)', () => {
    // 掷序:behavior, x, y, spd, ang, flip, maxTicks
    const m = mk([0.0, 0.25, 0.5, 0.5, 0.5, 0.3, 0.25]);
    m.update();                                // spawn ufos[0](Zip)
    const u = m.ufos[0];
    expect(u.active).toBe(true);
    expect(m.activeUfos).toBe(1);
    expect(u.behavior).toBe(0);
    expect(u.x).toBeCloseTo(0.25 * 105 * 16, 12);                // :28 maxTilesX<<4
    expect(u.y).toBeCloseTo(0.5 * 5000, 12);                     // :29
    expect(u.rotation).toBeCloseTo(0.5 * 0.6000000238418579 - 0.30000001192092896, 12);  // :33 翻转前
    expect(u.vx).toBeCloseTo(Math.cos(Math.PI) * (0.5 * 5 + 10), 10);   // flip 掷 0.3→floor(0.6)=0→+π
    expect(u.maxTicks).toBe(400 + Math.floor(0.25 * 100));       // :40
    expect(u.opacity).toBe(0);                                   // 出生 tick 不推进
    m.update();                                                 // 首次 stepUfo → 淡入
    expect(u.opacity).toBeCloseTo(0.1, 12);
    expect(u.frame).toBe(1);                                     // :233 Frame++
  });
  it('Hover 初始化(:69-77):rotation 0、寿命 Next(120,240)、不平移', () => {
    const m = mk([0.9, 0.25, 0.5, 0.25]);                        // 0.9→Hover;x,y,maxTicks
    m.update();
    const u = m.ufos[0];
    expect(u.behavior).toBe(1);
    expect(u.rotation).toBe(0);
    expect(u.maxTicks).toBe(120 + Math.floor(0.25 * 120));
    expect(u.vx).toBe(0);
  });
  it('淡入出 ±0.1/tick,10tick 到 1;尾段自 maxTicks−10 起衰减(:45-50)', () => {
    const m = mk([0.9, 0.25, 0.5, 0.25]);
    m.update();                                                  // spawn(maxTicks=150)
    for (let i = 0; i < 10; i++) m.update();
    expect(m.ufos[0].opacity).toBeCloseTo(1, 12);
    m.ufos[0].ticks = 141;                                       // >150−10 → 衰减档
    m.update();
    expect(m.ufos[0].opacity).toBeCloseTo(0.9, 12);
  });
  it('行为终判换行为(非离场)/熄灭(离场),补位每 update 恰一台(:236-253)', () => {
    const m = mk([0.9, 0.25, 0.5, 0.25], 0.5);
    m.update();                                                  // ufos[0] 出生(Hover)
    m.ufos[0].maxTicks = 20;                                     // 缩短寿命加速终判
    for (let i = 0; i < 21; i++) m.update();                     // 补位至 6 台 + [0] 换行为
    expect(m.activeUfos).toBe(6);                                // 全激活
    expect(m.ufos[0].ticks).toBeLessThan(20);                    // 换行为 → ticks 复位
    // 离场:活跃台全数终判 → 熄灭,isActive=false(:242-244/:254)
    m.deactivate();
    for (const u of m.ufos) if (u.active) u.ticks = u.maxTicks;
    m.update();
    expect(m.ufos.every((u) => !u.active)).toBe(true);
    expect(m.isActive).toBe(false);
  });
  it('帧 %12 环绕(源帧行 = frame/4, :130-140)', () => {
    const m = mk([0.9, 0.25, 0.5, 0.25]);
    for (let i = 0; i < 14; i++) m.update();                     // spawn + 13 次 step
    expect(m.ufos[0].frame).toBe(13 % 12);
  });
});

// ================= MartianSky 着色/投影纯函数(:283-291) =================

describe('MartianSky 着色(ufoTintColor :283)', () => {
  it('cots×0.9+0.1(无 ×0.8/深度档——与剪影族差异)', () => {
    expect(ufoTintColor([255, 255, 255]).r).toBeCloseTo(1.0, 12);
    expect(ufoTintColor([0, 0, 0]).b).toBeCloseTo(0.1, 12);
    expect(ufoTintColor([128, 64, 32]).g).toBeCloseTo(64 / 255 * 0.9 + 0.1, 12);
  });
  it('投影无 X 环绕(:288-291)', () => {
    const p = ufoProject(99999, 0, 1, 0, 0, 1920, 1080);
    expect(p.x).toBeCloseTo(99999 + 960, 12);
  });
});

// ================= 沙尘暴/暴风雪全屏色罩(SandstormSky/BlizzardSky) =================

describe('色罩公式(sandstormSkyTint / blizzardSkyTint)', () => {
  const W: [number, number, number] = [255, 255, 255];
  it('沙暴:min(1,Severity×1.5) 驱动,四通道全乘 opacity×num(:53-55)', () => {
    const t = sandstormSkyTint(1, 1, W);
    expect(t.color[0]).toBeCloseTo(0.85 * 0.8, 12);
    expect(t.color[1]).toBeCloseTo(0.66 * 0.8, 12);
    expect(t.color[2]).toBeCloseTo(0.33 * 0.8, 12);
    expect(t.alpha).toBeCloseTo(0.8, 12);
  });
  it('沙暴:Severity 0.4 → k=0.6;0.5 → 0.75;×opacity 耦合进 rgb 与 α', () => {
    const a = sandstormSkyTint(0.4, 1, W);
    expect(a.alpha).toBeCloseTo(0.8 * 0.6, 12);
    expect(a.color[0]).toBeCloseTo(0.85 * 0.8 * 0.6, 12);
    expect(sandstormSkyTint(0.5, 1, W).alpha).toBeCloseTo(0.8 * 0.75, 12);
    const b = sandstormSkyTint(1, 0.5, W);
    expect(b.alpha).toBeCloseTo(0.8 * 0.5, 12);
    expect(b.color[1]).toBeCloseTo(0.66 * 0.8 * 0.5, 12);
  });
  it('沙暴:cots 逐通道乘(:54 ×Main.ColorOfTheSkies)', () => {
    const t = sandstormSkyTint(1, 1, [128, 64, 32]);
    expect(t.color[0]).toBeCloseTo(0.85 * 0.8 * (128 / 255), 12);
    expect(t.color[1]).toBeCloseTo(0.66 * 0.8 * (64 / 255), 12);
    expect(t.color[2]).toBeCloseTo(0.33 * 0.8 * (32 / 255), 12);
  });
  it('暴雪:min(1,cloudAlpha×2)×0.7 白罩 ×cots(:52-54)', () => {
    const t = blizzardSkyTint(0.6, 1, W);                        // cloudAlpha 0.6 → k=1
    expect(t.alpha).toBeCloseTo(0.7, 12);
    expect(t.color[0]).toBeCloseTo(0.7, 12);
    const h = blizzardSkyTint(0.25, 1, W);                       // k=0.5
    expect(h.alpha).toBeCloseTo(0.35, 12);
    expect(h.color[2]).toBeCloseTo(0.35, 12);
    const c = blizzardSkyTint(0.6, 0.25, [128, 128, 128]);       // opacity 耦合(rgb 与 α 同乘)
    expect(c.alpha).toBeCloseTo(0.7 * 0.25, 12);
    expect(c.color[0]).toBeCloseTo((128 / 255) * 0.7 * 0.25, 12);
  });
});

describe('色罩激活门(SceneState.cs:102/120 + ShowSandstormVisuals)', () => {
  it('暴雪 = ZoneRain && ZoneSnow', () => {
    expect(blizzardSkyGate(true, true)).toBe(true);
    expect(blizzardSkyGate(true, false)).toBe(false);
    expect(blizzardSkyGate(false, true)).toBe(false);
  });
  it('沙暴 = Happening && 沙漠带 && 地表带内(玩家 tileY < groundLevel+30)', () => {
    expect(sandstormSkyGate(true, true, 100, 300)).toBe(true);
    expect(sandstormSkyGate(true, true, 340, 300)).toBe(false);
    expect(sandstormSkyGate(false, true, 100, 300)).toBe(false);
    expect(sandstormSkyGate(true, false, 100, 300)).toBe(false);
  });
});

describe('GLScreenFilters SkyWeatherTint pass', () => {
  it('片元 = mix(dst, color, α)(XNA AlphaBlend 同式),不走 uTint 链乘', () => {
    const frag = SCREEN_FX_FRAGS['SkyWeatherTint'];
    expect(frag).toContain('mix(s.rgb, uColor, uOpacity)');
    expect(frag).not.toContain('uTint');
  });
});

// ================= SkyRenderer 集成:激活门轮询 + 状态机 =================

describe('SkyRenderer 事件天幕/色罩集成', () => {
  stubImage();

  function mkRenderer(): { sky: SkyRenderer; wr: WeatherState; fc: SkyFrameCtx } {
    const sky = new SkyRenderer();
    const wr = {
      slimeRain: true,
      slimeRainTime: 1000,
      slimeRainKillCount: 0,
      cloudAlpha: 0.6,
      sandstorm: { happening: true, timeLeft: 1, severity: 1, intendedSeverity: 1 },
    } as unknown as WeatherState;
    const fc: SkyFrameCtx = {
      entities: [],
      world: {
        w: 4200, h: 1200, groundLevel: 300, lavaLine: 1000, crimson: false,
        invasionType: 4, flags: {},
        store: {
          inBounds: () => false, isSolid: () => false, idx: () => 0,
          liquid: new Uint8Array(1),
        },
      },
      scene: {
        zoneDesert: true, zoneBeach: false, zoneJungle: false,
        zoneCorrupt: false, zoneCrimson: false, zoneHallow: false,
        zoneRain: true, zoneSnow: true,
      },
      player: { cx: 0, cy: 0 },
      clock: { dayCount: 0, timeOfDay: 0.5, isDay: true },
      camX: 0, camY: 0, z: 1, viewW: 1920, viewH: 1080,
    };
    sky.frameCtx = fc;
    sky.attachWeather(wr);
    // 环境族禁出(双高度门全关:playerY 高于天空带、低于地狱带)——测试只驱动事件天幕
    sky.amb = { dayTime: true, raining: false, eclipse: false, bloodMoon: false,
      moonEventKind: 0, zoneHallow: false, playerX: 0, playerY: 100000 };
    sky.fx = { monolith: -1, party: false, surfaceY: 4800, worldW: 4200, worldH: 1200, moonEventKind: 0 };
    return { sky, wr, fc };
  }
  const fakeCtx = {} as CanvasRenderingContext2D;   // 绘制路径因 cots=null/贴图未载全部静默

  it('史莱姆雨/火星入侵门 → 天幕激活;flag 关 → 离场(Activate/Deactivate 边沿)', () => {
    const { sky, wr, fc } = mkRenderer();
    sky.drawAmbience(fakeCtx, 1920, 1080, 0, 0, 16.7);
    expect(sky.slimeSky.isActive).toBe(true);       // StartSlimeRain Activate(Main.cs:64221)
    expect(sky.slimeSky.entities.length).toBe(200);
    expect(sky.martianSky.isActive).toBe(true);     // invasionType==4(Main.cs:58757-58763)
    expect(sky.martianSky.maxUfos).toBe(256);
    // 关门 → Deactivate(_isLeaving:剪影/未尽 UFO 逐个落地/终判后清)
    wr.slimeRain = false;
    fc.world!.invasionType = 0;
    sky.drawAmbience(fakeCtx, 1920, 1080, 0, 0, 16.7);
    expect(sky.slimeSky.isLeaving).toBe(true);
    expect(sky.martianSky.isLeaving).toBe(true);
  });

  it('史莱姆雨排空中再开 → 无条件重 Activate(StartSlimeRain 事件语义)', () => {
    const { sky, wr, fc } = mkRenderer();
    sky.drawAmbience(fakeCtx, 1920, 1080, 0, 0, 16.7);
    const gen1 = sky.slimeSky.entities;
    wr.slimeRain = false;
    sky.drawAmbience(fakeCtx, 1920, 1080, 0, 0, 16.7);
    expect(sky.slimeSky.isLeaving).toBe(true);
    // 排空未完成(剪影仍活)时雨再开 → 原版 Activate 无条件重生成+!isLeaving
    wr.slimeRain = true;
    sky.drawAmbience(fakeCtx, 1920, 1080, 0, 0, 16.7);
    expect(sky.slimeSky.isLeaving).toBe(false);
    expect(sky.slimeSky.isActive).toBe(true);
    expect(sky.slimeSky.entities).not.toBe(gen1);   // GenerateSlimes 重生成
    // 火星门则照 Main.cs:58757 轮询语义:IsActive() 期间不重 Activate(含排空)
    sky.martianSky.activate(4200);
    sky.martianSky.deactivate();
    fc.world!.invasionType = 4;
    sky.drawAmbience(fakeCtx, 1920, 1080, 0, 0, 16.7);
    expect(sky.martianSky.isLeaving).toBe(true);    // 仍离场,不重生成
  });

  it('色罩状态机:开门 1s 渐满 → 两 pass;半门 → 单 pass;关门 → 清空', () => {
    const { sky, fc } = mkRenderer();
    sky.cots = [255, 255, 255];
    expect(sky.weatherTintPasses()).toHaveLength(0);            // 未激活零 pass
    sky.stepWeatherTints(1);                                    // 1s → opacity 1(钳)
    let passes = sky.weatherTintPasses();
    expect(passes).toHaveLength(2);
    const sand0 = tintPass(passes[0]);                          // 沙(0.85,0.66,0.33)暖罩
    expect(sand0.alpha).toBeCloseTo(0.8, 12);
    expect(sand0.color[0]).toBeCloseTo(0.85 * 0.8, 12);
    const blizz0 = tintPass(passes[1]);                         // 雪白罩(cloudAlpha 0.6→k=1)
    expect(blizz0.alpha).toBeCloseTo(0.7, 12);
    // 雪出门(ZoneSnow=false)→ 渐隐 1s → 清;沙暴仍在
    fc.scene!.zoneSnow = false;
    sky.stepWeatherTints(1);
    passes = sky.weatherTintPasses();
    expect(passes).toHaveLength(1);
    expect(tintPass(passes[0]).alpha).toBeCloseTo(0.8, 12);
    // 沙暴 Severity 拉低 → α 联动(SceneState.cs:179 同源驱动)
    sky.weatherRef!.sandstorm.severity = 0.4;
    passes = sky.weatherTintPasses();
    expect(tintPass(passes[0]).alpha).toBeCloseTo(0.8 * 0.6, 12);
    // 全关 → 空
    sky.weatherRef!.sandstorm.happening = false;
    fc.scene!.zoneDesert = false;
    sky.stepWeatherTints(1);
    expect(sky.weatherTintPasses()).toHaveLength(0);
  });

  it('clearAmbience 事件态全清(SkyManager.Reset 同批)', () => {
    const { sky } = mkRenderer();
    sky.drawAmbience(fakeCtx, 1920, 1080, 0, 0, 16.7);
    expect(sky.slimeSky.isActive || sky.martianSky.isActive).toBe(true);
    sky.clearAmbience();
    expect(sky.slimeSky.isActive).toBe(false);
    expect(sky.martianSky.isActive).toBe(false);
    expect(sky.weatherTintPasses()).toHaveLength(0);
  });
});
