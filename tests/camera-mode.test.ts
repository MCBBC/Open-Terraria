// M6 拍照模式（F4，Terraria.Graphics.Capture 1:1）单测。
// 覆盖：键位默认值/派发、模式状态机（开/关/justActivated/锁定期拒切）、
// 选区几何（GetArea/ConstraintPoints/屏域裁剪输入）、分块规划（126 步进 128 块/
// 4096 缩放链/重叠带落位）、QuickScreenshot 全屏域、全屏地图坐标互逆、
// 滚轮模式环绕（原版 ±2 环绕的退化行为照抄）。
// 纯逻辑层：node 环境无 DOM——frame() 的视觉层与分块离屏渲染均带
// typeof document 门,状态机照走（见 CaptureMode.ts frame/beginCapture）。
import { describe, it, expect } from 'vitest';
import {
  CaptureInterface, CaptureSettings,
  getArea, constrainPoint, scaleFactorFor, outputSizeFor, planChunks,
  fullScreenAreaOf, areaContains, getCaptureBiome, newOutputName,
  mapTileFromScreen, mapScreenFromTile,
  type CaptureEnv,
} from '../src/render/CaptureMode';
import { DEFAULT_KEYBINDS, isBound, assignBinding, actionsForCode } from '../src/core/Keybinds';
import { options } from '../src/core/Options';
import { Camera } from '../src/render/Camera';
import type { RenderBundle } from '../src/render/CaptureMode';
import type { Renderer } from '../src/render/Renderer';
import type { World } from '../src/world/World';

// ---- 测试桩：Renderer 最小面（frame() 更新段只触 timeUiHover/canvas/fullMap） ----
function fakeRenderer(canvasW = 1920, canvasH = 1080): Renderer {
  return {
    timeUiHover: false,
    canvas: { width: canvasW, height: canvasH },
    fullMap: { open: false, zoom: 0.5, zoomTarget: 0.5, panX: 0, panY: 0, anchorU: 0, anchorV: 0, anchorMX: 0, anchorMY: 0 },
    lighting: null,
  } as unknown as Renderer;
}

function bundle(cam: Camera): RenderBundle {
  return {
    cam,
    world: { w: 4200, h: 1200, clock: null } as unknown as World,
    clock: null as never,
    chunks: {} as never,
    lightR: new Uint8Array(0), lightG: new Uint8Array(0), lightB: new Uint8Array(0),
    lightRX: 0, lightRY: 0, lightRW: 0, lightRH: 0,
    player: {} as never, entities: [], particles: [], dmgNumbers: [],
    swing: null, hover: null, flicker: null, remotePlayers: [], leashed: null,
  };
}

function env(over: Partial<CaptureEnv> = {}): CaptureEnv {
  const cam = new Camera(4200, 1200);
  cam.x = 4200 * 16 / 2; cam.y = 1200 * 16 / 2; cam.zoom = 1; cam.viewW = 1920; cam.viewH = 1080;
  return {
    mouseX: 960, mouseY: 540,
    mouseLeft: false, mouseRight: false,
    viewW: 1920, viewH: 1080,
    worldW: 4200, worldH: 1200,
    mapOpen: false,
    fm: { zoom: 1, panX: 0, panY: 0 },
    gravDir: 1,
    mapEnabled: true,
    ...over,
  };
}

/** 按一次完整点击（按下帧 + 释放帧——释放沿即原版 mouseLeft&&mouseLeftRelease） */
function clickAt(cm: CaptureInterface, r: Renderer, b: RenderBundle, e: CaptureEnv): void {
  cm.frame(r, b, { ...e, mouseLeft: true });
  cm.frame(r, b, { ...e, mouseLeft: false });
}

/** toggleCamera 后的激活点击松手链（JustActivated :993-996 需一次释放沿解禁） */
function releaseActivation(cm: CaptureInterface, r: Renderer, b: RenderBundle, e: CaptureEnv): void {
  cm.frame(r, b, { ...e, mouseLeft: true });
  cm.frame(r, b, { ...e, mouseLeft: false });
}

const BTN = (i: number): { mouseX: number; mouseY: number } => ({ mouseX: 24 + 46 * i + 21, mouseY: 24 + 21 });

describe('M6 键位（PlayerInput.cs:1926 ToggleCameraMode=F4）', () => {
  it('默认绑定 F4（原版 Redigit 键盘档;调试迷雾键已迁 Shift+F4）', () => {
    expect(DEFAULT_KEYBINDS.ToggleCameraMode).toEqual(['F4']);
    expect(isBound('ToggleCameraMode', 'F4')).toBe(true);
    expect(actionsForCode('F4')).toContain('ToggleCameraMode');
  });

  it('重绑语义:改键后 F4 不再触发,反选清空=空表无绑定(非保护 action)', () => {
    const map = assignBinding({}, 'ToggleCameraMode', 'F6');
    expect(map.ToggleCameraMode).toEqual(['F6']);
    // 反选清空 → 保留空表=无绑定(2026-08-21 修正:原版 CheckRebindingProcessKeyboard
    // :1504-1506 Remove 后允许空表,此前的"回默认"是对 FixDerpedRebinds 保护名单的
    // 过度泛化——ToggleCameraMode 不在 MouseLeft/MouseRight/Inventory 三键名单内)
    const restored = assignBinding(map, 'ToggleCameraMode', 'F6');
    expect(restored.ToggleCameraMode).toEqual([]);
    options.data.keybinds = restored;          // 调用方持久化后生效
    expect(isBound('ToggleCameraMode', 'F4')).toBe(false);
    expect(isBound('ToggleCameraMode', 'F6')).toBe(false);
    options.data.keybinds = {};                // 清场
  });
});

describe('M6 模式状态机（CaptureInterface :974-1059）', () => {
  it('toggleCamera:开 → justActivated;关 → 清模式内态;锁定期拒切（:1041）', () => {
    const cm = new CaptureInterface();
    expect(cm.active).toBe(false);
    cm.toggleCamera(true);
    expect(cm.active).toBe(true);
    expect(cm.justActivated).toBe(true);          // :1057 On && !active
    cm.toggleCamera(false);
    expect(cm.active).toBe(false);
    // CameraLock 期拒切（UpdateCameraCountdown :977 同门）
    (cm as unknown as { cameraLock: boolean }).cameraLock = true;
    cm.toggleCamera(true);
    expect(cm.active).toBe(false);
    (cm as unknown as { cameraLock: boolean }).cameraLock = false;
  });

  it('toggleRequest:死亡/硬核幽灵不可开（Update :983 门）', () => {
    const cm = new CaptureInterface();
    const dead = { dead: true, isGhostPhase: () => false };
    const ghost = { dead: false, isGhostPhase: () => true };
    const alive = { dead: false, isGhostPhase: () => false };
    cm.toggleRequest(dead as never, {} as never);
    cm.toggleRequest(ghost as never, {} as never);
    expect(cm.active).toBe(false);
    cm.toggleRequest(alive as never, {} as never);
    expect(cm.active).toBe(true);
  });

  it('justActivated:首次松手解禁（:993-996）;期间模式不响应', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer();
    const b = bundle(new Camera(4200, 1200));
    cm.toggleCamera(true);
    // 激活后按住左键（选区不应被激活前的按住钉角）
    cm.frame(r, b, env({ mouseLeft: true }));
    expect(cm.edgeAPinned).toBe(false);
    cm.frame(r, b, env({ mouseLeft: true }));
    cm.frame(r, b, env({ mouseLeft: false }));   // 松手沿 → 解禁
    expect(cm.justActivated).toBe(false);
    // 解禁后按住 → 模式 0 钉 A 角（EdgePlacement :106-115）
    cm.frame(r, b, env({ mouseLeft: true, mouseX: 500, mouseY: 400 }));
    expect(cm.edgeAPinned).toBe(true);
  });

  it('blockMouse 等价:frame() 置 timeUiHover 吞点击门（:992 → Game:6731）', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer();
    cm.toggleCamera(true);
    cm.frame(r, bundle(new Camera(4200, 1200)), env());
    expect(r.timeUiHover).toBe(true);
  });

  it('按钮组:0=快照 / 2/3/6=模式切换 / 4=重选区 / 8=关闭（:1075-1134）', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer();
    const b = bundle(new Camera(4200, 1200));
    cm.toggleCamera(true);
    releaseActivation(cm, r, b, env());
    // 模式 1（拖拽边界,按钮 3）
    clickAt(cm, r, b, env(BTN(3)));
    expect(cm.selectedMode).toBe(1);
    // 模式 2（设置,按钮 6）
    clickAt(cm, r, b, env(BTN(6)));
    expect(cm.selectedMode).toBe(2);
    // 模式 0（围取边框,按钮 2）
    clickAt(cm, r, b, env(BTN(2)));
    expect(cm.selectedMode).toBe(0);
    // 钉双角（模式 0:左键钉 A + 右键钉 B） → 按钮 4 重置
    cm.frame(r, b, env({ mouseLeft: true, mouseRight: true, mouseX: 100, mouseY: 100 }));
    expect(cm.edgeAPinned && cm.edgeBPinned).toBe(true);
    cm.frame(r, b, env({ mouseLeft: false, mouseRight: false }));
    clickAt(cm, r, b, env(BTN(4)));
    expect(cm.edgeAPinned || cm.edgeBPinned).toBe(false);
    // 按钮 8 关闭
    clickAt(cm, r, b, env(BTN(8)));
    expect(cm.active).toBe(false);
  });

  it('按钮 0 = QuickScreenshot:锁屏起拍 → 分帧推进 → 收尾解锁（node 快通道）', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer(1920, 1080);
    const cam = new Camera(4200, 1200);
    cam.x = 33600; cam.y = 9600; cam.zoom = 1.25; cam.viewW = 1920; cam.viewH = 1080;
    const b = bundle(cam);
    cm.toggleCamera(true);
    releaseActivation(cm, r, b, env());
    clickAt(cm, r, b, env(BTN(0)));
    // StartCamera 只入暂存（:1603-1610）——activeSettings 尚 null,锁屏保持
    expect(cm.cameraLock).toBe(true);
    expect((cm as unknown as { settings: unknown }).settings).toBeNull();
    // countdown 到第 4 帧才 Capture（:1549-1552 暂存转正）;node 无 DOM:
    // beginCapture 不建队 → 同帧 finishCapture → EndCamera
    for (let i = 0; i < 8; i++) cm.frame(r, b, env());
    expect(cm.cameraLock).toBe(false);
  });

  it('startCamera 组装:OutputName/锁屏/cameraSpaceEffects（:1603-1610 暂存面）', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer(1920, 1080);
    const cam = new Camera(4200, 1200);
    cam.x = 33600; cam.y = 9600; cam.zoom = 1; cam.viewW = 1920; cam.viewH = 1080;
    const b = bundle(cam);
    // 视界内小选区 → cameraSpaceEffects=true;出界大区 → false
    cm.startCamera(r, b, { area: { x: 2090, y: 595, w: 20, h: 10 }, captureBackground: true, captureEntities: true, useScaling: true, captureMech: false });
    const s1 = (cm as unknown as { cameraSettings: { cameraSpaceEffects: boolean; outputName: string; area: { x: number } } }).cameraSettings;
    expect(s1.cameraSpaceEffects).toBe(true);
    expect(s1.outputName).toMatch(/^Capture \d{4}-\d{2}-\d{2} \d{2}_\d{2}_\d{2}$/);
    expect(cm.cameraLock).toBe(true);
    expect(cm.cameraWaiting).toBe(0);
    for (let i = 0; i < 8; i++) cm.frame(r, b, env());   // 快通道收尾
    expect(cm.cameraLock).toBe(false);
    cm.startCamera(r, b, { area: { x: 40, y: 40, w: 4000, h: 1000 }, captureBackground: true, captureEntities: true, useScaling: true, captureMech: false });
    const s2 = (cm as unknown as { cameraSettings: { cameraSpaceEffects: boolean; area: { x: number } } }).cameraSettings;
    expect(s2.area.x).toBe(40);
    expect(s2.cameraSpaceEffects).toBe(false);
  });

  it('滚轮模式环绕（Scrolling :1523-1545,±2 环绕两向同果的原版退化行为）', () => {
    const cm = new CaptureInterface();
    expect(cm.selectedMode).toBe(0);
    cm.pendingWheel = 120; cm.scrolling();
    expect(cm.selectedMode).toBe(1);   // 0 -1 → -1 → +2 = 1
    cm.pendingWheel = 120; cm.scrolling();
    expect(cm.selectedMode).toBe(0);
    cm.selectedMode = 2;
    cm.pendingWheel = -120; cm.scrolling();   // -1%30→29 → 2-29=-27 → +2 环绕 → 1
    expect(cm.selectedMode).toBe(1);
    expect(cm.pendingWheel).toBe(0);          // 消费即清
  });

  it('设置面板:三开关 + 重置（PressButton :703-732）', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer();
    const b = bundle(new Camera(4200, 1200));
    CaptureSettings.packImage = true;
    CaptureSettings.includeEntities = true;
    CaptureSettings.transparentBackground = false;
    CaptureSettings.biomeChoiceIndex = 5;
    cm.toggleCamera(true);
    cm.frame(r, b, env()); cm.frame(r, b, env({ mouseLeft: true }));
    clickAt(cm, r, b, env(BTN(6)));   // 进设置模式
    // 面板行 0（packImage 开关）:rect(115,80,224,170),行区 +20 内缩,行距 20
    clickAt(cm, r, b, env({ mouseX: 115 + 30, mouseY: 80 + 20 + 8 }));
    expect(CaptureSettings.packImage).toBe(false);
    clickAt(cm, r, b, env({ mouseX: 115 + 30, mouseY: 80 + 20 + 8 }));
    expect(CaptureSettings.packImage).toBe(true);
    // 行 6 重置:biomeChoiceIndex 回 -1,三开关回默认
    clickAt(cm, r, b, env({ mouseX: 115 + 30, mouseY: 80 + 20 + 6 * 20 + 8 }));
    expect(CaptureSettings.biomeChoiceIndex).toBe(-1);
    expect(CaptureSettings.packImage).toBe(true);
    expect(CaptureSettings.includeEntities).toBe(true);
    expect(CaptureSettings.transparentBackground).toBe(false);
  });
});

describe('M6 选区几何（GetArea/ConstraintPoints/DrawMarkedArea 输入）', () => {
  it('getArea:两角含端点 + 任意角序（:965-972）', () => {
    expect(getArea(100, 200, 150, 260)).toEqual({ x: 100, y: 200, w: 51, h: 61 });
    expect(getArea(150, 260, 100, 200)).toEqual({ x: 100, y: 200, w: 51, h: 61 });
    expect(getArea(50, 50, 50, 50)).toEqual({ x: 50, y: 50, w: 1, h: 1 });
  });

  it('constrainPoint:fluff=40 四边钳制（:1486-1504）', () => {
    const p = { x: 0, y: 5 };
    constrainPoint(p, 4200, 1200, 40);
    expect(p).toEqual({ x: 40, y: 40 });
    const q = { x: 4200, y: 1200 };
    constrainPoint(q, 4200, 1200, 40);
    expect(q).toEqual({ x: 4200 - 1 - 40, y: 1200 - 1 - 40 });
  });

  it('选区屏域裁剪:世界支交集 + 偏移（ModeEdgeSelection :142-157）', () => {
    const cm = new CaptureInterface();
    cm.edgeAPinned = true; cm.edgeBPinned = true;
    cm.edgeA = { x: 2094, y: 597 }; cm.edgeB = { x: 2106, y: 603 };
    const e = env();
    // 相机中心 33600,9600 @ zoom1 视口 1920×1080 → 视界 [32640..34560]×[9060..10140] px
    const rect = cm.markedAreaScreenRect(e, e2cam(e));
    expect(rect).not.toBeNull();
    // 选区世界域 [2094*16, ..] = [33504, 9552] 尺寸 13×7 tile = 208×112 px
    // 屏幕位置 = 33504-32640 = 864; 9552-9060 = 492
    expect(Math.round(rect!.x)).toBe(864);
    expect(Math.round(rect!.y)).toBe(492);
    expect(rect!.w).toBeCloseTo(208, 0);
    expect(rect!.h).toBeCloseTo(112, 0);
  });

  it('选区屏域:完全在视界外 → null（交集空）', () => {
    const cm = new CaptureInterface();
    cm.edgeAPinned = true; cm.edgeBPinned = true;
    cm.edgeA = { x: 40, y: 40 }; cm.edgeB = { x: 45, y: 45 };
    const e = env();
    expect(cm.markedAreaScreenRect(e, e2cam(e))).toBeNull();
  });
});

function e2cam(e: CaptureEnv): Camera {
  const cam = new Camera(e.worldW, e.worldH);
  cam.x = e.worldW * 16 / 2; cam.y = e.worldH * 16 / 2;
  cam.zoom = 1; cam.viewW = e.viewW; cam.viewH = e.viewH;
  return cam;
}

describe('M6 分块规划（CaptureCamera._Capture :133-173）', () => {
  it('小选区单块:126 内不分块,无缩放', () => {
    const area = { x: 100, y: 100, w: 50, h: 40 };
    const chunks = planChunks(area, true);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ x: 100, y: 100, w: 50, h: 40, ox: 0, oy: 0, ow: 800, oh: 640 });
    expect(scaleFactorFor(area, true)).toBe(1);
  });

  it('大区两向多块:126 步进 + 128 块上限（2 tile 重叠带,后块覆写）', () => {
    const area = { x: 0, y: 0, w: 200, h: 130 };
    const chunks = planChunks(area, false);
    // x 向:0(128) + 126(72) = 2 块;y 向:0(128) + 126(4→min(128,130-126)=4) = 2 块
    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toMatchObject({ x: 0, y: 0, w: 128, h: 128 });
    expect(chunks[1]).toMatchObject({ x: 0, y: 126, w: 128, h: 4 });
    expect(chunks[2]).toMatchObject({ x: 126, y: 0, w: 74, h: 128 });
    expect(chunks[3]).toMatchObject({ x: 126, y: 126, w: 74, h: 4 });
  });

  it('4096 缩放链:超宽等比缩 + 输出钳制（:137-148）', () => {
    // 300 tile 宽 = 4800px > 4096 → num = 4096/4800
    const area = { x: 0, y: 0, w: 300, h: 100 };
    const num = scaleFactorFor(area, true);
    expect(num).toBeCloseTo(4096 / 4800, 6);
    const [ow, oh] = outputSizeFor(area, true);
    expect(ow).toBe(4096);
    expect(oh).toBe(Math.floor(num * 1600));
    // 分块落位 = floor(num × 相对像素)
    const c0 = planChunks(area, true)[0];
    expect(c0.ow).toBe(Math.floor(num * 128 * 16));
    // 高向不超帽(250 tile = 4000px < 4096) → num 不压低
    expect(scaleFactorFor({ x: 0, y: 0, w: 100, h: 250 }, true)).toBe(1);
    // 关缩放恒 1
    expect(scaleFactorFor(area, false)).toBe(1);
    // 全向超帽:取两向更小者
    const both = { x: 0, y: 0, w: 400, h: 300 };
    expect(scaleFactorFor(both, true)).toBeCloseTo(Math.min(4096 / 6400, 4096 / 4800), 6);
  });

  it('FullScreenArea:视界 tile 域 ceil/floor 取整（:1140-1159）', () => {
    // 中心 3200,1800 zoom2 视口 1920×1080 → 世界域 [2720..3680]×[1530..2070]px
    const cam = { x: 3200, y: 1800, zoom: 2 };
    const a = fullScreenAreaOf(cam, 1920, 1080);
    expect(a).toEqual({
      x: Math.ceil(2720 / 16), y: Math.ceil(1530 / 16),
      w: Math.floor(3680 / 16) - Math.ceil(2720 / 16),
      h: Math.floor(2070 / 16) - Math.ceil(1530 / 16),
    });
    expect(a).toEqual({ x: 170, y: 96, w: 60, h: 33 });
  });

  it('areaContains:CameraSpaceEffects 判定输入（:1605）', () => {
    const fs = { x: 100, y: 100, w: 60, h: 40 };
    expect(areaContains(fs, { x: 110, y: 110, w: 10, h: 10 })).toBe(true);
    expect(areaContains(fs, { x: 99, y: 110, w: 10, h: 10 })).toBe(false);
    expect(areaContains(fs, { x: 100, y: 100, w: 60, h: 40 })).toBe(true);   // 恰等含
  });
});

describe('M6 全屏地图坐标换算（GetMapCoords web 适配）', () => {
  const fm = { zoom: 0.5, panX: 0, panY: 0 };
  const view = { viewW: 1920, viewH: 1080 };

  it('tile↔屏 互逆（marginless 变换,mapOrigin 推导）', () => {
    // 地图原点:x = 960 - 4200·0.5/2 = -90;y = 540 - 1200·0.5/2 = 240
    const t = mapTileFromScreen(910, 500, fm, 4200, 1200, view.viewW, view.viewH);
    expect(t).toEqual({ x: 2000, y: 520 });   // (910+90)/0.5=2000, (500-240)/0.5=520
    const s = mapScreenFromTile(2000, 520, fm, 4200, 1200, view.viewW, view.viewH);
    expect(s.x).toBeCloseTo(910, 6);
    expect(s.y).toBeCloseTo(500, 6);
  });

  it('界外 null（世界全域为界）', () => {
    expect(mapTileFromScreen(-91, 500, fm, 4200, 1200, view.viewW, view.viewH)).toBeNull();   // tile -1
    const maxX = 4200 * 0.5 - 90;   // tile 4200 位置的屏 x → 界外
    expect(mapTileFromScreen(maxX, 500, fm, 4200, 1200, view.viewW, view.viewH)).toBeNull();
  });
});

describe('M6 数据层（CaptureBiome/CaptureSettings）', () => {
  it('手动档 2..12 查表（GetCaptureBiome :108-151）', () => {
    expect(getCaptureBiome(2)).toMatchObject({ backgroundIndex: 1, waterStyle: 2, tileColor: 'Corrupt' });
    expect(getCaptureBiome(11)).toMatchObject({ backgroundIndex: 4, waterStyle: 13 });
    expect(getCaptureBiome(12)).toMatchObject({ waterStyle: 7, tileColor: 'Mushroom' });
  });

  it('自动档:preferredBG 优先 → 水色反查 → 树线兜底（:135-149 三连）', () => {
    expect(getCaptureBiome(-1, { preferredBg: 6 }).waterStyle).toBe(4);        // Hallow
    expect(getCaptureBiome(-1, { preferredBg: -1, waterStyle: 5 }).waterStyle).toBe(5);   // Snow
    // 无 loc 输入 → DefaultPurity
    expect(getCaptureBiome(-1)).toMatchObject({ backgroundIndex: 0, waterStyle: 0 });
    // 树线分段:playerX < treeX[1] → Purity2
    expect(getCaptureBiome(-1, { treeX: [1000, 2000, 3000], playerTileX: 1500 }).backgroundIndex).toBe(10);
    expect(getCaptureBiome(-1, { treeX: [1000, 2000, 3000], playerTileX: 3500 }).backgroundIndex).toBe(12);
  });

  it('OutputName:本地时间戳 "Capture YYYY-MM-DD HH_MM_SS"（:24-28）', () => {
    expect(newOutputName(new Date(2026, 7, 20, 9, 5, 3))).toBe('Capture 2026-08-20 09_05_03');
  });

  it('MarkedAreaColor alpha=0（原版 Color(0.8,0.8,0.8,0)*0.3 的 A=0 事实）', () => {
    expect(CaptureSettings.markedAreaColor.endsWith(',0)')).toBe(true);
  });
});

describe('M6 拖拽边界模式（ModeDragBounds :379-560）', () => {
  it('未成框:左键落下双角同点 → 悬停探测四边扩 8px → 拖边沿轴改角', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer();
    const cam = new Camera(4200, 1200);
    cam.x = 33600; cam.y = 9600; cam.zoom = 1; cam.viewW = 1920; cam.viewH = 1080;
    const b = bundle(cam);
    cm.toggleCamera(true);
    releaseActivation(cm, r, b, env());
    cm.selectedMode = 1;
    // 落角:屏 960,540 → 世界 33600,9600 → tile 2100,600
    cm.frame(r, b, env({ mouseLeft: true, mouseX: 960, mouseY: 540 }));
    expect(cm.edgeA).toEqual({ x: 2100, y: 600 });
    expect(cm.edgeB).toEqual({ x: 2100, y: 600 });
    expect(cm.dragCurrentAim).toBe(3);   // 落下即右下角拖拽态（:413-414）
    // 拖宽:移到屏 1200,540 → tile x 2115 → B.x 沿轴改（caughtEdge=1）
    cm.frame(r, b, env({ mouseLeft: true, mouseX: 1200, mouseY: 540 }));
    expect(cm.edgeB).toEqual({ x: 2115, y: 600 });
    expect(cm.edgeA).toEqual({ x: 2100, y: 600 });
    // 松手 → 悬停探测复位（鼠标挪离选区边条,否则命中边属正常悬停）
    cm.frame(r, b, env({ mouseLeft: false, mouseX: 1500, mouseY: 300 }));
    expect(cm.dragCurrentAim).toBe(-1);
    expect(cm.area()).toEqual({ x: 2100, y: 600, w: 16, h: 1 });
  });

  it('边悬停:命中边条 8px 缓冲 → caughtEdge 归属（:498-558）', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer();
    const cam = new Camera(4200, 1200);
    cam.x = 33600; cam.y = 9600; cam.zoom = 1; cam.viewW = 1920; cam.viewH = 1080;
    const b = bundle(cam);
    cm.toggleCamera(true);
    releaseActivation(cm, r, b, env());
    cm.edgeAPinned = true; cm.edgeBPinned = true;
    cm.edgeA = { x: 2090, y: 590 }; cm.edgeB = { x: 2110, y: 610 };
    cm.selectedMode = 1;
    // 顶边中点屏位:世界 (2100*16, 590*16)=(33600,9440) → 屏 (960, 9440-9060=380)
    cm.frame(r, b, env({ mouseLeft: false, mouseX: 960, mouseY: 380 }));
    expect(cm.dragCurrentAim).toBe(0);           // 顶边
    expect((cm as unknown as { dragCaughtEdge: number }).dragCaughtEdge).toBe(0);   // A 在上
    // 按住 → 沿 Y 拖 A.y:屏 500 → 世界 9560 → tile 597
    cm.frame(r, b, env({ mouseLeft: true, mouseX: 960, mouseY: 500 }));
    expect(cm.edgeA.y).toBe(597);
    expect(cm.edgeB.y).toBe(610);   // B 沿不动
  });
});

describe('M6 快照锁屏状态机（UpdateCameraCountdown :1547-1570）', () => {
  it('锁定期帧进 0→5,waiting 封顶 60,解锁线性退坡', () => {
    const cm = new CaptureInterface();
    const r = fakeRenderer();
    const b = bundle(new Camera(4200, 1200));
    cm.frame(r, b, env());
    expect(cm.cameraFrame).toBe(0);
    // StartCamera 只锁屏不转正（暂存语义）;countdown 每帧 +1
    cm.startCamera(r, b, { area: { x: 100, y: 100, w: 10, h: 10 }, captureBackground: true, captureEntities: true, useScaling: true, captureMech: false });
    cm.frame(r, b, env());
    expect(cm.cameraFrame).toBe(1);
    expect(cm.cameraLock).toBe(true);   // 帧 4 前 activeSettings 尚 null,无误收尾
    cm.frame(r, b, env());
    expect(cm.cameraFrame).toBe(2);
    // 到计数值 4 后的下一帧 Capture 转正（:1549-1552 先查后加:0→1→2→3→4
    // 各帧不触发,第 5 帧查得 4 才触发）——node 无 DOM 队空即同帧收尾解锁
    cm.frame(r, b, env());   // → 3
    cm.frame(r, b, env());   // → 4（此帧不触发:查询时仍 3）
    expect(cm.cameraFrame).toBe(4);
    cm.frame(r, b, env());   // 查得 4 → capture+finish → frame 5, lock false
    expect(cm.cameraFrame).toBe(5);
    expect(cm.cameraLock).toBe(false);
    // 退坡:每帧 -1 回 0
    for (let i = 0; i < 5; i++) cm.frame(r, b, env());
    expect(cm.cameraFrame).toBe(0);
  });

  it('progress:tile 计数比值（CaptureCamera.GetProgress :271-274）', () => {
    const cm = new CaptureInterface();
    const inner = cm as unknown as { tilesProcessed: number; totalTiles: number };
    inner.tilesProcessed = 250; inner.totalTiles = 1000;
    expect(cm.progress).toBeCloseTo(0.25, 6);
  });
});

describe('M6 options 集成面（回归）', () => {
  it('options.keybinds 持久化清洗路径不受新默认影响', () => {
    // ToggleCameraMode 无自定义时走默认 F4（bindsOf 缺省路径）
    expect(options.data.keybinds?.ToggleCameraMode ?? DEFAULT_KEYBINDS.ToggleCameraMode).toEqual(['F4']);
  });
});
