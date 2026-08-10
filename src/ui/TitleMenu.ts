// 主菜单（DOM 版）：logo + CSS 摆动动画 + 原版纯文字按钮 + 版本号。
// 背景仍是 MenuBackground 的天空画布（z-index 0），本面板浮于其上，系统光标正常。
import { Lang } from '../i18n/Lang';
import { menuTimeInfo } from '../render/MenuBackground';

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
  margin-top: 13vh; width: min(486px, 60vw);
  aspect-ratio: 486 / 142;
  animation: sw-logo-swing 5.2s ease-in-out infinite;
  pointer-events: none; position: relative;
}
.sw-title-logo img { position: absolute; inset: 0; width: 100%; height: 100%;
  image-rendering: pixelated; object-fit: contain; }
.sw-title-logo img.logo-night { opacity: 0; }
@keyframes sw-logo-swing {
  0%, 100% { transform: rotate(-2.2deg) scale(1.02); }
  50% { transform: rotate(2.2deg) scale(1.12); }
}
.sw-title-btns {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  margin-top: 7vh;
}
.sw-title-btn {
  background: none; border: none; cursor: pointer; pointer-events: auto;
  font-family: inherit; font-size: 24px; letter-spacing: 3px;
  color: #ffffff; padding: 9px 28px;
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
  private logoDay!: HTMLImageElement;
  private logoNight!: HTMLImageElement;
  private rafId = 0;

  constructor(parent: HTMLElement, private flow: TitleMenuFlow) {
    if (!document.getElementById('sw-title-style')) {
      const style = document.createElement('style');
      style.id = 'sw-title-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const t = (k: string, fb: string) => (Lang.has(k) ? Lang.text(k) : fb);
    // Logo 昼夜对（Main.LogoA/LogoB 交叉淡化；巨石 logo 1/200 随机 = SetTitle rand.Next(200)）
    const boulder = Math.random() < 1 / 200;
    const daySrc = boulder ? 'sprites/vanilla-ui/Logo5.png' : 'sprites/vanilla-ui/Logo.png';
    const nightSrc = boulder ? 'sprites/vanilla-ui/Logo6.png' : 'sprites/vanilla-ui/Logo2.png';
    this.root = document.createElement('div');
    this.root.className = 'sw-title-menu';
    this.root.innerHTML = `
      <div class="sw-title-logo">
        <img class="logo-day" src="${daySrc}" alt="logo">
        <img class="logo-night" src="${nightSrc}" alt="">
      </div>
      <div class="sw-title-btns">
        <div class="sw-title-btn" data-act="sp">${t('Legacy.LegacyMenu.12', '单人游戏')}</div>
        <div class="sw-title-btn" data-act="mp">${t('Legacy.LegacyMenu.13', '多人模式')}</div>
        <div class="sw-title-btn" data-act="set">${t('Legacy.LegacyMenu.14', '设置')}</div>
        <div class="sw-title-btn" data-act="credits">制作人员</div>
        <div class="sw-title-btn" data-act="quit">${t('Legacy.LegacyMenu.15', '退出')}</div>
      </div>
      <div class="sw-title-version">SandboxWorld v0.1.0</div>
    `;
    this.logoDay = this.root.querySelector('.logo-day')!;
    this.logoNight = this.root.querySelector('.logo-night')!;
    const on = (act: string, fn: () => void) => {
      this.root.querySelector(`[data-act=${act}]`)!.addEventListener('click', fn);
    };
    on('sp', () => flow.onSinglePlayer());
    on('mp', () => flow.onQuit()); // 多人占位（同退出提示）
    on('set', () => flow.onSettings());
    on('credits', () => flow.onCredits());
    on('quit', () => flow.onQuit());
    parent.appendChild(this.root);
    this.startLogoFade();
  }

  /** LogoA/LogoB 昼夜交叉淡化（白天亮 Logo、夜晚发光层；随 menuTimeInfo 同步） */
  private startLogoFade() {
    const step = () => {
      const { timeOfDay } = menuTimeInfo;
      // 夜系数：午夜 0→1；0.20 日出淡出；0.72-0.80 日落淡入；昼为 0
      let night: number;
      if (timeOfDay < 0.20) night = 1 - timeOfDay / 0.20;
      else if (timeOfDay > 0.80) night = Math.min(1, (timeOfDay - 0.80) / 0.05);
      else if (timeOfDay >= 0.72) night = 1 - (timeOfDay - 0.72) / 0.08;
      else night = 0;
      night = Math.max(0, Math.min(1, night));
      this.logoDay.style.opacity = String(1 - night * 0.85);
      this.logoNight.style.opacity = String(night);
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.root.remove();
  }
}
