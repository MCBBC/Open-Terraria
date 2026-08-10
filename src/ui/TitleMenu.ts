// 主菜单（DOM 版）：logo + CSS 摆动动画 + 原版纯文字按钮 + 版本号。
// 背景仍是 MenuBackground 的天空画布（z-index 0），本面板浮于其上，系统光标正常。
import { Lang } from '../i18n/Lang';
import { menuTimeInfo } from '../render/MenuBackground';

export interface TitleMenuFlow {
  onSinglePlayer(): void;
  onSettings(): void;
  onCredits(): void;
  onQuit(): void;
  onMultiplayer(): void;
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
  private unsubLang: (() => void) | null = null;

  constructor(parent: HTMLElement, private flow: TitleMenuFlow) {
    if (!document.getElementById('sw-title-style')) {
      const style = document.createElement('style');
      style.id = 'sw-title-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
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
        <div class="sw-title-btn" data-act="sp">${Lang.text('LegacyMenu.12')}</div>
        <div class="sw-title-btn" data-act="mp">${Lang.text('LegacyMenu.13')}</div>
        <div class="sw-title-btn" data-act="set">${Lang.text('LegacyMenu.14')}</div>
        <div class="sw-title-btn" data-act="credits">${Lang.text('UI.Credits')}</div>
        <div class="sw-title-btn" data-act="quit">${Lang.text('LegacyMenu.15')}</div>
      </div>
      <div class="sw-title-version">SandboxWorld v0.1.0</div>
    `;
    this.logoDay = this.root.querySelector('.logo-day')!;
    this.logoNight = this.root.querySelector('.logo-night')!;
    const on = (act: string, fn: () => void) => {
      this.root.querySelector(`[data-act=${act}]`)!.addEventListener('click', fn);
    };
    on('sp', () => flow.onSinglePlayer());
    on('mp', () => flow.onMultiplayer());
    on('set', () => flow.onSettings());
    on('credits', () => flow.onCredits());
    on('quit', () => flow.onQuit());
    parent.appendChild(this.root);
    this.startLogoFade();
    this.unsubLang = Lang.onChange(() => this.renderTexts());
  }

  /** 按钮文案按当前语言重取(M8 语言切换刷新) */
  private renderTexts() {
    const t = (k: string) => Lang.text(k);
    const set = (act: string, text: string) => {
      const el = this.root.querySelector(`[data-act=${act}]`);
      if (el) el.textContent = text;
    };
    set('sp', t('LegacyMenu.12'));
    set('mp', t('LegacyMenu.13'));
    set('set', t('LegacyMenu.14'));
    set('credits', t('UI.Credits'));
    set('quit', t('LegacyMenu.15'));
  }

  /** LogoA/LogoB 昼夜交叉淡化（1456 Main.cs:47773-47799 一比一）：
   *  驱动源是 dayTime 布尔（翻转即换向），积分速率 ±2/帧（60fps ≈ 120/s，
   *  0↔255 全程约 2.1 秒线性渐变）；日层 LogoA、夜发光层 LogoB 互为消长。 */
  private startLogoFade() {
    let logoA = 255; // 初始白天
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;
      const frames = dt / (1000 / 60);
      const isDay = menuTimeInfo.timeOfDay > 0.25 && menuTimeInfo.timeOfDay < 0.75;
      logoA = Math.max(0, Math.min(255, logoA + (isDay ? 2 : -2) * frames));
      this.logoDay.style.opacity = String(logoA / 255);
      this.logoNight.style.opacity = String((255 - logoA) / 255);
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.unsubLang?.();
    this.root.remove();
  }
}
