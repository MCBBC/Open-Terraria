// ★BJ648（2026-10-12）住房旗帜 hover 名条迁层——BJ647 副案真凶「黑框无字」收口。
//
// 定谳（Terarria1457 亲读,唯一标杆）：
//  · 「字灭」机理：旧实现把 hover 名条（黑框 rgba(20,16,28,0.85) + 白字 #E8E4F0）
//    画在 drawHouseBanners 世界层内 → compositeLight 全屏乘光把白字乘暗；清晨/夜
//    晚旗区格光≈0 时白字隐入暗底只剩黑框（用户实报「黑框无字」,debug-report
//    十周年纪念种子 18-11 + v18 探针昼夜 A/B:day 帧框字清晰/night 帧整条灭）。
//    黑框深色底乘光后仍近似黑 = 框可见字不可见的非对称表象。
//  · 原版本相：DrawInterface_7_TownNPCHouseBanners（Main.cs:46984,调用点挂
//    SetupDrawInterfaceLayers 表 :45522）= 接口层段——在世界+光照+滤镜链【之后】
//    无光直绘（LegacyGameInterfaceLayer 缺省 InterfaceScaleType.Game,
//    Terraria.UI/LegacyGameInterfaceLayer.cs:11;与 BJ593 血条 DrawInterface_14
//    :45541 同族）。表序 4 Ruler < 7 TownNPCHouseBanners < 14 EntityHealthBars。
//  · 原版名条面 = DrawNPCHousesInWorld 内 hover 命中即 MouseText(nPCHouseBannerText,
//    0, 0)（Main.cs:41550-41557）——鼠标旁悬停文本（UI 域,不受 tile 光照）;
//    旗布本体/头像则吃 Lighting.GetColor(homeTileX, num3)（:41467/:41480）。
//    ⇒ 迁层律:名条免光照、旗布本体留世界层吃格光（本仓两分同相）。
//  · 原版 MouseText 普通路径无背盒（Main.cs:20504-20505 MouseTextInner 非 tooltip
//    分支=ChatManager.DrawColorCodedStringWithShadow 直绘文字+阴影,背盒仅
//    HoverItem tooltip 面）;本仓黑框 = 本仓 hover 名条视觉,迁层只改层不改色式。
//  落刀（BJ647-B 主体 + BJ648 位次勘误/帧首清账）：
//   drawHouseBanners 名条段改收集面（_bannerLabelPass.push,hover 检测/label 构建
//   不动）→ flushBannerLabels 屏空间直绘（恒等域 setTransform + worldToScreen +
//   flipY 手翻 = drawHealthBar BJ593 同款;锚 = by-rectH/2-9 世界基线屏换算）;
//   调用位 = flushEntityHealthBars 之前（原版表序 7<14 → 血条盖名条;BJ647-B 曾
//   置于其后=名条反盖血条,注释同段自述 7<14 与实现相悖=BJ405 注释-实现不符族）;
//   帧首清账兜底（_bannerLabelPass.length=0,BJ594 队列习语——flush 尾自清之外的
//   早退路径防陈旧名条幽灵帧）。
//  判别力（旧码必红）：①位次/无光域源码锚 ②直绘锁（恒等域+worldToScreen+零光照
//  消费）③暗区行为锁（lightAt 暗档 stub 下文字色/alpha 恒定）④黑框色式+锚点数学。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../src/render/Renderer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const mainSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8');
const legacyLayerSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria.UI/LegacyGameInterfaceLayer.cs'), 'utf8');

// ---------------------------------------------------------------------------
// ① 原版接口层位次锚（原版语义漂移即爆红）
// ---------------------------------------------------------------------------
describe('BJ648 ①原版 DrawInterface_7 接口层锚', () => {
  it('SetupDrawInterfaceLayers 表序 4 Ruler < 7 TownNPCHouseBanners < 14 EntityHealthBars < 16 Map', () => {
    const iRuler = mainSrc.indexOf('"Vanilla: Ruler"');
    const iBanner = mainSrc.indexOf('"Vanilla: Town NPC House Banners"');
    const iBars = mainSrc.indexOf('"Vanilla: Entity Health Bars"');
    const iMap = mainSrc.indexOf('"Vanilla: Map / Minimap"');
    expect(iRuler).toBeGreaterThan(0);
    expect(iRuler < iBanner && iBanner < iBars && iBars < iMap).toBe(true);
  });

  it('DrawInterface_7 体 = DrawNPCHousesInWorld（Main.cs:46992 唯一调用）', () => {
    const sig = mainSrc.indexOf('private void DrawInterface_7_TownNPCHouseBanners()');
    expect(sig).toBeGreaterThan(0);
    const body = mainSrc.slice(sig, mainSrc.indexOf('private static void DrawInterface_6_', sig));
    expect(body).toMatch(/DrawNPCHousesInWorld\(\);/);
  });

  it('名条面 = hover 命中即 MouseText(GetNPCHouseBannerText)——UI 悬停文本域,非世界层绘制', () => {
    const sig = mainSrc.indexOf('protected void DrawNPCHousesInWorld()');
    expect(sig).toBeGreaterThan(0);
    const body = mainSrc.slice(sig, mainSrc.indexOf('public void SetIMEPanelAnchor', sig));
    expect(body).toMatch(/string nPCHouseBannerText = Lang\.GetNPCHouseBannerText\(nPC, num2\);/);
    expect(body).toMatch(/MouseText\(nPCHouseBannerText, 0, 0\);/);
    // 名条面零 fill/draw 消费（原版名条不在旗帜处画框字,全走 MouseText 面板）
    expect(body).not.toMatch(/DrawString/);
  });

  it('旗布本体/头像吃格光（Lighting.GetColor）＝本仓世界层旗布同相;LegacyGameInterfaceLayer 缺省 InterfaceScaleType.Game', () => {
    const sig = mainSrc.indexOf('protected void DrawNPCHousesInWorld()');
    const body = mainSrc.slice(sig, mainSrc.indexOf('public void SetIMEPanelAnchor', sig));
    // 旗布 :41467 与头像 :41480 两处取格光色
    expect((body.match(/Lighting\.GetColor\(homeTileX, num3\)/g) ?? []).length).toBe(2);
    // 接口层缺省缩放域 = Game（世界坐标、无光照合成直绘域）
    expect(legacyLayerSrc).toMatch(/InterfaceScaleType scaleType = InterfaceScaleType\.Game/);
  });
});

// ---------------------------------------------------------------------------
// ② 迁层后直绘锁（收集面/flush 面两段式 + 调用位次）
// ---------------------------------------------------------------------------
describe('BJ648 ②迁层直绘锁', () => {
  const sigFlush = rendererSrc.indexOf('private flushBannerLabels(cam: Camera): void {');
  const flushBody = rendererSrc.slice(sigFlush, rendererSrc.indexOf('\n  /**', sigFlush + 10));
  const sigCollect = rendererSrc.indexOf('private drawHouseBanners(entities: unknown[], world: World, cam: Camera) {');
  const collectBody = rendererSrc.slice(sigCollect, rendererSrc.indexOf('\n  /**', sigCollect + 10));

  it('flushBannerLabels = 恒等域 + worldToScreen + flipY 手翻（drawHealthBar BJ593 同款屏空间域）', () => {
    expect(sigFlush, 'flushBannerLabels 定义').toBeGreaterThan(0);
    expect(flushBody).toMatch(/ctx\.setTransform\(1, 0, 0, 1, 0, 0\)/);
    expect(flushBody).toMatch(/cam\.worldToScreen\(bx, by - rectH \/ 2 - 9\)/);
    expect(flushBody).toMatch(/cam\.flipY \? cam\.viewH - sy0 : sy0/);
  });

  it('flush 体零光照消费（无 lightAt/无 multiply 合成——「免光照」锁,旧世界层码必红）', () => {
    expect(flushBody).not.toMatch(/lightAt/);
    expect(flushBody).not.toMatch(/globalCompositeOperation/);
    expect(flushBody).not.toMatch(/multiply/);
  });

  it('drawHouseBanners 收集面：push 名条、零 fillText（文字面不再画世界层;旗布本体吃格光面保留）', () => {
    expect(sigCollect).toBeGreaterThan(0);
    expect(collectBody).toMatch(/_bannerLabelPass\.push/);
    expect(collectBody).not.toMatch(/fillText/);   // 旧实现黑框+fillText 在此=必红
    // 旗布本体格光染色面保留（原版 :41467 同相,BJ648 不动）
    expect(collectBody).toMatch(/lightAt\(/);
    expect(collectBody).toMatch(/globalCompositeOperation = 'multiply'/);
  });

  it('调用位次：drawScreenFilterChain < flushBannerLabels < flushEntityHealthBars（表序 光照链<7<14）', () => {
    const iChain = rendererSrc.indexOf('this.drawScreenFilterChain(ctx, cam, player, viewW, viewH, z, world);');
    const iBanner = rendererSrc.indexOf('this.flushBannerLabels(cam);');
    const iBars = rendererSrc.indexOf('this.flushEntityHealthBars(hbPass, cam);');
    expect(iChain).toBeGreaterThan(0);
    expect(iChain < iBanner && iBanner < iBars).toBe(true);
  });

  it('帧首清账兜底 + flush 尾自清（_bannerLabelPass 双清,BJ594 队列习语）', () => {
    expect((rendererSrc.match(/_bannerLabelPass\.length = 0/g) ?? []).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ③+④ 行为锁：暗区直绘恒亮 + 黑框色式/锚点数学
// ---------------------------------------------------------------------------
type Rec = { kind: 'rect' | 'text'; x: number; y: number; w?: number; h?: number; label?: string; fill: string };

let r: InstanceType<typeof Renderer>;

const mkCam = () => ({
  x: 640, y: 360, zoom: 1, viewW: 1280, viewH: 720, punchX: 0, punchY: 0, flipY: false,
  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x + this.punchX) * this.zoom + this.viewW / 2, (wy - this.y + this.punchY) * this.zoom + this.viewH / 2];
  },
});

const mkCtx = (lightAtCalls: { n: number }) => {
  const recs: Rec[] = [];
  return {
    recs, lightAtCalls,
    globalAlpha: 1, imageSmoothingEnabled: true,
    globalCompositeOperation: 'source-over',
    fillStyle: '', textAlign: 'left', textBaseline: 'alphabetic', font: '',
    save() { /* noop */ }, restore() { /* noop */ },
    setTransform() { /* noop */ },
    measureText(t: string) { return { width: t.length * 7 }; },
    fillRect(x: number, y: number, w: number, h: number) {
      recs.push({ kind: 'rect', x, y, w, h, fill: this.fillStyle });
      if (this.globalCompositeOperation === 'multiply') this.lightAtCalls.n = -999;   // 乘法笔=光照消费,判别红旗
    },
    fillText(label: string, x: number, y: number) {
      recs.push({ kind: 'text', x, y, label, fill: this.fillStyle });
    },
  };
};

describe('BJ648 ③清晨暗区文字可见锁（lightAt 暗档下名条恒亮）', () => {
  beforeAll(() => {
    // Image 桩（bj583 同款,SkyRenderer loadTex 需要）
    (globalThis as Record<string, unknown>).Image = class {
      src = ''; onload: (() => void) | null = null;
      addEventListener() { /* noop */ }
    };
    // 全吸收桩（bj583 同款）：构造器字段初始化链的任意 2D 调用都吞掉
    const anyStub = (): Record<string, unknown> => new Proxy(function stub() { /* noop */ } as unknown as Record<string, unknown>, {
      get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anyStub()),
      set: () => true,
      apply: () => anyStub(),
      construct: () => anyStub(),
    });
    (globalThis as Record<string, unknown>).document = { createElement: () => anyStub() };
    (globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {};
    (globalThis as Record<string, unknown>).window = { addEventListener: () => {}, removeEventListener: () => {} };
    r = new Renderer(null as never);
  }, 120000);

  it('lightAt 暗档 [0,0,0] stub 下：flush 零光照读、白字 #E8E4F0 全量直绘不衰减', () => {
    const lightAtCalls = { n: 0 };
    const ctx = mkCtx(lightAtCalls);
    const rr = r as unknown as {
      ctx: unknown; lighting: { lightAt(x: number, y: number): [number, number, number] } | null;
      _bannerLabelPass: Array<{ bx: number; by: number; rectH: number; label: string }>;
      flushBannerLabels(cam: unknown): void;
    };
    rr.ctx = ctx;
    rr.lighting = { lightAt: () => { lightAtCalls.n++; return [0, 0, 0]; } };   // 清晨无直照=暗档
    rr._bannerLabelPass.push({ bx: 800, by: 200, rectH: 46, label: '向导' });
    rr.flushBannerLabels(mkCam());
    expect(lightAtCalls.n).toBe(0);   // flush 不读光照（迁层核心判别——旧世界层路径必红）
    const texts = ctx.recs.filter((q) => q.kind === 'text');
    expect(texts.length).toBe(1);
    expect(texts[0].label).toBe('向导');
    expect(texts[0].fill).toBe('#E8E4F0');   // 全亮白字,无 alpha 衰减
    const rects = ctx.recs.filter((q) => q.kind === 'rect');
    expect(rects.length).toBe(1);
    expect(rects[0].fill).toBe('rgba(20,16,28,0.85)');   // 黑框原样（不因暗档变体）
  });

  it('锚点数学 = 旧世界层逐位同相（zoom=1:基线 by-rectH/2-9、框顶-20、框 tw+10×15）', () => {
    const ctx = mkCtx({ n: 0 });
    const rr = r as unknown as {
      ctx: unknown; lighting: unknown;
      _bannerLabelPass: Array<{ bx: number; by: number; rectH: number; label: string }>;
      flushBannerLabels(cam: unknown): void;
    };
    rr.ctx = ctx;
    rr.lighting = null;
    // 世界锚 (800,200)：by=200, rectH=46 → 基线 wy=200-23-9=168, 屏=(800,168)
    rr._bannerLabelPass.push({ bx: 800, by: 200, rectH: 46, label: 'AAA' });   // measure=21
    rr.flushBannerLabels(mkCam());
    const rect = ctx.recs.find((q) => q.kind === 'rect')!;
    const text = ctx.recs.find((q) => q.kind === 'text')!;
    expect(rect.x).toBeCloseTo(800 - 21 / 2 - 5);   // 框左 = sx - tw/2 - 5（旧式 tw+10 居中）
    expect(rect.y).toBe(168 - 11);                  // 框顶 = 基线-11 = by-rectH/2-20（旧框顶）
    expect(rect.w).toBe(21 + 10);
    expect(rect.h).toBe(15);
    expect(text.x).toBe(800);
    expect(text.y).toBe(168);                       // 文字基线 = by-rectH/2-9（旧基线）
  });

  it('空队列零笔 + flipY 手翻（gd=−1 名条随锚镜像,BJ593 同款）', () => {
    const ctx = mkCtx({ n: 0 });
    const rr = r as unknown as {
      ctx: unknown; lighting: unknown; _bannerLabelPass: unknown[];
      flushBannerLabels(cam: unknown): void;
    };
    rr.ctx = ctx;
    rr.lighting = null;
    rr._bannerLabelPass.length = 0;
    rr.flushBannerLabels(mkCam());
    expect(ctx.recs.length).toBe(0);
    const cam = mkCam() as ReturnType<typeof mkCam> & { flipY: boolean; viewH: number };
    cam.flipY = true;
    rr._bannerLabelPass.push({ bx: 800, by: 200, rectH: 46, label: 'B' });
    rr.flushBannerLabels(cam);
    const text = ctx.recs.find((q) => q.kind === 'text')!;
    expect(text.y).toBe(cam.viewH - 168);   // 720-168=552（flipY 锚镜像原式）
  });
});

// ---------------------------------------------------------------------------
// ④ 黑框色式对拍（迁层只改层不改色式——BJ647 前旧值逐字锁）
// ---------------------------------------------------------------------------
describe('BJ648 ④黑框色式对拍', () => {
  const sigFlush = rendererSrc.indexOf('private flushBannerLabels(cam: Camera): void {');
  const flushBody = rendererSrc.slice(sigFlush, rendererSrc.indexOf('\n  /**', sigFlush + 10));

  it('框 rgba(20,16,28,0.85) + 字 #E8E4F0（BJ647-B 迁层保留值,色式漂移即爆红）', () => {
    expect(flushBody).toMatch(/fillStyle = 'rgba\(20,16,28,0\.85\)'/);
    expect(flushBody).toMatch(/fillStyle = '#E8E4F0'/);
    expect(flushBody).toMatch(/font = '12px "Fusion Pixel 12px", sans-serif'/);
  });

  it('原版对照锚：MouseText 普通路径无背盒（ChatManager 直绘,背盒仅 HoverItem tooltip 面）——本仓黑框=本仓 hover 视觉,迁层不动色式', () => {
    const sig = mainSrc.indexOf('private void MouseTextInner(MouseTextCache info)');
    expect(sig).toBeGreaterThan(0);
    const body = mainSrc.slice(sig, mainSrc.indexOf('private void MouseText_DrawItemTooltip', sig));
    // 普通路径收口 = 无背盒文字直绘（背盒在 DrawItemTooltip 分支,不入本段）
    expect(body).toMatch(/ChatManager\.DrawColorCodedStringWithShadow\(spriteBatch, FontAssets\.MouseText\.Value, cursorText/);
  });
});
