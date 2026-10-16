// ★BJ690（2026-10-16）矿车升级包（Minecart Upgrade Kit）判别锁。
//   用户实报：「矿车升级包使用后没有被从物品栏消耗」。
// ── 定谳（Terarria1457 亲读,任务书 ID 4736 有误——4736=DefaultToVanitypet(859,267)
//    Item.cs:38942-38945 虚荣宠物;矿车升级包 = ItemID.cs:12124 MinecartPowerup = 5289）：
//    · Item.cs:41987-41997 case 5289：consumable=true / useStyle=4（举持）/ useTime=
//      useAnimation=30 / UseSound=SoundID.Item4 / expert=true——【无 autoReuse、无 CanUse 门】
//      （对照 3335 恶魔之心 :52689 专家世界门——5289 无此门,任何世界可用）。
//    · Player.cs:43933 ItemCheck 调用位（=左键使用链 ItemCheckWrapped :32066←:28495）
//      → :45587-45599 ItemCheck_UseMinecartPowerUp：ApplyItemTime + [!unlockedSuperCart
//      → unlockedSuperCart=true + SendData(4)] + 【每次使用】QuickSpawnItem(3353 机械矿车)
//      ——通用消耗门 :43612（itemTimeMax!=0 && itemTime==itemTimeMax && consumable）每用扣 1。
//    · 右键域零使用面：ItemCheck_ManageRightClickFeatures（:31764-31877 快换表）不含
//      5289；原版右键=纯格交互（LookForTileInteractions）——持套件右键门/拉杆/NPC 不应
//      被物品臂截胡。
// ── 本仓病灶：使用面只落在右键分派 rightClickTileNpcDispatch（BJ285-② 落刀,消耗+返还
//    面已对齐但【输入域错置】）；左键链 PERMANENT_USE_VIDS 无 5289 → 裸挥 no-op
//    （探针 _bj690-minecart-kit.mjs A1/A2：左键连用 2 次 kit=3 恒不变/superCart=false/
//    零返还=用户实报主诉;B1 右键反而消耗）。且右键臂序在 interactAt/交谈【前】——
//    持套件右键门=误耗套件,原版右键世界交互被劫持。
// ── 落刀：①左键 PERM 支 case 5289（解锁一次+每用消耗+每用返还 3353+useTime 30+
//    Item4 起手音+非 autoReuse 吞按住连发）;②右键臂整撤（1:1:原版右键无使用面,
//    BJ285-② 消耗+返还语义面原样迁入左键域——改判史见本文件与 bj285-debt-wave.test.ts）。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { newWiresRadialState } from '../src/stats/wiresRadial';

const REPO = join(dirname(__dirname), '..');
const GAME_SRC = readFileSync(join(dirname(__dirname), 'src', 'core', 'Game.ts'), 'utf8');
const ITEM_CS = readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
const PLAYER_CS = readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Player.cs'), 'utf8');

const KIT_IID = ITEM_BY_KEY['vi_5289_minecart_upgrade_kit'];
const CART_IID = ITEM_BY_KEY['vi_3353_mechanical_cart'];

/** BJ568 stubGame 同构（updateUse 可驱动的最小 Game 桩）+ 套件面扩展 */
function stubGame() {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  g.player = player;
  g.world = new World(120, 120, 30, 'bj690');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: () => {} };
  g.input = {
    mouseDown: false, mouseHeld: false, mouseX: 700, mouseY: 300,
    rightDown: false, uiBlocking: false, downAction: () => false,
  };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.wiresRadial = newWiresRadialState();
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.achievements = { handleSpecialEvent: () => {} };
  g.spawnDrop = vi.fn();
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
  g.cb = { onInventoryChanged: vi.fn(), onToast: vi.fn() };
  return {
    g, player, sounds,
    inv: player.inv,
    grantKits: (n: number) => {
      player.inv.selected = 0;
      player.inv.slots[0] = { id: KIT_IID, stack: n };
      player.inv.slots[1] = null;
    },
    useLeft: () => {                       // 真实左键使用链（updateUse 全链）
      player.useTime = 0;
      (g.input as { mouseDown: boolean }).mouseDown = true;
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      (g.input as { mouseDown: boolean }).mouseDown = false;
    },
  };
}

const kitStack = (inv: Inventory) => inv.slots.find((s) => s && s.id === KIT_IID)?.stack ?? 0;
const cartCount = (inv: Inventory) => inv.slots.reduce((n, s) => n + (s && s.id === CART_IID ? s.stack : 0), 0);

// ================================================================
// ① 数据面：反编译直读锚（Item.cs case 5289 / Player.cs 使用支）
// ================================================================
describe('BJ690 数据面：5289 原版定义与使用支（Item.cs/Player.cs 直读）', () => {
  it('Item.cs case 5289：consumable+useStyle4+useTime30+Item4+无 autoReuse（:41987-41997）', () => {
    const body = ITEM_CS.split('\n').slice(41986, 41997).join('\n');
    expect(body).toContain('case 5289:');
    expect(body).toMatch(/consumable = true;/);
    expect(body).toMatch(/useStyle = 4;/);
    expect(body).toMatch(/useTime = 30;/);
    expect(body).toMatch(/useAnimation = 30;/);
    expect(body).toMatch(/UseSound = SoundID\.Item4;/);
    expect(body, 'case 体无 autoReuse（松手再点语义）').not.toMatch(/autoReuse/);
  });
  it('Player.cs ItemCheck_UseMinecartPowerUp：解锁门内+返还门外=每用返还 3353（:45587-45599）', () => {
    const body = PLAYER_CS.split('\n').slice(45586, 45599).join('\n');
    expect(body).toContain('ItemCheck_UseMinecartPowerUp');
    expect(body).toMatch(/sItem\.type == 5289 && itemAnimation > 0 && ItemTimeIsZero/);
    expect(body).toMatch(/unlockedSuperCart = true/);
    expect(body, 'QuickSpawnItem(3353) 在解锁门外=每次使用都返还').toMatch(/QuickSpawnItem\(GetItemSource_OpenItem\(5289\), 3353\);/);
  });
  it('右键快换表不含 5289（ItemCheck_ManageRightClickFeatures :31764-31877）', () => {
    const body = PLAYER_CS.split('\n').slice(31763, 31878).join('\n');
    expect(body).not.toMatch(/case 5289/);
  });
});

// ================================================================
// ② 行为面：左键真实使用链（修复主面——旧=裸挥 no-op 不消耗）
// ================================================================
describe('BJ690 行为面：左键使用（ItemCheck 域,旧=无 case 完全 no-op）', () => {
  it('首用：套件 −1 + superCart 解锁 + 返还 3353 机械矿车 + useTime 30 + Item4 起手音', () => {
    const s = stubGame();
    s.grantKits(3);
    s.useLeft();
    expect(kitStack(s.inv), '套件 −1（通用消耗门 :43612 面）').toBe(2);
    expect((s.g.world.flags as Record<string, boolean>).superCart, 'unlockedSuperCart 置位').toBe(true);
    expect(cartCount(s.inv), '+1 机械矿车（QuickSpawnItem :45597）').toBe(1);
    expect(s.player.useTime, 'useTime 30（Item.cs:41993）').toBe(30);
    expect(s.sounds.some((x) => x === 'pus:5289:pickup'), 'UseSound Item4 起手拍恰一次').toBe(true);
  });
  it('次用（已解锁）：仍 −1 仍返还——原版矿车兑换机态（返还面在解锁门外）', () => {
    const s = stubGame();
    s.grantKits(2);
    s.useLeft();
    s.useLeft();
    expect(kitStack(s.inv)).toBe(0);
    expect(cartCount(s.inv)).toBe(2);
  });
  it('末枚：套件槽清空且返还照常（消耗先于返还,同拍）', () => {
    const s = stubGame();
    s.grantKits(1);
    s.useLeft();
    expect(s.inv.slots[0]).toBeNull();
    expect(cartCount(s.inv)).toBe(1);
  });
  it('满包：返还溢出走 spawnDrop（QuickSpawnItem 世界落地面）', () => {
    const s = stubGame();
    s.grantKits(1);
    for (let i = 1; i < s.inv.slots.length; i++) s.inv.slots[i] = { id: KIT_IID, stack: 1 };
    s.useLeft();
    expect(s.inv.slots[0]).toBeNull();                          // 套件已耗
    const drop = (s.g.spawnDrop as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(drop, '满包 → spawnDrop(cart, 溢出 1)').toBeTruthy();
    expect(drop[2]).toBe('vi_3353_mechanical_cart');
    expect(drop[3]).toBe(1);
  });
  it('按住左键不连耗：非 autoReuse,一按只耗 1（松手再点才再用）', () => {
    const s = stubGame();
    s.grantKits(5);
    // 电平按住 90t（useTime 手动衰减模拟主循环 Player.fixedUpdate :4735）
    (s.g.input as { mouseDown: boolean }).mouseDown = true;
    (s.g.input as { mouseHeld: boolean }).mouseHeld = true;
    for (let t = 0; t < 90; t++) {
      if (s.player.useTime > 0) s.player.useTime--;
      (s.g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    }
    (s.g.input as { mouseDown: boolean }).mouseDown = false;
    (s.g.input as { mouseHeld: boolean }).mouseHeld = false;
    expect(kitStack(s.inv), '90t 电平按住恰耗 1（松手再点语义）').toBe(4);
  });
});

// ================================================================
// ③ 右键非使用通道：原版右键=纯格交互（旧右键臂撤除判别面）
// ================================================================
describe('BJ690 右键非使用通道（原版无右键使用面,旧臂=域错置+劫持格交互）', () => {
  function dispatchHarness() {
    const s = stubGame();
    s.grantKits(2);
    (s.g.world.flags as Record<string, boolean>).superCart = true;   // 已解锁（排除解锁面干扰）
    (s.g.input as { rightDown: boolean }).rightDown = true;
    (s.g as { _prevRightDown: boolean })._prevRightDown = false;
    (s.g as { tileInteractHappened: boolean }).tileInteractHappened = false;
    (s.g as { dialogNpc: unknown }).dialogNpc = null;
    (s.g as { npcChatBubbleHovered: () => boolean }).npcChatBubbleHovered = () => false;
    (s.g as { interactAt: (x: number, y: number) => void }).interactAt = vi.fn();
    (s.g as { talkToNearbyNpc: (...a: number[]) => boolean }).talkToNearbyNpc = vi.fn(() => false);
    (s.g as { trackTile: number }).trackTile = 0;
    return s;
  }
  it('持套件右键空格：不消耗/不解锁不返还,右键透传格交互（interactAt 达成）', () => {
    const s = dispatchHarness();
    const r = (s.g as unknown as {
      rightClickTileNpcDispatch: (tx: number, ty: number, held: unknown) => boolean;
    }).rightClickTileNpcDispatch(60, 60, { vid: 5289 });
    expect(r, '无物品臂命中=不早退（原版右键域纯格交互）').toBe(false);
    expect(kitStack(s.inv), '右键不消耗（旧臂=误耗面）').toBe(2);
    expect(cartCount(s.inv), '右键零返还').toBe(0);
    expect((s.g as { interactAt: (x: number, y: number) => void }).interactAt,
      '右键透传到格交互臂（旧臂截胡=门/拉杆/NPC 交互被劫持）').toHaveBeenCalledWith(60, 60);
  });
});

// ================================================================
// ④ 结构锁：域迁移在位（左键 case + 右键臂不回潮）
// ================================================================
describe('BJ690 结构锁', () => {
  it('PERMANENT_USE_VIDS 含 5289（左键 ItemCheck 域单点分流）', () => {
    const m = GAME_SRC.match(/const PERMANENT_USE_VIDS = new Set\(\[([\s\S]*?)\]\);/);
    expect(m, 'PERMANENT_USE_VIDS 定义在位').toBeTruthy();
    const ids = (m![1].replace(/\/\/[^\n]*/g, '').match(/\d+/g) ?? []).map(Number);
    expect(ids).toContain(5289);
  });
  it('PERM_BARESOUND_EXEMPT 含 5289（case 自播 Item4,裸挥臂豁免防双播）', () => {
    expect(GAME_SRC).toMatch(/PERM_BARESOUND_EXEMPT = new Set<number>\(\[3335, 5289,/);
  });
  it('右键臂不回潮：全源无 `(heldDef.vid ?? -1) === 5289` 分派形（旧臂形）', () => {
    expect(GAME_SRC, '旧右键臂形必须绝迹（回潮=域错置复发）')
      .not.toMatch(/\(heldDef\.vid \?\? -1\) === 5289\)/);
  });
  it('左键 case 在位：case 5289 携带 superCart 解锁+removeHeld+3353 返还', () => {
    expect(GAME_SRC).toMatch(/case 5289: \{[^\0]*?superCartUnlocked\(\)/);
    expect(GAME_SRC).toMatch(/case 5289: \{[^\0]*?vi_3353_mechanical_cart|case 5289: \{[^\0]*?VI\(3353\)/);
  });
});
