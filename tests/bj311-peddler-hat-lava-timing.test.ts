// BJ311（2026-09-23 用户实报）：岩浆烫死旅商（368）不掉商贩帽（2222）——三层链定谳：
//   A 掉落触发：原版 checkDead（NPC.cs:78844）→ NPCLoot() 无条件（:79022/79027，
//      无死亡类型门）→ ItemDropDatabase.cs:745 RegisterToNPC(368, Common(2222))
//      =100%×1。本仓 TownNPC.townNpcDeathDrops → resolveDrops → vanilla-npcdrops
//      .json 368→2222 denom1 = 1:1（BJ121 ①已钉,此处不重复）。
//   B 岩浆保护：原版 WorldItem.CheckLavaDeath（WorldItem.cs:686-703）——仅
//      rare 0/-1 且不在 IsLavaImmuneRegardlessOfRarity（ItemID.cs:64,18 件）才烧；
//      rare≥1 全免疫。帽 2222 无 rare 赋值（Item.cs:22416-22422）=白 0 且非豁免
//      →【原版也烧】。本仓 checkLavaDeath（ItemDrop.ts）1:1。
//   C 拾取窗 vs 烧毁窗（本刀根因）：原版相序 Player(GrabItems,Player.cs:27630→
//      35181)先于 Items（Main.cs:17937-17964），NPC 掉落 grabDelayTime=0 →
//      tick1 即可拾取/拉取（±42px）；被抓取帧跳过 MoveInWorld → 跳过岩浆检测
//      →【贴旁玩家必把帽拉走救活】。本仓原全局 PICKUP_DELAY=25（wiki-mechanics
//      -audit-2026-08-13.md:912 挂账债）连拾取带拉取挡 26 拍 > 烧毁拍龄 → 帽必烧
//      在玩家眼前。本刀摘门（仅留 noGrabDelay=玩家自抛件 100t,GrabDelay 同构）。
//   D 城镇掉落初速：原版 NewItem 默认支（Item.cs:49756-49764）随机弹跳
//      vx=Next(-30,31)×0.1 / vy=Next(-40,-15)×0.1；本仓城镇通道曾固定 (0,-2)
//      → 无水平散布（帽直上直下落回浆面）。对拍 Enemy.die 同款 dropVelocity。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ItemDrop } from '../src/entities/ItemDrop';
import { TownNPC } from '../src/entities/TownNPC';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import itemRare from '../src/data/vanilla-itemrare.json';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const HAT_VID = 2222;
const HAT_ID = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[HAT_VID] ?? ''] ?? -1;
const internalIdOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

/** 岩浆坑世界：浆池 x∈[20,24) 行 41-42 满岩浆、行 43 池底；
 *  岸 x∈[24,46) 行 40 陆地（岸顶 y=40*TILE） */
function lavaWorld(): World {
  const w = new World(60, 256, 11, 'bj311-lava');
  const st = w.store;
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 43, 1);
    st.setLiquid(x, 41, 255, 2);
    st.setLiquid(x, 42, 255, 2);
  }
  for (let x = 30; x < 46; x++) st.setTile(x, 40, 1);
  return w;
}

type RecEntry = { op: string; data: unknown };
type HooksWithRecs = GameHooks & { recs: RecEntry[] };

function baseHooks(w: World, over: Record<string, unknown> = {}): HooksWithRecs {
  const recs: RecEntry[] = [];
  return {
    world: w,
    player: undefined as unknown as Player,
    enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, achievements: { notifyItemPickup: () => {} },
    recLog: (op: string, data: unknown) => { recs.push({ op, data }); },
    recs,
    ...over,
  } as unknown as HooksWithRecs;
}

describe('BJ311-① 商贩帽 2222 岩浆烧毁门（CheckLavaDeath 1:1——rare 0 且非豁免=烧）', () => {
  it('帽（rare 缺省 0、不在 IsLavaImmuneRegardlessOfRarity）入浆首拍烧毁,recLog burn', () => {
    expect(HAT_ID).toBeGreaterThan(0);
    expect(ITEM_DEFS[HAT_ID]?.vid).toBe(HAT_VID);
    const w = lavaWorld();
    const hooks = baseHooks(w);
    // 掉落位=旅商中心（浸浆：箱体在岩浆行 41 内）
    const d = new ItemDrop(20 * TILE, 41 * TILE + 2, HAT_ID, 1, 0, 0);
    d.fixedUpdate(1, hooks);
    expect(d.dead).toBe(true);   // 触浆首拍即烧（原版 CheckLavaDeath 无计时器,同相）
    const burn = hooks.recs.find((r) => r.op === 'burn');
    expect(burn).toBeTruthy();
    expect((burn!.data as { vid: number }).vid).toBe(HAT_VID);
  });

  it('普查：rare≥1 免烧（金阔剑 17,表值 1）；豁免表内 rare0 照活（黑曜石肤药水 318）；泥土 2 照烧', () => {
    expect((itemRare as Record<string, number>)['17']).toBe(1);   // 数据自证（漂移即红）
    const w = lavaWorld();
    for (const [vid, wantBurn] of [[17, false], [318, false], [2, true]] as Array<[number, boolean]>) {
      const hooks = baseHooks(w);
      const d = new ItemDrop(20 * TILE, 41 * TILE + 2, internalIdOf(vid), 1, 0, 0);
      for (let i = 0; i < 120; i++) d.fixedUpdate(1, hooks);
      expect(d.dead, `vid ${vid}`).toBe(wantBurn);
    }
  });
});

describe('BJ311-② 拾取窗 vs 烧毁窗（原版相序=玩家先拉取,被抓取帧跳过岩浆检测）', () => {
  it('旅商浸浆死亡+玩家贴旁：帽出生即被拉走拾取,不烧（原版同相=本刀修复面）', () => {
    const w = lavaWorld();
    const p = new Player(24 * TILE, 40 * TILE - 42, new Inventory());   // 岸顶站立
    const hooks = baseHooks(w, { player: p });
    // 帽出生位 = 旅商中心（旅商站池底 43T 顶,h=42 → 中心 y=43T-21,在浆内）
    const d = new ItemDrop(22 * TILE + 8 - 6, 43 * TILE - 21 - 6, HAT_ID, 1, 0, -2);
    for (let i = 0; i < 90 && !d.dead; i++) d.fixedUpdate(1, hooks);
    expect(d.dead).toBe(true);
    expect(hooks.recs.some((r) => r.op === 'burn'), '帽不得被烧（原版被拉取帧跳过岩浆检测）').toBe(false);
    const got = p.inv.slots.find((s) => s && (ITEM_DEFS[s.id]?.vid ?? -1) === HAT_VID);
    expect(got?.stack).toBe(1);
  });

  it('反事实（BJ121 半判回归钉位）：无人贴旁 → 帽触浆烧毁（原版同相）', () => {
    const w = lavaWorld();
    const hooks = baseHooks(w);   // player 缺席
    const d = new ItemDrop(22 * TILE + 2, 43 * TILE - 21 - 6, HAT_ID, 1, 0, -2);
    for (let i = 0; i < 90 && !d.dead; i++) d.fixedUpdate(1, hooks);
    expect(d.dead).toBe(true);
    expect(hooks.recs.some((r) => r.op === 'burn')).toBe(true);
  });
});

describe('BJ311-③ 城镇 NPC 掉落初速对拍（Item.NewItem 默认支 Item.cs:49756-49764）', () => {
  it('旅商死亡掉帽初速=随机弹跳（vx∈[-3,3] 散布、vy∈[-4,-1.6] 上弹）,非固定 (0,-2)', () => {
    const w = lavaWorld();
    const spawns: Array<{ key: string; n: number; vx: number; vy: number }> = [];
    const hooks = baseHooks(w, {
      player: { hp: 100, maxHp: 100, mana: 20, maxMana: 20, luck: 0 },
      spawnDrop: (_x: number, _y: number, key: string, n: number, vx: number, vy: number) => {
        spawns.push({ key, n, vx, vy });
        return null;
      },
    });
    for (let k = 0; k < 24; k++) {
      const npc = new TownNPC('travelling_merchant', 20 * TILE, 44 * TILE);
      npc.hurt(9999, 0, 0, hooks);
    }
    expect(spawns.length).toBe(24);
    for (const s of spawns) {
      expect(s.key).toBe(VANILLA_ITEM_KEY_BY_ID[HAT_VID]);
      expect(s.n).toBe(1);
      expect(s.vx).toBeGreaterThanOrEqual(-3.000001);
      expect(s.vx).toBeLessThanOrEqual(3.000001);
      expect(s.vy).toBeGreaterThanOrEqual(-4.000001);
      expect(s.vy).toBeLessThanOrEqual(-1.599999);   // Next(-40,-15) 开上界=[-40,-16]×0.1
    }
    expect(new Set(spawns.map((s) => s.vx)).size).toBeGreaterThanOrEqual(2);   // 水平散布存在
    expect(new Set(spawns.map((s) => s.vy)).size).toBeGreaterThanOrEqual(2);   // 上弹随机存在
  });
});
