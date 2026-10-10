// BJ633 哥布林重铸槽吞装备（2026-10-10 用户实报:「哥布林工匠的重铸槽会吞装备,
// 不取下来直接退出重铸页面的话装备会留在哥布林那里」）。定谳:
//   原版归还语义 = Player.dropItemCheck reforgeItem 支（Player.cs:5115-5118:
//   !Main.InReforgeMenu ∧ Main.reforgeItem.type>0 → GetOrDropItem(Main.reforgeItem,
//   GetItemSettings.ReturnItemFromSlot)+reforgeItem=new Item()）——GetItem 回包,
//   余量 RequestNewItem(base.Center) 玩家中心落地（Player.cs:7197-7204,
//   InventoryOverflow 源,词缀随行）。触发面三族:
//   ① 每拍兜底:Player.Update :25411 / DrawInventory 界面帧 Main.cs:17550(playerInventory 支);
//   ② 强制退出臂同帧直调:Main.cs:42275-42288(开箱 chest!=-1/开店 npcShop!=0/
//      走远 talkNPC==-1/向导态 InGuideCraftMenu → InReforgeMenu=false 后紧跟
//      dropItemCheck)=退出当帧回包;
//   ③ 关包链:Main.cs:46438-46447 DrawInterface_26 !playerInventory →
//      InReforgeMenu=false → 下拍 ① 消费=Esc 关包即回包。
//   本仓断点（vinv 面）:三退出点只清 vinvReforgeOpen 不归还 reforgeItem——
//   closeInventory 关包臂/vinvGuideMenuExitCheck 退出臂(旧注「reforgeItem 不清=
//   原版 reforgeItem 静态量同相」系误读:静态的是字段槽位,内容被 dropItemCheck
//   即时消费——退出当拍即回包,滞留=隐形卡槽「留在哥布林那里」)/openChestPanel
//   vanilla 支;另 closeAll 直销 reforgeItem=退世界丢件面(原版存档持久 bitsByte[3]
//   Player.cs:55595-55617 本仓不建模=登记债;但原版正常流退世界前槽已空——暂停
//   菜单链先行关包回包)。classic modal closeReforge 有归还但满包余量静默吞。
//   修刀=单源 returnReforgeItem(dropItemCheck reforgeItem 支等价):inv.add 七参
//   整件回包(prefix/placeStyle/favorited 随行,RB4a/BP1 同族)+余量 spawnDrop
//   玩家中心+清槽;四消费面=closeInventory/vinvGuideMenuExitCheck/openChestPanel/
//   closeReforge。harness=BJ165 同构(Object.create(UI.prototype)+真归还方法)。
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const UI_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/UI.ts'), 'utf8');

type Added = [number, number, number | undefined, number | undefined, boolean, boolean, boolean];

let UI: { prototype: object };
let ITEM_DEFS: Array<{ key?: string; vid?: number } | undefined>;

beforeAll(async () => {
  ({ UI } = await import('../src/ui/UI'));
  ({ ITEM_DEFS } = await import('../src/data/items'));
}, 120000);   // 首载承担 UI.ts 模块整载（node env 动态 import ~7s,默认 5s 伪红）

function pickViId(): number {
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (d?.key && d.key.startsWith('vi_') && (d.vid ?? -1) > 0) return i;
  }
  throw new Error('无 vi_ 物品（ITEM_DEFS 未填充?）');
}

/** Game 桩：inv.add 记参返回 leftover;spawnDrop/spendCopper/npcShopClose 间谍 */
function makeGame(o: { leftover?: number; dialogNpc?: unknown; npcShopOpen?: boolean } = {}) {
  const added: Added[] = [];
  const g = {
    housingMode: null as unknown,
    npcShopOpen: !!o.npcShopOpen,
    // 缺省=哥布林会话保持（Game.ts:40884 talkNPC 不清同相）
    dialogNpc: 'dialogNpc' in o ? o.dialogNpc : { npcKey: 'goblin_tinkerer' },
    npcShopClose: vi.fn(),
    spawnDrop: vi.fn(),
    spendCopper: vi.fn(() => true),
    player: { cx: 100, cy: 200, inv: { add: vi.fn((...a: unknown[]) => { added.push(a as Added); return o.leftover ?? 0; }) } },
    cb: { onInventoryChanged: vi.fn() },
  };
  return { g, added };
}

/** UI 桩：Object.create 原型真方法（returnReforgeItem/closeInventory/closeReforge/
 *  vinvGuideMenuExitCheck/openChestPanel 真;周边面板方法全桩） */
function makeUI(g: unknown, extra: Record<string, unknown> = {}) {
  const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
  ui.game = g;
  ui.refreshAll = vi.fn();
  ui.layoutVanilla = vi.fn();
  ui.vinvRefreshCraft = vi.fn();
  ui.moveGhost = vi.fn();
  ui.returnCraftGrid = vi.fn();
  ui.closeChest = vi.fn();
  ui.closeItemSearch = vi.fn();
  ui.closeGuideSearch = vi.fn();
  ui.closeHousingPanel = vi.fn();
  ui.closeChestRenameDialog = vi.fn();
  ui.vinvSyncGridToggle = vi.fn();
  ui.vinvCloseModernCraft = vi.fn();
  ui.reflowBuffs = vi.fn();
  ui.openInventory = vi.fn();
  ui.toast = vi.fn();
  ui.invPanel = { style: { display: 'block' } };
  ui.eqDockEl = null;
  ui.npcShop = null;
  ui.heldStack = null;
  ui.openChest = null;
  ui.guidePlaced = null;
  ui.reforgeEl = null;
  ui.reforgeSlotEl = null;
  ui._builtLayout = 'vanilla';
  ui.vinvReforgeOpen = false;
  ui.vinvGuideMenuOpen = false;
  ui.vinvModernCraftOpen = false;
  Object.assign(ui, extra);
  return ui;
}

// ========================================================================
// ① Esc 关包归还（closeInventory vanilla 关包臂 ≙ Main.cs:46443 → dropItemCheck）
// ========================================================================
describe('BJ633 ① Esc 关包归还（closeInventory vanilla 关包臂）', () => {
  it('槽内物品 → closeInventory → inv.add 整件回包（词缀随行）+槽清+旗清', async () => {
    const id = pickViId();
    const { g, added } = makeGame();
    const ui = makeUI(g, {
      vinvReforgeOpen: true,
      reforgeItem: { id, stack: 2, prefix: 7 },
    });
    (ui.closeInventory as () => void)();
    expect(added).toEqual([[id, 2, 7, undefined, false, false, false]]);
    expect(ui.reforgeItem).toBeNull();
    expect(ui.vinvReforgeOpen).toBe(false);
    expect(g.spawnDrop).not.toHaveBeenCalled();      // 满包余量=0 → 无落地
    expect(g.cb.onInventoryChanged).toHaveBeenCalled();
  }, 60000);

  it('菜单未关全净态 → vinvGuideMenuExitCheck 不误归还（会话保持重铸中无退出条件）', async () => {
    const id = pickViId();
    const { g } = makeGame();
    const ui = makeUI(g, {
      vinvReforgeOpen: true,
      reforgeItem: { id, stack: 1, prefix: 3 },
    });
    (ui.vinvGuideMenuExitCheck as () => void)();
    expect(ui.reforgeItem).toEqual({ id, stack: 1, prefix: 3 });   // 槽内原样
    expect(ui.vinvReforgeOpen).toBe(true);
    expect(g.player.inv.add).not.toHaveBeenCalled();
  });
});

// ========================================================================
// ② 退出矩阵（vinvGuideMenuExitCheck 强制退出臂 ≙ Main.cs:42275-42288 同帧直调）
// ========================================================================
describe('BJ633 ② 退出矩阵（走远/开箱/开店/向导态互斥）', () => {
  it('走远（dialogNpc 失=talkNPC==-1）→ 归还+旗清', async () => {
    const id = pickViId();
    const { g, added } = makeGame({ dialogNpc: undefined });
    const ui = makeUI(g, { vinvReforgeOpen: true, reforgeItem: { id, stack: 1, prefix: 9 } });
    (ui.vinvGuideMenuExitCheck as () => void)();
    expect(added).toEqual([[id, 1, 9, undefined, false, false, false]]);
    expect(ui.reforgeItem).toBeNull();
    expect(ui.vinvReforgeOpen).toBe(false);
  });

  it('开箱（openChest 置位）→ 归还', async () => {
    const id = pickViId();
    const { g, added } = makeGame();
    const ui = makeUI(g, {
      vinvReforgeOpen: true,
      reforgeItem: { id, stack: 1, prefix: 9 },
      openChest: { x: 0, items: [] },
    });
    (ui.vinvGuideMenuExitCheck as () => void)();
    expect(added).toEqual([[id, 1, 9, undefined, false, false, false]]);
    expect(ui.reforgeItem).toBeNull();
    expect(ui.vinvReforgeOpen).toBe(false);
  });

  it('开店（npcShopOpen）→ 归还', async () => {
    const id = pickViId();
    const { g, added } = makeGame({ npcShopOpen: true });
    const ui = makeUI(g, { vinvReforgeOpen: true, reforgeItem: { id, stack: 1, prefix: 9 } });
    (ui.vinvGuideMenuExitCheck as () => void)();
    expect(added).toHaveLength(1);
    expect(ui.reforgeItem).toBeNull();
  });

  it('向导态互斥（vinvGuideMenuOpen）→ 归还', async () => {
    const id = pickViId();
    const { g, added } = makeGame();
    const ui = makeUI(g, {
      vinvReforgeOpen: true,
      reforgeItem: { id, stack: 1, prefix: 9 },
      vinvGuideMenuOpen: true,
    });
    (ui.vinvGuideMenuExitCheck as () => void)();
    expect(added).toHaveLength(1);
    expect(ui.reforgeItem).toBeNull();
    expect(ui.vinvReforgeOpen).toBe(false);
  });
});

// ========================================================================
// ③ 开箱即时臂（openChestPanel vanilla 支 ≙ :42277 chest≠-1 → :42288 dropItemCheck）
// ========================================================================
describe('BJ633 ③ openChestPanel vanilla 支即时归还', () => {
  it('重铸态开箱 → 槽内物品回包+旗清（原版 :42277 强制退出臂同帧 dropItemCheck）', async () => {
    const id = pickViId();
    const { g, added } = makeGame();
    const ui = makeUI(g, { vinvReforgeOpen: true, reforgeItem: { id, stack: 1, prefix: 5 } });
    (ui.openChestPanel as (c: unknown) => void)({ x: 0, items: [] });
    expect(added).toEqual([[id, 1, 5, undefined, false, false, false]]);
    expect(ui.reforgeItem).toBeNull();
    expect(ui.vinvReforgeOpen).toBe(false);
    expect(ui.openChest).toEqual({ x: 0, items: [] });
  });
});

// ========================================================================
// ④ 满包兜底（GetOrDropItem 余量落地 Player.cs:7197-7204 RequestNewItem(Center)）
// ========================================================================
describe('BJ633 ④ 满包兜底+随行域', () => {
  it('inv.add 余量 2 → spawnDrop 玩家中心（key/余量/词缀随行;:7200-7202 同域）', async () => {
    const id = pickViId();
    const key = ITEM_DEFS[id]!.key!;
    const { g } = makeGame({ leftover: 2 });
    const ui = makeUI(g, {
      vinvReforgeOpen: true,
      reforgeItem: { id, stack: 2, prefix: 7 },
    });
    (ui.closeInventory as () => void)();
    expect(g.spawnDrop).toHaveBeenCalledTimes(1);
    expect(g.spawnDrop).toHaveBeenCalledWith(100, 200, key, 2, undefined, undefined, undefined, 7);
    expect(ui.reforgeItem).toBeNull();
  });

  it('favorited 金边随行（GetItem 整 Item 回包 Player.cs:39873;RB4a/BP1 同族）', async () => {
    const id = pickViId();
    const { g, added } = makeGame();
    const ui = makeUI(g, {
      vinvReforgeOpen: true,
      reforgeItem: { id, stack: 1, prefix: 5, favorited: true },
    });
    (ui.closeInventory as () => void)();
    expect(added).toEqual([[id, 1, 5, undefined, false, false, true]]);
  });

  it('game 缺席（退世界 detachGame 后残留调用）→ 守卫 no-op 清槽不炸', async () => {
    const ui = makeUI(undefined, { reforgeItem: { id: 1, stack: 1, prefix: 0 } });
    (ui.closeReforge as () => void)();
    expect(ui.reforgeItem).toBeNull();
  });
});

// ========================================================================
// ⑤ 费用半程态（重铸已掷=钱已扣+新词缀已烘 :42618 域）
// ========================================================================
describe('BJ633 ⑤ 费用半程态', () => {
  it('重铸成功（新词缀已写槽）后关包 → 新词缀整件回包;零退费（原版扣费不逆）', async () => {
    const id = pickViId();
    const { g, added } = makeGame();
    const ui = makeUI(g, {
      vinvReforgeOpen: true,
      // doReforge 原地写 item.prefix（Game.ts doReforge）——槽内已是新词缀态
      reforgeItem: { id, stack: 1, prefix: 44 },
      vinvReforgeCooldownUntil: performance.now() + 1000,   // 最优档冷却在途
    });
    (ui.closeInventory as () => void)();
    expect(added).toEqual([[id, 1, 44, undefined, false, false, false]]);
    expect(ui.reforgeItem).toBeNull();
    expect(g.spendCopper).not.toHaveBeenCalled();   // 关包零退费零再扣
  });
});

// ========================================================================
// ⑥ classic modal closeReforge 单源化（旧裸三参 inv.add 满包余量静默吞=补刀面）
// ========================================================================
describe('BJ633 ⑥ classic closeReforge 走单源（余量落地+随行域同相）', () => {
  it('classic 关重铸面板 → 同一 returnReforgeItem 链回包', async () => {
    const id = pickViId();
    const { g, added } = makeGame();
    const ui = makeUI(g, { reforgeItem: { id, stack: 1, prefix: 3 } });
    (ui.closeReforge as () => void)();
    expect(added).toEqual([[id, 1, 3, undefined, false, false, false]]);
    expect(ui.reforgeItem).toBeNull();
  });

  it('classic 关面板满包 → 余量落地（旧裸 inv.add 静默吞的补刀面）', async () => {
    const id = pickViId();
    const key = ITEM_DEFS[id]!.key!;
    const { g } = makeGame({ leftover: 1 });
    const ui = makeUI(g, { reforgeItem: { id, stack: 1, prefix: 3 } });
    (ui.closeReforge as () => void)();
    expect(g.spawnDrop).toHaveBeenCalledWith(100, 200, key, 1, undefined, undefined, undefined, 3);
  });
});

// ========================================================================
// ⑦ closeAll 退世界 = ClearPlayerTempInfo TurnToAir 同相（结构锁,变异即红）
// ========================================================================
describe('BJ633 ⑦ closeAll 退世界直销同相（Player.cs:55706-55711 ClearPlayerTempInfo）', () => {
  it('closeAll 体=reforgeItem 直销（不归还）——原版正常流退世界前槽已空（关包链先行回包）', () => {
    const close = UI_SRC.indexOf('  closeAll() {');
    expect(close).toBeGreaterThan(-1);
    const body = UI_SRC.slice(close, UI_SRC.indexOf('\n  }', close));
    expect(body).toContain('this.reforgeItem = null;');
    expect(body).not.toContain('returnReforgeItem');   // 退世界不归还=ClearPlayerTempInfo 同相
  });
});

// ========================================================================
// ⑧ 消费面结构哨兵（变异判别:摘任一挂点=对应面爆红）
// ========================================================================
describe('BJ633 ⑧ 消费面结构哨兵（四挂点+单源体,变异即红）', () => {
  it('closeInventory vanilla 关包臂挂 returnReforgeItem（关包=③族消费面）', () => {
    const close = UI_SRC.indexOf('  closeInventory() {');
    const body = UI_SRC.slice(close, UI_SRC.indexOf('\n  }', close));
    expect(body).toContain('this.returnReforgeItem();');
  });

  it('vinvGuideMenuExitCheck 重铸退出臂挂 returnReforgeItem（:42286-42288 同帧直调同相）', () => {
    const a = UI_SRC.indexOf('private vinvGuideMenuExitCheck(): void {');
    const body = UI_SRC.slice(a, UI_SRC.indexOf('private vidOfItemOf', a));
    expect(body).toContain('this.returnReforgeItem();');
    // 序锁：旗清在前、归还紧随（=原版 InReforgeMenu=false → dropItemCheck 同序）
    expect(body.indexOf('this.vinvReforgeOpen = false;'))
      .toBeLessThan(body.indexOf('this.returnReforgeItem();'));
  });

  it('openChestPanel vanilla 支挂 returnReforgeItem（:42277 强制退出臂同帧同相）', () => {
    const a = UI_SRC.indexOf('private openChestPanel(c: ChestData) {');
    const body = UI_SRC.slice(a, UI_SRC.indexOf('this.chestTitle.textContent', a));
    expect(body).toContain('this.returnReforgeItem();');
    // 序锁：旗清 → 归还 → 开包（原版 :42277-42288 同序）
    const flag = body.indexOf('this.vinvReforgeOpen = false;');
    const ret = body.indexOf('this.returnReforgeItem();');
    const open = body.indexOf('this.openInventory(true)');
    expect(flag).toBeLessThan(ret);
    expect(ret).toBeLessThan(open);
  });

  it('closeReforge 体=单源委托（旧裸三参 inv.add 面不复存在）', () => {
    const a = UI_SRC.indexOf('closeReforge(): void {');
    const body = UI_SRC.slice(a, UI_SRC.indexOf('private returnReforgeItem', a));
    expect(body).toContain('this.returnReforgeItem();');
    expect(body).not.toMatch(/inv\.add\(/);   // 裸 add 直调面退役
  });

  it('returnReforgeItem 单源体=七参 add+余量 spawnDrop+onInventoryChanged（变异即红）', () => {
    const a = UI_SRC.indexOf('private returnReforgeItem(): void {');
    const body = UI_SRC.slice(a, UI_SRC.indexOf('// ============ 向导配方反查', a));
    expect(body).toContain('inv.add(r.id, r.stack, r.prefix, r.placeStyle, false, false, !!r.favorited)');
    expect(body).toContain('this.game.spawnDrop(this.game.player.cx, this.game.player.cy, key, left');
    expect(body).toContain('onInventoryChanged');
  });
});
