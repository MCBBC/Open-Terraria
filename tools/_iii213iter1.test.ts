// ★IIIII213 一次性仪⑤：#98 迭代1 锚对拍——rig x86-iter1/K.* + entries-1.txt vs
// JS jdump1/K.* + j-entries-1.txt（基座 snap97-remix）。
// 用法：cd game && SW_I213I1=1 npx vitest run tools/_iii213iter1.test.ts
import { it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const OUT = '/tmp/iii213-out';

// ★C档可移植:/tmp 对拍产物(本机一次性诊断面;缺=skip 不红)
const TMP_MISSING = !existsSync(`${OUT}/x86-iter1/K.liq`);
const W = 4200, H = 1200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); }
function u8(p: string): Uint8Array { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); }
it.skipIf(TMP_MISSING)('iii213 iter1 anchor diff', () => {
  const kL = u8(`${OUT}/x86-iter1/K.liq`), jL = u8(`${OUT}/jdump1/K.liq`);
  const kA = u8(`${OUT}/x86-iter1/K.act`), jA = u8(`${OUT}/jdump1/K.act`);
  const kT = le16(`${OUT}/x86-iter1/K.typ`), jT = le16(`${OUT}/jdump1/K.typ`);
  let dL = 0, dA = 0, dT = 0;
  const cells: { x: number; y: number; kl: number; jl: number }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (kA[i] !== jA[i]) dA++;
    if (kT[i] !== jT[i]) dT++;
    if (kL[i] !== jL[i]) { dL++; if (cells.length < 40) cells.push({ x, y, kl: kL[i], jl: jL[i] }); }
  }
  console.log(`iter1 anchor: dL=${dL} dA=${dA} dT=${dT}`);
  console.log('first liq-diff cells:', cells.slice(0, 40).map(c => `(${c.x},${c.y})k${c.kl}/j${c.jl}`).join(' '));
  // 按行聚类（前 25 行的差格直方）
  const byRow = new Map<number, number>();
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) { const i = y * W + x; if (kL[i] !== jL[i]) n++; } if (n) byRow.set(y, n); }
  console.log('liq-diff rows top25:', [...byRow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([y, n]) => `y${y}=${n}`).join(' '));
  // 池塘窗（x3660..3790, y108..126）对照栅格
  const row = (y: number) => {
    let s = '';
    for (let x = 3672; x <= 3700; x++) {
      const i = y * W + x;
      s += `${kL[i] === jL[i] ? '.' : '!'}${String(kL[i]).padStart(3)} `;
    }
    return s;
  };
  console.log('pond K.liq (x86) rows 108..126 (. = JS same):');
  for (let y = 108; y <= 126; y++) console.log(`y${String(y).padStart(4)} ${row(y)}`);
  // entries 列表对拍
  const ke = readFileSync(`${OUT}/x86-iter1/entries-1.txt`, 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
  const je = readFileSync(`${OUT}/j-entries-1.txt`, 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
  console.log(`entries: x86=${ke.length} js=${je.length}`);
  let firstEntryDiff = -1;
  const kset = new Map<string, number>();
  for (const l of ke) { const [x, y] = l.split(' '); kset.set(`${x},${y}`, (kset.get(`${x},${y}`) ?? 0) + 1); }
  const jset = new Map<string, number>();
  for (const l of je) { const [x, y] = l.split(' '); jset.set(`${x},${y}`, (jset.get(`${x},${y}`) ?? 0) + 1); }
  let onlyK = 0, onlyJ = 0;
  const onlyKCells: string[] = [], onlyJCells: string[] = [];
  for (const [k, n] of kset) { const m = jset.get(k) ?? 0; if (m < n) { onlyK += n - m; if (onlyKCells.length < 20) onlyKCells.push(k); } }
  for (const [k, n] of jset) { const m = kset.get(k) ?? 0; if (m < n) { onlyJ += n - m; if (onlyJCells.length < 20) onlyJCells.push(k); } }
  console.log(`list cells only-in-x86=${onlyK} only-in-js=${onlyJ}`);
  console.log('only-x86 sample:', onlyKCells.join(' '));
  console.log('only-js sample:', onlyJCells.join(' '));
  void firstEntryDiff;
});
