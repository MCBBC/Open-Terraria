import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner } from './TileRunner';
const MUD = TILE_BY_KEY['mud'];
const SILT = TILE_BY_KEY['silt'];
const SAND = T.SAND;
export function runDirtToMudAndSiltPass(st, rng, gs) {
    const { w, h } = st;
    const area = w * h;
    // Dirt To Mud:小泥团撒深层
    for (let n = 0; n < area / 1000; n++) {
        tileRunner(st, rng, gs, rng.int(0, w - 1), rng.int(gs.rockLevelLow, h - 1), {
            strength: rng.int(2, 5), steps: rng.int(2, 39), type: MUD, ignoreTileType: SAND,
        });
    }
    // Silt:两档淤泥脉(沙漠墙区跳过)
    for (let n = 0; n < area * 0.0001; n++) {
        const i = rng.int(0, w - 1);
        const j = rng.int(gs.rockLevelHigh, h - 1);
        const wall = st.wall[st.idx(i, j)];
        if (wall !== 187 && wall !== 216) {
            tileRunner(st, rng, gs, i, j, { strength: rng.int(5, 11), steps: rng.int(15, 49), type: SILT });
        }
    }
    for (let n = 0; n < area * 0.0005; n++) {
        const i = rng.int(0, w - 1);
        const j = rng.int(gs.rockLevelHigh, h - 1);
        const wall = st.wall[st.idx(i, j)];
        if (wall !== 187 && wall !== 216) {
            tileRunner(st, rng, gs, i, j, { strength: rng.int(2, 4), steps: rng.int(2, 4), type: SILT });
        }
    }
}
