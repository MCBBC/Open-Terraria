// 一次性诊断：#28 Underworld 隔离重放 + 分段掷数计——dump027（原版 Webs 末态）直接
// 构造 store，复刻 runUnderworldPass 全段（与真身逐字节一致性校验）+ runHellFortPass，
// 对拍 dump028；输出各段掷骰数（原版总定标 14,451,380 = FNV 8f1bfb12）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runHellFortPass } from '../src/world/gen/vanilla/HellFortPass';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';
import { growAshTree } from '../src/world/gen/vanilla/TreePass';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import type { World } from '../src/world/World';
import { RNG } from '../src/core/rng';
import { TILE_DEFS, T, TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const load = (idx: number, ext: string, name: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const t27 = new Uint16Array(load(27, 'typ', 'Webs').buffer.slice(0));
const a27 = load(27, 'act', 'Webs');
const w27 = new Uint16Array(load(27, 'wal', 'Webs').buffer.slice(0));
const l27 = load(27, 'liq', 'Webs');
const t28 = new Uint16Array(load(28, 'typ', 'Underworld').buffer.slice(0));
const a28 = load(28, 'act', 'Underworld');
const w28 = new Uint16Array(load(28, 'wal', 'Underworld').buffer.slice(0));
const l28 = load(28, 'liq', 'Underworld');

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const LIQTYPE27 = readFileSync('/tmp/sw-uw-liqtype.bin');   // JS 管线 ▶Underworld 时点真值（含岩浆类型位）
const mkStore = (): TileStore => {
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t27[i]) ?? 0;   // ghost type 一并导入（dump 为 RAW）
    st.flags[i] = a27[i] ? 1 : 0;
    st.wall[i] = w27[i];
    st.liquid[i] = l27[i];
    st.liquidType[i] = LIQTYPE27[i] ?? 1; // 类型真值（JS 管线截取;缺省水）
  }
  return st;
};

const ASH = T.ASH;
const HELLSTONE = TILE_BY_KEY['ore_hellstone']!;
const ASH_GRASS = TILE_BY_KEY['v_633_ash_grass_block']!;

/** 与 runUnderworldPass 真身逐步同构（分段计掷）——改真身后须同步此处 */
function replicaUW(st: TileStore, rng: RNG, gs: GenState, mark: (s: string) => void) {
  const { w, h } = st;
  let boundary = h - rng.int(150, 189);
  const lavaSeed = h - rng.int(40, 69);
  for (let x = 0; x < w; x++) {
    boundary += rng.int(-3, 3);
    if (boundary < h - 190) boundary = h - 190;
    if (boundary > h - 160) boundary = h - 160;
    for (let y = boundary - 20 - rng.int(0, 2); y < h; y++) {
      const i = st.idx(x, y);
      if (y >= boundary) {
        st.flags[i] = 0;
        st.liquid[i] = 0; st.liquidType[i] = 0;
      } else {
        st.type[i] = ASH;
      }
    }
  }
  mark('S1-灰烬带');
  let lavaY = lavaSeed;
  for (let x = 10; x < w - 10; x++) {
    lavaY += rng.int(-10, 10);
    if (lavaY > h - 60) lavaY = h - 60;
    if (lavaY < h - 100) lavaY = h - 120;
    for (let y = lavaY; y < h - 10; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  mark('S2-岩浆线');
  for (let x = 0; x < w; x++) {
    if (rng.next() * 50 >= 1) continue;
    let y = h - 65;
    while (!st.flags[st.idx(x, y)] && y > h - 135) y--;
    tileRunner(st, rng, gs, rng.int(0, w - 1), y + rng.int(20, 49), {
      strength: rng.int(15, 19), steps: 1000, type: ASH, addTile: true,
      speedX: 0, speedY: rng.int(1, 2), noYChange: true,
    });
  }
  mark('S3-丘陵');
  {
    const sim = new LiquidSim({ store: st, seed: gs.seed } as unknown as World);
    sim.isGeneratingOrLoadingWorld = true;
    sim.generatingWorld = true;
    sim.genWaterLine = gs.waterLine;
    sim.quickWater();
    sim.dispose();
  }
  mark('QW-沉降');
  const s4hits: Array<[number, number, number]> = [];   // [x, 扫描落点y, draws]
  for (let x = 0; x < w; x++) {
    if (rng.next() * 13 >= 1) continue;
    let y = h - 65;
    while ((st.liquid[st.idx(x, y)] > 0 || st.flags[st.idx(x, y)]) && y > h - 140) y--;
    if (s4hits.length < 6) s4hits.push([x, y, 0]);
    tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
      strength: rng.int(5, 29), steps: 1000, type: ASH, addTile: true,
      speedX: 0, speedY: rng.int(1, 2), noYChange: true,
    });
    let scale = rng.int(1, 2);
    if (rng.next() * 3 < 1) scale *= 0.5;
    if (rng.next() < 0.5) {
      tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
        strength: Math.trunc(rng.int(5, 14) * scale), steps: Math.trunc(rng.int(10, 14) * scale),
        type: ASH, addTile: true, speedX: 1, speedY: 0.3,
      });
    }
    if (rng.next() < 0.5) {
      const s2 = rng.int(1, 2);
      tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
        strength: Math.trunc(rng.int(5, 14) * s2), steps: Math.trunc(rng.int(10, 14) * s2),
        type: ASH, addTile: true, speedX: -1, speedY: 0.3,
      });
    }
    tileRunner(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 9), {
      strength: rng.int(5, 14), steps: rng.int(5, 9), type: -2,
      speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
    });
    if (rng.next() * 3 < 1) {
      tileRunner(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 9), {
        strength: rng.int(10, 29), steps: rng.int(10, 19), type: -2,
        speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
      });
    }
    if (rng.next() * 5 < 1) {
      tileRunner(st, rng, gs, x + rng.int(-15, 14), y + rng.int(-15, 9), {
        strength: rng.int(15, 29), steps: rng.int(5, 19), type: -2,
        speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
      });
    }
  }
  mark('S4-柱+团+挖');
  (globalThis as { __s4hits?: Array<[number, number, number]> }).__s4hits = s4hits;
  for (let n = 0; n < w; n++) {
    tileRunner(st, rng, gs, rng.int(20, w - 21), rng.int(h - 180, h - 11), {
      strength: rng.int(2, 6), steps: rng.int(2, 6), type: -2,
    });
  }
  mark('S5-小挖掘');
  for (let x = 0; x < w; x++) {
    for (const dy of [145, 144]) {
      const i = st.idx(x, h - dy);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  mark('S6-底岩浆');
  for (let n = 0, cnt = Math.trunc(w * h * 0.0008); n < cnt; n++) {
    tileRunner(st, rng, gs, rng.int(0, w - 1), rng.int(h - 140, h - 1), {
      strength: rng.int(2, 6), steps: rng.int(3, 6), type: HELLSTONE,
    });
  }
  mark('S7-地狱石');
  const outer = (x: number) => x < w * 0.17 || x > w * 0.83;
  for (let x = 25; x < w - 25; x++) {
    if (!outer(x)) continue;
    for (let y = h - 300; y < h - 100 + rng.int(-1, 1); y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== ASH || !st.flags[i]) continue;
      let exposed = false;
      for (let ox = -1; ox <= 1 && !exposed; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (!st.inBounds(x + ox, y + oy)) { exposed = true; break; }
          if (!st.flags[st.idx(x + ox, y + oy)]) { exposed = true; break; }
        }
      }
      if (exposed) st.type[i] = ASH_GRASS;
    }
  }
  mark('S8a-灰烬草');
  for (let x = 25; x < w - 25; x++) {
    if (!outer(x)) continue;
    for (let y = h - 200; y < h - 50; y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== ASH_GRASS || !st.flags[i]) continue;
      if (y - 1 < 0 || st.flags[st.idx(x, y - 1)]) continue;
      if (rng.int(0, 2) === 0) growAshTree(st, rng, x, y);
    }
  }
  mark('S8b-灰烬树');
}

const VAN_N = 14451380;

(RUN ? it : it.skip)('underworld isolated replay: sectioned roll counts + diff', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  // A) 真身跑一遍 + 段末快照（计掷）
  const stA = mkStore();
  const rngA = new RNG(rt.gs.seed);
  let drawsA = 0;
  const secA: Array<[string, number]> = [];
  const marks: string[] = [];
  const wrapR = (rng: RNG) => {
    const w2 = <A extends unknown[]>(f: (...a: A) => unknown) =>
      (...a: A) => { (rng === rngA ? drawsA++ : 0); return f(...a); };
    // 单计数器变体：直接闭包引用计数对象
  };
  void wrapR;
  const instrument = (rng: RNG, onDraw: () => void) => {
    const o = rng as unknown as Record<string, unknown>;
    for (const m of ['int', 'next', 'nextInt', 'nextIntRange', 'chance', 'pick', 'range'] as const) {
      const orig = (rng[m] as (...a: unknown[]) => unknown).bind(rng);
      o[m] = (...a: unknown[]) => { onDraw(); return orig(...a); };
    }
  };
  const secLog: string[] = [];
  instrument(rngA, () => { drawsA++; });
  const markA = (s: string) => { secA.push([s, drawsA]); };
  replicaUW(stA, rngA, rt.gs, markA);
  const uwEnd = drawsA;
  runHellFortPass(stA, rngA, rt.gs);
  console.log(`[真身复刻] 总掷=${drawsA} (UW=${uwEnd} HF=${drawsA - uwEnd}) | 原版=${VAN_N} 差=${drawsA - VAN_N}`);
  console.log('分段:', secA.map(([s, n], i) => `${s}=${n - (i ? secA[i - 1]![1] : 0)}`).join(' '));

  // B) 真身函数跑一遍 → 与复刻逐字节一致性校验
  const stB = mkStore();
  const rngB = new RNG(rt.gs.seed);
  let drawsB = 0;
  instrument(rngB, () => { drawsB++; });
  runUnderworldPass(stB, rngB, rt.gs);
  const uwEndB = drawsB;
  runHellFortPass(stB, rngB, rt.gs);
  let ident = true;
  for (const arr of ['type', 'flags', 'wall', 'liquid', 'liquidType'] as const) {
    const x = stA[arr], y = stB[arr];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { ident = false; console.log(`复刻失真 @${arr}[${i}]`); break; }
    if (!ident) break;
  }
  console.log(`复刻一致性=${ident} 掷数 B=${drawsB}(UW=${uwEndB})`);

  // C) 对拍 dump028（用复刻态）
  const st = stA;
  let act = 0, typ = 0, wal = 0, liq = 0;
  const cells: string[] = [];
  const pairs = new Map<string, number>();
  for (let i = 0; i < W * H; i++) {
    const dA = (a28[i] !== 0) !== (st.flags[i] !== 0);
    let jT = SHEET[st.type[i]];
    if (jT === undefined || jT === -1) jT = 0x7777;
    const sameAct = !dA;
    const dT = !sameAct || jT !== t28[i];
    const dW = st.wall[i] !== w28[i];
    const dL = st.liquid[i] !== l28[i];
    if (!(dA || dT || dW || dL)) continue;
    if (dA) act++;
    if (dT && !dA) { typ++; const k = `${jT}>${t28[i]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    if (dW) { wal++; const k = `W${st.wall[i]}>${w28[i]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    if (dL) liq++;
    if (cells.length < 12) {
      const x = i % W, y = (i / W) | 0;
      cells.push(`(${x},${y})t${jT}(id${st.type[i]})>${t28[i]} a${st.flags[i] ? 1 : 0}>${a28[i]} w${st.wall[i]}>${w28[i]} l${st.liquid[i]}>${l28[i]}`);
    }
  }
  console.log(`act差=${act} typ差(同act)=${typ} wal差=${wal} liq差=${liq}`);
  console.log('pairs:', JSON.stringify([...pairs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14)));
  { // 未知 sheet 的 JS id 直方图
    const unk = new Map<number, number>();
    for (let i = 0; i < W * H; i++) if (SHEET[st.type[i]] === -1) unk.set(st.type[i], (unk.get(st.type[i]) ?? 0) + 1);
    console.log('unknown-sheet ids:', JSON.stringify([...unk.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8)));
  }
  console.log(cells.join('\n'));
  { // 地狱液面几何:逐列液面顶 JS vs v28
    const topOf = (getLiQ: (i: number) => number, x: number): number => {
      for (let y = 1000; y < 1190; y++) if (getLiQ(y * W + x) > 0) return y;
      return -1;
    };
    const dh = new Map<number, number>();
    let n = 0;
    for (let x = 0; x < W; x++) {
      const j = topOf((i) => st.liquid[i]!, x), v = topOf((i) => l28[i]!, x);
      const d = j - v;
      dh.set(d, (dh.get(d) ?? 0) + 1);
      if (d !== 0) n++;
    }
    console.log('液面顶差直方图(js-van):', JSON.stringify([...dh.entries()].sort((a, b) => a[0] - b[0])), '非零列=', n);
  }
  { // liq 差空间分布 + 方向统计
    let jsMore = 0, vanMore = 0;
    const yBands = new Map<number, number>();
    for (let i = 0; i < W * H; i++) {
      if (st.liquid[i] === l28[i]) continue;
      if (st.liquid[i] > l28[i]) jsMore++; else vanMore++;
      const y = ((i / W) | 0);
      const b = y < 300 ? 0 : y < 600 ? 300 : y < 900 ? 600 : y < 1000 ? 900 : 1000;
      yBands.set(b, (yBands.get(b) ?? 0) + 1);
    }
    console.log(`liq方向: js多=${jsMore} van多=${vanMore} | y带:`, JSON.stringify([...yBands.entries()].sort()));
  }
  { // S4 首批锚点 vs dump28 灰烬柱
    const hits = (globalThis as { __s4hits?: Array<[number, number, number]> }).__s4hits ?? [];
    console.log('S4首批锚点(x,scanY):', JSON.stringify(hits));
    for (const [x, y] of hits) {
      // 在 dump28 找该 x±2 范围内最深的活性灰烬柱顶（y 1040..1140）
      const tops: string[] = [];
      for (const dx of [-2, -1, 0, 1, 2]) {
        let top = -1;
        for (let yy = 1040; yy < 1145; yy++) {
          const i = yy * W + x + dx;
          if (a28[i] && t28[i] === 57) { top = yy; break; }
        }
        tops.push(`${dx}:${top}`);
      }
      console.log(`  x=${x} scanY=${y} van柱顶(${tops.join(' ')})`);
    }
  }
  { // 地狱列剖 x=2000：JS终态 vs v28 vs v27（1=液 0=空 #=实心）
    const seg2: string[] = [];
    for (let y = 1000; y < 1198; y++) {
      const i = y * W + 2000;
      const c = (l: number, a: number) => a ? '#' : l > 0 ? '1' : '0';
      seg2.push(`${y}:${c(st.liquid[i]!, st.flags[i])}${a28[i] ? '#' : l28[i]! > 0 ? '1' : '0'}${a27[i] ? '#' : l27[i]! > 0 ? '1' : '0'}`);
    }
    console.log('col2000(js/v28/v27):', seg2.join(' '));
  }
  { // 定点列剖:x=2434 y470..540（JS vs dump27 vs dump28 液体）
    const seg: string[] = [];
    for (let y = 470; y < 540; y++) {
      const i = y * W + 2434;
      if (l27[i] || l28[i] || st.liquid[i]) seg.push(`${y}: js${st.liquid[i]} v27=${l27[i]} v28=${l28[i]} a27=${a27[i]}`);
    }
    console.log('col2434:', seg.join(' | '));
  }
  void secLog; void marks;
}, 480000);
