// BBBB 一次性：真实管线 Altars 末态（▶SurfaceWaterInJungle reseed 时点）vs x86 dump044
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_BBBB === 'pipe44';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const fnv8 = (a: Uint8Array): string => { let h = 0x811c9dc5; for (let i = 0; i < a.length; i++) { h = Math.imul(h ^ a[i], 16777619) >>> 0; h = Math.imul(h, 16777619) >>> 0; } return (h >>> 0).toString(16).padStart(8, '0'); };
const fnv16 = (a: Uint16Array): string => { let h = 0x811c9dc5; for (let i = 0; i < a.length; i++) { h = Math.imul(h ^ (a[i] & 0xff), 16777619) >>> 0; h = Math.imul(h ^ ((a[i] >> 8) & 0xff), 16777619) >>> 0; } return (h >>> 0).toString(16).padStart(8, '0'); };
const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('pipe end-of-Altars vs x86 dump044', async () => {
  const pre = `${G2}/044_Altars`;
  const xa = readFileSync(`${pre}.act`);
  const xht = new Uint16Array(N); { const xt = le16(`${pre}.typ`); for (let i = 0; i < N; i++) xht[i] = xa[i] ? xt[i] : 0; }
  const xw = le16(`${pre}.wal`), xl = readFileSync(`${pre}.liq`);
  const xhash = `${fnv16(xht)} ${fnv8(xa)} ${fnv16(xw)} ${fnv8(xl)}`;
  let lastStore: any = null;
  let done = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (!done && lastStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_bbbb')) {
          if (labelOf(m[1], Number(m[2])) === 'SurfaceWaterInJungle') { done = true; throw new Error('BBBB_CAPTURE'); }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w: any) => { lastStore = w.store; },
    });
  } catch (e) { if (!(e as Error).message.includes('BBBB_CAPTURE')) throw e; }
  finally { RNGp.reseed = oReseed; }
  if (!done || !lastStore) { console.log('capture failed'); return; }
  const st = lastStore;
  const jht = new Uint16Array(N);
  for (let i = 0; i < N; i++) jht[i] = (st.flags[i] & 1) ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
  const jhash = `${fnv16(jht)} ${fnv8(new Uint8Array(st.flags.constructor === Uint8Array ? st.flags : st.flags))}`;
  const jAct = fnv8(st.flags);
  const jWall = fnv16(st.wall);
  const jLiq = fnv8(st.liquid);
  console.log(`PIPE44 js = ${fnv16(jht)} ${jAct} ${jWall} ${jLiq}`);
  console.log(`PIPE44 x86 = ${xhash}`);
  console.log(`PIPE44 ${jhash === xhash && jAct === xhash.split(' ')[1] ? 'MATCH' : 'MISMATCH'}`);
}, 900_000);
