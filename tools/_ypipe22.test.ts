// 一次性（Y 批）：JS 管线 @22（Granite 末，FloatingIslands 重播点）全六通道 vs 真值
// /tmp/sw-ycal/van22/022_Granite.*——判定 @52 坡位残余 219 格（Marble/Granite 窗首写）
// 在 @22 时点是否已存在（marble/granite 自因）还是 @22 全等、由后续 pass 引入。
// SW_PARITY=1 npx vitest run tools/_ypipe22.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const TV = '/tmp/sw-ycal/van22';
const W = 4200, H = 1200, N = W * H;
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

(RUN ? it : it.skip)('pipeline @22 six-channel vs truth', async () => {
  const origReseed = RNG.prototype.reseed;
  let snap: { s: Uint8Array; h: Uint8Array; t: Uint16Array; a: Uint8Array; w: Uint16Array } | null = null;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    if (snap) return;
    try {
      const stackLine = (new Error().stack ?? '').split('\n')
        .find((l: string) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
      const mLoc = /\(.*(src\/[^\s?]+):(\d+):\d+\)/.exec(stackLine);
      if (!mLoc) return;
      const rel = mLoc[1]!.slice(mLoc[1]!.indexOf('src/'));
      const src = readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/game/${rel}`, 'utf8').split('\n');
      let label = '';
      for (let k = +mLoc[2]; k >= Math.max(0, +mLoc[2] - 2); k--) {
        const cm = /\/\/\s*▶([^\s(（]+)/.exec(src[k - 1] ?? '');
        if (cm) { label = cm[1]!; break; }
      }
      if (label !== 'FloatingIslands') return;
      // 通过闭包取 store：由外部注入
      const st = (globalThis as { __swPipeStore?: TileStore }).__swPipeStore;
      if (!st) return;
      snap = { s: st.slope.slice(), h: st.half.slice(), t: st.type.slice(), a: st.flags.slice(), w: st.wall.slice() };
      console.log('snapshot taken at FloatingIslands reseed (@22 end)');
    } catch { /* ignore */ }
  };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;
  let store: TileStore | null = null;
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w) => { if (!store) { store = w.store; (globalThis as { __swPipeStore?: TileStore }).__swPipeStore = w.store; } },
    });
  } catch (e) {
    console.log('GEN-EX(快照已取则不影响):', String(e).slice(0, 200));
  } finally {
    (RNG.prototype as { reseed: unknown }).reseed = origReseed;
    (globalThis as { __swPipeStore?: TileStore }).__swPipeStore = undefined;
  }
  if (!snap) { console.log('!! 未取到 @22 快照'); return; }
  const tT = new Uint16Array(readFileSync(`${TV}/022_Granite.typ`).buffer.slice(0));
  const tA = rd(`${TV}/022_Granite.act`);
  const tW = new Uint16Array(readFileSync(`${TV}/022_Granite.wal`).buffer.slice(0));
  const tS = rd(`${TV}/022_Granite.slope`);
  const tHf = rd(`${TV}/022_Granite.half`);
  let typ = 0, act = 0, wal = 0, slp = 0;
  const slpSamples: string[] = [];
  for (let i = 0; i < N; i++) {
    let jT = snap.t[i]!;
    if (jT !== 0) jT = SHEET[jT] ?? -1;
    if (jT !== tT[i]) typ++;
    if ((snap.a[i]! !== 0) !== (tA[i] !== 0)) act++;
    if (snap.w[i] !== tW[i]) wal++;
    const jsS = snap.s[i]! * 8 + snap.h[i]!, trS = tS[i]! * 8 + tHf[i]!;
    if (jsS !== trS) {
      slp++;
      if (slpSamples.length < 14) slpSamples.push(`(${i % W},${(i / W) | 0})js=s${snap.s[i]}h${snap.h[i]} tr=s${tS[i]}h${tHf[i]} t${jT}/${tT[i]}`);
    }
  }
  console.log(`@22 管线 vs 真值: typ=${typ} act=${act} wal=${wal} slope/half格=${slp}`);
  for (const s of slpSamples) console.log('  ', s);
}, 480000);
