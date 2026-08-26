// TTTTTTT 批一次性探针①：FinalCleanup 写集分账（const/s22222 #105 首差定罪）
// 方法：JS 槽 56 末（=断线陷阱清理后）与槽 57 末（=终清理后）双快照，对 x86
// dump 104/105 做「写集分账」——逐格逐通道 V(=X105≠X104) / J(=JS57≠JS56)，
// 分类 V-only / J-only / 双改不同值；按主循环扫描序（x 外 y 内）报前 N。
// 用法：cd game && SW_T=1 SW_T_CHAIN=const npx vitest run tools/_ttt1.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_T === '1';
const CHAIN = process.env.SW_T_CHAIN ?? 'const';
const CFGS: Record<string, { seed: string; evil: number; flags?: Record<string, boolean>; dir: string }> = {
  g: { seed: '9293480', evil: 0, dir: '/tmp/jjj-out/g1457' },
  s22222: { seed: '22222', evil: 1, dir: '/tmp/jjj-out/g1457-s22222' },
  ntb: { seed: '1372357239', evil: 0, flags: { notTheBees: true }, dir: '/tmp/jjj-out/g1457-ntb' },
  notraps: { seed: '1896728457', evil: 1, flags: { noTraps: true }, dir: '/tmp/jjj-out/g1457-notraps' },
  12345: { seed: '12345', evil: 1, dir: '/tmp/jjj-out/g1457-12345' },
  const: { seed: '1321365005', evil: 0, flags: { theConstant: true }, dir: '/tmp/jjj-out/g1457-const' },
};
const cfg = CFGS[CHAIN]!;
const G2 = process.env.SW_T_G2 ?? cfg.dir;
const W = Number(process.env.SW_T_W ?? 4200), H = Number(process.env.SW_T_H ?? 1200);
const N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface Snap { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array; lty: Uint8Array; hf: Uint8Array; sl: Uint8Array; ia: Uint8Array }
function loadX(idx: number): Snap {
  const pre = `${G2}/${String(idx).padStart(3, '0')}`;
  // 名表从目录扫
  return {
    typ: le16(require('node:fs').readdirSync(G2).length ? `${pre}_x.typ`.replace('_x', findSuffix(idx)) : ''),
    act: readFileSync(`${pre}${findSuffix(idx)}.act`), wal: le16(`${pre}${findSuffix(idx)}.wal`),
    liq: readFileSync(`${pre}${findSuffix(idx)}.liq`), lty: readFileSync(`${pre}${findSuffix(idx)}.lty`),
    hf: readFileSync(`${pre}${findSuffix(idx)}.half`), sl: readFileSync(`${pre}${findSuffix(idx)}.slope`),
    ia: readFileSync(`${pre}${findSuffix(idx)}.inact`),
  };
}
function maskX(s: Snap): Snap {
  const typ = new Uint16Array(N), lty = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    typ[i] = s.act[i] ? s.typ[i]! : 0;
    lty[i] = s.liq[i]! > 0 ? s.lty[i]! : 0;
  }
  return { ...s, typ, lty };
}
const nameCache = new Map<number, string>();
function findSuffix(idx: number): string {
  if (nameCache.has(idx)) return nameCache.get(idx)!;
  for (const f of require('node:fs').readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m && Number(m[1]) === idx) { nameCache.set(idx, `_${m[2]}`); return `_${m[2]}`; }
  }
  throw new Error(`dump ${idx} not found in ${G2}`);
}
type Store = { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array; w: number; h: number };
function snap(st: Store): Snap {
  const typ = new Uint16Array(N), act = new Uint8Array(N), wal = new Uint16Array(N), liq = new Uint8Array(N), lty = new Uint8Array(N), hf = new Uint8Array(N), sl = new Uint8Array(N), ia = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = st.flags[i]! & 1;
    act[i] = a;
    typ[i] = a ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    wal[i] = st.wall[i]!; liq[i] = st.liquid[i]!;
    lty[i] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0;   // JS +1 基 → vanilla 0 基
    hf[i] = st.half[i]!; sl[i] = st.slope[i]!; ia[i] = (st.wire[i]! >>> 5) & 1;
  }
  return { typ, act, wal, liq, lty, hf, sl, ia };
}
const CHANS: Array<[string, keyof Snap]> = [
  ['act', 'act'], ['typ', 'typ'], ['wal', 'wal'], ['liq', 'liq'], ['lty', 'lty'], ['hf', 'hf'], ['sl', 'sl'], ['ia', 'ia'],
];
(RUN ? it : it.skip)('TTT① FinalCleanup write-set accounting', async () => {
  const x104 = maskX(loadX(104)), x105 = maskX(loadX(105));
  let pre: Snap | null = null, post: Snap | null = null, fin: Snap | null = null;
  const w0 = await generateWorld({
    width: W, height: H, seedText: cfg.seed, evil: cfg.evil as -1 | 0 | 1,
    seedFlags: cfg.flags,
    onWorldPartial: (w, i, nm) => {
      if (i === 0 || i === 56 || i === 57 || i === 55) console.log(`[partial] ${i} ${nm}`);
      if (i === 56 && !pre) pre = snap(w.store as never as Store);
      if (i === 57 && !post) post = snap(w.store as never as Store);
    },
  });
  if (!pre || !post) throw new Error('snapshots missing');
  fin = snap(w0.store as never as Store);
  // 终态校验：generateWorld 返回态（含 finalSeedCleanup/vampire/尾扫）vs X105
  {
    const by: Record<string, number> = {};
    let tot = 0;
    for (const [nm, k] of CHANS) {
      const A = fin[k]!, B = x105[k]!;
      let d = 0;
      for (let i = 0; i < N; i++) if (A[i] !== B[i]) d++;
      by[nm] = d; tot += d;
    }
    console.log(`[final] world-final vs X105 total=${tot} ${JSON.stringify(by)}`);
    if (tot > 0) {
      const A = fin.typ!, B = x105.typ!;
      let shown = 0;
      for (let i = 0; i < N && shown < 12; i++) {
        if (A[i] !== B[i]) { console.log(`  final (${i % W},${(i / W) | 0}) typ v=${B[i]} j=${A[i]} act=${x105.act[i]}/${fin.act[i]}`); shown++; }
      }
    }
  }
  // 邻域窗：真实分歧点上下文（act/typ 两通道）
  const winDump = (cx0: number, cx1: number, cy0: number, cy1: number, tag: string): void => {
    console.log(`[win:${tag}] x∈[${cx0},${cx1}] y∈[${cy0},${cy1}] 行=act|typ (E=入口 X=x105 J=js57 F=final)`);
    for (let y = cy0; y <= cy1; y++) {
      const rE: string[] = [], rX: string[] = [], rJ: string[] = [], rF: string[] = [];
      for (let x = cx0; x <= cx1; x++) {
        const i = y * W + x;
        rE.push(`${pre.act[i]}${String(pre.typ[i]).padStart(3)}`);
        rX.push(`${x105.act[i]}${String(x105.typ[i]).padStart(3)}`);
        rJ.push(`${post.act[i]}${String(post.typ[i]).padStart(3)}`);
        rF.push(`${fin!.act[i]}${String(fin!.typ[i]).padStart(3)}`);
      }
      console.log(`y=${y}  E:${rE.join(' ')}\n     X:${rX.join(' ')}\n     J:${rJ.join(' ')}\n     F:${rF.join(' ')}`);
    }
  };
  winDump(1888, 1902, 308, 330, 'site-A');
  winDump(1794, 1808, 330, 352, 'site-B');
  const cellLine = (x: number, y: number): string => {
    const i = y * W + x;
    const f = (s: Snap): string => `${s.act[i]}:${s.typ[i]}h${s.hf[i]}s${s.sl[i]}`;
    return `  (${x},${y}) E=${f(pre)} X=${f(x105)} J=${f(post)} F=${f(fin!)}`;
  };
  console.log(`[cells:A]`);
  for (let y = 315; y <= 324; y++) for (let x = 1893; x <= 1898; x++) console.log(cellLine(x, y));
  console.log(`[cells:B]`);
  for (let y = 338; y <= 347; y++) for (let x = 1799; x <= 1804; x++) console.log(cellLine(x, y));
  let entry = 0;
  const entryBy: Record<string, number> = {};
  for (const [nm, k] of CHANS) {
    const A = pre[k]!, B = x104[k]!;
    let d = 0;
    for (let i = 0; i < N; i++) if (A[i] !== B[i]) d++;
    entryBy[nm] = d; entry += d;
  }
  console.log(`[entry] JS56 vs X104 total=${entry} ${JSON.stringify(entryBy)}`);
  // 写集分账（仅统计入口等价成立时的语义；否则仍输出供诊断）
  interface Row { x: number; y: number; ch: string; e: number; v: number; j: number; kind: string }
  const rows: Row[] = [];
  const kinds: Record<string, number> = {};
  for (const [nm, k] of CHANS) {
    const E = pre[k]!, V = x105[k]!, J = post[k]!;
    for (let i = 0; i < N; i++) {
      const vc = V[i] !== E[i], jc = J[i] !== E[i];
      if (!vc && !jc) continue;
      if (V[i] === J[i]) continue;   // 双改同值=收敛一致
      const kind = vc && jc ? 'BOTH' : vc ? 'V-ONLY' : 'J-ONLY';
      kinds[`${nm}:${kind}`] = (kinds[`${nm}:${kind}`] ?? 0) + 1;
      rows.push({ x: i % W, y: (i / W) | 0, ch: nm, e: E[i]!, v: V[i]!, j: J[i]!, kind });
    }
  }
  rows.sort((a, b) => (a.x - b.x) || (a.y - b.y));
  console.log(`[kinds]`, JSON.stringify(kinds));
  console.log(`[first 40 by scan order]`);
  for (const r of rows.slice(0, 40)) {
    console.log(`  (${r.x},${r.y}) ${r.ch} ${r.kind} entry=${r.e} x105=${r.v} js57=${r.j}`);
  }
  writeFileSync(`/tmp/ttt-out/${CHAIN}-105.json`, JSON.stringify({ kinds, rows: rows.slice(0, 4000) }));
}, 900_000);
