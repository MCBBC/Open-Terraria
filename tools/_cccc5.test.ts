// CCCCCC 批·⑤：m20260811 新基座捕获（槽 52 蜥蜴祭坛末=pass101 头）——当前代码
// SW_C5=1 npx vitest run tools/_cccc5.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld, __setGenStateForProbe, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_C5 === '1';
const DIR = process.env.SW_C5_DIR ?? '/tmp/cccccc-m-base';
const SEED = process.env.SW_C5_SEED ?? '20260811';
const EVIL = Number(process.env.SW_C5_EVIL ?? 0);
const W = Number(process.env.SW_C5_W ?? 6400), H = Number(process.env.SW_C5_H ?? 1800);

(RUN ? it : it.skip)('cccc5 capture m base at slot 52', async () => {
  mkdirSync(DIR, { recursive: true });
  let done = false;
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    onWorldPartial: (w, i, name) => {
      if (done || name !== '蜥蜴祭坛') return;
      done = true;
      const st = w.store;
      const save = (n: string, arr: Uint8Array | Uint16Array) =>
        writeFileSync(`${DIR}/${n}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
      save('type.bin', st.type); save('flags.bin', st.flags); save('wall.bin', st.wall);
      save('liquid.bin', st.liquid); save('liquidType.bin', st.liquidType);
      save('half.bin', st.half); save('slope.bin', st.slope);
      save('frameX.bin', st.frameX); save('frameY.bin', st.frameY);
      save('wire.bin', st.wire); save('paint.bin', st.paint);
      writeFileSync(`${DIR}/gs.json`, JSON.stringify(lastGenState()));
      writeFileSync(`${DIR}/gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
      writeFileSync(`${DIR}/chests.json`, JSON.stringify(w.chests ?? []));
      console.log(`captured slot ${i} (${name}) end → ${DIR}`);
    },
  });
  console.log('done, captured=' + done);
}, 900_000);
