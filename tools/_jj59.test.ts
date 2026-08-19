// JJJJ 批一次性探针：m/s 链 #59 Buried_Chests 定量 + 归因。
// 真链跑到 ▶UndergroundHousesAndBuriedChests（快照输入=应与 dump058 全同）与
// ▶SurfaceChests（快照输出=对拍 dump059）——差格逐位记录（含 v058/v059/jsIn/jsOut
// 四态分类），并采集小屋事件流（__swHouseEv）与阶段流（__swHouseStage）。
// 用法：cd game && SW_JJ=59 SW_JJ_SEED=20260811 SW_JJ_EVIL=0 SW_JJ_W=6400 SW_JJ_H=1800 \
//   SW_JJ_G2=/tmp/sw-slp/g-m20260811 SW_JJ_TAG=m npx vitest run tools/_jj59.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_JJ === '59';
const G2 = process.env.SW_JJ_G2 ?? '/tmp/sw-slp/g-s22222';
const SEED = process.env.SW_JJ_SEED ?? '22222';
const EVIL = Number(process.env.SW_JJ_EVIL ?? 0);
const W = Number(process.env.SW_JJ_W ?? 4200), H = Number(process.env.SW_JJ_H ?? 1200), N = W * H;
const TAG = process.env.SW_JJ_TAG ?? 's';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));

interface Snap { flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array }
const snapOf = (w: { store: { flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array } }): Snap => ({
  flags: w.store.flags.slice(), type: w.store.type.slice(), wall: w.store.wall.slice(),
  liquid: w.store.liquid.slice(), liquidType: w.store.liquidType.slice(),
  half: w.store.half.slice(), slope: w.store.slope.slice(), wire: w.store.wire.slice(),
});

interface GCh { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
const gch = (idx: number): GCh => ({
  t: le16(gPath(idx, 'typ')), a: b8(gPath(idx, 'act')), w: le16(gPath(idx, 'wal')),
  l: b8(gPath(idx, 'liq')), hf: b8(gPath(idx, 'half')), sl: b8(gPath(idx, 'slope')),
  lt: b8(gPath(idx, 'lty')), ia: b8(gPath(idx, 'inact')),
});

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

const SENTINEL = Symbol('jj59-done');

(RUN ? it : it.skip)(`#59 quantify ${TAG}`, async () => {
  const houseEv: string[] = [];
  const houseStage: string[] = [];
  (globalThis as { __swHouseEv?: (p: string, x: number, y: number) => void }).__swHouseEv
    = (p, x, y) => { houseEv.push(`${p} ${x} ${y}`); };
  (globalThis as { __swHouseStage?: (t: string, a: number, b: number, c: number, d: number) => void }).__swHouseStage
    = (t, a, b, c, d) => { houseStage.push(`${t} ${a} ${b} ${c} ${d}`); };

  let jsIn: Snap | null = null;
  let jsOut: Snap | null = null;
  let curStore: { store: { flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array } } | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_jj59')) {
        const lab = labelOf(m[1], Number(m[2]));
        if (curStore) {
          if (lab === 'UndergroundHousesAndBuriedChests' && !jsIn) jsIn = snapOf(curStore);
          else if (lab === 'SurfaceChests' && !jsOut) { jsOut = snapOf(curStore); throw SENTINEL; }
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w) => { if (!curStore) curStore = w as never; },
    });
  } catch (e) { if (e !== SENTINEL) throw e; }
  finally { RNGp.reseed = oReseed; }

  if (!jsIn || !jsOut) throw new Error('未捕获 #59 边界（jsIn/jsOut null）');
  writeFileSync(`/tmp/jj59-${TAG}-house.txt`, houseEv.join('\n') + '\n');
  writeFileSync(`/tmp/jj59-${TAG}-stage.txt`, houseStage.join('\n') + '\n');
  console.log(`house events=${houseEv.length} stages=${houseStage.length} gen=${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // ---- 输入对拍 dump058 ----
  const g58 = gch(58), g59 = gch(59);
  let inDiff = 0;
  for (let i = 0; i < N && inDiff < 50; i++) {
    if (g58.a[i] !== (jsIn.flags[i]! & 1)) inDiff++;
  }
  console.log(`input(058) 前 50 差扫描: ${inDiff}${inDiff ? ' ⚠输入已脏' : ' ✓'}`);

  // ---- 输出对拍 dump059：差格全量记录 ----
  const cells: Array<{ i: number; x: number; y: number; ch: string; v58: string; v59: string; ji: string; jo: string }> = [];
  let dA = 0, dT = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0, dIa = 0;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const x = i % W, y = Math.floor(i / W);
    const va = g59.a[i]!, ja = jsOut.flags[i]! & 1;
    if (va !== ja) { dA++; if (cells.length < 6000) cells.push({ i, x, y, ch: 'A', v58: String(g58.a[i]), v59: String(va), ji: String(jsIn.flags[i]! & 1), jo: String(ja) }); }
    const vt = va ? g59.t[i]! : 0;
    const jt = ja ? (SHEET[jsOut.type[i]!] >= 0 ? SHEET[jsOut.type[i]!]! : 9999) : 0;
    if (vt !== jt) {
      dT++; pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1);
      const vt58 = g58.a[i] ? g58.t[i]! : 0;
      const jtIn = jsIn.flags[i]! & 1 ? (SHEET[jsIn.type[i]!] >= 0 ? SHEET[jsIn.type[i]!]! : 9999) : 0;
      if (cells.length < 6000) cells.push({ i, x, y, ch: 'T', v58: String(vt58), v59: String(vt), ji: String(jtIn), jo: String(jt) });
    }
    if (g59.w[i]! !== jsOut.wall[i]!) { dW++; if (cells.length < 6000) cells.push({ i, x, y, ch: 'W', v58: String(g58.w[i]), v59: String(g59.w[i]), ji: String(jsIn.wall[i]), jo: String(jsOut.wall[i]) }); }
    if (g59.l[i]! !== jsOut.liquid[i]!) { dL++; if (cells.length < 6000) cells.push({ i, x, y, ch: 'L', v58: String(g58.l[i]), v59: String(g59.l[i]), ji: String(jsIn.liquid[i]), jo: String(jsOut.liquid[i]) }); }
    const vl = g59.l[i]! > 0 ? g59.lt[i]! + 1 : 0;
    const jl = jsOut.liquid[i]! > 0 ? jsOut.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; if (cells.length < 6000) cells.push({ i, x, y, ch: 'Y', v58: String(g58.l[i]! > 0 ? g58.lt[i]! + 1 : 0), v59: String(vl), ji: String(jsIn.liquid[i]! > 0 ? jsIn.liquidType[i]! : 0), jo: String(jl) }); }
    if (g59.hf[i]! !== jsOut.half[i]!) { dHf++; if (cells.length < 6000) cells.push({ i, x, y, ch: 'H', v58: String(g58.hf[i]), v59: String(g59.hf[i]), ji: String(jsIn.half[i]), jo: String(jsOut.half[i]) }); }
    if (g59.sl[i]! !== jsOut.slope[i]!) { dSl++; if (cells.length < 6000) cells.push({ i, x, y, ch: 'S', v58: String(g58.sl[i]), v59: String(g59.sl[i]), ji: String(jsIn.slope[i]), jo: String(jsOut.slope[i]) }); }
    const via = g59.ia[i]! ? 1 : 0;
    const jia = (jsOut.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; if (cells.length < 6000) cells.push({ i, x, y, ch: 'I', v58: String(g58.ia[i]), v59: String(via), ji: String((jsIn.wire[i]! >>> 5) & 1), jo: String(jia) }); }
  }
  console.log(`#59 输出对拍: A=${dA} T=${dT} W=${dW} L=${dL} Y=${dLt} Hf=${dHf} Sl=${dSl} Ia=${dIa}`);
  console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  // 每通道差格的 bbox 聚簇（前后 200 格内归同簇）
  const byCh = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    const va = g59.a[i]!, ja = jsOut.flags[i]! & 1;
    if (va !== ja) { const a = byCh.get('A') ?? []; a.push(i); byCh.set('A', a); continue; }
    const vt = va ? g59.t[i]! : 0;
    const jt = ja ? (SHEET[jsOut.type[i]!] >= 0 ? SHEET[jsOut.type[i]!]! : 9999) : 0;
    if (vt !== jt) { const a = byCh.get('T') ?? []; a.push(i); byCh.set('T', a); }
  }
  const clusters: Record<string, Array<{ x0: number; y0: number; x1: number; y1: number; n: number; kinds: string }>> = {};
  for (const [ch, arr] of byCh) {
    const out: Array<{ x0: number; y0: number; x1: number; y1: number; n: number; kinds: string }> = [];
    for (const i of arr) {
      const x = i % W, y = Math.floor(i / W);
      const last = out[out.length - 1];
      const kind = ch === 'T' ? `t${g59.a[i] ? g59.t[i] : 0}>${jsOut.flags[i]! & 1 ? SHEET[jsOut.type[i]!]! : 0}` : 'a';
      if (last && x <= last.x1 + 40 && y <= last.y1 + 40 && y >= last.y0 - 40) {
        last.x0 = Math.min(last.x0, x); last.x1 = Math.max(last.x1, x);
        last.y0 = Math.min(last.y0, y); last.y1 = Math.max(last.y1, y);
        last.n++;
        if (!last.kinds.includes(kind)) last.kinds += ` ${kind}`;
      } else out.push({ x0: x, y0: y, x1: x, y1: y, n: 1, kinds: kind });
    }
    clusters[ch] = out;
    console.log(`${ch} 簇 ${out.length}: ${out.slice(0, 40).map((c) => `(${c.x0}-${c.x1},${c.y0}-${c.y1})n${c.n}[${c.kinds}]`).join(' ')}`);
  }
  writeFileSync(`/tmp/jj59-${TAG}-diff.json`, JSON.stringify({
    seed: SEED, w: W, h: H, evil: EVIL, counts: { dA, dT, dW, dL, dLt, dHf, dSl, dIa },
    pairs: [...pair.entries()].sort((a, b) => b[1] - a[1]),
    inDiff, cells, clusters,
  }));
  console.log(`→ /tmp/jj59-${TAG}-diff.json (cells=${cells.length}) done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
