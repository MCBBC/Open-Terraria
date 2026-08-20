// VVVVV 一次性探针（#77 Piles 债）：/tmp/ss-b/{ss12345,ssm}/trapsIn 基座 →
// Traps+Piles 串重放 → golden 077 八通道对拍 + 差异格现场（dump76/77 类型对照）。
// 用法：cd game && SW_VV=1 SW_VV_KEY=ss12345 npx vitest run tools/_vv1.test.ts
import { it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_VV === '1';
const KEY = process.env.SW_VV_KEY ?? 'ss12345';
const BDIR = `/tmp/ss-b/${KEY}/trapsIn`;
const G2 = process.env.SW_VV_G2 ?? (KEY === 'ss12345' ? '/tmp/sw-slp/g12345' : '/tmp/sw-slp/g-m20260811');
const N0 = statSync(`${BDIR}/flags.bin`).size;
const H = process.env.SW_VV_H ? Number(process.env.SW_VV_H) : 1200;
const W = N0 / H;
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

const { generateWorld: _gw } = { generateWorld };  // keep import shape stable
void _gw;

function loadBase(): { st: TileStore; gs: GenState; chests: Array<{ x: number; y: number; items: unknown[] }> } {
  const mod = { TileStore: (globalThis as Record<string, unknown>)['__nope'] };
  void mod;
  // TileStore 动态 import 避免循环依赖风险（探针惯例）
  const TS = (globalThis as Record<string, unknown>).__vvTS as typeof TileStore | undefined;
  void TS;
  throw new Error('replaced-by-inline');
}

it('probe', async () => {
  if (!RUN) return;
  // —— 内联装载（不依赖 loadBase 占位）——
  const { TileStore: TS } = await import('../src/world/TileStore');
  const st = new TS(W, H) as TileStore;
  const fb = b8(`${BDIR}/flags.bin`), tb = b16(`${BDIR}/type.bin`);
  const fx = b16(`${BDIR}/frameX.bin`), fy = b16(`${BDIR}/frameY.bin`);
  const wb = b16(`${BDIR}/wall.bin`), lb = b8(`${BDIR}/liquid.bin`), ltb = b8(`${BDIR}/liquidType.bin`);
  const hb = b8(`${BDIR}/half.bin`), sb = b8(`${BDIR}/slope.bin`), wr = b8(`${BDIR}/wire.bin`);
  const pb = b8(`${BDIR}/paint.bin`), pwb = b8(`${BDIR}/paintWall.bin`);
  st.flags.set(fb); st.type.set(tb); st.frameX.set(fx); st.frameY.set(fy);
  st.wall.set(wb); st.liquid.set(lb); st.liquidType.set(ltb);
  st.half.set(hb); st.slope.set(sb); st.wire.set(wr); st.paint.set(pb); st.paintWall.set(pwb);
  const gs = JSON.parse(readFileSync(`${BDIR}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  restoreGenSolid(gensolid);
  const chests = JSON.parse(readFileSync(`${BDIR}/chests.json`, 'utf8')) as Array<{ x: number; y: number; items: unknown[] }>;

  // golden 76/77 通道
  const g = (idx: number, ext: string) => readFileSync(`${G2}/${String(idx).padStart(3, '0')}_${idx === 76 ? 'Traps' : 'Piles'}.${ext}`);
  const G76 = { t: new Uint16Array(g(76, 'typ').buffer.slice(0)), a: new Uint8Array(g(76, 'act').buffer.slice(0)), w: new Uint16Array(g(76, 'wal').buffer.slice(0)), l: new Uint8Array(g(76, 'liq').buffer.slice(0)), hf: new Uint8Array(g(76, 'half').buffer.slice(0)), sl: new Uint8Array(g(76, 'slope').buffer.slice(0)), lt: new Uint8Array(g(76, 'lty').buffer.slice(0)), ia: new Uint8Array(g(76, 'inact').buffer.slice(0)) };
  const G77 = { t: new Uint16Array(g(77, 'typ').buffer.slice(0)), a: new Uint8Array(g(77, 'act').buffer.slice(0)), w: new Uint16Array(g(77, 'wal').buffer.slice(0)), l: new Uint8Array(g(77, 'liq').buffer.slice(0)), hf: new Uint8Array(g(77, 'half').buffer.slice(0)), sl: new Uint8Array(g(77, 'slope').buffer.slice(0)), lt: new Uint8Array(g(77, 'lty').buffer.slice(0)), ia: new Uint8Array(g(77, 'inact').buffer.slice(0)) };

  // Traps 前 76 基线快照（差异格现场用：76 态=vanilla 进 Piles 前状态）
  const pre76 = { t: G76.t.slice(), a: G76.a.slice() };

  const rng = new RNG(gs.seed as number);
  rng.reseed(gs.seed as number);
  const kills: string[] = [];
  (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void }).__swKillCap = (x, y, sheet) => {
    if (kills.length < 4000) kills.push(`k(${x},${y}) s${sheet}`);
  };
  // 现场捕获：凳 89 域 (3100..3160,760..790) 与椅 15 域 (1330..1370,90..115)
  // 与暗影珠 31 域 (1215..1255,460..495) 的引擎帧调用（tileFrameGen 入口无钩——
  // 用杀账+放置账近似）；185 漏放点邻域 (2320..2360,240..265) 放置账
  const pilesLog: string[] = [];
  (globalThis as { __swPilesCap?: (x: number, y: number, t: number, s: number, z: number, k: number) => void }).__swPilesCap = (x, y, t, s, z, k) => {
    const near = (x >= 3100 && x <= 3160 && y >= 760 && y <= 790)
      || (x >= 1330 && x <= 1370 && y >= 90 && y <= 115)
      || (x >= 1215 && x <= 1255 && y >= 460 && y <= 495)
      || (x >= 2320 && x <= 2360 && y >= 240 && y <= 265)
      || (x >= 810 && x <= 850 && y >= 315 && y <= 345)
      || (x >= 1225 && x <= 1250 && y >= 470 && y <= 495);
    if (near) pilesLog.push(`place(${x},${y}) sh${t} style${s} size${z} fx${k}`);
  };
  runTrapsPass(st, rng, gs, chests);

  // —— Traps 对拍 golden 076（基线校验，应全零）——
  const cmpCh = (c: typeof G77, tag: string): { dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number; pair: Map<string, number>; samples: string[] } => {
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
    const pair = new Map<string, number>(); const samples: string[] = [];
    for (let i = 0; i < N; i++) {
      const va = c.a[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { dA++; if (samples.length < 12) samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
      const vt = va ? c.t[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) { dT++; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (samples.length < 12) samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
      if (c.w[i]! !== st.wall[i]!) { dW++; if (samples.length < 12) samples.push(`W(${i % W},${(i / W) | 0}) v${c.w[i]} j${st.wall[i]}`); }
      if (c.l[i]! !== st.liquid[i]!) { dL++; if (samples.length < 12) samples.push(`L(${i % W},${(i / W) | 0}) v${c.l[i]} j${st.liquid[i]}`); }
      if (c.hf[i]! !== st.half[i]!) { dHf++; if (samples.length < 12) samples.push(`H(${i % W},${(i / W) | 0}) v${c.hf[i]} j${st.half[i]}`); }
      if (c.sl[i]! !== st.slope[i]!) { dSl++; if (samples.length < 12) samples.push(`S(${i % W},${(i / W) | 0}) v${c.sl[i]} j${st.slope[i]}`); }
      const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) { dLt++; if (samples.length < 12) samples.push(`Y(${i % W},${(i / W) | 0}) v${vl} j${jl}`); }
      const via = c.ia[i]! ? 1 : 0, jia = (st.wire[i]! >>> 5) & 1;
      if (via !== jia) { dIa++; if (samples.length < 12) samples.push(`I(${i % W},${(i / W) | 0}) v${via} j${jia}`); }
    }
    console.log(`${tag}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}`);
    if (pair.size) console.log(`  pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ')}`);
    if (samples.length) console.log(`  samples: ${samples.join(' | ')}`);
    return { dA, dT, dW, dL, dHf, dSl, dLt, dIa, pair, samples };
  };
  cmpCh(G76, 'Traps vs golden076');

  // JS Traps 后状态快照（对照差异格的 JS 进 Piles 前状态）
  const jsPre = { t: st.type.slice(), f: st.flags.slice(), fx: st.frameX.slice(), fy: st.frameY.slice() };

  // ★管线驱动器每槽头 rng.reseed(world.seed)（vanilla RunPass cs:497 镜像）——
  //   Piles 独立槽：重播后跑（曾漏重播=流漂移 9195 假差）
  rng.reseed(gs.seed as number);
  runPilesPass(st, rng, gs);
  const r = cmpCh(G77, 'Piles vs golden077');

  // —— 差异格现场：遍历全部 T 差格，输出 5 行现场（golden76/golden77/JS-pre/JS-post + 邻域）——
  if (r.dT > 0 || r.dA > 0) {
    const sites: number[] = [];
    for (let i = 0; i < N; i++) {
      const va = G77.a[i]!, ja = st.flags[i]! & 1;
      const vt = va ? G77.t[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va !== ja || vt !== jt) sites.push(i);
    }
    console.log(`total diff cells: ${sites.length}`);
    const fmt = (x: number, y: number, t: Uint16Array, a: Uint8Array, fx?: Uint16Array, fy?: Uint16Array): string => {
      const i = y * W + x;
      return a[i] ? `t${t[i]}${fx ? `@${fx[i]}/${fy![i]}` : ''}` : 'air';
    };
    let shown = 0;
    const seenCluster = new Set<number>();
    for (const i of sites) {
      const x = i % W, y = (i / W) | 0;
      const cx = Math.floor(x / 24), cy = Math.floor(y / 24);
      const ck = cy * 200 + cx;
      if (seenCluster.has(ck)) continue;
      seenCluster.add(ck);
      if (shown++ >= 14) break;
      console.log(`--- site (${x},${y}) cluster(${cx},${cy}) ---`);
      for (let dy = -2; dy <= 3; dy++) {
        let line = '';
        for (let dx = -3; dx <= 4; dx++) {
          const xx = x + dx, yy = y + dy;
          const ii = yy * W + xx;
          const v77 = G77.a[ii] ? G77.t[ii]! : -1;
          const j = st.flags[ii] ? SHEET[st.type[ii]] : -1;
          const v76 = pre76.a[ii] ? pre76.t[ii]! : -1;
          const jp = jsPre.f[ii] ? SHEET[jsPre.t[ii]] : -1;
          line += `${String(v76).padStart(3)}|${String(jp).padStart(3)}|${String(v77).padStart(3)}|${String(j).padStart(3)} `;
        }
        console.log(`  y${y + dy}: ${line}`);
      }
      const ii = i;
      console.log(`  g76: ${fmt(x, y, pre76.t, pre76.a)} -> g77: ${fmt(x, y, G77.t, G77.a)} | jsPre: ${fmt(x, y, jsPre.t, jsPre.f)} fx${jsPre.fx[ii]}/${jsPre.fy[ii]} -> jsPost: ${fmt(x, y, st.type, st.flags)} fx${st.frameX[ii]}/${st.frameY[ii]}`);
    }
  }
  console.log(`js kill count (Traps+Piles engine killTileGen): ${kills.length}`);
  const kc = new Map<string, number>();
  for (const k of kills) { kc.set(k.replace(/\(\d+,\d+\)/, ''), (kc.get(k.replace(/\(\d+,\d+\)/, '')) ?? 0) + 1); }
  console.log(`kill sheets: ${[...kc.entries()].map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log('--- kill events near sites ---');
  for (const k of kills) {
    const m = /^k\((\d+),(\d+)\) s(\d+)$/.exec(k)!;
    const x = +m[1]!, y = +m[2]!;
    if ((x >= 3100 && x <= 3160 && y >= 760 && y <= 790)
      || (x >= 1330 && x <= 1370 && y >= 90 && y <= 115)
      || (x >= 1215 && x <= 1255 && y >= 460 && y <= 495)) console.log(`  ${k}`);
  }
  console.log('--- piles placements near sites ---');
  for (const p of pilesLog) console.log(`  ${p}`);
  // 凳 89 域 jsPre 帧明细（3125..3135 × 770..778）
  console.log('--- stool region jsPre frames (x 3125..3135, y 770..778): sheet|fx|fy ---');
  for (let yy = 770; yy <= 778; yy++) {
    let line = '';
    for (let xx = 3125; xx <= 3135; xx++) {
      const ii = yy * W + xx;
      const sh = jsPre.f[ii] ? SHEET[jsPre.t[ii]] : -1;
      line += `${String(sh).padStart(3)}:${String(jsPre.fx[ii]).padStart(4)}/${String(jsPre.fy[ii]).padStart(3)} `;
    }
    console.log(`  y${yy}: ${line}`);
  }
  // 41 支撑行的 slope/half/active
  console.log('--- support row y775 (x 3125..3135): sheet|slope|half|flags ---');
  {
    const st0 = st;
    let line = '';
    for (let xx = 3125; xx <= 3135; xx++) {
      const ii = 775 * W + xx;
      line += `${String(SHEET[st0.type[ii]]).padStart(3)}:s${st0.slope[ii]}h${st0.half[ii] ? 1 : 0}f${st0.flags[ii]} `;
    }
    console.log(`  ${line}`);
  }
}, 3600000);

void loadBase;
