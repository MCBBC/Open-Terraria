// 一次性诊断（HHHHHHH 批）：JS Dungeon pass 末态（▶MountainCaveOpenings 时点）全 8+2
// 通道落盘 /tmp/hhhhhhh-js32.*，供 #32 解锁三方对拍（JS-new vs gggg-or32=oracle-1457
// vs x86 032_Dungeon=1456）。_mile8d 同构,仅输出路径/种子参数化。
// 用法：cd game && SW_H2=1 npx vitest run tools/_hhhhhhh2.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_H2 === '1';
const W = Number(process.env.SW_H2_W ?? 4200), H = Number(process.env.SW_H2_H ?? 1200), N = W * H;
const OUT = process.env.SW_H2_OUT ?? '/tmp/hhhhhhh-js32';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return '';
}

(RUN ? it : it.skip)('dump JS store at Dungeon-end boundary', async () => {
  let done = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  class Ab extends Error { constructor() { super('h2'); } }
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_hhhhhhh')) {
        if (labelOf(m[1], Number(m[2])) === 'MountainCaveOpenings') {
          const st = (globalThis as { __h2Store?: Parameters<typeof dump>[0] }).__h2Store!;
          dump(st);
          done = true;
          throw new Ab();
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  function dump(st: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array; frameX: Uint16Array; frameY: Uint16Array }): void {
    const typ = new Uint16Array(N), wal = new Uint16Array(N);
    const act = new Uint8Array(N), liq = new Uint8Array(N), lty = new Uint8Array(N), half = new Uint8Array(N), slope = new Uint8Array(N), inact = new Uint8Array(N);
    const frx = new Uint16Array(N), fry = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      typ[i] = st.flags[i]! & 1 ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 0x7777) : 0;
      act[i] = st.flags[i]! & 1;
      wal[i] = st.wall[i]!;
      liq[i] = st.liquid[i]!;
      lty[i] = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;   // JS +1 基
      half[i] = st.half[i]!; slope[i] = st.slope[i]!;
      inact[i] = (st.wire[i]! >>> 5) & 1;
      frx[i] = st.frameX[i]!; fry[i] = st.frameY[i]!;
    }
    const le16 = (arr: Uint16Array): Buffer => {
      const b = Buffer.alloc(arr.length * 2);
      for (let i = 0; i < arr.length; i++) b.writeUInt16LE(arr[i]!, i * 2);
      return b;
    };
    writeFileSync(`${OUT}.typ`, le16(typ));
    writeFileSync(`${OUT}.act`, Buffer.from(act));
    writeFileSync(`${OUT}.wal`, le16(wal));
    writeFileSync(`${OUT}.liq`, Buffer.from(liq));
    writeFileSync(`${OUT}.lty`, Buffer.from(lty));
    writeFileSync(`${OUT}.half`, Buffer.from(half));
    writeFileSync(`${OUT}.slope`, Buffer.from(slope));
    writeFileSync(`${OUT}.inact`, Buffer.from(inact));
    writeFileSync(`${OUT}.frx`, le16(frx));
    writeFileSync(`${OUT}.fry`, le16(fry));
    console.log('js32 dumped (10ch)');
  }
  const g = globalThis as { __h2Store?: Parameters<typeof dump>[0] };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: process.env.SW_H2_SEED ?? '9293480',
      evil: Number(process.env.SW_H2_EVIL ?? 0) as -1 | 0 | 1,
      onWorldPartial: (w) => { if (!g.__h2Store) g.__h2Store = w.store as never as typeof g.__h2Store; },
    });
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause;
    if (!(e instanceof Ab || cause instanceof Ab)) throw e;
  } finally { RNGp.reseed = oReseed; }
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s dumped=${done}`);
}, 900_000);
