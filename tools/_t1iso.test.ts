// 一次性：尾部清剿批1 四 pass 隔离重放（dump 输入直构 → pass → 对拍 dump 输出）。
//   #30 Lakes:   dump029(Corruption末) → runLakesPass → dump030（原版 N=718）
//   #71 Pots:    dump070(QuickCleanup末) → runPotsPass → dump071（原版 N=2,280,726）
//   #89 Vines:   dump088(JunglePlants末) → runVinesPass → dump089（原版 N=174,441）
//   #103 Stalac: dump102(WaterPlants末) → runGemTreesPass → dump103（原版 N=6,015,909）
// gs 捕获：真管线跑 generateWorld，经 __swLkCap/__swPotCap/__swVnCap/__swSpCap 探针钩
// （pass 头）深克隆 GenState。liquidType 真值：Pot(71)/Stalac(103) 头落盘
// /tmp/sw-pot-liqtype.bin、/tmp/sw-sp-liqtype.bin（dump 四通道不含液体类型；placeTight
// 的 anyShimmer 门与 pot 的 anyLava/anyShimmer 拒绝读它）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runPotsPass } from '../src/world/gen/vanilla/PotsPass';
import { runVinesPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';
import { resetGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const NAMES: Record<number, string> = {
  29: 'Corruption', 30: 'Lakes', 70: 'Quick_Cleanup', 71: 'Pots',
  88: 'Jungle_Plants', 89: 'Vines', 102: 'Water_Plants', 103: 'Stalac',
};
const VN = { lakes: 718, pots: 2280726, vines: 174441, stalac: 6015909 };
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

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
SHEET[0] = 0;

function buildStore(idx: number, liqTypeBin?: string): TileStore {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  const lt = liqTypeBin && existsSync(liqTypeBin) ? readFileSync(liqTypeBin) : null;
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;   // 幽灵 type 照抄（dump typ 含 inactive ghost）
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = lt ? (lt[i] ?? 0) : (l[i]! > 0 ? 1 : 0);
  }
  return st;
}

function diff(st: TileStore, idx: number, label: string) {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  let typ = 0, act = 0, wal = 0, liq = 0, typAct = 0;
  const pairs = new Map<string, number>();
  const samples: string[] = [];
  const regs = new Map<string, number>();
  for (let i = 0; i < W * H; i++) {
    let jT = st.type[i];
    if (jT !== 0) jT = SHEET[jT] ?? -1;
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    if (!(dT || dA || dW || dL)) continue;
    if (dT) { typ++; if (st.flags[i] && a[i]) typAct++; pairs.set(`t${jT}>${t[i]}`, (pairs.get(`t${jT}>${t[i]}`) ?? 0) + 1); }
    if (dA) act++;
    if (dW) wal++;
    if (dL) liq++;
    const x = i % W, y = (i / W) | 0;
    const rk = `x${(x / 200) | 0}y${(y / 200) | 0}`;
    regs.set(rk, (regs.get(rk) ?? 0) + 1);
    if (samples.length < 12) samples.push(`(${x},${y})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}L${st.liquid[i]}>${l[i]}`);
  }
  console.log(`${label}: typ=${typ}(active实差${typAct}) act=${act} wal=${wal} liq=${liq}`);
  console.log('  pairs:', JSON.stringify([...pairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 14)));
  console.log('  regions:', JSON.stringify([...regs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8)));
  console.log('  samples:', samples.join(' | '));
  return { typ, typAct, act, wal, liq };
}

/** 行主序首个 diff 格的 5×5 三方对拍（入口 dump / 原版出口 dump / JS 出口） */
function firstDiffCells(st: TileStore, inIdx: number, outIdx: number, n = 3) {
  const tI = new Uint16Array(load(inIdx, 'typ').buffer.slice(0));
  const aI = load(inIdx, 'act');
  const tO = new Uint16Array(load(outIdx, 'typ').buffer.slice(0));
  const aO = load(outIdx, 'act');
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < W * H && cells.length < n; i++) {
    let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
    if (jT !== tO[i] || (st.flags[i] !== 0) !== (aO[i] !== 0)) cells.push([i % W, (i / W) | 0]);
  }
  for (const [bx, by] of cells) {
    const rows: string[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      let rI = '', rO = '', rJ = '';
      for (let dx = -3; dx <= 3; dx++) {
        const i = (by + dy) * W + bx + dx;
        rI += `${tI[i]}${aI[i] ? '*' : '.'} `;
        rO += `${tO[i]}${aO[i] ? '*' : '.'} `;
        let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
        rJ += `${jT}${st.flags[i] ? '*' : '.'} `;
      }
      rows.push(`y${by + dy}: in[${rI}] van[${rO}] js[${rJ}]`);
    }
    console.log(`首diff格(${bx},${by}) 5×7:\n  ` + rows.join('\n  '));
  }
  return cells;
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v instanceof Uint8Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

const only = (process.env.SW_ONLY ?? '').split(',').filter(Boolean);
const want = (k: string) => only.length === 0 || only.includes(k);

/** dump 四通道外的补充通道（dump 不可见的真值，自 JS 管线 pass 头采集） */
const EXTRA_CH = ['liqtype', 'slope', 'half', 'frameX', 'frameY'] as const;
type ExtraCh = typeof EXTRA_CH[number];
const extraPath = (tag: string, ch: ExtraCh) => `/tmp/sw-t1-${tag}-${ch}.bin`;
function dumpExtra(tag: string, st: TileStore) {
  for (const ch of EXTRA_CH) {
    try {
      const arr = ch === 'liqtype' ? st.liquidType : ch === 'slope' ? st.slope
        : ch === 'half' ? st.half : ch === 'frameX' ? st.frameX : st.frameY;
      writeFileSync(extraPath(tag, ch), arr as Uint8Array | Uint16Array);
    } catch { /* ignore */ }
  }
}
function loadExtra(tag: string, st: TileStore) {
  for (const ch of EXTRA_CH) {
    try {
      const buf = readFileSync(extraPath(tag, ch));
      const dst = ch === 'liqtype' ? st.liquidType : ch === 'slope' ? st.slope
        : ch === 'half' ? st.half : ch === 'frameX' ? st.frameX : st.frameY;
      const src = dst instanceof Uint16Array ? new Uint16Array(buf.buffer.slice(0), 0, dst.length) : new Uint8Array(buf);
      dst.set(src.subarray(0, dst.length));
    } catch { /* 首跑无真值 */ }
  }
}

let gsLk: GenState | null = null, gsPot: GenState | null = null, gsVn: GenState | null = null, gsSp: GenState | null = null;

(RUN ? it : it.skip)('tail1 isolated replay', async () => {
  // ── A) 真管线捕获 gs + liquidType（跑到终盘一次拿全）
  const needPipeline = !existsSync('/tmp/sw-pot-liqtype.bin') || !existsSync('/tmp/sw-sp-liqtype.bin')
    || !gsLk && !gsPot && !gsVn && !gsSp;
  if (needPipeline) {
    const g0 = globalThis as {
      __swLkCap?: (gs: GenState, st: TileStore) => void;
      __swPotCap?: (gs: GenState, st: TileStore) => void;
      __swVnCap?: (gs: GenState, st: TileStore) => void;
      __swSpCap?: (gs: GenState, st: TileStore) => void;
    };
    g0.__swLkCap = (gs) => { if (!gsLk) gsLk = cloneGs(gs); };
    g0.__swPotCap = (gs, st) => {
      if (!gsPot) { gsPot = cloneGs(gs); dumpExtra('pot', st); }
    };
    g0.__swVnCap = (gs, st) => {
      if (!gsVn) { gsVn = cloneGs(gs); dumpExtra('vn', st); }
    };
    g0.__swSpCap = (gs, st) => {
      if (!gsSp) { gsSp = cloneGs(gs); dumpExtra('sp', st); }
    };
    try {
      await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: () => { } });
    } catch (e) {
      console.log('pipeline EX(忽略):', String(e).slice(0, 160));
    } finally {
      g0.__swLkCap = undefined; g0.__swPotCap = undefined; g0.__swVnCap = undefined; g0.__swSpCap = undefined;
    }
  }
  console.log('captured:', { lk: !!gsLk, pot: !!gsPot, vn: !!gsVn, sp: !!gsSp });
  if (!gsLk || !gsPot || !gsVn || !gsSp) throw new Error('gs capture failed');
  console.log(`gs: ws=${gsLk.worldSurface} wsLow=${gsLk.worldSurfaceLow} wsHigh=${gsLk.worldSurfaceHigh} rock=${gsLk.rockLevel} beach=${gsLk.beachDistance} nMC=${gsLk.numMCaves} nTun=${gsLk.numTunnels} ud=${JSON.stringify(gsLk.undergroundDesert)}`);
  console.log(`gsPot ws=${gsPot.worldSurface} surfHigh=${gsPot.worldSurfaceHigh} surfLow=${gsPot.worldSurfaceLow} rock=${gsPot.rockLevel}`);
  console.log(`gsVn ws=${gsVn.worldSurface} | gsSp ws=${gsSp.worldSurface} rock=${gsSp.rockLevel} beach=${gsSp.beachDistance} seedFlags=${JSON.stringify(gsSp.seedFlags)}`);

  // ── B) #30 Lakes：dump029 → runLakesPass → dump030
  if (want('lakes')) {
    const st = buildStore(29);
    const { rng, box } = countedRng(gsLk!.seed);
    resetGenSolid();
    flipGenSolid([659, 484], false);   // lakes 时点翻转态（Reset 659 + DesertBiome 484）
    runLakesPass(st, rng, gsLk!);
    console.log(`Lakes draws=${box.n} (vanilla ${VN.lakes}, diff=${box.n - VN.lakes}) lakeX=${JSON.stringify(gsLk!.lakeX)}`);
    diff(st, 30, 'Lakes vs dump030');
    firstDiffCells(st, 29, 30, 3);
  }
  // ── C) #71 Pots：dump070 → runPotsPass → dump071
  if (want('pots')) {
    const st = buildStore(70);
    if (process.env.SW_POTX86) {
      // x86 真值通道（/tmp/sw-ycal/van22 070_Quick_Cleanup 出口，Y 批资产）：
      // slope/half/lty 直注（lty 原版 0水/1岩/2蜜/3微 → 本仓 +1 编码）；
      // frameX/frameY 无 x86 通道 → 先走 loadExtra 垫 JS 管线 bin 再覆写真值三通道
      loadExtra('pot', st);
      const van = (ch: string) => new Uint8Array(readFileSync(`/tmp/sw-ycal/van22/070_Quick_Cleanup.${ch}`));
      st.slope.set(van('slope').subarray(0, st.slope.length));
      st.half.set(van('half').subarray(0, st.half.length));
      const lty = van('lty');
      for (let i = 0; i < st.liquidType.length; i++) st.liquidType[i] = lty[i] > 3 ? 0 : lty[i] + 1;
      console.log('pots 输入通道=x86 真值（slope/half/lty）+ JS frame bin');
    } else if (!process.env.SW_POTNOSLOPE) loadExtra('pot', st);   // liquidType + slope/half（PlacePot 地面门）/frame（地牢 shelf）
    const { rng, box } = countedRng(gsPot!.seed);
    if (process.env.SW_POTTRACE) {
      const intOrig = rng.int.bind(rng);
      let k = 0;
      rng.int = (a: number, b: number) => { const v = intOrig(a, b); if (k++ < 120) console.log(`roll#${k} int(${a},${b})=${v}`); return v; };
    }
    // pots 时点生成期 tileSolid 翻转态（GenSolid 时间线；481-483/192 数据已预翻 false）
    resetGenSolid();
    flipGenSolid([659, 484, 190, 162, 225, 232], false);
    runPotsPass(st, rng, gsPot!);
    console.log(`Pots draws=${box.n} (vanilla ${VN.pots}, diff=${box.n - VN.pots})`);
    diff(st, 71, 'Pots vs dump071');
    firstDiffCells(st, 70, 71, 3);
  }
  // ── D) #89 Vines：dump088 → runVinesPass → dump089
  if (want('vines')) {
    const st = buildStore(88);
    if (!process.env.SW_VNNOSLOPE) loadExtra('vn', st);   // slope（bottomSlope 锚门/CanHitLine 权重）等 dump 外通道
    const { rng, box } = countedRng(gsVn!.seed);
    resetGenSolid();
    flipGenSolid([659, 484], false);   // vines 时点翻转态（162/190/225/232 等尚未翻）
    runVinesPass(st, rng, gsVn!);
    console.log(`Vines draws=${box.n} (vanilla ${VN.vines}, diff=${box.n - VN.vines})`);
    diff(st, 89, 'Vines vs dump089');
    firstDiffCells(st, 88, 89, 3);
  }
  // ── E) #103 Stalac：dump102 → runGemTreesPass → dump103
  if (want('stalac')) {
    const st = buildStore(102);
    loadExtra('sp', st);    // liquidType（placeTight anyShimmer 门）+ frameY（165 生命周期）
    const { rng, box } = countedRng(gsSp!.seed);
    resetGenSolid();
    flipGenSolid([659, 484], false);  // stalac 时点翻转态（Piles/BeeLarva/TileCleanup 已还原其余；192/481-483 数据预翻）
    runGemTreesPass(st, rng, gsSp!);
    console.log(`Stalac draws=${box.n} (vanilla ${VN.stalac}, diff=${box.n - VN.stalac})`);
    diff(st, 103, 'Stalac vs dump103');
    firstDiffCells(st, 102, 103, 3);
  }
}, 480000);
