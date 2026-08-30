// 近战 PvP 挥击视线门回归（2026-08-30 补接）：原版 ItemCheck_MeleeHitPVP
// （1457 Player.cs:44420 / 1456 :43398）命中循环门禁串 :44429/:43407
// `!itemRectangle.Intersects(player.Hitbox) || !CanHit(player)` → continue——
// CanHit = Player.CanHit(Entity ent) 四射线链（1457 :42858-42865 / 1456 :41886）。
// 此前 updateSwingHits 的 PvP 桶只查 hitRect 相交就广播 msg44 意向（隔实心块也能
// 打到远端玩家），与 enemies 桶不同式 → 本测试钉住补接后的几何语义：
//  · 调用形 = playerCanHitEntity(world.store, 本地玩家, 远端代理) —— 远端代理
//    Player 与本地玩家同一 Entity 基类面（x/y/w/h/cx/cy/facing），盒构造同构；
//  · 玩家身材取原版 20×42（双方同款）。
// F1/F2 追加（同日）：同挥去重键 per-slot 命名空间 + 线载伤不含暴击翻倍。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { canHit, canHitLine, playerCanHitEntity } from '../src/physics/LineOfSight';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

afterEach(() => {
  vi.restoreAllMocks();
});

const STONE = TILE_BY_KEY['stone'];

/** 盒：px 坐标（16px 一格）；cx/cy/facing 走 LOSBox 可选面 */
function box(cxPx: number, cyPx: number, w: number, h: number) {
  return { x: cxPx - w / 2, y: cyPx - h / 2, w, h };
}

/** 场景骨架（玩家对玩家）：本地中心 (30.5 格)、远端中心 (32.5 格)，中间 x=31 列
 *  为被试障碍。双方均原版身材 20×42；facing=1（近战 PvP 只在挥击侧发起） */
function makeScene(fillWall: (st: TileStore) => void) {
  const world = new World(64, 64, 42, '测试');
  fillWall(world.store);
  const pcy = 16 * 16 + 8;
  const local = { ...box(30.5 * 16, pcy, 20, 42), cx: 30.5 * 16, cy: pcy, facing: 1 };
  const remote = box(32.5 * 16, pcy, 20, 42);
  return { store: world.store, local, remote };
}

describe('近战 PvP 视线门（ItemCheck_MeleeHitPVP 的 CanHit(player) 支）', () => {
  it('开阔地:门通过（hitRect 后可进 swingHitSet / 广播 msg44 意向）', () => {
    const { store, local, remote } = makeScene(() => {});
    expect(playerCanHitEntity(store, local, remote)).toBe(true);
  });

  it('隔一整列石壁:A 盒直判+三手位射线全被挡 → 门拒(continue,不发意向)', () => {
    const { store, local, remote } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) st.setTile(31, ty, STONE);
    });
    // 门禁链逐项复现：CanHit(整盒) false 且三手位射线全 false ⇒ CanHit(player)=false
    const hx = local.cx + (local.facing ?? 1) * (local.w / 2), hy = local.cy - local.h / 3;
    const ecx = remote.x + remote.w / 2, ecy = remote.y + remote.h / 2;
    expect(canHit(store, local.x, local.y, local.w, local.h,
      remote.x, remote.y, remote.w, remote.h)).toBe(false);
    expect(canHitLine(store, hx, hy, 0, 0, ecx, ecy - remote.h / 3, 0, 0)).toBe(false);
    expect(canHitLine(store, hx, hy, 0, 0, ecx, ecy, 0, 0)).toBe(false);
    expect(canHitLine(store, hx, local.cy, 0, 0, ecx, ecy + remote.h / 3, 0, 0)).toBe(false);
    expect(playerCanHitEntity(store, local, remote)).toBe(false);
  });

  it('致动石壁(inActive):豁免照常生效于 PvP 门 → 可命中', () => {
    const { store, local, remote } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) {
        st.setTile(31, ty, STONE);
        const i = st.idx(31, ty);
        st.wire[i] |= TileStore.WIRE_ACTUATED;
      }
    });
    expect(playerCanHitEntity(store, local, remote)).toBe(true);
  });
});

// ============ F1 同挥去重键 ============
/** 最小可驱动 updateSwingHits 的 Game 原型桩（同 weapon-melee-leftover 口径）：
 *  两远端代理（裸 new Player——与 simulateRemotePlayers 一致,id 恒 0）摆在
 *  本地玩家右侧判定盒（tier1/phase1 盒 x∈[cx-2,cx+14] y∈[y-6,y+10]）内。 */
function pvpShell() {
  const world = new World(160, 160, 42, 'pvp-dedup');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(800, 1440, new Inventory());
  player.inv.add(iid(3013), 1);              // 臭臭爪：melee 无 noMelee、无特判分支
  player.hostile = true;
  g.swing = { t: 15, dur: 30, dmg: 10, kb: 3, item: iid(3013), useStyle: 1 };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.entities = { critters: [], npcs: [], enemies: [] };
  g.world = world;
  g.player = player;
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.addDamageNumber = () => {};
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.bannerNpcActive = () => false;
  // 两代理共享基类默认 id=0——红队 F1 的病灶现场：旧实现以 rp.id 作去重键时
  // 首个命中后其余全被 has(0) 遮蔽
  const proxies = [1, 2].map((slot) => {
    const rp = new Player(player.cx + 6, player.y, new Inventory());
    (rp as unknown as { __netSlot?: number }).__netSlot = slot;
    rp.hostile = true;                        // 双方 hostile + team0 → InOpposingTeam 真
    return rp;
  });
  g.remotePlayerProxies = proxies;
  const sent: Array<[number, number, number, number, number, number]> = [];
  g.net = {
    active: true,
    policy: { pvpAllowed: true },
    sendStrikePlayer: (...args: [number, number, number, number, number, number]) => { sent.push(args); },
  };
  return { g, player, sent };
}

describe('F1 近战 PvP 同挥去重键（per-slot 命名空间，修复代理共享 id=0 遮蔽）', () => {
  it('两远端代理同室同挥：双双广播意向互不遮蔽；去重键绝不落 Entity.id=0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);   // crit 门 90≥10 → 非暴击；方差恒 ×1.12
    const { g, sent } = pvpShell();
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(sent.map((c) => c[0])).toEqual([1, 2]);   // 旧实现只发首个 = 多对 masking 病灶
    expect(sent[0][5] & 1).toBe(0);                  // bit0=crit 未置
    expect((g.swingHitSet as Set<number>).has(0)).toBe(false);
    expect([...(g.swingHitSet as Set<number>)]).toEqual([-2, -3]);   // -1-slot
  });

  it('F2 线载伤 = Main.DamageVar 口径（方差【不含】暴击翻倍，1457 :44438→Hurt :38532-35 实扣序）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const { g, sent, player } = pvpShell();
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    // rawDmg = round(swing.dmg × damageMult('melee') × 方差×1.12)；旧实现此处为 ×2.24（暴击）
    expect(sent[0][1]).toBe(Math.max(1, Math.round(10 * player.damageMult('melee') * 1.12)));
    expect(sent[0][1]).not.toBe(Math.max(1, Math.round(10 * player.damageMult('melee') * 2.24)));
  });
});
