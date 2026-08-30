// IIII84 批（GFB-D 双刀·刀①）一次性仪：Dungeon pass 反演重放 + SpreadWallDungeon
// BOX/SPR 全调用量测流（与 x86 rig61 SW_WVLOG 同格式，BOX|i|j|n2|n3|n4 + SPR|j|x|y|wt|vis|ch|chS|rjSelf|rjOther|rjCG）。
// 骨架承 tools/_iii87win.test.ts（III I82 批带帧基座两相制）；本仪仅 seg=dungeon。
// 用法：cd game && SW_III88=1 npx vitest run tools/_iii88dg.test.ts
//   可选 env：SW_III88_G2(真值链,缺省 /tmp/iii85-out/x86-gfb-c) /
//     SW_III88_OUT(wv 行落盘,缺省 /tmp/iii88-out/wv-js-dg.log) /
//     SW_III88_ROW(diff row json) / SW_III88_CHG=1(jaccard)
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import type { ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = !!process.env.SW_III88;
const G2 = process.env.SW_III88_G2 ?? '/tmp/iii85-out/x86-gfb-c';
const SEED = process.env.SW_III88_SEED ?? '9293480';
const EVIL = Number(process.env.SW_III88_EVIL ?? 0);
const W = Number(process.env.SW_III88_W ?? 4200), H = Number(process.env.SW_III88_H ?? 1200);
const N = W * H;
const OUTWV = process.env.SW_III88_OUT ?? '/tmp/iii88-out/wv-js-dg.log';
const OUTROW = process.env.SW_III88_ROW ?? '/tmp/iii88-out/win-dg-r0.json';
const CHG = process.env.SW_III88_CHG === '1';

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

interface Ch {
  t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
  frx?: Uint16Array; fry?: Uint16Array;
}
function chOf(idx: number, nm: string): Ch {
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
  const rd = (p: string) => readFileSync(p);
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  let frames = false;
  try { readFileSync(`${pre}.frx`); frames = true; } catch { /* 老格式链无帧 */ }
  const c: Ch = {
    t: le16(`${pre}.typ`), a: rd(`${pre}.act`), w: le16(`${pre}.wal`), l: rd(`${pre}.liq`),
    hf: rd(`${pre}.half`), sl: rd(`${pre}.slope`), lt: rd(`${pre}.lty`), ia: rd(`${pre}.inact`),
    ...(frames ? { frx: le16(`${pre}.frx`), fry: le16(`${pre}.fry`) } : {}),
  };
  return c;
}
function loadStore(c: Ch): TileStore {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(c.t[i]) ?? 0;
    st.flags[i] = c.a[i] ? 1 : 0;
    st.wall[i] = c.w[i];
    st.liquid[i] = c.l[i];
    // ★IIIII84：ghost 液型位保真——vanilla tile.lq==0 时 lava/honey 型位可残留
    //   （写面不	types 清除），engine 消费端读 liquidType 判型；loader 曾按 l>0 门
    //   清零 → 与 x86 管线状态微差。约定：liquid>0 ⇒ 恒 +1（水型 0 基→1）；干格仅
    //   在 lt>0 时保留 +1 幽灵位。
    st.liquidType[i] = (c.l[i] > 0 || c.lt[i] > 0) ? c.lt[i] + 1 : 0;
    st.half[i] = c.hf[i];
    st.slope[i] = c.sl[i];
    if (c.frx && c.fry) { st.frameX[i] = c.frx[i]; st.frameY[i] = c.fry[i]; }
    if (c.ia[i]) st.wire[i] |= 32;
  }
  return st;
}
interface StoreView {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  frameX?: Uint16Array; frameY?: Uint16Array;
}
function jsSheet(st: StoreView, i: number): number {
  if (!st.flags[i]) return 0;
  return SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999;
}
interface DiffRow {
  tag: string; dA: number; dT: number; dW: number; dL: number; dHf: number;
  dSl: number; dLt: number; dIa: number; first: string;
  pairs: Array<[string, number]>; cells: Array<[number, number]>; regions: Array<[string, number]>;
}
function diffBoard(tag: string, xs: Ch, st: StoreView, cellCap = 30): DiffRow {
  const chs = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0 };
  const pair = new Map<string, number>();
  const reg = new Map<string, number>();
  const cells: Array<[number, number]> = [];
  let first = '';
  for (let i = 0; i < N; i++) {
    const va = xs.a[i], ja = st.flags[i] & 1;
    let bad = false;
    if (va !== ja) { chs.dA++; bad = true; }
    const vt = va ? xs.t[i] : 0, jt = ja ? jsSheet(st, i) : 0;
    if (vt !== jt) {
      chs.dT++; bad = true;
      pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1);
    }
    if (xs.w[i] !== st.wall[i]) {
      chs.dW++; bad = true;
      pair.set(`W${xs.w[i]}>${st.wall[i]}`, (pair.get(`W${xs.w[i]}>${st.wall[i]}`) ?? 0) + 1);
    }
    if (xs.l[i] !== st.liquid[i]) {
      chs.dL++; bad = true;
      pair.set(`L${xs.l[i]}>${st.liquid[i]}`, (pair.get(`L${xs.l[i]}>${st.liquid[i]}`) ?? 0) + 1);
    }
    if (xs.hf[i] !== st.half[i]) { chs.dHf++; bad = true; }
    if (xs.sl[i] !== st.slope[i]) { chs.dSl++; bad = true; }
    if ((xs.ia[i] ? 1 : 0) !== ((st.wire[i] >>> 5) & 1)) { chs.dIa++; bad = true; }
    // ★classic 门（与 mile8 同口径：仅 liquid>0 格裁决 Lt）——ghost 位不入账，
    //   但 loader 已保留供 pass 内消费端语义使用。
    const vl = xs.l[i] > 0 ? xs.lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) {
      chs.dLt++; bad = true;
      pair.set(`Y${vl}>${jl}`, (pair.get(`Y${vl}>${jl}`) ?? 0) + 1);
    }
    if (!bad) continue;
    if (!first) first = `(${i % W},${Math.floor(i / W)})`;
    const rk = `${Math.floor((i % W) / 200)}_${Math.floor((i / W) / 200)}`;
    reg.set(rk, (reg.get(rk) ?? 0) + 1);
    if (cells.length < cellCap) cells.push([i % W, Math.floor(i / W)]);
  }
  console.log(`[${tag}] ${JSON.stringify(chs)} first=${first}`);
  console.log('  pairs:', [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `${k}×${v}`).join(' ') || '(none)');
  console.log('  regions:', [...reg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `b${k}=${v}`).join(' ') || '(none)');
  return { tag, ...chs, first, pairs: [...pair.entries()].sort((a, b) => b[1] - a[1]), cells, regions: [...reg.entries()] };
}
type SnapAll = { t: Uint16Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; act: Uint8Array };
// ★IIIII84：必须拷贝——旧实现存活引用，pre/post 同数组 ⇒ changeSet 恒空（jaccard=0 伪影）
function fullSnap(st: StoreView): SnapAll {
  return {
    t: st.type.slice(), w: st.wall.slice(), l: st.liquid.slice(), hf: st.half.slice(),
    sl: st.slope.slice(), lt: st.liquidType.slice(), act: st.flags.slice(),
  };
}
function chToSnap(c: Ch): SnapAll { return { t: c.t, w: c.w, l: c.l, hf: c.hf, sl: c.sl, lt: c.lt, act: c.a }; }
function changeSet(a: SnapAll, b: SnapAll): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (a.act[i] !== b.act[i] || a.t[i] !== b.t[i] || a.w[i] !== b.w[i]
      || a.l[i] !== b.l[i] || a.hf[i] !== b.hf[i] || a.sl[i] !== b.sl[i]
      || a.lt[i] !== b.lt[i]) s.add(i);
  }
  return s;
}
function chgTwo(label: string, A: Set<number>, B: Set<number>) {
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  console.log(`[XCHG ${label}] both=${both} onlyJS=${A.size - both} onlyX=${B.size - both}`
    + ` jaccard=${+(both / Math.max(1, A.size + B.size - both)).toFixed(4)} JS=${A.size} X=${B.size}`);
}

const NMS: Record<number, string> = {
  26: 'Shinies', 27: 'Webs', 28: 'Underworld', 29: 'Corruption', 30: 'Lakes',
  31: 'Slush', 32: 'Dungeon', 33: 'Mountain_Caves',
};

(RUN ? it : it.skip)('IIIII84 GFB-D 刀① dungeon 反演重放+WV 测流', async () => {
  console.log(`seg=dungeon G2=${G2} seed=${SEED} flags=${Object.keys(M8_FLAGS).join(',')}`);
  // ── 相 1：管线捕获 @DG 头（HEAD_SEQ 第 4 头）──
  let cap: { gs: GenState; chests: ChestSink } | null = null;
  {
    (globalThis as unknown as {
      __swI87Cap?: (st: unknown, g: unknown, ch: unknown) => void;
    }).__swI87Cap = (_stRaw, gRaw, chRaw) => {
      const g = gRaw as GenState;
      cap = {
        gs: structuredClone(g),
        chests: JSON.parse(JSON.stringify(chRaw ?? [])),
      };
      const grec = g as unknown as Record<string, unknown>;
      console.log(`[cap-detail] crimson=${grec.crimson} crimsonLeft=${grec.crimsonLeft}`
        + ` dEntA=${grec.dungeonEntA} dEntB=${grec.dungeonEntB} entSeed=${grec.dungeonEntSeed}`
        + ` side=${grec.dungeonSide} loc=${grec.dungeonLocation} Y=${grec.dungeonY}`
        + ` theme=${grec.dungeonTheme} wallStyle=${grec.dungeonWallStyle}`);
      delete (globalThis as unknown as { __swI87Cap?: unknown }).__swI87Cap;
      const e = new Error('SW_III88_ABORT');
      (e as Error & { swAbort?: boolean }).swAbort = true;
      throw e;
    };
    const t0 = Date.now();
    try {
      await generateWorld({
        width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
        seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
        onProgress: () => {},
      });
      if (!cap) throw new Error('capture failed: DG 头未到达');
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('SW_III88_ABORT')) throw e;
    }
    if (!cap) throw new Error('capture failed');
    console.log(`phase1 done ${(Date.now() - t0) / 1000}s`);
  }
  const gsc = cap.gs;
  const chestSnap = cap.chests;

  // ── 相 2：dump31(带帧基座) 单跑 dungeon → 对拍 dump032 ──
  const baseX = chOf(31, NMS[31]);
  const st = loadStore(baseX);
  const sanity = diffBoard('sanity:Slush', baseX, st as unknown as StoreView, 3);
  if (sanity.dA + sanity.dT + sanity.dW + sanity.dL + sanity.dHf + sanity.dSl + sanity.dLt + sanity.dIa > 0) {
    throw new Error('loader sanity 失败 @dump31');
  }
  let preSnap: SnapAll | null = null;
  if (CHG) preSnap = fullSnap(st as unknown as StoreView);

  const lines: string[] = [];
  (globalThis as unknown as { __wvLines?: string[] }).__wvLines = lines;
  (globalThis as unknown as { __swWvLog?: unknown }).__swWvLog = OUTWV;

  flipGenSolid([481, 482, 483], false);
  const rng = new RNG(gsc.seed);
  // ── 段级快照（x86 rig SW_SNAPDIR/SW_SNAPBOX 同格式同裁窗,tag 对齐）──
  const BOX = process.env.SW_III88_BOX ?? '120,780,280,1000';
  {
    const [bx0, bx1, by0, by1] = BOX.split(',').map(Number);
    const rw = bx1 - bx0 + 1, rh = by1 - by0 + 1;
    const n2c = rw * rh;
    const snapDir = '/tmp/iii88-out/js-snaps';
    try { mkdirSync(snapDir, { recursive: true }); } catch { /* 存在即过 */ }
    (globalThis as unknown as { __dgSegWatch?: (name: string, s: TileStore) => void }).__dgSegWatch =
      (name: string, s: TileStore) => {
        if (!process.env.SW_III88_SNAP) return;
        const typ = new Uint8Array(n2c * 2), wal = new Uint8Array(n2c * 2);
        const act = new Uint8Array(n2c), liq = new Uint8Array(n2c);
        const hf = new Uint8Array(n2c), sl = new Uint8Array(n2c);
        const lt = new Uint8Array(n2c), ia = new Uint8Array(n2c);
        let k = 0;
        for (let y = by0; y <= by1; y++) {
          for (let x = bx0; x <= bx1; x++) {
            const i = s.idx(x, y);
            const va = s.flags[i] & 1 ? 1 : 0;
            // ★IIIII84：与 x86 Snap 同口径——type/wall/lty 不论 active 都原样写出
            //   （vanilla typ 是独立字节域,inactive 格保留 ghost type）
            const sheet = SHEET[s.type[i]];
            const vid = sheet >= 0 ? sheet : 9999;
            typ[k * 2] = vid & 255; typ[k * 2 + 1] = (vid >>> 8) & 255;
            act[k] = va;
            wal[k * 2] = s.wall[i] & 255; wal[k * 2 + 1] = (s.wall[i] >>> 8) & 255;
            liq[k] = s.liquid[i];
            hf[k] = s.half[i]; sl[k] = s.slope[i];
            lt[k] = s.liquidType[i] > 0 ? (s.liquidType[i] - 1) & 255 : 0;
            ia[k] = (s.wire[i] >>> 5) & 1;
            k++;
          }
        }
        const safe = name.replace(/[^0-9A-Za-z]/g, '_');
        writeFileSync(`${snapDir}/js_${safe}.typ`, typ);
        writeFileSync(`${snapDir}/js_${safe}.act`, act);
        writeFileSync(`${snapDir}/js_${safe}.wal`, wal);
        writeFileSync(`${snapDir}/js_${safe}.liq`, liq);
        writeFileSync(`${snapDir}/js_${safe}.half`, hf);
        writeFileSync(`${snapDir}/js_${safe}.slope`, sl);
        writeFileSync(`${snapDir}/js_${safe}.lty`, lt);
        writeFileSync(`${snapDir}/js_${safe}.inact`, ia);
      };
  }
  // 主实例样本镜像（x86 JJHook.RollCount2 同口径）：identity 过滤=phase2 rng 的
  // UnifiedRandom（引擎内部 private UnifiedRandom 实例不计）
  const mainU = rng.vanilla;
  const mainVals: number[] = [];
  // ★stage2（SW_III88_KS/KW）：样点栈捕获窗——定位第 k 颗样本的消费调用点
  const kStart = Number(process.env.SW_III88_KS ?? -1);
  const kWid = Number(process.env.SW_III88_KW ?? 0);
  const stacks: string[] = [];
  (globalThis as unknown as { __swRollN?: number }).__swRollN = 0;
  (globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll =
    (v: number, inst: object) => {
      const n = (globalThis as unknown as { __swRollN?: number }).__swRollN;
      if (n === undefined) return;
      if (inst === mainU) {
        mainVals.push(v);
        if (kStart >= 0 && kWid > 0 && n >= kStart && n < kStart + kWid) {
          const s = new Error().stack ?? '';
          stacks.push(`#${n} v=${v}\n${s.split('\n').slice(1, 6).join('\n')}`);
        }
        globalThis.__swRollN = n + 1;
      }
    };
  try {
    runDungeonPass(st, rng, gsc, chestSnap);
  } finally {
    delete (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
    console.log(`[mc] pass-total main samples=${mainVals.length}`);
    {
      const le = (n: number): [number, number, number, number] =>
        [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
      const buf = new Uint8Array(mainVals.length * 4);
      for (let i2 = 0; i2 < mainVals.length; i2++) buf.set(le(mainVals[i2]), i2 * 4);
      writeFileSync('/tmp/iii88-out/js-main-vals.bin', buf);
      if (stacks.length) writeFileSync('/tmp/iii88-out/js-stacks.txt', stacks.join('\n---\n') + '\n');
    }
    delete (globalThis as unknown as { __swRollN?: number }).__swRollN;
    delete (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch;
    flipGenSolid([481, 482, 483], true);
    delete (globalThis as unknown as { __swWvLog?: unknown }).__swWvLog;
    writeFileSync(OUTWV, lines.join('\n') + '\n');
    console.log(`[wv] lines=${lines.length} boxes=${lines.filter((l) => l.startsWith('BOX')).length}`
      + ` sprs=${lines.filter((l) => l.startsWith('SPR')).length} -> ${OUTWV}`);
  }

  const exitIdx = 32;
  const row = diffBoard(`replay dungeon(${31}→${exitIdx})`, chOf(exitIdx, NMS[exitIdx]), st as unknown as StoreView);
  if (CHG && preSnap) {
    const jsSet = changeSet(preSnap, fullSnap(st as unknown as StoreView));
    const xSet = changeSet(chToSnap(chOf(31, NMS[31])), chToSnap(chOf(exitIdx, NMS[exitIdx])));
    chgTwo(`dungeon ${31}→${exitIdx}`, jsSet, xSet);
  }
  writeFileSync(OUTROW, JSON.stringify({ seg: 'dungeon', seed: SEED, rows: [row] }, null, 1));
  console.log(`written ${OUTROW}`);
}, 900_000);
