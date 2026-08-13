// 资产预载 UI(2026-08-13):右下角悬浮进度徽标 + 单人游戏门槛弹窗。
// 状态源=src/net/AssetCache(SW 消息驱动);样式沿用 .sw-panel 视觉惯例。
import { assetCacheState, assetsComplete, onAssetProgress, warmAllAssets, PHASE_LABEL, type AssetCacheState } from '../net/AssetCache';

const CSS = `
.sw-asset-badge {
  position: fixed; right: 14px; bottom: 14px; z-index: 40;
  display: flex; align-items: center; gap: 8px;
  background: linear-gradient(rgba(38,50,90,0.82), rgba(22,30,58,0.86));
  border: 2px solid #7d92d6; border-radius: 6px; padding: 6px 12px;
  color: #e8ecf8; font-family: inherit; font-size: 13px;
  pointer-events: none; box-shadow: 0 4px 18px rgba(0,0,0,0.5);
  transition: opacity .6s;
}
.sw-asset-badge .spin {
  width: 12px; height: 12px; border: 2px solid #7d92d6; border-top-color: #ffd76e;
  border-radius: 50%; animation: sw-asset-spin .8s linear infinite;
}
@keyframes sw-asset-spin { to { transform: rotate(360deg); } }
.sw-asset-gate {
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  background: rgba(6,8,18,0.72);
}
.sw-asset-gate .panel {
  width: min(420px, 86vw); text-align: center; color: #e8ecf8;
  background: linear-gradient(rgba(38,50,90,0.9), rgba(22,30,58,0.94));
  border: 2px solid #7d92d6; border-radius: 6px; padding: 22px 26px;
  box-shadow: 0 0 0 2px rgba(10,14,30,0.8), 0 10px 40px rgba(0,0,0,0.7);
  font-family: inherit;
}
.sw-asset-bar { height: 14px; border: 2px solid #7d92d6; border-radius: 3px; margin: 14px 0 8px; overflow: hidden; }
.sw-asset-bar > div { height: 100%; background: linear-gradient(90deg, #4a8ad4, #ffd76e); transition: width .3s; }
.sw-asset-note { font-size: 12px; color: #9fb0e0; margin-top: 8px; }
.sw-asset-retry {
  margin-top: 12px; background: #3a4680; color: #fff; border: 1px solid #7d92d6; border-radius: 4px;
  padding: 7px 22px; cursor: pointer; font-family: inherit; font-size: 14px;
}
`;

let styleEl: HTMLStyleElement | null = null;
function ensureStyle(): void {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.id = 'sw-asset-style';
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

// ---- 悬浮徽标 ----

let badgeEl: HTMLElement | null = null;
let badgeUnsub: (() => void) | null = null;
let badgeFading = false;

function fmtPct(s: AssetCacheState): string {
  return s.total > 0 ? `${Math.floor((s.done / s.total) * 100)}%` : '…';
}
function phaseText(s: AssetCacheState): string {
  if (s.phase === 'done') return '完成';
  if (s.phase === 'idle') return '准备';
  return PHASE_LABEL[s.phase as keyof typeof PHASE_LABEL] ?? '';
}

/** 挂载右下角进度徽标(幂等;完成自动淡出) */
export function mountAssetBadge(): void {
  if (badgeEl || typeof document === 'undefined') return;
  const s = assetCacheState();
  if (!s.enabled || s.phase === 'done') return; // 未启用/已完成不挂
  ensureStyle();
  badgeEl = document.createElement('div');
  badgeEl.className = 'sw-asset-badge';
  badgeEl.innerHTML = '<div class="spin"></div><span class="txt"></span>';
  badgeEl.title = '游戏资源后台下载中(进入单人游戏前会等待完成)';
  document.body.appendChild(badgeEl);
  const txt = badgeEl.querySelector('.txt') as HTMLElement;
  const update = (st: AssetCacheState) => {
    if (!badgeEl) return;
    txt.textContent = `资源下载 ${fmtPct(st)} · ${phaseText(st)}`;
    badgeEl.title = `${st.done}/${st.total}(失败 ${st.failed})`;
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
}

// ---- 单人游戏门槛弹窗 ----

let gateEl: HTMLElement | null = null;
let gateUnsub: (() => void) | null = null;

/** 资产未就绪时弹窗等待(实时进度);就绪/完成后执行 action。已就绪直接 action。 */
export function gateAssetsOrRun(action: () => void): void {
  if (assetsComplete()) { action(); return; }
  const s = assetCacheState();
  if (!s.enabled) { action(); return; } // SW 未启用(降级环境)不拦
  if (gateEl) return; // 已在等待
  ensureStyle();
  gateEl = document.createElement('div');
  gateEl.className = 'sw-asset-gate';
  gateEl.innerHTML = `
    <div class="panel">
      <div style="font-size:17px;letter-spacing:2px;">正在下载游戏资源</div>
      <div class="sw-asset-bar"><div style="width:0%"></div></div>
      <div class="pct" style="font-size:14px;"></div>
      <div class="sw-asset-note">下载完成后将自动进入(已下载部分不会重复下载)</div>
      <button class="sw-asset-retry" style="display:none">重新下载</button>
    </div>`;
  document.body.appendChild(gateEl);
  const bar = gateEl.querySelector('.sw-asset-bar > div') as HTMLElement;
  const pct = gateEl.querySelector('.pct') as HTMLElement;
  const retry = gateEl.querySelector('.sw-asset-retry') as HTMLElement;
  retry.addEventListener('click', () => { retry.style.display = 'none'; warmAllAssets(); });
  const close = () => {
    gateUnsub?.(); gateUnsub = null;
    gateEl?.remove(); gateEl = null;
  };
  gateUnsub = onAssetProgress((st) => {
    if (!gateEl) return;
    bar.style.width = st.total > 0 ? `${Math.floor((st.done / st.total) * 100)}%` : '0%';
    pct.textContent = `${fmtPct(st)} · ${phaseText(st)}(${st.done}/${st.total})`;
    retry.style.display = st.failed > 0 && !st.warming ? '' : 'none';
    if (assetsComplete()) { close(); action(); }
  });
  pct.textContent = `${fmtPct(s)} · ${phaseText(s)}(${s.done}/${s.total})`;
  if (s.failed > 0 && !s.warming) retry.style.display = '';
}
