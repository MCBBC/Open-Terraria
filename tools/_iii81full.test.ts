// IIII81 取证：JS 全管线生成到「终清理」槽末,导出 8 通道（与 JJHook dump 同编码）。
// 用法：cd game && SW_I81_FULL_OUT=/tmp/iii81-out/js-full-grv SW_I81_SEEDTXT='nightofthelivingdead|20260903' \
//        SW_I81_EVILV=0 [SW_I81_FLAGSV=graveyardBloodmoonStart] npx vitest run tools/_iii81full.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = true;
const OUT = process.env.SW_I81_FULL_OUT ?? '/tmp/iii81-out/js-full';
const SEED = process.env.SW_I81_SEEDTXT ?? '20260903';
const EVIL = process.env.SW_I81_EVILV !== undefined ? Number(process.env.SW_I81_EVILV) : -1;
const FLAGS_RAW = process.env.SW_I81_FLAGSV ?? '';
const FLAGS: Record<string, boolean> = {};
for (const f of FLAGS_RAW.split(',').filter(Boolean)) FLAGS[f] = true;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('probe full', { timeout: 900_000 }, async () => {
  mkdirSync(OUT, { recursive: true });
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED,
    evil: EVIL as -1 | 0 | 1,
    seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
    onWorldPartial: (w, i) => {
      if (i !== 58) return;                                    // 终清理=多格残片清扫前最后原版槽
      const t = w.store as never as {
        w:number,h:number,flags:Uint8Array,type:Uint16Array,wall:Uint16Array,
        liquid:Uint8Array,liquidType:Uint8Array,half:Uint8Array,slope:Uint8Array,wire:Uint8Array,
      };
      const N = t.w * t.h;
      const typ = new Uint16Array(N);
      for (let q = 0; q < N; q++) {
        typ[q] = (t.flags[q] & 1)
          ? (SHEET[t.type[q]!] >= 0 ? SHEET[t.type[q]!]! : 9999)
          : 0;
      }
      const act = new Uint8Array(N);
      for (let q = 0; q < N; q++) act[q] = t.flags[q] & 1;
      writeFileSync(`${OUT}/105_j.typ`, Buffer.from(typ.buffer));
      writeFileSync(`${OUT}/105_j.act`, Buffer.from(act.buffer));
      writeFileSync(`${OUT}/105_j.wal`, Buffer.from(Uint16Array.from(t.wall).buffer));
      writeFileSync(`${OUT}/105_j.liq`, Buffer.from(t.liquid.slice().buffer));
      writeFileSync(`${OUT}/105_j.half`, Buffer.from(t.half.slice().buffer));
      writeFileSync(`${OUT}/105_j.slope`, Buffer.from(t.slope.slice().buffer));
      writeFileSync(`${OUT}/105_j.lty`, Buffer.from(t.liquidType.slice().buffer));
    },
  });
  console.log('III81FULL done');
});
