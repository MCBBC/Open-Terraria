// ★ghostblur（2026-10-07）——全屏 ghost/motion-blur accumulation pass（设计增强刀;
// 灰度旗 ?ghostblur=1 缺省关,旗关=完全旁路零改动,fail-closed 家族）。
//
// 【机制】C10e GL 管线（GLPipeline,swpipe 上下文）帧尾 accumulation：把【上一帧
// 呈现面】以 α 混入当前帧——α 随相机速度自适应（静止/慢速=0 完全旁路不脏画面;
// 高速=0.10-0.25 观感带）。递归累积（呈现面反馈）=经典 frame-blending motion
// blur：displayed_N = α·displayed_{N−1} + (1−α)·raw_N,残迹按 (1−α)ⁿ 指数衰减。
//
// 【挂接点论证（present 前最后一步 vs 最外层合成面）】渲染栈=C10e 三画布
// sky2D(底)/glCanvas(中=GLPipeline 呈现面,屏栈折叠)/HUD(顶)。调用位=Game 帧
// tick 的 renderer.render(...) 完整返回【之后】（Game.ts 帧 tick 尾,glStatFrame
// 之前）——此刻本帧对 glCanvas 的一切 GL 写入（bg 会话 present/lantern·ambgl 桥/
// 世界 compose present/opresent 合并/回退窗 reorder/滤镜链 drawChainPipe 末
// present/degrade 读回踩踏+restack 补偿）已全部落定,后续到下一帧帧头
// clearScreenForStack 之间无任何 GL/2D 读取面（单线程,DOM 合成读走呈现面=本
// pass 的目的本身）。选此位而非「最后一个 present 调用点内联」的原因：帧内
// present 拓扑随路径分叉（纯帧=compose 末 present/滤镜帧=drawChainPipe 末
// present/回退窗=reorderFallbackSkyWorld 尾 present）,无单一收口点;而
// render() 有早退支（全屏地图 9.5 return 等——世界已画完,只跳过 HUD 尾段）,
// render() 内挂点会漏。Game 帧 tick 尾=全路径唯一必经点。glCanvas 在混入后
// ≠屏栈折叠（=折叠×prev 的 lerp）——不变式「glCanvas≈屏栈折叠」的违例窗仅
// 存在于【帧尾混入→下一帧帧头 clearScreenForStack】之间:该窗内唯一消费方=
// DOM 合成（目的本身）,GL/2D 侧无读取（滤镜链屏栈重放/夹层 blit 全在 render()
// 内=混入前;restackScreen 全在帧内=混入前;K1-2 链组装读屏栈 FBO 非画布）。
// 下一帧帧头 clearScreenForStack 先清画布再清栈=违例态零留存。HUD（顶 DOM 层）
// 与 sky2D（底 DOM 层）不参与混入——拖影只作用 glCanvas 内容（bg+群系背景+云+
// 世界）,HUD 文字/天空渐变恒清锐（相机速度门只在世界内容上可见=运动模糊的
// 感知主体;HUD 静态像素混入恒等式下零变化但白吃全屏 pass,不混=零成本）。
//
// 【数据流（ping-pong 读上写下）】管线 fbos 命名空间租名三 FBO：
//   ghostCur  — 帧尾 blitFramebuffer(默认帧缓冲→FBO) 载入当前帧原始呈现面
//               （GL 空间恒等拷贝=与屏栈 FBO 同向,采样/呈现 flipY=1 恒等映射）
//   ghostA/B  — 双缓冲 prev 槽 ping-pong：读上帧写本帧（read=mix 源,write=
//               mix 目标;写后 present 回画布并交换读写槽——读槽永不在被采样
//               的同时被写,blit/mix/present 顺序同帧内串行无竞争）
//   冷启动 seed：prev 槽无效（首帧/旗翻转回/非 c10e 帧间隙/管线重建/尺寸变/
//   dt≥250ms 长缝）→ 只 blit 画布→read 槽（种子=当前原始帧）,不 mix 不 present
//   （画布保持原样）——下一帧起 mix = α·种子 + (1−α)·新帧,拖影自第 2 帧起。
//   混入结果走 pipe.present(write槽)（blend off 直写画布,【不入屏栈】——
//   present over=false∧screenStackMode 只在 over=true 时入栈,屏栈原样保留到
//   帧头清零;「入栈唯一写点=present over 档」判例不破）。
//
// 【字节语义】全部 FBO RGBA8+画布均 premultiplied（管线 init 收口）;mix 在
// 预乘域对 rgb/α 同权重 lerp（texA×α+texB×(1−α)）=porter-duff 意义下的正确
// ghost 合成：透明洞（天空透出处）残迹半透明衰减,天空经 DOM 合成自然透出。
// 静止帧旁路（bypass）=零 GL 写入=逐位恒等;静态内容强行 mix 恒等式
// lerp(v,v,α)=v 在 fp32 相对误差 ~1e-7 ≪ 8bit 量化步（2e-3）,量化后逐位稳定,
// 无 ±1LSB 闪烁面（旁路门使稳态根本不进 mix,双保险）。
//
// 【速度源】cam.x/cam.y 帧距（TileShine.cameraSpeedPxPerMs 判例同域同口径:
// 首帧/dt≤0/长缝 dt≥250ms 不计速=视静止 0;瞬移=高速→满档,黑幕传送语义正确）。
// 独立小追踪器不与 shine 共态（消费节奏不同源）。α 释放走指数平滑（攻击即时/
// 释放 ×0.75/帧）——急停后拖影自然消散而非一帧斩断;平滑值 <0.004 且目标=0
// → bypass（稳态零成本零像素面）。
import { GLPipeline, PipelineFbo } from './GLPipeline';

/** 速度门下阈（px/ms）：低于此 α=0。步行 ~0.264、疾跑+配饰 ~0.37 不触发
 *  （静止/慢速不脏画面）;下坠 ~0.6-1.0/矿车 ~0.9/翼飞行 >1.5 进入拖影域。 */
export let GHOST_SPEED_MIN = 0.45;
/** 速度门上阈（px/ms）：达到此 α=满档（GHOST_ALPHA_MAX）。 */
export let GHOST_SPEED_MAX = 1.2;
/** 满档混入 α（观感带 0.10-0.25 内取 0.22——0.75ⁿ/帧衰减,残迹 ~8-10 帧）。 */
export let GHOST_ALPHA_MAX = 0.22;
/** α 释放平滑系数（每帧向 0 收敛比例;攻击方向即时,防起速半模糊帧）。 */
export const GHOST_ALPHA_RELEASE = 0.25;
/** α 旁路地板：平滑 α 低于此且目标=0 → 完全旁路（稳态零 GL 写入）。 */
export const GHOST_ALPHA_FLOOR = 0.004;
/** 长缝判（ms）：dt≥此值=暂停恢复/长卡顿,prev 内容过期 → 冷启动 seed。 */
export const GHOST_GAP_MS = 250;

/** 活机调参面（探针/F5 实时拧;setForTest 同域）。window.__swGhost 排布：
 *  { get alpha(), get speed(), setKnob(name, v), knobs() } */
export function ghostSetKnob(name: 'speedMin' | 'speedMax' | 'alphaMax', v: number): void {
  const val = Math.max(0, Math.min(1, v));
  if (name === 'alphaMax') GHOST_ALPHA_MAX = val;
  else if (name === 'speedMin') GHOST_SPEED_MIN = Math.max(0.05, val);
  else if (name === 'speedMax') GHOST_SPEED_MAX = Math.max(GHOST_SPEED_MIN + 0.05, val);
}

// ---------------------------------------------------------------------------
// 纯逻辑核（node 单测面;GL 执行=薄壳）
// ---------------------------------------------------------------------------

export interface GhostDecision {
  /** bypass=零 GL 写入（画布保持原样）/seed=blit 画布→read 槽（冷启动种）/
   *  mix=blit 画布→cur+mix(read,cur)→write+present+交换 */
  action: 'bypass' | 'seed' | 'mix';
  /** mix 时的混入 α（bypass/seed=0） */
  alpha: number;
  /** 本帧相机速度（px/ms;诊断面） */
  speed: number;
}

/** 速度→目标 α 纯函数（MIN 以下 0;MIN..MAX 线性爬坡;MAX 以上满档钳制）。 */
export function ghostAlphaForSpeed(speed: number): number {
  if (!(speed > GHOST_SPEED_MIN)) return 0;
  const t = Math.min(1, (speed - GHOST_SPEED_MIN) / Math.max(1e-6, GHOST_SPEED_MAX - GHOST_SPEED_MIN));
  return t * GHOST_ALPHA_MAX;
}

export class GhostCore {
  private warm = false;
  private alphaSm = 0;
  private lastX = NaN;
  private lastY = NaN;
  private lastT = 0;
  private lastW = 0;
  private lastH = 0;
  /** ping-pong 相位（0=read=A/write=B;1=read=B/write=A） */
  phase = 0;
  /** 诊断面：最近一次决策（探针/F5） */
  last: GhostDecision = { action: 'bypass', alpha: 0, speed: 0 };

  /** 全状态复位（旗关/管线死/非 c10e 帧——下次开启走 seed 冷启动）。 */
  reset(): void {
    this.warm = false;
    this.alphaSm = 0;
    this.lastX = NaN;
    this.lastY = NaN;
    this.lastT = 0;
    this.phase = 0;
    this.last = { action: 'bypass', alpha: 0, speed: 0 };
  }

  /** 每帧恰一次推进（GL 执行壳调用;相机速度/尺寸/旗态输入,决策输出）。
   *  enabled=false → 复位+bypass（fail-closed：旗关零状态残留）。 */
  decide(camX: number, camY: number, now: number, w: number, h: number, enabled: boolean): GhostDecision {
    if (!enabled) { this.reset(); return this.last; }
    // 速度推进（cameraSpeedPxPerMs 判例同口径：首帧/dt≤0/长缝=0）
    const dt = now - this.lastT;
    const gap = !Number.isFinite(this.lastX) || dt <= 0 || dt >= GHOST_GAP_MS;
    const prevX = this.lastX, prevY = this.lastY;
    this.lastT = now; this.lastX = camX; this.lastY = camY;
    const speed = gap ? 0 : Math.hypot(camX - prevX, camY - prevY) / dt;
    // 尺寸变化/长缝 → 冷启动（prev 过期;fbo 侧由壳按 (W,H) 重租）
    const resized = this.warm && (w !== this.lastW || h !== this.lastH);
    this.lastW = w; this.lastH = h;
    if (!this.warm || gap || resized) {
      this.warm = true;
      this.alphaSm = 0;
      this.last = { action: 'seed', alpha: 0, speed };
      return this.last;
    }
    // α 平滑：攻击即时（防起速半模糊帧）,释放指数衰减（急停自然消散）
    const target = ghostAlphaForSpeed(speed);
    this.alphaSm = target > this.alphaSm
      ? target
      : this.alphaSm + (target - this.alphaSm) * GHOST_ALPHA_RELEASE;
    if (this.alphaSm < GHOST_ALPHA_FLOOR && target === 0) {
      this.alphaSm = 0;
      this.last = { action: 'bypass', alpha: 0, speed };
      return this.last;
    }
    this.last = { action: 'mix', alpha: this.alphaSm, speed };
    return this.last;
  }

  /** mix 落定提交（GL 壳在 present 成功后调;ping-pong 读写槽交换——读上写下,
   *  本帧读槽=下帧写槽）。失败路径走 reset 不提交（下次 seed 冷启动）。 */
  commitMix(): void {
    this.phase = this.phase === 0 ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------
// GL 执行壳（GLPipeline 门面消费——program/fbo/bindTarget/drawQuad/present/glx;
// 不改 GLPipeline 本体）
// ---------------------------------------------------------------------------

const GHOST_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
uniform vec4 uDst;
uniform vec2 uCanvas;
uniform float uFlipY;
void main() {
  vec2 p = aPos * uDst.zw + uDst.xy;
  gl_Position = vec4(p / uCanvas * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  vUv = vec2(aPos.x, mix(aPos.y, 1.0 - aPos.y, uFlipY));
}`;

// 预乘域 ghost mix：out = prev×α + cur×(1−α)（rgb/α 同权重——预乘空间 lerp）
const GHOST_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform float uAlpha;
out vec4 outColor;
void main() {
  vec4 p = texture(uPrev, vUv);
  vec4 c = texture(uCur, vUv);
  outColor = vec4(mix(c.rgb, p.rgb, uAlpha), mix(c.a, p.a, uAlpha));
}`;

const core = new GhostCore();

/** 诊断/调参面（探针+F5 消费）：window.__swGhost */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__swGhost = {
    get alpha() { return core.last.alpha; },
    get action() { return core.last.action; },
    get speed() { return core.last.speed; },
    knobs: () => ({ speedMin: GHOST_SPEED_MIN, speedMax: GHOST_SPEED_MAX, alphaMax: GHOST_ALPHA_MAX }),
    setKnob: ghostSetKnob,
  };
}

/** 测试复位（生产禁调——core 为模块级单例,生产每帧恰一次 decide 推进）。 */
export function ghostCoreResetForTest(): void { core.reset(); }

/** 测试/探针决策直驱面（GL 壳不经过,纯核单源）。 */
export function ghostDecideForTest(camX: number, camY: number, now: number, w: number, h: number,
  enabled: boolean): GhostDecision {
  return core.decide(camX, camY, now, w, h, enabled);
}

/** 帧尾 ghost pass（Renderer.ghostFrameEnd 消费;每帧恰一次）。
 *  旗关/管线不可用/零尺寸=复位+bypass（fail-closed 零改动）。
 *  ★失败语义：任一 GL 步骤不可达（FBO 租借失败/程序缺）→ 复位（下次 seed
 *  冷启动,宁无拖影不脏画面）。 */
export function ghostFrameEnd(pipe: GLPipeline | null, camX: number, camY: number, enabled: boolean): void {
  const gl = pipe && !pipe.unavailable ? pipe.glx : null;
  if (!enabled || !pipe || !gl) { core.reset(); return; }
  const W = pipe.canvas.width, H = pipe.canvas.height;
  if (W <= 0 || H <= 0) { core.reset(); return; }
  const d = core.decide(camX, camY, performance.now(), W, H, true);
  if (d.action === 'bypass') return;
  // ping-pong 槽租借（fbos 命名空间;尺寸变化自动重分配——content 失效,由
  // decide 的 resized→seed 冷启动对齐）。phase 0: read=A/write=B;phase 1: 反之。
  const read = pipe.fbo(core.phase === 0 ? 'ghostA' : 'ghostB', W, H);
  const write = pipe.fbo(core.phase === 0 ? 'ghostB' : 'ghostA', W, H);
  if (!read?.tex || !write?.tex || read === write) { core.reset(); return; }
  if (d.action === 'seed') {
    // 冷启动：blit 画布→read 槽（种子=当前原始呈现面,即下一帧 mix 的 prev 源;
    // GL 空间恒等拷贝,与屏栈 FBO 同向——flipY=1 恒等映射族）。不 mix 不 present
    // （画布保持原样）;不翻相位（种子恒落当前 read 槽=下帧 mix 读槽）。
    blitCanvasTo(gl, read, W, H);
    return;
  }
  const cur = pipe.fbo('ghostCur', W, H);
  if (!cur?.tex) { core.reset(); return; }
  // ① 当前帧原始呈现面载入 cur（默认帧缓冲→FBO blit;preserveDrawingBuffer 语义下
  //    默认帧缓冲内容=本帧全部 present 叠合结果）
  blitCanvasTo(gl, cur, W, H);
  // ② mix：read(prev)×α + cur×(1−α) → write（blend off 直写;flipY=1 恒等映射族）
  const prog = pipe.program('ghostmix', GHOST_VERT, GHOST_FRAG);
  if (!prog?.prog) { core.reset(); return; }
  pipe.bindTarget(write);
  pipe.setBlend('off');
  gl.useProgram(prog.prog);   // ★uniform-in-useProgram 纪律（2026-09-23 全黑案判例）
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, read.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, cur.tex);
  gl.uniform1i(pipe.uni(prog, 'uPrev'), 0);
  gl.uniform1i(pipe.uni(prog, 'uCur'), 1);
  gl.uniform1f(pipe.uni(prog, 'uAlpha'), d.alpha);
  pipe.drawQuad(prog, [0, 0, W, H], 1);
  // ③ present 回画布（blend off 直写覆盖;over=false 不入屏栈——屏栈原样保留到
  //    下帧帧头 clearScreenForStack,「glCanvas=屏栈折叠」违例窗=仅 DOM 合成消费）
  pipe.present(write);
  core.commitMix();   // ping-pong 交换（读上写下:本帧读槽=下帧写槽）
}

/** blitFramebuffer 画布→FBO（GL 空间恒等拷贝;READ=默认帧缓冲/DRAW=dst）。
 *  ★绑定卫生：进出全 restore（READ/DRAW 归 null——不残留绑定面给后续 pass）。 */
function blitCanvasTo(gl: WebGL2RenderingContext, dst: PipelineFbo, w: number, h: number): void {
  if (!dst.fbo) return;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.fbo);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
}
