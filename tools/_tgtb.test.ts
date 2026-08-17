// 三大差异对边界对拍（s111）：JS reseed 事件快照 ↔ x86 SW_GRID_DUMP 真值（/tmp/sw-tgt111/p*）。
// 每边界输出：目标 tile（51/165/62/638/633）两侧计数 + JS-only/van-only 格数 + 全局 typ/act 差。
// 用法：SW_TGTB=1 [SW_TGTB_EV=31:p26,...] npx vitest run tools/_tgtb.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_TGTB;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const SEED = process.env.SW_TGTB_SEED ?? '111';
const W = 4200, H = 1200, N = W * H;
const VDIR = process.env.SW_TGTB_DIR ?? '/tmp/sw-tgt111';
const EV2P: Record<number, string> = {};
for (const part of (process.env.SW_TGTB_EV ?? '31:p26,32:p27,33:p28,82:p70,99:p85,103:p88,104:p89,115:p102,116:p103,119:p105').split(',')) {
  const [e, p] = part.split(':');
  EV2P[+e] = p;
}
const SHEETS = [51, 165, 62, 638, 633];

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const want = (s: number): boolean => SHEETS.includes(s);

function loadVan(p: string): { typ: Uint16Array; act: Uint8Array } {
  const typB = readFileSync(`${VDIR}/${p}.typ`);
  const act = readFileSync(`${VDIR}/${p}.act`);
  return { typ: new Uint16Array(typB.buffer, typB.byteOffset, N), act };
}
/** 扩展通道对拍：half/slope 直比；lty 原版 0/1/2/3 ↔ 本仓 +1 */
function vanExt(p: string): { half?: Buffer; slope?: Buffer; lty?: Buffer } {
  const out: { half?: Buffer; slope?: Buffer; lty?: Buffer } = {};
  try { out.half = readFileSync(`${VDIR}/${p}.half`); } catch { /* */ }
  try { out.slope = readFileSync(`${VDIR}/${p}.slope`); } catch { /* */ }
  try { out.lty = readFileSync(`${VDIR}/${p}.lty`); } catch { /* */ }
  return out;
}

interface Res {
  ev: number; p: string; totJs: number[]; totVan: number[];
  onlyJs: number[]; onlyVan: number[]; typDiff: number; actDiff: number;
  pairSamples: string[];
}

(RUN ? it : it.skip)(`boundary compare seed=${SEED}`, async () => {
  const vans = new Map<string, { typ: Uint16Array; act: Uint8Array }>();
  const results: Res[] = [];
  let store: { type: Uint16Array; flags: Uint8Array; w: number; h: number } | null = null;
  let evN = 0;
  const compare = (ev: number): void => {
    const p = EV2P[ev];
    if (!p || !store) return;
    let van = vans.get(p);
    if (!van) { van = loadVan(p); vans.set(p, van); }
    const { type, flags } = store;
    const totJs = new Array(SHEETS.length).fill(0), totVan = new Array(SHEETS.length).fill(0);
    const onlyJs = new Array(SHEETS.length).fill(0), onlyVan = new Array(SHEETS.length).fill(0);
    let typDiff = 0, actDiff = 0;
    const pairSamples: string[] = [];
    for (let i = 0; i < N; i++) {
      const aJ = flags[i] & 1, aV = van.act[i];
      let tJ = aJ ? SHEET[type[i]] : -1;
      const tV = aV ? van.typ[i] : -1;
      if (aJ && want(tJ)) totJs[SHEETS.indexOf(tJ)]++;
      if (aV && want(tV)) totVan[SHEETS.indexOf(tV)]++;
      if (aJ !== aV) actDiff++;
      if (tJ !== tV) {
        typDiff++;
        if (aJ !== aV && pairSamples.length < 8) pairSamples.push(`(${i % W},${(i / W) | 0}) t${tJ}>${tV} a${aJ}>${aV}`);
      }
      if (aJ !== aV) {
        if (aJ && want(tJ)) onlyJs[SHEETS.indexOf(tJ)]++;
        if (aV && want(tV)) onlyVan[SHEETS.indexOf(tV)]++;
      }
    }
    results.push({ ev, p, totJs, totVan, onlyJs, onlyVan, typDiff, actDiff, pairSamples });
    // 扩展通道（half/slope/lty）
    const ext = vanExt(p);
    const st = store as unknown as { half: Uint8Array; slope: Uint8Array; liquidType: Uint8Array };
    if (ext.half) {
      let dh = 0, ds = 0, dl = 0;
      const liq = (store as unknown as { liquid: Uint8Array }).liquid;
      for (let i = 0; i < N; i++) {
        if (st.half[i] !== ext.half[i]) dh++;
        if (st.slope[i] !== ext.slope![i]) ds++;
        if (liq[i] > 0 && st.liquidType[i] - 1 !== ext.lty![i]) dl++;
      }
      console.log(`  [ext ev${ev}:${p}] halfDiff=${dh} slopeDiff=${ds} ltyDiff(liq>0)=${dl}`);
    }
  };
  const origReseed = RNG.prototype.reseed;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    if (EV2P[evN]) {
      const stackLine = (new Error().stack ?? '').split('\n')
        .find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
      const fn = /at\s+(?:async\s+)?(\S+)\s+\(/.exec(stackLine)?.[1] ?? '?';
      compare(evN);
      console.log(`[ev${evN} → ${EV2P[evN]}] via ${fn.includes('generateWorld') ? 'HEAD' : 'INT'}`);
    }
    evN++;
  };
  (RNG.prototype as unknown as { reseed: unknown }).reseed = onReseed;
  try {
    const world = await generateWorld({
      size: 0, width: W, height: H, seedText: SEED, evil: 0,
      onWorldPartial: (w) => { store = w.store; },
    } as Parameters<typeof generateWorld>[0]);
    store = world.store;
  } finally {
    (RNG.prototype as unknown as { reseed: unknown }).reseed = origReseed;
  }
  compare(evN); // FINAL
  console.log(`\n==== 边界对拍（seed=${SEED}；格式 evN:vanP | 各列=JS计/van计 | onlyJs/onlyVan=活性差格）====`);
  console.log(`evN:vanP     ${SHEETS.map((s) => `t${s} js/van      `).join(' ')} | globalTypDiff globalActDiff`);
  for (const r of results) {
    const cell = (k: number) => `${String(r.totJs[k]).padStart(6)}/${String(r.totVan[k]).padStart(6)}${r.onlyJs[k] || r.onlyVan[k] ? `(${r.onlyJs[k]}^/${r.onlyVan[k]}v)` : '      '}`;
    console.log(`${String(r.ev).padStart(3)}:${r.p.padEnd(4)} ${SHEETS.map((_, k) => cell(k)).join(' ')} | ${r.typDiff} ${r.actDiff}`);
    if (r.pairSamples.length) console.log(`      actDiff samples: ${r.pairSamples.slice(0, 4).join(' ')}`);
  }
}, 480000);
