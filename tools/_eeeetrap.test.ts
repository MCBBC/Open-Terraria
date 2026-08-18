// EEEE 批·#76 陷阱清单对账：JS placeTrap 流逐个登记 vs golden76 陷阱族集合。
// 用法：cd game && SW_EEEE2=1 npx vitest run tools/_eeeetrap.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runTrapsPass, placeTrap } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_EEEE2 === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;

function boundary(key: string) {
  const dir = `${BDIR}/${key}`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  return { gs, gensolid, fx, fy, wire, ids35 };
}
function chans(idx: number) {
  const b8 = (e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const b16 = (e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  return { t: b16('typ'), a: b8('act'), w: b16('wal'), l: b8('liq'), hf: b8('half'), sl: b8('slope'), lt: b8('lty'), ia: b8('inact') };
}
function buildBase(baseIdx: number, b: ReturnType<typeof boundary>): TileStore {
  const c = chans(baseIdx);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = b.ids35.has(i) ? b.ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      if (id < 0) id = 0;
      st.type[i] = id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = (c.ia[i]! ? 0x20 : 0) | b.wire[i];
    st.frameX[i] = b.fx[i]; st.frameY[i] = b.fy[i];
  }
  return st;
}

interface TrapRec { kind: string; x: number; y: number }
/** 从 typ/act 通道抓陷阱清单（锚点格去重）；internal=true 时 typ 为内部 id 需转 sheet */
function scanTraps(typ: Uint16Array, act: Uint8Array, internal = false): TrapRec[] {
  const out: TrapRec[] = [];
  const seen = new Set<number>();
  const push = (kind: string, x: number, y: number) => {
    const k = y * W + x;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ kind, x, y });
  };
  for (let i = 0; i < N; i++) {
    if (!act[i]) continue;
    const t = internal ? (SHEET[typ[i]!] ?? -1) : typ[i]!;
    const x = i % W, y = (i / W) | 0;
    if (t === 135) push('plate', x, y);
    else if (t === 137) push('dart', x, y);
    else if (t === 141) push('explt', x, y);
    else if (t === 443) push('geyser', x, y);
    else if (t === 138 || t === 664 || (t >= 711 && t <= 716)) push(`boul${t}`, x, y);
  }
  return out;
}

(RUN ? it : it.skip)('EEEE trap inventory compare', () => {
  const entry = boundary('s30');
  const gs: GenState = structuredClone(entry.gs);
  // ---- JS：跑主循环（镜像 runTrapsPass 但逐步登记）----
  const st = buildBase(75, entry);
  restoreGenSolid(entry.gensolid);
  __setGenStateForProbe(gs);
  flipGenSolid([379], false);
  const rng = new RNG(SEED);
  const jsTraps: TrapRec[] = [];
  let acceptIdx = 0;
  for (let n = 0; n < st.w * 0.05; n++) {
    for (let k = 0; k < 1150; k++) {
      let x = rng.int(200, st.w - 201);
      let y = rng.int(gs.worldSurface, st.h - 211);
      const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      while (y <= oceanTop && (x < gs.beachDistance || x > st.w - gs.beachDistance)) {
        x = rng.int(200, st.w - 201);
        y = rng.int(gs.worldSurface, st.h - 211);
      }
      if (st.wall[st.idx(x, y)] === 0 && placeTrap(st, rng, gs, x, y, -1)) {
        jsTraps.push({ kind: `#${acceptIdx}`, x, y });
        acceptIdx++;
        break;
      }
    }
  }
  const jsOut = scanTraps(st.type, st.flags, true);
  // ---- golden 76 ----
  const g = chans(76);
  const gTraps = scanTraps(g.t, g.a);
  const byKind = (ts: TrapRec[]) => {
    const m = new Map<string, TrapRec[]>();
    for (const t of ts) { const l = m.get(t.kind) ?? []; l.push(t); m.set(t.kind, l); }
    return m;
  };
  const jm = byKind(jsOut), gm = byKind(gTraps);
  const kinds = new Set([...jm.keys(), ...gm.keys()]);
  console.log(`JS accepts=${jsTraps.length}  golden traps=${gTraps.length} js traps=${jsOut.length}`);
  for (const k of [...kinds].sort()) {
    console.log(`  ${k.padEnd(8)} golden=${(gm.get(k)?.length ?? 0).toString().padStart(4)} js=${(jm.get(k)?.length ?? 0).toString().padStart(4)}`);
  }
  // 巨石位置集合对账
  const key2 = (t: TrapRec) => `${t.x},${t.y}`;
  const gset = new Map(gTraps.filter(t => t.kind.startsWith('boul')).map(t => [key2(t), t]));
  const jset = new Map(jsOut.filter(t => t.kind.startsWith('boul')).map(t => [key2(t), t]));
  const onlyG = [...gset.values()].filter(t => !jset.has(key2(t)));
  const onlyJ = [...jset.values()].filter(t => !gset.has(key2(t)));
  console.log(`\nboulders: golden=${gset.size} js=${jset.size} onlyGolden=${onlyG.length} onlyJS=${onlyJ.length}`);
  console.log(`  onlyGolden(first 12): ${onlyG.slice(0, 12).map(t => `${t.kind}@${t.x},${t.y}`).join(' ')}`);
  console.log(`  onlyJS(first 12):     ${onlyJ.slice(0, 12).map(t => `${t.kind}@${t.x},${t.y}`).join(' ')}`);
  // 压板对账
  const gp = new Set(gTraps.filter(t => t.kind === 'plate').map(key2));
  const jp = new Set(jsOut.filter(t => t.kind === 'plate').map(key2));
  const ogp = [...gp].filter(k => !jp.has(k));
  const ojp = [...jp].filter(k => !gp.has(k));
  console.log(`plates: golden=${gp.size} js=${jp.size} onlyGolden=${ogp.length} onlyJS=${ojp.length}`);
  console.log(`  onlyGolden(first 10): ${ogp.slice(0, 10).join(' ')}`);
  console.log(`  onlyJS(first 10):     ${ojp.slice(0, 10).join(' ')}`);
  // JS 接受序列（前 40）
  console.log(`\nJS accept seq(first 40): ${jsTraps.slice(0, 40).map(t => `${t.x},${t.y}`).join(' ')}`);
  __setGenStateForProbe(null);
}, 560_000);
