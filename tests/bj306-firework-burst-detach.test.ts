// ★BJ306（2026-09-23，BJ303 姊妹崩点清偿）：Dart.ts 三处烟花/水花粒子站
// （喷泉 :978 / 马桶水花 :1010 / 烟花爆花 explodeFirework :1031）曾把
// game.spawnBurst detach 成局部 const 再裸调用——ESM 严格模式 this=undefined，
// Game.spawnBurst 体首句 this.acquireParticle（Game.ts:46446）抛 TypeError
// → 帧循环熔断。修复 = game.spawnBurst?.bind(game)（bind 保调用点逐字节不变）。
// 同族普查另落一刀：Mounts.ts SantankShellProj.explode 的 game.spawnDust
// detach（体首句 this.vanillaDust，Game.ts:44036）——圣坦炮弹爆散拍同型崩。
// 判别面设计（沿 tests/grapple.test.ts BJ303 范式）：stub 的 spawnBurst/
// spawnDust 必须写成【this 依赖方法】（镜像真实现首句 this.* 读）——
// detach 裸调用即在 stub 处抛 "Cannot read properties of undefined"。
// 存量 fireworks.test.ts 的 spawnBurst 桩是无 this 箭头函数（夹具喂幻影，
// BJ89 同族：桩掩护真炸点），故本文件独立建桩，不与彼共享。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TrapShot, FW_DUST } from '../src/entities/Dart';
import { SantankShellProj } from '../src/entities/Mounts';
import type { GameHooks } from '../src/entities/types';

type BurstRec = { x: number; y: number; color: string; count: number };
type DustRec = { x: number; y: number; type: number };

/** 桩 GameHooks：spawnBurst/spawnDust 为 this 依赖方法（判别面核心）。
 *  其余成员沿 fireworks.test.ts makeGame 形（已证可驱动烟花/水花三路径）。 */
function makeHooks() {
  const world = new World(60, 60, 7, 'open');
  const sfx: string[] = [];
  const hooks = {
    world,
    player: { x: -500, y: -500, w: 20, h: 20, dead: false, cx: -490, luck: 0 },
    enemies: () => [] as unknown[],
    critters: () => [] as unknown[],
    npcs: () => [] as unknown[],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    playSfx: (n: string) => { sfx.push(n); },
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    notifyInventoryChanged: () => {},
    // ★判别面：与 Game.spawnBurst（Game.ts:46435-46460）同形——体读 this.bursts。
    // detach 裸调用（this=undefined）即抛 "reading 'bursts'"。
    spawnBurst(this: { bursts: BurstRec[] }, x: number, y: number, color: string,
      count: number, _speed: number, _dir?: number, _spread?: number,
      _opts?: { life?: number; damp?: number; grav?: number; xMul?: number; yMul?: number },
    ): void {
      this.bursts.push({ x, y, color, count });
    },
    bursts: [] as BurstRec[],
    // ★判别面：与 Game.spawnDust（Game.ts:44029-44044）同形——首句读 this.vanillaDust
    // 的 this 依赖等价物。返回入池尘对象（消费侧 d.vx *= 1.4 需真值）。
    spawnDust(this: { dusts: DustRec[] }, x: number, y: number, _w: number, _h: number,
      type: number): unknown {
      this.dusts.push({ x, y, type });
      return { vx: 0, vy: 0, scale: 1 };
    },
    dusts: [] as DustRec[],
  };
  return { world, hooks: hooks as unknown as GameHooks, raw: hooks, sfx };
}

describe('BJ306 烟花/水花三粒子站（spawnBurst detach 崩点回归——this 保持判别）', () => {
  it('烟花喷泉 419（:978 站）：锚 338 在位步进不炸 + 每 tick 2 粒 d222 黄正常产生', () => {
    const { world, hooks, raw } = makeHooks();
    const t338 = TILE_BY_KEY['v_338_fireworkfountain']!;
    world.store.setTileSilent(30, 40, t338, 0, 0);
    world.store.setTileSilent(30, 41, t338, 0, 18);
    const p = new TrapShot(30 * 16 + 8, 40 * 16 + 2, 0, 0, 0, 'fireworkFountain', 0, [30, 40]);
    // 修复前：首 tick 喷泉站 detach 裸调用即抛 TypeError（崩点帧）
    expect(() => {
      for (let t = 0; t < 5; t++) p.fixedUpdate(1, hooks);
    }).not.toThrow();
    expect(p.dead).toBe(false);
    expect(raw.bursts).toHaveLength(5);                      // 每 tick 1 站 2 粒
    expect(raw.bursts.every((b) => b.count === 2)).toBe(true);
    expect(raw.bursts.every((b) => b.color === FW_DUST.d222_yellow)).toBe(true);
  });

  it('马桶水花 733（:1010 站）：12 帧全寿不炸 + 11 帧 26 粒水尘正常产生', () => {
    const { hooks, raw } = makeHooks();
    const p = new TrapShot(40 * 16 + 8, 50 * 16 + 12, 0, 0, 0, 'toiletPop');
    let ticks = 0;
    expect(() => {
      while (!p.dead && ticks < 100) { p.fixedUpdate(1, hooks); ticks++; }
    }).not.toThrow();
    expect(ticks).toBe(12);                                  // ai[0]=11 → 自杀（:49284-49287）
    const water = raw.bursts.filter((b) => b.color === FW_DUST.d216_water);
    expect(water).toHaveLength(11);                          // 1×6 + 10×2（:49299-49305）
    expect(water.reduce((n, b) => n + b.count, 0)).toBe(26);
    expect(water[0]!.count).toBe(6);
    expect(p.dead).toBe(true);
  });

  it('烟花火箭爆花 167（:1031 explodeFirework 站，radial 闭包消费 burst）：45t 到点爆花不炸 + 400 粒 d130 红', () => {
    const { hooks, raw, sfx } = makeHooks();
    const p = new TrapShot(200, 200, 0, -8, 150, 'fireworkRocket', 0);
    let ticks = 0;
    expect(() => {
      while (!p.dead && ticks < 100) { p.fixedUpdate(1, hooks); ticks++; }
    }).not.toThrow();
    expect(ticks).toBe(45);                                  // timeLeft 45 到点 Kill（:73435）
    expect(sfx).toContain('explosion');                      // SoundID.Item14（:73437）
    expect(raw.bursts.reduce((n, b) => n + b.count, 0)).toBe(400); // 四档各 100（:73439-73473）
    expect(raw.bursts.every((b) => b.color === FW_DUST.d130_red)).toBe(true);
  });
});

describe('BJ306 同族普查刀：圣坦炮弹爆散（Mounts SantankShellProj.explode spawnDust detach）', () => {
  it('爆散拍（引信相）不炸 + 70 粒原版池尘（30×d31 + 20×d6 + 20×d6）正常产生', () => {
    const { hooks, raw } = makeHooks();
    const shell = new SantankShellProj(100, 100, 1, 0, 50, 8, 930);
    // 触 tile → 引信相 timeLeft=3（:19891-19893）；置 1 后一拍即爆（公开 fixedUpdate 路径）
    (shell as unknown as { fuse: number }).fuse = 1;
    expect(() => shell.fixedUpdate(1 / 60, hooks)).not.toThrow();
    expect(shell.explodedAlpha).toBe(true);
    // 修复前：pool detach 裸调用第一发即抛 "reading 'vanillaDust'"
    expect(raw.dusts).toHaveLength(70);
    expect(raw.dusts.filter((d) => d.type === 31)).toHaveLength(30); // :79843-79848
    expect(raw.dusts.filter((d) => d.type === 6)).toHaveLength(40);  // 大烟+小烟各 20
  });
});
