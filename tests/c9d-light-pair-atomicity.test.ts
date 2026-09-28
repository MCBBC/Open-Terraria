// ★C9d 公共采样对原子性（2026-09-27）：光照格移动抖动定谳修复的判别器+结构锁。
//
// 定谳机制链（worker 化后）：ensureRegion 每 tick 把公共区域原点推到 fresh_N，但数组
// 仍锚定 fresh_{N-1}（worker 结果）→ 渲染采样窗口 =（区域 fresh_N + 数组 fresh_{N-1}）
// 不成对 → lightAt 索引偏移每 tick 移动量 → 光照格抖动；onResult 到达才恢复成对，
// 下 tick ensureRegion 又拆开 = 每 tick 循环。修复：区域与公共采样对分离——公共
// (rx,ry,rw,rh,r,g,b) 只在结果到达/applyPending/本地原子发布三写点整体替换。
//
// 本文件三判据：
//   ① 抖动红绿判别器：脚本化 worker link（结果=世界锚定棋盘,区域随快照走）+
//     相机往复移动+结果「渲染后才回达」调度 —— 旧码 lightAt(固定世界格) 随 tick
//     抖动（采样偏移 ±3 格）;新码恒定（恒=1 tick 前计算值,世界锚定模式值）。
//   ② 传送大跳兜底：live 态快照区域跳出公共采样域覆盖 → 同 tick 本地全周期
//     （vanilla 双 LightTiles 同帧出光对齐）→ lightAt(新位置) 非黑非垃圾。
//   ③ 结构锁（源码扫描）：公共面写点仅 applyWorkerResult/applyPending/原子发布
//     三处;ensureRegion 只写快照面;镜像驱动（runSnapshotOnEngine）不直写公共面。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LightingEngine, type LightingWorld } from '../src/lighting/LightingEngine';
import { lightGateDiag } from '../src/lighting/LightingEngine';
import type {
  LightResultMsg, LightSnapshotMsg, TileSlicePack,
} from '../src/lighting/LightWorkerProtocol';
import type { LightTarget } from '../src/lighting/LightWorkerLink';
import { TileStore } from '../src/world/TileStore';

// ---- 世界锚定棋盘（fake worker 的「光照计算」——值只依赖世界格坐标,与区域原点无关;
//      采样对成对 ⇒ lightAt(固定格) 恒等于本式;拆对 ⇒ 读到邻格值=抖动） ----
const pat = (tx: number, ty: number): number => ((tx * 7 + ty * 13) % 32) * 8;

const VIEW_W = 60, VIEW_H = 40;
const START_CX = 100 * 16, START_CY = 60 * 16;   // 相机起点（像素,玩家中心约定）

function makeWorld(): LightingWorld {
  return {
    store: new TileStore(200, 200),
    groundLevel: 30,
    lavaLine: 190,
    clock: { timeOfDay: 0.5, dayCount: 1 },
  };
}

/** 脚本化 worker link：实现引擎 compute 消费的 LightWorkerLink 面（healthy/isLive/
 *  lastLagMs/applyPending/buildSlice/send/liveAuth/onResult）。
 *  deliverNow=测试驱动的「结果回达」：按收到的快照区域产出世界锚定棋盘结果,
 *  仅 liveAuth（引擎 live 态）时经 onResult 回达——复刻真链 C9c 到达即应用门。 */
class ScriptedLink {
  liveAuth = false;
  onResult: ((m: LightResultMsg) => void) | null = null;
  private delivered = 0;
  private held: LightSnapshotMsg | null = null;
  lastSent: LightSnapshotMsg | null = null;
  healthy(): boolean { return true; }
  isLive(): boolean { return this.delivered > 0; }
  get lastLagMs(): number { return 5; }   // ≤ 进阈 25ms → 8 好拍后转 live
  applyPending(_t: LightTarget): boolean { return false; }
  buildSlice(): TileSlicePack {
    return {
      sx: 0, sy: 0, sw: 0, sh: 0, px: 0, py: 0,
      type: new Uint16Array(0), flags: new Uint8Array(0),
      frameX: new Uint16Array(0), frameY: new Uint16Array(0),
      wall: new Uint16Array(0), liquid: new Uint8Array(0), liquidType: new Uint8Array(0),
      half: new Uint8Array(0), slope: new Uint8Array(0), wire: new Uint8Array(0),
      paint: new Uint8Array(0), paintWall: new Uint8Array(0), coat: new Uint8Array(0),
      showInvisibleBlocks: false,
    };
  }
  /** ★C9d2 二期:引擎切片入口改走 buildWorkerTiles（假链同款零尺寸包,语义不变） */
  buildWorkerTiles(): TileSlicePack { return this.buildSlice(); }
  send(msg: Omit<LightSnapshotMsg, 'op' | 'seq'>): void { this.lastSent = msg as LightSnapshotMsg; }
  dispose(): void { /* noop */ }
  /** 测试驱动：worker 算完回达（在「渲染后、下一 fixedUpdate 前」调用=最快调度） */
  deliverNow(): void {
    const m = this.lastSent;
    if (!m) return;
    const n = m.rw * m.rh;
    const R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n);
    for (let y = 0; y < m.rh; y++) {
      for (let x = 0; x < m.rw; x++) {
        const v = pat(m.rx + x, m.ry + y);
        const i = y * m.rw + x;
        R[i] = v; G[i] = v; B[i] = v;
      }
    }
    this.delivered++;
    const msg: LightResultMsg = { op: 'light', seq: m.seq, rx: m.rx, ry: m.ry, rw: m.rw, rh: m.rh, R, G, B };
    if (this.liveAuth) this.onResult?.(msg);
    else this.held = msg as unknown as LightSnapshotMsg;   // warmup 期真链=滞留 pending 不应用
  }
}

/** 引擎 + 脚本化 link 注入（onResult 绑定复刻生产构造器语义:整体回填公共面——
 *  旧码=构造器内联四字段+三数组直写;新码=applyWorkerResult,语义相同） */
function makeLiveEngine(): { e: LightingEngine; link: ScriptedLink } {
  const e = new LightingEngine(makeWorld());
  const link = new ScriptedLink();
  (e as unknown as { _lw: unknown })._lw = link;
  link.onResult = (m) => {
    const t = e as unknown as LightTarget;
    t.rx = m.rx; t.ry = m.ry; t.rw = m.rw; t.rh = m.rh;
    t.r = m.R; t.g = m.G; t.b = m.B;
  };
  return { e, link };
}

describe('C9d ① 移动抖动红绿判别器（live 态,相机往复,结果渲染后才回达）', () => {
  it('固定世界格 lightAt 全程恒定=世界锚定模式值（旧码在 ±3 格采样偏移上抖动）', () => {
    const { e, link } = makeLiveEngine();
    let camX = START_CX;
    const camY = START_CY;
    // warmup：静止相机 20 tick,让粘性 live 门入场（lag=5ms 恒好拍,8 拍+有结果 → live）
    for (let t = 0; t < 20; t++) {
      e.ensureRegion(camX, camY, VIEW_W, VIEW_H);
      e.compute(0);
      link.deliverNow();
    }
    expect(lightGateDiag.live).toBe(true);   // 已进 live（纯 worker 路径=抖动窗口所在态）

    const fx = 100, fy = 60;                 // 固定世界格（往复扫描中心,恒在采样域内）
    const samples: number[] = [];
    for (let t = 0; t < 48; t++) {
      const dir = Math.floor(t / 6) % 2 === 0 ? 1 : -1;   // 每 6 tick 折返,3 格/tick
      camX += dir * 3 * 16;
      e.ensureRegion(camX, camY, VIEW_W, VIEW_H);
      e.compute(0);
      samples.push(e.lightAt(fx, fy)[0]);    // 「渲染帧」采样点=compute 后、结果回达前
      link.deliverNow();                     // 结果在渲染后回达（最坏调度相位）
    }
    const jitter = [...new Set(samples)];
    expect(samples.length).toBe(48);
    // 绿判据：世界静止+世界锚定模式 → 固定格读数恒定（恒=1 tick 前计算值）
    expect(jitter).toEqual([pat(fx, fy)]);
  });
});

describe('C9d ② 传送大跳同帧兜底（live 态,快照区域跳出公共域覆盖）', () => {
  it('传送后首 tick lightAt(新位置)=新鲜本地值（非黑/非垃圾,vanilla 同帧出光）', () => {
    const { e, link } = makeLiveEngine();
    let camX = START_CX;
    const camY = START_CY;
    for (let t = 0; t < 20; t++) {
      e.ensureRegion(camX, camY, VIEW_W, VIEW_H);
      e.compute(0);
      link.deliverNow();
    }
    expect(lightGateDiag.live).toBe(true);
    // 传送：跳出 padding 带（>28 格）;落点亮源=手持光（本地兜底扫描真实消费面）
    camX = 180 * 16;
    e.heldLight = { tx: 180, ty: 60, r: 1, g: 0.95, b: 0.8 };
    e.ensureRegion(camX, camY, VIEW_W, VIEW_H);
    e.compute(0);
    // 传送落点格：新视口中心——本地兜底同帧发布成对结果（真实扫描值,非黑窗/非垃圾）
    expect(e.lightAt(180, 60)[0]).toBeGreaterThan(0);
    expect(e.rw * e.rh).toBe(e.r.length);   // 公共对自洽
    expect(lightGateDiag.live).toBe(true);  // 粘性 live 门不受兜底影响
    link.deliverNow();
  });
});

describe('C9d ③ 公共采样对写点结构锁（源码扫描）', () => {
  const srcOf = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

  /** 方法体 span（签名正则 → 起止偏移;花括号配平） */
  function methodSpan(src: string, sig: RegExp): [number, number] {
    const m = src.match(sig);
    if (!m || m.index === undefined) throw new Error(`method not found: ${sig}`);
    const open = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return [m.index, i]; }
    }
    throw new Error(`unbalanced braces after: ${sig}`);
  }

  it('LightingEngine 公共面写点仅 applyWorkerResult（=onResult）与 processBlurAndPresent 发布两处', () => {
    const src = srcOf('../src/lighting/LightingEngine.ts');
    const spans = [
      methodSpan(src, /private applyWorkerResult\(m: LightResultMsg\): void/),
      methodSpan(src, /private processBlurAndPresent\(\): void/),
    ];
    const writes = [...src.matchAll(/this\.(?:rx|ry|rw|rh|r|g|b)\s*=/g)];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      const ok = spans.some(([a, b]) => w.index! >= a && w.index! <= b);
      if (!ok) {
        throw new Error(`公共面写点逃逸三原子写点: ...${src.slice(Math.max(0, w.index! - 60), w.index! + 40)}...`);
      }
    }
  });

  it('LightWorkerLink.applyPending 是 link 侧唯一公共面写点', () => {
    const src = srcOf('../src/lighting/LightWorkerLink.ts');
    const span = methodSpan(src, /applyPending\(t: LightTarget\)/);
    const writes = [...src.matchAll(/\bt\.(?:rx|ry|rw|rh|r|g|b)\s*=/g)];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w.index! >= span[0] && w.index! <= span[1]).toBe(true);
    }
  });

  it('runSnapshotOnEngine（worker 镜像驱动）不直写公共面——区域经 setSnapshotRegion 走快照面', () => {
    const src = srcOf('../src/lighting/LightWorkerProtocol.ts');
    const direct = [...src.matchAll(/\be\.(?:rx|ry|rw|rh|r|g|b)\s*=/g)];
    expect(direct).toEqual([]);
    expect(src).toContain('setSnapshotRegion');
  });
});

describe('C9d ④ 本地路径（无 worker）成对冒烟', () => {
  it('ensureRegion+dirty+compute 后公共对自洽、天空域有光', () => {
    const e = new LightingEngine(makeWorld());
    e.ensureRegion(100 * 16, 40 * 16, VIEW_W, VIEW_H);
    e.dirty = true;
    e.compute(0);
    expect(e.rw * e.rh).toBe(e.r.length);
    expect(e.lightAt(100, 20)[0]).toBeGreaterThan(0);   // 地表上空=天空环境光
    const v = e.lightAt(100, 150)[0];                    // 深地下=黑暗
    expect(v).toBe(0);
  });
});
