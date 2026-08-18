// PPPP 批一次性探针：12345 #49 Lt1 定位（JS 槽9 末态 vs golden 049 lty 全差）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
const RUN = process.env.SW_PPPP1 === '1';
const W = 4200, H = 1200;
(RUN ? it : it.skip)('lt diff locator', async () => {
  let done = false;
  await generateWorld({
    width: W, height: H, seedText: '12345', evil: 1 as -1 | 0 | 1,
    onWorldPartial: (w, i) => {
      if (i !== 9 || done) return;
      done = true;
      const st = (w as unknown as { store: { flags: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array; type: Uint16Array; wall: Uint16Array; idx(x:number,y:number):number } }).store;
      const d = (e: string) => readFileSync(`/tmp/sw-slp/g12345/049_Settle_Liquids.${e}`);
      const lv = d('liq'), lt = d('lty');
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const ii = st.idx(x, y);
        const vl = lv[x + y * W]! > 0 ? lt[x + y * W]! + 1 : 0;
        const jl = st.liquid[ii]! > 0 ? st.liquidType[ii]! : 0;
        if (vl !== jl) {
          console.log(`YDIFF (${x},${y}) v_liq=${lv[x + y * W]} v_lt=${lt[x + y * W]} j_liq=${st.liquid[ii]} j_lt=${st.liquidType[ii]}`);
          for (let dy = -3; dy <= 3; dy++) {
            const row: string[] = [];
            for (let dx = -4; dx <= 4; dx++) {
              const k = st.idx(x + dx, y + dy);
              row.push(`${st.flags[k] ? 'A' : '.'}${st.liquid[k]! > 0 ? (st.liquidType[k] === 1 ? 'w' : st.liquidType[k] === 2 ? 'L' : 'h') + st.liquid[k] : ''}`);
            }
            console.log(`  y${y + dy}: ${row.join(' ')}`);
          }
        }
      }
      console.log('scan done');
    },
  });
}, 900_000);
