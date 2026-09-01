// DX9 SM2 像素着色器解释器 + D3DX preshader 执行器 —— 染料/HallowBoss 像素公式唯一真值源。
//
// 背景：全部染料技术（含"基础"ArmorColored 族）都是编译期 effect 二进制，HLSL 不在
// 反编译 C# 内。本模块直接执行从 terraria-assets/PixelShader.cso 导出的原始 SM2 字节码
// （src/data/fxPixelShader.json，由 tools/disasm-fx.mjs 生成；容器为 XNA4 编译的 D3DX
// effect，解码与 MojoShader mojoshader_effects.c/mojoshader.c 一致）——逐指令 1:1，
// 无手抄公式。uniform 注入对齐 ArmorShaderData.Apply / MiscShaderData.Apply（C# 可读侧）。
//
// 与 XNA 语义对齐点：
// - 输出 oC0 为 UNORM：rgba 钳 0..1；_sat 修饰逐指令钳。
// - texld 无 project/bias 修饰位（全量 63 pass 扫描实证 ctrl=0）。
// - 采样策略：s0=被染贴图（像素中心对齐,双线性=原像素）；s1/s2 由调用方提供,
//   寻址策略按 vanilla：染料走 SpriteBatch LinearClamp（clamp），
//   Misc HallowBoss 烘焙的 uImage1 走 MiscShaderData.Apply 默认 LinearWrap（wrap）。
// - v0（顶点色=光照）在烘焙期恒白：光照由合成管线后乘。★仅对"v0 只出现在
//   尾段乘法"的 pass 可交换（字节码扫描:尾乘族 30 pass）；**16 pass 存在 v0
//   中段非线性消费**（max/lrp/mad/add/mul 位）——烘焙(白)×合成光 ≠ 逐帧
//   v0=光照色 的原版输出,暗处/明暗过渡带染料响应有偏差（2026-08-24 r15
//   R15-14 定谳;染料侧受累 13:ArmorMartian/LivingRainbow/LivingFlame/Wisp/
//   HighContrastGlow/Hades/Acid/Mushroom/Solar/ShiftingSands/ShiftingPearlsands/
//   Fog/Loki;非染料 3:WaterDistortionObject/HorizonClouds(两者走手写 JS 镜像,
//   不经本解释器)/Aurora(自研光栅化逐像素 v0,不受此限)）。逐帧带 v0 烘焙需
//   逐像素重跑 SM2=架构级改动,登记为已知偏差;亮处 v0≡白时等价故地表难察觉。
import fxJson from '../data/fxPixelShader.json';

export interface SM2Uniforms {
  uColor: [number, number, number];
  uSecondaryColor: [number, number, number];
  uSaturation: number;
  uOpacity: number;
  uTime: number;
  uSourceRect: [number, number, number, number];     // 像素坐标 (x,y,w,h)
  uDrawPosition: [number, number];
  uTargetPosition: [number, number];
  uImageSize0: [number, number];
  uImageSize1: [number, number];
  uImageSize2: [number, number];
  uLegacyArmorSourceRect: [number, number, number, number];
  uLegacyArmorSheetSize: [number, number];
  uRotation: number;
  uDirection: number;
  uLightSource: [number, number, number, number];
  uShaderSpecificData: [number, number, number, number];
}

export function defaultUniforms(): SM2Uniforms {
  return {
    uColor: [1, 1, 1], uSecondaryColor: [1, 1, 1],
    uSaturation: 1, uOpacity: 1, uTime: 0,
    uSourceRect: [0, 0, 0, 0], uDrawPosition: [0, 0], uTargetPosition: [0, 0],
    uImageSize0: [0, 0], uImageSize1: [0, 0], uImageSize2: [0, 0],
    uLegacyArmorSourceRect: [0, 0, 0, 0], uLegacyArmorSheetSize: [0, 0],
    uRotation: 0, uDirection: 1, uLightSource: [0, 0, 0, 0],
    uShaderSpecificData: [0, 0, 0, 0],
  };
}

/** 采样器：输入 uv（0..1）→ 线性 RGBA（寻址策略由实现承担） */
export type SM2Sampler = (u: number, v: number) => [number, number, number, number];
/** 出参版采样器（2026-09-01 PR#1）：写满 out[0..3] 即返回——零分配路径。
 * ★不变量：采样器不得保留对 out 的引用（消费即止，返回后缓冲立即可复用）。 */
export type SM2SamplerOut = (u: number, v: number, out: Float64Array) => void;

interface FxSymbol { name: string; kind: string; reg: string; count: number }
interface FxPassJson {
  pass: string; obj: number; tokens: number[]; presTokens: number[] | null;
  preshader: {
    lits: number[];
    syms: Array<{ name: string; regIndex: number; regCount: number }>;
    outMap: Array<[number, number]>;
    insts: Array<[number, Array<[number, number, number]>]>;
  } | null;
  symbols: FxSymbol[];
}

const PASSES = (fxJson as unknown as { passes: FxPassJson[] }).passes;

// ---------- 指令表（d3d9types.h D3DSIO；operand token 数） ----------
const OPS: Record<number, number> = {
  0x00: 0, 0x01: 2, 0x02: 3, 0x03: 3, 0x04: 4, 0x05: 3, 0x06: 2, 0x07: 2,
  0x08: 3, 0x09: 3, 0x0A: 3, 0x0B: 3, 0x0C: 3, 0x0D: 3, 0x0E: 2, 0x0F: 2,
  0x12: 4, 0x13: 2, 0x1F: 2, 0x20: 3, 0x21: 3, 0x23: 2, 0x24: 2, 0x25: 4,
  0x41: 1, 0x42: 3, 0x51: 5, 0x58: 4, 0x5A: 4,
};

interface SrcDecoded { comps: number[]; neg: boolean; imm: number[] | null; file: number; reg: number }
interface DecodedInst {
  op: number;
  dstMask: number; dstSat: boolean;
  srcs: SrcDecoded[];
}

/** 寄存器文件解码（mojoshader_internal.h RegisterType：0=r 1=v 2=c 3=t 7=oC 8=oDepth 10=s） */
function fileOf(tok: number): number {
  return ((tok >> 28) & 7) | ((tok >> 8) & 0x18);
}
function regOf(tok: number): number {
  return tok & 0x7FF;
}

/** 寄存器文件定位（eval 时调用；帧级数组由调用方复用） */
function bindFile(file: number, reg: number, r: Float64Array, c: Float64Array,
  tex: Float64Array, v: Float64Array, o: Float64Array): { arr: Float64Array; off: number } {
  switch (file) {
    case 0: return { arr: r, off: reg * 4 };
    case 1: return { arr: v, off: reg * 4 };   // v0/v1
    case 2: return { arr: c, off: reg * 4 };
    case 3: return { arr: tex, off: reg * 4 };
    case 7: case 8: return { arr: o, off: 0 }; // oC0/oDepth → 输出槽
    default: return { arr: r, off: reg * 4 };
  }
}

function decodeProgram(tokens: number[]): Inst[] {
  const out: Inst[] = [];
  let i = 0;                                    // JSON tokens 不含版本 token（导出时已剥）
  while (i < tokens.length) {
    const tok = tokens[i++];
    const op = tok & 0xFFFF;
    if (op === 0xFFFF) break;
    const nOps = OPS[op];
    if (nOps === undefined) break;              // 未知 opcode：截断（防御）
    const raw = tokens.slice(i, i + nOps); i += nOps;
    if (op === 0x51) {                          // def cN, f0..f3 → 立即数 mov（src=imm）
      const vals = [0, 1, 2, 3].map((k) => u32ToF32(raw[1 + k]));
      out.push({
        op: 0x01, dstMask: 0xF, dstSat: false,
        srcs: [{ comps: [0, 1, 2, 3], neg: false, imm: vals, file: -1, reg: 0 }],
        dstFile: fileOf(raw[0]), dstReg: regOf(raw[0]),
      });
      continue;
    }
    if (op === 0x1F) continue;                  // dcl：跳过
    const srcs: SrcDecoded[] = raw.slice(1).map((t) => ({
      comps: [(t >> 16) & 3, (t >> 18) & 3, (t >> 20) & 3, (t >> 22) & 3],
      neg: ((t >> 24) & 0xF) === 1,
      imm: null,
      file: fileOf(t), reg: regOf(t),
    }));
    out.push({
      op,
      // _sat 判据:d3d9types.h:513-515 D3DSPDM_NONE=0 / SATURATE=1<<D3DSP_DSTMOD_SHIFT /
      // PARTIALPRECISION=2——(tok>>20)&0xF==1 才是饱和(2026-08-24 r15 复核定谳;
      // 曾写 ===2 致全库 54 处 _sat/34 pass 静默丢弃,染料烘焙色大幅偏差)
      dstMask: (raw[0] >> 16) & 0xF, dstSat: ((raw[0] >> 20) & 0xF) === 1,
      srcs,
      dstFile: fileOf(raw[0]), dstReg: regOf(raw[0]),
    });
  }
  return out;
}

function u32ToF32(u: number): number {
  const b = new ArrayBuffer(4);
  const dv = new DataView(b);
  dv.setUint32(0, u >>> 0, true);
  return dv.getFloat32(0, true);
}

/** uniform 名 → 4 float（XNA Vector3/float/Vector2/Vector4 打包，未设分量=0） */
function uniformVec4(u: SM2Uniforms, name: string): number[] | null {
  switch (name) {
    case 'uColor': return [u.uColor[0], u.uColor[1], u.uColor[2], 0];
    case 'uSecondaryColor': return [u.uSecondaryColor[0], u.uSecondaryColor[1], u.uSecondaryColor[2], 0];
    case 'uSaturation': return [u.uSaturation, 0, 0, 0];
    case 'uOpacity': return [u.uOpacity, 0, 0, 0];
    case 'uTime': return [u.uTime, 0, 0, 0];
    case 'uDirection': return [u.uDirection, 0, 0, 0];
    case 'uRotation': return [u.uRotation, 0, 0, 0];
    case 'uSourceRect': return u.uSourceRect;
    case 'uImageSize0': return [u.uImageSize0[0], u.uImageSize0[1], 0, 0];
    case 'uImageSize1': return [u.uImageSize1[0], u.uImageSize1[1], 0, 0];
    case 'uImageSize2': return [u.uImageSize2[0], u.uImageSize2[1], 0, 0];
    case 'uDrawPosition': return [u.uDrawPosition[0], u.uDrawPosition[1], 0, 0];
    case 'uTargetPosition': return [u.uTargetPosition[0], u.uTargetPosition[1], 0, 0];
    case 'uLegacyArmorSourceRect': return u.uLegacyArmorSourceRect;
    case 'uLegacyArmorSheetSize': return [u.uLegacyArmorSheetSize[0], u.uLegacyArmorSheetSize[1], 0, 0];
    case 'uLightSource': return u.uLightSource;
    case 'uShaderSpecificData': return u.uShaderSpecificData;
    default: return null;
  }
}

// dst/src 的文件/寄存器元数据（eval 时 bindFile 定位）
interface DecodedExtra { dstFile?: number; dstReg?: number }
type Inst = DecodedInst & DecodedExtra;

const PS_SCALAR_BASE = 0xA000;

export class SM2Pass {
  readonly name: string;
  private prog: Inst[];
  private symbols: FxSymbol[];
  private pres: FxPassJson['preshader'];
  /** 出参采样器的实例域复用缓冲（PR#1——单线程顺序执行下实例互不重叠） */
  private sampOut = new Float64Array(4);

  constructor(json: FxPassJson) {
    this.name = json.pass;
    this.prog = decodeProgram(json.tokens);
    this.symbols = json.symbols;
    this.pres = json.preshader;
  }

  /** 常量寄存器装配：def → CTAB 符号注入 → preshader 覆写（64×4 float） */
  setupConstants(u: SM2Uniforms): Float64Array {
    const c = new Float64Array(64 * 4);
    for (const ins of this.prog) {                       // def 常量（imm mov 的静态求值）
      if (ins.op === 0x01 && ins.srcs[0]?.imm && ins.dstFile === 2) {
        const vals = ins.srcs[0].imm;
        for (let k = 0; k < 4; k++) c[(ins.dstReg ?? 0) * 4 + k] = vals[k];
      }
    }
    for (const s of this.symbols) {                      // CTAB 符号 → uniform
      if (s.kind !== 'const') continue;
      const reg = parseInt(s.reg.slice(1), 10);
      if (Number.isNaN(reg)) continue;
      const v = uniformVec4(u, s.name);
      if (!v) continue;
      for (let rr = 0; rr < s.count; rr++) {
        for (let k = 0; k < 4; k++) c[(reg + rr) * 4 + k] = v[k];
      }
    }
    if (this.pres) {                                     // preshader 覆写
      const inpool = new Float64Array(64 * 4);
      for (const s of this.pres.syms) {
        const v = uniformVec4(u, s.name);
        if (v) for (let k = 0; k < 4; k++) inpool[s.regIndex * 4 + k] = v[k];
      }
      const outregs = new Float64Array(64 * 4);
      const written = new Set<number>();
      this.runPreshader(this.pres, inpool, outregs, written);
      // ★P3 已撤销（2026-09-01 金标门裁决）：理论推导"静态族依赖链 ≤40×2⁻²⁴ ≪ 半
      //   量化步，fround 必不翻字节"被实测否证——非 fp32 可表的 uniform 输入经
      //   preshader 放大后落在 8bit 量化边界上，ArmorColored 梯度场景即现 stack 层
      //   字节漂移（25/756 场景失配）。在 1458 rig 抓取原生 oC0 作为"朝原版收敛"
      //   的独立证据前，维持 f64 全程=与已发布视觉逐位一致（用户硬约束优先）。
      //   重启条件见 memory corruption-equip-key-hotspot 同批登记。
      for (const item of written) {
        const reg = this.outRegOf(item);
        c[reg * 4 + (item & 3)] = outregs[item];
      }
    }
    return c;
  }

  /** PRSI 输出映射：item(=reg*4+comp) → 目标 c 寄存器；无 PRSI 按 item/4 直落 */
  private outRegOf(item: number): number {
    for (const [base, cnt] of this.pres?.outMap ?? []) {
      if (base * 4 <= item && (base + cnt) * 4 > item) {
        return base + Math.floor((item - base * 4) / 4);
      }
    }
    return item >> 2;
  }

  /** FXLC VM（run_preshader, mojoshader_effects.c:19-206）：dst=末位 operand。
   *  返回实际写入的 outreg item 列表（覆写只动这些项） */
  private runPreshader(pres: NonNullable<FxPassJson['preshader']>,
    inpool: Float64Array, outregs: Float64Array, written?: Set<number>): void {
    const temps = new Float64Array(64 * 4);
    const s0 = new Float64Array(4), s1 = new Float64Array(4), s2 = new Float64Array(4);
    const dst = new Float64Array(4);
    for (const [opTok, operands] of pres.insts) {
      const op = (opTok >> 16) & 0xFFFF;
      const elems = opTok & 0xFF;
      const dstOp = operands[operands.length - 1];
      const scalar = op >= PS_SCALAR_BASE;
      for (let oi = 0; oi < operands.length - 1; oi++) {
        const [, type, item] = operands[oi];
        const s = oi === 0 ? s0 : oi === 1 ? s1 : s2;
        const n = scalar && oi === 0 ? 1 : elems;        // 标量 src0 只取 [0]
        if (type === 1) {
          for (let k = 0; k < n; k++) s[k] = pres.lits[item + k] ?? 0;
        } else if (type === 2) {
          for (let k = 0; k < n; k++) s[k] = inpool[item + k] ?? 0;
        } else if (type === 4) {
          for (let k = 0; k < n; k++) s[k] = outregs[item + k] ?? 0;
        } else if (type === 7) {
          for (let k = 0; k < n; k++) s[k] = temps[item + k] ?? 0;
        }
      }
      for (let k = 0; k < elems; k++) {
        const a = scalar ? s0[0] : s0[k], b = s1[k], d = s2[k];
        let v = 0;
        switch (op) {
          case 0x1000: v = a; break;
          case 0x1010: v = -a; break;
          case 0x1030: v = 1 / a; break;
          case 0x1040: v = a - Math.floor(a); break;
          case 0x1050: v = 2 ** a; break;
          case 0x1060: v = Math.log2(a); break;
          case 0x1070: v = 1 / Math.sqrt(a); break;
          case 0x1080: v = Math.sin(a); break;
          case 0x1090: v = Math.cos(a); break;
          case 0x10A0: v = Math.asin(a); break;
          case 0x10B0: v = Math.acos(a); break;
          case 0x10C0: v = Math.atan(a); break;
          case 0x2000: v = a < b ? a : b; break;
          case 0x2010: v = a > b ? a : b; break;
          case 0x2020: v = a < b ? 1 : 0; break;
          case 0x2030: v = a >= b ? 1 : 0; break;
          case 0x2040: v = a + b; break;
          case 0x2050: v = a * b; break;
          case 0x2060: v = Math.atan2(a, b); break;
          case 0x2080: v = a / b; break;
          case 0x3000: v = a >= 0 ? b : d; break;
          case 0xA000: v = s0[0] < b ? s0[0] : b; break;
          case 0xA010: v = s0[0] > b ? s0[0] : b; break;
          case 0xA020: v = s0[0] < b ? 1 : 0; break;
          case 0xA030: v = s0[0] >= b ? 1 : 0; break;
          case 0xA040: v = s0[0] + b; break;
          case 0xA050: v = s0[0] * b; break;
          case 0xA080: v = s0[0] / b; break;
          default: v = 0;
        }
        dst[k] = v;
      }
      if (op === 0x5000) {                               // dot：广播至 elems
        let f = 0;
        for (let k = 0; k < elems; k++) f += s0[k] * s1[k];
        for (let k = 0; k < elems; k++) dst[k] = f;
      }
      const [, dtype, ditem] = dstOp;
      for (let k = 0; k < elems; k++) {
        if (dtype === 7) temps[ditem + k] = dst[k];
        else { outregs[ditem + k] = dst[k]; written?.add(ditem + k); }
      }
    }
  }

  /** 执行单像素；返回 oC0 RGBA（0..1）或 null=texkill。regs/tex/v0/o 由调用方复用 */
  execPixel(c: Float64Array, regs: Float64Array, tex: Float64Array,
    v0: Float64Array, o: Float64Array, t0x: number, t0y: number,
    samplers: Array<SM2Sampler | SM2SamplerOut | undefined>): [number, number, number, number] | null {
    tex[0] = t0x; tex[1] = t0y;
    regs.fill(0);
    o.fill(0);
    for (const ins of this.prog) {
      const dB = bindFile(ins.dstFile ?? 0, ins.dstReg ?? 0, regs, c, tex, v0, o);
      const dArr = dB.arr, dOff = dB.off;
      const m = ins.dstMask;
      const write = (v0v: number, v1v: number, v2v: number, v3v: number): void => {
        if (m & 1) dArr[dOff] = ins.dstSat ? sat(v0v) : v0v;
        if (m & 2) dArr[dOff + 1] = ins.dstSat ? sat(v1v) : v1v;
        if (m & 4) dArr[dOff + 2] = ins.dstSat ? sat(v2v) : v2v;
        if (m & 8) dArr[dOff + 3] = ins.dstSat ? sat(v3v) : v3v;
      };
      const S = (i: number, k: number): number => {
        const s = ins.srcs[i];
        if (s.imm) return s.imm[k];
        const b = bindFile(s.file!, s.reg ?? 0, regs, c, tex, v0, o);
        const v = b.arr[b.off + s.comps[k]];
        return s.neg ? -v : v;
      };
      switch (ins.op) {
        case 0x01: write(S(0, 0), S(0, 1), S(0, 2), S(0, 3)); break;
        case 0x02: write(S(0, 0) + S(1, 0), S(0, 1) + S(1, 1), S(0, 2) + S(1, 2), S(0, 3) + S(1, 3)); break;
        case 0x03: write(S(0, 0) - S(1, 0), S(0, 1) - S(1, 1), S(0, 2) - S(1, 2), S(0, 3) - S(1, 3)); break;
        case 0x04: write(S(0, 0) * S(1, 0) + S(2, 0), S(0, 1) * S(1, 1) + S(2, 1),
          S(0, 2) * S(1, 2) + S(2, 2), S(0, 3) * S(1, 3) + S(2, 3)); break;
        case 0x05: write(S(0, 0) * S(1, 0), S(0, 1) * S(1, 1), S(0, 2) * S(1, 2), S(0, 3) * S(1, 3)); break;
        case 0x06: write(1 / S(0, 0), 1 / S(0, 1), 1 / S(0, 2), 1 / S(0, 3)); break;
        case 0x07: write(1 / Math.sqrt(S(0, 0)), 1 / Math.sqrt(S(0, 1)), 1 / Math.sqrt(S(0, 2)), 1 / Math.sqrt(S(0, 3))); break;
        case 0x08: { const d = S(0, 0) * S(1, 0) + S(0, 1) * S(1, 1) + S(0, 2) * S(1, 2); write(d, d, d, d); break; }
        case 0x09: { const d = S(0, 0) * S(1, 0) + S(0, 1) * S(1, 1) + S(0, 2) * S(1, 2) + S(0, 3) * S(1, 3); write(d, d, d, d); break; }
        case 0x0A: write(Math.min(S(0, 0), S(1, 0)), Math.min(S(0, 1), S(1, 1)), Math.min(S(0, 2), S(1, 2)), Math.min(S(0, 3), S(1, 3))); break;
        case 0x0B: write(Math.max(S(0, 0), S(1, 0)), Math.max(S(0, 1), S(1, 1)), Math.max(S(0, 2), S(1, 2)), Math.max(S(0, 3), S(1, 3))); break;
        case 0x0C: write(S(0, 0) < S(1, 0) ? 1 : 0, S(0, 1) < S(1, 1) ? 1 : 0, S(0, 2) < S(1, 2) ? 1 : 0, S(0, 3) < S(1, 3) ? 1 : 0); break;
        case 0x0D: write(S(0, 0) >= S(1, 0) ? 1 : 0, S(0, 1) >= S(1, 1) ? 1 : 0, S(0, 2) >= S(1, 2) ? 1 : 0, S(0, 3) >= S(1, 3) ? 1 : 0); break;
        case 0x0E: write(2 ** S(0, 0), 2 ** S(0, 1), 2 ** S(0, 2), 2 ** S(0, 3)); break;
        case 0x0F: write(Math.log2(S(0, 0)), Math.log2(S(0, 1)), Math.log2(S(0, 2)), Math.log2(S(0, 3))); break;
        // LRP(d3d9 lrp - ps):dst = src0·src1 + (1−src0)·src2(src0=权重,src1=终点,
        // src2=起点;HLSL lerp(a,b,w) → lrp dst, w, b, a)。2026-08-20 Aurora 对拍
        // 定谳:曾实现为 src0·src2+(1−src0)·src1(与 cmp 操作数序混淆)——对拍
        // pass Aurora :3149(fxc 产物 lrp r1.y, r0.y, c5.w(=1), r0.x(=A) 只可能
        // 是 lerp(A,1,f1))不符,修正为规范序。影响面:lrp 族 12 pass
        // (ArmorAcid/Hades/HighContrastGlow/LivingRainbow/Loki/Mushroom/
        // ShiftingSands/Solar×2/Wisp/ForceField/RainbowTownSlime×2)染料烘焙向
        // 真字节码语义偏移;金标测试(ArmorColored/HallowBoss)不含 lrp,不受影响。
        case 0x12: write(S(0, 0) * S(1, 0) + (1 - S(0, 0)) * S(2, 0), S(0, 1) * S(1, 1) + (1 - S(0, 1)) * S(2, 1),
          S(0, 2) * S(1, 2) + (1 - S(0, 2)) * S(2, 2), S(0, 3) * S(1, 3) + (1 - S(0, 3)) * S(2, 3)); break;
        case 0x13: write(S(0, 0) - Math.floor(S(0, 0)), S(0, 1) - Math.floor(S(0, 1)), S(0, 2) - Math.floor(S(0, 2)), S(0, 3) - Math.floor(S(0, 3))); break;
        case 0x20: { const p = Math.pow(Math.abs(S(0, 0)), S(1, 0)); write(p, p, p, p); break; }
        case 0x21: write(S(0, 1) * S(1, 2) - S(0, 2) * S(1, 1), S(0, 2) * S(1, 0) - S(0, 0) * S(1, 2), S(0, 0) * S(1, 1) - S(0, 1) * S(1, 0), 0); break;
        case 0x23: write(Math.abs(S(0, 0)), Math.abs(S(0, 1)), Math.abs(S(0, 2)), Math.abs(S(0, 3))); break;
        case 0x24: {
          const l = Math.hypot(S(0, 0), S(0, 1), S(0, 2)) || 1;
          write(S(0, 0) / l, S(0, 1) / l, S(0, 2) / l, 0); break;
        }
        // sincos ps_2_0(MSDN "sincos - ps"):掩码 .x→dest.x=cos(V)、.y→dest.y=sin(V)、
        // .xy→x=cos/y=sin(ps_3_0 同序;src1/src2=D3DSINCOSCONST1/2 多项式展开系数,
        // 直接算 sin/cos 即精确值)。2026-08-24 r15 复核:曾写 sin→x/cos→y(互换),
        // 17 pass/22 site 波形相位 90° 翻转。
        case 0x25: write(Math.cos(S(0, 0)), Math.sin(S(0, 0)), S(0, 2), S(0, 3)); break;
        case 0x41: { // texkill：引用寄存器任一分量 < 0 → 丢弃
          if (S(0, 0) < 0 || S(0, 1) < 0 || S(0, 2) < 0) return null;
          break;
        }
        case 0x42: { // texld dst, coord(srcs[0]), sampler(srcs[1])
          // ★PR#1：双形态采样器（出参版零分配 / 传统返回元组）。判据 = 形参个数
          //   （out 版恒 3）；out 缓冲为实例域 sampOut，消费即止(见 SM2SamplerOut 注)。
          const smp = samplers[ins.srcs[1].reg ?? 0];
          const px = S(0, 0), py = S(0, 1);
          if (!smp) { write(0, 0, 0, 1); break; }
          if (smp.length === 3) {
            (smp as SM2SamplerOut)(px, py, this.sampOut);
            write(this.sampOut[0], this.sampOut[1], this.sampOut[2], this.sampOut[3]);
          } else {
            const r4 = (smp as SM2Sampler)(px, py);
            write(r4[0], r4[1], r4[2], r4[3]);
          }
          break;
        }
        case 0x58: write(S(0, 0) >= 0 ? S(1, 0) : S(2, 0), S(0, 1) >= 0 ? S(1, 1) : S(2, 1),
          S(0, 2) >= 0 ? S(1, 2) : S(2, 2), S(0, 3) >= 0 ? S(1, 3) : S(2, 3)); break;
        case 0x5A: { const d = S(0, 0) * S(1, 0) + S(0, 1) * S(1, 1) + S(2, 0); write(d, d, d, d); break; }
        default: break;
      }
    }
    return [sat(o[0]), sat(o[1]), sat(o[2]), sat(o[3])];
  }
}

function sat(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}


// ---------- pass 检索 ----------
const PASS_MAP = new Map<string, SM2Pass>();
for (const j of PASSES) PASS_MAP.set(j.pass, new SM2Pass(j));

export function getPass(name: string): SM2Pass | null {
  return PASS_MAP.get(name) ?? null;
}

export const passNames = (): string[] => [...PASS_MAP.keys()];

/**
 * 对 ImageData 整体执行 pass（染料烘焙主入口）。
 * uImageSize0/uSourceRect 未设置时按整图 (w,h)/(0,0,w,h) 补齐。
 * @param extraSamplers s1/s2 采样器（s0=本 ImageData 拷贝）
 */
export function runPassOnImageData(pass: SM2Pass, data: Uint8ClampedArray,
  w: number, h: number, uniforms: SM2Uniforms,
  extraSamplers: Array<SM2Sampler | SM2SamplerOut | undefined> = [],
  t0Rect?: { sx: number; sy: number; sheetW: number; sheetH: number }): void {
  const u = { ...uniforms };
  if (t0Rect) {
    // t0Rect 在场时三值必须同源（表尺寸/子矩形/UV 映射），强制对齐防调用方漂移
    u.uImageSize0 = [t0Rect.sheetW, t0Rect.sheetH];
    u.uSourceRect = [t0Rect.sx, t0Rect.sy, w, h];
  } else {
    if (!u.uImageSize0[0] && !u.uImageSize0[1]) u.uImageSize0 = [w, h];
    if (!u.uSourceRect[2] && !u.uSourceRect[3]) u.uSourceRect = [0, 0, w, h];
  }
  const c = pass.setupConstants(u);
  const regs = new Float64Array(32 * 4);
  const tex = new Float64Array(8 * 4);
  const v0 = new Float64Array(8);                  // v0/v1（v1 空闲）
  v0[0] = v0[1] = v0[2] = v0[3] = 1;
  const o = new Float64Array(4);
  const srcData = new Uint8ClampedArray(data);           // s0 采样源（防读写交叠）
  // s0 = 被染贴图。vanilla 中它是【整表纹理】、t0 是全表 UV；本仓烘焙图只有切片
  // → 采样前做表空间→切片空间反变换（派生坐标的偏移采样同样落在正确语义上）
  const s0: SM2SamplerOut = t0Rect
    ? (uu, vv, o4) => { sampleImageInto(srcData, w, h,
        (uu * t0Rect.sheetW - t0Rect.sx) / w, (vv * t0Rect.sheetH - t0Rect.sy) / h, false, o4); }
    : (uu, vv, o4) => { sampleImageInto(srcData, w, h, uu, vv, false, o4); };
  const samplers = [s0, ...extraSamplers];
  // t0 = 全表 UV（SpriteBatch 子矩形语义：(rect.X + u·rect.W)/texW）——
  // 渐变族按 t0×uImageSize0−uSourceRect.xy 取像素位，切片局部 UV 会错锚
  const t0of = (x: number, y: number): [number, number] => t0Rect
    ? [(t0Rect.sx + x + 0.5) / t0Rect.sheetW, (t0Rect.sy + y + 0.5) / t0Rect.sheetH]
    : [(x + 0.5) / w, (y + 0.5) / h];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [t0x, t0y] = t0of(x, y);
      const res = pass.execPixel(c, regs, tex, v0, o, t0x, t0y, samplers);
      if (!res) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; continue; }
      data[i] = res[0] * 255; data[i + 1] = res[1] * 255;
      data[i + 2] = res[2] * 255; data[i + 3] = res[3] * 255;
    }
  }
}

/** ImageData 双线性采样·出参版（PR#1 主路径）。
 * ★parity 纪律：运算树与历史实现【逐字同形】——半像素约定、clamp 三元链、wrap
 *   双模取整式、`|0` 截断、/255 除法、lp= p+(q-p)*t 的嵌套求值序一概不动；
 *   唯一改形 = 寻址模式分支自四角重复调用外提为一次选择(等价纯函数)。 */
const BIL_A = new Float64Array(4), BIL_B = new Float64Array(4);
const BIL_C = new Float64Array(4), BIL_D = new Float64Array(4);
export function sampleImageInto(data: Uint8ClampedArray, w: number, h: number,
  u: number, v: number, wrap: boolean, out: Float64Array): void {
  const x = u * w - 0.5, y = v * h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  // 角点直写四缓冲（原 px() 内联：地址公式逐字；返回数组→标量存储）
  const cornerInto = wrap
    ? (xx: number, yy: number, o4: Float64Array): void => {
        const sx = ((xx % w) + w) % w, sy = ((yy % h) + h) % h;
        const i = ((sy | 0) * w + (sx | 0)) * 4;
        o4[0] = data[i] / 255; o4[1] = data[i + 1] / 255; o4[2] = data[i + 2] / 255; o4[3] = data[i + 3] / 255;
      }
    : (xx: number, yy: number, o4: Float64Array): void => {
        const sx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
        const sy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
        const i = ((sy | 0) * w + (sx | 0)) * 4;
        o4[0] = data[i] / 255; o4[1] = data[i + 1] / 255; o4[2] = data[i + 2] / 255; o4[3] = data[i + 3] / 255;
      };
  cornerInto(x0, y0, BIL_A);
  cornerInto(x0 + 1, y0, BIL_B);
  cornerInto(x0, y0 + 1, BIL_C);
  cornerInto(x0 + 1, y0 + 1, BIL_D);
  for (let k = 0; k < 4; k++) {
    const p01 = BIL_A[k] + (BIL_B[k] - BIL_A[k]) * fx;   // 原 lp(a,b,fx)
    const p23 = BIL_C[k] + (BIL_D[k] - BIL_C[k]) * fx;   // 原 lp(cc,d,fx)
    out[k] = p01 + (p23 - p01) * fy;                     // 原 lp(p01,p23,fy)
  }
}
/** ImageData 双线性采样（传统元组版——签名冻结，出参委托） */
export function sampleImageData(data: Uint8ClampedArray, w: number, h: number,
  u: number, v: number, wrap: boolean): [number, number, number, number] {
  sampleImageInto(data, w, h, u, v, wrap, BIL_OUT);
  return [BIL_OUT[0], BIL_OUT[1], BIL_OUT[2], BIL_OUT[3]];
}
const BIL_OUT = new Float64Array(4);

