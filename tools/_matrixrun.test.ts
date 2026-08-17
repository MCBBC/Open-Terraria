// #22 收敛矩阵终验 harness（金标无关纯工具层）：JS generateWorld ↔ /tmp/vserver/*.wld 对拍。
// 分层报告（不 assert 全零——产出差距表）：
//   ①头部锚（ground/rock/worldId(RNG重放)/moon/dungeonX/Y/spawn/crimson/treeX/treeStyle 快验）
//   ②稀疏对象逐棵计数（树干 run/连通棵数/宝箱/雕像族/瓦罐——格子差会稀释稀疏对象，必须逐棵数）
//   ③分区四通道差（sky/surface/cave/deep/hell 五带 × typ/act/wal/liq 差异计数 + top 差异对）
//   ④整体差异率%
//
// 用法（cd game；env 门控 = 不入常规套件）：
//   SW_MATRIX=small8 npx vitest run tools/_matrixrun.test.ts   # 小世界前 8（baseline 档）
//   SW_MATRIX=smoke  ...                                       # 小 8 + 中 2 + 大 2（终局冒烟档）
//   SW_MATRIX=all     ...                                      # 39 世界全跑
//   SW_MATRIX=list:s111.wld,m2222.wld ...                      # 指定世界
//   SW_MATRIX=report  ...                                      # 只读 /tmp/matrix-report.json 打印汇总（不生成）
// 增量旋钮（大世界 90-120s+/个，单次调用 <8min 分批；报告按 file 键累积合并）：
//   SW_MATRIX_MAX=4        本次最多跑 N 个世界（缺省 4）
//   SW_MATRIX_BUDGET=400   软墙钟预算秒（超预算不再起下一个世界，缺省 400）
//   SW_MATRIX_FORCE=1      重跑报告里已有的世界（缺省跳过）
//   SW_MATRIX_OUT=path     报告路径（缺省 /tmp/matrix-report.json）
//   SW_MATRIX_FRESH=1      丢弃旧报告从零累积
//
// 通道口径：
//   typ = (active, vanillaType) 二元组不等（active 差或双方 active 而 type 差）
//   act = 仅 active 位差（typ 的存在性子集）
//   wal = 墙 id 差（JS store.wall 即原版墙 id 直存）
//   liq = (液量, liquidType) 差。wld 侧 liquidType 实测 {1水,2岩浆,3蜂蜜}（JS LIQUID_TYPE
//         +1 编码同构）；微光(4)在 wld 解码头里无独立位——若 JS 侧有微光液体将以
//         liq 差异对形式显形（报告可见，非静默）。
//   JS 内部 tile id → 原版 id：TILE_DEFS[i].vanilla.sheet 投影；无映射的 active 格单列
//   unmappedJsActiveCells 计数并以 UNMAPPED 对入 typ 差异表。
// 带边界（按 wld 头锚，两世界同尺寸）：
//   sky=[0,ground-60) surface=[ground-60,rock) cave=[rock,rock+(hellTop-rock)/2)
//   deep=[cave尾,hellTop) hell=[hellTop,h)；hellTop=h-200（原版 UnderworldLayer）。
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseWld, type WldWorld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { UnifiedRandom, translateSeed } from '../src/core/rng';
import type { World } from '../src/world/World';

const MODE = process.env.SW_MATRIX ?? '';
const RUN = MODE !== '' && MODE !== '0';
const OUT = process.env.SW_MATRIX_OUT ?? '/tmp/matrix-report.json';
const MAX = Number(process.env.SW_MATRIX_MAX ?? 4);
const BUDGET_MS = Number(process.env.SW_MATRIX_BUDGET ?? 400) * 1000;
const FORCE = process.env.SW_MATRIX_FORCE === '1';
const FRESH = process.env.SW_MATRIX_FRESH === '1';

const VSRV = '/tmp/vserver';
const TSV = `${VSRV}/matrix-anchors.tsv`;
const SAMPLE_SCALE = 4.656612875245797e-10;
const INT_MAX = 2147483647;
const SIZE_ID: Record<string, 0 | 1 | 2> = { s: 0, m: 1, l: 2 };
/** 单世界预估耗时（秒）——预算门估算用，实测后随报告滚动修正 */
const EXPECT_S: Record<string, number> = { s: 150, m: 330, l: 560 };
const BAND_NAMES = ['sky', 'surface', 'cave', 'deep', 'hell'] as const;

// ---- JS 内部 tile id → 原版 sheet id 投影（-2=无映射 active 格、-1=空气哨兵用调用点约定）----
const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
// 雕像族 id 集（JS 侧 def key 含 'statue' 的 vanilla sheet；两侧同口径 CC 计数）
const STATUE_IDS = new Set<number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  if (TILE_DEFS[i].key.includes('statue') && SHEET[i] >= 0) STATUE_IDS.add(SHEET[i]);
}
const MAX_VANILLA_ID = 900;
function lutOf(ids: Iterable<number>): Uint8Array {
  const l = new Uint8Array(MAX_VANILLA_ID);
  for (const id of ids) if (id >= 0 && id < MAX_VANILLA_ID) l[id] = 1;
  return l;
}
const LUT_TREE = lutOf([5]);
const LUT_PALM = lutOf([323]);
const LUT_POT = lutOf([28]);
const LUT_STATUE = lutOf(STATUE_IDS);

interface Row {
  file: string; size: 's' | 'm' | 'l'; seed: string; evil: 0 | 1;
  ground: number; rock: number; worldId: number; moon: number;
  dungeonX: number; dungeonY: number; spawnX: number; worldIdDraw: number;
}

function loadRows(): Row[] {
  const lines = readFileSync(TSV, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('file\t'));
  const rows: Row[] = [];
  for (const line of lines) {
    const c = line.split('\t');
    if (c.length < 13) continue;
    rows.push({
      file: c[0], size: c[1] as Row['size'], seed: c[2], evil: c[3] === '1' ? 1 : 0,
      ground: Number(c[4]), rock: Number(c[5]), worldId: Number(c[6]), moon: Number(c[7]),
      dungeonX: Number(c[8]), dungeonY: Number(c[9]), spawnX: Number(c[10]), worldIdDraw: Number(c[12]),
    });
  }
  return rows;
}

function selectRows(rows: Row[]): Row[] {
  if (MODE.startsWith('list:')) {
    const want = new Set(MODE.slice(5).split(',').map((s) => s.trim()).filter(Boolean));
    return rows.filter((r) => want.has(r.file));
  }
  if (MODE === 'all') return rows;
  if (MODE === 'smoke') {
    const s = rows.filter((r) => r.size === 's').slice(0, 8);
    const m = rows.filter((r) => r.size === 'm').slice(0, 2);
    const l = rows.filter((r) => r.size === 'l').slice(0, 2);
    return [...s, ...m, ...l];
  }
  // small / small8 / 1 → 小世界前 8（baseline 档）
  return rows.filter((r) => r.size === 's').slice(0, 8);
}

// ---- worldId 锚（RNG 重放）：genRand 原始流第 t 个样本按 Next(int.MaxValue) 重放 ----
// （与 tools/_matrixdump.test.ts 同法；生成期 ⑫ WorldId 抽样在 JS 侧掷而未存——重放即 JS 侧真值）
function replayWorldId(seedText: string, t: number): { pos: number; value: number } {
  const r = new UnifiedRandom(translateSeed(seedText));
  let last = 0;
  for (let i = 1; i <= t; i++) last = Math.trunc(r.next() * SAMPLE_SCALE * INT_MAX);
  return { pos: t, value: last };
}

// ---- 稀疏对象计数：连通棵数 + 树干 run（长 ≥4 的竖直连续段）----
interface SparseCount { cc: number; cells: number; trunkRuns: number; trunkCols: number }
function countSparse(
  w: number, h: number, visited: Uint8Array, isTreeFamily: boolean,
  member: (i: number) => boolean,
): SparseCount {
  visited.fill(0);
  let cc = 0, cells = 0, trunkRuns = 0;
  const trunkColHit = new Uint8Array(w);
  let trunkCols = 0;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (visited[i] || !member(i)) continue;
    cc++;
    stack.length = 0; stack.push(i);
    visited[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      cells++;
      const x = j % w, y = (j / w) | 0;
      // 4 邻
      if (x > 0 && !visited[j - 1] && member(j - 1)) { visited[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && !visited[j + 1] && member(j + 1)) { visited[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !visited[j - w] && member(j - w)) { visited[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && !visited[j + w] && member(j + w)) { visited[j + w] = 1; stack.push(j + w); }
    }
  }
  if (isTreeFamily) {
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        const i = y * w + x;
        if (member(i) && (y === 0 || !member(i - w))) {
          let len = 0;
          while (y + len < h && member((y + len) * w + x)) len++;
          if (len >= 4) { trunkRuns++; if (!trunkColHit[x]) { trunkColHit[x] = 1; trunkCols++; } }
          y += len;
        } else y++;
      }
    }
  }
  return { cc, cells, trunkRuns, trunkCols };
}

interface ZoneStat {
  cells: number; typ: number; act: number; wal: number; liq: number;
  typTop: Array<[string, number]>; walTop: Array<[string, number]>; liqTop: Array<[string, number]>;
}
function topN(m: Map<string, number>, n: number): Array<[string, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

interface WorldReport {
  file: string; size: string; seed: string; evil: number;
  genSeconds: number; parseSeconds: number; at: string;
  error?: string;
  header?: Record<string, { v: number | boolean | number[]; j: number | boolean | number[]; d: number | string }>;
  sparse?: Record<string, { v: number | number[]; j: number | number[] }>;
  zones?: Record<string, ZoneStat & { typPct: number; walPct: number; liqPct: number }>;
  overall?: { cells: number; typ: number; act: number; wal: number; liq: number; typPct: number; walPct: number; liqPct: number; unmappedJsActiveCells: number };
}

function anchor<T extends number | boolean | number[]>(v: T, j: T): { v: T; j: T; d: number | string } {
  const eq = Array.isArray(v) && Array.isArray(j)
    ? v.length === j.length && v.every((x, i) => x === j[i])
    : v === j;
  return { v, j, d: eq ? 0 : '≠' };
}

async function runWorld(row: Row): Promise<WorldReport> {
  const t0 = Date.now();
  const base: WorldReport = { file: row.file, size: row.size, seed: row.seed, evil: row.evil, genSeconds: 0, parseSeconds: 0, at: new Date().toISOString() };
  const tParse = Date.now();
  const wld: WldWorld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${row.file}`)));
  const parseSeconds = (Date.now() - tParse) / 1000;
  const tGen = Date.now();
  const dims = SIZE_DIMS[SIZE_ID[row.size]];
  const world: World = await generateWorld({
    size: SIZE_ID[row.size], width: dims.width, height: dims.height,
    seedText: row.seed, evil: row.evil,
  });
  const genSeconds = (Date.now() - tGen) / 1000;
  const st = world.store;
  const w = wld.tilesWide, h = wld.tilesHigh, n = w * h;
  if (st.w !== w || st.h !== h) { base.error = `尺寸不符 js=${st.w}x${st.h} wld=${w}x${h}`; return base; }
  base.parseSeconds = parseSeconds;
  base.genSeconds = genSeconds;

  // ① 头部锚（快验）——worldId 走 RNG 重放（js 侧真值 = 重放值）
  const wid = replayWorldId(row.seed, row.worldIdDraw || 18);
  base.header = {
    ground: anchor(wld.groundLevel, world.groundLevel),
    rock: anchor(wld.rockLevel, world.rockLevel),
    moon: anchor(wld.moonType, world.moonType),
    dungeonX: anchor(wld.dungeonX, world.dungeonX),
    dungeonY: anchor(wld.dungeonY, world.dungeonY),
    spawnX: anchor(wld.spawnX, world.spawnX),
    spawnY: anchor(wld.spawnY, world.spawnY),
    crimson: anchor(wld.isCrimson, world.crimson),
    treeX: anchor(wld.treeX, world.treeX ?? []),
    treeStyle: anchor(wld.treeStyle, world.treeStyle ?? []),
    worldId: anchor(wld.worldId, wid.value),
  };

  // ② 稀疏对象逐棵计数（两侧同口径：投影到原版 id 后 CC / trunk-run）
  const wt = wld.tiles, jt = st;
  const vanActive = (i: number) => wt.active[i] === 1;
  const jsActive = (i: number) => jt.type[i] !== 0;
  const visited = new Uint8Array(n);
  // 两侧同函数体、同口径（visited 复用，每次 countSparse 开头 fill(0) 重置）
  const mk = (lut: Uint8Array, tree: boolean) => ({
    v: countSparse(w, h, visited, tree, (i) => vanActive(i) && lut[wt.type[i]] === 1),
    j: countSparse(w, h, visited, tree, (i) => {
      if (!jsActive(i)) return false;
      const v = SHEET[jt.type[i]];
      return v >= 0 && lut[v] === 1;
    }),
  });
  base.sparse = {
    trees: mk(LUT_TREE, true),
    palms: mk(LUT_PALM, false),
    chests: { v: wld.chests.length, j: world.chests.length },
    statues: mk(LUT_STATUE, false),
    pots: mk(LUT_POT, false),
  };

  // ③ 分区四通道差（单遍全图扫描）
  const gl = Math.floor(wld.groundLevel), rl = Math.floor(wld.rockLevel), hellTop = h - 200;
  const caveEnd = rl + ((hellTop - rl) >> 1);
  const bandOf = new Uint8Array(h);
  for (let y = 0; y < h; y++) bandOf[y] = y < gl - 60 ? 0 : y < rl ? 1 : y < caveEnd ? 2 : y < hellTop ? 3 : 4;
  const zones = BAND_NAMES.map(() => ({
    cells: 0, typ: 0, act: 0, wal: 0, liq: 0,
    typM: new Map<string, number>(), walM: new Map<string, number>(), liqM: new Map<string, number>(),
  }));
  const overall = { cells: n, typ: 0, act: 0, wal: 0, liq: 0, typPct: 0, walPct: 0, liqPct: 0, unmappedJsActiveCells: 0 };
  const bump = (m: Map<string, number>, k: string) => { m.set(k, (m.get(k) ?? 0) + 1); };
  for (let i = 0; i < n; i++) {
    const z = zones[bandOf[(i / w) | 0]];
    z.cells++;
    const va = wt.active[i] === 1;
    const jType = jt.type[i];
    const ja = jType !== 0;
    const vt = va ? wt.type[i] : -1;
    let jtV = -1;
    if (ja) {
      const s = SHEET[jType];
      if (s >= 0) jtV = s; else { jtV = -2; overall.unmappedJsActiveCells++; }
    }
    if (va !== ja) { z.act++; overall.act++; }
    if (va !== ja || (va && vt !== jtV)) {
      z.typ++; overall.typ++;
      bump(z.typM, `${vt}>${jtV === -2 ? 'UNMAPPED' : jtV}`);
    }
    const vw = wt.wall[i], jw = jt.wall[i];
    if (vw !== jw) { z.wal++; overall.wal++; bump(z.walM, `${vw}>${jw}`); }
    const vamt = wt.liquid[i], jamt = jt.liquid[i];
    const vlt = vamt > 0 ? wt.liquidType[i] : 0;
    const jlt = jamt > 0 ? jt.liquidType[i] : 0;
    if (vamt !== jamt || vlt !== jlt) {
      z.liq++; overall.liq++;
      bump(z.liqM, `t${vlt}:${vamt}>t${jlt}:${jamt}`);
    }
  }
  overall.typPct = (overall.typ / n) * 100;
  overall.walPct = (overall.wal / n) * 100;
  overall.liqPct = (overall.liq / n) * 100;
  base.zones = {};
  BAND_NAMES.forEach((name, bi) => {
    const z = zones[bi];
    base.zones![name] = {
      cells: z.cells, typ: z.typ, act: z.act, wal: z.wal, liq: z.liq,
      typTop: topN(z.typM, 5), walTop: topN(z.walM, 5), liqTop: topN(z.liqM, 5),
      typPct: (z.typ / z.cells) * 100, walPct: (z.wal / z.cells) * 100, liqPct: (z.liq / z.cells) * 100,
    };
  });
  base.overall = overall;
  return base;
}

// ---- 报告累积 + 汇总打印 ----
interface Report { meta: Record<string, unknown>; worlds: Record<string, WorldReport> }
function loadReport(): Report {
  if (FRESH || !existsSync(OUT)) return { meta: {}, worlds: {} };
  try {
    const r = JSON.parse(readFileSync(OUT, 'utf8'));
    return { meta: r.meta ?? {}, worlds: r.worlds ?? {} };
  } catch { return { meta: {}, worlds: {} }; }
}

function fmtPct(x: number): string { return x >= 0.1 ? x.toFixed(2) : x.toExponential(1); }
function dv(d: number | string): string { return d === 0 ? '0' : String(d); }

function printSummary(rep: Report) {
  const entries = Object.values(rep.worlds);
  if (!entries.length) { console.log('（报告为空）'); return; }
  entries.sort((a, b) => 'sml'.indexOf(a.size) - 'sml'.indexOf(b.size) || a.file.localeCompare(b.file));
  console.log(`\n===== 收敛矩阵汇总（${entries.length} 世界，${OUT}）=====`);
  console.log('file            gen(s)  hdrΔ | trunk v/j      treeCC v/j     chest v/j  statue v/j  pot v/j  | typ%      wal%      liq%');
  let typSum = 0, walSum = 0, liqSum = 0, ok = 0;
  for (const e of entries) {
    if (e.error) { console.log(`${e.file.padEnd(16)} ERROR: ${e.error}`); continue; }
    const hdrBad = Object.values(e.header!).filter((a) => a.d !== 0).length;
    const sp = e.sparse!;
    const t = sp.trees, c = sp.chests, stt = sp.statues, p = sp.pots;
    const o = e.overall!;
    console.log(
      `${e.file.padEnd(16)} ${e.genSeconds.toFixed(0).padStart(5)}  ${String(hdrBad).padStart(3)} | `
      + `${String(t.v.trunkRuns).padStart(5)}/${String(t.j.trunkRuns).padEnd(5)} `
      + `${String(t.v.cc).padStart(5)}/${String(t.j.cc).padEnd(5)} `
      + `${String(c.v).padStart(4)}/${String(c.j).padEnd(4)} `
      + `${String(stt.v.cc).padStart(4)}/${String(stt.j.cc).padEnd(4)} `
      + `${String(p.v.cc).padStart(5)}/${String(p.j.cc).padEnd(5)} | `
      + `${fmtPct(o.typPct).padStart(9)} ${fmtPct(o.walPct).padStart(9)} ${fmtPct(o.liqPct).padStart(9)}`,
    );
    typSum += o.typPct; walSum += o.walPct; liqSum += o.liqPct; ok++;
  }
  if (ok) {
    console.log(`${'-'.repeat(120)}`);
    console.log(`均值（${ok} 世界）：typ%=${(typSum / ok).toFixed(3)} wal%=${(walSum / ok).toFixed(3)} liq%=${(liqSum / ok).toFixed(3)}`);
  }
  // 分区 typ 细目矩阵
  console.log('\nfile            | sky.t%    surface.t%  cave.t%    deep.t%    hell.t%   | sky.w%  surf.w% cave.w% deep.w% hell.w%');
  for (const e of entries) {
    if (e.error || !e.zones) continue;
    const z = BAND_NAMES.map((b) => e.zones![b]);
    console.log(
      `${e.file.padEnd(16)} | `
      + z.map((s) => fmtPct(s.typPct).padStart(10)).join(' ') + ' | '
      + z.map((s) => fmtPct(s.walPct).padStart(7)).join(' '),
    );
  }
  // 每世界最热差异对（typ 最差带的 top3）
  console.log('\n—— 每世界 typ 差异最重的带 top3 差异对（v原版>j本仓）——');
  for (const e of entries) {
    if (e.error || !e.zones) continue;
    const worst = BAND_NAMES.map((b) => ({ b, s: e.zones![b] })).sort((a, b2) => b2.s.typ - a.s.typ)[0];
    const top = worst.s.typTop.slice(0, 3).map(([k, c2]) => `${k}×${c2}`).join(', ');
    console.log(`${e.file.padEnd(16)} ${worst.b}(typ=${worst.s.typ}/${worst.s.cells}) ${top || '-'}`);
  }
}

(RUN ? it : it.skip)('convergence matrix run', async () => {
  if (MODE === 'report') { printSummary(loadReport()); return; }
  const rows = loadRows();
  if (!rows.length) throw new Error(`${TSV} 无数据行`);
  const sel = selectRows(rows);
  const rep = loadReport();
  const t0 = Date.now();
  let ran = 0;
  console.log(`SW_MATRIX=${MODE} 选中 ${sel.length} 世界（MAX=${MAX} 预算=${BUDGET_MS / 1000}s 已有=${Object.keys(rep.worlds).length}）`);
  for (const row of sel) {
    if (ran >= MAX) { console.log(`已达本次 MAX=${MAX}，余量下次续跑`); break; }
    if (!FORCE && rep.worlds[row.file]?.overall) { console.log(`跳过（报告已有）：${row.file}`); continue; }
    const elapsed = Date.now() - t0;
    const expect = EXPECT_S[row.size] ?? 300;
    if (ran > 0 && elapsed + expect * 1000 > BUDGET_MS) {
      console.log(`预算守门：已用 ${elapsed / 1000 | 0}s + 预估 ${expect}s 超预算，止于 ${ran} 世界`);
      break;
    }
    console.log(`▶ ${row.file}（seed=${row.seed} evil=${row.evil} 预估 ${expect}s）…`);
    try {
      const entry = await runWorld(row);
      rep.worlds[row.file] = entry;
      if (entry.error) console.log(`  ✗ ${entry.error}`);
      else {
        console.log(
          `  ✓ gen=${entry.genSeconds!.toFixed(0)}s typ%=${entry.overall!.typPct.toFixed(3)} wal%=${entry.overall!.walPct.toFixed(3)} liq%=${entry.overall!.liqPct.toFixed(3)}`
          + ` trunk ${entry.sparse!.trees.v.trunkRuns}/${entry.sparse!.trees.j.trunkRuns}`
          + ` chest ${entry.sparse!.chests.v}/${entry.sparse!.chests.j}`
          + ` statue ${entry.sparse!.statues.v.cc}/${entry.sparse!.statues.j.cc}`
          + ` pot ${entry.sparse!.pots.v.cc}/${entry.sparse!.pots.j.cc}`
          + ` unmapped=${entry.overall!.unmappedJsActiveCells}`,
        );
      }
    } catch (err) {
      rep.worlds[row.file] = {
        ...{ file: row.file, size: row.size, seed: row.seed, evil: row.evil, genSeconds: 0, parseSeconds: 0, at: new Date().toISOString() },
        error: (err as Error).message,
      };
      console.log(`  ✗ 异常：${(err as Error).message}`);
    }
    ran++;
    // 滚动修正耗时预估（同尺寸）
    const done = rep.worlds[row.file];
    if (done && !done.error) EXPECT_S[row.size] = Math.round(done.genSeconds * 1.15);
    writeFileSync(OUT, JSON.stringify(rep, null, 1));
  }
  rep.meta = { ...rep.meta, updatedAt: new Date().toISOString(), mode: MODE, count: Object.keys(rep.worlds).length };
  writeFileSync(OUT, JSON.stringify(rep, null, 1));
  printSummary(rep);
  console.log(`\n报告已写 ${OUT}（累计 ${Object.keys(rep.worlds).length} 世界）`);
}, 3_600_000);
