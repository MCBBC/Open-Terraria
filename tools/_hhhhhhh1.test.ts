// 一次性诊断（HHHHHHH 批）：s22222 / m20260811 两链 8 通道重产 dump 的 rig sanity——
// 槽 105（Final_Cleanup 终态）vs 织入跑自产 .wld（同跑确定性锚）。豁免口径=JJJJ/AAAAA
// 记录两处格式假差：①非活性幽灵 typ（wld 不存非活性 type）②微光 lty==3 ↔ 水类型
// （wld liquidType 无微光档,shimmer 位在别处）。
// 用法：cd game && SW_H1=1 npx vitest run tools/_hhhhhhh1.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_H1 === '1';
const CHAINS = [
  { name: 's22222', wld: '/tmp/hhhhhhh-home-s22222/w.wld', dump: '/tmp/sw-slp/g-s22222-8ch', W: 4200, H: 1200 },
  { name: 'm20260811', wld: '/tmp/hhhhhhh-home-m20260811/w.wld', dump: '/tmp/sw-slp/g-m20260811-8ch', W: 6400, H: 1800 },
];
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)('weave sanity: slot105 dump vs self .wld', () => {
  for (const c of CHAINS) {
    if (!existsSync(c.wld)) throw new Error(`wld 缺失 ${c.wld}`);
    const w = parseWld(new Uint8Array(readFileSync(c.wld)));
    const n = c.W * c.H;
    if (w.tilesWide !== c.W || w.tilesHigh !== c.H) throw new Error(`${c.name}: wld 尺寸 ${w.tilesWide}x${w.tilesHigh} ≠ ${c.W}x${c.H}`);
    const pre = `${c.dump}/105_Final_Cleanup`;
    const d = {
      typ: le16(`${pre}.typ`), act: readFileSync(`${pre}.act`), wal: le16(`${pre}.wal`),
      liq: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
      lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
    };
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
    let ghostExempt = 0, shimExempt = 0;
    const tPairs = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const va = d.act[i]!, ja = w.tiles.active[i]! ? 1 : 0;   // ★number 对 number（===跨型恒不等）
      if (va !== ja) { dA++; continue; }
      if (d.wal[i] !== w.tiles.wall[i]) dW++;
      if (d.hf[i] !== w.tiles.half[i]) dHf++;
      if (d.sl[i] !== w.tiles.slope[i]) dSl++;
      const via = d.ia[i]! ? 1 : 0, jia = (w.tiles.wire[i]! >>> 5) & 1;
      if (via !== jia) dIa++;
      if (va) {
        if (d.typ[i] !== w.tiles.type[i]) {
          dT++;
          const k = `${d.typ[i]}>${w.tiles.type[i]}`;
          tPairs.set(k, (tPairs.get(k) ?? 0) + 1);
        }
        // lty：湿格裁决（dump vanilla 0 基水/1岩浆/2蜜/3微光 ↔ wld 1水/2岩浆/3蜂蜜
        //   ——dump 侧 +1 对齐；微光=3 在 wld 无档存成水 → 特例豁免）
        const vl = d.liq[i]! > 0 ? d.lt[i]! + 1 : 0;
        const jl = w.tiles.liquid[i]! > 0 ? w.tiles.liquidType[i]! : 0;
        if (d.liq[i] !== w.tiles.liquid[i]) dL++;
        if (vl !== jl) {
          if (d.lt[i] === 3) shimExempt++;
          else dLt++;
        }
      } else {
        // 非活性幽灵 typ：wld 不存（格式豁免,只计数）
        if (d.typ[i] !== 0) ghostExempt++;
      }
    }
    console.log(`${c.name}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} ` +
      `(豁免: ghost=${ghostExempt} shimmerLty3=${shimExempt})`);
    if (dT > 0) console.log(`  top T pairs: ${[...tPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`).join(' ')}`);
    const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
    if (bad) throw new Error(`${c.name} sanity FAIL: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}`);
  }
  console.log('sanity PASS (both chains, slot105 vs self wld, 8ch)');
}, 600_000);
