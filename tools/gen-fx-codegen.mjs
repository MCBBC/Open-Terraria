#!/usr/bin/env node
// SM2 pass 构建期直线代码生成器（2026-09-01 PR#3，四方案评估 E 方案）。
//
// 读 src/data/fxPixelShader.json → 为每个 pass 生成 src/fx/gen/<pass>.gen.ts 的
// 专用像素函数（直线 JS，无 VM 分派/无 bindFile/无闭包重建），并产出 genIndex.gen.ts
// 注册表。parity 靠 tests/fx-codegen-parity.test.ts 双跑差分门机器证明（VM 为 oracle）。
//
// 纪律（逐条来自 D 报告 R1-R13 + A 报告数值陷阱清单）：
//  R2 dstMask 裁剪目标通道；R3 ★反别名铁律：targets 先全求值进临时量、末尾统一 store；
//  R4 _sat 挂 store 点；R5 neg=取值后单目负号(括号包裹)；R6 imm 直印(Object.is(-0) 特判)；
//  R7 广播族(dp3/dp2add/pow)单算一次；R8 sincos cos→x/sin→y(r15 定谳)；
//  R12 texld 双形态采样器适配下沉到运行期包装(normalizeSamplers)，生成体只见 out 版；
//  R13 oC0/oDepth 同槽语义保留。lrp/sincos/cmp/min/max 表达式与 SM2Effect switch
//  【逐字同形】(含结合次序——JS 左结合下文本即舍入序)。def 指令搬离循环：
//  生成前强制校验 A 报告四链不变量，违者 fail-hard。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const SRC = path.join(ROOT, 'src/data/fxPixelShader.json');
const OUT_DIR = path.join(ROOT, 'src/fx/gen');

const fx = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const OPS = { // d3d9types.h：opcode → 操作数 token 数（与 SM2Effect.decodeProgram 一致）
  0x00: 0, 0x01: 2, 0x02: 3, 0x03: 3, 0x04: 4, 0x05: 3, 0x06: 2, 0x07: 2,
  0x08: 3, 0x09: 3, 0x0A: 3, 0x0B: 3, 0x0C: 3, 0x0D: 3, 0x0E: 2, 0x0F: 2,
  0x12: 4, 0x13: 2, 0x1F: 2, 0x20: 3, 0x21: 3, 0x23: 2, 0x24: 2, 0x25: 4,
  0x41: 1, 0x42: 3, 0x51: 5, 0x58: 4, 0x5A: 4,
};
const FILEIDX = { 0: 0, 1: 1, 2: 2, 3: 3, 7: 4, 8: 4 };   // r/v/c/t/o(oC=oDepth 同槽)
const VARNAME = ['R', 'V', 'C', 'T', 'O'];

function fileOf(tok) { return ((tok >> 28) & 7) | ((tok >> 8) & 0x18); }
function regOf(tok) { return tok & 0x7FF; }
function u32ToF32(u) { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, u >>> 0, true); return new DataView(b).getFloat32(0, true); }

/** strict 解码：未知 opcode / 缺 END / 截断一律 throw（D 报告风险 1） */
function decodeStrict(tokens, passName) {
  const out = [];
  let i = 0, endSeen = false;
  while (i < tokens.length) {
    const tok = tokens[i++];
    const op = tok & 0xFFFF;
    if (op === 0xFFFF) { endSeen = true; break; }
    if (!(op in OPS)) throw new Error(`[${passName}] inst#${out.length} 未知 opcode 0x${tok.toString(16)}@${i - 1}`);
    if (op === 0x00) continue;                     // 布局占位
    const nOps = OPS[op];
    if (i + nOps > tokens.length) throw new Error(`[${passName}] inst#${out.length} token 截断`);
    const raw = tokens.slice(i, i + nOps); i += nOps;
    if (op === 0x51) {
      const vals = [0, 1, 2, 3].map((k) => u32ToF32(raw[1 + k]));
      out.push({ op: 0x01, dstMask: 0xF, dstSat: false,
        srcs: [{ comps: [0, 1, 2, 3], neg: false, imm: vals, fileIdx: -1, reg: 0 }],
        dstFileIdx: 2, dstReg: regOf(raw[0]), isDef: true });
      continue;
    }
    if (op === 0x1F) continue;
    const srcs = raw.slice(1).map((t) => {
      const ft = fileOf(t);
      if (ft === 10) return { comps: [(t >> 16) & 3, (t >> 18) & 3, (t >> 20) & 3, (t >> 22) & 3],
        neg: ((t >> 24) & 0xF) === 1, imm: null, fileIdx: -2 /* sampler 句柄槽 */, reg: regOf(t), isSampler: true };
      if (!(ft in FILEIDX)) throw new Error(`[${passName}] inst#${out.length} 意外寄存器文件(file=${ft},tok=0x${t.toString(16)})`);
      return { comps: [(t >> 16) & 3, (t >> 18) & 3, (t >> 20) & 3, (t >> 22) & 3],
        neg: ((t >> 24) & 0xF) === 1, imm: null, fileIdx: FILEIDX[ft], reg: regOf(t), isSampler: false };
    });
    out.push({
      op, dstMask: (raw[0] >> 16) & 0xF, dstSat: ((raw[0] >> 20) & 0xF) === 1, srcs,
      dstFileIdx: FILEIDX[fileOf(raw[0])] ?? -1, dstReg: regOf(raw[0]),
    });
  }
  if (!endSeen) throw new Error(`[${passName}] 缺 END token`);
  return out;
}

const numLit = (v) => Object.is(v, -0) ? '(-0)' : `(${String(v)})`;

function srcExpr(inst, oi, k) {
  const s = inst.srcs[oi];
  if (s.imm) {
    let e = numLit(s.imm[k]);
    return s.neg ? `(-(${e}))` : e;
  }
  if (s.fileIdx < 0) throw new Error('src 文件越界');
  const base = `${VARNAME[s.fileIdx]}[${s.reg * 4 + s.comps[k]}]`;
  return s.neg ? `(-${base})` : base;
}
const Sref = (inst, oi, k) => srcExpr(inst, oi, k);

/** 逐 opcode 发射【右值表达式串数组】（按 mask 目标通道）——文本与 VM switch case
 *  右侧逐字同形（含加法链左结合），只是把 S(i,k) 展开为寄存器读。 */
function rhsFor(op, inst, k) {
  const s = (oi, kk) => Sref(inst, oi, kk);
  switch (op) {
    case 0x01: return [s(0, k)];
    case 0x02: return [`${s(0, k)} + ${s(1, k)}`];
    case 0x03: return [`${s(0, k)} - ${s(1, k)}`];
    case 0x04: return [`${s(0, k)} * ${s(1, k)} + ${s(2, k)}`];
    case 0x05: return [`${s(0, k)} * ${s(1, k)}`];
    case 0x06: return [`1 / ${s(0, k)}`];
    case 0x07: return [`1 / Math.sqrt(${s(0, k)})`];
    case 0x0A: return [`Math.min(${s(0, k)}, ${s(1, k)})`];
    case 0x0B: return [`Math.max(${s(0, k)}, ${s(1, k)})`];
    case 0x0C: return [`(${s(0, k)} < ${s(1, k)} ? 1 : 0)`];
    case 0x0D: return [`(${s(0, k)} >= ${s(1, k)} ? 1 : 0)`];
    case 0x0E: return [`2 ** ${s(0, k)}`];
    case 0x0F: return [`Math.log2(${s(0, k)})`];
    case 0x12: return [`${s(0, k)} * ${s(1, k)} + (1 - ${s(0, k)}) * ${s(2, k)}`];
    case 0x13: return [`${s(0, k)} - Math.floor(${s(0, k)})`];
    case 0x23: return [`Math.abs(${s(0, k)})`];
    // 广播族：调用方保证只请求一次 lane 标量(见 emitInst)
    case 0x08: return null;                                   // dp3 专用
    case 0x09: return null;                                   // dp4 专用(库内 0 条)
    case 0x20: return [`Math.pow(Math.abs(${s(0, 0)}), ${s(1, 0)})`];
    case 0x24: return null;                                   // nrm(库内 0 条)
    case 0x21: return null;                                   // crs(库内 0 条)
    case 0x58: return [`${s(0, k)} >= 0 ? ${s(1, k)} : ${s(2, k)}`];
    case 0x5A: return null;                                   // dp2add 专用
    default: throw new Error(`未覆盖 opcode 0x${op.toString(16)}`);
  }
}

function emitInst(lines, inst, idx, passName) {
  const targets = [];
  for (let m = 0; m < 4; m++) if (inst.dstMask & (1 << m)) targets.push(m);
  if (!targets.length) return;
  const dstArr = VARNAME[inst.dstFileIdx];
  if (!dstArr || inst.dstFileIdx < 0) throw new Error(`[${passName}] inst#${idx} 意外目标文件`);
  const store = (lane, expr) => lines.push(`${dstArr}[${inst.dstReg * 4 + lane}] = ${inst.dstSat ? `sat(${expr})` : expr};`);

  switch (inst.op) {
    case 0x41: // texkill（库内 0 条，语义保留）
      lines.push(`if (${Sref(inst, 0, 0)} < 0 || ${Sref(inst, 0, 1)} < 0 || ${Sref(inst, 0, 2)} < 0) return null;`);
      return;
    case 0x42: {
      const sampIdx = inst.srcs[1].reg ?? 0;
      const pxv = Sref(inst, 0, 0), pyv = Sref(inst, 0, 1);
      // ★BJ239: SAM 槽由 SM2Effect.execPixel 归一化兜底(缺槽=noopFill,补齐到4),契约保证非
      // undefined——`!` 断言而非 `?.`(?. 在意外 undefined 时静默跳采样=偏离 VM write(0,0,0,1) 语义)。
      lines.push(`SAM[${sampIdx}]!(${pxv}, ${pyv}, sm2Scr);`);
      for (const lane of targets) store(lane, `sm2Scr[${lane}]`);
      return;
    }
    case 0x08: { // dp3：单算广播（文本与 VM 相同的左结合链）
      const d = `${Sref(inst, 0, 0)} * ${Sref(inst, 1, 0)} + ${Sref(inst, 0, 1)} * ${Sref(inst, 1, 1)} + ${Sref(inst, 0, 2)} * ${Sref(inst, 1, 2)}`;
      for (const lane of targets) store(lane, d);
      return;
    }
    case 0x09: {
      const d = `${Sref(inst, 0, 0)} * ${Sref(inst, 1, 0)} + ${Sref(inst, 0, 1)} * ${Sref(inst, 1, 1)} + ${Sref(inst, 0, 2)} * ${Sref(inst, 1, 2)} + ${Sref(inst, 0, 3)} * ${Sref(inst, 1, 3)}`;
      for (const lane of targets) store(lane, d);
      return;
    }
    case 0x5A: {
      const d = `${Sref(inst, 0, 0)} * ${Sref(inst, 1, 0)} + ${Sref(inst, 0, 1)} * ${Sref(inst, 1, 1)} + ${Sref(inst, 2, 0)}`;
      for (const lane of targets) store(lane, d);
      return;
    }
    case 0x20: { const p = `Math.pow(Math.abs(${Sref(inst, 0, 0)}), ${Sref(inst, 1, 0)})`; for (const lane of targets) store(lane, p); return; }
    case 0x25: { // sincos：cos→lane0、sin→lane1、z/w 直通（r15 定谳序）
      for (const lane of targets) {
        if (lane === 0) store(0, `Math.cos(${Sref(inst, 0, 0)})`);
        else if (lane === 1) store(1, `Math.sin(${Sref(inst, 0, 0)})`);
        else store(lane, Sref(inst, 0, lane));
      }
      return;
    }
    case 0x24: { // nrm（库内 0 条；l=hypot||1 与 VM 同式）
      const l = `(Math.hypot(${Sref(inst, 0, 0)}, ${Sref(inst, 0, 1)}, ${Sref(inst, 0, 2)}) || 1)`;
      for (const lane of targets) store(lane, lane === 3 ? '0' : `${Sref(inst, 0, lane)} / ${l}`);
      return;
    }
    case 0x21: { // crs（库内 0 条）
      const crs = (k) => `${Sref(inst, 0, (k + 1) % 3)} * ${Sref(inst, 1, (k + 2) % 3)} - ${Sref(inst, 0, (k + 2) % 3)} * ${Sref(inst, 1, (k + 1) % 3)}`;
      for (const lane of targets) store(lane, lane === 3 ? '0' : crs(lane));
      return;
    }
    default: break;
  }

  // 纯逐通道族：★R3 反别名——先全部求值进临时量再统一 store
  const temps = [];
  for (const lane of targets) {
    const v = rhsFor(inst.op, inst, lane);
    if (!v) throw new Error(`[${passName}] inst#${idx} op0x${inst.op.toString(16)} 广播型未走专用路径`);
    lines.push(`let tmp${idx}_${lane} = ${v};`);
    temps.push([lane, `tmp${idx}_${lane}`]);
  }
  for (const [lane, tv] of temps) store(lane, tv);
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
const entries = [];
for (const pj of fx.passes) {
  const insts = decodeStrict(pj.tokens, pj.pass);
  // def 搬离四链不变量(A 报告)：实指令不写 c、def 目标域与其余输入面不相交、def 全在前段
  const cDefRegs = new Set(insts.filter(i => i.isDef).map(i => i.dstReg));
  const realWritesC = insts.some(i => !i.isDef && i.dstFileIdx === 2);
  let firstReal = insts.findIndex(i => !i.isDef);
  const defsAfterReal = insts.some((i, j) => i.isDef && firstReal >= 0 && j > firstReal);
  // preshader outMap 写域(c 寄存器基址区间)
  const preOut = new Set();
  for (const [base, cnt] of pj.preshader?.outMap ?? []) for (let r = 0; r < cnt; r++) preOut.add(base + r);
  const clashPre = [...cDefRegs].some(r => preOut.has(r));
  const ctabC = new Set(pj.symbols.filter(s => s.kind === 'const').map(s => parseInt(s.reg.slice(1), 10)));
  const clashCtab = [...cDefRegs].some(r => ctabC.has(r));
  if (realWritesC || defsAfterReal || clashPre || clashCtab) {
    throw new Error(`[${pj.pass}] def 搬离不变量破坏(writesC=${realWritesC}, after=${defsAfterReal}, preClash=${clashPre}, ctabClash=${clashCtab})`);
  }
  const body = [];
  let sawKill = false;
  insts.forEach((ins, idx) => {
    if (ins.isDef) return;                          // 已由 setupConstants 装配,不在执行体
    const before = body.length;
    emitInst(body, ins, idx, pj.pass);
    if (body.length !== before) {
      body.splice(before, 0, `/* inst#${idx} op:0x${ins.op.toString(16).padStart(2, '0')} */`);
      if (body[body.length - 1] === 'return null;' ?? body.includes('return null;')) sawKill = sawKill;
    }
  });
  sawKill = body.some(l => l.trim() === 'return null;');
  const fnName = 'px_' + pj.pass.replace(/[^A-Za-z0-9]/g, '_');
  const header = [
    `/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=${path.basename(SRC)},`,
    ` * tokens=${pj.tokens.length}, 实指令=${insts.length - insts.filter(i => i.isDef).length},`,
    ` * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */`,
  ];
  const code = [
    ...header,
    `import { sat } from '../sm2Runtime';`,
    ``,
    `/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */`,
    `export function ${fnName}(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {`,
    `  R.fill(0); O.fill(0);`,
    ...(sawKill ? [] : []),
    ...body,
    `  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);`,
    `  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];`,
    `  return false;`,
    `}`,
    ``,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, `${fnName}.gen.ts`), code);
  entries.push({ name: pj.pass, fn: fnName, killable: sawKill });
}

const idxCode = [
  `/* 由 tools/gen-fx-codegen.mjs 生成——注册表,勿手编 */`,
  ...entries.map(e => `import { ${e.fn} } from './${e.fn}.gen';`),
  ``,
  `export interface GenEntry { px: unknown /* PxGenFn */; killable: boolean }`,
  `export const GEN_MAP: Record<string, GenEntry> = {`,
  ...entries.map(e => `  '${e.name}': { px: ${e.fn}, killable: ${e.killable} },`),
  `};`,
  ``,
].join('\n') + '\n';
fs.writeFileSync(path.join(OUT_DIR, 'genIndex.gen.ts'), idxCode);
console.log(`gen-fx-codegen: ${entries.length} passes emitted → ${OUT_DIR}`);
