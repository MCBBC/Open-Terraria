// BJ574（2026-10-08 用户实报）：巫毒娃娃扔进地狱岩浆——向导死了但肉山不召唤。
// 原版两召唤面（1457 亲读）：
//   A. WorldItem.CheckLavaDeath(:686-703)→VoodooDollLavaDeath(:705-777)：type 267
//      入浆 → 场上每只向导(22) StrikeNPCNoInteraction(9999,10,-dir)(:725)=
//      StrikeNPC(owner=255)(NPC.cs:82012→:82017)【全链不查 iframes/无敌帧】强制
//      受理；每杀一只调 NPC.SpawnWOF(物品位置)(:728，AnyNPCs(113) 门挡重复);
//      stack 余量随机处决城镇 NPC(:736-758)。
//   B. NPC.checkDead case 22（NPC.cs:80176-80181）：向导死亡时本体盒
//      Collision.LavaCollision(position,width,height) → SpawnWOF(自身位置)——
//      向导自己浸浆致死（岩浆 StrikeNPCNoInteraction(50)/30t，NPC.cs:94528-94533）
//      等「死于岩浆中」的一切死法都召。用户实测根因：向导先被岩浆烫死，娃再烧
//      时场上已无活向导 → A 面整支不触发 → 两面全缺 = 只死向导不召肉山。
//   SpawnWOF 内门（NPC.cs:81114）：pos.Y/16 < maxTilesY-205 → 返回（地表/洞穴
//      岩浆不召）；已有墙在场 → 返回。
// 本仓两债：
//   ① F-8（IIIII223 既有域，BJ-C6 登记）：checkLavaDeath→hurt 未传 force——
//      TownNPC.hurt `iframes>0 && !force → 拒收`（TownNPC.ts:1426），iframes>0
//      时烧娃致死当拍被吞（原版无此拒收面）。
//   ② checkDead case 22 面整缺：向导死亡时本体浸浆不召肉山。
// BJ502/BJ-C6/F1 静默门形态：owner=255 ∧ Damage≥9999 → flag（NPC.cs:82065）→
//   不冒飘字（:82078 `if (!flag && lifeMax > 1)` 才 CombatText）——本仓
//   strikeSilent = dmg≥9999 ∧ !fromPlayer 同相，force 通道恒静默。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { Enemy } from '../src/entities/Enemy';

const DOLL_VID = 267;
const DOLL_ID = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[DOLL_VID] ?? ''] ?? -1;

/** 世界：h=400 → SpawnWOF 高度门 = h-205 = 195 格、UnderworldLayer = h-200 = 200。
 *  地狱浆池 x∈[20,30) 行 340-341 满岩浆、行 342 池底（340 ≥ 195 → 门过）；
 *  地表浆池 x∈[60,66) 行 41-42、行 43 池底（41 < 195 → 门必拒=非地狱对照面）。 */
function bj574World(): World {
  const w = new World(120, 400, 11, 'bj574');
  const st = w.store;
  for (let x = 20; x < 30; x++) {
    st.setTile(x, 342, 1);
    st.setLiquid(x, 340, 255, 2);
    st.setLiquid(x, 341, 255, 2);
  }
  for (let x = 60; x < 66; x++) {
    st.setTile(x, 43, 1);
    st.setLiquid(x, 41, 255, 2);
    st.setLiquid(x, 42, 255, 2);
  }
  return w;
}

function makeHooks(w: World, guide?: TownNPC) {
  const enemies: Enemy[] = [];
  const damageNums: Array<{ x: number; y: number; amt: number }> = [];
  const hooks = {
    world: w,
    // 玩家远在天外且 dead → GrabItems 整段跳过 + SpawnWOF 落位避让直接收敛
    player: { x: -99999, y: -99999, w: 20, h: 42, dead: true, hp: 400, maxHp: 400,
      mana: 100, maxMana: 200, luck: 0, cx: -99989, cy: -99978 },
    npcs: () => (guide ? [guide] : []),
    enemies: () => enemies,
    entities: { nextId: 1, add: (e: unknown, b: string) => { if (b === 'enemies') enemies.push(e as Enemy); } },
    critters: () => [], spawnDrop: () => null, spawnEnemy: () => {},
    damagePlayer: (): number => 0,
    addDamageNumber: (x: number, y: number, amt: number) => { damageNums.push({ x, y, amt }); },
    cutTile: () => {}, onEnemyKilled: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    playSfxWav: () => {}, showPickupLabel: () => {},
    achievements: { notifyItemPickup: () => {} },
    recLog: () => {},
  } as unknown as GameHooks;
  return { hooks, enemies, damageNums };
}

/** 空气中的向导（不浸任何液体——case 22 岩浆盒面不误触） */
function airGuide(): TownNPC {
  return new TownNPC('guide', 50 * TILE, 300 * TILE, new Inventory());
}

const hasWof = (enemies: Enemy[]): boolean =>
  enemies.some((e) => e.vanillaId === 113 && !e.dead);

describe('BJ574 巫毒娃娃岩浆链（A 面 VoodooDollLavaDeath + B 面 checkDead case 22）', () => {
  it('① F-8 判别：向导 iframes>0 时烧娃仍杀向导（StrikeNPCNoInteraction 不查无敌帧）', () => {
    expect(DOLL_ID).toBeGreaterThan(0);
    const w = bj574World();
    const g = airGuide();
    g.iframes = 10;                       // 刚被敌怪蹭过——拒收窗内
    const { hooks, enemies } = makeHooks(w, g);
    const d = new ItemDrop(22 * TILE, 340 * TILE + 2, DOLL_ID, 1, 0, 0);
    d.fixedUpdate(1, hooks);
    expect(d.dead).toBe(true);            // 娃娃照烧（TurnToAir :713）
    expect(g.dead).toBe(true);            // ★本刀判别位：拒收窗不吞致死
    expect(hasWof(enemies)).toBe(true);   // SpawnWOF(:728) 照召
  });

  it('② 肉山召唤（向导死+地狱门）：iframes=0 烧娃 → 向导死 + 地狱浆池召出 113', () => {
    const w = bj574World();
    const g = airGuide();
    const { hooks, enemies } = makeHooks(w, g);
    const d = new ItemDrop(22 * TILE, 340 * TILE + 2, DOLL_ID, 1, 0, 0);
    d.fixedUpdate(1, hooks);
    expect(g.dead).toBe(true);
    expect(hasWof(enemies)).toBe(true);
  });

  it('③ 向导非地狱死不召唤：烧于地表浆池（y/16=41 < h-205）→ 向导死、无肉山', () => {
    const w = bj574World();
    const g = airGuide();
    const { hooks, enemies } = makeHooks(w, g);
    const d = new ItemDrop(62 * TILE, 41 * TILE + 2, DOLL_ID, 1, 0, 0);
    d.fixedUpdate(1, hooks);
    expect(g.dead).toBe(true);            // 处决支无高度门（:725 全域生效）
    expect(hasWof(enemies)).toBe(false);  // SpawnWOF 高度门（:81114）拒召
  });

  it('④ BJ502/BJ-C6 静默门形态核：巫毒处决不冒飘字（flag=9999∧owner255, NPC.cs:82065/:82078）', () => {
    const w = bj574World();
    const g = airGuide();
    const { hooks, damageNums } = makeHooks(w, g);
    const d = new ItemDrop(22 * TILE, 340 * TILE + 2, DOLL_ID, 1, 0, 0);
    d.fixedUpdate(1, hooks);
    expect(g.dead).toBe(true);
    expect(damageNums).toHaveLength(0);   // 处决面静默（strikeSilent 同相）
    // 阳性对照：普通伤害照飘（间谍活性自证）
    const g2 = airGuide();
    const h2 = makeHooks(w, g2);
    g2.hurt(20, 0, 0, h2.hooks);
    expect(h2.damageNums.length).toBeGreaterThan(0);
  });

  it('⑤ B 面（checkDead case 22）：向导死于岩浆盒内 → 以向导自身位置召肉山', () => {
    const w = bj574World();
    // 底 y=341*16+8 → 盒跨行 338.4-341.4，与浆池行 340-341 相交（x∈[20,30) 内）
    const g = new TownNPC('guide', 24 * TILE, 341 * TILE + 8, new Inventory());
    const { hooks, enemies } = makeHooks(w, g);
    g.hurt(9999, 0, 0, hooks, 0, 0, false, true);   // 致死（岩浆 DoT 50/30t 同走本死亡块）
    expect(g.dead).toBe(true);
    expect(hasWof(enemies)).toBe(true);
  });

  it("⑤' B 面条件位：向导死在地狱岸上（无岩浆盒相交）→ 不召（LavaCollision 门）", () => {
    const w = bj574World();
    const st = w.store;
    for (let x = 44; x < 56; x++) st.setTile(x, 342, 1);   // 岸台（x=50 无浆）
    const g = new TownNPC('guide', 50 * TILE, 342 * TILE, new Inventory());
    const { hooks, enemies } = makeHooks(w, g);
    g.hurt(9999, 0, 0, hooks, 0, 0, false, true);
    expect(g.dead).toBe(true);
    expect(hasWof(enemies)).toBe(false);   // 深度门已过（339≥195）——拒召唯 LavaCollision 假
  });

  it('⑥ stack 余量随机处决支（:736-758）：stack=2 → 向导 + 一名城镇 NPC 皆处决（force 通道）', () => {
    const w = bj574World();
    const g = airGuide();
    const m = new TownNPC('merchant', 52 * TILE, 300 * TILE, new Inventory());
    m.iframes = 10;                        // 拒收窗内——余量处决同样强制受理
    const hooks = makeHooks(w, g).hooks;
    (hooks as unknown as { npcs: () => TownNPC[] }).npcs = () => [g, m];
    const d = new ItemDrop(22 * TILE, 340 * TILE + 2, DOLL_ID, 2, 0, 0);
    d.fixedUpdate(1, hooks);
    expect(g.dead).toBe(true);
    expect(m.dead).toBe(true);             // num=2-1(向导)=1 → 随机池再处决一名
  });
});
