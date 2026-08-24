// 一次性诊断（IIIIIII 批 2026-08-24）：彩蛋链（NOTRAPS/NTB）尾段逐 pass 隔离重放——
// 把 x86 dump N（8ch）灌入 JS store，跑 N→N+1 的 JS pass，对拍 dump N+1。上游 #32 起
// 的 1457 地牢增量级联被本法完全旁路（输入=x86 自身态），检验各 pass 在原版输入上的
// 实现纯度（_c33replay 同款方法论）。
// 用法：cd game && SW_R=1 SW_R_CHAIN=notraps npx vitest run tools/_iiiiiii2.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runStatuesPass } from '../src/world/gen/vanilla/StatuesPass';
import { runBuriedChestsPass, runUnderworldChestsPass } from '../src/world/gen/vanilla/BuriedChestsPass';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { runTreePass } from '../src/world/gen/vanilla/TreePass';

const RUN = process.env.SW_R === '1';
const CHAIN = process.env.SW_R_CHAIN ?? 'notraps';
const CHAINS: Record<string, { seed: string; evil: -1 | 0 | 1; flags: Record<string, boolean>; dir: string }> = {
  notraps: { seed: '1896728457', evil: 1, flags: { noTraps: true }, dir: '/tmp/sw-slp/g-secret-notraps' },
  ntb: { seed: '1372357239', evil: -1, flags: { notTheBees: true }, dir: '/tmp/sw-slp/g-secret-ntb' },
  const: { seed: '1321365005', evil: -1, flags: { theConstant: true }, dir: '/tmp/sw-slp/g-secret-const' },
};
const CFG = CHAINS[CHAIN]!;
// 重放窗：SW_R_SLOTS="58:59,75:76"（dump idx from:to）
const SLOTS = (process.env.SW_R_SLOTS ?? '58:59').split(',').map((s) => s.split(':').map(Number) as [number, number]);
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (s !== undefined && !REV.has(s)) REV.set(s, i);
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

interface Snap { frameX: Uint16Array; frameY: Uint16Array; wire: Uint8Array }
function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v instanceof Float32Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = JSON.parse(JSON.stringify(v));
  }
  return c as unknown as GenState;
}

(RUN ? it : it.skip)(`isolated per-pass replay on x86 grids (${CHAIN})`, async () => {
  // dump 名表
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(CFG.dir)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  // ▶label → dump idx（重放窗内；语义=reseed@pass头 时点 state==上一 pass 末=dump[idx]）
  const LABEL2DUMP = new Map<string, number>([
    ['Statues', 57], ['UndergroundHousesAndBuriedChests', 58], ['SurfaceChests', 59],
    ['Traps', 75], ['SmoothWorld', 52], ['PlantingTrees', 81],
  ]);
  // ① 全量 JS 生成：抓边界 gs 快照 + frame/wire 快照 + 箱注册表快照
  const gsSnaps = new Map<number, GenState>();
  const frSnaps = new Map<number, Snap>();
  const chestSnaps = new Map<number, unknown>();
  let liveStore: TileStore | null = null;
  let liveWorld: { chests: unknown } | null = null;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m2 = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m2) return m2[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m2 = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m2 && !m2[1].includes('/core/rng') && !m2[1].includes('_iiiiiii')) {
          const lab = labelOf(m2[1], Number(m2[2]));
          const idx = LABEL2DUMP.get(lab);
          if (idx !== undefined && !gsSnaps.has(idx)) {
            gsSnaps.set(idx, cloneGs(lastGenState()!));
            frSnaps.set(idx, { frameX: liveStore.frameX.slice(), frameY: liveStore.frameY.slice(), wire: liveStore.wire.slice() });
            if (liveWorld) chestSnaps.set(idx, JSON.parse(JSON.stringify(liveWorld.chests)));
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: CFG.seed, evil: CFG.evil,
      seedFlags: CFG.flags,
      onWorldPartial: (w) => {
        if (!liveStore) { liveStore = w.store as never as TileStore; liveWorld = w as never as { chests: unknown }; }
      },
    });
  } finally { RNGp.reseed = oReseed; }

  // ② x86 dump 装载
  const loadGrid = (idx: number) => {
    const pre = `${CFG.dir}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
    const miss = ['act', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'].filter((c) => !existsSync(`${pre}.${c}`));
    if (miss.length) throw new Error(`#${idx} 缺通道 ${miss.join(',')}`);
    return {
      typ: le16(`${pre}.typ`), act: readFileSync(`${pre}.act`), wal: le16(`${pre}.wal`),
      liq: readFileSync(`${pre}.liq`), half: readFileSync(`${pre}.half`), slope: readFileSync(`${pre}.slope`),
      lty: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
    };
  };
  const build = (idx: number): TileStore => {
    const g = loadGrid(idx);
    const sn = frSnaps.get(idx)!;
    const rs = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      rs.flags[i] = g.act[i]! ? 1 : 0;
      rs.type[i] = g.act[i]! ? (REV.get(g.typ[i]!) ?? 0) : 0;
      rs.wall[i] = g.wal[i]!;
      rs.liquid[i] = g.liq[i]!;
      // vanilla 0 基（水=0/lava=1/蜜=2）→ JS +1 基；湿格必转，干格保非水残型
      rs.liquidType[i] = g.liq[i]! > 0 ? g.lty[i]! + 1 : (g.lty[i]! > 0 ? g.lty[i]! + 1 : 0);
      rs.half[i] = g.half[i]!;
      rs.slope[i] = g.slope[i]!;
      rs.wire[i] = (sn.wire[i]! & ~32) | (g.ia[i]! ? 32 : 0);  // inact 位取 x86，余位借快照
      rs.frameX[i] = sn.frameX[i]!;
      rs.frameY[i] = sn.frameY[i]!;
    }
    return rs;
  };
  const cmp = (tag: string, idx: number, st: TileStore): void => {
    const g = loadGrid(idx);
    let dT = 0, dA = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0, dIa = 0, first = '';
    const pair = new Map<string, number>();
    const mark = (i: number) => { if (!first) first = `(${i % W},${Math.floor(i / W)})`; };
    const bump = (k: string) => pair.set(k, (pair.get(k) ?? 0) + 1);
    for (let i = 0; i < N; i++) {
      const va = g.act[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { dA++; mark(i); }
      const vt = va ? g.typ[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) { dT++; mark(i); bump(`T${vt}>${jt}`); }
      if (g.wal[i]! !== st.wall[i]!) { dW++; mark(i); }
      if (g.liq[i]! !== st.liquid[i]!) { dL++; mark(i); }
      const vl = g.liq[i]! > 0 ? g.lty[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) { dLt++; mark(i); bump(`Y${vl}>${jl}`); }
      if (g.half[i]! !== st.half[i]!) { dHf++; mark(i); }
      if (g.slope[i]! !== st.slope[i]!) { dSl++; mark(i); bump(`S${g.slope[i]}>${st.slope[i]}`); }
      if ((g.ia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) { dIa++; mark(i); }
    }
    const top = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k}×${c}`).join(' ');
    console.log(`${String(idx).padStart(3)} ${DUMPNAME.get(idx)} ← ${tag.padEnd(10)} T=${String(dT).padStart(7)} A=${String(dA).padStart(6)} W=${String(dW).padStart(6)} L=${String(dL).padStart(6)} Lt=${String(dLt).padStart(5)} Hf=${String(dHf).padStart(4)} Sl=${String(dSl).padStart(5)} Ia=${String(dIa).padStart(3)} ${dT || dA || dW || dL || dLt || dHf || dSl || dIa ? '✗ ' + first + ' ' + top : '✓'}`);
  };

  // ③ 逐 transition 重放
  for (const [from, to] of SLOTS) {
    if (!gsSnaps.has(from)) { console.log(`${from}→${to}: 无 ${from} 边界快照（labels=${[...gsSnaps.keys()].join(',')}）跳过`); continue; }
    const st = build(from);
    const gs = cloneGs(gsSnaps.get(from)!);
    const chests = JSON.parse(JSON.stringify(chestSnaps.get(from))) as never[];
    const rng = new RNG(Number(CFG.seed));
    const tag = `${from}→${to}`;
    // —— pass 序表（与 WorldGen.ts 槽内调用逐一同构）——
    if (from === 57) { rng.reseed(gs.seed); runStatuesPass(st, rng, gs); }
    else if (from === 58) {
      // UHABC 一个 pass：头四翻→头四计数连掷→洞穴箱→地狱箱→小屋→尾四翻
      rng.reseed(gs.seed);
      flipGenSolid([226, 162, 225, 190], true);
      rollHouseChestCounts(st, rng, gs);
      runBuriedChestsPass(st, rng, gs, chests);
      runUnderworldChestsPass(st, rng, gs, chests);
      runCaveHousesPass(st, rng, gs, chests);
      flipGenSolid([226, 162, 225, 190], false);
    } else if (from === 75) { rng.reseed(gs.seed); runTrapsPass(st, rng, gs, chests); }
    else if (from === 52) { runSmoothWorldPass(st, rng, gs); }
    else if (from === 81) { runTreePass(st, rng, gs); }
    else { console.log(`${tag}: 无 pass 映射`); continue; }
    cmp(tag, to, st);
  }
}, 900_000);
