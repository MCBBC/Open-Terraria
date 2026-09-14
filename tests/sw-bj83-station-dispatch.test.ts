// ★BJ83(2026-09-14) 站点右击分派/两窗互斥/CloseAll 面/FX30 烤档迁移 结构守卫。
// 锚(1457 反编译):
// - Player.cs:33555-33562 InteractWithCraftingStation = CraftingGridControl==Modern
//   ? NewCraftingUI.OpenCloseFilter : Main.craftingUI.OpenCloseFilter(跟随设置,无强制面)
// - CraftingUI.cs:146-159 OpenCloseFilter classic:已开网格支(:147-154)/开支 filter→
//   IngameUIWindows.CloseAll(quiet:true)(:153)→Player.OpenInventory(:155)→PipsUseGrid=true(:157)
// - NewCraftingUI.cs:883-905 Open:!playerInventory ∨ (chest==-1 ∧ !InGuideCraftMenu)
//   → IngameUIWindows.CloseAll(quiet:true)(:888-890)
// - IngameUIWindows.cs:17-66 CloseAll:收 talkNPC 对话(:36-43)/箱(:50-57)/背包(:58-65)/
//   NewCraftingUI(:63)/shop(:66)
// ★SW-BJ85(2026-09-15) 增锚：债① ClearHacks 网(IngameUIWindows.cs:69 → CraftingUI.cs:143
//   =_lastFilter 恒 null 净死,消费面退役)+债② 网格已开臂 LOUD CloseAll(CraftingUI.cs:148-153,
//   BJ83 登记债②清偿)——见新 it 两支;RB19 判语坐标 bj83-station-dispatch-grille-bake 尾段
// 行为面证据 = scripts/_bj83-station-modern.mjs + _bj83-station-mutex.mjs 探针
// (P1/P2 modern 开窗网格不开;P3 classic 网格开;mutex 相 modern 窗开着切 classic 右击
// 站点=窗收网格开;dialog 相 对话开着右击站点=话收窗开;迁移相 烤档 classic 重载=modern)。
// ★RB29(2026-09-15) 迁移相退役:BJ83 烤档迁移没收用户显式 classic(用户实报回归1,
// _fx28-guide-regress P0 实证)=真回归,迁移块撤除+迁移相锁改退役锁(见尾 describe)。
// Options 迁移无注入缝(kvGet IndexedDB 不可 stub)=结构锁+探针行为面双证。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const uiSrc = readFileSync(fileURLToPath(new URL('../src/ui/UI.ts', import.meta.url)), 'utf8');
const optSrc = readFileSync(fileURLToPath(new URL('../src/core/Options.ts', import.meta.url)), 'utf8');

describe('SW-BJ83 站点右击分派(跟随 craftingGridControl,无强制面)', () => {
  it('分派谓词=设置∧vanilla 布局双门(变异守卫:钩子回硬编码 classic/漏设置门即红)', () => {
    // Player.cs:33555-33562 同构——classic 支必须吃设置门;漏 craftingGridControl 判据=强制宫格回归
    expect(uiSrc).toMatch(
      /openCraftingStationFilter\(f: CraftingTileFilter\): void \{\s*\n\s*if \(options\.data\.craftingGridControl === 'classic' && this\._builtLayout === 'vanilla'\) \{/,
    );
    // modern 支 = else-if(vanilla 布局) → NewCraftingUI.OpenCloseFilter 执行器
    expect(uiSrc).toMatch(
      /\} else if \(this\._builtLayout === 'vanilla'\) \{[\s\S]{0,600}?this\.vinvOpenCloseModernCraftFilter\(f\);/,
    );
  });

  it('classic 开臂序=滤器→CloseAll(quiet)→开包→网格态(CraftingUI.cs:154-157 原版序;★BJ85:{0,500}→{0,900} 容净死注释行,序语义不变)', () => {
    expect(uiSrc).toMatch(
      /this\.vinvCraftFilter = f;[\s\S]{0,900}?this\.vinvCloseAllQuiet\(\);[\s\S]{0,300}?this\.openInventory\(true\);[\s\S]{0,200}?this\.vinvPipsUseGrid = true;/,
    );
  });

  it('CloseAll(quiet) 子面=收对话+箱+modern 窗+ClearHacks 网(IngameUIWindows.cs:36-69 子集;★SW-BJ85 债①:尾网=原版 CloseAll 尾语句,置入滤器同拍即净)', () => {
    expect(uiSrc).toMatch(
      /private vinvCloseAllQuiet\(\): void \{\s*\n\s*this\.game\?\.closeNpcDialog\(true\);\s*\n\s*this\.closeChest\(\);\s*\n\s*this\.vinvCloseModernCraft\(true\);\s*\n\s*this\.vinvCraftFilter = null;[^\n]*\n\s*\}/,
    );
  });

  it('★SW-BJ85 债②:网格已开臂 LOUD CloseAll(CraftingUI.cs:148-153)=清滤+vinvCloseAllLoud(对话/箱/背包各音 11,modern 窗静默,背包面=closeInventory 次帧净态 Main.cs:43940/:43933-43937)', () => {
    // BJ83 登记债「classic 已开网格支 LOUD CloseAll 未移植」清偿(RB19 揭出/2026-09-15 落刀);
    // 变异证红:换回 vinvRefreshCraft()+return(照常全开)即红
    expect(uiSrc).toMatch(
      /if \(invOpen && this\.vinvPipsUseGrid\) \{\s*\n\s*(?:[ \t]*\/\/[^\n]*\n)*[ \t]*this\.vinvCraftFilter = null;[^\n]*\n\s*this\.vinvCloseAllLoud\(\);[^\n]*\n\s*return;/,
    );
    expect(uiSrc).toMatch(
      /private vinvCloseAllLoud\(\): void \{[\s\S]{0,200}?if \(game\?\.npcDialogActive\) game\.closeNpcDialog\(\);[\s\S]{0,200}?if \(this\.openChest\) \{[\s\S]{0,200}?this\.closeChest\(\);[\s\S]{0,200}?game\?\.sfx\.play\('menuClose', 1\);[\s\S]{0,300}?this\.closeInventory\(\);[^\n]*\n\s*this\.vinvRefreshCraft\(\);/,
    );
  });

  it('modern 开臂 CloseAll 门(NewCraftingUI.cs:886-890:!包∨(无箱∧非向导)→收话/箱)', () => {
    expect(uiSrc).toMatch(
      /private vinvOpenModernCraft\(filter: CraftingTileFilter \| null, quiet: boolean\): void \{\s*\n\s*if \(this\.vinvModernCraftOpen\) return;[\s\S]{0,900}?if \(this\.invPanel\.style\.display !== 'block' \|\| \(!this\.openChest && !this\.vinvGuideMenuOpen\)\) \{\s*\n\s*this\.game\?\.closeNpcDialog\(true\);\s*\n\s*this\.closeChest\(\);\s*\n\s*\}\s*\n\s*this\.vinvModernCraftOpen = true;/,
    );
  });
});

describe('★RB29(2026-09-15) BJ83 烤档迁移退役(显式 classic 不得被 load 卫门没收)', () => {
  // 用户实报回归1:显式 classic(右键切换钮 CraftingUI.cs:322-331 持久化)于 BJ83 落地后
  // 首次 load 被无声翻 modern → 向导「制作」开 modern 窗。探针 _fx28-guide-regress P0
  // 实证:存档 classic+无旗 → reload 后 control=modern。退役依据见 Options.ts 迁移位注释。
  it('迁移块已退役(load 卫门区不得再写 craftingGridControl=modern/落旗;变异证红:回植迁移块即红)', () => {
    expect(optSrc).not.toMatch(
      /if \(!this\.data\.craftingGridControlMigrated && this\.data\.craftingGridControl === 'classic'\) \{\s*\n\s*this\.data\.craftingGridControl = 'modern';/,
    );
    expect(optSrc).not.toMatch(/craftingGridControl = 'modern';\s*\n\s*this\.data\.craftingGridControlMigrated = true;/);
  });

  it('退役标记在档(Options 迁移位/字段注双 RB29 记,防静默回植)', () => {
    expect(optSrc).toMatch(/RB29\(2026-09-15\).*烤档一次性迁移【已退役】/s);
    expect(optSrc).toMatch(/craftingGridControlMigrated\?: boolean;/);
  });

  it('缺省仍=modern(原版 Player.cs:363,退役不翻缺省)', () => {
    expect(optSrc).toMatch(/craftingGridControl: 'modern',/);
  });
});
