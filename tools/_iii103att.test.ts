// IIII97 批一次性诊断：dualRoomsGen/provider 受理循环 attempt 级对拍仪。
// 复用 cap-ddual 基座（_iii89dg 捕获面）→ 注入 __swI103Att 收集
//   ①provider 事件（li/phase/ri/na/nf/styleNum）
//   ②verdict 事件（k/x/y/fluff/blockOuter/blockInner/roomType/boundR）
// 同一进程内做 A/B：外圈判据（改前=rm.outer，错构形态）vs inner 判据
//   （C# DungeonData.IsAnyRoomInSpot 缺省 UseOuterBounds=false ⇒ InnerBounds——DC.cs:883-894 调用点）。
// 输出：attempt 总量/两判据受理集差（首个分歧 attempt 全参数）/末段八通道对拍两组数。
// 用法：cd game && SW_I103=1 SW_I89_OUT=/tmp/iii99-out/cap-ddual \
//   SW_I89_G2=/tmp/iii84-out/x86-i78-ddual SW_I89_CMP=33 npx vitest run tools/_iii103att.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TILE_DEFS } from '../src/data/tiles';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I103 === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii99-out/cap-ddual';
const G2 = process.env.SW_I89_G2 ?? '/tmp/iii84-out/x86-i78-ddual';
const CMP_IDX = Number(process.env.SW_I89_CMP ?? 33);
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface ProviderEvt { li?: number; phase?: string; ri?: number; na?: number; nf?: number; styleNum?: number; liX?: number }
interface VerdictEvt { k: number; x: number; y: number; fluff: number; blockOuter: [number, number] | null; blockInner: [number, number] | null; roomType: number; boundR: number; mc?: number }
type Evt = Partial<ProviderEvt & VerdictEvt>;

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  function desVal(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(desVal);
    if (v && typeof v === 'object') {
      const o = v as { __t?: string; d?: unknown[] };
      if (o.__t) {
        const Ctor = (globalThis as unknown as Record<string, new (n: number) => Uint8Array | Int16Array>)[o.__t];
        const arr = new (Ctor as unknown as new (n: number) => never)(o.d?.length ?? 0) as unknown as { set(a: unknown[]): void };
        arr.set(o.d!);
        return arr;
      }
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

function restoreDual(gs: GenState, st: TileStore): void {
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState;
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st.w, st.h);
    for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      const src = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gs.seed), gs);
  }
}

function loadX86(): { xt: Uint16Array; xa: Uint8Array; xwl: Uint16Array; xl: Uint8Array; xia: Uint8Array } {
  let dn = '';
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m && Number(m[1]) === CMP_IDX) dn = m[2];
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${dn}`;
  const bT = readFileSync(`${pre}.typ`);
  const u16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  return { xt: new Uint16Array(bT.buffer, bT.byteOffset, bT.length >> 1), xa: readFileSync(`${pre}.act`),
    xwl: u16(`${pre}.wal`), xl: readFileSync(`${pre}.liq`), xia: readFileSync(`${pre}.inact`) };
}

function diff8(st: TileStore, X: ReturnType<typeof loadX86>): { A: number; T: number; Wl: number; Lq: number; Ia: number; first: string } {
  let dA = 0, dT = 0, dWl = 0, dLq = 0, dIa = 0, fI = -1;
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    const va = X.xa[i]!;
    if (va !== ja) { dA++; if (fI < 0) fI = i; continue; }
    if (va) {
      const vt = X.xt[i]!;
      const jt = SHEET[st.type[i]!]! >= 0 ? SHEET[st.type[i]!]! : 9999;
      if (vt !== jt) { dT++; if (fI < 0) fI = i; continue; }
    }
    if (X.xwl[i] !== st.wall[i]) { dWl++; if (fI < 0) fI = i; continue; }
    if (X.xl[i] !== st.liquid[i]) { dLq++; if (fI < 0) fI = i; continue; }
    if ((va ? 0 : 1) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
  }
  return { A: dA, T: dT, Wl: dWl, Lq: dLq, Ia: dIa, first: fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})` };
}

(RUN ? it : it.skip)('IIII97 attempt-level provider acceptance A/B probe', async () => {
  if (!existsSync(`${OUT}/base_dual.json`)) throw new Error('base_dual.json missing');
  const X = loadX86();
  // —— attempt 流应当与受理判据无关：跑两遍（outer / inner），事件流必须逐条相同 ——
  const runs: Array<{ tag: string; evs: Evt[]; accIds: Set<number>; disFirst: Evt | null; disCount: number }> = [];
  for (const mode of ['outer', 'inner'] as const) {
    const { st, gs } = hydrate();
    restoreDual(gs, st);
    const evs: Evt[] = [];
    (globalThis as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att =
      (e) => evs.push(e as Evt);
    (globalThis as { __swI103Inner?: boolean }).__swI103Inner = mode === 'inner';
    // ★主样本流镜像（与 rig OnRoll ReferenceEquals(Main.rand) 同滤）：pass 相对 mc 从 1 起
    const rngMain = new RNG(gs.seed);
    const mainUr = (rngMain as unknown as { ur: UnifiedRandom }).ur;
    let mcSeq = 0;
    const samples: number[] = [];
    const oOnRoll = (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll;
    (globalThis as { __swI103Mc?: number }).__swI103Mc = 0;
    // ★IIIII98 第四轮：Wormlike 段界相位钩（镜像 rig DR|W1..W4；SW_I103_PHASE=<file>）
    const PHFILE = process.env.SW_I103_PHASE;
    const phLines: string[] = [];
    (globalThis as { __swI103Phase?: ((tag: string, gen: boolean, seed: number) => void) | undefined }).__swI103Phase =
      PHFILE
        ? (tag, gen, seed) => {
            phLines.push(`PH|${tag}|${gen ? 1 : 0}|seed=${seed}|mc=${mcSeq}`);
          }
        : undefined;
    (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v, inst) => {
      if (inst === mainUr) {
        mcSeq++;
        (globalThis as { __swI103Mc?: number }).__swI103Mc = mcSeq;
        samples.push(v);
      }
    };
    try {
      runDungeonPass(st, rngMain, gs, []);
    } finally {
      (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = oOnRoll;
      delete (globalThis as { __swI103Inner?: boolean }).__swI103Inner;
      delete (globalThis as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att;
      console.log(`[${mode}] main-stream samples=${mcSeq}`);
      if (PHFILE) {
        const fs2 = await import('node:fs');
        fs2.writeFileSync(`${PHFILE}.${mode}`, phLines.join('\n') + '\n');
        console.log(`[${mode}] phase events -> ${PHFILE}.${mode} (${phLines.length})`);
      }
      const ROLL = process.env.SW_I103_ROLL;
      if (ROLL) {
        const fs = await import('node:fs');
        fs.writeFileSync(`${ROLL}.${mode}`, samples.map((v, ix) => `${ix + 1}|${v}`).join('\n') + '\n');
        console.log(`[${mode}] roll stream -> ${ROLL}.${mode}`);
      }
    }
    const tables: Record<number, { rooms: unknown[]; halls: unknown[] }> = {};
    // 成对配组：provider 事件(li 存在) ↔ verdict 事件(blockOuter 存在)；kind='rooms' 终表旁路
    type Pair = { k: number; prov: ProviderEvt; ver: VerdictEvt; idx: number; acceptOuter: boolean; acceptInner: boolean };
    const pairs: Pair[] = [];
    let cur: Evt | null = null;
    for (const e of evs) {
      if ('kind' in e && e.kind === 'rooms') {
        tables[e.k as number] = { rooms: (e.list ?? []) as unknown[], halls: (e.halls ?? []) as unknown[], hallStats: e.hallStats as unknown };
        continue;
      }
      if ('blockOuter' in e) {
        if (!cur) throw new Error('verdict without provider evt');
        pairs.push({
          k: e.k!, prov: cur as ProviderEvt, ver: e as VerdictEvt, idx: pairs.length,
          acceptOuter: e.blockOuter === null,
          acceptInner: e.blockInner === null,
        });
        cur = null;
      } else {
        if (cur) throw new Error('two provider events in row');
        cur = e;
      }
    }
    const accOut = pairs.filter((p) => p.acceptOuter);
    const accIn = pairs.filter((p) => p.acceptInner);
    const disagrees = pairs.filter((p) => p.acceptOuter !== p.acceptInner);
    // ★rig 对拍导出（SW_I103_JSON=<file> / SW_I103_JSON2=inner 模式）：attempt 流+终表
    const JSONP = process.env.SW_I103_JSON;
    const JSONP2 = process.env.SW_I103_JSON2;
    if ((mode === 'outer' && JSONP) || (mode === 'inner' && JSONP2)) {
      const fs = await import('node:fs');
      const OUTP = mode === 'outer' ? JSONP : JSONP2;
      if (!OUTP) throw new Error(`no json path for mode ${mode}`);
      fs.writeFileSync(OUTP, JSON.stringify({
        pairs: pairs.map((p) => ({
          k: p.k, li: p.prov.li ?? null, phase: p.prov.phase ?? null, ri: p.prov.ri ?? null,
          na: p.prov.na ?? null, nf: p.prov.nf ?? null, styleNum: p.prov.styleNum ?? null,
          x: p.ver.x, y: p.ver.y, fluff: p.ver.fluff, rt: p.ver.roomType, br: p.ver.boundR,
          mcProv: (p.prov as { mc?: number }).mc ?? null, mcVer: p.ver.mc ?? null,
          blockO: p.ver.blockOuter, blockI: p.ver.blockInner,
          acceptOuter: p.acceptOuter, acceptInner: p.acceptInner,
        })),
        tables,
      }));
      console.log(`[json] wrote ${OUTP} pairs=${pairs.length} tbl=${Object.keys(tables).length}`);
    }
    const g = (p: Pair | null): string => {
      if (!p) return '-';
      return `(k${p.k} li${p.prov.li}${p.prov.phase === 'stage' ? '!stage' : ''} r${p.prov.ri ?? '-'} `
        + `${p.ver.roomType} br=${p.ver.boundR} pos=(${p.ver.x},${p.ver.y}) na=${p.prov.na?.toFixed(4)} nf=${p.prov.nf?.toFixed(4)}`
        + ` blkO=${JSON.stringify(p.ver.blockOuter)} blkI=${JSON.stringify(p.ver.blockInner)} fluff=${p.ver.fluff})`;
    };
    console.log(`[${mode}] attempts=${pairs.length} k0=${pairs.filter((p) => p.k === 0).length} `
      + `accepted(outer)=${accOut.length} accepted(inner)=${accIn.length} disagree=${disagrees.length}`);
    console.log(`[${mode}] k0a=${accOut.filter((p) => p.k === 0).length} k1a=${accOut.filter((p) => p.k === 1).length}`
      + ` | inner:k0a=${accIn.filter((p) => p.k === 0).length} k1a=${accIn.filter((p) => p.k === 1).length}`);
    console.log(`[${mode}] first5 disagree: ${disagrees.slice(0, 5).map(g).join(' ;; ') || '(none)'}`);
    const nd = diff8(st, X);
    console.log(`[${mode}] DIFF vs dump#${CMP_IDX}: A=${nd.A} T=${nd.T} W=${nd.Wl} L=${nd.Lq} Ia=${nd.Ia} first=${nd.first}`);
    runs.push({ tag: mode, evs, accIds: new Set(accIn.map((p) => p.idx)), disFirst: disagrees[0] ?? null, disCount: disagrees.length });
    void accOut;
  }
  // 两模式 attempt 流位级一致自检（positions 与受理无关的硬证）
  const a0 = runs[0]!.evs, a1 = runs[1]!.evs;
  let streamEq = a0.length === a1.length;
  if (streamEq) {
    for (let i = 0; i < a0.length; i++) {
      const p = JSON.stringify(a0[i]), q = JSON.stringify(a1[i]);
      if (p !== q) { streamEq = false; break; }
    }
  }
  console.log(`attempt-stream bitwise equal across verdict modes: ${streamEq} (${a0.length}/${a1.length} events)`);
}, 900_000);
