// SSSSSSSS2 g线 一次性探针（g#98 液体域离线重放实验室，用毕删）
// 配方：XXXXXX 批 §1（replay 十通道 + 窗内实测 GenSolid 快照 panel-call2 + fresh-seed RNG）
// 目标：复现初始 WC 相位；抓 lantern 组 (2749,{1100,1101})/(2739,{1107,1108}) 的
//       判定路径、kill 事件序与掷流账本（对 x86 KLOG 初始 WC 窗切片）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { translateSeed } from '../src/core/rng';
import type { RNG as RNGT } from '../src/core/rng';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

const W = 4200, H = 1200;
const REPLAY = '/tmp/vvv-out/replay';
const CAPTURE = '/tmp/w27-out/panel-call2.json';
const X_KLOG = '/tmp/w27-out/x-klog-all.txt';

function loadBins(st: TileStore): void {
  const put = (name: string, arr: Uint8Array | Uint16Array, stride: number) => {
    const buf = readFileSync(`${REPLAY}/${name}`);
    if (stride === 2) {
      (arr as Uint16Array).set(new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2).subarray(0, W * H));
    } else {
      (arr as Uint8Array).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).subarray(0, W * H));
    }
  };
  put('type.bin', st.type as unknown as Uint16Array, 2);
  put('flags.bin', st.flags, 1);
  put('frameX.bin', st.frameX as unknown as Uint16Array, 2);
  put('frameY.bin', st.frameY as unknown as Uint16Array, 2);
  put('wall.bin', st.wall as unknown as Uint16Array, 2);
  put('liquid.bin', st.liquid, 1);
  put('liquidType.bin', st.liquidType, 1);
  put('half.bin', st.half, 1);
  put('slope.bin', st.slope, 1);
  put('wire.bin', st.wire, 1);
}

/** 掷流计数包装：仅委托计数，不碰 UnifiedRandom 原型（RR⑤ 教训规避） */
class CountingRNG implements RNGT {
  draws = 0;
  hist: Record<string, number> = {};
  constructor(private inner: RNGT) {}
  private bump(k: string): void { this.draws++; this.hist[k] = (this.hist[k] ?? 0) + 1; }
  next(): number { this.bump('next'); return this.inner.next(); }
  int(min: number, max: number): number { this.bump(`int(${min},${max})`); return this.inner.int(min, max); }
  pick<T>(arr: T[]): T { this.bump('pick'); return this.inner.pick(arr); }
  nextInt(maxValue: number): number { this.bump(`nextInt(${maxValue})`); return this.inner.nextInt(maxValue); }
  reseed(seed: number): void { this.inner.reseed(seed); }
  nextIntRange(minValue: number, maxValue: number): number { this.bump(`range(${minValue},${maxValue})`); return this.inner.nextIntRange(minValue, maxValue); }
  get vanilla(): RNGT['vanilla'] { return this.inner.vanilla; }
}

(RUN ? it : it.skip)('ssss2g1 replay lab', () => {
  // ── 入口世界 ──
  const cfg = { width: W, height: H, seedText: '9293480', evil: 0 as const };
  const ctxR = runResetAndTerrain(cfg);
  const world = ctxR.world;
  const gs = ctxR.gs as unknown as Record<string, number>;
  loadBins(world.store);

  const crng = new CountingRNG(ctxR.rng);
  const caps = JSON.parse(readFileSync(CAPTURE, 'utf8')) as Array<[number, boolean]>;
  const capMap = new Map<number, boolean>(caps);

  world.genWaterLine = gs.waterLine;
  {
    const ds = gs.dungeonSide, surf = Math.floor(gs.worldSurface);
    if (ds === 0) world.genDungeonExempt = null;
    else {
      const edge = Math.floor(W * 0.05), mid = Math.floor(W * 0.55);
      world.genDungeonExempt = ds < 0
        ? { x0: edge, x1: Math.floor(W * 0.45), y0: surf + 10, y1: (H - 200) - 10 }
        : { x0: mid, x1: W - edge, y0: surf + 10, y1: (H - 200) - 10 };
    }
  }
  (world as unknown as { shimmerX: number }).shimmerX = 3966;
  (world as unknown as { shimmerY: number }).shimmerY = 724;

  const out: string[] = [];
  const snapRegion = (tag: string, x0: number, x1: number, y0: number, y1: number) => {
    const st = world.store;
    for (let y = y0; y <= y1; y++) {
      let r = `SNAP ${tag} y=${y}: `;
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        r += `${st.type[i]}${st.flags[i] & 1 ? 'A' : '.'}${st.liquid[i]}/${st.liquidType[i]}|`;
      }
      out.push(r);
    }
  };

  const killEvents: string[] = [];
  (globalThis as unknown as { __swLqKill?: unknown }).__swLqKill =
    (x: number, y: number, sheet: number, fx: number, fy: number, liq: number, lty: number) => {
      killEvents.push(`K ${crng.draws} ${x} ${y} ${sheet} ${fx} ${fy} ${liq}/${lty}`);
    };
  (globalThis as unknown as { __swKillCap?: unknown }).__swKillCap =
    (x: number, y: number, sheet: number) => {
      killEvents.push(`E ${crng.draws} ${x} ${y} ${sheet}`);
    };

  // ── 装配 sim（settle.ts gen 分支内联复制，GenSolid 用窗内快照）──
  const sim = new LiquidSim(world);
  sim.passRand = (max: number) => crng.nextInt(max);
  sim.passRng = crng;
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = { x: 3966, y: 724 };
  sim.genWaterLine = world.genWaterLine;
  {
    const d = world.genDungeonExempt;
    sim.dungeonWaterExempt = d ? (x: number, y: number, w: number) =>
      x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1 && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99)) : null;
  }
  sim.applyGenSolidOverrides(capMap);
  sim.worldGenTilesIgnoreWater(true);

  // 实例级包裹（零原型污染）：C1x2 / STF 观察窗
  const trace: string[] = [];
  const S = sim as unknown as Record<string, (...a: never[]) => void>;
  const inWin = (x: number, y: number) =>
    ((x === 2749 || x === 2739) && y >= 1095 && y <= 1115);
  const origSTF = S.squareTileFrameGen.bind(sim);
  S.squareTileFrameGen = (...a: never[]) => {
    const [x, y] = a as [number, number];
    if (inWin(x, y)) trace.push(`STF@(${x},${y}) d=${crng.draws}`);
    origSTF(...a);
  };
  const origC1x2 = S.check1x2TopGen.bind(sim);
  S.check1x2TopGen = (...a: never[]) => {
    const [x, y, sheet] = a as [number, number, number];
    if (inWin(x, y - 1) || inWin(x, y)) {
      const st = world.store;
      const af = sim['check1x2TopAnchorFail'.length ? 'check1x2TopAnchorFail' : ''] ;
      void af;
      const anchorFail = (sim as unknown as { check1x2TopAnchorFail: (ax: number, ay: number) => boolean }).check1x2TopAnchorFail(x, y - 1);
      const iB = y * W + x, iA = (y - 1) * W + x;
      trace.push(`C1x2in@(${x},${y},s${sheet}) d=${crng.draws} anchorFail=${anchorFail} ty=${st.type[iB]}/fA=${st.flags[iB]}/${st.flags[iA]} fy=${st.frameY[iB]},${st.frameY[iB + W]} fyUp=${st.frameY[iA]} tyUp=${st.type[iA]} liqBotCell=${st.liquid[iB]}/${st.liquidType[iB]}`);
    }
    origC1x2(...a);
  };

  // ── 相位推进（settleWorldLiquids gen 分支的忠实内联）──
  const phases: Array<[string, number]> = [];
  let mark = crng.draws;
  const endPhase = (name: string) => { phases.push([name, crng.draws - mark]); mark = crng.draws; };

  snapRegion('PRE-QW', 2745, 2753, 1096, 1106);
  sim.quickWater();
  endPhase('P1_quickWater');
  snapRegion('POST-QW', 2745, 2753, 1096, 1106);

  sim.waterCheck();
  endPhase('P2_waterCheck-initial');
  snapRegion('POST-WC-init', 2745, 2753, 1096, 1106);

  sim.quickSettle = true;
  for (let round = 0; round < 10; round++) {
    const maxIter = (sim.numLiquid + sim.bufferLen) * 5;
    let iter = 0;
    while (sim.numLiquid > 0 && iter < maxIter) { sim.updateLiquid(); iter++; }
    sim.waterCheck();
    endPhase(`ROUND${round}(iters=${iter})`);
  }

  out.push(`KILL_EVENTS(${killEvents.length}):`);
  out.push(killEvents.slice(0, 2000).join('\n'));
  out.push(`TRACE(2339-49区)(${trace.length}):`);
  out.push(trace.join('\n'));
  for (const [p, d] of phases) out.push(`PHASE ${p}: draws=${d}`);
  out.push(`TOTAL_DRAWS=${crng.draws}`);

  // x86 KLOG 初始 WC 窗切片对照
  const xl = readFileSync(X_KLOG, 'utf8').split('\n');
  let loIdx = -1;
  for (let i = 0; i < xl.length; i++) {
    if (xl[i].startsWith('K ') && Number(xl[i].split(' ')[1]) >= 109024700) { loIdx = i; break; }
  }
  const win: string[] = [];
  for (let i = loIdx; i < xl.length; i++) {
    const p = xl[i].split(' ');
    if (!xl[i].startsWith('K ') || Number(p[1]) > 109025600) break;
    win.push(xl[i]);
  }
  out.push(`X86_WINDOW(${win.length}) first=[${win[0]}] last=[${win[win.length - 1]}]`);
  out.push(`X86_42LINES:\n` + win.filter((l) => l.endsWith(' 42') || l.includes(' 42 ') || l.split(' ')[4] === '42').join('\n'));

  console.log('\n===== SSSS2G1 LAB =====\n' + out.join('\n') + '\n===== END =====\n');
}, 600000);
