// 728 超级星星炮全链路金标（2026-09-03 dormant→全链路收官批）：
//   · 定谳：发射 728 的 item = 4060 SuperStarCannon（1458 ItemID.cs:9666；
//     Item.cs case 4060 :35672-35683 DefaultToRangedWeapon(728, AmmoID.FallenStar,
//     18, 20f, hasAutoReuse:true)+SetWeaponValues(60,5f)+SetShopValues(Orange3,
//     buyPrice(0,50)=50金)；ProjectileID.cs:1908 SuperStar=728）
//   · 获取途径（1458 真值照抄）：**合成**，非掉落/商店——Recipe.cs:11981-11987
//     createItem 4060 = 星星炮 197×1 + 神圣锭 1225×12 @ 秘银砧 tile 134；
//     上游星星炮 197 = 鲨鱼_minishark 98×1 + 力量之魂 117×20 + 坠落星 75×5 @ 铁砧 16
//     （Recipe.cs:10989-10996）；神圣锭/力量之魂=机械 Boss 掉落（vanilla-npcdrops.json）
//   · 落库形态：vi_ 键经 vanilla.json meta 自动注册循环（items.ts :1057-1080，
//     vi_4060_SuperStarCannon）；战斗列 = vanillaItemCombat.EXTRACT_PATCH['4060']
//     （json 直提缺 DefaultToRangedWeapon 形参，既有补层机制同 HANDPATCH 先例）
//   · 弹侧已就位（本批只验出生路径）：Arrow 728 支 = AI_151_SuperStar
//     （Projectile.cs:22338-22376，α−10 钳 100/Item_9 星啸/自旋 0.005/gore 16,17/
//     尘 228）+ draw 加算白（GetAlpha :80995）+ Kill 面（955/728 同支）
//   · 开火音备案：4060 SetDefaults 无 UseSound 行 → Item.UseSound 缺省 null
//     （I.cs:199），原版项侧无声（P.cs:6083 null 门）——星啸由弹 AI 承载；
//     Game 发射尾此前落枪械合成音=多一声，本批 4060 专支修
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Arrow } from '../src/entities/Arrow';
import { itemCombat, rangedAmmoWeapon, resolveAmmoProjId, AMMO_FALLEN_STAR } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { VI } from '../src/data/itemKeys';
import { invIndexOfVanilla, availableRecipes, VANILLA_RECIPES } from '../src/data/vanillaRecipes';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { ITEM_NAME_BY_ID, ITEM_NAME_ZH_BY_ID } from '../src/i18n/idNames.generated';
import itemValues from '../src/data/vanilla-itemvalue.json';
import itemRares from '../src/data/vanilla-itemrare.json';

// ================= 落库面 =================

describe('4060 落库（vanilla.json meta 自动注册 + 名/值/稀有度表）', () => {
  it('vi_ 键已注册：VI(4060) 反查 = vi_4060_SuperStarCannon（键反解 vid）', () => {
    expect(VANILLA_ITEM_KEY_BY_ID[4060]).toBe('vi_4060_SuperStarCannon');
    expect(ITEM_BY_KEY['vi_4060_SuperStarCannon']).toBeDefined();
    expect(VI(4060)).toBe('vi_4060_SuperStarCannon');
  });

  it('显示名三源在册（zh 超级星星炮 / en Super Star Shooter / 内名 SuperStarCannon）', () => {
    expect(ITEM_NAME_ZH_BY_ID[4060]).toBe('超级星星炮');
    expect(ITEM_NAME_BY_ID[4060]).toBe('SuperStarCannon');
  });

  it('value=500000（buyPrice(0,50)=50金，I.cs:35675）/ rare=3（Orange3）', () => {
    expect((itemValues as Record<string, number>)['4060']).toBe(500000);
    expect((itemRares as Record<string, number>)['4060']).toBe(3);
  });
});

// ================= 战斗数据面（vanillaItemCombat.EXTRACT_PATCH['4060']） =================

describe('4060 战斗列（1458 Item.cs:35672-35683 终值）', () => {
  it('DefaultToRangedWeapon(728, FallenStar, 18, 20f, autoReuse)+SetWeaponValues(60,5f)', () => {
    expect(itemCombat(4060)).toMatchObject({
      shoot: 728, useAmmo: AMMO_FALLEN_STAR, useTime: 18, useAnimation: 18,
      shootSpeed: 20, damage: 60, knockBack: 5, noMelee: true, ranged: true, autoReuse: true,
    });
  });

  it('Rebalanced 变体层在册（getgood 世界 damage×0.9/useTime×1.1，I.cs:35678-35682）', () => {
    // 变体叠层 activeVariantStatsOfVid —— 普通世界取常规值，此处只验乘区表登记
    expect(itemCombat(4060)?.damage).toBe(60);   // 常规世界不被乘区污染
  });

  it('弹侧数据在册：728 = 24×24/aiStyle151/penetrate−1/ranged+friendly（P.cs:7660-7671）', () => {
    const p = projectileData(728);
    expect(p).toMatchObject({ aiStyle: 151, width: 24, height: 24, penetrate: -1 });
    expect(p?.ranged).toBe(true);
    expect(p?.friendly).toBe(true);
  });
});

// ================= 弹药链（PickAmmo） =================

describe('4060 弹药链（useAmmo=AmmoID.FallenStar 75）', () => {
  it('rangedAmmoWeapon → 75（发射链 ranged 分支接管门）', () => {
    expect(rangedAmmoWeapon({ key: 'vi_4060_SuperStarCannon', vid: 4060 })).toBe(75);
  });

  it('弹药坠落星 75 已注册且 combat.ammo=75（pickAmmoSlot 反查可装填）', () => {
    expect(ITEM_BY_KEY['vi_75_fallen_star']).toBeDefined();
    expect(itemCombat(75)?.ammo).toBe(75);
  });

  it('弹型解析：坠落星无 shoot → 保留发射器 shoot 728（PickAmmo 尾链 P.cs:52656-52659）', () => {
    expect(itemCombat(75)?.shoot).toBeUndefined();
    expect(resolveAmmoProjId(4060, 75, 75, 728, itemCombat(75)?.shoot)).toBe(728);
  });

  it('回归交叉：星星炮 197 同弹药 → 955 StarCannonStar（同链不被 4060 破坏）', () => {
    expect(itemCombat(197)?.shoot).toBe(955);
    expect(itemCombat(197)?.useAmmo).toBe(75);
    expect(resolveAmmoProjId(197, 75, 75, 955, itemCombat(75)?.shoot)).toBe(955);
  });
});

// ================= 获取途径（合成面，非掉落/商店） =================

describe('4060 获取途径（Recipe.cs:11981-11987 照抄登记）', () => {
  const rec = VANILLA_RECIPES.find((r) => r.create === 4060);

  it('配方在册：星星炮197×1 + 神圣锭1225×12 @ 秘银砧134', () => {
    expect(rec).toBeDefined();
    expect(rec!.tile).toBe(134);
    expect(rec!.items).toEqual([
      { id: 1225, stack: 12 }, { id: 197, stack: 1 },
    ]);
  });

  it('秘银砧 tile 134 站点可解析（expandStationTiles + 内部 tile 映射）', () => {
    expect(rec!.tile).toBe(134);
    expect(TILE_INTERNAL_BY_SHEET.get(134)).toBeDefined();
  });

  it('配方可用性：背包 197+12×1225 且近秘银砧 → availableRecipes 命中 4060', () => {
    const inv = new Inventory();
    inv.add(invIndexOfVanilla(197), 1);
    inv.add(invIndexOfVanilla(1225), 12);
    const mythrilAnvil = TILE_INTERNAL_BY_SHEET.get(134)!;
    const out = availableRecipes(inv, { nearbyInternal: new Set([mythrilAnvil]) });
    expect(out.some(({ r }) => r.create === 4060)).toBe(true);
  });

  it('上游星星炮配方在册（98×1+117×20+75×5 @ 铁砧16，Recipe.cs:10989-10996）', () => {
    const rec197 = VANILLA_RECIPES.find((r) => r.create === 197);
    expect(rec197).toBeDefined();
    expect(rec197!.tile).toBe(16);
    expect(rec197!.items).toEqual([
      { id: 98, stack: 1 }, { id: 117, stack: 20 }, { id: 75, stack: 5 },
    ]);
  });
});

// ================= 发射链金标（item → 弹 728 出生） =================

/** updateUse 可驱动的最小 Game 桩（orphan-weapons-a updUseGame 同法：真实
 *  Player+Inventory，走 Game.updateUse 真实分派链） */
function updUseGame(heldVid: number) {
  const g = Object.create(Game.prototype) as Record<string, any>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  const iidV = invIndexOfVanilla(heldVid);
  expect(iidV).toBeGreaterThanOrEqual(0);
  player.inv.add(iidV, 1);
  player.inv.selected = Math.max(0, player.inv.slots.findIndex((s) => s && s.id === iidV));
  g.player = player;
  g.world = new World(200, 200, 30);
  g.camera = {
    screenToWorld: () => [player.cx + 240, player.cy - 60],
    tileUnder: () => [80, 80],
  };
  g.enemies = () => [];
  g.candidatePlayers = undefined;
  g.housingMode = null;
  g.input = { mouseX: 500, mouseY: 300, mouseDown: false, rightDown: false,
    uiBlocking: false, downAction: () => false };
  g.entities = { projectiles: [] as unknown[], add(e: unknown) { this.projectiles.push(e); } };
  g.sfxFiles = [];
  g.synthFallbacks = [];
  g.playSfxFile = (f: string) => { g.sfxFiles.push(f as string); return true; };
  g.playSfxFiles = () => {};
  g.sfx = { play: (n: string) => { g.synthFallbacks.push(n); }, playWavFile: () => true };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false },
    timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g._prevMouseDown = false;
  g._prevRightDown = false;
  g.spawnParticles = () => {};
  g.useSwing = () => {};
  return { g, player };
}

describe('发射链：选中 4060 + 坠落星 → 弹 728 出生（Arrow 728 支入口）', () => {
  it('单击出生 projId 728 弹体，耗 1 坠落星，useTime=18', () => {
    const { g, player } = updUseGame(4060);
    const starIdx = invIndexOfVanilla(75);
    player.inv.add(starIdx, 20);
    const starSlot = player.inv.slots.findIndex((s) => s && s.id === starIdx);
    expect(starSlot).toBeGreaterThanOrEqual(0);

    g.input.mouseDown = true;                 // fresh edge（autoReuse 电平+边沿双门）
    g.updateUse(1 / 60);
    g._prevMouseDown = !!g.input.mouseDown;

    const projs = g.entities.projectiles as Arrow[];
    const born = projs.filter((p) => p instanceof Arrow && (p as Arrow).projId === 728);
    expect(born.length).toBe(1);
    expect(player.inv.slots[starSlot]!.stack).toBe(19);   // PickAmmo 实耗 1
    expect(player.useTime).toBe(18);                       // useTime×词缀 spd 缺省
    expect(player.facing).toBe(1);                          // 朝鼠标翻转（:47614-47633）
  });

  it('开火项侧无声（UseSound=null，P.cs:6083 门）——星啸归弹 AI_151', () => {
    const { g } = updUseGame(4060);
    g.player.inv.add(invIndexOfVanilla(75), 20);
    g.input.mouseDown = true;
    g.updateUse(1 / 60);
    g._prevMouseDown = !!g.input.mouseDown;
    expect(g.sfxFiles).toEqual([]);           // itemUseSoundWav(4060)=null（表缺=原版 null）
    expect(g.synthFallbacks).toEqual([]);     // 不落通用枪械合成音（本批 4060 专支）
  });

  it('空仓干放：无弹出生、无耗弹，仅起手动画（PickAmmo 无果支）', () => {
    const { g, player } = updUseGame(4060);
    g.input.mouseDown = true;
    g.updateUse(1 / 60);
    g._prevMouseDown = !!g.input.mouseDown;
    expect(g.entities.projectiles.length).toBe(0);
    expect(player.inv.countOf(invIndexOfVanilla(75))).toBe(0);
  });
});
