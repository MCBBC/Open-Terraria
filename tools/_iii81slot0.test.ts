// IIII81 取证迷你探针：跑到「原版地形」槽末即中止，导出 act/typ 两通道供离线字节对拍。
// 用法：cd game && SW_I80_OUT=/tmp/iii81-out/js-grv SW_I81_SEEDTXT='20260903' SW_I81_EVILV=0 \
//        npx vitest run tools/_iii81slot0.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const OUT = process.env.SW_I80_OUT ?? '/tmp/iii81-out/js-slot0';
const SEED = process.env.SW_I81_SEEDTXT ?? '20260903';
const EVIL = process.env.SW_I81_EVILV !== undefined ? Number(process.env.SW_I81_EVILV) : -1;
const FLAGS_RAW = process.env.SW_I81_FLAGSV ?? '';
const FLAGS: Record<string, boolean> = {};
for (const f of FLAGS_RAW.split(',').filter(Boolean)) FLAGS[f] = true;
const RUN = true;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('probe', async () => {
  mkdirSync(OUT, { recursive: true });
  // IIII81 掷流对账钩：与 rig pc.txt R:{RollCount}:{RollHash} 同口径
  let rollN = 0;
  let rollH = 2166136261 >>> 0;
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v) => {
    rollN++;
    rollH = ((rollH ^ (v >>> 0)) * 16777619) >>> 0;
  };
  const RNG_UNUSED = RNG; void RNG_UNUSED;
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED,
      evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
      onWorldPartial: (w, i) => {
        if (i !== 0) return;
        const st = w.store as never as { w:number,h:number,flags:Uint8Array,type:Uint16Array };
        const N = st.w * st.h;
        const flg = new Uint8Array(N); const typ = new Uint16Array(N);
        for (let q = 0; q < N; q++) {
          flg[q] = st.flags[q] & 1;
          typ[q] = (st.flags[q] & 1)
            ? (SHEET[st.type[q]] >= 0 ? SHEET[st.type[q]!] : 9999)
            : 0;
        }
        writeFileSync(`${OUT}/J_act.bin`, Buffer.from(flg.buffer));
        writeFileSync(`${OUT}/J_typ.bin`, Buffer.from(typ.buffer));
        writeFileSync(`${OUT}/J_meta.txt`, `${SEED} evil=${EVIL} flags=${FLAGS_RAW}`);
        console.log(`ROLLS pass0 count=${rollN} fnv=${rollH}`);
        const meta2 = w as unknown as Record<string, unknown>;
        const c2 = meta2.clock as { timeOfDay?: number } | undefined;
        console.log(`HDR spawn=${meta2.spawnX},${meta2.spawnY} dungeonX=${meta2.dungeonX} dungeonY=${meta2.dungeonY} jungleX=${meta2.jungleX} groundLevel=${(w as never as {groundLevel?:number}).groundLevel}`);
        throw new Error('IIII81 slot0 captured—early abort');
      },
    });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('slot0 captured')) throw e;
    console.log('captured', msg);
  }
});
