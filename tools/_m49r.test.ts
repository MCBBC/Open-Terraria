// #49 SettleLiquids 独立重放器（VVV 批 2026-08-18）：dump48 直构重放 settle，
// 对拍 dump49 八通道 + 管线保真 + 烧除计数。用法：
//   cd game && SW_M49R=1 npx vitest run tools/_m49r.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';

const RUN = process.env.SW_M49R === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

interface Snap { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; wire: Uint8Array }
const snapStore = (st: TileStore): Snap => ({
  type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(), liquid: st.liquid.slice(),
  liquidType: st.liquidType.slice(), half: st.half.slice(), slope: st.slope.slice(),
  frameX: st.frameX.slice(), frameY: st.frameY.slice(), wire: st.wire.slice(),
});

/** 8 通道差 vs dump idx（与 _mile8 同口径） */
function diffGolden(o: Snap, idx: number) {
  const t = rd16(idx, 'typ'), a = rd8(idx, 'act'), w = rd16(idx, 'wal'), l = rd8(idx, 'liq');
  const hf = rd8(idx, 'half'), sl = rd8(idx, 'slope'), lt = rd8(idx, 'lty');
  let dA = 0, dT = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0;
  const pairsT: Record<string, number> = {}, pairsY: Record<string, number> = {};
  const liqDiff: number[] = [];
  for (let i = 0; i < N; i++) {
    const va = a[i] !== 0, ja = o.flags[i] !== 0;
    if (va !== ja) dA++;
    const vt = va ? t[i] : 0, jt = ja ? (SHEET[o.type[i]] ?? -1) : 0;
    if (vt !== jt) { dT++; const k = `T${vt}>${jt}`; pairsT[k] = (pairsT[k] ?? 0) + 1; }
    if (w[i] !== o.wall[i]) dW++;
    if (l[i] !== o.liquid[i]) { dL++; if (liqDiff.length < 400) liqDiff.push(i); }
    const vl = l[i] > 0 ? lt[i] + 1 : 0, jl = o.liquid[i] > 0 ? o.liquidType[i] : 0;
    if (vl !== jl) { dLt++; const k = `Y${vl}>${jl}`; pairsY[k] = (pairsY[k] ?? 0) + 1; }
    if (hf[i] !== o.half[i]) dHf++;
    if (sl[i] !== o.slope[i]) dSl++;
  }
  const top = (o2: Record<string, number>) => Object.entries(o2).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' ');
  return { dA, dT, dW, dL, dLt, dHf, dSl, pairsT: top(pairsT), pairsY: top(pairsY), liqDiff };
}

/** 烧除计数：输入(active 60 丛林草) → 输出(active 59 泥) 的格数 */
function burnCount(inp: Snap, out: Snap): number {
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (inp.flags[i] && SHEET[inp.type[i]] === 60 && out.flags[i] && SHEET[out.type[i]] === 59) n++;
  }
  return n;
}

(RUN ? it : it.skip)('#49 settle replay from dump48', async () => {
  // ── ① 管线跑到槽 8 末抓前置态；槽 9（沉降）跑完抓后置态与 world 字段 ──
  let pre: Snap | null = null, post: Snap | null = null, solid8: Map<number, boolean> | null = null;
  let wFields: { seed: number; shimmerX: number; shimmerY: number; genWaterLine: number } | null = null;
  let dungeonExempt: { x0: number; y0: number; x1: number; y1: number } | null | undefined = undefined;
  class Ab extends Error { constructor() { super('M49R-ABORT'); } }
  try {
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 0,
      onWorldPartial: (w, i) => {
        if (i === 8) {
          pre = snapStore(w.store);
          solid8 = snapshotGenSolid();
        } else if (i === 9) {
          post = snapStore(w.store);
          wFields = { seed: w.seed, shimmerX: w.shimmerX, shimmerY: w.shimmerY, genWaterLine: w.genWaterLine };
          dungeonExempt = w.genDungeonExempt;
          throw new Ab();
        }
      },
    });
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause;
    if (!(e instanceof Ab || cause instanceof Ab)) throw e;
  }
  if (!pre || !post || !solid8 || !wFields) throw new Error('capture failed');
  const preS = pre as Snap, postS = post as Snap, solid = solid8 as Map<number, boolean>;
  const wf = wFields as { seed: number; shimmerX: number; shimmerY: number; genWaterLine: number };
  console.log(`captured pre/post@slot8/9; seed=${wf.seed} shimmer=(${wf.shimmerX},${wf.shimmerY}) waterLine=${wf.genWaterLine} dungeonExempt=${dungeonExempt ? `(${dungeonExempt.x0}..${dungeonExempt.x1},${dungeonExempt.y0}..${dungeonExempt.y1})` : 'null'}`);

  // golden 侧 48→49 烧除数（vanilla 基准）
  {
    const t48 = rd16(48, 'typ'), a48 = rd8(48, 'act'), t49 = rd16(49, 'typ'), a49 = rd8(49, 'act');
    let vb = 0;
    for (let i = 0; i < N; i++) if (a48[i] && t48[i] === 60 && a49[i] && t49[i] === 59) vb++;
    console.log(`vanilla 48→49 烧除(60→59) = ${vb} 格`);
  }

  // ── ② 重放器 ──
  // 阶段追踪：打点 quickWater/每次 waterCheck/updateLiquid 后簇 A (x424..436,y353..362) 液体剖面
  const probeCells: Array<[number, number]> = [];
  for (let y = 353; y <= 362; y++) for (let x = 424; x <= 436; x++) probeCells.push([x, y]);
  const tracePhase = (st: TileStore, tag: string) => {
    const l49 = rd8(49, 'liq');
    const rows: string[] = [];
    for (let y = 355; y <= 359; y++) {
      const cells: string[] = [];
      for (let x = 424; x <= 436; x++) {
        const i = y * W + x;
        const js = st.liquid[i];
        const v = l49[i];
        const ch2 = js === 0 ? '.' : js < 10 ? String(js) : String.fromCharCode(97 + Math.floor(js / 10) - 1);
        cells.push(js === v ? ch2 : `<js${js}/v${v}>`);
      }
      rows.push(`y=${y} ${cells.join(' ')}`);
    }
    console.log(`  [phase ${tag}]\n    ${rows.join('\n    ')}`);
    // 细查 (426,356)：flags/type/sheet/liquid
    const k = 356 * W + 426;
    console.log(`    cell(426,356): flags=${st.flags[k]} type=${st.type[k]} sheet=${SHEET[st.type[k]]} liq=${st.liquid[k]}`);
  };
  const runReplay = async (label: string, build: () => TileStore, trace = false): Promise<{ out: Snap; d: ReturnType<typeof diffGolden> }> => {
    const st = build();
    restoreGenSolid(solid);
    const world = new World(W, H, wf.seed, 'm49r', true);
    world.store = st;
    world.shimmerX = wf.shimmerX; world.shimmerY = wf.shimmerY;
    world.genWaterLine = wf.genWaterLine;
    world.genDungeonExempt = dungeonExempt ?? null;
    const rng = new RNG(wf.seed); // pass 头 reseed(seed) 同源
    if (trace) {
      // LiquidSim 原型打点：阶段边界 + 每轮
      let wcCount = 0, ulCount = 0;
      const proto = Object.getPrototypeOf(settleWorldLiquids as never) as never; // 占位
      void proto;
      const simApi = (await import('../src/world/liquid/LiquidSim')).LiquidSim.prototype as unknown as Record<string, unknown>;
      const oWC = simApi.waterCheck as (this: unknown) => void;
      const oUL = simApi.updateLiquid as (this: never) => void;
      const stRef = { st };
      (simApi as { waterCheck: unknown }).waterCheck = function (this: { world: { store: TileStore } }) {
        oWC.call(this);
        wcCount++;
        if (wcCount <= 3 || wcCount >= 11) tracePhase(stRef.st, `waterCheck#${wcCount}`);
      };
      (simApi as { updateLiquid: unknown }).updateLiquid = function (this: never) {
        oUL.call(this);
        ulCount++;
        if (ulCount === 1 || ulCount % 400 === 0) tracePhase(stRef.st, `updateLiquid#${ulCount}`);
      };
      try {
        await settleWorldLiquids(world, 'gen', undefined, rng);
      } finally {
        (simApi as { waterCheck: unknown }).waterCheck = oWC;
        (simApi as { updateLiquid: unknown }).updateLiquid = oUL;
      }
      console.log(`  [trace] updateLiquid 总计 ${ulCount} 次, waterCheck ${wcCount} 次`);
    } else {
      await settleWorldLiquids(world, 'gen', undefined, rng);
    }
    const out = snapStore(st);
    const d = diffGolden(out, 49);
    console.log(`[${label}] vs dump49: A=${d.dA} T=${dT(d)} W=${d.dW} L=${d.dL} Lt=${d.dLt} Hf=${d.dHf} Sl=${d.dSl} | T-pairs ${d.pairsT} | Y-pairs ${d.pairsY} | 烧除(60→59)=${burnCount(preS, out)}`);
    return { out, d };
  };
  const dT = (d: { dT: number }) => d.dT;

  // full：管线槽 8 末原样输入（重放保真性验证）
  const full = await runReplay('full·管线输入', () => {
    const st = new TileStore(W, H);
    st.type.set(preS.type); st.flags.set(preS.flags); st.wall.set(preS.wall);
    st.liquid.set(preS.liquid); st.liquidType.set(preS.liquidType);
    st.half.set(preS.half); st.slope.set(preS.slope);
    st.frameX.set(preS.frameX); st.frameY.set(preS.frameY); st.wire.set(preS.wire);
    return st;
  });
  // 重放保真：full vs 管线 post（应全零）
  {
    let dA = 0, dT2 = 0, dL = 0, dLt = 0, first = '';
    for (let i = 0; i < N; i++) {
      const bad = full.out.flags[i] !== postS.flags[i]
        || (full.out.flags[i] && (SHEET[full.out.type[i]] ?? -1) !== (SHEET[postS.type[i]] ?? -1))
        || full.out.liquid[i] !== postS.liquid[i]
        || (full.out.liquid[i] > 0 ? full.out.liquidType[i] : 0) !== (postS.liquid[i] > 0 ? postS.liquidType[i] : 0);
      if (!bad) continue;
      if (full.out.flags[i] !== postS.flags[i]) dA++;
      else if ((SHEET[full.out.type[i]] ?? -1) !== (SHEET[postS.type[i]] ?? -1)) dT2++;
      else if (full.out.liquid[i] !== postS.liquid[i]) dL++;
      else dLt++;
      if (!first) first = `(${i % W},${(i / W) | 0})`;
    }
    console.log(`[重放保真] full vs 管线槽9末: act=${dA} typ=${dT2} liq=${dL} lty=${dLt} first=${first || '·'}`);
  }

  // clean：golden48 八通道 + JS frame/wall/wire（隔离 #32 等输入债）
  const clean = await runReplay('clean·golden输入', () => {
    const t48 = rd16(48, 'typ'), a48 = rd8(48, 'act'), l48 = rd8(48, 'liq'), lt48 = rd8(48, 'lty');
    const hf48 = rd8(48, 'half'), sl48 = rd8(48, 'slope');
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      st.flags[i] = a48[i] ? 1 : 0;
      st.type[i] = REV.get(t48[i]) ?? 0;            // ghost 保真
      st.liquid[i] = l48[i]; st.liquidType[i] = l48[i] > 0 ? lt48[i] + 1 : 0;
      st.half[i] = hf48[i]; st.slope[i] = sl48[i];
      st.wall[i] = preS.wall[i]; st.frameX[i] = preS.frameX[i]; st.frameY[i] = preS.frameY[i];
      st.wire[i] = preS.wire[i];
    }
    return st;
  }, true);
  {
    const l48 = rd8(48, 'liq'), lt48 = rd8(48, 'lty'), l49 = rd8(49, 'liq'), lt49 = rd8(49, 'lty');
    const rows: string[] = [];
    let nY1 = 0, nY2 = 0;
    for (const i of clean.d.liqDiff) {
      const x = i % W, y = (i / W) | 0;
      const vl = l49[i] > 0 ? lt49[i] + 1 : 0;
      if (vl === 1) nY1++; else if (vl === 2) nY2++;
      rows.push(`(${x},${y}) v48=${l48[i]}/${lt48[i]} v49=${l49[i]}/${lt49[i]} js=${clean.out.liquid[i]}/${clean.out.liquid[i] > 0 ? clean.out.liquidType[i] - 1 : 0}`);
    }
    console.log(`clean 液体差全列（${rows.length} 格；Y1=${nY1} Y2=${nY2}）：\n  ${rows.join('\n  ')}`);
    // 落盘 JS 重放末态供外部分析
    const out: number[] = [];
    for (let i = 0; i < N; i++) out.push(clean.out.liquid[i], clean.out.liquidType[i], clean.out.flags[i], SHEET[clean.out.type[i]] ?? -1);
    writeFileSync('/tmp/m49r_js49.bin', Buffer.from(out));
  }
}, 580_000);
