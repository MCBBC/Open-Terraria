// DDDD 批探针②：#59 门格差异全景——重放三子 pass 后仅对拍 door(sheet10) 格（含帧）。
// 用法：SW_DDDD=2 npx vitest run tools/_dddd2.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runBuriedChestsPass, runUnderworldChestsPass } from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN = process.env.SW_DDDD === '2';
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

(RUN ? it : it.skip)('DDDD probe2: door cells diff', async () => {
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

  // golden 59 的门格（type 10）
  const t59 = new Uint16Array(readFileSync(gPath(59, 'typ')).buffer.slice(0));
  const a59 = new Uint8Array(readFileSync(gPath(59, 'act')).buffer.slice(0));
  // 全量 door 位置集合
  const vDoors: number[] = [], jDoors: number[] = [];
  for (let i = 0; i < N; i++) {
    if (a59[i] && t59[i] === 10) vDoors.push(i);
    if (st.flags[i] && SHEET[st.type[i]!] === 10) jDoors.push(i);
  }
  console.log(`vanilla door cells=${vDoors.length} JS door cells=${jDoors.length}`);
  const vSet = new Set(vDoors), jSet = new Set(jDoors);
  const onlyV: number[] = [], onlyJ: number[] = [];
  for (const i of vDoors) if (!jSet.has(i)) onlyV.push(i);
  for (const i of jDoors) if (!vSet.has(i)) onlyJ.push(i);
  console.log(`vanilla-only=${onlyV.length} JS-only=${onlyJ.length}`);
  const fmt = (i: number) => `(${i % W},${Math.floor(i / W)})`;
  console.log('vanilla-only 前 24:', onlyV.slice(0, 24).map(fmt).join(' '));
  console.log('JS-only     前 24:', onlyJ.slice(0, 24).map(fmt).join(' '));

  // ---- 发散屋 (1867,543)：房间 (1850,534,22×8)+(1852,541,15×8) 全通道对拍 ----
  const w59 = new Uint16Array(readFileSync(gPath(59, 'wal')).buffer.slice(0));
  // 全图 2×2 chest(21/467) 锚点清单（右上格=锚）对拍
  const vChests: string[] = [], jChests: string[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (a59[i] && (t59[i] === 21 || t59[i] === 467) && (!a59[i - 1] || t59[i - 1] !== t59[i])) vChests.push(`(${x},${y})t${t59[i]}`);
    if (st.flags[i] && (SHEET[st.type[i]!] === 21 || SHEET[st.type[i]!] === 467) && !(st.flags[i - 1] && SHEET[st.type[i - 1]!] === SHEET[st.type[i]!])) jChests.push(`(${x},${y})t${SHEET[st.type[i]!]}`);
  }
  console.log(`vanilla chests=${vChests.length} JS chests=${jChests.length}`);
  const vcSet = new Set(vChests.map(s => s.split(')')[0] + ')'));
  const onlyVC = vChests.filter(c => !jChests.includes(c));
  const onlyJC = jChests.filter(c => !vChests.includes(c));
  console.log('chest 仅vanilla 前 12:', onlyVC.slice(0, 12).join(' '));
  console.log('chest 仅JS     前 12:', onlyJC.slice(0, 12).join(' '));
  // mini-map: x 1848..1874, y 533..549 (vanilla值/JS值)
  for (let y = 533; y <= 549; y++) {
    let row = '';
    for (let x = 1848; x <= 1874; x++) {
      const i = y * W + x;
      const vv = a59[i] ? t59[i] : 0;
      const jj = st.flags[i] ? (SHEET[st.type[i]!] ?? -1) : 0;
      row += vv === jj ? (vv === 0 ? '..' : String(vv).padStart(2, '0')) : `${vv}!${jj}`;
      row += ' ';
    }
    console.log(`${y} v: ${row}`);
  }
  const boxes = [
    { tag: 'room1', x0: 1848, y0: 532, x1: 1872, y1: 543 },
    { tag: 'room2', x0: 1850, y0: 539, x1: 1869, y1: 550 },
  ];
  for (const b of boxes) {
    let n = 0;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * W + x;
        const vv = a59[i] ? t59[i] : 0;
        const jj = st.flags[i] ? (SHEET[st.type[i]!] ?? -1) : 0;
        if (vv !== jj || w59[i] !== st.wall[i]) {
          if (n < 60) console.log(`${b.tag} (${x},${y}) T ${vv}>${jj} W ${w59[i]}>${st.wall[i]}`);
          n++;
        }
      }
    }
    console.log(`${b.tag} diffs=${n}`);
  }
}, 560_000);
