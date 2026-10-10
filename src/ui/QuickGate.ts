// 功能首用确认门（2026-08-27 用户要求）：超游类功能（道具搜索/旅程时间天气/
// 地图点击传送…）首次使用时明示风险，确认启用后持久放行、后续不再拦截。
// 独立小模块——render↔ui 均可安全导入（无游戏态依赖）。
// ★BJ627：持久面迁 PrefsStore（IDB 单写+内存缓存;LS 只读兜底——历史 LS 值由
// 启动收编序迁 IDB,旧探针/旧会话预置的 LS 旗仍生效）。
import { prefGet, prefSet } from '../save/PrefsStore';

const KEY = (kind: string) => `sbw.journeyQuick.${kind}`;

/** 门查询：该功能是否已确认启用 */
export function featureGateConfirmed(key: string): boolean {
  try { return prefGet(KEY(key)) === '1'; } catch { return false; }
}

/** 写入确认旗（确认启用时调） */
export function confirmFeatureGate(key: string): void {
  try { prefSet(KEY(key), '1'); } catch { /* 隐私模式静默 */ }
}

/** 旅程快捷键（时间/天气）便捷封装（Renderer 消费） */
export function journeyQuickConfirmed(kind: 'time' | 'weather'): boolean {
  return featureGateConfirmed(kind);
}

export function confirmJourneyQuick(kind: 'time' | 'weather'): void {
  confirmFeatureGate(kind);
}

/** 确认弹窗（居中 DOM，z 高于游戏画布）。已确认过 → 直接走 onConfirm；
 *  未确认 → 弹窗，确认启用 = 写旗 + onConfirm（取消 = 关闭弹窗不放行）。
 *  同 key 重复调用幂等（已有同 id 弹窗则忽略）。 */
export function showFeatureGate(key: string, title: string, onConfirm: () => void): void {
  if (featureGateConfirmed(key)) { onConfirm(); return; }
  const id = `sw-journeyquick-gate-${key}`;
  if (document.getElementById(id)) return;
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1250; display:flex; align-items:center; justify-content:center;';
  const panel = document.createElement('div');
  panel.style.cssText = 'width:400px; max-width:90vw; box-sizing:border-box; background:#2a2a35; border:2px solid #6b6b8a; border-radius:6px; padding:14px; display:flex; flex-direction:column; gap:12px; color:#ddd; font-size:13px;';
  const h = document.createElement('div');
  h.className = 'sw-lbl';
  h.textContent = title;
  const body = document.createElement('div');
  body.textContent = '为了游戏体验，如非卡关或调试不建议使用此功能，可能破坏游戏乐趣。确认启用后不再拦截。';
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';
  const cancel = document.createElement('button');
  cancel.className = 'sw-btn';
  cancel.textContent = '取消';
  cancel.style.cssText = 'margin:0; width:auto; padding:5px 14px; font-size:12px;';
  cancel.addEventListener('click', () => overlay.remove());
  const ok = document.createElement('button');
  ok.className = 'sw-btn';
  ok.textContent = '确认启用';
  ok.style.cssText = 'margin:0; width:auto; padding:5px 14px; font-size:12px;';
  ok.addEventListener('click', () => {
    confirmFeatureGate(key);
    overlay.remove();
    onConfirm();
  });
  btnRow.append(cancel, ok);
  panel.append(h, body, btnRow);
  overlay.appendChild(panel);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/** 旅程快捷键弹窗（Renderer 消费；onConfirm 内做面板开合） */
export function showJourneyQuickGate(kind: 'time' | 'weather', onConfirm: () => void): void {
  showFeatureGate(kind, kind === 'time' ? '时间调整' : '天气调整', onConfirm);
}
