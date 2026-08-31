// IIII111 全通道终态对账：JS final_* vs dump076（含 frx/fry/wire/inact/ghost）
import { readFileSync } from 'node:fs';
const OUT = '/tmp/iii111-out';
const G2 = '/tmp/iii80-out/x86-jagged';
const W = 4200, N = W * 1200;
const rd = (p, wide) => { const b = readFileSync(p); return wide ? new Uint16Array(b.buffer, b.byteOffset, b.length >> 1) : new Uint8Array(b.buffer, b.byteOffset); };
const X = {
  t: rd(`${G2}/076_Traps.typ`, true), a: rd(`${G2}/076_Traps.act`), w: rd(`${G2}/076_Traps.wal`, true),
  hf: rd(`${G2}/076_Traps.half`), sl: rd(`${G2}/076_Traps.slope`), wi: rd(`${G2}/076_Traps.wire`),
  ia: rd(`${G2}/076_Traps.inact`), fx: rd(`${G2}/076_Traps.frx`, true), fy: rd(`${G2}/076_Traps.fry`, true),
};
const J = {
  flags: rd(`${OUT}/final_flags.bin`), t: rd(`${OUT}/final_type.bin`, true), w: rd(`${OUT}/final_wall.bin`, true),
  hf: rd(`${OUT}/final_half.bin`), sl: rd(`${OUT}/final_slope.bin`), wire: rd(`${OUT}/final_wire.bin`),
  fx: rd(`${OUT}/final_frameX.bin`, true), fy: rd(`${OUT}/final_frameY.bin`, true),
};
// SW tile → vanilla sheet 表
import { readFileSync as rf } from 'node:fs';
// 简化：从 tile defs 拿不到，改从 tr-rolls 无关——用 TrapsPass 同表：读 data/tiles.ts 太重
// ⇒ 由 mile8 已知 SHEET 映射；此处仅需要 active 差异与帧差异的坐标包络。type 以 sheet 域近似：
// 读 final_type 原始 SW id 直接对比会满图假差(SW id≠sheet)。所以本脚本只做:
//   act / wall / half / slope / wire(0..31) / inact / frameX / frameY —— 8 个无映射通道。
const buckets = {};
let total = 0;
const cells = [];
for (let i = 0; i < N; i++) {
  const d = [];
  const jA = J.flags[i] & 1;
  if ((X.a[i] ? 1 : 0) !== jA) d.push('act');
  if (jA && (X.fx[i] !== (J.fx[i] & 0xffff) || X.fy[i] !== (J.fy[i] & 0xffff))) d.push('frame');
  if (X.w[i] !== J.w[i]) d.push('wall');
  if (X.hf[i] !== J.hf[i]) d.push('half');
  if (X.sl[i] !== J.sl[i]) d.push('slope');
  if ((X.wi[i] & 31) !== (J.wire[i] & 31)) d.push(`wire${X.wi[i] & 31}>${J.wire[i] & 31}`);
  if ((X.ia[i] ? 1 : 0) !== ((J.wire[i] >>> 5) & 1)) d.push('inact');
  if (d.length) {
    total++;
    const key = d.join('+');
    buckets[key] = (buckets[key] ?? 0) + 1;
    if (d.join() !== 'act' || true) cells.push([i % W, Math.floor(i / W), key]);
  }
}
console.log('total diffs:', total);
console.log(Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 12));
for (const [x, y, k] of cells.slice(0, 40)) console.log(`(${x},${y}) ${k}`);
