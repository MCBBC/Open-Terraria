// MP 云弹 spawn-kind 序列化（kind 10，2026-09-03 债清偿）：
//   ①广播分类=施法移动云 237/243 → kind10（tag=`projId,anchorX,anchorY`/aux=击退×100）
//   ②本地衍生面（238/244/239/245）不过网——防双生成
//   ③工厂 case10 反序列化九元组 roundtrip 逐值断言
//   ④端到端：重建移动云（netPuppet=true）本地跑确定性 aiMove → 过锚亡 → 类内 Kill 钩
//     本地衍生 238（与拥有端同点位——确定性 AI 收敛，后续雨滴全本地）
// 桩口径：广播/工厂 = pvp-settle-broadcast.test.ts（Object.create(Game.prototype)）；
//         AI 面 = rain-cloud.test.ts（mkHooks 世界带）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { RainCloudProj } from '../src/entities/WeaponProj';
import { Game } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';
import type { ProjSnap } from '../src/net/ClientNet';

const protGame = (): Record<string, any> => Object.create(Game.prototype) as Record<string, any>;

/** 广播桩（pvp-settle-broadcast.test.ts broadcastShell 缩形）——预置差分基准远位=首次可见即入批 */
function broadcastShell(proj: RainCloudProj) {
  const g = protGame();
  g.tickCount = 100;
  g.netProjLast = new Map<number, { x: number; y: number; t: number }>();
  g.netProjCursor = 0;
  g.netProjForce = new Set<number>();
  proj.id = 7;
  g.netProjLast.set(proj.id, { x: proj.x - 600, y: proj.y, t: g.tickCount - 70 });
  g.player = new Player(proj.x - 300, proj.y, new Inventory());
  g.player.hostile = false;
  g.entities = { projectiles: [proj] };
  const batches: ProjSnap[][] = [];
  g.net = {
    active: true, mySlot: 0,
    policy: { pvpAllowed: false },
    sendProjectileBatch: (snaps: ProjSnap[]) => batches.push(snaps),
    sendProjDespawn: () => {},
    sendNpcSnapshot: () => {},
  };
  const broadcast = () => (g as unknown as { netProjBroadcast: () => void }).netProjBroadcast();
  return { g, batches, broadcast };
}

const mkProj = (s: Record<string, unknown>): RainCloudProj | null =>
  (protGame() as unknown as { netMakeProj: (s: Record<string, unknown>) => RainCloudProj | null })
    .netMakeProj(s);

/** AI 面世界带（rain-cloud.test.ts mkHooks 缩形：行 20-70 清空=云轨迹无阻挡） */
function mkHooks() {
  const w = new World(60, 200, 1, 'rcmp');
  for (let x = 0; x < 60; x++) {
    for (let y = 20; y <= 70; y++) w.store.setTileSilent(x, y, 0, 0, 0);
  }
  const added: unknown[] = [];
  const hooks = {
    world: w,
    player: new Player(30 * 16, 20 * 16, new Inventory()),
    enemies: () => [],
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
  };
  (hooks as unknown as { entities: { nextId: number; add: (e: unknown, b: string) => void; projectiles: unknown[] } })
    .entities = { nextId: 1, add: (e: unknown, b: string) => { if (b === 'projectiles') added.push(e); }, projectiles: added };
  return { hooks: hooks as unknown as GameHooks, added };
}

describe('MP kind10 雨云家族：广播分类', () => {
  it('①移动云 237 → kind10：tag=`projId,anchorX,anchorY`/aux=击退×100/dmg/x,y,vx,vy 直传', () => {
    const cloud = new RainCloudProj(480, 352, 4, 2, 30, 2.5, 237, 600.7, 480.2);
    const { batches, broadcast } = broadcastShell(cloud);
    broadcast();
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(1);
    const s = batches[0][0];
    expect(s.kind).toBe(10);                       // 不带 bit6/bit7（云本体无玩家结算面）
    expect(s.tag).toBe('237,601,480');             // 锚亚像素取整
    expect(s.aux).toBe(250);                       // 击退 2.5 ×100
    expect(s.dmg).toBe(30);
    expect(s.x).toBe(480); expect(s.y).toBe(352);
    expect(s.vx).toBe(4); expect(s.vy).toBe(2);
  });

  it('①b 猩红魔杖云 243 同支（同一 kind10）', () => {
    const cloud = new RainCloudProj(100, 100, -3, 0, 12, 0, 243, 40, 100);
    const { batches, broadcast } = broadcastShell(cloud);
    broadcast();
    expect(batches[0][0].kind).toBe(10);
    expect(batches[0][0].tag).toBe('243,40,100');
    expect(batches[0][0].aux).toBe(0);
  });

  it('②本地衍生面不过网：238 降雨云/239 雨滴 0 快照（防双生成）', () => {
    const rain = new RainCloudProj(30 * 16, 30 * 16, 0, 0, 30, 0, 238);
    const drop = new RainCloudProj(30 * 16 - 2, 30 * 16, 0, 5, 30, 0, 239);
    const shell = broadcastShell(rain);
    drop.id = 8;
    shell.g.entities.projectiles = [rain, drop];   // 两弹同桩，均预置远位差分基准
    shell.g.netProjLast.set(drop.id, { x: drop.x - 600, y: drop.y, t: shell.g.tickCount - 70 });
    shell.broadcast();
    expect(shell.batches[0].length).toBe(0);       // 非移动云 kind 保持 -1 → 整弹跳过
  });
});

describe('MP kind10 雨云家族：工厂反序列化 roundtrip', () => {
  it('③九元组逐值：x/y/vx/vy/damage/knockback/projId/anchorX/anchorY（盒 28×28）', () => {
    const cloud = new RainCloudProj(480, 352, 4, 2, 30, 2.5, 237, 600, 480);
    const s = {
      kind: 10, netId: 7, tag: cloud.netTag, aux: cloud.netAux, dmg: 30,
      x: cloud.x, y: cloud.y, vx: cloud.vx, vy: cloud.vy,
    };
    const built = mkProj(s);
    expect(built).toBeInstanceOf(RainCloudProj);
    expect(built!.x).toBe(480); expect(built!.y).toBe(352);
    expect(built!.vx).toBe(4); expect(built!.vy).toBe(2);
    expect(built!.damage).toBe(30);
    expect(built!.knockback).toBe(2.5);
    expect(built!.projId).toBe(237);
    expect((built as unknown as { anchorX: number }).anchorX).toBe(600);
    expect((built as unknown as { anchorY: number }).anchorY).toBe(480);
    expect(built!.w).toBe(28); expect(built!.h).toBe(28);
  });

  it('③b 打包量化边界：击退 0→aux 0；1.23→aux 123 还原 1.23；畸形 tag=锚 0（类内 !=0 门跳过）', () => {
    const b0 = mkProj({ kind: 10, tag: '237,600,480', aux: 0, dmg: 30, x: 1, y: 2, vx: 3, vy: 4 });
    expect(b0!.knockback).toBe(0);
    const bFrac = mkProj({ kind: 10, tag: '243,40,100', aux: 123, dmg: 12, x: 1, y: 2, vx: -3, vy: 0 });
    expect(bFrac!.knockback).toBe(1.23);
    expect(bFrac!.projId).toBe(243);
    const bBad = mkProj({ kind: 10, tag: 'garbage', aux: 0, dmg: 30, x: 1, y: 2, vx: 0, vy: 0 });
    expect(bBad).toBeInstanceOf(RainCloudProj);
    expect((bBad as unknown as { anchorX: number }).anchorX).toBe(0);
  });

  it('④端到端：重建移动云（netPuppet=true）本地跑确定性 aiMove → 过锚亡 → 本地衍生 238 与拥有端同点位', () => {
    // 拥有端：真云从出生点到锚飞完 → Kill 钩原位变 238
    const a = mkHooks();
    const owner = new RainCloudProj(480, 352, 4, 2, 30, 2.5, 237, 600, 480);
    for (let t = 0; t < 80 && !owner.dead; t++) owner.fixedUpdate(1 / 60, a.hooks);
    expect(owner.dead).toBe(true);
    // MP 面：出生态过广播（kind10 快照）→ 工厂重建 → netPuppet 照实置位（netApplyProjSnaps 同构）
    const { batches, broadcast } = broadcastShell(new RainCloudProj(480, 352, 4, 2, 30, 2.5, 237, 600, 480));
    broadcast();
    const s = batches[0][0];
    const built = mkProj({ kind: s.kind, netId: s.netId, tag: s.tag, aux: s.aux, dmg: s.dmg, x: s.x, y: s.y, vx: s.vx, vy: s.vy });
    expect(built).toBeInstanceOf(RainCloudProj);
    built!.netPuppet = true;
    const b = mkHooks();
    for (let t = 0; t < 80 && !built!.dead; t++) built!.fixedUpdate(1 / 60, b.hooks);
    expect(built!.dead).toBe(true);                // 傀儡未被 netPuppet 早退——同 kind5-8 先例
    const rainA = a.added.find((e) => (e as RainCloudProj).projId === 238) as RainCloudProj;
    const rainB = b.added.find((e) => (e as RainCloudProj).projId === 238) as RainCloudProj;
    expect(rainA).toBeDefined();
    expect(rainB).toBeDefined();
    expect(rainB.cx).toBeCloseTo(rainA.cx, 5);     // 确定性 AI 收敛=雨云落点同点位
    expect(rainB.cy).toBeCloseTo(rainA.cy, 5);
    expect(rainB.vy).toBe(0);                      // 驻留态（后续雨滴由该云本地 AI 衍生）
  });
});
