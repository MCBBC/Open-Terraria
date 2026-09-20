// BJ176 tooltip 底图三面哨兵网（红蓝-N4 清偿①;2026-09-20）。定谳：SW-TT1 tooltip
// 双案（背包悬停「气泡右侧多出一截」/重铸格「背景平铺成多块气泡」）的三面硬闸——
// ①时序（终布局后烘底）②清约束（量测前清旧 left/top 约束）③no-repeat——此前
// 零测试锁定，M-A（applyTooltipBg 烘底回挪定位前）/M-B（摘 no-repeat）双发全绿
// 实证。原版语义：Main.cs MouseText 即时模式每帧按当帧字符串量宽 + 同 R 矩形画底
// （Utils.DrawInvBG :2718-2742 九宫），无跨帧位置反馈=无此伪影；本仓 DOM 持久
// 元素特有三约束，任一缺失即伪影重演（右缘凸块=定位回弹后按旧固有尺寸平铺）。
// 习语仿 sw-bj165 源码锚哨兵。变异 3 发已逐一证红后回滚（M-A 烘底回挪定位前→
// 面①红 / M-C 摘清约束行→面②红 / M-B 摘 no-repeat→面③红），本网三面即重演锁。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const UI_SRC = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '../src/ui/UI.ts'), 'utf8');

/** 函数体截取：fn 声明行起、到下一已知声明锚止（sw-bj165 同习语；锚漂移=哨兵
 *  以缺锚信息爆红，不静默放行） */
function bodyOf(fnDecl: string, nextDecl: string): string {
  const start = UI_SRC.indexOf(fnDecl);
  expect(start, `UI.ts 缺 ${fnDecl}`).toBeGreaterThan(-1);
  const end = UI_SRC.indexOf(nextDecl, start);
  expect(end, `UI.ts 缺 ${nextDecl}（${fnDecl} 体截取锚）`).toBeGreaterThan(start);
  return UI_SRC.slice(start, end);
}

/** 三条 tooltip 路径（SW-TT1 同族①②③）= [声明锚, 体尾锚] */
const TOOLTIP_FNS: Array<[string, string, string]> = [
  ['showTooltipFor', 'private showTooltipFor(', 'private shopTooltipContext('],
  ['showReforgeTooltip', 'private showReforgeTooltip(): void {', 'closeReforge(): void {'],
  ['showBuffTooltip', 'private showBuffTooltip(anchor: HTMLElement', 'private hideBuffTooltip(): void {'],
];

// ========================================================================
// 面① 时序哨：applyTooltipBg 烘底必须晚于终布局写 left/top
//   （position:fixed shrink-to-fit 受当前 style.left 约束——定位前烘底=按旧约束
//   宽烘固有尺寸，定位回弹后 repeat 铺满 = 右缘重复贴图凸块伪影）
// ========================================================================
describe('BJ176 面① 时序哨（烘底在定位写 left/top 之后;三路径）', () => {
  for (const [name, decl, next] of TOOLTIP_FNS) {
    it(`${name}: applyTooltipBg 调用行位置 > left/top 终写行`, () => {
      const body = bodyOf(decl, next);
      const bg = body.indexOf('this.applyTooltipBg()');
      const leftWrite = body.indexOf('this.tooltip.style.left = `${left}px`;');
      const topWrite = body.indexOf('this.tooltip.style.top = `${top}px`;');
      expect(bg, `${name} 缺 applyTooltipBg 烘底调用`).toBeGreaterThan(-1);
      expect(leftWrite, `${name} 缺终布局 left 写行`).toBeGreaterThan(-1);
      expect(topWrite, `${name} 缺终布局 top 写行`).toBeGreaterThan(-1);
      // M-A（烘底回挪定位前）→ 本断言红
      expect(bg, `${name}: 烘底必须晚于定位写（旧序=平铺伪影重演）`).toBeGreaterThan(leftWrite);
      expect(bg).toBeGreaterThan(topWrite);
    });
  }
});

// ========================================================================
// 面② 清约束哨：量测前清旧 left/top（'0px'）
//   （上一次悬停残留的 left 会把本次 offsetWidth 挤窄——屏幕钳制支最多差 18px、
//   非钳制支可差整个自然宽；残留约束量宽 = 烘底固有尺寸错）
// ========================================================================
describe('BJ176 面② 清约束哨（量测前清 left/top=0px;三路径）', () => {
  for (const [name, decl, next] of TOOLTIP_FNS) {
    it(`${name}: 清 left/top 行在场且先于 offsetWidth 量测`, () => {
      const body = bodyOf(decl, next);
      const clearL = body.indexOf("this.tooltip.style.left = '0px';");
      const clearT = body.indexOf("this.tooltip.style.top = '0px';");
      const measure = body.indexOf('this.tooltip.offsetWidth');
      expect(clearL, `${name} 缺清旧 left 约束行`).toBeGreaterThan(-1);
      expect(clearT, `${name} 缺清旧 top 约束行`).toBeGreaterThan(-1);
      expect(measure, `${name} 缺 offsetWidth 量测行`).toBeGreaterThan(-1);
      // M-C（摘清约束行）→ 本断言红（clearL=-1 已先爆;同支保序双锁）
      expect(clearL, `${name}: 清约束必须先于量测`).toBeLessThan(measure);
      expect(clearT).toBeLessThan(measure);
      expect(clearL).toBeLessThan(body.indexOf('this.tooltip.style.left = `${left}px`;'));
    });
  }
});

// ========================================================================
// 面③ no-repeat 哨：applyTooltipBg 底图赋值行含 no-repeat
//   （底图恒按终布局尺寸现烘（调用量点全在定位后）;量测漂移宁可露 1px 缝也
//   不许默认 repeat 把九宫贴图整面平铺成多块气泡——2026-09-19 重铸格实报形态）
// ========================================================================
describe('BJ176 面③ no-repeat 哨（applyTooltipBg 底图赋值行）', () => {
  const bgBody = bodyOf('private applyTooltipBg(): void {', '// ============ 背包 + 合成 ============');

  it('bgUrl 支赋值行 = url(…) no-repeat（摘 no-repeat 即红）', () => {
    const assign = bgBody.indexOf('this.tooltip.style.background = `url(${bgUrl}) no-repeat`;');
    // M-B（摘 no-repeat）→ 本断言红
    expect(assign, 'applyTooltipBg 底图赋值缺 no-repeat 硬闸').toBeGreaterThan(-1);
  });

  it('素材未就绪兜底支不产平铺面（rgba 兜底色,无 url 平铺）', () => {
    const fallback = bgBody.indexOf("this.tooltip.style.background = 'rgba(21,23,75,0.93)'");
    expect(fallback).toBeGreaterThan(-1);
  });
});

// ========================================================================
// 同族收口：applyTooltipBg 是烘底唯一单源（不许路径内私烘）
// ========================================================================
describe('BJ176 烘底单源收口', () => {
  it('applyTooltipBg 全文件调用恰 5 处（三路径 + 兜底自递归 + buildHud options 回写）+ 定义一处', () => {
    const calls = UI_SRC.split('this.applyTooltipBg()').length - 1;
    // 3 路径 + applyTooltipBg 兜底支 onload 自递归 1 + buildHud 引导/options.onChange 回写 1（:1222）
    expect(calls).toBe(5);
    const defs = UI_SRC.split('private applyTooltipBg(): void {').length - 1;
    expect(defs).toBe(1);
  });
});
