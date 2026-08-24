// 资产预载 UI(2026-08-13):右下角悬浮进度徽标 + 单人游戏门槛弹窗。
// 状态源=src/net/AssetCache(SW 消息驱动)。
// ★像素风(用户要求"要泰拉瑞亚风格"):进度条=原版世界创建进度条 1:1
// (UI_WorldGen_Outer_Corrupt 框贴图 + 570×16 槽 #303030 + 腐化紫填充,
// 规格=UIGenProgressBar.ts 常量);面板底=Inventory_Back13 九宫格乘色
// ((33,15,91)×0.685,与 UI.ts 原版像素面板同源);全程方角/硬边框/像素字体,
// 无圆角无渐变。
import { assetCacheState, assetsComplete, assetsCompleteFast, onAssetProgress, warmAllAssets, PHASE_LABEL, type AssetCacheState } from '../net/AssetCache';
import { Lang } from '../i18n/Lang';

/** 原版 packed 色(UIGenProgressBar.ts 同源):corrupt 长条填充 4283888223 */
function packedColor(v: number): string {
  return `rgb(${(v >>> 16) & 255},${(v >>> 8) & 255},${v & 255})`;
}
const BAR_FILL = packedColor(4283888223);   // 腐化紫
const BAR_EMPTY = '#303030';                // 原版空槽色

const CSS = `
.sw-asset-badge, .sw-asset-gate .panel {
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
}
.sw-asset-badge {
  /* 底部居中(2026-08-24 用户要求):左下版本号/右下署名角标已占位,避让;
     与 LoadingSunflower(底 50px)上下错开不叠 */
  position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 40;
  display: flex; align-items: center; gap: 8px;
  background: #141028; border: 2px solid #7d92d6;
  box-shadow: 0 0 0 2px #0a0e1e;
  padding: 6px 12px; color: #e8ecf8; font-size: 13px;
  cursor: pointer; transition: opacity .6s;   /* 可点开下载详情面板(2026-08-19) */
  image-rendering: pixelated;
}
.sw-asset-badge:hover { border-color: #ffd76e; }
.sw-asset-badge .spin {
  width: 12px; height: 12px; border: 2px solid #7d92d6; border-top-color: #ffd76e;
  /* steps(8):8 档跳变旋转 = 像素感(非平滑圆角旋转) */
  animation: sw-asset-spin 0.9s steps(8) infinite;
}
@keyframes sw-asset-spin { to { transform: rotate(360deg); } }
.sw-asset-gate {
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  background: rgba(4,6,14,0.82);
}
.sw-asset-gate .panel {
  width: min(560px, 88vw); text-align: center; color: #e8ecf8;
  background-color: #241a4e;                 /* 九宫格贴图就绪前的兜底 */
  background-size: 100% 100%; image-rendering: pixelated;
  border: 2px solid #7d92d6;
  box-shadow: 0 0 0 2px #0a0e1e, 0 10px 32px rgba(0,0,0,0.7);
  padding: 26px 30px 22px;
}
.sw-asset-title {
  font-size: 18px; letter-spacing: 3px;
  text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000;
}
/* 原版世界创建进度条 1:1(UIGenProgressBar):612×70 Outer 框 + 内槽(20,40,570,16) */
.sw-asset-barwrap { position: relative; width: 100%; aspect-ratio: 612 / 70; margin: 18px auto 6px; }
.sw-asset-barwrap .outer {
  position: absolute; inset: 0;
  background: url('sprites/vanilla-ui/UI_WorldGen_Outer_Corrupt.png') 100% 100% / 100% 100% no-repeat;
  image-rendering: pixelated;
}
.sw-asset-barwrap .slot {
  position: absolute; left: 3.27%; top: 57.1%; width: 93.1%; height: 22.9%;
  background: ${BAR_EMPTY};
}
.sw-asset-barwrap .slot > div { height: 100%; background: ${BAR_FILL}; transition: width .25s steps(6); }
.sw-asset-pct { font-size: 14px; text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000; }
.sw-asset-note { font-size: 12px; color: #9fb0e0; margin-top: 10px;
  text-shadow: 1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000; }
.sw-asset-retry {
  margin-top: 14px; background: #3a2a5a; color: #fff; border: 2px solid #7d92d6;
  box-shadow: 0 0 0 2px #0a0e1e; padding: 8px 26px; cursor: pointer;
  font-family: inherit; font-size: 14px;
}
.sw-asset-retry:hover { background: #4a3a7a; }
/* 下载详情面板(点击徽标打开;同 gate 面板语言) */
.sw-asset-panel {
  position: fixed; right: 14px; bottom: 56px; z-index: 45;
  width: min(460px, 90vw); text-align: center; color: #e8ecf8;
  background-color: #241a4e; background-size: 100% 100%; image-rendering: pixelated;
  border: 2px solid #7d92d6; box-shadow: 0 0 0 2px #0a0e1e, 0 10px 32px rgba(0,0,0,0.7);
  padding: 20px 22px 16px;
}
.sw-asset-panel .sw-asset-mb {
  font-size: 16px; margin-top: 4px;
  text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000;
}
.sw-asset-panel .sw-asset-close {
  margin-top: 12px; background: #3a2a5a; color: #fff; border: 2px solid #7d92d6;
  box-shadow: 0 0 0 2px #0a0e1e; padding: 6px 22px; cursor: pointer;
  font-family: inherit; font-size: 13px;
}
.sw-asset-panel .sw-asset-close:hover { background: #4a3a7a; }
`;

let styleEl: HTMLStyleElement | null = null;
function ensureStyle(): void {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.id = 'sw-asset-style';
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

// ---- 原版像素面板底(Inventory_Back13 九宫格 × (33,15,91)×0.685;UI.ts 同源算法) ----

let panelBg: string | null = null;
let panelBgImg: ImageBitmap | HTMLImageElement | null = null;
function ensurePanelBg(panel: HTMLElement): void {
  if (panelBg) { panel.style.backgroundImage = `url(${panelBg})`; return; }
  if (!panelBgImg && typeof Image !== 'undefined') {
    panelBgImg = new Image();
    panelBgImg.onload = () => {
      try {
        const img = panelBgImg!;
        const t = document.createElement('canvas');
        t.width = img.width; t.height = img.height;
        const tc = t.getContext('2d')!;
        tc.imageSmoothingEnabled = false;
        tc.drawImage(img, 0, 0);
        const d = tc.getImageData(0, 0, t.width, t.height);
        const m = [33 / 255, 15 / 255, 91 / 255, 0.685];
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i] = Math.round(d.data[i] * m[0]);
          d.data[i + 1] = Math.round(d.data[i + 1] * m[1]);
          d.data[i + 2] = Math.round(d.data[i + 2] * m[2]);
          d.data[i + 3] = Math.round(d.data[i + 3] * m[3]);
        }
        tc.putImageData(d, 0, 0);
        // 九宫格拉伸到面板尺寸(52×52 源:角 10 边 10 心 32)
        const W = 560, H = 300, S = t.width;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d')!;
        x.imageSmoothingEnabled = false;
        const e = 10, cw = S - 20;
        x.drawImage(t, 0, 0, e, e, 0, 0, e, e);
        x.drawImage(t, S - e, 0, e, e, W - e, 0, e, e);
        x.drawImage(t, 0, S - e, e, e, 0, H - e, e, e);
        x.drawImage(t, S - e, S - e, e, e, W - e, H - e, e, e);
        x.drawImage(t, e, 0, cw, e, e, 0, W - 20, e);
        x.drawImage(t, e, S - e, cw, e, e, H - e, W - 20, e);
        x.drawImage(t, 0, e, e, cw, 0, e, e, H - 20);
        x.drawImage(t, S - e, e, e, cw, W - e, e, e, H - 20);
        x.drawImage(t, e, e, cw, cw, e, e, W - 20, H - 20);
        panelBg = c.toDataURL();
        document.querySelectorAll('.sw-asset-gate .panel').forEach((el) => {
          (el as HTMLElement).style.backgroundImage = `url(${panelBg})`;
        });
      } catch { /* canvas 污染等异常 → 保持纯色兜底 */ }
    };
    panelBgImg.src = 'sprites/vanilla/Inventory_Back13.png';
  }
}

// ---- 悬浮徽标 ----

let badgeEl: HTMLElement | null = null;
let badgeUnsub: (() => void) | null = null;
let badgeFading = false;
let badgePending = false;

function fmtPct(s: AssetCacheState): string {
  // zip 模式(有字节账)百分比也按字节——与条宽/MB 文案同源,防三处数字跳变
  if (s.bytesTotal > 0) return `${Math.floor(Math.min(1, s.bytesDone / s.bytesTotal) * 100)}%`;
  return s.total > 0 ? `${Math.floor((s.done / s.total) * 100)}%` : '…';
}
const mb = (b: number): string => (b / 1048576).toFixed(1);
/** 进度主文案:zip 模式(有字节账)用 MB,legacy 回退文件数 */
function fmtProgress(s: AssetCacheState): string {
  return s.bytesTotal > 0
    ? `${mb(s.bytesDone)} MB / ${mb(s.bytesTotal)} MB`
    : `${s.done}/${s.total}`;
}
function phaseText(s: AssetCacheState): string {
  // 相位文案 = Mods.SandboxWorld.AssetDl.*(自制资产管线,原版无对应键)
  if (s.phase === 'done') return Lang.text('Mods.SandboxWorld.AssetDl.Done');
  if (s.phase === 'idle') return Lang.text('Mods.SandboxWorld.AssetDl.Ready');
  return Lang.text(`Mods.SandboxWorld.AssetDl.Phase_${PHASE_LABEL[s.phase as keyof typeof PHASE_LABEL] ?? ''}`);
}

/** 挂载右下角进度徽标(幂等;完成自动淡出)。
 *  initAssetCache 是异步的——showTitle 调用时可能还没 enabled:
 *  订阅一次性等 enabled 翻真再挂 */
export function mountAssetBadge(): void {
  if (badgeEl || badgePending || typeof document === 'undefined') return;
  const s = assetCacheState();
  if (!s.enabled) {
    if (s.phase !== 'done') {
      badgePending = true;
      const off = onAssetProgress((st) => {
        if (st.enabled && !badgeEl) { badgePending = false; off(); mountAssetBadge(); }
      });
    }
    return;
  }
  if (s.phase === 'done') return; // 已完成不挂
  // ★完成标志在(内容版本键命中)干脆不挂——reload 后"徽标挂载又 0.7s 淡出"的
  //   闪现源(缓存真被系统清理的罕见窗口由门槛弹窗兜底,徽标只是装饰)
  if (assetsCompleteFast()) return;
  ensureStyle();
  badgeEl = document.createElement('div');
  badgeEl.className = 'sw-asset-badge';
  badgeEl.innerHTML = '<div class="spin"></div><span class="txt"></span>';
  badgeEl.title = Lang.text('Mods.SandboxWorld.AssetDl.BadgeTitle');
  document.body.appendChild(badgeEl);
  badgeEl.addEventListener('click', () => toggleAssetPanel());   // 点开下载详情
  const txt = badgeEl.querySelector('.txt') as HTMLElement;
  const update = (st: AssetCacheState) => {
    if (!badgeEl) return;
    badgeEl.title = `${fmtProgress(st)} · ${phaseText(st)}`;
    // 失败终态(3 轮自动重试后仍有缺):不淡出,常显失败数——菜单上就能看到
    // 异常,不必点单人游戏才发现(2026-08-13 可靠性 review)
    if (st.phase === 'done' && st.failed > 0) {
      txt.textContent = Lang.text('Mods.SandboxWorld.AssetDl.Failed', st.failed);
      return;
    }
    txt.textContent = Lang.text('Mods.SandboxWorld.AssetDl.Summary', fmtPct(st), phaseText(st));
    if (st.phase === 'done' && !badgeFading) {
      badgeFading = true;
      badgeEl.style.opacity = '0';
      setTimeout(() => { unmountAssetBadge(); }, 700);
    }
  };
  update(s);
  badgeUnsub = onAssetProgress(update);
}

export function unmountAssetBadge(): void {
  badgeUnsub?.(); badgeUnsub = null;
  badgeEl?.remove(); badgeEl = null;
  badgeFading = false;
  closeAssetPanel();   // 徽标淡出后详情面板一并收起
}

// ---- 下载详情面板(点击徽标开/关;2026-08-19) ----

let panelEl: HTMLElement | null = null;
let panelUnsub: (() => void) | null = null;

export function toggleAssetPanel(): void {
  if (panelEl) closeAssetPanel();
  else openAssetPanel();
}

function openAssetPanel(): void {
  if (panelEl || typeof document === 'undefined') return;
  ensureStyle();
  panelEl = document.createElement('div');
  panelEl.className = 'sw-asset-panel';
  panelEl.innerHTML = `
    <div class="sw-asset-title" style="font-size:15px;letter-spacing:2px;">正在下载游戏资源</div>
    <div class="sw-asset-barwrap">
      <div class="outer"></div>
      <div class="slot"><div style="width:0%"></div></div>
    </div>
    <div class="sw-asset-mb"></div>
    <div class="sw-asset-note"></div>
    <button class="sw-asset-retry" style="display:none">重新下载</button>
    <button class="sw-asset-close">关闭</button>`;
  document.body.appendChild(panelEl);
  ensurePanelBg(panelEl);
  const bar = panelEl.querySelector('.slot > div') as HTMLElement;
  const mbEl = panelEl.querySelector('.sw-asset-mb') as HTMLElement;
  const note = panelEl.querySelector('.sw-asset-note') as HTMLElement;
  const retry = panelEl.querySelector('.sw-asset-retry') as HTMLElement;
  (panelEl.querySelector('.sw-asset-close') as HTMLElement).addEventListener('click', closeAssetPanel);
  retry.addEventListener('click', () => {
    retry.style.display = 'none';
    warmAllAssets(true);
  });
  const update = (st: AssetCacheState): void => {
    if (!panelEl) return;
    bar.style.width = st.bytesTotal > 0
      ? `${Math.min(100, Math.floor((st.bytesDone / st.bytesTotal) * 100))}%`
      : (st.total > 0 ? `${Math.floor((st.done / st.total) * 100)}%` : '0%');
    mbEl.textContent = `${fmtProgress(st)} · ${fmtPct(st)}`;
    note.textContent = st.failed > 0
      ? `下载失败 ${st.failed} 项(点"重新下载"只补缺,已下载部分不会重复下载)`
      : `${phaseText(st)} · 已下载部分不会重复下载`;
    retry.style.display = st.failed > 0 && !st.warming ? '' : 'none';
    if (st.phase === 'done') closeAssetPanel();   // 完成即收起
  };
  update(assetCacheState());
  panelUnsub = onAssetProgress(update);
}

function closeAssetPanel(): void {
  panelUnsub?.(); panelUnsub = null;
  panelEl?.remove(); panelEl = null;
}

// ---- 单人游戏门槛弹窗 ----

let gateEl: HTMLElement | null = null;
let gateUnsub: (() => void) | null = null;

/** 资产未就绪时弹窗等待(实时进度);就绪/完成后执行 action。已就绪直接 action。 */
export function gateAssetsOrRun(action: () => void): void {
  // ★快速路径:上轮完成记录在(门槛真正等的是 SW status 回包的 1-2s keys()
  // 枚举,期间误显示下载中;trace 实证该窗口零实际下载)
  if (assetsCompleteFast()) { action(); return; }
  const s = assetCacheState();
  if (!s.enabled) { action(); return; } // SW 未启用(降级环境)不拦
  if (gateEl) return; // 已在等待
  ensureStyle();
  gateEl = document.createElement('div');
  gateEl.className = 'sw-asset-gate';
  gateEl.innerHTML = `
    <div class="panel">
      <div class="sw-asset-title">正在下载游戏资源</div>
      <div class="sw-asset-barwrap">
        <div class="outer"></div>
        <div class="slot"><div style="width:0%"></div></div>
      </div>
      <div class="sw-asset-pct"></div>
      <div class="sw-asset-note">下载完成后将自动进入(已下载部分不会重复下载)</div>
      <button class="sw-asset-retry" style="display:none">重新下载</button>
    </div>`;
  document.body.appendChild(gateEl);
  ensurePanelBg(gateEl.querySelector('.panel') as HTMLElement);
  const bar = gateEl.querySelector('.slot > div') as HTMLElement;
  const pct = gateEl.querySelector('.sw-asset-pct') as HTMLElement;
  const retry = gateEl.querySelector('.sw-asset-retry') as HTMLElement;
  retry.addEventListener('click', () => {
    retry.style.display = 'none';
    warmAllAssets(true);  // force:绕过已完成早退守卫,重拉失败项(2026-08-13 review:不绕过则按钮是死的)
  });
  const close = () => {
    gateUnsub?.(); gateUnsub = null;
    gateEl?.remove(); gateEl = null;
  };
  gateUnsub = onAssetProgress((st) => {
    if (!gateEl) return;
    // ★进度条与文案双口径:zip 模式按下载字节(用户感知的"下了多少 MB"),
    // legacy 回退文件数;条宽与文案同源防跳变
    const frac = st.bytesTotal > 0
      ? Math.min(1, st.bytesDone / st.bytesTotal)
      : (st.total > 0 ? st.done / st.total : 0);
    bar.style.width = `${Math.floor(frac * 100)}%`;
    pct.textContent = `${fmtPct(st)} · ${phaseText(st)} · ${fmtProgress(st)}`;
    retry.style.display = st.failed > 0 && !st.warming ? '' : 'none';
    if (assetsComplete()) { close(); action(); }
  });
  pct.textContent = `${fmtPct(s)} · ${phaseText(s)} · ${fmtProgress(s)}`;
  if (s.failed > 0 && !s.warming) retry.style.display = '';
}

// ---- 启动 splash 保持期(2026-08-24) ----

export interface HoldDeps {
  now(): number;
  state(): AssetCacheState;
  completeFast(): boolean;
  complete(): boolean;
}

/** 启动 splash 保持：无下载概念（SW 未启用或上轮完成标志在）→ 补满 minMs；
 *  有下载 → 等下载完（或失败终态放行，徽标在菜单上继续示警）；timeoutMs 兜底
 *  防下载链挂死卡死启动。sinceMs = splash 已显示时长（loadAssets 期计入）。
 *  轮询 250ms（SW 消息驱动状态，无需订阅式精确唤醒）。 */
export function holdForAssetsReady(opts: {
  minMs: number;
  sinceMs?: number;
  timeoutMs?: number;
  deps?: HoldDeps;
}): Promise<void> {
  const { minMs, sinceMs = 0, timeoutMs = 30000 } = opts;
  const d = opts.deps ?? {
    now: () => performance.now(),
    state: assetCacheState,
    completeFast: assetsCompleteFast,
    complete: assetsComplete,
  };
  const t0 = d.now();
  const needWait = d.state().enabled && !d.completeFast();
  return new Promise((resolve) => {
    const finish = () => { clearInterval(iv); clearTimeout(to); resolve(); };
    const iv = setInterval(() => {
      const elapsed = sinceMs + (d.now() - t0);
      if (elapsed < minMs) return;
      if (!needWait || d.complete() || d.state().failed > 0) finish();
    }, 250);
    const to = setTimeout(finish, Math.max(0, timeoutMs - sinceMs));
  });
}
