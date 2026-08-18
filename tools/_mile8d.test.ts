// 一次性诊断（里程碑定位批附）：抓 ▶MountainCaveOpenings 时点（=Dungeon pass 末态）
// JS store 全 8 通道落盘 /tmp/js32.*，供 lty/坐标级三方（JS vs oracle vs x86#32）分析。
// 用法：cd game && SW_M8D=1 npx vitest run tools/_mile8d.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_M8D === '1';
const W = 4200, H = 1200, N = W * H;
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
  class Ab extends Error { constructor() { super('m8d'); } }
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_mile8d')) {
        if (labelOf(m[1], Number(m[2])) === 'MountainCaveOpenings') {
          const st = (globalThis as { __m8dStore?: Parameters<typeof dump>[0] }).__m8dStore!;
          dump(st);
          done = true;
          throw new Ab();
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  function dump(st: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array }): void {
    const typ = new Uint16Array(N), wal = new Uint16Array(N);
    const act = new Uint8Array(N), liq = new Uint8Array(N), lty = new Uint8Array(N), half = new Uint8Array(N), slope = new Uint8Array(N), inact = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      typ[i] = SHEET[st.type[i]!] ?? (st.flags[i]! & 1 ? 0x7777 : 0);
      act[i] = st.flags[i]! & 1;
      wal[i] = st.wall[i]!;
      liq[i] = st.liquid[i]!;
      lty[i] = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      half[i] = st.half[i]!; slope[i] = st.slope[i]!;
      inact[i] = (st.wire[i]! >>> 5) & 1;
    }
    const le16 = (arr: Uint16Array): Buffer => {
      const b = Buffer.alloc(arr.length * 2);
      for (let i = 0; i < arr.length; i++) b.writeUInt16LE(arr[i]!, i * 2);
      return b;
    };
    writeFileSync('/tmp/js32.typ', le16(typ));
    writeFileSync('/tmp/js32.act', Buffer.from(act));
    writeFileSync('/tmp/js32.wal', le16(wal));
    writeFileSync('/tmp/js32.liq', Buffer.from(liq));
    writeFileSync('/tmp/js32.lty', Buffer.from(lty));
    writeFileSync('/tmp/js32.half', Buffer.from(half));
    writeFileSync('/tmp/js32.slope', Buffer.from(slope));
    writeFileSync('/tmp/js32.inact', Buffer.from(inact));
    console.log('js32 dumped (8ch)');
  }
  const g = globalThis as { __m8dStore?: Parameters<typeof dump>[0] };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w) => { if (!g.__m8dStore) g.__m8dStore = w.store as never as typeof g.__m8dStore; },
    });
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause;
    if (!(e instanceof Ab || cause instanceof Ab)) throw e;
  } finally { RNGp.reseed = oReseed; }
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s dumped=${done}`);
  void readdirSync;
}, 900_000);
