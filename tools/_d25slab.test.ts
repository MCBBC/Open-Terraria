// 一次性：大理石 biome2 slab#78（van (990,917)，van 48 掷 vs js 63）首处分叉定位。
// 方法：TraceRNG 记录每掷 callsite（栈帧行号）+ PlaceSlab 探针钩子（入口快照）→
// 逐 slab 掷数对拍 rolltrace MX 增量 → 分叉 slab 的掷点序列打印。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runMarblePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const VG = process.env.SW_VG ?? '/tmp/sw-num4/van_x86_g';
const SEEDTXT = process.env.SW_SEED ?? '9293480';
const W = 4200, H = 1200;
const NAMES: Record<number, string> = { 20: 'Mushroom_Patches', 21: 'Marble' };
const load = (idx: number, ext: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

function buildStore(idx: number) {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = 0;
  }
  return st;
}

// ── rolltrace 解析：每个 MP 段的逐 slab 掷数增量 ──────────────────────────
function parseRolltrace(): Array<Array<{ xy: string; rolls: number }>> {
  const lines = readFileSync('/tmp/sw-marbleprobe/rolltrace.txt', 'utf8').split('\n');
  const segs: Array<Array<{ x: number; y: number; roll: number }>> = [];
  let cur: Array<{ x: number; y: number; roll: number }> | null = null;
  for (const ln of lines) {
    if (ln.startsWith('MP|')) { cur = []; segs.push(cur); continue; }
    if (ln.startsWith('MX|') && cur) {
      const [xy, roll] = ln.slice(3).split('|');
      const [x, y] = xy!.split(',').map(Number);
      cur.push({ x, y, roll: +roll! });
    }
  }
  return segs.filter(s => s.length > 0).map(s =>
    s.map((e, k) => ({ xy: `${e.x},${e.y}`, rolls: k + 1 < s.length ? s[k + 1]!.roll - e.roll : -1 })));
}

// ── TraceRNG：记录 callsite ────────────────────────────────────────────────
interface Roll { n: number; site: string; arg: string; val: number }
class TraceRNG extends RNG {
  log: Roll[] = [];
  n = 0;
  on = false;
  private rec(arg: string, val: number) {
    this.n++;
    if (!this.on) return;
    const st = new Error().stack ?? '';
    const frames = st.split('\n').map(s => {
      const m = s.match(/\(?([^()\s]+\.ts):(\d+):(\d+)\)?$/);
      return m ? `${m[1]!.split('/').pop()}:${m[2]}` : null;
    }).filter((s): s is string => !!s);
    const site = frames.find(f => !f.startsWith('rng.ts') && !f.startsWith('_d25slab.test.ts')) ?? '??';
    this.log.push({ n: this.n, site, arg, val });
  }
  override next(): number { const v = super.next(); this.rec('dbl', v); return v; }
  override int(min: number, max: number): number { const v = super.int(min, max); this.rec(`int${min}-${max}`, v); return v; }
  override nextIntRange(a: number, b: number): number { const v = super.nextIntRange(a, b); this.rec(`ir${a}-${b}`, v); return v; }
}

(RUN ? it : it.skip)('marble slab-level roll trace vs rolltrace MX', () => {
  const van = parseRolltrace();
  console.log(`vanilla segments with slabs: ${van.length} → counts ${van.map(s => s.length).join(',')}`);
  const st = buildStore(20);
  const rt = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: 0 });
  const trng = new TraceRNG(rt.gs.seed);

  // slab 探针：入口快照 + 掷窗开启
  let snap: Record<string, unknown> | null = null;
  (globalThis as { __swSlabProbe?: (x: number, y: number, pst: number, pWall: boolean) => void }).__swSlabProbe = (x, y, pst, pWall) => {
    if (x === 990 && y === 917) {
      const R = 8;
      snap = {};
      for (const k of ['type', 'flags', 'wall', 'half', 'slope', 'frameX', 'frameY', 'liquid'] as const) {
        const arr = (st as unknown as Record<string, Uint8Array | Uint16Array>)[k]!;
        const out: number[] = [];
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          out.push(arr[st.idx(x + dx, y + dy)] as number);
        }
        (snap as Record<string, number[]>)[k] = out;
      }
      (snap as Record<string, unknown>).pst = pst;
      (snap as Record<string, unknown>).pWall = pWall;
      trng.on = true;
    }
  };
  runMarblePass(st, trng, rt.gs);
  (globalThis as { __swSlabProbe?: unknown }).__swSlabProbe = undefined;

  // 用 238 行（i==-1/i==3 边缘列骰）分 slab：每 slab 恰 2 次（i=-1 与 i=3）
  const st2 = buildStore(20);
  const rt2 = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: 0 });
  const trng2 = new TraceRNG(rt2.gs.seed);
  trng2.on = true;
  runMarblePass(st2, trng2, rt2.gs);
  const slabs: Array<{ start: number; end: number }> = [];
  const EDGE_SITES = new Set((process.env.SW_EDGE_SITE ?? 'MarbleGranitePass.ts:238').split(','));
  {
    // 每 slab 恰 2 次边缘掷（i=-1 与 i=3）：slab_k = [edge[2k], edge[2k+2])
    const e: number[] = [];
    trng2.log.forEach((r, k) => { if (EDGE_SITES.has(r.site) && r.arg === 'int0-1') e.push(k); });
    for (let k = 0; k + 2 <= e.length; k += 2) slabs.push({ start: e[k]!, end: e[k + 2]! });
    if (e.length % 2 === 1 && e.length > 0) slabs.push({ start: e[e.length - 1]!, end: trng2.log.length });
  }
  console.log(`JS total draws=${trng2.n}, slab-anchors=${slabs.length}`);
  // biome 边界 = :168（marblePlace 首掷 bn）。按 biome 分组 slab 再对拍。
  const biomeStarts = trng2.log.map((r, k) => (r.site === 'MarbleGranitePass.ts:168' ? k : -1)).filter(k => k >= 0);
  console.log('JS biome starts at log idx:', biomeStarts.join(','));
  const slabsByBiome: number[][] = [];
  for (let b = 0; b < biomeStarts.length; b++) {
    const lo = biomeStarts[b]!, hi = b + 1 < biomeStarts.length ? biomeStarts[b + 1]! : trng2.log.length;
    slabsByBiome.push(slabs.map((s, idx) => ({ s, idx })).filter(x => x.s.start >= lo && x.s.start < hi).map(x => x.idx));
  }
  for (let b = 0; b < van.length && b < slabsByBiome.length; b++) {
    const jsIdx = slabsByBiome[b]!;
    const v = van[b]!.map(e => e.rolls).slice(0, -1);
    let bad = -1;
    for (let k = 0; k < Math.min(v.length, jsIdx.length); k++) {
      if (slabs[jsIdx[k]!]!.end - slabs[jsIdx[k]!]!.start !== v[k]) { bad = k; break; }
    }
    console.log(`biome${b + 1}: js slabs=${jsIdx.length} van=${van[b]!.length} firstCountMismatch=${bad + 1}${bad >= 0 ? ` (van=${v[bad]} js=${slabs[jsIdx[bad]!]!.end - slabs[jsIdx[bad]!]!.start})` : ''}`);
  }
  // 分叉 slab 定位：biome2（van seg 索引 1）的第一个 count 失配
  {
    const b = 1;
    const jsIdx = slabsByBiome[b]!;
    const v = van[b]!.map(e => e.rolls).slice(0, -1);
    let bad = -1;
    for (let k = 0; k < Math.min(v.length, jsIdx.length); k++) {
      if (slabs[jsIdx[k]!]!.end - slabs[jsIdx[k]!]!.start !== v[k]) { bad = k; break; }
    }
    if (bad >= 0) {
      const s = slabs[jsIdx[bad]!]!;
      console.log(`=== JS roll sequence of biome2 slab#${bad + 1} (${s.end - s.start} rolls, van ${v[bad]}) ===`);
      for (let k = s.start; k < s.end; k++) console.log(JSON.stringify(trng2.log[k]));
    }
  }
  // 快照保存（第一跑的）+ sheet 化格网打印
  if (snap) {
    const fs = { writeFileSync: (p: string, d: string) => import('node:fs').then(f => f.writeFileSync(p, d)) };
    void fs.writeFileSync('/tmp/sw-marbleprobe/js_slab78_entry.json', JSON.stringify(snap));
    console.log('entry snapshot written: /tmp/sw-marbleprobe/js_slab78_entry.json');
    const s = snap as Record<string, number[]>;
    const at = (k: string, dx: number, dy: number) => s[k]![(dy + 8) * 17 + (dx + 8)]!;
    const census = new Map<string, number>();
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const act = at('flags', dx, dy), sh = SHEET[at('type', dx, dy)] ?? -1;
      const key = `${act ? 'A' : 'i'}${sh}`;
      census.set(key, (census.get(key) ?? 0) + 1);
    }
    console.log('sheet census (A=active/i=inactive):', JSON.stringify([...census.entries()].sort((a, b) => b[1] - a[1])));
    const rows: string[] = [];
    for (let dy = -6; dy <= 8; dy++) {
      let r = '';
      for (let dx = -3; dx <= 7; dx++) {
        const act = at('flags', dx, dy), sh = SHEET[at('type', dx, dy)] ?? -1;
        const sl = at('slope', dx, dy), hb = at('half', dx, dy);
        r += act ? (sl > 0 ? String(sl) : (hb ? 'h' : (sh === 367 ? 'M' : (sh === 165 ? 'S' : `<${sh}>`)))) : '.';
      }
      rows.push(`${String(dy).padStart(3)} ${r}`);
    }
    console.log('JS entry grid (dx -3..7):');
    console.log(rows.join('\n'));
    const wrows: string[] = [];
    for (let dy = -6; dy <= 8; dy++) {
      let r = '';
      for (let dx = -3; dx <= 7; dx++) r += at('wall', dx, dy) !== 0 ? 'w' : '.';
      wrows.push(`${String(dy).padStart(3)} ${r}`);
    }
    console.log('JS entry walls:'); console.log(wrows.join('\n'));
    // frameX/frameY of 165 cells
    const f165: string[] = [];
    for (let dy = -6; dy <= 8; dy++) for (let dx = -3; dx <= 7; dx++) {
      if (at('flags', dx, dy) && SHEET[at('type', dx, dy)] === 165)
        f165.push(`(${dx},${dy})fx=${at('frameX', dx, dy)}fy=${at('frameY', dx, dy)}`);
    }
    console.log('165 cells:', f165.join(' '));
  } else console.log('!! entry snapshot NOT captured (990,917 never hit)');
}, 480000);
