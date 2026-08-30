// IIII84 GFB-D 刀①：双 .wld 瓦片内容等价对拍（rig61 wv 仪跑 vs rig85 G2 链）——
// 中立性复核（两 rig 版本号面 326/325 与时间戳字段差异不构成世界差异证据）。
// 用法：cd game && SW_III88WLD=1 npx vitest run tools/_iii88wld.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = !!process.env.SW_III88WLD;
const A = process.env.SW_III88_A ?? '/tmp/iii88-out/x86-wv/w.wld';
const B = process.env.SW_III88_B ?? '/tmp/iii85-out/x86-gfb-c/w.wld';
const CAP = Number(process.env.SW_III88_CAP ?? 12);

(RUN ? it : it.skip)('rig61 vs G2 w.wld tiles equality', () => {
  const wa = parseWld(new Uint8Array(readFileSync(A)));
  const wb = parseWld(new Uint8Array(readFileSync(B)));
  console.log(`A=${A} v=${wa.version} ${wa.tilesWide}x${wa.tilesHigh}`);
  console.log(`B=${B} v=${wb.version} ${wb.tilesWide}x${wb.tilesHigh}`);
  if (wa.tilesWide !== wb.tilesWide || wa.tilesHigh !== wb.tilesHigh) throw new Error('尺寸不一致');
  const W2 = wa.tilesWide, H2 = wa.tilesHigh, N2 = W2 * H2;
  const ta = wa.tiles, tb = wb.tiles;
  let dActive = 0, dType = 0, dWall = 0, dLiq = 0, dLt = 0, dHf = 0, dSl = 0, dIa = 0, dFx = 0, dFy = 0;
  const firsts: string[] = [];
  for (let i = 0; i < N2; i++) {
    // vanilla 列优先 → 行序换算
    const x = Math.floor(i / H2), y = i % H2;
    const j = y * W2 + x;
    const badA = ta.active[i] !== tb.active[j];
    if (badA) dActive++;
    if (ta.type[i] !== tb.type[j]) { dType++; }
    if (ta.wall[i] !== tb.wall[j]) dWall++;
    if (ta.liquid[i] !== tb.liquid[j]) dLiq++;
    if ((ta.liquid[i] ? ta.liquidType[i] : 0) !== (tb.liquid[j] ? tb.liquidType[j] : 0)) dLt++;
    if (ta.half[i] !== tb.half[j]) dHf++;
    if (ta.slope[i] !== tb.slope[j]) dSl++;
    if (ta.wire[i] !== tb.wire[j]) dIa++;
    if (badA && ta.active[i] === tb.active[j]) {
      /* same act diff sub-bits handled by other counters */
    }
    if (ta.frameX[i] !== tb.frameX[j]) dFx++;
    if (ta.frameY[i] !== tb.frameY[j]) dFy++;
    if (firsts.length < CAP && (badA || ta.type[i] !== tb.type[j] || ta.wall[i] !== tb.wall[j])) {
      firsts.push(`(${x},${y}) t${ta.active[i] ? ta.type[i] : '-'}|${tb.active[j] ? tb.type[j] : '-'} w${ta.wall[i]}|${tb.wall[j]}`);
    }
  }
  console.log(`diffs act=${dActive} type=${dType} wall=${dWall} liq=${dLiq} lt=${dLt}`
    + ` hf=${dHf} sl=${dSl} ia=${dIa} fx=${dFx} fy=${dFy}`);
  console.log('first:', firsts.join(' | ') || '(none)');
  if (dActive + dType + dWall + dLiq + dLt + dHf + dSl + dIa > 0) {
    throw new Error('NEUTRALITY FAIL — 两 rig 同配方世界内容不等，禁用该仪读数');
  }
  console.log('NEUTRAL ✓ rig61 == rig85(G2) 世界瓦片内容全等');
});
