// ★BJ103（2026-09-16）三面清账测试：A1 pan 平滑率+黑幕传送 / B2 PickAmmo 注释勘误 /
//   D 失焦暂停旁支滚轮死。金标=1457 反编译（1458 同域逐字零差,sed 区间 diff 实证）：
//   A1 两面：
//     · pan 平滑 = CurrentPan（Main.cs:554）每 tick Utils.MoveTowards（Utils.cs:1862-1870）
//       趋近 targetPan,玩家受控档步长恒 36px/tick（UpdateCameraPan Main.cs:63652
//       maxPanSpeed=36f;手柄 48f :63778）；距<步长→直落目标,否则单位向量×步长。
//     · 黑幕 = dist(CurrentPan,targetPan) ≥ BlackFadeDist（:3127 =
//       UnscaledSize.Length()/2+100,CSS/未缩放 px）→ CurrentPan=targetPan 瞬移 +
//       BlackFadeCameraTeleport（:63500-63524）→ BlackFadeIn=255（:558/:63506）,DoDraw 尾
//       全屏 Color(0,0,0,α) 画后每帧 -25（:63367-63381）→ 11 帧渐熄。
//   D 面：失焦暂停 wantsToPause3（FocusHelper.UpdateFocus→Main.cs:17303-17316/1458
//     :17309-17322）先于 CanPauseGame（:17371）return → 暂停宿主 DoUpdate_WhilePaused 的
//     playerInventory 块（:17547-17551,autoPause 暂停期滚轮活面=RB15d-H4 二次翻案锚）
//     失焦期整段不可达 → 失焦∧背包开滚轮死;autoPause∧背包开滚轮仍活。focusPaused 专名。
//   B2 面（纯注释勘误锚定）：PickAmmo 真锚=PickAmmo_PickAmmoItem :54368-54390;
//     :52593-52605 实为 UndoSlowMagicUse/ApplyManaPotionManaHeat（误锚清除）。
// 变异证红（本轮全跑）：
//   M1 PAN_MAX_SPEED 36→360 → 步进组红；M2 advancePan 去 min 钳（step=d）→ 步进组红；
//   M3 黑幕门拆（黑幕支改 return false）→ 黑幕组红；M4 UI.ts vinvGridWheelTick 摘
//   focusPaused 早退 → 失焦滚轮组红；M5 applyFocusPause 置位行移出 world 门 → 结构组红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Camera } from '../src/render/Camera';
import { UI } from '../src/ui/UI';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const gameSrc = read('src/core/Game.ts');
const uiSrc = read('src/ui/UI.ts');
const rendererSrc = read('src/render/Renderer.ts');

// ============================================================
// A1-① MoveTowards 步进（Utils.cs:1862-1870 + Main.cs:63652 36px/tick）
// ============================================================
describe('BJ103-A1 Camera.advancePan（Main.cs:63662-63669 + Utils.cs:1862-1870）', () => {
  const mk = (): Camera => Object.create(Camera.prototype) as unknown as Camera;

  it('每拍步进 ≤36:目标 700px 外 → 首拍恰 36、逐拍等步', () => {
    const cam = mk();
    cam.panX = 0; cam.panY = 0;
    expect(cam.advancePan(700, 0)).toBe(false);
    expect(cam.panX).toBeCloseTo(36, 10);
    expect(cam.panY).toBeCloseTo(0, 10);
    cam.advancePan(700, 0);
    expect(cam.panX).toBeCloseTo(72, 10);
  });

  it('距<36 → 直落目标（MoveTowards v.Length()<max 分支,一步收口无过冲）', () => {
    const cam = mk();
    cam.panX = 0; cam.panY = 0;
    cam.advancePan(20, 0);                 // 20 < 36 → 直落 20
    expect(cam.panX).toBeCloseTo(20, 10);
    cam.panX = 700;                        // 已到 700,目标 690（距 10<36）→ 直落
    cam.advancePan(690, 0);
    expect(cam.panX).toBeCloseTo(690, 10);
  });

  it('斜向步长=36（单位向量×步长,非逐轴 36——v.SafeNormalize×max 语义）', () => {
    const cam = mk();
    cam.panX = 0; cam.panY = 0;
    cam.advancePan(300, 400);              // 距 500 → 步长 36 → 位移长恰 36
    expect(Math.hypot(cam.panX, cam.panY)).toBeCloseTo(36, 10);
    expect(cam.panX / cam.panY).toBeCloseTo(300 / 400, 6);   // 方向保持
  });

  it('对角甩镜 0 → +X → −X:步进有界,不瞬移（摘钳=瞬移即红）', () => {
    const cam = mk();
    cam.panX = 0; cam.panY = 0;
    for (let i = 0; i < 25; i++) cam.advancePan(600, 0);   // 收敛到 600
    expect(cam.panX).toBeCloseTo(600, 6);
    let maxStep = 0;
    let prevX = cam.panX;
    for (let i = 0; i < 40; i++) {
      cam.advancePan(-600, 0);
      maxStep = Math.max(maxStep, Math.abs(cam.panX - prevX));
      prevX = cam.panX;
    }
    expect(maxStep).toBeLessThanOrEqual(36.0000001);       // 每拍 ≤36（回归期注意:过 36 触黑幕门属另一支）
    expect(cam.panX).toBeCloseTo(-600, 6);                 // 多拍到位
  });

  it('targetPan 归零（松右键/卸枪/悬 UI）→ 同速率滑回零,无残留瞬回', () => {
    const cam = mk();
    cam.panX = 300; cam.panY = 0;
    cam.advancePan(0, 0);
    expect(cam.panX).toBeCloseTo(264, 10);                 // 300-36
  });

  it('NaN 守卫（Main.cs:63638-63645 float.IsNaN→归零）', () => {
    const cam = mk();
    (cam as unknown as { panX: number }).panX = NaN;
    expect(cam.advancePan(100, 0)).toBe(false);
    expect(cam.panX).toBeCloseTo(36, 10);                  // NaN 归零后正常步进
  });

  it('零距零目标 = 纯读零写（99% 帧 panX=0 零开销路径）', () => {
    const cam = mk();
    cam.panX = 0; cam.panY = 0;
    expect(cam.advancePan(0, 0)).toBe(false);
    expect(cam.panX).toBe(0);
    expect(cam.panY).toBe(0);
  });
});

// ============================================================
// A1-② BlackFadeDist 阈值 + 黑幕门（Main.cs:3127/:63662-63666）
// ============================================================
describe('BJ103-A1 黑幕门（Main.cs:3127 BlackFadeDist + :63662-63666）', () => {
  const mk = (): Camera => Object.create(Camera.prototype) as unknown as Camera;

  it('BlackFadeDist = |UnscaledSize|/2 + 100（1080p≈1201.45;800×600=600）', () => {
    expect(Camera.blackFadeDist(1920, 1080)).toBeCloseTo(Math.hypot(1920, 1080) / 2 + 100, 10);
    expect(Camera.blackFadeDist(800, 600)).toBeCloseTo(600, 10);
  });

  it('阈值语义:800×600 屏 CurrentPan 收敛 +600 后甩到 −600 → dist 1200 ≥ 600 → 触发+瞬移', () => {
    const cam = mk();
    (cam as unknown as { viewW: number }).viewW = 800;
    (cam as unknown as { viewH: number }).viewH = 600;
    cam.panX = 0; cam.panY = 0;
    for (let i = 0; i < 25; i++) cam.advancePan(600, 0);
    expect(cam.advancePan(-600, 0)).toBe(true);            // 触发黑幕
    expect(cam.panX).toBeCloseTo(-600, 10);                // CurrentPan=targetPan 瞬移
  });

  it('亚阈不触发:常规跟镜（dist 500 < 600）走 MoveTowards 返回 false', () => {
    const cam = mk();
    (cam as unknown as { viewW: number }).viewW = 800;
    (cam as unknown as { viewH: number }).viewH = 600;
    cam.panX = 0; cam.panY = 0;
    expect(cam.advancePan(500, 0)).toBe(false);
    expect(cam.panX).toBeCloseTo(36, 10);
  });

  it('触达性:panFactor≤0.8<1 时屏对角 >333px 即可达（0.8×diag ≥ 0.5×diag+100）——非低观察面', () => {
    // 800×600（对角 1000>333）:0.8 档两极 2×0.8×500=800 ≥ 600 → 可达
    const cam = mk();
    (cam as unknown as { viewW: number }).viewW = 800;
    (cam as unknown as { viewH: number }).viewH = 600;
    cam.panX = 400; cam.panY = 0;                          // 0.8 档右极(0.8×500=400)
    expect(cam.advancePan(-400, 0)).toBe(true);            // 甩左极 dist 800 ≥ 600
  });
});

// ============================================================
// A1-③ 接线/通道结构锁（Game.ts 施加面 + Renderer 黑幕层）
// ============================================================
describe('BJ103-A1 接线结构锁（Game.ts/Renderer.ts）', () => {
  it('Game:targetPan 暂存 + advancePan 接黑幕 + CurrentPan 施加序（施加在 clamp 之前=原版 :63615 后钳同相）', () => {
    expect(gameSrc).toContain('let targetPanX = 0, targetPanY = 0;');
    expect(gameSrc).toContain('targetPanX = vx * (cam.viewW / cam.zoom) / 2 * panNum;');
    expect(gameSrc).toContain('if (this.camera.advancePan(targetPanX, targetPanY)) this.blackFadeCameraTeleport();');
    expect(gameSrc).toContain('this.camera.x += this.camera.panX;');
    const applyAt = gameSrc.indexOf('this.camera.x += this.camera.panX;');
    const clampAt = gameSrc.indexOf('this.camera.clamp();', applyAt);
    expect(clampAt).toBeGreaterThan(applyAt);              // 先施加后钳
  });

  it('Game:blackFadeCameraTeleport = 黑幕计数 255 写 renderer（Main.cs:63506 BlackFadeIn=255 最小面）', () => {
    expect(gameSrc).toContain('private blackFadeCameraTeleport(): void {');
    expect(gameSrc).toContain('this.renderer.blackFadeIn = 255;');
  });

  it('Renderer:blackFadeIn 字段 + DoDraw 尾黑幕层（α=clamp/255,画后 -25 渐熄,255→0 共 11 帧）', () => {
    expect(rendererSrc).toContain('blackFadeIn = 0;');
    expect(rendererSrc).toContain('if (this.blackFadeIn > 0) {');
    expect(rendererSrc).toContain('this.blackFadeIn -= 25;');
    const layer = rendererSrc.indexOf('if (this.blackFadeIn > 0) {');
    // 层位=飘字（步骤 8,Main.cs:63330-63345 DrawCombatText 同域）之后、拍照模式提前返之前
    const combatEnd = rendererSrc.indexOf('this._lastPlayer = player;');
    expect(layer).toBeGreaterThan(-1);
    expect(layer).toBeLessThan(combatEnd + 400);           // 黑幕层紧邻 _lastPlayer 前（步骤 8 后）
    expect(rendererSrc.slice(layer, layer + 400)).toContain('rgba(0,0,0,');
  });

  it('Camera:panX/panY（CurrentPan）+ PAN_MAX_SPEED=36 + blackFadeDist 静态面在', () => {
    const camSrc = read('src/render/Camera.ts');
    expect(camSrc).toContain('static PAN_MAX_SPEED = 36;');
    expect(camSrc).toContain('static blackFadeDist(viewW: number, viewH: number)');
    expect(camSrc).toContain('panX = 0; panY = 0;');
  });

  it('★SW-F2 黑幕层位：drawCursorItemIcon 调用位在黑幕块之后、drawMouseTextLayer 之前（层 40<MouseText 收尾,DrawInterface :63394 在黑幕 :63367-63381 之后）', () => {
    const iFade = rendererSrc.indexOf('if (this.blackFadeIn > 0) {');
    const iIcon = rendererSrc.indexOf('this.drawCursorItemIcon(ctx, player);');
    const iIconNext = rendererSrc.indexOf('this.drawCursorItemIcon(ctx, player);', iIcon);
    const iMt = rendererSrc.indexOf('this.drawMouseTextLayer(ctx, player);');
    expect(iFade).toBeGreaterThan(-1);
    expect(iIcon, '调用位唯一且在黑幕之后').toBe(iIconNext);
    expect(iIcon).toBeGreaterThan(iFade);
    expect(iMt).toBeGreaterThan(iIcon);   // 层序：图标(40) 在 MouseText 收尾(:45694) 之下
    // 黑幕窗内不再有图标前置绘制位（回挂步骤 7b'=黑幕前即红）
    expect(rendererSrc.slice(0, iFade)).not.toContain('this.drawCursorItemIcon(ctx, player);');
  });

  it('★SW-清债② 2026-09-17 翻案锁：告示牌泡面（signBubbleScreen 消费）随 drawCursorItemIcon 在黑幕块之后（接口层表位 20 SignTileBubble 原版亦在 DrawInterface :63386 黑幕 :63367-63381 之后;「泡回黑幕前」提案已翻案作废,回挂即红）', () => {
    const iFade = rendererSrc.indexOf('if (this.blackFadeIn > 0) {');
    const iBubble = rendererSrc.indexOf('if (this.signBubbleScreen) {');
    expect(iFade).toBeGreaterThan(-1);
    expect(iBubble, '泡面在黑幕之后=原版同相（清债②亲读 :46502-46526/:63367-63392）').toBeGreaterThan(iFade);
  });
});

// ============================================================
// ② B2 PickAmmo 注释勘误（纯注释,结构锚定防回潮）
// ============================================================
describe('BJ103-B2 PickAmmo 锚勘误（Game.ts 注释）', () => {
  it('真锚 PickAmmo_PickAmmoItem :54368-54390 + AmmoSlotOrder_Default :3175 在;误锚 :52593-52605 已清除', () => {
    expect(gameSrc).toContain('PickAmmo_PickAmmoItem（:54368-54390）');
    expect(gameSrc).toContain('AmmoSlotOrder_Default（:3175-3176');
    expect(gameSrc).not.toContain(':52593-52605 专设前置环');   // 旧误锚（UndoSlowMagicUse/ApplyManaPotionManaHeat 域）
  });
});

// ============================================================
// ③ D 失焦暂停旁支（Main.cs:17303-17316 先于 :17371 → :17549 宿主失焦期不可达）
// ============================================================
describe('BJ103-D 失焦暂停旁支:滚轮消费面 focusPaused 早退（autoPause 活面保持）', () => {
  /** UI 最小桩（bj69/sw-fx21 Object.create 惯例） */
  function mkUi(gameFields: Record<string, unknown>) {
    const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
    ui.game = { focusPaused: false, ...gameFields };
    return ui;
  }
  const evt = (deltaY: number): WheelEvent =>
    ({ deltaY, deltaMode: 0, stopPropagation() { /* stub */ } }) as unknown as WheelEvent;

  it('功能面:失焦态（focusPaused=true）vinvGridWheelTick 整段早退=滚轮死', () => {
    let craftCalls = 0;
    const ui = mkUi({ focusPaused: true });
    ui._builtLayout = 'vanilla';
    ui.invPanel = { style: { display: 'block' } };          // playerInventory 开（背包面板在）
    ui.vinvLayoutCtx = {};                                  // 过 ctx 门（活面下走到 vinvCraftWheel）
    ui.vinvCraftAvailV = [];
    ui.vinvPipsUseGrid = false;
    ui.vinvModernCraftOpen = false;
    ui.vinvCraftWheel = () => { craftCalls++; };
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evt(-120));
    expect(craftCalls, '失焦态滚轮必须死（原版 :17316 return 先于 :17371,:17549 宿主不可达）').toBe(0);
  });

  it('功能面:autoPause 态（paused∧背包开∧focusPaused=false）滚轮仍活（RB15d-H4 活面保留）', () => {
    let craftCalls = 0;
    const ui = mkUi({ focusPaused: false, paused: true });   // 全暂停态旗在,但不该拦
    ui._builtLayout = 'vanilla';
    ui.invPanel = { style: { display: 'block' } };
    ui.vinvLayoutCtx = {};
    ui.vinvCraftAvailV = [];
    ui.vinvPipsUseGrid = false;
    ui.vinvModernCraftOpen = false;
    ui.vinvCraftWheel = () => { craftCalls++; };
    (ui.vinvGridWheelTick as (e: WheelEvent) => void).call(ui, evt(-120));
    expect(craftCalls, 'autoPause∧背包开=原版 :17549 活面,失焦旗不得误杀').toBe(1);
  });

  it('功能面:vinvCraftWheel 失焦死/失焦外活（元素级宿主 :10328/:10420 同态）', () => {
    let gotoTo: number[] = [];
    const ui = mkUi({ focusPaused: true });
    ui.vinvCraftAvailV = new Array(30).fill({});
    ui.vinvCraftWheelPendPx = 0;
    ui.vinvCraftFocusV = 0;
    ui.vinvCraftFocusGoto = (n: number) => { gotoTo.push(n); };
    (ui.vinvCraftWheel as (e: WheelEvent) => void).call(ui, evt(-120));
    expect(gotoTo, '失焦态列表滚死').toEqual([]);

    gotoTo = [];
    ui.game = { focusPaused: false, paused: true };          // autoPause 态仍活
    (ui.vinvCraftWheel as (e: WheelEvent) => void).call(ui, evt(120));
    expect(gotoTo).toEqual([1]);                             // 下滚 +1 档（★BJ189 用户明令分歧 2026-09-20:浏览器方向;原版同相=上滚 +1 已反相,回滚口=UI.ts focusV−num）
  });

  it('功能面:vinvModernScrollBy 失焦死/失焦外活（modern 窗元素宿主 :8513/:8769 同律）', () => {
    let sync = 0;
    const ui = mkUi({ focusPaused: true });
    ui.vinvModernGridGeometry = () => ({ contentH: 1000, list: { h: 500 } });
    ui.vinvModernViewPos = 0;
    ui.vinvSyncModernScroll = () => { sync++; };
    (ui.vinvModernScrollBy as (e: WheelEvent) => void).call(ui, evt(-120));
    expect(sync, '失焦态 modern 窗滚死').toBe(0);

    sync = 0;
    ui.game = { focusPaused: false, paused: true };
    (ui.vinvModernScrollBy as (e: WheelEvent) => void).call(ui, evt(-120));
    expect(sync, 'autoPause 态 modern 窗滚活').toBe(1);
  });

  it('结构面:applyFocusPause 态机——置位在 world 门后/paused 短路前,三恢复支全收旗', () => {
    const span = (a: string, b: string): string => {
      const i = gameSrc.indexOf(a);
      expect(i, a).toBeGreaterThan(-1);
      return gameSrc.slice(i, gameSrc.indexOf(b, i));
    };
    const body = span('private applyFocusPause(): void {', '/** autoPause 独立语义');
    const setAt = body.indexOf('this._focusPaused = true;');
    const pausedShort = body.indexOf('if (this.paused) return;');
    expect(setAt, '置位必须在 world 存在门之后（无 world 不置位）').toBeGreaterThan(body.indexOf('if (!this.world) return;'));
    expect(setAt, '置位必须在既有暂停短路之前（手动/autoPause 暂停叠加失焦同截断 :17549 宿主）').toBeLessThan(pausedShort);
    // 焦点恢复/开关开/MP 三支全收旗
    expect(body.match(/this\._focusPaused = false;/g)?.length).toBe(3);
    // 公开只读面（UI.ts 消费）
    expect(gameSrc).toContain('get focusPaused(): boolean { return this._focusPaused; }');
    // 换世界收旗（WorldGen.cs:6952 CurrentPan=Zero 同律区）
    expect(gameSrc).toContain('this._focusPaused = false;         // ★BJ103：换世界收失焦旁支旗');
  });

  it('结构面:UI.ts 两 vanilla 滚轮面 + modern 面三处 focusPaused 早退在位', () => {
    expect(uiSrc.match(/\.focusPaused\) return;/g)?.length).toBe(3);
  });
});
