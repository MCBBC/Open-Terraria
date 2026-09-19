// ★信息栏 DOM 化(2026-09-19)守卫:diff 签名纯函数 + 挂载接线结构锁。
// 数据装配层(stats/InfoAccs.ts buildInfoAccRows)是原版 1:1 对齐面,本族测试
// 只锁「呈现层替换」不锁数据面(info-accs.test.ts/info-accs-p0.test.ts 已锁)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rowViewsOf, diffRowIndexes, infoLayout, rowTopOf, invIconXY, iconTopInRow,
  infoDomEnabled,
} from '../src/render/InfoAccsDOM';
import type { InfoAccRow } from '../src/stats/InfoAccs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const row = (over: Partial<InfoAccRow>): InfoAccRow => ({
  row: 0, icon: 0, hideIndex: 0, text: 't', label: 'l', ...over,
});

describe('rowViewsOf(行视图映射与画布 draw 色域同式)', () => {
  it('金/降灰/常规三色映射(#FFE745/#646464/#e8e4f0)', () => {
    const views = rowViewsOf(
      [row({ gold: true }), row({ grayed: true }), row({})],
      [], false,
    );
    expect(views.map((v) => v.color)).toEqual(['#FFE745', '#646464', '#e8e4f0']);
    expect(views.map((v) => v.text)).toEqual(['t', 't', 't']);
    expect(views.map((v) => v.icon)).toEqual([0, 0, 0]);
  });

  it('hidden 只在背包横排(inventoryOpen)生效,纵排恒 false', () => {
    const hidden = [false, false, false, true];   // hideIndex 3 位
    const rows = [row({ icon: 3, hideIndex: 3 })];
    expect(rowViewsOf(rows, hidden, false).every((v) => !v.hidden)).toBe(true);
    expect(rowViewsOf(rows, hidden, true).map((v) => v.hidden)).toEqual([true]);
    expect(rowViewsOf(rows, [false, false, false, false], true).map((v) => v.hidden)).toEqual([false]);
  });
});

describe('diffRowIndexes(逐帧字符串 diff;变化行才写)', () => {
  const v = (over: Partial<InfoAccRow>) => rowViewsOf([row(over)], [], false)[0];

  it('无变化 = 空集(零 DOM 写)', () => {
    const a = [v({ text: 'a' }), v({ text: 'b', icon: 3 })];
    expect(diffRowIndexes(a, a.map((x) => ({ ...x })))).toEqual([]);
  });

  it('单行文本/色/图标/乘色变化 → 只该行入集', () => {
    const a = [v({ text: 'a' }), v({ text: 'b' }), v({ text: 'c' })];
    expect(diffRowIndexes(a, [v({ text: 'a' }), v({ text: 'b2' }), v({ text: 'c' })])).toEqual([1]);
    const gold = [v({ text: 'a' }), rowViewsOf([row({ text: 'b', gold: true })], [], false)[0], v({ text: 'c' })];
    expect(diffRowIndexes(a, gold)).toEqual([1]);
    expect(diffRowIndexes(a, [v({ text: 'a' }), v({ text: 'b', icon: 5 }), v({ text: 'c' })])).toEqual([1]);
  });

  it('行数不同 = rebuild(整树重建)', () => {
    expect(diffRowIndexes([v({})], [])).toBe('rebuild');
    expect(diffRowIndexes([], [v({})])).toBe('rebuild');
    expect(diffRowIndexes([v({}), v({})], [v({})])).toBe('rebuild');
  });

  it('hidden 位变化入 diff(横排乘色切换)', () => {
    const off = [false, false, false, false], on = [false, false, false, true];
    const a = rowViewsOf([row({ icon: 3, hideIndex: 3 })], off, true);
    const b = rowViewsOf([row({ icon: 3, hideIndex: 3 })], on, true);
    expect(diffRowIndexes(a, b)).toEqual([0]);
  });
});

describe('infoLayout/rowTopOf/invIconXY/iconTopInRow(画布几何直译)', () => {
  it('pitch 22(矮屏 20)/X=W-280/ty=Y+74+48+pitch*i(+261 大地图)', () => {
    expect(infoLayout(1920, 1080, false)).toEqual({ pitch: 22, X: 1640, baseTy: 90 });
    expect(infoLayout(1920, 1080, true).baseTy).toBe(90 + 261);
    expect(infoLayout(800, 640, false).pitch).toBe(20);
    expect(infoLayout(800, 650, false).pitch).toBe(22);
  });

  it('rowTopOf = ty - pitch/2(行盒中心=文本中线)', () => {
    const layout = infoLayout(1920, 1080, false);
    expect(rowTopOf(layout, 0)).toBe(90 - 11);
    expect(rowTopOf(layout, 3)).toBe(90 + 22 * 3 - 11);
  });

  it('invIconXY = X+20k-10 / 82(+261)(Main.cs:46681 + 2026-09-02 上移)', () => {
    expect(invIconXY(1920, false, 0)).toEqual({ x: 1640 - 10, y: 82 });
    expect(invIconXY(1920, false, 5)).toEqual({ x: 1640 + 90, y: 82 });
    expect(invIconXY(1920, true, 0).y).toBe(82 + 261);
  });

  it('iconTopInRow:图标中心=字形盒中心+2 低偏;量测不可用回退 锚-3', () => {
    // pitch 22: iconTop = 11 - inkHalf - 5 → iconCenter = top+7 = 13 - inkHalf = ty(11) - inkHalf + 2
    expect(iconTopInRow(22, 0)).toBe(6);
    expect(iconTopInRow(22, 3)).toBe(3);
    expect(iconTopInRow(22, null)).toBe(8);   // = ty - 3 - rowTop(11) 画布回退同式
    expect(iconTopInRow(20, 0)).toBe(5);
  });
});

describe('挂载接线结构锁(Renderer/InfoAccsLayer;旗缺省关=canvas 旧路径零变化)', () => {
  const rsrc = read('src/render/Renderer.ts');
  const lsrc = read('src/render/InfoAccsLayer.ts');
  const dsrc = read('src/render/InfoAccsDOM.ts');

  it('drawInfoAccs 分派:DOM 支(gate=旗开且面板关且全图关)/canvas 支双留存', () => {
    const s = rsrc.indexOf('const drawInfoAccs = () => {');
    const e = rsrc.indexOf('if (quickPanelsOpen) drawInfoAccs();', s);
    expect(s).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(s);
    const body = rsrc.slice(s, e);
    // DOM 支门:灰度旗 + 时间/天气面板(面板叠信息之上层序保序)+全屏地图(DOM 恒
    // 在画布之上,开图必须收起)
    expect(body).toContain('infoDomEnabled() && !quickPanelsOpen && !this.fullMap.open');
    expect(body).toContain('this.infoAccDom.update(');
    // canvas 旧路径逐字节保留(旗关/回退帧)
    expect(body).toContain('this.infoAccs.draw(ctx, viewW, viewH, this.infoAccCtx');
    expect(body).toContain('this.infoAccDom?.hide()');
  });

  it('DOM 层挂载态回写 hitTest 委托源 + dispose 同链摘除(退世界零残影)', () => {
    expect(rsrc).toContain('this.infoAccs.dom = this.infoAccDom;');
    const s = rsrc.indexOf('  dispose(): void {', rsrc.indexOf('export class Renderer'));
    const body = rsrc.slice(s, rsrc.indexOf('\n  }\n', s));
    expect(body).toContain('this.infoAccDom?.dispose()');
    expect(body).toContain('this.infoAccs.dom = null;');
  });

  it('InfoAccsLayer.hitTest:DOM active 才委托;iconRects 原路径保留(Game 调用点零改动)', () => {
    const s = lsrc.indexOf('  hitTest(mx: number, my: number): number {');
    const body = lsrc.slice(s, lsrc.indexOf('\n  }\n', s));
    expect(body).toContain('if (this.dom?.active) return this.dom.hoverRow();');
    expect(body).toContain('for (const r of this.state.iconRects)');
  });

  it('hiddenIcon 烘焙体抽单源 bakeHiddenIconCopy(canvas 逻辑零漂移,DOM 复用)', () => {
    expect(lsrc).toContain('export function bakeHiddenIconCopy(');
    const s = lsrc.indexOf('private hiddenIcon(tex:');
    const body = lsrc.slice(s, lsrc.indexOf('\n  }\n', s));
    expect(body).toContain('bakeHiddenIconCopy(tex)');
    expect(body).not.toContain("globalCompositeOperation = 'multiply'");   // 体已外移
  });

  it('InfoAccsDOM:数据装配 1:1 直用 + 状态发布 + DOM 悬停 + 旗缺省关', () => {
    expect(dsrc).toContain('buildInfoAccRows(infoCtx, hidden, inventoryOpen)');
    expect(dsrc).toContain("this._layer.state = { rows, iconRects: [], inventoryOpen }");
    expect(dsrc).toContain("'mouseenter'");
    expect(dsrc).toContain("'mouseleave'");
    expect(dsrc).toContain(".get('infodom') === '1'");
    expect(dsrc).toContain('bakeHiddenIconCopy(tex)');
    // 悬停面 = 图标盒(pointer-events:auto 只在 ic;文本 span 不接指针)
    expect(dsrc).toContain('pointer-events:auto');
  });

  it('★红队 F1 修(懒加载落地沿):src 仍缺行每帧重查(内存查表)+tex.img 身份换图钩', () => {
    const s = dsrc.indexOf('private refreshIconSources(');
    expect(s).toBeGreaterThan(0);
    const body = dsrc.slice(s, dsrc.indexOf('\n  /** 图标 dataURL', s));
    // ①落地沿补申请:src 账仍缺(appliedIc==null)不入 (icon,hidden) 短路闸——
    //   否则懒加载落地后恒不变行永不补图=整列空白+悬停域死(翻转实验坐实)
    expect(body).toContain('this._appliedIc[i] == null');
    // ②remaster/资源包换图失效钩:tex.img 身份与账不符 → 重烤(身份键缓存自愈)
    expect(body).toContain('img !== this._appliedImg[i]');
    // 每帧重查面 = UITextures.get 内存查表(画布版每帧 iconTex(n) 同源同价)
    expect(body).toContain('UITextures.get(`UI_InfoIcon_${v.icon}`)');
  });

  it('infoDomEnabled 缺省 false(node 无 location;query/runtime 双源)', () => {
    expect(infoDomEnabled()).toBe(false);
  });
});
