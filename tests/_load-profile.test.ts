// 临时:读档链路耗时+哈希基线(LOAD_DUMP=1 落盘,默认比对)。终验后删除。
import { it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadSaveData } from '../src/save/SaveFile';
import { packWorld } from '../src/workers/worldPacket';
import { World } from '../src/world/World';
import type { SaveData } from '../src/save/serialize';

const OUT = '/tmp/load-hash.json';
const SAMPLE = '/Users/vinlic/Downloads/map-优雅地盘.json';

function fnv1a(u8: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

it('读档链路计时+哈希', async () => {
  const t0 = performance.now();
  const data = JSON.parse(readFileSync(SAMPLE, 'utf8')) as SaveData;
  const tJson = performance.now() - t0;
  const t1 = performance.now();
  const { world } = loadSaveData(data);
  const tDecode = performance.now() - t1;
  // 细分:构造器(75MB 分配) vs b64+RLE
  if (process.env.LOAD_PHASES) {
    const { World } = await import('../src/world/World');
    const a = performance.now();
    const w0 = new World(data.header.width, data.header.height, data.header.seed, 'x');
    console.log(`LOADPHASE ctor=${Math.round(performance.now() - a)}ms`);
    const b64 = performance.now();
    // 单独测 tiles 段 b64(atob+循环)
    const raw = atob(data.tiles);
    const u8x = new Uint8Array(raw.length);
    for (let j = 0; j < raw.length; j++) u8x[j] = raw.charCodeAt(j);
    console.log(`LOADPHASE b64tiles(${Math.round(raw.length / 1024)}KB)=${Math.round(performance.now() - b64)}ms`);
    const rle = performance.now();
    const ty = w0.store.type, fl = w0.store.flags, fx2 = w0.store.frameX, fy2 = w0.store.frameY;
    let p = 0, i = 0; const n = ty.length;
    while (i < n && p < u8x.length) {
      let run = 0, s = 0;
      for (;;) { const bb = u8x[p++]; run |= (bb & 0x7f) << s; if (!(bb & 0x80)) break; s += 7; }
      let tRaw = 0; s = 0;
      for (;;) { const bb = u8x[p++]; tRaw |= (bb & 0x7f) << s; if (!(bb & 0x80)) break; s += 7; }
      const t = tRaw === 0 ? 0 : tRaw;
      let fxa = 0, fya = 0;
      if (t !== 0) {
        s = 0;
        for (;;) { const bb = u8x[p++]; fxa |= (bb & 0x7f) << s; if (!(bb & 0x80)) break; s += 7; }
        s = 0;
        for (;;) { const bb = u8x[p++]; fya |= (bb & 0x7f) << s; if (!(bb & 0x80)) break; s += 7; }
      }
      const flag = t !== 0 ? 1 : 0;
      const end = Math.min(i + run + 1, n);
      for (; i < end; i++) { ty[i] = t; fl[i] = flag; fx2[i] = fxa; fy2[i] = fya; }
    }
    console.log(`LOADPHASE rleTiles=${Math.round(performance.now() - rle)}ms`);
  }
  const t2 = performance.now();
  const { packet } = packWorld(world);
  const tPack = performance.now() - t2;
  const t3 = performance.now();
  const w2 = World.fromPacket(packet);
  const tFrom = performance.now() - t3;
  const st = world.store;
  const s2 = w2.store;
  const hash = {
    decode: [st.type, st.flags, st.wall, st.liquid, st.liquidType, st.half, st.slope].map((a) =>
      fnv1a(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))).join(' '),
    from: [s2.type, s2.flags, s2.wall, s2.liquid, s2.liquidType, s2.half, s2.slope].map((a) =>
      fnv1a(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))).join(' '),
  };
  console.log(`LOADPROFILE json=${Math.round(tJson)}ms decode=${Math.round(tDecode)}ms pack=${Math.round(tPack)}ms fromPacket=${Math.round(tFrom)}ms`);
  if (process.env.LOAD_DUMP) {
    writeFileSync(OUT, JSON.stringify(hash));
    console.log('LOADHASH dumped');
  } else {
    expect(existsSync(OUT)).toBe(true);
    const base = JSON.parse(readFileSync(OUT, 'utf8')) as typeof hash;
    expect(hash.decode).toBe(base.decode);
    expect(hash.from).toBe(base.from);
    console.log('LOADHASH ok');
  }
}, 300000);
