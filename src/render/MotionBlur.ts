// ★motionblur（2026-10-14,用户立项 B 路线:「快速移动微拖影感」定谳后的视觉
//  转化刀;?mblur=1 灰度,缺省关 fail-open）。
//
// 【机理定谳】无渲染插值（原版 60Hz 锁步同款语义,Game.frame accumulator 无
//  分数插值）——120fps 呈现下内容有效 60Hz 步进（每位置停留两渲染帧）,快速
//  移动时人眼按呈现率外推、物体每 16.7ms 才动一次=「更新延迟/前帧未消」感
//  （用户实报 2026-10-14;60 档残余=mini-LED 像素响应+60Hz 步进固有跳变）。
//  治本=渲染插值=全实体路径大手术且偏离原版语义——不动。本刀=视觉转化:
//  速度门控的世界域运动模糊,快速移动时 prev 世界帧以 α 叠上当前帧,把离散
//  步进的迟滞感转化为速度感（竞速/高速平台游戏同款手法）,顺带同化显示器
//  像素响应的被动拖影（物理拖影本就是运动方向的衰减像,主动模糊盖过=不再
//  可分辨）。
//
// 【捕获面=7x 段头主画布】（Renderer.render 垫底后、首个加算面前）:此刻主画布
//  =完整世界画面（c10e 纯帧=垫底已把 sky+glCanvas 垫入;非 c10e 单画布路径天然
//  含世界）而 HUD/覆盖层未画=【天然 HUD 排除】（文字/准星恒清晰）。夹层内容
//  （气球等 2D 回退面,垫底 destination-over 已垫入世界域）随捕获进 prev=随
//  相机运动模糊 ✓ 语义正确。
//
// 【先捕获后叠加=固定两帧重影,不累积】cap ← cur（干净帧）→ main ⊕= prev(α) →
//  prev ↔ cap。显示帧=干净 cur+干净 prev 衰减叠加;GhostBlur（2026-10-07 恒定
//  累积形态）的「无体感收益」定谳由此解释:累积链越跑越浓+静止白糊——本刀
//  固定重影可控+速度门控静止零成本。
//
// 【懒武装】（judder v2 同构）:相机速度超 V_MIN 即武装（恒捕获+按 α 叠加）,
//  末次超阈后 ARM_HOLD_MS 静默退役（prev 清位——静止期零 op;再起速首帧无
//  prev 不模糊=1 帧延迟,可接受）。武装窗内速度回落=只捕获不叠加（保 prev 新鲜）。
//
// 【卫生】暂停（画面静止,旁路保状态）/死亡（灰化帧敏感面,旁路+重置）/传送
//  幕帘帧/速度爆表（>V_HARD=传送类大跳变,只重捕获防整屏鬼影——judder 断流
//  同族）/resize（画布尺寸变=槽组重建）/canvas 0 尺寸（terra-blink 家族禁操作）。
//
// 旋钮:?mblurv=（满速阈 px/s,clamp 100..50000）/ ?mblura=（α 上限,clamp 0.05..0.6）。
// ★速度缺省标定待用户验收调（泰拉速度域:慢走≈3mph≈1050px/s,赫尔墨斯疾跑
//   34mph≈12000px/s;vMin 取 1500=慢走微模糊起步,vMax 12000=疾跑满强度,
//   V_HARD 40000=传送/极速域）。像素闸=机械测试(判定表/op 序列/卫生)+活机探针
//  （静止/疾跑/传送三态 op 计数）;本刀为视觉增强非 1:1 复刻,无逐位对拍面。
import { mkCanvas, type AnyCanvas, type Ctx2D } from './canvasEnv';

/** 速度门控起点（px/s）:低于此=零模糊零 op。
 *  ★标定勘误（2026-10-14 用户实报「?mblur=1 没感觉」定谳）:首版 1500/12000 系
 *  mph 换算错误（误用 1mph≈353px/s;原版积分 position+=velocity（单位 px/tick,
 *  反编译权威）——裸走 maxRunSpeed=3=180px/s,靴族 accRunSpeed=6/6.75=360-405px/s,
 *  翼飞水平同域）→普通游玩永远不武装=不可感知。重标:250=裸走不糊/靴族起糊,
 *  550=翼飞·矿车域满强度,2500=钩爪/极速爆表。 */
export let MBLUR_V_MIN = 250;
/** 满强度速度阈（px/s）:V_MIN→V_MAX 线性升 α,≥V_MAX 恒 α 上限。 */
export let MBLUR_V_MAX = 550;
/** α 上限（首档叠加强度;双档总强度=×1.5）。二次调 0.4→0.3（用户一报过浓）。 */
export let MBLUR_A_MAX = 0.3;
/** 速度爆表阈（px/s,钩爪/极速类）:旁路叠加+重捕获（防整屏鬼影;真传送走
 *  tpVeil 渲染门=本门不可达,魔镜外极速防御支）。 */
export const MBLUR_V_HARD = 2500;
/** 武装保持窗（ms）:末次超阈后静默此值退役（静止期零 op）。 */
export let MBLUR_ARM_HOLD_MS = 2000;
/** 测试/对拍旋钮注入（生产禁调——生产只读 URLSearchParams 一次）。 */
export function mblurTuneForTest(vMin: number, vMax: number, aMax: number, hold: number): void {
  MBLUR_V_MIN = vMin; MBLUR_V_MAX = vMax; MBLUR_A_MAX = aMax; MBLUR_ARM_HOLD_MS = hold;
}

/** ★mblur 旗（?mblur=1 灰度,缺省关）。node/测试环境恒关（经 mblurSetForTest 控制）。 */
export let motionBlur = (() => {
  try {
    if (typeof location === 'undefined') return false;
    const q = new URLSearchParams(location.search);
    if (q.get('mblur') !== '1') return false;
    const v = Number(q.get('mblurv')), a = Number(q.get('mblura'));
    if (Number.isFinite(v) && v >= 100 && v <= 50000) MBLUR_V_MAX = v;
    if (Number.isFinite(a) && a >= 0.05 && a <= 0.6) MBLUR_A_MAX = a;
    return true;
  } catch { return false; }
})();
/** 测试/对拍翻面（生产禁调）。 */
export function mblurSetForTest(v: boolean): void { motionBlur = v; }

/** 纯判定（node 可测）:速度→叠加 α。0=零模糊;V_HARD 以上由调用侧旁路（恒 0
 *  返回——爆表帧不叠加,但调用侧须重置 prev）。 */
export function mblurAlpha(speedPxS: number): number {
  if (!(speedPxS > MBLUR_V_MIN)) return 0;
  if (speedPxS >= MBLUR_V_MAX) return MBLUR_A_MAX;
  return MBLUR_A_MAX * (speedPxS - MBLUR_V_MIN) / (MBLUR_V_MAX - MBLUR_V_MIN);
}

/** 画布工厂（测试注入桩;生产=canvasEnv.mkCanvas）。 */
let canvasFactory: (w: number, h: number) => AnyCanvas | null = mkCanvas;
/** 测试画布工厂注入（生产禁调）。 */
export function mblurCanvasFactoryForTest(fn: (w: number, h: number) => AnyCanvas | null): void {
  canvasFactory = fn;
}

/** 乒乓槽组（可见画布双槽;尺寸变化整组重建+prev 复位）。 */
let prevCanvas: AnyCanvas | null = null;
let captureCanvas: AnyCanvas | null = null;
/** 上帧相机位（速度分母）;-1=未锚定。 */
let lastCamX = -1, lastCamY = -1;
/** 上帧时间戳（速度计算）。 */
let lastMs = -1;
/** ★速度 EMA 平滑（2026-10-14 用户实报「拖影本身会抖动」定谳）:相机移动=60Hz
 *  逻辑步进,120fps 渲染下位移序列 0,2,0,2——瞬时 speed 采样窗=1 渲染帧=锯齿波,
 *  直接驱动 α/档位偏移=模糊强度与半径逐帧振荡（拖影抖动本体）。修=指数平滑
 *  （τ=80ms,dt 归一=帧率无关）,armed 门/α/档位偏移全链消费平滑值。 */
let smoothSpeed = 0;
/** 武装态（judder v2 同构:速度超阈即武装,静默 ARM_HOLD_MS 退役）。 */
let armed = false;
let lastFastMs = -Infinity;

/** 计数器（探针面:frames/armedFrames/blends/armCount/teleportSkips）。 */
const stats = { frames: 0, armedFrames: 0, blends: 0, armCount: 0, teleportSkips: 0 };
export function mblurStats(): { frames: number; armedFrames: number; blends: number; armCount: number; teleportSkips: number; armed: boolean } {
  return { ...stats, armed };
}

/** 测试/对拍状态复位（生产禁调）。 */
export function mblurResetForTest(): void {
  prevCanvas = null; captureCanvas = null; lastCamX = -1; lastCamY = -1; lastMs = -1;
  smoothSpeed = 0;
  armed = false; lastFastMs = -Infinity;
  stats.frames = 0; stats.armedFrames = 0; stats.blends = 0; stats.armCount = 0; stats.teleportSkips = 0;
}

/** 7x 段头收口（Renderer.render 垫底后调用——挂接点论证见头注【捕获面】）。
 *  camX/camY=相机世界位（速度源:跟随相机含平滑,玩家运动的忠实代理）;zoom=
 *  相机缩放（方向位移档的屏幕换算）;nowMs 仅供测试注入;paused/dead=旁路
 *  （dead 附加 prev 重置——灰化帧敏感面且复活跳变防鬼影）。 */
export function motionBlurStep(
  ctx: Ctx2D | null, camX: number, camY: number, nowMs?: number, paused = false, dead = false,
  zoom = 1,
): void {
  if (!motionBlur || !ctx) return;
  const now = nowMs ?? performance.now();
  const dtMs = lastMs >= 0 ? now - lastMs : -1;
  const camDX = lastCamX >= 0 ? camX - lastCamX : -1;
  const camDY = lastCamY >= 0 ? camY - lastCamY : 0;
  lastMs = now; lastCamX = camX; lastCamY = camY;
  stats.frames++;
  if (!(dtMs > 0)) return;                     // 首帧/时钟异常:只锚定
  if (paused) return;                          // 暂停:旁路（状态保留,judder 同族）
  if (dead) { prevCanvas = null; return; }     // 死亡:旁路+prev 重置（灰化帧敏感面;
                                               //  respawn 跳变另由 teleport 爆表门盖）
  const speed = Math.hypot(camDX, camDY) / dtMs * 1000;
  // ★EMA（τ=80ms,dt 归一）:瞬时值只喂平滑器与爆表门（传送检测须即时,平滑会拖尾）
  const emaK = 1 - Math.exp(-dtMs / 80);
  smoothSpeed += (speed - smoothSpeed) * emaK;
  const fast = smoothSpeed > MBLUR_V_MIN;
  const teleport = speed > MBLUR_V_HARD;
  if (teleport) {                              // 传送爆表:重置 prev 防整屏鬼影
    prevCanvas = null;
    stats.teleportSkips++;
  }
  // 懒武装:超阈武装,静默退役（退役清 prev=静止期零成本+陈旧帧不跨窗混合）
  if (fast) lastFastMs = now;
  if (!armed) {
    if (!fast) return;                         // 静默期:零 op 旁路
    armed = true; stats.armCount++;
    prevCanvas = null;                         // 跨静默期的陈旧帧作废
  } else if (now - lastFastMs > MBLUR_ARM_HOLD_MS) {
    armed = false;                             // 静默退役
    prevCanvas = null;
    return;
  }
  stats.armedFrames++;
  const cv = ctx.canvas;
  const w = cv.width, h = cv.height;
  if (w === 0 || h === 0) return;              // terra-blink 截断家族:禁操作
  // 槽组管理:尺寸变化=重建+prev 复位（judder resize 同族;refill 保 prev）
  if (!captureCanvas || captureCanvas.width !== w || captureCanvas.height !== h) {
    const sizeChanged = captureCanvas !== null;
    captureCanvas = canvasFactory(w, h);
    if (!captureCanvas) { prevCanvas = null; return; }   // 无画布环境（node）:旁路
    if (sizeChanged) prevCanvas = null;
  }
  const capCtx = captureCanvas.getContext('2d') as Ctx2D | null;
  if (!capCtx) return;
  // ① 先捕获干净 cur（copy 单 op——judder v3' 判例:整幅替换含 α,语义≡clear+SO）
  capCtx.globalCompositeOperation = 'copy';
  capCtx.drawImage(cv as CanvasImageSource, 0, 0);
  capCtx.globalCompositeOperation = 'source-over';
  // ② 叠加 prev（速度门控 α;武装窗内回落=只捕获不叠加）
  //  ★方向位移双档（2026-10-14 二次调:用户一报「拖影离谱+拖影抖动」——首版三档
  //  总强度 α×1.96≈0.78 过浓+半径 3 逻辑步分身感重;收敛=双档 k=1,2 衰减 1/0.5
  //  （总 α×1.5=0.45 上限）,半径 2 逻辑步。α/半径全消费【EMA 平滑速度】（锯齿
  //  抖动根修,见 smoothSpeed 注）;档偏移=逻辑步长（smoothSpeed/60×zoom,与渲染率
  //  无关）×方向单位;prev 历史位偏移方向=+dir（prev 帧中物体屏幕位落后运动方向）。
  const prev = prevCanvas;
  const a = mblurAlpha(smoothSpeed);
  if (prev && a > 0) {
    const len = Math.max(1e-9, Math.hypot(camDX, camDY));
    const stepX = camDX / len * (smoothSpeed / 60) * zoom;
    const stepY = camDY / len * (smoothSpeed / 60) * zoom;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);        // 页绝对坐标（c10e 合成同族习语）
    ctx.globalAlpha = a;
    ctx.drawImage(prev as CanvasImageSource, stepX, stepY);
    ctx.globalAlpha = a * 0.5;
    ctx.drawImage(prev as CanvasImageSource, stepX * 2, stepY * 2);
    ctx.restore();
    stats.blends++;
  }
  // ③ 乒乓:本帧干净捕获槽晋升 prev,旧 prev 降为下帧捕获槽
  const tmp = prevCanvas;
  prevCanvas = captureCanvas;
  captureCanvas = tmp;
}
