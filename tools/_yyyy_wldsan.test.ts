// YYYY 批一次性探针：dump 链槽 105 八通道 vs /tmp/vserver86 基线 .wld 逐格 sanity。
// 豁免口径（JJJJ 批沿袭）：① 非活性幽灵 type（dump 保 type、.wld 不落非活性格 type）
// ② lty==3 微光折叠（.wld=水类型+独立 shimmer 位）。头锚 ground/rock/dungeon/moon 另行全等断言。
// 用法：cd game && SW_YS=1 SW_YS_G2=/tmp/sw-slp/g-s22222 SW_YS_WLD=/tmp/vserver86/s22222.wld \
//        SW_YS_W=4200 SW_YS_H=1200 npx vitest run tools/_yyyy_wldsan.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_YS === '1';
const G2 = process.env.SW_YS_G2 ?? '/tmp/sw-slp/g-s22222';
const WLDP = process.env.SW_YS_WLD ?? '/tmp/vserver86/s22222.wld';
const W = Number(process.env.SW_YS_W ?? 4200), H = Number(process.env.SW_YS_H ?? 1200), N = W * H;

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)('slot105 8ch vs vanilla wld', () => {
  const pre = `${G2}/105_Final_Cleanup`;
  const dt = le16(`${pre}.typ`), da = readFileSync(`${pre}.act`), dw = le16(`${pre}.wal`);
  const dl = readFileSync(`${pre}.liq`), dhf = readFileSync(`${pre}.half`);
  const dsl = readFileSync(`${pre}.slope`), dlt = readFileSync(`${pre}.lty`), dia = readFileSync(`${pre}.inact`);
  const wld = parseWld(new Uint8Array(readFileSync(WLDP)));
  const t = wld.tiles;
  if (wld.tilesWide !== W || wld.tilesHigh !== H) throw new Error(`尺寸不符 ${wld.tilesWide}x${wld.tilesHigh}`);
  console.log(`wld: seed=${wld.seed} evil=${wld.isCrimson ? 'crim' : 'corr'} gl=${wld.groundLevel} rl=${wld.rockLevel} dg=(${wld.dungeonX},${wld.dungeonY}) spawn=(${wld.spawnX},${wld.spawnY}) moon=${wld.moonType}`);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  let exGhost = 0, exShim = 0;
  const samples: string[] = [];
  const first: Record<string, string> = {};
  for (let i = 0; i < N; i++) {
    const va = da[i]!, ja = t.active[i]! ? 1 : 0;
    if (va !== ja) { dA++; if (!first.A) first.A = `(${i % W},${(i / W) | 0}) v${va} j${ja}`; if (samples.length < 10) samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    if (va && ja) {
      if (dt[i]! !== t.type[i]!) { dT++; if (!first.T) first.T = `(${i % W},${(i / W) | 0}) v${dt[i]} j${t.type[i]}`; if (samples.length < 10) samples.push(`T(${i % W},${(i / W) | 0}) v${dt[i]} j${t.type[i]}`); }
    } else if (va !== ja) { /* 已计 A */ }
    else { exGhost++; } // 非活性：dump 幽灵 type 不裁决（豁免①）
    if (dw[i]! !== t.wall[i]!) { dW++; if (!first.W) first.W = `(${i % W},${(i / W) | 0}) v${dw[i]} j${t.wall[i]}`; }
    if (dl[i]! !== t.liquid[i]!) { dL++; if (!first.L) first.L = `(${i % W},${(i / W) | 0}) v${dl[i]} j${t.liquid[i]}`; }
    if (dhf[i]! !== t.half[i]!) { dHf++; if (!first.Hf) first.Hf = `(${i % W},${(i / W) | 0}) v${dhf[i]} j${t.half[i]}`; }
    if (dsl[i]! !== t.slope[i]!) { dSl++; if (!first.Sl) first.Sl = `(${i % W},${(i / W) | 0}) v${dsl[i]} j${t.slope[i]}`; if (samples.length < 10) samples.push(`S(${i % W},${(i / W) | 0}) v${dsl[i]} j${t.slope[i]}`); }
    // lty：liquid>0 才裁决；dump lty==3=微光（.wld 折叠为水+shimmer 位）豁免②
    if (dl[i]! > 0 && t.liquid[i]! > 0) {
      if (dlt[i] === 3) { exShim++; }
      else {
        const vmap = dlt[i]! === 0 ? 1 : dlt[i]! === 1 ? 2 : dlt[i]! === 2 ? 3 : -1;
        if (vmap !== t.liquidType[i]!) { dLt++; if (!first.Lt) first.Lt = `(${i % W},${(i / W) | 0}) v${dlt[i]}(${vmap}) j${t.liquidType[i]}`; }
      }
    }
    const via = dia[i]! ? 1 : 0;
    const jia = (t.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; if (!first.Ia) first.Ia = `(${i % W},${(i / W) | 0}) v${via} j${jia}`; }
  }
  console.log(`A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} | 豁免: 非活性格=${exGhost} 微光=${exShim}`);
  if (samples.length) console.log(`samples: ${samples.join(' | ')}`);
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  console.log(bad ? `✗ SANITY FAIL ${JSON.stringify(first)}` : '★ SANITY PASS（两豁免口径内八通道全零差）');
  if (bad) throw new Error('sanity fail');
}, 600_000);
