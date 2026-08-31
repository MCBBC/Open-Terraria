// IIII82 批（GFB-C 液型反转带 #27..33）反演重放窗口仪：
//   相 1：八字段 zenith 直注全管线跑到 band 头（WorldGen.ts i87Cap 捕获仪在六个
//         band 头各调一次:UW/CORR/LAKES/SLUSH/DG/MCO/BEACH,线性序即调用序）
//         —— 快照 (store 八通道+帧 / gs 深拷贝 / chests) 后以 .swAbort 停止。
//   相 2：反演重放 —— dump(带帧基座)→TileStore + 捕获 gs/chests + fresh RNG(seed)
//         单跑目标 pass → 对拍 x86 真值出口 dump 八通道（帧差只作足迹信息位，
//         bad 判据不含帧）。SW_III87_CHG=1 追加变更集 jaccard 对拍。
//   seg=uwtail(Underworld+remix mound+hellFort+drunk ashTree) / corruption / lakes /
//         slush / dungeon / mco / chain(uwtail→mco evolving store 连跑) / sanity(loader 自证)。
// 用法：cd game && SW_III87=1 SW_III87_SEG=corruption \
//         SW_III87_G2=/tmp/iii85-out/x86-gfb-c npx vitest run tools/_iii87win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runUnderworldPass, underworldAshGrassTrees, generateUnderworldStartingMound } from '../src/world/gen/vanilla/UnderworldPass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runSlushPass } from '../src/world/gen/vanilla/IceBiomePass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import type { ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import { runHellFortPass } from '../src/world/gen/vanilla/HellFortPass';
import { runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = !!process.env.SW_III87;
const G2 = process.env.SW_III87_G2 ?? '/tmp/iii85-out/x86-gfb-c';
const SEED = process.env.SW_III87_SEED ?? '9293480';
const EVIL = Number(process.env.SW_III87_EVIL ?? 0);
const W = Number(process.env.SW_III87_W ?? 4200), H = Number(process.env.SW_III87_H ?? 1200);
const N = W * H;
const SEG = process.env.SW_III87_SEG ?? 'corruption';
const OUT = process.env.SW_III87_OUT ?? `/tmp/iii87-out/win-${SEG}.json`;
const CHG = process.env.SW_III87_CHG === '1';

const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps', constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', celebrationmk10: 'tenthAnniversary',
  fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
};
const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_III87_FLAGS
  ?? 'everything,remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld')
  .split(',').filter(Boolean)) {
  M8_FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
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
// ★IIIII81 律：不得强写 REV.set(0,0)——dump typ id0=活性泥土。

interface Ch {
  t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
  frx?: Uint16Array; fry?: Uint16Array;
}
const chCache = new Map<number, Ch>();
function chOf(idx: number, nm: string): Ch {
  const hit = chCache.get(idx);
  if (hit) return hit;
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
  chCache.set(idx, c);
  return c;
}
function hasDump(idx: number, nm: string): boolean {
  try { readFileSync(`${G2}/${String(idx).padStart(3, '0')}_${nm}.typ`); return true; } catch { return false; }
}

/** dump → TileStore（ghost type 照抄；liquidType vanilla+1；inact 位→wire bit5；帧照抄） */
function loadStore(c: Ch): TileStore {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(c.t[i]) ?? 0;
    st.flags[i] = c.a[i] ? 1 : 0;
    st.wall[i] = c.w[i];
    st.liquid[i] = c.l[i];
    st.liquidType[i] = c.l[i] > 0 ? c.lt[i] + 1 : 0;
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
  dSl: number; dLt: number; dIa: number; dFx: number; dFy: number; first: string;
  pairs: Array<[string, number]>; cells: Array<[number, number]>; regions: Array<[string, number]>;
}
function diffBoard(tag: string, xs: Ch, st: StoreView, cellCap = 30): DiffRow {
  const chs = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, dFx: 0, dFy: 0 };
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
    const vl = xs.l[i] > 0 ? xs.lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) {
      chs.dLt++; bad = true;
      pair.set(`Y${vl}>${jl}`, (pair.get(`Y${vl}>${jl}`) ?? 0) + 1);
    }
    // 帧足迹（信息位）：内容没差但帧异 → 计数,不进 first/regions
    if (!bad && xs.frx && xs.fry && st.frameX && st.frameY
      && (xs.frx[i] !== st.frameX[i] || xs.fry[i] !== st.frameY[i])) {
      if (xs.frx[i] !== st.frameX[i]) chs.dFx++;
      if (xs.fry[i] !== st.frameY[i]) chs.dFy++;
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

// ── 变更集足迹（CHG 时开,jaccard 对拍 x86 相邻 dump 足迹；帧不入账）─────────────
type SnapAll = { t: Uint16Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; act: Uint8Array };
function fullSnap(st: StoreView): SnapAll {
  return { t: st.type, w: st.wall, l: st.liquid, hf: st.half, sl: st.slope, lt: st.liquidType, act: st.flags };
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

const HEAD_SEQ = ['UW', 'CORR', 'LAKES', 'SLUSH', 'DG', 'MCO', 'BEACH'] as const;
const SEG_HEAD: Record<string, number> = {
  uwtail: 0, corruption: 1, lakes: 2, slush: 3, dungeon: 4, mco: 5, chain: 0, sanity: 99,
};
const SKIP_PIPE = process.env.SW_III87_SKIPPIPE === '1';

interface Cap { gs: GenState; chests: ChestSink; rollCount: number }
let cap: Cap | null = null;

function deepCopyGs(g: GenState): GenState {
  try { return structuredClone(g); } catch { return JSON.parse(JSON.stringify(g)); }
}

(RUN ? it : it.skip)('IIIII82 GFB-C 反演重放窗口仪', async () => {
  console.log(`seg=${SEG} G2=${G2} flags=${Object.keys(M8_FLAGS).join(',')} seed=${SEED}`);
  const NMS: Record<number, string> = {
    26: 'Shinies', 27: 'Webs', 28: 'Underworld', 29: 'Corruption', 30: 'Lakes',
    31: 'Slush', 32: 'Dungeon', 33: 'Mountain_Caves', 34: 'Beaches',
  };
  interface Spec { base: number; exit: number }
  const SPEC: Record<string, Spec> = {
    uwtail: { base: 27, exit: 28 }, corruption: { base: 28, exit: 29 },
    lakes: { base: 29, exit: 30 }, slush: { base: 30, exit: 31 },
    dungeon: { base: 31, exit: 32 }, mco: { base: 32, exit: 33 },
  };

  const rows: DiffRow[] = [];

  function dumpBoxEvents(run: string, phase: string) {
    const evs = (globalThis as unknown as { __swI87Evs?: string[] }).__swI87Evs;
    if (!evs || evs.length === 0) return;
    console.log(`[box ${run}/${phase}] n=${evs.length}: ${evs.slice(0, 24).join(' ')}${evs.length > 24 ? ' …' : ''}`);
    evs.length = 0;
  }

  // ── 相 1：管线捕获（sanity 跳过）──
  let gsc: GenState | null = null;
  let chestSnap: ChestSink = [];
  let pipeLive: StoreView | null = null;
  if (SEG_HEAD[SEG] !== 99) {
    const rc = { n: 0 };
    (globalThis as { __swOnRoll?: (v?: number) => void }).__swOnRoll = () => { rc.n++; };
    (globalThis as unknown as {
      __swI87Cap?: (st: unknown, g: unknown, ch: unknown) => void;
    }).__swI87Cap = (stRaw, gRaw, chRaw) => {
      // 线性管线,i87Cap 只在 band 七头依序触发一次;数到目标头才捕获并停管。
      (globalThis as unknown as { __swI87Seen?: number }).__swI87Seen =
        ((globalThis as unknown as { __swI87Seen?: number }).__swI87Seen ?? -1) + 1;
      const seen = (globalThis as unknown as { __swI87Seen?: number }).__swI87Seen!;
      if (seen !== SEG_HEAD[SEG]) return;
      const lv = stRaw as StoreView;
      const g = gRaw as GenState;
      cap = {
        gs: deepCopyGs(g),
        chests: JSON.parse(JSON.stringify(chRaw ?? [])),
        rollCount: rc.n,
      };
      const grec = g as unknown as Record<string, unknown>;
      console.log(`[cap-detail] crimson=${grec.crimson} crimsonLeft=${grec.crimsonLeft}`
        + ` dEntA=${grec.dungeonEntA} dEntB=${grec.dungeonEntB} entSeed=${grec.dungeonEntSeed}`
        + ` side=${grec.dungeonSide} loc=${grec.dungeonLocation} Y=${grec.dungeonY}`);
      console.log(`[cap#head${seen} ${HEAD_SEQ[Math.min(seen, 6)]}] rollCount=${rc.n}`
        + ` ws=${Number(g.worldSurface).toFixed(2)} rock=${Number(g.rockLevel).toFixed(2)}`
        + ` dl=${(g as unknown as Record<string, number>).dungeonLocation}`
        + ` theme=${(g as unknown as Record<string, number>).dungeonTheme}`);
      delete (globalThis as unknown as { __swI87Cap?: unknown }).__swI87Cap;
      (globalThis as unknown as { __swI87Store?: StoreView }).__swI87Store = {
        type: lv.type.slice(), flags: lv.flags.slice(), wall: lv.wall.slice(),
        liquid: lv.liquid.slice(), liquidType: lv.liquidType.slice(), half: lv.half.slice(),
        slope: lv.slope.slice(), wire: lv.wire.slice(),
        frameX: lv.frameX?.slice(), frameY: lv.frameY?.slice(),
      };
      const e = new Error('SW_III87_ABORT');
      (e as Error & { swAbort?: boolean }).swAbort = true;
      throw e;
    };
    const t0 = Date.now();
    try {
      await generateWorld({
        width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
        seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
        onProgress: () => {},
        onWorldPartial: (wp) => { pipeLive = wp.store as never as StoreView; },
      });
      if (!cap) throw new Error(`capture failed: 目标头 #${SEG_HEAD[SEG]} (${HEAD_SEQ[SEG_HEAD[SEG] as number]}) 未到达`);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('SW_III87_ABORT')) throw e;
    }
    delete (globalThis as unknown as { __swI87Seen?: number }).__swI87Seen;
    delete (globalThis as unknown as { __swI87Store?: unknown }).__swI87Store;
    if (!cap) throw new Error('capture failed');
    gsc = cap.gs;
    chestSnap = cap.chests;
    console.log(`phase1 done ${(Date.now() - t0) / 1000}s rollCount=${rc.n} chests=${chestSnap.length}`);
    delete (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
  }

  /** 单段重放。stBase=null ⇒ 从真值 dump 装 base 并做 loader 自证;solo=true 才翻转回 481 组。 */
  function segRunner(k: string, stBase: StoreView | null, solo: boolean): TileStore {
    const sp = SPEC[k];
    if (!sp || !hasDump(sp.base, NMS[sp.base])) throw new Error(`seg ${k}: 缺 dump #${sp?.base}_${NMS[sp.base]}`);
    let st: TileStore;
    let preSnap: SnapAll | null = null;
    if (stBase) st = stBase as unknown as TileStore;
    else {
      const baseX = chOf(sp.base, NMS[sp.base]);
      st = loadStore(baseX);
      const sanity = diffBoard(`sanity:${NMS[sp.base]}`, baseX, st as unknown as StoreView, 3);
      if (sanity.dA + sanity.dT + sanity.dW + sanity.dL + sanity.dHf + sanity.dSl + sanity.dLt + sanity.dIa > 0) {
        throw new Error(`loader sanity 失败 @dump${sp.base}——truth loader 有伪差,禁止解读后续读数`);
      }
      if (process.env.SW_III87_TRIO === '1') {
        const IO = (x: number, y: number) => { const i = st.idx(x, y);
          return `${x},${y}:${SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 'x' + st.type[i]}/${st.flags[i] & 1}/l${st.liquid[i]} ty${st.liquidType[i]}`; };
        console.log('[trio@base]', IO(1682, 730), '|', IO(1681, 731), '|', IO(1682, 731), '|', IO(1681, 729), '|', IO(1682, 729), '|', IO(1681, 732), '|', IO(1682, 732));
      }
    }
    if (CHG) preSnap = fullSnap(st as unknown as StoreView);

    const rng = new RNG(gsc?.seed ?? Number(SEED));
    switch (k) {
      case 'uwtail':
        {
          // ★SW_III87_UWSTEP=1..4 子步二分：1=underworld 体 / 2=+remix mound /
          //   3=+hellFort / 4=+drunk ashTrees（缺省 4=完整带）
          const step = Number(process.env.SW_III87_UWSTEP ?? 4);
          // SW_III87_BOX=x0,y0,x1,y1 —— LiquidSim LavaCheck/Honey/Shimmer 触发盒日志
          const boxEnv = process.env.SW_III87_BOX;
          if (boxEnv) {
            const [bx0, by0, bx1, by1] = boxEnv.split(',').map(Number);
            const evs: string[] = [];
            (globalThis as unknown as { __swI87K?: ((ev: string, x: number, y: number) => void) | undefined }).__swI87K =
              (ev, x, y) => { if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) evs.push(`${ev}@${x},${y}`); };
            (globalThis as unknown as { __swI87Evs?: string[] }).__swI87Evs = evs;
          }
          runUnderworldPass(st, rng, gsc!);
          map118('ph1-afterUWbody');
          if (boxEnv) dumpBoxEvents(`uw${step}`, 'underworld');
          if (step >= 2 && !!gsc!.seedFlags.remix) generateUnderworldStartingMound(st, rng, gsc!);
          else if (step >= 2 && !gsc!.seedFlags.drunkWorld) underworldAshGrassTrees(st, rng, gsc!, false);
          map118('ph2-afterMound');
          if (boxEnv) dumpBoxEvents(`uw${step}`, 'mound');
          if (step >= 3) runHellFortPass(st, rng, gsc!, undefined, chestSnap);
          map118('ph3-afterHellFort');
          if (boxEnv) dumpBoxEvents(`uw${step}`, 'hellfort');
          if (step >= 4 && gsc!.seedFlags.drunkWorld) underworldAshGrassTrees(st, rng, gsc!, true);
          map118('ph4-afterAshtrees');
          if (boxEnv) {
            dumpBoxEvents(`uw${step}`, 'ashtrees');
            delete (globalThis as unknown as { __swI87K?: unknown }).__swI87K;
            delete (globalThis as unknown as { __swI87Evs?: unknown }).__swI87Evs;
          }
          // ★IIIII118 定域仪（SW_III118_MAP=1）：四子步逐相把盒区 (1660..1700×700..760)
          //   的全量格状态写文件 —— 液杀三格定罪用（机器可读，避人眼格式错位）。
          function map118(phase: string) {
            if (process.env.SW_III118_MAP !== '1') return;
            const outDir = process.env.SW_III118_MAPDIR ?? '/tmp/iii118-out/boxes';
            const parts: string[] = [];
            for (let y = 700; y <= 760; y++) {
              for (let x = 1660; x <= 1700; x++) {
                const i = st.idx(x, y);
                const sh = SHEET[st.type[i]];
                const act = st.flags[i] & 1;
                const qty = st.liquid[i], lty = st.liquidType[i];
                const fx = st.frameX[i] ?? 0, fy = st.frameY[i] ?? 0;
                if (act || qty > 0 || lty > 0 || st.wall[i]) {
                  parts.push(`${y},${x}: a${act} t${sh >= 0 ? sh : 'x' + st.type[i]} q${qty} y${lty} w${st.wall[i]} f${fx}/${fy}`);
                } else {
                  parts.push(`${y},${x}: 0`);
                }
              }
            }
            writeFileSync(`${outDir}/js-box-${phase}.txt`, parts.join('\n') + '\n');
            console.log(`[map ${phase}] → ${outDir}/js-box-${phase}.txt (${parts.length})`);
          };
          map118('ph0-base');
          // ★IIIII118 击杀归因仪（SW_III118_KILL=1）：注册 LiquidSim 内联钩
          //   __sw118Kt，盒内每次 gen/runtime KillTile 打印调用点栈前 6 层。
          if (process.env.SW_III118_KILL === '1') {
            (globalThis as unknown as { __sw118Kt?: ((tag: string, x: number, y: number) => void) | undefined }).__sw118Kt =
              (tag, x, y) => {
                if (x >= 1650 && x <= 1710 && y >= 690 && y <= 770) {
                  const frames = (new Error().stack ?? '').split('\n')
                    .map((l) => l.trim())
                    .filter((l) => /src[\\/](world|gen)/.test(l))
                    .slice(0, 6);
                  console.log(`[kt ${tag}] ${x},${y} :: ${frames.join(' <- ')}`);
                }
              };
          }
          const hits: string[] = [];
          for (let i = 0; i < N && hits.length < 16; i++) {
            if ((st.flags[i] & 1) && SHEET[st.type[i]] === 165) hits.push(`(${i % W},${Math.floor(i / W)})`);
          }
          console.log(`[uwtail step${step}] active sheet165 = ${hits.length ? '' + `${hits.length}+` : hits.length} ${hits.join(' ')}`);
          // 三连格现场（与 mile8 #28 首差同位）：x∈{1681,1682}×y∈{729..732}
          const IO = (x: number, y: number) => { const i = st.idx(x, y);
            return `${(x)},${(y)}:${(SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 'x' + st.type[i])}/${st.flags[i] & 1}/w${st.wall[i]} l${st.liquid[i]}`; };
          console.log('[trio]', IO(1681, 729), '|', IO(1682, 729), '|', IO(1681, 730), '|', IO(1682, 730),
            '|', IO(1681, 731), '|', IO(1682, 731), '|', IO(1681, 732), '|', IO(1682, 732));
        }
        break;
      case 'corruption': runCorruptionPass(st, rng, gsc!); break;
      case 'lakes': runLakesPass(st, rng, gsc!); break;
      case 'slush': runSlushPass(st, gsc!); break;
      case 'dungeon':
        flipGenSolid([481, 482, 483], false);
        // 取证旋钮：SW_III87_THEME_PIN=<n> 在运行前钉主题（模拟 Dunes 端 remix-pin
        // 假想修 / 差分归因）；负值/缺省不干预。
        {
          const pin = process.env.SW_III87_THEME_PIN;
          if (pin !== undefined && pin !== '') (gsc as unknown as { dungeonTheme: number }).dungeonTheme = Number(pin);
        }
        runDungeonPass(st, rng, gsc!, chestSnap);
        break;
      case 'mco': runMountainCavesPass(st, rng, gsc!); break;
      default: throw new Error(`unhandled seg ${k}`);
    }
    if (k === 'dungeon' && solo) {
      // 还原点=SmoothWorld 头（cs:16510 翻 true）；solo 重放自还原,防污染后续段
      flipGenSolid([481, 482, 483], true);
    }

    const exitIdx = sp.exit;
    if (hasDump(exitIdx, NMS[exitIdx])) {
      const row = diffBoard(`replay ${k}(${sp.base}→${sp.exit})`, chOf(exitIdx, NMS[exitIdx]), st as unknown as StoreView);
      rows.push(row);
      if (CHG && preSnap) {
        const jsSet = changeSet(preSnap, fullSnap(st as unknown as StoreView));
        const xSet = changeSet(chToSnap(chOf(sp.base, NMS[sp.base])), chToSnap(chOf(exitIdx, NMS[exitIdx])));
        chgTwo(`${k} ${sp.base}→${sp.exit}`, jsSet, xSet);
      }
    }
    return st;
  }

  if (SEG === 'sanity') {
    for (const idx of [27, 28, 29, 30, 31, 32, 33, 34]) {
      if (!hasDump(idx, NMS[idx])) continue;
      const stl = loadStore(chOf(idx, NMS[idx]));
      const r = diffBoard(`sanity#${idx}_${NMS[idx]}`, chOf(idx, NMS[idx]), stl as unknown as StoreView, 2);
      const tot = r.dA + r.dT + r.dW + r.dL + r.dHf + r.dSl + r.dLt + r.dIa;
      console.log(`  → dump#${idx} loader ${tot === 0 ? '✓ 零差' : `✗ tot=${tot}`}`);
    }
  } else if (SEG === 'chain') {
    let cur: StoreView | null = null;
    for (const k of ['uwtail', 'corruption', 'lakes', 'slush', 'dungeon', 'mco']) {
      cur = segRunner(k, cur, false) as unknown as StoreView;
      console.log(`── chain: ${k} done ──`);
    }
    void pipeLive;
  } else {
    segRunner(SEG, null, true);
  }

  writeFileSync(OUT, JSON.stringify({ seg: SEG, seed: SEED, flags: Object.keys(M8_FLAGS), rows }, null, 1));
  console.log(`written ${OUT}`);
}, 900_000);
