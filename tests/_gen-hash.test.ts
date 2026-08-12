// 临时:逐 pass 哈希+耗时 dump(前后自洽闸门:GENHASH_DUMP=1 落盘 /tmp/gen-pass-hash.json,
// 默认读盘比对)。终验后删除。
import { it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

function fnv1a(u8: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const OUT = '/tmp/gen-pass-hash.json';
const SEED = '9293480';

it('逐 pass 哈希', async () => {
  const recs: Array<{ name: string; ms: number; hash: string }> = [];
  let last = performance.now();
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, name: 'h', evil: -1,
    onWorldPartial: (w, _i, name) => {
      const st = w.store;
      const hash = [st.type, st.flags, st.wall, st.liquid, st.liquidType, st.half, st.slope].map((a) =>
        fnv1a(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))).join(' ');
      const now = performance.now();
      recs.push({ name, ms: Math.round(now - last), hash });
      last = now;
    },
  }, () => {});
  if (process.env.GENHASH_DUMP) {
    writeFileSync(OUT, JSON.stringify(recs));
    console.log(`GENHASH dumped ${recs.length} passes`);
  } else {
    expect(existsSync(OUT), 'missing baseline; run GENHASH_DUMP=1 first').toBe(true);
    const base = JSON.parse(readFileSync(OUT, 'utf8')) as typeof recs;
    expect(base.length).toBe(recs.length);
    let diff = 0;
    for (let i = 0; i < base.length; i++) {
      if (base[i].hash !== recs[i].hash || base[i].name !== recs[i].name) {
        console.log(`GENHASH DIFF [${i}] ${base[i].name}: ${base[i].hash} -> ${recs[i].hash}`);
        diff++;
      }
    }
    console.log(`GENHASH diff=${diff}/${base.length}`);
    expect(diff).toBe(0);
  }
}, 900000);
