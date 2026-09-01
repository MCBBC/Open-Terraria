// IIII104b：FTW 全管线运行，槽末逐 pass 落盘（含 .wir）到 SW_I135_JSOUT。
// 用途：与 ~/GoldenChains/golden-ftw-wir 的真值 .wir 直接按槽对拍。
// 用法：cd game && SW_MB_1457=1 npx vitest run tools/_iii135dumpmb.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const OUT = process.env.SW_I135_JSOUT ?? '/tmp/iii135-out/jsdumps';
const W = Number(process.env.SW_I135_W ?? 4200);
const H = Number(process.env.SW_I135_H ?? 1200);
const SEED = process.env.SW_I135_SEED ?? '1671560105';

it('III135 dump every slot end', async () => {
  mkdirSync(OUT, { recursive: true });
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0,
    seedFlags: { getGoodWorld: true },
    onWorldPartial: (w, i, pn) => {
      const st = w.store;
      const n = st.w * st.h;
      const sb = new Int16Array(n * 2);
      const name = String(i).padStart(3, '0') + '_' + String(pn).replace(/[^A-Za-z0-9]/g, '_');
      // typ
      const typ = new Uint8Array(n * 2);
      const dvt = new DataView(typ.buffer);
      const wal = new Uint8Array(n * 2);
      const dvw = new DataView(wal.buffer);
      const wir = new Uint8Array(n), act = new Uint8Array(n), liq = new Uint8Array(n),
        hf = new Uint8Array(n), sl = new Uint8Array(n), lt = new Uint8Array(n), ia = new Uint8Array(n);
      for (let j = 0; j < n; j++) {
        const active = st.flags[j] !== 0 ? 1 : 0;
        act[j] = active;
        dvt.setUint16(j * 2, active ? (st.type[j] ?? 0) : 0, true);
        dvw.setUint16(j * 2, st.wall[j] ?? 0, true);
        liq[j] = st.liquid[j] ?? 0;
        lt[j] = st.liquidType[j] ?? 0;
        hf[j] = st.half[j] ?? 0;
        sl[j] = st.slope[j] ?? 0;
        wir[j] = st.wire[j] ?? 0;
        ia[j] = ((st.wire[j] ?? 0) >>> 5) & 1;
      }
      void sb;
      writeFileSync(`${OUT}/${name}.typ`, typ);
      writeFileSync(`${OUT}/${name}.act`, act);
      writeFileSync(`${OUT}/${name}.wal`, wal);
      writeFileSync(`${OUT}/${name}.liq`, liq);
      writeFileSync(`${OUT}/${name}.lty`, lt);
      writeFileSync(`${OUT}/${name}.half`, hf);
      writeFileSync(`${OUT}/${name}.slope`, sl);
      writeFileSync(`${OUT}/${name}.inact`, ia);
      writeFileSync(`${OUT}/${name}.wir`, wir);
    },
  });
}, 900_000);
