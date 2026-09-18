// SW-TPMARK 2026-09-17 用户令：F10（Shift+F10 地图点击传送调试旗）开启时，
// 全屏地图传送预选标记（tpMark）旁常显 tile 坐标文本，便于定位具体位置。
//
// 定谳（现有实现；行号 2026-09-18 红蓝-D 勘误——Game.ts 前序漂移,原 :8547-8559/
//  :46157-46161/:8531/:8536/:8546 均陈旧）：
//  · Game.ts:8653-8665  旗开启分支——首次点击 renderer.tpMark = {x: tx, y: ty}
//    （tx/ty = Math.floor((mouseX−cx0)/fm.zoom) = tile 坐标,地图 1 tile = zoom px,:8621-8622；
//    选点 toast :8664）；
//  · Game.ts:46486-46491 传送成功 tpMark=null+关图；ping/虫洞/晶塔分支复位 :8637/8642/8652；
//  · Renderer.ts drawFullMap 原内联块（现提取为 drawTpMark）：每帧重画闪烁红圈+十字线。
// 落刀：drawTpMark 内新增坐标文本（常显不随闪烁、深色描边白字、右缘翻左/垂直钳屏内、
// 标记完全离屏不画文本）；tpMarkCoordText/tpMarkCoordLayout 纯函数单源（行为测直驱）。
// 无标记→无文本（drawTpMark 前置 return）；tpMark 每帧重画=重设/复位自动同步。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { Renderer, tpMarkCoordText, tpMarkCoordLayout } from '../src/render/Renderer';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 录制型 2D 上下文桩（drawTpMark 消费面） */
function recordingCtx(viewW: number, viewH: number) {
  const calls = { fillText: [] as { text: string; x: number; y: number; alpha: number; align: string }[], strokeText: [] as unknown[][], arc: 0, strokes: 0 };
  const ctx = {
    canvas: { width: viewW, height: viewH },
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1,
    font: '', textAlign: 'left', textBaseline: 'alphabetic',
    beginPath() { /* noop */ },
    arc() { calls.arc++; },
    moveTo() { /* noop */ },
    lineTo() { /* noop */ },
    stroke() { calls.strokes++; },
    save() { /* noop */ },
    restore() { /* noop */ },
    measureText(t: string) { return { width: t.length * 7.5 } as TextMetrics; },
    strokeText(...args: unknown[]) { calls.strokeText.push(args); },
    fillText(text: string, x: number, y: number) {
      calls.fillText.push({ text, x, y, alpha: ctx.globalAlpha, align: ctx.textAlign });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** drawTpMark 桩直驱（sw-bj15 fmStub 同款原型法习语） */
function drawTpMarkOn(tpMark: { x: number; y: number } | null,
  zoom: number, cx0: number, cy0: number, viewW = 1280, viewH = 800) {
  const stub = { tpMark } as unknown as Renderer;
  const { ctx, calls } = recordingCtx(viewW, viewH);
  (Renderer.prototype as unknown as {
    drawTpMark: (ctx: CanvasRenderingContext2D, fm: { zoom: number },
      cx0: number, cy0: number, viewW: number, viewH: number) => void;
  }).drawTpMark.call(stub, ctx, { zoom }, cx0, cy0, viewW, viewH);
  return { calls };
}

describe('SW-TPMARK 坐标文本纯函数（tile 域 + 排版钳制）', () => {
  it('tpMarkCoordText：tile 坐标 → "(x, y)"（与选点 toast Preselect 同值同域）', () => {
    expect(tpMarkCoordText(2097, 273)).toBe('(2097, 273)');
    expect(tpMarkCoordText(0, 0)).toBe('(0, 0)');
    expect(tpMarkCoordText(123, 4567)).toBe('(123, 4567)');
    // 非整数容错（防御）：trunc 文本化,不放大不换域
    expect(tpMarkCoordText(12.0, 34.0)).toBe('(12, 34)');
  });

  it('tpMarkCoordLayout：屏内标记 → 右侧 left 对齐（GAP=18,避开圆环+十字臂 ±14px）', () => {
    const lay = tpMarkCoordLayout(300, 200, 60, 1280, 800);
    expect(lay).toEqual({ x: 318, y: 200, align: 'left' });
  });

  it('右缘放不下 → 翻到标记左侧（textAlign right,文本不越右屏）', () => {
    // 300 + 18 + 60 = 378 ≤ 1274 → left；mx=1240：1240+18+60=1318 > 1274 → right
    const lay = tpMarkCoordLayout(1240, 200, 60, 1280, 800);
    expect(lay).toEqual({ x: 1222, y: 200, align: 'right' });
    // 判别力：right 对齐文本向左延展 → 右缘 = x 本身,不越屏（left 布局此例 1318 > 1280）
    expect(lay.x).toBeLessThanOrEqual(1280);
    expect(lay.x - 60).toBeGreaterThanOrEqual(0);
  });

  it('顶/底缘垂直钳制：12px 字半高不越屏（世界边缘标记文本不越屏）', () => {
    expect(tpMarkCoordLayout(300, 0.5, 60, 1280, 800).y).toBe(14);      // 顶缘钳入
    expect(tpMarkCoordLayout(300, 799.5, 60, 1280, 800).y).toBe(786);   // 底缘钳入
    // 屏内不动
    expect(tpMarkCoordLayout(300, 400, 60, 1280, 800).y).toBe(400);
  });

  it('缩放不敏感：layout 只吃屏幕坐标（换算 (tp+0.5)*zoom 在 drawTpMark 完成）', () => {
    expect(tpMarkCoordLayout(100, 100, 30, 500, 500)).toEqual({ x: 118, y: 100, align: 'left' });
  });
});

describe('SW-TPMARK drawTpMark 行为测（录制 ctx 桩直驱）', () => {
  it('标记存在 → 坐标文本恰一次,内容=tile 换算正确值,画在标记右侧', () => {
    // zoom=1, 原点(0,0)：标记 (299,199) → 中心 (299.5, 199.5)
    const { calls } = drawTpMarkOn({ x: 299, y: 199 }, 1, 0, 0);
    expect(calls.fillText).toHaveLength(1);
    const f = calls.fillText[0];
    expect(f.text).toBe('(299, 199)');            // tile 域直传（像素域×16 即红）
    expect(f.x).toBeCloseTo(299.5 + 18, 6);       // 右侧 GAP=18
    expect(f.y).toBeCloseTo(199.5, 6);
    expect(f.align).toBe('left');
    // 深色描边白字（亮暗底图都可读）
    expect(calls.strokeText).toHaveLength(1);
  });

  it('无标记 → 无文本（tpMark=null 零 fillText/strokeText）', () => {
    const { calls } = drawTpMarkOn(null, 1, 0, 0);
    expect(calls.fillText).toHaveLength(0);
    expect(calls.strokeText).toHaveLength(0);
    expect(calls.arc).toBe(0);
  });

  it('标记重设 → 每帧重画自动同步（新坐标文本跟随新 tpMark）', () => {
    const first = drawTpMarkOn({ x: 299, y: 199 }, 1, 0, 0).calls.fillText[0];
    const second = drawTpMarkOn({ x: 310, y: 205 }, 1, 0, 0).calls.fillText[0];
    expect(second.text).toBe('(310, 205)');
    expect(second.x).not.toBe(first.x);
    expect(second.y).not.toBe(first.y);
  });

  it('标记在最右 → 文本翻左（right 对齐,不越右屏）;顶缘 y 钳屏内', () => {
    const right = drawTpMarkOn({ x: 1244, y: 199 }, 1, 0, 0).calls.fillText[0];
    // mx=1244.5：1244.5+18+67.5(9 字×7.5)=1330 > 1274 → 翻左
    expect(right.align).toBe('right');
    expect(right.x).toBeCloseTo(1244.5 - 18, 6);
    const top = drawTpMarkOn({ x: 299, y: 0 }, 1, 0, 0).calls.fillText[0];
    expect(top.y).toBe(14);   // my=0.5 → 钳到 14
  });

  it('标记完全离屏 → 不画文本（防屏缘孤儿标签）;圈线照旧由画布裁掉', () => {
    const { calls } = drawTpMarkOn({ x: 1500, y: 199 }, 1, 0, 0);   // mx=1500.5 > 1280+20
    expect(calls.fillText).toHaveLength(0);
    expect(calls.arc).toBe(1);   // 圈仍画（原样保留,出屏自然裁）
  });

  it('圈+十字线原样保留（arc 一次 + 圈线两次 stroke）;文本常显不随闪烁（alpha=1）', () => {
    const { calls } = drawTpMarkOn({ x: 299, y: 199 }, 2, 100, 50);
    expect(calls.arc).toBe(1);
    expect(calls.strokes).toBe(2);   // 圈 stroke + 十字 stroke（文本描边单独计）
    for (const f of calls.fillText) expect(f.alpha).toBe(1);
    // 中心换算同式：(tp+0.5)*zoom + 原点
    expect(calls.fillText[0].x).toBeCloseTo(100 + 299.5 * 2 + 18, 6);
    expect(calls.fillText[0].y).toBeCloseTo(50 + 199.5 * 2, 6);
  });
});

describe('SW-TPMARK 结构锁（源文本锚,防静默回退）', () => {
  const rs = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
  const gs = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');

  it('drawFullMap 消费面 = drawTpMark 调用（提取后仍接原位）', () => {
    const i = rs.indexOf('this.drawTpMark(ctx, fm, cx0, cy0, viewW, viewH);');
    expect(i).toBeGreaterThan(0);
    // 锚在 drawFullMap 内（位于函数头之后、ping 层之前）
    const head = rs.indexOf('drawFullMap(ctx: CanvasRenderingContext2D');
    const ping = rs.indexOf('this.drawMapPingLayer(ctx, cx0, cy0);');
    expect(i).toBeGreaterThan(head);
    expect(i).toBeLessThan(ping);
  });

  it('drawTpMark：tpMark 前置 return（无标记零绘制面）+ 坐标域直传 tp.x/tp.y', () => {
    const i0 = rs.indexOf('private drawTpMark(');
    expect(i0).toBeGreaterThan(0);
    const body = rs.slice(i0, i0 + 2200);
    expect(body).toContain('const tp = this.tpMark;');
    expect(body.indexOf('if (!tp) return;')).toBeGreaterThan(-1);
    expect(body).toContain('tpMarkCoordText(tp.x, tp.y)');   // 换算错变异（×16/像素域）即红
    // 中心换算同式（选点逆变换一致）
    expect(body).toContain('(tp.x + 0.5) * fm.zoom');
    expect(body).toContain('(tp.y + 0.5) * fm.zoom');
  });

  it('文本样式锁：深色描边+白字（亮暗底图可读）+ 屏缘钳制/翻边 + 离屏门', () => {
    const i0 = rs.indexOf('private drawTpMark(');
    const body = rs.slice(i0, i0 + 2200);
    expect(body).toContain("ctx.strokeStyle = 'rgba(0,0,0,0.85)'");
    expect(body).toContain("ctx.fillStyle = '#FFFFFF'");
    expect(body).toContain('tpMarkCoordLayout(');
    expect(body).toContain('mx < -20 || mx > viewW + 20');
  });

  it('tile 域源头锁：Game 选点换算仍为 Math.floor((mouseX−cx0)/fm.zoom) 且直写 tpMark', () => {
    const i = gs.indexOf('const tx = Math.floor((inp.mouseX - cx0) / fm.zoom);');
    expect(i).toBeGreaterThan(0);
    // tpMark 直写在同一释放链内（中间隔着 ping 双通道注释块）
    const write = gs.indexOf('this.renderer.tpMark = { x: tx, y: ty };', i);
    expect(write).toBeGreaterThan(i);
    expect(write - i).toBeLessThan(2600);
  });

  it('tpMark 绘制单源：全文件唯一 this.tpMark 读点 = drawTpMark（无第二处消费绘制）', () => {
    expect(rs.match(/this\.tpMark/g)).toHaveLength(1);          // 唯一读点
    expect(rs.match(/tpMark: \{ x: number; y: number \} \| null = null;/g)).toHaveLength(1);
    expect(rs.match(/this\.drawTpMark\(/g)).toHaveLength(1);    // 唯一调用点
  });

  it('选点 toast 单源锁：Preselect/Mark/Unmark 传参 = tpMarkCoordText（回退再包→红）', () => {
    // 红蓝-D 2026-09-18：曾传 `(${tx}, ${ty})` 自带括号,撞 zh 模板「已选择 {0}」的
    // 译文括号 → 「已选择 ((x, y))」双括号（en 模板无括号=双源格式漂移）。单源 =
    // 传参与标记旁注（Renderer tpMarkCoordText）同串,Game 侧不再自拼括号。
    const pre = gs.indexOf("Lang.text('Mods.SandboxWorld.Map.Preselect'");
    expect(pre).toBeGreaterThan(0);
    const preArgs = gs.slice(pre, pre + 140);
    expect(preArgs).toContain('tpMarkCoordText(tx, ty)');
    expect(preArgs).not.toContain('`(${tx}');                    // 回退再包（自拼括号）即红
    const unmark = gs.indexOf("Lang.text('Mods.SandboxWorld.Map.Unmark'");
    expect(unmark).toBeGreaterThan(0);
    const annoTail = gs.slice(unmark, gs.indexOf('updateAnnotateCount', unmark));
    expect(annoTail.match(/tpMarkCoordText\(tx, ty\)/g)).toHaveLength(2);  // Unmark+Mark 两支
    expect(annoTail).not.toContain('`(${tx}');
  });

  it('选点 toast 双语核：zh/en 模板 × tpMarkCoordText 渲染恰一层括号（红蓝-D 双括号定谳）', () => {
    // 防两向：zh 模板去括号后 {0}=(x, y) 恰一层;en 无括号模板收同串不产生缺括号。
    // 断言 = 模板+传参整串精确相等（模板任何再包/去括号漂移即红）。
    const arg = tpMarkCoordText(2097, 273);
    expect(arg).toBe('(2097, 273)');
    const zh = JSON.parse(readFileSync(join(ROOT, 'public/l10n/zh-Hans.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(ROOT, 'public/l10n/en-US.json'), 'utf8'));
    const render = (pack: unknown, key: string) => {
      languageManager.resetForTest();
      languageManager.loadPackJson(pack as Parameters<typeof languageManager.loadPackJson>[0]);
      return Lang.text(key, arg);
    };
    expect(render(zh, 'Mods.SandboxWorld.Map.Preselect')).toBe('已选择 (2097, 273)——再次点击传送');
    expect(render(en, 'Mods.SandboxWorld.Map.Preselect')).toBe('Teleport point (2097, 273) selected — click again to confirm');
    expect(render(zh, 'Mods.SandboxWorld.Map.Mark')).toBe('已在 (2097, 273) 标记');
    expect(render(zh, 'Mods.SandboxWorld.Map.Unmark')).toBe('已取消 (2097, 273) 的标记');
    languageManager.resetForTest();
  });
});
