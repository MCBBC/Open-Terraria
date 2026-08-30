// 一次性诊断（IIIII70b 批）：DRUNK #49 Settle_Liquids 单 pass 反演重放。
// 复用 IIII75 范式（_iii75hv.test.ts）：①SW_I76CAP=1 在「结构」槽末（=「水体沉降」
//   槽头前界，onWorldPartial 槽名锚定）深拷 store 13 通道+gs+GenSolid 覆写快照
//   → $OUT(base_*)；②SW_I76REPLAY=1 hydrate 基座 → new RNG(gs.seed) → 真
//   liquidSettlePass(ctx,true,gs)（生产函数直调，接线零复刻）→ 对拍 G2 dump#049
//   八通道（基座自检 vs #048，DRUNK 0..48 全绿 ⇒ 应全零）。
// 取证钩：SW_I76_DIFFLIST=1 全差清单→difflist.txt；SW_I76_SAVE=1 落 replay_*.bin；
//   __swOnRoll 样本级掷数计镜（FNV 与 x86 pc.txt R 口径同构——本链 G2 未记账，
//   仅作修前/修后内部对拍）。
// 用法：cd game && SW_I76CAP=1 npx vitest run tools/_iii76st.test.ts
//       cd game && SW_I76REPLAY=1 npx vitest run tools/_iii76st.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, liquidSettlePass, lastGenState as lastGs } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { setBoulderSolidity } from '../src/world/gen/vanilla/GenSolid';
import {
  resetGenSolid, restoreGenSolid, snapshotGenSolid,
} from '../src/world/gen/vanilla/GenSolid';

const RUN_CAP = process.env.SW_I76CAP === '1';
const RUN_RE = process.env.SW_I76REPLAY === '1';
const RUN_BISECT = process.env.SW_I76BISECT === '1';
import { sbDenyAll } from '../src/world/gen/vanilla/SkyblockPass';
const OUT = process.env.SW_I76_OUT ?? '/tmp/iii76-out';
// 「水体沉降」槽头的上一槽（onWorldPartial 在该槽 run 完成即回调；与下一槽头之间
// 只有 driver 的 rng.reseed——store 状态等价于沉降槽头）
const CAP_LABEL = process.env.SW_I76_CAPLABEL ?? '结构';
const CMP_IDX = Number(process.env.SW_I76_CMP ?? 49);
const G2 = process.env.SW_I76_G2 ?? '/tmp/iii47-out/x86-drunk';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
const SEED = process.env.SW_M8_SEED ?? '51620200';

if (RUN_CAP || RUN_RE) mkdirSync(OUT, { recursive: true });

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function serializeStore(st: TileStore, dir: string): void {
  const hdr: Record<string, number | string> = { w: st.w, h: st.h };
  for (const c of CHANS) {
    const a = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
    const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    writeFileSync(`${dir}/base_${c}.bin`, b);
    hdr[`${c}_len`] = a.length;
  }
  writeFileSync(`${dir}/base_hdr.json`, JSON.stringify(hdr));
}

type AnyGs = Record<string, unknown>;
function serVal(v: unknown): unknown {
  if (v instanceof Uint8Array || v instanceof Int8Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Uint16Array || v instanceof Int16Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Uint32Array || v instanceof Int32Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Float32Array || v instanceof Float64Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (Array.isArray(v)) return v.map(serVal);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) o[k] = serVal((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}
function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(desVal);
  if (v && typeof v === 'object') {
    const o = v as { __t?: string; d?: unknown[] };
    if (o.__t) {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
      return new Ctor((o.d ?? []).length).fill ? (() => { const arr = new Ctor((o.d ?? []).length) as { set(a: unknown[]): void }; arr.set(o.d!); return arr; })() : null;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)('capture base at settle slot head (drunk)', async () => {
  let liveStore: TileStore | null = null;
  let done = false;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1,
      seedFlags: { drunkWorld: true },
      onWorldPartial: (w2, _i, pn) => {
        if (!done && pn === CAP_LABEL) {
          liveStore = w2.store as never as TileStore;
          const gs = lastGs();
          if (!gs) throw new Error('gs missing');
          writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
          writeFileSync(`${OUT}/base_gensolid.json`, JSON.stringify([...snapshotGenSolid()].map(([id, s]) => [id, s])));
          serializeStore(liveStore!, OUT);
          console.log(`captured @槽末${CAP_LABEL} store ch=${CHANS.length} gs keys=${Object.keys(gs).length}`);
          done = true;
        }
      },
    });
  } finally { /* restore not needed */ }
  if (!done) throw new Error(`capture failed: ${CAP_LABEL} partial never hit`);
}, 600_000);

(RUN_BISECT ? it : it.skip)('waterCheck candidate audit vs vanilla predicate', async () => {
  const { st, gs, gensolid } = hydrate();
  resetGenSolid();
  restoreGenSolid(new Map(gensolid));
  const world = new World(st.w, st.h, gs.seed, '_iii76w', true);
  world.store = st;
  world.groundLevel = gs.worldSurface; world.rockLevel = gs.rockLevel;
  world.lavaLine = gs.lavaLine; world.shimmerX = gs.shimmerX; world.shimmerY = gs.shimmerY;
  world.seedFlags = { drunkWorld: true };
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = world.shimmerX > 0 ? { x: world.shimmerX, y: world.shimmerY } : null;
  sim.genWaterLine = gs.waterLine;
  // 只跑 quickWater（watch 盒关闭）→ 拷贝一份「wc 扫描候选」账本：
  // 复刻 waterCheckInner 的入列门，但把每次 addWater(x,y) 记账并打印聚集
  const seen: Array<{ x: number; y: number; why: string[] }> = [];
  const liqWire = st.liquid.slice();
  const ltyWire = st.liquidType.slice();
  sim.worldGenTilesIgnoreWater(true);
  sim.quickWater();
  sim.worldGenTilesIgnoreWater(false);
  // 审计：对每格按 vanilla cs:81190-81217 谓词重算触发类别
  const blIs = (x: number, y: number): boolean => (sim as unknown as { blocksLiquid: (x: number, y: number) => boolean }).blocksLiquid(x, y);
  let nCand = 0;
  const cats: Record<string, number> = {};
  for (let x = 1; x < st.w - 1; x++) {
    for (let y = st.h - 2; y > 0; y--) {
      const i = y * st.w + x;
      if (st.liquid[i] === 0) continue;
      const t = st.type[i];
      const id = i - 1, ir = i + 1, iu = i - st.w, iw = i + st.w;
      const nactive = st.flags[i] !== 0;
      let solidBr = false;
      if (t >= 0 && nactive && (sim as unknown as { solidNP: Uint8Array }).solidNP[t] === 1) {
        solidBr = true;
      }
      if (solidBr) continue;
      const whys: string[] = [];
      const dq = st.liquid[iw];
      if (!blIs(x, y + 1) && dq < 255) {
        if (dq > 250) whys.push('fillBelow');
        else whys.push('downFlow');
      }
      if (!blIs(x - 1, y) && st.liquid[id] !== st.liquid[i]) whys.push('sideL');
      else if (!blIs(x + 1, y) && st.liquid[ir] !== st.liquid[i]) whys.push('sideR');
      if (st.liquidType[i] === 2) {
        if ((st.liquid[id] > 0 && st.liquidType[id] !== 2) || (st.liquid[ir] > 0 && st.liquidType[ir] !== 2)
          || (st.liquid[iu] > 0 && st.liquidType[iu] !== 2) || (dq > 0 && st.liquidType[iw] !== 2)) whys.push('lavaAdj');
      }
      if (whys.length) {
        nCand++;
        for (const w of whys) cats[w] = (cats[w] ?? 0) + 1;
        if (seen.length < 40000) seen.push({ x, y, why: whys });
      }
    }
  }
  console.log(`[wc-audit] candidates=${nCand} cats=${JSON.stringify(cats)}`);
  // 打印触发格簇摘要（按 64 块聚合）
  const agg = new Map<string, number>();
  for (const s of seen) {
    const k = `${Math.floor(s.x / 64)}:${Math.floor(s.y / 32)}`;
    agg.set(k, (agg.get(k) ?? 0) + 1);
  }
  console.log('[wc-audit] clusters:', [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24)
    .map(([k, n]) => `${k}x${n}`).join(' '));
  void liqWire; void ltyWire;
}, 600_000);

(RUN_BISECT ? it : it.skip)('phase bisector: settle pipeline stage-by-stage ROI probes', async () => {
  const { st, gs, gensolid } = hydrate();
  // GenSolid 还原（同 replay）
  resetGenSolid();
  restoreGenSolid(new Map(gensolid));
  const world = new World(st.w, st.h, gs.seed, '_iii76b', true);
  world.store = st;
  world.groundLevel = gs.worldSurface;
  world.rockLevel = gs.rockLevel;
  world.lavaLine = gs.lavaLine;
  world.shimmerX = gs.shimmerX;
  world.shimmerY = gs.shimmerY;
  world.seedFlags = { drunkWorld: true };
  // === replicate liquidSettlePass wiring (WorldGen.ts:496-557) ===
  if (sbDenyAll(gs.seedFlags)) return;
  {
    // oceanStrip 转水全扫（cs:16221-16231）
    const oceanLevel = (world.groundLevel + world.rockLevel) / 2 + 40;
    for (let x = 0; x < st.w; x++) {
      if (x >= 380 && x <= st.w - 380) continue;
      for (let y = 0; y < st.h; y++) {
        if (y > oceanLevel) break;
        const i = y * st.w + x;
        if (st.liquid[i] > 0 && st.liquidType[i] !== 1) st.liquidType[i] = 1;
      }
    }
  }
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) {
    world.genDungeonExempt = null;
  } else {
    const edge = Math.floor(world.w * 0.05);
    const mid = Math.floor(world.w * 0.55);
    world.genDungeonExempt = gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
      : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 };
  }
  world.genRemixWater = null;
  // === replicate settleWorldLiquids(world,'gen') body (settle.ts) with phase probes ===
  const sim = new LiquidSim(world);
  const rng = new RNG(gs.seed);
  sim.passRand = (max) => rng.nextInt(max);
  sim.passRng = rng;
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = world.shimmerX > 0 ? { x: world.shimmerX, y: world.shimmerY } : null;
  if (world.genWaterLine > 0) {
    sim.genWaterLine = world.genWaterLine;
    const d = world.genDungeonExempt;
    if (d) {
      sim.dungeonWaterExempt = (x, y, w) =>
        x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1
        && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99));
    }
  }
  sim.remixWorldGen = !!world.seedFlags?.remix;
  sim.dualDungeonsSeed = !!world.seedFlags?.dualDungeons;
  sim.applyGenSolidOverrides(snapshotGenSolid());
  sim.worldGenTilesIgnoreWater(true);

  const ROIS: Array<[string, number, number, number, number]> = [
    ['zoneA(dungeon pool)', 3765, 492, 3830, 506],
    ['zoneB(shaft)', 3765, 560, 3830, 585],
    ['lake(near surface)', 2790, 104, 2925, 132],
    ['hell(top rows)', 1900, 1058, 2850, 1070],
  ];
  const probe = (tag: string): void => {
    const parts: string[] = [];
    for (const [nm, x0, y0, x1, y1] of ROIS) {
      let cells = 0, vol = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * st.w + x;
        if (st.liquid[i] > 0) { cells++; vol += st.liquid[i]; }
      }
      parts.push(`${nm}: c=${cells} v=${vol}`);
    }
    console.log(`[${tag}] active=${sim.numLiquid} buf=${sim.bufferLen} | ${parts.join(' | ')}`);
    // SW_I76PHASEBIN=1：逐相液体双通道全图落盘（供离线守恒对账）
    if (process.env.SW_I76PHASEBIN === '1') {
      const wbuf = Buffer.from(st.liquid.buffer, st.liquid.byteOffset, st.liquid.byteLength);
      const tbuf = Buffer.from(st.liquidType.buffer, st.liquidType.byteOffset, st.liquidType.byteLength);
      writeFileSync(`${OUT}/phase_${tag.replace(/[^a-zA-Z0-9]/g, '_')}_liq.bin`, wbuf);
      writeFileSync(`${OUT}/phase_${tag.replace(/[^a-zA-Z0-9]/g, '_')}_lty.bin`, tbuf);
    }
  };
  probe('after_wire');
  // ★SW_I76WATCH=1：SettleWaterAt 写回盒观察钩（origin→落点 全账）
  const watchOn = process.env.SW_I76WATCH === '1';
  if (watchOn) {
    const bx = process.env.SW_I76_BOX ?? '3765,3830,490,508';
    const bb = bx.split(',').map(Number);
    LiquidSim.settleBox = { x0: bb[0], x1: bb[1], y0: bb[2], y1: bb[3] };
    const log: string[] = [];
    LiquidSim.settleProbe = (ph, ox, oy, x, y, amt, lty, fell, wall) => {
      if (log.length < 200) log.push(`${ph} o=(${ox},${oy}) -> (${x},${y}) amt=${amt} srcType=${lty} fell=${fell?1:0} wall=${wall}`);
      else if (log.length === 200) log.push('...capped');
    };
    (globalThis as unknown as { __iii76WatchDump?: () => void }).__iii76WatchDump = () => console.log(`WATCH(${log.length}):\n` + log.join('\n'));
    // 停滞层 tile 表：watch 盒内 y 每行的活性格 sheet 分布（定位阻挡物族）
    const fam: Record<number, string> = {};
    for (let y = 492; y <= 508; y++) {
      const ids = new Map<number, number>();
      for (let x = 3765; x <= 3830; x++) {
        const i = y * st.w + x;
        if (!st.flags[i]) continue;
        ids.set(st.type[i], (ids.get(st.type[i]) ?? 0) + 1);
      }
      if (ids.size) {
        fam[y] = [...ids.entries()].map(([t, n]) => `${t}(sh${SHEET[t]},${n})`).join(' ');
      }
    }
    console.log('WATCHBOX tiles:', JSON.stringify(fam));
  }
  sim.quickWater();
  if (watchOn) (globalThis as unknown as { __iii76WatchDump?: () => void }).__iii76WatchDump?.();
  probe("after_quickWater");
  sim.waterCheck();
  probe("after_waterCheck1");
  let iter = 0;
  let num5 = sim.numLiquid + sim.bufferLen;
  for (let round = 0; round < 10; round++) {
    const MAX_ITER = (sim.numLiquid + sim.bufferLen) * 5;
    let roundIter = 0;
    while (sim.numLiquid > 0 && roundIter < MAX_ITER) {
      sim.updateLiquid();
      iter++; roundIter++;
    }
    sim.waterCheck();
    console.log(`[round ${round}] iters=${roundIter} endActive=${sim.numLiquid}`);
    probe(`after_round${round}`);
  }
  void num5; void iter;
  sim.quickSettle = false;
  setBoulderSolidity(true);
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState; gensolid: Array<[number, boolean]> } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch ${buf.length} != ${len * bytesPer}`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  const gensolid = JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>;
  return { st, gs, gensolid };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN_RE ? it : it.skip)(`replay liquidSettlePass on base and compare vs x86 dump#${CMP_IDX}`, async () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  const xt = le16(`${pre}.typ`), xa = readFileSync(`${pre}.act`), xw = le16(`${pre}.wal`),
    xl = readFileSync(`${pre}.liq`), xhf = readFileSync(`${pre}.half`), xsl = readFileSync(`${pre}.slope`),
    xlt = readFileSync(`${pre}.lty`), xia = readFileSync(`${pre}.inact`);
  const { st, gs, gensolid } = hydrate();
  console.log('gs:', JSON.stringify({
    worldSurface: gs.worldSurface, rockLevel: gs.rockLevel, waterLine: gs.waterLine,
    lavaLine: gs.lavaLine, dungeonSide: gs.dungeonSide,
    flags: Object.entries(gs.seedFlags as object).filter(([, v]) => v),
  }));
  // ★基座自检：hydrate 后先对上一层 dump(048) 八通道计数（非零=基座错）
  {
    const prePrev = `${G2}/${String(CMP_IDX - 1).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX - 1)}`;
    const ap = readFileSync(`${prePrev}.act`), tp = le16(`${prePrev}.typ`), wp = le16(`${prePrev}.wal`),
      lp = readFileSync(`${prePrev}.liq`), ltp = readFileSync(`${prePrev}.lty`);
    let dA = 0, dT = 0, dW = 0, dL = 0, dLt = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (ap[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (ap[i2] && tp[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (wp[i2] !== st.wall[i2]) dW++;
      else if (lp[i2] !== st.liquid[i2]) dL++;
      else if ((lp[i2]! > 0 ? ltp[i2]! + 1 : 0) !== (st.liquid[i2]! > 0 ? st.liquidType[i2]! : 0)) dLt++;
    }
    console.log(`[base selfcheck vs #${CMP_IDX - 1}] dAct=${dA} dTyp=${dT} dWal=${dW} dLiq=${dL} dLty=${dLt}`);
  }
  // GenSolid 覆写还原（sim 构造时 applyGenSolidOverrides(snapshotGenSolid()) 读本表）。
  // ★snapshot 键=内部 tile id，restoreGenSolid 原样搬运——勿经 flipGenSolid（其入参
  //   是 sheet id，键域不同会错翻/漏翻，首跑曾因此差 L=4172 vs 生产 3699）
  resetGenSolid();
  restoreGenSolid(new Map(gensolid));
  // World 壳（LiquidSim 只读 world.store/genWaterLine/genDungeonExempt/genRemixWater/
  //   shimmerX/Y/seedFlags——groundLevel/rockLevel 参与 oceanLevel 推导）
  const world = new World(st.w, st.h, gs.seed, '_iii76', true);
  world.store = st;
  world.groundLevel = gs.worldSurface;
  world.rockLevel = gs.rockLevel;
  world.lavaLine = gs.lavaLine;
  world.shimmerX = gs.shimmerX;
  world.shimmerY = gs.shimmerY;
  world.seedFlags = { drunkWorld: true };
  // ★SW_I76TRACEORG=x,y：该 origin 的逐 probe 决策迹（P 行）
  const trOrg = process.env.SW_I76TRACEORG;
  if (trOrg) {
    const [tx, ty] = trOrg.split(',').map(Number);
    LiquidSim.trOn = true;
    LiquidSim.trX = tx;
    LiquidSim.trY = ty;
    LiquidSim.trSeq = 0;
  }
  // ★SW_I76SETL=1：SettleWaterAt 全量事件流落盘（与 x86 setl-x86.txt 段对拍）
  if (process.env.SW_I76SETL === '1' || trOrg) {
    const out = process.env.SW_I76_SETLOUT ?? `${OUT}/setl-js.txt`;
    const fh = writeFileSync; // eslint-disable-line
    const acc: string[] = [];
    let flushed = 0;
    LiquidSim.settleEv = (kind, tag) => {
      acc.push(`${kind}|${tag}`);
      if (acc.length >= 200000) {
        require('node:fs').appendFileSync(out, acc.join('\n') + '\n');
        flushed += acc.length;
        acc.length = 0;
      }
    };
    (globalThis as unknown as { __setlFlush?: () => void }).__setlFlush = () => {
      require('node:fs').appendFileSync(out, (flushed + acc.length ? acc.join('\n') + '\n' : ''));
      acc.length = 0;
    };
  }
  // ★SW_I76GRAB=x,y：该 origin 调用前抓邻域快照 → grab.json
  const grabEnv = process.env.SW_I76GRAB;
  if (grabEnv) {
    const gp = grabEnv.split(',').map(Number);
    const [gx, gy] = [gp[0], gp[1]];
    const GR = Number(process.env.SW_I76_GRABR ?? 256);
    (globalThis as unknown as Record<string, unknown>).__sw76OrigSnap = gx * H + gy;
    (globalThis as unknown as Record<string, unknown>).__sw76Grab = (ox: number, oy: number): void => {
      const R = GR;
      const dump: Record<string, unknown> = { ox, oy, w: st.w, h: st.h, R: GR };
      for (const c of ['type', 'flags', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'frameX', 'frameY', 'wire'] as const) {
        const arr = (st as unknown as Record<string, Uint16Array | Uint8Array>)[c];
        const out: number[] = [];
        for (let y = oy - R; y <= oy + R; y++) {
          for (let x = ox - R; x <= ox + R; x++) {
            const i2 = y * st.w + x;
            if (x < 0 || y < 0 || x >= st.w || y >= st.h) out.push(-1);
            else out.push(arr[i2] ?? -1);
          }
        }
        dump[c] = out;
      }
      const solidOf = (id: number): number => {
        const d = TILE_DEFS[id];
        return d && d.solid && !d.platform ? 1 : 0;
      };
      const npArr: number[] = [];
      const shArr: number[] = [];
      for (let id2 = 0; id2 < Math.min(800, TILE_DEFS.length); id2++) {
        npArr.push(solidOf(id2));
        shArr.push(typeof TILE_DEFS[id2]?.vanilla?.sheet === 'number' ? (TILE_DEFS[id2].vanilla!.sheet as number) : -1);
      }
      dump.solidNPbase = npArr;
      dump.sheetOf = shArr;
      writeFileSync(`${OUT}/grab.json`, JSON.stringify(dump));
      console.log(`[grab] captured origin (${ox},${oy})`);
    };
  }
  // 掷数计镜（样本级，与 rig R 口径同构）+ 可选调用点归因（SW_I76STACK=1）
  const rcBox = { n: 0, h: 2166136261 >>> 0 };
  const callSites = new Map<string, number>();
  (globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v: number) => {
    rcBox.n++;
    let h = rcBox.h ^ (v >>> 0);
    h = Math.imul(h, 16777619) >>> 0;
    rcBox.h = h;
    if (process.env.SW_I76STACK === '1' && (callSites.size < 64 || rcBox.n % 500 === 0)) {
      const st = new Error().stack ?? '';
      const lines = st.split('\n').slice(2, 14).map((l) => l.replace(/^.*?at /, '').replace(/\/Users\/[^ ]*game\//, ''));
      const key = lines.join(' <- ');
      callSites.set(key, (callSites.get(key) ?? 0) + 1);
    }
  };
  void callSites;
  globalThis.__iii76CallSites = callSites;
  (globalThis as unknown as { __printI76Sites?: () => void }).__printI76Sites = () => {
    const list = [...callSites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log('roll call sites:', JSON.stringify(list, null, 1).slice(0, 4000));
  };
  const t0 = Date.now();
  const rng = new RNG(gs.seed);
  await liquidSettlePass({ world, store: st, rng, surface: new Float32Array(W), cfg: {} as never }, true, gs);
  console.log(`liquidSettlePass ${Date.now() - t0}ms rolls=${rcBox.n} fnv=${(rcBox.h >>> 0).toString(16)} waterLine=${world.genWaterLine} exempt=${JSON.stringify(world.genDungeonExempt)}`);
  if (process.env.SW_I76SETL === '1') (globalThis as unknown as { __setlFlush?: () => void }).__setlFlush?.();
  if (process.env.SW_I76STACK === '1') (globalThis as unknown as { __printI76Sites?: () => void }).__printI76Sites?.();
  if (process.env.SW_I76_SAVE === '1') {
    const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
    const bufOf = (v: Uint8Array | Uint16Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    for (const [nm, v] of Object.entries(rec)) {
      if (v instanceof Uint8Array || v instanceof Uint16Array) {
        try { writeFileSync(`${OUT}/replay_${nm}.bin`, bufOf(v)); } catch { /* skip */ }
      }
    }
  }
  // 八通道对拍（mile8 同构）
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0;
  const pair = new Map<string, number>();
  const ysByKind = new Map<string, string[]>();
  let fI = -1;
  const bbox = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, -1, -1];
  const mark = (i: number): void => {
    if (fI < 0) fI = i;
    const x = i % W, y = (i / W) | 0;
    bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
  };
  const pk = (k: string, i: number): void => {
    pair.set(k, (pair.get(k) ?? 0) + 1);
    mark(i);
    const arr = ysByKind.get(k[0]);
    const cell = `${i % W},${Math.floor(i / W)}`;
    if (arr) { if (arr.length < 400) arr.push(cell); } else ysByKind.set(k[0], [cell]);
  };
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; pk(`A${va}>${ja}`, i); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; pk(`T${vt}>${jt}`, i); }
    if (xw[i] !== st.wall[i]) { dW++; pk(`W${xw[i]}>${st.wall[i]}`, i); }
    if (xl[i] !== st.liquid[i]) { dL++; pk(`L${xl[i]}>${st.liquid[i]}`, i); }
    if (xhf[i] !== st.half[i]) { dHf++; pk(`Hf${xhf[i]}>${st.half[i]}`, i); }
    if (xsl[i] !== st.slope[i]) { dSl++; pk(`Sl${xsl[i]}>${st.slope[i]}`, i); }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; pk(`Y${vl}>${jl}`, i); }
    const via = xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; pk(`Ia${via}>${jia}`, i); }
    const vg = va ? 0 : xt[i]!;
    const jg = ja ? 0 : (st.type[i] === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
    if (vg !== jg) dGh++;
  }
  if (process.env.SW_I76_KINDLOC === '1') {
    for (const [k, cells] of ysByKind) console.log(`kind ${k}: n<=400 cells ${cells.slice(0, 40).join(' ')}`);
  }
  if (process.env.SW_I76_DIFFLIST === '1') {
    const lines: string[] = [];
    for (let i = 0; i < N && lines.length < 200000; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      const vl2 = xl[i]! > 0 ? xlt[i]! + 1 : 0;
      const jl2 = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (va !== ja) { lines.push(`${i % W},${Math.floor(i / W)} act ${va}>${ja} t ${vt}>${jt}`); continue; }
      if (vt !== jt) { lines.push(`${i % W},${Math.floor(i / W)} t ${vt}>${jt}`); continue; }
      if (xw[i] !== st.wall[i]) lines.push(`${i % W},${Math.floor(i / W)} w ${xw[i]}>${st.wall[i]}`);
      else if (xl[i] !== st.liquid[i] || vl2 !== jl2) lines.push(`${i % W},${Math.floor(i / W)} l ${xl[i]}>${st.liquid[i]} y ${vl2}>${jl2}`);
    }
    writeFileSync(`${OUT}/difflist.txt`, lines.join('\n') + '\n');
    console.log(`difflist -> ${OUT}/difflist.txt (${lines.length})`);
  }
  const bad0 = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  console.log(`replay cmp vs #${CMP_IDX}_${DUMPNAME.get(CMP_IDX)}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} (Gh=${dGh}) ` +
    `${bad0 ? `✗ first=${fI < 0 ? '' : `(${fI % W},${Math.floor(fI / W)})`} bbox=[${bbox}] pairs=` + [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(' ') : '✓'}`);
}, 600_000);
