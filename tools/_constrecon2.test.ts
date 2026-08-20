// RECON-CONST 辅助：自然种子基线 .wld 的 Constant 特征计数（区分 Constant 专属 vs 既有 JS 债）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = !!process.env.SW_CONSTRECON;

(RUN ? it : it.skip)('natural baseline feat counts', () => {
  const files = [
    '/tmp/vserver86/l9293480.wld',
    '/tmp/sw-const-recon/const_s.wld',
  ];
  for (const f of files) {
    const w = parseWld(new Uint8Array(readFileSync(f)));
    const n = w.tilesWide * w.tilesHigh;
    const cnt = (id: number) => { let c = 0; for (let i = 0; i < n; i++) if (w.tiles.active[i] === 1 && w.tiles.type[i] === id) c++; return c; };
    const wallCnt = (id: number) => { let c = 0; for (let i = 0; i < n; i++) if (w.tiles.wall[i] === id) c++; return c; };
    console.log('[base]', f.split('/').pop(), JSON.stringify({
      seed: w.seed, w: w.tilesWide, h: w.tilesHigh,
      marble367: cnt(367), granite191: cnt(191), spikes48: cnt(48), wooden232: cnt(232),
      tomb85: cnt(85), iron6: cnt(6), lead167: cnt(167), gold8: cnt(8), plat169: cnt(169),
      tin166: cnt(166), copper7: cnt(7), spiderWall62: wallCnt(62), grassWall63: wallCnt(63),
      chests: w.chests.length, npcs: w.npcs.map((x: any) => x.spriteId),
    }));
  }
}, 300_000);
