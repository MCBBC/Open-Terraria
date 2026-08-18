// DDDD 批探针④：room1 ② 清墙序首差格——终态墙图按扫描序（x外y内）逐格对比。
// 用法：SW_DDDD=4 npx vitest run tools/_dddd4.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runBuriedChestsPass, runUnderworldChestsPass } from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN = process.env.SW_DDDD === '4';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;

function boundary(key: string) {
  const dir = `${BDIR}/${key}`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${dir}/chests.json`, 'utf8')) as unknown[];
  return { gs, gensolid, fx, fy, wire, ids35, chests };
}

function buildHybrid(baseIdx: number, b: ReturnType<typeof boundary>): TileStore {
  const b8 = (e: string) => new Uint8Array(readFileSync(gPath(baseIdx, e)).buffer.slice(0));
  const b16 = (e: string) => new Uint16Array(readFileSync(gPath(baseIdx, e)).buffer.slice(0));
  const c = { t: b16('typ'), a: b8('act'), w: b16('wal'), l: b8('liq'), hf: b8('half'), sl: b8('slope'), lt: b8('lty') };
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = b.ids35.has(i) ? b.ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = 0;
    st.frameX[i] = b.fx[i]; st.frameY[i] = b.fy[i]; st.wire[i] |= b.wire[i];
  }
  return st;
}

(RUN ? it : it.skip)('DDDD probe4: room1 ② clear divergence cell', async () => {
  const entry = boundary('s17');
  const gs: GenState = structuredClone(entry.gs);
  restoreGenSolid(entry.gensolid);
  const st = buildHybrid(58, entry);
  const chests = structuredClone(entry.chests) as Array<{ x: number; y: number }>;
  const rng = new RNG(SEED);
  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs, chests);
  runBuriedChestsPass(st, rng, gs, chests);
  runUnderworldChestsPass(st, rng, gs, chests);
  runCaveHousesPass(st, rng, gs, chests);
  flipGenSolid([226, 162, 225, 190], false);

  const w59 = new Uint16Array(readFileSync(gPath(59, 'wal')).buffer.slice(0));
  const a59 = new Uint8Array(readFileSync(gPath(59, 'act')).buffer.slice(0));
  const t59 = new Uint16Array(readFileSync(gPath(59, 'typ')).buffer.slice(0));
  // room1 = (1850,534,22,8)。② 只动墙；腔体 (1851..1870,535..540) 输入墙恒 27（除①蛛网格）。
  // 终态墙差按扫描序（x外1850→1871，y内534→541）找首差。
  let first: [number, number, number, number] | null = null;
  const diffs: string[] = [];
  for (let x = 1850; x <= 1871; x++) {
    for (let y = 534; y <= 541; y++) {
      const i = y * W + x;
      if (w59[i] !== st.wall[i]) {
        if (!first) first = [x, y, w59[i]!, st.wall[i]!];
        if (diffs.length < 30) diffs.push(`(${x},${y}) v${w59[i]} j${st.wall[i]}`);
      }
    }
  }
  console.log(`room1 墙差总数=${diffs.length >= 30 ? '30+' : diffs.length} 首差=${first}`);
  console.log(diffs.join(' '));
  // ② 输入墙重建（诚实重建：golden58 基座 + ER内腔墙27 + 楼梯顶台墙 + ① 蛛网清墙）
  // —— ① 蛛网格 = 终态里有 51 的格（②③ 不写 51；但 ③ 不动墙所以 51 原样保留）
  // 用 JS 终态找 51 格（vanilla/JS 蛛网在流漂前一致——以首差之前的区域为准）
  if (first) {
    const [fx0, fy0] = [first[0], first[1]];
    console.log(`首差格 (${fx0},${fy0}) 上下文（墙 v/j | 类型 v/j）:`);
    for (let y = Math.max(530, fy0 - 3); y <= Math.min(548, fy0 + 3); y++) {
      let row = '';
      for (let x = fx0 - 6; x <= fx0 + 6; x++) {
        const i = y * W + x;
        const vt = a59[i] ? t59[i] : 0;
        const jt = st.flags[i] ? (SHEET[st.type[i]!] ?? -1) : 0;
        row += `(${x},${y})W${w59[i]}/${st.wall[i]}T${vt}/${jt} `;
      }
      console.log(row);
    }
  }
}, 560_000);
