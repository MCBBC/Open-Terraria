// 远程基地入驻(用户报"NPC 没入驻我的房子",房离出生点 66 格):
// 房本身合格(同布局 checkRoom OK/score 70)——根因是入驻轮冷启锚只回退出生点,
// findFreeHouse ±10 窗永扫不到玩家基地。修复 = 冷启锚池加玩家当前位。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { checkRoom, findFreeHouse } from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR = 17;

/** 照用户存档逐格复刻(报告 areaPlayer 解码):双门/木墙/三火把/桌/椅/工作台 */
function buildHouse(w: World): void {
  const st = w.store;
  for (let x = 2164; x <= 2174; x++) { st.setTileSilent(x, 292, TILE_BY_KEY['wood'], 0, 0); st.setTileSilent(x, 298, TILE_BY_KEY['wood'], 0, 0); }
  for (let y = 293; y <= 297; y++) { st.setTileSilent(2164, y, TILE_BY_KEY['wood'], 0, 0); st.setTileSilent(2174, y, TILE_BY_KEY['wood'], 0, 0); }
  for (let y = 293; y <= 297; y++) for (let x = 2165; x <= 2173; x++) st.wall[st.idx(x, y)] = 4;
  for (const dx of [2164, 2174]) for (let y = 295; y <= 297; y++) st.setTileSilent(dx, y, DOOR, 0, (y - 295) * 18);
  st.setTileSilent(2165, 294, TILE_BY_KEY['torch'], 22, 0);
  st.setTileSilent(2173, 294, TILE_BY_KEY['torch'], 44, 0);
  st.setTileSilent(2170, 295, TILE_BY_KEY['torch'], 0, 0);
  st.setTileSilent(2168, 296, TILE_BY_KEY['chair'], 0, 0);
  st.setTileSilent(2168, 297, TILE_BY_KEY['chair'], 0, 18);
  for (let x = 2169; x <= 2171; x++) { st.setTileSilent(x, 296, TILE_BY_KEY['table'], (x - 2169) * 18, 0); st.setTileSilent(x, 297, TILE_BY_KEY['table'], (x - 2169) * 18, 18); }
  for (const [x, fx] of [[2172, 0], [2173, 18]] as const) { st.setTileSilent(x, 296, TILE_BY_KEY['workbench'], fx, 0); st.setTileSilent(x, 297, TILE_BY_KEY['workbench'], fx, 18); }
}

describe('远程基地入驻', () => {
  it('房本身合格(对照排除)', () => {
    const w = new World(4200, 1200, 30, 'open');
    buildHouse(w);
    const room = checkRoom(w.store, 2164, 297);
    expect(room).not.toBeNull();
  });

  it('★玩家位锚:距房 ≤10 格可找到;出生点锚(66 格外)找不到', () => {
    const w = new World(4200, 1200, 30, 'open');
    buildHouse(w);
    // 修复后的语义:冷启锚 = 玩家位(玩家就在房里 2167,295)
    expect(findFreeHouse(w.store, [], 2167, 295)).not.toBeNull();
    // 旧语义(出生点 2101,300):窗 2091-2111,房门 2164 不在 → null(用户案发现场)
    expect(findFreeHouse(w.store, [], 2101, 300)).toBeNull();
  });
});
