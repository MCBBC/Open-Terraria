// ★BJ664b 旗帜名条原版层序终夺（架构级③销项,2026-10-12）
//
// 债面（BJ648 收官登记原文）：住房旗帜 hover 名条已迁合成后直绘（免光照）,
// 但位次债未终夺——「现实现 flushBannerLabels 与 flushEntityHealthBars 的相对
// 位次由 BJ647-B 置后+BJ648 补口挪前——终态位次归 BJ648 主刀定夺」。
//
// 定谳（Terarria1457 SetupDrawInterfaceLayers 全段亲读,唯一标杆）：
//  · Main.cs:45467-45550 = 43 元素接口层表。Town NPC House Banners :45520
//    （数组索引 9）< Entity Health Bars :45539（数组索引 16）——名条先画、
//    血条后画 ⇒【血条盖名条=原版本相】钉死。
//  · 两层之间（数组索引 10-15）= Hide UI Toggle :45525 / Wire Selection
//    :45526 / Capture Manager Check :45531 / Ingame Options :45532 / Fancy UI
//    :45533 / Achievement Complete Popups :45534——六层全纯 UI（F11 隐藏/
//    电路选取/截图管理/设置菜单/花哨 UI/成就弹窗）,无世界内容画在名条与血条
//    之间 ⇒ 覆盖关系直接成立,无夹层偏移。
//  · 两层均 2 参 LegacyGameInterfaceLayer 构造（缺省 InterfaceScaleType.Game,
//    Terraria.UI/LegacyGameInterfaceLayer.cs:11）= 世界坐标无光直绘域
//    （BJ648 免光照同族;BJ593 血条 14 在接口层段仍后于全部世界内容=恒最上主旨）。
//  现盘核对：BJ648 主刀 2026-10-12 位次勘误已落（Renderer.ts 调用序
//  flushBannerLabels < flushEntityHealthBars = 名条先、血条后 = 原版 9<16 同相）
//  ——BJ664b 无需再动刀,本测试 = 位次判别锁钉死防漂移（BJ648 既有锁只钉
//  「同段相邻」未钉序,本件补序锁+行为场景锁）。
//  ★旁案登记（本刀不定谳不落刀,机制级物证在案）：hbEntryOf（Renderer.ts
//  :10273）把 hbAnchor 产在【entry 包裹对象】上（:10288/:10298）,而唯一消费面
//  flushEntityHealthBars（:10408）解构只取 { e, expert } → drawHealthBar 读的
//  e.hbAnchor（:10346）运行时恒缺 ⇒ C13-F5 锚分型覆写（毁灭者 134 平滑锚/
//  蠕虫头尾中点锚,Renderer.ts:10260 头注）=运行时死线,此类条回落默认锚
//  e.y+e.h+10+HB_ADD_H。c13-render-r12-clearance.test.ts 只锚源码未锚行为,
//  未覆盖此缝。本测试夹具因此走真实路径（默认锚）,禁喂 hbAnchor 幻影字段。
//  ★BJ665c（2026-10-12）已接通清偿（解构补取+drawHealthBar 第 4 参直传;行为锁
//  =tests/bj665c-hbanchor-wire.test.ts + c13 F5-wire 行为面）——本件夹具仍走
//  默认锚路径不变（vid 1 无锚实体=真实常态路径）。
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

function lineOf(src: string, needle: string): number {
  const i = src.indexOf(needle);
  expect(i, `源码锚缺失: ${needle}`).toBeGreaterThanOrEqual(0);
  return src.slice(0, i).split('\n').length;
}

// ---------------------------------------------------------------------------
// ① 原版表序全段锚（血条盖名条=原版本相钉死;原版语义漂移即爆红）
// ---------------------------------------------------------------------------
describe('BJ664b ①原版 SetupDrawInterfaceLayers 表序全段锚（Main.cs:45467-45550）', () => {
  const seg = (name: string): string => {
    const i = mainSrc.indexOf(`"${name}"`);
    expect(i, `层名缺失: ${name}`).toBeGreaterThan(0);
    return mainSrc.slice(i, mainSrc.indexOf('new LegacyGameInterfaceLayer', i));
  };

  it('表序：Ruler < TownNPC HouseBanners < (六纯UI层) < EntityHealthBars < Invasion < Map', () => {
    const names = [
      'Vanilla: Ruler',
      'Vanilla: Town NPC House Banners',
      'Vanilla: Hide UI Toggle',
      'Vanilla: Wire Selection',
      'Vanilla: Capture Manager Check',
      'Vanilla: Ingame Options',
      'Vanilla: Fancy UI',
      'Vanilla: Achievement Complete Popups',
      'Vanilla: Entity Health Bars',
      'Vanilla: Invasion Progress Bars',
      'Vanilla: Map / Minimap',
    ].map((n) => mainSrc.indexOf(`"${n}"`));
    for (let k = 0; k < names.length; k++) {
      expect(names[k], `层名锚缺失[${k}]`).toBeGreaterThan(0);
      if (k > 0) expect(names[k], `表序反转@[${k - 1}]<[${k}]`).toBeGreaterThan(names[k - 1]);
    }
  });

  it('两层之间（数组索引 10-15）恰为六纯 UI 层、零世界内容夹层 ⇒ 血条盖名条无夹层偏移', () => {
    const bannerName = '"Vanilla: Town NPC House Banners"';
    const iBanner = mainSrc.indexOf(bannerName);
    const iBars = mainSrc.indexOf('"Vanilla: Entity Health Bars"');
    // 名条层条目（含 delegate 体）之后起切 = 下一层（Hide UI Toggle）条目起点
    const betweenStart = mainSrc.indexOf('new LegacyGameInterfaceLayer', iBanner + bannerName.length);
    const between = mainSrc.slice(betweenStart, iBars);
    const betweenNames = (between.match(/"Vanilla: [^"]+"/g) ?? []).map((s) => s.slice(1, -1));
    expect(betweenNames).toEqual([
      'Vanilla: Hide UI Toggle',
      'Vanilla: Wire Selection',
      'Vanilla: Capture Manager Check',
      'Vanilla: Ingame Options',
      'Vanilla: Fancy UI',
      'Vanilla: Achievement Complete Popups',
    ]);
    // 六层全为 UI 域层：无 DrawNPCHousesInWorld/DrawHealthBar 复入（覆盖关系直接成立）
    expect(between).not.toMatch(/DrawNPCHousesInWorld|EntityHealthBars|HouseBanner/);
  });

  it('两层均 2 参构造（缺省 InterfaceScaleType.Game = 世界坐标无光直绘域,免光照同族）', () => {
    expect(seg('Vanilla: Town NPC House Banners'))
      .toMatch(/DrawInterface_7_TownNPCHouseBanners\(\);/);
    expect(seg('Vanilla: Town NPC House Banners')).not.toMatch(/InterfaceScaleType\./);
    expect(seg('Vanilla: Entity Health Bars'))
      .toMatch(/DrawInterface_14_EntityHealthBars\(\);/);
    expect(seg('Vanilla: Entity Health Bars')).not.toMatch(/InterfaceScaleType\./);
    expect(legacyLayerSrc).toMatch(/InterfaceScaleType scaleType = InterfaceScaleType\.Game/);
  });
});

// ---------------------------------------------------------------------------
// ② 现盘位次锁（名条先画 < 血条后画 = 原版 9<16 同相;序反转即爆红）
// ---------------------------------------------------------------------------
describe('BJ664b ②现盘位次锁（flushBannerLabels < flushEntityHealthBars）', () => {
  it('调用序：drawScreenFilterChain（光照/滤镜链）< 名条 flush < 血条 flush（原版 链<9<16）', () => {
    const iChain = lineOf(rendererSrc, 'this.drawScreenFilterChain(ctx, cam, player, viewW, viewH, z, world);');
    const iBanner = lineOf(rendererSrc, 'this.flushBannerLabels(cam);');
    const iBars = lineOf(rendererSrc, 'this.flushEntityHealthBars(hbPass, cam);');
    expect(iChain).toBeLessThan(iBanner);   // 合成后直绘（BJ648 免光照面）
    expect(iBanner).toBeLessThan(iBars);    // ★本刀位次锁:名条先、血条后（原版 9<16）
  });

  it('调用点唯一（无第二 flush 面重排位次;收集面唯一=drawHouseBanners）', () => {
    expect((rendererSrc.match(/this\.flushBannerLabels\(cam\);/g) ?? []).length).toBe(1);
    expect((rendererSrc.match(/this\.flushEntityHealthBars\(hbPass, cam\);/g) ?? []).length).toBe(1);
    expect((rendererSrc.match(/_bannerLabelPass\.push\(/g) ?? []).length).toBe(1);
  });

  it('血条 pass 仍后于世界实体层（BJ593「恒最上」主旨不破:14 在接口层段后于世界内容）', () => {
    const iEntity = lineOf(rendererSrc, 'heldProjFrameBegin()');   // 实体层锚（BJ370 同款）
    const iBars = lineOf(rendererSrc, 'this.flushEntityHealthBars(hbPass, cam);');
    expect(iEntity).toBeLessThan(iBars);
  });
});

// ---------------------------------------------------------------------------
// ③ 行为场景锁：hover 名条 + 受伤 NPC 血条同屏 → 血条后画=盖名条（原版同相）
// ---------------------------------------------------------------------------
type Op = {
  seq: number;
  kind: 'rect' | 'text' | 'img';
  x?: number; y?: number; w?: number; h?: number;      // rect
  label?: string; fill?: string;                       // text/rect
  dx?: number; dy?: number; dw?: number; dh?: number;  // img dest（屏空间）
  alpha: number;
};

let r: InstanceType<typeof Renderer>;

const mkCam = () => ({
  x: 640, y: 360, zoom: 1, viewW: 1280, viewH: 720, punchX: 0, punchY: 0, flipY: false,
  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x + this.punchX) * this.zoom + this.viewW / 2, (wy - this.y + this.punchY) * this.zoom + this.viewH / 2];
  },
});

const mkCtx = (lightAtCalls: { n: number }) => {
  const ops: Op[] = [];
  let seq = 0;
  const rec = (o: Omit<Op, 'seq'>) => ops.push({ seq: seq++, ...o });
  return {
    ops, lightAtCalls,
    globalAlpha: 1 as number,
    imageSmoothingEnabled: true,
    globalCompositeOperation: 'source-over' as string,
    fillStyle: '', textAlign: 'left' as string, textBaseline: 'alphabetic' as string, font: '',
    save() { /* noop */ }, restore() { /* noop */ }, setTransform() { /* noop */ },
    measureText(t: string) { return { width: t.length * 7 }; },
    fillRect(x: number, y: number, w: number, h: number) {
      rec({ kind: 'rect', x, y, w, h, fill: this.fillStyle, alpha: this.globalAlpha });
      if (this.globalCompositeOperation === 'multiply') this.lightAtCalls.n = -999;   // 乘法笔=光照消费红旗
    },
    fillText(label: string, x: number, y: number) {
      rec({ kind: 'text', x, y, label, fill: this.fillStyle, alpha: this.globalAlpha });
    },
    drawImage(_i: unknown, _sx: number, _sy: number, _sw: number, _sh: number,
      dx: number, dy: number, dw: number, dh: number) {
      rec({ kind: 'img', dx, dy, dw, dh, alpha: this.globalAlpha });
    },
  };
};

/** 场景几何（同屏重叠,真实运行时路径——夹具走【无锚默认式】=vid 1 无锚实体
 *  常态（hbAnchor 死线旁案已由 BJ665c 接通,见头注;本件仍不喂 entry 级锚））
 *  → 条锚 = 默认式 e.y+e.h+10=220。名条锚 by=252/rectH=46
 *  → 基线 wy=220 → 框屏 y 209..224;血条条屏 y 220..232、x 782..818（vid=1
 *  scale=1,fill=18 段式）——y 带 220..224 与名条框重叠。 */
const LABEL = { bx: 800, by: 252, rectH: 46, label: '向导' };
const BAR_ENTRY = {
  e: { cx: 800, cy: 200, y: 170, h: 40, hp: 50, maxHp: 100, vanillaId: 1, ai0: 0 },
  expert: false,
};

type FlushRenderer = {
  ctx: unknown; lighting: unknown; atlas: unknown; tintedSprite: unknown;
  remotePlayers: unknown[];
  _bannerLabelPass: Array<{ bx: number; by: number; rectH: number; label: string }>;
  flushBannerLabels(cam: unknown): void;
  flushEntityHealthBars(pass: unknown, cam: unknown): void;
};

describe('BJ664b ③血条盖名条场景锁（hover 名条+受伤 NPC 血条同屏重叠域）', () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).Image = class {
      src = ''; onload: (() => void) | null = null;
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
    r = new Renderer(null as never);
  }, 120000);

  it('帧调用序回放：名条 ops 全部先于血条 img ops（单画布后画者胜=血条盖名条）', () => {
    const rr = r as unknown as FlushRenderer;
    const ctx = mkCtx({ n: 0 });
    rr.ctx = ctx;
    rr.lighting = { lightAt: () => [255, 255, 255] };   // 全亮（白天室内格光满档）
    rr.atlas = { ensureVImage: () => ({ img: {} }) };
    (rr as unknown as { tintedSprite: () => unknown }).tintedSprite =
      () => ({ c: {}, x: 0, y: 0, w: 2, h: 12 });
    rr._bannerLabelPass.length = 0;
    rr._bannerLabelPass.push({ ...LABEL });

    rr.flushBannerLabels(mkCam());                      // 原版层 9（先画）
    const nAfterLabel = ctx.ops.length;
    rr.flushEntityHealthBars([BAR_ENTRY], mkCam());     // 原版层 16（后画=覆盖者）
    const imgs = ctx.ops.filter((q) => q.kind === 'img');
    expect(nAfterLabel).toBeGreaterThan(0);             // 名条已落笔（框+字）
    expect(imgs.length).toBeGreaterThan(0);             // 血条已落笔
    for (const op of ctx.ops) {
      if (op.kind === 'img') expect(op.seq, '血条 op 序必须晚于全部名条 op（原版 9<16）').toBeGreaterThanOrEqual(nAfterLabel);
      else expect(op.seq, '名条 op 必须先于血条（序反转=名条反盖血条,原版不同相）').toBeLessThan(nAfterLabel);
    }
    // 血条绘制域不依赖健康档位（受伤实体 hp<maxHp 已过门）
    const texts = ctx.ops.filter((q) => q.kind === 'text');
    expect(texts.length).toBe(1);
    expect(texts[0].label).toBe('向导');
  });

  it('重叠域成立：血条 dest 矩形与名条框矩形相交（场景锁的覆盖前提几何）', () => {
    const rr = r as unknown as FlushRenderer;
    const ctx = mkCtx({ n: 0 });
    rr.ctx = ctx;
    rr.lighting = { lightAt: () => [255, 255, 255] };
    rr.atlas = { ensureVImage: () => ({ img: {} }) };
    (rr as unknown as { tintedSprite: () => unknown }).tintedSprite =
      () => ({ c: {}, x: 0, y: 0, w: 2, h: 12 });
    rr._bannerLabelPass.length = 0;
    rr._bannerLabelPass.push({ ...LABEL });
    rr.flushBannerLabels(mkCam());
    rr.flushEntityHealthBars([BAR_ENTRY], mkCam());

    const labelBox = ctx.ops.find((q) => q.kind === 'rect')!;
    expect(labelBox.fill).toBe('rgba(20,16,28,0.85)');
    const lb = { x: labelBox.x!, y: labelBox.y!, r: labelBox.x! + labelBox.w!, b: labelBox.y! + labelBox.h! };
    const bar = { l: Math.min(...ctx.ops.filter((q) => q.kind === 'img').map((q) => q.dx!)),
      r: Math.max(...ctx.ops.filter((q) => q.kind === 'img').map((q) => q.dx! + q.dw!)),
      t: Math.min(...ctx.ops.filter((q) => q.kind === 'img').map((q) => q.dy!)),
      b: Math.max(...ctx.ops.filter((q) => q.kind === 'img').map((q) => q.dy! + q.dh!)) };
    expect(bar.l < lb.r && lb.x < bar.r && bar.t < lb.b && lb.y < bar.b).toBe(true);   // AABB 相交
  });

  it('空血条 pass 时名条照画（免光照可见性独立于血条位次/存在,visibility 不被 bar pass 门控）', () => {
    const rr = r as unknown as FlushRenderer;
    const ctx = mkCtx({ n: 0 });
    rr.ctx = ctx;
    rr.lighting = { lightAt: () => [0, 0, 0] };   // 清晨暗档
    rr.atlas = { ensureVImage: () => ({ img: {} }) };
    rr._bannerLabelPass.length = 0;
    rr._bannerLabelPass.push({ ...LABEL });
    rr.flushEntityHealthBars([], mkCam());        // 无受伤实体 → 早退零笔
    expect(ctx.ops.filter((q) => q.kind === 'img').length).toBe(0);
    rr.flushBannerLabels(mkCam());                // 名条仍全量直绘
    expect(ctx.ops.filter((q) => q.kind === 'text').length).toBe(1);
    expect(ctx.ops.filter((q) => q.kind === 'rect').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ④ BJ648 免光照锁回归（暗档名条恒亮,独立于位次;位次勘误不得连带破迁层面）
// ---------------------------------------------------------------------------
describe('BJ664b ④BJ648 免光照面回归（暗档下名条色式/α 恒定,零光照消费）', () => {
  it('lightAt 暗档 [0,0,0]：flush 零光照读、白字/黑框色式与 α=1 恒定（迁层面不随位次勘误漂移）', () => {
    const rr = r as unknown as FlushRenderer;
    const lightAtCalls = { n: 0 };
    const ctx = mkCtx(lightAtCalls);
    rr.ctx = ctx;
    rr.lighting = { lightAt: () => { lightAtCalls.n++; return [0, 0, 0]; } };
    rr._bannerLabelPass.length = 0;
    rr._bannerLabelPass.push({ ...LABEL });
    rr.flushBannerLabels(mkCam());
    expect(lightAtCalls.n).toBe(0);   // flush 不读光照（旧世界层路径必红）
    const texts = ctx.ops.filter((q) => q.kind === 'text');
    const rects = ctx.ops.filter((q) => q.kind === 'rect');
    expect(texts.length).toBe(1);
    expect(texts[0].fill).toBe('#E8E4F0');
    expect(texts[0].alpha).toBe(1);   // 无光照 α 衰减（迁层核心判别）
    expect(rects.length).toBe(1);
    expect(rects[0].fill).toBe('rgba(20,16,28,0.85)');
    expect(rects[0].alpha).toBe(1);
  });
});
