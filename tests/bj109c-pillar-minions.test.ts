// BJ109-C 四柱小怪族普查探针（行为测+判别力）：
//   415 火蜥蜴喷火（生 516×3 + 场上 >6 封口门）——NPC.cs:57362-57430
//   516 太阳耀斑（alpha 渐隐 0→220 / 追踪 / 近身 20px 自爆）——:21463-21481/:21582-21600
//   428→427 / 427→426 羽化变身（龄 + 净空盒）——:57431-57468
//   405 死 → ≤4×406 / 426 死 → 3×428 死亡分裂链——:84381-84405 / :83981-83996
//   412 爬尾虫空泳双态（玩家着地=地面上方 800px 悬停环 / 悬空=直追提速 14）——:52176-52230
//   420 星云悬浮脑 480t 瞬移窗（20×12 tile 采样）——:41646-41693
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 140, FLOOR = 120;

function makeWorld(): World {
  const w = new World(W, H, 7, 'bj109c-test');
  const st = w.store;
  w.groundLevel = 60;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    aabbOverlaps: () => false,
  };
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: () => null,
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, em, player };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

const aliveOf = (h: ReturnType<typeof makeHooks>, id: number): Enemy[] =>
  h.enemies.filter((e) => !e.dead && e.vanillaId === id);

describe('BJ109-C 415 火蜥蜴喷火（NPC.cs:57362-57430）', () => {
  it('触发后三拍 -18/-26/-34 各生一只 516（共 3），风停段后进冷却 ai2>0', () => {
    const h = makeHooks(makeWorld(), { x: 90, y: FLOOR - 3 });
    const drako = spawn(h, 415, 80, FLOOR - 3);
    tick(h, 80);                                            // 待机段照走行走链 → 触发 ai2=-1 → 三拍
    const flares = aliveOf(h, 516);
    expect(flares.length).toBe(3);                          // ★判别：无喷火段 = 0
    expect(drako.ai2).toBeGreaterThan(0);                   // -42 拍覆写为 180+30*rand(10) 后逐拍衰减
  });

  it('封口门：场上 516 >6 只 → 不再喷（ai2=90 冷却，:57378-57382）', () => {
    const h = makeHooks(makeWorld(), { x: 90, y: FLOOR - 3 });
    const drako = spawn(h, 415, 80, FLOOR - 3);
    for (let k = 0; k < 7; k++) spawn(h, 516, 85 + (k % 3), FLOOR - 5 - k);
    tick(h, 80, [drako]);                                    // 只驱动火蜥蜴（516 不动不算追踪）
    expect(aliveOf(h, 516).length).toBe(7);                  // ★判别：无封口门 = 会喷出 3 只
    expect(drako.ai2).toBeGreaterThan(0);                    // 冷却已置 90、随拍衰减中
  });
});

describe('BJ109-C 516 太阳耀斑（aiStyle 9 type==516 专属支）', () => {
  it('出膛渐隐 alpha +40/t（≤220）+ 15 步进追踪朝玩家（速度≥初速）', () => {
    const h = makeHooks(makeWorld(), { x: 90, y: FLOOR - 3 });
    const f = spawn(h, 516, 80, FLOOR - 5);
    f.ai0 = 1;                                               // 跳过首拍出膛（单测定向追踪段）
    f.vx = 0; f.vy = 0;
    const alphas: number[] = [];
    let toward = 0;
    for (let i = 0; i < 30; i++) {
      const px = h.player.cx, py = h.player.cy;
      const before = Math.hypot(px - f.cx, py - f.cy);
      tick(h, 1, [f]);
      alphas.push(f.spawnAlpha);
      const after = Math.hypot(px - f.cx, py - f.cy);
      if (after < before) toward += 1;
    }
    expect(alphas[0]).toBe(40);                              // ★判别：无渐隐 = 恒 0
    expect(f.spawnAlpha).toBe(220);                          // 钳顶
    expect(toward).toBeGreaterThanOrEqual(28);               // ★判别：无追踪 = 单调趋近不成立
  });

  it('近身 20px 自爆（StrikeNPCNoInteraction(9999) → 标准死亡管线）', () => {
    const h = makeHooks(makeWorld(), { x: 90, y: FLOOR - 3 });
    const f = spawn(h, 516, 90, FLOOR - 3);
    f.ai0 = 1;
    f.x = h.player.cx - 5; f.y = h.player.cy - 5;
    tick(h, 3, [f]);
    expect(f.dead).toBe(true);                               // ★判别：无自爆 = 活着贴脸
  });
});

describe('BJ109-C 428/427 羽化变身链（NPC.cs:57431-57468）', () => {
  it('428 龄满 300t + 3×2 净空 → Transform(427) 满血、lai0 归零', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    const larva = spawn(h, 428, 20, FLOOR - 4);
    larva.lai0 = 299;
    larva.hp = 1;                                            // 原版 life=lifeMax 先置 → 变身后满血
    tick(h, 1, [larva]);
    expect(larva.vanillaId).toBe(427);                       // ★判别：无变身段 = 恒 428
    expect(larva.lai0).toBe(0);
    expect(larva.hp).toBe(larva.maxHp);
  });

  it('头顶实心（3×2 盒不净空）→ 不变身、龄照计下 tick 重试', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    const st = h.hooks.world.store;
    const larva = spawn(h, 428, 30, FLOOR - 4);
    larva.lai0 = 299;
    // 封死 (cx/16-1..+1, cy/16-1..cy) 竖直上半盒
    const cxT = Math.floor(larva.cx / TILE), cyT = Math.floor(larva.cy / TILE);
    for (let x = cxT - 1; x <= cxT + 1; x++) st.setTile(x, cyT - 1, 1);
    tick(h, 2, [larva]);
    expect(larva.vanillaId).toBe(428);                       // ★判别：无净空门 = 照样变身
    expect(larva.lai0).toBeGreaterThanOrEqual(300);
  });

  it('427 龄满 1200t（1+|vx|/2 累计）→ Transform(426)（蜂→后）', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    const hornet = spawn(h, 427, 50, FLOOR - 4);
    hornet.lai0 = 1199;
    tick(h, 1, [hornet]);
    // 原版 localAI[0] 累计先行、>=1200 判定在后 → 本拍即变身
    expect(hornet.vanillaId).toBe(426);                      // ★判别：无变身段 = 恒 427
    expect(hornet.hp).toBe(hornet.maxHp);
  });
});

describe('BJ109-C 死亡分裂链（HitEffect life≤0 段）', () => {
  it('426 死 → 3×428 幼虫上抛（场上 <20 门,:83981-83996）', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    const queen = spawn(h, 426, 70, FLOOR - 6);
    queen.hurt(9999, 0, 0, h.hooks);
    const larvae = aliveOf(h, 428);
    expect(larvae.length).toBe(3);                           // ★判别：无死亡链 = 0
    // 初速 = -UnitY.RotatedByRandom(2π)×rand(3,6) − UnitY×2 → 模长带 [1, 8]
    expect(larvae.every((l) => {
      const s = Math.hypot(l.vx, l.vy);
      return s >= 1 && s <= 8;
    })).toBe(true);
  });

  it('分裂上限：428+427+426×3 ≥20 → 零分裂', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    for (let k = 0; k < 5; k++) spawn(h, 428, 40 + k, FLOOR - 4);
    for (let k = 0; k < 5; k++) spawn(h, 427, 50 + k, FLOOR - 4);
    const queen = spawn(h, 426, 70, FLOOR - 6);
    queen.hurt(9999, 0, 0, h.hooks);                         // 场上 5+5+1×3=13 <20 → 会分裂
    const first = aliveOf(h, 428).length;
    expect(first).toBe(8);                                   // 5+3
    // 补到 ≥20：8 幼虫 + 5 蜂 + 后死再死一次的后×3 = 16+…——直接再放 5 蜂
    for (let k = 0; k < 4; k++) spawn(h, 427, 100 + k, FLOOR - 4);
    const q2 = spawn(h, 426, 70, FLOOR - 6);
    q2.hurt(9999, 0, 0, h.hooks);                            // 8+9+0×3=17 <20 → +3 = 20…临界
    // 精确临界：再杀一只蜂后,场上 11 幼虫 + 9 蜂 → 11+27 ≥ 20 → 零分裂
    const q3 = spawn(h, 426, 70, FLOOR - 6);
    q3.hurt(9999, 0, 0, h.hooks);
    const after = aliveOf(h, 428).length;
    expect(after).toBeLessThan(11 + 3);                      // ★判别：无上限 = 恒 +3
  });

  it('405 死 → 小星细胞 406（4/3/2/1 按场上 406+405 数,含垂死本体,:84381-84405）', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    const cell = spawn(h, 405, 20, FLOOR - 6);
    cell.hurt(9999, 0, 0, h.hooks);
    expect(aliveOf(h, 406).length).toBe(4);                  // 空场计数 1 → 4 只
    // 再死一只：场上 4×406 + 本体(405 计 1) = 5 → ≥4 → 3 只
    const cell2 = spawn(h, 405, 30, FLOOR - 6);
    cell2.hurt(9999, 0, 0, h.hooks);
    expect(aliveOf(h, 406).length).toBe(7);                  // ★判别：无计数档 = 恒 4
  });
});

describe('BJ109-C 412 爬尾虫空泳双态（NPC.cs:52176-52230）', () => {
  it('玩家着地 → 头悬停地面上方 800px（不俯冲）；玩家悬空 → 直追提速 14', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: FLOOR - 3 });
    const head = spawn(h, 412, 60, FLOOR - 10);
    tick(h, 90, [head]);                                     // 首拍建 30 段链 + 悬停带上撤
    // 悬停线 = FLOOR*16 − 800 = 1120；着地态头应到悬停带（显著高于玩家）
    expect(head.cy).toBeLessThan(h.player.cy - 400);         // ★判别：无视地悬停 = 贴脸
    expect(head.cy).toBeGreaterThan(FLOOR * TILE - 800 - 400);
    // 悬空态：把玩家挪进 5 宽深井（±2 列 × 下方 15 格全空 → num51=0 → 直追 14/0.5）
    const st = h.hooks.world.store;
    const ptx = Math.floor(h.player.cx / TILE);
    for (let x = ptx - 2; x <= ptx + 2; x++) {
      for (let y = FLOOR - 22; y <= FLOOR + 1; y++) st.setTile(x, y, 0);
    }
    h.player.y = (FLOOR - 20) * TILE; h.player.cy = h.player.y + 21;
    const d0 = Math.hypot(head.cx - h.player.cx, head.cy - h.player.cy);
    let dMin = d0;
    for (let i = 0; i < 90; i++) {
      tick(h, 1, [head]);
      dMin = Math.min(dMin, Math.hypot(head.cx - h.player.cx, head.cy - h.player.cy));
    }
    expect(dMin).toBeLessThan(d0 - 300);                     // ★判别：无俯冲切换 = 继续悬停不逼近
  });
});

describe('BJ109-C 420 星云悬浮脑瞬移窗（NPC.cs:41646-41693）', () => {
  it('ai0 到 480 → 瞬移到玩家 41×41 tile 采样窗内（≥3 格外）+ 位置变化', () => {
    const h = makeHooks(makeWorld(), { x: 120, y: FLOOR - 3 });
    const floater = spawn(h, 420, 40, FLOOR - 30);           // 出生 ≤2000px 曼哈顿（findTeleportSpot 门）
    floater.ai0 = 480;
    const x0 = floater.x, y0 = floater.y;
    tick(h, 2, [floater]);
    expect(floater.x !== x0 || floater.y !== y0).toBe(true); // ★判别：无传送 = 原地
    const dTiles = Math.hypot(floater.cx - h.player.cx, floater.cy - h.player.cy) / TILE;
    expect(dTiles).toBeLessThan(29);                         // 41×41 采样窗角距 ≤√(20²+20²)=28.3（初始 84.5 格）
  });
});
