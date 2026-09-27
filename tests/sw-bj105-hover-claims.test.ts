// SW-BJ105（2026-09-16）绘制相悬停 claim 面三族移植（BJ99-A 登记债清偿）。
// 取证定谳（1457 反编译锚；1458 :43614-43668/:48081 区同位零漂移）：
//   · 掉落物名    Main.DrawMouseOver Main.cs:43608-43638——光标 1×1 ∩ 绘制帧盒
//                 （GetDrawHitbox 单帧原尺寸,锚 WorldItem.Bottom 底缘中心 :43615-43618
//                 ≙ DrawItem :39271-39273 同式）→ cursorItemIconEnabled=false +
//                 AffixName[" (stack)"] + MouseTextHackZoom(text, rare, 0)（:43628）。
//   · 他玩家血名  Main.cs:43639-43662——排除门 !active/myPlayer==j/dead/ShouldNotDraw/
//                 stealth≤0.5（:43641-43642）+ 32×48 底缘中心帧盒（:43643-43644）→
//                 "名: life/statLifeMax2"[+ PvPFlag] + MouseTextHackZoom(text,0,difficulty)。
//   · 信息饰品行  DrawInfoAccs Main.cs:47960-48076 绘制相整链（行高亮/行标签
//                 MouseTextNoOverride/hideInfo 点击）——BJ72 判词「要接须拆 draw 相
//                 claim 面」→ 本刀自 tickInfoAccs(fixedUpdate) 拆出 tickInfoAccsHover
//                 （frame() render 前逐帧,暂停帧照跑）。
// 本仓仲裁域：cursorItemIconText 后写者胜（F2a/F2b 同构）——原版 layer 39 内
// first-claim-wins（drops→players→NPC 逐级 !mouseText 门）⇒ 调用序反写
// NPC→血名→掉落物名 同一优先级;layer 28 行标签 noOverride 恒胜 ⇒ 拆出的
// tickInfoAccsHover 最后写。绘制相 claim 块（BJ99-A 结构锁扩展,★SW-F1 2026-09-16
// 转无条件 `if (this.world)`）挂 refresh 之后 render 之前。
// ★SW-F1（2026-09-16 红蓝 2 定谳）：三族 claim 自 tickCursorIcon（fixedUpdate）退役
// （原版 DrawMouseOver 三族全在绘制相,唯一调用点 DrawInterface_39_MouseOver :45906,
// update 相无对应面）——本仓 mouseOversClear 挂 frame() 头每【绘制】帧清零,fixedUpdate
// claim 面 + 0 步进帧（frameSkip on/off+>60Hz ~58% 帧）= 清后无回填悬停名单帧闪烁;
// 原版清零在 Update 60Hz 头（Main.cs:17213）+ claim 在 Draw 相每绘制帧重 claim →
// 永不空窗。结构锁随改：tickCursorIcon 体禁含三族调用（退役锁）+ frame() 无条件块。
// 测试法：Game 原型桩（sw-bj1/sw-bj72 同法）+ 源文本结构锁（变异即红）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game } from '../src/core/Game';
import { Lang } from '../src/i18n/Lang';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import vanillaRareJson from '../src/data/vanilla-itemrare.json';
import { mouseTextInnerColor } from '../src/render/Renderer';
import { FlickerClock } from '../src/lighting/SkyColor';

const ITEM_RARE = vanillaRareJson as Record<string, number>;

type AnyGame = Record<string, any>;

/** Game 原型桩（无构造器副作用;字段按测试面注入） */
function bj105Game(): AnyGame {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    x: 160, y: 160, w: 20, h: 42, cx: 170, cy: 181, dead: false,
    hideInfo: new Array(13).fill(false),
    cursorItemIconEnabled: false, cursorItemIconID: 0, cursorItemIconText: '',
    cursorItemIconRare: 0, cursorItemIconDiff: 0,
  };
  g.world = { isJourney: false };
  g.entities = { enemies: [], npcs: [], drops: [], critters: [] };   // ★FX56 补 critters 空桶（tickHoverNpcName 小动物臂）
  g.renderer = {};
  g.input = { mouseX: 0, mouseY: 0, mouseDown: false };
  g.camera = { screenToWorld: (sx: number, sy: number) => [sx, sy] as [number, number] };
  g.remotePlayerProxies = [];
  g.net = null;
  return g;
}

/** 掉落物桩（原型伪装,字段注入）。vid 75=坠落星（贴图单帧 22×26 盒 12×12,
 *  ITEM_RARE[75]=1——大面积精灵最能暴露锚点偏差） */
const STAR_VID = 75;
const starInternalId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[STAR_VID]];
const mkDrop = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  dead: false, itemId: starInternalId, stack: 1, prefix: 0,
  x: 100, y: 100, w: 12, h: 12,
  ...over,
});

/** 远端玩家代理桩（Player 伪装面：claim 只读位置/血量/旗标域,无需真构造器） */
const mkProxy = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  __netSlot: 1, dead: false, stealth: 1, hostile: false,
  x: 100, y: 100, w: 20, h: 42, maxHp: 200, appearance: { difficulty: 2 },
  ...over,
});

// ================= 行为面 1：掉落物名（Main.cs:43608-43638） =================
describe('SW-BJ105 ① tickHoverDropName 掉落物名', () => {
  it('绘制帧盒悬停（大面积精灵顶域）claim：AffixName 本名 + enabled=false + rare=表值', () => {
    const g = bj105Game();
    // atlas 桩回贴图单帧 22×26 → 帧盒 = (100+6-11, 100+12-26)=(95,86) 22×26
    g.renderer.atlasIcon = () => ({ sw: 22, sh: 26 });
    g.entities.drops = [mkDrop()];
    g.input.mouseX = 106; g.input.mouseY = 90;   // 精灵顶域（物理盒 100..112 之外上方）
    (g as AnyGame).tickHoverDropName();
    const name = Lang.itemNameByKey(VANILLA_ITEM_KEY_BY_ID[STAR_VID]);
    const p = g.player;
    expect(p.cursorItemIconText).toBe(name);      // stack==1 无 " (N)" 尾缀
    expect(p.cursorItemIconEnabled).toBe(false);  // :43630 压悬停/手持图标
    expect(p.cursorItemIconRare).toBe(ITEM_RARE[STAR_VID]);   // :43624-43627 rare=inner.rare
    expect(p.cursorItemIconDiff).toBe(0);         // :43628 diff=0
  });

  it('锚点=底缘中心（Bottom）：盒下缘=物理盒下缘 d.y+d.h——精灵下方 1px 不 claim（变异错锚即红）', () => {
    const g = bj105Game();
    g.renderer.atlasIcon = () => ({ sw: 22, sh: 26 });
    g.entities.drops = [mkDrop()];
    g.input.mouseX = 106; g.input.mouseY = 100 + 12 + 2;   // 盒下缘(+12)之下 2px
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconText).toBe('');
    g.input.mouseY = 100 - 26 + 1;                          // 盒上缘(-26)之上 1px
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconText).toBe('');
    // 精灵下缘带内（锚定正确域）照常 claim
    g.input.mouseY = 100 + 11;
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconText).not.toBe('');
  });

  it('stack>1 → "名 (N)" 尾缀（:43621-43623）；缺图回退=物理盒 12×12', () => {
    const g = bj105Game();
    g.entities.drops = [mkDrop({ stack: 3 })];   // renderer 桩无 atlasIcon → 12×12 回退
    g.input.mouseX = 106; g.input.mouseY = 106;  // 物理盒内
    (g as AnyGame).tickHoverDropName();
    const name = Lang.itemNameByKey(VANILLA_ITEM_KEY_BY_ID[STAR_VID]);
    expect(g.player.cursorItemIconText).toBe(`${name} (3)`);
  });

  it('词缀名（AffixName :43620：prefix>0 → 词缀+本名,同 popupAffixName 单源）', () => {
    const g = bj105Game();
    g.entities.drops = [mkDrop({ prefix: 1 })];  // prefix 1 = 大型/Heavy…（PREFIX_NAMES 表域）
    g.input.mouseX = 106; g.input.mouseY = 106;
    (g as AnyGame).tickHoverDropName();
    const name = Lang.itemNameByKey(VANILLA_ITEM_KEY_BY_ID[STAR_VID]);
    expect(g.player.cursorItemIconText).not.toBe(name);
    expect(g.player.cursorItemIconText.endsWith(name)).toBe(true);
  });

  it('数组序首中即得（:43610-43638 400 槽序 + break 同语义）', () => {
    const g = bj105Game();
    g.renderer.atlasIcon = () => ({ sw: 22, sh: 26 });
    const a = mkDrop({ x: 100, stack: 2 });
    const b = mkDrop({ x: 104, stack: 1 });
    g.entities.drops = [a, b];
    g.input.mouseX = 110; g.input.mouseY = 100;  // 两盒交集域（110 ∈ a 盒 99..121 ∩ b 盒 103..125）
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconText).toBe(
      `${Lang.itemNameByKey(VANILLA_ITEM_KEY_BY_ID[STAR_VID])} (2)`   // 前者 a 胜出
    );
  });

  it('dead 掉落物跳过（:43611 !item[i].active）', () => {
    const g = bj105Game();
    g.entities.drops = [mkDrop({ dead: true })];
    g.input.mouseX = 106; g.input.mouseY = 106;
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconText).toBe('');
  });
});

// ================= 行为面 2：他玩家血名（Main.cs:43639-43662） =================
describe('SW-BJ105 ② tickHoverRemotePlayerName 他玩家血名', () => {
  it('帧盒悬停 claim："名: life/maxHp" + rare=0 + diff=appearance.difficulty（硬核名色域）', () => {
    const g = bj105Game();
    g.net = { active: true, mySlot: 0, players: new Map([[1, { name: 'Bob', hp: 123 }]]) };
    g.remotePlayerProxies = [mkProxy()];   // 盒 = (100+10-16, 100+42-48)=(94,94) 32×48
    g.input.mouseX = 95; g.input.mouseY = 95;
    (g as AnyGame).tickHoverRemotePlayerName();
    const p = g.player;
    expect(p.cursorItemIconText).toBe('Bob: 123/200');
    expect(p.cursorItemIconEnabled).toBe(false);
    expect(p.cursorItemIconRare).toBe(0);      // :43655 rare=0
    expect(p.cursorItemIconDiff).toBe(2);      // :43655 diff=difficulty
  });

  it('hostile 追加 PvP 旗标（:43653-43654 Game.PvPFlag）', () => {
    const g = bj105Game();
    g.net = { active: true, mySlot: 0, players: new Map([[1, { name: 'Bob', hp: 123 }]]) };
    g.remotePlayerProxies = [mkProxy({ hostile: true })];
    g.input.mouseX = 95; g.input.mouseY = 95;
    (g as AnyGame).tickHoverRemotePlayerName();
    expect(g.player.cursorItemIconText).toBe(`Bob: 123/200 ${Lang.text('Game.PvPFlag')}`);
  });

  it('排除门：dead / stealth≤0.5（:43641-43642 隐身半透不显名）/ net 未激活不 claim', () => {
    const g = bj105Game();
    g.net = { active: true, mySlot: 0, players: new Map([[1, { name: 'Bob', hp: 123 }]]) };
    g.input.mouseX = 95; g.input.mouseY = 95;
    g.remotePlayerProxies = [mkProxy({ dead: true })];
    (g as AnyGame).tickHoverRemotePlayerName();
    expect(g.player.cursorItemIconText).toBe('');
    g.remotePlayerProxies = [mkProxy({ stealth: 0.3 })];
    (g as AnyGame).tickHoverRemotePlayerName();
    expect(g.player.cursorItemIconText).toBe('');
    g.net = { active: false, mySlot: 0, players: new Map() };
    g.remotePlayerProxies = [mkProxy()];
    (g as AnyGame).tickHoverRemotePlayerName();
    expect(g.player.cursorItemIconText).toBe('');
  });

  it('帧盒 32×48 底缘中心锚（:43643-43644）：盒外不 claim', () => {
    const g = bj105Game();
    g.net = { active: true, mySlot: 0, players: new Map([[1, { name: 'Bob', hp: 123 }]]) };
    g.remotePlayerProxies = [mkProxy({ x: 100, y: 100 })];   // 盒 (94,94)-(126,142)
    g.input.mouseX = 200; g.input.mouseY = 200;
    (g as AnyGame).tickHoverRemotePlayerName();
    expect(g.player.cursorItemIconText).toBe('');
    g.input.mouseX = 100; g.input.mouseY = 135;   // 盒内下域（头顶 sprite 顶域,原版同 claim）
    (g as AnyGame).tickHoverRemotePlayerName();
    expect(g.player.cursorItemIconText).toBe('Bob: 123/200');
  });
});

// ================= 行为面 3：信息饰品行悬停绘制相面（DrawInfoAccs :47960-48076） =================
describe('SW-BJ105 ③ tickInfoAccsHover 信息饰品行（拆面后行为）', () => {
  it('行标签 claim（MouseTextNoOverride rare=0/diff=0 重建缓存——覆盖掉落物名 rare 档）', () => {
    const g = bj105Game();
    g.renderer = {
      infoAccHover: -1,
      infoAccs: { hitTest: () => 0, canShow: () => true, state: { rows: [{ label: 'Depth Meter', hideIndex: 4 }], inventoryOpen: false } },   // canShow:★BJ363 门常驻（抑制期整链早退）
    };
    g.player.cursorItemIconText = '铁镐 (1)';   // 掉落物名先行 claim（层 39 域）
    g.player.cursorItemIconRare = 5;
    (g as AnyGame).tickInfoAccsHover();
    expect(g.player.cursorItemIconText).toBe('Depth Meter');  // :46636 行标签胜
    expect(g.player.cursorItemIconRare).toBe(0);   // MouseTextNoOverride(text,0,0) rare 域重建
    expect(g.player.cursorItemIconDiff).toBe(0);
    expect(g.renderer.infoAccHover).toBe(0);
  });

  it('hideInfo 点击翻转（:46547-46573 Sound 12+翻转;inventoryOpen 域）', () => {
    const g = bj105Game();
    g.sfx = { play: () => {} };
    g.renderer = {
      infoAccHover: -1,
      infoAccs: { hitTest: () => 0, canShow: () => true, state: { rows: [{ label: 'Time', hideIndex: 0 }], inventoryOpen: true } },   // canShow:★BJ363 门常驻
    };
    g.input.mouseDown = true;
    (g as AnyGame).tickInfoAccsHover();
    expect(g.player.hideInfo[0]).toBe(true);       // 翻转 false→true
    expect(g.renderer.timeUiHover).toBe(true);     // 吞点击口径
    g.input.mouseDown = false;
    (g as AnyGame).tickInfoAccsHover();            // 释放拍清闩（翻转不发生）
    expect(g.player.hideInfo[0]).toBe(true);
    g.input.mouseDown = true;
    (g as AnyGame).tickInfoAccsHover();
    expect(g.player.hideInfo[0]).toBe(false);      // 闩清后再点 → 翻回
  });

  it('无 renderer（pre-init）安全早退', () => {
    const g = bj105Game();
    g.renderer = null;
    expect(() => (g as AnyGame).tickInfoAccsHover()).not.toThrow();
  });
});

// ================= 行为面 4：MouseOversClear 扩域 + MouseTextInner 色表 =================
describe('SW-BJ105 ④ mouseOversClear rare/diff 清零 + mouseTextInnerColor 色表', () => {
  it('mouseOversClear 清 rare/diff（_mouseTextCache 重建域）', () => {
    const g = bj105Game();
    g.player.cursorItemIconText = '铁镐';
    g.player.cursorItemIconRare = 5;
    g.player.cursorItemIconDiff = 2;
    (g as AnyGame).mouseOversClear();
    expect(g.player.cursorItemIconText).toBe('');
    expect(g.player.cursorItemIconRare).toBe(0);
    expect(g.player.cursorItemIconDiff).toBe(0);
  });

  it('MouseTextInner 色表（Main.cs:20429-20480）：默认档灰白、rare 档乘 num3、diff 档覆写', () => {
    expect(mouseTextInnerColor(0, 0, 255)).toBe('rgb(255,255,255)');   // 默认档直读 mt
    expect(mouseTextInnerColor(0, 0, 190)).toBe('rgb(190,190,190)');
    expect(mouseTextInnerColor(1, 0, 255)).toBe('rgb(150,150,255)');   // :20445 blue
    expect(mouseTextInnerColor(1, 0, 190)).toBe('rgb(111,111,190)');   // ×190/255 byte 截断
    expect(mouseTextInnerColor(-1, 0, 255)).toBe('rgb(130,130,130)');  // :20442
    expect(mouseTextInnerColor(-11, 0, 255)).toBe('rgb(255,175,0)');   // :20436
    expect(mouseTextInnerColor(10, 0, 255)).toBe('rgb(255,40,100)');   // :20472
    expect(mouseTextInnerColor(11, 0, 255)).toBe('rgb(180,40,255)');   // :20475 ≥11 档
    expect(mouseTextInnerColor(-13, 0, 255)).toBe('rgb(255,100,0)');   // master（中点定值,脉冲债）
    expect(mouseTextInnerColor(-12, 0, 255, null)).toBe('rgb(255,255,255)'); // disco 无钟回退
    expect(mouseTextInnerColor(-12, 0, 255, { discoColor: () => [1, 0.5, 0] }))
      .toBe('rgb(255,127,0)');                                          // disco 时钟活色
    expect(mouseTextInnerColor(1, 1, 255)).toBe('rgb(255,153,0)');     // :20478 mcColor 覆写
    // ★SW-F3 2026-09-16：hcColor=(1f,0.15f,0.1f)（Main.cs:980）FNA Color(float…) 逐通道
    // (byte)Clamp(v*255f) 截断 → 蓝通道 25（0.1f×255=25.5000004,截断非四舍五入;
    // 与 ChatCommands.ts:79 Player.ChatColor 面同值）——回写 26 即红
    expect(mouseTextInnerColor(-13, 2, 255)).toBe('rgb(255,38,25)');   // :20481 hcColor 覆写
  });

  it('★SW-清债① 2026-09-17 -13 档接活色：masterColor×200 (byte) 截断 + tick ping-pong（Main.cs:18408-18418）', () => {
    // 活色直读：初值 1 → G=200;半程 → 100;归零 → 0（无钟回退中点=旧定值 255,100,0）
    const clk = new FlickerClock();
    expect(clk.masterColor).toBe(1);                       // Main.cs:1312 初值 1f
    expect(mouseTextInnerColor(-13, 0, 255, clk)).toBe('rgb(255,200,0)');
    clk.masterColor = 0.5;
    expect(mouseTextInnerColor(-13, 0, 255, clk)).toBe('rgb(255,100,0)');
    clk.masterColor = 0;
    expect(mouseTextInnerColor(-13, 0, 255, clk)).toBe('rgb(255,0,0)');
    // tick ping-pong：1 起步 → 首拍 1.05>1 钳 1 反向 → 次拍 0.95 → 逐拍下行触底
    // （底沿走查用扫描而非钉拍数:0.05 累减有 ulp 漂移,恰 0/微负两态原版同相——
    //   恰 0 不触 <0 门（dir 仍 −1）,下一拍转负才钳 0 反向(:18414-18417)）
    const c2 = new FlickerClock();
    c2.tick();
    expect(c2.masterColor).toBe(1);                        // :18409-18413 >1 钳+反向
    expect(c2.masterColorDir).toBe(-1);
    c2.tick();
    expect(c2.masterColor).toBeCloseTo(0.95, 10);
    let bottomHit = false;
    for (let i = 0; i < 40 && !bottomHit; i++) {
      c2.tick();
      if (c2.masterColor === 0 && c2.masterColorDir === 1) bottomHit = true;  // 钳 0 反向拍
      else expect(c2.masterColor).toBeGreaterThan(0);                          // 下行相恒 >0
    }
    expect(bottomHit, '40 拍内必触底反向（摘 tick 两行=永不反向即红）').toBe(true);
    c2.tick();                                             // 反向后上行走起
    expect(c2.masterColor).toBeCloseTo(0.05, 10);
    expect(c2.masterColorDir).toBe(1);
    // 脉冲动画维：相邻两拍活色必然不同（摘 FlickerClock.tick masterColor 两行=恒定值 → 红）
    const c3 = new FlickerClock();
    const g1 = mouseTextInnerColor(-13, 0, 255, c3);
    c3.tick(); c3.tick();
    const g2 = mouseTextInnerColor(-13, 0, 255, c3);
    expect(g1).toBe('rgb(255,200,0)');
    expect(g2).toBe('rgb(255,190,0)');
    expect(g1).not.toBe(g2);
  });
});

// ================= 行为面 5：★SW-F1 0 步进帧悬停名持续（红蓝 2 空窗清偿） =================
describe('SW-BJ105 ⑤ F1 0 步进帧绘制相 claim 持续', () => {
  it('0 步进帧同构：清零→不步进 tickCursorIcon→绘制相三族 claim 仍回填掉落物名', () => {
    const g = bj105Game();
    g.renderer.atlasIcon = () => ({ sw: 22, sh: 26 });
    g.entities.drops = [mkDrop()];
    g.input.mouseX = 106; g.input.mouseY = 106;
    // 0 步进绘制帧同构（frameSkip on/off 档 >60Hz ~58% 帧）：frame 头清零 →
    // acc<FIXED_DT 不步进（tickCursorIcon 不跑,= 变异前唯一 claim 面）→
    // 绘制相无条件块三族 claim → render。变异（claim 回 fixedUpdate）时本断言红
    // （清零后无回填,text=''）。
    (g as AnyGame).mouseOversClear();
    expect(g.player.cursorItemIconText).toBe('');   // 清零面（BJ72 主修,不回退）
    (g as AnyGame).tickHoverNpcName();              // 绘制相块序 NPC→血名→掉落物名
    (g as AnyGame).tickHoverRemotePlayerName();
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconText).not.toBe('');   // 0 步进帧名持续（空窗消灭）
    expect(g.player.cursorItemIconEnabled).toBe(false); // :43630 压图标随名走
  });

  it('0 步进帧空场景：清零后三族 claim 无命中 → 保持清零（先清后 claim 往复同相）', () => {
    const g = bj105Game();
    g.input.mouseX = 9999; g.input.mouseY = 9999;
    (g as AnyGame).mouseOversClear();
    (g as AnyGame).tickHoverNpcName();
    (g as AnyGame).tickHoverRemotePlayerName();
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconText).toBe('');    // 无命中不置位（清零面 = frame 头）
    expect(g.player.cursorItemIconEnabled).toBe(false);
  });

  it('0 步进帧三族序仲裁仍成立：NPC 名先 claim、掉落物名后写压过（后写者胜域,层序反写同构）', () => {
    const g = bj105Game();
    g.renderer.atlasIcon = () => ({ sw: 22, sh: 26 });
    // 城镇 NPC 在光标下（town 桶桩无 instanceof 门;盒 (90,90)-(110,132) 含 106,106）
    g.entities.npcs = [{
      dead: false, vanillaId: 22, givenName: 'April', hp: 100, maxHp: 100,
      x: 90, y: 90, w: 20, h: 42,
    }];
    g.entities.drops = [mkDrop()];                   // 盒 (95,86)-(117,112) 含 106,106
    g.input.mouseX = 106; g.input.mouseY = 106;
    (g as AnyGame).mouseOversClear();
    (g as AnyGame).tickHoverNpcName();               // 层 39 域序一：NPC 名先得
    expect(g.player.cursorItemIconText).toBe('April: 100/100');
    (g as AnyGame).tickHoverDropName();              // 域序三：掉落物名后写压过
    const dropName = Lang.itemNameByKey(VANILLA_ITEM_KEY_BY_ID[STAR_VID]);
    expect(g.player.cursorItemIconText).toBe(dropName);
  });
});

// ================= 结构锁（变异即红） =================
describe('SW-BJ105 结构锁', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/core/Game.ts'), 'utf8');
  const rsrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/render/Renderer.ts'), 'utf8');

  function frameBody(): string {
    const s = src.indexOf('private frame(now: number) {');
    const e = src.indexOf('private scanBoulderFamilyNear', s);
    expect(s).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(s);
    return src.slice(s, e);
  }

  it('拍位序：绘制相 claim 块（NPC 名→血名→掉落物名,★F1 无条件）在 refreshCursorIconDrawState 之后 render 之前', () => {
    const f = frameBody();
    const iClear = f.indexOf('this.mouseOversClear()');
    const iRefresh = f.indexOf('this.refreshCursorIconDrawState()');
    // ★SW-F1 2026-09-16：块条件由 `if (this.paused && this.world)` 转无条件
    //   `if (this.world) {`（0 步进帧空窗清偿）——自 refresh 之后起找,避开 frame()
    //   头 audioAcc 同形块;回滚成暂停门（或删块）即红
    const iBlock = f.indexOf('if (this.world) {', iRefresh);
    const iNpc = f.indexOf('this.tickHoverNpcName();');
    const iPlayer = f.indexOf('this.tickHoverRemotePlayerName();');
    const iDrop = f.indexOf('this.tickHoverDropName();');
    const iInfo = f.indexOf('if (this.world) this.tickInfoAccsHover();');
    const iRender = f.indexOf('this.render()');
    for (const [n, i] of [['clear', iClear], ['refresh', iRefresh], ['block', iBlock],
      ['npc', iNpc], ['player', iPlayer], ['drop', iDrop], ['info', iInfo], ['render', iRender]] as const) {
      expect(i, n).toBeGreaterThan(0);
    }
    // claim 块在 SuppressDraw/refresh 之后、render 之前（原版 Draw 相同相,抑制帧不进）
    expect(iBlock).toBeGreaterThan(iRefresh);
    expect(iInfo).toBeGreaterThan(iBlock);
    expect(iInfo).toBeLessThan(iRender);
    // claim 序 = 原版层序反写（后写者胜域）：NPC 名→血名→掉落物名→行标签
    expect(iNpc).toBeGreaterThan(iBlock);
    expect(iPlayer).toBeGreaterThan(iNpc);
    expect(iDrop).toBeGreaterThan(iPlayer);
    expect(iInfo).toBeGreaterThan(iDrop);
  });

  it('★F1 退役锁：三族 claim 不在 tickCursorIcon（fixedUpdate）体内;update 相图标族保留', () => {
    const s = src.indexOf('private tickCursorIcon(): void {');
    const e = src.indexOf('private refreshCursorIconDrawState', s);
    expect(s).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(s);
    const body = src.slice(s, e);
    // 退役面（原版 DrawMouseOver 三族全在绘制相,update 相无对应面）——回挂即红
    expect(body).not.toContain('this.tickHoverNpcName();');
    expect(body).not.toContain('this.tickHoverRemotePlayerName();');
    expect(body).not.toContain('this.tickHoverDropName();');
    // 保留面 = update 相图标族（TileInteractionsMouseOver/手持支,原版同相）
    expect(body).toContain('this.tileInteractionsMouseOver(');
    expect(body).toContain('this.tickHeldCursorIcon(');
  });

  it('信息饰品行整链已拆绘制相：tickInfoAccs 无 hitTest、tickInfoAccsHover 全量持有（BJ72 判词）', () => {
    const sInfo = src.indexOf('private tickInfoAccs(): void {');
    const sHover = src.indexOf('private tickInfoAccsHover(): void {');
    expect(sInfo).toBeGreaterThan(0);
    expect(sHover).toBeGreaterThan(sInfo);
    expect(src.slice(sInfo, sHover)).not.toContain('infoAccs.hitTest');   // fixedUpdate 面已摘
    const hoverBody = src.slice(sHover, src.indexOf('private tickNpcEmotes', sHover));
    expect(hoverBody).toContain('infoAccs.hitTest');
    expect(hoverBody).toContain('cursorItemIconText = hr.label');         // 行标签 claim
    expect(hoverBody).toContain('hideInfo[row.hideIndex]');               // 点击翻转
    // 行标签 claim = MouseTextNoOverride(text,0,0) → rare/diff 缓存域重建
    expect(hoverBody).toContain('cursorItemIconRare = 0');
  });

  it('渲染端 MouseTextInner 色域接线：drawMouseTextLayer 读 rare/diff 域（掉落物名色进）', () => {
    expect(rsrc).toContain('mouseTextInnerColor(p.cursorItemIconRare, p.cursorItemIconDiff');
    expect(rsrc).toContain('ctx.fillStyle = fill;');
  });
});
