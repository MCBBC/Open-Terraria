// 一次性诊断（III13 批）：notraps #76 残差离线对拍——X 目录可参数化
// （默认 g1458-notraps；SW_III13_X 覆盖），残差逐格清单 + 分簇。
// 用法：cd game && npx vitest run tools/_iii13a.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('iii13a offline residual list', () => {
  const W = Number(process.env.SW_III10_W ?? 4200);
  const N = W * 1200;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const J = '/tmp/iii10-out/jslot31';
  const X = process.env.SW_III13_X ?? '/tmp/sw-slp/g1458-notraps/076_Traps';
  const jT = le16(`${J}/type`), xT = le16(`${X}.typ`);
  const jA = readFileSync(`${J}/flags`), xA = readFileSync(`${X}.act`);
  const jW = le16(`${J}/wall`), xW = le16(`${X}.wal`);
  const jH = readFileSync(`${J}/half`), xH = readFileSync(`${X}.half`);
  const jS = readFileSync(`${J}/slope`), xS = readFileSync(`${X}.slope`);
  const liq = readFileSync(`${X}.liq`);
  // frameX/frameY of J needed for context: dump those coords
  type Cell = { x: number; y: number; kind: string; x86: string; js: string; wall?: number };
  const cells: Cell[] = [];
  let dA = 0, dT = 0, dW = 0, dHf = 0, dSl = 0, dL = 0;
  let firstI = -1;
  for (let i = 0; i < N; i++) {
    const va = jA[i] !== 0 ? 1 : 0, vb = xA[i] !== 0 ? 1 : 0;
    const ta = va ? (SHEET[jT[i]!] >= 0 ? SHEET[jT[i]!]! : 9999) : 0;
    const tb = vb ? xT[i]! : 0;
    const y = (i / W) | 0, x = i % W;
    let bad = false;
    if (va !== vb) { dA++; bad = true; }
    if (ta !== tb) {
      dT++; bad = true;
      const jtInfo = va ? `sh${jT[i]}@fx${''}` : '';
      cells.push({ x, y, kind: 'T', x86: `${tb}`, js: `${ta}` });
    } else if (va !== vb || true) {
      // same-type activity diff would fall here only when types equal but act differs (rare)
      if (va !== vb) cells.push({ x, y, kind: 'A', x86: `${tb}`, js: `${ta}` });
    }
    if (jW[i] !== xW[i]) { dW++; bad = true; cells.push({ x, y, kind: 'W', x86: `${xW[i]}`, js: `${jW[i]}` }); }
    if (jH[i] !== xH[i]) { dHf++; bad = true; cells.push({ x, y, kind: 'H', x86: `${xH[i]}`, js: `${jH[i]}` }); }
    if (jS[i] !== xS[i]) { dSl++; bad = true; cells.push({ x, y, kind: 'S', x86: `${xS[i]}`, js: `${jS[i]}` }); }
    if (!bad && firstI < 0 && false) firstI = i;
    if (bad && firstI < 0) firstI = i;
  }
  console.log(`X=${X}`);
  console.log(`first=(${firstI >= 0 ? `${firstI % W},${Math.floor(firstI / W)}` : '-'}) A=${dA} T=${dT} W=${dW} Hf=${dHf} Sl=${dSl}`);
  // cluster print sorted by x then y
  const by = new Map<string, Cell[]>();
  for (const c of cells) {
    const gx = Math.round(c.x / 50) * 50, gy = Math.round(c.y / 50) * 50;
    const k = `${gx},${gy}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(c);
  }
  console.log(`--- ${cells.length} diff cells in ${by.size} clusters ---`);
  for (const [k, arr] of [...by.entries()].sort((a, b) => Number(a[0].split(',')[0]) - Number(b[0].split(',')[0]))) {
    console.log(`cluster(${k}) n=${arr.length}:`);
    for (const c of arr.sort((a, b) => a.x - b.x || a.y - b.y)) {
      const jl = jA[c.y * W + c.x] ? 1 : 0, xl = xA[c.y * W + c.x] ? 1 : 0;
      console.log(`  (${c.x},${c.y}) ${c.kind} x86=${c.x86}/${xl} js=${c.js}/${jl} vHalf x=${xH[c.y * W + c.x]} j=${jH[c.y * W + c.x]} vSlope=${xS[c.y * W + c.x]} j=${jS[c.y * W + c.x]} vWall=${xW[c.y * W + c.x]} j=${jW[c.y * W + c.x]} liq=${liq[c.y * W + c.x]}`);
    }
  }
}, 120_000);
