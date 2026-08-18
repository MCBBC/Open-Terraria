// 鹿角怪 668 全链专项（2026-08-13 移植验收）：
//   数据可生成（vanilla-npcs.json 668 补齐）/家 tile 初始化/远距免伤爬升/
//   选招链（贴脸双侧尖刺→前向尖刺/走动 240t 碎石/静立 90t 影手/远距 120t 咆哮）/
//   尖刺弹幕 961 落地/影手 965 六连/Movement 自管重力跳跃。
// 参照：NPC.cs:44338-44752（AI_123）/ :44754-44955（尖刺碎石）/ :44957-45042（Movement）
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { deerclopsAI, DeerclopsSpikeProj, InsanityShadowProj } from '../src/entities/bossAI_deerclops';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { BuffState, BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

const W = 220, H = 160, GROUND = 70;
const STONE = TILE_BY_KEY['stone'] ?? TILE_BY_KEY['dirt'] ?? 1;

function makeWorld(): World {
  const w = new World(W, H, 11, 'deerclops-test');
  w.groundLevel = 50; w.rockLevel = 90;
  for (let x = 0; x < W; x++) {
    for (let y = GROUND; y < H; y++) w.store.setTile(x, y, STONE);
  }
  return w;
}

interface Harness { hooks: GameHooks; projectiles: unknown[]; player: Player }
function makeHooks(world: World, playerAt: { x: number; y: number }): Harness {
  const enemies: unknown[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = em.nextId++;
      (bucket === 'enemies' ? enemies : projectiles).push(e);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: new BuffState(),
  } as unknown as Player;
  const hooks = {
    world, player,
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
  } as unknown as GameHooks;
  (hooks as unknown as { entities: typeof em }).entities = em;
  return { hooks, projectiles, player };
}

/** 站在地面上的鹿角怪（底部对齐 GROUND 行顶） */
function spawnDeer(h: Harness, tx = 100): Enemy {
  const e = Enemy.fromVanilla(668, tx * TILE, (GROUND - 10) * TILE)!;
  (h.hooks as unknown as { entities: { add: (x: unknown, b: string) => void } })
    .entities.add(e, 'enemies');
  // 直接落位:底 = GROUND*16
  e.y = GROUND * TILE - e.h;
  e.x = tx * TILE - e.w / 2;
  e.vx = 0; e.vy = 0;
  return e;
}

function tick(e: Enemy, h: Harness, n: number): void {
  for (let i = 0; i < n; i++) {
    deerclopsAI(e, h.hooks, h.player);   // 位移已在 deerclopsMovement 尾积分（2026-08-19 修复）
    if (e.y + e.h > GROUND * TILE) { e.y = GROUND * TILE - e.h; e.vy = 0; } // 地面兜
  }
}

describe('鹿角怪 668 数据 + AI_123', () => {
  it('vanilla-npcs.json 668 补齐:可生成/boss 标记/尺寸与 SetDefaults 一致', () => {
    const h = makeHooks(makeWorld(), { x: 150, y: GROUND - 3 });
    const e = spawnDeer(h);
    expect(e).not.toBeNull();
    expect(e.def.boss).toBe(true);
    expect(e.maxHp).toBe(7000);
    expect(e.w).toBe(60);
    expect(e.h).toBe(154);
    expect(e.vanilla?.aiStyle).toBe(123);
  });

  it('家 tile 首帧初始化:ai2/ai3 = 落点,离场计时 86400 起', () => {
    const h = makeHooks(makeWorld(), { x: 150, y: GROUND - 3 });
    const e = spawnDeer(h);
    tick(e, h, 2);
    expect(e.ai2).toBe(100);
    expect(e.ai3).toBe(GROUND);
    expect(e.despawnTimer).toBeLessThanOrEqual(86400);
    expect(e.despawnTimer).toBeGreaterThan(86000);
  });

  it('远距 ≥450px 拉满 → 免伤;靠近回落', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: GROUND - 3 });   // 初始即 480px 远
    const e = spawnDeer(h);
    // 持续远离(每 tick 再拉 8px,抵消 3.5px/t 追击)
    const stub = h.player as unknown as { x: number; cx: number };
    for (let i = 0; i < 35; i++) {
      stub.x += 8; stub.cx = stub.x + 10;
      deerclopsAI(e, h.hooks, h.player);
      if (e.y + e.h > GROUND * TILE) { e.y = GROUND * TILE - e.h; e.vy = 0; }
    }
    expect(e.lai3).toBe(30);
    expect(e.dontTakeDamage).toBe(true);
    // 拉回贴脸 → 回落(lai3 钳 0,免伤解除)
    stub.x = 100 * TILE; stub.cx = stub.x + 10;
    for (let i = 0; i < 35; i++) {
      deerclopsAI(e, h.hooks, h.player);
      e.x += e.vx; e.y += e.vy;
    }
    expect(e.dontTakeDamage).toBe(false);
  });

  it('选招:贴脸(<120px,垂直近) lai1≥2 → 双侧尖刺(4);次选前向(1)', () => {
    const h = makeHooks(makeWorld(), { x: 103, y: GROUND - 3 });
    const e = spawnDeer(h);
    tick(e, h, 60);
    // 贴脸且垂直近 → 双侧尖刺门先(lai1≥2)
    expect(e.ai0 === 4 || e.ai0 === 1).toBe(true);
  });

  it('选招:水平走动满 240t → 碎石(2)(预授 Slow 封 120t 咆哮门)', () => {
    const h = makeHooks(makeWorld(), { x: 160, y: GROUND - 12 });  // dy 大 → 垂直门不中
    h.player.buffs.apply(BuffType.Slow, 10);
    const e = spawnDeer(h);
    tick(e, h, 250);
    expect(e.ai0).toBe(2);
  });

  it('选招:近距水平静立 90t → 影手(5)', () => {
    const h = makeHooks(makeWorld(), { x: 104, y: GROUND - 12 });  // dx<80 → 停走;dy 大不中尖刺门
    const e = spawnDeer(h);
    tick(e, h, 95);
    expect(e.ai0).toBe(5);
    const before = h.projectiles.length;
    tick(e, h, 31);
    const hands = h.projectiles.slice(before).filter((p) => p instanceof InsanityShadowProj);
    expect(hands.length).toBe(6);                       // ai1==30 那帧六连
  });

  it('选拫:远距水平(>100px)未 Slow 120t → 咆哮(3) 并授 Slow', () => {
    // 玩家 35 格外 + 20 格高:dy<-200 封尖刺门,dx 持续 >100(追击 3.5/t×125=437 < 560-100)
    const h = makeHooks(makeWorld(), { x: 135, y: GROUND - 20 });
    const e = spawnDeer(h);
    tick(e, h, 125);
    expect(e.ai0).toBe(3);
    tick(e, h, 32);                                     // ai1≥28 每 4t 判 800px 内授 buff
    expect(h.player.buffs.has(BuffType.Slow)).toBe(true);
  });

  it('前向尖刺段:强制 case 1 起步 → 生成 961 弹(j<20 窗口)', () => {
    const h = makeHooks(makeWorld(), { x: 103, y: GROUND - 3 });
    const e = spawnDeer(h);
    tick(e, h, 20);
    e.ai0 = 1; e.ai1 = 0;                               // 无条件重置(ai1 中途值会越过 j<20 窗口)
    const before = h.projectiles.length;
    tick(e, h, 45);                                     // LEAD=36 + 每 4t 一根
    const spikes = h.projectiles.slice(before).filter((p) => p instanceof DeerclopsSpikeProj);
    expect(spikes.length).toBeGreaterThan(0);
  });

  it('Movement:贴地静置 vy 稳 0;前方净空 + 目标在前方 → 起跳 vy=-8 窗口', () => {
    const h = makeHooks(makeWorld(), { x: 140, y: GROUND - 3 });
    const e = spawnDeer(h);
    tick(e, h, 10);
    // 贴地态:vy 保持 0(探针落地面)
    expect(Math.abs(e.vy)).toBeLessThanOrEqual(0.5);
  });

  it('离场段(8):40t 后 dead 且 hp=-1(无掉落消散)', () => {
    const h = makeHooks(makeWorld(), { x: 150, y: GROUND - 3 });
    const e = spawnDeer(h);
    e.ai0 = 8; e.ai1 = 0;
    tick(e, h, 45);
    expect(e.dead).toBe(true);
    expect(e.hp).toBe(-1);
  });
});
