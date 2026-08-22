// 1457 新配饰四件"旗落本体"回归（2026-08-23 批）：
//   ① ammoCycler 弹药轮换（6168/6169/6193/6194——PickAmmo_IterateRange :54326-54366 +
//      PickAmmo_PickAmmoItem :54368-54390 + 实耗推进 :54209-54217 + Update_AmmoCycler
//      :28632-28638 + PlayerAmmoCyclingMode.cs None/AmmoSlots/FullInventory/Random）
//   ② sentry backpack 哨兵携带（6172/6175/6176/6177——CanGetPickedUpBySentryBackpack
//      :80532-80552 + SetAsSelectedSentryBackpackTarget :80554-80557 + 拾起块
//      Projectile.cs:37811-37822 + AI_Sentries_HeavySlingReposition :70096-70103）
//   ③ accTimerCrit 蓄能暴击（6170——Update_TimerCrit :28521-28562 + timerCritChargeFull
//      :3387 + TryConsumingTimerCrit :28564-28595）
//   ④ accHarpyCharm 弧线引矢（6166/6180/6181——Update_HarpyCharm/HarpyCharmEffect
//      :28648-28704 + ApplyHarpyCharm :58779-58807 + AI_001 尾消费 :58752-58777 +
//      StatusNPC PhoenixQuivered :11178-11182）
// 实现落点：src/entities/Player.ts（运行态+选弹/蓄能）、src/entities/Arrow.ts（引矢位标
// 消费端）、src/entities/MinionProj.ts（哨兵携带）、src/core/Game.ts（射击/近战接线）。
import { describe, it, expect } from 'vitest';
import {
  Player,
  pickAmmoIterateRange,
  AMMO_SLOT_ORDER_DEFAULT,
  AMMO_SLOT_ORDER_AMMO_ONLY,
  AMMO_SLOT_ORDER_COINS_ONLY,
} from '../src/entities/Player';
import { Arrow, harpyCharmEffect, VANILLA_ARROW_PROJS } from '../src/entities/Arrow';
import { MinionProj } from '../src/entities/MinionProj';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;

interface StubEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean; hp: number;
  onFire3T?: number;
  hurtLog: Array<{ dmg: number; crit: boolean }>;
}
function mkEnemy(id: number, x: number, y: number, w = 16, h = 16): StubEnemy {
  const e: StubEnemy = { id, x, y, w, h, dead: false, hp: 10000, hurtLog: [] };
  Object.defineProperties(e, {
    cx: { get: () => e.x + e.w / 2 },
    cy: { get: () => e.y + e.h / 2 },
  });
  e.hurt = ((d: number, _kx: number, _ky: number, _g: unknown, _pen?: number, crit?: boolean) => {
    e.hurtLog.push({ dmg: d, crit: !!crit });
    return false;
  }) as never;
  return e;
}

function makeHooks(enemies: StubEnemy[] = []) {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const hooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    breakTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: () => null,
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown, b: string) => void } }).entities =
    { projectiles: [], add: () => {} };
  return { hooks: hooks as unknown as GameHooks, store, player };
}

/** equipStats 覆写（真实聚合缺省 + patch——getter 记忆化,实例自有属性遮蔽原型 getter） */
function withEq(player: Player, patch: Record<string, unknown>): void {
  const merged = { ...(player.equipStats as unknown as Record<string, unknown>), ...patch };
  Object.defineProperty(player, 'equipStats', { get: () => merged, configurable: true });
}

const tick1457 = (p: Player, g: GameHooks): void =>
  (p as unknown as { update1457AccBodies: (g: GameHooks) => void }).update1457AccBodies(g);

/** 造背包槽（槽位 → 物品 id；stack 恒 999） */
const slots = (spec: Record<number, number>): Array<{ id: number; stack: number } | null> => {
  const arr: Array<{ id: number; stack: number } | null> = Array(58).fill(null);
  for (const [k, v] of Object.entries(spec)) arr[Number(k)] = { id: v, stack: 999 };
  return arr;
};

// ================= ① ammoCycler 弹药轮换 =================

describe('① ammoCycler：PickAmmo_IterateRange（Player.cs:54326-54366）', () => {
  it('轮换序：offset % 兼容组数取第 N 组,超组回绕（:54346）', () => {
    const sl = slots({ 54: 101, 55: 102, 56: 103 });
    const m = (id: number) => id >= 101 && id <= 199;
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_AMMO_ONLY, sl, m, 0, true, false)).toBe(54);
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_AMMO_ONLY, sl, m, 1, true, false)).toBe(55);
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_AMMO_ONLY, sl, m, 2, true, false)).toBe(56);
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_AMMO_ONLY, sl, m, 3, true, false)).toBe(54);
  });
  it('空堆叠/非兼容不入池；0 组早退 -1（:54337-54345）', () => {
    const sl = slots({ 54: 101 });
    sl[54]!.stack = 0;                                   // stack<=0 不计（:54337）
    const m = (id: number) => id >= 101 && id <= 199;
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_AMMO_ONLY, sl, m, 0, true, false)).toBe(-1);
    const sl2 = slots({ 54: 301 });                       // 非兼容 ammo
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_AMMO_ONLY, sl2, m, 0, true, false)).toBe(-1);
    // 非 cycling（None 模式回退路径）不数池,直接默认序首个匹配（弹药槽 55 先于背包 0）
    const sl3 = slots({ 0: 101, 55: 102 });
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_DEFAULT, sl3, m, 5, false, false)).toBe(55);
  });
  it('克塔敏化器 779/大地改造器 5134 恒取第一组（:54347-54350）', () => {
    const sl = slots({ 54: 101, 55: 102, 56: 103 });
    const m = (id: number) => id >= 101 && id <= 199;
    for (const off of [0, 1, 2, 7]) {
      expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_AMMO_ONLY, sl, m, off, true, true)).toBe(54);
    }
  });
  it('默认序 = 币 50-53 → 弹药 54-57 → 背包 0-53（AmmoSlotOrder_Default :3175）', () => {
    expect(AMMO_SLOT_ORDER_DEFAULT.slice(0, 8)).toEqual([50, 51, 52, 53, 54, 55, 56, 57]);
    expect(AMMO_SLOT_ORDER_DEFAULT.length).toBe(62);
    expect(AMMO_SLOT_ORDER_DEFAULT.slice(8, 18)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const sl = slots({ 3: 101, 55: 102 });                // 背包 3 与弹药槽 55 各一组
    const m = (id: number) => id >= 101 && id <= 199;
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_DEFAULT, sl, m, 0, true, false)).toBe(55);
    expect(pickAmmoIterateRange(AMMO_SLOT_ORDER_DEFAULT, sl, m, 1, true, false)).toBe(3);
  });
});

describe('① ammoCycler：Player.pickAmmoSlot 分模式（PickAmmo_PickAmmoItem :54368-54390）', () => {
  it('AmmoSlots(1)：只在弹药槽 54-57 轮换,背包兼容弹药不进轮换序;弹药槽空回退默认序首个', () => {
    const { player } = makeHooks();
    withEq(player, { ammoCyclerMode: 1 });
    const m = (id: number) => id >= 101 && id <= 199;
    player.inv.slots = slots({ 12: 101, 54: 101, 55: 102 }) as never;
    expect(player.pickAmmoSlot(m, 40, 39)).toBe(54);      // offset 0 → 槽 54
    player.ammoCyclingOffset = 1;
    expect(player.pickAmmoSlot(m, 40, 39)).toBe(55);      // 轮换只看 54-57
    player.ammoCyclingOffset = 0;
    player.inv.slots = slots({ 12: 101, 13: 102 }) as never;   // 弹药槽全空
    expect(player.pickAmmoSlot(m, 40, 39)).toBe(12);      // 回退默认序（不轮换）取背包首个
  });
  it('币族 useAmmo=71 + AmmoSlots：先币槽 50-53 轮换（:54372-54374）', () => {
    const { player } = makeHooks();
    withEq(player, { ammoCyclerMode: 1 });
    const m = (id: number) => id >= 71 && id <= 74;
    player.inv.slots = slots({ 50: 71, 51: 72 }) as never;
    expect(AMMO_SLOT_ORDER_COINS_ONLY).toEqual([50, 51, 52, 53]);
    expect(player.pickAmmoSlot(m, 71, 905)).toBe(50);
    player.ammoCyclingOffset = 1;
    expect(player.pickAmmoSlot(m, 71, 905)).toBe(51);
  });
  it('FullInventory(2)/None(0)：None 取默认序首个不轮换;2 全域轮换', () => {
    const { player } = makeHooks();
    const m = (id: number) => id >= 101 && id <= 199;
    withEq(player, { ammoCyclerMode: 0 });
    player.inv.slots = slots({ 12: 101, 54: 102 }) as never;
    expect(player.pickAmmoSlot(m, 40, 39)).toBe(54);      // 默认序弹药槽先于背包
    withEq(player, { ammoCyclerMode: 2 });
    player.ammoCyclingOffset = 1;
    expect(player.pickAmmoSlot(m, 40, 39)).toBe(12);      // 全域轮换第二组
  });
});

describe('① ammoCycler：实耗推进 + 停火复位（:54209-54217 / Update_AmmoCycler :28632-28638）', () => {
  it('noteAmmoCycledShot：cooldown=useAnimation+120、offset++；None(0) 不推进', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { ammoCyclerMode: 1 });
    player.noteAmmoCycledShot(20);
    expect(player.ammoCyclingCooldown).toBe(140);          // 20+120
    expect(player.ammoCyclingOffset).toBe(1);
    withEq(player, { ammoCyclerMode: 0 });
    player.noteAmmoCycledShot(20);
    expect(player.ammoCyclingCooldown).toBe(140);          // None 早退（:54209 门）
    expect(player.ammoCyclingOffset).toBe(1);
    void hooks;
  });
  it('Random(3)：offset 直写随机（:54214-54217）——不再等于旧值+1', () => {
    const { player } = makeHooks();
    withEq(player, { ammoCyclerMode: 3 });
    player.ammoCyclingOffset = 5;
    player.noteAmmoCycledShot(20);
    expect(Number.isInteger(player.ammoCyclingOffset)).toBe(true);
    expect(player.ammoCyclingOffset).toBeGreaterThanOrEqual(0);
    expect(player.ammoCyclingOffset).toBeLessThan(2147483647);
  });
  it('Update_AmmoCycler：冷却走完归 0 拍 offset 复位 0（停火 useAnimation+120t 回第一组）', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { ammoCyclerMode: 1 });
    player.noteAmmoCycledShot(20);
    for (let i = 0; i < 139; i++) tick1457(player, hooks);
    expect(player.ammoCyclingCooldown).toBe(1);
    expect(player.ammoCyclingOffset).toBe(1);              // 未走完不复位
    tick1457(player, hooks);
    expect(player.ammoCyclingCooldown).toBe(0);
    expect(player.ammoCyclingOffset).toBe(0);              // :28634-28637
  });
});

// ================= ② sentry backpack 哨兵携带 =================

describe('② sentry backpack：拾起门（CanGetPickedUpBySentryBackpack :80532-80552）', () => {
  it('挂背包+盒相交+冷却 0 → 拾起：carriedByBackpack/续约 2/钉玩家中心/速度清零', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accSentryBackpack: true });
    const s = new MinionProj(player.cx - 8, player.cy - 8, 663, 10, 1, true, 0, false, () => player);
    (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles = [s];
    s.fixedUpdate(1 / 60, hooks);
    expect(s.carriedByBackpack).toBe(true);                // ai[2]=1（:37813）
    expect(player.accSentryBackpackGrabCooldown).toBe(2);  // :80556 续约
    expect(s.vx).toBe(0); expect(s.vy).toBe(0);            // :37820
    expect(s.cx).toBe(player.cx); expect(s.cy).toBe(player.cy);   // default 支 :70261
  });
  it('未挂背包/抓取冷却占用（同时至多携带一门）不拾起', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accSentryBackpack: false });
    const s0 = new MinionProj(player.cx - 8, player.cy - 8, 663, 10, 1, true, 0, false, () => player);
    s0.fixedUpdate(1 / 60, hooks);
    expect(s0.carriedByBackpack).toBe(false);              // :80543 旗门
    withEq(player, { accSentryBackpack: true });
    player.accSentryBackpackGrabCooldown = 2;              // 另一门已占位
    const s1 = new MinionProj(player.cx - 8, player.cy - 8, 677, 10, 1, true, 1, false, () => player);
    s1.fixedUpdate(1 / 60, hooks);
    expect(s1.carriedByBackpack).toBe(false);              // :80543 冷却门
    expect(player.accSentryBackpackGrabCooldown).toBe(2);  // 哨兵侧不递减（玩家 tick 职责）
    tick1457(player, hooks);
    expect(player.accSentryBackpackGrabCooldown).toBe(1);  // Update_SentryBackpack :28644 递减
  });
  it('携带中随玩家移动（无重力/无落地）——多 tick 位置钉玩家中心', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accSentryBackpack: true });
    const s = new MinionProj(player.cx - 8, player.cy - 8, 663, 10, 1, true, 0, false, () => player);
    s.fixedUpdate(1 / 60, hooks);
    expect(s.carriedByBackpack).toBe(true);
    player.x += 48;                                        // 玩家移动 48px
    for (let i = 0; i < 5; i++) s.fixedUpdate(1 / 60, hooks);
    expect(s.cx).toBe(player.cx);                          // 仍背在身上
    expect(s.vy).toBe(0);                                  // :37820 velocity 恒零（无重力积累）
  });
  it('携带中卸下背包 → 哨兵当场消亡（AI_Sentries_HeavySlingReposition :70099-70103）', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accSentryBackpack: true });
    const s = new MinionProj(player.cx - 8, player.cy - 8, 663, 10, 1, true, 0, false, () => player);
    s.fixedUpdate(1 / 60, hooks);
    expect(s.carriedByBackpack).toBe(true);
    withEq(player, { accSentryBackpack: false });          // 半途卸下
    s.fixedUpdate(1 / 60, hooks);
    expect(s.dead).toBe(true);
  });
  it('未携带哨兵照常落地（重力 +0.2/t）——携带分支不吞常规物理', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accSentryBackpack: true });
    const s = new MinionProj(player.cx, 60 * 16, 663, 10, 1, true, 0, false, () => player);
    s.fixedUpdate(1 / 60, hooks);
    expect(s.carriedByBackpack).toBe(false);
    expect(s.vy).toBeGreaterThan(0);                       // :65420 落地段照跑
  });
});

// ================= ③ accTimerCrit 蓄能暴击 =================

describe('③ accTimerCrit：Update_TimerCrit 充能（:28521-28562）', () => {
  it('速率 3+3+3：驻立闲置 9/t、移动闲置 6/t、用物中 3/t、钳 1000', () => {
    const { player, hooks } = makeHooks();
    tick1457(player, hooks);
    expect(player.accTimerCritCharge).toBe(9);             // 3+3(闲)+3(驻)
    player.vx = 1;                                          // |v|≥0.1
    tick1457(player, hooks);
    expect(player.accTimerCritCharge).toBe(15);            // 3+3(闲)+0
    player.vx = 0; player.useTime = 5;                      // 用物窗（仍驻立）
    tick1457(player, hooks);
    expect(player.accTimerCritCharge).toBe(21);            // 3+0(用物吃掉闲置份)+3(驻)
    player.useTime = 0; player.itemAnimTicks = 3; player.vx = 1;
    tick1457(player, hooks);
    expect(player.accTimerCritCharge).toBe(24);            // 3+0+0（用物+移动全停加成）
    player.itemAnimTicks = 0;
    for (let i = 0; i < 200; i++) tick1457(player, hooks);
    expect(player.accTimerCritCharge).toBe(1000);          // :28538-28542 钳满
  });
  it('满蓄提示只在 accTimerCrit 在身时出音（:28543-28545）', () => {
    const { player, hooks } = makeHooks();
    const sfx: string[] = [];
    (hooks as unknown as { playSfxFiles: (f: string[]) => void }).playSfxFiles = (f: string[]) => { sfx.push(...f); };
    player.accTimerCritCharge = 999;
    tick1457(player, hooks);
    expect(player.accTimerCritCharge).toBe(1000);
    expect(sfx).toEqual([]);                               // 未挂件无提示（:28543 门）
    player.accTimerCritCharge = 0;
    withEq(player, { accTimerCrit: true });
    for (let i = 0; i < 112; i++) tick1457(player, hooks);
    expect(sfx).toContain('Item_28');                      // SoundID.Item28
  });
});

describe('③ accTimerCrit：TryConsumingTimerCrit（:28564-28595）', () => {
  it('满蓄命中 → 强制暴击并消费 −15；未满/未挂件 → 不消费', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accTimerCrit: true });
    expect(player.tryConsumingTimerCrit(hooks, 0, 0, 10, 10)).toBe(false);   // charge 0
    player.accTimerCritCharge = 1000;
    expect(player.tryConsumingTimerCrit(hooks, 0, 0, 10, 10)).toBe(true);
    expect(player.accTimerCritCharge).toBe(-15);           // :28570
    withEq(player, { accTimerCrit: false });
    player.accTimerCritCharge = 1000;
    expect(player.tryConsumingTimerCrit(hooks, 0, 0, 10, 10)).toBe(false);   // :28565 旗门
    expect(player.accTimerCritCharge).toBe(1000);          // 不消费
  });
  it('负冷却窗 15t 内命中仍暴击且不重置；1/t 回充过 0 后需重蓄（:28566/:28528-28533）', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accTimerCrit: true });
    player.accTimerCritCharge = -15;
    for (let t = 0; t < 14; t++) {
      expect(player.accTimerCritCharge).toBe(-15 + t);     // 上拍回充后的现值
      expect(player.tryConsumingTimerCrit(hooks, 0, 0, 10, 10)).toBe(true);  // charge<0 亦过门
      expect(player.accTimerCritCharge).toBe(-15 + t);     // >0 门拦重置（:28568）
      tick1457(player, hooks);
      expect(player.accTimerCritCharge).toBe(-14 + t);     // 负窗 1/t 回充
    }
    // charge 爬回 0 后：窗尽 → 不再暴击,进入正常充能
    tick1457(player, hooks);                               // −1 → 0
    expect(player.accTimerCritCharge).toBe(0);
    expect(player.tryConsumingTimerCrit(hooks, 0, 0, 10, 10)).toBe(false);
    expect(player.accTimerCritCharge).toBe(0);
  });
});

// ================= ④ accHarpyCharm 弧线引矢 =================

describe('④ accHarpyCharm：HarpyCharmEffect 玩家侧扫描（:28661-28704）', () => {
  it('400..1200px 内最近箭 + 视线目标 → 引矢落标：转向/钳 life/冷却 90', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accHarpyCharm: true });
    const foe = mkEnemy(1, player.cx + 700, player.cy - 100);
    (hooks as unknown as { enemies: () => StubEnemy[] }).enemies = () => [foe];
    const far = new Arrow(player.cx + 500, player.cy, 6, 0, 10, 1, 1, null, { grav: 0 });
    const near = new Arrow(player.cx + 300, player.cy, 6, 0, 10, 1, 1, null, { grav: 0 });   // <400 排除
    const projs = (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles;
    projs.push(near, far);
    harpyCharmEffect(hooks, player);
    expect(far.harpyCharmed).toBe(true);
    expect(near.harpyCharmed).toBe(false);                 // :28687 !(d<400) 门
    expect(player.accHarpyCharmCooldown).toBe(90);         // :28670/:28702
    expect(far.life).toBeLessThanOrEqual(300);             // :58797-58800
    const sp = Math.hypot(far.vx, far.vy);
    const toFoe = Math.atan2(foe.cy - far.cy, foe.cx - far.cx);
    expect(Math.atan2(far.vy, far.vx)).toBeCloseTo(toFoe, 5);   // rotateTowards π 一步到位
    expect(sp).toBeCloseTo(6, 5);                          // 保速
  });
  it('>1200px 不引；已引箭跳过；冷却期不扫描（:28663/:28687）', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accHarpyCharm: true });
    const foe = mkEnemy(1, player.cx + 900, player.cy);
    (hooks as unknown as { enemies: () => StubEnemy[] }).enemies = () => [foe];
    const tooFar = new Arrow(player.cx + 1300, player.cy, 6, 0, 10, 1, 1, null, { grav: 0 });
    const projs = (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles;
    projs.push(tooFar);
    harpyCharmEffect(hooks, player);
    expect(tooFar.harpyCharmed).toBe(false);
    expect(player.accHarpyCharmCooldown).toBe(0);
    const charmed = new Arrow(player.cx + 500, player.cy, 6, 0, 10, 1, 1, null, { grav: 0 });
    charmed.harpyCharmed = true;                           // 已引（AI_001_Features bit0）
    projs.length = 0;
    projs.push(charmed);
    harpyCharmEffect(hooks, player);
    expect(player.accHarpyCharmCooldown).toBe(0);          // :28682 HarpyCharmed 跳过
    // 冷却期（Update_HarpyCharm 递减支）不进扫描
    player.accHarpyCharmCooldown = 30;
    const fresh = new Arrow(player.cx + 500, player.cy, 6, 0, 10, 1, 1, null, { grav: 0 });
    projs.push(fresh);
    tick1457(player, hooks);
    expect(fresh.harpyCharmed).toBe(false);
    expect(player.accHarpyCharmCooldown).toBe(29);         // :28650-28654 递减支
  });
  it('6180 炽天使：冷却 ×0.8=72 + seraphNecklaced 位；6181 凤凰优先 → phoenixQuivered 位', () => {
    const { player, hooks } = makeHooks();
    withEq(player, { accHarpyCharm: true, accSeraphNecklace: true });
    const foe = mkEnemy(1, player.cx + 700, player.cy);
    (hooks as unknown as { enemies: () => StubEnemy[] }).enemies = () => [foe];
    const projs = (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles;
    const a = new Arrow(player.cx + 500, player.cy, 6, 0, 10, 1, 1, null, { grav: 0 });
    projs.push(a);
    harpyCharmEffect(hooks, player);
    expect(player.accHarpyCharmCooldown).toBe(72);         // :28671-28674
    expect(a.seraphNecklaced).toBe(true);                  // :58792-58795
    expect(a.phoenixQuivered).toBe(false);
    withEq(player, { accHarpyCharm: true, accSeraphNecklace: true, hasPhoenixQuiver: true });
    player.accHarpyCharmCooldown = 0;                      // 复位冷却（:28663 门）
    const b = new Arrow(player.cx + 500, player.cy, 6, 0, 10, 1, 1, null, { grav: 0 });
    projs.length = 0; projs.push(b);
    harpyCharmEffect(hooks, player);
    expect(b.phoenixQuivered).toBe(true);                  // :28700 hasPhoenixQuiver 优先
    expect(b.seraphNecklaced).toBe(false);                 // 三档单选（itemID 单值）
  });
});

describe('④ accHarpyCharm：AI_001 尾消费 + 命中面（:58752-58777 / StatusNPC :11178-11182）', () => {
  it('charmed 箭每拍朝视线目标全转（保速,低速 ×1.05）；目标丢失 → HarpyCharmConsumed 停引', () => {
    const { hooks } = makeHooks();
    const foe = mkEnemy(1, 800, 1200);
    (hooks as unknown as { enemies: () => StubEnemy[] }).enemies = () => [foe];
    const a = new Arrow(600, 1400, 8, 0, 10, 1, 1, null, { grav: 0 });
    a.applyHarpyCharm(foe.cx, foe.cy, 6166);               // ApplyHarpyCharm :58779
    expect(a.harpyCharmed).toBe(true);
    a.fixedUpdate(1 / 60, hooks);
    expect(Math.atan2(a.vy, a.vx)).toBeCloseTo(Math.atan2(foe.cy - a.cy, foe.cx - a.cx), 5);
    expect(a.harpyCharmConsumed).toBe(false);
    (hooks as unknown as { enemies: () => StubEnemy[] }).enemies = () => [];   // 目标全灭
    a.fixedUpdate(1 / 60, hooks);
    expect(a.harpyCharmConsumed).toBe(true);               // :58772-58776
  });
  it('phoenixQuivered 命中 → Hellfire(323) 定值 300t（onFire3T≥5,无掷幅）；普通箭不挂', () => {
    const { hooks } = makeHooks();
    const foe = mkEnemy(1, 800, 1400);
    (hooks as unknown as { enemies: () => StubEnemy[] }).enemies = () => [foe];
    const plain = new Arrow(foe.x - 4, foe.y, 4, 0, 10, 1, 1, null, { grav: 0 });
    plain.fixedUpdate(1 / 60, hooks);
    expect(foe.onFire3T ?? 0).toBe(0);
    const phoenix = new Arrow(foe.x - 4, foe.y, 4, 0, 10, 1, 1, null, { grav: 0 });
    phoenix.phoenixQuivered = true;
    phoenix.fixedUpdate(1 / 60, hooks);
    expect(foe.onFire3T ?? 0).toBeGreaterThanOrEqual(5);   // AddBuff(323, 300)
  });
  it('VANILLA_ARROW_PROJS = SetDefaults arrow=true 23 型；非 arrow/非 aiStyle1 不入扫描', () => {
    expect(VANILLA_ARROW_PROJS.size).toBe(23);
    expect(VANILLA_ARROW_PROJS.has(1)).toBe(true);         // 木箭 :811
    expect(VANILLA_ARROW_PROJS.has(639)).toBe(true);       // 月总箭 :6877
    expect(VANILLA_ARROW_PROJS.has(14)).toBe(false);       // 子弹非 arrow
    const { player, hooks } = makeHooks();
    withEq(player, { accHarpyCharm: true });
    const foe = mkEnemy(1, player.cx + 700, player.cy);
    (hooks as unknown as { enemies: () => StubEnemy[] }).enemies = () => [foe];
    const projs = (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles;
    const bullet = new Arrow(player.cx + 500, player.cy, 6, 0, 10, 1, 14, null, { grav: 0 });
    projs.push(bullet);
    harpyCharmEffect(hooks, player);
    expect(bullet.harpyCharmed).toBe(false);               // :28682 projectile.arrow 门
    expect(player.accHarpyCharmCooldown).toBe(0);
  });
});
