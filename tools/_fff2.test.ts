// 一次性诊断（FFFFFFF 批）：g#98 二次沉降离线重放实验室 v2（_w27a 重建）
//  装载 /tmp/vvv-out/replay 十通道 → 复刻 SettleLiquidsPart2AndNotTheBees 全相位
//  → 终态 + 分轮 vs x86 dump 对拍。产物 → /tmp/fff2-out/
//  用法：cd game && SW_FFF2=1 npx vitest run tools/_fff2.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { RNG, translateSeed } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_FFF2 === '1';
const SEED = process.env.SW_FFF_SEED ?? '9293480';
const W = Number(process.env.SW_FFF_W ?? 4200), H = Number(process.env.SW_FFF_H ?? 1200);
const N = W * H;
const OUT = '/tmp/fff2-out';
const RP = '/tmp/vvv-out/replay';
const G2 = process.env.SW_FFF_G2 ?? '/tmp/jjj-out/g1457';

const loadU8 = (p: string): Uint8Array => {
  const b = readFileSync(p);
  const u = new Uint8Array(b.length);
  u.set(b);
  return u;
};
const loadU16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  const u = new Uint16Array(b.length >> 1);
  new Uint8Array(u.buffer).set(b);
  return u;
};
const SHEET = TILE_DEFS.map((d) => d?.vanilla?.sheet ?? -1);

(RUN ? it : it.skip)('fff replay lab', async () => {
  mkdirSync(OUT, { recursive: true });
  // ---- 十通道装载（VVV 批口径：type/wall/frameX/frameY 为 JS 内部域 Uint16，
  //      其余 Uint8；liquidType 已是 +1 编码）----
  const store = new TileStore(W, H);
  (store.type as unknown as Uint16Array).set(loadU16(`${RP}/type.bin`));
  (store.flags as unknown as Uint8Array).set(loadU8(`${RP}/flags.bin`));
  (store.frameX as unknown as Uint16Array).set(loadU16(`${RP}/frameX.bin`));
  (store.frameY as unknown as Uint16Array).set(loadU16(`${RP}/frameY.bin`));
  (store.wall as unknown as Uint16Array).set(loadU16(`${RP}/wall.bin`));
  (store.liquid as unknown as Uint8Array).set(loadU8(`${RP}/liquid.bin`));
  (store.liquidType as unknown as Uint8Array).set(loadU8(`${RP}/liquidType.bin`));
  (store.half as unknown as Uint8Array).set(loadU8(`${RP}/half.bin`));
  (store.slope as unknown as Uint8Array).set(loadU8(`${RP}/slope.bin`));
  (store.wire as unknown as Uint8Array).set(loadU8(`${RP}/wire.bin`));

  const rng = new RNG(translateSeed(SEED));
  let rngDrawN = 0;
  const rr = rng as unknown as Record<string, (...a: number[]) => number>;
  for (const m of ['nextInt', 'nextIntRange']) {
    const om = rr[m];
    rr[m] = function (...a: number[]) { rngDrawN++; return om.apply(this, a); };
  }

  const sim = new LiquidSim({ store } as never);
  sim.passRand = (max) => rng.nextInt(max);
  sim.passRng = rng;
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = { x: 3966, y: 724 };
  sim.genWaterLine = 867;
  // dungeonSide=-1 的 outerPotentialDungeonBounds 半图盒（liquidSettlePass 同式）
  const edge = Math.floor(W * 0.05);
  sim.dungeonWaterExempt = (x, y, w) =>
    x >= edge && x <= Math.floor(W * 0.45) && y >= 347 && y <= 990
    && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99));
  // GenSolid 注入：二次沉降窗实测快照（panel-call2，sheet 域 [id,bool]）
  const overrides = JSON.parse(readFileSync('/tmp/w27-out/panel-call2.json', 'utf8')) as Array<[number, boolean]>;
  sim.applyGenSolidOverrides(new Map(overrides));
  sim.worldGenTilesIgnoreWater(true);

  /** 与 x86 某槽对拍（act/type/lty 简表；lty 只裁决 liquid>0 格） */
  const cmpDump = (idx: number, nm: string): [number, number, number, number] => {
    const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
    if (!existsSync(`${pre}.liq`)) return [-1, -1, -1, -1];
    const vL = loadU8(`${pre}.liq`);
    const vT = loadU16(`${pre}.typ`);
    const vA = loadU8(`${pre}.act`);
    const vLt = loadU8(`${pre}.lty`);
    let dL = 0, dA = 0, dT = 0, dLt = 0;
    const fam = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const va = vA[i], ja = store.flags[i] & 1;
      if (va !== ja) { dA++; continue; }
      const vt = va ? vT[i] : 0;
      const jt = va ? (SHEET[store.type[i]] >= 0 ? SHEET[store.type[i]] : 9999) : 0;
      if (vt !== jt) { dT++; fam.set(`T${vt}>${jt}`, (fam.get(`T${vt}>${jt}`) ?? 0) + 1); continue; }
      if (vL[i] !== store.liquid[i]) {
        dL++;
        fam.set(vL[i] > store.liquid[i] ? `X高(${vL[i]}>${store.liquid[i]})` : `J高(${vL[i]}<${store.liquid[i]})`,
          (fam.get(vL[i] > store.liquid[i] ? `X高(${vL[i]}>${store.liquid[i]})` : `J高(${vL[i]}<${store.liquid[i]})`) ?? 0) + 1);
      }
      const vl = vL[i] > 0 ? vLt[i]! + 1 : 0;
      const jl = store.liquid[i]! > 0 ? store.liquidType[i]! : 0;
      if (vl !== jl) dLt++;
    }
    const tops = [...fam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ');
    console.log(`cmp#${idx} ${nm}: dA=${dA} dT=${dT}${dT ? ' (' + tops + ')' : ''} dL=${dL} dLt=${dLt}`);
    return [dA, dT, dL, dLt];
  };

  // ---- 掷账 + r30 流 ----
  const r30: string[] = [];
  let seq30 = 0;
  LiquidSim.r30Sink = (x, y, v, num1, lq, rq, self) => {
    r30.push(`${++seq30}\t${rngDrawN}\t${x} ${y} v${v} n${num1} ${lq}/${rq}/${self}`);
  };
  // ---- 双端同构 A/D ops 流（对齐 rig JJHook.OpAdd/OpDel 格式 + MainRolls）----
  //  全量记录（少假设；分析端再裁窗）。A 仅记成功 append（buffer 入列不记，与原版
  //  钩位一致）；ctx=「正在处理的切片格」（尾灌段沿用上格 stale 值——与原版同构）。
  const ops: string[] = [];
  let opsSeq = 0;
  let callIdx = 0;
  const curCtx = { x: -1, y: -1, d: -1 };
  const protoU = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpdate = protoU.update;
  protoU.update = function (this: unknown, e: { x: number; y: number; delay: number }) {
    curCtx.x = e.x; curCtx.y = e.y; curCtx.d = e.delay;
    const r0 = oUpdate.apply(this, arguments as never);
    if (e.x === 1215 && e.y === 869) {
      const stt2 = this as unknown as { idx(x: number, y: number): number };
      const i2 = stt2.idx(e.x, e.y);
      cellLog.push(`UP d${e.delay} k${(e as unknown as { kill: number }).kill} q${store.liquid[i2]}`);
    }
    return r0;
  };
  const oAdd = protoU.addWater;
  protoU.addWater = function (this: unknown, ax: number, ay: number) {
    const s = this as unknown as { numLiquid: number };
    const dbg = ax === 1215 && ay === 869;
    const stt = this as unknown as { numLiquid: number; bufCount?: number; checking?: Uint8Array; idx(x: number, y: number): number };
    const beforeN = stt.numLiquid, preB = stt.bufCount ?? 0;
    if (dbg) cellLog.push(`W0 n${beforeN} b${preB} chk${stt.checking![stt.idx(ax, ay)] ? 1 : 0} q${store.liquid[1215 + 869 * store.w]}`);
    const r = oAdd.apply(this, arguments as never);
    const afterN = (this as unknown as { numLiquid: number }).numLiquid;
    const dAfterN = afterN - beforeN;
    if (dbg) cellLog.push(dAfterN > 0 ? 'WA' : ((stt.bufCount ?? 0) - preB) > 0 ? 'WBadd' : 'WX');
    if (afterN - beforeN > 0) ops.push(`A ${++opsSeq} ${ax} ${ay} @${curCtx.x},${curCtx.y} d${curCtx.d} M${rngDrawN} U${callIdx}`);
    return r;
  };
  const oDel = protoU.delWater;
  protoU.delWater = function (this: unknown, l: number) {
    const s = this as unknown as { numLiquid: number };
    ops.push(`D ${++opsSeq} ${l} M${rngDrawN} L${s.numLiquid} U${callIdx}`);
    return oDel.apply(this, arguments as never);
  };
  const labBuf: string[] = [];
  const cellLog: string[] = [];
  const SNAP_CALLS = new Set([105,111,117,121,122,123,124,125,126,127,128,129,130,131,132]);
  const oULw = protoU.updateLiquid;
  protoU.updateLiquid = function (this: unknown) {
    callIdx++;
    const r = oULw.apply(this, arguments as never);
    // 尾块灌回后（wetCounter 归零）快照缓冲（与 rig SW_BUFDUMP 同位）
    const s2 = this as unknown as { wetCounter?: number; bufCount?: number; bufX?: Int32Array; bufY?: Int32Array };
    // 调度指纹（与 rig SW_SCHEDLOG 同式：entry=delay<<1|kill<<12|x<<16|y<<24 的 FNV）
    {
      const li = (this as unknown as { liquids?: Array<{ x: number; y: number; delay?: number; kill?: number }> }).liquids;
      let h = 2166136261 >>> 0;
      const imulc = Math.imul;
      for (let k = 0, e = li?.[0]; k < sim.numLiquid; k++, e = li?.[k]) {
        const v = (((e.delay ?? 0) << 1) >>> 0) | ((((e.kill ?? 0) << 12) >>> 0))
          | (((e.x << 16) >>> 0)) | (((e.y << 24) >>> 0));
        h = (imulc(h ^ (v >>> 0), 16777619)) >>> 0;
      }
      const nb2 = s2.bufCount ?? 0;
      for (let k = 0; k < nb2; k++) {
        h = (imulc(h ^ (((s2.bufX![k] << 16) >>> 0)), 16777619)) >>> 0;
        h = (imulc(h ^ (((s2.bufY![k] << 24) >>> 0)), 16777619)) >>> 0;
      }
      labBuf.push(`S ${callIdx} ${sim.numLiquid} ${nb2} ${s2.wetCounter} ${h.toString(16).padStart(8, '0')}`);
    }
    if (s2.wetCounter === 0) {
      if (s2.bufCount) for (let b = 0; b < s2.bufCount; b++) labBuf.push(`B ${callIdx} ${b} ${s2.bufX![b]} ${s2.bufY![b]}`);
      const liqArr = (this as unknown as { liquids?: Array<{ x: number; y: number }> }).liquids;
      if (liqArr) for (let b = 0; b < sim.numLiquid; b++) labBuf.push(`M ${callIdx} ${b} ${liqArr[b].x} ${liqArr[b].y}`);
    }
    // 调用末世界三通道快照（与 rig SW_LIQDUMP_REL 同位同编号）
    if (SNAP_CALLS.has(callIdx)) {
      const dir = `${OUT}/jrelf/rel${callIdx}`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/K.liq`, Buffer.from(store.liquid.buffer, 0, N));
      writeFileSync(`${dir}/K.act`, Buffer.from(store.flags.buffer, 0, N));
      const lty0 = new Uint8Array(N);
      for (let q = 0; q < N; q++) lty0[q] = Math.max(0, store.liquidType[q] - 1);
      writeFileSync(`${dir}/K.lty`, Buffer.from(lty0.buffer, 0, N));
    }
    return r;
  };
  const labKills: string[] = [];
  (globalThis as { __swLqKill?: unknown }).__swLqKill = (
    x: number, y: number, sheet: number, fx: number, fy: number, liq: number, lty: number,
  ) => { labKills.push(`K ${rngDrawN} ${x} ${y} s${sheet} f${fx}/${fy} l${liq}/${lty}`); };

  console.log(`[entry] (vs098 pre-settle reference below)`);
  cmpDump(98, 'Settle_Liquids_Again');
  sim.quickWater();
  sim.waterCheck();
  sim.quickSettle = true;
  console.log(`[after initial WC] G=${rngDrawN}`);
  for (let round = 1; round <= 10; round++) {
    const MAX_ITER = (sim.numLiquid + sim.bufferLen) * 5;
    let it = 0;
    while (sim.numLiquid > 0 && it < MAX_ITER) { sim.updateLiquid(); it++; }
    sim.waterCheck();
    console.log(`round${round}: iters=${it} G=${rngDrawN}`);
    writeFileSync(`${OUT}/lab-round-${String(round).padStart(2, '0')}.mark`, `${it} ${rngDrawN}`);
  }
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);
  delete (globalThis as { __swLqKill?: unknown }).__swLqKill;
  LiquidSim.r30Sink = null;
  protoU.update = oUpdate; protoU.addWater = oAdd; protoU.delWater = oDel;
  protoU.updateLiquid = oULw;

  writeFileSync(`${OUT}/lab-r30.txt`, r30.join('\n'));
  writeFileSync(`${OUT}/lab-kills.txt`, labKills.join('\n'));
  writeFileSync(`${OUT}/lab-ops.txt`, ops.join('\n'));
  writeFileSync(`${OUT}/lab-buf.txt`, labBuf.join('\n'));
  writeFileSync(`${OUT}/lab-cell.txt`, cellLog.join('\n'));
  console.log(`=== final ===`);
  cmpDump(98, 'Settle_Liquids_Again');
}, 900_000);
