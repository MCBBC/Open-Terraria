// @ts-nocheck
// SM2 字节码解释器 AssemblyScript 实现 —— WASM 管线试点第一刀(2026-10-03)。
// 移植源(唯一真值):src/fx/SM2Effect.ts 的 decodeProgram + execPixelVM(PR#3 前
// 逐指令 switch VM)+ sampleImageInto(双线性 clamp/wrap)——逐指令/逐表达式 1:1,
// 语句旁标注 JS 源行号锚点,审计按行对照。
//
// ★解码期「指针机」定型(性能,不改语义):SM2Effect 的 bindFile(file,reg) 在解码期
// 求值一次——每源操作数烘焙 (基址指针, swizzle 分量表, 取负位);寄存器文件地址在
// sm2Init 后恒定,解码期绑定=运行期绑定,语义等价。与 JS bindFile 的对应:
//   - 寄存器越界:JS Float64Array 越界读=undefined(算术面≡NaN)/写=静默丢弃
//     → 解码期源基址=NaN_CELL(读 NaN)/dst 地址=0(写丢弃),全算术面等价;
//   - oC0/oDepth(file 7/8):JS {arr:o,off:0} → dst/src 基址=oBase;
//   - def 立即数:imm 值存每程序 imm 区,src 基址直指(JS imm[k] 同值)。
// ★掩码死分量剪枝(语义保持):JS VM 逐指令算满 4 分量、write() 按 dstMask 舍弃——
//   被掩分量无观察点(寄存器保持清零初值,后续读=同值;f64 运算无副作用)
//   → 本实现只计算将被写入的分量,与 codegen 生成体同纪律(px_ForceField 生成体
//   即只算被写分量)。例外:texkill 恒读 src0 分量 0..2(判定面);标量广播族
//   dp3/dp4/dp2add/pow/nrm 读固定输入分量(点积不随掩码缩)。ForceField 实测
//   平均 1.5 写分量/指令(全量 4 的 37%)。
// ★语义纪律:
// - f64 全程;dp2add(0x5A)=真 x·x'+y·y'+add(与运行时 codegen px_*.gen.ts 一致;
//   现行 JS VM 0x5A 亦为真形——forcefield-gl.test.ts:106 注的"VM x²-only"系陈旧
//   登记,见 README 语义差清单)。
// - 已知语义差(不落在 ForceField 指令面,场值闸 maxd≤2/255 覆盖):nrm(0x24)
//   Math.hypot 替代式;sin/cos/pow/log2 wasm libm vs V8 可差 1 ulp;min/max ±0
//   记号(NaN 传播一致)。
// - 不移植:setupConstants/preshader(JS 装配,常量=输入,见 README ABI)。
//
// 指令块布局(header 16B + 读集寄存器表 32B + 96B/inst + 32B/inst imm 区):
//   +0   u32 instCount        +4 u32 modes(采样槽寻址位域,试点恒 0)
//   +8   u32 readSet(r 寄存器读集位图;每像素只清零被读寄存器=JS regs.fill(0) 等价——
//        未读寄存器内容无观察点)  +12 u32 readCount
//   +16  u8×32 读集寄存器号表;inst[i] = 块基 + 48 + i*96:
//     +0   u32 op
//     +4   u32 dstPack(mask bit0-3 | sat bit4)
//     +8   usize dstPtr(0=越界/全掩,写丢弃)
//     +16  usize src0Base(comp0 地址)   +24 u32 src0Comps(2bit×4 swizzle)
//     +32  usize src1Base               +40 u32 src1Comps
//     +48  usize src2Base               +56 u32 src2Comps
//     +64  u32 negBits(bit0/1/2 = src0/1/2 取负,JS s.neg ? -v : v)
//     +68  u32 sampler(texld src1.reg 预解;0xFF=非 texld)
//   imm 区:块基 + 48 + count*96 + i*32(4×f64;def 专用)
// 内存布局/ABI 总表见 src/wasm/README.md;ABI 版本 sm2Version()=1(era guard)。

// ---------------- 缓冲基址(线性内存;sm2Init 一次性分配) ----------------
let tokBuf: usize = 0;        // u32×tokCap   字节码 token 上传暂存
let constBuf: usize = 0;      // f64×256      常量库 c(JS setupConstants 产物直写)
let texBuf: usize = 0;        // u8×texCap    源贴图 RGBA(s0 采样源)
let outBuf: usize = 0;        // u8×outCap    产物 RGBA
let rBase: usize = 0;         // f64×128      r 寄存器(32×4,每像素清零=JS regs.fill(0))
let tBase: usize = 0;         // f64×32       t 寄存器(tex 坐标文件,8×4)
let vBase: usize = 0;         // f64×8        v0/v1(JS Float64Array(8) 同构)
let oBase: usize = 0;         // f64×4        oC0/oDepth 输出槽
let sampOutBuf: usize = 0;    // f64×4        texld 出参缓冲(JS sampOut 同构)
let bilA: usize = 0;          // f64×4        双线性四角缓冲(JS BIL_A..D 同构)
let bilB: usize = 0;
let bilC: usize = 0;
let bilD: usize = 0;
let nanCell: usize = 0;       // f64×1        越界寄存器读=NaN(JS undefined 算术面)
let texW: i32 = 0;
let texH: i32 = 0;
let tokCap: i32 = 0;
let texCap: i32 = 0;
let outCap: i32 = 0;
let inited: bool = false;
let progTable: usize = 0;     // usize×PROG_MAX 程序块指针表(句柄=index+1;0=空)
let curReadSet: u32 = 0;      // 解码期当前程序 r 读集位图(bindPtrDec 标记)
const PROG_MAX = 256;

/** ABI 版本(era guard:加载器断言==1,防陈旧 .wasm 与 TS ABI 错代) */
export function sm2Version(): u32 { return 1; }

/** 一次性初始化(幂等;容量固定不复分配——JS 侧视图持稳) */
export function sm2Init(tokBytes: i32, texBytes: i32, outBytes: i32): i32 {
  if (inited) return 1;
  if (tokBytes <= 0 || texBytes <= 0 || outBytes <= 0) return 0;
  tokBuf = heap.alloc(<usize>tokBytes);
  constBuf = heap.alloc(256 * 8);
  texBuf = heap.alloc(<usize>texBytes);
  outBuf = heap.alloc(<usize>outBytes);
  rBase = heap.alloc(128 * 8);
  tBase = heap.alloc(32 * 8);
  vBase = heap.alloc(8 * 8);
  oBase = heap.alloc(4 * 8);
  sampOutBuf = heap.alloc(4 * 8);
  bilA = heap.alloc(4 * 8);
  bilB = heap.alloc(4 * 8);
  bilC = heap.alloc(4 * 8);
  bilD = heap.alloc(4 * 8);
  nanCell = heap.alloc(8);
  store<f64>(nanCell, NaN);
  progTable = heap.alloc(PROG_MAX * 8);
  memory.fill(progTable, 0, PROG_MAX * 8);      // heap.alloc 不清零:句柄表显式清零
  tokCap = tokBytes; texCap = texBytes; outCap = outBytes;
  inited = true;
  return 1;
}

export function sm2TokenBuf(): usize { return tokBuf; }
export function sm2ConstBuf(): usize { return constBuf; }
export function sm2TexBuf(): usize { return texBuf; }
export function sm2OutBuf(): usize { return outBuf; }
export function sm2Caps(): u64 { return (<u64>tokCap << 40) | (<u64>texCap << 20) | <u64>outCap; }

// ---------------- 解码辅助(SM2Effect.ts:116-121/175-180 移植) ----------------
/** 寄存器文件解码(mojoshader_internal.h RegisterType) */
function fileOf(tok: u32): i32 {
  return <i32>(((tok >> 28) & 7) | ((tok >> 8) & 0x18));
}
function regOf(tok: u32): i32 {
  return <i32>(tok & 0x7FF);
}
/** def cN, f0..f3 立即数:u32 位型→f32→f64(SM2Effect.ts:175-180) */
function u32ToF32(u: u32): f64 {
  return <f64>f32.reinterpret_i32(<i32>u);
}
/** token 读取;越界补 0(JS slice 短数组 undefined→位运算 0 的等价复刻) */
function tokAt(p: usize, i: i32, len: i32): u32 {
  if (i >= len) return 0;
  return load<u32>(p + (<usize>i << 2));
}
/** 操作数 token 数(JS OPS 表逐字;未知 → -1) */
function opNops(op: u32): i32 {
  if (op == 0x00) return 0;
  if (op == 0x01 || op == 0x06 || op == 0x07 || op == 0x0E || op == 0x0F || op == 0x13 || op == 0x23 || op == 0x24) return 2;
  if (op == 0x02 || op == 0x03 || op == 0x05 || op == 0x08 || op == 0x09 || op == 0x0A || op == 0x0B || op == 0x0C || op == 0x0D
    || op == 0x20 || op == 0x21) return 3;
  if (op == 0x04 || op == 0x12 || op == 0x25 || op == 0x58 || op == 0x5A) return 4;
  if (op == 0x1F) return 2;
  if (op == 0x41) return 1;
  if (op == 0x42) return 3;
  if (op == 0x51) return 5;
  return -1;
}

/** 解码期 bindFile(SM2Effect.ts:124-134)→ 分量 0 的 f64 地址;越界=NaN_CELL。
 *  寄存器文件容量:r=32×4、v=2×4、c=64×4、t=8×4(JS 数组尺寸同源)。 */
function bindPtrDec(file: i32, reg: i32): usize {
  // r 读集标记(默认支含 file 0;src 专用——dst 走 bindDstDec 不计)
  if (file == 2) return reg >= 0 && reg < 64 ? constBuf + <usize>(reg << 5) : nanCell;
  if (file == 0) {
    if (reg >= 0 && reg < 32) {
      curReadSet |= 1 << reg;
      return rBase + <usize>(reg << 5);
    }
    return nanCell;
  }
  if (file == 1) return reg >= 0 && reg < 2 ? vBase + <usize>(reg << 5) : nanCell;
  if (file == 3) return reg >= 0 && reg < 8 ? tBase + <usize>(reg << 5) : nanCell;
  if (file == 7 || file == 8) return oBase;      // oC0/oDepth → 输出槽(JS off=0 恒)
  if (reg >= 0 && reg < 32) {                    // JS default=r
    curReadSet |= 1 << reg;
    return rBase + <usize>(reg << 5);
  }
  return nanCell;
}

/** 解码期 dst 定位:越界=0(写丢弃;JS Float64Array 越界写静默丢) */
function bindDstDec(file: i32, reg: i32): usize {
  if (file == 7 || file == 8) return oBase;
  if (file == 2) return reg >= 0 && reg < 64 ? constBuf + <usize>(reg << 5) : 0;
  return reg >= 0 && reg < 32 ? rBase + <usize>(reg << 5) : 0;   // file 0 与 default=r
}

/** 源操作数解码入指令块(JS:156-161 + S():418-424 的寻址预烘焙):
 *  烘焙 (基址, swizzle, 取负) 三元组;读式=load<f64>(base+((comps>>k*2)&3)*8)。 */
function decodeSrc(ip: usize, baseOff: usize, compsOff: usize, srcIdx: u32, tok: u32): void {
  const comps = ((tok >> 16) & 3) | (((tok >> 18) & 3) << 2) | (((tok >> 20) & 3) << 4) | (((tok >> 22) & 3) << 6);
  store<usize>(ip + baseOff, bindPtrDec(fileOf(tok), regOf(tok)));
  store<u32>(ip + compsOff, comps);
  if (((tok >> 24) & 0xF) == 1) {                // neg(JS s.neg ? -v : v)
    store<u32>(ip + 64, load<u32>(ip + 64) | (1 << srcIdx));
  }
}

/** 程序上传:token 暂存区(需先经 sm2TokenBuf() 直写)→ 解码缓存;返回句柄(≥1),0=拒。
 *  两遍扫描:先数指令数(JS decodeProgram 循环同构,含未知 opcode 截断/0xFFFF 终止),
 *  再落指令块。 */
export function sm2UploadProgram(tokLen: i32, modes: u32): u32 {
  if (!inited) return 0;
  if (tokLen <= 0 || tokLen > tokCap) return 0;
  // pass1:指令数(JS:136-173 循环骨架同构)
  let count: i32 = 0;
  let i: i32 = 0;
  while (i < tokLen) {
    const tok = tokAt(tokBuf, i, tokLen);
    i++;
    const op = tok & 0xFFFF;
    if (op == 0xFFFF) break;
    const nOps = opNops(op);
    if (nOps < 0) break;
    i += nOps;
    if (op == 0x1F) continue;                     // dcl:跳过(JS:155)
    count++;
  }
  const block = heap.alloc(48 + <usize>count * 96 + <usize>count * 32);
  const immArea = block + 48 + <usize>count * 96;
  curReadSet = 0;
  store<u32>(block, <u32>count);
  store<u32>(block + 4, modes);
  // pass2:落指令块
  let ip = block + 48;
  let instIdx: i32 = 0;
  i = 0;
  while (i < tokLen) {
    const tok = tokAt(tokBuf, i, tokLen);
    i++;
    const op = tok & 0xFFFF;
    if (op == 0xFFFF) break;
    const nOps = opNops(op);
    if (nOps < 0) break;
    const r0 = tokAt(tokBuf, i, tokLen);
    const r1 = tokAt(tokBuf, i + 1, tokLen);
    const r2 = tokAt(tokBuf, i + 2, tokLen);
    const r3 = tokAt(tokBuf, i + 3, tokLen);
    const r4 = tokAt(tokBuf, i + 4, tokLen);
    i += nOps;
    if (op == 0x1F) continue;
    if (op == 0x51) {
      // def cN, f0..f3 → 立即数 mov(JS:146-153:op=0x01,dstMask=0xF,dstSat=false
      // 固定,src={comps:[0,1,2,3],neg:false,imm:vals,file:-1})
      store<u32>(ip, 0x01);
      store<u32>(ip + 4, 0xF);
      store<usize>(ip + 8, bindDstDec(fileOf(r0), regOf(r0)));
      const imm = immArea + <usize>instIdx * 32;
      store<f64>(imm,      u32ToF32(r1));
      store<f64>(imm + 8,  u32ToF32(r2));
      store<f64>(imm + 16, u32ToF32(r3));
      store<f64>(imm + 24, u32ToF32(r4));
      store<usize>(ip + 16, imm);
      store<u32>(ip + 24, 0xE4);                  // comps=[0,1,2,3] → 0|1<<2|2<<4|3<<6
      store<usize>(ip + 32, nanCell);             // src1/src2 恒不被读(op0x01 只读 src0)
      store<u32>(ip + 40, 0);
      store<usize>(ip + 48, nanCell);
      store<u32>(ip + 56, 0);
      store<u32>(ip + 64, 0);
      store<u32>(ip + 68, 0xFF);
    } else {
      // dst(JS:166-169;_sat 判据 d3d9types.h:513-515=(tok>>20)&0xF==1)。
      // ★死指令标记:全掩(m==0)或越界 dst(dp==0)→ op=0(运行期 default 跳过)——
      //   JS 全量计算后 write() 全舍弃,无观察点,语义等价。
      const maskBits = <i32>((r0 >> 16) & 0xF);
      const dPtr = bindDstDec(fileOf(r0), regOf(r0));
      store<u32>(ip, (maskBits == 0 || dPtr == 0) ? 0 : op);
      store<u32>(ip + 4, maskBits | ((((r0 >> 20) & 0xF) == 1) ? 16 : 0));
      store<usize>(ip + 8, dPtr);
      store<u32>(ip + 64, 0);
      decodeSrc(ip, 16, 24, 0, r1);                               // src0
      if (nOps >= 3) decodeSrc(ip, 32, 40, 1, r2);                // src1
      else { store<usize>(ip + 32, nanCell); store<u32>(ip + 40, 0); }
      if (nOps >= 4) decodeSrc(ip, 48, 56, 2, r3);                // src2
      else { store<usize>(ip + 48, nanCell); store<u32>(ip + 56, 0); }
      // texld 采样器号(JS:472 samplers[srcs[1].reg])预解;非 texld=0xFF
      store<u32>(ip + 68, op == 0x42 ? <u32>regOf(r2) : 0xFF);
    }
    ip += 96;
    instIdx++;
  }
  // 读集寄存器号表落块
  let rc: i32 = 0;
  for (let reg = 0; reg < 32; reg++) {
    if ((curReadSet & (1 << reg)) != 0) {
      store<u8>(block + 16 + <usize>rc, <u8>reg);
      rc++;
    }
  }
  store<u32>(block + 8, curReadSet);
  store<u32>(block + 12, <u32>rc);
  // 登记句柄(1-based;0=失败哨兵)
  for (let h = 0; h < PROG_MAX; h++) {
    if (load<usize>(progTable + <usize>(h << 3)) == 0) {
      store<usize>(progTable + <usize>(h << 3), block);
      return <u32>(h + 1);
    }
  }
  return 0;
}

// ---------------- 像素循环(SM2Effect.ts:403-491 execPixelVM 同构) ----------------
/** sat(sm2Runtime.ts:4-6 逐字;NaN 两比较皆 false → 原样透传) */
function sat(x: f64): f64 {
  return x < 0.0 ? 0.0 : x > 1.0 ? 1.0 : x;
}
/** 源分量读(JS S(i,k)=418-424:地址已烘焙,swizzle+取负在此) */
@inline function srck(base: usize, comps: u32, k: i32, neg: bool): f64 {
  const v = load<f64>(base + <usize>(((comps >> (k << 1)) & 3) << 3));
  return neg ? -v : v;
}
/** dst 单分量写(JS write():412-417 的掩码+sat 分量切片) */
@inline function wrk(dp: usize, k: i32, doSat: bool, v: f64): void {
  store<f64>(dp + <usize>(k << 3), doSat ? sat(v) : v);
}

/** execPixelVM 主体(单像素)。返回 false=texkill 命中(JS:466 return null)。
 *  ★掩码死分量剪枝:只算将被写入的分量(见头注);m==0/dp==0 整指令跳过
 *  (JS 全量计算后 write() 全舍弃,无观察点)。 */
function execPixel(prog: usize, t0x: f64, t0y: f64): bool {
  memory.fill(rBase, 0, 128 * 8);                 // regs.fill(0)(JS:406)
  memory.fill(oBase, 0, 4 * 8);                   // o.fill(0)(JS:407)
  store<f64>(tBase, t0x);                         // tex[0]=t0x(JS:390)
  store<f64>(tBase + 8, t0y);
  const count = <i32>load<u32>(prog);
  // r 清零=仅读集寄存器(JS regs.fill(0) 等价:未读寄存器内容无观察点)
  const rc = <i32>load<u32>(prog + 12);
  for (let ri = 0; ri < rc; ri++) {
    const p = rBase + <usize>(load<u8>(prog + 16 + ri) << 5);
    store<f64>(p, 0); store<f64>(p + 8, 0); store<f64>(p + 16, 0); store<f64>(p + 24, 0);
  }
  let ip = prog + 48;
  for (let ii = 0; ii < count; ii++, ip += 96) {
    const op = load<u32>(ip);
    if (op == 0x41) {                             // texkill:判定面恒读 0..2(JS:465-468)
      const n0 = (load<u32>(ip + 64) & 1) != 0;
      const b = load<usize>(ip + 16), c = load<u32>(ip + 24);
      if (srck(b, c, 0, n0) < 0.0 || srck(b, c, 1, n0) < 0.0 || srck(b, c, 2, n0) < 0.0) return false;
      continue;
    }
    const pack = load<u32>(ip + 4);
    const m = <i32>(pack & 15);
    if (m == 0) continue;                         // 全掩:无写无观察点(JS 全算后全舍)
    const dp = load<usize>(ip + 8);
    if (dp == 0) continue;                        // 越界 dst:写丢弃(JS Float64Array 越界写)
    const doSat = (pack & 16) != 0;
    const nb = load<u32>(ip + 64);
    switch (op) {
      case 0x01: {                                // mov
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b, c, 0, n0));
        if (m & 2) wrk(dp, 1, doSat, srck(b, c, 1, n0));
        if (m & 4) wrk(dp, 2, doSat, srck(b, c, 2, n0));
        if (m & 8) wrk(dp, 3, doSat, srck(b, c, 3, n0));
        break;
      }
      case 0x02: {                                // add
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b0, c0, 0, n0) + srck(b1, c1, 0, n1));
        if (m & 2) wrk(dp, 1, doSat, srck(b0, c0, 1, n0) + srck(b1, c1, 1, n1));
        if (m & 4) wrk(dp, 2, doSat, srck(b0, c0, 2, n0) + srck(b1, c1, 2, n1));
        if (m & 8) wrk(dp, 3, doSat, srck(b0, c0, 3, n0) + srck(b1, c1, 3, n1));
        break;
      }
      case 0x03: {                                // sub
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b0, c0, 0, n0) - srck(b1, c1, 0, n1));
        if (m & 2) wrk(dp, 1, doSat, srck(b0, c0, 1, n0) - srck(b1, c1, 1, n1));
        if (m & 4) wrk(dp, 2, doSat, srck(b0, c0, 2, n0) - srck(b1, c1, 2, n1));
        if (m & 8) wrk(dp, 3, doSat, srck(b0, c0, 3, n0) - srck(b1, c1, 3, n1));
        break;
      }
      case 0x04: {                                // mad
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        const b2 = load<usize>(ip + 48), c2 = load<u32>(ip + 56), n2 = (nb & 4) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b0, c0, 0, n0) * srck(b1, c1, 0, n1) + srck(b2, c2, 0, n2));
        if (m & 2) wrk(dp, 1, doSat, srck(b0, c0, 1, n0) * srck(b1, c1, 1, n1) + srck(b2, c2, 1, n2));
        if (m & 4) wrk(dp, 2, doSat, srck(b0, c0, 2, n0) * srck(b1, c1, 2, n1) + srck(b2, c2, 2, n2));
        if (m & 8) wrk(dp, 3, doSat, srck(b0, c0, 3, n0) * srck(b1, c1, 3, n1) + srck(b2, c2, 3, n2));
        break;
      }
      case 0x05: {                                // mul
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b0, c0, 0, n0) * srck(b1, c1, 0, n1));
        if (m & 2) wrk(dp, 1, doSat, srck(b0, c0, 1, n0) * srck(b1, c1, 1, n1));
        if (m & 4) wrk(dp, 2, doSat, srck(b0, c0, 2, n0) * srck(b1, c1, 2, n1));
        if (m & 8) wrk(dp, 3, doSat, srck(b0, c0, 3, n0) * srck(b1, c1, 3, n1));
        break;
      }
      case 0x06: {                                // rcp
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        if (m & 1) wrk(dp, 0, doSat, 1.0 / srck(b, c, 0, n0));
        if (m & 2) wrk(dp, 1, doSat, 1.0 / srck(b, c, 1, n0));
        if (m & 4) wrk(dp, 2, doSat, 1.0 / srck(b, c, 2, n0));
        if (m & 8) wrk(dp, 3, doSat, 1.0 / srck(b, c, 3, n0));
        break;
      }
      case 0x07: {                                // rsq
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        if (m & 1) wrk(dp, 0, doSat, 1.0 / Math.sqrt(srck(b, c, 0, n0)));
        if (m & 2) wrk(dp, 1, doSat, 1.0 / Math.sqrt(srck(b, c, 1, n0)));
        if (m & 4) wrk(dp, 2, doSat, 1.0 / Math.sqrt(srck(b, c, 2, n0)));
        if (m & 8) wrk(dp, 3, doSat, 1.0 / Math.sqrt(srck(b, c, 3, n0)));
        break;
      }
      case 0x08: {                                // dp3:标量广播(JS:434;点积读固定 0..2)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        const d = srck(b0, c0, 0, n0) * srck(b1, c1, 0, n1)
          + srck(b0, c0, 1, n0) * srck(b1, c1, 1, n1)
          + srck(b0, c0, 2, n0) * srck(b1, c1, 2, n1);
        if (m & 1) wrk(dp, 0, doSat, d);
        if (m & 2) wrk(dp, 1, doSat, d);
        if (m & 4) wrk(dp, 2, doSat, d);
        if (m & 8) wrk(dp, 3, doSat, d);
        break;
      }
      case 0x09: {                                // dp4(JS:435;读 0..3)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        const d = srck(b0, c0, 0, n0) * srck(b1, c1, 0, n1)
          + srck(b0, c0, 1, n0) * srck(b1, c1, 1, n1)
          + srck(b0, c0, 2, n0) * srck(b1, c1, 2, n1)
          + srck(b0, c0, 3, n0) * srck(b1, c1, 3, n1);
        if (m & 1) wrk(dp, 0, doSat, d);
        if (m & 2) wrk(dp, 1, doSat, d);
        if (m & 4) wrk(dp, 2, doSat, d);
        if (m & 8) wrk(dp, 3, doSat, d);
        break;
      }
      case 0x0A: {                                // min(README 语义差③:±0 记号)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        if (m & 1) wrk(dp, 0, doSat, Math.min(srck(b0, c0, 0, n0), srck(b1, c1, 0, n1)));
        if (m & 2) wrk(dp, 1, doSat, Math.min(srck(b0, c0, 1, n0), srck(b1, c1, 1, n1)));
        if (m & 4) wrk(dp, 2, doSat, Math.min(srck(b0, c0, 2, n0), srck(b1, c1, 2, n1)));
        if (m & 8) wrk(dp, 3, doSat, Math.min(srck(b0, c0, 3, n0), srck(b1, c1, 3, n1)));
        break;
      }
      case 0x0B: {                                // max(README 语义差③)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        if (m & 1) wrk(dp, 0, doSat, Math.max(srck(b0, c0, 0, n0), srck(b1, c1, 0, n1)));
        if (m & 2) wrk(dp, 1, doSat, Math.max(srck(b0, c0, 1, n0), srck(b1, c1, 1, n1)));
        if (m & 4) wrk(dp, 2, doSat, Math.max(srck(b0, c0, 2, n0), srck(b1, c1, 2, n1)));
        if (m & 8) wrk(dp, 3, doSat, Math.max(srck(b0, c0, 3, n0), srck(b1, c1, 3, n1)));
        break;
      }
      case 0x0C: {                                // lt
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b0, c0, 0, n0) < srck(b1, c1, 0, n1) ? 1.0 : 0.0);
        if (m & 2) wrk(dp, 1, doSat, srck(b0, c0, 1, n0) < srck(b1, c1, 1, n1) ? 1.0 : 0.0);
        if (m & 4) wrk(dp, 2, doSat, srck(b0, c0, 2, n0) < srck(b1, c1, 2, n1) ? 1.0 : 0.0);
        if (m & 8) wrk(dp, 3, doSat, srck(b0, c0, 3, n0) < srck(b1, c1, 3, n1) ? 1.0 : 0.0);
        break;
      }
      case 0x0D: {                                // ge
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b0, c0, 0, n0) >= srck(b1, c1, 0, n1) ? 1.0 : 0.0);
        if (m & 2) wrk(dp, 1, doSat, srck(b0, c0, 1, n0) >= srck(b1, c1, 1, n1) ? 1.0 : 0.0);
        if (m & 4) wrk(dp, 2, doSat, srck(b0, c0, 2, n0) >= srck(b1, c1, 2, n1) ? 1.0 : 0.0);
        if (m & 8) wrk(dp, 3, doSat, srck(b0, c0, 3, n0) >= srck(b1, c1, 3, n1) ? 1.0 : 0.0);
        break;
      }
      case 0x0E: {                                // exp:2^x(JS 2 ** x)
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        if (m & 1) wrk(dp, 0, doSat, Math.pow(2.0, srck(b, c, 0, n0)));
        if (m & 2) wrk(dp, 1, doSat, Math.pow(2.0, srck(b, c, 1, n0)));
        if (m & 4) wrk(dp, 2, doSat, Math.pow(2.0, srck(b, c, 2, n0)));
        if (m & 8) wrk(dp, 3, doSat, Math.pow(2.0, srck(b, c, 3, n0)));
        break;
      }
      case 0x0F: {                                // log:log2(x)
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        if (m & 1) wrk(dp, 0, doSat, Math.log2(srck(b, c, 0, n0)));
        if (m & 2) wrk(dp, 1, doSat, Math.log2(srck(b, c, 1, n0)));
        if (m & 4) wrk(dp, 2, doSat, Math.log2(srck(b, c, 2, n0)));
        if (m & 8) wrk(dp, 3, doSat, Math.log2(srck(b, c, 3, n0)));
        break;
      }
      case 0x12: {                                // lrp:dst=src0·src1+(1−src0)·src2
        // (JS:450-451 规范序;Aurora 对拍定谳注同源)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        const b2 = load<usize>(ip + 48), c2 = load<u32>(ip + 56), n2 = (nb & 4) != 0;
        if (m & 1) { const a = srck(b0, c0, 0, n0); wrk(dp, 0, doSat, a * srck(b1, c1, 0, n1) + (1.0 - a) * srck(b2, c2, 0, n2)); }
        if (m & 2) { const a = srck(b0, c0, 1, n0); wrk(dp, 1, doSat, a * srck(b1, c1, 1, n1) + (1.0 - a) * srck(b2, c2, 1, n2)); }
        if (m & 4) { const a = srck(b0, c0, 2, n0); wrk(dp, 2, doSat, a * srck(b1, c1, 2, n1) + (1.0 - a) * srck(b2, c2, 2, n2)); }
        if (m & 8) { const a = srck(b0, c0, 3, n0); wrk(dp, 3, doSat, a * srck(b1, c1, 3, n1) + (1.0 - a) * srck(b2, c2, 3, n2)); }
        break;
      }
      case 0x13: {                                // frc
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        if (m & 1) { const a = srck(b, c, 0, n0); wrk(dp, 0, doSat, a - Math.floor(a)); }
        if (m & 2) { const a = srck(b, c, 1, n0); wrk(dp, 1, doSat, a - Math.floor(a)); }
        if (m & 4) { const a = srck(b, c, 2, n0); wrk(dp, 2, doSat, a - Math.floor(a)); }
        if (m & 8) { const a = srck(b, c, 3, n0); wrk(dp, 3, doSat, a - Math.floor(a)); }
        break;
      }
      case 0x20: {                                // pow(|src0.x|,src1.x) 广播(JS:453)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        const p = Math.pow(Math.abs(srck(b0, c0, 0, n0)), srck(b1, c1, 0, n1));
        if (m & 1) wrk(dp, 0, doSat, p);
        if (m & 2) wrk(dp, 1, doSat, p);
        if (m & 4) wrk(dp, 2, doSat, p);
        if (m & 8) wrk(dp, 3, doSat, p);
        break;
      }
      case 0x21: {                                // crs(JS:454;out3=0)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b0, c0, 1, n0) * srck(b1, c1, 2, n1) - srck(b0, c0, 2, n0) * srck(b1, c1, 1, n1));
        if (m & 2) wrk(dp, 1, doSat, srck(b0, c0, 2, n0) * srck(b1, c1, 0, n1) - srck(b0, c0, 0, n0) * srck(b1, c1, 2, n1));
        if (m & 4) wrk(dp, 2, doSat, srck(b0, c0, 0, n0) * srck(b1, c1, 1, n1) - srck(b0, c0, 1, n0) * srck(b1, c1, 0, n1));
        if (m & 8) wrk(dp, 3, doSat, 0.0);
        break;
      }
      case 0x23: {                                // abs
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        if (m & 1) wrk(dp, 0, doSat, Math.abs(srck(b, c, 0, n0)));
        if (m & 2) wrk(dp, 1, doSat, Math.abs(srck(b, c, 1, n0)));
        if (m & 4) wrk(dp, 2, doSat, Math.abs(srck(b, c, 2, n0)));
        if (m & 8) wrk(dp, 3, doSat, Math.abs(srck(b, c, 3, n0)));
        break;
      }
      case 0x24: {                                // nrm(README 语义差①:Math.hypot 替代;读 0..2)
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const a0 = srck(b, c, 0, n0), a1 = srck(b, c, 1, n0), a2 = srck(b, c, 2, n0);
        // JS `Math.hypot(...) || 1`:0/NaN 皆 falsy → 1
        const h = Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2);
        const l = (h == h && h != 0.0) ? h : 1.0;
        if (m & 1) wrk(dp, 0, doSat, a0 / l);
        if (m & 2) wrk(dp, 1, doSat, a1 / l);
        if (m & 4) wrk(dp, 2, doSat, a2 / l);
        if (m & 8) wrk(dp, 3, doSat, 0.0);
        break;
      }
      case 0x25: {                                // sincos:x=cos(src0.x),y=sin(src0.x),
        // z/w=src0.z/src0.w 直通(JS:464;r15 复核序)
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        if (m & 1) wrk(dp, 0, doSat, Math.cos(srck(b, c, 0, n0)));
        if (m & 2) wrk(dp, 1, doSat, Math.sin(srck(b, c, 0, n0)));
        if (m & 4) wrk(dp, 2, doSat, srck(b, c, 2, n0));
        if (m & 8) wrk(dp, 3, doSat, srck(b, c, 3, n0));
        break;
      }
      case 0x42: {                                // texld dst, coord(srcs[0]), sampler(srcs[1])
        // JS:469-483。试点单贴图:s0 槽=源贴图双线性(寻址=恒 clamp,与
        // runPassOnImageData 的 s0 构造一致——wrap 实参恒 false);s1/s2 槽在
        // extraSamplers 空缺时 JS 兜底 write(0,0,0,1)(JS:474),同款复刻。
        // README 登记扩展点:多贴图槽位=后续刀按需加 ABI(贴图槽缓冲表)。
        const b = load<usize>(ip + 16), c = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const px = srck(b, c, 0, n0), py = srck(b, c, 1, n0);
        if (load<u32>(ip + 68) != 0) {
          if (m & 1) wrk(dp, 0, doSat, 0.0);
          if (m & 2) wrk(dp, 1, doSat, 0.0);
          if (m & 4) wrk(dp, 2, doSat, 0.0);
          if (m & 8) wrk(dp, 3, doSat, 1.0);
          break;
        }
        sampleBilinear(px, py, texW, texH, false, sampOutBuf);
        if (m & 1) wrk(dp, 0, doSat, load<f64>(sampOutBuf));
        if (m & 2) wrk(dp, 1, doSat, load<f64>(sampOutBuf + 8));
        if (m & 4) wrk(dp, 2, doSat, load<f64>(sampOutBuf + 16));
        if (m & 8) wrk(dp, 3, doSat, load<f64>(sampOutBuf + 24));
        break;
      }
      case 0x58: {                                // cmp(JS:484-485)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        const b2 = load<usize>(ip + 48), c2 = load<u32>(ip + 56), n2 = (nb & 4) != 0;
        if (m & 1) wrk(dp, 0, doSat, srck(b0, c0, 0, n0) >= 0.0 ? srck(b1, c1, 0, n1) : srck(b2, c2, 0, n2));
        if (m & 2) wrk(dp, 1, doSat, srck(b0, c0, 1, n0) >= 0.0 ? srck(b1, c1, 1, n1) : srck(b2, c2, 1, n2));
        if (m & 4) wrk(dp, 2, doSat, srck(b0, c0, 2, n0) >= 0.0 ? srck(b1, c1, 2, n1) : srck(b2, c2, 2, n2));
        if (m & 8) wrk(dp, 3, doSat, srck(b0, c0, 3, n0) >= 0.0 ? srck(b1, c1, 3, n1) : srck(b2, c2, 3, n2));
        break;
      }
      case 0x5A: {                                // dp2add:真 x·x'+y·y'+src2.x(JS:486;codegen 同形)
        const b0 = load<usize>(ip + 16), c0 = load<u32>(ip + 24), n0 = (nb & 1) != 0;
        const b1 = load<usize>(ip + 32), c1 = load<u32>(ip + 40), n1 = (nb & 2) != 0;
        const b2 = load<usize>(ip + 48), c2 = load<u32>(ip + 56), n2 = (nb & 4) != 0;
        const d = srck(b0, c0, 0, n0) * srck(b1, c1, 0, n1)
          + srck(b0, c0, 1, n0) * srck(b1, c1, 1, n1)
          + srck(b2, c2, 0, n2);
        if (m & 1) wrk(dp, 0, doSat, d);
        if (m & 2) wrk(dp, 1, doSat, d);
        if (m & 4) wrk(dp, 2, doSat, d);
        if (m & 8) wrk(dp, 3, doSat, d);
        break;
      }
      default: break;                             // 未知已解码 op:无写(JS:487)
    }
  }
  return true;
}

/** 双线性角点(SM2Effect.ts:574-585 cornerInto 逐字;texBuf=源贴图) */
function bilCorner(wrap: bool, xx: f64, yy: f64, wf: f64, hf: f64, w: i32, h: i32, dst: usize): void {
  let sx: f64, sy: f64;
  if (wrap) {
    sx = ((xx % wf) + wf) % wf;
    sy = ((yy % hf) + hf) % hf;
  } else {
    sx = xx < 0.0 ? 0.0 : xx >= wf ? wf - 1.0 : xx;
    sy = yy < 0.0 ? 0.0 : yy >= hf ? hf - 1.0 : yy;
  }
  const i = <usize>(truncI32(sy) * w + truncI32(sx)) << 2;
  const r = texBuf + i;
  store<f64>(dst,      <f64>load<u8>(r)     / 255.0);
  store<f64>(dst + 8,  <f64>load<u8>(r + 1) / 255.0);
  store<f64>(dst + 16, <f64>load<u8>(r + 2) / 255.0);
  store<f64>(dst + 24, <f64>load<u8>(r + 3) / 255.0);
}

/** sampleImageInto(SM2Effect.ts:568-595 逐字;出参指针版) */
function sampleBilinear(u: f64, v: f64, w: i32, h: i32, wrap: bool, out: usize): void {
  const wf = <f64>w, hf = <f64>h;
  const x = u * wf - 0.5, y = v * hf - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  bilCorner(wrap, x0,         y0,         wf, hf, w, h, bilA);
  bilCorner(wrap, x0 + 1.0,   y0,         wf, hf, w, h, bilB);
  bilCorner(wrap, x0,         y0 + 1.0,   wf, hf, w, h, bilC);
  bilCorner(wrap, x0 + 1.0,   y0 + 1.0,   wf, hf, w, h, bilD);
  for (let k = 0; k < 4; k++) {
    const a = load<f64>(bilA + (<usize>k << 3));
    const b = load<f64>(bilB + (<usize>k << 3));
    const c = load<f64>(bilC + (<usize>k << 3));
    const d = load<f64>(bilD + (<usize>k << 3));
    const p01 = a + (b - a) * fx;                  // 原 lp(a,b,fx)
    const p23 = c + (d - c) * fx;                  // 原 lp(cc,d,fx)
    store<f64>(out + (<usize>k << 3), p01 + (p23 - p01) * fy);   // 原 lp(p01,p23,fy)
  }
}

/** JS |0 截断(NaN→0;域外饱和防 wasm trap——采样地址域 |x|≤2^31 恒成立) */
function truncI32(x: f64): i32 {
  if (x != x) return 0;
  if (x >= 2147483647.0) return 2147483647;
  if (x <= -2147483648.0) return -2147483648;
  return <i32>x;
}

/** Uint8ClampedArray 赋值语义(ToUint8Clamp:NaN/≤0→0,>255→255,0.5 半取偶) */
function toU8(x: f64): u8 {
  if (!(x > 0.0)) return 0;
  if (x >= 255.0) return 255;
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return <u8>f;
  if (d > 0.5) return <u8>f + 1;
  return ((<u32>f & 1) == 0) ? <u8>f : <u8>f + 1;
}

/** 整图运行:产物 RGBA 写 outBuf。返回 1=ok,0=拒(句柄/尺寸非法或超容量)。
 *  逐像素循环=runPassOnImageData 主循环(SM2Effect.ts:550-559)同构:
 *  行序 y 外 x 内;t0=(x+0.5)/w,(y+0.5)/h(无 t0Rect 支);texkill 像素=0;
 *  出口 UNORM=逐分量 sat(o) ×255 → Uint8Clamped 赋值语义。 */
export function sm2RunImage(progH: u32, w: i32, h: i32,
  v0x: f64, v0y: f64, v0z: f64, v0a: f64): i32 {
  if (!inited) return 0;
  if (progH == 0 || progH > <u32>PROG_MAX) return 0;
  const prog = load<usize>(progTable + <usize>((<i32>progH - 1) << 3));
  if (prog == 0) return 0;
  if (w <= 0 || h <= 0) return 0;
  if (<u64>w * <u64>h * 4 > <u64>texCap) return 0;
  if (<u64>w * <u64>h * 4 > <u64>outCap) return 0;
  texW = w; texH = h;
  // v0/v1 文件:每调用清零(JS:532 每 runPassOnImageData 新建 Float64Array(8))+v0 注入
  memory.fill(vBase, 0, 8 * 8);
  store<f64>(vBase,      sat(v0x));               // v0Rgb 入参钳制(JS:534 sat 同式)
  store<f64>(vBase + 8,  sat(v0y));
  store<f64>(vBase + 16, sat(v0z));
  store<f64>(vBase + 24, 1.0);                    // alpha 恒 1=原版 DrawData 光照色语义
  // t 寄存器文件:每调用清零(JS 同;调用期跨像素持久=写面一致)
  memory.fill(tBase, 0, 32 * 8);
  const wf = <f64>w, hf = <f64>h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = <usize>(y * w + x) << 2;
      // t0 = 全表 UV(JS:547-549 t0of 无 t0Rect 支:(x+0.5)/w,(y+0.5)/h)
      const t0x = (<f64>x + 0.5) / wf;
      const t0y = (<f64>y + 0.5) / hf;
      if (!execPixel(prog, t0x, t0y)) {
        store<u8>(outBuf + i, 0);                 // texkill → 产物像素 0(JS:555)
        store<u8>(outBuf + i + 1, 0);
        store<u8>(outBuf + i + 2, 0);
        store<u8>(outBuf + i + 3, 0);
      } else {
        store<u8>(outBuf + i,      toU8(sat(load<f64>(oBase))      * 255.0));
        store<u8>(outBuf + i + 1,  toU8(sat(load<f64>(oBase + 8))  * 255.0));
        store<u8>(outBuf + i + 2,  toU8(sat(load<f64>(oBase + 16)) * 255.0));
        store<u8>(outBuf + i + 3,  toU8(sat(load<f64>(oBase + 24)) * 255.0));
      }
    }
  }
  return 1;
}
