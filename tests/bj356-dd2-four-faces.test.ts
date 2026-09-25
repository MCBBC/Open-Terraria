// BJ356 DD2 四面判别面测试（用户实报：撒旦军队怪穿模穿墙 + 事件期混刷普通怪 +
// 水晶被普通怪攻击 + 事件结束背包魔力残留）。
// 权威 Terarria1457：NPC.cs:63575-66112 AI_107_ImprovedWalkers（相位/卡位传送/
// 伺服）、NPC.cs:2803-2805 生成抑制门、NPC.cs:777-780 速率复位臂、NPC.cs:800
// spawnFriendly !ZoneOldOneArmy 臂、NPC.cs:93553-93696 GetHurtByOtherNPCs/
// BeHurtByOtherNPC（水晶 548 i-frame=20 特档）、Player.cs:31684-31765
// PurgeDD2EnergyCrystals、DD2Event.cs:628-638 WipeEntities。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { purgeEnergyCrystalSlots, summonCrystalDirect, newOldOnesArmyState } from '../src/world/OldOnesArmy';
import { eterniaStandSummonAnchor, eterniaStandBottomRow } from '../src/world/BossSummonStations';
import { checkArenaScore } from '../src/entities/bossAI_dd2';
import type { OldOnesArmyHost } from '../src/world/OldOnesArmy';

const W = 220, H = 90, FLOOR = 60;

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj356');
  const st = w.store;
  w.groundLevel = 24;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  w.clock.timeOfDay = 0.9;   // 夜
  return w;
}

type Proj = { x: number; y: number; vx: number; vy: number; damage: number; projId?: number; life?: number };

function makeHooks(w: World, playerAt: { x: number; y: number } | null) {
  const enemies: Enemy[] = [];
  const wst = w.store;
  const projectiles: Proj[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as Proj);
    },
  };
  const px = (playerAt?.x ?? 70) * TILE, py = (playerAt?.y ?? FLOOR - 3) * TILE;
  const player = new Player(px, py, new Inventory());
  const hooks = {
    world: w, player: playerAt ? player : null,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxWav: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    cutTile: () => {},
    breakTile: (bx: number, by: number) => wst.setTile(bx, by, 0),
    scene: { zoneGraveyard: false, zoneCorrupt: false, zoneCrimson: false, zoneSandstorm: false, zoneUndergroundDesert: false },
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, player, em };
}

function spawnAt(h: ReturnType<typeof makeHooks>, id: number, tx: number, feetOnFloor = true): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, 0)!;
  if (feetOnFloor) e.y = FLOOR * TILE - e.h;   // 贴地（feet = FLOOR 行顶）
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

const centerInSolid = (w: World, e: Enemy): boolean => {
  const st = w.store;
  return st.isSolid(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE));
};

// ================= Face 1：AI_107 相位穿墙（本相面）+ 退出语义 =================

describe('BJ356 Face1：AI_107 相位（怪型×地形判别面,NPC.cs:63690-63710/65053-65120）', () => {
  it('哥布林 552 相位穿墙后退出并落地（判别面主断言）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const crystal = spawnAt(h, 548, 30);
    crystal.y = FLOOR * TILE - crystal.h;
    const goblin = spawnAt(h, 552, 60);
    const st = w.store;
    // 20 高墙：伺服上升（vanilla 80×h 体盒探针）在 48px 穿行窗内清不掉 320px 高差
    //  → 中心必在墙格带内通过（3 宽墙会被体盒探针的升舵"翻越",嵌格帧变少）
    for (let wx = 44; wx <= 46; wx++) for (let wy = FLOOR - 20; wy <= FLOOR - 1; wy++) st.setTile(wx, wy, 1);
    let solidFrames = 0;
    let crossed = false;
    for (let i = 0; i < 900; i++) {
      if (!goblin.dead) goblin.fixedUpdate(1 / 60, h.hooks);
      if (centerInSolid(w, goblin)) solidFrames++;
      if (!crossed && goblin.cx < 44 * TILE) crossed = true;   // 已越过墙线
    }
    expect(solidFrames).toBeGreaterThan(10);                   // 相位穿墙发生（本相复现）
    expect(crossed).toBe(true);                                // 穿到了墙左侧
    // 退出相位：末段不嵌实心 + 落回地表（feet≈地面）+ 不再飞行
    let tailSolid = 0;
    for (let i = 0; i < 60; i++) {
      if (!goblin.dead) goblin.fixedUpdate(1 / 60, h.hooks);
      if (centerInSolid(w, goblin)) tailSolid++;
    }
    expect(tailSolid).toBe(0);
    expect(Math.abs(goblin.y + goblin.h - FLOOR * TILE)).toBeLessThanOrEqual(10);
  });

  it('对照：僵尸 3（fighter AI）同墙不穿（碰撞通道正常,零嵌格）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 20, y: FLOOR * TILE - 40 });   // 玩家在墙左
    const zombie = spawnAt(h, 3, 60);
    const st = w.store;
    for (let wx = 44; wx <= 46; wx++) for (let wy = FLOOR - 8; wy <= FLOOR - 1; wy++) st.setTile(wx, wy, 1);
    let solidFrames = 0;
    for (let i = 0; i < 600; i++) {
      if (!zombie.dead) zombie.fixedUpdate(1 / 60, h.hooks);
      if (centerInSolid(w, zombie)) solidFrames++;
    }
    expect(solidFrames).toBe(0);                               // 非 DD2 步行怪永不嵌实心
  });

  it('目标消失 → 相位立即退出（flag2 初值 false,cs:63490/63705;曾 WeakSet 粘滞=持续下坠）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const crystal = spawnAt(h, 548, 30);
    crystal.y = FLOOR * TILE - crystal.h;
    const goblin = spawnAt(h, 552, 60);
    const st = w.store;
    for (let wx = 44; wx <= 46; wx++) for (let wy = FLOOR - 20; wy <= FLOOR - 1; wy++) st.setTile(wx, wy, 1);
    // 相位建立（LOS 被墙挡）后、抵达墙前（60t ≈ 60px < 墙距 224px）撤水晶
    tick(h, 60, [goblin]);
    expect(goblin.cx > 46 * TILE).toBe(true);                  // 仍在开阔地
    crystal.dead = true;                                       // 目标消失
    const yAtKill = goblin.y;
    tick(h, 90, [goblin]);          // ≤ 撞墙跳窗（x≈810 > 墙面 763）——跳变不扰采样
    // 修复后：退出相位 → 常规重力贴地行走（y 不变、不嵌格）
    // 修复前：WeakSet 粘滞 → fly 伺服 vy 持续增长 → 从开阔地坠入地下深处
    expect(centerInSolid(w, goblin)).toBe(false);
    expect(Math.abs(goblin.y - yAtKill)).toBeLessThanOrEqual(8);
  });

  it('无水晶且玩家超 200px → 无目标（OnlyPlayersInCertainDistance :24-28;曾全图咬玩家）', () => {
    const w = makeWorld();
    // 玩家在哥布林【背后】300px（初始 facing=+1 背向）——修复后无目标不追,
    // 修复前 w107Target 无距离滤 → 跨图追杀（距离收缩）
    const h = makeHooks(w, { x: 30, y: FLOOR * TILE - 40 });
    const goblin = spawnAt(h, 552, 50);                        // 50-30=20 格=320px > 200
    const d0 = Math.abs(goblin.cx - h.player.cx);
    expect(d0).toBeGreaterThan(200);
    tick(h, 240, [goblin]);
    const d1 = Math.abs(goblin.cx - h.player.cx);
    expect(d1).toBeGreaterThan(d0);                            // 距离不收缩（未追杀）
  });
});

// ================= Face 2：事件期生成抑制（NPC.cs:777-780/800/2803-2805） =================

describe('BJ356 Face2：DD2 事件期自然生成抑制门', () => {
  it('spawnAnNPC 抑制门：dd2Ongoing && zoneDD2 → spawn() 恒 null（NPC.cs:2803-2805）', () => {
    const w = makeWorld();
    const sp = new VanillaSpawner(w);
    sp.dd2Ongoing = true;
    sp.zoneDD2 = true;
    const px = 100 * TILE, py = (FLOOR - 2) * TILE;
    for (let i = 0; i < 200; i++) {
      const e = sp.spawn(px, py, new RNG(i * 7919 + 13), 10, 6);
      expect(e).toBeNull();                                    // 事件期旧军 Zone 零自然生成
      if (e) e.dead = true;
    }
  });

  it('对照：无 DD2 旗同参可刷怪（门判别力）', () => {
    const w = makeWorld();
    const sp = new VanillaSpawner(w);
    const px = 100 * TILE, py = (FLOOR - 2) * TILE;
    let spawned = 0;
    for (let i = 0; i < 200; i++) {
      const e = sp.spawn(px, py, new RNG(i * 7919 + 13), 10, 6);
      if (e) { spawned++; e.dead = true; }
    }
    expect(spawned).toBeGreaterThan(0);
  });

  it('getSpawnRate 复位臂：血月夜 + 旧军 Zone → 缺省 600/5（NPC.cs:777-780）', () => {
    const w = makeWorld();
    const sp = new VanillaSpawner(w);
    w.clock.timeOfDay = 0.9;                 // 夜（isDay 派生只读）
    w.clock.bloodMoon = true;
    const px = 100 * TILE, py = 24 * TILE;   // 地表带（groundLevel=24）
    // 无 DD2 旗：血月夜修正生效（rate<600 且 max≠5）
    const base = sp.getSpawnRate(py, 0, false, 0, px, false, false, false, false, 0, false, false, true, false, false, false);
    expect(base.spawnRate).toBeLessThan(600);
    expect(base.maxSpawns).not.toBe(5);
    // 有 DD2 旗：复位缺省 600/5（覆盖血月修正）
    sp.dd2Ongoing = true;
    sp.zoneDD2 = true;
    const reset = sp.getSpawnRate(py, 0, false, 0, px, false, false, false, false, 0, false, false, true, false, false, false);
    expect(reset).toEqual({ spawnRate: 600, maxSpawns: 5 });
  });

  it('spawnFriendly 决策器 !ZoneOldOneArmy 臂（NPC.cs:800,字面无条件读旗）', () => {
    const w = makeWorld();
    const sp = new VanillaSpawner(w);
    const px = 100 * TILE, py = 24 * TILE;
    sp.zoneDD2 = true;                       // 无 Ongoing 条件（旗标语义含事件生命周期）
    const probe = sp as unknown as { spawnFriendlyCycle: boolean };
    for (let i = 0; i < 50; i++) {
      sp.getSpawnRate(py, 0, false, 0, px, false, false, false, false, 1, true, false, false, false, false, false);
      expect(probe.spawnFriendlyCycle).toBe(false);
    }
  });
});

// ================= Face 3：水晶受击面 i-frame 特档（NPC.cs:93653-93655） =================

describe('BJ356 Face3：NPC-vs-NPC 接触通道（水晶 548 可被敌怪接触伤=vanilla 本相）', () => {
  it('水晶 548 被普通怪接触受伤 + immune[255]=20 特档（曾漏特档恒 30）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const crystal = spawnAt(h, 548, 60);
    crystal.y = FLOOR * TILE - crystal.h;
    const zombie = spawnAt(h, 3, 61);
    zombie.x = crystal.x + 4;                  // 推入重叠
    zombie.y = crystal.y + 4;
    zombie.vx = 0; zombie.vy = 0;
    const hp0 = crystal.hp;
    tick(h, 1);                                // 单拍采样（immune 每拍递减,2117）
    expect(crystal.hp).toBeLessThan(hp0);      // 接触伤发生（vanilla GetHurtByOtherNPCs 通道）
    expect(crystal.npcImmune255).toBe(20);     // :93653-93655 type==548 → num=20
  });

  it('对照：非 548 受害者（蜂通道蜇僵尸）immune[255]=30 缺省', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const zombie = spawnAt(h, 3, 60);
    const bee = spawnAt(h, 210, 61);
    bee.x = zombie.x + 4;
    bee.y = zombie.y + 4;
    bee.vx = 0; bee.vy = 0;
    tick(h, 1);                                // 单拍采样
    expect(zombie.npcImmune255).toBe(30);      // 缺省 30（:93652 num=30）
  });
});

// ================= Face 4：事件结束魔力清除（Player.cs:31684-31765） =================

describe('BJ356 Face4：PurgeDD2EnergyCrystals 槽位核（purgeEnergyCrystalSlots）', () => {
  it('背包/垃圾/已开容器中的 3822 全清;光标镜像 stack=0;非魔力零改动', () => {
    const slots: Array<{ id: number; stack: number } | null> = [
      { id: 3822, stack: 5 }, { id: 75, stack: 1 }, null, { id: 3822, stack: 2 }, { id: 3828, stack: 1 },
    ];
    const trash = { id: 3822, stack: 9 };
    const mouse = { id: 75, stack: 1 };
    const container: Array<{ id: number; stack: number } | null> = [{ id: 3822, stack: 3 }, null];
    const r = purgeEnergyCrystalSlots(3822, slots, trash, mouse, [container]);
    expect(r).toEqual({ slots: 2, trash: true, mouse: false, containers: 1 });
    expect(slots[0]).toBeNull();
    expect(slots[3]).toBeNull();
    expect(slots[1]).toEqual({ id: 75, stack: 1 });            // 非魔力保留
    expect(slots[4]).toEqual({ id: 3828, stack: 1 });          // 水晶座物品 3828 非魔力保留
    expect(trash.stack).toBe(0);                               // 垃圾槽 stack=0（Game 侧置 null）
    expect(mouse.stack).toBe(1);                               // 光标非魔力不动
    expect(container[0]).toBeNull();
  });

  it('无魔力时零改动（!Ongoing 每帧跑的空转面）', () => {
    const slots: Array<{ id: number; stack: number } | null> = [{ id: 75, stack: 1 }, null];
    const r = purgeEnergyCrystalSlots(3822, slots, null, null, []);
    expect(r).toEqual({ slots: 0, trash: false, mouse: false, containers: 0 });
    expect(slots[0]).toEqual({ id: 75, stack: 1 });
  });
});

// ================= Face 5：传送门锚位（Player.cs:32689+DD2Event.cs:584-601） =================

const STAND_TOP = 30, GROUND = 40;

/** 铺 4 行水晶座 466（帧 0/18/36/54）+ 可选薄平台 */
function placeStand(w: World, tx: number, platformRows: number[] | null): void {
  const st = w.store;
  for (let k = 0; k < 4; k++) st.setTile(tx, STAND_TOP + k, 466);
  const i0 = st.idx(tx, STAND_TOP);
  st.flags[i0] = st.flags[i0] | 0;
  // 帧直写（setTile 不带帧 → 逐格覆写 frameX/frameY）
  for (let k = 0; k < 4; k++) {
    const i = st.idx(tx, STAND_TOP + k);
    st.frameX[i] = 0;
    st.frameY[i] = k * 18;
  }
  if (platformRows) {
    for (const row of platformRows) {
      for (let dx = -80; dx <= 80; dx++) st.setTile(tx + dx, row, 1);
    }
  }
}

describe('BJ356 Face5：传送门锚位链（水晶座帧锚+扫场崩塌机制）', () => {
  it('eterniaStandSummonAnchor：点任意行都归底行+底行格帧（frameY≡54）', () => {
    const w = makeWorld();
    placeStand(w, 20, [GROUND]);
    for (let k = 0; k < 4; k++) {
      const a = eterniaStandSummonAnchor(w.store, 20, STAND_TOP + k);
      expect(a.x).toBe(20);
      expect(a.y).toBe(STAND_TOP + 3);      // 底行
      expect(a.frameY).toBe(54);            // 底行格自身帧（非点击格帧）
    }
    expect(eterniaStandBottomRow(0)).toBe(3);
    expect(eterniaStandBottomRow(54)).toBe(0);
  });

  it('summonCrystalDirect：底行+底行帧 → 水晶 Bottom=座顶+64=地表（vanilla :589-597）', () => {
    const w = makeWorld();
    const st = newOldOnesArmyState();
    const dropped: Array<{ item: number; n: number }> = [];
    const spawned: Array<{ id: number; x: number; y: number }> = [];
    const host: OldOnesArmyHost = {
      broadcast: () => {},
      spawnNpc: (id, x, y) => spawned.push({ id, x, y }),
      countNpcs: () => 0,
      anyNpc: () => false,
      crystalPoints: () => [],
      dropAtCrystal: (item, n) => dropped.push({ item, n }),
      arenaEnds: () => ({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }),
      findGroundY: () => null,
      rand: () => 0,
      activePlayersCount: () => 1,
    };
    // 点座顶行（ty=30,frameY=0）→ 底行 33,底行帧 54 → 水晶 Bottom=(20*16+40, 30*16+64)
    const res = summonCrystalDirect(st, w, host, 20, 33, 0, 54);
    expect(res.ok).toBe(true);
    expect(res.x).toBe(20 * 16 + 40);
    expect(res.y).toBe(30 * 16 + 64);       // = 地表（座顶+4 行）
    expect(st.ongoing).toBe(true);
    expect(dropped.filter(d => d.item === 3822)).toHaveLength(5);
    expect(spawned[0].id).toBe(548);
  });

  it('机制钉：扫场锚悬空（薄平台下）→ 双端崩塌;锚在地表 → 全 span（判别面）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const st = w.store;
    // 薄平台 2 行（40-41），±80 格
    for (let dx = -80; dx <= 80; dx++) { st.setTile(110 + dx, 40, 1); st.setTile(110 + dx, 41, 1); }
    // 锚 A：平台地表行（正确锚=水晶 Bottom 贴 40 行顶）→ walker 走满 span
    const good = checkArenaScore(h.hooks, 110 * TILE + 8, 40 * TILE);
    expect(good.right.x - good.left.x).toBeGreaterThan(100);   // 双端展开
    // 锚 B：平台下悬空（旧混合锚=水晶 Bottom 埋 3 格落平台下方空气）→ 崩塌 ±1
    const bad = checkArenaScore(h.hooks, 110 * TILE + 8, 43 * TILE);
    expect(bad.right.x - bad.left.x).toBeLessThanOrEqual(4);   // 双门贴脸水晶的机制根
  });
});
