// ★IIII30 批一次性仪①：反演重放——基座=x86 truth dump101(Lihzahrd_Altars) 全通道
// 直构 store，单跑 runLilypadsPass（水生植物槽），对拍 dump102(Water_Plants) 8+2 通道；
// 受理集分类（vanilla 放置集 vs JS 放置集 XOR=最小受理差）+ 首批失配格三方邻域图。
// 产档 /tmp/iii31-out：wp-report.txt / wp-cells.json / gs-cap.json。
// 用法：
//   cd game && SW_MB_1457=1 SW_II31_CAP=1 SW_II31=1 npx vitest run tools/_ii31wp.test.ts （首跑捕 gs）
//   cd game && SW_MB_1457=1 SW_II31=1 npx vitest run tools/_ii31wp.test.ts            （复用 gs 快照）
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runLilypadsPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { resetGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_II31 === '1';
const G2 = process.env.SW_II31_VG ?? '/tmp/iii7-out/x86-dump2';
const OUT = '/tmp/iii31-out';
const W = 4200, H = 1200;
const IN = `${G2}/101_Lihzahrd_Altars`;
const OUTD = `${G2}/102_Water_Plants`;
const SEED_TEXT = process.env.SW_II31_SEED ?? '12345';

const SHEET = new Int32Array(4096).fill(-1);
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
  if (typeof s === 'number' && s >= 0) {
    if (!REV.has(s)) REV.set(s, i);
    SHEET[i] = s;
  }
}
SHEET[0] = 0;

const le16 = (p: string): Uint16Array => new Uint16Array(readFileSync(p).buffer.slice(0));
const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));

function buildStore(): TileStore {
  const typ = le16(`${IN}.typ`), act = u8(`${IN}.act`);
  const zerof = process.env.SW_II31_ZEROF === '1';
  const frx = zerof ? new Uint16Array(W * H) : le16(`${IN}.frx`);
  const fry = zerof ? new Uint16Array(W * H) : le16(`${IN}.fry`);
  const wal = le16(`${IN}.wal`), liq = u8(`${IN}.liq`), lty = u8(`${IN}.lty`);
  const half = u8(`${IN}.half`), slope = u8(`${IN}.slope`), inact = u8(`${IN}.inact`);
  const st = new TileStore(W, H);
  let uncovered = 0;
  for (let i = 0; i < W * H; i++) {
    const jsId = REV.get(typ[i]!);
    if (jsId === undefined && typ[i] !== 0) uncovered++;
    st.type[i] = jsId ?? 0;
    st.flags[i] = act[i] ? 1 : 0;
    st.frameX[i] = frx[i]!;
    st.frameY[i] = fry[i]!;
    st.wall[i] = wal[i]!;
    st.liquid[i] = liq[i]!;
    st.liquidType[i] = lty[i]! > 3 ? 0 : lty[i]! + 1;   // vanilla 0..3 → JS +1 域
    st.half[i] = half[i]!;
    st.slope[i] = slope[i]!;
    st.wire[i] = inact[i] ? 32 : 0;                      // bit5 已致动
  }
  console.log(`base build: REV 未覆盖格=${uncovered}（应 0）`);
  return st;
}

/** 复刻 _mile8 cmp 口径（含 ghost 信息位与 lty 门），返回明细表 */
interface DiffCell { x: number; y: number; ch: string; v: number; j: number; }
function cmp(st: TileStore) {
  const t2 = le16(`${OUTD}.typ`), a2 = u8(`${OUTD}.act`);
  const f2x = le16(`${OUTD}.frx`), f2y = le16(`${OUTD}.fry`);
  const w2 = le16(`${OUTD}.wal`), l2 = u8(`${OUTD}.liq`), lt2 = u8(`${OUTD}.lty`);
  const h2 = u8(`${OUTD}.half`), s2 = u8(`${OUTD}.slope`), ia2 = u8(`${OUTD}.inact`);
  const cells: DiffCell[] = [];
  const pair = new Map<string, number>();
  const cnt: Record<string, number> = {};
  const inc = (ch: string, i: number, v: number, j: number) => {
    cnt[ch] = (cnt[ch] ?? 0) + 1;
    cells.push({ x: i % W, y: (i / W) | 0, ch, v, j });
    const k = `${ch[0]}${v}>${j}`;
    pair.set(k, (pair.get(k) ?? 0) + 1);
  };
  let firstI = -1;
  for (let i = 0; i < W * H; i++) {
    const va = a2[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) inc('A', i, va, ja);
    if (firstI < 0 && va !== ja) firstI = i;
    const vt = va ? t2[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { inc('T', i, vt, jt); if (firstI < 0) firstI = i; }
    if (w2[i]! !== st.wall[i]) { inc('W', i, w2[i]!, st.wall[i]); if (firstI < 0) firstI = i; }
    if (l2[i]! !== st.liquid[i]) { inc('L', i, l2[i]!, st.liquid[i]); if (firstI < 0) firstI = i; }
    if (h2[i]! !== st.half[i]) { inc('H', i, h2[i]!, st.half[i]); if (firstI < 0) firstI = i; }
    if (s2[i]! !== st.slope[i]) { inc('S', i, s2[i]!, st.slope[i]); if (firstI < 0) firstI = i; }
    const vl = l2[i]! > 0 ? lt2[i]! + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) { inc('Y', i, vl, jl); if (firstI < 0) firstI = i; }
    const via = ia2[i]! ? 1 : 0, jia = (st.wire[i] >>> 5) & 1;
    if (via !== jia) { inc('I', i, via, jia); if (firstI < 0) firstI = i; }
  }
  return { cells, pair, cnt, firstI };
}

/** 三方邻域 ASCII：IN(dump101 基座) / VAN(dump102 出口) / JS(store 出口) */
const CH_NAME: Record<number, string> = {
  518: 'L', 519: 'C', 549: 'S', 571: 'B', 71: 'M',
};
function grid(loadTyp: () => Uint16Array, loadAct: () => Uint8Array, liqArr: Uint8Array | null,
  cx: number, cy: number): string {
  const typ = loadTyp(), act = loadAct();
  const lines: string[] = [];
  for (let dy = -6; dy <= 6; dy++) {
    let r = '';
    for (let dx = -5; dx <= 5; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) { r += '?'; continue; }
      const i = y * W + x;
      if (!act[i]) {
        r += '.';
        continue;
      }
      const s = typ[i]!;
      const nm = CH_NAME[s];
      if (nm) { r += nm; continue; }
      const id = REV.get(s);
      const solid = id !== undefined && TILE_DEFS[id]?.solid;
      if (solid) r += '#';
      else if (s === 61 || s === 74) r += (s === 61 ? 'j' : 'J'); // 丛林短草（竹门）
      else r += (s % 36 < 10 ? String(s % 36) : String.fromCharCode(87 + (s % 36) - 10)); // 其他按 sheet 尾码
    }
    void liqArr;
    lines.push(r);
  }
  return lines.join('\n');
}

// ── CAP 单测：真管线捕 gs 到 /tmp/iii31-out/gs-cap.json（只在 SW_II31_CAP=1 时跑）──
// 挂既有探针钩 __swMbCap（MicroBiomesPass 头，本槽前一槽；ws/beach 两参在 terrain
// 期即定值，此后不再变更——捕获位置早于本槽不影响数值面）
(CAPRUN() ? it : it.skip)('ii31 capture gs at micro-biomes head', async () => {
  mkdirSync(OUT, { recursive: true });
  let saved = false;
  const g0 = globalThis as { __swMbCap?: (gs: GenState) => void };
  g0.__swMbCap = (g) => {
    if (saved) return;
    saved = true;
    const c: Record<string, unknown> = { ...g } as unknown as Record<string, unknown>;
    for (const k of Object.keys(c)) {
      const v = c[k];
      if (Array.isArray(v)) c[k] = JSON.parse(JSON.stringify(v));
      else if (v instanceof Int32Array || v instanceof Uint8Array || v instanceof Float32Array || v instanceof Uint16Array) c[k] = Array.from(v);
      else if (v && typeof v === 'object') c[k] = JSON.parse(JSON.stringify(v));
    }
    writeFileSync(`${OUT}/gs-cap.json`, JSON.stringify({ gs: c }));
    console.log(`gs captured: seed=${g.seed} ws=${g.worldSurface} beach=${g.beachDistance}`);
  };
  try {
    await generateWorld({ width: W, height: H, seedText: SEED_TEXT, evil: 0 });
  } catch (e) {
    console.log('pipeline EX(忽略):', String(e).slice(0, 160));
  } finally { g0.__swMbCap = undefined; }
  if (!saved) throw new Error('gs capture failed（__swMbCap 未触发——检查 MicroBiomesPass.ts 钩）');
}, 900_000);

function CAPRUN(): boolean { return !!process.env.SW_II31_CAP && RUN; }

(RUN ? it : it.skip)('ii31 water plants inversion replay', async () => {
  mkdirSync(OUT, { recursive: true });
  const log: string[] = [];
  const say = (m: string) => { log.push(m); console.log(m); };

  // ── A) gs 捕获（真管线跑到「微群系」头即本槽前一槽；缓存复用）──
  const capPath = `${OUT}/gs-cap.json`;
  if (!existsSync(capPath)) throw new Error(`缺 ${capPath}——先跑 SW_II31_CAP=1`);
  const gcap = JSON.parse(readFileSync(capPath, 'utf8')) as { gs: Record<string, unknown> };
  const gs = gcap.gs as unknown as GenState & Record<string, unknown>;
  say(`gs: seed=${gs.seed} ws=${gs.worldSurface} rock=${gs.rockLevel} beach=${gs.beachDistance} ud=${JSON.stringify(gs.undergroundDesert ?? null)}`);

  // ── B) 基座直构 + 单跑本槽 ──
  const st = buildStore();
  if (process.env.SW_II31_NOSTF === '1') (globalThis as { __swWpNoStf?: boolean }).__swWpNoStf = true;
  resetGenSolid();
  flipGenSolid([659], false);
  const rng = new RNG(Number(gs.seed));
  const urRaw = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = urRaw.internalSample.bind(urRaw);
  let draws = 0;
  const streamDump = process.env.SW_II31_STREAM === '1';
  const tagMode = process.env.SW_II31_TAG === '1';
  const evMode = process.env.SW_II31_EVBOX !== undefined;
  const evBox = (process.env.SW_II31_EVBOX ?? '')
    .split(';').filter(Boolean).map((b) => b.split(',').map(Number));
  const watchSheets = new Set([518, 519, 549, 571]);
  // ★IIII34：坐标探针镜像（SW_II31_WP=1）——SurfaceDecorPasses.wpEv 走 __swWpLog，
  //   行格式 "ln|tag|x|y|extra"，ln=本槽已耗掷数（与 x86 SW_WPLOG 同口径）
  const wpMode = process.env.SW_II31_WP === '1';
  const wps: string[] = [];
  if (wpMode) {
    (globalThis as { __swWpLog?: unknown }).__swWpLog =
      (t: string, wx: number, wy: number, e?: string) => {
        wps.push(`${draws}|${t}|${wx}|${wy}|${e ?? ''}`);
      };
  }
  const sheetAtIdx = (i: number) => SHEET[st.type[i]!];
  const hitBox = (x: number, y: number) =>
    !evMode || evBox.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  // 放置/击杀事件观察（读位：setTileSilent 与 genKillTile 桥接钩）
  const evs: string[] = [];
  const gsAny = globalThis as Record<string, unknown>;
  if (evMode) {
    gsAny.__swWpEvP = (x: number, y: number, sheet: number) => {
      if (watchSheets.has(sheet) && hitBox(x, y)) evs.push(`P ${x},${y} s${sheet}`);
    };
    gsAny.__swWpEvK = (x: number, y: number, sheet: number) => {
      if (watchSheets.has(sheet) && hitBox(x, y)) evs.push(`K ${x},${y} s${sheet}`);
    };
  }
  const vals = (streamDump || tagMode) ? [] : null;
  const tags = tagMode ? [] : null;
  urRaw.internalSample = () => {
    draws++;
    const v = orig();
    if (vals) vals.push(v);
    if (tags) {
      const stk = new Error().stack ?? '';
      let loc = '?';
      for (const l of stk.split('\n').slice(2)) {
        const m = l.match(/src[\\/]world[\\/]gen[\\/][A-Za-z0-9_/.]+\.ts:(\d+)/);
        if (m) { loc = `${m[0].replace(/^.*?(src)/, '$1')}`; break; }
      }
      tags.push(loc);
    }
    return v;
  };
  runLilypadsPass(st, rng, gs);
  (globalThis as { __swWpNoStf?: boolean }).__swWpNoStf = false;
  say(`JS 本槽掷数=${draws}`);

  // ── C) 对拍 dump102（8+2 通道）──
  const r = cmp(st);
  const pairs = [...r.pair.entries()].sort((p, q) => q[1] - p[1]).map(([k, n]) => `${k}×${n}`);
  say(`8通道差: ${JSON.stringify(r.cnt)} firstI=(${r.firstI >= 0 ? `${r.firstI % W},${Math.floor(r.firstI / W)}` : '-'})`);
  say(`pairs: ${pairs.join(' ')}`);

  // ── D) 放置集分类（对 base 而非只对出口）：Δact/type/dst ──
  const ti = le16(`${IN}.typ`), ai = u8(`${IN}.act`);
  const tO = le16(`${OUTD}.typ`), aO = u8(`${OUTD}.act`), fxo = le16(`${OUTD}.frx`), fyo = le16(`${OUTD}.fry`);
  interface Pl { x: number; y: number; sheet: number; fx: number; fy: number; }
  const vanAdd: Pl[] = [], jsAdd: Pl[] = [];
  const vanKill: Pl[] = [], jsKill: Pl[] = [];
  for (let i = 0; i < W * H; i++) {
    const xv = aO[i] && !ai[i], jv = (st.flags[i] & 1) !== 0 && !ai[i];
    if (xv) vanAdd.push({ x: i % W, y: (i / W) | 0, sheet: tO[i]!, fx: fxo[i]!, fy: fyo[i]! });
    if (jv) jsAdd.push({ x: i % W, y: (i / W) | 0, sheet: SHEET[st.type[i]]!, fx: st.frameX[i], fy: st.frameY[i] });
    const xd = ai[i] && !aO[i], jd = ai[i] && !(st.flags[i] & 1);
    if (xd) vanKill.push({ x: i % W, y: (i / W) | 0, sheet: ti[i]!, fx: 0, fy: 0 });
    if (jd) jsKill.push({ x: i % W, y: (i / W) | 0, sheet: ti[i]!, fx: 0, fy: 0 });
  }
  const bucket = (list: Pl[]) => {
    const m = new Map<number, Pl[]>();
    for (const p of list) { const a = m.get(p.sheet) ?? []; a.push(p); m.set(p.sheet, a); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
      .map(([s, arr]) => `${s}:${arr.length}(y${Math.min(...arr.map((e) => e.y))}-${Math.max(...arr.map((e) => e.y))},x${Math.min(...arr.map((e) => e.x))}-${Math.max(...arr.map((e) => e.x))})`);
  };
  say(`vanAdd=${vanAdd.length} [${bucket(vanAdd).join(' ')}]`);
  say(`jsAdd =${jsAdd.length} [${bucket(jsAdd).join(' ')}]`);
  say(`vanKill=${vanKill.length} [${bucket(vanKill).join(' ')}]`);
  say(`jsKill =${jsKill.length} [${bucket(jsKill).join(' ')}]`);

  // vanAdd∩jsAdd 一致性（同址同 type；帧差单列）
  const vk = new Set(vanAdd.map((p) => `${p.x},${p.y},${p.sheet}`));
  let bothSame = 0, frameDiff = 0, cellDiff = 0;
  for (const j of jsAdd) {
    if (vk.has(`${j.x},${j.y},${j.sheet}`)) {
      bothSame++;
      const v = vanAdd.find((p) => p.x === j.x && p.y === j.y)!;
      if (v.fx !== j.fx || v.fy !== j.fy) frameDiff++;
    } else cellDiff++;
  }
  const extraVan = vanAdd.filter((p) => !jsAdd.some((j) => j.x === p.x && j.y === p.y));
  const extraJs = jsAdd.filter((p) => !vanAdd.some((j) => j.x === p.x && j.y === p.y));
  say(`同址同型=${bothSame}（帧差${frameDiff}） 仅van=${extraVan.length} 仅js=${extraJs.length}`);
  const show = (tag: string, list: Pl[]) => list.slice(0, 24).map((p) => `(${p.x},${p.y})${p.sheet}f${p.fx}/${p.fy}`).join(' ');
  say(`仅VAN24: ${show('v', extraVan)}`);
  say(`仅JS 24: ${show('j', extraJs)}`);

  // ── E) 首批失配格三方邻域图（8 格）──
  const misFirst = [...new Map(r.cells.map((c) => [`${c.x},${c.y}`, c])).values()].slice(0, 8);
  const liqIn = u8(`${IN}.liq`);
  for (const c of misFirst) {
    say(`\n── 邻域 (${c.x},${c.y}) 首差通道=${c.ch} v=${c.v} j=${c.j}`);
    say('   IN(101基座)        VAN(102出口)       JS(本次出口)');
    const gi = grid(() => ti, () => ai, liqIn, c.x, c.y).split('\n');
    const gv = grid(() => tO, () => aO, null, c.x, c.y).split('\n');
    const gj = grid(() => Uint16Array.from(st.type, (v) => SHEET[v] >= 0 ? SHEET[v] : 9999), () => Uint8Array.from(st.flags), null, c.x, c.y).split('\n');
    for (let k = 0; k < gi.length; k++) say(`  ${gi[k]}   ${gv[k]}   ${gj[k]}`);
  }

  if (evMode) {
    gsAny.__swWpEvP = undefined; gsAny.__swWpEvK = undefined;
    writeFileSync(`${OUT}/js-wp-events.txt`, evs.join('\n'));
  }
  if (wpMode) {
    delete (globalThis as { __swWpLog?: unknown }).__swWpLog;
    writeFileSync(`${OUT}/js-wplog.txt`, wps.join('\n'));
    console.log(`wp events: ${wps.length}`);
  }
  if (tags) writeFileSync(`${OUT}/js-wp-tags.txt`, tags.join('\n'));
  if (vals) writeFileSync(process.env.SW_II31_ZEROF === '1' ? `${OUT}/js-wp-stream-zf.txt` : `${OUT}/js-wp-stream.txt`, vals.join('\n'));
  writeFileSync(`${OUT}/wp-cells.json`, JSON.stringify({
    cnt: r.cnt, pairs: pairs.slice(0, 16), draws,
    mismatches: r.cells.slice(0, 400),
    vanAdd: vanAdd.slice(0, 3000), jsAdd: jsAdd.slice(0, 3000),
    vanKill: vanKill.slice(0, 200), jsKill: jsKill.slice(0, 200),
  }));
  writeFileSync(`${OUT}/wp-report.txt`, log.join('\n'));
}, 600_000);
