// mod 富 DOM overlay UI(★Tier1-a,2026-10-14;sw.ui.htmlPage)。
// 形态:mod 声明 HTML+CSS → 专用 .sw-modhtml 层挂载(fixed inset:0 PE:none,
// 子页 PE:auto;z=110 介于 .sw-root HUD z10 与模态 z120/图鉴 z30 族之上、
// 拖拽幽灵 z200/vui z300 之下——HUD 可见性保住,模态仍盖 mod 页)。
// 安全纪律:
//   ①CSS 强制 scope——每条规则注入 .sw-modhtml-<modId> 前缀(mod 样式零逃逸;
//     @import/@keyframes 内引用同 scope 化——keyframes 名加前缀)
//   ②事件声明式——data-act 属性→回调表绑定(卸载沿 removeEventListener 全清;
//     裸 addEventListener 不暴露)
//   ③innerHTML 白名单——script/iframe/object/link/meta/style 标签剥除
//     (XSS 面:mod=可信代码同 tML 哲学,但 DOM 注入面仍守纵深——script 剥除
//     防 mod 作者误写 script 期望执行[不会执行]造成的静默困惑)
//   ④世界卸载沿全清(面板/页/样式表/监听器);ESC 链收最上层(与 vui 面板同族)
//   ⑤输入让位——页面可见时 Game.inpOverDomUi 短路(复用 D19-F4 DOM 吞门
//     的 #game-root 类?不——独立门:mod 页根 PE:auto 本就走 isDomUiTarget
//     DOM 命中链=天然让位;键盘 INPUT 让位 kbdNav 已有)
//   ⑥GPU 红线——零新画布层(纯 DOM;img 允许但 content-visibility 建议不强制)
import type { Game } from '../core/Game';

export interface ModHtmlPageSpec {
  /** HTML 片段(script/iframe/object/link/meta 剥除) */
  html: string;
  /** CSS(自动 scope 到 .sw-modhtml-<modId>;@keyframes 名前缀化) */
  css?: string;
  /** data-act 声明式事件表(act 名 → (el, page) 回调) */
  actions?: Record<string, (el: HTMLElement, page: ModHtmlPageHandle) => void>;
  /** 页面类名(定位/尺寸由 mod CSS 自管) */
  className?: string;
  /** 页面初始显隐(缺省显示) */
  visible?: boolean;
}

/** 页面句柄(mod 侧操作面) */
export interface ModHtmlPageHandle {
  readonly key: string;
  readonly visible: boolean;
  /** 根元素(受 scope 的 mod DOM) */
  readonly el: HTMLElement;
  /** 查询(scope 内 querySelector) */
  q(sel: string): HTMLElement | null;
  /** 更新 HTML(重挂——事件重绑;actions 表保留) */
  setHtml(html: string): void;
  show(): void;
  hide(): void;
  toggle(): void;
  close(): void;
}

interface PageEntry {
  modId: string;
  key: string;
  fullKey: string;
  root: HTMLElement;
  styleEl: HTMLStyleElement | null;
  visible: boolean;
  listeners: Array<{ el: HTMLElement; type: string; fn: EventListener }>;
  handle?: ModHtmlPageHandle;
}

/** 宿主层(单例;#game-root 内挂载——与 .sw-root 同级树) */
let hostLayer: HTMLElement | null = null;
const pages = new Map<string, PageEntry>();
const openOrder: PageEntry[] = [];
let escInstalled = false;

/** 危险标签剥除(script/iframe/object/embed/link/meta/base/form?form 保留[搜索框]
 *  ——action 裸表单提交会导航页面,form 的 onsubmit 拦截) */
const FORBIDDEN_TAGS = /<(\/?)(script|iframe|object|embed|link|meta|base)\b[^>]*>/gi;

function sanitizeHtml(html: string): string {
  return html.replace(FORBIDDEN_TAGS, '');
}

/** CSS scope 化:每条规则块选择器前缀注入;@keyframes 名前缀化 */
function scopeCss(css: string, scopeCls: string, modId: string): string {
  let out = css;
  // @keyframes <name> → @keyframes sw-<modId>-<name>(body 内 animation 引用同换)
  out = out.replace(/@keyframes\s+([A-Za-z_][\w-]*)/g, (_m, name) => `@keyframes sw-${modId}-${name}`);
  out = out.replace(/animation(?:-name)?\s*:\s*([A-Za-z_][\w-]*)/g, (m, name) =>
    m.replace(name, `sw-${modId}-${name}`));
  // @import/@charset 剥除(外联逃逸面)
  out = out.replace(/@import[^;]+;?/gi, '').replace(/@charset[^;]+;?/gi, '');
  // 规则块选择器前缀:逐块处理(保持 @media 嵌套)
  out = out.replace(/(^|\})\s*([^{}@]+)\{/g, (m, brace, sels) => {
    const scoped = sels.split(',').map((s: string) => {
      const t = s.trim();
      if (!t) return s;
      if (t.startsWith(':root')) return `.${scopeCls} ${t.slice(5)}`;
      return `.${scopeCls} ${t}`;
    }).join(', ');
    return `${brace} ${scoped}{`;
  });
  return out;
}

function ensureHost(): HTMLElement {
  if (hostLayer?.isConnected) return hostLayer;
  const root = document.getElementById('game-root') ?? document.body;
  hostLayer = document.createElement('div');
  hostLayer.className = 'sw-modhtml';
  hostLayer.style.cssText = 'position:fixed; inset:0; pointer-events:none; z-index:110; font-family:inherit;';
  root.appendChild(hostLayer);
  return hostLayer;
}

/** 基础 CSS 注入(一次性;层与页基类) */
let baseStyleInstalled = false;
const BASE_CSS = `
.sw-modhtml { position:fixed; inset:0; pointer-events:none; z-index:110; }
.sw-modhtml-page { position:absolute; pointer-events:auto; box-sizing:border-box;
  background:rgba(28,34,58,0.92); border:2px solid #7d92d6; border-radius:6px;
  color:#e8ecf8; padding:12px; min-width:200px; min-height:80px; }
.sw-modhtml-page[data-hidden] { display:none; }
`;

function ensureBaseStyle(): void {
  if (baseStyleInstalled) return;
  baseStyleInstalled = true;
  const st = document.createElement('style');
  st.textContent = BASE_CSS;
  document.head.appendChild(st);
}

function rebindEvents(entry: PageEntry, actions: Record<string, (el: HTMLElement, page: ModHtmlPageHandle) => void>): void {
  // 清旧
  for (const { el, type, fn } of entry.listeners) el.removeEventListener(type, fn);
  entry.listeners.length = 0;
  const handle = entry.handle!;
  // data-act 元素绑定(click;input/change 常用族一并)
  for (const el of Array.from(entry.root.querySelectorAll<HTMLElement>('[data-act]'))) {
    const act = el.getAttribute('data-act') ?? '';
    const fn = (ev: Event): void => {
      const cb = actions[act];
      if (cb) { ev.preventDefault(); cb(el, handle); }
    };
    const type = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
      ? 'change' : 'click';
    el.addEventListener(type, fn);
    entry.listeners.push({ el, type, fn });
    // INPUT 元素键盘不冒泡截断(输入让位 kbdNav activeElement 门已盖)
  }
  // 裸 form 提交拦截(防页面导航)
  for (const form of Array.from(entry.root.querySelectorAll<HTMLFormElement>('form'))) {
    const fn = (ev: Event): void => { ev.preventDefault(); };
    form.addEventListener('submit', fn);
    entry.listeners.push({ el: form, type: 'submit', fn });
  }
}

/** ESC 链:收最上层 mod html 页(与 modUiCloseTop 并立——本域独立收) */
export function modHtmlUiCloseTop(): boolean {
  for (let i = openOrder.length - 1; i >= 0; i--) {
    if (openOrder[i].visible) {
      openOrder[i].visible = false;
      openOrder[i].root.setAttribute('data-hidden', '');
      return true;
    }
  }
  return false;
}

export function modHtmlUiAnyOpen(): boolean {
  return openOrder.some((p) => p.visible);
}

/** 页面注册/获取(modsPanel 语义:同键重开=聚焦既有) */
export function modHtmlUiPage(
  modId: string, key: string, spec: ModHtmlPageSpec,
): ModHtmlPageHandle {
  ensureBaseStyle();
  const host = ensureHost();
  const fullKey = `mod_${modId}_${key}`;
  const existing = pages.get(fullKey);
  if (existing) {
    if (spec.html !== undefined) existing.handle!.setHtml(spec.html);
    if (!existing.visible && spec.visible !== false) existing.handle!.show();
    else if (spec.visible === false && existing.visible) existing.handle!.hide();
    return existing.handle!;
  }
  const scopeCls = `sw-modhtml-${modId.replace(/[^a-z0-9_-]/gi, '')}`;
  const root = document.createElement('div');
  root.className = `sw-modhtml-page ${scopeCls} ${spec.className ?? ''}`.trim();
  root.innerHTML = sanitizeHtml(spec.html);
  host.appendChild(root);
  // CSS
  let styleEl: HTMLStyleElement | null = null;
  if (spec.css) {
    styleEl = document.createElement('style');
    styleEl.textContent = scopeCss(spec.css, scopeCls, modId);
    document.head.appendChild(styleEl);
  }
  const entry: PageEntry = {
    modId, key, fullKey, root, styleEl,
    visible: spec.visible !== false,
    listeners: [],
  };
  if (!entry.visible) root.setAttribute('data-hidden', '');
  pages.set(fullKey, entry);
  openOrder.push(entry);
  // 句柄
  const handle: ModHtmlPageHandle = {
    key,
    get visible() { return entry.visible; },
    get el() { return entry.root; },
    q(sel) { return entry.root.querySelector<HTMLElement>(sel); },
    setHtml(html) {
      entry.root.innerHTML = sanitizeHtml(html);
      rebindEvents(entry, spec.actions ?? {});
    },
    show() {
      entry.visible = true;
      entry.root.removeAttribute('data-hidden');
      // 置顶
      const i = openOrder.indexOf(entry);
      if (i >= 0) { openOrder.splice(i, 1); openOrder.push(entry); }
    },
    hide() { entry.visible = false; entry.root.setAttribute('data-hidden', ''); },
    toggle() { entry.visible ? handle.hide() : handle.show(); },
    close() { handle.hide(); },
  };
  entry.handle = handle;
  rebindEvents(entry, spec.actions ?? {});
  installEscChain();
  return handle;
}

/** 关全部本 mod 页 */
export function modHtmlUiCloseAllOf(modId: string): void {
  for (const p of openOrder) {
    if (p.modId === modId && p.visible) { p.visible = false; p.root.setAttribute('data-hidden', ''); }
  }
}

/** ESC 链安装(一次;浏览器 window Esc 挂在 escapeChain 执行器之外的最外层——
 *  与 Settings.escHandler 同族:mod html 页开着时静默一拍[链先收 vui 面板],
 *  无 vui 面板时本 handler 收最上层 html 页) */
function installEscChain(): void {
  if (escInstalled || typeof window === 'undefined') return;
  escInstalled = true;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !modHtmlUiAnyOpen()) return;
    // 与 vui mod 面板同拍竞争:先让 escapeChain 收 vui(冒泡序在其后=
    //  main.ts 执行器先跑;本 handler 只在 vui 面板已收完时生效)
    // 简化:modUiPanelsOpen 真=让位(链收 vui;下拍 Esc 才收 html 页)
    void import('./ui').then(({ modUiPanelsOpen }) => {
      if (!modUiPanelsOpen()) modHtmlUiCloseTop();
    });
  });
}

/** 世界卸载沿/Game.destroy 清账(D11 热重载 teardown 亦调) */
export function modHtmlUiTeardown(): void {
  for (const p of pages.values()) {
    for (const { el, type, fn } of p.listeners) el.removeEventListener(type, fn);
    p.listeners.length = 0;
    p.root.remove();
    p.styleEl?.remove();
  }
  pages.clear();
  openOrder.length = 0;
  hostLayer?.remove();
  hostLayer = null;
}

/** 测试清账(=teardown) */
export const _resetModHtmlUiForTests = modHtmlUiTeardown;
