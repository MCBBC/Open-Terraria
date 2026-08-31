// 鞭修复批回归（2026-08-22，标杆 Terarria1456/Terraria/Projectile.cs）：
//  ① 半程鞭尖音（AI_165 :45051-45070）：ai[0] 到达 (int)(timeToFlyOut/2f) 在鞭尖
//    （FillWhipControlPoints 缺省视觉曲线 :45618，控制点末位 :45054）播音，分档
//    1029→NPCDeath1（音量 0.6 :45057）/ 1030→NPCHit9（:45061）/ 1033→Item193
//    （:45065）/ 其余全部→Item153（:45069）
//  ② 鞭伴生召唤出生点（:12943-12963）：917 雪花哨兵 / 1036 小蜘蛛出生在【被命中
//    敌怪 Center】、速度零矢量、击退 0（NewProjectile(..., targetNPC.Center,
//    Vector2.Zero, 917, 15, 0f, owner) :12948 / 1036, 2, 0f :12959）
import { describe, expect, it } from 'vitest';
import { WhipProj } from '../src/entities/WhipProj';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
  hits: number[];
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
}
interface SfxCall { files: string[]; vol: number | undefined; x: number | undefined; y: number | undefined }
function makeHooks(enemies: MockEnemy[] = []) {
  const store = makeStore();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const projectiles: unknown[] = [];
  const sfx: SfxCall[] = [];
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
    playSfxFiles: (files: string[], vol?: number, x?: number, y?: number) => { sfx.push({ files, vol, x, y }); },
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown, b?: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { added.push(e); projectiles.push(e); },
    projectiles,
  };
  return { hooks, store, player, added, projectiles, sfx };
}

// ============ ① 半程鞭尖音（:45051-45070） ============
describe('鞭半程鞭尖音分档（:45051-45070）', () => {
  // anim=30、MaxUpdates=2（DefaultToWhip extraUpdates=1 :10103）→ timeToFlyOut=60、
  // 半程 = (int)(60/2f) = 30（:45051）
  const CASES: Array<[projId: number, itemId: number, file: string, vol: number]> = [
    [1029, 4678, 'NPC_Killed_1', 0.6],  // :45055-45058 NPCDeath1 ×0.6
    [1030, 4679, 'NPC_Hit_9', 1],       // :45059-45062 NPCHit9
    [1033, 5478, 'Item_193', 1],        // :45063-45066 Item193
    [912, 4911, 'Item_153', 1],         // :45067-45070 其余全部 Item153
    [841, 4672, 'Item_153', 1],         // 缺省档再采样（鞭 841 无专档）
  ];

  for (const [projId, itemId, file, vol] of CASES) {
    it(`proj ${projId} → ${file}（vol ${vol}）于鞭尖、整挥仅一次`, () => {
      const { hooks, player, sfx } = makeHooks();
      const w = new WhipProj(player.cx, player.cy, 0, projId, itemId, 14, 1, 30, 4, () => player);
      const half = Math.floor(w.timeToFlyOut / 2);
      expect(w.timeToFlyOut).toBe(60);
      expect(half).toBe(30);
      // 播音点 = 半程鞭尖。★2026-08-31 台账批：锚点已由"玩家盒心近似"升级为
      // Player.GetArmPosition（Player.cs:51206 + Main.OffsetsPlayerOnhand）——臂位
      // 随持械帧行在挥动进程内移动，鞭形随行，故鞭尖坐标须以【过半沿当拍】同帧
      // 状态取参照（旧 ctor 期快照=挥动前帧行,与发拍帧行错一档 → 整链平移 14px）。
      let fired = false;
      let tipX = NaN; let tipY = NaN;
      for (let i = 0; i < 60 && w.dead === false; i++) {
        w.fixedUpdate(1, hooks);
        if (!fired && sfx.length > 0) {
          fired = true;
          const pts = (w as unknown as { pointsAt: (n: number) => Array<{ x: number; y: number }> })
            .pointsAt(w.timeToFlyOut / 2);
          const t = pts[pts.length - 1];
          tipX = t.x; tipY = t.y;
        }
      }
      expect(sfx.length).toBe(1);                       // 每挥一次（原版 ==half 精确一拍）
      expect(sfx[0]!.files).toEqual([file]);
      expect(sfx[0]!.vol).toBe(vol);                    // NPCDeath1 音量 ×0.6（:45057）
      expect(sfx[0]!.x).toBeCloseTo(tipX, 5);           // 播音点 = 发拍鞭尖（同一帧行臂位）
      expect(sfx[0]!.y).toBeCloseTo(tipY, 5);
      // 臂位锚面校验：播音点明显偏离玩家中心（曾为"恒中心"近似——平移债已清）
      expect(Math.hypot((sfx[0]!.x ?? 0) - player.cx, (sfx[0]!.y ?? 0) - player.cy))
        .toBeGreaterThan(10);
    });
  }

  it('半程前不播音（前 1/4 挥零音）', () => {
    const { hooks, player, sfx } = makeHooks();
    const w = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
    for (let i = 0; i < 7; i++) w.fixedUpdate(1, hooks); // ai0=14 < 30
    expect(sfx.length).toBe(0);
  });
});

// ============ ② 伴生召唤出生点（:12943-12963） ============
describe('鞭伴生召唤出生在敌怪 Center + kb 0（:12948/:12959）', () => {
  const CASES: Array<[itemId: number, whipProj: number, sidekickProj: number, dmg: number]> = [
    [4911, 912, 917, 15],   // 酷鞭 → 雪花哨兵（:12943-12953）
    [5473, 1028, 1036, 2],  // 麻线鞭 → 小蜘蛛（:12954-12964）
  ];

  for (const [itemId, whipProj, sidekickProj, dmg] of CASES) {
    it(`鞭 ${whipProj}（item ${itemId}）命中敌 → ${sidekickProj} 生于敌中心/零速/kb0`, () => {
      const { hooks, player, added } = makeHooks();
      // 敌放在半程碰撞曲线鞭尖（过半 tick 的逐 update 插值恰采样 ai0=30 控制点）
      const enemy = mkEnemy(1, 0, 0);
      (hooks as unknown as { enemies: () => MockEnemy[] }).enemies = () => [enemy];
      const w = new WhipProj(player.cx, player.cy, 0, whipProj, itemId, 14, 1, 30, 4, () => player);
      const half = Math.floor(w.timeToFlyOut / 2);
      const tip = w.pointsAt(half, true);
      const tp = tip[tip.length - 1];
      enemy.cx = tp.x; enemy.cy = tp.y; enemy.x = tp.x - enemy.w / 2; enemy.y = tp.y - enemy.h / 2;
      for (let i = 0; i < 40 && enemy.hits.length === 0; i++) w.fixedUpdate(1, hooks);
      expect(enemy.hits.length).toBeGreaterThan(0);     // 命中链先成立
      const m = added.find((e) => e instanceof MinionProj && (e as MinionProj).projId === sidekickProj) as MinionProj | undefined;
      expect(m).toBeDefined();
      // 出生点 = 被命中敌怪 Center（targetNPC.Center :12948/:12959），非玩家旁
      expect(m!.x).toBe(enemy.cx);
      expect(m!.y).toBe(enemy.cy);
      expect(m!.knockback).toBe(0);                     // kb 0f（:12948/:12959）
      expect(m!.vx).toBe(0); expect(m!.vy).toBe(0);     // Vector2.Zero
      expect(m!.damage).toBe(dmg);                      // 15 / 2
      expect(m!.noSlot).toBe(true);                     // 不占随从槽
      // 出生点确非玩家位置（防回归回玩家旁近似）
      expect(m!.x).not.toBe(player.cx);
    });
  }
});
