// ★juddersmooth（2026-10-10,?smooth=1 缺省关）——迟到帧半步混合（judder smoothing,
//  「视觉欺骗」刀;用户本日实报定谳:「系统负载高时 110-120+ 浮动,高帧率也觉得卡;
//  降到 60 仍 58-60 波动」）。
//
// 机理（定谳）:系统负载把回调交付推迟过 vsync 快照点（快照在网格点拍,迟到 1ms 即
//  错过本槽）→ 该槽重复上屏旧帧,内容一步跳两格（运动步长序列 0,2）=高帧率下依然
//  可感的卡顿本体;系统延迟尖刺（10-20ms 级）大于任何档位的槽位余量 → 降帧率无效
//  （60 锁的 8.3ms 余量照样被击穿=58-60 波动机理）。修=视觉欺骗:检测「本帧将跳槽」
//  （距上次上屏 > 档周期×JUDDER_MISS_RATIO）时,把上一真帧以 α=JUDDER_BLEND_ALPHA 叠
//  上当前帧——运动步长 0,2 → ≈0.5,1.5,眼睛读到近匀速;仅跳槽帧混合（瞬态）,常态
//  逐位直出。与 ghostblur 的区别:ghostblur=每帧恒定累积拖影（用户实测无体感收益）;
//  本刀=仅跳槽瞬间单帧半影,瞬态平滑非累积模糊。
//
// 成本:每帧 1 次全屏拷贝（留真帧,跳槽不可预测必须常备）+跳槽帧 1 次全屏 α 绘。
// v1 整帧混合（挂 Game tick 的 ghostFrameEnd 同族收口点=render() 完整返回后,全路径
// 唯一必经——GL/2D 回退/早退支全覆盖）:HUD 静态像素混合同值不重影,动画 HUD 位
// 瞬态半影（登记;若体感有碍,v2 收窄混合域）。双画布乒乓（prevRaw=上一真帧/capture=
// 本帧捕获槽）,混合发生在捕获【之后】→ prevRaw 恒为真帧,连续跳槽无拖影累积
// （0.25^k 污染面消除）。
// 断流卫生:gap>JUDDER_BREAK_MS（tab 切换/暂停恢复）或 > 周期×8（长停顿）=不连续,
// 不混合只重捕获（长停顿后首帧混合=整屏鬼影,禁）。periodMs<=0（跟满档/未锚定）=
// 完全旁路。canvas 尺寸 0=terra-blink 截断家族判例,禁操作。
import { mkCanvas, type AnyCanvas, type Ctx2D } from './canvasEnv';

/** 跳槽判定系数:gap > 档周期×此值=本帧将跳槽（上次上屏后已过 1.5 个槽位）。
 *  1.5 定线:120 档正常抖动 gap≤~10ms(12.5 线下不触发);单次跳槽 gap≈16.7>12.5 ✓;
 *  60 档跳槽 33.3>25 ✓/正常 16.7<25 ✓。 */
export const JUDDER_MISS_RATIO = 1.5;
/** 断流阈值:gap 超此值=不连续（tab 隐藏/暂停恢复）,不混合只重捕获。 */
export const JUDDER_BREAK_MS = 250;
/** 半步混合系数（上一真帧叠加 α;0.5=步长 0,2 → 0.5,1.5 对称半步）。 */
export const JUDDER_BLEND_ALPHA = 0.5;
/** 长停顿上限:gap 超过周期×此值同断流处理（防暂停恢复首帧整屏鬼影）。 */
export const JUDDER_MAX_GAP_RATIO = 8;

/** 纯判定（node 可测）:本帧是否「跳槽混合」帧。period<=0=旁路;gap<0=首帧/异常=否;
 *  断流（>JUDDER_BREAK_MS）与长停顿（>周期×JUDDER_MAX_GAP_RATIO）=否。 */
export function judderMissFrame(gapMs: number, periodMs: number): boolean {
  if (!(periodMs > 0) || !(gapMs >= 0)) return false;
  if (gapMs > JUDDER_BREAK_MS) return false;
  return gapMs > periodMs * JUDDER_MISS_RATIO && gapMs <= periodMs * JUDDER_MAX_GAP_RATIO;
}

/** ?smooth=1 灰度旗（缺省关=完全旁路零改动,fail-closed 家族;node/测试环境恒关,
 *  测试经 judderSmoothSetForTest 显式开启）。转正审查后按用户惯例翻缺省。 */
export let judderSmooth = (() => {
  try {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('smooth') === '1';
  } catch { return false; }
})();
/** 测试/对拍翻面（生产代码禁调——生产只读 URLSearchParams 一次） */
export function judderSmoothSetForTest(v: boolean): void { judderSmooth = v; }

/** 帧尾时钟（测试注入;生产=performance.now）。 */
let nowFn: () => number = () => performance.now();
/** 测试时钟注入（生产禁调）。 */
export function judderClockForTest(fn: () => number): void { nowFn = fn; }

/** 画布工厂（测试注入桩;生产=canvasEnv.mkCanvas）。 */
let canvasFactory: (w: number, h: number) => AnyCanvas | null = mkCanvas;
/** 测试画布工厂注入（生产禁调）。 */
export function judderCanvasFactoryForTest(fn: (w: number, h: number) => AnyCanvas | null): void {
  canvasFactory = fn;
}

/** 模块级单例（可见画布单例;尺寸变化整组重建+prev 复位）。 */
let prevCanvas: AnyCanvas | null = null;
let captureCanvas: AnyCanvas | null = null;
let lastMs = -1;

/** 测试/对拍状态复位（生产禁调）。 */
export function judderResetForTest(): void {
  prevCanvas = null; captureCanvas = null; lastMs = -1;
}

/** 帧尾收口（Renderer.judderFrameEnd 转发;Game tick 在 render() 完整返回后调用——
 *  与 ghostFrameEnd 同族挂接点论证）。periodMs=现役档周期（FrameBeat.tierPeriodNow;
 *  0=跟满/未锚定=旁路）。nowMs 参数仅供测试注入时钟。 */
export function judderFrameEnd(ctx: Ctx2D | null, periodMs: number, nowMs?: number): void {
  if (!judderSmooth || !ctx) return;
  if (!(periodMs > 0)) return;                              // 跟满/未锚定:旁路（状态保留）
  const now = nowMs ?? nowFn();
  const gap = lastMs >= 0 ? now - lastMs : -1;
  lastMs = now;
  const cv = ctx.canvas;
  const w = cv.width, h = cv.height;
  if (w === 0 || h === 0) return;                           // terra-blink 截断家族:禁操作
  // 画布组管理:尺寸变化（窗口 resize）=捕獲槽重建+prev 复位（旧 prev 尺寸失配=无效）;
  // capture==null 的补充分配（乒乓初态/refill）保留 prev——★首版此处无条件 null prev
  // =乒乓自毁（swap 把 null 传回 capture→每帧重建→prev 恒 null→混合永不触发,本文件
  // 机械闸抓到）。resize 后经一帧 refill 换掉残留旧尺寸槽,第二帧起稳定。
  if (!captureCanvas || captureCanvas.width !== w || captureCanvas.height !== h) {
    const sizeChanged = captureCanvas !== null;
    captureCanvas = canvasFactory(w, h);
    if (!captureCanvas) { prevCanvas = null; return; }      // 无画布环境（node）:旁路
    if (sizeChanged) prevCanvas = null;                     // 尺寸变化:旧 prev 失效
  }
  const capCtx = captureCanvas.getContext('2d') as Ctx2D | null;
  if (!capCtx) return;
  const miss = prevCanvas !== null && judderMissFrame(gap, periodMs);
  // ① 捕获本帧真值（混合【前】→ prevRaw 恒真帧,连续跳槽零拖影累积）
  capCtx.clearRect(0, 0, w, h);
  capCtx.drawImage(cv as CanvasImageSource, 0, 0);
  // ② 跳槽混合:上一真帧半步叠上（globalAlpha 恢复由 try/finally 保证）
  if (miss && prevCanvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);                     // 页绝对坐标（c10e 合成同族习语）
    ctx.globalAlpha = JUDDER_BLEND_ALPHA;
    ctx.drawImage(prevCanvas as CanvasImageSource, 0, 0);
    ctx.restore();
  }
  // ③ 乒乓交换:本帧捕获槽晋升为 prevRaw,旧 prevRaw 槽降为下帧捕获槽
  const tmp = prevCanvas;
  prevCanvas = captureCanvas;
  captureCanvas = tmp;
}
