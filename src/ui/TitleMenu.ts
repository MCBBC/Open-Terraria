// 主菜单（DOM 版）：logo + CSS 摆动动画 + 原版纯文字按钮 + 版本号。
// 背景仍是 MenuBackground 的天空画布（z-index 0），本面板浮于其上，系统光标正常。
import { Lang } from '../i18n/Lang';

export interface TitleMenuFlow {
  onSinglePlayer(): void;
  onSettings(): void;
  onCredits(): void;
  onQuit(): void;
}

const CSS = `
.sw-title-menu {
  position: fixed; inset: 0; z-index: 15; cursor: default; pointer-events: none;
  display: flex; flex-direction: column; align-items: center;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  user-select: none;
}
.sw-title-logo {
  margin-top: 7vh; width: min(486px, 60vw);
  animation: sw-logo-swing 5.2s ease-in-out infinite;
  image-rendering: pixelated; pointer-events: none;
}
@keyframes sw-logo-swing {
  0%, 100% { transform: rotate(-2.2deg) scale(1.02); }
  50% { transform: rotate(2.2deg) scale(1.12); }
}
.sw-title-btns {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  margin-top: 5vh;
}
.sw-title-btn {
  background: none; border: none; cursor: pointer; pointer-events: auto;
  font-family: inherit; font-size: 22px; letter-spacing: 2px;
  color: #ffffff; padding: 6px 24px;
  text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000;
  transition: color .12s, transform .12s;
}
.sw-title-btn:hover { color: #ffd76e; transform: scale(1.06); }
.sw-title-version {
  position: fixed; left: 10px; bottom: 8px; font-size: 13px; color: #fff;
  text-shadow: 1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000;
  pointer-events: none;
}
`;

export class TitleMenu {
  private root: HTMLElement;

  constructor(parent: HTMLElement, private flow: TitleMenuFlow) {
    if (!document.getElementById('sw-title-style')) {
      const style = document.createElement('style');
      style.id = 'sw-title-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const t = (k: string, fb: string) => (Lang.has(k) ? Lang.text(k) : fb);
    this.root = document.createElement('div');
    this.root.className = 'sw-title-menu';
    this.root.innerHTML = `
      <img class="sw-title-logo" src="sprites/vanilla-ui/Logo.png" alt="logo">
      <div class="sw-title-btns">
        <div class="sw-title-btn" data-act="sp">${t('Legacy.LegacyMenu.12', '单人游戏')}</div>
        <div class="sw-title-btn" data-act="mp">${t('Legacy.LegacyMenu.13', '多人模式')}</div>
        <div class="sw-title-btn" data-act="set">${t('Legacy.LegacyMenu.14', '设置')}</div>
        <div class="sw-title-btn" data-act="credits">制作人员</div>
        <div class="sw-title-btn" data-act="quit">${t('Legacy.LegacyMenu.15', '退出')}</div>
      </div>
      <div class="sw-title-version">SandboxWorld v0.1.0</div>
    `;
    const on = (act: string, fn: () => void) => {
      this.root.querySelector(`[data-act=${act}]`)!.addEventListener('click', fn);
    };
    on('sp', () => flow.onSinglePlayer());
    on('mp', () => flow.onQuit()); // 多人占位（同退出提示）
    on('set', () => flow.onSettings());
    on('credits', () => flow.onCredits());
    on('quit', () => flow.onQuit());
    parent.appendChild(this.root);
  }

  destroy() {
    this.root.remove();
  }
}
