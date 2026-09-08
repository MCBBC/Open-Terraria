// ★IIIII215b 彩蛋种子生成界面 1:1 对齐——UI 表现面单测 + UI-RNG 守恒。
// 原版定谳锚（Terarria1457）：
//   UIWorldLoad.cs:93-116（乱码/蜜蜂/FTW 反写序）· UIHeader.cs:54-61（HotPink 门）
//   GameTipsDisplay.cs:139-162（提示条变换链+颜色）· UIGenProgressBar.cs:61-87（醉酒帧闪）
//   WorldGen.cs:11165/:22722（drunkWorldGenText 生命周期）· :18792（placingTraps 域）
//   WorldGen.cs:6541/:6551（生成流首尾双 MenuOpen）
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { UnifiedRandom, translateSeed } from '../src/core/rng';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';
import { UIWorldLoadState, drunkScrambleText, reverseUtf16Units, genScreenFlagsOf, HOT_PINK } from '../src/vui/states/UIWorldLoadState';
import { PROGRESS_FILL_COLORS } from '../src/vui/elements/UIGenProgressBar';
import { fnv1a } from './pass-hash.test';

// 真实 zh-Hans 包注入（同 chat-commands.test.ts 先例——蜜蜂词条/Trap 词条断言需要）
beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

const textOf = (s: UIWorldLoadState) =>
  (s as unknown as { header: { text: string } }).header.text;
const colorOf = (s: UIWorldLoadState) =>
  (s as unknown as { header: { textColor: { r: number; g: number; b: number } } }).header.textColor;
const tipsOf = (s: UIWorldLoadState) =>
  (s as unknown as { tips: { text: string }[] }).tips;

describe('IIIII215b · 乱码数字串（drunkScrambleText）', () => {
  it('同种子流确定、纯数字、长度≤(1+segs)×9 位', () => {
    const a = new UnifiedRandom(translateSeed('05162020'));
    const b = new UnifiedRandom(translateSeed('05162020'));
    const sa = drunkScrambleText(a, 3);
    const sb = drunkScrambleText(b, 3);
    expect(sa).toBe(sb);
    expect(sa).toMatch(/^\d+$/);
    expect(sa.length).toBeLessThanOrEqual(9 * 4);
  });
  it('不同种子 → 不同串', () => {
    const a = drunkScrambleText(new UnifiedRandom(1), 3);
    const b = drunkScrambleText(new UnifiedRandom(2), 3);
    expect(a).not.toBe(b);
  });
});

describe('IIIII215b · FTW 镜像反写（reverseUtf16Units）', () => {
  it('逐 UTF-16 code unit 倒序（C# Substring(num,1) 语义）', () => {
    expect(reverseUtf16Units('abc')).toBe('cba');
    expect(reverseUtf16Units('正在生成世界 - 34%')).toBe('%43 - 界世成生在正');
    expect(reverseUtf16Units('')).toBe('');
  });
});

describe('IIIII215b · 种子旗标 → 生成屏表现旗标（genScreenFlagsOf）', () => {
  it('getfixedboi = 天顶组合：七依赖全置（drunkWorldGen 帧闪门开,getGoodWorldGen 反写门开）', () => {
    const f = genScreenFlagsOf({ everything: true, remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true });
    expect(f).toMatchObject({ zenithWorld: true, drunkWorldGen: true, getGoodWorldGen: true, notTheBees: true, tenthAnniversaryWorldGen: true });
  });
  it('null → null（读档页全关）', () => {
    expect(genScreenFlagsOf(null)).toBeNull();
  });
});

describe('IIIII215b · 进度头文案三重奏（UIWorldLoad.DrawSelf :93-116 序）', () => {
  it('普通种子：基串 + " - X%" 后缀（2026-08-31 口径回归）', () => {
    const s = new UIWorldLoadState(0, { seedText: '9293480' });
    s.setProgress('正在生成地形', 0.3);
    expect(textOf(s)).toBe('正在生成地形 - 30%');
  });

  it('drunk(05162020)：纯数字乱码,每帧重掷', () => {
    const s = new UIWorldLoadState(0, { seedText: '05162020' });
    s.setProgress('正在生成地形', 0.3);
    const t1 = textOf(s);
    expect(t1).toMatch(/^\d+$/);          // 整串替换,无后缀
    s.update();
    const t2 = textOf(s);
    expect(t2).toMatch(/^\d+$/);
    expect(t1).not.toBe(t2);              // 帧间重掷（连续同串概率 ~1e-9）
  });

  it('drunk × Traps pass：placingTraps 域乱码抑制（WorldGen.cs:18792）', () => {
    const s = new UIWorldLoadState(0, { seedText: '05162020' });
    s.setProgress('地表装饰', 0.5);        // worldgenProgressKey['地表装饰']=34 → placingTraps
    const trapMsg = Lang.text('LegacyWorldGen.34');
    expect(textOf(s)).toBe(trapMsg.includes('%') ? trapMsg : `${trapMsg} - 50%`);
  });

  it('not the bees：蜜蜂文案整替（无后缀）;zenith 下被抑制', () => {
    const bees = Lang.text('UI.WorldGenEasterEgg_GeneratingBees');
    const s = new UIWorldLoadState(0, { seedText: 'not the bees' });
    s.setProgress('正在生成地形', 0.3);
    expect(textOf(s)).toBe(bees);
    const z = new UIWorldLoadState(0, { seedText: 'get fixed boi' });
    z.setProgress('正在生成地形', 0.3);
    expect(textOf(z)).not.toBe(bees);      // zenith: notTheBees 门被 !zenithWorld 掐灭
  });

  it('for the worthy：显示串镜像反写（FTW 门）', () => {
    const s = new UIWorldLoadState(0, { seedText: 'for the worthy' });
    s.setProgress('正在生成地形', 0.3);
    expect(textOf(s)).toBe(reverseUtf16Units('正在生成地形 - 30%'));
  });

  it('celebrationmk10：HotPink 标题;zenith 组合白标题（UIHeader :54-61）', () => {
    const c = new UIWorldLoadState(0, { seedText: 'celebrationmk10' });
    c.setProgress('正在生成地形', 0.3);
    expect(colorOf(c)).toMatchObject({ r: HOT_PINK.r, g: HOT_PINK.g, b: HOT_PINK.b });
    const z = new UIWorldLoadState(0, { seedText: 'getfixedboi' });
    z.setProgress('正在生成地形', 0.3);
    expect(colorOf(z)).toMatchObject({ r: 255, g: 255, b: 255 });
  });

  it('读档页（无 seedText）：彩蛋全关（原版加载路径同态）', () => {
    const s = new UIWorldLoadState();
    s.setProgress('正在生成地形', 0.3);
    expect(textOf(s)).toBe('正在生成地形 - 30%');
    expect(colorOf(s)).toMatchObject({ r: 255, g: 255, b: 255 });
  });
});

describe('IIIII215b · 进度条填充色 packed 解包修正（FNA R 低字节）', () => {
  it('corrupt/crimson/small/random 四色钉值（金标）', () => {
    expect(PROGRESS_FILL_COLORS.corrupt).toEqual({ r: 95, g: 242, b: 86, a: 255 });
    expect(PROGRESS_FILL_COLORS.crimson).toEqual({ r: 255, g: 237, b: 131, a: 255 });
    expect(PROGRESS_FILL_COLORS.small).toEqual({ r: 87, g: 168, b: 194, a: 255 });
    expect(PROGRESS_FILL_COLORS.random).toEqual({ r: 61, g: 91, b: 221, a: 255 });
  });
});

describe('IIIII215b · 提示条（GameTipsDisplay 1:1）', () => {
  it('更新泵推进:池内有条目、11.5s 过期后补新且不重复上条', () => {
    const s = new UIWorldLoadState(0, { seedText: '9293480' });
    for (let i = 0; i < 60; i++) s.update();
    const first = tipsOf(s)[0].text;
    expect(first).toBeTruthy();
    for (let i = 0; i < 12.5 * 60; i++) s.update();   // > DURATION 11.5s
    const tips2 = tipsOf(s);
    expect(tips2.length).toBeGreaterThanOrEqual(1);
    expect(tips2[tips2.length - 1].text).not.toBe(first);   // 去重门（RollAvailableTip do-while）
  });
  it('drunk 提示条 = 乱码数字串（14 段上限,GameTipsDisplay.Draw :147-153）', () => {
    const s = new UIWorldLoadState(0, { seedText: '05162020' });
    for (let i = 0; i < 30; i++) s.update();
    const tip = tipsOf(s)[0];
    expect(tip).toBeTruthy();   // 原文滚定
    const display = (s as unknown as { tipDisplayText(t: { text: string }): string }).tipDisplayText(tip);
    expect(display).toMatch(/^\d+$/);
  });
});

describe('IIIII215b · 音效资产存在性（wav→opus 迁移态守卫）', () => {
  it('menu_accept / Chat 素材在盘（WAV_MAP 两键接线面）', () => {
    expect(existsSync('public/sounds/menu_accept.opus')).toBe(true);
    expect(existsSync('public/sounds/Chat.opus')).toBe(true);
    expect(existsSync('public/sounds/Menu_Open.opus')).toBe(true);
  });
});

// ---- UI-RNG 守恒：UI 层彩蛋表现不得扰动世界生成 RNG 流 ----
// ★尺寸=4200×1200（认证面全尺寸,tests/_fullgen-smoke 同款;800×600 级小世界非
//   generateWorld 认证域——既有全链测试全部 4200×1200,小尺寸属未测边缘,勿用于守恒面）。
describe('IIIII215b · g 链守恒（UI 层零 RNG 扰动实证）', () => {
  it('同种子两次生成（一次挂彩蛋生成屏 + 逐帧泵）→ 世界格指纹逐位全等', async () => {
    const { generateWorld } = await import('../src/world/gen/WorldGen');
    const pump = async (withUi: boolean): Promise<string> => {
      const ui = withUi ? new UIWorldLoadState(0, { seedText: '9293480', genSounds: false }) : null;
      const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 }, (label, p, local) => {
        ui?.setProgress(label ?? undefined, p, local);
        // 生成屏逐帧泵（乱码重掷/提示条步进均消费 UI 私有掷子）
        for (let i = 0; i < 3; i++) ui?.update();
      });
      return fnv1a(world.tiles.type);   // 全世界 type 面 FNV-1a（Uint16Array 字节级指纹）
    };
    const plain = await pump(false);
    const withUiHash = await pump(true);
    expect(withUiHash).toBe(plain);
  }, 600000);
});
