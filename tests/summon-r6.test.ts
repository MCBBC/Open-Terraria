// R6 召唤系统回归：combatWeapon summon 分流 / 随从上限驱逐 / 随从行为（mock 驱动）
import { describe, it, expect } from 'vitest';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

// ---- mock 环境（weapons-entities 同款） ----
const W = 200, H = 120;
function makeWorld() {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
function makeHooks(enemies: Array<Record<string, unknown>> = []) {
  const store = makeWorld();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  // 随从射击出口（MinionProj.fixedUpdate 射弹经 entities.add 入 projectiles 桶）——
  // GameHooks 未声明 entities（生产侧统一以 as unknown 收窄），测试同样旁挂
  (hooks as unknown as { entities: { add: (e: unknown) => void } }).entities =
    { add: (e: unknown) => { added.push(e); } };
  return { hooks, store, player, added };
}

const iid = (key: string) => {
  // 直接构造满足 CombatWeaponItemLike 的形状（vi_ key 反解）
  return { key };
};

describe('combatWeapon summon 分流', () => {
  it('小鬼法杖 2365 → kind=summon 非哨兵；寒霜九头蛇 1572 → 哨兵（ai 53）', () => {
    const imp = combatWeapon(iid('vi_2365_ImpStaff'));
    expect(imp?.kind).toBe('summon');
    expect((imp as { sentry?: boolean }).sentry).toBe(false);
    expect(imp?.damage).toBe(17);
    const hydra = combatWeapon(iid('vi_1572_FrostHydraStaff'));
    expect(hydra?.kind).toBe('summon');
    expect((hydra as { sentry?: boolean }).sentry).toBe(true);
  });
  it('31 件召唤武器全部解析为 summon', () => {
    const ids = [1157, 1309, 1572, 1802, 2364, 2365, 2366, 2535, 2551, 2584, 2621, 2749,
      3249, 3474, 3531, 3569, 3571, 3834, 4269, 4273, 4281, 4607, 4758, 5005, 5069,
      5114, 5119, 5456, 5463, 5663, 5664];
    let ok = 0;
    for (const id of ids) {
      const w = combatWeapon({ key: `vi_${id}_x` });
      if (w?.kind === 'summon') ok++;
    }
    expect(ok).toBe(ids.length);
  });
});

describe('MinionProj 行为', () => {
  it('飞行随从：无目标悬停玩家侧后 → 有目标朝目标移动 → >1300px 瞬移回', () => {
    const { hooks, player } = makeHooks();
    const m = new MinionProj(player.x, player.y, 375, 17, 2, false, 0, false, () => player);
    // 无敌悬停几帧：靠近玩家
    for (let k = 0; k < 60; k++) m.fixedUpdate(1, hooks);
    expect(Math.hypot(m.cx - player.cx, m.cy - player.cy)).toBeLessThan(80);
    // 出现敌人 → 靠近
    const enemy: Record<string, unknown> = {
      id: 1, x: 100 * 16, y: 80 * 16, w: 16, h: 24, dead: false,
      cx: 100 * 16 + 8, cy: 80 * 16 + 12,
      hp: 1000, hurt: (d: number) => { enemy.hp = (enemy.hp as number) - d; return true; },
    };
    const { hooks: h2 } = makeHooks([enemy]);
    const d0 = Math.hypot(enemy.cx as number - m.cx, enemy.cy as number - m.cy);
    for (let k = 0; k < 220; k++) m.fixedUpdate(1, h2); // 640px 距离 / 5px 每帧
    expect(Math.hypot((enemy.cx as number) - m.cx, (enemy.cy as number) - m.cy)).toBeLessThan(d0);
    // 接触造成伤害（hp 下降）
    expect(enemy.hp).toBeLessThan(1000);
    // 远离 >1300 → 瞬移回
    m.x = player.cx + 2000;
    m.fixedUpdate(1, h2);
    expect(Math.hypot(m.cx - player.cx, m.cy - player.cy)).toBeLessThan(100);
  });
  it('哨兵 aiStyle 53：初冷 120t 后每 60t 一发（Projectile.cs:27176-27288）+ 寿命耗尽自灭', () => {
    const enemy = {
      id: 2, x: 80 * 16, y: 90 * 16, w: 16, h: 24, dead: false,
      get cx() { return this.x + 8; }, get cy() { return this.y + 12; },
      hp: 1000, hurt: () => true,
    };
    const { hooks, player } = makeHooks([enemy]);
    const s = new MinionProj(player.x, player.y, 308, 100, 7.5, true, 0, false, () => player);
    // 注入 entities.add 通道
    (hooks as unknown as { entities: unknown }).entities = {
      add: (e: unknown) => { (enemy as unknown as { __shots?: unknown[] }).__shots = [((enemy as unknown as { __shots?: unknown[] }).__shots ?? []), e].flat(); },
    };
    const h = hooks as unknown as GameHooks & { entities: { add: (e: unknown, b: string) => void } };
    const shots = () => ((enemy as unknown as { __shots?: unknown[] }).__shots ?? []).length;
    for (let k = 0; k < 119; k++) s.fixedUpdate(1, h);
    expect(shots()).toBe(0);   // 初冷 ai[0]=120（:27176-27181；含初始 tick 衰减）
    for (let k = 0; k < 11; k++) s.fixedUpdate(1, h);
    expect(shots()).toBe(1);   // 第 121t 首发并重置 60（:27282-27288）
    for (let k = 0; k < 50; k++) s.fixedUpdate(1, h);
    expect(shots()).toBe(1);   // 60t 冷却期内不再发
    s.fixedUpdate(1, h);
    expect(shots()).toBe(2);   // 第 181t 第二发（60t 射速）
    expect(s.dead).toBe(false);
    s.life = 1;
    s.fixedUpdate(1, h);
    expect(s.dead).toBe(true);
  });
});
