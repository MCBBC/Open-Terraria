// 主菜单（DOM 版）：logo + CSS 摆动动画 + 原版纯文字按钮 + 版本号。
// 背景仍是 MenuBackground 的天空画布（z-index 0），本面板浮于其上，系统光标正常。
//
// 日/月抓取（GOING_OLDSCHOOL 成就，1.4.5.6 语义 1:1）：
//   原版【没有】"经典(8-bit)标题开关"这个设置/秘密入口——GOING_OLDSCHOOL 的真实
//   触发是在标题屏抓住太阳或月亮拖动（Main.cs:62428-62453 DrawSunAndMoon 尾段：
//   gameMenu && netMode!=1 && mouseLeft && 鼠标点命中日月绘制矩形 → 反算菜单时间
//   + DoClassicTitleScreenAchievement()，:62450）。成就描述原文 "Bring back the
//   original title screen."（wiki Achievements.md:892：Click/tap on the sun/moon）。
//   本实现把同一命中矩形（:62420 value4，以绘制原点为中心的正方形）做成透明命中层，
//   每帧对齐天空画布里的日/月（公式 = SkyRenderer.ts:1024-1067 同源），按下即触发成就。
//
// 【集成点·主会话接线（本次改动范围仅本文件，两处待接）】
//   B1 成就可达：Achievements 实例是 Game 级（Game.ts:554），标题屏直载时尚无 Game。
//      classicTitleAchievement() 按序尝试 window.__swAchievements →
//      window.__swGame.achievements（后者进过世界回菜单时可用）。要覆盖"首访直载
//      标题屏"，mainFlow 顶层加一行把成就实例挂到 __swAchievements 即可。
//   B2 拖动改时间：原版抓取即写 Main.time 使日/月跟手（Main.cs:62434-62446 反算）。
//      MenuBackground.clock 私有无 setter——暴露 setClockT(t01) 并在 showTitle 的
//      TitleMenu flow 里接 onSunMoonGrab 即原版般跟手；time01 已按原版公式反算好抛出。
import { Lang } from '../i18n/Lang';
import { menuTimeInfo } from '../render/MenuBackground';

/** Sun.png 114×114 / Moon_N.png 50×400（8 相位帧，帧宽 50）——SkyRenderer.ts:27-28 */
const SUN_SIZE = 114;
const MOON_FRAME_W = 50;
/** 时刻边界（本仓 Clock 0.25/0.75 ↔ 原版 day 0-54000 / night 0-32400） */
const DAWN_T = 0.25, DUSK_T = 0.75;

export interface TitleMenuFlow {
  onSinglePlayer(): void;
  onSettings(): void;
  onCredits(): void;
  onQuit(): void;
  onMultiplayer(): void;
  /**
   * 日/月被抓住（含拖动中的每帧）。原版此点会写 Main.time 使日/月跟手
   * （Main.cs:62434-62446）；本仓菜单时钟写入入口缺失，主会话接线
   * `menuBg.setClockT(info.time01)` 后即 1:1。成就触发不经此钩子（内部自理）。
   */
  onSunMoonGrab?(info: { dayTime: boolean; time01: number }): void;
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
/* 日/月命中层：全透明，罩住天空画布里的太阳/月亮（Main.cs:62420 value4）。
   z-index:-1 = 根 stacking context 内垫底——必在天空画布(0)之上、logo/按钮之下，
   不会截走菜单按钮的点击；touch-action:none 防触摸拖动触发页面手势 */
.sw-title-celestial {
  position: fixed; pointer-events: auto; cursor: grab; z-index: -1;
  touch-action: none;
}
.sw-title-celestial.grabbing { cursor: grabbing; }
`;

export class TitleMenu {
  private root: HTMLElement;
  private logoDay!: HTMLImageElement;
  private logoNight!: HTMLImageElement;
  private celestial!: HTMLDivElement;
  private rafId = 0;
  private unsubLang: (() => void) | null = null;
  /** alreadyGrabbingSunOrMoon（Main.cs:62428/:62451-62454 抓取闩） */
  private grabbing = false;

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
    // 日/月命中层（GOING_OLDSCHOOL）——置于按钮之下、天空画布之上
    this.celestial = document.createElement('div');
    this.celestial.className = 'sw-title-celestial';
    this.root.appendChild(this.celestial);
    this.celestial.addEventListener('pointerdown', (e) => {
      // mouseLeft && 命中矩形（Main.cs:62436-62451）→ 抓取闩 + 成就（每帧皆调，
      // Achievements.completeFlag 已完成后早退，幂等同原版 Complete()）
      this.grabbing = true;
      this.celestial.classList.add('grabbing');
      this.handleGrab(e.clientX);
    });
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
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

  // ---- 日/月抓取（GOING_OLDSCHOOL，Main.cs:62420-62453 1:1）----

  /** SkyRenderer.ts:1024-1067 同源公式 → 日/月绘制矩形（原点为中心，:62420 value4） */
  private celestialRect(): { x: number; y: number; size: number } {
    const t = menuTimeInfo.timeOfDay;
    const W = window.innerWidth;
    const isDay = t > DAWN_T && t < DUSK_T;
    const size0 = isDay ? SUN_SIZE : MOON_FRAME_W;
    // 昼夜各自的归一化行程（day 0-54000 / night 0-32400 → 0..1）
    const ft = isDay ? (t - DAWN_T) / (DUSK_T - DAWN_T) : ((((t - DUSK_T) + 1) % 1) / (1 - (DUSK_T - DAWN_T)));
    const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
    const x = ft * (W + size0 * 2) - size0;          // 横穿全屏 + 两侧贴图宽缓冲
    const y = dip * 250 + 180;                        // 正午/子夜最高
    const scale = (1.2 - dip * 0.4) * (isDay ? 1.1 : 1);
    return { x: x - size0 * scale / 2, y: y - size0 * scale / 2, size: size0 * scale };
  }

  /** 拖动中的每帧：反算菜单时间（Main.cs:62434-62446）+ 触发成就（:62450） */
  private handleGrab(mouseX: number): void {
    const t = menuTimeInfo.timeOfDay;
    const isDay = t > DAWN_T && t < DUSK_T;
    const W = window.innerWidth;
    const size0 = isDay ? SUN_SIZE : MOON_FRAME_W;
    const span = isDay ? 54000 : 32400;
    // time = span * (mouseX + 图宽) / (屏宽 + 图宽*2)，钳 [10, span-10]（原版 :62434-62446）
    const time = Math.max(10, Math.min(span - 10, span * (mouseX + size0) / (W + size0 * 2)));
    const t01 = isDay
      ? DAWN_T + (time / 54000) * (DUSK_T - DAWN_T)
      : (DUSK_T + (time / 32400) * (1 - (DUSK_T - DAWN_T))) % 1;
    // DoClassicTitleScreenAchievement（AchievementsHelper.cs:382-385 → GOING_OLDSCHOOL 'Do'）
    this.classicTitleAchievement();
    this.flow.onSunMoonGrab?.({ dayTime: isDay, time01: t01 });
  }

  /**
   * 成就派发出口。Achievements 实例是 Game 级（Game.ts:554），标题屏直载时尚无
   * Game——两个全局句柄按序尝试（mainFlow 进世界时都会就位）：
   *   · __swAchievements：主会话在菜单级直接暴露（推荐，一行：进 mainFlow 顶层
   *     new Achievements(localStorageStore) 挂 window，或把 Game 内实例提前挂出）
   *   · __swGame.achievements：进过世界后回到菜单时可用（quitToMenu 不清句柄）
   * 两者都缺位 → 本调用空转（只抛 onSunMoonGrab）。
   * 【集成点·主会话接线】见文件头清单。
   */
  private classicTitleAchievement(): void {
    const w = window as unknown as {
      __swAchievements?: { doClassicTitleScreenAchievement(): void };
      __swGame?: { achievements?: { doClassicTitleScreenAchievement(): void } };
    };
    const ach = w.__swAchievements ?? w.__swGame?.achievements;
    ach?.doClassicTitleScreenAchievement();
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.grabbing) return;                       // 仅抓取闩开着时跟手（:62438 || alreadyGrabbing）
    this.handleGrab(e.clientX);
  };

  private onPointerUp = () => {
    if (!this.grabbing) return;
    this.grabbing = false;                            // :62453 else alreadyGrabbingSunOrMoon = false
    this.celestial.classList.remove('grabbing');
  };

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
      const isDay = menuTimeInfo.timeOfDay > 0.1875 && menuTimeInfo.timeOfDay < 0.8125;
      logoA = Math.max(0, Math.min(255, logoA + (isDay ? 2 : -2) * frames));
      this.logoDay.style.opacity = String(logoA / 255);
      this.logoNight.style.opacity = String((255 - logoA) / 255);
      // 日/月命中层每帧对齐天空画布（时钟在走，日/月横穿屏幕）
      const cel = this.celestialRect();
      this.celestial.style.left = `${Math.round(cel.x)}px`;
      this.celestial.style.top = `${Math.round(cel.y)}px`;
      this.celestial.style.width = `${Math.round(cel.size)}px`;
      this.celestial.style.height = `${Math.round(cel.size)}px`;
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.unsubLang?.();
    this.root.remove();
  }
}
