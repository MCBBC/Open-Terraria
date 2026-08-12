import { it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  frameTrackArea, placeTrack, trackCollision, tileHeightAt,
  FLAG_ON_TRACK, FLAG_BOUNCY_BUMPER, PLAYER_DEFAULT_GRAVITY, type TrackRider,
} from '../src/world/MinecartTrack';
const TRACK = TILE_BY_KEY['v_314_minecart_track'] ?? -1;
it('trace', () => {
  const st = new TileStore(40, 40);
  for (let k = 0; k < 2; k++) { placeTrack(st, 8 + k, 12, 0); frameTrackArea(st, 8 + k, 12); }
  st.setTile(10, 12, TRACK, 25, 0xFFFF);
  console.log('frames', st.frameX[st.idx(8,12)], st.frameX[st.idx(9,12)], st.frameX[st.idx(10,12)],
    'h25', tileHeightAt(25,0), tileHeightAt(25,1), tileHeightAt(25,2));
  const r: TrackRider = { x: 8*16+2-10, y: 12*16+6-52, vx: 7, vy: PLAYER_DEFAULT_GRAVITY, lastBoostX: 0, lastBoostY: 0 };
  for (let t = 0; t < 40; t++) {
    r.vy = PLAYER_DEFAULT_GRAVITY;
    const bits = trackCollision(st, r, 20, 52, false, false, 0, false);
    r.x += r.vx; r.y += r.vy;
    const mx = r.x + 10;
    console.log(t, 'x', r.x.toFixed(1), 'y', r.y.toFixed(1), 'vx', r.vx.toFixed(2), 'vy', r.vy.toFixed(2),
      'tile', Math.floor(mx/16), Math.floor((r.y+52)/16), 'sub', Math.trunc(Math.trunc(mx)%16/2),
      'onTrack', !!(bits & (1<<FLAG_ON_TRACK)), 'bump', !!(bits & (1<<FLAG_BOUNCY_BUMPER)));
    if (bits & (1<<FLAG_BOUNCY_BUMPER)) break;
  }
});
