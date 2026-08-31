// AI_130/AI_134 FindTarget 三门族回归（2026-08-31 对齐批①②；标杆
// Terarria1457/Terraria/Projectile.cs:69418-69507 + 调用点 :69375/:69391/:69647/:69685）：
//  ① angleRatioMax 锥形门（AI_130 :69434/:69456,默认 1/学徒 T2 套装 0.1 :69332）
//     + canChangeDirection=false 的 directionLock 门（开火帧重索敌 :69391→后方候选拒）
//  ② deadBottomAngle 死锥门（AI_134 :69481/:69503=0.75）+ 集火路同吃门
//  「未接」账（angleRatioMax/deadBottomAngle/套装 shot_range/AI_134 center Y−4）本批清偿。
// ★F4 终端形状定案（2026-08-31 二轮蓝队）：锚定模式视线 = CanHitLine(shootingSpot,0,0
//   → nPC.Center,0,0) 点对端（:69434/:69456/:69481/:69503 字面）；非锚定 AI_062 族仍走
//   盒线（:66392）。奇宽盒 + 半格边界可观测终端格差一 —— 分叉场景钉案见专属用例。
import { describe, it, expect } from 'vitest';
import { MinionProj, towerAimGate } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { canHitLine } from '../src/physics/LineOfSight';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 140;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 110; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number;
}
function mkEnemy(id: number, cx: number, cy: number, w = 18, h = 40): MockEnemy {
  return { id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy };
}
type PrivFn = (
  g: unknown, maxRange: number, sight?: string, from?: 'self' | 'player',
  focusRange?: number, anchor?: { x: number; y: number },
  gate?: Parameters<typeof towerAimGate>[2],
) => unknown;

describe('towerAimGate 纯函数矩阵（SafeNormalize 兜底 UnitY + FindTarget 内联式）', () => {
  it('angleRatioMax=1：45° 恰好等值不拒(严格 <)，更陡即拒', () => {
    expect(towerAimGate(Math.SQRT1_2, Math.SQRT1_2, { angleRatioMax: 1 })).toBe(true);
    expect(towerAimGate(0.337, 0.944, { angleRatioMax: 1 })).toBe(false);   // 徒手下斜 ~70°
    expect(towerAimGate(0.882, 0.471, { angleRatioMax: 1 })).toBe(true);
  });
  it('学徒 T2 ratio=0.1 只拒近垂直带(:69332 效果)', () => {
    expect(towerAimGate(0.337, 0.944, { angleRatioMax: 0.1 })).toBe(true);
    expect(towerAimGate(0.02, 0.999, { angleRatioMax: 0.1 })).toBe(false);
  });
  it('零向量走 SafeNormalize 兜底 (0,1) ⇒ angleRatioMax 全档皆拒', () => {
    expect(towerAimGate(0, 1, { angleRatioMax: 1 })).toBe(false);
    expect(towerAimGate(0, 1, { angleRatioMax: 0.1 })).toBe(false);
  });
  it('deadBottomAngle=0.75：只拒「陡峭且在下」锥(:69481)；上方恒通过', () => {
    expect(towerAimGate(0.447, 0.894, { deadBottomAngle: 0.75 })).toBe(false); // 陡下
    expect(towerAimGate(0.882, 0.471, { deadBottomAngle: 0.75 })).toBe(true);  // 浅下
    expect(towerAimGate(0.447, -0.894, { deadBottomAngle: 0.75 })).toBe(true); // 陡上放行
  });
  it('directionLock=-1：正右方(vX>0) 后方候选拒 / 正左过 / vX=0 拒式不触发(<0 为假)', () => {
    expect(towerAimGate(0.707, 0, { directionLock: -1 })).toBe(false);
    expect(towerAimGate(-0.707, 0, { directionLock: -1 })).toBe(true);
    expect(towerAimGate(0, 1, { directionLock: -1 })).toBe(true);   // (direction*vX)<0 与 0 比较
  });
});

describe('nearestEnemy(gate) 集成（炮塔 shootingSpot 口径,F4 终端=Center 点对端）', () => {
  function setup(enemies: MockEnemy[]) {
    const store = makeStore();
    const player = new Player(90 * 16, 100 * 16, new Inventory());
    const hooks: GameHooks = {
      world: { store, flags: { hardMode: false } } as never,
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
      playSfxFiles: () => {},
      showPickupLabel: () => {},
    };
    // 弩车位：盒中心放塔身（x 左上=mx−8 使 cx=mx）
    const mx = 50 * 16, my = 108 * 16;
    const minion = new MinionProj(mx - 8, my - 8, 678, 10, 2, true, 0, true,
      () => player);
    const call = (maxRange: number, anchor: { x: number; y: number },
      gate?: Parameters<typeof towerAimGate>[2], sight = 'line') =>
      ((MinionProj.prototype as unknown as Record<string, PrivFn>).nearestEnemy as PrivFn)
        .call(minion, hooks, maxRange, sight, 'self', 900, anchor, gate);
    return { hooks, player, call, enemies };
  }

  it('角度锥内目标在无门时入选；带 angleRatioMax=1 被拒(AI_130 默认锥,:69434)', () => {
    // 塔 spot=(800,1104)。敌 A 在近垂直正上 v=(0,-1)
    const above = mkEnemy(1, 800, 950);
    const { call } = setup([above]);
    const spot = { x: 800, y: 1104 };
    expect(call(900, spot)).not.toBeNull();
    expect(call(900, spot, { angleRatioMax: 1 })).toBeNull();
    // 直上死角在学徒 T2 放宽档同样恒拒（SafeNormalize 单位向量的极限案例）
    expect(call(900, spot, { angleRatioMax: 0.1 })).toBeNull();
  });

  it('directionLock 承载 canChangeDirection=false(:69391)：后方近敌跳过,前方远敌获选', () => {
    const rearNear = mkEnemy(1, 900, 1098);   // spot 右侧 100px,vX>0
    const frontFar = mkEnemy(2, 650, 1098);   // spot 左侧 150px,vX<0
    const { call } = setup([rearNear, frontFar]);
    const spot = { x: 800, y: 1104 };
    // 可换向（待机调用点 :69376）→ 取更近的右侧
    const unlocked = call(900, spot) as MockEnemy;
    expect(unlocked?.id).toBe(1);
    // 开火帧重索敌(:69391) facing=-1 → 正后方(右)候选被 :69456 拒 → 回落左侧
    const locked = call(900, spot, { angleRatioMax: 1, directionLock: -1 }) as MockEnemy;
    expect(locked?.id).toBe(2);
  });

  it('deadBottomAngle 死锥(:69481)：陡下方候选被拒、浅下放行(AI_134 调用点 :69647)', () => {
    const steepBelow = mkEnemy(1, 860, 1250);   // Δ(60,146) 归一 |vX|<|vY|·0.75 成立
    const shallowBelow = mkEnemy(2, 1010, 1160);// Δ(210,56) 浅下放行
    const { call } = setup([steepBelow, shallowBelow]);
    const spot = { x: 800, y: 1104 };           // 空中锚点（携带态等价）
    expect((call(900, spot) as MockEnemy)?.id).toBe(1);          // 无门取更近者(1)
    expect((call(900, spot, { deadBottomAngle: 0.75 }) as MockEnemy)?.id).toBe(2);
  });

  it('集火(OwnerMinionAttackTargetNPC 模板)与全局扫共用同一谓词——焦点出锥回退全局(:27431+:69434)', () => {
    const steepBelow = mkEnemy(7, 860, 1250);
    const shallowBelow = mkEnemy(8, 1010, 1160);
    const { player, call } = setup([steepBelow, shallowBelow]);
    (player as unknown as { minionTargetId: number }).minionTargetId = 7;
    const spot = { x: 800, y: 1104 };
    // 焦点 7 出死锥 → 不 return 焦点,继续扫全局命中 8（FindTarget 单谓词语义）
    expect((call(900, spot, { deadBottomAngle: 0.75 }) as MockEnemy)?.id).toBe(8);
    delete (player as unknown as { minionTargetId?: number }).minionTargetId;
  });

  it('★F4 终端形状=点对(Center,0,0)：奇宽盒+半格 frac 终端格差分叉场景钉案', () => {
    // 探针定案 fixture：敌盒 w=33（奇宽）左上 x=847.5 → 盒版终端提取 col53、
    // 点对版 col54；单墙 (55,72) 使盒版视线过、点对版断 —— 原样复刻并双向自证。
    const foe = mkEnemy(1, 864, 1170, 33, 40);   // center (864,1170)、x=847.5
    const { hooks, call } = setup([foe]);
    const store = (hooks.world as unknown as { store: TileStore }).store;
    store.setTile(55, 72, TILE_BY_KEY['stone']);
    // 双向自证：旧「rect 版」终端 (x,y,w,h) 放行 / 新点对终端 (cx,cy) 阻断
    expect(canHitLine(store, 800, 1104, 0, 0, foe.x, foe.y, foe.w, foe.h)).toBe(true);
    expect(canHitLine(store, 800, 1104, 0, 0, foe.cx, foe.cy, 0, 0)).toBe(false);
    expect(call(900, { x: 800, y: 1104 })).toBeNull();   // FindTarget 字面点对端 ⇒ 视线断
  });

  it('dd2SetFlags 读链：equipStats.summonSet 直挂透传生效（批②数据面）', async () => {
    const { dd2SetFlags } = await import('../src/entities/MinionProj');
    const fakePlayer = {
      equipStats: { summonSet: { squireT3: true, squireT2: true, apprenticeT2: false } },
    };
    const f = dd2SetFlags(fakePlayer);
    expect(f.squireT3).toBe(true);
    expect(f.squireT2).toBe(true);      // T3 方法同置 T2 旗(ArmorSetBonuses.cs:92-97)
    expect(f.apprenticeT2).toBe(false);
    expect(dd2SetFlags({}).ballistaPanic).toBe(false);
  });
});
