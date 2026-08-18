// GGG 批一次性诊断（2026-08-18）：Dungeon/Temple 双 pass 隔离重放——
// ① dump031_Slush(8通道真值)→runDungeonPass→对拍 032_Dungeon；
// ② dump045_Wet_Jungle(8通道真值)→runTemplePass→对拍 046_Jungle_Temple。
// 输入构店：typ/act/wal/liq/half/slope/lty 全取 x86 真值（/tmp/sw-slp/g 新 8 通道），
// frameX/frameY 取管线同时点快照（不入四通道裁决）。主流掷数经计数代理逐段报告。
// 用法：cd game && SW_GGG=1 npx vitest run tools/_gggreplay.test.ts
//      SW_GGG_DG=0 / SW_GGG_TM=0 单跳；SW_GGG_FULLPAIR=1 打全量 pair 直方图。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runTemplePass } from '../src/world/gen/vanilla/TemplePass';

const RUN = process.env.SW_GGG === '1';
const VG = process.env.SW_GGG_VG ?? '/tmp/sw-num4/van_x86_g';
const G2 = process.env.SW_GGG_G2 ?? '/tmp/sw-slp/g';
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
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(VG)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v instanceof Float32Array) c[k] = v.slice();
    else if (v instanceof Uint16Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

interface Snap { frameX: Uint16Array; frameY: Uint16Array; liqType: Uint8Array }
interface Cap { gs: GenState; snap: Snap }

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

function buildStore(idx: number, snap: Snap): TileStore {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  const gT = le16(`${pre}.typ`), gA = readFileSync(`${pre}.act`), gW = le16(`${pre}.wal`);
  const gL = readFileSync(`${pre}.liq`), gLty = readFileSync(`${pre}.lty`);
  const gHf = readFileSync(`${pre}.half`), gSl = readFileSync(`${pre}.slope`);
  const rs = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    rs.flags[i] = gA[i] ? 1 : 0;
    rs.type[i] = gA[i] ? (REV.get(gT[i]!) ?? 0) : 0;
    rs.wall[i] = gW[i]!;
    rs.liquid[i] = gL[i]!;
    rs.liquidType[i] = gLty[i]!;
    rs.half[i] = gHf[i]!;
    rs.slope[i] = gSl[i]!;
    rs.frameX[i] = snap.frameX[i]!;
    rs.frameY[i] = snap.frameY[i]!;
  }
  return rs;
}

/** 主流掷数计数代理（int/nextInt/next/vanilla.next 四入口同计数） */
function countingRng(seed: number): { rng: RNG; n: () => number; hash: () => string } {
  const ur = new UnifiedRandom(seed);
  let count = 0;
  const cu = {
    next: () => { count++; return ur.next(); },
    nextDouble: () => { count++; return ur.nextDouble(); },
    nextInt: (m: number) => { count++; return ur.nextInt(m); },
    nextIntRange: (a: number, b: number) => { count++; return ur.nextIntRange(a, b); },
  } as unknown as UnifiedRandom;
  const hash = (): string => {
    let h = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < 56; k++) { const v = ur.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
    const ix = ur.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return h.toString(16).padStart(8, '0');
  };
  const rng = {
    next: () => cu.nextDouble(),
    int: (a: number, b: number) => cu.nextIntRange(a, b + 1),
    range: (a: number, b: number) => a + cu.nextDouble() * (b - a),
    chance: (p: number) => cu.nextDouble() < p,
    pick: <T,>(arr: T[]) => arr[cu.nextInt(arr.length)],
    nextInt: (m: number) => cu.nextInt(m),
    nextIntRange: (a: number, b: number) => cu.nextIntRange(a, b),
    reseed: (_s: number) => { throw new Error('reseed in replay'); },
    get vanilla() { return cu; },
  } as unknown as RNG;
  return { rng, n: () => count, hash };
}

interface DiffRow {
  dT: number; dA: number; dW: number; dL: number; dHf: number; dSl: number;
  first: string; pairs: Map<string, number>; samples: Array<[number, number, number, number]>;
}

function diffGrids(st: TileStore, idx: number): DiffRow {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  const gT = le16(`${pre}.typ`), gA = readFileSync(`${pre}.act`), gW = le16(`${pre}.wal`);
  const gL = readFileSync(`${pre}.liq`), gHf = readFileSync(`${pre}.half`), gSl = readFileSync(`${pre}.slope`);
  const r: DiffRow = { dT: 0, dA: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, first: '', pairs: new Map(), samples: [] };
  for (let i = 0; i < N; i++) {
    const va = gA[i]!, ja = st.flags[i]! & 1;
    let bad = false;
    if (va !== ja) { r.dA++; bad = true; }
    const vt = va ? gT[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) {
      r.dT++; bad = true;
      const k = `${vt}>${jt}`;
      r.pairs.set(k, (r.pairs.get(k) ?? 0) + 1);
    }
    if (gW[i]! !== st.wall[i]!) { r.dW++; bad = true; }
    if (gL[i]! !== st.liquid[i]!) { r.dL++; bad = true; }
    if (gHf[i]! !== st.half[i]!) r.dHf++;
    if (gSl[i]! !== st.slope[i]!) r.dSl++;
    if (bad && r.samples.length < 4000) {
      r.samples.push([i % W, Math.floor(i / W), vt, jt]);
      if (!r.first) r.first = `(${i % W},${Math.floor(i / W)})`;
    }
  }
  return r;
}

/** 差格空间聚类：64×64 桶聚合，输出簇 bbox+计数 */
function clusters(cells: Array<[number, number, number, number]>, pairKey?: string): string[] {
  const sel = pairKey ? cells.filter(([x, y, vt, jt]) => `${vt}>${jt}` === pairKey) : cells;
  const buckets = new Map<string, { n: number; x0: number; x1: number; y0: number; y1: number }>();
  for (const [x, y] of sel) {
    const k = `${Math.floor(x / 64)}:${Math.floor(y / 64)}`;
    const b = buckets.get(k) ?? { n: 0, x0: x, x1: x, y0: y, y1: y };
    b.n++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
    buckets.set(k, b);
  }
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 24)
    .map((b) => `[${b.x0}..${b.x1} × ${b.y0}..${b.y1}]×${b.n}`);
}

(RUN ? it : it.skip)('GGG isolated replay: Dungeon 031→032 / Temple 045→046', async () => {
  // ① 全量跑抓 Dungeon/LihzahrdTemple reseed 时点 gs + 帧/液体类型快照
  const caps = new Map<string, Cap>();
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { src = readFileSync(file, 'utf8').split('\n'); srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1]!.trim();
    }
    return '';
  };
  let liveStore: TileStore | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_gggreplay')) {
          const lab = labelOf(m[1]!, Number(m[2]));
          if ((lab === 'Dungeon' || lab === 'LihzahrdTemple') && !caps.has(lab)) {
            const gs = lastGenState();
            if (gs) {
              caps.set(lab, {
                gs: cloneGs(gs),
                snap: { frameX: liveStore.frameX.slice(), frameY: liveStore.frameY.slice(), liqType: liveStore.liquidType.slice() },
              });
            }
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: (w) => { liveStore = w.store as never as TileStore; } });
  } finally { RNGp.reseed = oReseed; }
  if (!caps.has('Dungeon') || !caps.has('LihzahrdTemple')) throw new Error(`capture failed: ${[...caps.keys()]}`);
  console.log(`caps: ${[...caps.keys()].join(',')} dungeonLoc=${caps.get('Dungeon')!.gs.dungeonLocation}`);

  // ② Dungeon 重放
  if (process.env.SW_GGG_DG !== '0') {
    const cap = caps.get('Dungeon')!;
    const st = buildStore(31, cap.snap);
    const { rng, n } = countingRng(cap.gs.seed);
    const marks: Array<[string, number]> = [];
    const chests: never[] = [];
    // 段界快照（SW_GGG_TRACE=1）：C/B 段前后的网格态，用于把"终态差"按
    // 后段写入足迹掩蔽拆账——定位 B 时点两侧网格的先行差
    const snapsD = new Map<string, { f: Uint8Array; t: Uint16Array; w: Uint16Array }>();
    const bsEv: Array<[number, number, number, number, number, boolean, number, number]> = [];
    (globalThis as Record<string, unknown>).__bsEv = bsEv;
    runDungeonPass(st, rng, cap.gs, chests, (name) => {
      marks.push([name, n()]);
      if (process.env.SW_GGG_TRACE && (name === 'dungeonC' || name === 'dungeonB')) {
        snapsD.set(name, { f: st.flags.slice(), t: st.type.slice(), w: st.wall.slice() });
      }
    });
    delete (globalThis as Record<string, unknown>).__bsEv;
    // 书架事件对拍 x86（/tmp/dgu/brep3_shelves.json——Z 批 DgFeatProbe 真值 182 件；
    // 字段 [k0,k1,x,y,n10,flag3,n7,dist]，k 为内部 dgMainRolls 计数——实际流位差 +6442）
    if (process.env.SW_GGG_TRACE && bsEv.length) {
      const x86 = JSON.parse(readFileSync('/tmp/dgu/brep3_shelves.json', 'utf8')) as Array<[number, number, number, number, number, boolean, number, number]>;
      console.log(`shelf events: js=${bsEv.length} x86=${x86.length}`);
      let shift0 = 0;
      for (let q = 0; q < Math.min(bsEv.length, x86.length); q++) {
        const [a, , c, d] = bsEv[q]!, x8 = x86[q]!;
        const sameSite = c === x8[2] && d === x8[3];
        const dk = a + 6442 + 2 - x8[0]!;   // +2 = k0 相位修正（js k0 在 picks 前，x86 在后）
        if (!sameSite || (q > 0 && dk !== shift0)) {
          console.log(`  #${q} js=[${bsEv[q]}] (actual k0=${a + 6444}) x86=[${x8}] dk=${dk} ← 首分叉/移位变化`);
          for (let w = Math.max(0, q - 3); w < q; w++) console.log(`    #${w} js=[${bsEv[w]}] (ak=${bsEv[w]![0]! + 6444}) x86=[${x86[w]}] dk=${bsEv[w]![0]! + 6444 - x86[w]![0]!}`);
          shift0 = dk;
          if (shift0 !== 0 && q > 3) break;
        }
        shift0 = dk;
      }
      // 尾部 12 件并排（查索引错位/再对齐）
      console.log('tail js : ' + bsEv.slice(-12).map((e) => `${e[0]! + 6444}:${e[2]},${e[3]}`).join(' '));
      console.log('tail x86: ' + x86.slice(-12).map((e) => `${e[0]}:${e[2]},${e[3]}`).join(' '));
    }
    // Z 批 x86 真值 mark（seed 9293480，zmarks.py 反解；oracle 同构验证）
    const X86: Record<string, number> = { dungeonL: 199, dungeonE: 6833, dungeonPD: 6833, dungeonPi: 9433, dungeonS: 13773, dungeonD: 13997, dungeonW: 14042, dungeonP: 14042, dungeonC: 14400, dungeonB: 156041, dungeon: 243293 };
    console.log('\n== Dungeon marks (JS vs x86) ==');
    for (const [name, k] of marks) {
      const t = X86[name];
      console.log(`${name.padEnd(10)} js=${String(k).padStart(7)} x86=${t === undefined ? '  ?' : String(t).padStart(7)} ${t === undefined ? '' : (k === t ? '=' : (k - t > 0 ? '+' : '') + (k - t))}`);
    }
    const r = diffGrids(st, 32);
    const top = [...r.pairs.entries()].sort((a, b) => b[1] - a[1]).slice(process.env.SW_GGG_FULLPAIR ? 200 : 12);
    console.log(`032 diff T=${r.dT} A=${r.dA} W=${r.dW} L=${r.dL} half=${r.dHf} slope=${r.dSl} first=${r.first}`);
    console.log(`pairs: ${top.map(([k, c]) => `${k}×${c}`).join(' ')}`);
    if (r.dT) {
      console.log(`clusters(all): ${clusters(r.samples).join(' ')}`);
      const key = top[0]![0];
      console.log(`clusters(${key}): ${clusters(r.samples, key).join(' ')}`);
    }
    if (r.dW) {
      const pre = `${G2}/032_Dungeon`;
      const gW2 = le16(`${pre}.wal`);
      const cellsW: string[] = [];
      for (let i = 0; i < N && cellsW.length < 12; i++) {
        if (gW2[i]! !== st.wall[i]!) cellsW.push(`(${i % W},${Math.floor(i / W)}) v${gW2[i]}>j${st.wall[i]}`);
      }
      console.log(`wall diffs: ${cellsW.join(' ')}`);
    }
    if (process.env.SW_GGG_TRACE && snapsD.has('dungeonC')) {
      // C 时点(=B 输入) vs 032 终态；掩蔽 = JS 侧 C→final 被后段改写的格
      const pre = `${G2}/032_Dungeon`;
      const gT2 = le16(`${pre}.typ`), gA2 = readFileSync(`${pre}.act`);
      const sc = snapsD.get('dungeonC')!;
      const masked = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const jaF = st.flags[i]! & 1, jtF = SHEET[st.type[i]!] ?? -1;
        const jaC = sc.f[i]! & 1, jtC = SHEET[sc.t[i]!] ?? -1;
        if (jaF !== jaC || jtF !== jtC || st.wall[i]! !== sc.w[i]!) masked[i] = 1;
      }
      let unmasked = 0;
      const cellsU: string[] = [];
      const pcU = new Map<string, number>();
      for (let i = 0; i < N; i++) {
        if (masked[i]) continue;
        const va = gA2[i]!, ja = sc.f[i]! & 1;
        const vt = va ? gT2[i]! : 0;
        const jt = ja ? (SHEET[sc.t[i]!] >= 0 ? SHEET[sc.t[i]!]! : 9999) : 0;
        if (va !== ja || vt !== jt) {
          unmasked++;
          if (cellsU.length < 16) cellsU.push(`(${i % W},${Math.floor(i / W)})${vt}>${jt}`);
          pcU.set(`${vt}>${jt}`, (pcU.get(`${vt}>${jt}`) ?? 0) + 1);
        }
      }
      console.log(`C-time unmasked-diff vs 032: n=${unmasked} pairs=${[...pcU.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => `${k}×${c}`).join(' ')}`);
      console.log(`  cells: ${cellsU.join(' ')}`);
    }
  }

  // ③ Temple 重放
  if (process.env.SW_GGG_TM !== '0') {
    const cap = caps.get('LihzahrdTemple')!;
    const st = buildStore(45, cap.snap);
    const { rng, n, hash } = countingRng(cap.gs.seed);
    const marks: Array<[string, number]> = [];
    (globalThis as Record<string, unknown>).__swTmMark = (s: string) => marks.push([s, n()]);
    // pather 序列对拍（vs /tmp/sw-tm/probe.log PATH 行——L 批 TempleProbe 资产）
    const paths: string[] = [];
    (globalThis as Record<string, unknown>).__swTmPath = (s: string) => paths.push(`${s} rng=${hash()}`);
    const roomsCap: Array<{ x: number; y: number; w: number; h: number }> = [];
    (globalThis as Record<string, unknown>).__swTmRooms = (rs: Array<{ x: number; y: number; w: number; h: number }>) => roomsCap.push(...rs.map((r) => ({ ...r })));
    try {
      runTemplePass(st, rng, cap.gs);
    } finally {
      delete (globalThis as Record<string, unknown>).__swTmMark;
      delete (globalThis as Record<string, unknown>).__swTmPath;
      delete (globalThis as Record<string, unknown>).__swTmRooms;
    }
    console.log(`rooms(${roomsCap.length}): ${roomsCap.map((r) => `[${r.x},${r.y} ${r.w}x${r.h}]`).join('')}`);
    const probe = readFileSync('/tmp/sw-tm/probe.log', 'utf8').split('\n').filter((l) => l.startsWith('PATH '));
    let pbad = 0;
    for (let k = 0; k < Math.max(probe.length, paths.length); k++) {
      const pv = probe[k]?.slice(5).replace(/\s+->\s+/g, '->'), jv = paths[k];
      if (pv !== jv) { if (pbad < 6) console.log(`PATH#${k} MISMATCH\n  van:${pv}\n  js :${jv}`); pbad++; }
    }
    console.log(`path seq: js=${paths.length} van=${probe.length} mismatch=${pbad}`);
    // L 批 N 定标：#46 Jungle_Temple = 107,941 掷（x86 passchain FNV 暴力）
    console.log('\n== Temple marks (js, x86 total=107941) ==');
    for (const [name, k] of marks) console.log(`${name.padEnd(8)} js=${k}`);
    const r = diffGrids(st, 46);
    // ★双跑定位：226>0 差格在 JS 哪个段被清（对拍 vanilla 侧一直保持砖）——
    //   重放是确定性的：第二跑逐 tmMark 快照差格 (act,typ) 态，输出段转移直方图
    const cells = r.samples.filter(([, , vt, jt]) => vt === 226 && jt === 0).map(([x, y]) => y * W + x);
    if (process.env.SW_GGG_TRACE) {
      const st2 = buildStore(45, cap.snap);
      const { rng: rng2, n: n2 } = countingRng(cap.gs.seed);
      const stateAt = new Map<string, string>();
      let cleanerSnap: { f: Uint8Array; t: Uint16Array } | null = null;
      (globalThis as Record<string, unknown>).__swTmMark = (s: string) => {
        if (cells.length) {
          let act1 = 0;
          for (const i of cells) if (st2.flags[i]! & 1) act1++;
          stateAt.set(s, `${act1}/${cells.length} rolls=${n2()}`);
        }
        if (s === 'cleaner') cleanerSnap = { f: st2.flags.slice(), t: st2.type.slice() };
      };
      try { runTemplePass(st2, rng2, cap.gs); } finally { delete (globalThis as Record<string, unknown>).__swTmMark; }
      if (cells.length) console.log('226>0 cells still-active per mark(js): ' + [...stateAt.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
      // cleaner 时点（祭坛/木刺前）vs 046 终态差——祭坛+木刺两段能否解释全部掩蔽
      if (cleanerSnap) {
        const pre = `${G2}/046_Jungle_Temple`;
        const gT2 = le16(`${pre}.typ`), gA2 = readFileSync(`${pre}.act`);
        const diffC: Array<[number, number, number, number]> = [];
        for (let i = 0; i < N; i++) {
          const va = gA2[i]!, ja = cleanerSnap.f[i]! & 1;
          const vt = va ? gT2[i]! : 0;
          const jt = ja ? (SHEET[cleanerSnap.t[i]!] >= 0 ? SHEET[cleanerSnap.t[i]!]! : 9999) : 0;
          if (va !== ja || vt !== jt) diffC.push([i % W, Math.floor(i / W), vt, jt]);
        }
        const pc = new Map<string, number>();
        for (const [, , vt, jt] of diffC) pc.set(`${vt}>${jt}`, (pc.get(`${vt}>${jt}`) ?? 0) + 1);
        console.log(`cleaner-time vs 046: n=${diffC.length} pairs=${[...pc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => `${k}×${c}`).join(' ')} first=${diffC[0] ? `(${diffC[0][0]},${diffC[0][1]})` : ''}`);
        console.log(`  cells: ${diffC.slice(0, 24).map(([x, y, vt, jt]) => `(${x},${y})${vt}>${jt}`).join(' ')}`);
      }
    }
    const top = [...r.pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`046 diff T=${r.dT} A=${r.dA} W=${r.dW} L=${r.dL} half=${r.dHf} slope=${r.dSl} first=${r.first}`);
    console.log(`pairs: ${top.map(([k, c]) => `${k}×${c}`).join(' ')}`);
    const altCells = r.samples.filter(([, , vt, jt]) => vt === 237 || jt === 237);
    if (altCells.length) console.log(`altar cells: ${altCells.map(([x, y, vt, jt]) => `(${x},${y})${vt}>${jt}`).join(' ')}`);
    console.log(`gs.lAltar=${cap.gs.lAltarX},${cap.gs.lAltarY} mainPath-related; acx-implicit=3457+50`);
    // 模拟真流：altar 段（起点 105787）逐掷重演——第 k 次采样 (acx+15-Next(30), acy+15-Next(30))
    {
      const ur = new UnifiedRandom(cap.gs.seed);
      for (let k = 0; k < 105787; k++) ur.nextInt(2);
      const acx = 3507, acy = 700;
      let s = '';
      for (let t = 1; t <= 1000; t++) {
        const sx = acx + 15 - ur.nextInt(30), sy = acy + 15 - ur.nextInt(30);
        if (t >= 998 || t === 1) s += `t${t}:(${sx},${sy}) `;
      }
      const r1 = ur.nextIntRange(-10, 11), r2 = ur.nextIntRange(-10, 11);
      console.log(`samples: ${s}`);
      console.log(`fallback rolls (after 1000 tries): x=${r1} y=${r2} → anchor=(${acx + r1},${acy + r2})`);
      // 邻近流位的 -10..10 掷值谱：定位 vanilla 兜底（需 x 掷=-2 → 锚 3505）
      const ur2 = new UnifiedRandom(cap.gs.seed);
      const vals: string[] = [];
      for (let k = 0; k < 105787 + 2000 - 12; k++) ur2.nextInt(2);
      for (let k = 0; k < 26; k++) vals.push(`${105787 + 2000 - 12 + k}:${ur2.nextIntRange(-10, 11)}`);
      console.log(`roll values near fallback: ${vals.join(' ')}`);
    }
    if (r.dT) {
      console.log(`clusters(all): ${clusters(r.samples).join(' ')}`);
      const key = top[0]![0];
      console.log(`clusters(${key}): ${clusters(r.samples, key).join(' ')}`);
      // 226>0 细剖：每簇打印首 60 行（y 向条带）看结构形态
      const sel = r.samples.filter(([, , vt, jt]) => vt === 226 && jt === 0);
      const byRow = new Map<number, { x0: number; x1: number; n: number }>();
      for (const [x, y] of sel) {
        const b = byRow.get(y) ?? { x0: x, x1: x, n: 0 };
        b.n++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
        byRow.set(y, b);
      }
      const rows = [...byRow.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30);
      console.log(`226>0 rows(top): ${rows.map(([y, b]) => `y${y}[${b.x0}..${b.x1}]×${b.n}`).join(' ')}`);
      // 226>0 交叉表：JS 侧 (act,wall,typ,ghost) 分布——判断"被清/被挖/未写"
      const pre46 = `${G2}/046_Jungle_Temple`;
      const gW46 = le16(`${pre46}.wal`), gA46 = readFileSync(`${pre46}.act`);
      const cross = new Map<string, number>();
      for (const [x, y, vt, jt] of r.samples) {
        if (vt !== 226 || jt !== 0) continue;
        const i = y * W + x;
        const key = `act=${st.flags[i]! & 1},wall=${st.wall[i]!},jtyp=${SHEET[st.type[i]!] ?? -1},vact=${gA46[i]!},vwal=${gW46[i]!}`;
        cross.set(key, (cross.get(key) ?? 0) + 1);
      }
      console.log(`226>0 JS-side crosstab: ${[...cross.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => `${k}×${c}`).join(' | ')}`);
      // ASCII 差图窗口（SW_GGG_MAP=x0:x1:y0:y1）
      const mapWin = process.env.SW_GGG_MAP;
      if (mapWin) {
        const [mx0, mx1, my0, my1] = mapWin.split(':').map(Number);
        const gT46 = le16(`${pre46}.typ`);
        const CH: Record<number, string> = { 0: '·', 226: '#', 232: 's', 59: 'm', 60: 'g', 237: 'A', 10: 'D', 87: 'w' };
        const cc = (v: number, a: number): string => (a ? (CH[v] ?? '?') : (v === 0 ? '·' : (CH[v] ?? '?').toLowerCase()));
        console.log(`map V=vanilla J=js x[${mx0},${mx1}) y[${my0},${my1}) (#=226 s=232 m=59 A=237 ·=air lowercase=inactive ghost)`);
        for (let y = my0; y < my1; y++) {
          let rv = '', rj = '';
          for (let x = mx0; x < mx1; x++) {
            const i = y * W + x;
            rv += cc(gT46[i]!, gA46[i]!);
            rj += cc(SHEET[st.type[i]!] ?? -1, (st.flags[i]! & 1) === 1);
          }
          console.log(`${String(y).padStart(4)} V${rv} J${rj}`);
        }
        // '?' 普查：未知渲染字符的 (vt,va,jt,ja) 分布
        const unk = new Map<string, number>();
        for (let y = my0; y < my1; y++) for (let x = mx0; x < mx1; x++) {
          const i = y * W + x;
          const jt = SHEET[st.type[i]!] ?? -1, vt = gT46[i]!;
          if (!(jt in CH) || !(vt in CH)) unk.set(`v${vt}/${gA46[i]} j${jt}/${st.flags[i]! & 1}`, (unk.get(`v${vt}/${gA46[i]} j${jt}/${st.flags[i]! & 1}`) ?? 0) + 1);
        }
        console.log(`unknown-render census: ${[...unk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => `${k}×${c}`).join(' | ')}`);
      }
    }
  }
}, 900_000);
