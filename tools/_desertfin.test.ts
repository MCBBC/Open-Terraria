// 一次性诊断：#19 残余 19 格精确定位（slope 修复后）。
// 复用 deserthunt harness：抓 DesertBiome 入口态→隔离重放，末态 vs dump019
// 逐格列出 act/typ 差 + 掷骰计数 + 装饰放置事件轨迹（首个分叉定位）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld, runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDesertMoundOnly, runDesertEntrancesAndHive } from '../src/world/gen/vanilla/DesertPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const sheetOf = (repoId: number) => SHEET[repoId] ?? -1;

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const load = (idx: number, ext: string, name: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const d19 = RUN ? {   // ★套件门(2026-09-02):RUN=0 不读夹具
  typ: new Uint16Array(load(19, 'typ', 'Full_Desert').buffer.slice(0)),
  act: load(19, 'act', 'Full_Desert'),
  wal: new Uint16Array(load(19, 'wal', 'Full_Desert').buffer.slice(0)),
} : { typ: new Uint16Array(0), act: Buffer.alloc(0), wal: new Uint16Array(0) };

const cloneStore = (src: TileStore): TileStore => {
  const t = new TileStore(W, H);
  t.type.set(src.type); t.flags.set(src.flags); t.wall.set(src.wall);
  t.liquid.set(src.liquid); t.liquidType.set(src.liquidType);
  t.half.set(src.half); t.slope.set(src.slope);
  t.frameX.set(src.frameX); t.frameY.set(src.frameY);
  return t;
};

(RUN ? it : it.skip)('desert final 19-cell forensics', async () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const gs = rt.gs;
  gs.desertHiveHigh = H; gs.desertHiveLow = 0; gs.desertHiveLeft = W; gs.desertHiveRight = 0;
  gs.undergroundDesert = null;

  const origReseed = RNG.prototype.reseed;
  let captured: TileStore | null = null;
  let lastStore: TileStore | null = null;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    if (!captured && lastStore && ((new Error().stack ?? '') as string).split('\n').some((l) => l.includes('DesertPass.ts:1'))) {
      captured = cloneStore(lastStore);
    }
  };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w) => { lastStore = w.store; },
    } as never);
  } catch (e) { console.log('GEN-EX', String(e).slice(0, 200)); }
  (RNG.prototype as { reseed: unknown }).reseed = origReseed;
  if (!captured) { console.log('!! 未捕获'); return; }
  const st = captured;

  const rng = new RNG(gs.seed);
  let draws = 0;
  const oNext = rng.next.bind(rng), oInt = rng.int.bind(rng),
    oNIR = rng.nextIntRange.bind(rng), oNI = rng.nextInt.bind(rng);
  rng.next = () => { draws++; return oNext(); };
  rng.int = (a: number, b: number) => { draws++; return oInt(a, b); };
  rng.nextIntRange = (a: number, b: number) => { draws++; return oNIR(a, b); };
  rng.nextInt = (m: number) => { draws++; return oNI(m); };

  const desc = runDesertMoundOnly(st, rng, gs);
  const d0 = draws;
  runDesertEntrancesAndHive(st, rng, gs, desc);
  console.log(`draws: mound+entrance+hive+cleanup=${draws} (vanilla 319318, 差=${319318 - draws})`);

  // act/typ 差逐格列出（全图）
  const rows: string[] = [];
  let actDiff = 0, typDiff = 0;
  const typPairs = new Map<string, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const aJ = st.flags[i] & 1, aV = d19.act[i];
    const tJ = aJ ? sheetOf(st.type[i]) : 0;
    if (aJ !== aV) {
      actDiff++;
      if (rows.length < 40) rows.push(`ACT (${x},${y}) js t${tJ} a${aJ} | van t${d19.typ[i]} a${aV} wal js${st.wall[i]} van${d19.wal[i]}`);
    } else if (aJ && tJ !== d19.typ[i]) {
      typDiff++;
      const k = `t${tJ}>${d19.typ[i]}`;
      typPairs.set(k, (typPairs.get(k) ?? 0) + 1);
      if (rows.length < 40) rows.push(`TYP (${x},${y}) js t${tJ} | van t${d19.typ[i]}`);
    }
  }
  console.log(`act差=${actDiff} typ差(active且类型异)=${typDiff}`);
  console.log('typ对:', [...typPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  console.log(rows.join('\n'));

  // 坡面统计（调试用）：smooth 后的 half/slope 数量
  let halfN = 0, slopeN = 0;
  for (let i = 0; i < N; i++) { if (st.half[i]) halfN++; if (st.slope[i]) slopeN++; }
  console.log(`half格=${halfN} slope格=${slopeN}`);

  // JS 末态落盘（供人工对拍）
  {
    const n = W * H;
    const typ = Buffer.alloc(n * 2), act = Buffer.alloc(n), wal = Buffer.alloc(n * 2);
    const half = Buffer.alloc(n), slope = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      typ.writeUInt16LE(Math.max(0, sheetOf(st.type[i])), i * 2);   // RAW(含幽灵 type,与 dump 同口径)
      act.writeUInt8(st.flags[i] & 1, i);
      wal.writeUInt16LE(st.wall[i], i * 2);
      half.writeUInt8(st.half[i], i);
      slope.writeUInt8(st.slope[i], i);
    }
    writeFileSync('/tmp/js_desert_slopefix.typ', typ);
    writeFileSync('/tmp/js_desert_slopefix.act', act);
    writeFileSync('/tmp/js_desert_slopefix.wal', wal);
    writeFileSync('/tmp/js_desert_slopefix.half', half);
    writeFileSync('/tmp/js_desert_slopefix.slope', slope);
  }
}, 480000);

// ---- 附加:39 ghost 格上的场强探针(3.5 阈值边界检验) ----
(RUN ? it : it.skip)('field probe at ghost cells', async () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const gs = rt.gs;
  gs.desertHiveHigh = H; gs.desertHiveLow = 0; gs.desertHiveLeft = W; gs.desertHiveRight = 0;
  gs.undergroundDesert = null;
  const origReseed = RNG.prototype.reseed;
  let captured: TileStore | null = null;
  let lastStore: TileStore | null = null;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    if (!captured && lastStore && ((new Error().stack ?? '') as string).split('\n').some((l) => l.includes('DesertPass.ts:1'))) {
      captured = cloneStore(lastStore);
    }
  };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: (w) => { lastStore = w.store; } } as never);
  } catch { /* */ }
  (RNG.prototype as { reseed: unknown }).reseed = origReseed;
  if (!captured) return;
  const st = captured!;
  const rng = new RNG(gs.seed);
  const samples: number[] = [];
  const URProto = Object.getPrototypeOf(rng.vanilla) as { internalSample: () => number };
  const origIS = URProto.internalSample;
  URProto.internalSample = function (this: unknown) {
    const v = (origIS as unknown as () => number).call(this);
    samples.push(v);
    return v;
  };
  let pEnt = -1;
  const desc = runDesertMoundOnly(st, rng, gs);
  const d0 = samples.length;
  void d0;
  runDesertEntrancesAndHive(st, rng, gs, desc, () => { pEnt = samples.length; });
  URProto.internalSample = origIS;
  // ClusterGroup.Generate 磁带重放(与 pass 同码)
  const pos = { i: pEnt };
  const ns = () => samples[pos.i++]!;
  const smp = () => ns() * 4.656612875245797e-10;
  const T = {
    next: () => smp(),
    int: (a: number, b: number) => (Math.trunc(smp() * (b + 1 - a)) + a) | 0,
  } as unknown as RNG;
  const gw = desc.blockCols, gh = desc.blockRows;
  const bm: boolean[][] = [];
  for (let c = 0; c < gw; c++) bm.push(new Array(gh).fill(false));
  {
    const n1 = Math.trunc(gw / 2) - 1, n2 = Math.trunc(gh / 2) - 1;
    const n3 = (n1 + 1) * (n1 + 1);
    for (let r = 0; r <= n2 * 2; r++) {
      const n4 = n1 / n2 * (r - n2);
      const n5 = Math.min(n1, Math.trunc(Math.sqrt(Math.max(0, n3 - n4 * n4))));
      for (let c = n1 - n5; c <= n1 + n5; c++) bm[c]![r] = T.int(0, 1) === 0;
    }
  }
  const pcs: Array<Array<[number, number]>> = [];
  {
    const dfs = (x: number, y: number, level: number, acc: Array<[number, number]>) => {
      acc.push([x, y]);
      bm[x]![y] = false;
      const lv = level - 1;
      if (lv === -1) return;
      if (x > 0 && bm[x - 1]![y]) dfs(x - 1, y, lv, acc);
      if (x < gw - 1 && bm[x + 1]![y]) dfs(x + 1, y, lv, acc);
      if (y > 0 && bm[x]![y - 1]) dfs(x, y - 1, lv, acc);
      if (y < gh - 1 && bm[x]![y + 1]) dfs(x, y + 1, lv, acc);
    };
    for (let x = 0; x < gw; x++) for (let y = 0; y < gh; y++) {
      if (bm[x]![y] && T.int(0, 1) === 0) {
        const pc: Array<[number, number]> = [];
        dfs(x, y, 2, pc);
        if (pc.length > 2) pcs.push(pc);
      }
    }
  }
  const im: number[][] = [];
  for (let c = 0; c < gw; c++) im.push(new Array(gh).fill(-1));
  pcs.forEach((pc, i) => { for (const [qx, qy] of pc) im[qx]![qy] = i; });
  for (let ci = 0; ci < pcs.length; ci++) {
    for (const [px, py] of pcs[ci]!) {
      if (im[px]![py] === -1) break;
      const idx = im[px]![py];
      const claim = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return;
        const o = im[nx]![ny];
        if (o === -1 || o === idx) return;
        const val = T.int(0, 1) === 0 ? -1 : idx;
        for (const [qx, qy] of pcs[o]!) im[qx]![qy] = val;
      };
      claim(px - 1, py); claim(px + 1, py); claim(px, py - 1); claim(px, py + 1);
    }
  }
  for (const pc of pcs) pc.length = 0;
  for (let x = 0; x < gw; x++) for (let y = 0; y < gh; y++) {
    if (im[x]![y] !== -1) pcs[im[x]![y]]!.push([x, y]);
  }
  for (const pc of pcs) if (pc.length < 4) pc.length = 0;
  const fcs: Array<Array<[number, number]>> = [];
  for (const pc of pcs) {
    if (pc.length <= 0) continue;
    fcs.push(pc.map(([bx, by]) => [bx + (T.next() - 0.5) * 0.5, by + (T.next() - 0.5) * 0.5] as [number, number]));
  }
  // 场强(与 pass 同式)
  const hiveW = desc.combW, hiveH = desc.hiveH;
  const fieldAt = (px: number, py: number): number => {
    const hi = px - desc.combX, hj = py - desc.hiveTop;
    const vx = (hi - 2) / hiveW * gw, vy = (hj - 1) / hiveH * gh;
    let f1 = 0, f3 = 0;
    for (let k = 0; k < fcs.length; k++) {
      const cl = fcs[k]!;
      const c0 = cl[0]!;
      if (Math.abs(c0[0] - vx) > 10 || Math.abs(c0[1] - vy) > 10) continue;
      let f6 = 0;
      for (const [bx, by] of cl) { const dx = bx - vx, dy = by - vy; f6 += 1 / (dx * dx + dy * dy); }
      if (f6 > f1) { if (f1 > f3) f3 = f1; f1 = f6; }
      else if (f6 > f3) f3 = f6;
    }
    return f1 + f3;
  };
  const cells = readFileSync('/tmp/ghost39.txt', 'utf-8').trim().split('\n').map((l) => l.split(' ').map(Number) as [number, number]);
  for (const [x, y] of cells) {
    console.log(`(${x},${y}) field=${fieldAt(x, y).toFixed(6)} delta3.5=${(fieldAt(x, y) - 3.5).toFixed(6)} vanTyp=${d19.typ[y * W + x]} vanAct=${d19.act[y * W + x]}`);
  }
  // |field-3.5| 直方图(全域,看 39 格是否都在窄带内)
  let near = 0, band = new Map<number, number>();
  for (let hi = -20; hi < hiveW + 20; hi += 1) for (let hj = -20; hj < hiveH + 20; hj += 7) {
    const px = desc.combX + hi, py = desc.hiveTop + hj;
    if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;
    const d = Math.abs(fieldAt(px, py) - 3.5);
    if (d < 0.01) { near++; const b = Math.floor(d * 1000); band.set(b, (band.get(b) ?? 0) + 1); }
  }
  console.log(`|field-3.5|<0.01 采样格数=${near}`);
}, 480000);
