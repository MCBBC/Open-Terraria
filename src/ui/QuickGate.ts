// 旅程模式快捷调整（时间 ±/天气 ⛅）首用确认门（2026-08-27 用户要求）：
// 与道具搜索同款语义——首点明示超游风险，确认启用后 localStorage 持久放行、
// 后续不再拦截。按 kind（time/weather）独立记忆。独立小模块避免 render↔ui 循环依赖。

export type JourneyQuickKind = 'time' | 'weather';

const KEY = (kind: JourneyQuickKind) => `sbw.journeyQuick.${kind}`;

export function journeyQuickConfirmed(kind: JourneyQuickKind): boolean {
  try { return localStorage.getItem(KEY(kind)) === '1'; } catch { return false; }
}

export function confirmJourneyQuick(kind: JourneyQuickKind): void {
  try { localStorage.setItem(KEY(kind), '1'); } catch { /* 隐私模式静默 */ }
}

/** 确认弹窗（居中 DOM，z 高于游戏画布；确认回调内做面板开合） */
export function showJourneyQuickGate(kind: JourneyQuickKind, onConfirm: () => void): void {
  const id = `sw-journeyquick-gate-${kind}`;
  if (document.getElementById(id)) return;
  const title = kind === 'time' ? '时间调整' : '天气调整';
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
    confirmJourneyQuick(kind);
    overlay.remove();
    onConfirm();
  });
  btnRow.append(cancel, ok);
  panel.append(h, body, btnRow);
  overlay.appendChild(panel);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
