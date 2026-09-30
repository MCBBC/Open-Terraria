// ★Q4 刀 2026-09-30 判别面（任务2 ItemTooltip.Kite 组 + 任务4 锚桩风筝收线静音）：
//   任务2 定谳（BJ413 登记「itemTooltip 不吐 per-item tooltip 组」翻案）：
//     原文面 = Lang.InitializeLegacyLocalization（Lang.cs:546-555）对全 ItemID 字段
//     建 _itemTooltipCache[id] = ItemTooltip.FromLanguageKey("ItemTooltip."+FieldName)
//     → Item.SetDefaults :1208 ToolTip=Lang.GetTooltip → GetLinesInfo :21149-21162
//     注入（容器/线触发行后、buffTime 段前；UsesCursedByPlanteraTooltip 首行换
//     tip[59] 特例）。本仓主悬停面 = UI.ts showTooltipFor staticTip 链（:3259-3280
//     vi_ def → ITEM_NAME_BY_ID → Lang.has/text → assembleTooltipLines staticTipText
//     插入同位）——风筝 24 件 def 键/名键/l10n 键三链全通（本文件 A 组钉面）。
//     残差登记（非风筝）：①BySearch 检索域（UI.ts vinvFillTooltipLines :329）只吃
//     buildTooltipBody 字段行不带静态说明（原版 ItemFilters.BySearch=全行检索,登记）；
//     ②l10n 产物缺 78/2790 键（WorkBench 变体族,上游分片币值,登记）；
//     ③UsesCursedByPlanteraTooltip 特例（1533-1537/4714）未建模（登记）。
//   任务4 定谳（BJ413 相邻域「收线音方向反」勘误）：
//     原文 Projectile.cs:49352 `bool flag = owner == 255` + :49389 `if (!flag)` →
//     锚桩风筝（LeashedKite.MoveKite :168 `_dummy.owner = 255`）恒静音。旧档恒播
//     Item_192 系把收放线输入块 owner==Main.myPlayer 门（:49356）误并到播音门。
//     本组 B 组：无风收线 kiteDistance 变程（旧档必播窗）实测零播音。
//   变异证红（手工执行实录）：
//     M1 LeashedCritter.kiteLogic 恢复 env.playSfxWav 播放行 → B1 红（1 发 Item_192）
//     M2 UI.ts staticTip 链 `Lang.has(path)` 守卫删（取 text 直用）→ A3 红（源锁）
//     M3 assembleTooltipLines staticTip 段删 → A2 红（行整缺）
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { languageManager } from '../src/i18n/LanguageManager';
import { assembleTooltipLines } from '../src/ui/itemTooltip';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { ITEM_NAME_BY_ID } from '../src/i18n/idNames.generated';
import { World } from '../src/world/World';
import { LeashedKiteEntity } from '../src/entities/LeashedCritter';
import type { LeashedEnv } from '../src/entities/LeashedCritter';

const ROOT = resolve(__dirname, '..');
const KITES = [4367, 4368, 4369, 4370, 4371, 4379,
  4610, 4611, 4612, 4613, 4648, 4649, 4650, 4651,
  4669, 4670, 4671, 4674, 4675, 4676, 4677, 4681, 4683, 4684];

languageManager.loadPackJson(JSON.parse(readFileSync(resolve(ROOT, 'public/l10n/zh-Hans.json'), 'utf8')));

// ═══ A：ItemTooltip.Kite 组链路（主悬停面全链） ═══
describe('Q4-D ItemTooltip.Kite 组（per-item tooltip 主面）', () => {
  it('A1 def→名键→l10n 键三链 24/24 全通（Lang.cs:546-555 键式对账）', () => {
    for (const vid of KITES) {
      const k = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(k, `vid ${vid} def 键`).toBeTruthy();
      expect(k!.startsWith('vi_'), `vid ${vid} 键式 vi_*（UI.ts staticTip 链入口）`).toBe(true);
      const nameKey = ITEM_NAME_BY_ID[vid];
      expect(nameKey, `vid ${vid} 名键`).toBeTruthy();
      expect(languageManager.exists(`ItemTooltip.${nameKey}`),
        `vid ${vid} l10n 键 ItemTooltip.${nameKey}`).toBe(true);
    }
  });

  it('A2 装配面：staticTip 进 assembleTooltipLines 行序位（GetLinesInfo :21149 位）', () => {
    const vid = 4367;
    const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]!]];
    const nameKey = ITEM_NAME_BY_ID[vid]!;
    const tip = languageManager.getTextValue(`ItemTooltip.${nameKey}`);
    expect(tip).toContain('有风的日子可以放风筝');
    expect(tip).toContain('收卷风筝线');                       // {InputTrigger_InteractWithTile} 已替换
    const lines = assembleTooltipLines(def, { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]!], stack: 1 },
      null, tip, {});
    expect(lines.length).toBeGreaterThanOrEqual(2);            // \n 拆两行
    expect(lines[0]!.text).toContain('有风的日子可以放风筝');
    expect(lines[1]!.text).toContain('收卷风筝线');
  });

  it('A3 UI.ts staticTip 链源锁（vi_ 守卫 + Lang.has 静默空 + desc 合并）', () => {
    const ui = readFileSync(resolve(ROOT, 'src/ui/UI.ts'), 'utf8');
    expect(ui).toContain("const path = `ItemTooltip.${nameKey}`;");
    expect(ui).toContain('if (Lang.has(path))');
    expect(ui).toContain('let staticTip: string | null = null;');
    expect(ui).toContain("if (def.key.startsWith('vi_')) {");
  });

  it('A4 en-US 键面对等（LanguageManager.cs:102 英兜底语义）', () => {
    const en = JSON.parse(readFileSync(resolve(ROOT, 'public/l10n/en-US.json'), 'utf8')) as
      Record<string, Record<string, string>>;
    for (const vid of KITES) {
      const nameKey = ITEM_NAME_BY_ID[vid]!;
      expect(en.ItemTooltip?.[nameKey], `en ItemTooltip.${nameKey}`).toBeTruthy();
    }
  });

  it('A5 l10n 产物风筝组文案逐键非空（缺键=静默空定谳反证）', () => {
    const zh = JSON.parse(readFileSync(resolve(ROOT, 'public/l10n/zh-Hans.json'), 'utf8')) as
      Record<string, Record<string, string>>;
    for (const vid of KITES) {
      const nameKey = ITEM_NAME_BY_ID[vid]!;
      expect((zh.ItemTooltip?.[nameKey] ?? '').length,
        `zh ItemTooltip.${nameKey}`).toBeGreaterThan(0);
    }
  });
});

// ═══ B：锚桩风筝收线静音（Projectile.cs:49352/49389 owner==255 档） ═══
describe('Q4-E 锚桩风筝收线音（KiteLogic !flag 门=恒静音）', () => {
  function mkEnv(sfx: ReturnType<typeof vi.fn>): LeashedEnv {
    return {
      timeForVisualEffects: 0,
      dayTime: true,
      worldSurface: 10,          // 风筝 tileY≈20 ≥ surface → InAPlaceWithWind=false（无风）
      remix: false,
      windForVisuals: 0,         // Main.WindForVisuals=0
      cloudAlpha: 0,
      playerCx: 328, playerCy: 328,
      addLight: () => {},
      playSfxWav: sfx,
    };
  }

  it('B1 无风收线 kiteDistance 变程（旧档必播窗）→ 零播音', () => {
    const w = new World(160, 160, 33, 'q4-kite');
    const sfx = vi.fn();
    const kite = new LeashedKiteEntity(20, 20, 766, 4, 4);   // 盒心 tile(20,20)=px328
    const env = mkEnv(sfx);
    for (let i = 0; i < 200; i++) kite.update(w.store, env);  // timeWithoutWind→200
    // 判别力前置：kiteDistance 必须已变程（250→remap(200)≈138）——localAI2 簿记
    // 变更拍已多次跨 30t soundDelay 窗（旧档此窗内必播）
    expect(kite.timeWithoutWind).toBe(200);
    expect(kite.kiteDistance).toBeLessThan(250);
    expect(sfx).not.toHaveBeenCalled();                       // :49389 !flag 恒假=静音
  });

  it('B2 有风稳态（windy）同理零播音（owner==255 与风态无关）', () => {
    const w = new World(160, 160, 33, 'q4-kite2');
    const sfx = vi.fn();
    const kite = new LeashedKiteEntity(20, 4, 766, 4, 4);
    // surface=1000：风筝全程在风域（下坠不越界——surface=10 档风筝 12t 内沉出风域）
    const env = { ...mkEnv(sfx), worldSurface: 1000, windForVisuals: 0.35 } as LeashedEnv;
    for (let i = 0; i < 120; i++) kite.update(w.store, env);  // windCurrent 缓升过 0.2 门
    expect(kite.timeWithoutWind).toBe(0);
    expect(sfx).not.toHaveBeenCalled();
  });
});
