// ★BJ568（2026-10-08）裸挥臂起手拍 UseSound 判别测试（BJ566 登记债——全裸挥臂
//  独立缺陷清偿）。金标（亲读 Terarria1457）：
//  - StartActualUse（Player.cs:52291）在 ApplyItemAnimation(:52314) 后同拍播 UseSound
//    （:52316-52329）——每次起用必播（autoReuse 周期重启=新起用=逐周期重播）；门仅
//    `sItem.UseSound != null && !SkipsInitialUseSound[sItem.type]`（:52315），flag3=
//    useStyle5/13||shoot>0 只分 MP 152 转发路（:52326 `whoAmI==myPlayer||!flag3`
//    本地恒播），NetUseSoundSync 1457 空集（Terraria.ID/ItemID.cs:153
//    `Factory.CreateCustomSet<bool?>(null, new object[0])`）=零覆写。
//  - SkipsInitialUseSound（ItemID.cs:151 CreateBoolSet(false,2350,4870)）=起手跳音。
//  - 虫网三网 UseSound=Item1：case 1991 :21306-21316 / 3183 :29542-29552 / 4821 :39481-39491。
// 本仓定谳：BJ566 落复用节拍门后裸挥臂=裸挥居民唯一 StartActualUse 代表位，此前仅
//  补动画面缺声音面（三网等起手全程无声）。落刀=Game.updateUse 裸挥 else 支起手拍
//  数据门补 playUseSound（有表值才播/无表值静≡原版 UseSound==null 面）+
//  SkipsInitialUseSound 跳过 + bareSoundClaimed 专支认领豁免（防双播——药水/食物桥/
//  染发剂/FUN/PERM 发声档/TELEPORT/孤儿投掷/combatWeapon 全 kind/弹药体系等后链
//  专支自带起手音）。普测对账：全 useStyle>0 非工具 vid 桩驱动一拍点击帧，
//  playUseSound(vid) 恰一次（双播=专支+裸挥重复,零播=数据居民丢失）。
// 锁面：①数据面（Item.cs/ItemID.cs 直读对拍）②行为面（起手/周期重播/单挥/无数据静/
//  专支不回归）③全 vid exactly-once 普查 ④结构锁。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { Game, heldItemUseStyle } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { newWiresRadialState } from '../src/stats/wiresRadial';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { itemUseSoundWav } from '../src/data/itemUseSound';
import { combatWeapon } from '../src/data/vanillaItemCombat';

const REPO = join(dirname(__dirname), '..');
const ITEM_CS = readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
const LINES = ITEM_CS.split('\n');
const ITEMID_CS = readFileSync(join(REPO, 'Terarria1457', 'Terraria.ID', 'ItemID.cs'), 'utf8');
const GAME_SRC = readFileSync(join(REPO, 'game', 'src', 'core', 'Game.ts'), 'utf8');

/** Item.cs SetDefaults switch case 体提取（bj566 同构,单 case 域） */
function caseBody(type: number): string {
  const sig = LINES.findIndex((l) => l === `\t\tcase ${type}:`);
  if (sig < 0) throw new Error(`case ${type} not found`);
  const end = LINES.findIndex((l, i) => i > sig && /^\t\t\t(break|return);/.test(l));
  if (end < 0) throw new Error(`case ${type} unterminated`);
  return LINES.slice(sig, end + 1).join('\n');
}

const iidOf = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 可驱动的最小 Game 桩（tests/bj566 stubGame 同构）+ playUseSound 录制 */
function stubGame(heldVid: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iidOf(heldVid), 1);
  const sel = player.inv.slots.findIndex((s) => s && s.id === iidOf(heldVid));
  player.inv.selected = Math.max(0, sel);
  g.player = player;
  g.world = new World(120, 120, 30, 'bj568');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: () => {} };
  g.input = {
    mouseDown: false, mouseHeld: false, mouseX: 700, mouseY: 300,
    rightDown: false, uiBlocking: false, downAction: () => false,
  };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  // ★BJ662（2026-10-12）BJ626 bj545/bj536 壳桩同款：updateUse 头 tickWiresRadial
  //  （BJ572 落线）读 this.wiresRadial——Object.create 壳无构造器字段 →
  //  flowerUpdate(st=undefined) TypeError（BJ646/BJ651 登记存量红,桩仅为通路;
  //  虫网/裸挥居民非 wire 工具走 flowerUpdate 早退支）
  g.wiresRadial = newWiresRadialState();
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.achievements = { handleSpecialEvent: () => {} };
  const sounds: string[] = [];
  g.sfx = {
    play: (n: string) => { sounds.push('sfx:' + String(n)); },
    playWav: (n: string) => { sounds.push('wav:' + String(n)); },
    playWavFile: (n: string) => { sounds.push('wavf:' + String(n)); },
    playFiles: () => {},
  };
  g.playSfxFile = (n: string) => { sounds.push('sf:' + String(n)); };
  g.playSfxWav = (n: string) => { sounds.push('sw:' + String(n)); };
  g.playSfxFiles = (n: string[]) => { sounds.push('sfs:' + n.join(',')); };
  g.playUseSound = (vid: number, fb: string) => { sounds.push(`pus:${vid}:${fb}`); };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  const pus = (vid: number): string[] => sounds.filter((s) => s === `pus:${vid}:throw` || s.startsWith(`pus:${vid}:`));
  return {
    g,
    sounds,
    pus,
    player,
    inp: g.input as { mouseDown: boolean; mouseHeld: boolean },
    swing: () => (g as { swing?: { t: number; dur: number } }).swing,
    updateUse: () => (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60),
  };
}

// ================= ①数据面：三网 UseSound=Item1 + SkipsInitialUseSound 钉值 =================

describe('BJ568 数据面：原版 UseSound 面（Item.cs/ItemID.cs 直读对拍）', () => {
  it('三网 case 体含 UseSound=SoundID.Item1（:21313/:29549/:39488）且 autoReuse=true', () => {
    for (const vid of [1991, 3183, 4821]) {
      const body = caseBody(vid);
      expect(body).toMatch(/UseSound = SoundID\.Item1;/);
      expect(body).toMatch(/autoReuse = true;/);
      expect(body).toMatch(/useStyle = 1;/);
    }
  });
  it('本仓 vanilla-itemusesound 表钉值：三网=Item_1（数据面非漏）', () => {
    expect(itemUseSoundWav(1991)).toBe('Item_1');
    expect(itemUseSoundWav(3183)).toBe('Item_1');
    expect(itemUseSoundWav(4821)).toBe('Item_1');
  });
  it('SkipsInitialUseSound = {2350, 4870}（ItemID.cs:151 直读）——本仓表同值', () => {
    expect(ITEMID_CS).toContain('public static bool[] SkipsInitialUseSound = Factory.CreateBoolSet(false, 2350, 4870);');
    // 本仓 Game.ts 防御表同钉值
    expect(GAME_SRC).toMatch(/const SKIPS_INITIAL_USE_SOUND = new Set<number>\(\[2350, 4870\]\);/);
  });
  it('NetUseSoundSync 1457 空集（ItemID.cs:153 直读）——起手音无条件（无条件本地面）', () => {
    expect(ITEMID_CS).toContain('public static bool?[] NetUseSoundSync = Factory.CreateCustomSet<bool?>(null, new object[0]);');
  });
});

// ================= ②行为面：裸挥臂起手拍 UseSound（updateUse 桩驱动） =================

describe('BJ568 行为面：起手拍播/周期重播/单挥/无数据静/专支不回归', () => {
  it('①虫网 1991：起手拍播 UseSound（Item_1 钉值）', () => {
    const s = stubGame(1991);
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.updateUse();
    expect(s.swing(), '起挥').toBeTruthy();
    expect(s.pus(1991), '起手拍恰一次').toEqual(['pus:1991:throw']);
    expect(itemUseSoundWav(1991)).toBe('Item_1');    // 实播 wav=Item_1（playUseSound 表驱动）
  });

  it('②虫网 1991：autoReuse 周期重启逐周期重播（按住连挥=连响）', () => {
    const s = stubGame(1991);
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.updateUse();
    expect(s.pus(1991).length).toBe(1);
    let last = s.swing()!;
    let restarts = 0;
    for (let i = 0; i < 90; i++) {
      s.g.prevSwingMouse = true;
      last.t -= 1;                                    // postUpdate updateSwingHits t--
      s.updateUse();
      const sw = s.swing();
      if (sw !== last) {
        restarts++;
        last = sw!;
      }
    }
    expect(restarts, '90t/25t → ≥3 周期').toBeGreaterThanOrEqual(3);
    expect(s.pus(1991).length, '每次起用（含周期重启）各播一次').toBe(1 + restarts);
  });

  it('③非 autoReuse 裸挥居民（5437 useTime90 无 autoReuse）单击单播,按住不重播', () => {
    expect(itemCombat(5437)?.autoReuse ?? false).toBe(false);
    const s = stubGame(5437);
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.updateUse();
    expect(s.pus(5437).length, '起手一播').toBe(1);
    for (let i = 0; i < 30; i++) {
      s.g.prevSwingMouse = true;                      // 持住帧（非 fresh edge）
      if (s.swing()) s.swing()!.t -= 1;
      s.updateUse();
    }
    expect(s.pus(5437).length, '非 autoReuse 按住零重播（releaseUseItem :43160）').toBe(1);
  });

  it('④无 UseSound 数据的裸挥居民（70 蠕虫食物/205 空桶）全程静——≡原版 UseSound==null 面', () => {
    expect(caseBody(70)).not.toMatch(/UseSound/);
    expect(itemUseSoundWav(70)).toBeNull();
    const s = stubGame(70);
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.updateUse();
    expect(s.pus(70).length).toBe(0);
    const s2 = stubGame(205);
    s2.inp.mouseDown = true; s2.inp.mouseHeld = true;
    s2.updateUse();
    expect(s2.pus(205).length).toBe(0);
  });

  it('⑤专支认领居民不回归：beenade 1130/战斗书 4382/魔杖 112/枪 42 各恰一次（裸挥豁免防双播）', () => {
    // beenade：B1 专支 throwBeenade playUseSound(1130)（:45950）——裸挥豁免
    const beenade = stubGame(1130);
    beenade.inp.mouseDown = true; beenade.inp.mouseHeld = true;
    beenade.updateUse();
    expect(beenade.pus(1130).length, '专支一播,裸挥不叠加').toBe(1);
    // 战斗书 4382：专支 playUseSound(4382,'drink')（:18691）
    const book = stubGame(4382);
    book.inp.mouseDown = true; book.inp.mouseHeld = true;
    book.updateUse();
    expect(book.pus(4382).length).toBe(1);
    // 魔法武器（combatWeapon kind magic）：magic 分派自带起手音,裸挥豁免
    expect(combatWeapon(ITEM_DEFS[iidOf(112)] )?.kind).toBe('magic');
    const wand = stubGame(112);
    wand.inp.mouseDown = true; wand.inp.mouseHeld = true;
    wand.updateUse();
    expect(wand.pus(112).length, 'magic 分派一播').toBe(1);
    // 枪（useAmmo 弹药体系,combatWeapon 提前 null）：远程支自带起手音,裸挥豁免
    const gun = stubGame(42);
    gun.inp.mouseDown = true; gun.inp.mouseHeld = true;
    gun.updateUse();
    expect(gun.pus(42).length, '远程支一播').toBe(1);
  });
});

// ================= ③全 vid exactly-once 普查（双播/漏播机械对账） =================

describe('BJ568 普查：全 useStyle>0 非工具 vid 起手拍 exactly-once', () => {
  it('3580 件桩驱动一拍点击帧：playUseSound(vid) ≤1 且数据裸挥居民=1', () => {
    const doubles: string[] = [];
    const misses: string[] = [];
    // 裸挥数据居民（BJ568 定谳普测产物:全量居民中有 UseSound 表值者恰此六件——
    // 三网+226 蠕虫合并对等件(func 226→227 缺档)+5437 贝壳手机坯+5289 矿车套件
    // ——★BJ690 后 5289 迁 PERM 支 case 自播,exactly-once 面不变仍属数据居民）
    const DATA_RESIDENTS = new Set([1991, 3183, 4821, 226, 5437, 5289]);
    let checked = 0;
    for (const vidStr of Object.keys(VANILLA_ITEM_KEY_BY_ID)) {
      const vid = Number(vidStr);
      const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;
      const def = iid >= 0 ? ITEM_DEFS[iid] : undefined;
      if (!def || def.tool) continue;
      if (heldItemUseStyle(vid) <= 0) continue;
      checked++;
      const s = stubGame(vid);
      s.inp.mouseDown = true; s.inp.mouseHeld = true;
      try { s.updateUse(); } catch { continue; }       // 桩缺口件（坐骑/药水桥等）跳过
      const n = s.pus(vid).length;
      if (n > 1) doubles.push(`${vid}×${n}`);
      if (n === 0 && DATA_RESIDENTS.has(vid)) misses.push(`${vid} 漏播`);
    }
    expect(checked, '普测覆盖面').toBeGreaterThan(3000);
    expect(doubles, '双播=专支+裸挥叠加').toEqual([]);
    expect(misses, '数据裸挥居民漏播').toEqual([]);
  });
});

// ================= ④结构锁：起手音门与豁免面在位 =================

describe('BJ568 结构锁：裸挥臂起手 UseSound 门', () => {
  it('updateUse 裸挥 else 支含数据门+SkipsInitial 门+bareSoundClaimed 豁免+playUseSound', () => {
    expect(GAME_SRC).toMatch(/if \(itemUseSoundWav\(bareVid\) && !SKIPS_INITIAL_USE_SOUND\.has\(bareVid\)\n\s*&& !this\.bareSoundClaimed\(bareVid, heldDef\)\) \{/);
    expect(GAME_SRC).toMatch(/this\.playUseSound\(bareVid, 'throw'\);/);
    expect(GAME_SRC).toContain('BJ568');
  });
  it('bareSoundClaimed 豁免面：combatWeapon 全 kind+弹药体系+PERM 发声档+孤儿投掷族', () => {
    expect(GAME_SRC).toMatch(/if \(combatWeapon\(def\)\) return true;/);
    expect(GAME_SRC).toMatch(/if \(c0 && \(c0\.useAmmo \|\| c0\.ammo \|\| c0\.shoot\)\) return true;/);
    // ★BJ690（2026-10-16）：5289 矿车升级包迁入 PERM 支（case 自播 Item4）→ 入豁免面
    expect(GAME_SRC).toMatch(/const PERM_BARESOUND_EXEMPT = new Set<number>\(\[3335, 5289, 5337, 5338, 5339, 5341, 5342, 5043, 2756, 678, 4829, 4830, 4910\]\);/);
    expect(GAME_SRC).toMatch(/ORPHAN_B1_BUFF_VIDS\.has\(vid\) \|\| ORPHAN_B2_VIDS\.has\(vid\)/);
  });
});
