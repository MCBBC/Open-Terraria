// 1457 新内容缺口批（2026-08-23 内容缺口批，行为面调查点名四件）：
//   ① 钻地龟 5667/6174 + 弹 1098/1123（AI_204_Digtoise Projectile.cs:39169-39506）
//     ★调查面"6174 坐骑"前提证伪：1457 MountID.cs:166 Count=66 尾条 65，Mount.cs
//     零 Digtoise 段——6174 是 ItemCheck_Shoot 专支召唤物（Player.cs:48687-48752，
//     SpawnDigtoiseOnCursor :50015-50045），纯挖掘宠（minionSlots=0、不在
//     MinionSacrificable 表 ProjectileID.cs:401）
//   ② 巨型提基 6147（tile 753，TileID.cs:1943 + TileObjectData.cs:4126-4131）
//   ③ 亲缘桃 6191/6192（纯材料：Item.cs:47661-47669 无 useStyle/shoot；
//     Recipe.cs:10510-10533 五条 Trusty 升级链 + 两条桃合成）
//   ④ 宝石法杖 6171（Item.cs:47551-47554 DefaultToStaff(126,6,22,15) +
//     PackGemStaffFeatures Player.cs:50002 `AllGems = (HeldItem.type == 6171)`）
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';
import projFramesJson from '../src/data/vanilla-projframes.json';
import {
  TILE_KEY_BY_SHEET, TILE_BY_KEY, TILE_DEFS,
} from '../src/data/tiles';
import {
  ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID,
} from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import {
  VANILLA_RECIPES, RECIPE_GROUP_ITEMS,
} from '../src/data/vanillaRecipes';
import {
  packGemStaffFeatures, finalizeGemStaffStats, gemDamageMultiplier,
} from '../src/data/vanillaGemStaff';
import { MOUNT_COUNT, MOUNT_NAMES, mountOfItem, mountOfBuff } from '../src/entities/Mounts';
import { PALPETTABLE_MINIONS } from '../src/core/Game';
import { MinionProj } from '../src/entities/MinionProj';
import { Arrow } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

// ---------------------------------------------------------------------------
// ① 钻地龟数据锚（6174/5667 物品 + 1098/1123 弹）
// ---------------------------------------------------------------------------
describe('①钻地龟数据锚（6174/5667 + 1098/1123）', () => {
  it('非坐骑：MountID.Count=66 尾条 65、无钻地龟名；mountOfItem/mountOfBuff 双双 -1', () => {
    expect(MOUNT_COUNT).toBe(66);                       // MountID.cs:166（62-65 Chillet 族尾）
    for (const id of Object.keys(MOUNT_NAMES)) {
      expect(MOUNT_NAMES[id]).not.toMatch(/Digtoise/i); // Mount.cs 零 Digtoise 段
    }
    expect(mountOfItem(6174)).toBe(-1);                // Item.cs:47564-47576 无 mountType
    expect(mountOfItem(5667)).toBe(-1);
    expect(mountOfBuff(393)).toBe(-1);                 // 393=ClayPotMinion 随从 buff 非坐骑
  });
  it('itemCombat：6174→shoot 1123 / 5667→1098，useTime=useAnimation=15+noUseGraphic+useTurn；无 damage/summon（纯挖掘宠）', () => {
    const t = itemCombat(6174)!;
    const n = itemCombat(5667)!;
    expect([t.shoot, t.useTime, t.useAnimation, t.noUseGraphic, t.useTurn]).toEqual([1123, 15, 15, true, true]);
    expect([n.shoot, n.useTime, n.useAnimation, n.noUseGraphic]).toEqual([1098, 15, 15, true]);
    expect(t.damage).toBeUndefined();                  // Item.cs:47564-47576 无 damage 赋值
    expect(t.summon).toBeUndefined();                  // 无 summon——不走通用召唤分流（专支）
  });
  it('弹 SetDefaults：aiStyle 204 + 34×34 + friendly + projFrames 11（Projectile.cs:10241/:10506）', () => {
    for (const id of [1098, 1123]) {
      expect(projectileData(id)).toMatchObject({ aiStyle: 204, width: 34, height: 34, friendly: true });
      expect((projFramesJson as Record<string, number>)[String(id)]).toBe(11);
    }
  });
  it('抚摸白名单：1098/1123 入表（GetPettingInfo :39552-39555 isPetSmall+num2=48）', () => {
    expect(PALPETTABLE_MINIONS.has(1098)).toBe(true);
    expect(PALPETTABLE_MINIONS.has(1123)).toBe(true);
  });
  it('物品注册键在盘（vanilla.json 自动注册链）+ 稀有度/价值（Item.cs:47575 rare3/1金）', () => {
    expect(VANILLA_ITEM_KEY_BY_ID[6174]).toBe('vi_6174_PalworldTrustyDigtoise');
    expect(VANILLA_ITEM_KEY_BY_ID[5667]).toBe('vi_5667_PalworldDigtoise');
    const rare = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-itemrare.json'), 'utf8'));
    const value = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-itemvalue.json'), 'utf8'));
    expect([rare['6174'], value['6174']]).toEqual([3, 50000]);   // rare3 + sellPrice(0,1)×5=5金买入
  });
});

// ---------------------------------------------------------------------------
// ② 钻地龟行为（AI_204_Digtoise 态机折算）
// ---------------------------------------------------------------------------
const W = 200, H = 120;
const iid6174 = iid(6174);
interface PickRec { x: number; y: number; pick: number; cap: number }
function makeHooks(opts: { pickPower?: number | null; pickOk?: boolean; heldVid?: number } = {}) {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  const pl = new Player(60 * 16, 90 * 16, new Inventory());
  pl.inv.slots[0] = { id: iid(opts.heldVid ?? 6174), stack: 1 };   // 持物品门（:39240-39246）
  const picks: PickRec[] = [];
  const sfx: string[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: pl as never,
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
    playSfxFiles: (tracks: string | string[]) => {
      for (const t of Array.isArray(tracks) ? tracks : [tracks]) sfx.push(t);
    },
    showPickupLabel: () => {},
    petPickTile: (tx, ty, pick, cap) => { picks.push({ x: tx, y: ty, pick, cap }); return opts.pickOk ?? true; },
    bestPickaxePower: () => (opts.pickPower !== undefined ? opts.pickPower : null),
    addLightAt: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown) => void; projectiles: unknown[] } }).entities = {
    add: () => {},
    projectiles: [],
  };
  return { hooks, store, player: pl, picks, sfx };
}
/** 出场落位：龟底贴地表行 100（y+h=1600），锚格 py=floor((y+h-15)/16)=99 */
function mkTurtle(hooks: GameHooks, player: Player, projId: 1098 | 1123): MinionProj {
  const m = new MinionProj(60 * 16 - 17, 100 * 16 - 34, projId, 0, 0, false, 0, false, () => player);
  m.noSlot = true;
  return m;
}

describe('②钻地龟行为（AI_204_Digtoise）', () => {
  it('出场态机：alphaFade 255 起 17t 淡入，180t 出场转 ai0=1（向下挖）+ 出场双声（tick1 summon/tick20 digtoise）', () => {
    const { hooks, player, sfx } = makeHooks();
    const m = mkTurtle(hooks, player, 1123);
    expect((m as unknown as { alphaFade: number }).alphaFade).toBe(255);   // SetDefaults alpha 255
    expect(m.digtoiseA0).toBe(0);
    m.fixedUpdate(1, hooks);
    expect(sfx).toContain('pal_summon');
    expect(m.digtoiseA0).toBe(0);
    for (let k = 0; k < 19; k++) m.fixedUpdate(1, hooks);
    expect(sfx).toContain('pal_digtoise');                                 // :39229 soundDelay==-20
    for (let k = 0; k < 200; k++) m.fixedUpdate(1, hooks);                 // 180t 出场窗
    expect(m.digtoiseA0).toBe(1);                                          // :39255-39258 ai[0]=1
  });
  it('持物品门（:39240-39246）：出场态未持 6174 → 首 tick 即灭；持对则活', () => {
    const { hooks, player } = makeHooks({ heldVid: 1112 });                // 手持别物
    const m = mkTurtle(hooks, player, 1123);
    m.fixedUpdate(1, hooks);
    expect(m.dead).toBe(true);
    const { hooks: h2, player: p2 } = makeHooks();
    const m2 = mkTurtle(h2, p2, 1123);
    m2.fixedUpdate(1, h2);
    expect(m2.dead).toBe(false);
  });
  it('向下挖（ai0=1）：蓄势 40t 后节拍采掘下方三格带（px-1..px+1,py+1），1098 镐力/伤钳 26/26', () => {
    const { hooks, player, picks } = makeHooks();
    const m = mkTurtle(hooks, player, 1098);
    m.digtoiseA0 = 1;                                                      // 直接入挖掘态（跳过出场窗）
    for (let k = 0; k < 75; k++) m.fixedUpdate(1, hooks);
    expect(picks.length).toBe(3);                                          // :39464-39472 三格带一轮
    const xs = picks.map((p) => p.x).sort((a, b) => a - b);
    const px = Math.floor((60 * 16) / 16);
    expect(xs).toEqual([px - 1, px, px + 1]);
    expect(picks.every((p) => p.y === 100)).toBe(true);                    // py(99)+1=100 地表行
    expect(picks.every((p) => p.pick === 26 && p.cap === 26)).toBe(true);  // :39473-39481 1098 档
  });
  it('1123 镐力/伤钳档：max(26,最佳镐)/36——bestPickaxePower 100 → pick 100 cap 36；无镐回落 26', () => {
    {
      const { hooks, player, picks } = makeHooks({ pickPower: 100 });
      const m = mkTurtle(hooks, player, 1123);
      m.digtoiseA0 = 1;
      for (let k = 0; k < 75; k++) m.fixedUpdate(1, hooks);
      expect(picks.length).toBe(3);
      expect(picks.every((p) => p.pick === 100 && p.cap === 36)).toBe(true); // :39476-39481
    }
    {
      const { hooks, player, picks } = makeHooks({ pickPower: null });
      const m = mkTurtle(hooks, player, 1123);
      m.digtoiseA0 = 1;
      for (let k = 0; k < 75; k++) m.fixedUpdate(1, hooks);
      expect(picks.every((p) => p.pick === 26 && p.cap === 36)).toBe(true);  // max(26,null??0)=26
    }
  });
  it('挖不动转离场（:39500-39503）：探到块全不可伤 → ai0=4，600t 离场窗后灭', () => {
    const { hooks, player } = makeHooks({ pickOk: false });                // PickTile damage 恒 0
    const m = mkTurtle(hooks, player, 1123);
    m.digtoiseA0 = 1;
    for (let k = 0; k < 75; k++) m.fixedUpdate(1, hooks);
    expect(m.digtoiseA0).toBe(4);                                          // probed>0 && damaged<probed
    for (let k = 0; k < 610; k++) m.fixedUpdate(1, hooks);                 // :39259-39260 600t 窗
    expect(m.dead).toBe(true);
  });
  it('抚摸支（:39207-39222）：被摸转 ai0=5 + pal_digtoise_joy 一声；停摸回出场态 0', () => {
    const { hooks, player, sfx } = makeHooks();
    const m = mkTurtle(hooks, player, 1123);
    player.petting.isPetting = true;
    m.beingPetted = true;
    m.fixedUpdate(1, hooks);
    expect(m.digtoiseA0).toBe(5);
    expect(sfx.filter((t) => t === 'pal_digtoise_joy')).toHaveLength(1);   // PalDigtoiseJoy 0.35
    player.petting.isPetting = false;                                      // 停摸
    m.fixedUpdate(1, hooks);
    expect(m.digtoiseA0).toBe(0);                                          // :39214-39219 回 0
  });
  it('挖掘帧通道：digFrame 直驱 draw 帧（0-2 出场 / 挖掘态入态钉帧 2）', () => {
    const { hooks, player } = makeHooks();
    const m = mkTurtle(hooks, player, 1123);
    expect((m as unknown as { digFrame: number }).digFrame).toBe(0);
    m.digtoiseA0 = 1;
    for (let k = 0; k < 60; k++) m.fixedUpdate(1, hooks);                  // 过蓄势入挖掘
    expect((m as unknown as { digFrame: number }).digFrame).toBeGreaterThanOrEqual(2); // :39375-39378
  });
});

// ---------------------------------------------------------------------------
// ③ 巨型提基 6147（tile 753）
// ---------------------------------------------------------------------------
describe('③巨型提基 6147（tile 753）', () => {
  it('v_753 def：3×3 framed + sheet 753 style 帧 + drop 6147（TileObjectData.cs:4126-4131 Style3x3 + WorldGen.cs:53723）', () => {
    const key = TILE_KEY_BY_SHEET.get(753);
    expect(key).toBe('v_753_gianttiki');
    const d = TILE_DEFS[TILE_BY_KEY[key!]];
    expect(d).toMatchObject({ w: 3, h: 3, framed: true, solid: false, drop: 6147 });
    expect(d.vanilla).toEqual({ sheet: 753, frame: 'style', fw: 3, fh: 3 });
  });
  it('素材在盘：Tiles_753.png（缺则登记不阻塞——本件在盘）', () => {
    expect(existsSync(join(ROOT, 'public/sprites/vanilla/Tiles_753.png'))).toBe(true);
  });
  it('物品链：6147 自动注册 def tile 反查 v_753 + rare1/value2500（Blue1/买25银）+ useTurn（放置族）', () => {
    const key = VANILLA_ITEM_KEY_BY_ID[6147];
    expect(key).toBe('vi_6147_GiantTiki');
    const def = ITEM_DEFS[ITEM_BY_KEY[key]];
    expect(def.tile).toBe('v_753_gianttiki');            // createTile 双源回填（vanilla.json 753）
    const rare = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-itemrare.json'), 'utf8'));
    const value = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-itemvalue.json'), 'utf8'));
    expect([rare['6147'], value['6147']]).toEqual([1, 2500]);   // Item.cs:47342-47343
    expect(itemCombat(6147)!.useTurn).toBe(true);               // DefaultToPlaceableTile 族 useTurn
  });
});

// ---------------------------------------------------------------------------
// ④ 亲缘桃 6191/6192（纯材料 + 五条 Trusty 升级链）
// ---------------------------------------------------------------------------
describe('④亲缘桃 6191/6192', () => {
  it('SetDefaults 语义：无 shoot/无 combat 数据（纯材料，Item.cs:47661-47669 仅 rare/value/18×18）', () => {
    expect(itemCombat(6191)).toBeNull();
    expect(itemCombat(6192)).toBeNull();
    const rare = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-itemrare.json'), 'utf8'));
    expect([rare['6191'], rare['6192']]).toEqual([5, 7]);       // Pink5 / Lime7
    expect(VANILLA_ITEM_KEY_BY_ID[6191]).toBe('vi_6191_PalworldLittleKinshipPeach');
    expect(VANILLA_ITEM_KEY_BY_ID[6192]).toBe('vi_6192_PalworldKinshipPeach');
  });
  it('配方链七条（Recipe.cs:10510-10533）：两桃合成 + 五条 Trusty 升级', () => {
    const byCreate = (vid: number) => VANILLA_RECIPES.filter((r) => r.create === vid);
    // 6191 小桃 = 桃 4293 ×1 + 光魂 520 ×12 + 暗魂 521 ×12 + 果组(17) + 书架 125（:10510-10516）
    const r6191 = byCreate(6191)[0];
    expect(r6191).toBeDefined();
    expect(r6191.tile).toBe(125);
    expect(r6191.items).toEqual([{ id: 4293, stack: 1 }, { id: 520, stack: 12 }, { id: 521, stack: 12 }]);
    expect(r6191.groups).toEqual([17]);
    // 6192 大桃 = 生命果 1291 ×1 + 双魂 ×12 + 书架 125（:10517-10520）
    const r6192 = byCreate(6192)[0];
    expect(r6192.items).toEqual([{ id: 1291, stack: 1 }, { id: 520, stack: 12 }, { id: 521, stack: 12 }]);
    // 升级链（:10521-10533）：5667+6191→6174 / 5665+6191→6150 / 5666+6191→6151 /
    // 5664+6192→6149 / 5663+6192→6148——全部徒手（tile -1）
    const up = (a: number, b: number, out: number): boolean => byCreate(out).some((r) =>
      r.tile === -1 && r.items.length === 2
      && r.items.some((i) => i.id === a && i.stack === 1)
      && r.items.some((i) => i.id === b && i.stack === 1));
    expect(up(5667, 6191, 6174)).toBe(true);   // 钻地龟 → 可靠的钻地龟
    expect(up(5665, 6191, 6150)).toBe(true);   // 疾旋鼬 → 可靠的疾旋鼬
    expect(up(5666, 6191, 6151)).toBe(true);   // 疾旋火鼬 → 可靠的疾旋火鼬
    expect(up(5664, 6192, 6149)).toBe(true);   // 火绒狐 → 可靠的火绒狐
    expect(up(5663, 6192, 6148)).toBe(true);   // 捣蛋猫 → 可靠的捣蛋猫
  });
  it('果组 17 含桃 4293（RecipeGroups.Fruit 成员表）+ 全材料物品注册在盘', () => {
    expect(RECIPE_GROUP_ITEMS['17']).toContain(4293);
    for (const v of [4293, 520, 521, 1291]) expect(VANILLA_ITEM_KEY_BY_ID[v], `vid ${v}`).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ⑤ 宝石法杖 6171（AllGems 出手链）
// ---------------------------------------------------------------------------
describe('⑤宝石法杖 6171', () => {
  it('itemCombat = DefaultToStaff(126,6,22,15)+SetWeaponValues(27,6) 展开（Item.cs:47551-47554）', () => {
    expect(itemCombat(6171)).toEqual({
      shoot: 126, useAnimation: 22, useTime: 22, shootSpeed: 6, mana: 15,
      damage: 27, knockBack: 6, noMelee: true, magic: true, autoReuse: true,
    });
    expect(VANILLA_ITEM_KEY_BY_ID[6171]).toBe('vi_6171_BejeweledStaff');
  });
  it('combatWeapon 分流 magic + PackGemStaffFeatures：126 BiggerHitbox ∪ 6171 AllGems 全特性位（Player.cs:49994-50002）', () => {
    const cw = combatWeapon({ key: VANILLA_ITEM_KEY_BY_ID[6171] });
    expect(cw?.kind).toBe('magic');
    expect((cw as unknown as { shoot: number }).shoot).toBe(126);
    expect((cw as unknown as { mana: number }).mana).toBe(15);
    const f = packGemStaffFeatures(126, undefined, 6171);
    expect(f.allGems).toBe(true);                      // HeldItem.type==6171（:50002）
    expect(f.biggerHitbox).toBe(true);                 // shoot==126（:50001）
    // ★AllGems 只追加四特性 Homing/CanBounce/AoeExplosion/FastThenSlow
    //  （Player.cs:49783-49790——SwirlTwins/ArPenSpread/BiggerHitbox 不加,本弹
    //  biggerHitbox 来自 shoot==126 臂 :50001）;此前期望 8 位全亮为误读
    expect(f).toEqual({
      biggerHitbox: true, allGems: true, aoeExplosion: true, canBounce: true,
      fastThenSlow: true, homing: true,
    });
    expect(gemDamageMultiplier(f)).toBe(1);            // AllGems 恒 1（Projectile.cs:167-169）
  });
  it('FinalizeProjectile_GemStaves AllGems 档：penetrate+2/armorPen+4/timeLeft 90（Projectile.cs:22285-22291）+ Arrow 消费', () => {
    const f = packGemStaffFeatures(126, undefined, 6171);
    expect(finalizeGemStaffStats(f, { penetrate: 1, armorPen: 0, timeLeft: 120 }))
      .toEqual({ penetrate: 3, armorPen: 4, timeLeft: 90 });
    const a = new Arrow(100, 100, 5, 0, 27, 6, 126,
      { grav: 0, life: 3600, pierce: 1, gem: f });
    expect((a as unknown as { life: number }).life).toBe(90);
    expect((a as unknown as { pierce: number }).pierce).toBe(3);
    expect((a as unknown as { armorPen: number }).armorPen).toBe(4);
  });
});
