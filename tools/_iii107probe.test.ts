// IIIII107 一次性微探针：在 base_UHBC 基座上直呼 placeBuriedChest，
// 观测 w1176 分叉 attempt 的门输入（gy/rockLevel/seedFlags）与沙漠池触发。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { placeBuriedChest, type ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN = process.env.SW_I107PROBE === '1';
const BASE = process.env.SW_P_BASE ?? '/tmp/iii130-out/replay1/base_UndergroundHousesAndBuriedChests';

(RUN ? it : it.skip)('w1176 desert-gate microprobe', async () => {
  void RUN;
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as Record<string, unknown>;
  console.log('seedFlags =', JSON.stringify(gs.seedFlags), 'rockLevel=', gs.rockLevel, 'ws=', gs.worldSurface);

  // 门输入观测钩
  (globalThis as { __swIceGate?: (...a: unknown[]) => void }).__swIceGate =
    (i: number, gy: number, tBelow: number, mainId: number, style: number, fired: number) => {
      if (fired === 0) {
        const remix = !!(gs.seedFlags as { remix?: boolean }).remix;
        const overRock = remix && Number(gy) > Number(gs.rockLevel);
        let wallScan = false;
        if (!overRock && Number(gy) <= st.h - 205) {
          for (let x = i - 15; x <= i + 15 && !wallScan; x++)
            for (let y = gy - 15; y <= gy + 15; y++) {
              if (!st.inBounds(x, y)) continue;
              const wl = st.wall[st.idx(x, y)];
              if (wl === 187 || wl === 216) { wallScan = true; break; }
            }
        }
        console.log(`GATE-in i=${i} gy=${gy} tBelow=${tBelow} mainId=${mainId} remix=${remix} rock=${gs.rockLevel} overRock=${overRock} wallScan=${wallScan}`);
      }
    };

  void gs;
  const g2 = gs as unknown as Parameters<typeof placeBuriedChest>[2];
  (g2 as unknown as Record<string, number>).caveChestCount = 40;
  (g2 as unknown as Record<string, number>).underworldChestCount = 15;
  (g2 as unknown as Record<string, number>).caveHouseCount = 40;
  (g2 as unknown as Record<string, number>).desertHouseCount = 2;
  const chests: ChestSink = [];
  try {
    const r = placeBuriedChest(st, new RNG(1138154190), g2, chests, 1996, 778);
    console.log('direct-call result:', r, 'chests:', chests.length);
  } catch (e) {
    console.log('direct-call threw:', e);
  }
}, 120_000);
