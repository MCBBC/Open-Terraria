import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE_BY_KEY } from '../src/data/tiles';

// 黏滞 tile（Collision.StickyTiles + Player.cs:22650-22740）
const fakeHooks = (w: World) => ({
  world: w,
  spawnDrop: () => null,
  addDamageNumber: () => {},
  playSfx: () => {},
  spawnParticles: () => {},
  onInventoryChanged: () => {},
});

describe('蛛网/蜂蜜块黏滞（StickyTiles 1:1）', () => {
  it('蛛网内：下落钳 1 且 ×0.3 缓沉、水平 ×0.6/0.85 阻尼、禁跳', () => {
    const w = new World(40, 40, 42, 'web');
    const st = w.store;
    const WEB = TILE_BY_KEY['v_51_cobweb']!;
    // 20,20 放一列 4 格蛛网
    for (let y = 18; y <= 21; y++) st.setTileSilent(20, y, WEB);
    const p = new Player(20 * 16, 17 * 16, new Inventory());
    p.vy = 8; p.vx = 3; p.jumpHold = 10; // 高速下落 + 横移 + 跳跃中
    p.fixedUpdate(1 / 60, fakeHooks(w) as never);
    expect(p.vy).toBeLessThanOrEqual(1 * 0.3 + 0.36); // 钳 1 后 ×0.3 + 本 tick 重力
    expect(p.jumpHold).toBe(0);
    expect(p.vx).toBeLessThan(1.5); // 水平阻尼明显
  });

  it('无黏滞 tile 时不受影响', () => {
    const w = new World(40, 40, 42, 'open');
    const p = new Player(20 * 16, 17 * 16, new Inventory());
    p.vy = 8;
    p.fixedUpdate(1 / 60, fakeHooks(w) as never);
    expect(p.vy).toBeGreaterThan(4); // 正常重力累积
  });

  it('蜂蜜块：Y 缓沉生效但不禁跳', () => {
    const w = new World(40, 40, 42, 'honey');
    const st = w.store;
    const HONEY = TILE_BY_KEY['v_229_honey_block']!;
    for (let y = 18; y <= 21; y++) st.setTileSilent(20, y, HONEY);
    const p = new Player(20 * 16, 17 * 16, new Inventory());
    p.vy = 8; p.jumpHold = 10;
    p.inputJump = true; // 按住跳：正常每 tick -1（=9）；若被黏滞清零会是 0
    p.fixedUpdate(1 / 60, fakeHooks(w) as never);
    expect(p.vy).toBeLessThanOrEqual(1 * 0.3 + 0.36);
    expect(p.jumpHold).toBe(9); // 自然衰减 1，未被黏滞清零（type != 229 才清）
  });

  it('撕网目标 1:1（Collision.StickyTiles 列优先 cs:3399）：最左重叠列优先于更上行的网', () => {
    const w = new World(40, 40, 42, 'open');
    const st = w.store;
    const WEB = TILE_BY_KEY['v_51_cobweb']!;
    for (let x = 18; x <= 26; x++) st.setTileSilent(x, 30, 2); // 宽地板
    // 两张网：左列低位 (20,29) 与右列高位 (21,27)——行优先会先撕 (21,27)，
    // 列优先（原版）先撕最左重叠列的 (20,29)
    st.setTileSilent(20, 29, WEB);
    st.setTileSilent(21, 27, WEB);
    for (let y = 26; y <= 29; y++) st.setTileSilent(22, y, 2); // 右墙钉住玩家不漂出左列重叠区
    const drops: Array<{ x: number; y: number }> = [];
    const hooks = {
      ...fakeHooks(w),
      spawnDrop: (_x: number, _y: number) => { drops.push({ x: _x, y: _y }); return null; },
    } as never;
    const p = new Player(20 * 16 - 4, 30 * 16 - 42, new Inventory());
    p.inputX = 1;
    let ticks = 0;
    for (let t = 0; t < 600 && drops.length === 0; t++) {
      p.fixedUpdate(1 / 60, hooks);
      ticks++;
    }
    expect(drops.length).toBeGreaterThan(0);           // 挣扎撕破
    expect(Math.floor(drops[0].x / 16)).toBe(20);      // 最左重叠列
    expect(Math.floor(drops[0].y / 16)).toBe(29);      // 该列的网（非更上行的 27）
    expect(st.type[st.idx(20, 29)]).not.toBe(WEB);     // 检测格被破坏（KillTile 语义）
    expect(st.type[st.idx(21, 27)]).toBe(WEB);         // 上行那张未动
  });
});
