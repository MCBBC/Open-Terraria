// SW-BJ1 2026-09-06 交互 QoL 域剩余债清偿（智能交互链/悬停 NPC 名/交谈否决支/
// 收藏自锁行/合成区附近箱开关/触摸长按丢出等价）。
//
// 原版锚（1457 反编译,1458 零数值面变更）：
//   · 智能交互候选  Player.SmartInteractLookup Player.cs:17490-17515（:25644 每帧驱动）
//                   + NPCSmartInteractCandidateProvider.cs:34-78（townNPC ∧
//                   Hitbox∩worldRegion,离光标最近,零距立即胜出 → SmartInteractNPC）
//   · 交谈 flag2/否决 Main.HoverOverNPCs Main.cs:43743（flag2=悬停∨智能候选）+
//                   :43783-43787（651 WireKite 在场/stinky/mouseInterface 清 flag3）
//   · 悬停 NPC 名   Main.cs:43820-43832（GivenOrTypeName[:life/lifeMax],帧盒悬停）
//   · 臭味强制关对话 Player.cs:10364-10366（UpdateBuffs buff 120 → talkNPC=-1,无音效）
//   · 收藏自锁行    Main.cs:20846-20852 + ChestUI.IsBlockedFromTransferIntoChest
//                   ChestUI.cs:1287-1298
//   · 合成区开关    CraftingUI.DrawCraftFromNearbyChestsToggle CraftingUI.cs:336-356
//                   （Main.cs:42442 挂点,ChestCraft 帧表 index=2−val×2+hover）
//   · 触摸长按丢出  Player.dropItemCheck Player.cs:5139（mouseRight 右压沿丢光标物）
//                   + :5141-5144 吞沿
//
// 测试法：Game 原型桩（sw-bh1 同法）+ Input 最小 DOM stub（input-virtual 同法,
// fake timers 驱动 400ms 长按）+ 源文本结构锁（渲染层 DOM/画布面不可轻桩）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { Input } from '../src/core/Input';
import { options } from '../src/core/Options';
import { Lang } from '../src/i18n/Lang';
import { blockedFromTransferIntoChest } from '../src/ui/SlotActions';

type AnyGame = Record<string, any>;

/** Game 原型桩（无构造器副作用;字段按测试面注入） */
function stubGame(playerBox = { x: 160, y: 160, w: 20, h: 42 }): AnyGame {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    ...playerBox,
    cx: playerBox.x + playerBox.w / 2,
    cy: playerBox.y + playerBox.h / 2,
    dead: false,
    equipStats: { tileRange: false, toolboxRange: 0 },
    buffs: { has: () => false },
    cursorItemIconEnabled: false,
    cursorItemIconID: 0,
    cursorItemIconText: '',
  };
  g.world = { isJourney: false };
  g.entities = { enemies: [], npcs: [], critters: [] };   // critters 空桶（★FX56 补:tickHoverNpcName 遍历小动物桶,stub 缺桶=not iterable）
  g.renderer = { atlas: null, fullMap: { open: false } };
  g.input = { mouseX: 0, mouseY: 0 };
  g.camera = { screenToWorld: (sx: number, sy: number) => [sx, sy] };
  g.smartCursor = { wanted: false };
  g.openChestRef = () => null;
  return g;
}

/** 桶内实体（原型伪装过 instanceof,字段注入） */
const mkNpc = (over: Partial<TownNPC> = {}): TownNPC =>
  Object.assign(Object.create(TownNPC.prototype), {
    id: 1, vanillaId: 22, dead: false, bound: false, givenName: '',
    x: 160, y: 160, w: 20, h: 42, hp: 250, maxHp: 250,
    ...over,
  }) as TownNPC;
const mkEnemy = (over: Record<string, unknown> = {}): Enemy =>
  Object.assign(Object.create(Enemy.prototype), {
    id: 9, vanillaId: 1, dead: false, x: 160, y: 160, w: 20, h: 42,
    hp: 45, maxHp: 45, ai0: 0, ai3: 0,
    ...over,
  }) as unknown as Enemy;

// ================= ① 智能交互候选（Player.cs:17490-17515 + provider :34-78） =================

describe('SW-BJ1 ① tickSmartInteractNpc 智能交互候选', () => {
  it('wanted + 射程内：取离光标最近城镇 NPC（provider :52-57 距离取小）', () => {
    const g = stubGame();
    g.smartCursor.wanted = true;
    g.input.mouseX = 210; g.input.mouseY = 180;
    const near = mkNpc({ id: 1, x: 200, y: 160 });   // 盒 [200,220)×[160,202),光标盒内距 0
    const far = mkNpc({ id: 2, x: 250, y: 160 });    // 盒距 30
    g.entities.npcs = [far, near];
    (g as any).tickSmartInteractNpc();
    expect(g.smartInteractNpcId).toBe(1);
  });

  it('光标压盒（零距）立即胜出 break（provider :58-64）——即使更近者在其后', () => {
    const g = stubGame();
    g.smartCursor.wanted = true;
    g.input.mouseX = 205; g.input.mouseY = 180;
    const inside = mkNpc({ id: 3, x: 200, y: 160 });
    const alsoZero = mkNpc({ id: 4, x: 200, y: 160, w: 30 });
    g.entities.npcs = [inside, alsoZero];
    (g as any).tickSmartInteractNpc();
    expect(g.smartInteractNpcId).toBe(3);            // 首个零距 break,不再比较
  });

  it('距离取小走严格替换（同距先者胜,provider :53 `>` 语义）', () => {
    const g = stubGame();
    g.smartCursor.wanted = true;
    g.input.mouseX = 100; g.input.mouseY = 180;      // 距两盒左缘均 100
    g.entities.npcs = [mkNpc({ id: 5, x: 200, y: 160 }), mkNpc({ id: 6, x: 200, y: 160, w: 30 })];
    (g as any).tickSmartInteractNpc();
    // 两盒到光标距离：左缘同 100 → 距离 100 vs 100 —— 先者(5)胜
    expect(g.smartInteractNpcId).toBe(5);
  });

  it('门：非 wanted / 玩家死亡 / 光标持物 → 候选清空（:17497/:24943/:17498）', () => {
    const g = stubGame();
    g.smartCursor.wanted = false;
    g.entities.npcs = [mkNpc()];
    (g as any).tickSmartInteractNpc();
    expect(g.smartInteractNpcId).toBe(-1);

    g.smartCursor.wanted = true;
    g.player.dead = true;
    (g as any).tickSmartInteractNpc();
    expect(g.smartInteractNpcId).toBe(-1);

    g.player.dead = false;
    g.uiHeldItemRef = () => true;
    (g as any).tickSmartInteractNpc();
    expect(g.smartInteractNpcId).toBe(-1);
  });

  it('bound 待救援型不入候选（原版无 townNPC 旗）;射程外不入（:50 worldRegion 门）', () => {
    const g = stubGame();
    g.smartCursor.wanted = true;
    g.entities.npcs = [mkNpc({ id: 7, bound: true }), mkNpc({ id: 8, y: 112 - 42 })];
    (g as any).tickSmartInteractNpc();
    expect(g.smartInteractNpcId).toBe(-1);
    // 脚 y=112 出射程盒顶（worldRegion 严格相交,BH1 ①同源）
    expect((g as any).worldRegionIntersects(160, 112 - 42, 20, 42)).toBe(false);
  });
});

// ================= ② 交谈 flag2 智能支 + flag3 否决族（Main.cs:43743/:43783-43787） =================

describe('SW-BJ1 ② talkToNearbyNpc 智能支 + stinky 否决', () => {
  it('★Ctrl 智能光标 → 右键【任意位置】谈候选 NPC（flag2 智能支,无需悬停）', () => {
    const g = stubGame();
    const npc = mkNpc({ id: 1 });
    g.entities.npcs = [npc];
    g.smartInteractNpcId = 1;
    const opened: unknown[] = [];
    g.openNpcDialog = (n: unknown) => { opened.push(n); };
    // 光标在世界另一角（射程内但不在 NPC 帧盒上）
    expect((g as any).talkToNearbyNpc(260, 240)).toBe(true);
    expect(opened).toEqual([npc]);
  });

  it('悬停优先与候选同轨：首遇 flag2 收口（原版 :43846 break）——悬停 A 胜过候选 B', () => {
    const g = stubGame();
    const a = mkNpc({ id: 10, x: 160, y: 160 });
    const b = mkNpc({ id: 11, x: 200, y: 160 });
    g.entities.npcs = [a, b];
    g.smartInteractNpcId = 11;
    const opened: unknown[] = [];
    g.openNpcDialog = (n: unknown) => { opened.push(n); };
    // 光标悬停 A 帧盒（回退 ±8 盒 [152,188)×[152,210)）→ A 先遇 flag2 收口
    expect((g as any).talkToNearbyNpc(170, 180)).toBe(true);
    expect(opened).toEqual([a]);
  });

  it('候选不在帧序首位时按数组序先遇先谈（原版单数组 index 序的双桶近似）', () => {
    const g = stubGame();
    const a = mkNpc({ id: 10, x: 160, y: 160 });
    const b = mkNpc({ id: 11, x: 200, y: 160 });
    g.entities.npcs = [a, b];
    g.smartInteractNpcId = 10;
    const opened: unknown[] = [];
    g.openNpcDialog = (n: unknown) => { opened.push(n); };
    expect((g as any).talkToNearbyNpc(170, 180)).toBe(true);   // 悬停 A=候选 A,同体
    expect(opened).toEqual([a]);
  });

  it('★player.stinky（buff 120）清 flag3：候选/悬停均拒谈且不再看后续（:43785）', () => {
    const g = stubGame();
    const a = mkNpc({ id: 1 });
    const b = mkNpc({ id: 2, x: 200, y: 160 });
    g.entities.npcs = [a, b];
    g.player.buffs = { has: (bt: number) => bt === 76 /* BuffType.Stinky */ };
    g.smartInteractNpcId = 2;
    const opened: unknown[] = [];
    g.openNpcDialog = (n: unknown) => { opened.push(n); };
    expect((g as any).talkToNearbyNpc(260, 240)).toBe(false);
    expect((g as any).talkToNearbyNpc(170, 180)).toBe(false);  // 纯悬停路径同否决
    expect(opened).toEqual([]);
  });

  it('stinky 不影响悬停否决后的收口：首遇 flag2 候选败即止（原版 break 语义）', () => {
    const g = stubGame();
    g.entities.npcs = [mkNpc({ id: 1 }), mkNpc({ id: 2, x: 200, y: 160 })];
    g.player.buffs = { has: () => true };
    const opened: unknown[] = [];
    g.openNpcDialog = (n: unknown) => { opened.push(n); };
    expect((g as any).talkToNearbyNpc(170, 180)).toBe(false);
    expect(opened).toEqual([]);
  });
});

// ================= ③ 悬停 NPC 名（Main.cs:43820-43832） =================

describe('SW-BJ1 ③ tickHoverNpcName 悬停名牌', () => {
  it('城镇 NPC：名 = GivenOrTypeName（givenName||TypeName）,lifeMax>1 加血量行,压图标', () => {
    const g = stubGame();
    g.input.mouseX = 170; g.input.mouseY = 180;   // 回退 ±8 盒 [152,188)×[152,210)
    const npc = mkNpc({ vanillaId: 22 });
    g.entities.npcs = [npc];
    (g as any).tickHoverNpcName();
    const name = Lang.npcName(22) ?? '';
    expect(g.player.cursorItemIconText).toBe(`${name}: 250/250`);
    expect(g.player.cursorItemIconEnabled).toBe(false);
  });

  it('具名 NPC 只显 given 名（NPC.GivenOrTypeName :6767-6774,不带类型名）', () => {
    const g = stubGame();
    g.input.mouseX = 170; g.input.mouseY = 180;
    g.entities.npcs = [mkNpc({ vanillaId: 22, givenName: 'Andrew' })];
    (g as any).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('Andrew: 250/250');
  });

  it('lifeMax==1 → 纯名无血量行（:43827 `lifeMax > 1` 门）', () => {
    const g = stubGame();
    g.input.mouseX = 170; g.input.mouseY = 180;
    g.entities.npcs = [mkNpc({ vanillaId: 22, hp: 1, maxHp: 1 })];
    (g as any).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe(Lang.npcName(22) ?? '');
  });

  it('宝箱怪伪装态（ai0==0）排除;觉醒态（ai0!=0）照常显名（:43740 `|| ai[0] != 0`）', () => {
    const g = stubGame();
    g.input.mouseX = 170; g.input.mouseY = 180;
    const mimic = mkEnemy({ vanillaId: 85, ai0: 0 });
    g.entities.enemies = [mimic];
    (g as any).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('');
    mimic.ai0 = 7;
    (g as any).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe(`${Lang.npcName(85) ?? ''}: 45/45`);
  });

  it('靶标假人 488 恒排除;敌怪桶先于城镇桶（与交谈链同序）', () => {
    const g = stubGame();
    g.input.mouseX = 170; g.input.mouseY = 180;
    g.entities.npcs = [mkNpc({ vanillaId: 22 })];
    g.entities.enemies = [mkEnemy({ vanillaId: 488 })];
    (g as any).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe(`${Lang.npcName(22) ?? ''}: 250/250`);
  });

  it('★F2a/RB28:箱文本（layer 40 域）不压 NPC 名——覆盖 claim（:45794/:45858-45861 40 层头门被 HoveringOverAnNPC 压制,非 :43820 mouseText 让位集）', () => {
    const g = stubGame();
    g.input.mouseX = 170; g.input.mouseY = 180;
    g.player.cursorItemIconText = '土块';   // TileInteractionsMouseOver setSuppress 等世界 claim
    g.entities.npcs = [mkNpc()];
    (g as any).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe(`${Lang.npcName(22) ?? ''}: 250/250`);
    expect(g.player.cursorItemIconEnabled).toBe(false);
  });

  it('绑缚老史莱姆 685 不显名（:43748 特化支走图标 327 无名牌）', () => {
    const g = stubGame();
    g.input.mouseX = 170; g.input.mouseY = 180;
    g.entities.npcs = [mkNpc({ vanillaId: 685 })];
    (g as any).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('');
  });
});

// ================= ④ 臭味强制关对话（Player.cs:10364-10366,静默无音效） =================

describe('SW-BJ1 ④ tickNpcDialogKeepAlive stinky 支', () => {
  it('buff 120 在场 → 静默关闭（closeNpcDialog(true),不走音效 11 支）', () => {
    const g = stubGame();
    const closes: boolean[] = [];
    g.closeNpcDialog = (silent: boolean) => { closes.push(silent); };
    g.dialogNpc = { dead: false, x: 160, y: 160, w: 20, h: 42 };
    g.player.buffs = { has: (bt: number) => bt === 76 };
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toEqual([true]);
  });

  it('无臭味保持既有四支（射程内不关）;④tileEntityAnchor 支证据结案不落死码', () => {
    const g = stubGame();
    let closes = 0;
    g.closeNpcDialog = () => { closes++; };
    g.dialogNpc = { dead: false, x: 160, y: 160, w: 20, h: 42 };
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toBe(0);
  });
});

// ================= ⑤ 收藏自锁判别式（ChestUI.cs:1287-1298 单源） =================

describe('SW-BJ1 ⑤ blockedFromTransferIntoChest', () => {
  it('收藏钱槽 3213 → 存钱罐(-2);收藏虚空袋 4131/5325 → 虚空袋(-5);其余放行', () => {
    expect(blockedFromTransferIntoChest(-2, 3213)).toBe(true);
    expect(blockedFromTransferIntoChest(-5, 4131)).toBe(true);
    expect(blockedFromTransferIntoChest(-5, 5325)).toBe(true);
    expect(blockedFromTransferIntoChest(-2, 4131)).toBe(false);   // 钱槽进虚空袋放行
    expect(blockedFromTransferIntoChest(-5, 3213)).toBe(false);   // 虚空袋进存钱罐放行
    expect(blockedFromTransferIntoChest(120, 3213)).toBe(false);  // 世界箱无此门
    expect(blockedFromTransferIntoChest(-2, 3095)).toBe(false);   // 非钱袋家族
  });
});

// ================= ⑥ 触摸长按丢出等价（Player.cs:5139 右压沿 + :5141 吞沿） =================

type Listener = (e: unknown) => void;
const winReg = new Map<string, Listener[]>();
const elReg = new Map<string, Listener[]>();
const makeReg = (reg: Map<string, Listener[]>) => ({
  addEventListener: (t: string, fn: Listener) => {
    if (!reg.has(t)) reg.set(t, []);
    reg.get(t)!.push(fn);
  },
  removeEventListener: (...a: unknown[]) => void a,
});
const dispatchEl = (t: string, e: unknown) => { for (const fn of elReg.get(t) ?? []) fn(e); };
vi.stubGlobal('window', {
  addEventListener: (...a: [string, Listener]) => makeReg(winReg).addEventListener(...a),
  removeEventListener: (...a: unknown[]) => void a,
});
const fakeEl = {
  addEventListener: (...a: [string, Listener]) => makeReg(elReg).addEventListener(...a),
  removeEventListener: (...a: unknown[]) => void a,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }),
};

describe('SW-BJ1 ⑥ Input 长按右键脉冲预钩（光标持物丢出等价）', () => {
  let inp: Input;
  const savedOpMode = options.data.touchOpMode;
  const touchEv = (id: number, x: number, y: number) => ({
    target: null, preventDefault: () => {}, stopPropagation: () => {},
    changedTouches: [{ identifier: id, clientX: x, clientY: y }],
  });
  beforeEach(() => {
    vi.useFakeTimers();
    winReg.clear(); elReg.clear();
    inp = new Input(fakeEl as unknown as HTMLElement);
    // 世界触摸合成门（resolveTouchMode）在 node 无触摸硬件=keyboard → 钉触屏档
    options.data.touchOpMode = 'touch';
  });
  afterEach(() => {
    vi.useRealTimers();
    options.data.touchOpMode = savedOpMode;
  });

  it('钩子消费（光标持物丢出）→ 不置 rightDown（吞沿,同压不触世界右键）', () => {
    let calls = 0;
    inp.onLongPressRightPulse = () => { calls++; return true; };
    dispatchEl('touchstart', touchEv(1, 100, 100));
    vi.advanceTimersByTime(400);
    expect(calls).toBe(1);
    expect(inp.rightDown).toBe(false);
  });

  it('钩子放行（无持物）→ 400ms 后 rightDown 脉冲照常（世界右键分派可达）', () => {
    inp.onLongPressRightPulse = () => false;
    dispatchEl('touchstart', touchEv(1, 100, 100));
    expect(inp.rightDown).toBe(false);          // 未到期无脉冲
    vi.advanceTimersByTime(400);
    expect(inp.rightDown).toBe(true);
  });

  it('移动 >12px 取消长按（拖动=瞄准;钩子不调用、无脉冲）', () => {
    let calls = 0;
    inp.onLongPressRightPulse = () => { calls++; return true; };
    dispatchEl('touchstart', touchEv(1, 100, 100));
    dispatchEl('touchmove', touchEv(1, 130, 100));
    vi.advanceTimersByTime(400);
    expect(calls).toBe(0);
    expect(inp.rightDown).toBe(false);
  });
});

// ================= ⑦ 结构锁（源文本锚,防静默回退） =================

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const src = (p: string): string => readFileSync(`${ROOT}../src/${p}`, 'utf8');

describe('SW-BJ1 ⑦ 结构锁', () => {
  it('智能候选每帧驱动紧邻 updateSmartCursor（Player.cs:25644 同帧位）', () => {
    const s = src('core/Game.ts');
    const i = s.indexOf('this.updateSmartCursor();');
    expect(i).toBeGreaterThan(0);
    expect(s.slice(i, s.indexOf('this.updateMapKeys();'))).toContain('this.tickSmartInteractNpc();');
  });

  it('Renderer.drawMapHeads 挂 mouse 悬停名:双图喂点+城镇 NPC 头命中写 mapNpcHeadHoverName', () => {
    const s = src('render/Renderer.ts');
    expect(s).toContain('mapNpcHeadHoverName: string | null = null;');
    expect(s).toContain('mouse: { x: number; y: number } | null = null,');      // 签名
    expect(s).toContain('this.mapNpcHeadHoverName = n.givenName');              // FullName 落位
    expect(s.match(/this\.mapNpcHeadHoverName = null;/g)?.length).toBeGreaterThanOrEqual(2); // 帧/防渗漏重置
    expect(s).toContain('this.mapHeadHoverName ??= this.mapNpcHeadHoverName;'); // 全屏单槽链
    expect(s).toContain('{ x: mouseX, y: mouseY });');                          // 全屏喂点
    expect(s).toContain('? { x: mx, y: my } : null');                           // 小地图窗口门喂点
  });

  it('合成区附近箱开关:ChestCraft 帧表 + 官译 tooltip + RefreshGrid 同语义', () => {
    const s = src('ui/UI.ts');
    expect(s).toContain('UI_ChestCraft_$');                 // 帧驱动贴图(0/1 开 2/3 关)
    expect(s).toContain('GameUI.CraftFromNearbyChestsOn');
    expect(s).toContain('this.refreshVanillaCrafting();');  // NewCraftingUI.RefreshGrid
  });

  it('收藏自锁行走 blockedFromTransferIntoChest 单源（拖放臂+tooltip 行两消费面）', () => {
    const ui = src('ui/UI.ts');
    expect(ui.match(/blockedFromTransferIntoChest\(/g)?.length).toBe(2);
    expect(ui).toContain('UI.ItemCannotBePlacedInsideItself');
  });

  it('Input 预钩在构造+画布熔断重建两处恒活', () => {
    const s = src('core/Game.ts');
    expect(s.match(/input\.onLongPressRightPulse = this\.touchRightPulse\(\)/g)?.length).toBe(2);
  });
});
