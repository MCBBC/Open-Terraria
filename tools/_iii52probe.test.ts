// IIII50 一次性探针 B：Dungeon 段出入口全库快照（FTW 链）。
// 在 ▶Dungeon（入口态）与 ▶MountainCaveOpenings（出口态=vanilla dump31/32 对应时点）
// 把整库 act/type/wall/liq/lty/half/slope 压缩为定长二进制写 /tmp/iii52-out/js-dungeon-{in,out}.bin
// 与真值 0xx_*.bin 离线对账。用法：cd game && SW_I52P2=1 npx vitest run tools/_iii52probe.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I52P2 === '1';

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) {
    try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; }
    srcCache.set(file, src);
  }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

interface Snap {
  flags: Uint8Array; type: Uint16Array; wall: Uint16Array;
  liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array;
}
(RUN ? it : it.skip)('capture dungeon in/out snapshots', async () => {
  const WANT = new Set(['Dungeon', 'MountainCaveOpenings']);
  const captured = new Set<string>();
  let curStore: unknown = null;

  const dumpAll = (tag: string): void => {
    const st = curStore as never as Snap & { w: number; h: number };
    const n = st.w * st.h;
    const buf = Buffer.alloc(n * 10);
    let o = 0;
    for (let i = 0; i < n; i++) {
      buf[o++] = st.flags[i];
      buf.writeUInt16LE(st.type[i], o); o += 2;
      buf.writeUInt16LE(st.wall[i], o); o += 2;
      buf[o++] = st.liquid[i];
      buf[o++] = st.liquidType[i];
      buf[o++] = st.half[i];
      buf[o++] = st.slope[i];
      buf[o++] = 0;
    }
    writeFileSync(`/tmp/iii52-out/js-${tag}.bin`, buf);
    console.log(`captured ${tag} ${n} cells`);
  };

  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii52probe')) {
        const lab = labelOf(m[1], Number(m[2]));
        if (WANT.has(lab) && !captured.has(lab)) {
          captured.add(lab);
          dumpAll(`dungeon-${lab === 'Dungeon' ? 'in' : 'out'}`);
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1671560105',
      seedFlags: { getGoodWorld: true },
      onWorldPartial: (w) => { curStore = w.store as never; },
    });
  } finally { RNGp.reseed = oReseed; }
}, 900_000);
