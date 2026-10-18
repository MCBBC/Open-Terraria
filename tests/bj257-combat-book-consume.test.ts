// ★BJ257（2026-09-21）用户实报「先进战斗技术：卷二用了不消失」定谳修复回归。
// 金标：
//  - Terarria1457 Item.cs SetDefaults case 5336 :42327-42336 / case 4382 :37288-37297——
//    **consumable = true**（:42329/:37290）+ useStyle 4 + useTime=useAnimation=45 +
//    UseSound Item92（:42332/:37293）。旧注「不消耗（ApplyItemTime 仅冷却）」系误读：
//    消耗不走 ApplyItemTime 自身，走 ItemCheck 通用段同拍判定
//    （Player.cs:43612 `itemTimeMax!=0 && itemTime==itemTimeMax && item.consumable`
//    → :43651 stack--；CanConsumeConsumableItem 恒 true :5488-5491；5336 无
//    ForceConsumption/SkipsInitialUseSound 覆写）→ 原版两卷书使用即消耗。
//  - 效果面 = Player.cs:45707-45735（1456 旧锚 44703-44730）ItemCheck_UseCombatBook：
//    旗标未置位 → ApplyItemTime(45) + NPC.combatBook*WasUsed=true + 世界公告
//    （ChatColors.World）；旗标已置位 → 效果支整段跳过（itemTime=0 → 通用消耗门
//    永不触发）= **惰性书不耗**，但起手面（ApplyItemAnimation + UseSound,
//    ItemCheck_StartActualUse :52291-52314）每次点击照播照响。
//  - 城镇 NPC 增益 = 1457 NPC.cs:53568-53581（每本 lifeMax+250/防+8/伤×0.8/速+0.25）。
// 修复面：Game.ts 战斗书支（bvid 4382/5336）——补 useSwing+playUseSound 起手面、
//    useTime 30→45、门内补 removeHeld(1)（卷一同支同漏一并修）。
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { newWiresRadialState } from '../src/stats/wiresRadial';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { itemUseSoundWav } from '../src/data/itemUseSound';
import funcJson from '../src/data/vanilla-itemfunc.json';
import combatJson from '../src/data/vanilla-itemcombat.json';
import usesoundJson from '../src/data/vanilla-itemusesound.json';
import zhHans from '../public/l10n/zh-Hans.json';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const REPO = join(dirname(__dirname), '..');
const ITEM_CS = existsSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs')) ? readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const LINES = ITEM_CS.split('\n');

/** Item.cs case 块截取（自 `case N:` 行起至 `break;` 止——BJ69 提取器同式） */
function caseBlock(vid: number): string[] {
  const start = LINES.findIndex((l) => l.trim() === `case ${vid}:`);
  expect(start, `case ${vid} 在 Item.cs`).toBeGreaterThan(0);
  const out: string[] = [];
  for (let i = start; i < LINES.length; i++) {
    out.push(LINES[i]);
    if (LINES[i].trim() === 'break;') break;
  }
  return out;
}

// ============ ① 原版锚（反编译直读——数据面漂移哨兵） ============
describe.skipIf(EXT_MISSING)('BJ257 原版锚：Item.cs case 5336/4382 消耗面直读', () => {
  it('5336 卷二：consumable=true + useStyle 4 + 45/45 + Item92（:42327-42336）', () => {
    const b = caseBlock(5336);
    expect(b.join('\n')).toContain('consumable = true;');
    expect(b.join('\n')).toContain('useStyle = 4;');
    expect(b.join('\n')).toContain('useAnimation = 45;');
    expect(b.join('\n')).toContain('useTime = 45;');
    expect(b.join('\n')).toContain('UseSound = SoundID.Item92;');
  });
  it('4382 卷一：consumable=true（:37288-37297）——卷一同支同漏一并修', () => {
    const b = caseBlock(4382);
    expect(b.join('\n')).toContain('consumable = true;');
    expect(b.join('\n')).toContain('useStyle = 4;');
    expect(b.join('\n')).toContain('useTime = 45;');
  });
  it('仓内数据面三表同相（itemfunc/itemcombat/usesound）', () => {
    for (const vid of [4382, 5336]) {
      const f = itemFuncOfVid(vid);
      expect(f?.consumable, `${vid} itemfunc.consumable`).toBeTruthy();
      expect(f?.useStyle, `${vid} itemfunc.useStyle`).toBe(4);
      expect(itemCombat(vid)?.consumable, `${vid} combat.consumable`).toBe(true);
      expect(itemCombat(vid)?.useTime, `${vid} combat.useTime`).toBe(45);
      expect(itemCombat(vid)?.useAnimation, `${vid} combat.useAnimation`).toBe(45);
      expect(itemUseSoundWav(vid), `${vid} UseSound`).toBe('Item_92');
      expect((funcJson as Record<string, Record<string, unknown>>)[String(vid)]).toBeDefined();
      expect((combatJson as Record<string, Record<string, unknown>>)[String(vid)]).toBeDefined();
      expect((usesoundJson as Record<string, string>)[String(vid)]).toBe('Item_92');
    }
  });
  it('效果面文案键在库（Misc.CombatBookUsed / Misc.CombatBookVolumeTwoUsed）', () => {
    const misc = (zhHans as Record<string, Record<string, string>>).Misc;
    expect(misc.CombatBookUsed).toBeTruthy();
    expect(misc.CombatBookVolumeTwoUsed).toBeTruthy();
  });
});

// ============ ② 行为面（updateUse 直驱——bj69 桩惯例） ============
const iidOf = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 可驱动的最小 Game 桩（blue-r2-fixes casterGame / bj69 stubGame 惯例） */
function stubGame(heldVid: number, opts?: { withNpc?: boolean }) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iidOf(heldVid), 1);
  const sel = player.inv.slots.findIndex((s) => s && s.id === iidOf(heldVid));
  player.inv.selected = Math.max(0, sel);
  const sfxCalls: string[] = [];
  const record = (k: string) => () => { sfxCalls.push(k); };
  const texts: string[] = [];
  g.player = player;
  g.world = new World(120, 120, 30, 'bj257');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: () => {} };
  if (opts?.withNpc) {
    const npc = new TownNPC('guide', 52 * TILE, 88 * TILE, new Inventory());
    (g.entities as { npcs: unknown[] }).npcs.push(npc);
  }
  g.input = { mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  // ★BJ662（2026-10-12）BJ626 bj545/bj536 壳桩同款：updateUse 头 tickWiresRadial
  //  （BJ572 落线）读 this.wiresRadial——Object.create 壳无构造器字段 →
  //  flowerUpdate(st=undefined) TypeError（BJ646/BJ651 登记存量红,桩仅为通路;
  //  书卷族非 wire 工具走 flowerUpdate 早退支）
  g.wiresRadial = newWiresRadialState();
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.sfx = { play: record('play'), playWav: record('playWav'), playWavFile: record('playWavFile'), playFiles: record('playFiles') };
  g.playSfxFile = (wav: string) => { sfxCalls.push(wav); };
  g.playSfxWav = record('playSfxWav');
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.newText = (t: string) => { texts.push(t); };
  g.recLog = () => {};
  return {
    g, player, sfxCalls, texts,
    heldSlot: sel,
    inv: player.inv,
    world: g.world as World,
    npc: opts?.withNpc ? ((g.entities as { npcs: TownNPC[] }).npcs[0]) : undefined,
    run: () => (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60),
  };
}

describe.skipIf(EXT_MISSING)('BJ257 行为面：卷二 5336 使用 → 效果生效 + 消耗 1（消耗面钉值）', () => {
  it('首次使用：旗标置位 + stack 1→0 + useTime=45 + 举持起挥 + Item_92 + 世界公告', () => {
    const s = stubGame(5336);
    s.run();
    expect(s.world.flags.combatBookVolumeTwoWasUsed).toBe(true);
    expect(s.inv.slots[s.heldSlot]?.stack ?? 0).toBe(0);          // 消耗面（旧刀缺 removeHeld）
    expect(s.player.useTime).toBe(45);                            // ApplyItemTime(useTime 45)（旧 30 无据）
    expect((s.g as Record<string, unknown>).swing).toBeDefined(); // useStyle 4 举持（起手面）
    expect(s.sfxCalls).toContain('Item_92');                      // UseSound
    expect(s.texts.length).toBe(1);                               // 世界公告 Misc.CombatBookVolumeTwoUsed
    // Lang 在 vitest 环境缺 l10n 箱时回传键名（passthrough）——两形态都认
    expect([`Misc.CombatBookVolumeTwoUsed`,
      (zhHans as Record<string, Record<string, string>>).Misc.CombatBookVolumeTwoUsed]).toContain(s.texts[0]);
  });
  it('城镇 NPC 立即吃到增益（NPC.cs:53575-53581 → applyCombatBook +250）', () => {
    const s = stubGame(5336, { withNpc: true });
    const hp0 = s.npc!.maxHp;
    s.run();
    expect(s.npc!.maxHp).toBe(hp0 + 250);
  });
  it('惰性书（旗标已置位）：再点照播照响但零消耗零计时（:45722 门 → itemTime=0）', () => {
    const s = stubGame(5336);
    s.world.flags.combatBookVolumeTwoWasUsed = true;
    s.run();
    expect(s.inv.slots[s.heldSlot]?.stack ?? 0).toBe(1);   // 不消耗（通用消耗门永不触发）
    expect(s.player.useTime).toBe(0);                       // 无 ApplyItemTime
    expect((s.g as Record<string, unknown>).swing).toBeDefined();  // 起手面照播（StartActualUse）
    expect(s.sfxCalls).toContain('Item_92');                // 照响
    expect(s.texts.length).toBe(0);                         // 无公告
  });
});

describe.skipIf(EXT_MISSING)('BJ257 行为面：卷一 4382 同消耗面（同支同漏）', () => {
  it('首次使用：combatBookWasUsed 置位 + stack 1→0 + useTime=45', () => {
    const s = stubGame(4382);
    s.run();
    expect(s.world.flags.combatBookWasUsed).toBe(true);
    expect(s.inv.slots[s.heldSlot]?.stack ?? 0).toBe(0);
    expect(s.player.useTime).toBe(45);
    expect([`Misc.CombatBookUsed`,
      (zhHans as Record<string, Record<string, string>>).Misc.CombatBookUsed]).toContain(s.texts[0]);
  });
  it('惰性书（旗标已置位）：零消耗（4382 旗与 5336 旗互不串）', () => {
    const s = stubGame(4382);
    s.world.flags.combatBookWasUsed = true;
    s.run();
    expect(s.inv.slots[s.heldSlot]?.stack ?? 0).toBe(1);
    expect(s.world.flags.combatBookVolumeTwoWasUsed).toBeFalsy();
  });
});

// ============ ③ 结构锁（防静默回退——消耗门移出旗标门=变异哨兵锚） ============
describe.skipIf(EXT_MISSING)('BJ257 结构锁', () => {
  const GAME_SRC = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
  it('战斗书支旗标门内含 removeHeld（消耗在效果支内=原版 :43612 同拍语义）', () => {
    const i = GAME_SRC.indexOf('else if (bvid === 4382 || bvid === 5336)');
    expect(i).toBeGreaterThan(0);
    const seg = GAME_SRC.slice(i, i + 1800);
    const gate = seg.indexOf('if (!this.world.flags[flagKey])');
    const consume = seg.indexOf('removeHeld(1)');
    const gateEnd = seg.indexOf('this.input.mouseDown = false');
    expect(gate).toBeGreaterThan(0);
    expect(consume).toBeGreaterThan(gate);          // 消耗在旗标门内
    expect(consume).toBeLessThan(gateEnd);
  });
  it('useTime 45 钉值在位（防回退 30）', () => {
    const i = GAME_SRC.indexOf('else if (bvid === 4382 || bvid === 5336)');
    const seg = GAME_SRC.slice(i, i + 1800);
    expect(seg).toContain('this.player.useTime = 45;');
  });
});
