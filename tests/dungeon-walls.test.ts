// 地牢生成验证：完整管线生成后，地牢内部应存在 7/8/9 墙 + 地牢砖；
// world.dungeonX/Y 应指向实际结构（DungeonPass 重掷后的最终位置）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

describe('地牢生成（DungeonPass）', () => {
  it('完整管线后地牢墙存活 + dungeonX/Y 指向结构', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'dungeon-probe-1' });
    const st = world.store;
    const dX = world.dungeonX, dY = world.dungeonY || Math.floor(world.groundLevel);
    // 扫地牢锚点周边 ±120 × (dY-20 .. rockLevel+200)
    let dungeonWalls = 0, dungeonBricks = 0;
    const y1 = Math.min(st.h - 10, Math.floor(world.rockLevel) + 200);
    for (let y = Math.max(10, dY - 20); y < y1; y++) {
      for (let x = Math.max(2, dX - 120); x < Math.min(st.w - 2, dX + 120); x++) {
        const i = st.idx(x, y);
        const wl = st.wall[i];
        if (wl === 7 || wl === 8 || wl === 9 || (wl >= 94 && wl <= 99)) dungeonWalls++;
        const d = st.type[i];
        // 地牢砖 = 内部 tile key v_41/v_43/v_44/481-483
        if (st.flags[i] && (d >= 0)) {
          const def = (st.type[i], undefined);
          void def;
        }
      }
    }
    // 砖统计换 key 反查
    const { TILE_BY_KEY } = await import('../src/data/tiles');
    const brickIds = ['v_41_blue_brick', 'v_43_green_brick', 'v_44_pink_brick'].map((k) => TILE_BY_KEY[k]);
    for (let y = Math.max(10, dY - 20); y < y1; y++) {
      for (let x = Math.max(2, dX - 120); x < Math.min(st.w - 2, dX + 120); x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && brickIds.includes(st.type[i])) dungeonBricks++;
      }
    }
    console.log('dungeon:', { dX, dY, gl: world.groundLevel, dungeonWalls, dungeonBricks });
    expect(dungeonBricks).toBeGreaterThan(500);   // 地牢结构本体存在
    expect(dungeonWalls).toBeGreaterThan(200);    // 地牢背景墙存活
    expect(world.dungeonY).toBeGreaterThan(0);    // 入口 Y 已回填
  }, 300000);   // 管线本体 ~70s,120s 硬上限在并行会话负载期边际超时（评审 C 定谳上调）
});
