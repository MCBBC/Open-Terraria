// #UUUUU 一次性空间 triage 探针（VVVV 方法论复刻；用毕即删）。
// 对拍 /tmp/vserver86/*.wld ↔ JS generateWorld：按生物群系区域分解 typ/wal/liq
// 差异族 + 蜘蛛巢盒/神庙盒对齐 + s12345 树列(≥3) + spawnY 出生列首差定源。
// 用法：cd game && SW_TRIAGE=s22222.wld,m33333.wld,... npx vitest run tools/_uuuuu-triage.test.ts
//   SW_SPAWNCOL=s2222.wld,...  spawnY 定源子模式（复用已生成世界，单世界快）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld, type WldWorld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const MODE = process.env.SW_TRIAGE ?? '';
const RUN = MODE !== '' && MODE !== '0';
const VSRV = process.env.SW_TRIAGE_VSRV ?? '/tmp/vserver86';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

// 生物群系列跨度探测（原版参考）：洞穴带内 mud/snow-ice/sand 计分取连续跨度
function columnSpans(
  w: number, h: number, td: import('../src/wld/WldParser').WldTileData,
  ids: Set<number>, minY: number, maxY: number, minHits: number,
): Array<[number, number]> {
  const hits = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    for (let y = minY; y < maxY && y < h; y++) {
      const i = y * w + x;
      if (td.active[i] === 1 && ids.has(td.type[i])) hits[x]++;
    }
  }
  const spans: Array<[number, number]> = [];
  let s = -1;
  for (let x = 0; x <= w; x++) {
    const on = x < w && hits[x] >= minHits;
    if (on && s < 0) s = x;
    if (!on && s >= 0) { spans.push([s, x - 1]); s = -1; }
  }
  // 合并近邻（<40 列间隙）并丢弃 <60 列宽的噪声段
  const merged: Array<[number, number]> = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp[0] - last[1] < 40) last[1] = sp[1];
    else merged.push([...sp] as [number, number]);
  }
  return merged.filter(([a, b]) => b - a >= 60);
}

// 连通盒：wall==id 的 4 邻 CC，取 ≥minSize 的包围盒
function wallBoxes(
  w: number, h: number, td: import('../src/wld/WldParser').WldTileData, id: number, minSize: number,
): Array<{ x0: number; y0: number; x1: number; y1: number; n: number }> {
  const seen = new Uint8Array(w * h);
  const out: Array<{ x0: number; y0: number; x1: number; y1: number; n: number }> = [];
  const stack: number[] = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (seen[i0] || td.wall[i0] !== id) continue;
    stack.length = 0; stack.push(i0); seen[i0] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j / w) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !seen[j - 1] && td.wall[j - 1] === id) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && !seen[j + 1] && td.wall[j + 1] === id) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !seen[j - w] && td.wall[j - w] === id) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && !seen[j + w] && td.wall[j + w] === id) { seen[j + w] = 1; stack.push(j + w); }
    }
    if (n >= minSize) out.push({ x0, y0, x1, y1, n });
  }
  out.sort((a, b) => b.n - a.n);
  return out;
}

function topN(m: Map<string, number>, n: number): string {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, c]) => `${k}×${c}`).join(', ');
}

const MUD = new Set([59, 60, 199, 225]);
const SNOW = new Set([161, 162, 163, 164, 162]);
const SAND = new Set([53, 112, 116, 117, 189, 223, 233, 396, 397, 398, 401]);

interface Ctx {
  w: number; h: number; wld: WldWorld; jt: import('../src/world/World').World['store'];
}
function regionOf(c: Ctx, x: number, y: number, meta: {
  gl: number; hellTop: number; dgx: number; dgy: number;
  jungle: Array<[number, number]>; ice: Array<[number, number]>; desert: Array<[number, number]>;
  spiderBoxes: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  templeBox: { x0: number; y0: number; x1: number; y1: number } | null;
}): string {
  for (const b of meta.spiderBoxes) {
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return 'spider';
  }
  const t = meta.templeBox;
  if (t && x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1) return 'temple';
  if (Math.abs(x - meta.dgx) <= 170 && Math.abs(y - meta.dgy) <= 180) return 'dungeon';
  if (y >= meta.hellTop) return 'hell';
  for (const [a, b] of meta.jungle) if (x >= a && x <= b) return y < meta.gl ? 'sky' : (y < meta.gl + 40 ? 'jungleSurf' : 'jungle');
  for (const [a, b] of meta.ice) if (x >= a && x <= b) return y < meta.gl ? 'sky' : (y < meta.gl + 40 ? 'iceSurf' : 'ice');
  for (const [a, b] of meta.desert) if (x >= a && x <= b) return y < meta.gl ? 'sky' : (y < meta.gl + 40 ? 'desertSurf' : 'desert');
  if (y < meta.gl - 60) return 'sky';
  if (y < meta.gl) return 'otherSurf';
  return 'otherCave';
}

async function triageWorld(file: string, sizeChar: 's' | 'm' | 'l') {
  const wld: WldWorld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${file}`)));
  const dims = SIZE_DIMS[{ s: 0, m: 1, l: 2 }[sizeChar] as 0 | 1 | 2];
  const seed = file.replace(/\.wld$/, '').slice(1);
  const world = await generateWorld({
    size: { s: 0, m: 1, l: 2 }[sizeChar] as 0 | 1 | 2,
    width: dims.width, height: dims.height,
    seedText: seed, evil: wld.isCrimson ? 1 : 0,
  });
  const st = world.store;
  const w = wld.tilesWide, h = wld.tilesHigh, n = w * h;
  const gl = Math.floor(wld.groundLevel), hellTop = h - 200;
  console.log(`\n######## ${file} ########`);
  const jungle = columnSpans(w, h, wld.tiles, MUD, gl, hellTop, 40);
  const ice = columnSpans(w, h, wld.tiles, SNOW, gl, hellTop, 40);
  const desert = columnSpans(w, h, wld.tiles, SAND, gl, hellTop, 40);
  console.log(`带参考：jungle=[${jungle.map((s) => s.join(',')).join(' | ')}] ice=[${ice.map((s) => s.join(',')).join(' | ')}] desert=[${desert.map((s) => s.join(',')).join(' | ')}] dungeon=(${wld.dungeonX},${wld.dungeonY}) hellTop=${hellTop} gl=${gl}`);
  const spiderBoxes = wallBoxes(w, h, wld.tiles, 62, Math.max(300, Math.floor(w / 10)));
  console.log(`蜘蛛巢盒×${spiderBoxes.length}（原版墙62，top5 尺寸 ${spiderBoxes.slice(0, 5).map((b) => `${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`).join(' ')}）`);
  const templeBoxV = wallBoxes(w, h, wld.tiles, 87, 500)[0] ?? null;
  // JS 侧墙盒（JS store.wall 即原版 id 直存）
  const templeBoxJ = wallBoxes(w, h, { wall: st.wall } as unknown as import('../src/wld/WldParser').WldTileData, 87, 500)[0] ?? null;
  const fmtB = (b: { x0: number; y0: number; x1: number; y1: number } | null) => b ? `${b.x0}-${b.x1},${b.y0}-${b.y1}` : '(无)';
  console.log(`神庙盒 v=${fmtB(templeBoxV)}  j=${fmtB(templeBoxJ)}`);
  const spiderBoxesJ = wallBoxes(w, h, { wall: st.wall } as unknown as import('../src/wld/WldParser').WldTileData, 62, Math.max(300, Math.floor(w / 10)));
  console.log(`JS蜘蛛巢盒×${spiderBoxesJ.length}`);

  // 树列（≥3 连续竖跑 sheet5 干列——IIIII 口径）计数 v/j
  const treeCols = (isVan: boolean): number => {
    let cols = 0;
    for (let x = 0; x < w; x++) {
      let run = 0, hit = false;
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        const t = isVan ? (wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1) : (st.type[i] !== 0 ? SHEET[st.type[i]] : -1);
        if (t === 5) { run++; if (run >= 3) { hit = true; break; } }
        else run = 0;
      }
      if (hit) cols++;
    }
    return cols;
  };
  console.log(`树列(≥3竖跑 sheet5) v=${treeCols(true)} j=${treeCols(false)}`);

  // 区域分解
  const ctx: Ctx = { w, h, wld, jt: st };
  const meta = {
    gl, hellTop, dgx: wld.dungeonX, dgy: wld.dungeonY,
    jungle, ice, desert, spiderBoxes: spiderBoxes.map((b) => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 })),
    templeBox: templeBoxV ? { x0: templeBoxV.x0, y0: templeBoxV.y0, x1: templeBoxV.x1, y1: templeBoxV.y1 } : null,
  };
  type Zone = { typ: number; wal: number; liq: number; cells: number; typM: Map<string, number>; walM: Map<string, number>; liqM: Map<string, number> };
  const zones = new Map<string, Zone>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    const rn = regionOf(ctx, x, y, meta);
    let z = zones.get(rn);
    if (!z) { z = { typ: 0, wal: 0, liq: 0, cells: 0, typM: new Map(), walM: new Map(), liqM: new Map() }; zones.set(rn, z); }
    z.cells++;
    const va = wld.tiles.active[i] === 1;
    const jType = st.type[i];
    const ja = jType !== 0;
    const vt = va ? wld.tiles.type[i] : -1;
    const jtV = ja ? SHEET[jType] : -1;
    if (va !== ja || (va && vt !== jtV)) { z.typ++; bump(z.typM, `${vt}>${jtV}`); }
    if (wld.tiles.wall[i] !== st.wall[i]) { z.wal++; bump(z.walM, `${wld.tiles.wall[i]}>${st.wall[i]}`); }
    const vamt = wld.tiles.liquid[i], jamt = st.liquid[i];
    const vlt = vamt > 0 ? wld.tiles.liquidType[i] : 0, jlt = jamt > 0 ? st.liquidType[i] : 0;
    if (vamt !== jamt || vlt !== jlt) { z.liq++; bump(z.liqM, `t${vlt}:${vamt}>t${jlt}:${jamt}`); }
  }
  const order = ['sky', 'hell', 'temple', 'dungeon', 'spider', 'jungle', 'jungleSurf', 'ice', 'iceSurf', 'desert', 'desertSurf', 'otherCave', 'otherSurf'];
  const tot = { typ: 0, wal: 0, liq: 0 };
  for (const v of zones.values()) { tot.typ += v.typ; tot.wal += v.wal; tot.liq += v.liq; }
  for (const ch of ['typ', 'wal', 'liq'] as const) {
    console.log(`—— ${ch}（总 ${tot[ch].toLocaleString()}）——`);
    for (const rn of order) {
      const z = zones.get(rn);
      if (!z || !z[ch]) continue;
      const pct = ((z[ch] / tot[ch]) * 100).toFixed(1);
      const m = z[`${ch}M` as 'typM' | 'walM' | 'liqM'] as Map<string, number>;
      console.log(`  ${rn.padEnd(12)} ${String(z[ch]).padStart(7)} (${pct}%)  ${topN(m, 3)}`);
    }
  }
}

// spawnY 定源：出生列 v/j 逐行首个差 + 首活性行
async function spawnColDiag(file: string, sizeChar: 's' | 'm' | 'l') {
  const wld: WldWorld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${file}`)));
  const dims = SIZE_DIMS[{ s: 0, m: 1, l: 2 }[sizeChar] as 0 | 1 | 2];
  const world = await generateWorld({
    size: { s: 0, m: 1, l: 2 }[sizeChar] as 0 | 1 | 2,
    width: dims.width, height: dims.height,
    seedText: file.replace(/\.wld$/, '').slice(1), evil: wld.isCrimson ? 1 : 0,
  });
  const st = world.store;
  const w = wld.tilesWide;
  const sx = wld.spawnX;
  console.log(`\n@@spawn ${file}: v spawn=(${wld.spawnX},${wld.spawnY}) j spawn=(${world.spawnX},${world.spawnY}) 出生列=${sx}`);
  const firstRow = (active: Uint8Array | Uint8Array, type: Uint16Array | Uint8Array, isVan: boolean) => {
    for (let y = 0; y < wld.tilesHigh; y++) {
      const i = y * w + sx;
      const t = isVan ? (active[i] === 1 ? type[i] : -1) : (type[i] !== 0 ? SHEET[type[i]] : -1);
      if (t !== -1 && t !== 379) return { y, t };
    }
    return { y: -1, t: -1 };
  };
  const fv = firstRow(wld.tiles.active, wld.tiles.type, true);
  const fj = firstRow(wld.tiles.active, st.type, false);
  console.log(`  首活性行 v=(y=${fv.y}, t=${fv.t}) j=(y=${fj.y}, t=${fj.t})`);
  // 出生列 ±3 列窗口逐行首个差
  let shown = 0;
  for (let y = Math.max(0, Math.min(fv.y, fj.y) - 8); y < wld.tilesHigh && shown < 24; y++) {
    const diffs: string[] = [];
    for (let dx = -3; dx <= 3; dx++) {
      const x = sx + dx;
      if (x < 0 || x >= w) continue;
      const i = y * w + x;
      const vt = wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
      const jt = st.type[i] !== 0 ? SHEET[st.type[i]] : -1;
      const vw = wld.tiles.wall[i], jw = st.wall[i];
      if (vt !== jt) diffs.push(`x${x > sx ? '+' + (x - sx) : x - sx}:t${vt}>t${jt}`);
      else if (vw !== jw) diffs.push(`x${x > sx ? '+' + (x - sx) : x - sx}:w${vw}>w${jw}`);
    }
    if (diffs.length) { console.log(`  y=${y}: ${diffs.join(' ')}`); shown++; }
  }
}

(RUN ? it : it.skip)('uuuuu spatial triage', async () => {
  const targets = MODE.split(',').map((s) => s.trim()).filter(Boolean);
  for (const t0raw of targets) {
    const t = t0raw.startsWith('@') ? t0raw.slice(1) : t0raw;
    const sizeChar = (t[0] === 'l' ? 'l' : t[0] === 'm' ? 'm' : 's') as 's' | 'm' | 'l';
    const t0 = Date.now();
    if (t0raw.startsWith('@')) await spawnColDiag(t, sizeChar);
    else await triageWorld(t, sizeChar);
    console.log(`（${t} ${((Date.now() - t0) / 1000).toFixed(0)}s）`);
  }
}, 1_800_000);
