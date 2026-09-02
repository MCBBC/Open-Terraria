// 一次性诊断（III10 批）：jslot31 对拍 /tmp/jjj-out/g1457-notraps/076_Traps
// （mile8 等价离线版 + 区域细节，映射走 TILE_DEFS.vanilla.sheet）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

(RUN ? it : it.skip)('iii10b offline cmp', () => {
  const W = Number(process.env.SW_III10_W ?? 4200);
  const N = W * 1200;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const J = '/tmp/iii10-out/jslot31', X = '/tmp/jjj-out/g1457-notraps/076_Traps';
  const jT = le16(`${J}/type`), xT = le16(`${X}.typ`);
  const jA = readFileSync(`${J}/flags`), xA = readFileSync(`${X}.act`);
  const jW = le16(`${J}/wall`), xW = le16(`${X}.wal`);
  const jH = readFileSync(`${J}/half`), xH = readFileSync(`${X}.half`);
  const jS = readFileSync(`${J}/slope`), xS = readFileSync(`${X}.slope`);
  const pairs = new Map<string, number>();
  let firstI = -1;
  const samples: string[] = [];
  let dT = 0, dA = 0, dW = 0, dHf = 0, dSl = 0;
  for (let i = 0; i < N; i++) {
    const va = jA[i] !== 0 ? 1 : 0, vb = xA[i] !== 0 ? 1 : 0;
    const ta = va ? (SHEET[jT[i]!] >= 0 ? SHEET[jT[i]!]! : 9999) : 0;
    const tb = vb ? xT[i]! : 0;
    if (va !== vb || ta !== tb || jW[i] !== xW[i] || jH[i] !== xH[i] || jS[i] !== xS[i]) {
      if (firstI < 0) firstI = i;
      if (va !== vb) dA++;
      if (ta !== tb) { dT++; const k = `T${tb}>${ta}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
      if (jW[i] !== xW[i]) dW++;
      if (jH[i] !== xH[i]) { dHf++; const k = `H${xH[i]}>${jH[i]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
      if (jS[i] !== xS[i]) { dSl++; const k = `S${xS[i]}>${jS[i]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
      if (samples.length < 12 && (va !== vb || ta !== tb)) samples.push(`(${i % W},${(i / W) | 0}) vT${tb} jT${ta} v${vb} j${va}`);
    }
  }
  console.log(`first=(${firstI >= 0 ? `${firstI % W},${(firstI / W) | 0}` : '-'}) A=${dA} T=${dT} W=${dW} Hf=${dHf} Sl=${dSl}`);
  [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .forEach(([k, n]) => console.log('  ', String(n).padStart(7), k));
  console.log('samples:', samples.slice(0, 8).join(' | '));
});
