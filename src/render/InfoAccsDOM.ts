// 信息饰品列 DOM 渲染层(★信息栏 DOM 化 2026-09-19;动机:Chrome trace 实测
// InfoAccsLayer.draw canvas 逐帧绘制 ~12ms/帧,DOM 化后逐帧成本坍缩为字符串 diff)。
//
// 【灰度旗】缺省关:会话旗 `?infodom=1` 显式开启(canvas 旧路径完整保留,
// Renderer.drawInfoAccs 闭包内分派;flag 关 = 任何中途态线上无感,与背包布局
// flag 同款灰度纪律)。运行时翻面口 `window.__swInfoDom.set(v)`(探针 A/B 同
// 会话对拍用;生产代码禁调,同 __swPerfFlags 惯例)。
//
// 【分工】数据装配层 buildInfoAccRows(stats/InfoAccs.ts,原版 DrawInfoAccs
// Main.cs:46180-46539 行集 1:1 对齐面)零改动直用;本层只把呈现从 ctx 换 DOM:
//   · 几何 = InfoAccsLayer.draw 同式直译:X=W-280 / Y=-32(+261 小地图开) /
//     pitch 22(矮屏 20) / ty=Y+74+48+pitch*i / 图标 14×14 / 悬停框 18×18@-(2,2) /
//     215px 钳制 scaleX + scaleX<0.58 缩 Y(测宽同源 = CANVAS_MOUSETEXT_FONT
//     measureText,画布版逐字节同数);
//   · 文本 = Fusion Pixel 14px(CANVAS_MOUSETEXT_FONT 同串)+四向 ±2 text-shadow
//     描边(vanilla DrawBorderStringFourWay Utils.cs:2633 ±2 字体像素环);
//     gold #FFE745 / grayed #646464 / normal #e8e4f0 与画布版同值;
//     dim = span opacity 0.34(画布 globalAlpha 同域:只压文本不压图标);
//   · 图标 = atlas 取图裁格烤 dataURL(缓存按 tex.img 身份键控——remaster/
//     资源包换图换 img 对象即自然失效重烤;画布版每帧 iconTex(n) 直查同源);
//     隐藏态乘色复用 bakeHiddenIconCopy(InfoAccsLayer 导出单源,
//     Color(80,80,80,70) XNA Color*Color 同乘 RGBA);
//   · 悬停 = DOM mouseenter/mouseleave(命中域 = 图标 14×14 盒,与画布
//     iconRects 命中同域;行高亮 InfoIcon_13 + 次行 0.34 压暗闭环:Game
//     tickInfoAccsHover → InfoAccsLayer.hitTest(本层 active 时委托 hoverRow)
//     → Renderer 传回 hoveredRow——Game 侧 claim 序/吞点击面零改动);
//   · 逐帧只做字符串 diff:行集(text/color/icon/hidden)逐行比对,无变化零
//     DOM 写;变化行才写 textContent/style;行数或布局面(W/H/大地图/横竖排)
//     变化才整树重建。图标纹理失效钩每帧查(tex.img 身份比对,零写除非换图)。
//
// 【字体渲染差异登记】DOM 文本走浏览器原生灰度 AA(设备分辨率直栅),与画布版
// FX57/FX58 烘焙管线(pixel 档二值 NN / hidpi 档 2× 超采样盒滤波)不同相;
// 且画布版后备=CSS 全尺寸后备逐帧绘制再由元素 pixelated 拉伸,DOM 版无此站。
// 观感差异(灰度软边 vs 烘焙硬边)由用户对拍截图自判——本层不做仿真。
import { buildInfoAccRows, type InfoAccCtx, type InfoAccRow } from '../stats/InfoAccs';
import { CANVAS_MOUSETEXT_FONT } from '../vui/draw/PixelText';
import { UITextures } from '../vui/assets/UITextures';
import { bakeHiddenIconCopy } from './InfoAccsLayer';
import type { InfoAccsLayer } from './InfoAccsLayer';

// ---- 会话旗(?infodom=1;缺省关 = canvas 逐帧绘制路径,逐字节保留) ----

let _infoDomRuntime = false;
const _INFO_DOM_QUERY = (() => {
  try {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('infodom') === '1';
  } catch { return false; }
})();

/** 本帧信息列是否走 DOM 层(Renderer.drawInfoAccs 分派读点) */
export function infoDomEnabled(): boolean {
  return _INFO_DOM_QUERY || _infoDomRuntime;
}

/** 探针/对拍翻面口(生产代码禁调——生产只读 URLSearchParams 一次) */
export function infoDomSetRuntime(v: boolean): void {
  _infoDomRuntime = v;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __swInfoDom?: { get(): boolean; set(v: boolean): void } }).__swInfoDom = {
    get: () => infoDomEnabled(),
    set: (v: boolean) => { _infoDomRuntime = v; },
  };
}

// ---- 纯函数面(可单测):行视图 / diff / 几何 ----

/** 单行呈现态(diff 域;text/color/icon/hidden 四元组) */
export interface InfoRowView {
  /** 行文本(已本地化,= InfoAccRow.text) */
  text: string;
  /** 文本色:金 #FFE745 / 降灰 #646464 / 常规 #e8e4f0(画布版同值) */
  color: string;
  /** 图标序(0-12,= InfoAccRow.icon) */
  icon: number;
  /** 隐藏态乘色(仅背包横排会出现 true——纵排隐藏行本就不入行集) */
  hidden: boolean;
}

/** 行集 → 呈现视图(色映射与画布 draw 同式:r.gold ? '#FFE745' : r.grayed ? '#646464' : '#e8e4f0') */
export function rowViewsOf(rows: InfoAccRow[], hidden: boolean[], inventoryOpen: boolean): InfoRowView[] {
  return rows.map((r) => ({
    text: r.text,
    color: r.gold ? '#FFE745' : r.grayed ? '#646464' : '#e8e4f0',
    icon: r.icon,
    hidden: inventoryOpen && !!hidden[r.hideIndex],
  }));
}

/** 逐行 diff:返回需重写的行下标;行数不同 = 'rebuild'(整树重建,挂载/横竖排切换才走) */
export function diffRowIndexes(prev: InfoRowView[], next: InfoRowView[]): number[] | 'rebuild' {
  if (prev.length !== next.length) return 'rebuild';
  const out: number[] = [];
  for (let i = 0; i < next.length; i++) {
    const a = prev[i], b = next[i];
    if (a.text !== b.text || a.color !== b.color || a.icon !== b.icon || a.hidden !== b.hidden) out.push(i);
  }
  return out;
}

/** 纵排几何(InfoAccsLayer.draw 直译:GetInfoAccIconPosition Main.cs:46668-46710)。
 *  pitch 22(矮屏 20 :46534);X=W-280;ty = Y+74+48+pitch*i(Y=-32+261 大地图偏移) */
export function infoLayout(canvasW: number, canvasH: number, bigMapOpen: boolean): {
  pitch: number; X: number; baseTy: number;
} {
  const pitch = canvasH < 650 ? 20 : 22;
  const X = canvasW - 280;
  const baseTy = -32 + (bigMapOpen ? 261 : 0) + 74 + 48;
  return { pitch, X, baseTy };
}

/** 行 i 的行盒顶 = ty - pitch/2(文本中线 ty 即行盒垂直中心) */
export function rowTopOf(layout: { pitch: number; baseTy: number }, i: number): number {
  return layout.baseTy + layout.pitch * i - layout.pitch / 2;
}

/** 背包横排图标位(Main.cs:46681 直译:X=W-280+20*k-10,Y=94;2026-09-02 上移 82) */
export function invIconXY(canvasW: number, bigMapOpen: boolean, k: number): { x: number; y: number } {
  return { x: canvasW - 280 + 20 * k - 10, y: 82 + (bigMapOpen ? 261 : 0) };
}

/** 行盒内图标顶(iy 直译):inkHalf=(asc-desc)/2 = 14px 字形墨盒半高,
 *  图标中心 = 字形盒中心 +2px 低偏(原版图标顶=文本顶+4 的观感等效);
 *  墨盒量测不可用回退 锚-3(= pitch/2 - 3,画布版 `iy = ty-3` 同式) */
export function iconTopInRow(pitch: number, inkHalf: number | null): number {
  return inkHalf == null ? pitch / 2 - 3 : pitch / 2 - inkHalf - 5;
}

// ---- DOM 层本体 ----

/** 四向描边(vanilla DrawBorderStringFourWay ±2 字体像素环;画布旧直绘回退支 ±2 同环) */
const TEXT_SHADOW = '2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000';
/** 行宽钳制(Main.cs:46594-46639 直译):>215 缩 X;<0.58 再缩 Y */
const CLAMP_W = 215;

export class InfoAccsDOM {
  /** 挂载根(fixed 全屏 0×0 定位锚;子行绝对定位。挂 body 层,z 5 = 主画布之上、
   *  .sw-root(z10) DOM UI 之下——tooltip/背包面板恒盖信息列) */
  readonly el: HTMLElement;
  private readonly _layer: InfoAccsLayer;
  /** 本层是否活(最近一次 update 成功;InfoAccsLayer.hitTest 委托门) */
  private _active = false;
  private _displayHidden = true;
  /** DOM 悬停行(mouseenter/leave 维护;-1 无)——hitTest 委托读点 */
  private _domHover = -1;
  /** 布局签名(横竖排|W|H|大地图)——变才整树重建 */
  private _layoutKey: string | null = null;
  private _layoutCanvasW = 0;
  private _layoutBigMap = false;
  /** 已应用的行视图(= 上次写入的呈现态;diff 基线) */
  private _views: InfoRowView[] = [];
  /** 已应用的行内图标顶(行盒局部 px;随文本墨盒变化) */
  private _iconTops: number[] = [];
  private _rowEls: HTMLDivElement[] = [];
  private _icEls: HTMLImageElement[] = [];
  private _hlEls: HTMLImageElement[] = [];
  private _txEls: Array<HTMLSpanElement | null> = [];
  /** 已应用的图标序/乘色/tex.img 身份/src 账(refreshIconSources 比对,免同值重写 src) */
  private readonly _appliedIcon: Array<number> = [];
  private readonly _appliedHidden: Array<boolean> = [];
  private readonly _appliedImg: Array<object | null> = [];
  private readonly _appliedIc: Array<string | null> = [];
  private readonly _appliedHl: Array<string | null> = [];
  /** 悬停高亮/压暗当前应用行(diff 增量写) */
  private _hlRow = -1;
  private _dimRow = -1;
  /** 图标 dataURL 缓存:tex.img 身份 → {n,hidden} → url(换图=换 img 对象=自然失效) */
  private readonly _iconUrls = new Map<object, Map<string, string>>();
  /** 测宽/墨盒 scratch(与画布版同源 measureText;懒建,node 导入安全) */
  private _scratch: CanvasRenderingContext2D | null = null;

  constructor(layer: InfoAccsLayer) {
    this._layer = layer;
    this.el = document.createElement('div');
    this.el.className = 'sw-infoaccs';
    this.el.style.cssText =
      'position:fixed; left:0; top:0; width:0; height:0; pointer-events:none;' +
      'z-index:5; user-select:none; display:none;';
  }

  /** 挂载(dispose 前幂等)。宿主 = document.body(fixed 定位即视口坐标) */
  mount(): void {
    if (this.el.parentElement) return;
    document.body.appendChild(this.el);
  }

  dispose(): void {
    this.el.remove();
    this._rowEls = []; this._icEls = []; this._hlEls = []; this._txEls = [];
    this._iconTops = []; this._views = [];
    this._appliedIcon.length = 0; this._appliedHidden.length = 0;
    this._appliedImg.length = 0;
    this._appliedIc.length = 0; this._appliedHl.length = 0;
    this._iconUrls.clear();
    this._active = false;
    this._domHover = -1;
    this._hlRow = -1; this._dimRow = -1;
    this._layoutKey = null;
    this._displayHidden = true;
  }

  /** 本层是否活(最近一次 update 成功且未收起;hitTest 委托门——旗关回退判据) */
  get active(): boolean {
    return this._active;
  }

  /** DOM 悬停行(InfoAccsLayer.hitTest 在本层 active 时委托此读点;-1 无) */
  hoverRow(): number {
    return this._active ? this._domHover : -1;
  }

  /**
   * 逐帧更新(Renderer.drawInfoAccs 闭包旗开时调用;数据装配 buildInfoAccRows
   * 与画布版同源同参)。只对 diff 行/悬停增量做 DOM 写。
   */
  update(
    canvasW: number, canvasH: number,
    infoCtx: InfoAccCtx,
    hidden: boolean[],
    inventoryOpen: boolean,
    bigMapOpen: boolean,
    hoveredRow: number,
    mouseX: number, mouseY: number,
  ): void {
    // 数据装配(原版 1:1 面,与画布 draw 逐字节同参)
    const rows = buildInfoAccRows(infoCtx, hidden, inventoryOpen);
    // 发布交互域(Game.tickInfoAccsHover 消费 rows/hideIndex/inventoryOpen:
    // 行标签 claim + 吞点击 + hideInfo 翻转——iconRects 空表,命中走 DOM 悬停)
    this._layer.state = { rows, iconRects: [], inventoryOpen };
    const views = rowViewsOf(rows, hidden, inventoryOpen);
    if (!views.length) {
      this.hide();
      return;
    }
    const layout = infoLayout(canvasW, canvasH, bigMapOpen);
    const layoutKey = `${inventoryOpen ? 'h' : 'v'}|${canvasW}|${canvasH}|${bigMapOpen ? 1 : 0}`;
    if (layoutKey !== this._layoutKey || views.length !== this._views.length) {
      this._layoutCanvasW = canvasW;
      this._layoutBigMap = bigMapOpen;
      this.rebuild(layout, views, inventoryOpen);
      this._layoutKey = layoutKey;
      // 整树重建后悬停可能丢(元素换新,stationary cursor 不必触发边界事件):
      // 一次性 elementFromPoint 复探(仅重建帧,零常态成本)
      this.reprobeHover(mouseX, mouseY);
      this._hlRow = -1; this._dimRow = -1;   // 强制悬停面全量重贴
    }
    const diff = diffRowIndexes(this._views, views);
    if (diff !== 'rebuild') {
      for (const i of diff) this.applyRow(i, views[i], layout);
      this._views = views;
    }
    this.applyHover(hoveredRow, views.length, inventoryOpen);
    this.refreshIconSources(views);
    this.show();
    this._active = true;
  }

  /** 收起(canShow 不满足/旗关回退/全屏地图/零行)。悬停随层清零 */
  hide(): void {
    if (!this._displayHidden) {
      this.el.style.display = 'none';
      this._displayHidden = true;
    }
    this._active = false;
    this._domHover = -1;
    this._hlRow = -1; this._dimRow = -1;
  }

  private show(): void {
    if (this._displayHidden) {
      this.el.style.display = 'block';
      this._displayHidden = false;
    }
  }

  // ---- 整树重建(挂载首帧/行数变化/横竖排或几何面切换;非逐帧路径) ----

  private rebuild(layout: { pitch: number; X: number; baseTy: number }, views: InfoRowView[], inventoryOpen: boolean): void {
    this.el.replaceChildren();
    this._rowEls = []; this._icEls = []; this._hlEls = []; this._txEls = [];
    this._iconTops = [];
    this._appliedIcon.length = 0; this._appliedHidden.length = 0;
    this._appliedImg.length = 0;
    this._appliedIc.length = 0; this._appliedHl.length = 0;
    for (let i = 0; i < views.length; i++) {
      const row = document.createElement('div');
      row.className = 'sw-inf-row';
      row.dataset.row = String(i);
      row.style.cssText = 'position:absolute; pointer-events:none; contain:layout style;';
      const ic = document.createElement('img');
      ic.style.cssText =
        'position:absolute; left:0; top:0; width:14px; height:14px;' +
        'pointer-events:auto; image-rendering:pixelated; display:none;';
      ic.draggable = false;
      // 悬停面 = 图标 14×14 盒(与画布 iconRects 命中同域;文本 span 不接指针)
      ic.addEventListener('mouseenter', () => { this._domHover = i; });
      ic.addEventListener('mouseleave', () => { if (this._domHover === i) this._domHover = -1; });
      const hl = document.createElement('img');
      hl.style.cssText =
        'position:absolute; left:-2px; top:-2px; width:18px; height:18px;' +
        'pointer-events:none; image-rendering:pixelated; display:none;';
      hl.draggable = false;
      row.appendChild(ic);
      row.appendChild(hl);
      let tx: HTMLSpanElement | null = null;
      if (!inventoryOpen) {
        // 纵排:行盒高 = pitch,顶 = ty-pitch/2(文本中线 ty=行盒垂直中心)
        tx = document.createElement('span');
        tx.style.cssText =
          `position:absolute; left:20px; top:0; height:${layout.pitch}px;` +
          `line-height:${layout.pitch}px; font:${CANVAS_MOUSETEXT_FONT};` +
          'color:#e8e4f0; text-shadow:' + TEXT_SHADOW + '; white-space:pre;' +
          `transform-origin:0 ${(layout.pitch / 2).toFixed(2)}px;` +
          'opacity:1; pointer-events:none;';
        row.appendChild(tx);
        row.style.width = '266px';
        row.style.height = `${layout.pitch}px`;
        row.style.left = `${layout.X}px`;
        row.style.top = `${rowTopOf(layout, i)}px`;
      } else {
        // 背包横排:只有图标(Main.cs:46681;行盒=图标 14×14 盒=画布命中同域)
        const xy = invIconXY(this._layoutCanvasW, this._layoutBigMap, i);
        row.style.width = '14px';
        row.style.height = '14px';
        row.style.left = `${xy.x}px`;
        row.style.top = `${xy.y}px`;
      }
      this.el.appendChild(row);
      this._rowEls.push(row);
      this._icEls.push(ic);
      this._hlEls.push(hl);
      this._txEls.push(tx);
      this.applyRow(i, views[i], layout);
    }
    this._views = views.slice();
  }

  // ---- 单行应用(diff 命中行;只写变化面;图标 src 由 refreshIconSources 统一管) ----

  private applyRow(i: number, view: InfoRowView, layout: { pitch: number }): void {
    const ic = this._icEls[i];
    const hl = this._hlEls[i];
    if (!ic || !hl) return;
    const tx = this._txEls[i];
    if (tx) {
      // 纵排:文本/色/钳制缩放 + 图标纵位(墨盒随文本变)
      if (tx.textContent !== view.text) tx.textContent = view.text;
      if (tx.style.color !== view.color) tx.style.color = view.color;
      const m = this.measure(view.text);
      const tf = m.scaleX < 1
        ? `translateY(${m.dy.toFixed(2)}px) scale(${m.scaleX.toFixed(4)}, ${m.scaleY.toFixed(4)})`
        : `translateY(${m.dy.toFixed(2)}px)`;
      if (tx.style.transform !== tf) tx.style.transform = tf;
      const top = iconTopInRow(layout.pitch, m.inkHalf);
      if (this._iconTops[i] !== top) {
        this._iconTops[i] = top;
        const t = `${top.toFixed(2)}px`;
        ic.style.top = t;
        hl.style.top = `${(top - 2).toFixed(2)}px`;
      }
    } else {
      // 横排:图标 14×14 铺满行盒(位置在 rebuild 定死)
      if (this._iconTops[i] !== 0) {
        this._iconTops[i] = 0;
        ic.style.top = '0px';
        hl.style.top = '-2px';
      }
    }
  }

  // ---- 图标纹理(每帧失效钩:图标序/乘色账比对 + tex.img 身份比对 + 懒加载落地
  //      沿补申请,变化才写 src) ----
  //  ★红队 F1 定谳修(2026-09-19):旧版「(icon,hidden) 变化才调 iconUrl()」——
  //  首帧挂载窗 UI_InfoIcon_* 懒加载未落地(get()=null → src 缺+display:none),
  //  纹理落地后恒不变行永不重查 → 图标整列恒空白+悬停域死(翻转实验坐实:
  //  steady 35s withSrc=0/12,拨一次 Escape 触发 rebuild 才 12/12)。修法:
  //  ①src 仍缺(_appliedIc==null)的行**每帧重查**——重查是 UITextures.get 内存
  //    查表(画布版每帧 iconTex(n) 同源同价),非 DOM 写;落地沿(首次非 null)
  //    才写 src/display,逐帧 diff 纪律不破;
  //  ②tex.img 身份比对入闸(非 null 且与账不符=remaster/资源包换图)——补上
  //    「已载行」的失效钩(身份键缓存自动重烤,与画布版每帧直查同自愈语义)。
  private refreshIconSources(views: InfoRowView[]): void {
    for (let i = 0; i < views.length; i++) {
      const ic = this._icEls[i], hl = this._hlEls[i];
      if (!ic || !hl) continue;
      const v = views[i];
      const tex = UITextures.get(`UI_InfoIcon_${v.icon}`);
      const img = tex ? (tex.img as object) : null;
      if (this._appliedIcon[i] !== v.icon || this._appliedHidden[i] !== v.hidden
        || this._appliedIc[i] == null                       // ①懒加载落地沿补申请
        || (img !== null && img !== this._appliedImg[i])) { // ②换图失效钩
        this._appliedIcon[i] = v.icon;
        this._appliedHidden[i] = v.hidden;
        this._appliedImg[i] = img;
        const url = tex ? this.iconUrlOf(tex, v.icon, v.hidden) : null;
        if (this._appliedIc[i] !== url) {
          this._appliedIc[i] = url;
          if (url) {
            ic.src = url;
            ic.style.display = 'block';
          } else {
            ic.removeAttribute('src');
            ic.style.display = 'none';   // 贴图懒加载窗(画布版 drawIcon !tex 直返同相)
          }
        }
      }
      // 悬停高亮框 InfoIcon_13(画布版悬停叠画同源;URL 全行同源,账比对免重写;
      // 高亮层无 (icon,hidden) 闸,落地沿/换图沿自然自愈)
      const hUrl = this.highlightUrl();
      if (hUrl && this._appliedHl[i] !== hUrl) {
        this._appliedHl[i] = hUrl;
        hl.src = hUrl;
      }
    }
  }

  /** 图标 dataURL(按名取 tex;高亮框 13 用) */
  private iconUrl(n: number, hiddenTint: boolean): string | null {
    const tex = UITextures.get(`UI_InfoIcon_${n}`);
    return tex ? this.iconUrlOf(tex, n, hiddenTint) : null;
  }

  /** 图标 dataURL(裁格烤;hidden=Color(80,80,80,70) 乘色,复用画布版单源烘焙) */
  private iconUrlOf(tex: NonNullable<ReturnType<typeof UITextures.get>>, n: number, hiddenTint: boolean): string | null {
    const img = tex.img as object;
    let byKey = this._iconUrls.get(img);
    const key = `${n}|${hiddenTint ? 1 : 0}`;
    const hit = byKey?.get(key);
    if (hit) return hit;
    let url: string;
    if (hiddenTint) {
      url = bakeHiddenIconCopy(tex).toDataURL();
    } else {
      const cv = document.createElement('canvas');
      cv.width = tex.sw; cv.height = tex.sh;
      const c = cv.getContext('2d', { willReadFrequently: true })!;
      c.imageSmoothingEnabled = false;
      c.drawImage(tex.img as CanvasImageSource, tex.sx, tex.sy, tex.sw, tex.sh, 0, 0, tex.sw, tex.sh);
      url = cv.toDataURL();
    }
    if (!byKey) {
      if (this._iconUrls.size > 32) this._iconUrls.clear();   // 换图残键防膨胀
      byKey = new Map();
      this._iconUrls.set(img, byKey);
    }
    byKey.set(key, url);
    return url;
  }

  private highlightUrl(): string | null {
    // 不做层内 memo:iconUrl 自带 tex.img 身份键缓存(命中=一次 Map 查),
    // remaster/资源包换图换 img 对象 → 身份失配自动重烤(★曾层内缓存 URL,
    // 换图后高亮框停旧纹理=失效钩被旁路)
    return this.iconUrl(13, false);
  }

  // ---- 测宽/墨盒(与画布版同源:CANVAS_MOUSETEXT_FONT measureText) ----

  private measure(text: string): {
    scaleX: number; scaleY: number; inkHalf: number | null; dy: number;
  } {
    if (!this._scratch) {
      const cv = document.createElement('canvas');
      cv.width = 8; cv.height = 8;
      this._scratch = cv.getContext('2d')!;
    }
    const c = this._scratch;
    c.font = CANVAS_MOUSETEXT_FONT;
    const m = c.measureText(text);
    const w = m.width;
    let scaleX = 1;
    if (w > CLAMP_W) scaleX = CLAMP_W / w;
    let scaleY = 1;
    if (scaleX < 0.58) scaleY = 1 - scaleX / 3;
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    const inkHalf = Number.isFinite(asc) && asc > 0 ? (asc - desc) / 2 : null;
    // DOM 行盒基线对齐修正:画布版 'middle' 锚=墨盒中线(bake 反推墨顶 ty-asc),
    // DOM line-height 居中基线在 pitch/2+(fba-fbd)/2 处——translateY 补
    // (fbd-fba)/2·scaleY 使墨盒中线落 ty(=行盒中心);scaleY 项 = 钳制缩放
    // 绕 transform-origin(行盒中心)时平移分量同步缩放,与画布 scale 复合序同相
    const fba = (m as unknown as { fontBoundingBoxAscent?: number }).fontBoundingBoxAscent;
    const fbd = (m as unknown as { fontBoundingBoxDescent?: number }).fontBoundingBoxDescent;
    const dy = Number.isFinite(fba) && Number.isFinite(fbd) && fba! + fbd! > 0
      ? scaleY * (fbd! - fba!) / 2
      : 0;
    return { scaleX, scaleY, inkHalf, dy };
  }

  // ---- 悬停增量(行高亮 InfoIcon_13 + 次行 0.34 压暗;画布版同域只压文本) ----

  private applyHover(hoveredRow: number, rowCount: number, inventoryOpen: boolean): void {
    const hlRow = hoveredRow >= 0 && hoveredRow < rowCount ? hoveredRow : -1;
    const dimRow = !inventoryOpen && hlRow >= 0 && hlRow + 1 < rowCount ? hlRow + 1 : -1;
    if (hlRow !== this._hlRow) {
      if (this._hlRow >= 0) this._hlEls[this._hlRow]?.style.setProperty('display', 'none');
      if (hlRow >= 0) this._hlEls[hlRow]?.style.setProperty('display', 'block');
      this._hlRow = hlRow;
    }
    if (dimRow !== this._dimRow) {
      if (this._dimRow >= 0) this._txEls[this._dimRow]?.style.setProperty('opacity', '1');
      if (dimRow >= 0) this._txEls[dimRow]?.style.setProperty('opacity', '0.34');
      this._dimRow = dimRow;
    }
  }

  /** 整树重建后的悬停复探(stationary cursor 边界事件不重发的兜底;仅重建帧) */
  private reprobeHover(mx: number, my: number): void {
    this._domHover = -1;
    try {
      const t = document.elementFromPoint(mx, my) as HTMLElement | null;
      const rowEl = (t?.closest?.('.sw-inf-row') ?? null) as HTMLElement | null;
      if (rowEl?.dataset?.row != null) this._domHover = Number(rowEl.dataset.row);
    } catch { /* 无布局环境 */ }
  }
}
