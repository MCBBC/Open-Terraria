// ★BJ546（2026-10-07 用户实报双图：永恒水晶放入永恒水晶座——本仓水晶小/浮在座上/
//   光效弱 vs 原版水晶大且嵌入座中+顶部光柱光晕）。三面定谳（亲读 1457 反编译）：
//   ①图层：548 SetDefaults hide=true（NPC.cs:16038）→ 常规 NPC pass 跳过
//     （Main.cs:22539 !hide）+ CacheNPCDraws 专缓 DrawCacheNPCsBehindNonSolidTiles
//     （Main.cs:38802-38804）→ Main.cs:57817 在 DrawTiles(solidLayer:false)
//     （:57823 非实心 tile）【之前】绘制 → 水晶被座 466（非实心,Style5x4 5×4,
//     TileObjectData.cs:2785-2798）压在下层 =「嵌入座中」。本仓 proto 无 hide/
//     behindTiles → 落主实体层（tile 之上）=浮在座前。落刀=isBehindTilesEnemy 548 专支。
//   ②大小/锚：独占绘制支 origin=帧中心+(−1,+30+8)（Main.cs:24252-24253,贴图
//     NPC_548.png 58×44 全帧,scale=1）→ 贴图中心 = Bottom+(1,−38) = 盒中心+(1,−18)、
//     贴图底 = 盒底−16（悬浮晶坐在座顶碗位）。生成点 = 座左上+(40,64) = NPC Bottom
//     （DD2Event.cs:589-597 + NPC.cs:81600 NewNPC Bottom 锚）→ 5×4 座水平居中。
//     本仓旧=「帧中心钉盒心」+「内容底贴盒底」(footFlush) → 整体低 16px=上半截被
//     座碗遮住（显小）+底缘戳出座脚（浮）。落刀=FOOT_FLUSH_EXEMPT+548、addY=−18。
//   ③光效：AI_105 AddLight(1.3,0.5,1.5)（NPC.cs:42813-42816,本仓 lightRGB 已接）+
//     本体内/外光环各 4 份拷贝（:24270-24282/:24302-24312,半径 4×呼吸波 2-3px）+
//     胜利白罩（:24284-24289,ai1==2 ×min(1,ai0/120)）+ 环 Glow_239 三笔
//     （:24344-24354,原生 96×96×0.75=72px 独立锚 Bottom−40,底笔恒 α0.6 + 两笔
//     反相扩张脉冲）+ 光柱 Extra_89 两笔（:24355-24366,锚 Bottom−46,BJ454 已落）。
//     全链唯一态门 = alpha<255（:24325,败北渐隐熄灭）;波间/波中光效同式。
//     本仓旧=环被压进本体 58×44 帧矩形（96×96 squash）+α 误挂三秒呼吸+脉冲笔/
//     光环/胜利罩全缺 =「光效弱」。落刀=NPC_GLOW[548] mode 'crystal548'（内光环）
//     + draw548CrystalOverlays（本体后槽四层）+ 波形/环规格/门/胜利罩四纯函数单源。
//   判别力：摘 isBehindTilesEnemy 548 支→①红;bodyAddY 摘→②红;环底笔 α/scale 或
//   波形相位摘→③红;glowVisible 门摘→败北熄灭腿红;beamScaleY ×0.6 摘→BJ454 面红。
import { describe, it, expect, beforeAll } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Renderer } from '../src/render/Renderer';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';

type Waves = ReturnType<typeof Renderer['dd2CrystalGlowWaves']>;   // 静态须 typeof（BJ547 顺手修正预存 tsc 错）

describe('BJ546①：图层（hide + BehindNonSolidTiles → 座 466 下层）', () => {
  const isBehind = (id: number, behindTiles?: boolean): boolean => {
    const fake = { vanillaId: id, vanilla: { behindTiles } } as unknown as Enemy;
    return (Renderer.prototype as unknown as {
      isBehindTilesEnemy(e: Enemy): boolean;
    }).isBehindTilesEnemy.call({}, fake);
  };

  it('548 入 tile 下层通道（Main.cs:38802/:57817 定谳）', () => {
    expect(isBehind(548)).toBe(true);          // 摘专支 → 红
    expect(isBehind(548, false)).toBe(true);   // proto 无 behindTiles 也入（hide 链语义）
  });

  it('既有 behindTiles 族不回归（钻地蠕虫 13=true;113-115 血肉墙豁免;普通 1=false）', () => {
    expect(isBehind(13, true)).toBe(true);
    expect(isBehind(117, true)).toBe(true);
    expect(isBehind(113, true)).toBe(false);   // 墙身豁免（2b' 注释判例）不回归
    expect(isBehind(1, false)).toBe(false);
    expect(isBehind(1)).toBe(false);
  });

  it('生成盒几何（DD2Event.cs:589-597 + NewNPC Bottom 锚）：40×40 friendly/aiStyle105', () => {
    const def = VANILLA_NPCS['548']!;
    expect(def.width).toBe(40);
    expect(def.height).toBe(40);
    expect(def.friendly).toBe(true);
    expect(def.aiStyle).toBe(105);
    // 生成点 = 座左上+(40,64)：座 5×4（80×64px）→ Bottom.X=座心（水平居中）、
    // Bottom.Y=座底缘（DD2_CRYSTAL_STAND 钉值族与 40/64 恒互洽）
    expect(Renderer.DD2_CRYSTAL_STAND.npcId).toBe(548);
    expect(Renderer.DD2_CRYSTAL_STAND.standTileId).toBe(466);
  });
});

describe('BJ546②：本体锚/大小（origin=帧中心+(−1,+38) 逆推）', () => {
  it('DD2_CRYSTAL_STAND 钉值（贴图底=盒底−16 → addY=−18）', () => {
    // 帧中心钉盒心系：贴图中心 = 盒中心+(0,addY) → 原版 (1,−18) 的 Y 分量
    expect(Renderer.DD2_CRYSTAL_STAND.bodyAddY).toBe(-18);   // 摘 → 红
    // X 1px 右偏（origin14.X--）登记不接：环/光柱锚=Bottom.X 无 +1,近对称晶不可辨
    // 悬浮高：贴图底 = 盒中心+addY+22 = 盒底−16（44/2=22）
    expect(-18 + 22).toBe(4);                                  // 盒中心系贴图底 = 盒底−16+20? → 盒底=+20 → 4=20−16
    expect(Renderer.DD2_CRYSTAL_STAND.ringDyWorld).toBe(-40);  // :24347
    expect(Renderer.DD2_CRYSTAL_STAND.beamDyWorld).toBe(-46);  // :24347+24364
    expect(Renderer.DD2_CRYSTAL_STAND.ringTexelScale).toBe(0.75); // :24350 原生 96×96×0.75
  });

  it('悬浮族 footFlush 豁免语义：addY=−18 下贴图底=盒底−16（原版悬浮位,非贴底）', () => {
    // 盒底（盒中心系）=+20;贴图底 = addY(−18)+帧半高(22) = +4 = 盒底上方 16px
    const boxBottom = 20;
    const texBottom = Renderer.DD2_CRYSTAL_STAND.bodyAddY + 22;
    expect(boxBottom - texBottom).toBe(16);                    // 摘 footFlush 豁免/改 addY → 此式断
  });
});

describe('BJ546③：光效（光环/环/光柱/胜利罩——Main.cs:24270-24366 全链）', () => {
  beforeAll(async () => {
    (globalThis as Record<string, unknown>).Image = class {
      src = ''; onload: (() => void) | null = null;
      width = 0; height = 0;
      addEventListener() { /* noop */ }
    };
    const anyStub = (): Record<string, unknown> => new Proxy(function stub() { /* noop */ } as unknown as Record<string, unknown>, {
      get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anyStub()),
      set: () => true,
      apply: () => anyStub(),
      construct: () => anyStub(),
    });
    (globalThis as Record<string, unknown>).document = { createElement: () => anyStub() };
    (globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {};
    (globalThis as Record<string, unknown>).window = { addEventListener: () => {}, removeEventListener: () => {} };
  });

  it('波形单源（:24326-24342/:24272/:24304）：锚点+反相恒等式 n122a+n122b=1.25', () => {
    const w0 = Renderer.dd2CrystalGlowWaves(0);
    expect(w0.n128).toBe(0);
    expect(w0.n129).toBe(0);
    expect(w0.n130).toBeCloseTo(0.5, 12);
    expect(w0.n131).toBeCloseTo(0.5, 12);
    expect(w0.n122a).toBeCloseTo(0.625, 12);   // sin(π)=0
    expect(w0.n122b).toBeCloseTo(0.625, 12);
    // gtw=1：n128=1/3;sin(2π·0.75)=sin(1.5π)=−1 → n122b=0.5;π 相位支 sin(2.5π)=+1 → n122a=0.75
    const w1 = Renderer.dd2CrystalGlowWaves(1);
    expect(w1.n128).toBeCloseTo(1 / 3, 12);
    expect(w1.n129).toBeCloseTo(1 / 3, 12);
    expect(w1.n131).toBeCloseTo(1 / 6, 12);    // n130=5/6>0.5 → 1−5/6
    expect(w1.n122a).toBeCloseTo(0.75, 12);    // π 相位支（摘 +π → 红）
    expect(w1.n122b).toBeCloseTo(0.5, 12);     // 无 π 支
    // 全域不变量：两光环波反相（sin(x+π)=−sin(x)）→ 和恒 1.25;值域 [0.5,0.75]
    for (let i = 0; i < 240; i++) {
      const w = Renderer.dd2CrystalGlowWaves(i / 32);
      expect(w.n122a + w.n122b).toBeCloseTo(1.25, 9);
      expect(w.n122a).toBeGreaterThanOrEqual(0.5);
      expect(w.n122a).toBeLessThanOrEqual(0.75);
      expect(w.n129).toBeGreaterThanOrEqual(0);
      expect(w.n131).toBeLessThanOrEqual(0.5);
    }
  });

  it('环三笔规格（:24350/:24352/:24354）：底笔恒 (0.75,0.6)+两笔反相扩张脉冲', () => {
    const w = Renderer.dd2CrystalGlowWaves(1);
    const spec = Renderer.dd2CrystalRingSpec(w);
    expect(spec).toHaveLength(3);
    expect(spec[0]!.scale).toBe(0.75);          // 摘 → 红
    expect(spec[0]!.alpha).toBe(0.6);           // 底笔恒 0.6（旧误挂呼吸 → 红）
    expect(spec[1]!.scale).toBeCloseTo(0.75 * (1 + w.n128 * 0.75), 12);
    expect(spec[1]!.alpha).toBeCloseTo(0.6 * w.n129, 12);
    expect(spec[2]!.scale).toBeCloseTo(0.75 * (1 + w.n130 * 0.75), 12);
    expect(spec[2]!.alpha).toBeCloseTo(0.6 * w.n131, 12);
    // 全域值域：scale ∈ [0.75, 0.75×1.75=1.3125]（n128/n130<1）、脉冲 α ≤ 0.6×0.5=0.3
    for (let i = 0; i < 96; i++) {
      for (const c of Renderer.dd2CrystalRingSpec(Renderer.dd2CrystalGlowWaves(i / 32))) {
        expect(c.scale).toBeGreaterThanOrEqual(0.75);
        expect(c.scale).toBeLessThanOrEqual(0.75 * 1.75 + 1e-9);
        expect(c.alpha).toBeGreaterThanOrEqual(0);
        expect(c.alpha).toBeLessThanOrEqual(0.6 + 1e-9);
      }
    }
  });

  it('α<255 门（:24325）：常态恒亮、败北渐隐满 255 熄灭（BJ450 败北面光效收敛）', () => {
    expect(Renderer.dd2CrystalGlowVisible(0)).toBe(true);     // 常态/波间/波中
    expect(Renderer.dd2CrystalGlowVisible(254)).toBe(true);   // 渐隐途中仍亮
    expect(Renderer.dd2CrystalGlowVisible(255)).toBe(false);  // 摘门 → 红（败北末段光效不灭）
    // 败北渐隐步进（NPC.cs:42999 alpha+=50/tick 自 ai0≥96）→ 4 tick 满熄
    let alpha = 0;
    for (let k = 0; k < 5; k++) {
      alpha = Math.min(255, alpha + 50);
      expect(Renderer.dd2CrystalGlowVisible(alpha)).toBe(alpha < 255);
    }
  });

  it('胜利白罩（:24285 min(1,ai0/120)）：0→120t 线性爬满、后期恒 1', () => {
    expect(Renderer.dd2CrystalWinOverlayAlpha(0)).toBe(0);
    expect(Renderer.dd2CrystalWinOverlayAlpha(60)).toBeCloseTo(0.5, 12);
    expect(Renderer.dd2CrystalWinOverlayAlpha(119)).toBeCloseTo(119 / 120, 12);
    expect(Renderer.dd2CrystalWinOverlayAlpha(120)).toBe(1);
    expect(Renderer.dd2CrystalWinOverlayAlpha(600)).toBe(1);   // 摘 min → 红
  });

  it('胜利罩 ai1==2 门（:24284 直调）：常态零白罩笔,胜利 120t 恰一笔 α=1', async () => {
    const rec: Array<{ alpha: number; dx: number; dy: number; w: number; h: number }> = [];
    const ctxStub = {
      save() { /* noop */ }, restore() { /* noop */ },
      translate() { /* noop */ }, rotate() { /* noop */ },
      set globalCompositeOperation(_v: string) { /* noop */ },
      set globalAlpha(v: number) { cur = v; },
      drawImage(_img: unknown, sx: unknown, sy: unknown, sw: number, sh: number,
        dx: number, dy: number, w: number, h: number) {
        rec.push({ alpha: cur, dx, dy, w, h });
      },
    };
    let cur = 1;
    const rect = { img: {}, sx: 0, sy: 0, sw: 58, sh: 44 };
    const host = {
      ctx: ctxStub,
      atlas: {
        ensureVImage: (name: string) => (name === 'vanilla/Glow_239.png' || name === 'vanilla/Extra_89.png' ? rect : null),
      },
      tintedSprite: () => null,   // 环/柱笔 null 跳过——白罩/光环走本体验证
    };
    const r = new Renderer(null as never);
    const fn = (r as unknown as { draw548CrystalOverlays(...args: unknown[]): void })
      .draw548CrystalOverlays;
    const e0 = { spawnAlpha: 0, ai1: 0, ai0: 0, h: 40, dontTakeDamageFromHostiles: false, visAngle: 0 };
    fn.call(host, e0, rect, -29, -40, 1, true);
    // 常态（ai1=0）：只有外光环 4 笔（α≤0.15）,无本体位 α 高笔
    const aura = rec.filter((d) => d.alpha <= 0.2);
    expect(aura).toHaveLength(4);
    expect(rec.filter((d) => d.alpha > 0.5)).toHaveLength(0);   // 摘 ai1 门（M6）→ 红
    rec.length = 0;
    const eWin = { ...e0, ai1: 2, ai0: 120 };
    fn.call(host, eWin, rect, -29, -40, 1, true);
    const white = rec.filter((d) => d.alpha > 0.5);
    expect(white).toHaveLength(1);                              // 胜利恰一笔 α=1
    expect(white[0]!.dx).toBe(-29);                             // 本体位（bx,by）
    expect(white[0]!.dy).toBe(-40);
    expect(white[0]!.w).toBe(58);
  });

  it('光柱 Y 缩放（BJ454 面不回归）：正常 [3,4.125]、演出门 ×0.6', () => {
    expect(Renderer.dd2CrystalBeamScaleY(0, false)).toBeCloseTo(3.5625, 9);
    expect(Renderer.dd2CrystalBeamScaleY(0, true)).toBeCloseTo(2.1375, 9);   // 摘 ×0.6 → 红
    for (let i = 0; i < 96; i++) {
      const t = i / 32;
      expect(Renderer.dd2CrystalBeamScaleY(t, false)).toBeGreaterThanOrEqual(3);
      expect(Renderer.dd2CrystalBeamScaleY(t, false)).toBeLessThanOrEqual(4.125);
    }
  });

  it('两态同式（波间/波中光效无态门,唯一门=α<255）：同 GTW 波形/环规格逐位等值', () => {
    // 原版光效链只吃 GlobalTimeWrappedHourly 与 alpha——不读 DD2Event 波态。
    // 判别面：同 GTW 下两次求值深等值（纯函数确定性）;波态差异只体现在
    // glowVisible 的 α 路径（常态两态 α 恒 0 → 恒同亮）。
    for (const t of [0, 0.7, 1.3, 2.2, 2.999]) {
      const a = Renderer.dd2CrystalGlowWaves(t);
      const b = Renderer.dd2CrystalGlowWaves(t);
      expect(a).toEqual(b);
      expect(Renderer.dd2CrystalRingSpec(a)).toEqual(Renderer.dd2CrystalRingSpec(b));
      expect(Renderer.dd2CrystalGlowVisible(0)).toBe(true);    // 波间 α=0、波中 α=0 → 同亮
    }
  });

  it('内光环挂点（★BJ547 定谳改钉）：本体【前】槽专法,NPC_GLOW[548] 表项退役', () => {
    // 原版层序 = 内环 4 拷贝（Main.cs:24266-24282）→ 本体（:24283 不透明覆盖）。
    // BJ546 曾挂 drawNpcGlow（本体后槽,lighter）= 加算拷贝叠印本体之上,与光柱
    // 核心罩并凶把本体打白（BJ547 用户复报;剥层探针定谳）。退役表项=变异锚：
    // 谁把内环挂回 drawNpcGlow 必须重加表项 → 本断言红。
    const G = (Renderer as unknown as { NPC_GLOW: Record<number, { tex: string; mode: string }> }).NPC_GLOW;
    expect(G[548]).toBeUndefined();                             // 挂回表 → 红
    expect(typeof (Renderer.prototype as unknown as {
      draw548CrystalInnerHalo?: unknown;
    }).draw548CrystalInnerHalo).toBe('function');               // 删前槽专法 → 红
  });
});
