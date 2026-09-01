// IIII106 单元：doWorldIsInfected 直调烟测（22×10 店面：顶行草/其余泥土全腐化转化）
import { it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { doWorldIsInfected } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';

it('i106 dwii smoke', () => {const GRASS_ID = (() => { const g = Object.entries(TILE_BY_KEY).find(([k, v]) => k === 'grass'); return g ? g[1] : TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 2); })();

  const st = new TileStore(32, 48);
  const grass = GRASS_ID;
  const dirt = TILE_BY_KEY['dirt'];
  for (let x = 5; x < 27; x++) {
    for (let y = 30; y < 40; y++) {
      const i = st.idx(x, y);
      st.flags[i] = 1;
      st.type[i] = y === 30 ? grass : dirt;
    }
  }
  const rng = new RNG(77);
  doWorldIsInfected(st, rng, {
    seedFlags: { infectedSeed: true },
    crimson: false,
    crimsonLeft: false,
    worldSurface: 29,
    rockLevel: 60,
  } as never);
  let corruptGrass = 0;
  let corruptStone = 0;
  for (let x = 5; x < 27; x++) {
    if (TILE_DEFS[st.type[st.idx(x, 30)]]?.vanilla?.sheet === 23) corruptGrass++;
    
  }
  console.log('top-row corrupt-grass:', corruptGrass, '/22 ; mid corrupt-stone(expected stone conversion? raw dirt stays):', corruptStone);
});
