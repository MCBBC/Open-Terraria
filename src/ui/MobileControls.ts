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
/* ---- 官方手游皮肤基准:半透明深蓝圆底+浅蓝描边+白色像素图标 ---- */
.sw-mjoy, .sw-mjump, .sw-mbtn {
  border-radius:50%;
  background:radial-gradient(circle at 50% 36%, rgba(64,92,184,0.62), rgba(28,42,98,0.55) 74%);
  box-shadow:inset 0 0 0 2px rgba(170,198,255,0.34), 0 2px 8px rgba(8,12,28,0.30);
  color:#eef2ff; touch-action:none;
  opacity:var(--mbtn-alpha,0.82);
  transform:scale(var(--mbtn-scale,1));
}
/* 按压反馈:brightness steps(2,end) 与像素语言一致(不用连续 scale 免半像素 shimmer) */
.sw-mjoy.press, .sw-mjump.press, .sw-mbtn.press {
  filter:brightness(1.3);
  box-shadow:inset 0 0 0 2px rgba(220,232,255,0.6), 0 1px 5px rgba(8,12,28,0.35);
  transition:filter 70ms steps(2,end), box-shadow 70ms steps(2,end);
}
.sw-mbtn.off { opacity:calc(var(--mbtn-alpha,0.82)*0.42); filter:grayscale(0.7); }
.sw-mbtn.lit { filter:brightness(1.35); }
.sw-mbtn.on  { box-shadow:inset 0 0 0 3px rgba(141,224,141,0.85), inset 0 0 10px rgba(141,224,141,0.45), 0 2px 8px rgba(8,12,28,0.3); }
/* 白色像素图标居中(内联 SVG data URI,crispEdges 阶梯感) */
.sw-mbtn img, .sw-mjump img { width:56%; height:56%; image-rendering:pixelated; pointer-events:none;
  image-rendering: pixelated; opacity:0.95; }
/* ---- 左下:固定罗盘摇杆(官方默认形态;浮动模式为 Settings 可选项) ---- */
.sw-mjoy { position:absolute; left:calc(20px + env(safe-area-inset-left)); bottom:calc(96px + env(safe-area-inset-bottom));
  width:128px; height:128px; }
/* 罗盘四点(N/E/S/W 白点,radiusX 位) */
.sw-mjoy::before { content:''; position:absolute; inset:10px; border-radius:50%;
  background:
    radial-gradient(circle 3.5px at 50% 8%,  #dfe7ff 97%, transparent),
    radial-gradient(circle 3.5px at 92% 50%, #dfe7ff 97%, transparent),
    radial-gradient(circle 3.5px at 50% 92%, #dfe7ff 97%, transparent),
    radial-gradient(circle 3.5px at 8% 50%,  #dfe7ff 97%, transparent);
  opacity:0.85; }
.sw-mjoy.idle { opacity:0.24; }
.sw-mjoy .knob { position:absolute; left:50%; top:50%; width:34px; height:34px;
  border-radius:50%; transform:translate(-50%,-50%);
  background:radial-gradient(circle at 42% 34%, rgba(228,238,255,0.9), rgba(120,150,230,0.65));
  box-shadow:inset 0 0 0 2px rgba(235,242,255,0.55), 0 0 0 2px rgba(15,22,48,0.35); }
/* ---- 底部动作小钮横排(官方形态):SC/药水/抓钩/宠物 + 条件项旅程·聊天 ---- */
.sw-mrow { position:absolute; left:calc(168px + env(safe-area-inset-left)); bottom:calc(14px + env(safe-area-inset-bottom));
  display:flex; gap:10px; align-items:center; }
.sw-mrow .sw-mbtn { position:relative; width:46px; height:46px; }
.sw-mact-journey, .sw-mact-chat { display:none; }
.sw-mobile.journey .sw-mact-journey { display:flex; }
.sw-mobile.net   .sw-mact-chat     { display:flex; }
/* ---- 右下:跳跃 / 使用 双大钮(官方弓形位) ---- */
.sw-mjump { position:absolute; right:calc(112px + env(safe-area-inset-right)); bottom:calc(34px + env(safe-area-inset-bottom));
  width:66px; height:66px; display:flex; align-items:center; justify-content:center; }
.sw-matk  { position:absolute; right:calc(16px + env(safe-area-inset-right)); bottom:calc(58px + env(safe-area-inset-bottom));
  width:92px; height:92px; display:flex; align-items:center; justify-content:center; }
.sw-matk img { width:72%; height:72%; }
.sw-matk::before { content:''; position:absolute; inset:-10px; border-radius:50%; } /* 隐形扩边 hitbox */
/* 右摇杆游标圈(推杆跟手;物品面居中其上) */
.sw-matk .knob { position:absolute; left:50%; top:50%; width:34px; height:34px;
  border-radius:50%; transform:translate(-50%,-50%);
  border:2px solid rgba(225,235,255,0.55); background:rgba(120,150,230,0.30); }
.sw-matk .face { position:absolute; left:50%; top:50%; width:56%; height:56%;
  transform:translate(-50%,-50%); image-rendering:pixelated; pointer-events:none; }
.sw-matk.push .knob { border-color:rgba(245,250,255,0.9); background:rgba(160,190,255,0.45); }
/* ---- 右上系统列(网页版必需的窗口管理键;锚随 minimap 底缘) ---- */
.sw-msys { position:absolute; display:flex; flex-direction:column; gap:10px;
  right:calc(10px + env(safe-area-inset-right)); top:224px; align-items:center; }
.sw-msys .sw-mbtn { position:relative; width:44px; height:44px; }
/* ---- 全屏/横屏兜底钮 ---- */
.sw-mfs { position:absolute; right:calc(58px + env(safe-area-inset-right)); top:calc(6px + env(safe-area-inset-top));
  width:38px; height:30px; border-radius:7px; font-size:15px;
  background:radial-gradient(circle at 50% 40%, rgba(64,92,184,0.5), rgba(28,42,98,0.45));
  box-shadow:inset 0 0 0 2px rgba(170,198,255,0.3);
  color:#eef2ff; display:flex; align-items:center; justify-content:center;
  touch-action:manipulation; }
.sw-mrotate { position:absolute; left:50%; top:calc(42px + env(safe-area-inset-top)); transform:translateX(-50%);
  background:rgba(20,26,52,0.82); color:#ffe8a0; font-size:12px; padding:5px 14px;
  border-radius:8px; border:1px solid #7d92d6; display:none; pointer-events:none;
  white-space:nowrap; }
@media (orientation: portrait) { .sw-mobile .sw-mrotate { display:block; top:calc(122px + env(safe-area-inset-top)); } }
/* T3 竖屏提示条下移到 hotbar 两行(~110px)之下,不压 HUD */
`;

/** 内联像素风图标(12×12 栅格 rect 语言+crispEdges 保持阶梯感,零贴图零网络请求;
 *  P1 攻击/抓钩/药水钮可换物品 sprite 实时上钮) */
const ICONS: Record<string, string> = {};
function icon(name: string): string {
  if (!ICONS[name]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${PIXEL_ICON_PATHS[name] ?? ''}</svg>`;
    ICONS[name] = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  return ICONS[name];
}
const R = (x: number, y: number, w: number, h: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f2f5ff"/>`;
const PIXEL_ICON_PATHS: Record<string, string> = {
  // 上箭头(跳跃;三层阶梯三角+直杆,12 栅格内保持像素阶梯感)
  jump: R(4, 1, 2, 1) + R(3, 2, 4, 1) + R(2, 3, 6, 1) + R(4, 4, 2, 7),
  use: R(5, 2, 2, 4) + R(3, 5, 6, 2) + R(5, 8, 2, 2),
  inventory: R(4, 1, 4, 2) + R(2, 3, 8, 7),
  map: R(1, 2, 10, 8) + '<rect x="4" y="2" width="1" height="8" fill="#45507a"/><rect x="8" y="2" width="1" height="8" fill="#45507a"/>',
  pause: R(3, 2, 2, 8) + R(7, 2, 2, 8),
  chat: R(1, 2, 10, 7) + R(3, 9, 4, 1),
  cross: R(5, 1, 2, 10) + R(1, 5, 10, 2),
  journey: R(5, 1, 2, 10) + R(1, 5, 10, 2) + R(4, 4, 4, 4),
  grapple: R(5, 1, 2, 5) + R(3, 6, 2, 2) + R(7, 6, 2, 2) + R(2, 8, 2, 2) + R(8, 8, 2, 2),
  potion: R(4, 1, 4, 2) + R(3, 3, 6, 6) + R(5, 4, 2, 3),
  pet: R(2, 4, 8, 5) + R(3, 2, 2, 2) + R(7, 2, 2, 2),
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
  /** 底部动作排各钮(use/smart/potion/grapple/pet) */
  private useBtn: HTMLElement | null = null;
  /** 右摇杆(瞄准杆)状态:pointer 跟踪/盘心锚/游标圈 */
  private useJoyId: number | null = null;
  private useBaseX = 0;
  private useBaseY = 0;
  private useKnob: HTMLElement | null = null;
  private smartBtn: HTMLElement | null = null;
  private potionBtn: HTMLElement | null = null;
  private grapBtn: HTMLElement | null = null;
  private petBtn: HTMLElement | null = null;
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
    this.buildActionRow();
    this.buildSystemColumn();
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
      catch { face = this.faceIcon('cross'); }
    } else {
      face = this.faceIcon('cross');
    }
    face.alt = '';
    b.appendChild(face);
    if (knob) b.appendChild(knob);
  }

  /** 面上十字准星 fallback(独立于物品 face 的类名通路) */
  private faceIcon(name: string): HTMLImageElement {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${PIXEL_ICON_PATHS[name] ?? ''}</svg>`;
    const img = document.createElement('img');
    img.className = 'face';
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    return img;
  }

  /** 底部动作小钮横排(官方形态):智能光标/治疗药水/抓钩/宠物 + 条件项旅程·聊天 */
  private buildActionRow(): void {
    const row = document.createElement('div');
    row.className = 'sw-mrow';
    // 智能光标开关:tap=直翻(toggle 语义;旧 pulse 两连边沿相互抵消已修)。
    // 点亮环=.on(refresh 维护)
    const sc = document.createElement('div');
    sc.className = 'sw-mbtn sw-mact-smart';
    this.setIcon(sc, 'cross');
    sc.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.game.smartCursor.wanted = !this.game.smartCursor.wanted;
      this.refresh();
    }, { passive: false });
    this.smartBtn = sc;
    row.appendChild(sc);
    // 治疗药水(quickHeal 统一口;扫描显隐在 refresh)
    const pot = document.createElement('div');
    pot.className = 'sw-mbtn sw-mact-pot';
    this.setIcon(pot, 'potion');
    this.bindBtn(pot, () => this.game.quickDrinkPotion('heal'));
    this.potionBtn = pot;
    row.appendChild(pot);
    // 抓钩(摇杆推动取轴,否则角色朝向)
    const grp = document.createElement('div');
    grp.className = 'sw-mbtn sw-mact-grap';
    this.setIcon(grp, 'grapple');
    this.bindBtn(grp, () => {
      this.game.useEquippedGrapple(
        Math.abs(this.axis.x) > 0.3 || Math.abs(this.axis.y) > 0.3 ? this.axis.x : null,
        Math.abs(this.axis.x) > 0.3 || Math.abs(this.axis.y) > 0.3 ? this.axis.y : null);
    });
    this.grapBtn = grp;
    row.appendChild(grp);
    // 宠物召唤/收回(坐骑引擎未实装仅提示;原逻辑保留)
    const pet = document.createElement('div');
    pet.className = 'sw-mbtn sw-mact-pet';
    this.setIcon(pet, 'pet');
    this.bindBtn(pet, () => {
      if (this.game.player.inv.miscEquips[0] || this.game.player.inv.miscEquips[1]) {
        this.game.togglePets();
      } else {
        this.game.cb.onToast?.(Lang.text('Mods.SandboxWorld.Toast.MobileRideTodo'));
      }
    });
    this.petBtn = pet;
    row.appendChild(pet);
    // 条件项:旅程力量(world.isJourney)/聊天(net.active)
    const jn = document.createElement('div');
    jn.className = 'sw-mbtn sw-mact-journey';
    this.setIcon(jn, 'journey');
    jn.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.game.input.tapVirtual('KeyC');
    }, { passive: false });
    row.appendChild(jn);
    const ch = document.createElement('div');
    ch.className = 'sw-mbtn sw-mact-chat';
    this.setIcon(ch, 'chat');
    ch.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.game.input.tapVirtual('Enter');
    }, { passive: false });
    row.appendChild(ch);
    this.root.appendChild(row);
  }

  /** 右上系统列(窗口管理三键):背包(E 形开背包)/全图(M)/暂停(Esc 形优先级链)。
   *  动作全走 tapVirtual 经 Keybinds 表(重绑跟随,intent 由 runInventoryEscapeChain 解释) */
  private buildSystemColumn(): void {
    const col = document.createElement('div');
    col.className = 'sw-msys';
    const mk = (iconName: string, onTap: () => void): void => {
      const b = document.createElement('div');
      b.className = 'sw-mbtn';
      this.setIcon(b, iconName);
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        onTap();
      }, { passive: false });
      col.appendChild(b);
    };
    mk('inventory', () => this.game.input.tapVirtual('Inventory', { virtualIntent: 'inventory' }));
    mk('map', () => this.game.input.tapVirtual('KeyM'));
    mk('pause', () => this.game.input.tapVirtual('Inventory', { virtualIntent: 'escape' }));
    this.root.appendChild(col);
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
    if (this.grapBtn) this.grapBtn.style.display = g.player.inv.miscEquips[4] ? '' : 'none';
    if (this.petBtn) {
      const ride = g.player.inv.miscEquips[3] || g.player.inv.miscEquips[0];
      this.petBtn.style.display = ride ? '' : 'none';
    }
    this.root.classList.toggle('net', !!g.net?.active && g.spectatingSlot < 0);
    this.root.classList.toggle('journey', !!g.world?.isJourney);
    // 系统列锚=minimap 黑垫底缘(+14):T2/T3 缩放档由 minimapRect 自动跟随
    const sys = this.root.querySelector('.sw-msys') as HTMLElement | null;
    if (sys) {
      const mr = (g.renderer as unknown as { minimapRect?: { x: number; y: number; w: number; h: number } }).minimapRect;
      if (mr && mr.h > 0) sys.style.top = `${mr.y + mr.h + 14}px`;
    }
  }
}

/** safe insets 快捷读取(HudScale 写入 documentElement;未初始化时 0) */
function safeL(): number { return parseFloat(document.documentElement.style.getPropertyValue('--sw-sal')) || 0; }
function safeB(): number { return parseFloat(document.documentElement.style.getPropertyValue('--sw-sab')) || 0; }
