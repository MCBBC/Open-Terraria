// TTTTTTT 批一次性探针②：二次沉降槽写集分账（g/ntb #98 液型族定罪）
// 方法：JS 槽 49 末（微群系后=pre）与槽 50 末（二次沉降=post）双快照，
// 对 x86 dump 097/098 做「写集分账」+ 空间聚类（连通域 bbox）。
// 用法：cd game && SW_T=1 SW_MB_1457=1 SW_T_CHAIN=g npx vitest run tools/_ttt2.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_T === '1';
const CHAIN = process.env.SW_T_CHAIN ?? 'g';
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
function findSuffix(idx: number): string {
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m && Number(m[1]) === idx) return `_${m[2]}`;
  }
  throw new Error(`dump ${idx} not found`);
}
interface Snap { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array; lty: Uint8Array; hf: Uint8Array; sl: Uint8Array; ia: Uint8Array }
function loadX(idx: number): Snap {
  const suf = findSuffix(idx);
  const pre = `${G2}/${String(idx).padStart(3, '0')}${suf}`;
  return maskX(loadRawX(pre));
}
function maskX(s: ReturnType<typeof loadRawX>): Snap {
  const typ = new Uint16Array(N), lty = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    typ[i] = s.act[i] ? s.typ[i]! : 0;
    lty[i] = s.liq[i]! > 0 ? s.lty[i]! : 0;
  }
  return { ...s, typ, lty };
}
function loadRawX(pre: string) {
  return {
    typ: le16(`${pre}.typ`), act: readFileSync(`${pre}.act`), wal: le16(`${pre}.wal`),
    liq: readFileSync(`${pre}.liq`), lty: readFileSync(`${pre}.lty`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), ia: readFileSync(`${pre}.inact`),
  };
}
type Store = { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array };
function snap(st: Store): Snap {
  const r = {
    typ: new Uint16Array(N), act: new Uint8Array(N), wal: new Uint16Array(N), liq: new Uint8Array(N),
    lty: new Uint8Array(N), hf: new Uint8Array(N), sl: new Uint8Array(N), ia: new Uint8Array(N),
  };
  for (let i = 0; i < N; i++) {
    const a = st.flags[i]! & 1;
    r.act[i] = a;
    r.typ[i] = a ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    r.wal[i] = st.wall[i]!; r.liq[i] = st.liquid[i]!;
    r.lty[i] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0;
    r.hf[i] = st.half[i]!; r.sl[i] = st.slope[i]!; r.ia[i] = (st.wire[i]! >>> 5) & 1;
  }
  return r;
}
(RUN ? it : it.skip)('TTT② settle-slot write accounting', async () => {
  const x97 = loadX(97), x98 = loadX(98);
  let pre: Snap | null = null, post: Snap | null = null;
  await generateWorld({
    width: W, height: H, seedText: cfg.seed, evil: cfg.evil as -1 | 0 | 1,
    seedFlags: cfg.flags,
    onWorldPartial: (w, i) => {
      if (i === 49 && !pre) {
        pre = snap(w.store as never as Store);
        // 焦点格：#98 单格 tile 债主（g 链 (2749,1100) 棺木 42）——帧/液/型全息
        const st = w.store as never as Store & { frameX: Uint16Array; frameY: Int32Array };
        const cx = Number(process.env.SW_T_FX ?? 2749), cy = Number(process.env.SW_T_FY ?? 1100);
        const k = cy * W + cx;
        console.log(`[focus@slot${i}] (${cx},${cy}) act=${st.flags[k]} typ=${st.type[k]} sheet=${SHEET[st.type[k]]} fx=${st.frameX?.[k]} fy=${st.frameY?.[k]} liq=${st.liquid[k]} lty=${st.liquidType[k]}`);
        // 邻域竖剖面
        for (let y = cy - 3; y <= cy + 2; y++) {
          const j = y * W + cx;
          console.log(`   (${cx},${y}) act=${st.flags[j]} sheet=${SHEET[st.type[j]]} liq=${st.liquid[j]} lty=${st.liquidType[j]}`);
        }
      }
      if (i === 50 && !post) {
        post = snap(w.store as never as Store);
        const st = w.store as never as Store & { frameX: Uint16Array; frameY: Int32Array };
        const cx = Number(process.env.SW_T_FX ?? 2749), cy = Number(process.env.SW_T_FY ?? 1100);
        const k = cy * W + cx;
        console.log(`[focus@slot${i}] (${cx},${cy}) act=${st.flags[k]} typ=${st.type[k]} sheet=${SHEET[st.type[k]]} fx=${st.frameX?.[k]} fy=${st.frameY?.[k]} liq=${st.liquid[k]} lty=${st.liquidType[k]}`);
      }
    },
  });
  if (!pre || !post) throw new Error('snapshots missing');
  const CHANS: Array<[string, keyof Snap]> = [
    ['act', 'act'], ['typ', 'typ'], ['wal', 'wal'], ['liq', 'liq'], ['lty', 'lty'], ['hf', 'hf'], ['sl', 'sl'], ['ia', 'ia'],
  ];
  let entry = 0;
  const entryBy: Record<string, number> = {};
  for (const [nm, k] of CHANS) {
    const A = pre[k]!, B = x97[k]!;
    let d = 0;
    for (let i = 0; i < N; i++) if (A[i] !== B[i]) d++;
    entryBy[nm] = d; entry += d;
  }
  console.log(`[entry] JS49 vs X097 total=${entry} ${JSON.stringify(entryBy)}`);
  // 差异格清单（终态）
  const diffCells: Array<{ i: number; ch: string; e: number; v: number; j: number }> = [];
  const chCount: Record<string, number> = {};
  for (const [nm, k] of CHANS) {
    const V = x98[k]!, J = post[k]!, E = pre[k]!;
    let d = 0;
    for (let i = 0; i < N; i++) {
      if (V[i] !== J[i]) { d++; diffCells.push({ i, ch: nm, e: E[i]!, v: V[i]!, j: J[i]! }); }
    }
    chCount[nm] = d;
  }
  console.log(`[final-diff] JS50 vs X098 ${JSON.stringify(chCount)}`);
  // 聚类：以 liq/lty/typ 任一差为种子做 4 邻连通域
  const seedMask = new Uint8Array(N);
  for (const c of diffCells) if (c.ch === 'liq' || c.ch === 'lty' || c.ch === 'typ' || c.ch === 'act') seedMask[c.i] = 1;
  const seen = new Uint8Array(N);
  const clusters: Array<{ n: number; x0: number; x1: number; y0: number; y1: number }> = [];
  const stack: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!seedMask[s0] || seen[s0]) continue;
    stack.length = 0; stack.push(s0); seen[s0] = 1;
    let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length > 0) {
      const i = stack.pop()!;
      n++;
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && seedMask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < W - 1 && seedMask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && seedMask[i - W] && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W); }
      if (y < H - 1 && seedMask[i + W] && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W); }
    }
    clusters.push({ n, x0, x1, y0, y1 });
  }
  clusters.sort((a, b) => b.n - a.n);
  console.log(`[clusters] n=${clusters.length}, top12:`);
  for (const c of clusters.slice(0, 12)) {
    console.log(`  bbox x∈[${c.x0},${c.x1}] y∈[${c.y0},${c.y1}] (${c.x1 - c.x0 + 1}×${c.y1 - c.y0 + 1}) n=${c.n}`);
  }
  // 样本：每簇首格的 8 通道上下文
  for (const c of clusters.slice(0, 6)) {
    const cx = Math.floor((c.x0 + c.x1) / 2), cy = Math.floor((c.y0 + c.y1) / 2);
    console.log(`[ctx @(${cx},${cy})] x∈[${cx - 2},${cx + 2}] 行=E/X/J 三态 act|liq|lty|typ:`);
    for (let y = cy - 2; y <= cy + 2; y++) {
      const parts: string[] = [];
      for (const S of [pre!, x98, post!] as Snap[]) {
        const row: string[] = [];
        for (let x = cx - 2; x <= cx + 2; x++) {
          const i = y * W + x;
          row.push(`${S.act[i]}${S.liq[i]}·${S.lty[i]}·${S.typ[i]}`);
        }
        parts.push(row.join(' '));
      }
      console.log(`  y=${y}  E:${parts[0]} | X:${parts[1]} | J:${parts[2]}`);
    }
  }
  writeFileSync(`/tmp/ttt-out/${CHAIN}-98.json`, JSON.stringify({ entry, chCount, clusters: clusters.slice(0, 60), diffCells: diffCells.slice(0, 3000) }));
}, 900_000);
