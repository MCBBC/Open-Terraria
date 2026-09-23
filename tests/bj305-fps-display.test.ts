// ★BJ305(2026-09-23) 帧率显示开关——用户明令新功能（原版无对应物 = Web 便利档，缺省关）。
//  判别面四层：
//  ① Options.fpsDisplay 缺省 false + load 布尔卫门（坏值回 false）
//  ② 持久化 round-trip：set('fpsDisplay') → 400ms 防抖 kvSet 载荷含键 → load 回读保留
//  ③ 设置行接线：Settings game 组「渲染帧率上限」行后 toggle 行 + 文案键双语实达
//     public/l10n（l10n-audit 通道）
//  ④ HUD 显示门：Renderer.drawFpsReadout——关（选项关/读数 null）=零 fillText；
//     开=4 向黑影+本体 5 发 fillText，文案=Math.round(读数)+' FPS'（含数值），
//     本体定位=底部中央 (viewW/2, viewH-16)
//  数据源纪律：Game.fps（frameDts 最近 60 帧 rAF 均值）唯一数据源——Game.render 头
//  按开关注入 renderer.fpsReadout，关闭时不取 getter（零开销）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../src/save/KvStore', () => ({
  kvGet: vi.fn(async () => null),
  kvSet: vi.fn(async () => 'fail' as const),
  kvHas: vi.fn(async () => false),
  kvGetIdb: vi.fn(async () => null),
  kvSetIdb: vi.fn(async () => 'fail' as const),
  kvDelete: vi.fn(async () => undefined),
}));

import { OptionsStore, options } from '../src/core/Options';
import { kvGet, kvSet } from '../src/save/KvStore';
import { Renderer } from '../src/render/Renderer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcOf = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

// ============================================================
// ① 缺省关 + load 卫门（Options.ts）
// ============================================================
describe('BJ305 ①Options.fpsDisplay 缺省/卫门', () => {
  beforeEach(() => {
    vi.mocked(kvGet).mockResolvedValue(null);
  });

  it('缺省 = false（初始值字面锁；翻 true 即红）', () => {
    expect(new OptionsStore().data.fpsDisplay).toBe(false);
    expect(srcOf('src/core/Options.ts')).toMatch(/fpsDisplay: false,\s+\/\/ ★BJ305/);
  });

  it('load 布尔卫门：坏值（字符串/缺失）回 false', async () => {
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ fpsDisplay: 'yes' }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.fpsDisplay).toBe(false);
    expect(srcOf('src/core/Options.ts')).toContain("typeof this.data.fpsDisplay !== 'boolean'");
  });
});

// ============================================================
// ② 持久化 round-trip（options 通道 = KvStore 'sandboxworld.options'）
// ============================================================
describe('BJ305 ②持久化 round-trip', () => {
  beforeEach(() => {
    vi.mocked(kvGet).mockResolvedValue(null);
    vi.mocked(kvSet).mockClear();
  });

  it('set(true) 翻转内存态；400ms 防抖后 kvSet 载荷含 fpsDisplay:true', async () => {
    const s = new OptionsStore();
    await s.load();
    expect(s.data.fpsDisplay).toBe(false);
    await s.set('fpsDisplay', true);
    expect(s.data.fpsDisplay).toBe(true);
    // ★RB14b-F2 判例：set() 走 400ms 防抖落盘——必须冲刷计时器再断言 kvSet
    await new Promise((r) => setTimeout(r, 450));
    expect(vi.mocked(kvSet)).toHaveBeenCalled();
    const calls = vi.mocked(kvSet).mock.calls;
    const last = calls[calls.length - 1]!;
    expect(last[0]).toBe('sandboxworld.options');
    expect(JSON.parse(last[1] as string).fpsDisplay).toBe(true);
  });

  it('回读保留：存档侧 true → 新实例 load 后仍 true（页面刷新不丢）', async () => {
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ fpsDisplay: true }));
    const s2 = new OptionsStore();
    await s2.load();
    expect(s2.data.fpsDisplay).toBe(true);
  });
});

// ============================================================
// ③ 设置行接线（Settings.ts game 组 + l10n 双语）
// ============================================================
describe('BJ305 ③设置行接线', () => {
  it('行位紧随「渲染帧率上限」FrameCap 行后（帧率族相邻）；toggle 范式读写 options', () => {
    const src = srcOf('src/ui/Settings.ts');
    const iCap = src.indexOf("options.set('frameCap'");
    const iFps = src.indexOf("options.set('fpsDisplay'");
    const iMode = src.indexOf("options.set('renderMode'");
    expect(iCap).toBeGreaterThan(0);
    expect(iFps).toBeGreaterThan(iCap);        // 行在 FrameCap 之后
    expect(iMode).toBeGreaterThan(iFps);       // 行在 RenderMode 之前（插行中间位）
    expect(src.includes("Lang.text('Mods.SandboxWorld.Settings.FpsDisplay')")).toBe(true);
    expect(src.includes('() => d.fpsDisplay')).toBe(true);
  });

  it('文案键双语落地：l10n-custom 源 + public/l10n 产物（l10n-audit 通道）', () => {
    const zhCustom = readFileSync(join(ROOT, '../tools/l10n-custom/zh-Hans.json'), 'utf8');
    const enCustom = readFileSync(join(ROOT, '../tools/l10n-custom/en-US.json'), 'utf8');
    expect(zhCustom).toContain('"SandboxWorld.Settings.FpsDisplay": "帧率显示"');
    expect(enCustom).toContain('"SandboxWorld.Settings.FpsDisplay": "FPS Display"');
    const zhBuilt = JSON.parse(readFileSync(join(ROOT, 'public/l10n/zh-Hans.json'), 'utf8'));
    const enBuilt = JSON.parse(readFileSync(join(ROOT, 'public/l10n/en-US.json'), 'utf8'));
    expect(zhBuilt.Mods['SandboxWorld.Settings.FpsDisplay']).toBe('帧率显示');
    expect(enBuilt.Mods['SandboxWorld.Settings.FpsDisplay']).toBe('FPS Display');
  });
});

// ============================================================
// ④ HUD 显示门（Renderer.drawFpsReadout）
// ============================================================
interface DrawRec { text: string; x: number; y: number; font: string; fill: string }

/** death-screen-skip 同款范式：Object.create(Renderer.prototype) + 桩 ctx 直调私有绘制。
 *  门读 options 单例内存值（用毕还原）。 */
function runFpsDraw(enabled: boolean, readout: number | null): DrawRec[] {
  const draws: DrawRec[] = [];
  const ctx = {
    save: () => {},
    restore: () => {},
    canvas: { width: 1280, height: 720 },
    textAlign: '',
    textBaseline: '',
    font: '',
    fillStyle: '',
    fillText: (t: string, x: number, y: number) => {
      draws.push({ text: t, x, y, font: ctx.font, fill: ctx.fillStyle });
    },
  };
  const r = Object.create(Renderer.prototype) as unknown as {
    drawFpsReadout: (c: CanvasRenderingContext2D, w: number, h: number) => void;
    fpsReadout: number | null;
  };
  r.fpsReadout = readout;
  const prev = options.data.fpsDisplay;
  options.data.fpsDisplay = enabled;
  try {
    r.drawFpsReadout(ctx as unknown as CanvasRenderingContext2D, 1280, 720);
  } finally {
    options.data.fpsDisplay = prev;
  }
  return draws;
}

describe('BJ305 ④HUD 显示门（drawFpsReadout）', () => {
  it('关门：选项关=零绘制（不进任何 fillText=零开销面）', () => {
    expect(runFpsDraw(false, 59.7)).toHaveLength(0);
  });

  it('读数 null 门：选项开但 Game.fps 样本不足（<2 帧=null）不画', () => {
    expect(runFpsDraw(true, null)).toHaveLength(0);
  });

  it('开门：5 发 fillText（4 向 ±1.5 黑影+本体）、文案含数值 "60 FPS"（59.7→Math.round）', () => {
    const draws = runFpsDraw(true, 59.7);
    expect(draws).toHaveLength(5);
    // 文案含数值：Math.round(59.7)=60 + ' FPS'（语言中立,FrameCap 行先例）
    for (const d of draws) expect(d.text).toBe('60 FPS');
    // MouseText 字体通道（FX58 档同源,无新文字通道）
    for (const d of draws) expect(d.font).toContain('Fusion Pixel 12px');
    // 黑影 4 发=黑、本体 1 发=白
    expect(draws.filter((d) => d.fill === '#000')).toHaveLength(4);
    expect(draws[draws.length - 1].fill).toBe('#FFF');
    // 定位：底部中央——本体 (viewW/2, viewH-16)=(640,704)；影发 ±1.5 环绕
    const body = draws[draws.length - 1];
    expect(body.x).toBe(640);
    expect(body.y).toBe(704);
    const shadows = draws.slice(0, 4);
    expect(new Set(shadows.map((d) => d.x))).toEqual(new Set([641.5, 638.5, 640]));
    expect(new Set(shadows.map((d) => d.y))).toEqual(new Set([704, 705.5, 702.5]));
  });
});

// ============================================================
// ⑤ 注入接线（Game.render 头 / Renderer 步 13 后）
// ============================================================
describe('BJ305 ⑤注入接线', () => {
  it('Game.render 头按开关注入 this.fps（唯一数据源 frameDts,勿另算;关=null 不取 getter）', () => {
    expect(srcOf('src/core/Game.ts'))
      .toContain('this.renderer.fpsReadout = options.data.fpsDisplay ? this.fps : null;');
  });

  it('Renderer：fpsReadout 注入字段在位;调用点在步 13 MouseText 收尾之后（压全部 UI）', () => {
    const src = srcOf('src/render/Renderer.ts');
    expect(src.includes('fpsReadout: number | null = null;')).toBe(true);
    expect(src.includes('private drawFpsReadout(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void')).toBe(true);
    const iMouse = src.indexOf('this.drawMouseTextLayer(ctx, player);');
    const iFps = src.indexOf('this.drawFpsReadout(ctx, viewW, viewH);');
    expect(iMouse).toBeGreaterThan(0);
    expect(iFps).toBeGreaterThan(iMouse);
    expect(src.includes('ctx.font = CANVAS_MOUSETEXT_FONT;')).toBe(true);
  });
});
