// IIII173 批一次性探针：settle2 液域区域事件流（MMMMMM ②法 JS 侧仪）——
// 与 caves-oracle.cs LIQ_REG 行格式逐字同构（A/B/D/d/U/u/S/s/R/W/WEND/ROUND/C），
// liquidType JS+1 → 减 1 回 vanilla 0 基。区域/输出由 env 指定：
//   SW_173L_RUN=1 SW_173L_REG=x0,y0,x1,y1 SW_173L_OUT=/tmp/iii173-out/js-reg0.txt
//   SW_173L_SEED=9293480 SW_173L_EVIL=0 [SW_173L_EVENTS=1]（事件层，缺省仅相界快照）
import { it } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = !!process.env.SW_173L_RUN;
const SEED = process.env.SW_173L_SEED ?? '9293480';
const EVIL = Number(process.env.SW_173L_EVIL ?? '0') as 0 | 1;
const OUT = process.env.SW_173L_OUT ?? '/tmp/iii173-out/js-reg0.txt';
const EVENTS = !!process.env.SW_173L_EVENTS;
const [RX0, RY0, RX1, RY1] = (process.env.SW_173L_REG ?? '3920,273,4199,283').split(',').map(Number);

(RUN ? it : it.skip)(`iii173 liquid region trace seed=${SEED}`, () => {
  writeFileSync(OUT, '');
  const log = (s: string) => appendFileSync(OUT, `${s}\n`);
  let seq = 0;
  const snap = (tag: string, world: { store: { w: number; h: number; liquid: Uint8Array; liquidType: Uint8Array } }) => {
    const st = world.store;
    for (let y = RY0; y <= RY1; y++)
      for (let x = RX0; x <= RX1; x++) {
        const i = y * st.w + x;
        if (st.liquid[i] > 0) log(`${seq++} W${tag} ${x} ${y} ${st.liquid[i]} t${st.liquidType[i] - 1}`);
      }
    log(`${seq++} WEND${tag}`);
  };
  const inReg = (x: number, y: number) => x >= RX0 && x <= RX1 && y >= RY0 && y <= RY1;

  const P = LiquidSim.prototype as unknown as Record<string, (...a: never[]) => unknown>;
  // —— ★IIIII173：逐 updateLiquid 调用指纹（SW_173L_CALLCHK=1）——lq 队列序 FNV + liq
  //    全图 FNV，与 caves-oracle.cs LIQ_CALLCHK 同构对拍。
  if (!!process.env.SW_173L_CALLCHK) {
    let call = 0;
    const st1 = (h: number, b: number) => { h ^= b & 0xff; return (Math.imul(h, 0x01000193) >>> 0); };
    const origUL = P.updateLiquid;
    P.updateLiquid = function (this: InstanceType<typeof LiquidSim>) {
      const sim = this as unknown as {
        world: { store: { w: number; liquid: Uint8Array } };
        liquids: { x: number; y: number }[];
        numLiquid: number; bufCount: number;
      };
      const stw = sim.world.store;
      let h1 = 0x811c9dc5 >>> 0;
      for (let i = 0; i < sim.numLiquid; i++) {
        const e = sim.liquids[i];
        h1 = st1(h1, e.x); h1 = st1(h1, e.x >>> 8); h1 = st1(h1, e.y); h1 = st1(h1, e.y >>> 8);
      }
      let h2 = 0x811c9dc5 >>> 0;
      for (let i = 0; i < stw.liquid.length; i++) { h2 ^= stw.liquid[i]; h2 = (Math.imul(h2, 0x01000193) >>> 0); }
      log(`${call++} K nl=${sim.numLiquid} buf=${sim.bufCount} lq=${h1.toString(16)} liq=${h2.toString(16)}`);
      return origUL.call(this);
    } as never;
  }
  // —— 相界快照：quickWater / waterCheck（settle2 镜像内仅这两类调用）——
  const origQW = P.quickWater;
  P.quickWater = function (this: InstanceType<typeof LiquidSim>, ...a: unknown[]) {
    log(`${seq++} QWSTART min=${a[0]} max=${a[1]}`);
    const r = origQW.apply(this, a as never);
    snap('-qw', this.world as never);
    return r;
  } as never;
  const origWC = P.waterCheck;
  P.waterCheck = function (this: InstanceType<typeof LiquidSim>) {
    const r = origWC.call(this);
    snap('-wc', this.world as never);
    return r;
  } as never;
  if (EVENTS) {
    // —— S/s：SettleWaterAt 进/出（落点出参借 world 快照难取，仅进端）——
    const origSW = P.settleWaterAt;
    P.settleWaterAt = function (this: InstanceType<typeof LiquidSim>, ox: number, oy: number) {
      const st = this.world.store;
      const i = oy * st.w + ox;
      if (inReg(ox, oy)) log(`${seq++} S ${ox} ${oy} amt=${st.liquid[i]} t=${st.liquidType[i] - 1}`);
      return origSW.call(this, ox, oy);
    } as never;
    // —— A/B：AddWater 入列/入缓冲 ——
    const origAW = P.addWater;
    P.addWater = function (this: InstanceType<typeof LiquidSim>, ax: number, ay: number) {
      const nl0 = this.numLiquid, bf0 = this.bufCount;
      const r = origAW.call(this, ax, ay);
      if (inReg(ax, ay)) {
        if (this.bufCount > bf0) log(`${seq++} B ${ax} ${ay} buf=${this.bufCount} nl=${this.numLiquid}`);
        else if (this.numLiquid > nl0) log(`${seq++} A ${ax} ${ay} nl=${this.numLiquid}`);
      }
      return r;
    } as never;
    // —— D/d：出列 ——
    const origDW = P.delWater;
    P.delWater = function (this: InstanceType<typeof LiquidSim>, l: number) {
      const e = (this as unknown as { liquids: { x: number; y: number; kill: number }[] }).liquids[l];
      const x = e?.x, y = e?.y;
      const st = this.world.store;
      if (inReg(x, y)) log(`${seq++} D ${x} ${y} amt=${st.liquid[y * st.w + x]} kill=${e.kill} l=${l} nl=${this.numLiquid}`);
      const r = origDW.call(this, l);
      if (inReg(x, y)) log(`${seq++} d ${x} ${y} -> ${st.liquid[y * st.w + x]}`);
      return r;
    } as never;
    // —— U/u：update 进/出（走内置 trkProbe/trkBox：sig=-1 进端）——
    const st0 = { w: 4200 };
    void st0;
    LiquidSim.trkBox = { x0: RX0, x1: RX1, y0: RY0, y1: RY1 };
    LiquidSim.trkProbe = (iter, x, y, sig, amt, lty, kill, delay) => {
      if (sig === -1) log(`${seq++} U ${x} ${y} amt=${amt} k=${kill} d=${delay} it=${iter}`);
      else log(`${seq++} u ${x} ${y} -> ${amt} k=${kill} sig=${sig}`);
    };
  }
  try {
    const res = chainCheckpoints(SEED, EVIL);
    for (const n of ['trees', 'settle2']) console.log(`III173L ${n} ${res.grids.get(n)}`);
  } finally {
    LiquidSim.trkProbe = null;
    LiquidSim.trkBox = null;
  }
}, 600000);
