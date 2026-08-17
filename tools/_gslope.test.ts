// 一次性（granite 首红猎杀）：真链 chainCheckpoints 出口 slope/half 通道 dump
// （__cavesGridExport 已扩 slope/half）→ 三方裁决 JS@22 vs oracle(csgran2) vs truth。
// SW_PARITY=1 npx vitest run tools/_gslope.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const SEEDTXT = process.env.SW_SEED ?? '9293480';
const W = 4200, H = 1200, N = W * H;
const TV = '/tmp/sw-ycal/van22';

function cmp(tag: string, jsDir: string, csName: string | null, trName: string) {
  const jS = new Uint8Array(readFileSync(`${jsDir}.slope`).buffer.slice(0));
  const jH = new Uint8Array(readFileSync(`${jsDir}.half`).buffer.slice(0));
  const jT = new Uint16Array(readFileSync(`${jsDir}.typ`).buffer.slice(0));
  const jA = new Uint8Array(readFileSync(`${jsDir}.act`).buffer.slice(0));
  const tS = new Uint8Array(readFileSync(`${TV}/${trName}.slope`).buffer.slice(0));
  const tH = new Uint8Array(readFileSync(`${TV}/${trName}.half`).buffer.slice(0));
  const tT = new Uint16Array(readFileSync(`${TV}/${trName}.typ`).buffer.slice(0));
  const tA = new Uint8Array(readFileSync(`${TV}/${trName}.act`).buffer.slice(0));
  const line = (label: string, oS: Uint8Array | null, oH: Uint8Array | null, oT: Uint16Array | null, oA: Uint8Array | null) => {
    let dS = 0, dA = 0, dT = 0;
    const smp: string[] = [];
    for (let i = 0; i < N; i++) {
      if (oS && (jS[i] !== oS[i] || jH[i] !== oH[i])) {
        dS++;
        if (smp.length < 6) smp.push(`(${i % W},${(i / W) | 0})js=s${jS[i]}h${jH[i]} o=s${oS[i]}h${oH[i]}`);
      }
      if (oA) {
        if ((jA[i] !== 0) !== (oA[i] !== 0)) dA++;
        else if (jA[i] !== 0 && jT[i] !== oT[i]) dT++;
      }
    }
    console.log(`[${tag}] js vs ${label}: slope/half差=${dS}` + (oA ? ` act差=${dA} typ差=${dT}` : ''));
    for (const s of smp) console.log('   ', s);
  };
  line('truth', tS, tH, tT, tA);
  if (csName) {
    const cS = new Uint8Array(readFileSync(`/tmp/${csName}.slope`).buffer.slice(0));
    const cH = new Uint8Array(readFileSync(`/tmp/${csName}.half`).buffer.slice(0));
    line('oracle', cS, cH, null, null);
  }
}

(RUN ? it : it.skip)('granite first-red: JS six-channel vs oracle vs truth', () => {
  const g = globalThis as unknown as { __cavesGridExport?: { at: string; dir: string } };
  for (const at of ['mushroom', 'marble', 'granite']) {
    g.__cavesGridExport = { at, dir: `/tmp/gslope-${at}` };
    chainCheckpoints(SEEDTXT, 0 as const);
  }
  g.__cavesGridExport = undefined;
  cmp('mush', '/tmp/gslope-mushroom', 'csmush', '020_Mushroom_Patches');
  cmp('marb', '/tmp/gslope-marble', 'csmarb2', '021_Marble');
  cmp('gran', '/tmp/gslope-granite', 'csgran2', '022_Granite');
}, 480000);
