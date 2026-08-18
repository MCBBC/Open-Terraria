// DDDD 批探针①：#59 Buried_Chests 首分歧定位——事件流对拍（AB/HB vs vanilla seg59k/houseprobe4）。
// 用法：SW_DDDD=1 npx vitest run tools/_dddd1.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runBuriedChestsPass, runUnderworldChestsPass } from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN = process.env.SW_DDDD === '1';
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

interface Boundary { gs: GenState; gensolid: Map<number, boolean>; fx: Uint16Array; fy: Uint16Array; wire: Uint8Array; ids35: Map<number, number>; chests: unknown[] }
function boundary(key: string): Boundary {
  const dir = `${BDIR}/${key}`;
  if (!existsSync(`${dir}/gs.json`)) throw new Error(`no boundary ${key}`);
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

function buildHybrid(baseIdx: number, b: Boundary): TileStore {
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

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}

(RUN ? it : it.skip)('DDDD probe1: event stream vs vanilla', async () => {
  const entry = boundary('s17');
  const gs: GenState = structuredClone(entry.gs);
  restoreGenSolid(entry.gensolid);
  const st = buildHybrid(58, entry);
  const chests = structuredClone(entry.chests) as Array<{ x: number; y: number }>;
  const { rng, box } = countedRng(SEED);
  const ur2 = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const origS = ur2.internalSample.bind(ur2);
  ur2.internalSample = () => { const r = origS(); (globalThis as Record<string, unknown>).__swRollN = box.n; return r; };

  type Ev = [string, number, number, number, number]; // kind,x,y,k,ret
  const evs: Ev[] = [];
  const pendingHouse = new Map<string, number>();
  (globalThis as Record<string, unknown>).__swChestEv = (p: string, i: number, j: number, x?: number) => {
    if (p === 'ab') evs.push(['AB', i, j, box.n, -1]);
    else if (p === 'abx') {
      // 'abx' 回调第 4 参 = ret（1/0/-1）；回溯找最近一条同 (i,j) 的 AB
      for (let q = evs.length - 1; q >= 0; q--) {
        if (evs[q]![0] === 'AB' && evs[q]![1] === i && evs[q]![2] === j && evs[q]![4] === -1) { evs[q]![4] = x ?? -1; break; }
      }
    }
  };
  (globalThis as Record<string, unknown>).__swHouseEv = (p: string, x: number, y: number) => {
    if (p === 'try' || p === 'dtry') { pendingHouse.set(p, evs.length); evs.push([p === 'try' ? 'HTRY' : 'HDTRY', x, y, box.n, -1]); }
    else if (p === 'no' || p === 'ok' || p === 'dno' || p === 'dok') {
      const key = p.startsWith('d') ? 'dtry' : 'try';
      const idx = pendingHouse.get(key);
      if (idx !== undefined) { evs[idx]![4] = p === 'no' || p === 'dno' ? 0 : 1; pendingHouse.delete(key); }
    }
  };
  // 阶段事件（bld/er/st/do/pl/sb/bp/fr/ar/ch/bt）：记 (tag, k, d参数)
  const stageEv: Array<[string, number, number]> = [];
  (globalThis as Record<string, unknown>).__swHouseStage = (tag: string, _a: number, _b: number, d: number, k: number) => {
    stageEv.push([tag, k, d]);
  };
  // genRect 事件（ageRoom ① 蛛网锚点 + ②③ 房间矩形）
  const genEv: Array<[number, number, number, number, number]> = [];
  (globalThis as Record<string, unknown>).__swAgeGen = (k: number, ox: number, oy: number, w: number, h: number) => {
    genEv.push([ox, oy, w, h, k]);
  };

  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs);
  runBuriedChestsPass(st, rng, gs, chests);
  runUnderworldChestsPass(st, rng, gs, chests);
  runCaveHousesPass(st, rng, gs, chests);
  flipGenSolid([226, 162, 225, 190], false);

  delete (globalThis as Record<string, unknown>).__swChestEv;
  delete (globalThis as Record<string, unknown>).__swHouseEv;
  delete (globalThis as Record<string, unknown>).__swHouseStage;
  delete (globalThis as Record<string, unknown>).__swAgeGen;

  // ---- 定位 (1867,543) 这座屋的阶段 k 对拍 ----
  const van17 = { k0: 34574, stages: [['ER', 34574], ['ST', 35529], ['DO', 35549], ['PL', 35552], ['SB', 35552], ['BP', 35552], ['FR', 35552], ['CH', 36763], ['BT', 36788]] };
  console.log(`\nvanilla house#17 (1867,543) k0=${van17.k0} stages=${JSON.stringify(van17.stages)}`);
  // JS：找 HTRY (1867,543) 成功那座，打印其后续阶段事件
  const hIdx = evs.findIndex(e => e[0] === 'HTRY' && e[1] === 1867 && e[2] === 543 && e[4] === 1);
  if (hIdx >= 0) {
    const hk = evs[hIdx]![3];
    console.log(`JS HTRY(1867,543) k=${hk}`);
    const tail = stageEv.filter(s => s[1] >= hk && s[1] <= hk + 2300);
    for (const s of tail) console.log(`  stage ${s[0]} k=${s[1]} d=${s[2]}`);
    // 该屋 aging 的 genRect 锚点（fr 之后到 ch 之前）——成对(头/尾)去重
    const frK = stageEv.find(s => s[0] === 'fr' && s[1] >= hk)?.[1];
    const chK = stageEv.find(s => s[0] === 'ch' && s[1] >= hk)?.[1];
    console.log(`  fr=${frK} ch=${chK} —— aging genRect 锚点:`);
    const pairs: Array<{ ox: number; oy: number; w: number; h: number; k0: number; k1: number }> = [];
    const raw = genEv.filter(g => g[4] >= (frK ?? 0) && g[4] <= (chK ?? 1e9));
    for (let q = 0; q + 1 < raw.length; q += 2) {
      pairs.push({ ox: raw[q]![0], oy: raw[q]![1], w: raw[q]![2], h: raw[q]![3], k0: raw[q]![4], k1: raw[q + 1]![4] });
    }
    for (const p of pairs) console.log(`    GE (${p.ox},${p.oy}) ${p.w}x${p.h} k=${p.k0}→${p.k1} (${p.k1 - p.k0} rolls)`);
  } else console.log('JS HTRY(1867,543) not found!');

  // ---- vanilla 参照：seg59k 的 AB 段 + houseprobe4 的 HB 段（按文件序拼接）----
  const vAb: Array<[number, number, number, number]> = [];  // x,y,k,ret
  for (const line of readFileSync('/tmp/hg/seg59k.txt', 'utf8').split('\n')) {
    const p = line.split('|');
    if (p[0] === 'AB') {
      const k = Number(p[7]?.split('=')[1] ?? -1);
      vAb.push([Number(p[1]), Number(p[2]), k, -1]);
    } else if (p[0] === 'ABX' && vAb.length) vAb[vAb.length - 1]![3] = Number(p[1]);
  }
  const vHb: Array<[number, number, number]> = [];
  for (const line of readFileSync('/tmp/hg/houseprobe4.txt', 'utf8').split('\n')) {
    const p = line.split('|');
    if (p[0] === 'HB') vHb.push([Number(p[1]), Number(p[2]), -1]);
    else if (p[0] === 'HBX' && vHb.length) vHb[vHb.length - 1]![2] = Number(p[1]);
  }

  // ---- JS 事件按 vanilla 口径过滤：AB 直对；HTRY 需扣除 oceanGate 顶层拒绝 ----
  const jsAb = evs.filter(e => e[0] === 'AB').map(e => [e[1], e[2], e[3], e[4]] as [number, number, number, number]);
  const oceanRejected = (x: number, y: number) => !(y > (gs.worldSurface + gs.rockLevel) / 2 + 40)
    && (x < gs.beachDistance || x > W - gs.beachDistance);
  const jsHb: Array<[number, number, number]> = [];
  for (const e of evs) {
    if (e[0] === 'HTRY' && !oceanRejected(e[1], e[2])) jsHb.push([e[1], e[2], e[4]]);
    if (e[0] === 'HDTRY') jsHb.push([e[1], e[2], e[4]]);   // 沙漠追加段（vanilla 尾段）
  }

  console.log(`vanilla AB=${vAb.length} HB=${vHb.length} | JS AB=${jsAb.length} HTRY(all)=${evs.filter(e => e[0] === 'HTRY').length} HB(非ocean)=${jsHb.length}`);
  console.log('gs.caveChestCount=' + gs.caveChestCount, 'underworldChestCount=' + gs.underworldChestCount, 'caveHouseCount=' + gs.caveHouseCount, 'desertHouseCount=' + gs.desertHouseCount);

  // ---- AB 段逐条对拍 ----
  let abFirst = -1;
  const abMax = Math.min(vAb.length, jsAb.length);
  for (let q = 0; q < abMax; q++) {
    const [vx, vy, vk, vr] = vAb[q]!;
    const [jx, jy, jk, jr] = jsAb[q]!;
    if (vx !== jx || vy !== jy || vr !== jr) { abFirst = q; break; }
  }
  console.log(`AB 段首分歧（含沙漠追加）：${abFirst < 0 ? `无（${abMax} 条全同）` : `#${abFirst} v=(${vAb[abFirst]}) j=(${jsAb[abFirst]})`}`);
  for (let q = Math.max(0, (abFirst < 0 ? abMax : abFirst) - 2); q < Math.min(abMax, (abFirst < 0 ? 0 : abFirst) + 6); q++) {
    console.log(`AB#${q} v(${vAb[q]}) j(${jsAb[q]})`);
  }
  const abRetDiff = [];
  for (let q = 0; q < abMax; q++) if (vAb[q]![3] !== jsAb[q]![3]) abRetDiff.push(q);
  console.log(`AB ret 差异数: ${abRetDiff.length} 首5: ${abRetDiff.slice(0, 5).map(q => `#${q} v(${vAb[q]![0]},${vAb[q]![1]})ret${vAb[q]![3]} j ret${jsAb[q]![3]}`).join(' ; ')}`);

  // ---- HB 段逐条对拍 ----
  let hbFirst = -1;
  for (let q = 0; q < Math.min(vHb.length, jsHb.length); q++) {
    if (vHb[q]![0] !== jsHb[q]![0] || vHb[q]![1] !== jsHb[q]![1] || vHb[q]![2] !== jsHb[q]![2]) { hbFirst = q; break; }
  }
  console.log(`HB 段首分歧：${hbFirst < 0 ? `无（${Math.min(vHb.length, jsHb.length)} 条全同）` : `#${hbFirst} v=(${vHb[hbFirst]}) j=(${jsHb[hbFirst]})`}`);
  for (let q = Math.max(0, (hbFirst < 0 ? Math.min(vHb.length, jsHb.length) : hbFirst) - 3); q < Math.min(vHb.length, jsHb.length, (hbFirst < 0 ? 0 : hbFirst) + 8); q++) {
    console.log(`HB#${q} v(${vHb[q]}) j(${jsHb[q]})`);
  }
  const hbRetDiff = [];
  for (let q = 0; q < Math.min(vHb.length, jsHb.length); q++) if (vHb[q]![2] !== jsHb[q]![2]) hbRetDiff.push(q);
  console.log(`HB ret 差异数: ${hbRetDiff.length}（前 10）:`);
  for (const q of hbRetDiff.slice(0, 10)) console.log(`  HB#${q} v(${vHb[q]}) j(${jsHb[q]})`);
}, 560_000);
