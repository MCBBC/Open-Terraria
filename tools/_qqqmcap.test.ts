// QQQQQQQQ：在 ▶UnderwaterChests 重定种子点快照 (4700..4800)x(700..800) 区域
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_QCAP === '1';
(RUN ? it : it.skip)('region snapshot at UnderwaterChests reseed', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let snapTaken = false;
  RNGp.reseed = function (this: never, s: number) {
    const stack = new Error().stack ?? '';
    if (/▶UnderwaterChests/.test(stack)) {
      const world = (globalThis as { __swWorldRef?: unknown }).__swWorldRef as never as
        | null
        | { store: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array } };
      void world;
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 6400, height: 1800, seedText: '20260811', evil: 0 as never,
      onWorldPartial: ((w: any, idx: number, name: string) => {
        // 抓槽位完成态：slot id 由 dump 对齐表换算（060→i=?），此处直接记录 name 匹配
        if (!snapTaken && /BuriedChests|SurfaceChests|JungleChests/.test(name)) {
          console.log('pass-done idx=', idx, name);
        }
        if (!snapTaken && name.includes('Water Chests') === false) return;
        if (!snapTaken && name === 'UnderwaterChests') {
          // 到达目标 pass 入口：此刻 store == dump061 对比基准（含本 pass 未跑）
          const store = w.store as any;
          const out = new Uint16Array(101 * 101 * 2);
          for (let y = 700; y <= 800; y++) {
            for (let x = 4700; x <= 4800; x++) {
              const ii = y * 6400 + x;
              out[(y - 700) * 101 + (x - 4700)] = SHEET[store.type[ii]] ?? 9999;
            }
          }
          writeFileSync('/tmp/qqqqq2-out/js-snap-pre61.bin', new Uint8Array(out.buffer));
          writeFileSync('/tmp/qqqqq2-out/js-snap-walls.txt',
            (() => {
              let L = '';
              for (let y = 700; y <= 800; y++) {
                let line = `${y}: `;
                for (let x = 4700; x <= 4800; x++) {
                  const ii = y * 6400 + x;
                  line += `${store.flags[ii] ? String(SHEET[store.type[ii]]) : '.'}/${store.wall[ii]} `;
                }
                L += line + '\n';
              }
              return L;
            })());
          snapTaken = true;
        }
      }) as never,
    } as never);
  } finally {
    RNGp.reseed = oReseed;
  }
}, 600000);
