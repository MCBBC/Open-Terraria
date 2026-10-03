// BJ473（2026-10 用户实报+截图）：背包成就入口（AchievementAdvisor 卡）应为原版
// 金框方形钮 + 悬停黄描边——本仓曾为蓝底圆角盒（border #7d92d6 + rgba(33,43,79)
// 底）+ 整卡 brightness(1.2)（病灶：无金框贴图、无黄描边、无灰调差）。
//
// ★定谳（Terarria1457 反编译 = 唯一标杆；Terarria1458 AchievementAdvisor.cs diff 全等）：
//   · 入口位 = AchievementAdvisor.DrawOneAchievement（Main.cs:41758-41763，sw≥1000
//     大卡 scale 0.75；窄屏内联小卡 :42129 scale 0.35；设置面板 DrawOptionsPanel
//     scale 0.5）。
//   · DrawCard（AchievementAdvisor.cs:136-165）三层（绘制序=叠层次序）：
//     ① 图标 = Images/UI/Achievements 帧 64²（暗变体 frame.X += 528 :158——顾问
//       只显卡未完成 → 恒暗变体；本仓 glyphStyle locked 支同源 ACH_ICON_LOCKED_DX）
//     ② 金框 = Images/UI/Achievement_Borders 72² @(−4,−4)×s（:160）——金色烘在
//       贴图内（实描：金体 251,235,188 + 黑描边 0,0,0 + 透明中窗），非绘制层
//     ③ 悬停描边 = scale>0.5 ? MouseHoverThin(76²@−5s) : MouseHover(80²@−8s)
//       ×Main.OurFavoriteColor(255,231,69)（Main.cs:886 / :151-156/:163）→黄描边
//   · 未悬停 tint Color(220,220,220,220)（:147，图标+金框同染）→悬停 Color.White。
//   · 悬停命中 = 图标盒 64²×s（:139 Between(position, position+frame.Size()*scale)
//     ——框 4s 外圈不触发）；沿音 = DoStatefulTickSound（Main.cs:3333-3343，SoundID 12）。
//   · 点击 = 仅左键 → IngameFancyUI.OpenAchievementsAndGoto(card.achievement)
//     （:68-72——开面板+定位到卡面成就）。
//   · 贴图尺寸（ResourcePacksDefaultInfo.tsv:14728-14731）：Achievements 1054×1186 /
//     Borders 72² / MouseHover 80² / MouseHoverThin 76²——本仓 public/sprites/vanilla/
//     四 PNG 实测同尺寸（资产已在库，零追加）。
//   · 按钮组同源框样式普查：面板列表项金框（UIAchievementListItem.cs:63-70，UIImage
//     无 tint = 常态金框）本仓 .sw-ach-icon img.border 已同相（72² 盖 64² 图标、4px
//     外圈）——本刀不动=不回归面。
// ★落刀（src/ui/AchievementsUI.ts 单文件）：advisorFrameGeom() 几何单源 + 卡面
//   重建（金框 img + 预烘黄描边覆盖层 tintedSliceDataUrl(…,255,231,69) + 220/255
//   灰调↔White + 图标盒悬停谓词 + 左键 goto）。竖式文字卡（2026-09-02 用户要求）
//   保留=登记偏差；.sw-ach-inline .tx 锚（vanilla-inv-layout.test.ts:509）不动。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// pngjs 无类型声明（同 tests/atlas-append-golden.test.ts 既有用法）
// @ts-ignore
import { PNG } from 'pngjs';
import { ADVISOR_SCALE, advisorFrameGeom } from '../src/ui/AchievementsUI';
import { ACH_ICON_LOCKED_DX } from '../src/data/vanillaAchievements';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACHTS = readFileSync(join(ROOT, 'src/ui/AchievementsUI.ts'), 'utf8');

function loadPng(name: string): PNG {
  return PNG.sync.read(readFileSync(join(ROOT, 'public/sprites/vanilla', name)));
}
function px(p: PNG, x: number, y: number): [number, number, number, number] {
  const i = (p.width * y + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
}

describe('BJ473 定谳面：advisor 卡框几何单源（AchievementAdvisor.DrawCard :136-165）', () => {
  it('本仓档 0.5：框 36=72×s、图标 32=64×s、pad 2=4×s；s≤0.5 → Fat 描边(80²@−8s)', () => {
    expect(ADVISOR_SCALE).toBe(0.5);
    const g = advisorFrameGeom();
    expect(g.card).toBe(36);            // Achievement_Borders 72² × 0.5
    expect(g.icon).toBe(32);            // Achievements 帧 64² × 0.5
    expect(g.pad).toBe(2);              // 边框偏移 (−4,−4)×0.5 → 图标在框内 (2,2)
    expect(g.hover).toEqual({ size: 40, off: -4, tex: 'Fat' });   // 80×0.5 / −8×0.5
  });

  it('原版档跨抽：0.75(背包大卡)→Thin(76²@−3.75)；0.35(内联小卡)→Fat——thin/fat 规则 :151-156', () => {
    const large = advisorFrameGeom(0.75);
    expect(large.card).toBe(54);
    expect(large.hover).toEqual({ size: 57, off: -3.75, tex: 'Thin' });   // 76×0.75 / −5×0.75
    const small = advisorFrameGeom(0.35);
    expect(small.card).toBe(25.2);
    expect(small.hover).toEqual({ size: 28, off: -2.8, tex: 'Fat' });     // 80×0.35 / −8×0.35
  });

  it('悬停描边盒不破 BJ416 内联预算（adv.y+42：vanilla-inv-layout.test.ts:320）', () => {
    const g = advisorFrameGeom();
    const spillBottom = g.pad + g.hover.off + g.hover.size;   // 2−4+40=38（卡坐标底沿）
    expect(spillBottom).toBeLessThanOrEqual(42);
  });
});

describe('BJ473 贴图源：金框烘在贴图、描边为白模（实描像素 + TSV 尺寸）', () => {
  it('Achievement_Borders 72²：透明中窗 + 黑描边 + 金体 251,235,188（金框=贴图自带）', () => {
    const p = loadPng('Achievement_Borders.png');
    expect([p.width, p.height]).toEqual([72, 72]);       // TSV:14729
    expect(px(p, 36, 36)[3]).toBe(0);                    // 中窗透明（图标露出）
    expect(px(p, 36, 0)).toEqual([0, 0, 0, 255]);        // 外圈黑描边
    expect(px(p, 36, 2)).toEqual([251, 235, 188, 255]);  // 金体
    expect(px(p, 3, 3)).toEqual([251, 235, 188, 255]);   // 金体(角)
  });

  it('MouseHover 80² 白模描边（252 灰白体）+ MouseHoverThin 76²——悬停黄描边的染前基底', () => {
    const fat = loadPng('Achievement_Borders_MouseHover.png');
    expect([fat.width, fat.height]).toEqual([80, 80]);   // TSV:14730
    expect(px(fat, 40, 40)[3]).toBe(0);                  // 中窗透明
    expect(px(fat, 40, 0)).toEqual([252, 252, 252, 255]);// 白模体（×OurFavoriteColor→黄）
    const thin = loadPng('Achievement_Borders_MouseHoverThin.png');
    expect([thin.width, thin.height]).toEqual([76, 76]); // TSV:14731
    expect(px(thin, 38, 0)).toEqual([252, 252, 252, 255]);
  });

  it('Achievements 图集 1054×1186（暗变体列块 X+528 可达：ACH_ICON_LOCKED_DX=528）', () => {
    const p = loadPng('Achievements.png');
    expect([p.width, p.height]).toEqual([1054, 1186]);   // TSV:14728（8 列×66 + 暗变体块 528）
    expect(ACH_ICON_LOCKED_DX).toBe(528);                // AchievementAdvisor.cs:158 / UIAchievementListItem.cs:60
  });
});

describe('BJ473 落刀面：卡面重建源锚（src/ui/AchievementsUI.ts）', () => {
  it('蓝底圆角盒废除：advisor 规则无 #7d92d6 / rgba(33,43,79 / border-radius / 旧整卡 :hover', () => {
    const m = ACHTS.match(/\.sw-ach-advisor \{ ([^}]+)\}/);
    expect(m, '.sw-ach-advisor 规则必须存在').toBeTruthy();
    const rule = m![1];
    expect(rule).not.toContain('#7d92d6');
    expect(rule).not.toContain('rgba(33,43,79');
    expect(rule).not.toContain('border-radius');
    expect(rule).not.toContain('padding');
    expect(ACHTS).not.toContain('.sw-ach-advisor:hover');          // 旧 brightness(1.2) 面废除
    expect(ACHTS).not.toContain('brightness(1.2)');
  });

  it('灰调↔White（:147 Color(220,220,220,220)→White）：.card 基调 220/255、悬停类滤除', () => {
    expect(ACHTS).toContain('filter:brightness(0.8627)');          // 220/255
    expect(ACHTS).toContain('.sw-ach-advisor.sw-ach-hov .card { filter:none; }');
  });

  it('金框层：border img src=Achievement_Borders.png（:41/:160）盖满 36² 盒', () => {
    expect(ACHTS).toContain("border.src = 'sprites/vanilla/Achievement_Borders.png'");
    const m = ACHTS.match(/\.sw-ach-advisor \.card img\.border \{ ([^}]+)\}/);
    expect(m, '.card img.border 规则必须存在').toBeTruthy();
    expect(m![1]).toContain('width:100%');
    expect(m![1]).toContain('height:100%');
  });

  it('悬停黄描边：MouseHover 白模 ×OurFavoriteColor(255,231,69) 预烘 + 几何由 advisorFrameGeom 写入', () => {
    expect(ACHTS).toContain(
      "const ADVISOR_HOVER_TEX = 'sprites/vanilla/Achievement_Borders_MouseHover.png';",
    );
    expect(ACHTS).toContain('tintedSliceDataUrl(ADVISOR_HOVER_TEX, 255, 231, 69, 1)');   // Main.cs:886
    // 尺寸/偏移单源写入（禁再写死双份数值）
    expect(ACHTS).toContain('hov.style.width = `${g.hover.size}px`;');
    expect(ACHTS).toContain('hov.style.left = `${g.pad + g.hover.off}px`;');
    expect(ACHTS).toContain('box.style.width = `${g.card}px`;');
    expect(ACHTS).toContain('glyph.style.left = `${g.pad}px`;');
  });

  it('悬停谓词 = 图标盒（:139）非整卡：glyph 进出切类 + 沿音（DoStatefulTickSound :3333-3343）', () => {
    expect(ACHTS).toContain("glyph.addEventListener('mouseenter', () => {");
    expect(ACHTS).toContain("glyph.addEventListener('mouseleave', () => {");
    expect(ACHTS).toContain("card.classList.add('sw-ach-hov');");
    expect(ACHTS).toContain("card.classList.remove('sw-ach-hov');");
    expect(ACHTS).toContain("getGame()?.sfx.play('menuTick', 1);");
    expect(ACHTS).toContain('.sw-ach-advisor.sw-ach-hov .card .hov { display:block; }');
  });

  it('点击面 = 仅左键 + goto 卡面成就（:68-72 OpenAchievementsAndGoto）', () => {
    expect(ACHTS).toContain('if (e.button !== 0) return;');
    expect(ACHTS).toContain('openAchievementsPanel(game, best ?? undefined);');
  });

  it('图标暗变体：advisor 走 glyphStyle locked 支（0.5 档单源 ADVISOR_SCALE）', () => {
    expect(ACHTS).toContain('glyphStyle(glyph, a, best, ADVISOR_SCALE);');
  });

  it('面板列表项金框不回归（UIAchievementListItem.cs:63-70 同源：72² 边框盖 64² 图标）', () => {
    const m = ACHTS.match(/\.sw-ach-icon \{ ([^}]+)\}/);
    expect(m, '.sw-ach-icon 规则必须存在').toBeTruthy();
    expect(m![1]).toContain('width:72px');
    expect(m![1]).toContain('height:72px');
    const g = ACHTS.match(/\.sw-ach-icon \.glyph \{ ([^}]+)\}/);
    expect(g![1]).toContain('left:4px');
    expect(g![1]).toContain('top:4px');   // 4px 外圈 ≙ 边框偏移 (−4,−4)
    const b = ACHTS.match(/\.sw-ach-icon img\.border \{ ([^}]+)\}/);
    expect(b![1]).toContain('width:72px');
    // renderList 内面板边框源仍为同一贴图
    expect(ACHTS).toContain("border.className = 'border';\n      border.src = 'sprites/vanilla/Achievement_Borders.png';");
  });

  it('BJ416 窄屏锚不动（vanilla-inv-layout.test.ts:509）+ 竖式文字卡保留（登记偏差）', () => {
    expect(ACHTS).toContain('.sw-ach-inline .tx { display:none; }');
    expect(ACHTS).toContain('.sw-ach-advisor .tx {');
  });
});
