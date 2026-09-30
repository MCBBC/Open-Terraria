// SW-FX36：标尺族全链审计（Ruler 档测量线+W×H 计数 / 机械标尺档网格 / 装备门域）。
//  金标：Player.cs:12895-12933（RefreshMechanicalAccsFromItemType）/ :12997-13004
//  （UpdateEquips 逐 inventory[0..57] 槽扫描=判定域）/ :13204-13206（GrantArmorBenefits
//  装备段）/ :16699-16728（UpdateSocialShadow 3 拍轮转）/ :18808-18809（ResetEffects
//  rulerGrid=false; rulerLine=true ⇒ 线旗恒真）/ :56749（ctor [0]=1 缺省关）；
//  Main.cs:47046-47141（DrawInterface_4_Ruler：speed>6 早退 + 起锚格 :47108-47110 +
//  rulerLineDisplayValues :47089-47091）/ :47146-47224（_3_LaserRuler：淡出驱动=
//  Distance(position,shadowPos[2]) :47152,velocity.Length() 死赋值）/ :46187-46195
//  （DrawInterface_33_MouseText W×H 计数=(|X|+1)x(|Y|+1),1×1 不显,纯数字拼串）。
//  1458 同域逐字节相同（Main.cs 47046-47224 / Player.cs RefreshMechanicalAccs diff=0）。
//  ★变异证红：各断言注释给出「旧实现退化值」。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  builderAccGateSet, builderAccDefaults, builderAccTotalIcons,
  playerAccessoryVidEquipped, playerVidCarried,
  toggleBuilderAccBit, BACC,
  rulerLineAlpha, rulerGridFade, rulerReadoutText,
} from '../src/stats/builderAcc';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { VI_ID } from '../src/data/itemKeys';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

describe('开关归属表（RefreshMechanicalAccsFromItemType :12899-12915 镜像层）', () => {
  it('① 486 → rulerLine（镜像层;运行态该旗被 ResetEffects :18809 恒真覆盖=无操作）', () => {
    const g = builderAccGateSet((v) => v === 486);
    expect(g.rulerLine).toBe(true);                  // :12903-12905
    expect(g.rulerGrid).toBe(false);
    expect(g.infoAccMechShowWires).toBe(false);
    expect(g.autoPaint).toBe(false);
    expect(g.autoActuator).toBe(false);
  });
  it('② 2799 Mechanical Ruler → rulerGrid（网格档）;不授 rulerLine/wires', () => {
    const g = builderAccGateSet((v) => v === 2799);
    expect(g.rulerGrid).toBe(true);                  // :12907-12909
    expect(g.rulerLine).toBe(false);
    expect(g.infoAccMechShowWires).toBe(false);
  });
  it('③ 3611 The Grand Design → 复合三旗（wires+rulerLine+rulerGrid）', () => {
    const g = builderAccGateSet((v) => v === 3611);
    expect(g.infoAccMechShowWires).toBe(true);       // :12899-12901
    expect(g.rulerLine).toBe(true);                  // :12903-12905
    expect(g.rulerGrid).toBe(true);                  // :12907-12909
  });
  it('④ 5126 Hand of Creation → 只授 autoPaint（:12911-12913）——★不授 rulerLine/'
    + 'rulerGrid/wires（宽×高计数与网格的开关均不随它亮,归属表易错点）', () => {
    const g = builderAccGateSet((v) => v === 5126);
    expect(g.autoPaint).toBe(true);
    expect(g.rulerLine).toBe(false);                 // 旧「5126 兼标尺档」退化值
    expect(g.rulerGrid).toBe(false);
    expect(g.infoAccMechShowWires).toBe(false);
    expect(g.autoActuator).toBe(false);              // 3624 才有 :12915
  });
  it('⑤ 2216/3061 → autoPaint;3624 Presserator → autoActuator', () => {
    expect(builderAccGateSet((v) => v === 2216).autoPaint).toBe(true);
    expect(builderAccGateSet((v) => v === 3061).autoPaint).toBe(true);
    expect(builderAccGateSet((v) => v === 3624).autoActuator).toBe(true);
  });
});

describe('标尺线门=Ruler 档开关位（ResetEffects :18809 旗恒真 ⇒ 无物品面）', () => {
  it('① 缺省 [0]=1（ctor :56749）=默认关;翻 0 即亮,与任何配饰无关', () => {
    expect(builderAccDefaults()[BACC.RulerLine]).toBe(1);
    const p = new Player(0, 0, new Inventory());
    // 背包/装备全空 ⇒ 网格旗恒 false,但线门不读旗（:47048 的 rulerLine 恒真）
    expect(builderAccGateSet(() => false).rulerGrid).toBe(false);
    toggleBuilderAccBit(p.builderAccStatus, BACC.RulerLine);
    const lineOn = p.builderAccStatus[BACC.RulerLine] === 0;   // Game.ts FX36 门（无 gates 项）
    expect(lineOn).toBe(true);                       // 旧「需 486/3611 装备」退化值=恒 false
  });
  it('② builderAccTotalIcons：空配饰 = 2（方块替换+尺线恒 1）——旧 1 漏 :18809 恒真项', () => {
    expect(builderAccTotalIcons(builderAccGateSet(() => false), false)).toBe(2);
  });
});

describe('网格旗判定域=背包∪装备（UpdateEquips :12997-13004 + GrantArmorBenefits :13204）', () => {
  it('① 背包格（10 号工具行）持 2799 即亮——旧「仅配饰槽」退化值=红', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.slots[10] = { id: iid(2799), stack: 1 };
    expect(playerVidCarried(p.inv.slots, p.inv.armor, (k) => p.inv.isItemSlotUnlockedAndUsable(k),2799)).toBe(true);
    expect(playerAccessoryVidEquipped(p.inv.armor, (k) => p.inv.isItemSlotUnlockedAndUsable(k),2799)).toBe(false);
  });
  it('② 钱币/弹药格（50-53/54-57）在扫描域内（vanilla j<58 全含）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.slots[53] = { id: iid(3619), stack: 1 };
    p.inv.slots[57] = { id: iid(2216), stack: 1 };
    expect(playerVidCarried(p.inv.slots, p.inv.armor, (k) => p.inv.isItemSlotUnlockedAndUsable(k),3619)).toBe(true);
    expect(playerVidCarried(p.inv.slots, p.inv.armor, (k) => p.inv.isItemSlotUnlockedAndUsable(k),2216)).toBe(true);
  });
  it('③ 装备段 armor[3..9] 解锁格仍命中;时装段 armor[10..] 不参与（★清偿刀 P 逐槽化）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: iid(3611), stack: 1 };
    expect(playerVidCarried(p.inv.slots, p.inv.armor, (k) => p.inv.isItemSlotUnlockedAndUsable(k),3611)).toBe(true);
    p.inv.armor[3] = null;
    p.inv.armor[13] = { id: iid(3611), stack: 1 };   // 时装配饰段
    expect(playerVidCarried(p.inv.slots, p.inv.armor, (k) => p.inv.isItemSlotUnlockedAndUsable(k),3611)).toBe(false);
  });
  it('④ 未注册 vid（VI_ID=0）与空表恒 false;486 已注册（短剑,镜像层仍可达）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(playerVidCarried(p.inv.slots, p.inv.armor, (k) => p.inv.isItemSlotUnlockedAndUsable(k),486)).toBe(false);
    expect(VI_ID(486)).toBeGreaterThan(0);
    p.inv.slots[0] = { id: VI_ID(486), stack: 1 };
    expect(playerVidCarried(p.inv.slots, p.inv.armor, (k) => p.inv.isItemSlotUnlockedAndUsable(k),486)).toBe(true);
  });
});

describe('W×H 计数文本（Main.cs:46187-46195;rulerLineDisplayValues :47089-47091）', () => {
  it('① 含端闭区间计数：跨度(3,5)→"4x6"（用户实报截图形态）', () => {
    expect(rulerReadoutText(3, 5)).toBe('4x6');
  });
  it('② (8,8)→"9x9"（追加实报截图值）', () => {
    expect(rulerReadoutText(8, 8)).toBe('9x9');
  });
  it('③ 负向（鼠在锚左/上）取 |·|：(−4,−2)→"5x3"', () => {
    expect(rulerReadoutText(-4, -2)).toBe('5x3');
  });
  it('④ 单轴 0 → 另一轴照显：(0,5)→"1x6"', () => {
    expect(rulerReadoutText(0, 5)).toBe('1x6');
  });
  it('⑤ 1×1（光标压锚格）→ null（`num>1||num2>1` 门）——旧「无门恒显 1x1」退化值', () => {
    expect(rulerReadoutText(0, 0)).toBe(null);
  });
});

describe('标尺线 α 门与淡出（Main.cs:47056-47066 + :47104）', () => {
  it('① speed≤2 满幅 0.8;线性段 5→0.4;6→0.8×(1−4/6)', () => {
    expect(rulerLineAlpha(0)).toBeCloseTo(0.8);
    expect(rulerLineAlpha(2)).toBeCloseTo(0.8);
    expect(rulerLineAlpha(5)).toBeCloseTo(0.4);
    expect(rulerLineAlpha(6)).toBeCloseTo(0.8 * (1 - 4 / 6));
  });
  it('② speed>6 → null（:47056-47058 整段早退,非 α=0 兜底）', () => {
    expect(rulerLineAlpha(6.01)).toBe(null);
    expect(rulerLineAlpha(30)).toBe(null);
  });
});

describe('网格淡出驱动=残影滞后距离（Main.cs:47151-47156）', () => {
  it('① num3 边界：静止 0.7 / dist≥6 钳 0.2 / dist=3 → 0.45', () => {
    expect(rulerGridFade(0)).toBeCloseTo(0.7);
    expect(rulerGridFade(6)).toBeCloseTo(0.2);
    expect(rulerGridFade(10)).toBeCloseTo(0.2);
    expect(rulerGridFade(3)).toBeCloseTo(0.45);
  });
  it('② 旧「瞬时速度当驱动」退化值对照：行走 |v|=2.5 → 旧 0.492 / 新(dist≈4×2.5=10) 0.2', () => {
    const oldSpeedBased = 0.2 + 0.5 * Math.max(0, Math.min(1, 1 - 2.5 / 6));
    expect(oldSpeedBased).toBeCloseTo(0.4917, 3);    // 旧值（红灯基线）
    expect(rulerGridFade(10)).toBeCloseTo(0.2);      // 新=4~5 拍位移窗口
  });
});

describe('social shadow 3 拍轮转（Player.cs:16699-16728;网格淡出驱动源）', () => {
  it('★SW-RB14d ① ctor=原版 Spawn 冲洗后态：[0]=出生位,[1]=[2]=零向量（:37927-37932 ' +
    'ResetAdvancedShadows+3×UpdateSocialShadow——count 0→1→2→0 只写 [0]）', () => {
    const p = new Player(100, 200, new Inventory());
    // 行为面验证（spX 私有）：首拍 count1 时 [2]<=[1]=0 ⇒ dist=当前位
    p.x = 110; p.updateSocialShadow();
    expect(p.shadowLagDist()).toBeCloseTo(Math.hypot(110, 200));   // 旧刀 [x,x,x] 退化值=10（开局网格恒亮=偏离原版暗窗）
    expect(rulerGridFade(p.shadowLagDist())).toBeCloseTo(0.2);   // dist≥6 钳下档=原版开局暗 4 拍
  });
  it('② 稳态 shadowPos[2] 滞后 4 拍：每拍 +10px,第 4 拍 dist=40（6 拍暖机入稳态）', () => {
    const p = new Player(100, 200, new Inventory());
    for (let i = 0; i < 6; i++) { p.x = 100; p.updateSocialShadow(); }   // 暖机:[0..2] 全 100、count=0
    expect(p.shadowLagDist()).toBe(0);
    p.x = 110; p.updateSocialShadow();   // count1: [2]<=[1]=100
    expect(p.shadowLagDist()).toBeCloseTo(10);
    p.x = 120; p.updateSocialShadow();   // count2: [1]<=[0]=100
    p.x = 130; p.updateSocialShadow();   // count0: [0]=130
    p.x = 140; p.updateSocialShadow();   // count1: [2]=[1]=100
    expect(p.shadowLagDist()).toBeCloseTo(40);        // |140−100| = 4 拍位移
    p.x = 150; p.updateSocialShadow();   // count2
    p.x = 160; p.updateSocialShadow();   // count0: [0]=160
    p.x = 170; p.updateSocialShadow();   // count1: [2]=[1]=130
    expect(p.shadowLagDist()).toBeCloseTo(40);        // 稳态窗口恒 4 拍
  });
  it('③ 静止 → dist=0 ⇒ 网格满幅 0.7', () => {
    const p = new Player(50, 60, new Inventory());
    for (let i = 0; i < 6; i++) p.updateSocialShadow();
    expect(p.shadowLagDist()).toBe(0);
    expect(rulerGridFade(p.shadowLagDist())).toBeCloseTo(0.7);
  });
  it('④ shadowPos[0] 写点含 gfxOffY（:16723 `shadowPos[0].Y += gfxOffY`）', () => {
    const p = new Player(0, 0, new Inventory());
    p.gfxOffY = 8;
    for (let i = 0; i < 7; i++) p.updateSocialShadow();   // 7 拍入稳态:[2]=(0,8)（t4 时 [2] 仍 0）
    expect(p.shadowLagDist()).toBeCloseTo(Math.hypot(0, 8));
  });
});

describe('fixedUpdate 相位（:24885 每拍恰一次,移动前）', () => {
  it('updateSocialShadow 推进 shadowCount 环 1→2→0（不移位不重复）', () => {
    const p = new Player(0, 0, new Inventory());
    p.updateSocialShadow();
    expect(p.shadowCount).toBe(1);
    p.updateSocialShadow();
    expect(p.shadowCount).toBe(2);
    p.updateSocialShadow();
    expect(p.shadowCount).toBe(0);                   // ≥3 归零并写 [0]
  });
});

// ============================================================
// ★SW-清债③ 2026-09-17：W×H 读数黑幕层位结构锁（FX36 同族黑幕残差清偿）。
//  金标：DrawInterface_33_MouseText :46187-46195 属 DrawInterface :63386（黑幕
//  :63367-63381 之后;1458 :63373-63392 同序）⇒ 读数恒在黑幕上;mapFullscreen
//  :63385 整层门/拍照 CheckCaptureManager 截断 ⇒ 全屏地图/拍照重渲不画。本仓
//  落位=步骤 11b'（呼吸计 11b 之后、死亡画面 12 之前）;回挂旧位（步骤 7a''、
//  黑幕之前）即红。变异证红：绘制块整体剪切回 7a'' 位 → ①红;挪到 12b/13 之后
//  → ②红。
// ============================================================
describe('W×H 读数绘制位=黑幕之后/HUD 尾段（Renderer 结构锁,清债③）', () => {
  const rendererSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src/render/Renderer.ts'), 'utf8');
  const at = (s: string): number => rendererSrc.indexOf(s);

  it('① 读数消费位在黑幕块（BJ103-A1）之后——11 帧渐熄窗不再压暗（回挂黑幕前即红）', () => {
    const iFade = at('if (this.blackFadeIn > 0) {');
    const iReadout = at('if (this.rulerReadout) {');
    expect(iFade).toBeGreaterThan(-1);
    expect(iReadout).toBeGreaterThan(iFade);
    expect(rendererSrc.slice(0, iFade)).not.toContain('if (this.rulerReadout) {');
  });
  it('② 层内序：资源条(11)/呼吸计(11b)在其下,死亡画面(12)/交互图标(12b)/MouseText 收尾(13)在其上', () => {
    const iReadout = at('if (this.rulerReadout) {');
    expect(iReadout).toBeGreaterThan(at('this.fancyBars.draw('));
    expect(iReadout).toBeGreaterThan(at('this.breathMeter.draw('));
    expect(iReadout).toBeLessThan(at('if (player.dead) this.drawDeathScreen('));
    expect(iReadout).toBeLessThan(at('this.drawCursorItemIcon(ctx, player);'));
    expect(iReadout).toBeLessThan(at('this.drawMouseTextLayer(ctx, player);'));
  });
});

// ============================================================
// ★BJ422 2026-10-01（用户实报：①标尺网格约 140 英尺阴影带消失,不严格按深度——
//  走两步又见=位置相关;②黑暗地牢格子应亮青显示,本仓随光照减弱而消失/变暗）。
//  定谳：原版标尺两件（网格 Main.cs:47146-47224 / 标尺线 :47046-47140）属接口层
//  SetupDrawInterfaceLayers（"Vanilla: Laser Ruler" :45500 / "Vanilla: Ruler"
//  :45505）=世界渲染（逐格顶点采光）之后的【无光直绘】:调色恒量
//  (0.24,0.8,0.9,0.5)×0.4×num3（:47162-47163,驱动=Distance(position,shadowPos[2])
//  残影滞后）/ (0.24,0.8,0.9,1)×0.8×num4（:47103-47104,驱动=velocity.Length()）,
//  【零光照引用、零深度门】;層序 接口层 3/4 < 图格网格 6（:45515）。
//  本仓病灶：调用位曾挂世界层 4.56（compositeLight 之前）→ 全屏乘光把格子按所站
//  格光值压暗,光≈0 即消失（=两症状同根;"140 英尺"只是该处天空环境光衰减尽位,
//  非代码深度阈值——Game.ts 注入门域无任何深度条件）。落刀=挪至 compositeLight
//  之后 7a-pre（主画布重建相机变换）。
//  ★变异证红：①调用位回挪世界层（compositeLight 之前）即红;②绘制体引入
//  lightR/lightB/lightAt/GetColor 任一光照读点即红;③层内序倒转（画到图格网格
//  之后）即红。
// ============================================================
describe('★BJ422 标尺绘制位=光照合成后（接口层 3/4 无光直绘语义）', () => {
  const rendererSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src/render/Renderer.ts'), 'utf8');
  const at = (s: string): number => rendererSrc.indexOf(s);

  it('① 调用位在 compositeLight 之后（回挪世界层 4.56 旧位=乘光病灶,即红）', () => {
    const iLight = at('this.compositeLight(');
    const iRuler = at('this.drawBuilderRulers(');
    expect(iLight).toBeGreaterThan(-1);
    expect(iRuler).toBeGreaterThan(iLight);
    // 全文件唯一调用:compositeLight 之前不得再出现调用点（含 4.56 旧位回潮）
    expect(rendererSrc.slice(0, iLight)).not.toContain('this.drawBuilderRulers(');
  });
  it('② 层内序：标尺(接口层 3/4)在图格网格(接口层 6)之前（Main.cs:45500/:45505 < :45515）', () => {
    expect(at('this.drawBuilderRulers(')).toBeLessThan(at('this.drawBuildingGrid('));
  });
  it('③ 绘制体零光照引用（恒量色直绘锁:引入 lightR/lightB/lightAt/GetColor 读点即红）', () => {
    const iDef = rendererSrc.indexOf('private drawBuilderRulers(');
    expect(iDef).toBeGreaterThan(-1);
    const iDoc = rendererSrc.lastIndexOf('/**', iDef);   // 含方法头定谳注释
    const iNext = rendererSrc.indexOf('\n  private ', iDef + 10);
    const body = rendererSrc.slice(iDoc, iNext);
    expect(body).toMatch(/调色恒量|常量色|无光|零光照/);   // 定谳注释在位（防锁体漂移到别方法）
    expect(body).not.toMatch(/\blight[RGB]\b|\blightAt\b|GetColor|getColor|compositeLight/);
  });
  it('④ ctx 参数化锁（调用方传主画布 ctx;旧 this.ctx 直取=世界层耦合回潮即红）', () => {
    const iDef = rendererSrc.indexOf('private drawBuilderRulers(');
    const iNext = rendererSrc.indexOf('\n  private ', iDef + 10);
    const body = rendererSrc.slice(iDef, iNext);
    expect(body).not.toContain('this.ctx');
    expect(rendererSrc.slice(iDef, iDef + 120)).toMatch(/drawBuilderRulers\(ctx: CanvasRenderingContext2D/);
  });
});
