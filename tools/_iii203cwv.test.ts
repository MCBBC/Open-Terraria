// IIII203 一次性诊断：ddual 链 #57 Wall_Variety（CaveWallVariety）离线反演-重放。
// ① SW_I203_CAP=1：全量生成 ddual 链（seed '1.1.1.0.doubledaringdangers|20260831'/evil 0），
//   经通用槽头捕获钩 __swI91Cap 在『洞穴墙变体』槽头（=薄冰槽末态）快照 store 全通道+gs
//   落盘 /tmp/iii203-out/base，随即 swAbort 停管。
// ② SW_I203_RE=1：hydrate 基座 → new RNG(gs.seed) → runCaveWallVarietyPass 对拍 G2
//   dump#057 八通道；SW_I203_SPOT=1 收 SPOT 决策行；SW_I203_DIFFLIST=1 全差清单；
//   另算 vanilla 布墙集 P_v(wal057−wal056) 与 JS 布墙集 P_j 的包含关系。
// 用法：cd game && SW_MB_1457=1 SW_I203_CAP=1 npx vitest run tools/_iii203cwv.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runCaveWallVarietyPass } from '../src/world/gen/vanilla/CaveWallsPass';
import { snapshotGenSolid, restoreGenSolid, genSolidType } from '../src/world/gen/vanilla/GenSolid';

const RUN_CAP = process.env.SW_I203_CAP === '1';
const RUN_RE = process.env.SW_I203_RE === '1';
const RUN_SIM = process.env.SW_I203_SIM === '1';
const RUN_ROLLS = process.env.SW_I203_ROLLS === '1';
const OUT = process.env.SW_I203_OUT ?? '/tmp/iii203-out';
const CMP_IDX = Number(process.env.SW_I203_CMP ?? 57);
const G2 = process.env.SW_I203_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const W = 4200, H = 1200, N = W * H;
const SEED = process.env.SW_I203_SEED ?? '1.1.1.0.doubledaringdangers|20260831';

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

(RUN_CAP ? it : it.skip)('capture base at CaveWallVariety slot head (ddual #57)', async () => {
  mkdirSync(`${OUT}/base`, { recursive: true });
  const g1 = globalThis as { __swI91Cap?: unknown };
  let done = false;
  g1.__swI91Cap = (stRaw: unknown, gRaw: unknown, _c: unknown, nm: string) => {
    if (done || nm !== '洞穴墙变体') return;
    const st = stRaw as TileStore;
    const gs = gRaw as GenState;
    if (!gs) throw new Error('gs missing');
    writeFileSync(`${OUT}/base/base_gs.json`, JSON.stringify(serVal(gs)));
    // 生成期 tileSolid 覆写表快照（管线时点状态原样搬运,离线重放恢复）
    writeFileSync(`${OUT}/base/base_gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
    serializeStore(st, `${OUT}/base`);
    console.log(`captured @${nm} (薄冰槽末) gs.seed=${gs.seed} genWS=${gs.genWorldSurface} genRL=${gs.genRockLayer} lava=${gs.lavaLine} ws=${gs.worldSurface} rock=${gs.rockLevel} shimmer=(${gs.shimmerX},${gs.shimmerY}) remix=${gs.seedFlags?.remix}`);
    done = true;
    const e = new Error('SW_I203_ABORT') as Error & { swAbort?: boolean };
    e.swAbort = true;
    throw e;
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      onWorldPartial: () => {},
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('ABORT')) throw e;
  } finally { delete g1.__swI91Cap; }
  if (!done) throw new Error('capture failed: 洞穴墙变体 slot head never hit');
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base/base_gs.json`, 'utf8'))) as GenState;
  // 生成期 tileSolid 覆写表恢复（薄冰槽末态：659/484/481-483/192/190/226/162 等在翻状态）
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${OUT}/base/base_gensolid.json`, 'utf8')) as [number, boolean][]));
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

interface Loaded { t: Uint16Array; a: Uint8Array; w: Uint16Array }
function loadDump(idx: number, DUMPNAME: Map<number, string>): Loaded {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  return { t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`) };
}

(RUN_RE ? it : it.skip)(`replay CaveWallVariety on base and compare vs x86 dump#${CMP_IDX}`, () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const xv = loadDump(CMP_IDX, DUMPNAME);
  const pv = loadDump(CMP_IDX - 1, DUMPNAME);
  const { st, gs } = hydrate();
  console.log('gs:', JSON.stringify({
    genWorldSurface: gs.genWorldSurface, genRockLayer: gs.genRockLayer, lavaLine: gs.lavaLine,
    worldSurface: gs.worldSurface, rockLevel: gs.rockLevel, shimmer: [gs.shimmerX, gs.shimmerY],
    flags: Object.entries(gs.seedFlags).filter(([, v]) => v),
  }));
  // 基座自检：hydrate 后对上一层 dump(056) act/typ/wal 计数（非零=基座错）
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #${String(CMP_IDX - 1).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX - 1)}] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #056 — capture/hydrate broken');
  }
  // SPOT 决策行捕获
  const spotLines: string[] = [];
  (globalThis as unknown as { __swCwvLog?: (s: string) => void }).__swCwvLog = (s: string) => spotLines.push(s);
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  if (RUN_ROLLS) {
    const rc = { n: 0 };
    const rp = rng as unknown as Record<string, unknown>;
    const wrap = (k: string): void => {
      const orig = rp[k] as (...a: unknown[]) => unknown;
      if (typeof orig !== 'function') return;
      rp[k] = ((...a: unknown[]) => {
        const r = orig.apply(rng, a);
        rolls.push(`${++rc.n} ${k}(${a.map((x) => String(x)).join(',')})=${String(r)}`);
        return r;
      }) as never;
    };
    for (const k of ['int', 'nextInt', 'next', 'nextIntRange', 'chance', 'pick', 'range']) wrap(k);
  }
  const t0 = Date.now();
  try {
    runCaveWallVarietyPass(st, rng, gs, undefined);
  } finally {
    delete (globalThis as unknown as { __swCwvLog?: unknown }).__swCwvLog;
  }
  writeFileSync(`${OUT}/js-spots.txt`, spotLines.join('\n') + '\n');
  if (RUN_ROLLS) writeFileSync(`${OUT}/js-rolls.txt`, rolls.join('\n') + '\n');
  console.log(`runCaveWallVarietyPass ${Date.now() - t0}ms spots=${spotLines.length} rolls=${rolls.length}`);
  // 八通道对拍（本 pass 只动 wall，其余恒 0 差）
  let dW = 0, dT = 0, dA = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const diffRows: string[] = [];
  for (let i = 0; i < N; i++) {
    if (xv.a[i] !== (st.flags[i]! & 1)) { dA++; continue; }
    if (xv.w[i] !== st.wall[i]) {
      dW++; if (fI < 0) fI = i;
      const k = `W${xv.w[i]}>${st.wall[i]}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      if (dW <= 4000) diffRows.push(`${i % W},${Math.floor(i / W)} w ${xv.w[i]}>${st.wall[i]}`);
    } else {
      const vt = xv.a[i] ? xv.t[i]! : 0;
      const jt = (st.flags[i]! & 1) ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) dT++;
    }
  }
  console.log(`replay cmp vs #${CMP_IDX}_${DUMPNAME.get(CMP_IDX)}: dA=${dA} dT=${dT} dW=${dW} ${dW ? `✗ first=(${fI % W},${Math.floor(fI / W)}) pairs=` + [...pair.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ') : '✓'}`);
  if (dW) writeFileSync(`${OUT}/difflist.txt`, diffRows.join('\n') + '\n');
  // P_v（vanilla 布墙集）vs P_j（JS 布墙集）包含关系
  const Pj: number[] = [];
  for (let i = 0; i < N; i++) if (pv.w[i] !== st.wall[i]) Pj.push(i);
  const isV = new Uint8Array(N);
  let vOnly = 0, vInJ = 0, mismatchVal = 0;
  for (let i = 0; i < N; i++) if (pv.w[i] !== xv.w[i]) {
    isV[i] = 1;
    if (pv.w[i] !== st.wall[i]) { vInJ++; if (pv.w[i] !== st.wall[i]) { if (xv.w[i] !== st.wall[i]) mismatchVal++; } } else vOnly++;
  }
  console.log(`P_v=${isV.reduce((s, v) => s + v, 0)} P_j=${Pj.length} vInJ(双方同改)=${vInJ} vOnly(仅vanilla改)=${vOnly} valMismatch(共改但值异)=${mismatchVal}`);
}, 600_000);

// ── 相 3：vanilla-exact 模拟器（Terarria1458 WorldGen.cs:16786-16846 逐字反演）──
// 与 JS runCaveWallVarietyPass 同基座同 RNG 对跑；①对拍 dump#057（全等=模拟器忠实,
// JS 的差即 JS bug）②对拍 JS 掷账流（首分歧掷=定罪点）。
(RUN_SIM ? it : it.skip)(`vanilla-exact CaveWallVariety simulation vs x86 dump#${CMP_IDX} and vs JS rolls`, () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const xv = loadDump(CMP_IDX, DUMPNAME);
  const { st, gs } = hydrate();
  const w2 = st.w, h2 = st.h;
  const flags = st.flags, type = st.type, wall = st.wall, wire = st.wire;
  const idx = (x: number, y: number): number => y * w2 + x;
  // 原版 sheet id 视图
  const sheetOf = (i: number): number => (SHEET[type[i]!] >= 0 ? SHEET[type[i]!]! : 9999);
  // SolidOrSlopedTile（cs:70523）: active && tileSolid && !tileSolidTop && !inActive
  const solidOrSloped = (i: number): boolean => {
    if (!(flags[i]! & 1)) return false;
    if ((wire[i]! >>> 5) & 1) return false;
    const t = type[i]!;
    const def = TILE_DEFS[t];
    if (!def) return false;
    if (!genSolidType(t)) return false;
    if (def.platform) return false;
    return true;
  };
  const TOUCH6 = new Set([147, 161, 396, 397, 70, 191]);
  const LARGE = new Set([146, 147, 167, 179, 185, 224, 274, 323, 324, 325, 326, 327, 328, 329, 330, 354, 355, 358, 359, 362, 363, 366]);
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  {
    const rp = rng as unknown as Record<string, unknown>;
    const wrap = (k: string): void => {
      const orig = rp[k] as (...a: unknown[]) => unknown;
      rp[k] = ((...a: unknown[]) => {
        const r = orig.apply(rng, a);
        rolls.push(`${++rc.n} ${k}(${a.map((x) => String(x)).join(',')})=${String(r)}`);
        return r;
      }) as never;
    };
    for (const k of ['int', 'nextInt', 'next', 'nextIntRange', 'chance', 'pick', 'range']) wrap(k);
  }
  const frameDraw = (fx: number, fy: number): void => {
    if (fx <= 0 || fy <= 0 || fx >= w2 - 1 || fy >= h2 - 1) return;   // WallFrame 头门
    const wl = wall[idx(fx, fy)]!;
    if (wl === 0) return;
    if (LARGE.has(wl)) return;
    rng.nextInt(3);
    if (wl === 21) rng.nextInt(2);
  };
  const wsGen = Math.trunc(gs.genWorldSurface);
  const num20 = Math.trunc(300 * (w2 * h2) / 5040000);
  let num2 = num20, num4 = 100000;
  let placed = 0, rejected = 0, iter = 0;
  const spotLog: string[] = [];
  while (num2 > 0 && num4 > 0) {
    iter++;
    let px = rng.int(2, w2 - 3);
    let py = rng.int(wsGen, h2 - 191);
    // shimmer 距离环（本链 shimmerPosition 无效域→0 重掷,与 JS 同跳过）
    while (gs.shimmerX >= 0 && Math.hypot(px - gs.shimmerX, py - gs.shimmerY) < 150) {
      px = rng.int(2, w2 - 3);
      py = rng.int(wsGen, h2 - 191);
    }
    const i0 = idx(px, py);
    if (!(flags[i0]! & 1)) continue;
    const t0 = sheetOf(i0);
    const isJungle = t0 === 60;
    let num5 = 0;
    if (isJungle) num5 = 204 + rng.nextInt(4);
    else if (t0 === 1 && wall[idx(px, py - 1)]! === 0) {
      num5 = py < gs.genRockLayer ? 196 + rng.nextInt(4)
        : (py >= gs.lavaLine ? 208 + rng.nextInt(4) : 212 + rng.nextInt(4));
    }
    if (num5 !== 0 && !(flags[idx(px, py - 1)]! & 1)) {
      let foundInvalid = false;
      const cells = new Set<number>();
      const queue: number[] = [idx(px, py - 1)];
      let qh = 0, quota = 1000;
      while (qh < queue.length && quota > 0) {
        const ci = queue[qh++]!;
        if (cells.has(ci)) continue;
        if (solidOrSloped(ci)) continue;   // IsNotSolid Fail → 不入形不扩邻
        cells.add(ci); quota--;
        if (!foundInvalid) {
          const cx = ci % w2, cy = (ci / w2) | 0;
          for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
            const ni = idx(cx + dx, cy + dy);
            if ((flags[ni]! & 1) && TOUCH6.has(sheetOf(ni))) { foundInvalid = true; break; }
          }
        }
        const cx = ci % w2, cy = (ci / w2) | 0;
        if (cx + 1 < w2 - 1) queue.push(ci + 1);
        if (cx - 1 >= 1) queue.push(ci - 1);
        if (cy + 1 < h2 - 1) queue.push(ci + w2);
        if (cy - 1 >= 1) queue.push(ci - w2);
      }
      // ShapeFloodFill 尾排水：队列余项全为已处理格 → 返回 true
      let complete = true;
      if (qh < queue.length) {
        complete = true;
        for (let k = qh; k < queue.length; k++) { if (!cells.has(queue[k]!)) { complete = false; break; } }
      }
      const accept = (cells.size > 50) && complete && !foundInvalid;
      spotLog.push(`SIMSPOT ${px},${py} cells=${cells.size} complete=${complete} invalid=${foundInvalid} wall=${num5} accept=${accept}`);
      if (accept) {
        // OuterOutline(useDiagonals+useInterior) origin=(px,py)：datum 相对坐标 (+1 行偏移)
        const applyAt = (ax: number, ay: number): void => {
          const ai = idx(ax, ay);
          const wl = wall[ai]!;
          if (wl === 87 || wl === 86 || wl === 244) return;
          wall[ai] = num5;
          frameDraw(ax, ay);
          frameDraw(ax + 1, ay);
          frameDraw(ax - 1, ay);
          frameDraw(ax, ay - 1);
          frameDraw(ax, ay + 1);
        };
        for (const ci of cells) {
          const cx = ci % w2, cy = (ci / w2) | 0;
          applyAt(cx, cy + 1);
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
            if (!cells.has(idx(cx + ox, cy + oy))) applyAt(cx + ox, cy + 1 + oy);
          }
        }
        num2--; placed++;
      } else { num4--; rejected++; }
      cells.clear();
    }
  }
  writeFileSync(`${OUT}/sim-spots.txt`, spotLog.join('\n') + '\n');
  writeFileSync(`${OUT}/sim-rolls.txt`, rolls.join('\n') + '\n');
  console.log(`SIM iter=${iter} placed=${placed} rejected=${rejected} rolls=${rc.n}`);
  let dW = 0, dA = 0, dT = 0, fI = -1;
  const pair = new Map<string, number>();
  const diffRows: string[] = [];
  for (let i = 0; i < w2 * h2; i++) {
    if (xv.a[i] !== (flags[i]! & 1)) { dA++; continue; }
    if (xv.w[i] !== wall[i]) {
      dW++; if (fI < 0) fI = i;
      const k = `W${xv.w[i]}>${wall[i]}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      if (dW <= 2000) diffRows.push(`${i % w2},${Math.floor(i / w2)} w ${xv.w[i]}>${wall[i]}`);
    } else {
      const vt = xv.a[i] ? xv.t[i]! : 0;
      const jt = (flags[i]! & 1) ? (SHEET[type[i]!] >= 0 ? SHEET[type[i]!]! : 9999) : 0;
      if (vt !== jt) dT++;
    }
  }
  console.log(`SIM cmp vs #${CMP_IDX}: dA=${dA} dT=${dT} dW=${dW} ${dW ? `first=(${fI % w2},${Math.floor(fI / w2)}) pairs=` + [...pair.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ') : '✓ 全等'}`);
  if (dW) writeFileSync(`${OUT}/sim-difflist.txt`, diffRows.join('\n') + '\n');
  // 掷账流对拍（vs js-rolls.txt）
  try {
    const js = readFileSync(`${OUT}/js-rolls.txt`, 'utf8').split('\n').filter(Boolean);
    let div = -1;
    for (let k = 0; k < Math.min(js.length, rolls.length); k++) {
      if (js[k] !== rolls[k]) { div = k; break; }
    }
    if (div < 0 && js.length !== rolls.length) div = Math.min(js.length, rolls.length);
    console.log(`roll-stream vs JS: jsLen=${js.length} simLen=${rolls.length} firstDiv=${div < 0 ? 'NONE(全等)' : div + 1}`);
    if (div >= 0) {
      console.log(`  js : ${js[div - 1] ?? '(end)'} | ${js[div] ?? '(end)'}`);
      console.log(`  sim: ${rolls[div - 1] ?? '(end)'} | ${rolls[div] ?? '(end)'}`);
      writeFileSync(`${OUT}/roll-div.txt`, `firstDiv=${div + 1}\njs : ${js.slice(Math.max(0, div - 4), div + 4).join('\n')}\nsim: ${rolls.slice(Math.max(0, div - 4), div + 4).join('\n')}\n`);
    }
  } catch { console.log('roll-stream: js-rolls.txt 缺,跳过'); }
}, 600_000);
