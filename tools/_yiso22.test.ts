// 一次性（Y 批）：granite 隔离重放 ±真值 slope/half 输入注入——判定 7 格残余+掷差-3
// 是否为隔离环境缺坡位输入通道的伪影（CA 初值 res=solidTileAt?4:1 坡面敏感）。
// 真值源：/tmp/sw-ycal/van22/{021_Marble,022_Granite}.{typ,act,wal,liq,half,slope}
// SW_PARITY=1 npx vitest run tools/_yiso22.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runGranitePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const SEEDTXT = process.env.SW_SEED ?? '9293480';
const TV = '/tmp/sw-ycal/van22';
const W = 4200, H = 1200;
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const NAMES: Record<number, string> = { 21: 'Marble', 22: 'Granite' };

function buildStore(idx: number, withSlope: boolean) {
  const pre = `${TV}/${String(idx).padStart(3, '0')}_${NAMES[idx]!}`;
  const t = new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0));
  const a = rd(`${pre}.act`);
  const w = new Uint16Array(readFileSync(`${pre}.wal`).buffer.slice(0));
  const l = rd(`${pre}.liq`);
  const sl = withSlope ? rd(`${pre}.slope`) : null;
  const hf = withSlope ? rd(`${pre}.half`) : null;
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
    if (sl) { st.slope[i] = sl[i]!; st.half[i] = hf[i]!; }
  }
  return st;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

function diff(st: TileStore, idx: number, label: string, withSlopeCmp: boolean) {
  const pre = `${TV}/${String(idx).padStart(3, '0')}_${NAMES[idx]!}`;
  const t = new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0));
  const a = rd(`${pre}.act`);
  const w = new Uint16Array(readFileSync(`${pre}.wal`).buffer.slice(0));
  const l = rd(`${pre}.liq`);
  const tsl = withSlopeCmp ? rd(`${pre}.slope`) : null;
  const thf = withSlopeCmp ? rd(`${pre}.half`) : null;
  let typ = 0, act = 0, wal = 0, liq = 0, slp = 0;
  const samples: string[] = [];
  for (let i = 0; i < W * H; i++) {
    let jT = st.type[i];
    if (jT !== 0) jT = SHEET[jT] ?? -1;
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    const dS = tsl != null && (st.slope[i] !== tsl[i] || st.half[i] !== thf[i]);
    if (!(dT || dA || dW || dL || dS)) continue;
    if (dT) typ++; if (dA) act++; if (dW) wal++; if (dL) liq++; if (dS) slp++;
    if (samples.length < 8) samples.push(`(${i % W},${(i / W) | 0})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}w${st.wall[i]}>${w[i]}s${st.slope[i]}h${st.half[i]}`);
  }
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq} slope/half=${slp} | ${samples.join(' ')}`);
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const box = { n: 0 };
  for (const k of ['int', 'next', 'nextIntRange'] as const) {
    const orig = (rng[k] as (...a: number[]) => number).bind(rng);
    (rng[k] as unknown as (...a: number[]) => number) = (...a: number[]) => { box.n++; return orig(...a); };
  }
  return { rng, box };
}

(RUN ? it : it.skip)('granite isolated replay with/without true slope input', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: 0 });
  for (const withSlope of [false, true]) {
    const st = buildStore(21, withSlope);
    const { rng, box } = countedRng(rt.gs.seed);
    runGranitePass(st, rng, rt.gs);
    console.log(`[slopeIn=${withSlope}] draws=${box.n} (vanilla 78137, diff=${box.n - 78137})`);
    diff(st, 22, `  vs dump022 (slopeIn=${withSlope})`, false);
    if (withSlope) diff(st, 22, `  vs dump022+slope通道 (slopeIn=${withSlope})`, true);
  }
}, 240000);
