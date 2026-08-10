// 数据驱动武器实体行为模拟测试（Boomerang/SpearProj/GrenadeProj/YoyoProj）
// 用最小 mock GameHooks 直接跑 fixedUpdate，验证 aiStyle 家族行为主干
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Boomerang, SpearProj, YoyoProj, GrenadeProj } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;

function makeHooks(opts: { channel?: boolean; target?: { x: number; y: number } } = {}) {
  const store = new TileStore(W, H);
  // 地面：y=100 以下全实心（tile 1 近似实心块——TileStore 类型 0 = 空）
  for (let x = 0; x < W; x++) {
    for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  }
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const events: string[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    spawnDrop: () => null,
    damagePlayer: (d) => events.push(`pHit:${d}`),
    addDamageNumber: (x, y, n) => events.push(`dmg:${n}@${Math.round(x)},${Math.round(y)}`),
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, player, enemies, events, channel: !!opts.channel };
}

/** 空中敌人（y=90 行，悬浮不动） */
function addEnemy(enemies: Array<Record<string, unknown>>, id: number, ex: number, ey: number) {
  enemies.push({
    id, x: ex, y: ey, w: 24, h: 40, dead: false, vx: 0, vy: 0,
    hp: 100,
    hurt: (d: number) => { enemies.find((e) => e.id === id)!.hp = (enemies.find((e) => e.id === id)!.hp as number) - d; events_track.push(id); return true; },
  } as never);
}
// hurt 内部记账
const events_track: number[] = [];

const STEP = 300;
function run(e: { fixedUpdate: (dt: number, g: GameHooks) => void }, g: GameHooks, n = STEP) {
  for (let i = 0; i < n && !(e as { dead: boolean }).dead; i++) e.fixedUpdate(1 / 60, g);
}

describe('回旋镖（aiStyle 3）', () => {
  it('飞出减速 → 返回主角 → 回手消失，途中可命中', () => {
    const { hooks, player, enemies } = makeHooks();
    // 敌人摆在回旋镖飞行线上（与出手点同 y）
    addEnemy(enemies, 1, 80 * 16, player.cy - 12);
    const b = new Boomerang(player.cx, player.cy - 4, 10, 0, 15, 4, 6);
    run(b, hooks, 400);
    // 最终必须回手消失（dead）且没有飞出世界
    expect(b.dead).toBe(true);
    const enemy = enemies[0] as unknown as { hp: number };
    expect(enemy.hp).toBeLessThan(100); // 途中命中过
  });
});

describe('长矛（aiStyle 19）', () => {
  it('随角色前刺伸缩，一个周期后消失，命中沿途敌人', () => {
    const { hooks, player, enemies } = makeHooks();
    addEnemy(enemies, 2, 55 * 16, 89 * 16);
    const s = new SpearProj(1, 0, 120, 30, 30, 5, 46);
    run(s, hooks);
    expect(s.dead).toBe(true); // 一个 useTime 周期结束
    const enemy = enemies[0] as unknown as { hp: number };
    expect(enemy.hp).toBeLessThan(100);
  });
});

describe('手雷（aiStyle 16）', () => {
  it('引信到期爆炸（回调触发），弹跳不穿透地面', () => {
    const { hooks } = makeHooks();
    let exploded: Array<[number, number, number]> = [];
    const g = new GrenadeProj(50 * 16, 50 * 16, 3, 0, 60, 180, 28, (x, y, d) => exploded.push([x, y, d]));
    run(g, hooks);
    expect(g.dead).toBe(true);
    expect(exploded.length).toBe(1);
    // 弹跳：不应沉入地面之下（地面顶 y=100*16=1600）
    expect(g.y + g.h).toBeLessThanOrEqual(1600 + 2);
  });
});

describe('悠悠球（aiStyle 99）', () => {
  it('按住滞留追光标；松手回收消失', () => {
    const opts = { channel: true, target: { x: 70 * 16, y: 85 * 16 } };
    const { hooks, player } = makeHooks(opts);
    let ch = true;
    const y = new YoyoProj(player.cx, player.cy - 4, 20, 4, 547, 300,
      () => ch, () => opts.target, false);
    run(y, hooks, 120);
    expect(y.dead).toBe(false); // channel 中不消失
    // 朝光标靠近
    expect(Math.abs(y.cx - opts.target.x)).toBeLessThan(60);
    ch = false; // 松手
    run(y, hooks, 300);
    expect(y.dead).toBe(true); // 回收
  });
});
