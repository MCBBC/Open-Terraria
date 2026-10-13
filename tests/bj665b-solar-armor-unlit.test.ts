// BJ665b 四月套甲件恒色 250 自发光——免光实体窗架构（BJ594 登记架构债落地,候选 B）
// ★定谳（原版 1457 亲读,1.4.5.7 反编译唯一标杆）——
//   PlayerDrawSet.cs SetPassColors：num2..num5 四族计件后 `num2=3;num3=3;num4=3;
//   num5=3;`（:515-518）无条件钉满 → 62.5×(1+3)=250 恒值（星尘腿 127×(1+3)=508
//   → (byte) 截断 252,unchecked 截断 508&0xFF）。
//   【恒色覆写】只落两族：
//     · 日耀 Solar   head==171（:589-593）/ body==177（:727-731）/ legs==112
//       （:790-794）= GetImmuneAlphaPure(new Color(250,250,250,255), shadow)
//       ——覆写【替换】 :451-454 Lighting.GetColorClamped 采光基值 = 整件甲不取
//       光照 = 甲身暗处恒亮（自发光甲）。
//     · 星尘 Stardust head==189（:582-588）/ body==190（:689-704）= 250³；
//       legs==130（:800-806）= (byte)(127×4)=252 → 252³。
//     · 漩涡 Vortex（169/175/110）与星云 Nebula（170/176/111）【无恒色覆写】——
//       只有 GlowMask 加色叠层（headGlowMask 15/16、bodyGlowMask 13-18/14-19+12、
//       legsGlowMask 199/17,色 (250,250,250,0) 纯加法）,甲体色保持采光基值=
//       暗处甲身随光变暗+发光条恒亮=原版本相（BJ597 已落其 glow 叠层）。
//       债面陈述「四月套全家恒亮」系 BJ594 概括口径,逐支亲读只有两族覆写。
//   GetImmuneAlphaPure（Player.cs:54834-54846）= Color.Multiply(newColor,
//   (255−immuneAlpha)/255 × (1−shadow) × (1−shimmerTransparency))——常态 ×1 恒等,
//   250³ 原值直出。
//   【架构】（BJ594 候选对拍,亲读原版层序 LegacyPlayerRenderer.cs:163-262 后定谳）：
//     原版逐 DrawData 带各自 color 顺序画=天然逐件异色;甲件三站 13_Leggings/
//     17_Torso/21_Head 之上还有 18-38 层组（18_OffhandAcc…22_FaceAcc…23_MountFront
//     …26_SolarShield < 27_HeldItem < 28_ArmOverItem…29_OnhandAcc…32_FrontAcc…
//     37_BeetleBuff）——α=1 只重绘甲件必盖手持物/身前配饰=层序倒转（候选 C,禁）。
//     拆独立窗（候选 A）在 lit 批架构下仍须把「被盖层」合成到 unlit 窗之上=与候选
//     B 同收敛面且多两道全窗合成;候选 B（甲件逃逸队列重绘+被盖层随迁同域）复用
//     五族逃逸队列判例（BJ509/594/597/601/eyebrella）=定谳落地。
//     落地面：恒色甲件从 lit 烘焙面烘除（PaperDoll lunarSplit/lunarPart）→
//     lunarArmorQueue 合成后重绘（flushLunarArmor,位次=甲位 glow 前=星尘 glow
//     叠层在其上=原版逐件后随叠画序）;被盖层三重定向窗（R1 浮游圈前半/R2 滑轮+
//     身前配饰/R3 手持物+挥舞+甲虫 orb+坐骑前层+矿车）区域 scratch 全亮重放→
//     玩家中心 lightAt 一次性烘焙（multiply+destination-in,eyebrella 同式;BJ596
//     「采样点差」既有惯例）→ flushLunarCovered 在甲位 glow 后、itemGlow 前重放。
//   【批】LUNAR_CONST_BATCH：1=日耀（用户实报域）→ 2=+星尘（同机制+legs 252）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lunarConstPieceOf, lunarConstPieces, lunarArmorFlushTint, LUNAR_CONST_BATCH,
} from '../src/data/vanillaLunarArmor';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { statOfInternal } from '../src/data/vanillaItemStats';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDR = readFileSync(join(HERE, '..', 'src/render/Renderer.ts'), 'utf8');
const PD = readFileSync(join(HERE, '..', 'src/player/PaperDoll.ts'), 'utf8');
const MOD = readFileSync(join(HERE, '..', 'src/data/vanillaLunarArmor.ts'), 'utf8');

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

// ============ ① 四月套判定 + 恒色式锁 ============

describe('BJ665b ①：恒色甲位判定（PlayerDrawSet.cs SetPassColors 逐支亲读）', () => {
  it('数据面对账：四套物品绘制槽（hs/bs/ls）= 判定键（渲染端 dollEquip 同源）', () => {
    // 日耀 2763/2764/2765、星尘 3381/3382/3383、漩涡 2757/2758/2759、
    // 星云 2760/2761/2762（vanillaArmorSets.ts 三元组表）
    const q = (vid: number) => statOfInternal(_iid(vid));
    expect(q(_iid(2763))?.hs).toBe(171);
    expect(q(_iid(2764))?.bs).toBe(177);
    expect(q(_iid(2765))?.ls).toBe(112);
    expect(q(_iid(3381))?.hs).toBe(189);
    expect(q(_iid(3382))?.bs).toBe(190);
    expect(q(_iid(3383))?.ls).toBe(130);
    expect(q(_iid(2757))?.hs).toBe(169);
    expect(q(_iid(2758))?.bs).toBe(175);
    expect(q(_iid(2759))?.ls).toBe(110);
    expect(q(_iid(2760))?.hs).toBe(170);
    expect(q(_iid(2761))?.bs).toBe(176);
    expect(q(_iid(2762))?.ls).toBe(111);
  });

  it('恒色式：日耀 171/177/112 → 250³（62.5×(1+num4=3),:589-593/:727-731/:790-794）', () => {
    expect(lunarConstPieceOf(171)).toBe(250);
    expect(lunarConstPieceOf(177)).toBe(250);
    expect(lunarConstPieceOf(112)).toBe(250);
  });

  it('恒色式：星尘 189/190 → 250、legs 130 → 252（(byte)(127×4)=508&0xFF 截断,:800-806）', () => {
    expect(lunarConstPieceOf(189)).toBe(250);
    expect(lunarConstPieceOf(190)).toBe(250);
    expect(lunarConstPieceOf(130)).toBe(252);
  });

  it('漩涡/星云【无恒色覆写】（:521-526/:576-581/:641-653/:705-719/:746-751/:779-789 只有 GlowMask）', () => {
    expect(lunarConstPieceOf(169)).toBeNull();   // VortexHelmet
    expect(lunarConstPieceOf(175)).toBeNull();   // VortexBreastplate
    expect(lunarConstPieceOf(110)).toBeNull();   // VortexLeggings
    expect(lunarConstPieceOf(170)).toBeNull();   // NebulaHelmet
    expect(lunarConstPieceOf(176)).toBeNull();   // NebulaBreastplate
    expect(lunarConstPieceOf(111)).toBeNull();   // NebulaLeggings
  });

  it('邻位/无甲判别力（+1/-1 与 0 位全 null）', () => {
    for (const id of [172, 178, 113, 188, 191, 129, 168, 174, 109, 0, 156]) {
      expect(lunarConstPieceOf(id)).toBeNull();
    }
  });

  it('lunarConstPieces：三件套/混搭/全无（混搭=逐件判定,不要求全身）', () => {
    expect(lunarConstPieces(171, 177, 112)).toEqual({ head: 250, body: 250, legs: 250 });
    expect(lunarConstPieces(189, 190, 130)).toEqual({ head: 250, body: 250, legs: 252 });
    expect(lunarConstPieces(171, 176, 110)).toEqual({ head: 250, body: null, legs: null });  // 日耀头+星云身
    expect(lunarConstPieces(0, 190, 0)).toEqual({ head: null, body: 250, legs: null });      // 单星尘胸甲
    expect(lunarConstPieces(0, 0, 0)).toBeNull();
    expect(lunarConstPieces(169, 175, 110)).toBeNull();   // 漩涡全套=零进入（lit 窗原路径）
    expect(lunarConstPieces(170, 176, 111)).toBeNull();   // 星云全套=零进入
  });

  it('批闸：LUNAR_CONST_BATCH≥2（星尘在批2同刀落）;漩涡/星云永不入表', () => {
    expect(LUNAR_CONST_BATCH).toBeGreaterThanOrEqual(2);
    expect(MOD).toContain('LUNAR_CONST_BATCH = 2');
    expect(MOD).toContain('漩涡/星云不恒色');
  });

  it('flush tint 合成：恒色÷255 × 甲潜行乘区（mul=1 → 250/255 恒等直出,星尘腿 252/255）', () => {
    const t1 = lunarArmorFlushTint(250, [1, 1, 1]);
    expect(t1[0]).toBeCloseTo(250 / 255, 12);
    expect(t1[1]).toBeCloseTo(250 / 255, 12);
    expect(t1[2]).toBeCloseTo(250 / 255, 12);
    const t2 = lunarArmorFlushTint(252, [1, 1, 1]);
    expect(t2[2]).toBeCloseTo(252 / 255, 12);
    // 潜行 armorMul（3106 B×settled 档 :1539-1541）逐通道乘
    const t3 = lunarArmorFlushTint(250, [0.5, 0.5, 0.4]);
    expect(t3[0]).toBeCloseTo(250 / 255 * 0.5, 12);
    expect(t3[2]).toBeCloseTo(250 / 255 * 0.4, 12);
  });
});

// ============ ②③ 暗处恒亮 / 日光不褪（恒色不取光照） ============

describe('BJ665b ②③：甲件重绘免光照（lightAt=[0,0,0] 下甲件仍=texRGB×250/255）', () => {
  it('flushLunarArmor 不消费 lightAt（恒色=GetImmuneAlphaPure 链常态×1,无 Lighting 项）', () => {
    const fn = RDR.slice(RDR.indexOf('private flushLunarArmor'), RDR.indexOf('private flushLunarCovered'));
    expect(fn).toContain('flushLunarArmor');
    expect(fn).not.toContain('lightAt');          // 恒色面禁采光（②③判别面）
    expect(fn).not.toContain('fullbright');       // 开灯/黑暗同值=自发光（全亮无特判面）
    expect(fn).toContain('lunarArmorFlushTint');  // tint=恒色÷255×乘区（乘区≠光照）
  });

  it('tint 只含恒色×甲潜行乘区（bright 与 dark 场景同 tint=日光不褪/暗处恒亮同一面）', () => {
    // flush 侧唯一 RGB 乘区源 = e.mul（armorDoll 同式 :1539-1541/:1641-1644 潜行族）,
    // 无光照项 → 光档变化不进 tint（与 lit 窗全屏乘光相分异=债面修复本体）
    const fn = RDR.slice(RDR.indexOf('private flushLunarArmor'), RDR.indexOf('private flushLunarCovered'));
    expect(fn).toContain('e.mul');
    expect(fn).toContain("dollFrameRows(tinted, e.rows)");
    expect(fn).toContain('-ff.sh + 4');           // dest=doll 贴底 +4 pad 同式
  });

  it('lit 主烘焙面烘除恒色件（暗处甲身不再吃 compositeLight 全屏乘光）', () => {
    expect(PD).toContain('lunarSplit');
    expect(PD).toContain("lunarPart?: 'upper' | 'legs'");
    // 三甲位常规面烘除门（legs/body/head 三站逐支）
    expect(PD).toContain("lunarPartOn ? lunarLegsC != null : lunarLegsC == null");
    expect(PD).toContain('const bodyCellsOn = lunarPartOn ? lunarBodyC != null : lunarBodyC == null;');
    expect(PD).toContain("lunarPartOn ? lunarHeadC != null : lunarHeadC == null");
    // 皮肤垫照画（原版 12_Skin 语义:甲下皮肤先画,lit 窗被恒色件整盖）——
    // 门在取图处（C13-F2/SW-BJ11 源文锁行字节不动）
    expect(PD).toContain('const skinLegsImg = showSkinUnderLegs && !lunarPartOn');
    expect(PD).toContain('const torsoSkin = !lunarPartOn ? sheetRect(a.skinVariant, 3) : null;');
  });

  it('非月辉玩家零进入（lunarOpt 空 = 烘焙键/路径逐位同旧）', () => {
    expect(RDR).toContain('const lunarOpt = lunarSplit ? { lunarSplit: true } : {};');
  });
});

// ============ ④ 层序锁（手持物/配饰盖甲件=原版序不倒） ============

describe('BJ665b ④：层序锁（候选 B=甲件+被盖层随迁,禁 C 裸重绘）', () => {
  it('flush 槽序：甲件 → 甲位 glow → 被盖层 → 手持光罩（原版 glow 逐件后随 < 22 脸饰 < 27 手持物 < 光罩）', () => {
    const iWing = RDR.indexOf('this.flushWingGlow(cam, z);');
    const iArmor = RDR.indexOf('this.flushLunarArmor();');
    const iGlow = RDR.indexOf('this.flushArmorGlow();');
    const iCover = RDR.indexOf('this.flushLunarCovered();');
    const iItem = RDR.indexOf('this.flushItemGlow();');
    expect(iArmor).toBeGreaterThan(iWing);
    expect(iGlow).toBeGreaterThan(iArmor);
    expect(iCover).toBeGreaterThan(iGlow);
    expect(iItem).toBeGreaterThan(iCover);
  });

  it('R1/R2/R3 三重定向窗按原版序排列（R1 浮游圈前半 < R2 滑轮+身前配饰 < R3 手持物/坐骑前层）', () => {
    const iR1 = RDR.indexOf('const covR1 =');
    const iR2 = RDR.indexOf('const covR2 =');
    const iR3 = RDR.indexOf('const covR3 =');
    expect(iR1).toBeGreaterThan(0);
    expect(iR2).toBeGreaterThan(iR1);
    expect(iR3).toBeGreaterThan(iR2);
    // 三窗都走同一会话机（区域 scratch 全亮重放+采光烘焙）
    expect(RDR.match(/lunarCoverBegin\(ctx, p\)/g)?.length).toBe(3);
    expect(RDR.match(/lunarCoverEnd\(covR/g)?.length).toBe(3);
  });

  it('R3 窗=手持物+挥舞+甲虫 orb+坐骑前层+矿车（原版 27/37/23 层组,甲件恒色重绘在其下）', () => {
    const r3 = RDR.slice(RDR.indexOf('const lunarR3Content'), RDR.indexOf('if (covR3) { this.lunarCoverEnd(covR3)'));
    expect(r3).toContain('heldDraw');
    expect(r3).toContain('this.drawUseItem(ctx, p, swing, flicker)');
    expect(r3).toContain('beetleDef');
    expect(r3).toContain("this.drawMountLayer(ctx, p, mnt, 'front'");
    expect(r3).toContain('cart.textureGlow');   // 矿车发光层随窗
  });

  it('R2 窗=滑轮+身前配饰族;R1 窗=浮游圈前半（被盖层随迁清单）', () => {
    const r2 = RDR.slice(RDR.indexOf('const covR2 ='), RDR.indexOf('if (covR2) { this.lunarCoverEnd(covR2)'));
    expect(r2).toContain('this.drawPulleyLayer(ctx, p, !!swing)');
    expect(r2).toContain('this.drawAccFrontLayers(');
    const r1 = RDR.slice(RDR.indexOf('const covR1 ='), RDR.indexOf('if (covR1) { this.lunarCoverEnd(covR1)'));
    expect(r1).toContain('tubeDraw(56,');
  });

  it('被盖层重放带光照烘焙（lit 语义保持——multiply+destination-in,fullbright 跳过）', () => {
    const end = RDR.slice(RDR.indexOf('private lunarCoverEnd'), RDR.indexOf('private lunarCoverEnd') + 2400);
    expect(end).toContain('lightAt');                       // 玩家中心采光（BJ596 采样点差惯例）
    expect(end).toContain("'multiply'");
    expect(end).toContain("'destination-in'");
    expect(end).toContain('this.fullbright');               // 开灯=世界无乘光同相
    // itemGlow 窗内推送矩阵回改（重定向态→真矩阵,重放坐标闭包不变）
    expect(end).toContain('glowMark');
    expect(end).toContain('this.itemGlowQueue[i].m = s.m');
  });

  it('双绘去重：首遍收集完标记（坐椅/睡床早绘+主段=次遍回内联,lit 窗被队列版覆盖）', () => {
    expect(RDR).toContain('lunarCoverCollected = new WeakSet()');
    expect(RDR).toContain('if (lunarHoist != null) this.lunarCoverCollected.add(p);');
  });

  it('恒色甲件队列位次=甲位 glow 前（星尘 GlowMask 叠层在甲件之上=原版逐件后随叠画序）', () => {
    const iAg = RDR.indexOf("this.armorGlowQueue.push({ m: ctx.getTransform(), k: this._worldLowK, ops: agOps })");
    const iLunar = RDR.indexOf('this.lunarArmorQueue.push({', iAg);
    expect(iAg).toBeGreaterThan(0);
    expect(iLunar).toBeGreaterThan(iAg);   // 同收集块内,agOps 先入（glow 叠层重放序在甲件后）
    expect(RDR).toContain('armorGlowCollected.add(p)');
  });

  it('BJ594 stamps/残影覆盖恒色件面（stamps=全层组×GetImmuneAlphaPure(shadow),甲色=250³×k）', () => {
    // ★2026-10-12 结构刀改形：outline 四印同 k 同源 → 亮度栈一次合成（putPiece 入
    //   solarStampScratch）+逐印平绘（globalAlpha×k 语义不变）;残影（异 k）保留逐印。
    expect(RDR).toContain('putPiece(lunarUpper, 250)');
    expect(RDR).toContain('putPiece(lunarLegsBake, lunar?.legs ?? 250)');
    expect(RDR).toContain('stampLunarPiece(lunarUpper, 250, g.lx, g.ly)');
    expect(RDR).toContain('ctx.globalAlpha *= s.k');   // 逐印 α×k 语义锁
  });
});

// ============ ⑤ 回归面五件锁 ============

describe('BJ665b ⑤：回归面（BJ401/599/604/594/631 + 四月套其余两族）', () => {
  it('BJ401 mount 61 隐藏族：DontHoldItems 门仍上游于 heldDraw（R3 content 门不吃 held）', () => {
    const r3 = RDR.slice(RDR.indexOf('const lunarR3Content'));
    const iDontHold = RDR.indexOf('DontHoldItems?.[p.mount.type] ?? false');
    expect(iDontHold).toBeGreaterThan(0);
    const iHeldAssign = RDR.indexOf('heldDraw = { vid');
    expect(iHeldAssign).toBeGreaterThan(iDontHold);   // 禁持三骑 heldDraw 不赋值=窗内容量门即关
  });

  it('BJ599 手持潜行减色 / BJ604 bake/boost 分解未受扰（R3 窗内 dimF 链+armorGlow 收集原样）', () => {
    const r3 = RDR.slice(RDR.indexOf('const covR3 ='), RDR.indexOf('if (covR3) { this.lunarCoverEnd(covR3)'));
    expect(r3).toContain('heldItemStealthDim(');
    expect(r3).toContain('dimmedHeldRegion(');
    expect(r3).toContain('collectHeldItemGlow(');
    expect(RDR).toContain('armorGlowBakeBoost');   // BJ604 件3 两旋钮分解（vanillaArmorGlow 侧）
    expect(RDR).toContain('armorGlowOps({');
  });

  it('BJ594 stamps 数学/门未受扰（solarSetFull 门+outline+残影仍在 lit 窗本体前）', () => {
    expect(RDR).toContain('const solarSetFull = isSolarFlareFullSet(');
    expect(RDR.indexOf('solarOutlineStamps(p.ghostFade)')).toBeGreaterThan(0);
    expect(RDR.indexOf('for (const g of downDashGhostStamps(p, p.shadowRing()))')).toBeGreaterThan(0);
  });

  it('BJ631 头甲染料：恒色头甲件面走同一染料烘焙块（dyeHead 不旁路）', () => {
    // PaperDoll 头甲块唯一,gate 只改【画不画】,染料链（dyeBakeArmorSprite）在块内=两路共用
    const headBlock = PD.slice(PD.indexOf('const headArmor = UITextures.get(`Armor_Head_'));
    expect(headBlock).toContain('dyeBakeArmorSprite(headArmor.img, equip.dyeHead)');
    // 缓存键含染料+拆分旗（恒色件面与常规面不同键,不串缓存）
    expect(PD).toContain('|ls');
    expect(PD).toContain('|lp');
    expect(PD).toContain('|dh');
  });

  it('漩涡/星云零回归：判定 null → lunarOpt 空 → 烘焙键无 |ls 段（BJ597 glow 叠层不受扰）', () => {
    expect(lunarConstPieces(169, 175, 110)).toBeNull();
    expect(lunarConstPieces(170, 176, 111)).toBeNull();
    expect(RDR).toContain("import { lunarConstPieces, lunarArmorFlushTint, type LunarConstPieces } from '../data/vanillaLunarArmor'");
    expect(RDR).toContain('this.flushArmorGlow()');   // BJ597 glow 冲刷仍在
  });

  it('坐椅/睡床双绘与迅猛龙藏身支不双份（armorGlowCollected 同集去重+velo 头甲件面）', () => {
    // velo 支：恒色头甲单独成件（CanDrawOnVelociraptorMount 门内头盔照画,原版色=恒色同域）
    const velo = RDR.slice(RDR.indexOf('const vl = lunarConstPieces'), RDR.indexOf('this.drawEyelid(ctx, p, vr.body, 4'));
    expect(velo).toContain("lunarPart: 'upper'");
    expect(velo).toContain('this.armorGlowCollected.add(p)');
    // 主支 armor 入队在 glow 收集块内（armorGlowCollected.has 门=双绘去重免费）
    const iCollect = RDR.indexOf('if (!this.armorGlowCollected.has(p)) {');
    expect(iCollect).toBeGreaterThan(0);
    const blk = RDR.slice(iCollect, iCollect + 1800);
    expect(blk).toContain('armorGlowCollected.add(p)');
    expect(blk).toContain('this.lunarArmorQueue.push({');
  });

  it('被盖层窗与坐椅 restore 边界（窗在坐椅收口前闭合——restore 作用于主 ctx 栈）', () => {
    const iEnd = RDR.indexOf('if (covR3) { this.lunarCoverEnd(covR3)');
    const iSit = RDR.indexOf('if (p.sitting) ctx.restore();   // 坐椅偏移收口');
    expect(iEnd).toBeGreaterThan(0);
    expect(iSit).toBeGreaterThan(iEnd);
  });

  it('SCRATCH/池生命周期：只扩不缩+上限 1024+池回收（BJ311 内存判例域）', () => {
    const box = RDR.slice(RDR.indexOf('private lunarCoverBox'), RDR.indexOf('private lunarCoverBegin'));
    expect(box).toContain('Math.min(1024');
    const begin = RDR.slice(RDR.indexOf('private lunarCoverBegin'), RDR.indexOf('private lunarCoverEnd'));
    expect(begin).toContain('this.lunarCovPool.pop()');
    expect(begin).toContain('cv.width < w || cv.height < h');
    const flush = RDR.slice(RDR.indexOf('private flushLunarCovered'), RDR.indexOf('★BJ597 甲位 GlowMask 冲刷'));
    expect(flush).toContain('this.lunarCovPool.push(e.cv)');
    expect(flush).toContain('this.lunarCovPool.length < 8');
  });
});
