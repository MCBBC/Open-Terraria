// BJ157⑧ 星尘守护者 MinionRestTarget 消费面（AI_120 状态 1/3 补接）判别力。
// 标杆 Terarria1457 Projectile.cs AI_120_StardustGuardian :45453-45785（1456/1458 同相）：
//   状态 1 rest 驻守 :45562-45651（无 rest 点回 0 :45564-45570 / 索敌锚玩家中心
//   :45786-45788 / 漂移 |Δx|>190·|Δy|>100 → 3 :45612-45640 / 坐姿帧 0..projFrames-4
//   :45642-45648）；状态 3 飞行 rest 点 :45707-45755（alpha=255 隐身 :45718 /
//   Lerp 0.2 :45748 / <10px → 1 :45749-45752）；top-of-AI 显隐门 :45481-45499。
// ★定谳：原版出生 ai[0]=0 且状态 0 无 else 支 → rest 环 {1,3} 单机休眠（写点入口仅
//   Forbidden 套 KeyDoubleTap :57449-57456）——1:1 照抄休眠支,测试经 ai[0] 直置驱动。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MinionProj } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
  hits: number[];
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 10000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = []) {
  const w = new World(200, 120, 42, 'bj157-guardian-rest');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const hooks = {
    world: w,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: [],
    add: () => {},
  };
  return { hooks, player };
}
const mkGuardian = (player: Player): MinionProj =>
  new MinionProj(player.x, player.y, 623, 30, 10, false, 0, false, () => player);
const setA0 = (g: MinionProj, v: number): void => { (g as unknown as { gA0: number }).gA0 = v; };
const a1Of = (g: MinionProj): number => (g as unknown as { gA1: number }).gA1;

describe('BJ157⑧ AI_120 状态 1/3（MinionRestTarget 消费面）', () => {
  it('状态 3：隐身窗（alpha=255）+ Lerp 0.2 收敛 rest 点，<10px 转 1；离场拍 top-of-AI 显形（:45718/:45749/:45481）', () => {
    const { hooks, player } = makeHooks([]);
    const g = mkGuardian(player);
    setA0(g, 3);
    player.minionRestTargetX = player.cx + 100;
    player.minionRestTargetY = player.cy;
    g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(3);
    expect(g.ai120Alpha).toBe(255);            // 入场尘爆+隐身（:45717-45734）
    const d0 = Math.hypot(player.cx + 100 - g.cx, player.cy - g.cy);
    expect(d0).toBeLessThan(100);              // Lerp 0.2 首拍已收敛
    for (let t = 0; t < 30 && g.ai120State === 3; t++) g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(1);              // <10px 抵达转驻守（:45749-45752）
    g.fixedUpdate(1, hooks);
    expect(g.ai120Alpha).toBe(0);              // 离场拍显形+尘爆（top-of-AI :45481-45499）
  });

  it('状态 1 驻守：rest 点在旁不迁移（|Δx|≤20/|Δy|≤10 阻尼支）；漂移 |Δx|>190 → 状态 3（:45612-45640）', () => {
    const { hooks, player } = makeHooks([]);
    const g = mkGuardian(player);
    setA0(g, 1);
    player.minionRestTargetX = player.cx;
    player.minionRestTargetY = player.cy;
    g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(1);              // 驻守不漂移
    // 漂移回收：rest 点横移 300px（>190）
    player.minionRestTargetX = player.cx + 300;
    g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(3);
  });

  it('状态 1 无 rest 点（HasMinionRestTarget=false）→ 回 0 跟随（:45567-45570）', () => {
    const { hooks, player } = makeHooks([]);
    const g = mkGuardian(player);
    setA0(g, 1);
    player.minionRestTargetX = 0;
    player.minionRestTargetY = 0;
    g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(0);
  });

  it('状态 3 无 rest 点 → 回 0（:45712-45715）；下一拍 top-of-AI 显形（:45481-45499）', () => {
    const { hooks, player } = makeHooks([]);
    const g = mkGuardian(player);
    setA0(g, 3);
    (g as unknown as { gAlpha: number }).gAlpha = 255;   // 飞行中隐身
    player.minionRestTargetX = 0;
    player.minionRestTargetY = 0;
    g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(0);
    expect(g.ai120Alpha).toBe(255);            // 回退拍不复位（显形门在下一拍 top-of-AI）
    g.fixedUpdate(1, hooks);
    expect(g.ai120Alpha).toBe(0);              // 显形+尘爆
  });

  it('rest 态索敌（锚=玩家中心 :45786-45788）→ 500 内敌转状态 2 冲刺、gA1 锁敌（:45606-45610）', () => {
    const e = mkEnemy(90, 60 * 16 + 100, 90 * 16);
    const { hooks, player } = makeHooks([e]);
    const g = mkGuardian(player);
    setA0(g, 1);
    player.minionRestTargetX = player.cx;      // rest 点=玩家位（|Δx|≤170 索敌门内）
    player.minionRestTargetY = player.cy;
    g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(2);
    expect(a1Of(g)).toBe(90);
  });

  it('漂移落穿语义：状态 1 转 3 同拍续跑飞行段（alpha 即刻 255,原版 :45707 门在链后）', () => {
    const { hooks, player } = makeHooks([]);
    const g = mkGuardian(player);
    setA0(g, 1);
    player.minionRestTargetX = player.cx + 300;
    player.minionRestTargetY = player.cy;
    g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(3);
    expect(g.ai120Alpha).toBe(255);            // 同拍入场尘爆（非下一拍）
  });

  it('状态 0 出生照旧贴身跟随（回归：rest 补接不侵蚀既有跟随/索敌主链）', () => {
    const e = mkEnemy(91, 60 * 16 + 250, 90 * 16);
    const { hooks, player } = makeHooks([e]);
    const g = mkGuardian(player);
    for (let t = 0; t < 90 && g.ai120State !== 2; t++) g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(2);              // 500 内敌 → 冲刺（a-batch2 同款主链）
  });
});
