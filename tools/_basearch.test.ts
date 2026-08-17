// 一次性诊断：vserver 基线 wld(arm64 slice 生成) vs x86 真值 dump(105_Final_Cleanup)
// —— 验证「矩阵基线=arm64 架构 FP 世界」假说。小世界 s9293480。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = !!process.env.SW_BASEARCH;
(RUN ? it : it.skip)('baseline arch check', () => {
  const a = parseWld(new Uint8Array(readFileSync('/tmp/vserver/s9293480.wld')));
  const W = a.tilesWide, H = a.tilesHigh, n = W * H;
  const typ = new Uint8Array(readFileSync('/tmp/sw-ycal/van22/105_Final_Cleanup.typ')).length === n * 2
    ? new Uint16Array(readFileSync('/tmp/sw-ycal/van22/105_Final_Cleanup.typ').buffer, 0, n) : null;
  if (!typ) throw new Error('van22 typ 尺寸不符');
  const act = new Uint8Array(readFileSync('/tmp/sw-ycal/van22/105_Final_Cleanup.act'));
  let actDiff = 0, typeDiff = 0;
  const pairs: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const va = a.tiles.active[i] === 1, vx = act[i] === 1;
    if (va !== vx) { actDiff++; continue; }
    if (!va) continue;
    if (a.tiles.type[i] !== typ[i]) {
      typeDiff++;
      const k = `${typ[i]}>${a.tiles.type[i]}`;
      pairs[k] = (pairs[k] ?? 0) + 1;
    }
  }
  console.log(`vserver(s9293480,arm64?) vs x86 truth105: actDiff=${actDiff} activeTypeDiff=${typeDiff}`);
  console.log('top pairs:', Object.entries(pairs).sort((x, y) => y[1] - x[1]).slice(0, 8));
  console.log(`typ%(active-gated)=${(((actDiff + typeDiff) / n) * 100).toFixed(3)}%`);
}, 300_000);
