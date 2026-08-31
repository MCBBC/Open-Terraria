// IIII101 批：graveyard(G2=/tmp/iii84-out/x86-grvfix)#59 Buried_Chests 域 单槽反演重放
// （克隆 tools/_iii100ch 范式；capture 锚=▶UndergroundHousesAndBuriedChests reseed——
//   此点 state 恰=dump#058_Statues（mile8 已证绿）⇒ 免除 Statues 重跑保真度变量，
//   基座自检必须 0/0 才算反演有效）。
// ① SW_G101CAP=1：全量生成到 ▶Statues 时点存 base_*（seed/flags 由 env 传入）。
// ② SW_G101REPLAY=1：hydrate → Statues →(▶UHBChests)counts→loop1..3→尾翻，
//    SW_G101_AFTER 可选值：statues|counts|loop1|loop2|loop3 —— 到该步为止把
//    store 八通道落盘（xxxJS.* 后缀）供与 x86 写集对比；否则直接对拍 dump#CMP。
// 用法：
//   cd game && SW_G101CAP=1 SW_G101_TAG=grv \
//     SW_G101_SEED='nightofthelivingdead|20260903' SW_G101_FLAGS=graveyardBloodmoonStart \
//     SW_G101_EVIL=0 npx vitest run tools/_iii101grv.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import type { ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import { flipGenSolid, snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { rollHouseChestCounts } from '../src/world/gen/vanilla/CaveHousePass';
import { runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runStatuesPass } from '../src/world/gen/vanilla/StatuesPass';
import {
  runBuriedChestsPass, runUnderworldChestsPass,
} from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN_CAP = process.env.SW_G101CAP === '1';
const RUN_RE = process.env.SW_G101REPLAY === '1';
const OUT = process.env.SW_G101_OUT ?? '/tmp/iii119-out/cap-grv';
const G2 = process.env.SW_G101_G2 ?? '/tmp/iii84-out/x86-grvfix';
const SEED = process.env.SW_G101_SEED ?? '';
const EVIL = Number(process.env.SW_G101_EVIL ?? 0);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_G101_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const AFTER = process.env.SW_G101_AFTER ?? '';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);

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
      const arr = new Ctor(o.d?.length ?? 0) as { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)('capture base at Statues pass head', async () => {
  if (!SEED || !G2) throw new Error('SW_G101_SEED/SW_G101_G2 required');
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii101grv')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'UndergroundHousesAndBuriedChests') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            // ★IIIII101：GenSolid 固有翻转态快照（MountCaves 137/130 等跨 pass 持久
            //   翻转在重放侧默认缺失曾致房找半砖面漂移——控制链 gold-g 同样复现）
            const snap = snapshotGenSolid();
            writeFileSync(`${OUT}/base_gensolid.json`, JSON.stringify([...snap.entries()]));
            console.log(`captured @${lab} out=${OUT}`);
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
  if (!done) throw new Error('capture failed: Statues label never hit');
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
let DUMPNAME = new Map<number, string>();
{
  try {
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) DUMPNAME.set(Number(m[1]), m[2]);
    }
  } catch { /* cap mode */ }
}
function cmpAgainst(tag: string, idx: number, st: TileStore): void {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${pre}.typ`)) { console.log(`[${tag}] dump missing ${pre}`); return; }
  const xa = readFileSync(`${pre}.act`); const xt = le16(`${pre}.typ`);
  const xw = le16(`${pre}.wal`);
  const xl = readFileSync(`${pre}.liq`); const xhf = readFileSync(`${pre}.half`);
  const xsl = readFileSync(`${pre}.slope`); const xia = readFileSync(`${pre}.inact`);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dIa = 0;
  let fI = -1;
  const pair = new Map<string, number>();
  const N = W * H;
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; fI = fI < 0 ? i : fI; continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; fI = fI < 0 ? i : fI; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); continue; }
    if (xw[i] !== st.wall[i]) { dW++; fI = fI < 0 ? i : fI; continue; }
    if (xl[i] !== st.liquid[i]) { dL++; fI = fI < 0 ? i : fI; continue; }
    if (xhf[i] !== st.half[i]) { dHf++; fI = fI < 0 ? i : fI; continue; }
    if (xsl[i] !== st.slope[i]) { dSl++; fI = fI < 0 ? i : fI; continue; }
    const via = xia[i]! ? 1 : 0;
    if (via !== ((st.wire[i]! >>> 5) & 1)) { dIa++; fI = fI < 0 ? i : fI; }
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dIa;
  console.log(`[${tag}] vs #${idx}_${DUMPNAME.get(idx)}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Ia=${dIa} ${bad ? `✗ @(${fI % W},${(fI / W) | 0}) ` + [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' ') : '✓'}`);
}

(RUN_RE ? it : it.skip)(`replay statues+chest bundle vs G2`, () => {
  const N = W * H;
  const { st, gs } = hydrate();
  // ★IIIII101：GenSolid 固有翻转态恢复（重放侧缺省=默认表，漏掉 MountCaves
  //   137/130 等跨 pass 持久翻转曾致房找结果漂——控制链 gold-g 同样复现）
  if (existsSync(`${OUT}/base_gensolid.json`)) {
    const arr = JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')) as [number, boolean][];
    restoreGenSolid(new Map(arr));
    console.log(`[i101] GenSolid 快照恢复 (${arr.length} 项)`);
  }
  // 基座自检 vs #058_Statues（base 取自 ▶UHBChests 重播点=前态，须逐位相等）
  {
    const pre = `${G2}/058_${DUMPNAME.get(58)}`;
    const xt0 = le16(`${pre}.typ`); const xa0 = readFileSync(`${pre}.act`);
    const xw0 = le16(`${pre}.wal`); const xl0 = readFileSync(`${pre}.liq`);
    let dA = 0, dT = 0, dW = 0, dL = 0;
    for (let i = 0; i < N; i++) {
      const va = xa0[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) dA++;
      else if (va && xt0[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)) dT++;
      if (xw0[i] !== st.wall[i]) dW++;
      if (xl0[i] !== st.liquid[i]) dL++;
    }
    console.log(`[base selfcheck vs #058_${DUMPNAME.get(58)}] dAct=${dA} dTyp=${dT} dW=${dW} dL=${dL}${dA || dT || dW || dL ? ' ✗ 反演无效！' : ' ✓'}`);
  }
  let rollN = 0;
  const g = globalThis as unknown as { __swOnRoll?: (v: number) => void };
  const oOnRoll = g.__swOnRoll;
  const ROLLS_PATH = process.env.SW_G101_ROLLS ?? '';
  let rollLines: string[] | null = null;
  if (ROLLS_PATH) { try { require('node:fs'); } catch { /* noop */ } }
  rollLines = ROLLS_PATH ? [] : null;
  // ★IIII101 注释掷流（SW_G101_TAGS）：逐样本记录 src 内消费点栈签名——与 x86
  //   rig SW_TAGLOG 的「内层→外层帧序」同构对齐用（值流已证全等 ⇒ 差异必在消费者）。
  const TAGS_PATH = process.env.SW_G101_TAGS ?? '';
  const tagLines: string[] | null = TAGS_PATH ? [] : null;
  // ★IIII101 检查点仪（SW_G101_CKPT）：每逢 256 掷对拍一次「当前态 vs G2 #CMP 终态」
  //   差异计数——首个 >0 的检查点窗口即写面分叉起点（与 js-tags 对读定罪消费点）。
  const CKPT_PATH = process.env.SW_G101_CKPT ?? '';
  const sheetOfI2V = (tid: number): number => tid < SHEET.length && SHEET[tid]! >= 0 ? SHEET[tid]! : 9999;
  let ckpts: string[] | null = null;
  let ckTarget: { t: Uint16Array; a: Uint8Array; w: Uint16Array } | null = null;
  if (CKPT_PATH && existsSync(`${G2}/059_${DUMPNAME.get(59)}.typ`)) {
    ckpts = [`0 0`];
    const pre = `${G2}/059_${DUMPNAME.get(59)}`;
    ckTarget = { t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`) };
  }
  const stackSrc = (stack: string): string => {
    const out: string[] = [];
    for (const line of stack.split('\n')) {
      const m = line.match(/(?:\/src\/)([^\s()]+\.ts):(\d+):\d+/);
      if (!m) continue;
      if (m[1]!.includes('core/rng')) continue;
      out.push(`${m[1]!.replace(/^.*?(gen|world)\//, '')}:${m[2]}`);
      if (out.length >= 4) break;
    }
    return out.join('<');
  };
  const ledger: Array<{ tag: string; n: number }> = [];
  const markR = (tag: string): void => {
    ledger.push({ tag, n: rollN });
    rollLines?.push(`---PASS ${tag}`);
  };
  g.__swOnRoll = (v) => {
    rollN++;
    rollLines?.push(String(v));
    if (tagLines) {
      const st2 = (new Error().stack ?? '').split('\n').slice(1).join('\n');
      tagLines.push(`${rollN}|${v}|${stackSrc(st2)}`);
    }
    if (ckpts && ckTarget && (rollN % 256 === 0)) {
      let cnt = 0;
      const tg = ckTarget;
      for (let i = 0; i < N; i++) {
        if (tg.a[i] !== st.flags[i]) { cnt++; continue; }
        if (tg.w[i] !== st.wall[i]) { cnt++; continue; }
        const vt = tg.a[i] ? tg.t[i] : 0;
        const jt = st.flags[i] & 1 ? sheetOfI2V(st.type[i]) : 0;
        if (vt !== jt) cnt++;
      }
      if (ckpts.length === 0 || cnt > Number(ckpts[ckpts.length - 1]!.split(' ')[1])) {
        ckpts.push(`${rollN} ${cnt}`);
      }
    }
  };

  try {
    const chests: ChestSink = [];
    const rng = new RNG(gs.seed);

    cmpAgainst('at-base-vs-58', 58, st);

    rng.reseed(gs.seed);   // ▶UndergroundHousesAndBuriedChests cs:17066
    flipGenSolid([226, 162, 225, 190], true);
    rollHouseChestCounts(st, rng, gs);
    markR('counts');
    if (AFTER === 'counts') throw 'STOP-AFTER';

    runBuriedChestsPass(st, rng, gs, chests);
    markR('loop1.caveChests');
    if (AFTER === 'loop1') throw 'STOP-AFTER';
    runUnderworldChestsPass(st, rng, gs, chests);
    markR('loop2.underworldChests');
    if (AFTER === 'loop2') throw 'STOP-AFTER';
    runCaveHousesPass(st, rng, gs, chests);
    markR('loop3.placeHouses+4.desertHouses');
    if (AFTER === 'bundle' || AFTER === 'loop3') {
      if (AFTER === 'bundle') {
        const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
        for (const c of CHANS) {
          writeFileSync(`${OUT}/after_${c}.bin`, Buffer.from(rec[c]!.buffer, rec[c]!.byteOffset, rec[c]!.byteLength));
        }
        const shd = new Uint16Array(SHEET.length);
        for (let si = 0; si < SHEET.length; si++) shd[si] = SHEET[si] >= 0 ? SHEET[si]! : 65535;
        writeFileSync(`${OUT}/after_sheet.bin`, Buffer.from(shd.buffer, 0, shd.length * 2));
        console.log(`[AFTER=bundle] 落盘 ${OUT}/after_*.bin (+sheet)`);
      }
      throw 'STOP-AFTER';
    }
    flipGenSolid([226, 162, 225, 190], false);
    cmpAgainst('after-BuriedChestsBundle', 59, st);
    console.log(`ledger(samples)=${ledger.map(({ tag, n }) => `${tag}=${n}`).join(' ')}`);
  } catch (e) {
    if (e !== 'STOP-AFTER') throw e;
  } finally {
    g.__swOnRoll = oOnRoll;
    console.log(`ledger(samples)=${ledger.map(({ tag, n }) => `${tag}=${n}`).join(' ')}`);
    console.log(`rolls_total=${rollN}`);
    if (rollLines && ROLLS_PATH) writeFileSync(ROLLS_PATH, `${rollLines.join('\n')}\n`);
    if (tagLines && TAGS_PATH) writeFileSync(TAGS_PATH, `${tagLines.join('\n')}\n`);
    if (ckpts && CKPT_PATH) writeFileSync(CKPT_PATH, `${ckpts.join('\n')}\n`);
  }
}, 600_000);
