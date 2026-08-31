// IIII90 批：基座(#43)上几何有效祭坛锚点普查（ValidSpot census）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { idsByVanillaSheet } from '../src/world/gen/vanilla/TileRunner';
import { genSolidType } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I90VS === '1';
const OUT = '/tmp/iii94-out/cap-remix';
(RUN ? it : it.skip)('valid anchor census', () => {
  const ALTAR = TILE_BY_KEY['v_26_altars']!;
  const BOULDERS = new Set<number>([
    'v_138_boulder', 'v_484_rolling_cactus', 'v_664_bouncy_boulder', 'v_665_life_crystal_boulder',
    'v_711_rainbow_boulder', 'v_712_poo_boulder', 'v_713_lava_boulder', 'v_714_spider_boulder',
    'v_715_ghoulder', 'v_716_friendly_boulder',
  ].map((k) => TILE_BY_KEY[k]).filter((v): v is number => v !== undefined));
  const PLATFORMS = new Set(idsByVanillaSheet(19, 427, 435, 436, 437, 438, 439));
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  for (const c of CHANS) {
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, buf.length / bytesPer));
  }
  // 以「无既有坛」的纯净几何判定（IsTileNearby 只对旧坛敏感，此处先不计坛邻门）
  let valid = 0;
  const validList: string[] = [];
  for (let y = 5; y < st.h - 5; y++) {
    for (let x = 5; x < st.w - 5; x++) {
      let ok = true;
      for (let dx = -1; dx <= 1 && ok; dx++) for (let dy = -1; dy <= 0 && ok; dy++) {
        if (st.flags[st.idx(x + dx, y + dy)]) ok = false;
      }
      if (!ok) continue;
      for (let dx = -1; dx <= 1 && ok; dx++) {
        const bi = st.idx(x + dx, y + 1);
        if (!st.flags[bi]) { ok = false; break; }
        const topSlope = st.slope[bi] === 1 || st.slope[bi] === 2;
        if (!((PLATFORMS.has(st.type[bi]) && (st.half[bi] !== 0 || topSlope)) || st.slope[bi] === 0)) ok = false;
        else if (st.half[bi] !== 0) ok = false;
        else if (BOULDERS.has(st.type[bi])) ok = false;
        else if (!genSolidType(st.type[bi])) ok = false;
      }
      if (!ok) continue;
      valid++;
      if (validList.length < 4000) validList.push(`${x},${y}`);
    }
  }
  console.log(`valid anchors(base,#43,无视坛邻门)=${valid}`);
});
