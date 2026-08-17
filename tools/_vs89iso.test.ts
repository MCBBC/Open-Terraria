// 一次性：s111 #89 Vines + #103 Stalac 隔离重放（x86 dump 真值输入直构 → pass → 对拍 dump 输出）。
//   #89: p88(Jungle Plants 末) → runVinesPass → p89(Vines 末)   vanilla N=150,316
//   #103: p102(Water Plants 末) → runGemTreesPass → p103(Stalac 末) vanilla N=6,124,309
// gs/GenSolid 捕获：真管线 seed=111 探针钩（__swVnCap/__swSpCap + snapshotGenSolid）。
// 用法：SW_VS89=1 npx vitest run tools/_vs89iso.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_VS89;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runVinesPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200;
const D = '/tmp/sw-tgt111c';
const VAN_N: Record<string, number> = { vines: 150316, stalac: 6124309 };

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

function buildStore(p: string): TileStore {
  const t = new Uint16Array(readFileSync(`${D}/${p}.typ`).buffer.slice(0));
  const a = readFileSync(`${D}/${p}.act`);
  const w = new Uint16Array(readFileSync(`${D}/${p}.wal`).buffer.slice(0));
  const l = readFileSync(`${D}/${p}.liq`);
  const lty = readFileSync(`${D}/${p}.lty`);
  const half = readFileSync(`${D}/${p}.half`);
  const slope = readFileSync(`${D}/${p}.slope`);
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? lty[i]! + 1 : 0;
    st.half[i] = half[i]!;
    st.slope[i] = slope[i]!;
  }
  return st;
}

function diff(st: TileStore, p: string, label: string) {
  const t = new Uint16Array(readFileSync(`${D}/${p}.typ`).buffer.slice(0));
  const a = readFileSync(`${D}/${p}.act`);
  const w = new Uint16Array(readFileSync(`${D}/${p}.wal`).buffer.slice(0));
  const l = readFileSync(`${D}/${p}.liq`);
  let typ = 0, act = 0, wal = 0, liq = 0;
  const pairs = new Map<string, number>();
  for (let i = 0; i < W * H; i++) {
    let jT = st.type[i];
    if (jT !== 0) jT = SHEET[jT] ?? -1;
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    if (!(dT || dA || dW || dL)) continue;
    if (dT) { typ++; pairs.set(`t${jT}>${t[i]}`, (pairs.get(`t${jT}>${t[i]}`) ?? 0) + 1); }
    if (dA) act++;
    if (dW) wal++;
    if (dL) liq++;
  }
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq}`);
  console.log('  pairs:', JSON.stringify([...pairs.entries()].sort((p2, q) => q[1] - p2[1]).slice(0, 10)));
  return { typ, act, wal, liq };
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
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

(RUN ? it : it.skip)('s111 #89 Vines + #103 Stalac isolated replay', async () => {
  const g0 = globalThis as Record<string, unknown>;
  let gsVn: GenState | null = null, gsSp: GenState | null = null;
  let solVn: Map<number, boolean> | null = null, solSp: Map<number, boolean> | null = null;
  g0.__swVnCap = (gs: GenState) => { if (!gsVn) { gsVn = cloneGs(gs); solVn = snapshotGenSolid(); } };
  g0.__swSpCap = (gs: GenState) => { if (!gsSp) { gsSp = cloneGs(gs); solSp = snapshotGenSolid(); } };
  try {
    await generateWorld({ size: 0, width: W, height: H, seedText: '111', evil: 0 } as Parameters<typeof generateWorld>[0]);
  } catch (e) { console.log('pipeline EX(忽略):', String(e).slice(0, 120)); }
  finally { g0.__swVnCap = undefined; g0.__swSpCap = undefined; }
  if (!gsVn || !gsSp || !solVn || !solSp) throw new Error('gs capture failed');

  // ── #89 Vines ──
  {
    const st = buildStore('p88');
    restoreGenSolid(solVn);
    const { rng, box } = countedRng(gsVn.seed);
    runVinesPass(st, rng, gsVn);
    console.log(`Vines draws=${box.n} (vanilla ${VAN_N.vines}, diff=${box.n - VAN_N.vines})`);
    diff(st, 'p89', 'VINES vs p89');
    // 首个缺失 444（vanilla 有 js 无）定位 + 输入态上下文
    {
      const t88 = new Uint16Array(readFileSync(`${D}/p88.typ`).buffer.slice(0));
      const a88 = readFileSync(`${D}/p88.act`);
      const w88 = new Uint16Array(readFileSync(`${D}/p88.wal`).buffer.slice(0));
      const t89 = new Uint16Array(readFileSync(`${D}/p89.typ`).buffer.slice(0));
      const a89 = readFileSync(`${D}/p89.act`);
      let shown = 0;
      for (let y = 300; y < 1100 && shown < 3; y++) for (let x = 5; x < W - 5 && shown < 3; x++) {
        const i = y * W + x;
        if (a89[i] && t89[i] === 444 && !(st.flags[i] && SHEET[st.type[i]] === 444)) {
          console.log(`缺失 444 @(${x},${y})`);
          for (let dy = -2; dy <= 3; dy++) {
            const row: string[] = [];
            for (let dx = -3; dx <= 4; dx++) {
              const j = (y + dy) * W + (x + dx);
              const inp = `t${t88[j]}${a88[j] ? '' : '⁻'}W${w88[j]}`;
              const van = a89[j] ? `t${t89[j]}` : '·';
              const js = st.flags[j] ? `t${SHEET[st.type[j]]}` : '·';
              row.push(`${inp}|v${van}|j${js}`);
            }
            console.log('   ' + row.join(' '));
          }
          shown++;
        }
      }
    }
  }
  // ── #103 Stalac ──
  {
    const st = buildStore('p102');
    const t102 = new Uint16Array(readFileSync(`${D}/p102.typ`).buffer.slice(0));
    const a102 = readFileSync(`${D}/p102.act`);
    restoreGenSolid(solSp);
    const { rng, box } = countedRng(gsSp.seed);
    runGemTreesPass(st, rng, gsSp);
    console.log(`Stalac draws=${box.n} (vanilla ${VAN_N.stalac}, diff=${box.n - VAN_N.stalac})`);
    diff(st, 'p103', 'STALAC vs p103');
    // 放置序列对拍（扫描序 x 外/y 内，列内先地下(y≥ws)后地表(k<ws)）
    const key = (x: number, y: number, surf: boolean) => x * 100000 + (surf ? 10000 : 0) + y;
    const vanP: Array<[number, number, boolean]> = [];
    const t103 = new Uint16Array(readFileSync(`${D}/p103.typ`).buffer.slice(0));
    const a103 = readFileSync(`${D}/p103.act`);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const isNew = a103[i] && t103[i] === 165 && !(a102[i] && t102[i] === 165);
      if (isNew) vanP.push([x, y, y < 337]);
    }
    const jsP: Array<[number, number, boolean]> = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const isNew = (st.flags[i] !== 0) && SHEET[st.type[i]] === 165 && !(a102[i] && t102[i] === 165);
      if (isNew) jsP.push([x, y, y < 337]);
    }
    vanP.sort((p2, q) => key(...p2) - key(...q));
    jsP.sort((p2, q) => key(...p2) - key(...q));
    console.log(`放置序列: js=${jsP.length} van=${vanP.length}`);
    // 按「放置组」对齐：双格组=同 x 相邻 y；单格=孤立。粗对齐：逐组比（x 起点）
    const groups = (arr: Array<[number, number, boolean]>) => {
      const out: Array<[number, number, number]> = []; // x, yFirst, len
      for (const [x, y, s] of arr) {
        const last = out[out.length - 1];
        if (last && last[0] === x && y - (last[1] + last[2] - 1) === 0) last[2]++;
        else out.push([x, y, 1]);
      }
      return out;
    };
    const vg = groups(vanP), jg = groups(jsP);
    console.log(`组数: js=${jg.length} van=${vg.length}`);
    let firstBad = -1;
    for (let k = 0; k < Math.max(vg.length, jg.length); k++) {
      const a = jg[k], b = vg[k];
      if (!a || !b || a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) { firstBad = k; break; }
    }
    console.log(`首个分歧组 idx=${firstBad}: js=${JSON.stringify(jg.slice(Math.max(0, firstBad - 2), firstBad + 3))} van=${JSON.stringify(vg.slice(Math.max(0, firstBad - 2), firstBad + 3))}`);
  }
}, 480000);
