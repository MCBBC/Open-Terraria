import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy, CALMING_NO_AGGRO_TYPES } from '../src/entities/Enemy';
import { attemptToFindTeleportSpot } from '../src/entities/fighterFamilies';
import { BuffType } from '../src/stats/Buffs';

/**
 * M11 多人敌怪索敌（TargetClosest 全玩家槽，NPC.cs:78456-78472 + TryTrackingTarget
 * :78501-78536 选距段）。
 *
 * 原版语义核对（1456 反编译源，2026-08-20 复核）：
 * - TargetClosest(bool faceTarget = true)：扫 255 槽，门 = active && !dead && !ghost；
 * - 【无穿墙门】玩家选择段无 CanHit（仅 tankPet 支 :78525 有，本仓无 tankPet 实体）；
 * - 【无同队豁免】无 party/team 门——NPC.cs 全文无 SameParty/TargetClosestFlags
 *   （该变体在 1456 本体源码不存在，mod API 面的是 TargetClosestUpgraded :78355，
 *   本体零调用）；
 * - 选距 num（:78503-78505）= |p.x+p.w/2−npc.x+npc.w/2| + |p.y+p.h/2−npc.y+npc.h/2|
 *   （NPC 左上角基准 + 自宽半偏置），num -= aggro（:78507），
 *   镇静罚项 npcTypeNoAggro[type] && direction!=0 → +1000（:78508-78510）；
 *   :78511 `!t || num < distance` —— 平距取先扫描者（严格 <，槽序低者胜）；
 * - 无候选（全员 dead/ghost）时 target 不清零（粘性，尸体坐标照消费 :78527-78528）。
 */

type MockPlayer = {
  x: number; y: number; w: number; h: number; cx: number; cy: number;
  vx: number; vy: number; dead: boolean; aggro: number;
  team?: number; buffs?: { has(b: number): boolean };
};

function mkPlayer(px: number, py: number, opts: Partial<MockPlayer> = {}): MockPlayer {
  const w = 20, h = 42;
  return {
    x: px, y: py, w, h, cx: px + w / 2, cy: py + h / 2,
    vx: 0, vy: 0, dead: false, aggro: 0, ...opts,
  };
}

const TILE = 16;

function flatWorld(local: MockPlayer, remotes: MockPlayer[] = []) {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2); // 地板 y=60
  const hooks = {
    world: w,
    player: local,
    candidatePlayers: () => [local, ...remotes],
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDrop: () => null, damagePlayer: () => {},
  } as never;
  return { w, hooks };
}

describe('M11 TargetClosest 全玩家槽索敌', () => {
  it('距离选最近：访客代理比本地近 → 目标=访客', () => {
    const local = mkPlayer(44 * TILE, 58 * TILE);      // 距敌 64px
    const remote = mkPlayer(42 * TILE, 58 * TILE);     // 距敌 32px
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;   // 僵尸（aiStyle 3）
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(remote);
  });

  it('死亡跳过：更近者 dead → 选更远的活跃者（NPC.cs:78459 门）', () => {
    const local = mkPlayer(50 * TILE, 58 * TILE);        // 远
    const remote = mkPlayer(41 * TILE, 58 * TILE, { dead: true }); // 近但死
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(local);
  });

  it('本地死亡 + 访客活跃 → 目标=访客且追击访客（房主端敌怪打访客）', () => {
    const local = mkPlayer(41 * TILE, 58 * TILE, { dead: true });
    const remote = mkPlayer(46 * TILE, 58 * TILE);       // 访客在敌右侧
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;
    const x0 = e.x;
    for (let t = 0; t < 50; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(remote);
    expect(e.x).toBeGreaterThan(x0 + 4);                 // 向访客移动
  });

  it('无穿墙门（原版语义）：隔实心墙的更近玩家照选（玩家段无 CanHit）', () => {
    const local = mkPlayer(60 * TILE, 58 * TILE);
    const remote = mkPlayer(42 * TILE, 58 * TILE);
    const { w, hooks } = flatWorld(local, [remote]);
    // 敌与访客之间砌实心竖墙
    for (let y = 45; y <= 59; y++) w.store.setTileSilent(41, y, 2);
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(remote);   // :78459 门只有 active/dead/ghost
  });

  it('无同队豁免（原版语义）：同队访客照被索敌（无 party/team 门）', () => {
    const local = mkPlayer(44 * TILE, 58 * TILE, { team: 1 });
    const remote = mkPlayer(42 * TILE, 58 * TILE, { team: 1 });
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(remote);
  });

  it('aggro 减量（:78507）：近者潜行 aggro=-1200 → 有效距离反超 → 选远者', () => {
    const local = mkPlayer(44 * TILE, 58 * TILE);                        // metric≈800
    const remote = mkPlayer(41 * TILE, 58 * TILE, { aggro: -1200 });     // 800-(-1200)=2000
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(local);
  });

  it('镇静罚项（:78508-78510）：表内怪对 Calming 玩家 +1000 → 选无镇静者', () => {
    expect(CALMING_NO_AGGRO_TYPES.has(1)).toBe(true);    // 蓝史莱姆在表
    const calming = { has: (b: number) => b === BuffType.Calming };
    const local = mkPlayer(44 * TILE, 58 * TILE);                        // metric≈800
    const remote = mkPlayer(41 * TILE, 58 * TILE, { buffs: calming });   // 300+1000=1300
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(1, 40 * TILE, 59 * TILE)!;               // 史莱姆（aiStyle 1）
    e.fixedUpdate(1 / 60, hooks);                       // 首帧 facing 已 ±1（罚项门）
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(local);
  });

  it('平距取先扫描者（:78511 严格 <）：等距 → 候选序先者（本地=槽 0）胜', () => {
    const local = mkPlayer(44 * TILE, 58 * TILE);
    const remote = mkPlayer(44 * TILE, 58 * TILE);      // 等距（同尺寸盒）
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(local);
  });

  it('粘性（:78527-78528）：全员死亡 → 保留上一目标（尸体照指向）', () => {
    const local = mkPlayer(44 * TILE, 58 * TILE);
    const remote = mkPlayer(42 * TILE, 58 * TILE);
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(remote);
    remote.dead = true; local.dead = true;              // 全员死亡
    e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(remote);                // 不清零
  });

  it('单机零回归：无 candidatePlayers 钩 → targetPlayer=本地玩家，行为同旧（追本地）', () => {
    const w = new World(80, 80, 42, 'open');
    for (let x = 10; x <= 70; x++) w.store.setTileSilent(x, 60, 2);
    const local = mkPlayer(46 * TILE, 58 * TILE);       // 本地在敌右侧
    const hooks = {
      world: w,
      player: local,                                    // 无 candidatePlayers（旧式 mock）
      playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
      spawnDrop: () => null, damagePlayer: () => {},
    } as never;
    const e = Enemy.fromVanilla(3, 40 * TILE, 59 * TILE)!;
    const x0 = e.x;
    for (let t = 0; t < 50; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.targetPlayer).toBe(local);
    expect(e.x).toBeGreaterThan(x0 + 4);                // 追本地玩家（旧分发行为）
  });
});

describe('M11 CheckActive despawn 屏内门（NPC.cs:78703-78720 全玩家槽扫）', () => {
  it('敌离本地屏外、访客屏内 → 不消散（任一活跃玩家压制 despawn）', () => {
    const local = mkPlayer(78 * TILE, 58 * TILE);        // 离敌 66 格 > 62（屏外）
    const remote = mkPlayer(13 * TILE, 58 * TILE);       // 敌旁（屏内）
    const { hooks } = flatWorld(local, [remote]);
    const e = Enemy.fromVanilla(3, 12 * TILE, 59 * TILE)!;   // 站地板左端
    for (let t = 0; t < 900; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.dead) break;
    }
    expect(e.dead).toBe(false);                         // 访客屏内 → timeLeft 恒重置
  });

  it('对照组：无访客、离本地屏外 → 750t 消散（原有单机 despawn 不回归）', () => {
    // 本地悬在敌正上方 54 格（垂直屏外 >35 格）：僵尸水平追逐无法缩短垂直差，
    // 恒离屏 → 750t 倒数归零消散
    const local = mkPlayer(13 * TILE, 5 * TILE);
    const { hooks } = flatWorld(local);
    const e = Enemy.fromVanilla(3, 12 * TILE, 59 * TILE)!;
    let died = false;
    for (let t = 0; t < 900; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.dead) { died = true; break; }
    }
    expect(died).toBe(true);
  });
});

describe('M11 法师传送 telefrag 门（NPC.cs:18933-18940 全玩家槽扫）', () => {
  it('落点盒与访客 AABB 相交 → 弃点；访客死亡 → 放行', () => {
    const w = new World(80, 80, 42, 'open');
    const st = w.store;
    for (let x = 30; x <= 50; x++) st.setTileSilent(x, 60, 2);   // 地板 y=60（唯一可站行）
    const e = Enemy.fromVanilla(31, 40 * TILE, 59 * TILE)!;      // 恶魔眼系占位敌（仅需实体坐标）
    // 访客巨盒罩住全部候选落点（x∈[35,45]、y=60 行 ±1 格缓冲）
    const remote = mkPlayer(30 * TILE, 58 * TILE, { w: 20 * TILE, h: 4 * TILE });
    remote.cx = remote.x + remote.w / 2; remote.cy = remote.y + remote.h / 2;
    const local = mkPlayer(70 * TILE, 58 * TILE);
    const hooks = {
      world: w, player: local,
      candidatePlayers: () => [local, remote],
      playSfx: () => {}, spawnParticles: () => {},
    } as never;
    expect(attemptToFindTeleportSpot(e, hooks, 40, 56, 5, 1)).toBeNull();  // 全点 telefrag
    remote.dead = true;
    const spot = attemptToFindTeleportSpot(e, hooks, 40, 56, 5, 1);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBe(60);                                           // 站地板行
  });
});
