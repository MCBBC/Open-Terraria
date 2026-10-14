// ★692b:真链 Abyss 熵包络——两次真实 Abyss 完成态快照互 diff(snap FNV 已各自验证)。
// 包络≈我方重放残差 → 我方残差=熵地板(不可逐位);包络≪残差 → 实现差仍在。
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const W = 4200, H = 1200;
function load(p: string) {
  const buf = gunzipSync(readFileSync(p));
  const type = new Uint16Array(W * H), wall = new Uint16Array(W * H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const o = (x * H + y) * 4;   // x 主序探针 dump
    type[y * W + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * W + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return type;
}
const A = load('/tmp/genprobe-consolidated-snaps/genprobe-snap-121-pre-Abyss.bin.gz');   // 2d0c809a
const B = load('/tmp/genprobe-b-snaps/genprobe-snap-02-post-Abyss.bin.gz');              // a3227d38

let diff = 0, abyssDiff = 0;
const byType = new Map<string, number>();
const yBands = new Map<number, number>();
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
  const i = y * W + x;
  if (A[i] !== B[i]) {
    diff++;
    if (x >= 3860) {
      abyssDiff++;
      byType.set(`${A[i]}→${B[i]}`, (byType.get(`${A[i]}→${B[i]}`) ?? 0) + 1);
      yBands.set(Math.floor(y / 100) * 100, (yBands.get(Math.floor(y / 100) * 100) ?? 0) + 1);
    }
  }
}
console.log(`真 A vs 真 B: 全图 diff=${diff} (${((diff / (W * H)) * 100).toFixed(3)}%)`);
console.log(`abyss 区(x≥3860) diff=${abyssDiff}`);
console.log('y 带:', [...yBands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b, c]) => `${b}:${c}`).join(' '));
console.log('TOP12:', [...byType.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12).map(([k, c]) => `${k}:${c}`).join(' '));
process.exit(0);
