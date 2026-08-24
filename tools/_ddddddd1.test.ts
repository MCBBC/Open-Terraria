// DDDDDDD 批（2026-08-24）：CONST #49 液体沉降 Update 轮级对拍探针。
// 与 x86 织入侧（/tmp/bbbbbbb-wv app,ProbeLib Z49 族）七通道同构：
//   aw2.txt   AddWater 头        `x y q<numLiquid> b<bufCount> c<checking>`
//   aw.txt    WaterCheck 尾      `wc<N> addWater=<span 内 AddWater 数>`
//   ql0.txt   UpdateLiquid 头    `numLiquid bufCount`
//   dw0.txt   DelWater 头        `l x y k<kill> d<delay>`
//   buf0.txt  缓冲入/出          `B x y` / `D l`
//   ul<N>.txt Update 头(轮内迹)  `x y amt t<lty0基> k<kill> d<delay> s<skip>`
//   wc<N>e/x.{liq,act,lty}       WaterCheck 进/出全图快照（列主序 i=x*H+y,与探针 Dump 同构）
//   phases.txt                   wc 标签流
// 用法：SW_DDD=1 SW_DDD_OUT=/tmp/ddddddd-j49 SW_DDD_UL=1 npx vitest run tools/_ddddddd1.test.ts
// ★lty 通道：JS +1 基 → 落盘 -1（0 水/1 岩浆/2 蜜/3 微光,含干格残型,与 bTileHeader 同构）
import { it } from 'vitest';
import { mkdirSync, openSync, writeSync, closeSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_DDD === '1';
const OUT = process.env.SW_DDD_OUT ?? '/tmp/ddddddd-j49';
const UL = process.env.SW_DDD_UL === '1';
const SEED = process.env.SW_DDD_SEED ?? '1321365005';
const EVIL = process.env.SW_DDD_EVIL !== undefined ? Number(process.env.SW_DDD_EVIL) : -1;
const W = Number(process.env.SW_DDD_W ?? 4200), H = Number(process.env.SW_DDD_H ?? 1200);

(RUN ? it : it.skip)('const #49 seven-channel trace', async () => {
  mkdirSync(OUT, { recursive: true });
  const S = {
    wcIdx: -1, cnt: 0, wcCnt: 0,
    aww: -1, awBuf: [] as string[],
    awc: -1, awcBuf: [] as string[],
    qlw: -1, qlBuf: [] as string[],
    dww: -1, dwBuf: [] as string[],
    bw: -1, bBuf: [] as string[],
    ulw: -1, ulBuf: [] as string[],
    dwb: -1, dwbBuf: [] as string[],
    phw: -1,
  };
  const flush = (fd: number, buf: string[]) => {
    if (buf.length === 0) return;
    writeSync(fd, buf.join(''));
    buf.length = 0;
  };
  const open = (cur: number, path: string) => (cur < 0 ? openSync(path, 'w') : cur);

  interface Sim {
    idx(x: number, y: number): number;
    numLiquid: number; bufCount: number; curMaxLiquid: number;
    checking: Uint8Array; skip: Uint8Array;
    liquids: Array<{ x: number; y: number; kill: number; delay: number }>;
    world: { store: { w: number; h: number; liquid: Uint8Array; flags: Uint8Array; liquidType: Uint8Array } };
  }

  function dumpWc(s: Sim, tag: string) {
    const st = s.world.store;
    const { w, h } = st;
    const liq = Buffer.alloc(w * h), act = Buffer.alloc(w * h), lty = Buffer.alloc(w * h);
    for (let x = 0; x < w; x++) {
      const base = x * h;
      for (let y = 0; y < h; y++) {
        const i = y * w + x, o = base + y;
        liq[o] = st.liquid[i];
        act[o] = st.flags[i] & 1;
        lty[o] = st.liquidType[i] - 1;
      }
    }
    writeFileSync(`${OUT}/wc${tag}.liq`, liq);
    writeFileSync(`${OUT}/wc${tag}.act`, act);
    writeFileSync(`${OUT}/wc${tag}.lty`, lty);
  }

  const P = LiquidSim.prototype as unknown as Record<string, (...a: never[]) => unknown>;
  const oAdd = P.addWater;
  const oUpl = P.updateLiquid;
  const oDel = P.delWater;
  const oUpd = P.update;
  const oWc = P.waterCheck;

  // addWater：aw2 行 + 缓冲入账（原版 AddBuffer 唯一调用点=本函数缓冲支,门同构复刻）
  P.addWater = function (this: Sim, x: number, y: number) {
    S.aww = open(S.aww, `${OUT}/aw2.txt`);
    S.awBuf.push(`${x} ${y} q${this.numLiquid} b${this.bufCount} c${this.checking[this.idx(x, y)] ? 1 : 0}\n`);
    if (S.awBuf.length >= 4096) flush(S.aww, S.awBuf);
    S.cnt++; S.wcCnt++;
    if (this.numLiquid >= this.curMaxLiquid - 1 && this.bufCount < 49998 && !this.checking[this.idx(x, y)]) {
      S.bw = open(S.bw, `${OUT}/buf0.txt`);
      S.bBuf.push(`B ${x} ${y}\n`);
      if (S.bBuf.length >= 1024) flush(S.bw, S.bBuf);
    }
    return oAdd.call(this, x, y);
  };

  // updateLiquid：ql0 行 + 缓冲出账（回灌循环 DelBuffer(0) 次数）
  P.updateLiquid = function (this: Sim) {
    S.qlw = open(S.qlw, `${OUT}/ql0.txt`);
    S.qlBuf.push(`${this.numLiquid} ${this.bufCount}\n`);
    if (S.qlBuf.length >= 1024) flush(S.qlw, S.qlBuf);
    if (this.bufCount > 0 && this.numLiquid > 0) {
      const n = Math.min(this.numLiquid, this.bufCount);
      S.bw = open(S.bw, `${OUT}/buf0.txt`);
      for (let k = 0; k < n; k++) {
        S.bBuf.push('D 0\n');
        if (S.bBuf.length >= 1024) flush(S.bw, S.bBuf);
      }
    }
    return oUpl.call(this);
  };

  // delWater：dw0 行 + 分支账（dwb:0=<2 清邻,1=<20 清自,2=早退保留,3=真出列）
  P.delWater = function (this: Sim, l: number) {
    S.dww = open(S.dww, `${OUT}/dw0.txt`);
    const e = this.liquids[l];
    S.dwBuf.push(`${l} ${e.x} ${e.y} k${e.kill} d${e.delay}\n`);
    if (S.dwBuf.length >= 1024) flush(S.dww, S.dwBuf);
    if (process.env.SW_DDD_DWB === '1') {
      const st = this.world.store;
      const i5 = this.idx(e.x, e.y), id = i5 + st.w;
      const amt = st.liquid[i5], dq = st.liquid[id];
      const bp = this.blocksLiquid(e.x, e.y + 1) ? 1 : 0;
      const sp = this.blocksLiquid(e.x, e.y) ? 1 : 0;
      let br: number;
      if (amt < 2) br = 0;
      else if (amt < 20) br = 1;
      else if (dq < 255 && !bp && !this.stuck && !sp) br = 2;
      else br = 3;
      S.dwb = open(S.dwb, `${OUT}/dwb.txt`);
      S.dwbBuf.push(`${br} ${e.x} ${e.y} a${amt} d${dq} bp${bp} sp${sp}\n`);
      if (S.dwbBuf.length >= 1024) flush(S.dwb, S.dwbBuf);
    }
    return oDel.call(this, l);
  };

  // update：ul<N> 行（Update 头态,与探针 Z49U 同构）
  P.update = function (this: Sim, e: { x: number; y: number; kill: number; delay: number }) {
    if (UL) {
      if (S.ulw < 0) S.ulw = openSync(`${OUT}/ul${S.wcIdx}.txt`, 'w');
      const st = this.world.store;
      const i = this.idx(e.x, e.y);
      S.ulBuf.push(`${e.x} ${e.y} ${st.liquid[i]} t${st.liquidType[i] - 1} k${e.kill} d${e.delay} s${this.skip[i] ? 1 : 0}\n`);
      if (S.ulBuf.length >= 8192) flush(S.ulw, S.ulBuf);
    }
    return oUpd.call(this, e);
  };

  // waterCheck：进（关上一 ul+换号+快照 e）/出（快照 x+aw 计数行）
  P.waterCheck = function (this: Sim) {
    if (S.ulw >= 0) { flush(S.ulw, S.ulBuf); closeSync(S.ulw); S.ulw = -1; }
    S.wcIdx++;
    S.wcCnt = 0;
    dumpWc(this, `${S.wcIdx}e`);
    S.phw = open(S.phw, `${OUT}/phases.txt`);
    writeSync(S.phw, `wc${S.wcIdx}e\n`);
    const r = oWc.call(this);
    dumpWc(this, `${S.wcIdx}x`);
    writeSync(S.phw, `wc${S.wcIdx}x\n`);
    S.awc = open(S.awc, `${OUT}/aw.txt`);
    S.awcBuf.push(`wc${S.wcIdx} addWater=${S.wcCnt}\n`);
    flush(S.awc, S.awcBuf);
    return r;
  };

  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: { theConstant: true },
    });
  } finally {
    P.addWater = oAdd; P.updateLiquid = oUpl; P.delWater = oDel; P.update = oUpd; P.waterCheck = oWc;
    for (const [fd, buf] of [[S.aww, S.awBuf], [S.awc, S.awcBuf], [S.qlw, S.qlBuf], [S.dww, S.dwBuf], [S.bw, S.bBuf], [S.ulw, S.ulBuf], [S.dwb, S.dwbBuf]] as Array<[number, string[]]>) {
      if (fd >= 0) { flush(fd, buf); closeSync(fd); }
    }
    if (S.phw >= 0) closeSync(S.phw);
  }
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s aw2=${S.cnt} wc=${S.wcIdx}`);
}, 900_000);
