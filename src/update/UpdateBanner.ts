// 更新横幅(2026-09-07):UpdateCheck 探到新部署后展示——顶部居中小条,不打断
// 游戏;点击→先静默存档(丢未存进度兜底)→reload 一次到位(SW 文档 SWR 已在
// 后台更新缓存,reload 即新 bundle)。独立 DOM 挂 root,菜单/游戏两态通用。
import { Lang } from '../i18n/Lang';

export interface UpdateBannerHandle {
  show(version: string, onApply: () => void): void;
}

export function mountUpdateBanner(root: HTMLElement, onApply: () => void): UpdateBannerHandle {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:10px', 'left:50%', 'transform:translateX(-50%)',
    // ★z 290:必须低于 VUI 光标 canvas(z 300)——光标恒在 DOM UI 之上;
    // 高于 HUD(10-60)与面板(31+)。
    'z-index:290', 'display:none', 'align-items:center', 'gap:10px',
    'padding:8px 14px', 'border-radius:8px',
    'background:rgba(20,16,32,0.92)', 'border:2px solid #7a6a9e',
    'color:#e8e2f4', "font:14px/1.4 'Andy Bold','Verdana',sans-serif",
    'box-shadow:0 4px 16px rgba(0,0,0,0.5)', 'pointer-events:auto',
    'user-select:none', '-webkit-user-select:none',
  ].join(';');
  const label = document.createElement('span');
  const btn = document.createElement('button');
  btn.style.cssText = [
    'padding:4px 14px', 'border-radius:6px', 'cursor:pointer',
    'background:#5a4a8a', 'border:1px solid #8a7ab5', 'color:#fff',
    "font:inherit", 'white-space:nowrap',
  ].join(';');
  btn.addEventListener('mouseenter', () => { btn.style.background = '#6d5aa5'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#5a4a8a'; });
  el.append(label, btn);
  root.appendChild(el);

  btn.addEventListener('click', () => {
    btn.textContent = '…';
    onApply();
  });

  return {
    show(version: string, apply: () => void): void {
      // 版本号来自 build-id.txt 首段(数字版;异常缺段时回落 bundle 指纹短码)
      const display = version || '?';
      label.textContent = Lang.text('Mods.SandboxWorld.UpdateBanner', display);
      btn.textContent = Lang.text('Mods.SandboxWorld.UpdateApply');
      btn.onclick = () => { btn.textContent = '…'; apply(); };
      el.style.display = 'flex';
    },
  };
}

export type { UpdateBannerHandle as default };
