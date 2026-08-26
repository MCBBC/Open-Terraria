// WWWWWWW 批·离线沉降重放（g 链 #98 窗口）：/tmp/vvv-out/replay 十通道入口态
// （= x86 097_Micro_Biomes dump，内部 id/+1 液型编码，act/liq 已与 van dump 对齐验证）
// → settleWorldLiquids('gen') 重放 → 与 x86 098_Settle_Liquids_Again 十通道对拍 +
//   击杀流捕捉（__swLqKill）。门：SW_WWWA=1（缺省 skip）。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { setBoulderSolidity } from '../src/world/gen/vanilla/TrapsPass';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_WWWA === '1';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const IN = '/tmp/vvv-out/replay';
const OUT = '/tmp/www-out';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

function loadWorld(): { world: World } {
  const world = new World(W, H, SEED);
  const st = world.store;
  const rd8 = (n: string) => new Uint8Array(readFileSync(`${IN}/${n}.bin`).buffer.slice(0));
  const rd16 = (n: string) => new Uint16Array(readFileSync(`${IN}/${n}.bin`).buffer.slice(0));
  const typ = rd16('type'), wal = rd16('wall'), fx = rd16('frameX'), fy = rd16('frameY');
  const fl = rd8('flags'), lq = rd8('liquid'), lt = rd8('liquidType');
  const hf = rd8('half'), sl = rd8('slope'), wr = rd8('wire');
  for (let i = 0; i < N; i++) {
    st.flags[i] = fl[i]!;
    st.type[i] = fl[i] || typ[i] ? typ[i]! : 0; // 幽灵 type 保留（BBB 语义）
    st.wall[i] = wal[i]!;
    st.liquid[i] = lq[i]!;
    st.liquidType[i] = lq[i]! ? lt[i]! : 0;
    st.half[i] = hf[i]!;
    st.slope[i] = sl[i]!;
    st.frameX[i] = fx[i]!;
    st.frameY[i] = fy[i]!;
    st.wire[i] = wr[i]!;
  }
  return { world };
}

// per-updateLiquid 指纹（与 rig JJHook.OnUpdateLiquid 同布局：14B/条 FNV-1a：
// x:i16le y:i16le delay:i32le kill:i32le amt:u8 lty(vanilla 0 基):u8）
const fnvPack = new Uint8Array(26000 * 14); // curMaxLiquid 上限 25000
type FpSim = { numLiquid: number; liquids: Array<{ x: number; y: number; delay: number; kill: number }>; world: World };
function fpOf(sim: FpSim): string {
  const st = sim.world.store;
  const n = sim.numLiquid;
  const need = n * 14;
  const dv = new DataView(fnvPack.buffer);
  for (let k = 0; k < n; k++) {
    const e = sim.liquids[k]!;
    const i = st.idx(e.x, e.y);
    let o = k * 14;
    dv.setInt16(o, e.x, true); o += 2;
    dv.setInt16(o, e.y, true); o += 2;
    dv.setInt32(o, e.delay, true); o += 4;
    dv.setInt32(o, e.kill, true); o += 4;
    fnvPack[o++] = st.liquid[i];
    fnvPack[o] = Math.max(0, st.liquidType[i] - 1);
  }
  let h = 2166136261 >>> 0;
  for (let k = 0; k < need; k++) {
    h ^= fnvPack[k]!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}


(RUN ? it : it.skip)('wwwa settle replay g#98 window', async () => {
  const t0 = Date.now();
  // gen 语境：gs 值经 terrain 重播取真值（waterLine/worldSurface/dungeonSide/shimmer）
  const seeded = runResetAndTerrain({ width: W, height: H, seedText: String(SEED), evil: -1 });
  const gs = seeded.gs;
  console.log(`gs waterLine=${gs.waterLine} worldSurface=${gs.worldSurface} dungeonSide=${gs.dungeonSide} shimmer=${gs.shimmerX},${gs.shimmerY}`);
  writeFileSync(`${OUT}/j-gs.json`, JSON.stringify({
    waterLine: gs.waterLine, worldSurface: gs.worldSurface, dungeonSide: gs.dungeonSide,
    shimmerX: gs.shimmerX, shimmerY: gs.shimmerY,
  }));

  const { world } = loadWorld();
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) world.genDungeonExempt = null;
  else {
    const edge = Math.floor(W * 0.05), mid = Math.floor(W * 0.55);
    world.genDungeonExempt = gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(W * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (H - 200) - 10 }
      : { x0: mid, x1: W - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (H - 200) - 10 };
  }
  world.shimmerX = gs.shimmerX; world.shimmerY = gs.shimmerY;

  // 沉降期 GenSolid 时间线：vanilla #98 头 SetBoulderSolidity(false) 仅在
  // noTrapsWorldGen 分支（QuickWater 头 Liquid.cs:110）——普通种子巨石族恒实心
  // （PilesPass 尾 true 为最后写入位），故此处不覆写
  if (process.env.SW_WWWA_BLD === '1') setBoulderSolidity(false);

  const kills: string[] = [];
  const prevHook = (globalThis as { __swLqKill?: unknown }).__swLqKill;
  (globalThis as { __swLqKill?: unknown }).__swLqKill =
    (x: number, y: number, sheet: number, fx: number, fy: number, liq: number, lty: number) => {
      kills.push(`K ${x} ${y} t${sheet} f${fx}/${fy} q${liq} y${lty}`);
      if (prevHook && typeof prevHook === 'function') (prevHook as (...a: unknown[]) => void)(x, y, sheet, fx, fy, liq, lty);
    };

  // 指纹包装（UpdateLiquid 尾触发，同 rig OnUpdateLiquid 时点）。sim 实例由
  // settleWorldLiquids 内部创建——包装首调即绑（进程内仅本 probe 跑一次沉降）。
  const DUMP_AT = Number(process.env.SW_WWWA_DUMP_AT ?? 8);
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const origUpdate = proto.updateLiquid;
  let it0 = 0;
  const fpLines: string[] = ['---START'];

  // 盒内逐 Update 分支签名迹（SW_WWWA_TRK="x0,x1,y0,y1" 开启；与 rig x2-trkbox 同格式）
  const trkEnv = process.env.SW_WWWA_TRK;
  const trkLines: string[] = [];
  if (trkEnv) {
    const [bx0, bx1, by0, by1] = trkEnv.split(',').map(Number);
    LiquidSim.trkBox = { x0: bx0!, x1: bx1!, y0: by0!, y1: by1! };
    LiquidSim.trkProbe = (iter, x, y, sig, amtA, ltyA, kill, delay, pre) => {
      trkLines.push(sig === -1 ? `P ${iter} ${x} ${y} ${pre.amt} ${pre.lty}` : `T ${iter} ${x} ${y} ${sig.toString(16)} ${amtA} ${ltyA} ${kill} ${delay}`);
    };
  }

  // QUICKWATER 尾世界快照（K.liq 等；验证 QW 相位本身是否已分歧）
  const origQW = proto.quickWater;
  let qwSeen = false;
  proto.quickWater = function () {
    const r = origQW.apply(this, arguments as unknown as unknown[]);
    if (!qwSeen && process.env.SW_WWWA_QW === '1') {
      qwSeen = true;
      const st2 = this.world.store;
      writeFileSync(`${OUT}/j-qw-world/K.liq`, Buffer.from(st2.liquid.slice().buffer));
      const e8 = new Uint8Array(N);
      for (let i = 0; i < N; i++) e8[i] = st2.flags[i]! & 1;
      writeFileSync(`${OUT}/j-qw-world/K.act`, Buffer.from(e8.buffer));
      for (let i = 0; i < N; i++) e8[i] = st2.liquid[i] ? Math.max(0, st2.liquidType[i]! - 1) : 0;
      writeFileSync(`${OUT}/j-qw-world/K.lty`, Buffer.from(e8.buffer));
      console.log('QW done nl=', this.numLiquid);
    }
    return r;
  };
  (proto as Record<string, (...a: unknown[]) => unknown>)._wwwaOrigQW = origQW;

  // head-WaterCheck 后的活动表快照（与 rig DumpList("head") 对拍）
  const origWC = proto.waterCheck;
  let wcSeen = 0;
  proto.waterCheck = function () {
    const r = origWC.apply(this, arguments as unknown as unknown[]);
    if (this.numLiquid > 0) {
      wcSeen++;
      if (wcSeen === 1) {
        const st2 = this.world.store;
        const rows: string[] = [];
        for (let k = 0; k < this.numLiquid; k++) {
          const e = (this as unknown as { liquids: Entry[] }).liquids[k]!;
          const i = st2.idx(e.x, e.y);
          rows.push(`${e.x},${e.y},${st2.liquid[i]},${Math.max(0, st2.liquidType[i] - 1)}`);
        }
        writeFileSync(`${OUT}/j-list-head.txt`, rows.join('\n') + '\n');
      }
    }
    return r;
  };
  (proto as Record<string, (...a: unknown[]) => unknown>)._wwwaOrigWC = origWC;

  type Entry = { x: number; y: number; delay: number; kill: number };
  proto.updateLiquid = function (this: { numLiquid: number; bufCount: number; liquids: Entry[]; world: World }) {
    LiquidSim.trkIterCur = it0;
    const r = origUpdate.apply(this, arguments as unknown as unknown[]);
    it0++;
    const n = this.numLiquid;
    const nb = this.bufCount;
    fpLines.push(`I ${it0} ${n} ${nb} ${fpOf(this)}`);
    if (it0 === DUMP_AT) {
      const st2 = this.world.store;
      const rows: string[] = ['# x y delay kill amt lty'];
      for (let k = 0; k < n; k++) {
        const e = this.liquids[k]!;
        const i = st2.idx(e.x, e.y);
        rows.push(`${e.x} ${e.y} ${e.delay} ${e.kill} ${st2.liquid[i]} ${Math.max(0, st2.liquidType[i] - 1)}`);
      }
      writeFileSync(`${OUT}/jdump-iter${DUMP_AT}/entries-${DUMP_AT}.txt`, rows.join('\n') + '\n');
      // 世界通道快照（K.act/K.inact/K.liq/K.lty/K.typ/K.wal 同名同格式；lty 取 vanilla 编码）
      {
        const enc8 = new Uint8Array(N);
        const enc16 = new Uint16Array(N);
        for (let i = 0; i < N; i++) enc8[i] = st2.flags[i]! & 1;
        writeFileSync(`${OUT}/jdump-iter${DUMP_AT}/K.act`, Buffer.from(enc8.buffer));
        for (let i = 0; i < N; i++) enc8[i] = ((st2.wire[i]! >>> 5) & 1) ? 1 : 0;
        writeFileSync(`${OUT}/jdump-iter${DUMP_AT}/K.inact`, Buffer.from(enc8.buffer));
        writeFileSync(`${OUT}/jdump-iter${DUMP_AT}/K.liq`, Buffer.from(st2.liquid.slice().buffer));
        for (let i = 0; i < N; i++) enc8[i] = st2.liquid[i] ? Math.max(0, st2.liquidType[i]! - 1) : 0;
        writeFileSync(`${OUT}/jdump-iter${DUMP_AT}/K.lty`, Buffer.from(enc8.buffer));
        for (let i = 0; i < N; i++) enc16[i] = SHEET[st2.type[i]!]! >= 0 ? SHEET[st2.type[i]!]! : 9999;
        writeFileSync(`${OUT}/jdump-iter${DUMP_AT}/K.typ`, Buffer.from(enc16.buffer));
        writeFileSync(`${OUT}/jdump-iter${DUMP_AT}/K.wal`, Buffer.from(st2.wall.slice().buffer));
      }
    }
    return r;
  };

  try {
    await settleWorldLiquids(world, 'gen', undefined, new RNG(SEED), false);
  } finally {
    if ((proto as Record<string, unknown>)._wwwaOrigQW) proto.quickWater = (proto as Record<string, unknown>)._wwwaOrigQW as (...a: unknown[]) => unknown;
    if ((proto as Record<string, unknown>)._wwwaOrigWC) proto.waterCheck = (proto as Record<string, unknown>)._wwwaOrigWC as (...a: unknown[]) => unknown;
    proto.updateLiquid = origUpdate;
    delete (globalThis as { __swLqKill?: unknown }).__swLqKill;
  }

  writeFileSync(`${OUT}/j-liqlog.txt`, fpLines.join('\n') + '\n');
  if (trkLines.length) writeFileSync(`${OUT}/j-trkbox.txt`, trkLines.join('\n') + '\n');
  writeFileSync(`${OUT}/j-rep-kills.txt`, kills.join('\n') + '\n');

  // 终态对拍（vs x86 098_Settle_Liquids_Again）：A/T/L/Lt 四通道
  const vd = '/tmp/vvv-out/xdump';
  const v8 = (f: string) => new Uint8Array(readFileSync(`${vd}/098_Settle_Liquids_Again.${f}`).buffer.slice(0));
  const v16 = (f: string) => new Uint16Array(readFileSync(`${vd}/098_Settle_Liquids_Again.${f}`).buffer.slice(0));
  const vAct = v8('act'), vLiq = v8('liq'), vLt = v8('lty'), vTyp = v16('typ');
  const st = world.store;
  let dA = 0, dT = 0, dL = 0, dLt = 0, dPot = 0;
  const firsts: string[] = [];
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = vAct[i]!, ja = (st.flags[i]! & 1);
    const vt = va ? vTyp[i]! : 0;
    const jt = ja ? SHEET[st.type[i]!]! : 0;
    const vl = vLiq[i]!, jl = st.liquid[i]!;
    const vlt = vl ? vLt[i]! + 1 : 0;
    const jlt = jl ? st.liquidType[i]! : 0;
    if (va !== ja) dA++;
    if (vt !== jt) { dT++; pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1); }
    if (vl !== jl) dL++;
    if (vlt !== jlt) { dLt++; pair.set(`Y${vlt}>${jlt}`, (pair.get(`Y${vlt}>${jlt}`) ?? 0) + 1); }
    if ((vt === 28 && jt === 0) || (vt === 0 && jt === 28)) dPot++;
    if (firsts.length < 8 && (va !== ja || vt !== jt || vl !== jl)) {
      firsts.push(`(${i % W},${Math.floor(i / W)}) vA${va}jA${st.flags[i]! & 1} vT${vt}jT${SHEET[st.type[i]!]} q${vl}/${jl}`);
    }
  }
  const pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k}×${n}`).join(' ');
  console.log(`REPLAY-DIFF vs x86#98: A=${dA} T=${dT} L=${dL} Lt=${dLt} potInvolved=${dPot}`);
  console.log(`pairs: ${pairs}`);
  console.log(`firsts: ${firsts.join(' | ')}`);
  console.log(`kills=${kills.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}, 900000);
