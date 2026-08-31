// IIII84 批（GFB-D 双刀·刀②）一次性仪：uwtail 反演重放 × LiquidSim 盒迹对拍。
// 相 1 全管线跑到 UW 头捕获（i87Cap 同位）；相 2 dump27(带帧基座) 单跑
// Underworld+remix mound+hellFort+drunk ashTrees，每 UpdateLiquid 尾由
// LiquidSim.liqBoxSink 差分记盒内液变（与 x86 rig SW_LIQBOX="x0,x1,y0,y1" 的
// "it <iter> (x,y) L<a>-><b> T<c>-><d>" 行同格式，it 序独立从 1 起）。
// 用法：cd game && SW_III88UW=1 npx vitest run tools/_iii88uw.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runUnderworldPass, underworldAshGrassTrees, generateUnderworldStartingMound } from '../src/world/gen/vanilla/UnderworldPass';
import type { ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = !!process.env.SW_III88UW;
const G2 = process.env.SW_III88_G2 ?? '/tmp/iii85-out/x86-gfb-c';
const SEED = process.env.SW_III88_SEED ?? '9293480';
const W = Number(process.env.SW_III88_W ?? 4200), H = Number(process.env.SW_III88_H ?? 1200);
const N = W * H;
const OUT = process.env.SW_III88_BOXOUT ?? '/tmp/iii88-out/liqbox-js.txt';
const BOX = process.env.SW_III88_LIQBOX ?? '1650,1720,695,775'; // x0,x1,y0,y1（与 rig 同序）

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_III88_FLAGS
  ?? 'everything,remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld')
  .split(',').filter(Boolean)) {
  M8_FLAGS[f] = true;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

function chOf(idx: number, nm: string) {
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
  const rd = (p: string) => readFileSync(p);
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  let frames = false;
  try { readFileSync(`${pre}.frx`); frames = true; } catch { /* 无帧链 */ }
  return {
    t: le16(`${pre}.typ`), a: rd(`${pre}.act`), w: le16(`${pre}.wal`), l: rd(`${pre}.liq`),
    hf: rd(`${pre}.half`), sl: rd(`${pre}.slope`), lt: rd(`${pre}.lty`), ia: rd(`${pre}.inact`),
    ...(frames ? { frx: le16(`${pre}.frx`), fry: le16(`${pre}.fry`) } : {}),
  };
}
function loadStore(c: ReturnType<typeof chOf>): TileStore {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(c.t[i]) ?? 0;
    st.flags[i] = c.a[i] ? 1 : 0;
    st.wall[i] = c.w[i];
    st.liquid[i] = c.l[i];
    st.liquidType[i] = (c.l[i] > 0 || c.lt[i] > 0) ? c.lt[i] + 1 : 0;
    st.half[i] = c.hf[i];
    st.slope[i] = c.sl[i];
    if (c.frx && c.fry) { st.frameX[i] = c.frx[i]; st.frameY[i] = c.fry[i]; }
    if (c.ia[i]) st.wire[i] |= 32;
  }
  return st;
}

interface Cap { gs: GenState; chests: ChestSink }

(RUN ? it : it.skip)('IIIII84 GFB-D 刀② uwtail 盒迹重放', async () => {
  console.log(`uwtail box=${BOX} G2=${G2} seed=${SEED}`);
  // ── 相 1：管线捕获 @UW 头 ──
  let cap: Cap | null = null;
  {
    (globalThis as unknown as {
      __swI87Cap?: (st: unknown, g: unknown, ch: unknown) => void;
    }).__swI87Cap = (_stRaw, gRaw, chRaw) => {
      cap = { gs: structuredClone(gRaw as GenState), chests: JSON.parse(JSON.stringify(chRaw ?? [])) };
      delete (globalThis as unknown as { __swI87Cap?: unknown }).__swI87Cap;
      const e = new Error('SW_ABORT');
      (e as Error & { swAbort?: boolean }).swAbort = true;
      throw e;
    };
    try {
      await generateWorld({
        width: W, height: H, seedText: SEED, evil: 0,
        seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
        onProgress: () => {},
      });
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('SW_ABORT')) throw e;
    }
    if (!cap) throw new Error('capture failed @UW');
  }
  const gsc = cap.gs;

  // ── 相 2：dump27 基座单跑 uwtail ──
  const baseX = chOf(27, 'Webs');
  const st = loadStore(baseX);
  let preSnap: Record<string, unknown> | null = null;
  if (CHG()) preSnap = snapAll(st);

  // 盒迹差分仪（rig BoxDiff 同构）
  const [bx0, bx1, by0, by1] = BOX.split(',').map(Number);
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
  const snapL = new Uint8Array(bw * bh), snapT = new Uint8Array(bw * bh);
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const i = st.idx(x, y);
      snapL[(y - by0) * bw + (x - bx0)] = st.liquid[i];
      snapT[(y - by0) * bw + (x - bx0)] = st.liquidType[i];
    }
  }
  let iter = 0;
  const lines: string[] = ['---START'];
  mkdirSync('/tmp/iii88-out', { recursive: true });
  LiquidSim.liqBoxSink = (storeRaw) => {
    const s2 = storeRaw as TileStore;
    iter++;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const i = s2.idx(x, y);
        const k = (y - by0) * bw + (x - bx0);
        const nl = s2.liquid[i], nt = Math.max(0, s2.liquidType[i] - 1) & 255;
        if (nl !== snapL[k] || nt !== snapT[k]) {
          lines.push(`it ${iter} (${x},${y}) L${snapL[k]}->${nl} T${snapT[k]}->${nt}`);
          snapL[k] = nl; snapT[k] = nt;
        }
      }
    }
  };

  function CHG(): boolean { return false; }
  function snapAll(s2: TileStore): Record<string, unknown> { void s2; return {}; }
  void preSnap;

  const rng = new RNG(gsc.seed);
  try {
    runUnderworldPass(st, rng, gsc!);
    if (!!gsc!.seedFlags.remix) generateUnderworldStartingMound(st, rng, gsc!);
    else if (!gsc!.seedFlags.drunkWorld) underworldAshGrassTrees(st, rng, gsc!, false);
    {
      const m = await import('../src/world/gen/vanilla/HellFortPass');
      m.runHellFortPass(st, rng, gsc!, undefined, cap!.chests);
    }
    if (gsc!.seedFlags.drunkWorld) underworldAshGrassTrees(st, rng, gsc!, true);
    // ── 刀② finalize 合并扫描复演（WorldGen.cs:22639-50 口径）+ 三格事件流 ──
    const evs: string[] = [];
    (globalThis as unknown as { __swI87K?: ((ev: string, x: number, y: number) => void) | undefined }).__swI87K =
      (ev, x, y) => { if (x >= bx0 - 25 && x <= bx1 + 25 && y >= by0 - 25 && y <= by1 + 25) evs.push(`${ev}@${x},${y}`); };
    const trioState = (): string => [[1682, 730], [1681, 731], [1682, 731]].map(([x, y]) => {
      const i = st.idx(x, y);
      return `(${x},${y}) act=${st.flags[i] & 1} sheet=${SHEET[st.type[i]]} l=${st.liquid[i]} ty${st.liquidType[i]}`;
    }).join(' | ');
    console.log('[pre-scan]', trioState());
    {
      const rows: string[] = [];
      for (let y = 726; y <= 736; y++) {
        let r = `y${y}: `;
        for (let x = 1677; x <= 1691; x++) {
          const i = st.idx(x, y);
          const sheet = SHEET[st.type[i]];
          r += `${sheet >= 100 ? String(sheet).slice(0, 3) : String(sheet).padStart(3)}/a${st.flags[i] & 1}/l${String(st.liquid[i]).padStart(3)}/t${st.liquidType[i] - 1} `;
        }
        rows.push(r);
        console.log(rows.at(-1));
      }
      void rows;
    }
    console.log('[evs-in-box pre]', evs.length);
    const settleMod = await import('../src/world/liquid/settle');
    settleMod.finalGenMergeScan(st);
    console.log('[post-scan]', trioState());
    console.log(`[evs-in-box total]=${evs.length}`);
    for (const e of evs.slice(0, 40)) console.log('  ', e);
    delete (globalThis as unknown as { __swI87K?: unknown }).__swI87K;
  } finally {
    LiquidSim.liqBoxSink = null;
    lines.push('---END');
    writeFileSync(OUT, lines.join('\n') + '\n');
    console.log(`[liqbox] iters=${iter} lines=${lines.length} -> ${OUT}`);
    // 三格现场
    const IO = (x: number, y: number): string => {
      const i = st.idx(x, y);
      return `(${x},${y}) sheet=${SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 'x' + st.type[i]} act=${st.flags[i] & 1}`
        + ` w${st.wall[i]} l${st.liquid[i]} ty${st.liquidType[i]}`;
    };
    for (const [x, y] of [[1682, 730], [1681, 731], [1682, 731]]) console.log('[trio]', IO(x, y));
  }
}, 900_000);

import { LiquidSim } from '../src/world/liquid/LiquidSim';
