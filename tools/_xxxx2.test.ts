// XXXXX 批·#97 相位对拍（9293480）：JS settle 六相位账 vs x86 settle.txt 真值
// （qw nl=0/0掷；wcfirst nl=2402/25掷；r0 ul=449→nl=0；r1..9 ul=0；final nl=2）。
// 用毕即删。用法：cd game && SW_XX=1 npx vitest run tools/_xxxx2.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[q] = s;
}

const RUN = process.env.SW_XX === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
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
const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

(RUN ? it : it.skip)('#97 phase accounting', async () => {
  const c = { t: b16(gPath(96, 'typ')), a: b8(gPath(96, 'act')), w: b16(gPath(96, 'wal')), l: b8(gPath(96, 'liq')), hf: b8(gPath(96, 'half')), sl: b8(gPath(96, 'slope')), lt: b8(gPath(96, 'lty')), ia: b8(gPath(96, 'inact')) };
  const gs = JSON.parse(readFileSync(`${BDIR}/s48/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s48/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s48/frames.bin`).buffer.slice(0));
  const iw = new Uint32Array(readFileSync(`${BDIR}/s48/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);

  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = c.ia[i]! ? 0x20 : 0;
  }
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; st.wire[i] |= fw[q + 3]! & 0x1f; }

  const world = new World(W, H, SEED);
  world.store = st;
  world.shimmerX = gs.shimmerX; world.shimmerY = gs.shimmerY;
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) world.genDungeonExempt = null;
  else {
    const edge = Math.floor(world.w * 0.05), mid = Math.floor(world.w * 0.55);
    world.genDungeonExempt = gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
      : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 };
  }
  restoreGenSolid(gensolid);

  // ---- 手动驱动镜像 settleWorldLiquids('gen')，逐相位记账 ----
  const rng = new RNG(SEED);
  let rolls = 0;
  // 实例级掷骰计数（引擎 ctx.rng 与 passRand 两路同流全覆盖）
  const rngAny = rng as unknown as Record<string, unknown>;
  for (const m of ['nextInt', 'int', 'next', 'nextDouble', 'nextIntRange', 'chance', 'range']) {
    if (typeof rngAny[m] !== 'function') continue;
    const orig = (rngAny[m] as (...a: never[]) => number).bind(rng);
    rngAny[m] = (...a: never[]) => { const r = orig(...a); rolls++; return r; };
  }
  const sim = new LiquidSim(world);
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
  sim.applyGenSolidOverrides((await import('../src/world/gen/vanilla/GenSolid')).snapshotGenSolid());
  sim.worldGenTilesIgnoreWater(true);

  const nl = () => sim.numLiquid, nb = () => sim.bufferLen;
  console.log(`entry: rolls=${rolls} nl=${nl()} nb=${nb()}`);
  sim.quickWater();
  const qwFlags = st.flags.slice(), qwLiq = st.liquid.slice();
  console.log(`afterqw: rolls=${rolls} nl=${nl()} nb=${nb()}   [x86: nl=0 nb=0 rolls=0]`);
  // wcfirst 击杀账：包装 killTileAt 记 (x,y,sheet,roll span)
  const kills: Array<{ x: number; y: number; sh: number; r0: number; r1: number }> = [];
  const simAny = sim as unknown as Record<string, unknown>;
  const origKillTileAt = simAny.killTileAt as (x: number, y: number) => void;
  simAny.killTileAt = (x: number, y: number) => {
    const r0 = rolls;
    const sh = SHEET_OF[st.type[y * W + x]!] ?? -1;
    origKillTileAt.call(sim, x, y);
    kills.push({ x, y, sh, r0, r1: rolls });
  };
  sim.waterCheck();
  simAny.killTileAt = origKillTileAt;
  console.log(`wcfirst kills=${kills.length}`);
  // 与 x86 相位网格对拍（s97qw/s97wc = DD 织入产物；4.2M×8bit 行主序）
  const x86qwAct = b8('/tmp/sw-ddfin/s97qw.act');
  const x86wcAct = b8('/tmp/sw-ddfin/s97wc.act');
  const x86qwLiq = b8('/tmp/sw-ddfin/s97qw.liq');
  const x86wcLiq = b8('/tmp/sw-ddfin/s97wc.liq');
  let qwA = 0, qwL = 0, wcA = 0, wcL = 0;
  const qwSamples: string[] = [], wcSamples: string[] = [];
  for (let i = 0; i < N; i++) {
    if (x86qwAct[i]! !== (qwFlags[i]! & 1)) { qwA++; if (qwSamples.length < 12) qwSamples.push(`(${i % W},${(i / W) | 0}) v${x86qwAct[i]!} j${qwFlags[i]! & 1}`); }
    if (x86qwLiq[i]! !== qwLiq[i]!) { qwL++; if (qwL < 8 && qwSamples.length < 12) qwSamples.push(`L(${i % W},${(i / W) | 0}) v${x86qwLiq[i]!} j${qwLiq[i]!}`); }
  }
  console.log(`JS-qwphase vs x86 s97qw: A=${qwA} L=${qwL}`);
  console.log(`  samples: ${qwSamples.join(' | ')}`);
  // x86 wcfirst 击杀集：act 1→0 于 qw→wc 之间
  const x86Kills: string[] = [];
  for (let i = 0; i < N; i++) if (x86qwAct[i]! === 1 && x86wcAct[i]! === 0) x86Kills.push(`${i % W},${(i / W) | 0}`);
  const jsKillSet = new Set(kills.map(k => `${k.x},${k.y}`));
  const onlyX = x86Kills.filter(k => !jsKillSet.has(k));
  const onlyJ = [...jsKillSet].filter(k => !x86Kills.includes(k));
  console.log(`x86 wcfirst kills=${x86Kills.length} JS-only=${onlyJ.length} x86-only=${onlyX.length}`);
  if (onlyX.length) console.log(`  x86-only samples: ${onlyX.slice(0, 15).join(' ')}`);
  if (onlyJ.length) console.log(`  JS-only samples: ${onlyJ.slice(0, 15).join(' ')}`);
  for (let i = 0; i < N; i++) {
    if (x86wcAct[i]! !== (st.flags[i]! & 1)) { wcA++; if (wcSamples.length < 12) wcSamples.push(`(${i % W},${(i / W) | 0}) v${x86wcAct[i]!} j${st.flags[i]! & 1}`); }
  }
  console.log(`JS-wcphase vs x86 s97wc: A=${wcA} L(skip)`);
  if (wcSamples.length) console.log(`  samples: ${wcSamples.join(' | ')}`);
  console.log(`wcfirst: rolls=${rolls} nl=${nl()} nb=${nb()}   [x86: nl=2402 nb=0 rolls=25]`);
  console.log(`wcfirst: rolls=${rolls} nl=${nl()} nb=${nb()}   [x86: nl=2402 nb=0 rolls=25]`);
  sim.quickSettle = true;
  let ulTotal = 0;
  for (let round = 0; round < 10; round++) {
    const maxIter = (sim.numLiquid + sim.bufferLen) * 5;
    let ul = 0;
    while (sim.numLiquid > 0 && ul < maxIter) { sim.updateLiquid(); ul++; ulTotal++; }
    sim.waterCheck();
    console.log(`round${round}: ul=${ul} ulTotal=${ulTotal} rolls=${rolls} nl=${nl()} nb=${nb()}`);
  }
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);
  sim.finalGenMergeCheck();
  console.log(`final: rolls=${rolls} nl=${nl()} nb=${nb()}   [x86: nl=2 nb=0 rolls≈55553-55987]`);

  // 末态 vs golden97 摘要
  const g = { l: b8(gPath(97, 'liq')), t: b16(gPath(97, 'typ')), a: b8(gPath(97, 'act')), lt: b8(gPath(97, 'lty')) };
  let dL = 0, dA = 0, dT = 0;
  for (let i = 0; i < N; i++) {
    if (g.l[i]! !== st.liquid[i]!) dL++;
    if (g.a[i]! !== (st.flags[i]! & 1)) dA++;
    const vt = g.a[i]! ? g.t[i]! : 0;
    const jt = (st.flags[i]! & 1) ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) dT++;
  }
  console.log(`end diff vs golden97: L=${dL} A=${dA} T=${dT}`);
}, 300_000);
