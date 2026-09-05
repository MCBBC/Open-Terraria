// IIII198: gen2-g x86 罐帧 PlacePot 一致性核查 + iamerror 杀簇连通分量
import { it } from 'vitest';
import { readFileSync } from 'node:fs';

const W = 4200, H = 1200, N = W * H;
const G4 = `${process.env.HOME}/GoldenChains/gen2-g/104_Remove_Broken_Traps`;

it('iii198 x86 pot frame conformance (gen2-g)', () => {
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const rdu8 = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  const t4 = rd16(`${G4}.typ`), a4 = rdu8(`${G4}.act`), fx4 = rd16(`${G4}.frx`), fy4 = rd16(`${G4}.fry`);
  const wrap2 = (v: number) => { let n = Math.floor(v / 18); while (n > 1) n -= 2; return n; };
  // 对每个活性 t28 格:解码锚窗,检查 4 格互洽(活性+型+fx相位+fy精确)
  let total = 0, consistent = 0, badSamples: string[] = [];
  const potsSeen = new Set<number>();
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x;
    if (!(a4[i] & 1) || t4[i] !== 28) continue;
    total++;
    const x0 = x - wrap2(fx4[i]);
    let n3 = Math.floor(fy4[i] / 18), num4 = 0;
    while (n3 > 1) { n3 -= 2; num4++; }
    const y0 = y - n3;
    let ok = true; const det: string[] = [];
    for (let k = x0; k < x0 + 2 && ok; k++) for (let l = y0; l < y0 + 2; l++) {
      const q = l * W + k;
      const good = (a4[q] & 1) && t4[q] === 28 && wrap2(fx4[q]) === k - x0 && fy4[q] === (l - y0) * 18 + num4 * 36;
      if (!good) { ok = false; det.push(`(${k},${l})a${a4[q] & 1}t${t4[q]}fx${fx4[q]}fy${fy4[q]}`); }
    }
    if (ok) consistent++;
    else if (badSamples.length < 10) badSamples.push(`(${x},${y})anchor(${x0},${y0})s${num4}: ${det.join(' | ')}`);
    // 罐计数(以左上角去重)
    potsSeen.add(y0 * W + x0);
  }
  console.log(`[frx] 活性罐格=${total} 罐数(左上去重)=${potsSeen.size} 帧互洽格=${consistent}`);
  for (const s of badSamples) console.log('  BAD ' + s);
  // fx num 块分布(0/36/72)
  const blocks = new Map<number, number>();
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x;
    if ((a4[i] & 1) && t4[i] === 28) blocks.set(fx4[i], (blocks.get(fx4[i]) ?? 0) + 1);
  }
  console.log(`[frx] fx 值分布: ${[...blocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`).join(' ')}`);
}, 600_000);
