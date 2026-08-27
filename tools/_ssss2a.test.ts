// SSSSSSSS2 批一次性探针（派生自 _mile8.test.ts，用毕删）：
// ① 抓 JS 槽末#49（Micro_Biomes 后）8 通道 → /tmp/sss2-out/m12345/js097.*
// ② RNG.reseed 钩抓 MicroBiomesPass 头（pass 前态）→ jspre.*
// ③ segProbe(__swMbCap/__swSeg) 收集各微群系受理事件 → events.json
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = true;
const OUT = '/tmp/sss2-out/m12345';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
const SEED = process.env.SW_M8_SEED ?? '12345';
const EVIL = process.env.SW_M8_EVIL !== undefined ? Number(process.env.SW_M8_EVIL) : 1;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
interface Snap { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array; lt: Uint8Array; hf: Uint8Array; sl: Uint8Array; gh: Uint16Array }
function snap(store: any): Snap {
  const typ = new Uint16Array(N), act = new Uint8Array(N), wal = new Uint16Array(N);
  const liq = new Uint8Array(N), lt = new Uint8Array(N), hf = new Uint8Array(N), sl = new Uint8Array(N), gh = new Uint16Array(N);
  const stt = store.type as Uint16Array, fl = store.flags as Uint8Array, wl = store.wall as Uint16Array;
  const lq = store.liquid as Uint8Array, lty = store.liquidType as Uint8Array, h = store.half as Uint8Array,
    s2 = store.slope as Uint8Array, wr = store.wire as Uint8Array;
  for (let i = 0; i < N; i++) {
    const a = fl[i] & 1;
    act[i] = a;
    const sh = SHEET[stt[i]!];
    typ[i] = a && sh >= 0 ? sh : 9999;
    gh[i] = (!a && sh >= 0) ? sh : 0;
    wal[i] = wl[i]!;
    liq[i] = lq[i]!;
    lt[i] = lq[i]! > 0 ? lty[i]! : 0;
    hf[i] = h[i]!;
    sl[i] = s2[i]!;
    void wr;
  }
  return { typ, act, wal, liq, lt, hf, sl, gh };
}
function writeSnap(p: string, s: Snap) {
  writeFileSync(`${p}.typ`, Buffer.from(s.typ.buffer));
  writeFileSync(`${p}.wal`, Buffer.from(s.wal.buffer));
  for (const [k, v] of Object.entries(s)) if (k !== 'typ' && k !== 'wal') writeFileSync(`${p}.${k}`, Buffer.from(v!.buffer.slice(0)));
}

(RUN ? it : it.skip)('ssss2a capture', async () => {
  interface Ev { name: string; d: unknown }
  const events: Ev[] = [];
  (globalThis as any).__swSeg = (name: string, detail?: unknown) => {
    if (events.length < 400000) events.push({ name, d: detail });
  };
  (globalThis as any).__swMbCap = (_gs: unknown, st2: unknown, chs: unknown) => {
    // runMicroBiomesPass 首行（body 执行前）——抓 pass 前态
    if (!preWritten && curStore) {
      preWritten = true;
      writeSnap(`${OUT}/jspre`, snap(st2));
      console.log(`[probe] micro-biomes head captured via __swMbCap`);
    }
    void chs;
  };
  (globalThis as any).__swMbSegFile = undefined;
  let curStore: any = null;
  let preWritten = false, postWritten = false;
  const RNGp = (await import('../src/core/rng')).RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    try {
      const stack = new Error().stack ?? '';
      if (!preWritten && stack.includes('MicroBiomesPass')) {
        // Micro_Biomes pass 头（body 执行前）
        preWritten = true;
        if (curStore) writeSnap(`${OUT}/jspre`, snap(curStore));
        console.log(`[probe] micro-biomes head captured, events so far=${events.length}`);
      }
    } catch { /* probe */ }
    return oReseed.call(this, s);
  };
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    onWorldPartial: (w, i) => {
      if (!curStore) curStore = w.store;
      if (i === 49 && !postWritten) {
        postWritten = true;
        writeSnap(`${OUT}/js097`, snap(w.store));
        console.log(`[probe] js slot49-end captured`);
      }
    },
  });
  RNGp.reseed = oReseed;
  const byName: Record<string, number> = {};
  for (const e of events) byName[e.name] = (byName[e.name] ?? 0) + 1;
  console.log('[probe] seg counts:', JSON.stringify(byName));
  writeFileSync(`${OUT}/events.json`, JSON.stringify(events));
}, 900_000);
