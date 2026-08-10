import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/core/rng', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/core/rng')>();
  return { ...mod, hashString: (_s: string) => 1084082940 };
});

const { generateWorld } = await import('../src/world/gen/WorldGen');
const { TILE_BY_KEY } = await import('../src/data/tiles');

describe('树缺口复现(种子 1084082940 直注)', () => {
  it('生成后检查 x=2088..2104, y=196..216 树格', async () => {
    const world = await generateWorld({
      width: 4200, height: 1200,
      seedText: 'x', name: 'repro',
    } as never);
    console.log('spawn:', world.spawnX, world.spawnY, '(期望 2098,211)', 'crimson:', world.crimson);
    const TREE = TILE_BY_KEY['tree']!;
    const st = world.store;
    for (let y = 196; y <= 216; y++) {
      let row = `y=${y}: `;
      for (let x = 2088; x <= 2104; x++) {
        const j = st.idx(x, y);
        row += st.type[j] === TREE ? `${st.frameX[j]},${st.frameY[j]}`.padStart(7) : (st.type[j] === 0 ? '   .   ' : `#${st.type[j]}     `.slice(0, 7));
      }
      console.log(row);
    }
    expect(true).toBe(true);
  }, 600000);
});
