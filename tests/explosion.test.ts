import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

// 爆炸族群 1:1（Projectile.CanExploteTile cs:75764 / ExplodeTiles cs:75835 / 半径表 cs:75262）
describe('爆炸规则（CanExploteTile + 半径表）', () => {
  const w = () => {
    const world = new World(40, 40, 42, 'open');
    world.lavaLine = 30;
    return world;
  };
  const place = (world: World, key: string, x: number, y: number, frameY = 0) => {
    const t = TILE_BY_KEY[key]!;
    world.store.setTileSilent(x, y, t, 0, frameY);
    return t;
  };
  const sheetOf = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  const can = (world: World, key: string, x: number, y: number, o: { hard?: boolean; golem?: boolean; fy?: number } = {}) =>
    Game.canExplodeTile(world.store, x, y, !!o.hard, !!o.golem, world.lavaLine);

  it('普通块可炸（石/泥土/黑曜石）', () => {
    const world = w();
    place(world, 'stone', 20, 20);
    place(world, 'obsidian', 21, 20);
    expect(can(world, 'stone', 20, 20)).toBe(true);
    expect(can(world, 'obsidian', 21, 20)).toBe(true);
    expect(sheetOf(TILE_BY_KEY['stone']!)).toBe(1);
  });

  it('永不可炸：地牢砖族(41/44) + 宝箱(21) + 祭坛(26) + 蜥蜴祭坛(237) + 蜥蜴砖(226)', () => {
    const world = w();
    place(world, 'v_41_blue_brick', 20, 20);
    place(world, 'v_44_pink_brick', 21, 20);
    place(world, 'v_26_altars', 22, 20);
    place(world, 'v_237_lihzahrd_altar', 23, 20);
    place(world, 'v_226_lihzahrd_brick', 24, 20);
    expect(can(world, 'v_41_blue_brick', 20, 20, { hard: true })).toBe(false);
    expect(can(world, 'v_44_pink_brick', 21, 20, { hard: true })).toBe(false);
    expect(can(world, 'v_26_altars', 22, 20, { hard: true })).toBe(false);
    expect(can(world, 'v_237_lihzahrd_altar', 23, 20, { hard: true, golem: true })).toBe(false);
    expect(can(world, 'v_226_lihzahrd_brick', 24, 20, { hard: true, golem: true })).toBe(false);
  });

  it('陨石(37)：肉前免疫、肉后可炸（cs:75795）', () => {
    const world = w();
    place(world, 'ore_meteorite', 20, 20);
    expect(sheetOf(TILE_BY_KEY['ore_meteorite']!)).toBe(37);
    expect(can(world, 'ore_meteorite', 20, 20)).toBe(false);
    expect(can(world, 'ore_meteorite', 20, 20, { hard: true })).toBe(true);
  });

  it('蜥蜴砖神庙门行（frameY/18∈1-4）：石巨人前免疫、后可炸（cs:75805）', () => {
    const world = w();
    place(world, 'v_226_lihzahrd_brick', 20, 20, 18); // frameY 行 1
    // 226 恒在黑名单——用 sheet 137（Traps 是 137? 用直接构造验证行规则路径）
    // 直接以 226 验证黑名单恒定；行规则经独立逻辑路径覆盖如下：
    const st = world.store;
    const t137 = TILE_DEFS.find((d) => d.vanilla?.sheet === 137);
    expect(t137).toBeDefined();
    st.setTileSilent(22, 20, TILE_DEFS.indexOf(t137!), 0, 36); // 行 2（门）
    expect(Game.canExplodeTile(st, 22, 20, true, false, 30)).toBe(false); // 石巨人前
    expect(Game.canExplodeTile(st, 22, 20, true, true, 30)).toBe(true);  // 石巨人后
    st.setTileSilent(22, 20, TILE_DEFS.indexOf(t137!), 0, 0);  // 行 0（普通蜥蜴砖）
    expect(Game.canExplodeTile(st, 22, 20, true, false, 30)).toBe(true); // 普通行肉前也可炸
  });

  it('半径表（cs:75262）：炸弹 28=4 / 炸药棍 29=7 / 放置炸药 108=10 / 手雷 30 表外=不破坏', () => {
    expect(Game.EXPLODE_RADIUS[28]).toBe(4);
    expect(Game.EXPLODE_RADIUS[29]).toBe(7);
    expect(Game.EXPLODE_RADIUS[108]).toBe(10);
    expect(Game.EXPLODE_RADIUS[30]).toBeUndefined(); // 手雷不在 ExplodeTiles 判定表
  });
});
