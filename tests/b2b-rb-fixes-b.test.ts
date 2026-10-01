// ★红蓝批 B（管线/波场/杂域）修复守卫（2026-09-25）。
// R1-F5/F6/F9/F10/F11/F12（管线域）+ R2-F2/F3、R3-F2（波场域）+
// R3-F4/F7/F8/F9（杂域）。红→绿判别式见各 it 注;源码锁=node 无 DOM 的结构面,
// 运行时锁=WaterWaves 纯 JS 内核/GLStats 伪 GL 面。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { waterWaves, queueRippleRaw, RippleShape } from '../src/render/WaterWaves';
import { registerFence, glStatFrame } from '../src/render/GLStats';

const COMP = readFileSync(resolve(__dirname, '../src/render/GLWorldCompose.ts'), 'utf8');
const WL = readFileSync(resolve(__dirname, '../src/render/GLWorldLight.ts'), 'utf8');
const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const WWK = readFileSync(resolve(__dirname, '../src/workers/WaveWorker.ts'), 'utf8');
const WV = readFileSync(resolve(__dirname, '../src/render/WaterWaves.ts'), 'utf8');
const GAME = readFileSync(resolve(__dirname, '../src/core/Game.ts'), 'utf8');
const SHIM = readFileSync(resolve(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');
const STATS = readFileSync(resolve(__dirname, '../src/render/GLStats.ts'), 'utf8');

// ---- R1-F5:9 参 DOM 源 texSubImage2D 信念分裂 → scratch 判例统一 ----
describe('R1-F5 光照脏行带上传 scratch 判例统一', () => {
  it('GLWorldCompose/GLWorldLight 零松散 9 参 DOM 源 texSubImage2D（Firefox TypeError 面）', () => {
    expect(COMP).not.toContain('(gl as unknown as { texSubImage2D');
    expect(WL).not.toContain('(gl as unknown as { texSubImage2D');
    // 带支=标准 7 参 DOM 源整面上传（(0, band.y) dst;scratch 判例）
    expect(COMP).toMatch(/gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, lightBand\.y, gl\.RGBA, gl\.UNSIGNED_BYTE, bs\)/);
    expect(WL).toMatch(/gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, lightBand\.y, gl\.RGBA, gl\.UNSIGNED_BYTE, bs\)/);
  });
  it('双文件 bandScratch=带尺寸 scratch+willReadFrequently 纯上传中转（texSubUpdate 判例）', () => {
    for (const [name, s] of [['compose', COMP], ['worldLight', WL]] as const) {
      expect(s, name).toContain('private bandScratch(src: HTMLCanvasElement, w: number, h: number)');
      expect(s, name).toMatch(/getContext\('2d', \{ willReadFrequently: true \}\)/);
      expect(s, name).toContain('c.drawImage(src, 0, 0, w, h, 0, 0, w, h)');
    }
  });
});

// ---- R1-F6:recreate 不重置 noiseW/noiseH → incomplete 纹理采样面 ----
describe('R1-F6 recreate 噪声尺寸重置', () => {
  it('recreate 与四 texKey 同批清 noiseW/noiseH（无噪声帧中性垫底门不再被陈旧值跳过）', () => {
    expect(COMP).toMatch(
      /this\._texKeyWorld = ''; this\._texKeyLight = ''; this\._texKeyNoise = ''; this\._texKeyWater = '';\s*\n\s*\/\/ ★R1-F6[\s\S]{0,200}this\.noiseW = 0; this\.noiseH = 0;/);
  });
});

// ---- R1-F9:管线死亡帧 skyPend 泄漏 → 显式丢弃+观测位 ----
describe('R1-F9 死亡帧挂起天空栈显式丢弃', () => {
  it('presentPendingSky 死管线早退支:dead-drop 观测位+不涨 fallback（归因面）', () => {
    expect(RDR).toMatch(
      /private presentPendingSky\(sky: \{ fboName: string; w: number; h: number \}, viewW: number, viewH: number\): void \{\s*\n\s*const pipe = this\.swPipe;\s*\n\s*if \(!pipe \|\| pipe\.unavailable\) \{\s*\n\s*this\.opresentStats\['dead-drop'\] = \(this\.opresentStats\['dead-drop'\] \|\| 0\) \+ 1;\s*\n\s*return;\s*\n\s*\}/);
    expect(RDR).toContain("opresentStats['dead-drop']");
    expect(RDR).toContain("opresentStats['fallback']");   // 活管线回退面计数保留
  });
});

// ---- R1-F10:newWorldCompose 退避窗自建第二管线 → 返 null 走旧链 ----
describe('R1-F10 共管退避窗禁自建管线', () => {
  it('newWorldCompose 可返 null:cloudpipe 开而 acquireSwPipe 缺 = null(旧链/降级)★P0-A 金标再生:null 支带指纹+toast', () => {
    // ★P0-A（2026-09-25 塌方定谳续刀）:null 支不再静默——markSwPipeSkip 按 acquire
    //  失败因落 lrecon-skip:swpipe-* 指纹+notifySwPipeDegrade 一次性 toast;禁自建
    //  第二管线承诺不变（pipe 缺 → return null,不触 GLWorldCompose 构造）。
    // ★X2 重锚（2026-10-01）:C10e（bf69b208）在首门加 !Renderer.c10e 收窄臂+两行
    //  注释——cloudpipe=0 逃生门在 c10e 下强制共管（Renderer.ts:4032-4035,设计文档
    //  §八.4）;null 支/markSwPipeSkip/notify/尾构造逐字未动,仅首门条件扩张。
    expect(RDR).toMatch(
      /private newWorldCompose\(\): GLWorldCompose \| null \{[^]*?if \(!Renderer\.cloudPipe && !Renderer\.c10e\) return new GLWorldCompose\('worldCompose', null\);\s*\n\s*const pipe = this\.acquireSwPipe\(\);\s*\n\s*if \(!pipe\) \{[^]*?this\.markSwPipeSkip\(\(this\.swPipeFailWhy \|\| 'backoff'\) as 'backoff' \| 'init-fail' \| 'starvelock'\);\s*\n\s*this\.notifySwPipeDegrade\(\);\s*\n\s*return null;\s*\n\s*\}\s*\n\s*return new GLWorldCompose\('worldCompose', pipe\);\s*\n\s*\}/);
  });
  it('双消费点 null 安全（lrecon 支+A2 支;??= 每帧重试语义保持）', () => {
    // ★R1b-2（2026-09-27 红蓝批 β）:??= 收口进 ensureWorldCompose（旗面错位实例
    //  整弃重建后 ??= 重试语义不变,null 安全承诺不变）
    expect(RDR.match(/this\.ensureWorldCompose\(\);\s*\n\s*const wcL = this\.worldCompose\?\.acquire\(\) \?\? null;/g)?.length ?? 0).toBe(1);
    expect(RDR.match(/this\.ensureWorldCompose\(\);\s*\n\s*const wc = this\.worldCompose\?\.acquire\(\) \?\? null;/g)?.length ?? 0).toBe(1);
    // 不得再出现「构造即解引用」形态
    expect(RDR).not.toContain('(this.worldCompose ??= this.newWorldCompose()).acquire()');
  });
});

// ---- R1-F11:K<1 acc 深回退 mask 无 dst 尺寸 ----
describe('R1-F11 acc 深回退回贴 dst 拉伸', () => {
  it('lightFast acc 支与 worldCanvas 支、读回失败保底支全带 dst 尺寸（低清档拉伸回填约定）', () => {
    expect(RDR).toContain('this.ctx.drawImage(this.swPipe.canvas, 0, 0, viewW, viewH);');
    expect(RDR).toMatch(/if \(!wimg\) \{ this\.ctx\.drawImage\(this\.lightCanvas, 0, 0, viewW, viewH\); return; \}/);
    // lightFast 块内不得再有裸 1:1 直画（fragment 窗定位）
    const lf = RDR.indexOf('if (Renderer.lightFast && all === 255)');
    expect(lf).toBeGreaterThan(-1);
    expect(RDR.slice(lf, lf + 700)).not.toMatch(/drawImage\((this\.swPipe\.canvas|this\.worldCanvas!), 0, 0\)/);
  });
});

// ---- 波场域:R2-F2 / R2-F3 / R3-F2 ----
const anySys = waterWaves as unknown as Record<string, unknown> & {
  resetForTest(): void;
  setQuality(q: number): void;
  frame(inp: object): void;
  injectWash(...a: number[]): void;
  wwActive(): boolean;
  readGridR(): Float32Array;
  exportFieldSnapshot(): { R: Float32Array; G: Float32Array };
  _ensure(w: number, h: number): void;
  _wwApplyField(m: object): void;
  _R2: Float32Array; _G2: Float32Array; _R: Float32Array;
  _wwOn: boolean; _ww: { postMessage(m: unknown): void; terminate(): void } | null;
  _wwStartedAt: number;
  _wwWd: { healthy(now: number, errored: boolean): boolean; fallReason(): string;
    onSend(now: number): void; onResult(now: number): void } | null;
};

const INP = { camX: 0, camY: 0, zoom: 1, viewW: 40, viewH: 40, tileX: 5, tileY: 5,
  maxTilesX: 100, maxTilesY: 100, worldSurface: 20, rockLayer: 60, windAbs: 0, rain: 0, dt: 1 / 60 };

describe('R2-F2 场快照换长贴身对齐 _R2/_G2（NaN 毒化判别）', () => {
  beforeEach(() => {
    anySys.resetForTest();
    anySys.setQuality(3);
    anySys._wwOn = false;
    anySys._ww = null;
  });
  it('快照换长后 _R2/_G2 同步对齐;看门狗回落本地 _step 全场有限值', () => {
    anySys._ensure(8, 6);   // 主线程旧尺寸 48
    anySys._wwApplyField({ R: new Float32Array(100).fill(0.7), G: new Float32Array(100).fill(0.5),
      gW: 10, gH: 10, progress: 0.5, intensity: 1, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] });
    expect(anySys.readGridR().length).toBe(100);
    expect(anySys._R2.length).toBe(100);   // ★修复前=48（红判别式）
    expect(anySys._G2.length).toBe(100);
    // 回落帧:本地 _step 两次（swap 后读旧短长=OOB undefined→NaN,修复前红）
    anySys._wwOn = false;
    anySys.frame(INP);
    anySys.frame(INP);
    const R = anySys.readGridR();
    expect(R.length).toBe(100);
    for (const v of R) expect(Number.isFinite(v)).toBe(true);
  });
  it('_ensure 兜底查四数组（gW 匹配而 _R2 陈旧长 → 重建不 early-return）', () => {
    anySys._ensure(10, 10);
    (anySys._R2 as Float32Array) = new Float32Array(5);
    anySys._ensure(10, 10);
    expect(anySys._R2.length).toBe(100);
  });
});

describe('R2-F3 看门狗回落帧重放注入批', () => {
  beforeEach(() => {
    anySys.resetForTest();
    anySys.setQuality(3);
    anySys._wwOn = false;
    anySys._ww = null;
  });
  it('回落帧 wash 批本地重放落场（修复前=批丢弃静水中）+回落态收口', () => {
    // 假 worker 臂:首帧正常 worker 分支（建空 capture 批）→ 注入两笔 → 越看门狗回落
    anySys._ww = { postMessage() { /* 吞 */ }, terminate() { /* no-op */ } };
    anySys._wwOn = true;
    anySys._wwStartedAt = performance.now();
    // ★X2 夹具补桩（2026-10-01）:看门狗治理（9b217f01,2026-09-28）后 frame() 经
    //  _wwWd.healthy(outstanding-aware) 定谳失效,假 worker 直设路径不再自带 _wwWd
    //  → 桩补齐;定谳开关由用例显式臂控（旧墙钟 _wwStartedAt 窗已退役）。
    let wdHealthy = true;
    anySys._wwWd = {
      healthy: () => wdHealthy,
      fallReason: () => 'test-stub',
      onSend: () => {},
      onResult: () => {},
    };
    anySys.frame(INP);                          // worker 分支:_wwCapture 归空批
    anySys.injectWash(20, 20, 40, 40, 0.9, 0.5, 0.8);   // 世界 px → 栅格中心洗掠
    queueRippleRaw(24, 24, 20, 20, 0.25, 0.6, 0.5, RippleShape.Circle, 0);
    // 快照喂场（10×10 对齐 INP 视口栅格）——回落帧注入写进这份场
    anySys._wwApplyField({ R: new Float32Array(100).fill(0.5), G: new Float32Array(100).fill(0.5),
      gW: 10, gH: 10, progress: 0.5, intensity: 1, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] });
    wdHealthy = false;                          // 越看门狗窗 → 桩定谳失效
    anySys.frame(INP);                          // 回落帧:批重放+本地模拟
    expect(anySys.wwActive()).toBe(false);
    const R = anySys.readGridR();
    expect(R.some((v) => v !== 0.5)).toBe(true);   // ★修复前=全中性（红判别式）
  });
});

describe('R3-F2 场快照 transferable 零拷贝', () => {
  // ★C8-D（2026-09-25）更新：常规面改 exportFieldDelta 脏区增量（三形态 per-fmt
  // transfer list）——transferable 零拷贝语义沿用,source 锚随协议升级换锚。
  it('WaveWorker postMessage 带 per-fmt transfer list;exportFieldDelta 出口在位', () => {
    expect(WWK).toContain('const snap: WWFieldMsg = waterWaves.exportFieldDelta(');
    expect(WWK).toContain('? [snap.meta.buffer, snap.data.buffer]');
    expect(WWK).toContain(': [snap.R.buffer, snap.G.buffer];');
    expect(WWK).toContain('detach 即弃');
  });
  it('exportFieldSnapshot=独立 buffer 副本（本体不被快照写穿透;transfer 安全前提）', () => {
    anySys.resetForTest();
    anySys.setQuality(3);
    anySys._ensure(4, 4);
    const snap = anySys.exportFieldSnapshot();
    expect(snap.R).not.toBe(anySys.readGridR());
    snap.R[0] = 0.9;
    expect(anySys.readGridR()[0]).not.toBe(0.9);
  });
});

// ---- 杂域:R3-F4 / R3-F7 / R3-F8 / R3-F9 ----
describe('R3-F4 日曜盾/禁戒环染面缓存', () => {
  it('bodyAccDyeBake 单源缓存（键含朝向+200ms 时间桶;容量闸+2s 修剪）', () => {
    expect(RDR).toContain('private bodyAccDyeBake(tex: HTMLImageElement | ImageBitmap | HTMLCanvasElement,');
    expect(RDR).toContain('private readonly solarDyeCache = new Map<string, HTMLCanvasElement>();');
    // 两消费点（日曜盾 s:前缀/禁戒环 f:74）都走缓存口,不再各自 createElement
    expect(RDR).toContain("this.bodyAccDyeBake(tex, emu, dyeVid, p.facing, `s:${p.solarShields}`)");
    expect(RDR).toContain("this.bodyAccDyeBake(tex, emu, dyeVid, p.facing, 'f:74')");
    const i = RDR.indexOf('---- 日曜盾球（DrawPlayer_26_SolarShield');
    const j = RDR.indexOf('---- 手持物层（DrawPlayer_27_HeldItem）');
    expect(RDR.slice(i, j).match(/document\.createElement\('canvas'\)/g)?.length ?? 0).toBe(0);
    expect(RDR).toMatch(/Math\.floor\(performance\.now\(\) \/ 200\)/);   // R33 时间桶判例
  });
});

describe('R3-F7 双 loadWorld 旧光照引擎 dispose', () => {
  it('赋值前 dispose 旧实例（光照 Worker 链不跨世界泄漏;dispose 幂等）', () => {
    expect(GAME).toMatch(/this\.lighting\?\.dispose\(\);\s*\n\s*this\.lighting = new LightingEngine\(w\);/);
  });
});

describe('R3-F8 隔离栅格化 scratch willReadFrequently', () => {
  it('四栅格化消费点 getContext 全带 WRF（纯上传中转,SHM 后备不占 IOSurface）', () => {
    // ★四柱掉帧批（2026-09-25）+1：rasterizePathOp（acc 态 stroke/fill 录制路径
    //   隔离栅格化,drawForceFieldBubble 尾环消费面）同款 WRF 口径入列
    expect((SHIM.match(/const sctx = sc\.getContext\('2d', \{ willReadFrequently: true \}\);/g) ?? []).length).toBe(4);
    expect(SHIM).not.toContain("const sctx = sc.getContext('2d');");
  });
});

describe('R3-F9 fence 注册表 revive 换槽', () => {
  it('死槽 isContextLost → 同名 registerFence 顶替新 gl;活槽幂等（运行时判别）', () => {
    const calls: string[] = [];
    const mk = (tag: string, lost: boolean): unknown => ({
      fenceSync: () => { calls.push(tag); return { s: tag }; },
      clientWaitSync: () => 0x911c,           // CONDITION_SATISFIED（本假体立即完成）
      deleteSync: () => { /* no-op */ },
      isContextLost: () => lost,
      ALREADY_SIGNALED: 0x911a,
      CONDITION_SATISFIED: 0x911c,
    });
    const dead = mk('dead', true);
    const live = mk('live', false);
    registerFence('rb-b-fence', dead as Parameters<typeof registerFence>[1]);
    registerFence('rb-b-fence', live as Parameters<typeof registerFence>[1]);   // 旧槽死 → 顶替
    for (let i = 0; i < 12; i++) glStatFrame();   // 越过 FENCE_EVERY=10 发射窗
    expect(calls).toContain('live');    // ★修复前=[]（红判别式:槽钉死旧 gl）
    expect(calls).not.toContain('dead');
    // 活槽幂等:再注册不换槽（calls 不翻倍）
    registerFence('rb-b-fence', mk('live2', false) as Parameters<typeof registerFence>[1]);
    const n = calls.length;
    for (let i = 0; i < 12; i++) glStatFrame();
    expect(calls.length).toBeGreaterThan(n);          // 槽仍活,继续发
    expect(calls).not.toContain('live2');             // 未被顶替
  });
  it('源码锚:registerFence 死槽检测在位', () => {
    expect(STATS).toMatch(/const old = fencesByCtx\.get\(name\);[\s\S]{0,200}isContextLost/);
  });
});
