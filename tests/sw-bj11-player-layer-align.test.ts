// SW-BJ11 2026-09-07 角色头/身分离·悬空 收口回归锚。
// 定谳(scripts/_swbj11-matrix.mjs + _swbj11-race.mjs,独立原版式渲染器逐像素对拍):
//  根因一【冷烘焙毒化】:compositePaperDoll 变体通道就绪门为 `!ready(v)&&!ready(0)` OR
//    兜底——变体表(如 Player_4_3.png,清单内、在途)未载而男表已载时放行,sheetRect
//    逐表回退=混烘:女角色躯干/底衫/衬衫取男表 (0,2) 格=空 → 胸口/衣摆中缝缺失露
//    背景 + 腿取男式加宽;appearanceKey 不含实际用表 → 混合烘焙被缓存定格 =
//    「头部与身体分离/悬空,穿装备后更明显」(冷烘 80px 差,预载+清缓存后 0 差)。
//  根因二【甲下皮肤缺画】:12_Skin_Composite :1279-1286 皮肤躯干(3)在 !hidesTopSkin
//    时与甲无关先画、:1289 皮肤腿(10)只被 IsBottomOverridden 压制——本仓甲在位即
//    整替 → 女式胸甲镂空处 12px 露背景、镂空腿甲族缺肤。
//  根因三【行走 bob 缺失】:OffsetsPlayerHeadgear(Main.cs:530)行 7-9/14-16 为 (0,0)
//    → 复合组件(躯干/双臂/双肩)在四层出处(Skin_Composite :1293 / BackArmShirt
//    :1311 / TorsoComposite :1996 / ArmOverItemComposite :3700)整体 −2px;本仓恒 0
//    → 行走周期 6/14 帧躯干比原版低 2px。
// 修复后矩阵 97 状态(男/女 × 裸发0/1/2 × 全 20 帧 + 甲族1-5 × 7 行)逐像素 0 差。
// 本文件=结构锁(源文本锚)+数据锁(反编译表值),防三根因静默回退。纯 node,无 DOM。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { petArmParams } from '../src/player/PaperDoll';

const src = readFileSync(new URL('../src/player/PaperDoll.ts', import.meta.url), 'utf8');
const uitex = readFileSync(new URL('../src/vui/assets/UITextures.ts', import.meta.url), 'utf8');
const atlasSrc = readFileSync(new URL('../src/assets/SpriteAtlas.ts', import.meta.url), 'utf8');

// ===================== ① 冷烘焙毒化根治:变体通道就绪门 =====================
describe('SW-BJ11 ① 变体通道就绪门(清单感知,禁 OR 兜底混烘)', () => {
  it('门=清单含变体表⇒必须等变体表;仅清单缺省才回退 Player_0_*', () => {
    // 判据表达式逐字锁死(混合烘焙的入口就在这行)
    expect(src).toContain('if (!ready(UITextures.has(vName) ? vName : `Player_0_${s}.png`)) return null;');
    expect(src).toContain('const vName = `Player_${a.skinVariant}_${s}.png`;');
    // 旧 OR 门必须消失(回写即毒化复发)
    expect(src).not.toContain('!ready(`Player_${a.skinVariant}_${s}.png`) && !ready(`Player_0_${s}.png`)');
  });

  it('UITextures.has = atlas.uiFileExists 直通(清单=构建期磁盘真相,零请求)', () => {
    expect(uitex).toContain('has(name: string): boolean');
    expect(uitex).toContain('atlas.uiFileExists(name.endsWith(\'.png\') ? name : `${name}.png`)');
    expect(atlasSrc).toContain('uiFileExists(name: string): boolean');
    expect(atlasSrc).toContain('return name in this.uiFiles;');
  });

  it('就绪门按实际绘制面收窄:甲下仍画的表不得被剪(3=皮肤躯干/10=皮肤腿)', () => {
    // 腿甲:裤/鞋(11/12)剪;皮肤腿(10)仅坐姿剪(hidesBottomSkin,PlayerDrawSet.cs:1244)
    expect(src).toContain('if (useLegsArmor && (s === 11 || s === 12)) continue;');
    expect(src).toContain('if (useLegsArmor && s === 10 && sitGate) continue;');
    // 身甲:只剪 4-8/13(衣着/臂);3(皮肤躯干)必须保留就绪要求
    expect(src).toContain('if (useBodyArmor && BODY_UNDER_ARMOR_PRUNE.has(s)) continue;');
    expect(src).toContain('const BODY_UNDER_ARMOR_PRUNE = new Set([4, 5, 6, 7, 8, 13]);');
    expect(src).not.toContain('const BODY_COMPOSITE_SHEETS');   // 旧剪集含 3=毒化复发面
  });
});

// ===================== ② 甲下皮肤(12_Skin_Composite !hidesTopSkin / IsBottomOverridden) =====================
describe('SW-BJ11 ② 甲下皮肤躯干/皮肤腿(与甲无关先画)', () => {
  it('皮肤躯干(3)画在身甲下:hidesTopSkin 门={82,83,93,21,22}(PlayerDrawSet.cs:1789)', () => {
    expect(src).toContain('const HIDES_TOP_SKIN_BODIES = new Set([82, 83, 93, 21, 22]);');
    // 整烘甲支与 stealth skin 层两处都要画(否则潜行拆层甲下露肤面分叉)
    const draws = src.split('if (!HIDES_TOP_SKIN_BODIES.has(equip?.body ?? 0)) {').length - 1;
    expect(draws).toBe(2);
    expect(src).toContain('drawTinted(torsoSkin, torsoX, dy, a.skinColor)');
  });

  it('皮肤腿(10)画在腿甲下:白名单外照画;袍/裙族=ShouldOverrideLegs_CheckPants(:1219-1240)', () => {
    expect(src).toContain('const LEGS_HIDE_SKIN = new Set([55, 63, 67, 106, 138, 140, 143, 217, 222, 226, 228]);');
    expect(src).toContain('const showSkinUnderLegs = !sit && !LEGS_HIDE_SKIN.has(equip?.legs ?? 0);');
    // 层序:皮肤腿先、腿甲后(甲叠于肤上)
    const under = src.indexOf('if (skinLegsTinted) ctx.drawImage(skinLegsTinted');
    const armor = src.indexOf('ctx.drawImage(legsArmor.img, 0, row * FRAME_H', under);
    expect(under).toBeGreaterThan(-1);
    expect(armor).toBeGreaterThan(under);
  });
});

// ===================== ③ 行走 bob(OffsetsPlayerHeadgear 行偏移) =====================
describe('SW-BJ11 ③ 复合组件行走 bob(Main.cs:530 行表)', () => {
  it('bob 行集 = OffsetsPlayerHeadgear.Y==0 行 {7,8,9,14,15,16}', () => {
    expect(src).toContain('const COMPOSITE_BOB_ROWS = new Set([7, 8, 9, 14, 15, 16]);');
    expect(src).toContain('const hgY = COMPOSITE_BOB_ROWS.has(row) ? -2 : 0;');
  });

  it('hgY 消费面:平移支 dest 与 petting 旋转支 pivot 都要吃 −2(位置移/pivot 不移)', () => {
    // 平移支两处(drawTinted/drawArmorCell)+ 旋转支两处 = 4 个 dest/pivot 锚
    expect(src.split('0, i * FRAME_H + hgY, FRAME_W, FRAME_H').length - 1).toBe(2);
    expect(src.split('ctx.translate(PET_ARM_PIVOT[0], i * FRAME_H + PET_ARM_PIVOT[1] + hgY);').length - 1).toBe(2);
  });
});

// ===================== ④ 数据锁:复合帧表/门表与反编译逐值(防漂移) =====================
describe('SW-BJ11 ④ 数据锁(CreateCompositeData/CheckPants 表值)', () => {
  it('ARM_FRAME 与 PlayerDrawSet.cs:1965-2036 switch 逐值一致(抽查代表行)', () => {
    // case0 (2,0)/case5 (2,1)+躯干X=1/case8 (4,1)/case14 (5,1)/case18,19 (3,1)
    expect(src).toContain('[2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [2, 1], [3, 1],');
    expect(src).toContain('[4, 1], [4, 1], [4, 1], [4, 1], [3, 1], [3, 1], [3, 1],');
    expect(src).toContain('[5, 1], [6, 1], [6, 1], [5, 1], [3, 1], [3, 1],');
  });

  it('petArmParams 相位解算不受本次刀扰动(守恒链)', () => {
    expect(petArmParams(0, false)).toEqual({ stretch: 1, rot: -Math.PI * 2 * 0.3 });
    expect(petArmParams(1, false)).toEqual({ stretch: 0, rot: -Math.PI * 2 * 0.3 });
    expect(petArmParams(0, true).rot).toBeCloseTo(-Math.PI * 2 * 0.2, 12);
  });
});
