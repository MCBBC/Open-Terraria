// TTTTT 批一次性探针：g-verify/105（=g/ 原链逐字节）终态 vs /tmp/vserver86 纯 vanilla wld
// 双锚点：s9293480.wld（Steam 原版自然 evil 跑）与 s9293480_e0.wld（evil_srv 织入强制 0 跑）。
// 目的：裁决「exe 织入内污染」场景——若纯 Steam 产物与链终态 8 通道全等（含两项已知
// 格式豁免：act=0 幽灵 typ / lty==3 微光=wld 水型+shimmer 位），则金标链锚定真 vanilla。
// 用法（cd game）：SW_TT5=1 npx vitest run tools/_tttttwld.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_TT5 === '1';
const G = process.env.SW_TT5_G ?? '/tmp/sw-slp/g-verify';
const VSRV = '/tmp/vserver86';

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const pre = `${G}/105_Final_Cleanup`;
const t = le16(`${pre}.typ`), a = readFileSync(`${pre}.act`) as Uint8Array;
const w = le16(`${pre}.wal`), l = readFileSync(`${pre}.liq`) as Uint8Array;
const lt = readFileSync(`${pre}.lty`) as Uint8Array;
const hf = readFileSync(`${pre}.half`) as Uint8Array;
const sl = readFileSync(`${pre}.slope`) as Uint8Array;
const ia = readFileSync(`${pre}.inact`) as Uint8Array;

interface Acc { dA: number; dT: number; dW: number; dL: number; dLt: number; dHf: number; dSl: number; dIa: number; ghost: number; shimmer: number; samples: string[]; first: string }
function empty(): Acc { return { dA: 0, dT: 0, dW: 0, dL: 0, dLt: 0, dHf: 0, dSl: 0, dIa: 0, ghost: 0, shimmer: 0, samples: [], first: '' }; }

(RUN ? it : it.skip)('g-verify/105 vs pure-vanilla wlds (8ch anchor)', () => {
  for (const file of ['s9293480.wld', 's9293480_e0.wld']) {
    const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${file}`)));
    const W = wld.tilesWide, H = wld.tilesHigh, N = W * H;
    console.log(`\n=== ${file}: ${W}x${H} crimson=${wld.isCrimson} ground=${wld.groundLevel} rock=${wld.rockLevel} dungeon=(${wld.dungeonX},${wld.dungeonY}) spawn=(${wld.spawnX},${wld.spawnY}) moon=${wld.moonType} version=${wld.version}`);
    if (W !== 4200 || H !== 1200) { console.log('  尺寸不符，跳过'); continue; }
    const wt = wld.tiles;
    const r = empty();
    let firstI = -1;
    const mark = (i: number) => { if (firstI < 0) firstI = i; };
    const samp = (i: number, tag: string, msg: string) => { mark(i); if (r.samples.length < 10) r.samples.push(`${tag}(${i % W},${(i / W) | 0}) ${msg}`); };
    for (let i = 0; i < N; i++) {
      const va = a[i]!, wa = wt.active[i]!;
      if (va !== wa) samp(i, 'A', `dump${va} wld${wa}`);
      if (va !== wa) r.dA++;
      if (va === 1 && wa === 1 && t[i]! !== wt.type[i]!) { r.dT++; samp(i, 'T', `dump${t[i]} wld${wt.type[i]}`); }
      if (va === 0 && t[i]! !== 0) r.ghost++;
      if (w[i]! !== wt.wall[i]!) { r.dW++; samp(i, 'W', `dump${w[i]} wld${wt.wall[i]}`); }
      if (l[i]! !== wt.liquid[i]!) { r.dL++; samp(i, 'L', `dump${l[i]} wld${wt.liquid[i]}`); }
      // lty：dump 0基(0水1岩2蜜3微光) ↔ wld lq(1水2岩3蜜；微光=水+shimmer位→1)
      const dl = l[i]! > 0 ? (lt[i]! === 3 ? 1 : lt[i]! + 1) : 0;
      const wl = wt.liquid[i]! > 0 ? wt.liquidType[i]! : 0;
      if (lt[i]! === 3) r.shimmer++;
      if (dl !== wl) { r.dLt++; samp(i, 'Y', `dump${lt[i]}(→${dl}) wld${wl} liq${l[i]}`); }
      if (hf[i]! !== wt.half[i]!) { r.dHf++; samp(i, 'H', `dump${hf[i]} wld${wt.half[i]}`); }
      if (sl[i]! !== wt.slope[i]!) { r.dSl++; samp(i, 'S', `dump${sl[i]} wld${wt.slope[i]}`); }
      const dia = ia[i]! ? 1 : 0, wia = (wt.wire[i]! >>> 5) & 1;
      if (dia !== wia) { r.dIa++; samp(i, 'I', `dump${dia} wld${wia}`); }
    }
    if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
    console.log(`  A/T/W/L/Y/Hf/Sl/Ia = ${r.dA}/${r.dT}/${r.dW}/${r.dL}/${r.dLt}/${r.dHf}/${r.dSl}/${r.dIa}  (ghostTyp=${r.ghost} shimmerCells=${r.shimmer}) first=${r.first}`);
    for (const s of r.samples) console.log(`    ${s}`);
  }
});
