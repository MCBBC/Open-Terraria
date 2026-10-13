// ★BJ671（2026-10-13 用户实报「魔眼法杖召唤的激光眼不会自己下平台（比如木平台）」）：
//  原版弹面 flag6 缺省 true——Projectile.cs:17587 `bool flag6 = true`（非宠物弹）→
//  TileCollision 调用 (flag6,flag6)（:17705-17721）= passPlatformDown=true = 平台
//  永不承接（下落穿过）。387/388 双子魔眼（aiStyle 66 :4714/:4730）不在覆写 switch
//  :17670-17696（677-693/759/1020/500）且非 projPet → 交战态 AI 翻转 tileCollide=true
//  （AI_066 :30301-30304）也照样穿平台下落。533 致命球（aiStyle 66 :6005）同理。
//  本仓病根：MinionProj twinsStep/integrate533 走 moveAndCollide 时 Body.dropThrough
//  缺省 false = 平台承接 = 卡平台。修 = 两支 AI 逐拍置 dropThrough=true
//  （≡原版 flag6 缺省;WeaponProj 各支 dropThrough:true 同先例）。864 刃杖不受影响
//  （SetDefaults tileCollide=false :9196 且 smolstarAI 位移直写不走碰撞）。
//  ★变异证红：摘除 `this.dropThrough = true` → 行为断言红（弹被平台接住停在顶面）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

const GAME = join(__dirname, '..');
const MINION_TS = readFileSync(join(GAME, 'src/entities/MinionProj.ts'), 'utf8');

/** 夹具：平台行 row（tile type=11 木平台,T.PLATFORM=11）+ 地面 row+4;
 *  玩家 py 由用例指定（97*16=平台下方/88*16=站平台上）——巡航/归位锚随玩家位走。
 *  仿 BJ635 夹具纪律：真 World/真 Player/直接驱动 fixedUpdate。 */
function makeHooks(playerPy: number) {
  const w = new World(120, 120, 7, 'bj671');
  const PLAT_ROW = 90, GROUND_ROW = 94;
  for (let x = 20; x < 100; x++) w.store.setTile(x, PLAT_ROW, 11);   // 木平台带（T.PLATFORM=11）
  for (let x = 0; x < 120; x++) for (let y = GROUND_ROW; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = GROUND_ROW;
  const player = new Player(60 * 16, playerPy, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => [],
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
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: added,
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store: w.store, player, platRow: PLAT_ROW };
}

let seq = 0;
const spawn = (player: Player, hooks: GameHooks, pid: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, pid, 6, 0, false, 0, false, () => player);
  m.id = ++seq;
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
  return m;
};
const run = (m: MinionProj, hooks: GameHooks, n: number): void => {
  for (let i = 0; i < n && !m.dead; i++) m.fixedUpdate(1 / 60, hooks);
};

describe('BJ671 ① 源锚', () => {
  it('twinsStep/integrate533 各置 dropThrough=true（弹面 flag6 缺省在码）', () => {
    expect(MINION_TS).toContain('★BJ671（2026-10-13 用户实报「激光眼不会自己下木平台」）');
    expect(MINION_TS).toContain('★BJ671：弹面 flag6 缺省 true（Projectile.cs:17587 非宠物弹 → TileCollision');
  });
});

describe('BJ671 ② 行为判别：387/388/533 下落穿平台（aiStyle 66 后置覆写=恒穿相）', () => {
  // 玩家 py=97*16（平台 90 行下方,巡航锚=玩家心−60 在平台下）→ 弹须下落穿平台。
  // 旧实现（dropThrough 缺省 false）被平台承接 = y 停在平台顶不再下行 = 变异退化值。
  // ★注：387/388/533 在 Main.projPet 表内,但 aiStyle 66 覆写（Projectile.cs:17621）
  //  后置覆盖 projPet 门 → 恒穿=R3-F#6 勘正后的正确模型（BJ672 旧注「非 pet」错）。
  for (const pid of [387, 388, 533] as const) {
    it(`vid ${pid}：平台上方出生 90 拍 → y 越过平台顶至少 8px（穿过）`, () => {
      const { hooks, player, platRow } = makeHooks(97 * 16);
      const m = spawn(player, hooks, pid, 60 * 16, 88 * 16);
      run(m, hooks, 90);
      const platTop = platRow * 16;
      expect(m.dead, '弹存活（未撞实体墙消亡）').toBe(false);
      expect(m.y + m.h, `vid ${pid} 盒底应越过平台顶（穿平台下行;旧实现=被承接停在 ${platTop}）`)
        .toBeGreaterThan(platTop + 8);
    });
  }

  it('对照面：387 在平台上方但玩家也在上方 → 巡航锚在上方,弹不被平台吸住（sanity）', () => {
    const { hooks, player } = makeHooks(84 * 16);   // 玩家在平台上 6 行
    const m = spawn(player, hooks, 387, 60 * 16, 86 * 16);
    run(m, hooks, 60);
    expect(m.y, '锚在上方 → 弹上行远离平台（顶不越平台顶）').toBeLessThan(90 * 16);
  });
});

// ---------------------------------------------------------------------------
// ③ BJ672 逐族普查（2026-10-13 用户令「登记的进行逐族普查」）：MinionProj 全走
//  moveAndCollide 的 AI 支 × 原版弹面 flag6 类别全对拍。flag6 覆写面 = projPet
//  条件（:17590）∪ switch（500/677-693/1105=承接,759=穿,1020=角度判 :17670-17696）
//  ∪ decidesManualFallThrough（AI 写 shouldFallThrough 才被消费 :17698）。其余
//  全族 TRUE 缺省=穿平台。普查产物：
//  · 补恒穿桥：759（case=TRUE）/390-392/653/1025/1098/1123（TRUE 缺省）/ai62 地面态;
//  · ai026TailGround :6799 条件式改恒穿（AI_026_TAIL 7 vid 全 TRUE 缺省——dMFT=
//    false 时 shouldFallThrough 写值不被弹面消费,旧条件式回落承接=非原版相）;
//  · 不动（已核正确）：dMFT 9 支（758/833-835/951/1022/1036/1093/1112/1118 桥在
//    :50454/:52112 双锚）/688-693/1105 哨兵段（flag6=承接,缺省相恰）/864/963/970/
//    831/625-628/946 直写位移无弹面/917 tileCollide=false 无弹面。
// ---------------------------------------------------------------------------
describe('BJ671 ③ BJ673 勘误后普查判别（R3-F#1/2/3 翻案：projPet 门 vid=承接,覆写面 vid=穿）', () => {
  it('源锚：补桥在码（759/1098+1123/1025/ai62 恒穿 + AI_026/390 −12 门 + 653 +4 门）', () => {
    for (const anchor of [
      '★BJ672：弹面 flag6=TRUE（case 759 显式 :17693）',
      '★BJ672：弹面 flag6=TRUE 缺省（1098/1123 aiStyle 204',
      '★BJ672：弹面 flag6=TRUE 缺省（1025 aiStyle 197 非覆写面）',
      '★BJ673 勘误（2026-10-14 红蓝 R3-F#1 翻案 BJ672）',
      '★BJ673 勘误（红蓝 R3-F#2 翻案 BJ672）：390-392 在 Main.projPet',
      '★BJ673 勘误（红蓝 R3-F#3 翻案 BJ672）：653 有显式承接面',
    ]) {
      expect(MINION_TS).toContain(anchor);
    }
  });

  // 判别夹具设计（R3-F#5）：玩家站平台上（底 1430 ≤ 平台顶 1440+12 门）→ projPet
  // vid（266/390）flag6=false=被承接；玩家在平台下方（底 1594−12=1582 > 弹底）→ 穿。
  // 三实现分辨：恒穿=第一支红、无条件承接=第二支红。
  it('vid 266 玩家站平台上 → 已站台位不沉（projPet −12 门关=承接;BJ672 恒穿在此红）', () => {
    const { hooks, player, platRow } = makeHooks(1440 - 42); // 玩家底=1440=平台顶（站位）
    const m = spawn(player, hooks, 266, 60 * 16, platRow * 16 - 20); // 盒底=平台顶（已站台）
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    // 门：玩家底−12=1428 ≯ 弹底 1440 → dropThrough=false → 逐拍重承接维持站立
    //（恒穿实现会立即沉穿到下方地面 94 行=1504）
    expect(m.y + m.h, '盒底被平台托住（≤平台顶+8）').toBeLessThanOrEqual(platRow * 16 + 8);
  });

  it('vid 266 玩家在平台下方 → 穿台（projPet 门开）', () => {
    const { hooks, player, platRow } = makeHooks(97 * 16);   // 玩家底−12=1582 > 承接位 1440
    const m = spawn(player, hooks, 266, 60 * 16, 88 * 16);
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    expect(m.y + m.h, '盒底越过平台顶（穿台下行）').toBeGreaterThan(platRow * 16 + 8);
  });

  it('vid 390 蜘蛛玩家站平台上 → 已站台位不沉（双机制①站平台行走）', () => {
    const { hooks, player, platRow } = makeHooks(1440 - 42);
    const m = spawn(player, hooks, 390, 60 * 16, platRow * 16 - 30);
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    expect(m.y + m.h, '盒底被平台托住').toBeLessThanOrEqual(platRow * 16 + 8);
  });

  it('vid 653 伴侣立方玩家站平台上 → 平台承接（:17605 显式 +4 门原版相）', () => {
    const { hooks, player, platRow } = makeHooks(1440 - 42);
    player.buffs.apply(BuffType.CompanionCube, 300);   // AI 生命期门（buff 191）
    const m = spawn(player, hooks, 653, 60 * 16, platRow * 16 - 30);
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    expect(m.y + m.h, '盒底被平台托住（恒穿在此红）').toBeLessThanOrEqual(platRow * 16 + 8);
  });
});
