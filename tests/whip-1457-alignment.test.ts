// 鞭族 4 件 1457 行为对齐 + 尖刺球陷阱定向发射（1457 基准批,2026-08-23）
//  权威：Terarria1457/Terraria.GameContent.Items/WhipTagEffect_SwordWhip.cs +
//  _ElectricEel.cs + _Constellation.cs + _ViolentDisplayOfFlower.cs +
//  ItemID.cs:1313-1420（UniqueTagEffects 全表）+ TagEffectState.cs:97-119（门控）+
//  Wiring.cs:1812-1857（尖刺球 case 3;1456 :1812-1856 活跃分支同文,
//  1456 :1942-1979 负值段 = num95=frameY/18≥0 不可达死分支）
import { describe, it, expect, vi } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { deviceTable, type DeviceCtx } from '../src/world/wiring/devices';
import { TAG_EFFECTS, resolveWhipTagHit } from '../src/entities/WhipTag';
import { Arrow } from '../src/entities/Arrow';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

// ---- 鞭侧 mock 环境（a-batch2/batch-d-tagstack 同款） ----
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number;
  vanillaId?: number; realLife?: number | null; hurtFx?: (d: number) => void;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
  hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};
function makeHooks(enemies: MockEnemy[] = []) {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
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
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities = {
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store, player, added };
}
/** 栈侧打 tag + 启 proc（等价鞭命中写入 + TryEnableProcOnNPC） */
const tagEnemy = (player: Player, e: MockEnemy, itemId: number): void => {
  player.tagEffectStack.tryApplyTagToNPC(itemId, e.id, e.vanillaId);
  player.tagEffectStack.tryEnableProcOnNPC(itemId, e.id);
};
const petalsOf = (added: unknown[]): Arrow[] =>
  added.filter((a) => a instanceof Arrow && (a as Arrow).projId === 1038) as Arrow[];

// ============ 1 表条目字段对拍（1457 ItemID.cs:1313-1420） ============
describe('鞭 tag 三新类 + 花鞭字段对拍（ItemID.cs:1368-1405）', () => {
  it('4678 = WhipTagEffect_SwordWhip（:1368-1374）：TagDamage 9/buff 308×180/时长缺省 240', () => {
    const d = TAG_EFFECTS[4678];
    expect(d.kind).toBe('swordwhip');
    expect(d.tagDamage).toBe(9);          // :1371
    expect(d.playerBuffId).toBe(308);     // :1372
    expect(d.playerBuffTime).toBe(180);   // :1373
    expect(d.tagDuration).toBe(240);      // 基类 ctor（WhipTagEffect.cs:19-22）
    expect(d.critChance).toBe(0);         // 无 CritChance 字段
    expect(d.playerBuffAppliedManually).toBe(false);  // 非 manual → 走 AddTheBuff
  });

  it('5478 = WhipTagEffect_ElectricEel（:1393-1397）：TagDamage 12/CritChance 5/240t/无自 buff', () => {
    const d = TAG_EFFECTS[5478];
    expect(d.kind).toBe('eel');
    expect(d.tagDamage).toBe(12);         // :1396
    expect(d.critChance).toBe(5);         // :1397
    expect(d.tagDuration).toBe(240);
    expect(d.playerBuffId).toBe(0);       // 表条目无 PlayerBuff 字段
  });

  it('5479 = WhipTagEffect_Constellation（:1399-1405）：TagDuration 480 全表唯一覆写（:1402）/15 伤/15% crit', () => {
    const d = TAG_EFFECTS[5479];
    expect(d.kind).toBe('constellation');
    expect(d.tagDuration).toBe(480);      // :1402
    expect(d.tagDamage).toBe(15);         // :1403
    expect(d.critChance).toBe(15);        // :1404
    for (const [id, e] of Object.entries(TAG_EFFECTS)) {
      if (Number(id) !== 5479) expect(e.tagDuration).toBe(240);  // 其余 17 条全缺省
    }
  });

  it('5477 = WhipTagEffect_ViolentDisplayOfFlower（:1375-1379）：TagDamage 9/240t/无自 buff', () => {
    const d = TAG_EFFECTS[5477];
    expect(d.kind).toBe('flower');
    expect(d.tagDamage).toBe(9);          // :1378
    expect(d.tagDuration).toBe(240);
    expect(d.playerBuffId).toBe(0);
    expect(d.critChance).toBe(0);
  });
});

// ============ 2 4678 SwordWhip（_SwordWhip.cs:8-27） ============
describe('4678 剑鞭 MegaSlash', () => {
  it('proc 窗内命中：+30 flat（:26）+ TrueExcalibur 粒子（本仓 916 弹近似）+ OnProcHit true 消费（:13-16）', () => {
    const e = mkEnemy(1, 100, 200);
    const { hooks, player, added } = makeHooks([e]);
    tagEnemy(player, e, 4678);
    expect(player.whipBuffs[308]).toBe(180);   // OnTagAppliedToNPC → AddTheBuff（WhipTagEffect.cs:45-59）
    const res = resolveWhipTagHit(e, 10, hooks, (el) => { added.push(el); }, 1, e.cx, e.cy, player);
    expect(res.dmg).toBe(10 + 9 + 30);         // TagDamage 9（:1371）+ MegaSlash 30（_SwordWhip.cs:20/:26）
    const slash = added.find((a) => a instanceof Arrow && (a as Arrow).projId === 916);
    expect(slash).toBeTruthy();                // 粒子通道（_SwordWhip.cs:21-25 → 本仓 916 近似）
    expect(player.tagEffectStack.canProcOnNPC(4678, e.id)).toBe(false);  // 消费（TagEffectState.cs:114-117）
  });

  it('仅 tag 无 proc 窗：无 +30 无 916（ModifyProcHit 受 CanProcOnNPC 门,TagEffectState.cs:102-105）', () => {
    const e = mkEnemy(2, 100, 200);
    const { hooks, player, added } = makeHooks([e]);
    player.tagEffectStack.tryApplyTagToNPC(4678, e.id);   // 不启 proc
    const res = resolveWhipTagHit(e, 10, hooks, () => {}, 1, e.cx, e.cy, player);
    expect(res.dmg).toBe(10 + 9);              // 只吃 TagDamage
    expect(added).toHaveLength(0);
  });

  it('proc 一次性：消费后第二击回落到纯 tag 伤', () => {
    const e = mkEnemy(3, 100, 200);
    const { hooks, player } = makeHooks([e]);
    tagEnemy(player, e, 4678);
    expect(resolveWhipTagHit(e, 10, hooks, () => {}, 1, e.cx, e.cy, player).dmg).toBe(49);
    expect(resolveWhipTagHit(e, 10, hooks, () => {}, 1, e.cx, e.cy, player).dmg).toBe(19);
  });
});

// ============ 3 5478 ElectricEel（_ElectricEel.cs:10-57） ============
describe('5478 电鳗鞭链电', () => {
  it('链电上限 5 目标（num2=5 :23）：6 邻居只链最近 5,各 ×20 直伤（:51）;flat = 50+50×5（:24-25/:56）', () => {
    const e = mkEnemy(10, 0, 0);
    const targets = [1, 2, 3, 4, 5, 6].map((i) => mkEnemy(10 + i, 40 * i, 0));
    const { hooks, player } = makeHooks([e, ...targets]);
    tagEnemy(player, e, 5478);
    const rvi = vi.spyOn(Math, 'random').mockReturnValue(0.99);   // 播种:crit 5% 不触发
    const res = resolveWhipTagHit(e, 10, hooks, () => {}, 1, e.cx, e.cy, player);
    rvi.mockRestore();
    expect(res.dmg).toBe(10 + 12 + 50 + 5 * 50);   // TagDamage 12（:1396）+ num3 50 + num4 50×5 命中
    for (const t of targets.slice(0, 5)) expect(t.hits).toContain(20);   // TryHittingNPC(nPC, 20)（:27/:51）
    expect(targets[5].hits).toHaveLength(0);       // 第 6 目标超 num2 上限
    expect(player.tagEffectStack.canProcOnNPC(5478, e.id)).toBe(false);  // OnProcHit true（:15-18）
  });

  it('450px 距离门（num5 :26/:41）+ 命中敌同 realLife 跳过（:41）+ NPCHit34 循环外无条件（:55）', () => {
    const e = mkEnemy(20, 0, 0);
    e.realLife = 7;
    const same = mkEnemy(21, 100, 0); same.realLife = 7;    // 与命中敌同 realLife → 跳过
    const other = mkEnemy(22, 200, 0); other.realLife = 8;  // 192px < 450 → 链
    const far = mkEnemy(23, 600, 0); far.realLife = 9;      // 最近点 592px > 450 → 跳过
    const { hooks, player } = makeHooks([e, same, other, far]);
    const sfx: string[][] = [];
    (hooks as unknown as { playSfxFiles: (n: string[]) => void }).playSfxFiles = (n) => sfx.push(n);
    tagEnemy(player, e, 5478);
    const rvi = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const res = resolveWhipTagHit(e, 10, hooks, () => {}, 1, e.cx, e.cy, player);
    rvi.mockRestore();
    expect(res.dmg).toBe(10 + 12 + 50 + 50);       // 仅 other 1 目标
    expect(same.hits).toHaveLength(0);
    expect(other.hits).toContain(20);
    expect(far.hits).toHaveLength(0);
    expect(sfx.some((n) => n.includes('npc_hit34'))).toBe(true);
  });
});

// ============ 4 5479 Constellation（_Constellation.cs:5-17） ============
describe('5479 星鞭 proc 门控', () => {
  it('OnProcHit 仅鞭本体 1034 消费（:12-16）;随从弹命中重启窗不消费（OnTaggedHit :5-8）', () => {
    const e = mkEnemy(30, 100, 200);
    const { hooks, player } = makeHooks([e]);
    player.tagEffectStack.tryApplyTagToNPC(5479, e.id);
    player.tagEffectStack.tryEnableProcOnNPC(5479, e.id);
    // 随从弹（917 ∈ MinionShot）命中：OnTaggedHit 重启窗 + OnProcHit 返 false → 窗保持
    resolveWhipTagHit(e, 10, hooks, () => {}, 1, e.cx, e.cy, player, 0, 917);
    expect(player.tagEffectStack.canProcOnNPC(5479, e.id)).toBe(true);
    // 鞭本体 1034 命中：type == 1034 → 消费（TagEffectState.cs:114-117）
    resolveWhipTagHit(e, 10, hooks, () => {}, 1, e.cx, e.cy, player, 0, 1034);
    expect(player.tagEffectStack.canProcOnNPC(5479, e.id)).toBe(false);
    // 消费后随从再命中 → OnTaggedHit 再启窗（:7 TryEnableProcOnNPC 无条件）
    resolveWhipTagHit(e, 10, hooks, () => {}, 1, e.cx, e.cy, player, 0, 917);
    expect(player.tagEffectStack.canProcOnNPC(5479, e.id)).toBe(true);
  });
});

// ============ 5 5477 花鞭算式（_ViolentDisplayOfFlower.cs:17-33） ============
describe('5477 花鞭花瓣算式', () => {
  it('播种 6 瓣：瓣伤 = ceil((int)((calc+bonus)×2.25)/瓣数)（:19/:23-25）= ceil(90/6) = 15;出生点 = 敌 Center（:31）', () => {
    const e = mkEnemy(40, 200, 300);
    const { hooks, player, added } = makeHooks([e]);
    tagEnemy(player, e, 5477);
    // 掷序:第 1 掷 = 基准角 num2（:20）,第 2 掷 = 瓣数 num3 += Next(0,4)（:21-24）→ 0.99 → 3+3 = 6
    const rvi = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0.5);
    resolveWhipTagHit(e, 40, hooks, (el) => { added.push(el); }, 1, e.cx, e.cy, player);
    rvi.mockRestore();
    const petals = petalsOf(added);
    expect(petals.length).toBe(6);
    for (const p of petals) {
      expect(p.damage).toBe(Math.ceil(Math.trunc(40 * 2.25) / 6));   // 15
      expect(p.x).toBe(e.x + e.w / 2);                                // targetNPC.Center（:31）
      expect(p.y).toBe(e.y + e.h / 2);
    }
    expect(player.tagEffectStack.canProcOnNPC(5477, e.id)).toBe(false);  // OnProcHit 恒 true（:8-15）
  });

  it('bonusTagDamage 并入基数（:19 num = calcDamage + projectile.bonusTagDamage）:40+10 → ceil(112/3) = 38', () => {
    const e = mkEnemy(41, 200, 300);
    const { hooks, player, added } = makeHooks([e]);
    tagEnemy(player, e, 5477);
    // 第 2 掷 0 → 3+0 = 3 瓣
    const rvi = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.5);
    resolveWhipTagHit(e, 40, hooks, (el) => { added.push(el); }, 1, e.cx, e.cy, player, 10);
    rvi.mockRestore();
    const petals = petalsOf(added);
    expect(petals.length).toBe(3);
    for (const p of petals) expect(p.damage).toBe(Math.ceil(Math.trunc(50 * 2.25) / 3));   // 38
  });

  it('瓣数域 3-6（num3=3 + Next(0,4) :21-24）与伤档 {30,23,18,15} 一一对应、全域可达（calc=40,bonus=0）', () => {
    const e = mkEnemy(42, 200, 300);
    const { hooks, player, added } = makeHooks([e]);
    const seen = new Set<number>();
    for (let run = 0; run < 200; run++) {
      player.tagEffectStack.tryApplyTagToNPC(5477, e.id);
      player.tagEffectStack.tryEnableProcOnNPC(5477, e.id);
      const before = added.length;
      resolveWhipTagHit(e, 40, hooks, (el) => { added.push(el); }, 1, e.cx, e.cy, player);
      const petals = petalsOf(added.slice(before));
      expect(petals.length).toBeGreaterThanOrEqual(3);
      expect(petals.length).toBeLessThanOrEqual(6);
      const dmg = petals[0]!.damage;
      for (const p of petals) expect(p.damage).toBe(dmg);   // 同掷均分,各瓣相等
      expect(dmg).toBe(Math.ceil(90 / petals.length));      // trunc(40×2.25)=90
      seen.add(petals.length);
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6]));            // 四档全可达
  });
});

// ============ 6 尖刺球 1457 定向发射（Wiring.cs:1812-1857） ============
const TRAP = TILE_BY_KEY['v_137_traps']!;
interface Shot { x: number; y: number; vx: number; vy: number; dmg: number; kind: string }
function trapCtx(shots: Shot[], countSpiky = 0): DeviceCtx {
  return {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: (px, py, vx, vy, damage, kind) => { shots.push({ x: px, y: py, vx, vy, dmg: damage, kind }); },
    countProjectiles: (kind) => (kind === 'spiky' ? countSpiky : 0),
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
    extractinatorPull: () => null, dropItemStack: () => {},
    worldSurface: 100,
  };
}
/** 单次发射:frameX 定向 + frameY 54（kind 3 尖刺球）;每次新 Wiring（checkMech 冷却表在实例态） */
function fireSpikeBall(frameX: number, countSpiky = 0): Shot[] {
  const world = new World(80, 80, 7, 'open');
  const w = new Wiring(world.store);
  w.st.setTileSilent(40, 40, TRAP, frameX, 54);
  const shots: Shot[] = [];
  deviceTable(w, trapCtx(shots, countSpiky), 137, 40, 40);
  return shots;
}

describe('尖刺球陷阱四向定向（1457 Wiring.cs:1833-1855;1456 活跃分支同文）', () => {
  it('frameX 0/18（case 0/1）= 下：vy ∈ [4,5]、vx ∈ [-1,1]、出生 (x·16+8, y·16+22)（+14×dir）、伤 40', () => {
    for (const fx of [0, 18]) {
      const shots = fireSpikeBall(fx);
      expect(shots.length).toBe(1);
      const s = shots[0]!;
      expect(s.kind).toBe('spiky');
      expect(s.dmg).toBe(40);                       // :1830
      expect(s.x).toBe(40 * 16 + 8);                // :1855 x = i·16+8+14×0
      expect(s.y).toBe(40 * 16 + 8 + 14);           // j·16+8+14×1
      expect(s.vx).toBeGreaterThanOrEqual(-1);      // 4×0 + Next(-20,21)×0.05（:1853）
      expect(s.vx).toBeLessThanOrEqual(1);
      expect(s.vy).toBeGreaterThanOrEqual(4);       // 4×1 + Next(0,21)×0.05（:1854）
      expect(s.vy).toBeLessThanOrEqual(5);
    }
  });

  it('frameX 36（case 2）= 上 vy ∈ [-5,-4]；54（case 3）= 左 vx ∈ [-5,-4]；72（case 4）= 右 vx ∈ [4,5];法向恒 [-1,1]', () => {
    const up = fireSpikeBall(36)[0]!;
    expect(up.y).toBe(40 * 16 + 8 - 14);
    expect(up.vy).toBeGreaterThanOrEqual(-5);       // 4×(-1) + Next(-20,1)×0.05
    expect(up.vy).toBeLessThanOrEqual(-4);
    expect(up.vx).toBeGreaterThanOrEqual(-1);
    expect(up.vx).toBeLessThanOrEqual(1);
    const left = fireSpikeBall(54)[0]!;
    expect(left.x).toBe(40 * 16 + 8 - 14);
    expect(left.vx).toBeGreaterThanOrEqual(-5);
    expect(left.vx).toBeLessThanOrEqual(-4);
    expect(left.vy).toBeGreaterThanOrEqual(-1);
    expect(left.vy).toBeLessThanOrEqual(1);
    const right = fireSpikeBall(72)[0]!;
    expect(right.x).toBe(40 * 16 + 8 + 14);
    expect(right.vx).toBeGreaterThanOrEqual(4);     // 4×1 + Next(0,21)×0.05
    expect(right.vx).toBeLessThanOrEqual(5);
    expect(right.vy).toBeGreaterThanOrEqual(-1);
    expect(right.vy).toBeLessThanOrEqual(1);
  });

  it('抖动 0.05 格点域（Next 整掷 ×0.05）+ 四向极值可达（600 掷）', () => {
    const world = new World(80, 80, 7, 'open');
    let minVy = 99, maxVy = -99, minVx = 99, maxVx = -99;
    for (let t = 0; t < 600; t++) {
      const w = new Wiring(world.store);
      w.st.setTileSilent(40, 40, TRAP, 0, 54);
      const shots: Shot[] = [];
      deviceTable(w, trapCtx(shots), 137, 40, 40);
      const s = shots[0]!;
      for (const v of [s.vx, s.vy]) {
        const k = v / 0.05;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);   // 格点
      }
      minVy = Math.min(minVy, s.vy); maxVy = Math.max(maxVy, s.vy);
      minVx = Math.min(minVx, s.vx); maxVx = Math.max(maxVx, s.vx);
    }
    expect(minVy).toBe(4); expect(maxVy).toBe(5);     // 顺向 [4,5] 两端
    expect(minVx).toBe(-1); expect(maxVx).toBe(1);    // 法向 [-1,1] 两端
  });

  it('无预算上限（:1819-1826 扫描在 num96=185 赋值前比较 type==0 → 原版死代码）+ CheckMech 300 门（:1814）', () => {
    const world = new World(80, 80, 7, 'open');
    const w = new Wiring(world.store);
    w.st.setTileSilent(40, 40, TRAP, 0, 54);
    const shots: Shot[] = [];
    const ctx = trapCtx(shots, 99999);   // 场上 9999 颗尖刺球也不限流
    deviceTable(w, ctx, 137, 40, 40);
    expect(shots.length).toBe(1);
    deviceTable(w, ctx, 137, 40, 40);    // 同格 300t 冷却内不再发
    expect(shots.length).toBe(1);
  });
});

// ============ 7 kind4 长矛方向表（1456 Wiring.cs:1859-1888 ≡ 1457 :1859-1890 ≡ 1405 :1601-1634）============
// ★V1 勘误注已清偿:旧现形 {0左/1右/2上/3下}+偏移10 系误转录,已按三版一致活跃分支修正为
// {0,1}下/2上/3左/4右+偏移18+速8/伤60/弹186/CheckMech90——本段即基准形态锚。
describe('长矛 kind4 四向定向（Wiring.cs:1859-1888 case 4）', () => {
  it('frameX/18 case0/1 下/case2 上/case3 左/case4 右,速 8、出生偏移 18、伤 60、CheckMech 90', () => {
    const cases = [
      { fx: 0, vx: 0, vy: 8, ox: 0, oy: 18 },     // case 0 = 下
      { fx: 18, vx: 0, vy: 8, ox: 0, oy: 18 },    // case 1 = 下（与 case 0 同向）
      { fx: 36, vx: 0, vy: -8, ox: 0, oy: -18 },  // case 2 = 上
      { fx: 54, vx: -8, vy: 0, ox: -18, oy: 0 },  // case 3 = 左
      { fx: 72, vx: 8, vy: 0, ox: 18, oy: 0 },    // case 4 = 右
    ];
    for (const c of cases) {
      const world = new World(80, 80, 7, 'open');
      const w = new Wiring(world.store);
      w.st.setTileSilent(40, 40, TRAP, c.fx, 72);   // frameY 72 = kind 4
      const shots: Shot[] = [];
      deviceTable(w, trapCtx(shots), 137, 40, 40);
      expect(shots.length).toBe(1);
      const s = shots[0]!;
      expect(s.kind).toBe('spear');
      expect(s.dmg).toBe(60);
      expect(s.x).toBe(40 * 16 + 8 + c.ox);
      expect(s.y).toBe(40 * 16 + 8 + c.oy);
      expect(s.vx).toBe(c.vx);
      expect(s.vy).toBe(c.vy);
    }
  });
});
