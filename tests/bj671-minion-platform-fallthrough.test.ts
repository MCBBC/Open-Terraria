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
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

const GAME = join(__dirname, '..');
const MINION_TS = readFileSync(join(GAME, 'src/entities/MinionProj.ts'), 'utf8');

/** 夹具：平台行 row（tile type=19 木平台,TileID.Platforms=19）+ 地面 row+3;
 *  玩家在平台【下方】（巡航锚=玩家心−60px 也在平台下 → 弹须下穿平台到位）。
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

describe('BJ671 ② 行为判别：387/388/533 下落穿平台（原版 flag6 缺省相）', () => {
  // 玩家 py=92*16（平台 90 行下方）;弹出生在平台上方 88 行 → 巡航锚（玩家心−60）
  // 在平台下方 → 弹须下落穿平台。旧实现（dropThrough 缺省 false）被平台承接 =
  // y 停在 (PLAT_ROW*16 − h) 不再下行 = 变异退化值。
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
