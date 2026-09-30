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
import APP_VERSION, { BUILD_STAMP } from '../version';
import { Lang } from '../i18n/Lang';
import { menuTimeInfo } from '../render/MenuBackground';
import { decayCelestialModY } from '../render/SkyRenderer';
import { openAssetDiagPanel } from './AssetDownloadUI';
import { achievementsPanelOpen } from './AchievementsUI';
import type { GenScreenSeedFlags } from '../vui/states/UIWorldLoadState';

/** Sun.png 114×114 / Moon_N.png 50×400（8 相位帧，帧宽 50）——SkyRenderer.ts:27-28 */
const SUN_SIZE = 114;
const MOON_FRAME_W = 50;
/** 昼夜判定边界 = Clock.DAWN/DUSK（0.1875/0.8125）；行程映射 = 画布菜单太阳
 *  同款（SkyRenderer.ts:3709 日 (t−DAWN)/0.625·54000、:3896 夜 (t−DUSK)/0.375·32400
 *  ——2026-08-23 校正的 DrawSunAndMoon 口径。★本文件曾沿用旧 0.25/0.75 基,
 *  命中层与可见太阳仅在正午 t=0.5 处重合(两线性映射交点),其余时刻恒偏
 *  ——用户实报"只有太阳在 logo 区(≈屏顶中央)才抓得到"即此因,2026-08-27 对齐） */
const DAY_T0 = 0.1875, DAY_T1 = 0.8125;

// ───────────────────────── ★IIIII218 生成屏 logo 动效（vanilla 1:1）─────────────────────────
/** Main.logo* 六字段（:2331-2342；初值逐字）——纯状态机便于单测 */
export interface LogoDynamicsState {
  rotation: number; rotationDirection: number; rotationSpeed: number;
  scale: number; scaleDirection: number; scaleSpeed: number;
}
export const LOGO_STATE_INITIAL: LogoDynamicsState = {
  rotation: 0, rotationDirection: -1, rotationSpeed: 1,
  scale: 1, scaleDirection: 1, scaleSpeed: 1,
};

/** 一步 60fps 帧（=1 原版帧）：
 *  ① Update 复位点 :17292-17298（`!gameMenu || |speed|>1000` → rotation/speed=0,scale=1；
 *     菜单恒 gameMenu=true → 仅速度支可达）；
 *  ② DrawMenu 分支 :49060-49132（remix 倒置摆动 > drunk&&!notTheBees 自旋缩没 > else=返回
 *     false 不接管——标题/普通籽维持既有 CSS 摆动）。
 *  返回 true = 特殊分支消费了本帧（应把 rotation/scale 写上 DOM）。 */
export function logoDynamicsStep(
  s: LogoDynamicsState,
  f: { remixWorldGen: boolean; drunkWorldGen: boolean; notTheBees: boolean } | null,
): boolean {
  // ① Update :17292-17298
  if (Math.abs(s.rotationSpeed) > 1000) {
    s.rotation = 0;
    s.rotationSpeed = 0;
    s.scale = 1;
  }
  if (!f) return false;
  if (f.remixWorldGen) {
    // ②-remix DrawMenu :49060-49094
    s.rotation += s.rotationSpeed * 4e-5;
    if (s.rotation < 3.04) {
      s.rotation += s.rotationSpeed * 0.0016;
      if (s.rotationSpeed < 0) s.rotationSpeed = 0;
    }
    if (s.rotation > 3.22) s.rotationDirection = -1;
    else if (s.rotation < 3.06) s.rotationDirection = 1;
    if (s.rotationSpeed < 20 && s.rotationDirection === 1) s.rotationSpeed++;
    else if (s.rotationSpeed > -20 && s.rotationDirection === -1) s.rotationSpeed--;
    s.scale += s.scaleSpeed * 9e-5;
    if (s.scale > 1) s.scaleDirection = -1;
    else if (s.scale < 0.9) s.scaleDirection = 1;
    if (s.scaleSpeed < 50 && s.scaleDirection === 1) s.scaleSpeed++;
    else if (s.scaleSpeed > -50 && s.scaleDirection === -1) s.scaleSpeed--;
    return true;
  }
  if (f.drunkWorldGen && !f.notTheBees) {
    // ②-drunk DrawMenu :49095-49105（:49079 转速 ±1500/帧;:49090 scale −0.05/帧缩没）
    s.rotation += s.rotationSpeed * 4e-6;
    if (s.rotationSpeed > 0) s.rotationSpeed += 1500;
    else s.rotationSpeed -= 1500;
    s.scale -= 0.05;
    if (s.scale < 0) s.scale = 0;
    return true;
  }
  return false;   // else 支 = CSS 摆动照旧
}

export interface TitleMenuFlow {
  onSinglePlayer(): void;
  onSettings(): void;
  onCredits(): void;
  onQuit(): void;
  onMultiplayer(): void;
  /** 素材包管理(自制:重制热补丁;mainFlow → RemasterPanel) */
  onAssetPacks?(): void;
  /** ★SW-FX18 2026-09-10 成就页（Main.cs:49733 menuMode 0 第三钮
   *  Lang.menu[131] → MenuUI.SetState(AchievementsMenu) 的本仓等价；
   *  mainFlow 供菜单级成就实例桥） */
  onAchievements?(): void;
  /**
   * 日/月被抓住（含拖动中的每帧）。原版此点会写 Main.time 使日/月跟手
   * （Main.cs:62434-62446）；本仓菜单时钟写入入口缺失，主会话接线
   * `menuBg.setClockT(info.time01)` 后即 1:1。modY = mouseY−基准y
   * （:62430/:62440 的 sunModY/moonModY 写点——`menuBg.setCelestialModY` 透传
   * SkyRenderer 后画布日/月垂直跟手）。成就触发不经此钩子（内部自理）。
   */
  onSunMoonGrab?(info: { dayTime: boolean; time01: number; modY: number }): void;
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
/* ★IIIII245 成就面板独占态(vanilla SetState 语义:Main.cs:49733 menuMode 0 第三钮
   → MenuUI.SetState(AchievementsMenu) 是【替换】菜单按钮态,成就页开着时菜单项
   不绘制不可点)。visibility:hidden = 同时移出命中测试(仅藏会吃点击的按钮列,
   logo/日·月抓取层不受影响);由 rAF 步进按 achievementsPanelOpen() 摘挂。 */
.sw-title-menu.sw-title-suppressed .sw-title-btns { visibility: hidden; }
/* 复刻版本基准副行(v0.1.0 下方,用户要求 2026-08-28) */
.sw-title-baseline { opacity: .85; }
/* 右下署名（GLM-5.3/GLM-5.3-Flash 协作声明）用【内联样式】——注入样式表的
   getElementById 守卫在 HMR 期会驻留旧 CSS 吞掉变更，内联不受其害 */
/* 日/月命中层：罩住天空画布里的太阳/月亮（Main.cs:62420 value4），纯命中区
   无自有贴图——★曾内嵌 .body 可见体在抓取中显示=第二颗太阳(2026-08-27 用户报
   双太阳)。那是 setCelestialModY 接线前的旧反馈方案(彼时画布只横移);现画布经
   setClockT 横移 + setCelestialModY 垂直(sunModY,SkyRenderer :3937)双轴跟手
   =原版"拖的就是真太阳",DOM 可见体已整体拆除,本层只当抓取热区+grab 光标。
   z-index:-1 = 根 stacking context 内垫底——必在天空画布(0)之上、logo/按钮之下，
   不会截走菜单按钮的点击；touch-action:none 防触摸拖动触发页面手势。 */
.sw-title-celestial {
  position: fixed; pointer-events: auto; cursor: grab; z-index: -1;
  touch-action: none;
}
.sw-title-celestial.grabbing { cursor: grabbing; }
/* ---- 手机适配(2026-08-25,加法式覆盖,桌面 ≥1024×768 全不命中)----
   A 竖屏窄(max-width:560):压缩纵向节奏;B 矮横屏(max-height:500):
   手机横屏 ~390 高,13vh+486logo+5钮列 ≈470 会溢出 → 缩 logo + 收紧间距 */
@media (max-width: 560px) {
  .sw-title-logo { margin-top: 10vh; }
  .sw-title-btns { gap: 6px; margin-top: 4vh; }
  .sw-title-btn { font-size: 19px; padding: 7px 18px; letter-spacing: 2px;
    touch-action: manipulation; }
  /* 署名/免责两行(right:10 bottom:8,高 ~42px)窄屏下左延到版本号位置 →
     版本号上移并右对齐,与署名/免责排成一列(桌面左下角分居不动) */
  .sw-title-version { bottom: 58px; left: auto; right: 10px; }
}
@media (max-height: 500px) {
  .sw-title-logo { width: min(340px, 46vw); margin-top: 3vh; }
  .sw-title-btns { margin-top: 2vh; gap: 4px; }
  .sw-title-btn { font-size: 16px; padding: 4px 16px; letter-spacing: 2px;
    touch-action: manipulation; }
}
`;

export class TitleMenu {
  private root: HTMLElement;
  /** 角标文字层（版本号+署名，body 级 z35——splash 之上，见构造器注） */
  private chrome!: HTMLElement;
  private logoDay!: ImageBitmap | HTMLImageElement;
  private logoNight!: ImageBitmap | HTMLImageElement;
  private celestial!: HTMLDivElement;
  private rafId = 0;
  private unsubLang: (() => void) | null = null;
  /** ★BJ335：logo 连点诊断 window 捕获监听句柄——destroy 对称摘除。
   *  曾只靠 onTap 内「菜单游离后首次 pointerdown 自解绑」兜底：探针/无点击路径
   *  永不解绑 ⇒ 每次重建菜单泄漏整个 TitleMenu 家族（实例+flow 回调环+游离
   *  标题按钮树 ~28 节点/轮,快照实测 ×5 实例滞留）。 */
  private onLogoTap: ((e: PointerEvent) => void) | null = null;
  /** alreadyGrabbingSunOrMoon（Main.cs:62428/:62451-62454 抓取闩） */
  private grabbing = false;
  /** sunModY/moonModY（:1244/:1246，绘制与命中盒的垂直抓取偏移——拖动中 = mouseY-基准，
   *  松手后每帧 ×0.999 缓回 0；基准 y 见 celestialState 的 dip 公式） */
  private modY = 0;
  /** 成就面板独占态现值（IIIII245；由 sw-ach-toggle 同步事件驱动摘挂——rAF 轮询
   *  在 headless 后台标签被节流（坑表 B1 同族），还原会拖到下一帧） */
  private menuSuppressed = false;
  /** sw-ach-toggle 监听句柄（destroy 自摘） */
  private onAchToggle = (e: Event): void => {
    this.applyMenuSuppressed(!!(e as CustomEvent).detail?.open);
  };

  /** 独占态落 DOM（构造器初值+事件双入口共用；差分写防重复样式失效） */
  private applyMenuSuppressed(v: boolean): void {
    if (v === this.menuSuppressed) return;
    this.menuSuppressed = v;
    this.root.classList.toggle('sw-title-suppressed', v);
  }

  // ---- ★IIIII218 生成屏 logo 动效（Main.cs DrawMenu :49060-49132 + Update :17292 1:1）----
  /** 生成屏种子表现旗标（mainFlow.createWorldFlow 注入；null=标题/普通籽=CSS 摆动照旧）。
   *  vanilla：动效分支判 WorldGen.remixWorldGen / drunkWorldGen（生成期旗），标题屏
   *  走 else 支（本仓=既有 CSS 摆动近似，不换脸）；生成结束进世界 TitleMenu 随之销毁 */
  private genFlags: GenScreenSeedFlags | null = null;
  /** Main.logo* 状态（:2331-2342 初值逐字：direction=-1/speed=1/scale=1/scaleDir=1/scaleSpeed=1） */
  private logoState: LogoDynamicsState = { ...LOGO_STATE_INITIAL };
  private logoFrameAcc = 0;              // 定帧累积器（动效常量按 60fps 帧计）
  /** boulderLogo（:1218 初值 false；:49177-49181 noTrapsWorld 置位【无复位】=会话闩；
   *  SetTitle :6532-6534 1/200 随机在构造器已实现） */
  private boulderLogo = false;

  /** 生成屏旗标注入（mainFlow.createWorldFlow 接线；生成结束=null 还原 CSS 摆动） */
  setGenFlags(flags: GenScreenSeedFlags | null): void {
    this.genFlags = flags;
    // noTrapsWorld → boulderLogo=true（:49177 会话闩——vanilla 无清零点，回标题仍是巨石）
    if (flags?.noTrapsWorldGen) this.boulderLogo = true;
    this.applyLogoImages();
    if (!flags) {
      // 还原 CSS 摆动（生成中止/失败回标题的防御路径；正常成功=TitleMenu 销毁重建）
      const el = this.root.querySelector('.sw-title-logo') as HTMLElement | null;
      if (el) { el.style.animation = ''; el.style.transform = ''; }
    }
  }

  /** logo 图源（昼/夜对）：boulderLogo → Logo5/Logo6（:49136-49150），否则 Logo/Logo2。
   *  ★巨石对是 Logo5/Logo6 独立命名（非 prefix+2——曾误拼 Logo52.png=naturalWidth 0,
   *  生成屏 logo 空框,2026-09-08 探针实拍抓出） */
  private applyLogoImages(): void {
    const day = this.root.querySelector('.logo-day') as HTMLImageElement | null;
    const night = this.root.querySelector('.logo-night') as HTMLImageElement | null;
    if (!day || !night) return;
    const [dayName, nightName] = this.boulderLogo ? ['Logo5', 'Logo6'] : ['Logo', 'Logo2'];
    day.src = `sprites/vanilla-ui/${dayName}.png`;
    night.src = `sprites/vanilla-ui/${nightName}.png`;
  }

  /** 一步 60fps 帧动效（Main.cs Update :17292 复位点 + DrawMenu :49060-49132 分支逐字，
   *  纯函数 logoDynamicsStep 消费）。remix 支=倒置摆动（rotation 3.04..3.22rad≈174°..184°、
   *  scale 0.9..1.0 呼吸）；drunk&&!notTheBees 支=转速 ±1500/帧 + scale −0.05/帧——
   *  ★1457/1458 Update 复位 `|speed|>1000 → rotation/speed=0, scale=1` 每帧在其先跑
   *  ⇒ 该支净表现=定格在 scale 0.95 / rotation −0.006rad（1405 无此复位=真自旋缩没,
   *  1457 起被复位门中和——以反编译终态为准,两处逐字后净效自动同构）；else 支不接管
   *  （CSS 摆动照旧）。昼夜交叉淡化（:49197-49222）：remix 强制夜面（见 startLogoFade）。 */
  private logoStep(): void {
    if (logoDynamicsStep(this.logoState, this.genFlags)) this.applyLogoTransform();
  }

  private applyLogoTransform(): void {
    const el = this.root.querySelector('.sw-title-logo') as HTMLElement | null;
    if (!el) return;
    el.style.animation = 'none';
    el.style.transform = `rotate(${this.logoState.rotation}rad) scale(${this.logoState.scale})`;
  }

  constructor(parent: HTMLElement, private flow: TitleMenuFlow) {
    // 样式表每次挂载都刷新内容（★HMR/迭代期旧 <style> 驻留会吞掉 CSS 变更——
    // getElementById 守卫只建不更，用户可见"样式改了不生效"即此因）
    let style = document.getElementById('sw-title-style') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'sw-title-style';
      document.head.appendChild(style);
    }
    style.textContent = CSS;
    // Logo 昼夜对（Main.LogoA/LogoB 交叉淡化；巨石 logo 1/200 随机 = SetTitle rand.Next(200)）
    // ★IIIII218：随机结果落 boulderLogo 会话闩（:49177 noTrapsWorld 置位同域）——
    // 生成屏 setGenFlags 换图源时不得覆盖标题期 1/200 命中
    this.boulderLogo = Math.random() < 1 / 200;
    const daySrc = this.boulderLogo ? 'sprites/vanilla-ui/Logo5.png' : 'sprites/vanilla-ui/Logo.png';
    const nightSrc = this.boulderLogo ? 'sprites/vanilla-ui/Logo6.png' : 'sprites/vanilla-ui/Logo2.png';
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
        ${this.flow.onAchievements ? `<div class="sw-title-btn" data-act="ach">${Lang.text('LegacyMenu.131')}</div>` : ''}
        <div class="sw-title-btn" data-act="set">${Lang.text('LegacyMenu.14')}</div>
        <div class="sw-title-btn" data-act="buy">${Lang.text('Mods.SandboxWorld.Menu.BuyTerraria')}</div>
        <div class="sw-title-btn" data-act="replog">${Lang.text('Mods.SandboxWorld.Menu.ReplicaNotes')}</div>
        ${(window as unknown as { sandboxDesktop?: { isShell?: boolean } }).sandboxDesktop?.isShell
          ? `<div class="sw-title-btn" data-act="quit">${Lang.text('LegacyMenu.15')}</div>`
          : ''}
      </div>
    `;
    // 角标文字层（版本号+署名）：body 级独立层 z35——splash(z30) 之上、下载徽标
    // (z40) 之下。2026-08-24 用户要求两处文字随 splash 渐显渐隐期可见（原在标题
    // 根 z15 内被 splash 盖住、进菜单才现身）。pointer-events:none 纯展示。
    this.chrome = document.createElement('div');
    this.chrome.id = 'sw-title-chrome';
    this.chrome.innerHTML = `
      <style>
        /* 渐显入场与 splash 图片同曲线（--sw-splash-alpha 由 Splash 单调广播，
           揭幕/回菜单时变量摘除=回满亮） */
        #sw-title-chrome { position: fixed; inset: 0; z-index: 35; pointer-events: none;
          opacity: var(--sw-splash-alpha, 1); }
      </style>
      <div class="sw-title-version"><div>SandboxWorld v${APP_VERSION} ${BUILD_STAMP}</div><div class="sw-title-baseline">${Lang.text('Mods.SandboxWorld.Title.RemakeBaseline')}</div></div>
      <div data-credit style="position:fixed;right:10px;bottom:8px;font-size:13px;color:#fff;text-align:right;line-height:1.6;pointer-events:none;text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000;"></div>
    `;
    document.body.appendChild(this.chrome);
    this.logoDay = this.root.querySelector('.logo-day') as unknown as HTMLImageElement;
    this.logoNight = this.root.querySelector('.logo-night') as unknown as HTMLImageElement;
    // ★资产诊断入口(2026-08-27):logo 连点 5 次(2.5s 内)弹出资产诊断面板
    //   (手机无 Console 的取证出口,swTrace 跨刷新持久)。调试工具,文案硬编码。
    //   ★监听挂 window 捕获阶段+按坐标命中 logo 矩形——logo 上方有日/月成就
    //   命中层(celestial,pointerdown 捕获),元素级 click 会被它吃掉(用户实测
    //   "手机/PC 都点不动");window 捕获先于一切,遮挡免疫。菜单移除时自解绑。
    {
      let taps = 0, tapTimer: ReturnType<typeof setTimeout> | null = null;
      const onTap = (e: PointerEvent) => {
        const logoEl = this.root.isConnected ? this.root.querySelector('.sw-title-logo') : null;
        if (!logoEl) { window.removeEventListener('pointerdown', onTap, true); return; }
        const r = logoEl.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        taps++;
        if (tapTimer) clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { taps = 0; }, 2500);
        if (taps >= 5) {
          taps = 0;
          if (tapTimer) clearTimeout(tapTimer);
          openAssetDiagPanel();
        }
      };
      window.addEventListener('pointerdown', onTap, true);
      this.onLogoTap = onTap;   // ★BJ335：登记句柄,destroy 对称摘除
    }
    // 调试句柄(探针/远程 Console 用;与 __swAssetCache 同族先例)
    (window as unknown as { __swAssetDiag?: () => void }).__swAssetDiag = openAssetDiagPanel;
    // 日/月命中层 + 可见体（GOING_OLDSCHOOL）——置于按钮之下、天空画布之上
    this.celestial = document.createElement('div');
    this.celestial.className = 'sw-title-celestial';
    this.root.appendChild(this.celestial);
    this.celestial.addEventListener('pointerdown', (e) => {
      // mouseLeft && 命中矩形（Main.cs:62436-62451）→ 抓取闩 + 成就（每帧皆调，
      // Achievements.completeFlag 已完成后早退，幂等同原版 Complete()）
      // ★按下帧也写 modY（原版 :62430 按住首帧即写）——不传 Y 则首帧只改时间,
      //   太阳垂直方向要等首个 pointermove 才跟手
      this.grabbing = true;
      this.celestial.classList.add('grabbing');
      this.handleGrab(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    const on = (act: string, fn: () => void) => {
      this.root.querySelector(`[data-act=${act}]`)?.addEventListener('click', fn);
    };
    on('sp', () => flow.onSinglePlayer());
    on('mp', () => flow.onMultiplayer());
    on('ach', () => flow.onAchievements?.());   // ★SW-FX18 成就页（menu[131] 同位）
    on('set', () => flow.onSettings());
    on('buy', () => window.open('https://store.steampowered.com/app/105600/Terraria', '_blank', 'noopener'));
    on('replog', () => window.open('https://github.com/Vinlic/terraria-replica-build-notes', '_blank', 'noopener'));
    on('quit', () => flow.onQuit());
    parent.appendChild(this.root);
    // ★IIIII245 成就面板独占态(vanilla SetState 替换语义,见 CSS 注):同步事件驱动,
    //   构造时初值对齐(quitToMenu 路径 closeAll 先关面板再重建菜单,初值恒 false)
    window.addEventListener('sw-ach-toggle', this.onAchToggle);
    this.applyMenuSuppressed(achievementsPanelOpen());
    this.startLogoFade();
    this.unsubLang = Lang.onChange(() => this.renderTexts());
    this.renderTexts(); // 初始填充（署名 div 是空容器，仅靠 onChange 永不落字）
  }

  // ---- 日/月抓取（GOING_OLDSCHOOL，Main.cs:62420-62453 1:1）----

  /**
   * 日/月绘制态，与画布菜单太阳逐式同源（SkyRenderer.ts:3709/:3896/:3927-3938
   * ——菜单 bgTopY=0，见 ：3729 !frameCtx 支）：
   * x = ft*(屏宽+图宽*2)-图宽（横穿）、y = dip*250+180（正午/子夜最高）、
   * scale = (1.2-dip*0.4)×(日 1.1 / 夜 1)、rotation = ft*2-7.3。
   */
  private celestialState(): { x: number; y: number; size: number; rot: number; dayTime: boolean } {
    const t = menuTimeInfo.timeOfDay;
    const W = window.innerWidth;
    const isDay = t > DAY_T0 && t < DAY_T1;                       // Clock.DAWN/DUSK
    const dayTime = isDay ? ((t - DAY_T0) / 0.625) * 54000 : 0;
    const nightTime = !isDay ? ((((t - DAY_T1) + 1) % 1) / 0.375) * 32400 : 0;
    const size0 = isDay ? SUN_SIZE : MOON_FRAME_W;
    const ft = (isDay ? dayTime : nightTime) / (isDay ? 54000 : 32400);
    const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
    const x = ft * (W + size0 * 2) - size0;
    const y = dip * 250 + 180;
    const scale = (1.2 - dip * 0.4) * (isDay ? 1.1 : 1);
    return { x, y, size: size0 * scale, rot: ft * 2 - 7.3, dayTime: isDay };
  }

  /** 每帧把命中层对到画布日/月上（同公式自算；本层无贴图，画布那颗才是可见体） */
  private syncCelestial(): void {
    const s = this.celestialState();
    this.celestial.style.left = `${Math.round(s.x - s.size / 2)}px`;
    this.celestial.style.top = `${Math.round(s.y - s.size / 2 + this.modY)}px`; // modY 绘制偏移（:62376/:62395）
    this.celestial.style.width = `${Math.round(s.size)}px`;
    this.celestial.style.height = `${Math.round(s.size)}px`;
  }

  /** 拖动中的每帧：反算菜单时间（Main.cs:62434-62446）+ modY 垂直跟手（:62430/:62440）+ 触发成就（:62450） */
  private handleGrab(mouseX: number, mouseY?: number): void {
    const isDay = menuTimeInfo.timeOfDay > DAY_T0 && menuTimeInfo.timeOfDay < DAY_T1;
    const W = window.innerWidth;
    const size0 = isDay ? SUN_SIZE : MOON_FRAME_W;
    const span = isDay ? 54000 : 32400;
    // time = span * (mouseX + 图宽) / (屏宽 + 图宽*2)，钳 [10, span-10]（原版 :62434-62446）
    const time = Math.max(10, Math.min(span - 10, span * (mouseX + size0) / (W + size0 * 2)));
    const t01 = isDay
      ? 0.1875 + (time / 54000) * 0.625
      : (0.8125 + (time / 32400) * 0.375) % 1;
    // sunModY/moonModY = mouseY - 基准y（:62430/:62440；基准 = celestialState 的
    // dip 公式 y——拖动中垂直跟手，松手后 ×0.999 缓回）
    if (mouseY !== undefined) {
      const s = this.celestialState();
      this.modY = mouseY - s.y;
    }
    // DoClassicTitleScreenAchievement（AchievementsHelper.cs:382-385 → GOING_OLDSCHOOL 'Do'）
    this.classicTitleAchievement();
    this.flow.onSunMoonGrab?.({ dayTime: isDay, time01: t01, modY: this.modY });
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
    this.handleGrab(e.clientX, e.clientY);
  };

  private onPointerUp = () => {
    if (!this.grabbing) return;
    this.grabbing = false;                            // :62453 else alreadyGrabbingSunOrMoon = false
    this.celestial.classList.remove('grabbing');
  };

  /** 按钮文案按当前语言重取(M8 语言切换刷新) */
  private renderTexts() {
    const t = (k: string, ...args: (string | number)[]) => Lang.text(k, ...args);
    const set = (act: string, text: string) => {
      const el = this.root.querySelector(`[data-act=${act}]`);
      if (el) el.textContent = text;
    };
    set('sp', t('LegacyMenu.12'));
    set('mp', t('LegacyMenu.13'));
    set('ach', t('LegacyMenu.131'));   // ★SW-FX18 成就页（menu[131] 同位）
    set('set', t('LegacyMenu.14'));
    set('buy', t('Mods.SandboxWorld.Menu.BuyTerraria'));
    set('replog', t('Mods.SandboxWorld.Menu.ReplicaNotes'));
    set('quit', t('LegacyMenu.15'));
    // 右下署名两行（多语化：{0}/{1} = 加粗名，b 样式含像素字体复制法加粗+左右 margin）
    const credit = this.chrome.querySelector('[data-credit]');
    if (credit) {
      const bs = 'font-weight:700;margin:0 5px;text-shadow:1px 0 0 #fff,1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000';
      credit.innerHTML = `${t('Mods.SandboxWorld.Credits.Line1', `<b style="${bs}">GLM-5.3</b>`, `<b style="${bs}">GLM-5.3-Flash</b>`)}<br>${t('Mods.SandboxWorld.Credits.Line2')}`;
    }
    // 左下复刻版本基准副行（随语言切换刷新）
    const baseline = this.chrome.querySelector('.sw-title-baseline');
    if (baseline) baseline.textContent = t('Mods.SandboxWorld.Title.RemakeBaseline');
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
      // ★IIIII218：生成屏 remix/drunk 分支按 60fps 定帧步进（动效常量按帧计；
      // 上限 8 步/回调=后台标签回来防雪崩,MenuBackground 同纪律）
      const g = this.genFlags;
      if (g && (g.remixWorldGen || (g.drunkWorldGen && !g.notTheBees))) {
        this.logoFrameAcc = Math.min(8, this.logoFrameAcc + frames);
        while (this.logoFrameAcc >= 1) {
          this.logoFrameAcc -= 1;
          this.logoStep();
        }
      } else {
        this.logoFrameAcc = 0;
      }
      const isDay = menuTimeInfo.timeOfDay > 0.1875 && menuTimeInfo.timeOfDay < 0.8125
        && !this.genFlags?.remixWorldGen;   // remix 生成=强制夜面（Main.cs:49197 `dayTime && !remixWorldGen` else 支）
      logoA = Math.max(0, Math.min(255, logoA + (isDay ? 2 : -2) * frames));
      (this.logoDay as HTMLImageElement).style.opacity = String(logoA / 255);
      (this.logoNight as HTMLImageElement).style.opacity = String((255 - logoA) / 255);
      // 日/月命中层每帧对齐天空画布（时钟在走，日/月横穿屏幕）
      // modY 松手衰减 = 画布同款 decayCelestialModY（Main.cs:62415-62416 (short)
      // 截断向零）。★截断绝不是"视觉上不可辨"：纯浮点 ×0.999 从 230px 归零要
      // ~90s，截断每帧至少削 1px ~4s 归零——曾两套衰减并存,拖完太阳画布日/月
      // 数秒弹回轨道位而命中层残留偏移一分多钟 =「不灵敏/得点月亮上方才有效」
      // （2026-08-27 用户报,231px 实测算术）
      if (!this.grabbing && this.modY !== 0) {
        this.modY = decayCelestialModY(this.modY);
      }
      this.syncCelestial();
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    // ★BJ335：window 捕获 pointerdown(logo 连点诊断)对称摘除——原依赖
    //  「游离后首次 pointerdown 自解绑」,无点击路径(探针/挂机看菜单)整族滞留
    if (this.onLogoTap) { window.removeEventListener('pointerdown', this.onLogoTap, true); this.onLogoTap = null; }
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('sw-ach-toggle', this.onAchToggle);
    this.unsubLang?.();
    this.chrome.remove();
    this.root.remove();
  }
}
