// 复审②清零批（2026-08-21）：bossAI_* 索敌残留代表性断言——M11 索敌链在弹体侧
// 的三个代表点回归锁（联机 Boss 无视访客修复）：
//   ① DukeSharknadoBolt 385 大弹追踪 = 出弹瞬冻结目标（原版 ai[1]=target+1，
//      Projectile.cs:28405-28447 / NPC.cs:49875 NewProjectile）——不再直读 game.player；
//   ② LightningOrb 465 每 30t 掷 466 = 逐候选玩家各一颗 ≤5（Projectile.cs
//      :30889-30917 全玩家槽扫描 → 本仓 candidatePlayers）；
//   ③ LunarOrb 539 冲刺目标 = Player.FindClosest 最近候选（:32191，flag47=true）
//      ——不再直读 game.player。
// 其余残留点分类见会话报告：victim-settles 接触/命中（dd2 4 处、龙卷接触、死光
// 命中、月噬爆盒）保持本地玩家；MoonLeechProj/MLDeathray LOS/MartianDeathray
// 束底/578 定向走同链（与 ①③ 同构，不重复立测）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { DukeSharknadoBolt } from '../src/entities/bossAI_duke_moonlord';
import { LightningOrb } from '../src/entities/bossAI_lategame';
import { LunarOrb } from '../src/entities/bossAI_lunar_misc';
import { LightningBoltProj } from '../src/entities/LightningBoltProj';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';
import type { Entity } from '../src/entities/Entity';

const W = 160, H = 120, FLOOR = 100;

function makeWorld(): World {
  const w = new World(W, H, 7, 'targeting-residual');
  const st = w.store;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

/** 候选玩家桩（M11 槽序 = [本地, ...代理]） */
function candPlayer(cx: number, cy: number, dead = false): Player {
  return { cx, cy, x: cx - 10, y: cy - 21, w: 20, h: 42, dead } as unknown as Player;
}

interface Harness {
  hooks: GameHooks; enemies: Enemy[]; projectiles: Entity[];
}

function makeHooks(world: World, player: Player, cands: Player[]): Harness {
  const enemies: Enemy[] = [];
  const projectiles: Entity[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: string) => {
      (e as { id?: number }).id = em.nextId++;
      (bucket === 'enemies' ? enemies : projectiles).push(e as never);
    },
  };
  const hooks = {
    world, player, enemies: () => enemies,
    candidatePlayers: () => cands,
    entities: em,
    critters: () => [], spawnDrop: () => null, damagePlayer: () => {},
    addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {},
    spawnEnemy: () => {}, spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles };
}

describe('① DukeSharknadoBolt 385 大弹：追踪出弹瞬冻结目标（NPC.cs:49875）', () => {
  it('冻结目标在右、本地玩家在左 → 朝冻结目标飞行（旧 game.player 读法恒追本地）', () => {
    const w = makeWorld();
    const local = candPlayer(300, 500);       // 本地玩家（左侧远处）——旧读法的追踪对象
    const target = candPlayer(3000, 500);     // 公爵出弹瞬的索敌目标（右侧）→ 冻结入 ai[1]
    const h = makeHooks(w, local, [local, target]);
    const duke = Enemy.fromVanilla(370, 1000, 500)!;
    const bolt = new DukeSharknadoBolt(1000, 500, 0, 0, true, false, duke, target);
    const x0 = bolt.x;
    bolt.fixedUpdate(1 / 60, h.hooks);
    expect(bolt.x).toBeGreaterThan(x0);       // 朝右（冻结目标侧）——旧实现朝左追本地
    expect(bolt.dead).toBe(false);
  });
});

describe('② LightningOrb 465：逐候选玩家掷 466（Projectile.cs:30889-30917）', () => {
  it('本地 + 代理双目标均在 2000px 内 → 第 30t 各掷一颗（旧读法恒 1 颗）', () => {
    const w = makeWorld();
    const local = candPlayer(640, 500);
    const proxy = candPlayer(900, 500);
    const h = makeHooks(w, local, [local, proxy]);
    const orb = new LightningOrb(700, 400, 45);
    for (let t = 0; t < 30; t++) orb.fixedUpdate(1 / 60, h.hooks);
    const bolts = h.projectiles.filter((p) => p instanceof LightningBoltProj);
    expect(bolts.length).toBe(2);             // 旧实现只掷向 game.player（1 颗）
    for (const b of bolts) expect(b.damage).toBe(45);
  });
});

describe('③ LunarOrb 539 冲刺：Player.FindClosest 最近候选（:32191 flag47=true）', () => {
  it('左远本地 + 右近代理 → 父亡即冲右侧代理（旧读法恒冲本地）', () => {
    const w = makeWorld();
    const local = candPlayer(300, 500);       // 本地（左，距 ~900）
    const proxy = candPlayer(1400, 500);      // 代理（右，距 ~200）→ FindClosest
    const h = makeHooks(w, local, [local, proxy]);
    const parent = Enemy.fromVanilla(407, 1200, 500)!;
    parent.prevX = parent.x; parent.prevY = parent.y;   // 未 tick 实体 prevX=0 → 防随父位移瞬移
    h.enemies.push(parent);
    const orb = new LunarOrb(parent, 539, 2, 0, 60);
    for (let t = 0; t < 10; t++) orb.fixedUpdate(1 / 60, h.hooks);
    parent.dead = true;                       // :32106-32110 父亡置满计时 → 同帧冲刺
    orb.fixedUpdate(1 / 60, h.hooks);
    expect(orb.vx).toBeGreaterThan(0);        // 冲向右侧代理——旧实现朝左冲本地
    expect(Math.hypot(orb.vx, orb.vy)).toBeCloseTo(16, 0);
  });
});
