// IIII48 仪E：▶SurfaceCaves 锚点快照（稳健版）——onWorldPartial 无守卫更新引用，
// 并打印热点坐标原始值交叉验证。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I48E === '1';
const W = 4200, H = 1200;
const SEED = 1138154190;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('i48e robust anchor snapshot', async () => {
  interface St { flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array }
  let st: St | null = null;
  let events = 0;
  await generateWorld({
    width: W, height: H, seedText: String(SEED), evil: 0, seedFlags: { remix: true },
    onWorldPartial: (w) => {
      events++;
      const s = (w as unknown as { store?: { flags?: Uint8Array; type?: Uint16Array; wall?: Uint16Array; liquid?: Uint8Array; liquidType?: Uint8Array } }).store;
      if (s?.flags && s.type && s.wall && s.liquid && s.liquidType) {
        st = s as never as St;
      }
    },
  });
  console.log(`onWorldPartial events=${events} finalStore=${st ? 'ok' : 'missing'}`);
  if (!st) throw new Error('no store');
  // 终态导出供后续离线用（此为终清理后状态，仅作参考，不当锚点）
  writeFileSync('/tmp/iii51-out/js-final.typ', Buffer.from((() => {
    const o = new Uint16Array(W * H);
    for (let i = 0; i < W * H; i++) o[i] = (st!.flags[i] & 1) ? Math.max(0, SHEET[st!.type[i]]) : 0;
    return o.buffer;
  })()));
}, 900_000);
