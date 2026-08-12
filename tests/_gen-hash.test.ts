// 临时:逐 pass 哈希(前后自洽闸门;GENHASH_DUMP=1 落盘 /tmp/gen-pass-hash.json,默认比对)
import { it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
function fnv1a(u8: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const OUT = '/tmp/gen-pass-hash.json';
it('逐 pass 哈希', async () => {
  const recs: Array<{ name: string; hash: string }> = [];
  await generateWorld({ width: 4200, height: 1200, seedText: '9293480', name: 'h', evil: -1,
    onWorldPartial: (w) => {
      const st = w.store;
      recs.push({ name: '', hash: [st.type, st.flags, st.wall, st.liquid, st.liquidType, st.half, st.slope].map((a) =>
        fnv1a(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))).join(' ') });
    } }, () => {});
  if (process.env.GENHASH_DUMP) { writeFileSync(OUT, JSON.stringify(recs)); console.log(`GENHASH dumped ${recs.length}`); }
  else {
    expect(existsSync(OUT)).toBe(true);
    const base = JSON.parse(readFileSync(OUT, 'utf8')) as typeof recs;
    let diff = 0;
    for (let i = 0; i < base.length; i++) if (base[i].hash !== recs[i].hash) { console.log(`GENHASH DIFF [${i}]`); diff++; }
    console.log(`GENHASH diff=${diff}/${base.length}`);
    expect(diff).toBe(0);
  }
}, 900000);
