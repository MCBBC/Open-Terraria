// IIII198: (2655,486) 箱格 tile 的死亡时点(逐槽)
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

it('iii198 chest tile death', async () => {
  let prev = -1;
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    onWorldPartial: (w, i, pn) => {
      const st = w.store as unknown as { type: Uint16Array; flags: Uint8Array; w: number };
      const t = st.idx(2655, 486);
      const alive = st.flags[t] & 1;
      if (prev === 1 && alive === 0) console.log(`[ct2] 箱格死于槽#${i} 「${pn}」(type now=${st.type[t]})`);
      prev = alive;
    },
  });
}, 900_000);
