// BJ89 债2 守卫：玩家湿粘滞位 = 原版 wet（Player.cs:27872 flag23 / :27982 `if (!wet)` /
// :28060 num86 支内置真 / :28071 `else if (wet)` 支首置假 / :28160 拍末 `if (!wet)` 清偿）。
//
// 定谳（BJ80 域外观察坐标 → BJ89 清偿）：原版 wet 只由 num86（WetCollision 居中探针,
// 任意液体）驱动；旧实现以 inWater∪inLava∪inHoney∪inShimmer 四桶并集近似,其中 inLava
// 是全盒 LavaCollision——「探针干+全盒岩浆擦过」姿态下并集真而原版 wet 假 → 出浆分支
// 幻影发射（实测 1 条 Splash）,vanilla 静默。
// 变异证红：把 Player.ts `const wasWetAll = this.wetSticky;` 改回四桶并集 → 本文件
// 「岩浆擦过」用例即红（幻影 Splash 复现）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

const W = 64, H = 160;
const ROW = 40;                       // 袋/池所在行
const LIP_TOP = ROW * TILE + 8;       // 半砖有效顶（Collision.cs:2073 j*16+8）
const PW = 20, PH = 42;

/** 唇袋几何（BJ79 证据剖面镜像）· 液型参数化：岩浆 2 / 水 1 */
function pocketWorld(type: number, name: string): World {
  const w = new World(W, H, 11, name);
  const st = w.store;
  for (let x = 26; x <= 35; x++) st.setTile(x, ROW + 1, 1);   // 池底/地面
  for (const x of [26, 27, 34, 35]) st.setTile(x, ROW, 1);    // 整砖地面
  for (const x of [28, 29, 31]) { st.setTile(x, ROW, 1); st.setHalfBrick(x, ROW, true); }
  st.setTile(33, ROW, 1); st.setSlope(33, ROW, 2);
  st.setLiquid(30, ROW, 255, type);
  st.setLiquid(32, ROW, 255, type);
  return w;
}

/** 深水池（探针必湿）：row 60-119 灌水、row 120 池底；右侧 45-52 行 60 干台 */
function deepPoolWorld(): World {
  const w = new World(80, 200, 11, 'bj89-deep-pool');
  const st = w.store;
  for (let x = 20; x < 60; x++) {
    st.setTile(x, 120, 1);
    for (let y = 60; y < 120; y++) st.setLiquid(x, y, 255, 1);
  }
  for (let x = 62; x < 76; x++) for (let y = 100; y < 120; y++) st.setTile(x, y, 1);  // 干台
  return w;
}

function makeDriver(world: World, px: number, py: number) {
  const p = new Player(px, py, new Inventory());
  p.hp = 400;
  const sfx: { name: string; vol: number }[] = [];
  const hooks = {
    world, player: p, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    playSfxWav: (name: string, vol?: number) => { sfx.push({ name, vol: vol ?? 1 }); },
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
  } as unknown as GameHooks;
  return { p, hooks, sfx };
}
const step = (p: Player, hooks: GameHooks, dx: number): void => { p.x += dx; p.fixedUpdate(1 / 60, hooks); };
const splashCount = (sfx: { name: string }[]) => sfx.filter(e => e.name.startsWith('Splash')).length;

beforeEach(() => { vi.restoreAllMocks(); });

describe('BJ89 债2：湿粘滞位 = vanilla wet（num86 居中探针唯一驱动）', () => {
  it('岩浆擦过姿态（探针干+全盒岩浆）：全程 0 Splash、inLava 照常真、wetSticky 恒假', () => {
    const w = pocketWorld(2, 'bj89-lava-graze');
    const { p, hooks, sfx } = makeDriver(w, 28 * TILE, LIP_TOP - PH);
    let sawInLava = false;
    for (let t = 0; t < 44; t++) {
      step(p, hooks, 2.5);
      sawInLava = sawInLava || p.inLava;
    }
    expect(sawInLava).toBe(true);                       // 全盒 LavaCollision 不受损（:27877 1:1）
    expect(splashCount(sfx)).toBe(0);                   // ★判据：幻影出浆分支消失（旧实现 1 条=红）
    expect((p as unknown as { wetSticky: boolean }).wetSticky).toBe(false);
  });

  it('深水真实浸入：入水 1 Splash → 出水（传送干台）1 Splash → 再入水再 1（粘滞位往返重臂）', () => {
    const w = deepPoolWorld();
    const { p, hooks, sfx } = makeDriver(w, 30 * TILE, 55 * TILE);
    for (let t = 0; t < 60; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.inWater).toBe(true);
    expect(splashCount(sfx)).toBe(1);                   // 入水恰 1（:27982-28056）
    expect((p as unknown as { wetSticky: boolean }).wetSticky).toBe(true);
    p.x = 68 * TILE; p.y = 99 * TILE;                   // 传送干台（探针干）
    p.fixedUpdate(1 / 60, hooks);
    p.fixedUpdate(1 / 60, hooks);
    expect(splashCount(sfx)).toBe(2);                   // 出水恰 1（:28071-28153）
    expect((p as unknown as { wetSticky: boolean }).wetSticky).toBe(false);
    p.x = 30 * TILE; p.y = 55 * TILE;                   // 再入水
    for (let t = 0; t < 60; t++) p.fixedUpdate(1 / 60, hooks);
    expect(splashCount(sfx)).toBe(3);                   // 粘滞位已复位 → 入水支再臂
  });

  it('拍末粘滞清偿（:28160 if(!wet)）：出水后 lavaWet 镜像旗随 wetSticky 复位', () => {
    const w = deepPoolWorld();
    const { p, hooks } = makeDriver(w, 30 * TILE, 55 * TILE);
    for (let t = 0; t < 60; t++) p.fixedUpdate(1 / 60, hooks);
    p.x = 68 * TILE; p.y = 99 * TILE;
    p.fixedUpdate(1 / 60, hooks);
    p.fixedUpdate(1 / 60, hooks);
    const self = p as unknown as { wetSticky: boolean; splashLavaWet: boolean; splashHoneyWet: boolean; splashShimmerWet: boolean };
    expect(self.wetSticky).toBe(false);
    expect(self.splashLavaWet).toBe(false);             // !wet → lavaWet=false（:28161-28163）
    expect(self.splashHoneyWet).toBe(false);
    expect(self.splashShimmerWet).toBe(false);
  });
});
