// IIII100d 后 GFB 滚动清扫（GFB-D #32 家具微差）dungeon 窗反演重放仪（本文件原名为
// _iii104dg.test.ts，因并行车道 IIII104REMIX 批的 _iii104tm 清理规则冲突改名 _gfbx104 前缀）。
//   相 1：八字段 zenith 直注全管线跑到 DG 头捕获（gs/chests）。
//   相 2：dump31 帧基座单跑 runDungeonPass；主实例样本镜像（值/rc/FNV 同 JJHook.OnRoll）＋
//         每段 __dgSegWatch 盒快照（字节格式=rig JJHook.Snap，BOX="x0,x1,y0,y1"）→ 与 rig
//         snaplog.txt(seq|tag|rc|rh 行) 逐段对账定位首差段；__dgLayoutTrace 内建插桩激活。
//   可选 SW_I104_KS/SW_I104_KW：样点栈深捕（12 帧）。
// 用法：cd game && SW_I104=1 npx vitest run tools/_gfbx104dg.test.ts
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

const RUN = !!process.env.SW_I104;
const G2 = process.env.SW_I104_G2 ?? '/tmp/iii85-out/x86-gfb-c';
const SEED = process.env.SW_I104_SEED ?? '9293480';
const EVIL = Number(process.env.SW_I104_EVIL ?? 0);
const W = Number(process.env.SW_I104_W ?? 4200), H = Number(process.env.SW_I104_H ?? 1200);
const N = W * H;
const OUTDIR = process.env.SW_I104_OUT ?? '/tmp/gfbx104-out/dg104';

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I104_FLAGS
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
  hf: Uint8Array; sl: Uint8Array; lty: Uint8Array; ia: Uint8Array;
  frx?: Uint16Array; fry?: Uint16Array;
}
function chOf(idx: number, nm: string): Ch {
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
  const rd = (p: string) => readFileSync(p);
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  let frames = false;
  try { readFileSync(`${pre}.frx`); frames = true; } catch { /* 老链无帧 */ }
  return {
    t: le16(`${pre}.typ`), a: rd(`${pre}.act`), w: le16(`${pre}.wal`), l: rd(`${pre}.liq`),
    hf: rd(`${pre}.half`), sl: rd(`${pre}.slope`), lty: rd(`${pre}.lty`), ia: rd(`${pre}.inact`),
    ...(frames ? { frx: le16(`${pre}.frx`), fry: le16(`${pre}.fry`) } : {}),
  };
}
function loadStore(c: Ch): TileStore {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(c.t[i]) ?? 0;
    st.flags[i] = c.a[i] ? 1 : 0;
    st.wall[i] = c.w[i];
    st.liquid[i] = c.l[i];
    // ★IIIII84 载入器语义：幽灵液型位保真——l>0 恒 +1；干格仅 lt>0 时留 +1 幽灵位
    st.half[i] = c.hf[i]; st.slope[i] = c.sl[i];
    st.liquidType[i] = (c.l[i] > 0 || c.lty[i] > 0) ? c.lty[i] + 1 : 0;
    if (c.ia[i]) st.wire[i] |= 32;
    if (c.frx && c.fry) { st.frameX[i] = c.frx[i]; st.frameY[i] = c.fry[i]; }
  }
  return st;
}

interface DiffRow {
  tag: string; dA: number; dT: number; dW: number; dL: number;
  dHf: number; dSl: number; dLt: number; dIa: number;
  first: string; pairs: Array<[string, number]>; cells: Array<[number, number]>;
}
function diffBoard(tag: string, xs: Ch, st: TileStore, cellCap = 60): DiffRow {
  const chs = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0 };
  const pair = new Map<string, number>();
  const cells: Array<[number, number]> = [];
  let first = '';
  for (let i = 0; i < N; i++) {
    const va = xs.a[i] ? 1 : 0, ja = st.flags[i] & 1;
    let bad = false;
    if (va !== ja) { chs.dA++; bad = true; pair.set(`A${va}>${ja}`, (pair.get(`A${va}>${ja}`) ?? 0) + 1); }
    // 与 mile8/ii88dg 同口径：inactive 幽灵 type 不入 T 账
    const vt = va ? xs.t[i] : 0;
    const jt = ja ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    if (vt !== jt) { chs.dT++; bad = true; pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1); }
    if (xs.w[i] !== st.wall[i]) { chs.dW++; bad = true; }
    if (xs.l[i] !== st.liquid[i]) { chs.dL++; bad = true; }
    if (xs.hf[i] !== st.half[i]) { chs.dHf++; bad = true; }
    if (xs.sl[i] !== st.slope[i]) { chs.dSl++; bad = true; }
    if ((xs.ia[i] ? 1 : 0) !== ((st.wire[i] >>> 5) & 1)) { chs.dIa++; bad = true; }
    const vl = xs.l[i] > 0 ? xs.lty[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) { chs.dLt++; bad = true; }
    if (!bad) continue;
    if (!first) first = `(${i % W},${Math.floor(i / W)})`;
    if (cells.length < cellCap) cells.push([i % W, Math.floor(i / W)]);
  }
  console.log(`[${tag}] ${JSON.stringify(chs)} first=${first}`);
  console.log('  pairs:', [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([k, v]) => `${k}×${v}`).join(' ') || '(none)');
  return { tag, ...chs, first, pairs: [...pair.entries()].sort((a, b) => b[1] - a[1]), cells };
}

(RUN ? it : it.skip)('IIIII104-GFB dungeon 反演重放+段级 rc/rh 对账', async () => {
  console.log(`seg=dungeon G2=${G2} seed=${SEED} flags=${Object.keys(M8_FLAGS).join(',')}`);
  let cap: { gs: GenState; chests: ChestSink } | null = null;
  {
    (globalThis as unknown as {
      __swI87Cap?: (st: unknown, g: unknown, ch: unknown) => void;
    }).__swI87Cap = (_stRaw, gRaw, chRaw) => {
      const g = gRaw as GenState;
      cap = { gs: structuredClone(g), chests: JSON.parse(JSON.stringify(chRaw ?? [])) };
      delete (globalThis as unknown as { __swI87Cap?: unknown }).__swI87Cap;
      const e = new Error('SW_I104_ABORT');
      (e as Error & { swAbort?: boolean }).swAbort = true;
      throw e;
    };
    try {
      await generateWorld({
        width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
        seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
        onProgress: () => {},
      });
      if (!cap) throw new Error('capture failed');
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('SW_I104_ABORT')) throw e;
    }
    if (!cap) throw new Error('capture failed');
  }

  mkdirSync(OUTDIR, { recursive: true });
  const baseX = chOf(31, 'Slush');
  const st = loadStore(baseX);
  const sanity = diffBoard('sanity:Slush', baseX, st, 3);
  if (sanity.dA + sanity.dT + sanity.dW + sanity.dL + sanity.dHf + sanity.dSl + sanity.dLt + sanity.dIa > 0) {
    throw new Error('loader sanity 失败 @dump31');
  }

  const [BX0, BX1, BY0, BY1] = (process.env.SW_I104_BOX ?? '290,385,470,660').split(',').map(Number);
  const rw = BX1 - BX0 + 1, rhn = BY1 - BY0 + 1;

  const vals: number[] = [];
  let rollHash = 2166136261 >>> 0;
  const stageInfo: Record<string, { n: number; rh: string }> = {};
  const layoutTrace: Array<Record<string, number>> = [];
  (globalThis as { __dgLayoutTrace?: Array<Record<string, number>> }).__dgLayoutTrace = layoutTrace;
  flipGenSolid([481, 482, 483], false);
  const rng = new RNG(cap.gs.seed);
  const mainU = rng.vanilla;
  const kStart = Number(process.env.SW_I104_KS ?? -1);
  const kWid = Number(process.env.SW_I104_KW ?? 0);
  const stacks: string[] = [];
  (globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll =
    (v: number, inst: object) => {
      if (inst !== mainU) return;
      vals.push(v);
      rollHash = ((rollHash ^ (v >>> 0)) * 16777619) >>> 0;
      const n2 = vals.length;
      if (kStart >= 0 && kWid > 0 && n2 - 1 >= kStart && n2 - 1 < kStart + kWid) {
        const fr = (new Error().stack ?? '').split('\n')
          .map((l) => l.trim().replace(/^at\s+/, ''))
          .filter((l) => /(src|tools)[\\/]/.test(l))
          .slice(0, 12);
        stacks.push(`#${n2 - 1} v=${v}\n${fr.join('\n')}`);
      }
    };
  (globalThis as unknown as { __dgSegWatch?: (name: string, s: TileStore) => void }).__dgSegWatch =
    (name: string, s: TileStore) => {      const typ = new Uint8Array(rw * rhn * 2), wal = new Uint8Array(rw * rhn * 2);
      const act = new Uint8Array(rw * rhn), liq = new Uint8Array(rw * rhn);
      const hf = new Uint8Array(rw * rhn), sl = new Uint8Array(rw * rhn);
      const lt = new Uint8Array(rw * rhn), ia = new Uint8Array(rw * rhn);
      let k = 0;
      for (let y = BY0; y <= BY1; y++) {
        for (let x = BX0; x <= BX1; x++) {
          const i = s.idx(x, y);
          const vid = SHEET[s.type[i]] >= 0 ? SHEET[s.type[i]] : 9999;
          typ[k * 2] = vid & 255; typ[k * 2 + 1] = (vid >>> 8) & 255;
          act[k] = s.flags[i] & 1 ? 1 : 0;
          wal[k * 2] = s.wall[i] & 255; wal[k * 2 + 1] = (s.wall[i] >>> 8) & 255;
          liq[k] = s.liquid[i];
          hf[k] = s.half[i]; sl[k] = s.slope[i];
          lt[k] = s.liquidType[i] > 0 ? (s.liquidType[i] - 1) & 255 : 0;
          ia[k] = (s.wire[i] >>> 5) & 1;
          k++;
        }
      }
      const safe = name.replace(/[^0-9A-Za-z]/g, '_');
      const pre = `${OUTDIR}/js_${safe}`;
      writeFileSync(`${pre}.typ`, typ); writeFileSync(`${pre}.act`, act); writeFileSync(`${pre}.wal`, wal);
      writeFileSync(`${pre}.liq`, liq); writeFileSync(`${pre}.half`, hf); writeFileSync(`${pre}.slope`, sl);
      writeFileSync(`${pre}.lty`, lt); writeFileSync(`${pre}.inact`, ia);
      stageInfo[name] = { n: vals.length, rh: (rollHash >>> 0).toString(16).padStart(8, '0') };
      console.log(`[stage ${name}] rc=${vals.length} rh=${stageInfo[name].rh}`);
    };
  try {
    runDungeonPass(st, rng, cap.gs, cap.chests);
  } finally {
    delete (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
    delete (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch;
    delete (globalThis as { __dgLayoutTrace?: unknown }).__dgLayoutTrace;
    flipGenSolid([481, 482, 483], true);
    const le = (n3: number): [number, number, number, number] => [n3 & 255, (n3 >>> 8) & 255, (n3 >>> 16) & 255, (n3 >>> 24) & 255];
    const buf = new Uint8Array(vals.length * 4);
    for (let i = 0; i < vals.length; i++) buf.set(le(vals[i]), i * 4);
    writeFileSync(`${OUTDIR}/js-main-vals.bin`, buf);
    if (stacks.length) writeFileSync(`${OUTDIR}/js-stacks.txt`, stacks.join('\n---\n') + '\n');
    writeFileSync(`${OUTDIR}/stage-info.json`, JSON.stringify(stageInfo, null, 1));
    writeFileSync(`${OUTDIR}/layout-trace.json`, JSON.stringify(layoutTrace));
    console.log(`[mc] pass-total main samples=${vals.length} final-rh=${(rollHash >>> 0).toString(16)}`);
  }
  const row = diffBoard('replay dungeon(31→32)', chOf(32, 'Dungeon'), st);
  writeFileSync(`${OUTDIR}/row.json`, JSON.stringify(row, null, 1));
}, 900_000);
