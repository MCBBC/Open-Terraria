// IIII89 批：状态七链 #32 Dungeon 小面 单 pass 反演重放（克隆 _iii70dg 模式）。
// ① SW_I89CAP=1：全量生成，在 ▶Dungeon reseed 时点深拷贝 store 全通道 + gs
//    → /tmp/iii93-out/cap-<TAG>/base_*  （后续迭代免重跑 0..31）
// ② SW_I89REPLAY=1：hydrate 基座 → new RNG(seed) → runDungeonPass 对拍 G2 dump#CMP
//    八通道（act/typ/wal/liq/half/slope/lty/inact），报首差/pairs/bbox；
//    SW_I89_MAP=1 打 bbox ASCII；SW_I89_DECOR=1 只列 deco 族 (34/48/91/240/241/242) 差异格。
// 用法：cd game && SW_I89CAP=1 SW_I89_TAG=tooeasy npx vitest run tools/_iii89dg.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
// ★IIIII93b：dual 链单 pass 重放需要蛇槽/双 genvars 模块态——捕获面一并落盘,
//  重放侧先重建 dualSnakes（在一次性克隆 store 上真跑 DitherSnake pass）再进 Dungeon。
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN_CAP = process.env.SW_I89CAP === '1';
const RUN_RE = process.env.SW_I89REPLAY === '1';
const TAG = process.env.SW_I89_TAG ?? 'x';
const OUT = process.env.SW_I89_OUT ?? `/tmp/iii93-out/cap-${TAG}`;
const G2 = process.env.SW_I89_G2 ?? '';
const CMP_IDX = Number(process.env.SW_I89_CMP ?? 32);
const W = 4200, H = 1200, N = W * H;
const SEED = process.env.SW_I89_SEED ?? '';
const EVIL = Number(process.env.SW_I89_EVIL ?? 0);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I89_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;

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
    writeFileSync(`${dir}/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
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
      return new Ctor((o.d ?? []).length).fill ? (() => { const arr = new Ctor((o.d?.length ?? 0)) as { set(a: unknown[]): void }; arr.set(o.d!); return arr; })() : null;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)('capture base at Dungeon pass head', async () => {
  if (!SEED || !G2) throw new Error('SW_I89_SEED/SW_I89_G2 required');
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  let liveStore: TileStore | null = null;
  let done = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore && !done) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii89dg')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (process.env.SW_I89_LABELDBG) console.log(`LBL ${lab} @${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]} rolls=${(globalThis as unknown as { __swRollN?: number }).__swRollN ?? '?'}`);
          if (lab === (process.env.SW_I89_LABEL ?? 'Dungeon')) {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            // ★IIIII93b：双地牢模块态快照（dungeons 表/potentialBounds/ndsf）——重放侧重建
            if (dualDungeonState.dungeons.length > 0) {
              writeFileSync(`${OUT}/base_dual.json`, JSON.stringify({
                enabled: dualDungeonState.enabled,
                potentialBounds: dualDungeonState.potentialBounds,
                dungeons: dualDungeonState.dungeons,
                ndsf: dualDungeonState.normalizedDistanceSafeFromDither,
              }));
            }
            console.log(`captured @${lab} tag=${TAG} gs keys=${Object.keys(gs).length}`);
            done = true;
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(FLAGS).length ? FLAGS : undefined,
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: Dungeon label never hit');
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
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
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN_RE ? it : it.skip)(`replay runDungeonPass on base vs x86 dump#${CMP_IDX}`, () => {
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
  const { st, gs } = hydrate();
  // ★IIIII93b：恢复双地牢模块态 + 一次性克隆面重建蛇槽缓存（真跑 DitherSnake pass,
  //  涂绘落在克隆面上——主流 rng 不受影响,Dungeon pass 自带 new RNG(seed) 重播）
  if (existsSync(`${OUT}/base_dual.json`)) {
    const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as {
      enabled: boolean; potentialBounds: typeof dualDungeonState.potentialBounds;
      dungeons: typeof dualDungeonState.dungeons; ndsf: number;
    };
    dualDungeonState.enabled = du.enabled;
    dualDungeonState.potentialBounds = du.potentialBounds;
    dualDungeonState.dungeons = du.dungeons;
    dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;
    console.log(`[i99] dual restored: dungeons=${du.dungeons.length} pb=${du.potentialBounds.length}`);
    if (du.dungeons.length >= 2 && !dualSnakes[0]) {
      const scr = new TileStore(st.w, st.h);
      for (const c of CHANS) {
        const src = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
        (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
      }
      runDualDungeonsDitherSnakePass(scr, new RNG(gs.seed), gs);
      console.log(`[i99] snakes rebuilt: ${dualSnakes.map((s) => s ? s.lines.length : 'null').join(',')}` +
        ` @${JSON.stringify(dualDungeonState.dungeons.map((d) => [d.side, d.location, d.theme]))}`);
    }
  }
  // 基座自检（对上层 dump=CMP-1）
  {
    const pre41 = `${G2}/${String(CMP_IDX - 1).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX - 1)}`;
    if (existsSync(`${pre41}.typ`)) {
      const a411 = readFileSync(`${pre41}.act`), t411 = le16(`${pre41}.typ`);
      let dA = 0, dT = 0;
      for (let i2 = 0; i2 < N; i2++) {
        if (a411[i2] !== (st.flags[i2]! & 1)) dA++;
        else if (a411[i2] && t411[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      }
      console.log(`[base selfcheck vs #${CMP_IDX - 1}] dAct=${dA} dTyp=${dT}`);
    }
  }
  const rng = new RNG(gs.seed);
  const t0 = Date.now();
  const wv: string[] | undefined = process.env.SW_I89_MARKS ? [] : undefined;
  if (wv) (globalThis as unknown as { __wvLines?: string[] }).__wvLines = wv;
  (globalThis as unknown as { __swWvLog?: unknown }).__swWvLog = wv ? {} : undefined;
  (globalThis as unknown as { __swRollN?: number }).__swRollN = 0;
  // ★IIIII93：样本值流落盘（SW_I89_ROLLLOG）——与 rig JJHook SW_ROLLLOG 同协议对拍。
  //   记 `mc|value`（mc=本 pass 相对样本序号，从 1 起）。
  const ROLLLOG = process.env.SW_I89_ROLLLOG;
  if (ROLLLOG) writeFileSync(ROLLLOG, '');
  let rollH = 2166136261 >>> 0;
  const oOnRoll = (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll;
  (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = (v) => {
    const box = (globalThis as unknown as { __swRollN?: number });
    box.__swRollN = (box.__swRollN ?? 0) + 1;
    rollH = ((rollH ^ (v >>> 0)) * 16777619) >>> 0;
    if (ROLLLOG) {
      try { appendFileSync(ROLLLOG, `${box.__swRollN}|${v}\n`); } catch { /* ignore */ }
    }
  };
  globalThis.__i93RollHash = () => `${rollH.toString(16)}(${rollH})`;
  try {
    runDungeonPass(st, rng, gs, []);
  } finally {
    (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = oOnRoll;
  }
  console.log(`runDungeonPass ${Date.now() - t0}ms totalSample=${(globalThis as unknown as { __swRollN?: number }).__swRollN}`);
  console.log(`passFnvHash=${globalThis.__i93RollHash?.() ?? 'na'}`);
  if (wv) for (const l of wv) console.log(l);
  const MAP = process.env.SW_I89_MAP === '1';
  const DECOR_ONLY = process.env.SW_I89_DECOR === '1';
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const bbox = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, -1, -1];
  const diffCells: Array<{ x: number; y: number; desc: string }> = [];
  const mark = (i: number, desc: string): void => {
    if (fI < 0) fI = i;
    const x = i % W, y = (i / W) | 0;
    bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
    diffCells.push({ x, y, desc });
  };
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; mark(i, `act ${va}>${ja} t ${va ? xt[i] : '-'}>${ja ? SHEET[st.type[i]!] ?? 9999 : '-'}`); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; mark(i, `t ${vt}>${jt}`); continue; }
    if (xw[i] !== st.wall[i]) { dW++; mark(i, `w ${xw[i]}>${st.wall[i]}`); continue; }
    if (xl[i] !== st.liquid[i]) { dL++; mark(i, `l ${xl[i]}>${st.liquid[i]}`); continue; }
    if (xhf[i] !== st.half[i]) { dHf++; mark(i, `hf ${xhf[i]}>${st.half[i]}`); continue; }
    if (xsl[i] !== st.slope[i]) { dSl++; mark(i, `sl ${xsl[i]}>${st.slope[i]}`); continue; }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; mark(i, `lty ${vl}>${jl}`); continue; }
    const via = xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; mark(i, `ia ${via}>${jia}`); continue; }
  }
  const decorT = new Set([34, 48, 91, 240, 241, 242, 226]);
  const filtered = DECOR_ONLY ? diffCells.filter((c) => c.desc.startsWith('t ') && [...decorT].some((id) => c.desc.includes(`>${id} `) || c.desc.endsWith(`>${id}`))) : diffCells;
  console.log(`DIFF A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`} bbox=[${bbox[0]},${bbox[1]}]-[${bbox[2]},${bbox[3]}]`);
  const show = filtered.slice(0, Number(process.env.SW_I89_NCELLS ?? 80));
  for (const c of show) console.log(`  (${c.x},${c.y}) ${c.desc}`);
  writeFileSync(`${OUT}/diffcells.json`, JSON.stringify(diffCells));
  // ★IIIII93b：SW_I99_SAVEAFTER=1 → 导出 JS-after 状态（typ/act/wal, sheet 域）——
  //  离线分析「本 pass JS 写迹 vs x86 写迹(dump033-dump032)」的对位性
  if (process.env.SW_I99_SAVEAFTER === '1') {
    const sheetTyp = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      const va = st.flags[i]! & 1;
      sheetTyp[i] = va ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    }
    writeFileSync(`${OUT}/jsafter.typ`, Buffer.from(sheetTyp.buffer, sheetTyp.byteOffset, N * 2));
    writeFileSync(`${OUT}/jsafter.act`, Buffer.from((() => { const a = new Uint8Array(N); for (let i = 0; i < N; i++) a[i] = st.flags[i]! & 1; return a; })().buffer, 0, N));
    writeFileSync(`${OUT}/jsafter.wal`, Buffer.from(st.wall.buffer, st.wall.byteOffset, N * 2));
    console.log('[i99] jsafter saved');
  }
  if (MAP && fI >= 0) {
    const bx = [bbox[0] - 4, bbox[2] + 4], by = [bbox[1] - 4, bbox[3] + 4];
    const lines: string[] = [];
    for (let y = by[0]; y <= by[1]; y++) {
      let ln = '';
      for (let x = bx[0]; x <= bx[1]; x++) {
        const i = y * W + x;
        const va = xa[i]!, ja = st.flags[i]! & 1;
        const vt = va ? xt[i]! : 0, jt = ja ? SHEET[st.type[i]!]! : 0;
        if (va !== ja) ln += 'A';
        else if (vt !== jt) ln += 'T';
        else if (xw[i] !== st.wall[i]) ln += 'w';
        else if ((xl[i]! > 0 ? xlt[i]! + 1 : 0) !== (st.liquid[i]! > 0 ? st.liquidType[i]! : 0)) ln += 'y';
        else ln += vt === 0 ? '.' : va ? '#' : ':';
      }
      lines.push(String(y).padStart(5) + ' ' + ln);
    }
    console.log(lines.join('\n'));
  }
}, 600_000);
