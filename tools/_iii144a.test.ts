// IIIII111b 一次性反演分解仪（用毕可删）：薄冰受理窗双锚增量分解。
// 锚A=瀑布唇缘槽末（JS）vs x86 #054_Waterfalls；锚B=薄冰槽末（JS）vs x86 #055_Ice。
// 薄冰 pass 扫描相零掷骰 ⇒ 双侧 #054→#055 的逐格增量即"该 pass 纯函数行为真值"，
// 增量差集 = 受理面分歧（与上游继承债解耦：只看双侧本窗内动过的格）。
// 运行：cd game && SW_I144A=1 SW_I144_G2=$HOME/GoldenChains/golden-win npx vitest run tools/_iii144a.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I144A === '1';
const G2 = process.env.SW_I144_G2 ?? '';
const SEED = process.env.SW_I144_SEED ?? '20260907';
const OUT = process.env.SW_I144_OUT ?? '/tmp/iii144-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface X8 { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array }
function x8(dir: string, name: string): X8 {
  const pre = `${dir}/${name}`;
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
  };
}
type Snap = {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array;
};

(RUN ? it : it.skip)('thin-ice acceptance window dual-anchor inversion', async () => {
  if (!G2) throw new Error('need SW_I144_G2');
  const dumpNames = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) dumpNames.set(Number(m[1]), m[2]);
  }
  const nm54 = dumpNames.get(54)!, nm55 = dumpNames.get(55)!;
  if (!nm54 || !nm55 || !nm54.includes('Waterfall') || !nm55.includes('Ice')) {
    throw new Error(`dump 名不符: #54=${nm54} #55=${nm55}`);
  }
  const x54 = x8(G2, `054_${nm54}`);
  const x55 = x8(G2, `055_${nm55}`);
  const N = W * H;

  // JS 双锚快照（slot14/slot15 末态），取完两锚立刻中止生成省时
  class Aborted extends Error {}
  const snaps: Record<string, Snap> = {};
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED,
      seedFlags: { worldIsFrozen: true },
      onWorldPartial: (w, _i, pn) => {
        if (pn === '瀑布唇缘' && !snaps.A) snaps.A = snap(w.store as never);
        if (pn === '薄冰' && !snaps.B) { snaps.B = snap(w.store as never); throw new Aborted(); }
      },
    });
  } catch (e) {
    if (!(e instanceof Aborted)) throw e;
  }
  const A = snaps.A!, B = snaps.B!;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const sh = (s: number): number => (s >= 0 ? s : 9999);

  // ── 增量提取（act/type 合成通道）──
  const xSet = new Map<number, string>();
  let xAdd162 = 0;
  for (let i = 0; i < N; i++) {
    const a0 = x54.a[i]!, a1 = x55.a[i]!;
    const t0 = a0 ? x54.t[i]! : 0, t1 = a1 ? x55.t[i]! : 0;
    if (a0 !== a1 || t0 !== t1) {
      xSet.set(i, `${a0}#${t0}>${a1}#${t1}`);
      if (a1 && t1 === 162 && !(a0 === 1 && t0 === 162)) xAdd162++;
    }
  }
  const jSet = new Map<number, string>();
  let jAdd162 = 0;
  for (let i = 0; i < N; i++) {
    const ja0 = A.flags[i] & 1, ja1 = B.flags[i] & 1;
    const jt0 = ja0 ? sh(SHEET[A.type[i]]) : 0;
    const jt1 = ja1 ? sh(SHEET[B.type[i]]) : 0;
    if (ja0 !== ja1 || jt0 !== jt1) {
      jSet.set(i, `${ja0}#${jt0}>${ja1}#${jt1}`);
      if (ja1 && jt1 === 162 && !(ja0 === 1 && jt0 === 162)) jAdd162++;
    }
  }

  // ── 受理面分歧（双侧任一在窗内动过）──
  const onlyX: number[] = [], onlyJ: number[] = [];
  let bothDiffPost = 0;
  const pairOnlyX = new Map<string, number>();
  const pairOnlyJ = new Map<string, number>();
  const setOf = new Set<number>([...xSet.keys(), ...jSet.keys()]);
  for (const i of setOf) {
    const xi = xSet.get(i), ji = jSet.get(i);
    const vt = x55.a[i] ? x55.t[i]! : 0;
    const jb = B.flags[i] & 1;
    const jt = jb ? sh(SHEET[B.type[i]]) : 0;
    if (xi && ji) {
      if (vt !== jt) bothDiffPost++;
      continue;
    }
    if (xi && !ji) {
      onlyX.push(i);
      const k = `${xi}@(${i % W},${(i / W) | 0})`;
      pairOnlyX.set(xi, (pairOnlyX.get(xi) ?? 0) + 1);
      void k;
    } else {
      onlyJ.push(i);
      pairOnlyJ.set(ji!, (pairOnlyJ.get(ji!) ?? 0) + 1);
    }
  }
  // 行聚类
  function cluster(src: number[]): Array<{ y: number; x0: number; x1: number; n: number }> {
    const m = new Map<number, number[]>();
    for (const i of src) {
      const y = (i / W) | 0, x = i % W;
      let arr = m.get(y);
      if (!arr) m.set(y, arr = []);
      arr.push(x);
    }
    const out: Array<{ y: number; x0: number; x1: number; n: number }> = [];
    for (const [y, xs] of [...m.entries()].sort((p, q) => p[0] - q[0])) {
      xs.sort((p, q) => p - q);
      let x0 = xs[0]!, prev = xs[0]!, n = 1;
      for (let k = 1; k < xs.length; k++) {
        if (xs[k]! - prev <= 3) { prev = xs[k]!; n++; continue; }
        out.push({ y, x0, x1: prev, n });
        x0 = xs[k]!; prev = xs[k]!; n = 1;
      }
      out.push({ y, x0, x1: prev, n });
    }
    return out.sort((a, b) => b.n - a.n);
  }
  const clX = cluster(onlyX), clJ = cluster(onlyJ);

  // 其他通道窗内增量差（wall/liquid/half/slope）
  function chanInc(chB: keyof Snap, xv: (x: X8) => Uint8Array | Uint16Array): number {
    let n = 0;
    for (const i of setOf) {
      const dx = xv(x55)[i] !== xv(x54)[i];
      const dj = ch(chB, B)[i] !== ch(chB, A)[i];
      if (dx !== dj || ((dx || dj) && xv(x55)[i]! !== ch(chB, B)[i])) n++;
    }
    return n;
  }
  const ch = <T extends Uint8Array | Uint16Array>(k: string, s: Snap): T => s[k as keyof Snap] as unknown as T;
  void ch;
  const dWallWin = chanInc('wall', (x) => x.w);
  const dLiqWin = chanInc('liquid', (x) => x.l);
  const dHalfWin = chanInc('half', (x) => x.hf);
  const dSlopeWin = chanInc('slope', (x) => x.sl);

  console.log(`[I144A] ${G2}`);
  console.log(`[I144A] #054=${nm54} #055=${nm55}`);
  console.log(`[I144A] 窗内增量格数: x86=${xSet.size} js=${jSet.size}`);
  console.log(`[I144A] 薄冰新增: x86 T162+=${xAdd162} js T162+=${jAdd162}`);
  console.log(`[I144A] onlyX=${onlyX.length} onlyJ=${onlyJ.length} bothDiffPost=${bothDiffPost}`);
  console.log('[I144A] onlyX 增量形态 top:', [...pairOnlyX.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => `${k}×${c}`).join(' '));
  console.log('[I144A] onlyJ 增量形态 top:', [...pairOnlyJ.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => `${k}×${c}`).join(' '));
  console.log(`[I144A] 窗内其他通道增量分歧: wall=${dWallWin} liq=${dLiqWin} half=${dHalfWin} slope=${dSlopeWin}`);
  console.log('[I144A] onlyX clusters(top24):');
  for (const c of clX.slice(0, 24)) console.log(`   y=${c.y} x∈[${c.x0},${c.x1}] n=${c.n}`);
  console.log('[I144A] onlyJ clusters(top24):');
  for (const c of clJ.slice(0, 24)) console.log(`   y=${c.y} x∈[${c.x0},${c.x1}] n=${c.n}`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/thinice-win.json`, JSON.stringify({
    g2: G2, dump54: nm54, dump55: nm55,
    xSetSize: xSet.size, jSetSize: jSet.size, xAdd162, jAdd162,
    onlyXCount: onlyX.length, onlyJCount: onlyJ.length, bothDiffPost,
    topPairOnlyX: [...pairOnlyX.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    topPairOnlyJ: [...pairOnlyJ.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    channels: [dWallWin, dLiqWin, dHalfWin, dSlopeWin],
    clX: clX.slice(0, 300), clJ: clJ.slice(0, 300),
  }, null, 1));
  console.log(`[I144A] report -> ${OUT}/thinice-win.json`);
}, 900_000);

function snap(store: unknown): Snap {
  const st = store as Record<string, Uint8Array | Uint16Array>;
  const cp = <T extends Uint8Array | Uint16Array>(a: T): T => {
    const o = new a.constructor(a.length) as T;
    o.set(a);
    return o;
  };
  return {
    type: cp(st.type as Uint16Array), flags: cp(st.flags as Uint8Array),
    wall: cp(st.wall as Uint16Array), liquid: cp(st.liquid as Uint8Array),
    liquidType: cp(st.liquidType as Uint8Array), half: cp(st.half as Uint8Array),
    slope: cp(st.slope as Uint8Array),
  };
}
