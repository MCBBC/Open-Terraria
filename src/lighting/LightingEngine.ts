// 光照引擎(Terarria1456 Terraria.Graphics.Light/LightingEngine.cs 一比一)。
// 4 状态轮转(MinimapUpdate→ExportMetrics→Scan→Blur),每 tick 推进一态;
// dirty(tile 改动/区域移动/手持光)→ 同 tick 快进整个周期(原版传送双 LightTiles 技巧);
// liquidDirty → 同快进但 3 tick 节流(20Hz)。
// 替换原 BFS 引擎(备份见 docs/backup/LightingEngine.legacy.bak.ts)。
// ★C9d(2026-09-27)快照面/公共采样对分离:ensureRegion 只写快照面,公共 (区域,数组)
// 由三原子写点整体替换(worker 结果到达/applyPending/本地发布)——移动抖动定谳修复,
// 详见公共面字段头注与 tests/c9d-light-pair-atomicity。
import { TILE } from '../core/constants';
import { TileStore } from '../world/TileStore';
import { AREA_PADDING, globalBrightness, NON_VISIBLE_PADDING } from './lightTables';
import { FlickerClock } from './SkyColor';
import { LightMap } from './LightMap';
import { PerFrameLight, ScannerWorld, TileLightScanner } from './TileLightScanner';
import { LightWorkerLink, lightWorkerFlag } from './LightWorkerLink';
import { buildEngineSnapshot, type DecayArgs, type LightResultMsg, type LightSnapshotMsg } from './LightWorkerProtocol';

/** 引擎依赖的最小世界结构(World 结构兼容;单测可注入 fake) */
export interface LightingWorld {
  store: TileStore;
  groundLevel: number;  // 原版 worldSurface
  lavaLine: number;     // 原版 UnderworldLayer
  clock: { timeOfDay: number; dayCount: number };
}

const enum State { MinimapUpdate = 0, ExportMetrics = 1, Scan = 2, Blur = 3 }

// ---- ★C9c-v3 粘性 live 门（2026-09-27 处方——v2 出阈残留缺陷定谳;v1 设计错翻案史 retained）----
// v1 固定 12ms 绝对阈的缺陷:lagMs=send→apply 端到端（含主线程消息调度延迟）,忙机
// （帧耗 ~8-20ms）恒超标（用户机 F5 实测恒 ~20>12）→ live 永不可达=warmup 本地
// 双跑【永久化】（trace:光照主线程残部 1911ms——exportTo 250+blurLine 172+
// processBlurPresent 171,worker 同跑;且双跑自身维持忙=正反馈锁死。「骤降难回升」
// 闩族合集的第三枚）。v2=滑动 p50 相对判据:进=1.5×TICK（容忍忙机 ≤1 tick 级调度
// 延迟）,出=2.5×TICK——★v2 出场缺陷（用户实报弱机光照延迟更新闪烁）:lag 20-60ms
// 震荡跨出阈→live/warmup 交替两源上屏闪烁,每次回退强制本地全周期=更卡→更深横跳
// 正反馈。v3=粘性 live:lag 只作【进场资格】（连续 8 拍 ≤进阈即入）,入后出场唯一
// 条件=看门狗级硬故障（2s 无回传/异常回执/onerror——LightWorkerLink 既有 fallback
// 面）;live 恒 1 tick 陈旧但稳定 > 新鲜/陈旧交替闪烁,双跑省下 7-12% 给弱机续命。
// ?lightlag=ms 仍=绝对阈手动模式（阈只作用于进场资格,探针/强扭矩面）。
// worker 上下文禁 URL 探测（fork bomb 判例家族,恒自适应缺省）。
export const LIGHT_TICK_MS = 1000 / 60;
const LIGHT_LAG_MANUAL = (() => {
  try {
    if (typeof document === 'undefined') return 0;
    const v = Number(new URLSearchParams(location.search).get('lightlag'));
    return v > 0 ? v : 0;   // 0=未设→自适应模式
  } catch { return 0; }
})();
export const LIGHT_GATE_MODE: 'adaptive' | 'manual' = LIGHT_LAG_MANUAL > 0 ? 'manual' : 'adaptive';
/** 进/出阈（ms）:手动模式 enter=exit=lightlag 值（v1 语义）;自适应=p50 相对判据 */
export const LIGHT_LIVE_ENTER_MS = LIGHT_LAG_MANUAL > 0 ? LIGHT_LAG_MANUAL : LIGHT_TICK_MS * 1.5;
export const LIGHT_LIVE_EXIT_MS = LIGHT_LAG_MANUAL > 0 ? LIGHT_LAG_MANUAL : LIGHT_TICK_MS * 2.5;
const LIGHT_LIVE_ENTER = 8;
/** ★C9c-v3 门诊断面（F5 消费;模块级单例——引擎实例归 Game 内部,报告面免接线）。
 *  exitReason=出场原因（'watchdog'=看门狗级硬故障唯一出场;null=未出场）——v3 新增
 *  字段,F5 既有字段（live/good/bad/p50Ms/lastLagMs/enterMs/exitMs/mode/ring）全兼容 */
export const lightGateDiag = {
  live: false, good: 0, bad: 0, p50Ms: 0, lastLagMs: 0,
  enterMs: LIGHT_LIVE_ENTER_MS, exitMs: LIGHT_LIVE_EXIT_MS, mode: LIGHT_GATE_MODE, ring: 0,
  exitReason: null as 'watchdog' | null,
};

/** ★C9c-v3 粘性 live 门步进（纯函数供单测）：lag>p50 阈→坏拍计数（清好拍）,≤阈值→
 *  好拍计数（清坏拍）;lag≤0（尚无结果）不计拍。warmup 态好拍满 ENTER 且已有结果→
 *  进 live。【出场已删】（v2「live 态坏拍满 2→回退」在弱机成横跳源,见文件头注）——
 *  入后出场唯一条件=看门狗级硬故障（引擎 compute() !lw.healthy() 面,非本函数）。
 *  enterMs/exitMs=v2 自适应阈（相对 tick 周期;?lightlag 手动模式两者相等,只作用于
 *  进场资格）——缺省取模块常量,既有单测契约（无阈参调用）进场行为保持同行为;
 *  fell 字段保留兼容（恒 false,lag 出场已删）;live 态坏拍计数保留=纯诊断面。 */
export function liveGateStep(
  live: boolean, good: number, bad: number, lag: number, hasResult: boolean,
  enterMs: number = LIGHT_LIVE_ENTER_MS, exitMs: number = LIGHT_LIVE_EXIT_MS,
): { live: boolean; good: number; bad: number; fell: boolean } {
  // 坏拍阈=双阈分态:warmup 对进阈（lag>p50 进阈=坏拍禁 entry）,live 对出阈（仅
  // 诊断计数不退场）;手动模式两者相等=v1 语义（进场资格侧）
  const threshold = live ? exitMs : enterMs;
  if (lag > threshold) { bad++; good = 0; }
  else if (lag > 0) { good++; bad = 0; }
  if (!live) {
    if (hasResult && good >= LIGHT_LIVE_ENTER) live = true;
  }
  return { live, good, bad, fell: false };
}

export class LightingEngine {
  world: LightingWorld;
  // ---- 公共面(与 Game.ts/Renderer.ts 契约,勿改) ----
  // ★C9d(2026-09-27)公共采样对=「最近一次成对结果」:区域 (rx,ry,rw,rh) 与数组
  // (r,g,b) 恒同锚,只允许三原子写点整体替换——①applyWorkerResult(onResult 到达)
  // ②LightWorkerLink.applyPending(兜底回填) ③processBlurAndPresent 尾部本地原子
  // 发布。ensureRegion 只写快照面,不再直改公共面。
  // 【抖动定谳】worker 化前本地路径同 tick 重算,区域先行平移不可见;worker 化后
  // 数组=1 tick 前 worker 结果,ensureRegion 每 tick 先行推原点 → 渲染采样窗口=
  // (区域 fresh_N+数组 fresh_{N-1}) 拆对 → lightAt 索引偏移每 tick 移动量(峰值
  // 1-2 格) → 光照格一抖一抖;onResult 到达才恢复成对,下 tick 又拆开=每 tick 循环
  // (主线程忙→结果晚到→拆对窗口更宽=渲染压力大区域更明显;C9b/C9c 均在拆对之后,
  // 未触碰此窗口)。tests/c9d-light-pair-atomicity 锁定。
  rx = 0; ry = 0; rw = 0; rh = 0;
  r: Uint8Array = new Uint8Array(0);
  g: Uint8Array = new Uint8Array(0);
  b: Uint8Array = new Uint8Array(0);
  // ---- ★C9d 快照面(引擎内部扫描锚) ----
  // ensureRegion 每 tick 收敛于此,可领先公共采样对(领先量≤每 tick 移动量,被
  // AREA_PADDING=28 完整覆盖:玩家合法移速峰值——步行 3px/tick≈0.19 格、疾跑靴
  // ~6px/tick≈0.38、冲刺/盾冲峰值 ~16px/tick=1.0、矿车 41mph≈8px/tick=0.5、加速
  // 轨道 ~20px/tick=1.25、终末坠落 10px/tick=0.625——峰值 ≤2 格/tick,padding 28
  // ⇒ 容忍 ≥14 tick 的结果滞后;本修复把公共面滞后钉在 ≤1 tick,余量 ≥28×)。
  private snapRx = 0;
  private snapRy = 0;
  private snapRw = 0;
  private snapRh = 0;
  /** 本地路径发布暂存(写满后才整体换装进公共面;仅尺寸变化时重分配。worker 镜像
   *  侧数组每帧 transfer 走 → detached 后 length=0 → 每帧自动重分配,与旧
   *  runSnapshotOnEngine ⑤「每帧 new Uint8Array」分配面等价) */
  private pubR: Uint8Array = new Uint8Array(0);
  private pubG: Uint8Array = new Uint8Array(0);
  private pubB: Uint8Array = new Uint8Array(0);
  dirty = true;
  liquidDirty = false;
  heldLight: { tx: number; ty: number; r: number; g: number; b: number } | null = null;
  /** 玩家 buff 点光（光芒 11 / 狱火 116，Player.cs:9687-9690/:9896-9898 中心格
   *  【无条件】独立发射——与手持光源并存，引擎侧逐通道 max 合并
   *  （ApplyPerFrameLights :744 同原版 Vector3.Max，不叠加不优先） */
  buffLights: Array<{ tx: number; ty: number; r: number; g: number; b: number }> = [];
  /** 动态点光 API(原版 Lighting.AddLight;0-1 RGB)——每周期消费后清空 */
  addLight(x: number, y: number, r: number, g: number, b: number): void {
    this.perFrame.push({ x, y, r, g, b });
    this.dirty = true;
  }

  /** 本帧已注册的动态点光数（F5 调试报告只读 perFrame 长度） */
  get perFrameCount(): number { return this.perFrame.length; }

  // ---- 内部 ----
  private state: State = State.MinimapUpdate;
  private work = new LightMap();
  private active = new LightMap();
  private flicker = new FlickerClock();

  /** 全局闪烁时钟(mouseTextColor/cursorScale 等),资源条 HUD 等渲染层读取 */
  get clock(): FlickerClock { return this.flicker; }
  private scanner: TileLightScanner;
  private perFrame: PerFrameLight[] = [];
  private liqTick = 0;
  /** ★C9 光照 Worker 门面（?lightworker=1,缺省关=null）：快照发 worker、结果回填
   *  公共面;失联/异常 → 置 null 永久回落本地。镜像引擎在 worker 线程（LightWorker.ts） */
  private _lw: LightWorkerLink | null = null;
  /** ★C9：Game 每帧 updateLightDecay 实参捕获（noteDecayArgs）——lightTables 模块级
   *  衰减/shimmer 状态无外部 setter,worker 侧按同参重放 updateLightDecay 同步演化 */
  private _lwDecay: DecayArgs | null = null;

  constructor(world: LightingWorld) {
    this.world = world;
    this.scanner = new TileLightScanner(this.flicker);
    world.store.onTileChanged(() => { this.dirty = true; });
    world.store.onLiquidChanged(() => { this.liquidDirty = true; });
    // ★C9：惰性建链（Worker 首帧 compute 才真正 spawn）;旗关恒 null=本地路径零分叉
    if (lightWorkerFlag) {
      this._lw = new LightWorkerLink();
      // ★C9b 到达即应用（2026-09-24）：结果回填点提前到消息到达——120fps 渲染下
      //  原起「下个 compute 才应用」会因主线程繁忙滑到下下 tick（间歇 33ms 割裂,
      //  用户实报）。region+数组成对原子回填（与 applyPending 同逻辑,compute 内
      //  的 applyPending 保留为兜底 no-op）。★C9d：回填收口到 applyWorkerResult
      //  (公共面三原子写点之一);快照区域由 ensureRegion 收敛于快照面,公共面对
      //  不再被 ensureRegion 拆开（移动抖动定谳修复,见公共面头注）。
      this._lw.onResult = (m) => { this.applyWorkerResult(m); };
    }
  }

  /** ★C9d 公共采样对三原子写点①：worker 结果到达（区域+数组同锚整体替换——渲染与
   *  lightAt/lightAtTo 全消费面只会读到成对一致值;单值 1 tick 陈旧但恒稳定） */
  private applyWorkerResult(m: LightResultMsg): void {
    this.rx = m.rx; this.ry = m.ry; this.rw = m.rw; this.rh = m.rh;
    this.r = m.R; this.g = m.G; this.b = m.B;
  }

  /** ★C9d 快照面直设（worker 镜像引擎 runSnapshotOnEngine / 对拍测试装配专用;
   *  生产主线程唯一入口=ensureRegion）。不动公共采样对——发布由本地周期或
   *  结果到达负责。 */
  setSnapshotRegion(rx: number, ry: number, rw: number, rh: number): void {
    this.snapRx = rx; this.snapRy = ry; this.snapRw = rw; this.snapRh = rh;
  }

  /** ★C9：Game 在每帧 updateLightDecay(...) 后调用（同参捕获,worker 重放同步） */
  noteDecayArgs(waterStyle: number, nightVision: boolean, blackout: boolean, blind: boolean,
    opts: { headcovered?: boolean; inShimmer?: boolean; ftwDecay?: 'queen' | 'temple' | 'dungeon' }): void {
    this._lwDecay = { waterStyle, nightVision, blackout, blind, opts };
  }

  /** ★C9：实例弃用前拆除 Worker 链（Game.destroy 调用）——不拆则跨世界旧 worker
   *  持续自跑（泄漏 + 双份 CPU） */
  dispose(): void {
    if (this._lw !== null) { this._lw.dispose(); this._lw = null; }
  }

  /**
   * 区域 = 相机视口 ± AREA_PADDING(原版 GetAreaToLight 边界 1..2 + ProcessScan 膨胀 28 合并)。
   * camCX/camCY 为像素;viewW/viewH 为 tile 数(Game 现有调用约定)。
   * ★C9d：本方法只写【快照面】(snapRx/snapRy/snapRw/snapRh)+dirty 判定——公共采样
   * 对 (rx,ry,rw,rh,r,g,b) 不在此触碰(三原子写点,见公共面头注)。rw/rh 变更的数组
   * 重分配随之迁到发布面(公共数组尺寸随结果走)。
   */
  ensureRegion(camCX: number, camCY: number, viewW: number, viewH: number): void {
    const st = this.world.store;
    const x0 = Math.max(0, Math.floor(camCX / TILE) - Math.ceil(viewW / 2) - 1 - AREA_PADDING);
    const y0 = Math.max(0, Math.floor(camCY / TILE) - Math.ceil(viewH / 2) - 1 - AREA_PADDING);
    const x1 = Math.min(st.w - 1, Math.floor(camCX / TILE) + Math.ceil(viewW / 2) + 2 + AREA_PADDING);
    const y1 = Math.min(st.h - 1, Math.floor(camCY / TILE) + Math.ceil(viewH / 2) + 2 + AREA_PADDING);
    const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
    if (rw !== this.snapRw || rh !== this.snapRh || x0 !== this.snapRx || y0 !== this.snapRy) {
      // 原点只在重算时原子移动(防光影相对世界平移)
      this.snapRx = x0; this.snapRy = y0;
      if (rw !== this.snapRw || rh !== this.snapRh) {
        this.snapRw = rw; this.snapRh = rh;
      }
      this.dirty = true;
    }
  }

  /** 每帧调用。dayFactor 参数弃用(天空色改由 clock 内部推导;旧调用方签名兼容)。 */
  compute(_dayFactor: number): void {
    if (this.snapRw === 0) return;   // ★C9d:门挪到快照面(公共面可能尚无首个结果)
    // ---- ★C9 光照 Worker 分支（?lightworker=1）----
    // 快照（区域 ± padding tile 切片 + 时钟/天空/衰减/点光参数）发 worker,结果回填
    // 公共面。三态：warmup(结果未达)=快照+本地双跑兜底(首帧不黑屏) → live=worker
    // only(本地 scan/blur 整段跳过,主线程拿回 7-12%) → 失联看门狗 2s/异常回执=
    // dispose+_lw 置 null 永久回落本地(dirty 强制首帧全周期)。时钟仍在主线程 tick
    // (HUD/渲染层 cursorScale/mouseTextColor 消费面照常);快照捕获 pre-tick 状态,
    // worker 侧恢复后由其 compute 的 tick 推进到同态(位级同相)。
    // ★C9b(2026-09-24)：结果应用点=消息到达瞬间(onResult),compute 内 applyPending
    // 仅作兜底——渲染帧可即时读到最新回传,120fps 下不再滑档。
    const lw = this._lw;
    if (lw !== null) {
      if (!lw.healthy()) {
        lw.dispose();
        this._lw = null;
        this.dirty = true;   // 回落后首帧强制全周期
        // ★C9c-v3：粘性 live 的唯一出场=看门狗级硬故障（2s 无回传/异常回执/onerror）
        // ——诊断面出场原因标记（F5 兼容新增字段;lag 驱动出场已删不产 'lag' 值）
        this.lwLive = false; this.lwGood = 0; this.lwBad = 0;
        lightGateDiag.live = false;
        lightGateDiag.exitReason = 'watchdog';
      } else {
        // ★C9c：live 由滞回健康门判定（warmup 期本地新鲜光优先,onResult 被
        //  liveAuth 抑制;转 live 后到达即应用接管,compute 内 applyPending 降兜底）
        const live = this.lwGate(lw);
        // ★C9d：快照区域取本帧 ensureRegion 现值（快照面恒最新）。公共采样对=上一
        // 帧成对结果（结果未达时不回拨/不直改,渲染读 (区域,数组) 恒成对一致,值恒
        // =1 tick 前计算——AREA_PADDING=28 完整覆盖尾随量,见快照面头注）。
        const reg = { rx: this.snapRx, ry: this.snapRy, rw: this.snapRw, rh: this.snapRh };
        lw.applyPending(this);
        lw.send(this.buildWorkerSnapshot(reg));
        if (live && this.snapCoveredByPublic()) {
          this.flicker.tick();        // HUD/渲染层闪烁消费面照常推进
          this.perFrame.length = 0;   // 点光已随快照带走(本地 processScan 不再跑)
          return;
        }
        // live 态大跳（传送/召回/重生/读档/离屏截图分块——快照区域跳出公共采样域
        // 覆盖）→ 落本地全周期同帧兜底:vanilla 双 LightTiles 同帧出光对齐,消除
        // 「结果下一 tick 才到=公共域外黑窗」。罕见路径一次性 ~7-12% 帧成本,非
        // C9c-v3 的 lag 驱动逐 tick 双跑（粘性门语义不受影响）。
        // warmup：快照已发,本地照算兜底——tick 交给下方本地路径(勿双推进)
      }
    }
    this.flicker.tick();

    if (this.dirty) {
      this.runFullCycle();
      return;
    }
    if (this.liquidDirty) {
      this.liqTick++;
      if (this.liqTick % 3 !== 0) return; // 20Hz 节流
      this.runFullCycle();
      return;
    }
    // 空闲:每 tick 一态(完整周期 4 tick,原版 4 帧节奏)
    this.step();
  }

  /** ★C9c 自适应 live 门状态（滞回;见 liveGateStep） */
  private lwLive = false;
  private lwGood = 0;
  private lwBad = 0;

  /** ★C9c-v2 lag 滑动窗（最近 24 拍样本;尚无结果(≤0)不入窗——p50 抗单拍毛刺,
   *  忙机双跑锁死翻案面:v1 逐拍绝对阈被调度延迟钉死,v2 相对判据看的是分布） */
  private lwLagRing: number[] = [];
  /** ★C9c-v3 粘性 live 门（lag 滑动 p50 只作【进场资格】——连续 8 拍 ≤进阈+已有结果
   *  才转 live;入场后 lag 驱动出场已删（弱机横跳定谳,见文件头注/liveGateStep 注）,
   *  唯一出场=compute() 看门狗级硬故障（diag.exitReason='watchdog'）。不限帧率饱和/
   *  进场 dirty 风暴期滞留 warmup（本地 0 延迟新鲜光优先,代价 7-12% CPU）,消息健康
   *  后转 live 省 CPU;忙机（lag p50 ≤1.5 tick）不再被罚永久双跑（v1 翻案 retained）。 */
  private lwGate(lw: LightWorkerLink): boolean {
    if (lw.lastLagMs > 0) {
      this.lwLagRing.push(lw.lastLagMs);
      if (this.lwLagRing.length > 24) this.lwLagRing.shift();
    }
    let p50 = 0;
    if (this.lwLagRing.length) {
      const sorted = [...this.lwLagRing].sort((a, b) => a - b);
      p50 = sorted[sorted.length >> 1];
    }
    const r = liveGateStep(this.lwLive, this.lwGood, this.lwBad, p50, lw.isLive());
    this.lwLive = r.live; this.lwGood = r.good; this.lwBad = r.bad;
    lw.liveAuth = this.lwLive;       // 到达即应用仅 live 态放行（C9c 倒灌修复）
    lightGateDiag.live = this.lwLive; lightGateDiag.good = r.good; lightGateDiag.bad = r.bad;
    lightGateDiag.p50Ms = p50; lightGateDiag.lastLagMs = lw.lastLagMs;
    lightGateDiag.ring = this.lwLagRing.length;
    return this.lwLive;
  }

  /** ★C9：组装每帧快照（区域捕获值 + 点光/时钟/天空/衰减;tile 切片由门面暂存切出）。
   *  读表面清单见 LightWorkerProtocol 头注——快照协议的契约边界。 */
  private buildWorkerSnapshot(reg: { rx: number; ry: number; rw: number; rh: number }): Omit<LightSnapshotMsg, 'op' | 'seq'> {
    const lw = this._lw!;
    const tiles = lw.buildSlice(this.world.store, reg.rx, reg.ry, reg.rw, reg.rh);
    return buildEngineSnapshot({
      rx: reg.rx, ry: reg.ry, rw: reg.rw, rh: reg.rh,
      world: this.world,
      flicker: this.flicker,
      heldLight: this.heldLight,
      buffLights: this.buffLights,
      perFrame: this.perFrame,
      decay: this._lwDecay,
    }, tiles, 0);
  }

  /** ★C9d：快照【视口】是否被公共采样对完整覆盖（live 态早退门——覆盖=尾随 ≤1 tick
   *  的光照照常可用;不覆盖=传送级跳变,视口落在公共域外/边缘带,走本地同帧兜底）。
   *  判据对象是视口（区域去 padding 带:ensureRegion 数学 x0=P+1/x1=P+2 内缩,此处各
   *  再收 1 格保守）而非整块区域——正常移动时区域原点每 tick 平移,padding 带必然
   *  露出,但视口被上帧区域覆盖余量=28−每 tick 移速 ≥26 格,永不触发;结果滞后 N
   *  tick 时余量=28−N×移速,≥14 tick 滞后内仍覆盖（峰值移速算术见快照面头注）。 */
  private snapCoveredByPublic(): boolean {
    const vx0 = this.snapRx + AREA_PADDING + 2, vy0 = this.snapRy + AREA_PADDING + 2;
    const vx1 = this.snapRx + this.snapRw - AREA_PADDING - 2;
    const vy1 = this.snapRy + this.snapRh - AREA_PADDING - 2;
    return vx0 >= this.rx && vy0 >= this.ry
      && vx1 < this.rx + this.rw && vy1 < this.ry + this.rh;
  }

  /** 快进:同 tick 完成 Scan→Blur→Present(状态回 0) */
  private runFullCycle(): void {
    this.dirty = false;
    this.liquidDirty = false;
    this.liqTick = 0;
    this.processScan();
    this.processBlurAndPresent();
    this.state = State.MinimapUpdate;
  }

  private step(): void {
    switch (this.state) {
      case State.MinimapUpdate: // 空槽(小地图导出未移植;保留维持 4 tick 周期)
      case State.ExportMetrics: // 空槽(SceneMetrics 在 VanillaSpawner 独立实现)
        break;
      case State.Scan:
        this.processScan();
        break;
      case State.Blur:
        this.processBlurAndPresent();
        break;
    }
    this.state = (this.state + 1) % 4;
  }

  private processScan(): void {
    const w = this.world as ScannerWorld;
    // ★C9d:扫描锚=快照面（旧 this.rx/ry/this.rw/rh——live 态下公共面不再被
    //  ensureRegion 先行平移,warmup 期 applyPending 也不再回拨扫描原点）
    this.work.setSize(this.snapRw, this.snapRh);
    this.work.nonVisiblePadding = Math.min(NON_VISIBLE_PADDING, (Math.min(this.snapRw, this.snapRh) - 1) >> 1);
    // 手持光源:RGB 来自 TorchID.TorchColor(原版 ItemCheck_EmitHeldItemLight 按火把种类取色)
    const perFrame = this.perFrame;
    if (this.heldLight) perFrame.push({ x: this.heldLight.tx, y: this.heldLight.ty, r: this.heldLight.r, g: this.heldLight.g, b: this.heldLight.b });
    for (const L of this.buffLights) perFrame.push({ x: L.tx, y: L.ty, r: L.r, g: L.g, b: L.b });
    this.scanner.exportTo(w, this.work, this.snapRx, this.snapRy, perFrame);
    perFrame.length = 0;
  }

  private processBlurAndPresent(): void {
    this.work.blur();
    // Present(LightingEngine.cs:131-135):交换双缓冲 + 导出 ×1.2 到公共面
    const tmp = this.active;
    this.active = this.work;
    this.work = tmp;
    // ★C9d 本地路径原子发布（三写点③）:导出进发布暂存（尺寸=快照面）,写满后
    // 区域+数组整体换装——与 worker 结果同纪律,本地/worker 两路同原子语义。
    // 暂存复用仅尺寸变化重分配;worker 镜像侧每帧 transfer detached → length=0
    // → 每帧新分配（与旧 runSnapshotOnEngine ⑤ 分配面等价）。
    const need = this.snapRw * this.snapRh;
    if (this.pubR.length !== need) {
      this.pubR = new Uint8Array(need);
      this.pubG = new Uint8Array(need);
      this.pubB = new Uint8Array(need);
    }
    const outR = this.pubR, outG = this.pubG, outB = this.pubB;
    const ar = this.active.r, ag = this.active.g, ab = this.active.b;
    const scale = globalBrightness * 255;
    for (let i = 0; i < need; i++) {
      // 原版 ExportTo(LT57:231-233)是 `(int)(color*num)` 截断,非四舍五入。
      // 2026-09-19:`>=255 ? 255 : |0` 与旧 `Math.min(255, Math.trunc(v))` 全域等值
      // (v≥0 截断=|0;NaN:|0=0=ToUint8(NaN);Inf→255;-0.5:|0=0=ToUint8(-0);
      //  负值两侧同为 ToUint8(trunc(v))——光照图无负值,纯防御),省 3 对内建调用
      const vr = ar[i] * scale, vg = ag[i] * scale, vb = ab[i] * scale;
      outR[i] = vr >= 255 ? 255 : vr | 0;
      outG[i] = vg >= 255 ? 255 : vg | 0;
      outB[i] = vb >= 255 ? 255 : vb | 0;
    }
    // 发布（★C9d 三写点③）:区域与数组同锚整体换装,渲染侧永不观察中间态
    this.rx = this.snapRx; this.ry = this.snapRy;
    this.rw = this.snapRw; this.rh = this.snapRh;
    this.r = this.pubR; this.g = this.pubG; this.b = this.pubB;
  }

  /** 取某 tile 光照(区域外返回 0;原版 GetColor 区域外语义) */
  lightAt(tx: number, ty: number, _dayFactor = 0): [number, number, number] {
    if (tx < this.rx || ty < this.ry || tx >= this.rx + this.rw || ty >= this.ry + this.rh) return [0, 0, 0];
    const i = (ty - this.ry) * this.rw + (tx - this.rx);
    return [this.r[i], this.g[i], this.b[i]];
  }

  /** ★C6 雨雪（2026-09-23）：lightAt 的零分配变体——结果写进调用方缓冲
   *  out[0..2],返回 out。逐位同值（同界外 0 语义/同索引式/同 0-255 域）；
   *  消费面=drawRain 逐滴采样（750 滴/帧 × 每次新建数组 = 雨天 ~90MB/s 级
   *  GC 流量,用户实机 trace 侧证 GC 面来自渲染热路径分配）。out.length<3
   *  时调用方契约违例（不兜底,尽早暴露）。 */
  lightAtTo(tx: number, ty: number, out: number[]): number[] {
    if (tx < this.rx || ty < this.ry || tx >= this.rx + this.rw || ty >= this.ry + this.rh) {
      out[0] = 0; out[1] = 0; out[2] = 0;
      return out;
    }
    const i = (ty - this.ry) * this.rw + (tx - this.rx);
    out[0] = this.r[i]; out[1] = this.g[i]; out[2] = this.b[i];
    return out;
  }
}

// ---- Utils.PlotLine / PlotTileLine 一比一(Utils.cs:2359-2415/:2460-2487;2026-09-03
//      荧光体 5107 手持光接线引入,玩家侧消费见 Player.emitMagiluminescenceLight) ----

/** Utils.PlotLine(Utils.cs:2359-2415):Bresenham 整数步进——陡线(x/y 斜率)先 Swap,
 *  终点格【不落】(`i != x1` 前闭后开);jump=false 时斜步双落点(中途格也 plot)。
 *  plot 返回 false 即中断并整线返回 false(调用方以此做界外/实体截断) */
export function plotLine(x0: number, y0: number, x1: number, y1: number,
  plot: (x: number, y: number) => boolean, jump = true): boolean {
  if (x0 === x1 && y0 === y1) return plot(x0, y0);
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (steep) { [x0, y0, x1, y1] = [y0, x0, y1, x1]; }
  const num = Math.abs(x1 - x0);
  const num2 = Math.abs(y1 - y0);
  let num3 = Math.trunc(num / 2);
  let num4 = y0;
  const num5 = x0 < x1 ? 1 : -1;
  const num6 = y0 < y1 ? 1 : -1;
  for (let i = x0; i !== x1; i += num5) {
    if (!plot(steep ? num4 : i, steep ? i : num4)) return false;
    num3 -= num2;
    if (num3 >= 0) continue;
    num4 += num6;
    if (!jump && !plot(steep ? num4 : i, steep ? i : num4)) return false;
    num3 += num;
  }
  return true;
}

/** Utils.PlotTileLine(Utils.cs:2460-2487):宽 width(世界像素)的"粗线"——沿线方向
 *  单位向量取垂直向量 ×(width/2) 得 ± 平行偏移(只在起点算一次,全段共用),对中线
 *  Bresenham 逐点再画 minOffset→maxOffset 的垂直短线(jump=false)。start/end 为
 *  世界像素坐标,格坐标换算 = Math.trunc(px/16)(Vector2.ToTileCoordinates 截断语义)。
 *  ★零长线退化保真:start==end(velocity==0 臂)时原版 normalize=0/0=NaN →
 *  (int)NaN = 0x80000000 不定值偏移 → 内层垂直短线落界外 → CastLightOpen 界外
 *  返回 false 整臂无光(荧光体站定帧只剩 Left→Right 横贯臂布光,原版即此行为) */
export function plotTileLine(sx: number, sy: number, ex: number, ey: number,
  width: number, plot: (x: number, y: number) => boolean): boolean {
  const half = width / 2;
  const dx = ex - sx, dy = ey - sy;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;       // len==0 → 0/0=NaN(与 C# float 除零同语义)
  const px = -uy * half, py = ux * half;    // ±val3(NaN 传播)
  const toTile = (v: number): number => (Number.isNaN(v) ? -2147483648 : Math.trunc(v / 16));
  const mx = toTile(sx - px), my = toTile(sy - py);   // start−val3
  const nx = toTile(sx + px), ny = toTile(sy + py);   // start+val3
  const x0 = toTile(sx), y0 = toTile(sy);
  const x1 = toTile(ex), y1 = toTile(ey);
  const offMinX = mx - x0, offMinY = my - y0;
  const offMaxX = nx - x0, offMaxY = ny - y0;
  return plotLine(x0, y0, x1, y1, (x, y) =>
    plotLine(x + offMinX, y + offMinY, x + offMaxX, y + offMaxY, plot, false));
}
