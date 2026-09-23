// ★A2 光照×扭曲 FBO 链（2026-09-23；渲染改造方案 §三 A2,计划文件 §八实现态）
//
// 形态：GLWorldLight + GLWaterDistortion 两 pass 迁入 GLPipeline 单上下文——
//   worldCanvas 全帧上传 ─┐
//   光照脏行带 ──────────┴→ pass1(精确乘) → FBO('lit') → pass2(obj19 扭曲,直采 FBO
//   纹理) → FBO('warped') → present() 单次回贴 2D。
// 消灭：scene 全帧重传（旧 GLWaterDistortion 把 worldLight 输出【画布】再上传,
//   用户实机 trace texSubImage2D 502ms 主源）+ 一次全屏 GL→2D 回贴。
// 字节等价构造：两 pass 的 VERT/FRAG 从原模块【单源引用】（GLWorldLight.VERT/FRAG、
//   GLWaterDistortion.VERT/FRAG——2026-09-23 去私有化）,uniform 表/纹理参数/上传
//   逐式对照原 composite()（方案 §八实录）;中间产物 RGBA8 FBO ≡ 原 8bit 画布字节
//   （blend off 直写）。★两级 pass 结构不变——不合并单 shader pass（第一级输出经
//   8bit 量化,第二级 LINEAR 插值的是量化值;浮点直乘跳过中间量化=字节必不同,
//   方案 §二裁决 3）。朝向链由对拍实证（_wlgl 探针族+像素 md5）。
// 接线：Renderer.compositeLight `?wfbo=1` 激活（首版默认关;对拍过翻缺省+逃生门
//   改 ?wfbo=0）。旧路径与 2D 兜底全保留。
import { GLPipeline, type PipelineFbo, type PipelineProgram } from './GLPipeline';
import { glStatUpload, glStatTexCreate } from './GLStats';
import { GLWorldLight } from './GLWorldLight';
import { GLWaterDistortion } from './GLWaterDistortion';

/** ★A2 朝向链（2026-09-23 用户实报"世界倒置"定谳,真实代数重推）：原 VERT 写
 *  `gl_Position.y = 1.0 - aPos.y*2.0`（aPos.y=0→clip+1）。画布呈现:clip+1=画布顶
 *  ✓生产正确;但 FBO:clip+1=帧缓冲 max 行=纹理 v1 → aPos.y=0（图像顶行,vUv=0）
 *  落 v1 → FBO 布局相对「画布上传即纹理」（v0=图像顶,FLIP_Y=false）上下颠倒
 *  → pass2/水门控/扭曲全链倒置。
 *  修=pass1 用去翻转变体（单点派生自 GLWorldLight.VERT,非转录）:
 *  `aPos.y*2.0-1.0` → aPos.y=0→clip-1→帧缓冲 row0=v0=图像顶 ≙ 旧上传布局。
 *  pass2 保持原 VERT:vUv=0 采 lit v0=图像顶 ✓,写入经原翻转→图像顶落 warped v1;
 *  present(flipY=1) 画布顶采 v1=图像顶 → 三级闭合,屏上正立。 */
const LIT_VERT = GLWorldLight.VERT.replace('1.0 - aPos.y * 2.0', 'aPos.y * 2.0 - 1.0');

export class GLWorldCompose {
  /** 无扭曲帧的中性波场（0.5 中心值 → 位移 (0.5−0.5)·intensity=0;gridW/H=1 防
   *  uWaveSize=(0,0) 的 NaN 除法——mix(NaN×0)=NaN 污染恒等直通） */
  static readonly neutralWave = new Float32Array([0.5]);
  readonly pipeline: GLPipeline;
  unavailable: boolean;
  private pLit: PipelineProgram | null = null;
  private pDistort: PipelineProgram | null = null;
  private fboLit: PipelineFbo | null = null;
  private fboWarped: PipelineFbo | null = null;
  private texWorld: WebGLTexture | null = null;
  private texLight: WebGLTexture | null = null;
  private texNoise: WebGLTexture | null = null;
  private texWave: WebGLTexture | null = null;
  private texWater: WebGLTexture | null = null;
  private texWaterEmpty: WebGLTexture | null = null;
  private _texKeyWorld = '';
  private _texKeyLight = '';
  private _texKeyNoise = '';
  private _texKeyWater = '';
  private noiseW = 0;
  private noiseH = 0;
  private waveBytes: Uint8Array | null = null;

  constructor(statName = 'worldCompose') {
    this.pipeline = new GLPipeline(statName);
    this.unavailable = this.pipeline.unavailable;
    const gl = this.pipeline.glx;
    if (!gl) return;
    this.pLit = this.pipeline.program('worldLight', LIT_VERT, GLWorldLight.FRAG);
    this.pDistort = this.pipeline.program('distort', GLWaterDistortion.VERT, GLWaterDistortion.FRAG);
    if (!this.pLit?.prog || !this.pDistort?.prog) { this.unavailable = true; return; }
    // 纹理创建+采样参数（逐字对照两原模块 init:GLWorldLight.ts:140-148 / GLWaterDistortion.ts:243-270 表）
    this.texWorld = gl.createTexture();
    this.texLight = gl.createTexture();
    for (const t of [this.texWorld, this.texLight]) this.setParams(gl, t, 'LINEAR', 'CLAMP');   // 光照小图 LINEAR 上采样=原 2D 双线性同款
    this.texNoise = gl.createTexture();
    this.setParams(gl, this.texNoise, 'LINEAR', 'REPEAT');
    this.texWave = gl.createTexture();
    this.setParams(gl, this.texWave, 'LINEAR', 'CLAMP');     // LUMINANCE LINEAR（原 uWave 档）
    this.texWater = gl.createTexture();
    this.setParams(gl, this.texWater, 'NEAREST', 'CLAMP');   // 原版 PointClamp 门控
    // 注意:本模块全部上传逐笔显式 pixelStorei（不依赖 pipeline init 的画布源预乘收口——
    // noise/wave/water-empty 是纯数据源,预乘必须 false）
  }

  private setParams(gl: WebGL2RenderingContext, t: WebGLTexture, filter: 'LINEAR' | 'NEAREST', wrap: 'CLAMP' | 'REPEAT'): void {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter === 'LINEAR' ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === 'LINEAR' ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap === 'CLAMP' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap === 'CLAMP' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
  }

  /** 整链合成。入参语义=旧 GLWorldLight.composite+GLWaterDistortion.composite 拼合。
   *  成功返回 true——调用方随后 ctx.drawImage(compose.pipeline.canvas, 0, 0, viewW, viewH)
   *  单次回贴（替代旧 warped ?? gl.canvas 两次判空回贴链）。 */
  compose(
    world: HTMLCanvasElement, light: HTMLCanvasElement,
    lightRect: readonly [number, number, number, number], darkSkip = 0,
    lightBand?: { canvas: HTMLCanvasElement; y: number; w: number; h: number } | null,
    water: HTMLCanvasElement | null = null, noise: TexImageSource | null = null,
    cssW = 0, cssH = 0, progress = 0, intensity = 0,
    waveR: Float32Array | null = null, gridW = 0, gridH = 0,
    worldX = 0, worldY = 0, waveOffX = 0, waveOffY = 0,
  ): boolean {
    const pipeline = this.pipeline;
    const gl = pipeline.glx;
    if (!gl || !this.pLit?.prog || !this.pDistort?.prog || this.unavailable) return false;
    const w = world.width, h = world.height;
    if (w === 0 || h === 0) return false;
    pipeline.beginFrame(w, h);
    // ---- Pass1：world × light → FBO('lit')（GLWorldLight.composite:179-232 逐式） ----
    this.fboLit = pipeline.fbo('lit', w, h);
    if (!this.fboLit) return false;
    pipeline.bindTarget(this.fboLit);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.pLit.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texWorld);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);   // canvas 源预乘直拷（原 :186 同式）
    const kW = `${w}x${h}`;
    if (this._texKeyWorld !== kW) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, world);
      glStatTexCreate(this.pipeline.statName, w * h * 4);
      this._texKeyWorld = kW;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, world);
    }
    glStatUpload(this.pipeline.statName, w * h * 4);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texLight);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const kb = `${light.width}x${light.height}`;
    if (this._texKeyLight !== kb) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, light);
      glStatTexCreate(this.pipeline.statName, light.width * light.height * 4);
      this._texKeyLight = kb;
      glStatUpload(this.pipeline.statName, light.width * light.height * 4);
    } else if (lightBand === null) {
      // 零变化:跳过上传（原 :211 同式）
    } else if (lightBand !== undefined) {
      // WebGL2 9 参 DOM 源重载（GLPipeline 仅 WebGL2,原 _isGL2 门恒真）
      (gl as unknown as { texSubImage2D: (...a: unknown[]) => void }).texSubImage2D(
        gl.TEXTURE_2D, 0, 0, lightBand.y, lightBand.w, lightBand.h,
        gl.RGBA, gl.UNSIGNED_BYTE, lightBand.canvas);
      glStatUpload(this.pipeline.statName, lightBand.w * lightBand.h * 4);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, light);
      glStatUpload(this.pipeline.statName, light.width * light.height * 4);
    }
    gl.uniform1i(this.pipeline.uni(this.pLit, 'uWorld'), 0);
    gl.uniform1i(this.pipeline.uni(this.pLit, 'uLight'), 1);
    gl.uniform2f(this.pipeline.uni(this.pLit, 'uCanvas'), w, h);
    gl.uniform4f(this.pipeline.uni(this.pLit, 'uLightRect'), lightRect[0], lightRect[1],
      Math.max(1, lightRect[2]), Math.max(1, lightRect[3]));
    gl.uniform1f(this.pipeline.uni(this.pLit, 'uDarkSkip'), darkSkip);
    pipeline.setBlend('off');
    pipeline.drawQuad(this.pLit, [0, 0, w, h], 0);   // flipY=0:同 VERT 自带 y 翻转语义（与原 pass 内直绘一致）
    // ---- Pass2：obj19 扭曲,直采 FBO('lit') 纹理（GLWaterDistortion.composite:350-412 逐式） ----
    this.fboWarped = pipeline.fbo('warped', w, h);
    if (!this.fboWarped) return false;
    pipeline.bindTarget(this.fboWarped);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.pDistort.prog);
    // uScene = FBO('lit') 纹理（★本刀核心:免画布回读+免全帧重传;LINEAR CLAMP 参数同原 texScene）
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboLit.tex);
    // 前景水门控纹理
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texWater);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (water && water.width > 0 && water.height > 0) {
      // ★首传/变尺寸必须 texImage2D 分配存储——只 texSubImage2D 于无存储纹理=
      //   INVALID_OPERATION 静默 → 采样不完整纹理恒 (0,0,0,1) → 门控 α≡1 全屏
      //   （2026-09-23 用户实报"全屏热扭曲状"定谳,即此）
      const kW = `${water.width}x${water.height}`;
      if (this._texKeyWater !== kW) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, water);
        glStatTexCreate(this.pipeline.statName, water.width * water.height * 4);
        this._texKeyWater = kW;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, water);
      }
      glStatUpload(this.pipeline.statName, water.width * water.height * 4);
    } else {
      if (!this.texWaterEmpty) {
        this.texWaterEmpty = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texWaterEmpty);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
          new Uint8Array([0, 0, 0, 0]));
      }
      gl.bindTexture(gl.TEXTURE_2D, this.texWaterEmpty);
    }
    if (noise) this.ensureNoise(gl, noise);
    else if (this.noiseW === 0) {
      // ★无噪声帧中性 1×1 垫底：防 uNoiseSize=(0,0) 除零 NaN（NaN×0=NaN 污染
      //   gate=0 的恒等直通——除零是唯一 NaN 源,全部定义后 gate=0 ⟹ 逐位恒等）
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      this.noiseW = 1; this.noiseH = 1;
    }
    if (waveR && gridW > 0 && gridH > 0) this.uploadWave(gl, waveR, gridW, gridH);
    gl.uniform1i(this.pipeline.uni(this.pDistort, 'uScene'), 0);
    gl.uniform1i(this.pipeline.uni(this.pDistort, 'uNoise'), 1);
    gl.uniform1i(this.pipeline.uni(this.pDistort, 'uWave'), 2);
    gl.uniform1i(this.pipeline.uni(this.pDistort, 'uWater'), 3);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uCssSize'), cssW, cssH);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uWorldPx'), worldX, worldY);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uNoiseSize'), this.noiseW, this.noiseH);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uWaveSize'), gridW, gridH);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uWaveOff'), waveOffX, waveOffY);
    gl.uniform1f(this.pipeline.uni(this.pDistort, 'uProgress'), progress);
    gl.uniform1f(this.pipeline.uni(this.pDistort, 'uIntensity'), intensity);
    pipeline.setBlend('off');
    pipeline.drawQuad(this.pDistort, [0, 0, w, h], 0);
    // ---- present：FBO('warped') → pipeline 画布（调用方单次 drawImage 回贴 2D） ----
    pipeline.present(this.fboWarped);
    return true;
  }

  /** 噪声懒上传（ensureNoise:278-289 逐式;纯数据源预乘 false） */
  private ensureNoise(gl: WebGL2RenderingContext, noise: TexImageSource): boolean {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noise);
    const nw = (noise as { width?: number }).width ?? 0;
    const nh = (noise as { height?: number }).height ?? 0;
    if (nw > 0 && nh > 0) {
      glStatUpload(this.pipeline.statName, nw * nh * 4);
      this.noiseW = nw; this.noiseH = nh;
    }
    return true;
  }

  /** 波场 _R → LUMINANCE 8bit（uploadWave:293-321 逐式;★8bit 量化=输出语义,勿改浮点直传） */
  private uploadWave(gl: WebGL2RenderingContext, waveR: Float32Array, w: number, h: number): void {
    const n = w * h;
    if (!this.waveBytes || this.waveBytes.length !== n) this.waveBytes = new Uint8Array(n);
    const bytes = this.waveBytes;
    const amp = 1;   // ?wamp 增益在旧模块读取;本模块首版恒 1=原版原样（接线刀带 waveAmpParam 同款读取面）
    for (let i = 0; i < n; i++) {
      const v = ((waveR[i] - 0.5) * amp + 0.5) * 255 + 0.5;
      bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texWave);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);   // LUMINANCE 紧排（原 :318,行非 4 倍数防 INVALID_OPERATION）
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
    glStatUpload(this.pipeline.statName, w * h);
  }

  /** 上下文丢失/退避后重建（透传 pipeline.recreate;纹理/键全弃） */
  recreate(): boolean {
    const ok = this.pipeline.recreate();
    this.unavailable = this.pipeline.unavailable;
    if (ok) {
      const gl = this.pipeline.glx;
      if (gl) {
        this.texWorld = gl.createTexture();
        this.texLight = gl.createTexture();
        for (const t of [this.texWorld, this.texLight]) this.setParams(gl, t, 'LINEAR', 'CLAMP');
        this.texNoise = gl.createTexture();
        this.setParams(gl, this.texNoise, 'LINEAR', 'REPEAT');
        this.texWave = gl.createTexture();
        this.setParams(gl, this.texWave, 'LINEAR', 'CLAMP');
        this.texWater = gl.createTexture();
        this.setParams(gl, this.texWater, 'NEAREST', 'CLAMP');
      }
      this._texKeyWorld = ''; this._texKeyLight = ''; this._texKeyNoise = ''; this._texKeyWater = '';
      this.texWaterEmpty = null;
    }
    return ok;
  }

  dispose(): void {
    this.pipeline.dispose();
    this.unavailable = true;
  }
}
