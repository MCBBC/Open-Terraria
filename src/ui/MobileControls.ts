// 移动端虚拟控件层（触屏设备启用；桌面零影响——不渲染任何 DOM）。
// 设计原则（对现有操作零侵入）：
//  - 所有按键合成 = 注入 Input.touchKeys / mouseDown / mouseHeld，
//    游戏侧消费链（updateUse/移动/智能光标 updateWanted）完全复用桌面语义；
//  - 世界区域触摸由 Input 自身合成（点击=左键、拖动=瞄准、长按=右键交互），
//    本层的控件 touchstart 均 stopPropagation+preventDefault，不落世界层；
//  - 全屏/横屏：进世界后在用户手势内尝试 requestFullscreen + orientation.lock
//    （iOS Safari 不支持 lock——静默降级），并提供常驻 ⛶ 按钮兜底。
import type { Game } from '../core/Game';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { vanillaIdOfItem } from '../stats/Shimmer';
import { Lang } from '../i18n/Lang';

/** 触屏设备判定（粗指针 = 手机/平板；桌面触摸屏带鼠标时仍启用——可玩不碍事） */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/** 移动端画布 UI 缩放（小地图/资源条等按此缩小；桌面恒 1——渲染路径零变化） */
export function mobileUiScale(): number {
  return isTouchDevice() ? 0.7 : 1;
}

const CSS = `
.sw-mobile { position:fixed; inset:0; pointer-events:none; z-index:150;
  font-family:inherit; user-select:none; -webkit-user-select:none; }
.sw-mobile > * { pointer-events:auto; }
/* ---- 共用按钮基底：玻璃拟态（模糊底 + 径向高光 + 内描边） ---- */
.sw-mjoy, .sw-mjump, .sw-mbtn {
  border-radius:50%;
  background:
    radial-gradient(circle at 32% 28%, rgba(255,255,255,0.22), rgba(255,255,255,0) 42%),
    radial-gradient(circle at 50% 55%, rgba(38,48,86,0.66), rgba(18,24,48,0.55));
  border:1.5px solid rgba(150,168,225,0.55);
  box-shadow:0 2px 10px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.18);
  backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
  color:#e8ecf8; touch-action:none;
  transition:transform 90ms ease, box-shadow 90ms ease, filter 90ms ease;
}
.sw-mjoy:active, .sw-mjump.press, .sw-mbtn.press {
  transform:scale(0.93);
  filter:brightness(1.3);
  box-shadow:0 1px 5px rgba(0,0,0,0.4), inset 0 1px 3px rgba(255,255,255,0.3), 0 0 12px rgba(140,165,235,0.35);
}
.sw-mbtn.off { opacity:0.38; filter:grayscale(0.6); }
.sw-mbtn.lit { border-color:#ffd75a; box-shadow:0 0 10px rgba(255,215,90,0.5), inset 0 1px 2px rgba(255,255,255,0.18); }
/* ---- 左侧：摇杆 + 跳跃 ---- */
.sw-mjoy { position:absolute; left:calc(14px + env(safe-area-inset-left)); bottom:calc(64px + env(safe-area-inset-bottom));
  width:118px; height:118px; }
.sw-mjoy::before { content:''; position:absolute; inset:14px; border-radius:50%;
  border:1px dashed rgba(150,168,225,0.28); }
.sw-mjoy .knob { position:absolute; left:50%; top:50%; width:46px; height:46px;
  border-radius:50%; transform:translate(-50%,-50%);
  background:radial-gradient(circle at 34% 30%, rgba(230,238,255,0.85), rgba(125,146,214,0.6) 60%, rgba(80,96,160,0.55));
  border:1.5px solid rgba(225,232,255,0.75);
  box-shadow:0 2px 8px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.35); }
.sw-mjump { position:absolute; left:calc(150px + env(safe-area-inset-left)); bottom:calc(88px + env(safe-area-inset-bottom));
  width:58px; height:58px; font-size:22px; line-height:1;
  color:#dfffe4; display:flex; align-items:center; justify-content:center; }
/* ---- 右侧：动作簇 ---- */
.sw-mbtn { position:absolute; display:flex; align-items:center; justify-content:center;
  font-size:13px; font-weight:bold; text-align:center; line-height:1.15; }
.sw-matk  { right:calc(18px + env(safe-area-inset-right)); bottom:calc(108px + env(safe-area-inset-bottom));
  width:72px; height:72px; font-size:27px;
  background:
    radial-gradient(circle at 32% 28%, rgba(255,255,255,0.2), rgba(255,255,255,0) 42%),
    radial-gradient(circle at 50% 55%, rgba(120,52,52,0.6), rgba(66,26,30,0.55));
  border-color:rgba(235,150,150,0.6); }
.sw-msmart { right:calc(104px + env(safe-area-inset-right)); bottom:calc(184px + env(safe-area-inset-bottom));
  width:46px; height:46px; font-size:10px; }
.sw-msmart.on { border-color:#8de08d; box-shadow:0 0 9px rgba(141,224,141,0.45), inset 0 1px 2px rgba(255,255,255,0.18); }
.sw-mgrap { right:calc(104px + env(safe-area-inset-right)); bottom:calc(128px + env(safe-area-inset-bottom));
  width:46px; height:46px; font-size:19px; }
.sw-mpot  { right:calc(18px + env(safe-area-inset-right)); bottom:calc(196px + env(safe-area-inset-bottom));
  width:46px; height:46px; font-size:20px; }
.sw-mride { right:calc(18px + env(safe-area-inset-right)); bottom:calc(256px + env(safe-area-inset-bottom));
  width:42px; height:42px; font-size:17px; }
/* ---- 全屏/横屏 ---- */
.sw-mfs { position:absolute; right:calc(10px + env(safe-area-inset-right)); top:calc(8px + env(safe-area-inset-top));
  width:38px; height:30px; border-radius:7px; font-size:16px;
  background:rgba(26,32,60,0.5); border:1px solid rgba(150,168,225,0.45);
  color:#e8ecf8; display:flex; align-items:center; justify-content:center;
  touch-action:manipulation; backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px); }
.sw-mrotate { position:absolute; left:50%; top:calc(42px + env(safe-area-inset-top)); transform:translateX(-50%);
  background:rgba(20,26,52,0.82); color:#ffe8a0; font-size:12px; padding:5px 14px;
  border-radius:8px; border:1px solid #7d92d6; display:none; pointer-events:none; }
@media (orientation: portrait) { .sw-mobile .sw-mrotate { display:block; } }
`;

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
  /** 摇杆轴 -1..1（钩爪方向用；触键注入按死区） */
  axis = { x: 0, y: 0 };
  private joyId: number | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private rotListener: (() => void) | null = null;
  private potionBtn: HTMLElement | null = null;
  private smartBtn: HTMLElement | null = null;
  private grapBtn: HTMLElement | null = null;
  private rideBtn: HTMLElement | null = null;

  constructor(game: Game, parent: HTMLElement) {
    ensureCss();
    this.game = game;
    this.root = document.createElement('div');
    this.root.className = 'sw-mobile';
    this.buildJoystick();
    this.buildJump();
    this.buildAttack();
    this.buildSmartCursor();
    this.buildGrapple();
    this.buildPotion();
    this.buildRide();
    this.buildFullscreen();
    const rot = document.createElement('div');
    rot.className = 'sw-mrotate';
    rot.textContent = '📱 请横屏获得最佳体验';
    this.root.appendChild(rot);
    parent.appendChild(this.root);
    // 状态刷新（药水可用/智能光标态/按钮可见性）：1s 节流
    this.refreshTimer = setInterval(() => this.refresh(), 1000);
    // 横竖屏变化时也刷
    this.rotListener = () => this.refresh();
    window.addEventListener('orientationchange', this.rotListener);
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.rotListener) window.removeEventListener('orientationchange', this.rotListener);
    this.game.input.touchKeys.clear();
    this.root.remove();
  }

  // ---- 构件 ----
  private bindButton(el: HTMLElement, onDown: () => void, onUp?: () => void): void {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('press');
      onDown();
    }, { passive: false });
    const end = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('press');
      onUp?.();
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }

  private buildJoystick(): void {
    const joy = document.createElement('div');
    joy.className = 'sw-mjoy';
    const knob = document.createElement('div');
    knob.className = 'knob';
    joy.appendChild(knob);
    const R = 38; // 死区/满偏半径(px)——配 118px 底盘
    const apply = () => {
      const tk = this.game.input.touchKeys;
      tk.delete('KeyA'); tk.delete('KeyD'); tk.delete('KeyW'); tk.delete('KeyS');
      if (this.axis.x > 0.35) tk.add('KeyD');
      else if (this.axis.x < -0.35) tk.add('KeyA');
      if (this.axis.y < -0.55) tk.add('KeyW');
      else if (this.axis.y > 0.55) tk.add('KeyS');
    };
    const move = (t: Touch) => {
      const r = joy.getBoundingClientRect();
      let dx = (t.clientX - (r.left + r.width / 2)) / R;
      let dy = (t.clientY - (r.top + r.height / 2)) / R;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      this.axis.x = dx; this.axis.y = dy;
      knob.style.transform = `translate(calc(-50% + ${dx * R}px), calc(-50% + ${dy * R}px))`;
      apply();
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      move(t);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault(); e.stopPropagation();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) move(t);
      }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.joyId) continue;
        e.preventDefault(); e.stopPropagation();
        this.joyId = null;
        this.axis.x = 0; this.axis.y = 0;
        knob.style.transform = 'translate(-50%,-50%)';
        apply();
      }
    };
    joy.addEventListener('touchend', end, { passive: false });
    joy.addEventListener('touchcancel', end, { passive: false });
    this.root.appendChild(joy);
  }

  private buildJump(): void {
    const b = document.createElement('div');
    b.className = 'sw-mjump';
    b.textContent = '⤒';
    this.bindButton(b, () => this.game.input.touchKeys.add('Space'), () => this.game.input.touchKeys.delete('Space'));
    this.root.appendChild(b);
  }

  private buildAttack(): void {
    const b = document.createElement('div');
    b.className = 'sw-mbtn sw-matk';
    b.textContent = '⚔';
    const inp = this.game.input;
    // 按住 = 一次 mousedown 边沿 + mouseHeld 电平（悠悠球/连枷 channel 语义正确；
    // 自动连发武器由 canChain 链条自然重挥，非自动武器与桌面点击一致）
    this.bindButton(b,
      () => { inp.mouseDown = true; inp.mouseHeld = true; },
      () => { inp.mouseDown = false; inp.mouseHeld = false; });
    this.root.appendChild(b);
  }

  private buildSmartCursor(): void {
    const b = document.createElement('div');
    b.className = 'sw-mbtn sw-msmart';
    b.textContent = '◎光标';
    // 注入 ControlLeft 电平 + 同步脉冲（Toggle=点击翻转 / Hold=按住启用；
    //  脉冲直调 updateWanted 不依赖 tick 窗口——见 Game.pulseSmartCursor）
    this.bindButton(b,
      () => { this.game.input.touchKeys.add('ControlLeft'); this.game.pulseSmartCursor(true); },
      () => { this.game.input.touchKeys.delete('ControlLeft'); this.game.pulseSmartCursor(false); });
    this.smartBtn = b;
    this.root.appendChild(b);
  }

  private buildGrapple(): void {
    const b = document.createElement('div');
    b.className = 'sw-mbtn sw-mgrap';
    b.textContent = '🪝';
    this.bindButton(b, () => {
      // 方向：摇杆推动则取轴，否则角色朝向
      this.game.useEquippedGrapple(
        Math.abs(this.axis.x) > 0.3 || Math.abs(this.axis.y) > 0.3 ? this.axis.x : null,
        Math.abs(this.axis.x) > 0.3 || Math.abs(this.axis.y) > 0.3 ? this.axis.y : null);
    });
    this.grapBtn = b;
    this.root.appendChild(b);
  }

  private buildPotion(): void {
    const b = document.createElement('div');
    b.className = 'sw-mbtn sw-mpot';
    b.textContent = '🧪';
    this.bindButton(b, () => this.game.quickDrinkPotion('heal'));
    this.potionBtn = b;
    this.root.appendChild(b);
  }

  private buildRide(): void {
    const b = document.createElement('div');
    b.className = 'sw-mbtn sw-mride';
    b.textContent = '🐴';
    this.bindButton(b, () => {
      // 坐骑/宠物引擎未实装（矿车除外）——占位反馈，引擎接通后改为召唤/收回
      this.game.cb.onToast?.(Lang.text('Mods.SandboxWorld.Toast.MobileRideTodo'));
    });
    this.rideBtn = b;
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

  /** 按钮态刷新：药水可用亮起 / 智能光标激活 / 钩爪·坐骑按装备显隐 */
  private refresh(): void {
    const g = this.game;
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
    if (this.smartBtn) this.smartBtn.classList.toggle('on', !!g.smartCursor.wanted);
    if (this.grapBtn) this.grapBtn.style.display = g.player.inv.miscEquips[4] ? '' : 'none';
    if (this.rideBtn) {
      const ride = g.player.inv.miscEquips[3] || g.player.inv.miscEquips[0];
      this.rideBtn.style.display = ride ? '' : 'none';
    }
  }
}
