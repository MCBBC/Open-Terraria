// 移动端虚拟控件层 v2.1（mobile-adaptation-plan docs/mobile-adaptation-plan.md 模块②;
// 2026-08-29 用户定案:控件效果对齐【官方 Terraria 手游截图】——固定罗盘摇杆+
// 底部动作小钮横排+右下跳跃/使用双大钮+统一深蓝半透明像素皮肤）。
// 触屏设备启用；桌面零渲染零影响（coarse 总闸）。
// 设计原则（对 PC 操作零侵入）：
//  - 摇杆/跳跃等持续态 = input.setVirtualAction(action 电平)：用户重绑即时跟随；
//    边沿动作（背包/暂停/全图/聊天/旅程）= input.tapVirtual 经 Keybinds 表与
//    Esc 主链派发(origin='virtual')，物理键盘路径零改动；
//  - 世界区域触摸仍由 Input 自身合成（点击=左键、拖动=瞄准、长按=右键交互），
//    本层控件 touchstart 均 stopPropagation+preventDefault，不落世界层；
//  - "使用"大钮实时显示当前手持物品 sprite(iconUrl 同源 dataURL),空手回退准星;
//    智能光标开关在底部动作排,点亮态即智能光标开启(官方手游同形)。
import type { Game } from '../core/Game';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { vanillaIdOfItem } from '../stats/Shimmer';
import { Lang } from '../i18n/Lang';
import { options } from '../core/Options';
import { isTouchDevice } from '../core/input/touchDevice';
import { hudTier } from './HudScale';
import { iconUrl } from './UI';

/** 触屏会话判定·单一来源(core/input/touchDevice;此处 re-export 保持
 *  mainFlow/VUI 既有 import 路径不破) */
export { isTouchDevice };

/** 移动端画布 UI 缩放（小地图/资源条/拍照模式右锚缩放读数；HudScale 档位驱动：
 *  D0/T1=1 桌面 byte 级不变、T2=0.7、T3=0.62）。★操控层按钮不吃本因子——
 *  0.7 会把 ⌀46 压到违规尺寸(44pt 红线)，操控层由 --mbtn-scale 独立控制 */
export { hudTier };

/** 移动端画布 UI 缩放（小地图/资源条/拍照模式右锚缩放读数；HudScale 档位驱动：
 *  D0/T1=1 桌面 byte 级不变、T2=0.7、T3=0.62）。★操控层按钮不吃本因子——
 *  0.7 会把 ⌀46 压到违规尺寸(44pt 红线)，操控层由 --mbtn-scale 独立控制 */
export function mobileUiScale(): number {
  const t = hudTier();
  if (t === 'd0' || t === 't1') return 1;
  return t === 't3' ? 0.62 : 0.7;
}

const CSS = `
.sw-mobile { position:fixed; inset:0; pointer-events:none; z-index:150;
  font-family:inherit; user-select:none; -webkit-user-select:none; }
.sw-mobile > * { pointer-events:auto; }
/* ---- 官方手游皮肤基准(对齐 2026-08-29 用户高清参照):极淡深蓝圆盘+近无描边+
   白色像素剪影图标+大半透白 knob。官方盘面透明度 ~0.35,按压仅微增亮 ---- */
.sw-mjoy, .sw-mjump, .sw-mbtn {
  border-radius:50%;
  background:radial-gradient(circle at 50% 40%, rgba(56,80,170,0.40), rgba(24,36,88,0.34) 78%);
  box-shadow:inset 0 0 0 1.5px rgba(190,208,255,0.20);
  color:#eef2ff; touch-action:none;
  opacity:var(--mbtn-alpha,0.82);
}
.sw-mjoy.press, .sw-mjump.press, .sw-mbtn.press {
  filter:brightness(1.35);
  box-shadow:inset 0 0 0 2px rgba(225,235,255,0.5);
  transition:filter 70ms steps(2,end), box-shadow 70ms steps(2,end);
}
.sw-mbtn.off { opacity:calc(var(--mbtn-alpha,0.82)*0.42); filter:grayscale(0.7); }
.sw-mbtn.lit { filter:brightness(1.4); }
.sw-mbtn.on  { box-shadow:inset 0 0 0 2.5px rgba(141,224,141,0.8), inset 0 0 12px rgba(141,224,141,0.4); }
/* 白色像素剪影图标居中(16×16 字符画 data URI,crispEdges) */
.sw-mbtn img, .sw-mjump img { width:52%; height:52%; image-rendering:pixelated; pointer-events:none; opacity:0.96; }
/* ---- 左下:固定罗盘摇杆(官方几何:盘底距底 ≈25% 屏高,横屏 390 → bottom 96) ---- */
.sw-mjoy { position:absolute; left:calc(24px + env(safe-area-inset-left)); bottom:calc(96px + env(safe-area-inset-bottom));
  width:124px; height:124px; }
.sw-mjoy::before { content:''; position:absolute; inset:8px; border-radius:50%;
  background:
    radial-gradient(circle 3px at 50% 7%,  rgba(235,242,255,0.8) 97%, transparent),
    radial-gradient(circle 3px at 93% 50%, rgba(235,242,255,0.8) 97%, transparent),
    radial-gradient(circle 3px at 50% 93%, rgba(235,242,255,0.8) 97%, transparent),
    radial-gradient(circle 3px at 7% 50%,  rgba(235,242,255,0.8) 97%, transparent);
  opacity:0.9; }
.sw-mjoy.idle { opacity:0.5; }   /* 幽灵方位记忆:α过低会在亮背景下整盘隐形(实测) */
.sw-mjoy .knob { position:absolute; left:50%; top:50%; width:56px; height:56px;
  border-radius:50%; transform:translate(-50%,-50%);
  background:rgba(238,244,255,0.42);
  box-shadow:inset 0 0 0 2px rgba(255,255,255,0.35); }
/* ---- 右下:瞄准摇杆(官方 dual-stick 右杆,盘大 ⌀116)+ 跳跃 + 右下角暂停 ---- */
.sw-matk  { position:absolute; right:calc(14px + env(safe-area-inset-right)); bottom:calc(40px + env(safe-area-inset-bottom));
  width:116px; height:116px; display:block; }
.sw-matk::before { content:''; position:absolute; inset:-10px; border-radius:50%; }
.sw-matk .knob { position:absolute; left:50%; top:50%; width:52px; height:52px;
  border-radius:50%; transform:translate(-50%,-50%);
  background:rgba(238,244,255,0.30);
  box-shadow:inset 0 0 0 2px rgba(255,255,255,0.30); }
.sw-matk .face { position:absolute; left:50%; top:50%; width:46%; height:46%;
  transform:translate(-50%,-50%); image-rendering:pixelated; pointer-events:none; }
.sw-matk.push .knob { background:rgba(245,250,255,0.5); box-shadow:inset 0 0 0 2px rgba(255,255,255,0.6); }
/* 药水快捷槽:挂瞄准盘左上角(官方形态:持有治疗药水才显示) */
.sw-mpot { position:absolute; left:-14px; top:-16px; width:44px; height:44px; z-index:2; }
.sw-mjump { position:absolute; right:calc(142px + env(safe-area-inset-right)); bottom:calc(40px + env(safe-area-inset-bottom));
  width:64px; height:64px; display:flex; align-items:center; justify-content:center; }
.sw-mpause { position:absolute; right:calc(34px + env(safe-area-inset-right)); bottom:calc(10px + env(safe-area-inset-bottom));
  width:44px; height:44px; display:flex; align-items:center; justify-content:center; }
/* ---- 右上系统组(横排,锚=minimap 左缘;网页版必需的窗口管理键) ----
   成员:背包/地图/智能光标开关(+条件:聊天/旅程)。SC 点亮=on 绿环 */
.sw-msys { position:absolute; display:flex; gap:8px; align-items:center;
  right:210px; top:calc(58px + env(safe-area-inset-top)); }
.sw-msys .sw-mbtn { position:relative; width:44px; height:44px; }
.sw-mact-chat, .sw-mact-journey { display:none; }
.sw-mobile.net   .sw-mact-chat     { display:flex; }
.sw-mobile.journey .sw-mact-journey { display:flex; }
/* ---- 全屏/横屏兜底钮(最右上,官方同位) ---- */
.sw-mfs { position:absolute; right:calc(8px + env(safe-area-inset-right)); top:calc(6px + env(safe-area-inset-top));
  width:38px; height:30px; border-radius:7px; font-size:15px;
  background:radial-gradient(circle at 50% 40%, rgba(56,80,170,0.42), rgba(24,36,88,0.36));
  box-shadow:inset 0 0 0 1.5px rgba(190,208,255,0.22);
  color:#eef2ff; display:flex; align-items:center; justify-content:center;
  touch-action:manipulation; }
.sw-mrotate { position:absolute; left:50%; top:calc(42px + env(safe-area-inset-top)); transform:translateX(-50%);
  background:rgba(20,26,52,0.82); color:#ffe8a0; font-size:12px; padding:5px 14px;
  border-radius:8px; border:1px solid #7d92d6; display:none; pointer-events:none;
  white-space:nowrap; }
@media (orientation: portrait) {
  /* T3:提示条贴 hotbar 两行(~110px)下沿左对齐——居中横条会撞下沉后的
     minimap(T3 oy_local=196×0.62≈屏 y121 起);左侧 x<260 空档无 HUD */
  .sw-mobile .sw-mrotate { display:block; left:calc(8px + env(safe-area-inset-left));
    transform:none; top:calc(118px + env(safe-area-inset-top)); max-width:58vw; }
}
`;

/** 像素图标:16×16 字符画('.' 透明 / X 白 / o 半透白)→ run-length rect SVG。
 *  手绘基准=官方手游白色剪影语言(粗实心/高辨识);零贴图零网络请求 */
const ICONS: Record<string, string> = {};
function icon(name: string): string {
  if (!ICONS[name]) {
    const svg = art2svg(PIXEL_ART[name] ?? []);
    ICONS[name] = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  return ICONS[name];
}
function art2svg(rows: string[]): string {
  const fills: Record<string, string> = { X: '#f2f5ff', o: 'rgba(242,245,255,0.5)' };
  const out: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) { x++; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      out.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fills[ch] ?? '#f2f5ff'}"/>`);
      x += run;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${out.join('')}</svg>`;
}
const PIXEL_ART: Record<string, string[]> = {
  // —— 操控三枚(代理 A 终稿;jump/pause 主控钮 + aim-joystick fallback face 不再使用旧草稿)——
  // 跳跃:粗实心上箭头(三角头双行钝肩+直杆,头基12px 杆6px)
  jump: [
    '................',
    '.......XX.......',
    '......XXXX......',
    '.....XXXXXX.....',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '.....XXXXXX.....',
    '.....XXXXXX.....',
    '.....XXXXXX.....',
    '.....XXXXXX.....',
    '.....XXXXXX.....',
    '.....XXXXXX.....',
    '................',
    '................',
  ],
  // 暂停:双竖条(4px 杠宽=4px 间隙,o 圆角过渡)
  pause: [
    '................',
    '..oXXo....oXXo..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..oXXo....oXXo..',
    '................',
    '................',
  ],
  // —— 系统组五枚(代理 B 终稿,圆角厚剪影一族;o 仅内部分割)——
  // 背包:圆润双肩包(拱形提手孔+半透盖缝+两条通底背带)
  inventory: [
    '................',
    '......XXXX......',
    '.....XX..XX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXooooooooXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXoXXXXXXoXXX.',
    '.XXXoXXXXXXoXXX.',
    '.XXXoXXXXXXoXXX.',
    '.XXXoXXXXXXoXXX.',
    '.XXXoXXXXXXoXXX.',
    '..XXXXXXXXXXXX..',
    '................',
    '................',
  ],
  // 地图:图纸上负空间定位针(针孔透空露底色)
  map: [
    '................',
    '................',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXooooXXXXX.',
    '.XXXXoo..ooXXXX.',
    '.XXXXoo..ooXXXX.',
    '.XXXXXooooXXXXX.',
    '.XXXXXXooXXXXXX.',
    '.XXXXXXooXXXXXX.',
    '.XXXXXXooXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '................',
    '................',
  ],
  // 智能光标:狙击镜式准星(粗实心十字+四向分离刻度线)
  cross: [
    '................',
    '.......XX.......',
    '.......XX.......',
    '................',
    '................',
    '.......XX.......',
    '.......XX.......',
    '.XX..XXXXXX..XX.',
    '.XX..XXXXXX..XX.',
    '.......XX.......',
    '.......XX.......',
    '................',
    '................',
    '.......XX.......',
    '.......XX.......',
    '................',
  ],
  // 聊天:圆角气泡+三点输入中+左下垂尾
  chat: [
    '................',
    '................',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXooXooXooXXX.',
    '.XXXooXooXooXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '...XXX..........',
    '....XX..........',
    '................',
    '................',
  ],
  // 旅程力量:四芒星 sparkle(凹弧轮廓,腰部最宽)
  journey: [
    '................',
    '................',
    '.......XX.......',
    '.......XX.......',
    '......XXXX......',
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '...XXXXXXXXXX...',
    '.....XXXXXX.....',
    '......XXXX......',
    '.......XX.......',
    '.......XX.......',
    '................',
    '................',
  ],
  // 药水瓶(瓶口+颈+圆瓶;挂瞄准盘左上角快捷槽)
  potion: [
    '................',
    '.....XXXXXX.....',
    '.....XXXXXX.....',
    '......XXXX......',
    '......XXXX......',
    '.....XXXXXX.....',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
    '................',
  ],
  // 靶标环(瞄准摇杆空手 fallback face;圆环+N/S 伸出刻线+E/W 短臂+o 芯点)
  ring: [
    '................',
    '.......XX.......',
    '.......XX.......',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '...XX......XX...',
    '...XX......XX...',
    '.XXXX..oo..XXXX.',
    '.XXXX..oo..XXXX.',
    '...XX......XX...',
    '...XX......XX...',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
    '.......XX.......',
    '.......XX.......',
    '................',
  ],
};

let cssInjected = false;
function ensureCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** 首个用户手势内尝试全屏 + 横屏锁定（失败静默——iOS 不支持 orientation.lock） */
export async function tryFullscreenLandscape(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch { /* 拒绝/不支持 */ }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await so.lock?.('landscape');
  } catch { /* iOS Safari 无 lock */ }
}

export class MobileControls {
  private root: HTMLElement;
  private game: Game;
  /** 摇杆轴 -1..1（钩爪方向用；持续键注入按回滞阈值） */
  axis = { x: 0, y: 0 };
  private joyId: number | null = null;
  /** 浮动摇杆盘心(touchstart 起手固定;fixed 档=底盘中心) */
  private joyBaseX = 0;
  private joyBaseY = 0;
  private joyBaseEl: HTMLElement | null = null;
  private joyIdleTimer: ReturnType<typeof setTimeout> | null = null;
  /** 持续键当前持份(回滞释放判定基线) */
  private held = { left: false, right: false, up: false, down: false };
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private rotListener: (() => void) | null = null;
  private optListener: ((d: typeof options.data) => void) | null = null;
  /** 底部动作排各钮(use/smart/potion) */
  private useBtn: HTMLElement | null = null;
  /** 右摇杆(瞄准杆)状态:pointer 跟踪/盘心锚/游标圈 */
  private useJoyId: number | null = null;
  private useBaseX = 0;
  private useBaseY = 0;
  private useKnob: HTMLElement | null = null;
  private smartBtn: HTMLElement | null = null;
  private potionBtn: HTMLElement | null = null;
  /** 使用钮当前渲染的物品 id(-1=准星态),防重复换 src 重解码 */
  private useFaceId = -1;

  constructor(game: Game, parent: HTMLElement) {
    ensureCss();
    this.game = game;
    this.root = document.createElement('div');
    this.root.className = 'sw-mobile';
    this.applySkinVars();
    this.optListener = () => this.applySkinVars();
    options.onChange(this.optListener);
    this.buildJoystick();
    this.buildJump();
    this.buildAttack();
    this.buildSystemColumn();
    this.buildPauseBtn();
    this.buildFullscreen();
    const rot = document.createElement('div');
    rot.className = 'sw-mrotate';
    rot.textContent = Lang.text('Mods.SandboxWorld.Mobile.RotateHint');
    this.root.appendChild(rot);
    parent.appendChild(this.root);
    // 状态刷新(使用钮物品面/药水可用/SC 态/条件项/系统列锚):1s 节流
    this.refreshTimer = setInterval(() => this.refresh(), 1000);
    // 横竖屏变化时也刷
    this.rotListener = () => this.refresh();
    window.addEventListener('orientationchange', this.rotListener);
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.rotListener) window.removeEventListener('orientationchange', this.rotListener);
    if (this.optListener) options.removeListener(this.optListener);
    // H5 护栏:清全部虚拟电平(touchKeys/virtualActions)——重进世界残留虚拟键会
    // 幽灵驱动角色(Input.destroy 兜底 releaseAllVirtual,此处主动再清)
    this.game.input.releaseAllVirtual();
    this.root.remove();
  }

  /** --mbtn-scale/--mbtn-alpha 从设置直灌(options.onChange 订阅刷新) */
  private applySkinVars(): void {
    this.root.style.setProperty('--mbtn-scale', String(options.data.touchButtonSize));
    this.root.style.setProperty('--mbtn-alpha', String(options.data.touchButtonAlpha));
  }

  // ---- 构件 ----
  private setIcon(btn: HTMLElement, name: string): void {
    btn.innerHTML = '';
    const img = document.createElement('img');
    img.src = icon(name);
    img.alt = '';
    btn.appendChild(img);
  }

  /** 触控按钮绑定:touchstart preventDefault+stopPropagation(控件不落世界层),
   *  press 视觉+brightness steps;可选 onUp */
  private bindBtn(el: HTMLElement, onDown: () => void, onUp?: () => void): void {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('press');
      onDown();
    }, { passive: false });
    const end = (e: Event) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('press');
      onUp?.();
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }

  /** 左下罗盘摇杆:默认固定位(官方截图形态),Settings 可切浮动档。
   *  浮动=热区 x∈[0,.46W],y∈[.42H,H] 触点即盘心;映射=R44 行程/死区 12 线性,
   *  回滞触发/释放双阈值(修"碎步"),斜向抑制防推横带上翘误攀绳 */
  private buildJoystick(): void {
    const joy = document.createElement('div');
    joy.className = 'sw-mjoy';
    const knob = document.createElement('div');
    knob.className = 'knob';
    joy.appendChild(knob);
    this.joyBaseEl = joy;
    const R = 44, DEAD = 12;
    void DEAD;   // 死区并入下方 clamp(d<DEAD/R 归零由回滞阈值近似承担)
    const apply = () => {
      const inp = this.game.input;
      inp.setVirtualAction('Left', this.held.left);
      inp.setVirtualAction('Right', this.held.right);
      inp.setVirtualAction('Up', this.held.up);
      inp.setVirtualAction('Down', this.held.down);
    };
    const inHotZone = (x: number, y: number): boolean =>
      x <= window.innerWidth * 0.46 && y >= window.innerHeight * 0.42;
    const clampBase = (cx: number, cy: number): [number, number] => [
      Math.min(Math.max(cx, 66 + safeL()), window.innerWidth * 0.46 - 20),
      Math.min(Math.max(cy, window.innerHeight * 0.42 + 30), window.innerHeight - safeB() - 66),
    ];
    const move = (t: Touch, bx: number, by: number) => {
      let dx = (t.clientX - bx) / R;
      let dy = (t.clientY - by) / R;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      // 死区:圆心 12px 内归零(静止漂移防护)
      if (Math.hypot(t.clientX - bx, t.clientY - by) < 12) {
        dx = 0; dy = 0;
      }
      this.axis.x = dx; this.axis.y = dy;
      knob.style.transform = `translate(calc(-50% + ${dx * R}px), calc(-50% + ${dy * R}px))`;
      // 回滞映射:横向 0.38 触发/<0.26 释放;纵向 ±0.62/±0.52 更严(拇指推横自然上抬)
      const nx = Math.abs(dx), ny = Math.abs(dy);
      if (nx >= 0.38 && dx > 0) this.held.right = true;
      else if (this.held.right && nx < 0.26) this.held.right = false;
      if (nx >= 0.38 && dx < 0) this.held.left = true;
      else if (this.held.left && nx < 0.26) this.held.left = false;
      // 斜向抑制:横向主导(|ny|≤0.62 且 |nx|≥0.38)时纵向一律松开
      if (!(ny <= 0.62 && nx >= 0.38)) {
        if (dy <= -0.62) this.held.up = true;
        else if (this.held.up && dy > -0.52) this.held.up = false;
        if (dy >= 0.62) this.held.down = true;
        else if (this.held.down && dy < 0.52) this.held.down = false;
      } else { this.held.up = false; this.held.down = false; }
      apply();
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      if (this.joyId !== null) return;
      const floating = options.data.touchJoystickFloat;
      const r = joy.getBoundingClientRect();
      if (!floating && !(t.clientX >= r.left - 40 && t.clientX <= r.right + 40
        && t.clientY >= r.top - 40 && t.clientY <= r.bottom + 40)) return;
      if (floating && !inHotZone(t.clientX, t.clientY)) return;
      this.joyId = t.identifier;
      joy.classList.remove('idle');
      this.armIdleTimer();
      // ★浮动档盘心在起手时刻固定(move 全程以它为原点——重算 rect 会漂移)
      const base: [number, number] = floating
        ? clampBase(t.clientX, t.clientY)
        : [r.left + r.width / 2, r.top + r.height / 2];
      this.joyBaseX = base[0]; this.joyBaseY = base[1];
      move(t, base[0], base[1]);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault(); e.stopPropagation();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) move(t, this.joyBaseX, this.joyBaseY);
      }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.joyId) continue;
        e.preventDefault(); e.stopPropagation();
        this.joyId = null;
        this.axis.x = 0; this.axis.y = 0;
        this.held.left = this.held.right = this.held.up = this.held.down = false;
        knob.style.transform = 'translate(-50%,-50%)';
        apply();
      }
    };
    joy.addEventListener('touchend', end, { passive: false });
    joy.addEventListener('touchcancel', end, { passive: false });
    this.root.appendChild(joy);
    this.armIdleTimer();
  }

  private armIdleTimer(): void {
    if (this.joyIdleTimer) clearTimeout(this.joyIdleTimer);
    this.joyIdleTimer = setTimeout(() => {
      if (this.joyId === null) this.joyBaseEl?.classList.add('idle');
    }, 2000);
  }

  private buildJump(): void {
    const b = document.createElement('div');
    b.className = 'sw-mjump';
    this.setIcon(b, 'jump');
    this.bindBtn(b,
      () => this.game.input.setVirtualAction('Jump', true),
      () => this.game.input.setVirtualAction('Jump', false));
    this.root.appendChild(b);
  }

  /** "使用"大钮:按下=mousedown 边沿+mouseHeld 电平(悠悠球/连枷 channel 语义正确;
   *  自动连发武器由 canChain 链条自然重挥)。钮面=当前手持物品 sprite(官方同形,
   *  refresh() 1s 内更新;空手=十字准星) */
  /** 右下"使用"区(v2.2):不是单纯按钮——是**瞄准摇杆**(官方 dual-stick 右杆,
   *  2026-08-29 用户定案):推杆方向实时驱动虚拟光标(camera.worldToScreen(玩家)+
   *  摇杆向量×距离 → 写 Input.mouseX/Y。武器朝向 atan2、aimWX/WY、smart cursor
   *  吸附等全部既有消费链零改动复用);按下即 mouseDown 边沿+mouseHeld 电平
   *  (持续使用;连发/悠悠球/channel 与桌面同构),点按(无位移快起止)=一次 tap
   *  使用(Input.pendingTapRelease 兜底)。盘心显示当前手持物品 sprite */
  private buildAttack(): void {
    const b = document.createElement('div');
    b.className = 'sw-mbtn sw-matk';
    const knob = document.createElement('div');
    knob.className = 'knob';
    b.appendChild(knob);
    this.useKnob = knob;
    this.useFace(-1, b);
    const inp = this.game.input;
    const R = 36;                          // 游标行程(px)
    const AIM_MIN = 56, AIM_SPAN = 110;    // 光标距离=AIM_MIN+|n|×AIM_SPAN(自玩家屏幕锚)
    const applyAim = (t: Touch) => {
      let dx = (t.clientX - this.useBaseX) / R;
      let dy = (t.clientY - this.useBaseY) / R;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      const n = Math.min(1, d);
      this.useKnob?.style.setProperty('transform',
        `translate(calc(-50% + ${(dx * R).toFixed(1)}px), calc(-50% + ${(dy * R).toFixed(1)}px))`);
      if (n < 0.14) return;              // 未推动:保持按下不搬光标(准星留原位)
      const g = this.game;
      const cam = g.camera;
      if (!cam || !g.player) return;
      const [psx, psy] = cam.worldToScreen(g.player.cx, g.player.cy);
      const dist = AIM_MIN + AIM_SPAN * n;
      // 虚拟光标钳屏内(4px 余量);smart cursor 开启时吸附逻辑自己接管该点
      g.input.mouseX = Math.max(4, Math.min(window.innerWidth - 4, psx + dx * dist));
      g.input.mouseY = Math.max(4, Math.min(window.innerHeight - 4, psy + dy * dist));
    };
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      if (this.useJoyId !== null) return;
      this.useJoyId = t.identifier;
      const r = b.getBoundingClientRect();
      this.useBaseX = r.left + r.width / 2;
      this.useBaseY = r.top + r.height / 2;
      b.classList.add('push');
      // 按下=使用边沿+电平(channel/autoReuse 与桌面同构)
      inp.mouseDown = true; inp.mouseHeld = true;
      applyAim(t);
    }, { passive: false });
    b.addEventListener('touchmove', (e) => {
      e.preventDefault(); e.stopPropagation();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.useJoyId) applyAim(t);
      }
    }, { passive: false });
    const endJoy = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.useJoyId) continue;
        e.preventDefault(); e.stopPropagation();
        this.useJoyId = null;
        b.classList.remove('push');
        this.useKnob?.style.setProperty('transform', 'translate(-50%,-50%)');
        inp.mouseDown = false; inp.mouseHeld = false;
      }
    };
    b.addEventListener('touchend', endJoy, { passive: false });
    b.addEventListener('touchcancel', endJoy, { passive: false });
    // 药水快捷槽:挂瞄准盘左上角(官方形态——持有治疗药水才显示,显隐在 refresh)
    const pot = document.createElement('div');
    pot.className = 'sw-mbtn sw-mpot';
    this.setIcon(pot, 'potion');
    pot.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.game.quickDrinkPotion('heal');
    }, { passive: false });
    this.potionBtn = pot;
    b.appendChild(pot);
    this.useBtn = b;
    this.root.appendChild(b);
  }

  /** 使用钮面:物品 id<0 或无效 → 十字准星(官方 smart-cursor 待机形)。
   *  .face img 居中在上,knob 游标圈保序垫底 */
  private useFace(itemId: number, btn?: HTMLElement): void {
    const b = btn ?? this.useBtn;
    if (!b || itemId === this.useFaceId) return;
    this.useFaceId = itemId;
    const knob = b.querySelector('.knob');
    b.innerHTML = '';
    let face = document.createElement('img');
    face.className = 'face';
    if (itemId >= 0) {
      try { face.src = iconUrl(this.game, itemId); }
      catch { face = this.faceIcon('ring'); }
    } else {
      face = this.faceIcon('ring');   // 空手=靶标环(与系统组狙击镜 cross 区分)
    }
    face.alt = '';
    b.appendChild(face);
    if (knob) b.appendChild(knob);
  }

  /** 面上十字准星 fallback(独立于物品 face 的类名通路) */
  private faceIcon(name: string): HTMLImageElement {
    const svg = art2svg(PIXEL_ART[name] ?? []);
    const img = document.createElement('img');
    img.className = 'face';
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    return img;
  }

  /** 右上系统组(横排,锚=minimap 左缘,refresh 动态):背包/全图/智能光标开关
   *  (+条件项:聊天=联机、旅程力量=journey 世界)。动作全走 tapVirtual 经
   *  Keybinds 表(重绑跟随;intent 由 runInventoryEscapeChain 解释)。
   *  官方屏上只有 4 主控——管理类集中此组,不再散落底部 */
  private buildSystemColumn(): void {
    const col = document.createElement('div');
    col.className = 'sw-msys';
    const mk = (iconName: string, onTap: () => void, cls = ''): HTMLElement => {
      const b = document.createElement('div');
      b.className = `sw-mbtn${cls ? ' ' + cls : ''}`;
      this.setIcon(b, iconName);
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        onTap();
      }, { passive: false });
      col.appendChild(b);
      return b;
    };
    mk('inventory', () => this.game.input.tapVirtual('Inventory', { virtualIntent: 'inventory' }));
    mk('map', () => this.game.input.tapVirtual('KeyM'));
    // 智能光标开关:tap=直翻(toggle 语义);点亮绿环=.on(refresh 维护)
    const sc = mk('cross', () => {
      this.game.smartCursor.wanted = !this.game.smartCursor.wanted;
      this.refresh();
    }, 'sw-mact-smart');
    this.smartBtn = sc;
    mk('chat', () => this.game.input.tapVirtual('Enter'), 'sw-mact-chat');
    mk('journey', () => this.game.input.tapVirtual('KeyC'), 'sw-mact-journey');
    this.root.appendChild(col);
  }

  /** 右下角暂停小钮(官方同位):tapVirtual('Inventory') 默认 Esc 形态=优先级链
   *  (有面板先收面板,无面板开暂停菜单) */
  private buildPauseBtn(): void {
    const b = document.createElement('div');
    b.className = 'sw-mbtn sw-mpause';
    this.setIcon(b, 'pause');
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.game.input.tapVirtual('Inventory', { virtualIntent: 'escape' });
    }, { passive: false });
    this.root.appendChild(b);
  }

  private buildFullscreen(): void {
    const b = document.createElement('div');
    b.className = 'sw-mfs';
    b.textContent = '⛶';
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void tryFullscreenLandscape();
    }, { passive: false });
    b.addEventListener('click', (e) => { e.stopPropagation(); void tryFullscreenLandscape(); });
    this.root.appendChild(b);
  }

  /** 状态刷新(1s 节流):使用钮物品面/药水可用亮起/SC 点亮/抓钩·宠物按装备显隐/
   *  条件项(journey/net)与系统列锚(minimap 底缘下沉) */
  private refresh(): void {
    const g = this.game;
    // 使用钮面=当前手持物品(官方手游同形;拾取切换后 ≤1s 跟手)
    const held = g.player.inv.slots[g.player.inv.selected];
    this.useFace(held ? held.id : -1);
    // 药水：有治疗药水 → 显示；受伤时亮起
    let hasHeal = false;
    for (const s of g.player.inv.slots) {
      if (!s) continue;
      const ff = itemFuncOfVid(vanillaIdOfItem(s.id));
      if (ff?.consumable && ff.healLife && !ff.createTile && !ff.shoot && !ff.pick && !ff.axe && !ff.hammer) {
        hasHeal = true;
        break;
      }
    }
    if (this.potionBtn) {
      this.potionBtn.style.display = hasHeal ? '' : 'none';
      this.potionBtn.classList.toggle('lit', hasHeal && g.player.hp < g.player.maxHp);
      this.potionBtn.classList.toggle('off', !hasHeal || g.player.buffs.healBlocked);
    }
    if (this.smartBtn) {
      this.smartBtn.classList.toggle('on', !!g.smartCursor.wanted);
      this.smartBtn.classList.toggle('off', !g.smartCursor.wanted);
    }
    this.root.classList.toggle('net', !!g.net?.active && g.spectatingSlot < 0);
    this.root.classList.toggle('journey', !!g.world?.isJourney);
    // 系统组锚=minimap 框左缘向左(横排;T2/T3 缩放档由 minimapRect 自动跟随)。
    // minimap 未上报时回落 CSS 默认 right:210px
    const sys = this.root.querySelector('.sw-msys') as HTMLElement | null;
    if (sys) {
      const mr = (g.renderer as unknown as { minimapRect?: { x: number; y: number; w: number; h: number } }).minimapRect;
      if (mr && mr.w > 0) sys.style.right = `${Math.max(4, window.innerWidth - mr.x - 10)}px`;
    }
  }
}

/** safe insets 快捷读取(HudScale 写入 documentElement;未初始化时 0) */
function safeL(): number { return parseFloat(document.documentElement.style.getPropertyValue('--sw-sal')) || 0; }
function safeB(): number { return parseFloat(document.documentElement.style.getPropertyValue('--sw-sab')) || 0; }
