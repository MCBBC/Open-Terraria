// ★清偿刀 W1（2026-10-01）：Whip × 城镇 NPC 通道定谳+落刀（S3b 姊妹刀）。
//  定谳锚（Terarria1457/Terraria/Projectile.cs Damage_PVE_Inner 亲读）：
//   · 免疫窗门 :12635-12639 对城镇靶【同面】——鞭 maxPenetrate=-1 → flag3=false ⇒
//     `targetNPC.immune[owner]==0` 严格门;残窗（他弹通用尾档 :14197-14199 写 10t）
//     门拒 = :12638 整跳：不 tag(:13635-13638 门后)/不写 minionTarget(:14321-14327
//     门后)/不耗 falloff(:13453-13550 门后)/不占局部表(:14175-14179 门后)/不 numHits
//     (:14263 门后)。
//   · 受理写梯 :14175-14179 usesLocal 主支（localNPCHitCooldown=-1≠-2 达）：
//     `immune[owner]=0`【清全局窗不开窗】+ immuneArray[victim]=-1（局部表占位）——
//     旧形态 TownNPC.hurt :1445 通用档写 iframes=10 = 原版无的 10t 全局窗（鞭→他弹
//     连携被自造窗拒 10t）;旧形态鞭调用点零 tag/零 minionTarget/零占位/零衰减。
//   · tag/minionTarget 面 :13635-13638/:14321-14327 两写位【无 friendly 门】——城镇
//     受理照写;minionTarget 次拍经 Player.cs:57682-57685 CanBeChasedBy（friendly 恒假）
//     清除 = 写后即清同原版相。
//   · falloff/numHits :13453-13550/:14263 受理面无条件段——dmg 快照(:12970)先于衰减
//     switch,本拍满伤、衰减字段为后续拍;城镇靶同耗。
//   · justHit 载体：StrikeNPC 受理置真（NPC.cs:82103）/ResetEffects 复位(:8534)——
//     旧近似「iframes===10」在鞭清窗面丢失 → TownNPC.justHitT 显式载体。
//  判别力（旧码必红项）：§B1 命中后 iframes==0 非 10;§B2 窗清后他弹照达;§B3 tag;
//  §B4 minionTarget;§B5 占位（窗清+无 hitSet 会同挥多杀）;§B6 衰减同耗;§C 守巫毒窄门。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { WhipProj } from '../src/entities/WhipProj';

function makeGame(list: Enemy[], towns: TownNPC[]): { hooks: GameHooks; player: Player } {
  const w = new World(200, 120, 7, 'w1-whip-town');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => list,
    npcs: () => towns,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: { add: () => {}, nextId: 1, projectiles: [] } as never,
    applyLifeSteal: () => 0,
  } as unknown as GameHooks;
  return { hooks, player };
}

/** 向导桩（vid 22,巫毒窄门正靶;不 tick → 残窗/写位保持） */
function guide(hooks: GameHooks, towns: TownNPC[], px: number, py: number): TownNPC {
  const g = new TownNPC('guide', px, py);
  g.id = 100 + towns.length;
  g.maxHp = 5000;
  g.hp = 5000;
  towns.push(g);
  void hooks;
  return g;
}

/** 坦克桩敌（真 Enemy 管线,S3b 同法） */
function tankEnemy(hooks: GameHooks, list: Enemy[], px: number, py: number): Enemy {
  const e = Enemy.fromVanilla(15, px, py)!;
  e.id = 1 + list.length;
  e.maxHp = 5000;
  e.hp = 5000;
  list.push(e);
  return e;
}

/** 鞭命中驱动（s3b 同式）：9 拍起手 → 靶移到 ai0=20 快照曲线控制点 → 1 拍 */
function landOneHit(w: WhipProj, hooks: GameHooks, ...targets: Array<{ x: number; y: number; w: number; h: number }>): void {
  for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
  const p = w.pointsAt(20, true)[10];
  for (const t of targets) { t.x = p.x - t.w / 2; t.y = p.y - t.h / 2; }   // 靶心对控制点
  w.fixedUpdate(1, hooks);
}

const mkWhip = (player: Player, dmg: number, projId = 841, itemId = 4672): WhipProj =>
  new WhipProj(player.cx, player.cy, 0, projId, itemId, dmg, 4, 30, 4, () => player);

// equipStats 为冻结 getter（Player.ts:1820 Object.freeze）——melee-alignment-batch:171 同法覆写
const voodooOn = (p: Player): void => {
  Object.defineProperty(p, 'equipStats', {
    value: Object.freeze({ ...p.equipStats, killGuide: true }), configurable: true,
  });
};

describe('W1-§A：残窗城镇 NPC（免疫窗门 :12635-12639 城镇同面）——门拒拍整跳', () => {
  it('A1 残窗向导：零伤/tag 不挂/minionTarget 不写/不计数;窗期满受理拍才挂', () => {
    const list: Enemy[] = [], towns: TownNPC[] = [];
    const { hooks, player } = makeGame(list, towns);
    voodooOn(player);
    const g = guide(hooks, towns, 400, 600);
    g.iframes = 10;                                   // 他弹残窗（TownNPC.hurt :1411 同源窗）
    const hp0 = g.hp;
    const w = mkWhip(player, 60);
    landOneHit(w, hooks, g);
    expect(g.hp).toBe(hp0);                           // 整跳：零伤（:12638 return）
    expect(player.tagEffectStack.isNPCTagged(4672, g.id)).toBe(false);  // 不 tag（:13635 门后）
    expect(player.minionTargetId).toBe(-1);           // 不写集火槽（:14321-14327 门后）
    expect(w.pveNumHits).toBe(0);                     // 不计数（:14263 门后）
    // 残窗期鞭清窗写位【未达】（写梯 :14175-14179 门后）→ iframes 保持 10 非 0
    expect(g.iframes).toBe(10);
    // 窗期满同鞭照吃（局部表留白,非「占位后饿死」）
    g.iframes = 0;
    const hpBefore = g.hp;
    w.fixedUpdate(1, hooks);                          // 曲线缓移,18×18 盒仍叠 → 受理
    expect(g.hp).toBeLessThan(hpBefore);              // 窗期满照吃
    expect(player.tagEffectStack.isNPCTagged(4672, g.id)).toBe(true);   // 受理拍才挂 tag
    expect(w.pveNumHits).toBe(1);
    expect(g.iframes).toBe(0);                        // 受理写梯=清窗非开窗
  });
});

describe('W1-§B：受理写梯（:14175-14179 usesLocal 主支 + tag/minionTarget 面）', () => {
  it('B1 受理命中 iframes 恒 0 非 10（旧 TownNPC.hurt 通用档写 10=自造全局窗必红）', () => {
    const list: Enemy[] = [], towns: TownNPC[] = [];
    const { hooks, player } = makeGame(list, towns);
    voodooOn(player);
    const g = guide(hooks, towns, 400, 600);
    const hp0 = g.hp;
    landOneHit(mkWhip(player, 60), hooks, g);
    expect(g.hp).toBeLessThan(hp0);                   // 受理
    expect(g.iframes).toBe(0);                        // ★主判别:immune[owner]=0（:14175-14178）
    expect(g.justHitT).toBe(1);                       // justHit 载体置真（NPC.cs:82103）
  });

  it('B2 鞭→他弹连携：鞭受理后他弹照达（旧码 10t 自造窗拒他弹必红）', () => {
    const list: Enemy[] = [], towns: TownNPC[] = [];
    const { hooks, player } = makeGame(list, towns);
    voodooOn(player);
    const g = guide(hooks, towns, 400, 600);
    const hp0 = g.hp;
    landOneHit(mkWhip(player, 60), hooks, g);
    const hp1 = g.hp;
    expect(g.iframes).toBe(0);
    expect(g.hurt(30, 0, 0, hooks)).toBe(true);       // ★主判别:非 force 他弹面照达（窗清）
    expect(g.hp).toBeLessThan(hp1);                   // 双命中都落账
    expect(hp0 - g.hp).toBeGreaterThan(hp0 - hp1);
  });

  it('B3/B4 受理挂 tag + 写 minionTarget（:13635-13638/:14321-14327 无 friendly 门）', () => {
    const list: Enemy[] = [], towns: TownNPC[] = [];
    const { hooks, player } = makeGame(list, towns);
    voodooOn(player);
    const g = guide(hooks, towns, 400, 600);
    landOneHit(mkWhip(player, 60), hooks, g);
    expect(player.tagEffectStack.isNPCTagged(4672, g.id)).toBe(true);   // ★B3
    expect(player.minionTargetId).toBe(g.id);                            // ★B4
  });

  it('B5 占位（immuneArray[victim]=-1）：同鞭残曲线续拍不重复受理（旧窗清后无占位必多杀）', () => {
    const list: Enemy[] = [], towns: TownNPC[] = [];
    const { hooks, player } = makeGame(list, towns);
    voodooOn(player);
    const g = guide(hooks, towns, 400, 600);
    const w = mkWhip(player, 60);
    landOneHit(w, hooks, g);
    const hp1 = g.hp;
    expect(w.pveNumHits).toBe(1);
    // 受理后续拍把向导持续钉在【下一子步】曲线控制点上（几何恒叠;窗已清
    //  iframes=0）——唯一节流 = 弹侧局部表占位（hitSet）→ 不再扣血不重复计数
    for (let s = 1; s <= 3; s++) {
      const p = w.pointsAt(20 + 2 * s, true)[10];     // ai0 = 20+2s = 下拍末子步
      g.x = p.x - g.w / 2; g.y = p.y - g.h / 2;
      w.fixedUpdate(1, hooks);
    }
    expect(g.hp).toBe(hp1);                           // ★主判别:占位拦重复受理
    expect(w.pveNumHits).toBe(1);
  });

  it('B6 falloff 同耗（:13453-13550）：城镇受理后同拍次靶敌吃衰减伤（旧码不耗必满伤红）', () => {
    const list: Enemy[] = [], towns: TownNPC[] = [];
    const { hooks, player } = makeGame(list, towns);
    voodooOn(player);
    const g = guide(hooks, towns, 400, 600);
    const e = tankEnemy(hooks, list, 400, 600);       // 同点叠放:控制点序=城镇先(点10 同位)
    const hpG0 = g.hp, hpE0 = e.hp;
    landOneHit(mkWhip(player, 60), hooks, g, e);
    expect(g.hp).toBeLessThan(hpG0);                  // 城镇受理（衰减消费拍）
    // 参照：独立 game 满伤基准（同几何同防）
    const refList: Enemy[] = [], refTowns: TownNPC[] = [];
    const { hooks: refHooks, player: refPlayer } = makeGame(refList, refTowns);
    voodooOn(refPlayer);
    const ref = tankEnemy(refHooks, refList, 400, 600);
    landOneHit(mkWhip(refPlayer, 60), refHooks, ref);
    const refDmg = 5000 - ref.hp;
    expect(refDmg).toBeGreaterThan(0);
    expect(5000 - e.hp).toBeGreaterThan(0);
    expect(5000 - e.hp).toBeLessThan(refDmg);         // ★主判别:次靶吃 ×0.5（841 衰减档）
  });
});

describe('W1-§C：巫毒窄门保持（无娃不受新通道影响）', () => {
  it('C1 无 killGuide：城镇靶零伤零面（skip/onAccept 参数不旁路窄门）', () => {
    const list: Enemy[] = [], towns: TownNPC[] = [];
    const { hooks, player } = makeGame(list, towns);   // 不置 killGuide
    const g = guide(hooks, towns, 400, 600);
    const hp0 = g.hp;
    const w = mkWhip(player, 60);
    landOneHit(w, hooks, g);
    expect(g.hp).toBe(hp0);
    expect(w.pveNumHits).toBe(0);
    expect(player.tagEffectStack.isNPCTagged(4672, g.id)).toBe(false);
    expect(player.minionTargetId).toBe(-1);
  });
});
