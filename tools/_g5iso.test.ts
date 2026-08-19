// 一次性诊断（GGGGG）：隔离复现 237 蜥蜴祭坛组在引擎扫下的击杀判定
import { it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { genSquareTileFrame } from '../src/world/gen/vanilla/FinalCleanupPass';
import { genSolidType } from '../src/world/gen/vanilla/GenSolid';

const T237 = TILE_BY_KEY['v_237_lihzahrd_altar']!;
const T226 = TILE_BY_KEY['v_226_lihzahrd_brick']!;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const sv = TILE_DEFS[i]?.vanilla?.sheet; if (typeof sv === 'number') SHEET[i] = sv; }

it('237 group verdict under genSquareTileFrame', () => {
  const st = new TileStore(20, 20);
  // 3×2 组 (8..10, 10..11)，帧 0/18/36 × 0/18；底 226 砖 y12
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
    st.setTileSilent(8 + dx, 10 + dy, T237, dx * 18, dy * 18);
  }
  for (let dx = 7; dx <= 11; dx++) st.setTileSilent(dx, 12, T226, 0, 0);
  console.log(`T226=${T226} genSolid226=${genSolidType(T226)} T237=${T237}`);
  const rng = new RNG(12345);
  genSquareTileFrame(st, rng, 8, 9);  // 管线实况：锚格在祭坛左上一格
  const alive: string[] = [];
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
    const i = st.idx(8 + dx, 10 + dy);
    if (st.flags[i]) alive.push(`(${8 + dx},${10 + dy}) sheet=${SHEET[st.type[i]]} f=${st.frameX[i]},${st.frameY[i]}`);
  }
  console.log(`alive cells after sweep: ${alive.length}`);
  console.log(alive.join(' | ') || '(all killed)');
}, 30000);
