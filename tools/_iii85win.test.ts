// IIII81 批（GFB-B 蜂巢域 #46）反演重放窗口仪：
//   A) 全管线跑到 ▶Beehives 头即中止 —— 捕获 gs（含 protectedRects/larvaX/Y）与
//      live store，产出「管线时点」JS 蜂巢尝试流；
//   B) 反演重放：把 x86 真值 dump(046_Jungle_Temple=槽45 Beehives 基座) 直构进
//      TileStore，套捕获 gs + fresh RNG(seed) 单跑 runBeehivePass → 对拍真值
//      dump(047_Hives=槽46 出口) 八通道 —— 上游红带(#28..45)全部解耦。
// 用法：cd game && SW_III85=1 npx vitest run tools/_iii85win.test.ts
//   可切链：SW_III85_G2 / SW_III85_SEED / SW_III85_EVIL / SW_III85_FLAGS /
//           SW_III85_W / SW_III85_H / SW_III85_OUT（attempts json）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runBeehivePass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { genSolidType } from '../src/world/gen/vanilla/GenSolid';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = !!process.env.SW_III85;
const G2 = process.env.SW_III85_G2 ?? '/tmp/iii82-out/x86-gfb-a';
const SEED = process.env.SW_III85_SEED ?? '9293480';
const EVIL = Number(process.env.SW_III85_EVIL ?? 0);
const W = Number(process.env.SW_III85_W ?? 4200), H = Number(process.env.SW_III85_H ?? 1200);
const N = W * H;
const OUT = process.env.SW_III85_OUT ?? '/tmp/iii85-out/hive-attempts.json';

const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps', constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', celebrationmk10: 'tenthAnniversary',
  fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
};
const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_III85_FLAGS
  ?? 'everything,remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld')
  .split(',').filter(Boolean)) {
  M8_FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
}

const TILE_BY_KEY_REV = new Map<number, string>();
for (const [k, v] of Object.entries(TILE_BY_KEY)) { if (v !== undefined && !TILE_BY_KEY_REV.has(v)) TILE_BY_KEY_REV.set(v, k); }
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
// ★IIIII81 修正：不得强行 REV.set(0,0)——dump typ 原版 id 0=Dirt（活性），首个
//   sheet-0 定义已是内部 dirt(id 1)；曾强写 0 号键把活性泥土打成空气 → 首门
//   IsSolid 计数普遍 -11/-N 全域漂移（rig s=760 vs js 749 实测钉案）

interface Ch {
  t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
  frx?: Uint16Array; fry?: Uint16Array;   // ★IIIII81：帧通道（x86-gfb-c 起才有）
}
function chOf(idx: number, nm: string): Ch {
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
  const rd = (p: string) => readFileSync(p);
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  const hasFrames = (() => { try { readFileSync(`${pre}.frx`); return true; } catch { return false; } })();
  return {
    t: le16(`${pre}.typ`), a: rd(`${pre}.act`), w: le16(`${pre}.wal`), l: rd(`${pre}.liq`),
    hf: rd(`${pre}.half`), sl: rd(`${pre}.slope`), lt: rd(`${pre}.lty`), ia: rd(`${pre}.inact`),
    ...(hasFrames ? { frx: le16(`${pre}.frx`), fry: le16(`${pre}.fry`) } : {}),
  };
}

/** dump → TileStore（ghost type 照抄；liquidType vanilla+1；inact 位 → wire bit5；
 *  半开语义同 _iii83sh） */
function loadStore(c: Ch): TileStore {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(c.t[i]) ?? 0;
    st.flags[i] = c.a[i] ? 1 : 0;
    st.wall[i] = c.w[i];
    st.liquid[i] = c.l[i];
    st.liquidType[i] = c.l[i] > 0 ? c.lt[i] + 1 : 0;
    st.half[i] = c.hf[i];
    st.slope[i] = c.sl[i];
    if (c.frx && c.fry) { st.frameX[i] = c.frx[i]; st.frameY[i] = c.fry[i]; }
    if (c.ia[i]) st.wire[i] |= 32;
  }
  return st;
}

interface StoreView {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}
function jsSheet(st: StoreView, i: number): number {
  if (!st.flags[i]) return 0;
  return SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999;
}

interface DiffRow {
  tag: string; dA: number; dT: number; dW: number; dL: number; dHf: number;
  dSl: number; dLt: number; dIa: number; first: string;
  pairs: Array<[string, number]>; cells: Array<[number, number]>; regions: Array<[string, number]>;
}
function diffBoard(tag: string, xs: Ch, st: StoreView, cellCap = 40): DiffRow {
  const chs = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0 };
  const pair = new Map<string, number>();
  const reg = new Map<string, number>();
  const cells: Array<[number, number]> = [];
  let first = '';
  for (let i = 0; i < N; i++) {
    const va = xs.a[i], ja = st.flags[i] & 1;
    let bad = false;
    if (va !== ja) { chs.dA++; bad = true; }
    const vt = va ? xs.t[i] : 0, jt = ja ? jsSheet(st, i) : 0;
    if (vt !== jt) {
      chs.dT++; bad = true;
      pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1);
    }
    if (xs.w[i] !== st.wall[i]) {
      chs.dW++; bad = true;
      pair.set(`W${st.wall[i]}>${xs.w[i]}`, (pair.get(`W${st.wall[i]}>${xs.w[i]}`) ?? 0) + 1);
    }
    if (xs.l[i] !== st.liquid[i]) { chs.dL++; bad = true; }
    if (xs.hf[i] !== st.half[i]) { chs.dHf++; bad = true; }
    if (xs.sl[i] !== st.slope[i]) { chs.dSl++; bad = true; }
    const vl = xs.l[i] > 0 ? xs.lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) {
      chs.dLt++; bad = true;
      pair.set(`Y${vl}>${jl}`, (pair.get(`Y${vl}>${jl}`) ?? 0) + 1);
    }
    if ((xs.ia[i] ? 1 : 0) !== ((st.wire[i] >>> 5) & 1)) { chs.dIa++; bad = true; }
    if (!bad) continue;
    if (!first) first = `(${i % W},${Math.floor(i / W)})`;
    const rk = `${Math.floor((i % W) / 200)}_${Math.floor((i / W) / 200)}`;
    reg.set(rk, (reg.get(rk) ?? 0) + 1);
    if (cells.length < cellCap) cells.push([i % W, Math.floor(i / W)]);
  }
  console.log(`[${tag}] ${JSON.stringify(chs)} first=${first}`);
  console.log('  pairs:', [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `${k}×${v}`).join(' ') || '(none)');
  console.log('  regions:', [...reg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([k, v]) => `b${k}=${v}`).join(' '));
  return { tag, ...chs, first, pairs: [...pair.entries()].sort((a, b) => b[1] - a[1]), cells, regions: [...reg.entries()] };
}

(RUN ? it : it.skip)('GFB-B 蜂巢域 #46 反演重放窗口仪', async () => {
  // ── 相 1：全管线到 ▶Beehives 头中止，捕获 gs/protectedRects/larva/live store ──
  interface Cap {
    gs: GenState; prot: Array<{ x0: number; y0: number; x1: number; y1: number; pad: number }>;
    larvaX: number[]; larvaY: number[];
  }
  let cap: Cap | null = null;
  let live: StoreView | null = null;
  const marks: string[] = [];
  const rcMarks: number[] = [];   // ★IIIII81：mark 时点掷流计数（与 rig JJHook.RollCount 同语义）
  const rollVals: number[] = [];  // ★IIIII81：per-sample 原始 InternalSample 值（phase2，rollwin 对拍）
  let fntLog: string[] = [];
  const dieCalls: string[] = [];
  { const killLog: string[]=[]; (globalThis as unknown as { __swKillCap?: (x:number,y:number,sheet:number)=>void }).__swKillCap = (x,y,sheet)=>{ if(rcNow>=Number(process.env.SW_DIEWIN?.split(',')[0]??0)&&rcNow<=Number(process.env.SW_DIEWIN?.split(',')[1]??9e9)){const stk=(new Error().stack??'').split('\n').slice(3,22).map((l2:string)=>{const mm:string|undefined=l2.match(/\(?([^\s()/]*\.ts):(\d+):\d+/)?.[0];return mm??'';}).filter(Boolean).join('<'); killLog.push(`${rcNow}|KILL ${x},${y} sheet=${sheet} by=${stk}`);} }; (globalThis as unknown as { __swKillLog?: string[] }).__swKillLog=killLog; }
  if (process.env.SW_ALTARDBG === '1') { const altLog: string[]=[]; (globalThis as unknown as { __swAltarDbg?: (msg: string) => void }).__swAltarDbg = (msg)=>{ altLog.push(`${rcNow}|${msg}`); }; (globalThis as unknown as { __swAltarLog?: string[] }).__swAltarLog = altLog; }
  const DIE_WIN = [0, 999999999];
  { const wv=(process.env.SW_DIEWIN??'').split(',').map(Number); if(wv.length===2&&!isNaN(wv[0])){DIE_WIN[0]=wv[0];DIE_WIN[1]=wv[1];} }
  let rcNow = 0;
  const hvStats: Record<string, number> = {};
  const gg = globalThis as {
    __swHvDiag?: (x: number, y: number, st: unknown, gs: GenState) => void;
    __swMark?: (s: string) => void;
    __swHvLog?: (s: string) => void;
    __swHvStat?: (k: string, v?: number) => number;
  };
  gg.__swMark = (s) => { marks.push(s); rcMarks.push(rcNow); };
  gg.__swHvLog = (s) => { marks.push('#' + s); rcMarks.push(rcNow); };
  gg.__swHvStat = (k, v = 1) => { hvStats[k] = (hvStats[k] ?? 0) + v; return hvStats[k]; };
  gg.__swHvDiag = (x, y, _st, gs) => {
    if (!cap) {
      cap = {
        gs,
        prot: JSON.parse(JSON.stringify(gs.protectedRects)),
        larvaX: [...gs.larvaX], larvaY: [...gs.larvaY],
      };
      console.log(`[cap] bee-attempt#1 (${x},${y}) protRects=${cap.prot.length} larva=${cap.larvaX.length}`
        + ` ws=${gs.worldSurface.toFixed(2)} rl=${gs.rockLevel.toFixed(2)} seed=${gs.seed}`);
      throw new Error('SW_III85_ABORT');
    }
  };
  // ── 相 0：围栏探针（SW_III85_GATE=x,y）——给定 origin 重放首门扫描逐格分类 ──
  const gateAt = process.env.SW_III85_GATE;
  if (gateAt) {
    const [gx, gy] = gateAt.split(',').map(Number);
    const stg = loadStore(chOf(46, 'Jungle_Temple'));
    const hist = new Map<string, { n: number; act: number; plat: number }>();
    let solidN = 0, totN = 0;
    for (let dy = -15; dy <= 15; dy++) {
      const half = Math.min(15, Math.trunc(Math.sqrt(256 - dy * dy)));
      for (let dx = -half; dx <= half; dx++) {
        const x = gx + dx, y = gy + dy;
        if (!stg.inBounds(x, y)) continue;
        const i = stg.idx(x, y);
        const d = TILE_DEFS[stg.type[i]];
        const solid = !!stg.flags[i] && !!d && genSolidType(stg.type[i]) && !d?.platform && (stg.wire[i] & 32) === 0;
        totN++;
        if (!solid) {
          if (stg.flags[i] && d) {
            const keyN = `NS ${SHEET[stg.type[i]] >= 0 ? SHEET[stg.type[i]] : 'x' + stg.type[i]}@${TILE_BY_KEY_REV[stg.type[i]] ?? '?'}`;
            hist.set(keyN, ((hist.get(keyN)?.n ?? 0) + 1, { n: (hist.get(keyN)?.n ?? 0) + 1, act: 0, plat: 0 }));
          }
          continue;
        }
        solidN++;
        const key = `${SHEET[stg.type[i]] >= 0 ? SHEET[stg.type[i]] : 'x' + stg.type[i]}@${TILE_BY_KEY_REV[stg.type[i]] ?? '?'}`;
        const h = hist.get(key) ?? { n: 0, act: 0, plat: 0 };
        h.n++; if (stg.wire[i] & 32) h.act++;
        hist.set(key, h);
      }
    }
    console.log(`[gate@${gx},${gy}] circleCells=${totN} jsSolid=${solidN}`);
    for (const [k, v] of [...hist.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`   ${k}: n=${v.n}`);
  }
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onProgress: () => {},
      onWorldPartial: (wp) => { live = wp.store as never as StoreView; },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (!msg.includes('SW_III85_ABORT')) throw e;
  } finally {
    gg.__swHvDiag = undefined;
    gg.__swMark = undefined; gg.__swHvLog = undefined; gg.__swHvStat = undefined;
  }
  if (!cap) throw new Error('capture failed: beehives head never reached');
  const gsc = cap.gs;
  console.log(`phase1 done ${((Date.now() - t0) / 1000).toFixed(0)}s; marks=${marks.length} stats=${JSON.stringify(hvStats)}`);
  console.log('seg5 in-pipeline PLACE/TUN tail:', marks.slice(-30).join(' | '));

  // ── 相 2：反演重放（真值基座单跑）──
  const baseX = chOf(46, 'Jungle_Temple');   // 槽45(LihzahrdTemple)出口=Beehives 基座
  const postX = chOf(47, 'Hives');           // 槽46(Beehives)出口
  const st85 = loadStore(baseX);
  // 基座即 x86 真值 ⇒ 先自证对拍器零差（防加载器伪差）
  console.log('[sanity] base-vs-base:');
  diffBoard('sanity base', baseX, st85 as unknown as StoreView, 4);

  // live(管线相) 尝试流与重放流共享：清空后重挂收集器只收相 2
  marks.length = 0; rcMarks.length = 0; rcNow = 0;
  for (const k of Object.keys(hvStats)) delete hvStats[k];
  const GSW = globalThis as { __swRollCount?: number };
  GSW.__swRollCount = 0;
  rollVals.length = 0;
  if (process.env.SW_FNT === '1') {
    (globalThis as unknown as { __swFntProbeI39?: { emit?: (l: string) => void } }).__swFntProbeI39 = {
      emit: (l: string) => { fntLog.push(`${rcNow}|${l}`); },
    };
  }
  (gg as { __swOnRoll?: (v: number) => void }).__swOnRoll = (v?: number) => { if (v !== undefined) rollVals.push(v); rcNow++; GSW.__swRollCount = rcNow; };
  gg.__swMark = (s) => { marks.push(s); rcMarks.push(rcNow); };
  gg.__swHvLog = (s) => { marks.push('#' + s); rcMarks.push(rcNow); };
  gg.__swHvStat = (k, v = 1) => { hvStats[k] = (hvStats[k] ?? 0) + v; return hvStats[k]; };
  const rng85 = new RNG(gsc.seed);   // ▶Beehives 重播种子语义（WorldGenerator.cs:497）
  // ★IIIII81：SW_DIECALL=1 时给 RNG 打调用栈指纹（仅窗口模式下启用，生产无碍）
  if (process.env.SW_DIECALL === '1') {
    const URp = Object.getPrototypeOf(rng85.ur) as Record<string, unknown>;
    for (const m of ['nextDouble', 'nextIntRange', 'nextInt'] as const) {
      const fn = URp[m] as ((...a: never[]) => number);
      URp[m] = function (...a: never[]) {
        const v = fn.apply(this, a) as number;
        if (rcNow >= DIE_WIN[0] && rcNow <= DIE_WIN[1]) {
          const stk = (new Error().stack ?? '').split('\n').slice(2, 8)
            .map((l2) => { const mm = l2.match(/\(?([^\s()/]*\.ts):(\d+):\d+/); return mm ? `${mm[1]!.split('/').pop()}:${mm[2]}` : ''; })
            .filter(Boolean).join('<');
          dieCalls.push(`${rcNow}|${m}|${stk}`);
        }
        return v;
      };
    }
  }
  const t1 = Date.now();
  runBeehivePass(st85, rng85, gsc);
  console.log(`[replay] runBeehivePass ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  delete (globalThis as unknown as { __swFntProbeI39?: unknown }).__swFntProbeI39;
  gg.__swMark = undefined; gg.__swHvLog = undefined; gg.__swHvStat = undefined;

  { const _kl=(globalThis as unknown as { __swKillLog?: string[] }).__swKillLog; if(_kl&&_kl.length)writeFileSync('/tmp/iii85-out/js-killlog.txt',_kl.join('\n')); delete (globalThis as unknown as { __swKillLog?: unknown }).__swKillLog; }
  const _alt = (globalThis as unknown as { __swAltarLog?: string[] }).__swAltarLog;
  if (_alt && _alt.length) writeFileSync('/tmp/iii85-out/js-altardbg.txt', _alt.join('\n'));
  if (dieCalls.length) writeFileSync('/tmp/iii85-out/js-diecalls.txt', dieCalls.join('\n'));
  if (fntLog.length) writeFileSync('/tmp/iii85-out/js-fntlog.txt', fntLog.join('\n'));
  console.log(`[stats] ${JSON.stringify(hvStats)}`);
  console.log('attempt stream:', marks.join(' | '));
  const rowB = diffBoard('replay(46→47)', postX, st85 as unknown as StoreView);

  // JS 出口快照（x86 dump 同构二进制，供离线聚类仪复用）
  const jsOut = process.env.SW_III85_JSBIN ?? '/tmp/iii85-out/js-slot047';
  {
    const wbuf = (arr: Uint16Array) => Buffer.from(arr.buffer.slice(0) as ArrayBuffer);
    const tOut = new Uint16Array(N);
    for (let i = 0; i < N; i++) tOut[i] = SHEET[st85.type[i]] >= 0 ? SHEET[st85.type[i]] : 9999;
    writeFileSync(`${jsOut}.typ`, wbuf(tOut));
    writeFileSync(`${jsOut}.act`, Buffer.from(st85.flags.map((f) => f & 1)));
    writeFileSync(`${jsOut}.wal`, wbuf(Uint16Array.from(st85.wall)));
    writeFileSync(`${jsOut}.liq`, Buffer.from(st85.liquid));
    writeFileSync(`${jsOut}.lty`, Buffer.from(new Uint8Array(Array.from(st85.liquidType, (v) => Math.max(0, v - 1)))));
    writeFileSync(`${jsOut}.half`, Buffer.from(st85.half));
    writeFileSync(`${jsOut}.slope`, Buffer.from(st85.slope));
    writeFileSync(`${jsOut}.inact`, Buffer.alloc(N));
  }

  // ── 相 3：管线 live store 在同边界的对照读数（上游污染基准）──
  let rowP: DiffRow | null = null;
  if (live) {
    rowP = diffBoard('pipeline(#46 出口 vs 047_Hives)', postX, live!, 20);
  }

  // ── 差异格 → 最近蜂巢尝试归属（粗定位）──
  if ((rowB.dT || rowB.dW || rowB.dL || rowB.dLt) && marks.length) {
    const centers: Array<[number, number, string]> = [];
    for (const m of marks) {
      const mp = m.match(/PLACE (\d+),(\d+)/); if (mp) centers.push([Number(mp[1]), Number(mp[2]), m]);
    }
    const dist2 = (x: number, y: number) => Math.min(...centers.map(([cx, cy]) => (cx - x) ** 2 + (cy - y) ** 2));
    for (const [cx, cy] of rowB.cells.slice(0, 10)) {
      let bi = -1, bd = Infinity;
      centers.forEach(([ax, ay], i) => { const d = (ax - cx) ** 2 + (ay - cy) ** 2; if (d < bd) { bd = d; bi = i; } });
      console.log(`  diff(${cx},${cy}) nearest-hive#${bi}(${centers[bi]?.[0]},${centers[bi]?.[1]}) d≈${Math.sqrt(bd).toFixed(0)}`);
    }
  }
  writeFileSync(OUT, JSON.stringify({ cap: { seed: gsc.seed, ws: gsc.worldSurface, rock: gsc.rockLevel }, marks, rcMarks, rollVals, hvStats, rowB, rowP }));
  console.log(`written ${OUT}; larva=${cap.larvaX.length} prot=${cap.prot.length}`);
}, 900_000);
