// 一次性诊断（PPPPP 批 #84 移交件）：JS 槽末#38 half 通道差 13 格定位
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
const RUN = process.env.SW_PP3 === '1';
const G2 = '/tmp/sw-slp/g', W = 4200;
const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const t = le16(`${G2}/084_Dye_Plants.typ`), a = readFileSync(`${G2}/084_Dye_Plants.act`),
  hf = readFileSync(`${G2}/084_Dye_Plants.half`), sl = readFileSync(`${G2}/084_Dye_Plants.slope`),
  ty = le16(`${G2}/084_Dye_Plants.typ`);
(RUN ? it : it.skip)('locate half diffs at slot 38', async () => {
  await generateWorld({
    width: 4200, height: 1200, seedText: '9293480', evil: 0,
    onWorldPartial: (w, i) => {
      if (i !== 38) return;
      const st = w.store as never as { w: number; h: number; half: Uint8Array; slope: Uint8Array; flags: Uint8Array; type: Uint16Array; idx(x: number, y: number): number };
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
        const k = st.idx(x, y), g = y * W + x;
        if (hf[g] !== st.half[k]) {
          console.log(`H (${x},${y}) v=${hf[g]} j=${st.half[k]} vT=${a[g] ? t[g] : '-'} jT=${st.flags[k] ? 'act' : 'inact'} vSl=${sl[g]} jSl=${st.slope[k]}`);
        }
      }
    },
  });
}, 900_000);
