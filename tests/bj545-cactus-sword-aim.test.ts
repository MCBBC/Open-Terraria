// ★BJ545（2026-10-07）用户实报「仙人掌剑不会跟随光标在角色的朝向而改变，但铜短剑正常」
// 定谳＝销案：原版本相，本仓 1:1 零差异可修。
//
// 金标（Terarria1457 反编译亲读）：
//  - 仙人掌剑 881 SetDefaults（Item.cs:11628-11640）：useStyle 1 / useTurn=false /
//    useAnimation 30 / useTime 30 / damage 10 / knockBack 4.5 / scale 1 / melee=true /
//    【无 shoot 行】——纯挥砍阔剑，shoot=0。1.4.4 短剑 stab 重做未覆盖仙人掌剑
//    （1458 增量 SetDefaults 零变更，1457 即终态）。
//  - 1.4 短剑 stab 化范围 = SetDefaults1(6) 短剑模板（Item.cs:1454-1470：useStyle 13 /
//    useAnimation 12 / useTime 12 / shoot 940 / shootSpeed 2.1 / noMelee / autoReuse
//    false / width 50 height 18）调用面全 8 件：6 铁短剑（模板原生 940）/ 3483 铂
//    （945/10/10）/ 3489 钨（943/11/11）/ 3495 铅（941/12/12）/ 3501 锡（939/12/12）/
//    3507 铜（938/13/13）/ 3513 银（942/12/12）/ 3519 金（944/11/11）；弹 938-945
//    全部落 Projectile.DefaultToShortsword（Projectile.cs:8919-8921 → aiStyle 161）。
//    木剑 24 / 铁阔剑 4 / 铜阔剑 3508 / 仙人掌剑 881 均 SetDefaults1(4)/inline 挥砍
//    模板（useStyle 1），不在 stab 化范围。真铜短剑 5669 = 独立掷剑（shoot 1100，
//    Item.cs:44547-44564），shoot>0 仍属面向面。
//  - 面向语义（BJ463 同源锚）：唯 shoot>0 件点击面向光标（ItemCheck_Shoot 调用门
//    Player.cs:43902-43904 `(sItem.shoot > 0) & flag4` + Dot 门 :47625-47634）；
//    shoot=0 件点击零转向（镐/斧/锤/阔剑同族）。⇒ 原版仙人掌剑点击【不】面向光标、
//    铜短剑【面向】——用户观察到的差异正是原版本相（铜短剑吃 1.4.4 stab 重做，
//    仙人掌剑没吃），按 1:1 纪律不修。
// 本仓对拍（src/data/vanilla-itemcombat.json，recon-item 闸门域 DRIFT=0）：
//  - 881 = {damage 10, knockBack 4.5, 30/30, scale 1, melee, useTurn false} 无 shoot
//    =与 Item.cs case 881 逐字段同相；combatWeapon(881) → kind 'melee'（melee 且
//    无 noMelee）→ 挥击支正常起手；
//  - BJ463 双门（tryFaceHeldAim `(c?.shoot ?? 0)>0` Game.ts:14282-14283 + 挥击起手
//    `(cwMelee?.shoot ?? 0)>0` Game.ts:15373-15375）对 881 恒闭 = 点击零转向。
// 判别面（本测试钉死，两向爆红）：
//  ① 881 起手挥击（useTime>0 排除分支未进假绿）但朝向不动——未来任何一刀把面向
//    误植 shoot=0 阔剑面（BJ463 旧病复发）即红；
//  ② stab 短剑 8 件 shoot 表钉值 + 逐件点击面向——未来漏 stab 化短剑（shoot 缺失）
//    或双门漏接即红。
import { describe, it, expect } from 'vitest';

import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { newWiresRadialState } from '../src/stats/wiresRadial';

const iidOf = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 直驱最小 Game 桩（bj463 stubGame 同款 + options（挥击支 autoReuse 全局
 *  档读 options.data）——881 首次把 BJ463 桩开进挥剑分支） */
function stubGame(heldVid: number, mouseWorld: [number, number], facing: -1 | 1, tile: [number, number] = [60, 60]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iidOf(heldVid), 1);
  const sel = player.inv.slots.findIndex((s) => s && s.id === iidOf(heldVid));
  player.inv.selected = Math.max(0, sel);
  player.facing = facing;
  g.player = player;
  g.world = new World(120, 120, 30, 'bj545');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: () => {} };
  g.input = {
    mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300,
    rightDown: false, uiBlocking: false, downAction: () => false,
  };
  g.camera = {
    tileUnder: () => tile,
    screenToWorld: () => mouseWorld,
    x: 800, y: 0,
  };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  // ★BJ626（2026-10-10）BJ600 补 bj536 壳桩同款：updateUse 头 tickWiresRadial
  //  （BJ572 落线）读 this.wiresRadial——Object.create 壳无构造器字段 →
  //  flowerUpdate(st=undefined) TypeError（既有红,与本刀语义无关,补桩复绿;
  //  881/短剑族非 wire 工具走 flowerUpdate 早退支,桩仅为通路）
  g.wiresRadial = newWiresRadialState();
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.options = { data: {} };
  g.sfx = { play: () => {}, playWav: () => {}, playWavFile: () => {}, playFiles: () => {} };
  g.playSfxFile = () => {};
  g.playSfxWav = () => {};
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.newText = () => {};
  g.recLog = () => {};
  return {
    g, player,
    run: () => (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60),
  };
}

/** 光标世界位：玩家中心 cx=810，右侧取 1200 / 左侧取 400 */
const RIGHT: [number, number] = [1200, 500];
const LEFT: [number, number] = [400, 500];
const TILE_RIGHT: [number, number] = [60, 60];
const TILE_LEFT: [number, number] = [40, 60];

// ============ 定谳①：仙人掌剑 881 族归属（Item.cs:11628-11640 逐字段钉值）============
describe('BJ545 数据面：仙人掌剑 881 = useStyle1 挥砍阔剑（无 shoot，stab 化未覆盖）', () => {
  it('vanilla-itemcombat 881 与 Item.cs case 881 逐字段同相（无 shoot = 面向门恒闭）', () => {
    const c = itemCombat(881);
    expect(c).not.toBeNull();
    expect(c!.shoot ?? 0).toBe(0);          // Item.cs:11628-11640 无 shoot 行—— stab 面闸根
    expect(c!.useTime).toBe(30);            // :11631
    expect(c!.useAnimation).toBe(30);       // :11632
    expect(c!.damage).toBe(10);             // :11634
    expect(c!.knockBack).toBe(4.5);         // :11635
    expect((c as unknown as { scale?: number }).scale).toBe(1); // :11638（json 有值,ItemCombat 类型面无 scale 键）
    expect(c!.melee).toBe(true);            // :11640
    expect(c!.useTurn).toBe(false);         // :11630——挥动中移动键亦锁向（非 useTurn 族）
    expect(c!.noMelee ?? false).toBe(false);// 非 stab 体（stab 模板 noMelee=true）
    expect(c!.noUseGraphic ?? false).toBe(false);
  });
});

// ============ 定谳②：行为判别——881 点击零转向（原版本相，两向爆红）============
describe('BJ545 行为面：仙人掌剑点击零转向（shoot=0 阔剑无点击面向，原版 census 锁）', () => {
  it('881 面朝左、点身位右侧：挥击起手照常（useTime>0）但朝向保持 -1（判别——误植面向即红）', () => {
    const s = stubGame(881, RIGHT, -1);
    s.run();
    // 挥击确实起手（useTime=30）——排除「分支没进」假绿
    expect(s.player.useTime).toBeGreaterThan(0);
    // 原版：shoot=0 无点击面向（ItemCheck_Shoot 调用门 :43902 `(sItem.shoot>0)&flag4` 恒不进）
    expect(s.player.facing).toBe(-1);
  });
  it('881 面朝右、点身位左侧：不转向（镜像对称）', () => {
    const s = stubGame(881, LEFT, 1, TILE_LEFT);
    s.run();
    expect(s.player.useTime).toBeGreaterThan(0);
    expect(s.player.facing).toBe(1);
  });
});

// ============ 定谳③：stab 短剑全集普查（SetDefaults1(6) 调用面 8 件 + 5669）============
// 金标 shoot 表：Item.cs:1463（模板 940）/ :31413（3507→938）/ :31641-31659 等逐件覆写
const STAB_SHORTSWORDS: ReadonlyArray<readonly [vid: number, shoot: number]> = [
  [6, 940],     // 铁短剑 = SetDefaults1(6) 模板原生（Item.cs:1456-1470）
  [3483, 945],  // 铂短剑（:31641-31651，10/10 dmg13）
  [3489, 943],  // 钨短剑（:31582-31592，11/11 dmg10）
  [3495, 941],  // 铅短剑（:31523-31533，12/12 dmg9）
  [3501, 939],  // 锡短剑（:31465-31475，12/12 dmg7）
  [3507, 938],  // 铜短剑（:31406-31416，13/13 dmg5）
  [3513, 942],  // 银短剑（:31348-31358，12/12 dmg9）
  [3519, 944],  // 金短剑（:31290-31300，11/11 dmg12）
];

describe('BJ545 同族普查：stab 短剑 8 件 shoot 全表钉值（漏 stab 化/数据回滚即红）', () => {
  it.each(STAB_SHORTSWORDS)('短剑 %i shoot=%i：stab 族归属四件套（shoot/noMelee/noUseGraphic/非autoReuse）', (vid, shoot) => {
    const c = itemCombat(vid);
    expect(c).not.toBeNull();
    expect(c!.shoot).toBe(shoot);              // SetDefaults1(6)+逐件覆写（弹 938-945 aiStyle 161）
    expect(c!.shoot).toBeGreaterThan(0);       // BJ463 双门放行面
    expect(c!.noMelee).toBe(true);             // 短剑模板 Item.cs:1467
    expect(c!.noUseGraphic).toBe(true);        // 短剑模板（1457 终值）
    expect(c!.autoReuse ?? false).toBe(false); // 短剑模板 Item.cs:1455
    expect(c!.shootSpeed).toBe(2.1);           // 短剑模板 Item.cs:1466
  });
  it('真铜短剑 5669：shoot=1100（Item.cs:44556 掷剑，shoot>0 仍属面向面）', () => {
    const c = itemCombat(5669);
    expect(c).not.toBeNull();
    expect(c!.shoot).toBe(1100);
  });
  it('挥砍对照组：仙人掌剑 881/木剑 24/铁阔剑 4/铜阔剑 3508 全员 shoot=0（stab 化范围外）', () => {
    for (const vid of [881, 24, 4, 3508]) {
      expect(itemCombat(vid)?.shoot ?? 0).toBe(0);
    }
  });
});

describe('BJ545 同族普查（行为面）：stab 短剑 8 件逐件点击面向光标（BJ463 门全数生效）', () => {
  it.each(STAB_SHORTSWORDS)('短剑 %i 面朝左、点身位右侧：面向光标（facing -1→1）', (vid) => {
    const s = stubGame(vid, RIGHT, -1);
    s.run();
    expect(s.player.facing).toBe(1);
  });
});

// ============ 定谳④：铜短剑不回归（BJ463 主判别件复钉）============
describe('BJ545 回归锁：铜短剑 3507 点击面向光标（BJ463 判例同相）', () => {
  it('3507 面朝左、点身位右侧：面向光标', () => {
    const s = stubGame(3507, RIGHT, -1);
    s.run();
    expect(s.player.facing).toBe(1);
  });
});
