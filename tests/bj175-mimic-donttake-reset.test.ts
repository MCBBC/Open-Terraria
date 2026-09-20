// ★BJ175 2026-09-20（用户实报：神圣宝箱怪 475 武器无伤——真实弹幕完全穿透）
//
// 定谳（探针 scripts/_mimic-hitchring-probe.mjs 实证 + 反编译对读）：
//   原版 AI_087 头段（1457 NPC.cs:37845-37851）每 tick 重写
//     dontTakeDamage = false（:37848）/ noTileCollide = false（:37849）
//   ——旗标只在态3 蓄能体（:37967）置真，出态即被头段清掉。
//   本仓 bigMimicAI 头缺该两行 → 首次蓄能态（清醒 210t 后 1/3 掷入）置真后
//   【永挂】：dealContacts/Arrow 主命中环 dontTakeDamage 排除门（Projectile.cs
//   :12600 同款）+ Enemy.hurt 早退三面全拒 = 真实弹幕穿透、无飘值、不唤醒。
//   桶归属/碰撞盒/免疫集/BJ145 iframes 门四嫌疑全部排除（探针 S0-S2 面全绿：
//   enemies 桶 ✓、伪装态可命中可唤醒 ✓、态2 前可命中 ✓）。
// 权威：NPC.cs:37845-37851（头段）/ :37966-37982（态3）/ :37856-37861（态0 唤醒门）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { bigMimicAI } from '../src/entities/bossAI_lunar_misc';
import { Enemy } from '../src/entities/Enemy';
import type { Enemy as EnemyT } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

function mkHooks(enemies: EnemyT[]) {
  const w = new World(120, 160, 1, 'mimic');
  // 高空测试带（行 20-100 清空）+ 底部地板行 110，防 moveAndCollide 落出界
  for (let x = 0; x < 120; x++) {
    for (let y = 20; y <= 100; y++) w.store.setTileSilent(x, y, 0, 0, 0);
    w.store.setTileSilent(x, 110, 1, 0, 0);
  }
  const player = new Player(20 * 16, 20 * 16, new Inventory());
  const bucket: Arrow[] = [];
  const hooks = {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    projectiles: () => bucket,
    entities: { nextId: 1, add: (e: unknown) => { bucket.push(e as Arrow); } },
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: () => ({ x: 0, y: 0, vx: 0, vy: 0 }),
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxFile: () => {},
    showPickupLabel: () => {},
    broadcastParticleOrchestra: () => {},
  };
  return { hooks: hooks as unknown as GameHooks, world: w, player, bucket };
}

/** 真实数据驱动宝箱怪（Enemy.fromVanilla(475) = BJ174 spawnMimic 同源链） */
function mkMimic(hooks: GameHooks, cx: number, cy: number): EnemyT {
  const e = Enemy.fromVanilla(475, cx, cy) as EnemyT;
  expect(e).toBeTruthy();
  expect(e.vanillaId).toBe(475);
  expect(e.w).toBe(28);                       // vanilla-npcs.json width（NPC.cs SetDefaults）
  expect(e.h).toBe(44);
  hooks.enemies().push(e);
  return e;
}

/** 真实武器弹（木箭 2=WoodenArrowFriendly；Arrow 主命中环 = Damage_PVE 移植面）：
 *  出生即与宝箱怪盒相交，单 tick fixedUpdate 走完整命中环 */
function fireArrowAt(hooks: GameHooks, e: EnemyT, dmg = 100): Arrow {
  const a = new Arrow(e.cx - 4, e.cy - 5, 12, 0, dmg, 2, 2, { grav: 0 });
  (hooks as unknown as { entities: { add: (x: unknown) => void } }).entities.add(a);
  return a;
}

/** AI 心跳 N 拍（直接驱 bigMimicAI 核——Enemy.fixedUpdate 的 aiStyle 87 分发体） */
function tickAI(hooks: GameHooks, e: EnemyT, n: number): void {
  for (let i = 0; i < n; i++) bigMimicAI(e, hooks, hooks.player);
}

describe('BJ175 态3 蓄能旗标（vanilla AI_087 头段 :37848 每 tick 复位）', () => {
  it('态3 体内 dontTakeDamage=true 且真实弹幕不结算（原版同相,蓄能无敌面）', () => {
    const { hooks } = mkHooks([]);
    const e = mkMimic(hooks, 40 * 16, 30 * 16);
    e.ai0 = 3; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    tickAI(hooks, e, 2);
    expect(e.ai0).toBe(3);
    expect(e.dontTakeDamage).toBe(true);          // :37967 态3 体置真
    const hp0 = e.hp;
    const a = fireArrowAt(hooks, e);
    a.fixedUpdate(1 / 60, hooks);
    expect(e.hp).toBe(hp0);                       // 蓄能无敌:命中环 dontTakeDamage 排除门拒绝
    expect(hp0 - e.hp).toBe(0);
  });

  it('★回归主判据：态3 出态（ai1>=180 → ai0=2）后头段复位 dontTakeDamage=false,真实弹幕恢复掉血', () => {
    const { hooks } = mkHooks([]);
    const e = mkMimic(hooks, 40 * 16, 30 * 16);
    e.ai0 = 3; e.ai1 = 179; e.ai2 = 0; e.ai3 = 0;   // 下一拍即出态
    tickAI(hooks, e, 1);
    expect(e.ai0).toBe(2);                          // :37971-37975 出态
    tickAI(hooks, e, 2);                            // 态2 两拍：头段 :37848 应清旗
    expect(e.ai0).toBe(2);
    expect(e.dontTakeDamage).toBe(false);           // ★曾缺此复位=永挂无敌（用户实报断环）
    expect(e.noTileCollide).toBe(false);            // :37849 头段对齐（态4/5 穿墙旗不残挂）
    const hp0 = e.hp;
    const a = fireArrowAt(hooks, e);
    a.fixedUpdate(1 / 60, hooks);
    expect(hp0 - e.hp).toBeGreaterThan(0);          // 真实弹幕命中掉血（探针 S3 曾=0）
    expect(e.justHit).toBe(true);                   // 受击唤醒链活
  });

  it('态4/态5 出态后同样无旗标残留（4.1 俯冲/5 穿墙归位不置 dontTakeDamage）', () => {
    const { hooks } = mkHooks([]);
    for (const st of [4, 4.1, 5]) {
      const e = mkMimic(hooks, 60 * 16, 30 * 16);
      e.ai0 = st as number; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
      e.dontTakeDamage = true;                      // 预置脏旗（模拟外场污染）
      tickAI(hooks, e, 2);
      expect(e.dontTakeDamage, `态${st} 头段复位`).toBe(false);
      hooks.enemies().length = 0;                   // 换型清桶
    }
  });
});

describe('BJ175 命中环上游面（桶归属/伪装态——探针 S0-S2 回归锚）', () => {
  it('伪装态（ai0=0）真实弹幕可命中且受击唤醒（0→1,原版 :37856-37861 justHit 支）', () => {
    const { hooks, player } = mkHooks([]);
    const e = mkMimic(hooks, 60 * 16, 30 * 16);
    // 玩家拉远 >80px,防邻近唤醒支污染 justHit 判别
    player.x = e.x - 400; player.y = e.y;
    e.ai0 = 0; e.ai1 = 0; e.vx = 0; e.vy = 0;
    tickAI(hooks, e, 1);
    expect(e.ai0).toBe(0);                          // 拉远后伪装态保持
    const hp0 = e.hp;
    const a = fireArrowAt(hooks, e);
    a.fixedUpdate(1 / 60, hooks);
    expect(hp0 - e.hp).toBeGreaterThan(0);          // 伪装态可命中（探针 S1 hpDelta=23 同相）
    tickAI(hooks, e, 1);                            // 下一 AI 拍消费 justHit → 唤醒
    expect(e.ai0).toBeGreaterThanOrEqual(1);        // justHit → 唤醒（0→1,:37856-37861）
  });

  it('清醒跳扑态（ai0=2,状态3 之前）真实弹幕掉血（BJ174 直驱结论的命中环面对齐）', () => {
    const { hooks } = mkHooks([]);
    const e = mkMimic(hooks, 40 * 16, 30 * 16);
    e.ai0 = 2; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    tickAI(hooks, e, 2);
    const hp0 = e.hp;
    const a = fireArrowAt(hooks, e);
    a.fixedUpdate(1 / 60, hooks);
    expect(hp0 - e.hp).toBeGreaterThan(0);
    // 木箭 maxPenetrate=1 → flag3 单发弹命中不设免疫帧（:11903-11907）,iframes 恒 0
    expect(e.iframes).toBe(0);
  });
});
