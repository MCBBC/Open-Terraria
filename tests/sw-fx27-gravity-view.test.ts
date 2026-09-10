// SW-FX27 波 2：反重力呈现面翻转 + 输入换算（GameViewMatrix.Effects=FlipVertically 域）。
//  金标：Main.cs:62944-62945（Effects 门）/ :2835-2842（MouseWorld 逆变换）/
//  :3242-3271（ReverseGravitySupport 三重载）/ Utils.cs:1130-1138（ToScreenPosition /
//  ScreenToWorldPosition = 翻转矩阵正逆）/ :47397-47399（DrawSmartCursor 屏位手翻）/
//  :46504-46510（签名泡手翻）/ SmartSelectGamepadPointer.cs:23-38（目标格反演式）/
//  SmartCursorHelper.cs:2435-2441（num9 gravDir 档）/ :196（轨道 314 让位门）。
//  ★主判据 = gd=1 逐位恒等：flipY 缺省 false 时 screenToWorld/worldToScreen 与
//  旧式（本文件内联的 legacy 式）逐位相同；gd=-1 分支只在 flipY 置位后可达。
//  ★变异证红：每组断言标注「旧实现退化值」——回退任一刀对应组必红（M1-M3 见组注）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Camera } from '../src/render/Camera';
import { SmartSelect } from '../src/player/SmartSelect';
import type { SmartSelectEnv } from '../src/player/SmartSelect';

const SRC = (p: string): string => readFileSync(join(import.meta.dirname, '..', 'src', p), 'utf8');

// 旧实现参照式（FX27 改造前 Camera.ts:61-66 原文——gd=1 恒等判据的基准）
function legacyWorldToScreen(c: Camera, wx: number, wy: number): [number, number] {
  return [(wx - c.x + c.punchX) * c.zoom + c.viewW / 2, (wy - c.y + c.punchY) * c.zoom + c.viewH / 2];
}
function legacyScreenToWorld(c: Camera, sx: number, sy: number): [number, number] {
  return [(sx - c.viewW / 2) / c.zoom + c.x, (sy - c.viewH / 2) / c.zoom + c.y];
}

function makeCam(): Camera {
  const c = new Camera(8400, 2400);
  c.viewW = 800; c.viewH = 600;
  c.x = 1000; c.y = 2000;
  c.zoom = 1.25;
  return c;   // punchX/punchY 缺省 0（tickPunch 才写）
}

const SCREEN_PTS: Array<[number, number]> = [
  [0, 0], [799, 599], [400, 300], [123, 456], [1, 1], [640, 480],
];

describe('Camera gd=1 逐位恒等（主判据；flipY 缺省 false）', () => {
  it('flipY 缺省 false——gd=1 玩家零基线差', () => {
    expect(new Camera(100, 100).flipY).toBe(false);   // 旧实现退化值：无此字段（恒 false 同面）
  });
  it('screenToWorld/worldToScreen 与旧式逐位全等（zoom=1.25 非整数档）', () => {
    const c = makeCam();
    for (const [sx, sy] of SCREEN_PTS) {
      const [wx, wy] = c.screenToWorld(sx, sy);
      const [lx, ly] = legacyScreenToWorld(c, sx, sy);
      expect(wx).toBe(lx);   // ★逐位（===）——任何式序改动即红
      expect(wy).toBe(ly);
    }
    for (const [wx, wy] of [[1000, 2000], [100.5, 2000.25], [640, 480]] as const) {
      const [sx, sy] = c.worldToScreen(wx, wy);
      const [lx, ly] = legacyWorldToScreen(c, wx, wy);
      expect(sx).toBe(lx);
      expect(sy).toBe(ly);
    }
  });
});

describe('Camera gd=-1 激活面（ReverseGravitySupport / MouseWorld 逆变换）', () => {
  it('flipY=true：screenToWorld(mx,my) ≡ 旧式(mx, viewH-my) 逐位（M1：删翻转分支此组红）', () => {
    const c = makeCam();
    c.flipY = true;
    for (const [sx, sy] of SCREEN_PTS) {
      const [wx, wy] = c.screenToWorld(sx, sy);
      const [lx, ly] = legacyScreenToWorld(c, sx, c.viewH - sy);   // ReverseGravitySupport(MouseScreen) :3242-3250
      expect(wx).toBe(lx);
      expect(wy).toBe(ly);
    }
  });
  it('MouseWorld 原式等价（Main.cs:2835-2842 result.Y = screenPosition.Y + screenHeight - mouseY）', () => {
    const c = makeCam();
    c.flipY = true;
    for (const [sx, sy] of SCREEN_PTS) {
      const [, wy] = c.screenToWorld(sx, sy);
      const screenTopY = c.y - c.viewH / 2 / c.zoom;
      const screenHeight = c.viewH / c.zoom;              // 世界比例屏高（SetZoom_World 口径）
      const mouseYWorld = sy / c.zoom;                    // 裸鼠标 Y → 世界比例屏 px
      expect(Math.abs(wy - (screenTopY + screenHeight - mouseYWorld))).toBeLessThan(1e-8);
    }
  });
  it('worldToScreenDisplayed：显示位 = 翻转(旧式)（Utils.cs:1131 ToScreenPosition 逆矩阵语义；gd=1 恒等）', () => {
    const c = makeCam();
    const [dx1, dy1] = c.worldToScreenDisplayed(1000, 2000);
    const [lx, ly] = legacyWorldToScreen(c, 1000, 2000);
    expect(dx1).toBe(lx);
    expect(dy1).toBe(ly);                                  // gd=1：逐位同旧式
    c.flipY = true;
    const [dx2, dy2] = c.worldToScreenDisplayed(1000, 2000);
    expect(dx2).toBe(lx);
    expect(dy2).toBe(c.viewH - ly);                        // gd=-1：y'=viewH-y（:47397 手翻语义）
  });
  it('往返一致性：worldToScreenDisplayed(screenToWorld(mx,my)) = (mx,my)（翻转态）', () => {
    const c = makeCam();
    c.flipY = true;
    for (const [sx, sy] of SCREEN_PTS) {
      const [wx, wy] = c.screenToWorld(sx, sy);
      const [bx, by] = c.worldToScreenDisplayed(wx, wy);
      expect(Math.abs(bx - sx)).toBeLessThan(1e-6);
      expect(Math.abs(by - sy)).toBeLessThan(1e-6);
    }
  });
});

describe('SmartSelect 目标格反演（SmartSelectGamepadPointer.cs:23-38）', () => {
  const sel = new SmartSelect();
  const call = (env: SmartSelectEnv): { tX: number; tY: number } =>
    (sel as unknown as { getTargetTile(e: SmartSelectEnv): { tX: number; tY: number } }).getTargetTile(env);

  it('gd=1：普通式 floor(mouseY/16)（翻转支不达——旧实现退化值=钉 gravDir:1 同面）', () => {
    const env = {
      controlTorch: false, usingGamepad: false, st: {} as never,
      mouseX: 1440, mouseY: 1450,
      screenTopY: 1000, screenHeight: 600,
      player: { x: 0, y: 0, w: 20, h: 42, gravDir: 1, wet: false },
    } as unknown as SmartSelectEnv;
    expect(call(env).tY).toBe(Math.floor(1450 / 16));
  });
  it('gd=-1：rawMouseYWorldScale 喂原式 → (screenTopY+screenHeight-rawY)/16（M2：喂翻转后世界 Y = 二次反演 → 71≠90 必红）', () => {
    // 场景：视口 600（zoom=1），裸鼠标屏 Y=150 → 翻转态鼠标下世界 Y = 1000+600-150 = 1450
    const env = {
      controlTorch: false, usingGamepad: false, st: {} as never,
      mouseX: 1440, mouseY: 1450,              // env.mouseY = 翻转修正后世界 Y（camera.screenToWorld 产物）
      rawMouseYWorldScale: 150,                // 裸鼠标世界比例屏 Y（rawScreenY/zoom）
      screenTopY: 1000, screenHeight: 600,
      player: { x: 0, y: 0, w: 20, h: 42, gravDir: -1, wet: false },
    } as unknown as SmartSelectEnv;
    expect(call(env).tY).toBe(90);             // (1000+600-150)/16 = 90 —— 原式直算
    expect(call(env).tY).toBe(Math.floor(1450 / 16));   // 与普通式（翻转修正世界 Y）一致
    // 变异对照：二次反演（把翻转后世界 Y 当裸屏 Y 再反演）= 71 ≠ 90 —— 本组对它红
    expect(Math.floor((1000 + 600 - (1450 - 1000)) / 16)).toBe(71);
  });
});

describe('结构锁（源文本锚——防静默回退/整文件覆写）', () => {
  it('Camera：screenToWorld 内置 ReverseGravitySupport 门（在换算 return 之前）', () => {
    const src = SRC('render/Camera.ts');
    const gate = src.indexOf('if (this.flipY) sy = this.viewH - sy;');
    const ret = src.indexOf('return [(sx - this.viewW / 2) / this.zoom + this.x');
    expect(gate).toBeGreaterThan(-1);        // M1 变异：删此行 → 本断言红
    expect(ret).toBeGreaterThan(gate);       // 门在换算前（先翻 Y 再换算）
    expect(src).toContain('worldToScreenDisplayed');
    expect(src).toContain('Main.cs:62944');  // 金标行号锚
    expect(src).toContain('2835-2842');      // MouseWorld 逆变换锚（:2835-2842）
  });
  it('Renderer：翻转点存在且门=cam.flipY && !_capturePass，y\'=viewH-y 镜像序', () => {
    const src = SRC('render/Renderer.ts');
    expect(src).toContain('if (cam.flipY && !this._capturePass) {');
    expect(src).toContain('ctx.translate(0, viewH);');
    expect(src).toContain('ctx.scale(1, -1);');
    // 翻转点在星露谷过场（世界锚定内容末笔）之后、告示牌文本块（屏空间文字层）之前
    const stardew = src.indexOf('drawStardewAnimation(ctx, viewW, viewH);');
    const flip = src.indexOf('if (cam.flipY && !this._capturePass) {');
    const signBlock = src.indexOf("const [mwx, mwy] = cam2.screenToWorld(this._mouseX, this._mouseY);");
    expect(stardew).toBeGreaterThan(-1);
    expect(flip).toBeGreaterThan(stardew);
    expect(signBlock).toBeGreaterThan(flip);
    expect(src).toContain('worldToScreenDisplayed');   // 显示位消费面（签名泡/月总脉冲/遮屏孔）
    expect(src).toContain('Main.cs:62944');            // 金标行号锚
    expect(src).toContain('CaptureCamera');            // capture 不翻的锚注
  });
  it('Game：双点同步 cam.flipY = player.gravDir === -1（update 后 + 渲染帧头）', () => {
    const src = SRC('core/Game.ts');
    expect(src.match(/flipY = (?:this\.)?player\.gravDir === -1;/g)?.length).toBe(2);
    expect(src).toContain('rawMouseYWorldScale: inp.mouseY / this.camera.zoom');
    expect(src).not.toContain('gravDir: 1,                              // 反重力未实装');   // 旧钉值退役
    expect(src).toContain('gravDir: p.gravDir');
  });
  it('SmartCursor：:2435 倒挂支 + :196 轨道 314 让位门 gravDir 实况', () => {
    const src = SRC('player/SmartCursor.ts');
    expect(src).toContain('if (gravDir === -1 && signY === 0) num9++;');
    expect(src).toContain('if (gravDir === 1 && signX === 0) num9++;');
    expect(src).toContain('if (sheet === 314 && gravDir === 1) return true;');
    expect(src).toContain('gravDir?: number');
  });
  it('SmartSelect：env 增 rawMouseYWorldScale，翻转支消费裸鼠标（结构保留）', () => {
    const src = SRC('player/SmartSelect.ts');
    expect(src).toContain('rawMouseYWorldScale?: number');
    expect(src).toContain('env.rawMouseYWorldScale ?? (env.mouseY - env.screenTopY)');
    expect(src).toContain('if (env.player.gravDir === -1) {');
  });
});
