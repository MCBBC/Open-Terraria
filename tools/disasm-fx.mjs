// DX9 D3DX effect 二进制(.cso)反汇编器 —— Terraria PixelShader/ScreenShader/TileShader.cso。
// 容器格式 = XNA4 编译产物（MojoShader mojoshader_effects.c 1:1 解析,行号对照见注释）；
// shader 段 = DX9 SM2 字节码（d3d9types.h opcode 表 + CTAB 常量表结构）。
// 用法：node tools/disasm-fx.mjs <file.cso> [out.txt] [--only <Technique,...>]
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2] ?? '../terraria-assets/PixelShader.cso';
const outFile = process.argv[3] ?? '/tmp/fx-dump.txt';
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? new Set(process.argv[onlyIdx + 1].split(',')) : null;

const buf = readFileSync(file);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const u32 = (o) => dv.getUint32(o >>> 0, true);
const str = (o) => {           // readstring（mojoshader_effects.c:269）：u32 长度 + 内容（含 NUL）
  const len = u32(o);
  return len ? buf.toString('latin1', o + 4, o + 4 + len).replace(/\0.*$/s, '') : null;
};

// ---------- 容器解析（MOJOSHADER_parseEffect :976-1076）----------
let pos = 0;
const v0 = u32(0);
if (v0 === 0xBCF00BCF) {        // XNA4 前置头（:984）——u32@4 即第二版本 token 的绝对偏移
  pos = u32(4);
}
const magic = u32(pos);          // 0xFEFF0901
if (magic !== 0xFEFF0901) throw new Error(`not an effect: ${file} @${pos} magic=${magic.toString(16)}`);
const dataOff = u32(pos + 4);
const base = pos + 8;            // 字符串/值偏移基准
pos = base + dataOff;
const numParams = u32(pos), numTechs = u32(pos + 4), numObjects = u32(pos + 12);
pos += 16;
const objType = new Array(numObjects).fill(0);   // SYMTYPE：14=PIXELSHADER 15=VERTEXSHADER

// readvalue（:302）→ {type,class,name,elems, values[]|objects[]|samplerStates[]}
function readValue(typeOff, valOff) {
  const t = u32(base + typeOff);
  const cls = u32(base + typeOff + 4);
  const name = str(u32(base + typeOff + 8));
  const elems = u32(base + typeOff + 16);
  const out = { type: t, class: cls, name, elems, values: null, objects: null };
  const vp = base + valOff;      // 值偏移同以 base 为基准（readvalue valptr=base+valoffset）
  if (cls >= 1 && cls <= 3) {    // scalar/vector/matrix：[20]=columns [24]=rows
    out.columns = u32(base + typeOff + 20);
    out.rows = u32(base + typeOff + 24);
    const cnt = out.rows * (elems > 0 ? elems : 1);
    const vals = [];
    for (let i = 0; i < cnt; i++) {
      for (let j = 0; j < out.columns; j++) vals.push(dv.getFloat32(vp + ((out.columns * i + j) << 2), true));
    }
    out.values = vals;
  } else if (cls === 4) {        // OBJECT（:352）
    if (t >= 10 && t <= 14) {    // sampler：[val]=numstates + 每 state(stype,_,typeOff,valOff)
      let p = vp;                // p 已是绝对地址
      const n = u32(p); p += 4;
      const states = [];
      for (let i = 0; i < n; i++) {
        const stype = u32(p) & ~0xA0;
        const tOff = u32(p + 8), vOff = u32(p + 12);
        p += 16;
        const sv = readValue(tOff, vOff);
        states.push({ stype, ...sv });
        if (stype === 0 && sv.objects) sv.objects.forEach((oi) => { objType[oi] = t; });  // SAMP_TEXTURE
      }
      out.samplerStates = states;
    } else {                     // 非采样器：numobjects 个对象索引（:396-410）
      const n = elems > 0 ? elems : 1;
      const ids = [];
      for (let i = 0; i < n; i++) { const oi = u32(vp + (i << 2)); ids.push(oi); objType[oi] = t; }
      out.objects = ids;
    }
  }
  return out;
}

// params（:477）：typeOff,valOff,flags,numannos + annos×2
const params = [];
for (let i = 0; i < numParams; i++) {
  const typeOff = u32(pos), valOff = u32(pos + 4);
  const numAnnos = u32(pos + 12);
  pos += 16 + numAnnos * 8;
  params.push(readValue(typeOff, valOff));
}

// techniques（:612）→ passes（:578）→ states（:552）
const techs = [];
for (let i = 0; i < numTechs; i++) {
  const name = str(base + u32(pos));
  const numAnnos = u32(pos + 4), numPasses = u32(pos + 8);
  pos += 12 + numAnnos * 8;
  const passes = [];
  for (let p = 0; p < numPasses; p++) {
    const pName = str(base + u32(pos));
    const pAnnos = u32(pos + 4), numStates = u32(pos + 8);
    pos += 12 + pAnnos * 8;
    const states = [];
    for (let s = 0; s < numStates; s++) {
      const stype = u32(pos);
      const tOff = u32(pos + 8), vOff = u32(pos + 12);
      pos += 16;
      states.push({ stype, value: readValue(tOff, vOff) });
    }
    passes.push({ name: pName, states });
  }
  techs.push({ name, passes });
}

// objects：smallobjects(index,length,blob)（:677）+ largeobjects(tech,pass,_,state,type,length,blob)（:805）
const blobs = new Map();         // objectIndex → Buffer
const numSmall = u32(pos); const numLarge = u32(pos + 4);
pos += 8;
for (let i = 0; i < numSmall; i++) {
  const index = u32(pos), length = u32(pos + 4);
  pos += 8;
  blobs.set(index, buf.subarray(pos, pos + length));
  pos += length;
}
for (let i = 0; i < numLarge; i++) {
  const tech = u32(pos), pass = u32(pos + 4), state = u32(pos + 12);
  const length = u32(pos + 20);
  pos += 24;
  const st = tech !== 0xFFFFFFFF ? techs[tech]?.passes[pass]?.states[state] : null;
  const oi = st?.value.objects?.[0];
  if (oi !== undefined) blobs.set(oi, buf.subarray(pos, pos + length));
  pos += length;
}

// ---------- CTAB 常量表（mojoshader.c parse_constant_table :2291 1:1）----------
function parseCtab(blob) {
  // 定位 CTAB 注释段：opcode 0xFFFE，长度 bits[30:16]（token 数，含自身）
  const b = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  let p = 0;
  while (p + 4 <= blob.length) {
    const t = b.getUint32(p, true);
    if ((t & 0xFFFF) === 0xFFFE) {
      const size = (t >>> 16) & 0x7FFF;
      if (p + 8 <= blob.length && blob.toString('latin1', p + 4, p + 8) === 'CTAB') {
        const st = p + 8;                    // start = &tokens[2]（Size 字段处）——偏移基准
        const u = (o) => b.getUint32(p + o, true);
        const nConst = u(8 + 12);            // rel start：Constants@12（Size0/Creator4/Version8）
        const infoOff = u(8 + 16);           // ConstantInfo@16
        const syms = [];
        for (let i = 0; i < nConst; i++) {
          const e = p + 8 + infoOff + i * 20;            // CINFO 20B：name u32 + u16×4 + u32×2
          const nameOff = b.getUint32(e, true);
          const regSet = b.getUint16(e + 4, true);
          const regIndex = b.getUint16(e + 6, true);
          const regCount = b.getUint16(e + 8, true);
          const name = blob.toString('latin1', p + 8 + nameOff).split('\0')[0];
          syms.push({ name, regSet, regIndex, regCount });
        }
        return syms;
      }
      p += size * 4;
    } else {
      p += 4;
    }
  }
  return [];
}

// ---------- Preshader（PRES 注释段：CLIT 字面量 + PRSI 输出映射 + FXLC 指令 VM）----------
// 结构（mojoshader.c parse_preshader :2446-2800）：子注释 token（size=数据 token 数）
// 携带 CTAB/PRSI/CLIT/FXLC 四字符块。
const PSOP = {
  0x1000: 'mov', 0x1010: 'neg', 0x1030: 'rcp', 0x1040: 'frc', 0x1050: 'exp', 0x1060: 'log',
  0x1070: 'rsq', 0x1080: 'sin', 0x1090: 'cos', 0x10A0: 'asin', 0x10B0: 'acos', 0x10C0: 'atan',
  0x2000: 'min', 0x2010: 'max', 0x2020: 'lt', 0x2030: 'ge', 0x2040: 'add', 0x2050: 'mul',
  0x2060: 'atan2', 0x2080: 'div', 0x3000: 'cmp', 0x3010: 'movc', 0x5000: 'dot', 0x5020: 'noise',
  0xA000: 'min_s', 0xA010: 'max_s', 0xA020: 'lt_s', 0xA030: 'ge_s', 0xA040: 'add_s',
  0xA050: 'mul_s', 0xA060: 'atan2_s', 0xA080: 'div_s', 0xD000: 'dot_s', 0xD020: 'noise_s',
};
function parsePreshader(blob, presAt, presSizeTok) {
  const b = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const tu = (o) => b.getUint32(presAt + o, true);
  const lines = [];
  let p = 8;                              // 跳过 PRES 四字符 + version token（0x46580201）
  const end = 4 + presSizeTok * 4 - 4;
  const blocks = {};
  while (p + 4 <= end) {
    const t = tu(p);
    if ((t & 0xFFFF) !== 0xFFFE) break;   // 0xFFFF 子 EOS
    const size = (t >>> 16) & 0x7FFF;
    const id = blob.toString('latin1', presAt + p + 4, presAt + p + 8);
    if (size > 0) blocks[id] = { at: presAt + p + 4, size: size - 1 };   // 四字符在 comment token+4；内容 token=size−1
    p += 4 + size * 4;
  }
  if (!blocks.CLIT || !blocks.FXLC) return lines;
  const bu = (blk) => (o) => b.getUint32(blk.at + o, true);
  // CLIT：[fourcc][count][count 个 double]
  const clit = blocks.CLIT, cu = bu(clit);
  const litCount = cu(4);
  const lits = [];
  for (let i = 0; i < litCount; i++) lits.push(b.getFloat64(clit.at + 8 + i * 8, true));
  // preshader CTAB：符号→寄存器（INPUT item = regIndex*4+comp）
  let syms = [];
  if (blocks.CTAB) {
    const cb = blocks.CTAB, cbu = bu(cb);
    const nConst = cbu(4 + 12), infoOff = cbu(4 + 16);
    for (let i = 0; i < nConst; i++) {
      const e = 4 + infoOff + i * 20;
      const nameOff = cbu(e);
      const regIndex = b.getUint16(cb.at + e + 6, true);
      const regCount = b.getUint16(cb.at + e + 8, true);
      syms.push({
        name: blob.toString('latin1', cb.at + 4 + nameOff).split('\0')[0],
        regIndex, regCount,
      });
    }
  }
  const symOf = (item) => {
    for (const s of syms) {
      const base = s.regIndex * 4, cnt = s.regCount * 4;
      if (base <= item && base + cnt > item) return `${s.name}${s.regCount > 1 ? `[${Math.floor((item - base) / 4)}]` : '.' + 'xyzw'[item % 4]}`;
    }
    return `in${item}`;
  };
  // PRSI：tokens[7]=output_map_count，之后 (base,count) 对
  let outMap = [];
  if (blocks.PRSI) {
    const pb = blocks.PRSI, pu = bu(pb);
    const n = pu(7 * 4);
    for (let i = 0; i < n; i++) outMap.push([pu(8 * 4 + i * 8), pu(8 * 4 + i * 8 + 4)]);
  }
  const outOf = (item) => {
    for (const [base, cnt] of outMap) {
      if (base * 4 <= item && (base + cnt) * 4 > item) return `c${base + Math.floor((item - base * 4) / 4)}`;
    }
    return `out${item}`;
  };
  // FXLC：[fourcc][opcode_count] + 每指令（opcodetok, operandcount-1, 每 operand 3 token）
  const fx = blocks.FXLC, fu = bu(fx);
  let nInst = fu(4);
  let q = 8;
  while (nInst-- > 0 && q + 8 <= fx.size * 4) {
    const opTok = fu(q);
    const op = PSOP[(opTok >> 16) & 0xFFFF] ?? `psop0x${((opTok >> 16) & 0xFFFF).toString(16)}`;
    const elems = opTok & 0xFF;
    const nOps = fu(q + 4) + 1;
    q += 8;
    const parts = [];
    for (let i = 0; i < nOps; i++) {
      const numArrays = fu(q), type = fu(q + 4), item = fu(q + 8);
      q += 12 + numArrays * 8;
      const label = type === 1 ? `lit${item}(${lits[item]})`
        : type === 2 ? symOf(item)
          : type === 4 ? outOf(item)
            : type === 7 ? `t${item}` : `?${item}`;
      parts.push((i === 0 ? '' : ', ') + label);
    }
    lines.push(`    ps.${op}${elems ? `[${elems}]` : ''} ${parts.join('')}`);
  }
  if (lits.length) lines.push(`    // ps.literals: [${lits.map((x) => +x.toFixed(6)).join(', ')}]`);
  return lines;
}

// ---------- SM2 反汇编 ----------
const REGT = ['r', 'v', 'c', 't', 'rast', 'attr', 'o', 'oC', 'oDepth', '?', 's', 'c', 'c', 'c', 'cB', 'aL', 'f16'];  // mojoshader_internal.h RegisterType：10=SAMPLER
function regName(tok) {
  const type = ((tok >> 8) & 0x18) | ((tok >> 28) & 7);
  const num = tok & 0x7FF;
  const baseName = REGT[type] ?? `reg${type}`;
  if (type === 7) return `oC${num}`;
  if (type === 8) return 'oDepth';
  return `${baseName}${num}`;
}
function dstStr(tok) {
  const wm = (tok >> 16) & 0xF;
  const sat = ((tok >> 20) & 0xF) === 2 ? '_sat' : '';
  const mask = '.' + ['x', 'y', 'z', 'w'].filter((_, i) => wm & (1 << i)).join('');  // D3DSP_WRITEMASK_0=1<<16(.x)…_3=1<<19(.w)
  return regName(tok) + mask + sat;
}
const SWZ = ['x', 'y', 'z', 'w'];
function srcStr(tok) {
  const sw = (tok >> 16) & 0xFF;
  const s = [sw & 3, (sw >> 2) & 3, (sw >> 4) & 3, (sw >> 6) & 3];
  const sm = (tok >> 24) & 0xF;
  const mod = sm === 1 ? '-' : sm === 11 ? 'abs-' : sm === 0 ? '' : `m${sm}`;
  const uniq = s.every((c) => c === s[0]);
  return mod + regName(tok) + (uniq ? (s[0] === 0 ? '' : `.${SWZ[s[0]]}`) : `.${s.map((c) => SWZ[c]).join('')}`);
}
// opcode 表（d3d9types.h）：opcode → [name, operand token 数]
const OP = {
  0: ['nop', 0], 1: ['mov', 2], 2: ['add', 3], 3: ['sub', 3], 4: ['mad', 4], 5: ['mul', 3],
  6: ['rcp', 2], 7: ['rsq', 2], 8: ['dp3', 3], 9: ['dp4', 3], 10: ['min', 3], 11: ['max', 3],
  12: ['slt', 3], 13: ['sge', 3], 14: ['exp', 2], 15: ['log', 2], 18: ['lrp', 4], 19: ['frc', 2],
  31: ['dcl', 2], 32: ['pow', 3], 33: ['crs', 3], 35: ['abs', 2], 36: ['nrm', 2],
  37: ['sincos', 4], 40: ['if', 1], 41: ['ifc', 3], 42: ['break', 0], 43: ['breakc', 3],
  45: ['defb', 2], 46: ['defi', 5], 64: ['texcrd', 2], 65: ['texkill', 1], 66: ['texld', 3],   // ps_2_0 texld = opcode 0x42（实证 obj4）
  81: ['def', 5], 88: ['cmp', 4], 90: ['dp2add', 4], 93: ['texldd', 5], 95: ['texldl', 3],
  0xFFFD: ['phase', 0], 0xFFFE: ['comment', 0], 0xFFFF: ['end', 0],
};
function disasm(blob, syms) {
  const b = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const lines = [];
  const regSym = new Map();   // 'cN' → 参数名
  for (const s of syms) if (s.regSet === 0 || s.regSet === 2) {
    for (let r = s.regIndex; r < s.regIndex + s.regCount; r++) regSym.set(`c${r}`, s.name + (s.regCount > 1 ? `[${r - s.regIndex}]` : ''));
  }
  let p = 0;
  const verTok = b.getUint32(p, true); p += 4;
  const major = (verTok >> 8) & 0xFF, minor = verTok & 0xFF;
  lines.push(`    // ${((verTok >> 16) & 0xFFFF) === 0xFFFF ? 'ps' : 'vs'}_${major}_${minor}`);
  let maxP = blob.length;
  let presAt = -1, presSize = 0;
  while (p + 4 <= maxP) {
    const t = b.getUint32(p, true); p += 4;
    const op = t & 0xFFFF;
    if (op === 0xFFFE) {          // 注释段：size 字段=数据 DWORD 数（不含自身）
      if (p + 4 <= maxP && blob.toString('latin1', p, p + 4) === 'PRES') { presAt = p; presSize = (t >>> 16) & 0x7FFF; }
      p += ((t >>> 16) & 0x7FFF) * 4;
      continue;
    }
    if (op === 0xFFFF) { lines.push('    end'); break; }
    const e = OP[op];
    if (!e) { lines.push(`    ??? op=${op} raw=0x${t.toString(16)} @${p - 4}`); break; }
    const [name, nOps] = e;
    if (name === 'comment') { continue; }
    const ops = [];
    for (let i = 0; i < nOps; i++) { ops.push(b.getUint32(p, true)); p += 4; }
    if (name === 'dcl') {
      const info = ops[0];
      const itype = (info >> 28) & 7 | ((info >> 8) & 0x18);
      const texType = info & 0xFFFF;
      const tt = texType === 2 ? '2d' : texType === 3 ? 'cube' : texType === 4 ? 'volume' : texType === 1 ? '1d' : '';
      if (itype === 9) lines.push(`    dcl_${tt} ${regName(ops[1])}`);
      else if (itype === 1) lines.push(`    dcl v${ops[1] & 0x7FF}`);
      else if (itype === 3) lines.push(`    dcl t${ops[1] & 0x7FF}`);
      else lines.push(`    dcl_${itype} ${ops[1].toString(16)}`);
    } else if (name === 'def') {
      const f = [];
      for (let i = 0; i < 4; i++) f.push(b.getFloat32(p - 16 + i * 4, true));
      lines.push(`    def ${regName(ops[0])}, ${f.map((x) => x.toFixed(6)).join(', ')}`);
    } else if (name === 'defb') {
      lines.push(`    defb ${regName(ops[0])}, ${ops[1]}`);
    } else if (name === 'texld') {
      lines.push(`    texld ${dstStr(ops[0])}, ${srcStr(ops[1])}, ${regName(ops[2])}`);
    } else {
      const ctrl = op === 0x40 ? '' : '';
      const parts = ops.map((o, i) => (i === 0 && name !== 'texkill' ? dstStr(o) : srcStr(o)));
      lines.push(`    ${name}${ctrl} ${parts.join(', ')}`.trimEnd());
    }
  }
  // cN → 参数名注解
  const named = [...regSym.entries()].sort((a, z) => parseInt(a[0].slice(1)) - parseInt(z[0].slice(1)));
  if (named.length) lines.push(`    // symbols: ${named.map(([r, n]) => `${r}=${n}`).join(' ')}`);
  if (presAt >= 0) lines.push(...parsePreshader(blob, presAt, presSize));
  return lines.join('\n');
}

// ---------- JSON 导出（游戏侧 SM2 解释器消费：字节码级 1:1）----------
const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx >= 0) {
  const passesJson = [];
  const seenPass = new Set();
  for (const t of techs) {
    for (const pass of t.passes) {
      if (!pass.name || seenPass.has(pass.name)) continue;   // 重名 pass（ArmorPlaid×2）取首
      seenPass.add(pass.name);
      for (const s of pass.states) {
        const oi = s.value.objects?.[0];
        if (oi === undefined || (objType[oi] !== 15 && objType[oi] !== 16)) continue;
        const blob = blobs.get(oi);
        if (!blob) continue;
        // 抽取：指令 token 序列（到 end）+ CTAB 符号 + preshader（块原始 token）
        const b = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
        let p = 0;
        const verTok = b.getUint32(p, true); p += 4;
        if (((verTok >> 16) & 0xFFFF) !== 0xFFFF) continue;   // 仅像素着色器
        const tokens = [];
        let presTokens = null;
        while (p + 4 <= blob.length) {
          const tok = b.getUint32(p, true); p += 4;
          const op = tok & 0xFFFF;
          if (op === 0xFFFE) {
            const size = (tok >>> 16) & 0x7FFF;
            if (p + 4 <= blob.length && blob.toString('latin1', p, p + 4) === 'PRES') {
              presTokens = [];
              for (let i = 0; i < size; i++) { presTokens.push(b.getUint32(p + i * 4, true)); }
            }
            p += size * 4;
            continue;
          }
          tokens.push(tok);
          if (op === 0xFFFF) break;
        }
        // preshader 预解码：presTokens 重建字节缓冲后按字节解析（块布局同 parsePreshader）
        let pres = null;
        if (presTokens) {
          pres = { lits: [], syms: [], outMap: [], insts: [] };
          const pb = Buffer.alloc(presTokens.length * 4);
          presTokens.forEach((tk, i) => pb.writeUInt32LE(tk >>> 0, i * 4));
          const pu32 = (o) => pb.readUInt32LE(o);
          let q = 8;                       // PRES 四字符 + version token
          while (q + 8 <= pb.length) {
            const ct = pu32(q);
            if ((ct & 0xFFFF) !== 0xFFFE) break;
            const csize = (ct >>> 16) & 0x7FFF;
            const id = pb.toString('latin1', q + 4, q + 8);
            const ds = q + 8;              // 块内容起点（fourcc 后）
            if (id === 'CLIT') {          // 内容=[count][doubles]
              const n = pu32(ds);
              for (let i = 0; i < n; i++) pres.lits.push(pb.readDoubleLE(ds + 4 + i * 8));
            } else if (id === 'PRSI') {   // mojo tokens[7] 以 fourcc 为 [0] → 内容+24
              const n = pu32(ds + 24);
              for (let i = 0; i < n; i++) pres.outMap.push([pu32(ds + 28 + i * 8), pu32(ds + 32 + i * 8)]);
            } else if (id === 'CTAB') {   // 内容起点即 Size 字段（偏移基准）
              const st = ds;
              const nConst = pu32(st + 12), infoOff = pu32(st + 16);
              for (let i = 0; i < nConst; i++) {
                const e = st + infoOff + i * 20;          // CINFO 20B
                const nameOff = pu32(e);
                const regIndex = pb.readUInt16LE(e + 6);
                const regCount = pb.readUInt16LE(e + 8);
                let nm = '';
                for (let b = st + nameOff; b < pb.length && pb[b] !== 0; b++) nm += String.fromCharCode(pb[b]);
                pres.syms.push({ name: nm, regIndex, regCount });
              }
            } else if (id === 'FXLC') {   // 内容=[opcode_count][instrs]
              const nInst = pu32(ds);
              let r = ds + 4;
              for (let i = 0; i < nInst; i++) {
                const opTok = pu32(r);
                const nOps = pu32(r + 4) + 1;
                r += 8;
                const ops = [];
                for (let j = 0; j < nOps; j++) {
                  ops.push([pu32(r), pu32(r + 4), pu32(r + 8)]);
                  r += 12 + pu32(r) * 8;
                }
                pres.insts.push([opTok, ops]);
              }
            }
            q = ds + (csize - 1) * 4;      // 下一子注释（size 含 fourcc token）
          }
        }
        // def 常量内嵌为 token 序列即可；CTAB 符号给寄存器映射
        const syms = parseCtab(blob).map((s) => ({
          name: s.name, kind: s.regSet === 3 ? 'sampler' : 'const',
          reg: s.regSet === 3 ? `s${s.regIndex}` : `c${s.regIndex}`, count: s.regCount,
        }));
        passesJson.push({ pass: pass.name, obj: oi, tokens, presTokens, preshader: pres, symbols: syms });
      }
    }
  }
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ source: file.replace(/^.*\//, ''), passes: passesJson }));
  console.log(`json: ${passesJson.length} passes → ${process.argv[jsonIdx + 1]}`);
}
const out = [];
out.push(`== ${file}  params=${numParams} techs=${numTechs} objects=${numObjects} small=${numSmall} large=${numLarge}`);
out.push('-- effect params (uniforms):');
for (const p of params) {
  const v = p.values ? `[${p.values.map((x) => +x.toFixed(4)).join(', ')}]` : p.objects ? `→obj${p.objects}` : p.samplerStates ? 'sampler' : '';
  out.push(`  ${p.name ?? '?'} type=${p.type} class=${p.class}${v ? ' ' + v : ''}`);
}
for (const t of techs) {
  out.push(`\n== technique ${t.name} (${t.passes.length} passes)`);
  for (const pass of t.passes) {
    if (only && !only.has(pass.name)) continue;
    out.push(`  -- pass ${pass.name ?? ''}`);
    for (const s of pass.states) {
      const oi = s.value.objects?.[0];
      if (oi === undefined) continue;
      if (objType[oi] !== 15 && objType[oi] !== 16) continue;   // D3DXPT PIXELSHADER=15/VERTEXSHADER=16
      const blob = blobs.get(oi);
      if (!blob) { out.push(`    <missing blob obj${oi}>`); continue; }
      out.push(`    <${objType[oi] === 15 ? 'ps' : 'vs'} obj${oi} ${blob.length}B>`);
      const dumpIdx = process.argv.indexOf('--dump-obj');
      if (dumpIdx >= 0 && process.argv[dumpIdx + 1].split(',').includes(String(oi))) {
        writeFileSync(`/tmp/fx-obj${oi}.bin`, blob);
        out.push(`    (dumped /tmp/fx-obj${oi}.bin)`);
      }
      try {
        const syms = parseCtab(blob);
        out.push(disasm(blob, syms));
      } catch (e) { out.push(`    !! ${e.message}`); }
    }
  }
}
const text = out.join('\n');
writeFileSync(outFile, text);
console.log(`wrote ${outFile} (${text.length}B)`);
console.log(text.split('\n').slice(0, 40).join('\n'));
