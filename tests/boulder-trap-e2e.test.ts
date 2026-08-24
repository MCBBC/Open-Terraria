// 巨石陷阱端到端(R20-I4 复核定谳后重写):
// 原版 DeActive(Wiring.cs:3208-3236)无任何巨石逻辑——Check2x2 失撑判据
// (WorldGen.cs:48937-48944)只查 active()+tileSolid/halfBrick/slope,不含 inActive 位,
// 致动缩入的支撑块仍算"有支撑"→ 压板→致动石栅【不会】让巨石坠下(我方旧演出=
// 造行为,已摘除)。巨石→弹 99 只发生在支撑被【真实破坏】的 Check2x2 链
// (Game.breakTile spawnBoulderRoll,tests/multi-tile-drop.test.ts 已覆盖弹种表)。
// 按 MicroBiomesPass.actuallyPlaceBoulderTrap 的真实口袋几何复刻布局断言三态:
//   ①致动支撑 → 巨石 2×2 原样保留、零弹体;
//   ②复位(reActive) → 同样零弹体;
//   ③支撑被真实清格(Wiring 外的破坏链语义) → 由 Game 侧负责,本层不再代发。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const BOULDER = TILE_BY_KEY['v_138_boulder'];
const STONE = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 1);

/** 复刻 gen 布局(X=巨石锚列):2×2 巨石@X..X+1, 左列 X-1 净空, 壳壁 X+2 起 2 深,
 *  支撑行(致动器+线)在巨石下,再下 2 行净空走廊,走廊尽头右侧石墙 */
function trapWorld(): { w: World; wr: Wiring; boulderCells: () => number[] } {
  const w = new World(80, 80, 30, 'open');
  const st = w.store;
  const X = 40, Y = 40;                       // 巨石锚(左上)
  for (let y = Y - 2; y <= Y + 1; y++) st.setTileSilent(X + 2, y, STONE, 0, 0);
  const floorY = Y + 6;
  for (let x = X - 1; x <= X + 14; x++) st.setTileSilent(x, floorY, STONE, 0, 0);
  for (let y = Y + 2; y < floorY; y++) st.setTileSilent(X + 14, y, STONE, 0, 0);  // 远端墙
  const supY = Y + 2;
  for (let x = X; x <= X + 1; x++) {
    st.setTileSilent(x, supY, STONE, 0, 0);
    st.wire[st.idx(x, supY)] = TileStore.WIRE_RED | TileStore.WIRE_ACTUATOR;
  }
  st.setTileSilent(X, Y, BOULDER, 0, 0);
  st.setTileSilent(X + 1, Y, BOULDER, 18, 0);
  st.setTileSilent(X, Y + 1, BOULDER, 0, 18);
  st.setTileSilent(X + 1, Y + 1, BOULDER, 18, 18);
  const wr = new Wiring(st, 40);
  const boulderCells = () => [st.idx(X, Y), st.idx(X + 1, Y), st.idx(X, Y + 1), st.idx(X + 1, Y + 1)];
  return { w, wr, boulderCells };
}

describe('巨石陷阱端到端(致动不构成失撑,R20-I4)', () => {
  it('actuate 支撑 → 巨石 2×2 原样保留、不生成弹体(原版 Check2x2 不含 inActive 位)', () => {
    const { w, wr, boulderCells } = trapWorld();
    const before = boulderCells().map((i) => w.store.type[i]);
    wr.actuate(40, 42);                        // 真实信号两根同缩
    wr.actuate(41, 42);
    // 支撑已缩入(inActive 置位)
    expect(w.store.isActuated(40, 42)).toBe(true);
    expect(w.store.isActuated(41, 42)).toBe(true);
    // 巨石 2×2 仍在原位(未清格、未转弹)
    const after = boulderCells().map((i) => w.store.type[i]);
    expect(after).toEqual(before);
    expect(after.every((t) => t === BOULDER)).toBe(true);
  });

  it('reActive 复位 → 仍零弹体零清格(DeActive/ReActive 全程无巨石分支)', () => {
    const { w, wr, boulderCells } = trapWorld();
    wr.actuate(40, 42);
    wr.actuate(41, 42);
    wr.actuate(40, 42);                        // 再触 = 复位(reActive)
    wr.actuate(41, 42);
    expect(w.store.isActuated(40, 42)).toBe(false);
    const after = boulderCells().map((i) => w.store.type[i]);
    expect(after.every((t) => t === BOULDER)).toBe(true);
  });
});
