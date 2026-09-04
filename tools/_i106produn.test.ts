import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
it('dungeon census', async () => {
  const w = await generateWorld({ width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103' });
  const st = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
  const N = 4200 * 1200;
  const cntT: Record<number, number> = {}, cntW: Record<number, number> = {};
  for (let i = 0; i < N; i++) {
    const t = st.type[i] as number;
    if (t === 41 || t === 43 || t === 44 || t === 481 || t === 482 || t === 483) cntT[t] = (cntT[t] ?? 0) + 1;
    const wl = st.wall[i] as number;
    if (wl === 7 || wl === 8 || wl === 9) cntW[wl] = (cntW[wl] ?? 0) + 1;
  }
  console.log('JS tiles:', JSON.stringify(cntT));
  console.log('JS walls:', JSON.stringify(cntW));
}, 400_000);
