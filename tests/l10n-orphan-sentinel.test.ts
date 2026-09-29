// l10n 孤儿键回插哨兵（清偿刀 J,2026-09-29;清偿刀 G 新立债 #1;清偿刀 S 扩面 +6）。
//
// l10n-audit 是 used→present 单向门（l10n-audit.mjs:33 只查"用到的键是否在包里",
// 不查"包里多出来的键"）,custom 侧孤儿键回插不会爆红。本测试把刀 G 摘除面冻结
// 为机械闸:54 个已定谳孤儿键(597 行实例,消费面全数退役)在全 12 语言
// custom 源 + public/l10n 产物双侧零命中;任何一侧回插任一键 = 测试红。
//
// ★清偿刀 S（2026-09-29）扩面 +6：custom 顶层无前缀 ClothesWindow.* 6 键
//   （Voice/VoiceFemale/VoiceMale/VoiceOther/VoicePitch/VoiceTip）。定谳=真孤儿
//   重复残留：①src/tests/scripts 全库 grep 零消费（消费面全走
//   Mods.SandboxWorld.ClothesWindow.* prefixed 8 键,CharCreation.ts:1435-1437
//   字面全键,无动态拼键）；②prefixed 族为 unprefixed 块的超集（多 Changed/Title）,
//   12 语言 custom 均双写同值（zh 面逐字相同,其余 11 语言 unprefixed 面全英文死值
//   未曾翻译=pure dead weight）；③原版 7 分片零命中。摘除后产物顶层
//   ClothesWindow 类别消失,用户可见文本零变化。回放：本文件下方键名单。
//
// 摘键名单来源(可重放):
//   ① /tmp/l10n-g-backup/custom/<lang>.json(刀 G 摘键前快照)与 tools/l10n-custom/
//     当前态逐语言 key-set 差分,并集恰 54 键(zh 54/en 53/其余 10 语言 48,
//     en 缺 Toast.NpcArrived、de 等 10 语言缺 Mobile.OldRotateHint 等未收键);
//   ② 普查工件 /tmp/l10n-census-families.txt(unref 55 = 54 摘 + 1 保留 NpcArrived;
//     UI.InvLabel 亦保留;census 55 与摘除 54 的差=DiffDesc.1 在 census 归
//     dynamic-tmpl 却仍被摘——定谳:src 全库 grep 'DiffDesc' 零消费,LanDiscovery.ts:91
//     的 '${...}.1' 是 ${manualPrefix}.1 IP 拼接,census 模板误报,摘除安全)。
//
// ── 不进哨兵的保留面（哨兵只锁摘除面）──
// ① 动态 72 键(经模板拼键消费,audit 提取器字面正则不可见,l10n-audit.mjs:36-37):
//    BuffDescription.${...}/BuffName.${...} @ Lang.ts;Item${...}+ItemName.${...} @
//    Lang.ts/itemTooltip.ts;Mods.SandboxWorld.AssetDl.Phase_${...} @ AssetDownloadUI.ts;
//    Mods.SandboxWorld.ItemName.${...} @ Lang.ts;Mods.SandboxWorld.MP.${...} @
//    MultiplayerSelect.ts;${...}ms(NoRooms 复合) @ UI.ts;
//    Mods.SandboxWorld.Settings.Op_${...} @ Settings.ts:846;
//    Mods.SandboxWorld.Settings.TitleMusic_${...} @ Settings.ts;UI.Portraits${...} @
//    Settings.ts;census 全 72 键名单见 /tmp/l10n-census-families.txt DYNAMIC-TMPL 节。
//    (未来普查扩面时以此为消费模式清单核对,勿凭字面 grep 定谳孤儿。)
// ② 存疑 2 键(保留,两侧均不断言):Mods.SandboxWorld.Toast.NpcArrived、
//    Mods.SandboxWorld.UI.InvLabel——census unref 但刀 G 判存疑保留
//    (InvLabel 已由 tests/l10n-data.test.ts:31 全 12 语言在位锁;NpcArrived 由
//    tests/l10n-data.test.ts:61 zh 锁)。若未来定谳摘除,须同步改 l10n-data 与本注释。
// ③ BossFled 孤儿键(BJ394 件4)由 tests/bj394-prefix-faces.test.ts 专锁,不在此列。
//
// 防空转护栏:54 键自恰 + 每语言 custom/产物键数下限 + 活键在位(包被整删时
// "零命中"断言会空转放行,活键锚兜底)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // game/
const CUSTOM_DIR = join(ROOT, '..', 'tools', 'l10n-custom');
const L10N_DIR = join(ROOT, 'public', 'l10n');

const LANGS = ['en-US', 'de-DE', 'it-IT', 'fr-FR', 'es-ES', 'ru-RU', 'zh-Hans', 'pt-BR', 'pl-PL', 'ja-JP', 'ko-KR', 'zh-Hant'];

// ── 刀 G 54 摘键名单(家族分组,与 /tmp/l10n-g-backup 差分并集逐字对齐)──
const ORPHAN_KEYS: string[] = [
  // Mods.Mods.* 错位前缀残留(X1 定谳:custom Mods 组内带 "Mods." 前缀散键,
  // flattenDeep 产出双前缀键,经 enBase 传播全 12 语言产物;正确平键
  // SandboxWorld.Settings.PanControl* 功能面由 tests/bj394-prefix-faces.test.ts 锁在位)
  'Mods.Mods.SandboxWorld.Settings.PanControl',
  'Mods.Mods.SandboxWorld.Settings.PanControl_Click',
  'Mods.Mods.SandboxWorld.Settings.PanControl_Hold',
  'Mods.Mods.SandboxWorld.Settings.PanControl_OffAlways',
  'Mods.Mods.SandboxWorld.Settings.PanControl_OnAlways',
  // AssetDl ×2
  'Mods.SandboxWorld.AssetDl.CountDetail',
  'Mods.SandboxWorld.AssetDl.Summary',
  // CharCreate ×11(含 DiffDesc.0-3;census 模板误报已定谳,见头注)
  'Mods.SandboxWorld.CharCreate.Appearance',
  'Mods.SandboxWorld.CharCreate.Colors',
  'Mods.SandboxWorld.CharCreate.DiffDesc.0',
  'Mods.SandboxWorld.CharCreate.DiffDesc.1',
  'Mods.SandboxWorld.CharCreate.DiffDesc.2',
  'Mods.SandboxWorld.CharCreate.DiffDesc.3',
  'Mods.SandboxWorld.CharCreate.Difficulty',
  'Mods.SandboxWorld.CharCreate.Female',
  'Mods.SandboxWorld.CharCreate.Gender',
  'Mods.SandboxWorld.CharCreate.Male',
  'Mods.SandboxWorld.CharCreate.NamePlaceholder',
  // CharSelect ×1
  'Mods.SandboxWorld.CharSelect.New',
  // Data ×3
  'Mods.SandboxWorld.Data.ContinueSave',
  'Mods.SandboxWorld.Data.ImportWld',
  'Mods.SandboxWorld.Data.LoadFile',
  // Housing ×5
  'Mods.SandboxWorld.Housing.HintAssign',
  'Mods.SandboxWorld.Housing.HintIdle',
  'Mods.SandboxWorld.Housing.HintQuery',
  'Mods.SandboxWorld.Housing.Homeless',
  'Mods.SandboxWorld.Housing.Query',
  // Item ×1
  'Mods.SandboxWorld.Item.Defense',
  // JourneyPowers ×1
  'Mods.SandboxWorld.JourneyPowers.DuplicateEmpty',
  // Mobile ×2
  'Mods.SandboxWorld.Mobile.OldRotateHint',
  'Mods.SandboxWorld.Mobile.SmartCursor',
  // NPC ×1
  'Mods.SandboxWorld.NPC.WorldStatus',
  // Remaster ×1
  'Mods.SandboxWorld.Remaster.MenuBtn',
  // Save ×1
  'Mods.SandboxWorld.Save.Local',
  // Settings ×3(开发者模式提示,2026-09-14 用户要求行+提示同批摘)
  'Mods.SandboxWorld.Settings.Data',
  'Mods.SandboxWorld.Settings.DevMode',
  'Mods.SandboxWorld.Settings.DevModeHint',
  // Sign ×1
  'Mods.SandboxWorld.Sign.Save',
  // Tabs ×1
  'Mods.SandboxWorld.Tabs.Dye',
  // Toast ×9(NpcArrived 存疑保留,不在列)
  'Mods.SandboxWorld.Toast.AcornGrassOnly',
  'Mods.SandboxWorld.Toast.BannerReady',
  'Mods.SandboxWorld.Toast.ChestTrapped',
  'Mods.SandboxWorld.Toast.JojaCola',
  'Mods.SandboxWorld.Toast.MobileRideTodo',
  'Mods.SandboxWorld.Toast.MultiInstance',
  'Mods.SandboxWorld.Toast.NeedBait',
  'Mods.SandboxWorld.Toast.QuitUnsupported',
  'Mods.SandboxWorld.Toast.SpawnSet',
  // UI ×2(InvLabel 存疑保留,不在列)
  'Mods.SandboxWorld.UI.Dropped',
  'Mods.SandboxWorld.UI.Inventory',
  // WorldCreation ×2
  'Mods.SandboxWorld.WorldCreation.Back',
  'Mods.SandboxWorld.WorldCreation.Create',
  // WorldSelect ×2
  'Mods.SandboxWorld.WorldSelect.Copy',
  'Mods.SandboxWorld.WorldSelect.Enter',
  // ClothesWindow 顶层无前缀 ×6(清偿刀 S 2026-09-29:真孤儿重复残留,prefixed
  // Mods.SandboxWorld.ClothesWindow.* 8 键族为消费面且超集;定谳证据见头注)
  'ClothesWindow.Voice',
  'ClothesWindow.VoiceFemale',
  'ClothesWindow.VoiceMale',
  'ClothesWindow.VoiceOther',
  'ClothesWindow.VoicePitch',
  'ClothesWindow.VoiceTip',
];

/** 深展平(与 scripts/l10n-merge.mjs flattenDeep 同键名语义:路径逐段点连,
 *  顶层点分键整键成段;custom 的嵌套/顶层点分两种写法、产物的 类别→条目键
 *  一层结构均归一到同一点路径全名,回插任何写法都可捕获) */
function flattenKeys(obj: unknown, path = ''): string[] {
  const out: string[] = [];
  if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      if (v !== null && typeof v === 'object') out.push(...flattenKeys(v, p));
      else out.push(p);
    }
  }
  return out;
}

function readJson(p: string): unknown {
  return JSON.parse(readFileSync(p, 'utf8'));
}

describe('l10n 孤儿键回插哨兵(刀 G 54 + 刀 S 6 = 60 摘键名单,全 12 语言双侧零命中)', () => {
  it('名单自恰:恰 60 键且无重复(名单被裁剪/扩充时先红再议)', () => {
    expect(ORPHAN_KEYS).toHaveLength(60);
    expect(new Set(ORPHAN_KEYS).size).toBe(60);
  });

  for (const lang of LANGS) {
    it(`${lang}: custom 源零孤儿键回插`, () => {
      const keys = flattenKeys(readJson(join(CUSTOM_DIR, `${lang}.json`)));
      // 防空转:custom 包整删/重排时键数下限兜底(2026-09-29 S刀后 zh 660/en 593/其余 605)
      expect(keys.length, `${lang} custom 键数`).toBeGreaterThanOrEqual(400);
      const hits = keys.filter((k) => ORPHAN_KEYS.includes(k));
      expect(hits, `${lang} custom 回插`).toEqual([]);
    });

    it(`${lang}: 产物零孤儿键 + 活键锚在位`, () => {
      const pack = readJson(join(L10N_DIR, `${lang}.json`)) as Record<string, unknown>;
      const keys = flattenKeys(pack);
      // 防空转:产物当前 20669~22099 键,半数以下=包被整删/错版重冻
      expect(keys.length, `${lang} 产物键数`).toBeGreaterThanOrEqual(15000);
      const hits = keys.filter((k) => ORPHAN_KEYS.includes(k));
      expect(hits, `${lang} 产物回插`).toEqual([]);
      // 活键锚:摘除面同域的保留功能键(整包空删时上断言空转,此锚兜底)
      const mods = (pack.Mods ?? {}) as Record<string, unknown>;
      expect(typeof mods['SandboxWorld.Settings.PanControl']).toBe('string');
      expect(typeof mods['SandboxWorld.Toast.NeedItem']).toBe('string');
      expect(typeof mods['SandboxWorld.Settings.BackgroundRun']).toBe('string');
    });
  }
});
