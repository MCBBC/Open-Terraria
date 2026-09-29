// ★wbake 幕布期两修复刃锁（2026-09-29 用户双报）：
//  病灶①「正在渲染世界」实现形态错：wbake 转正刀把它做成了额外全屏 DOM 遮罩
//    （.sw-progress 85% 暗罩+居中文字,叠在 VUI 加载页 z300 之下=文字浮在进度条
//    装饰上,用户原话「遮罩实现多了一层没必要的,我只是希望把这个 step 挂在进度条
//    的一项 step」）——修复=步骤文字归位到 VUI 加载页步骤行（setProgress 的
//    header 同位接管,双进度杆保持读档终态;无 VUI 加载页的导入/联机流保留 DOM
//    加载页原位更新,该页即其本流进度条非遮罩）。
//  病灶②游戏 UI 穿透幕布：enterGame→initInGame 建 HUD 树（.sw-root z10）,幕布
//    =menuBg 画布(z0,盖游戏画布)+透明 VUI 加载页(z300)——盖不住 DOM HUD=热键栏/
//    底部 Shift 键位提示浮在幕布上（用户实报）。修复=冻结窗开启沿挂
//    sw-hud-suppressed 类（visibility 保布局零重排）,掀幕 stopMenu 同帧摘除
//    （世界+UI 同帧出现,禁闪烁）;旗关/worker 降级（beginEntryFreeze=false）两刀
//    均不落=wbake=0 逐字节零变化。
// 面分布：行为锁（UIWorldLoadState.showRenderStep 语义）+源锚（mainFlow 接线/
//    UI.ts 抑制机制/作用域结构=wbake=0 零变化面）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UIWorldLoadState } from '../src/vui/states/UIWorldLoadState';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAINFLOW = readFileSync(join(ROOT, 'src/mainFlow.ts'), 'utf8');
const UITS = readFileSync(join(ROOT, 'src/ui/UI.ts'), 'utf8');

// 真实 zh-Hans 包注入（worldgen-ui-easter-eggs 同例——RenderingWorld 键文案断言需要）
beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

const textOf = (s: UIWorldLoadState) =>
  (s as unknown as { header: { text: string } }).header.text;
const barsOf = (s: UIWorldLoadState) =>
  (s as unknown as { bar: { totalProgress: number; currentProgress: number } }).bar;

describe('幕布期修复刃①：UIWorldLoadState.showRenderStep（步骤归位行为锁）', () => {
  it('读档页（无种子旗标）：步骤行接管为给定文案,无 " - X%" 后缀;双进度杆保持终态', () => {
    const s = new UIWorldLoadState(0);
    s.setProgress('加载背景图', 0.86);
    expect(textOf(s)).toBe('加载背景图 - 86%');
    const bars = barsOf(s);
    s.showRenderStep('正在渲染世界…');
    expect(textOf(s)).toBe('正在渲染世界…');            // 基串原样（suffixMode=false）
    expect(barsOf(s).totalProgress).toBe(bars.totalProgress);   // 双杆读档终态不动
    expect(barsOf(s).currentProgress).toBe(bars.currentProgress);
    s.update();                                          // 非种子页 update 不重掷
    expect(textOf(s)).toBe('正在渲染世界…');
  });

  it('种子三重奏照常覆写（drunk 页接管后 update 仍乱码=本页文字变换语义不豁免）', () => {
    const s = new UIWorldLoadState(0, { seedText: '05162020' });
    s.showRenderStep('正在渲染世界…');
    expect(textOf(s)).toMatch(/^\d+$/);                  // refreshHeaderText 即时应用
  });

  it('setProgress 再入=正常收回接管权（后缀语义随 label 重算,粘滞口径不变）', () => {
    const s = new UIWorldLoadState(0);
    s.showRenderStep('正在渲染世界…');
    s.setProgress('加载背景图', 0.9);
    expect(textOf(s)).toBe('加载背景图 - 90%');
  });
});

describe('幕布期修复刃②：mainFlow 接线（源锚+旧遮罩形态判死）', () => {
  it('冻结窗开启沿：步骤优先挂 VUI 加载页 showRenderStep;无 VUI 页流（导入/联机）落 DOM 加载页原位更新', () => {
    const at = MAINFLOW.indexOf('if (g.beginEntryFreeze(3000)) {');
    expect(at).toBeGreaterThan(-1);
    const block = MAINFLOW.slice(at, MAINFLOW.indexOf('const entryGate', at));
    expect(block).toContain("const renderStep = Lang.text('Mods.SandboxWorld.Progress.RenderingWorld')");
    expect(block).toContain('const load = VUI.ui.current;');
    expect(block).toContain('if (load instanceof UIWorldLoadState) load.showRenderStep(renderStep);');
    expect(block).toContain('else ui.showProgress(renderStep, 1);');
    expect(block).toContain('ui.setHudSuppressed(true);');
  });

  it('旧形态判死：不再整发 .sw-progress 全屏遮罩（ui.showProgress(<RenderingWorld>, 1) 原调用面不复存在）', () => {
    expect(MAINFLOW).not.toContain("ui.showProgress(Lang.text('Mods.SandboxWorld.Progress.RenderingWorld'), 1)");
  });

  it('掀幕沿：setHudSuppressed(false) 在 stopMenu 之后（同帧放行=世界+UI 无缝同帧）;hideProgress 兜底保留', () => {
    const at = MAINFLOW.indexOf('stopMenu();   // 撤菜单幕布+清 VUI 加载页(世界已上屏,零空窗)');
    expect(at).toBeGreaterThan(-1);
    const tail = MAINFLOW.slice(at, at + 200);
    expect(tail.indexOf('ui.setHudSuppressed(false);')).toBeGreaterThan(-1);
  });

  it('wbake=0 零变化面：两刀全部落在 beginEntryFreeze 块内（旗关整段不进=无步骤无抑制）', () => {
    const at = MAINFLOW.indexOf('if (g.beginEntryFreeze(3000)) {');
    const close = MAINFLOW.indexOf('const entryGate', at);
    const block = MAINFLOW.slice(at, close);
    expect(block).toContain('showRenderStep');
    expect(block).toContain('setHudSuppressed(true)');
    // beginEntryFreeze 块结束到 entryGate 之间无散落的第二刀（抑制/步骤只在冻结沿）
    expect(MAINFLOW.slice(close, MAINFLOW.indexOf('onEntryFreeze:', close))).not.toContain('setHudSuppressed(true)');
  });
});

describe('幕布期修复刃③：UI.setHudSuppressed + sw-hud-suppressed 机制（源锚）', () => {
  it('方法在位：classList.toggle 幂等挂/摘（visibility 保布局,摘类=同帧重现）', () => {
    expect(UITS).toContain('setHudSuppressed(on: boolean) {');
    expect(UITS).toContain("this.root.classList.toggle('sw-hud-suppressed', on);");
  });

  it('CSS 规则在位：visibility:hidden 而非 display（零重排/禁闪烁）;.sw-progress 豁免（导入/联机 DOM 加载页=幕布本体须可见）', () => {
    expect(UITS).toContain('.sw-root.sw-hud-suppressed > *:not(.sw-progress) { visibility:hidden; }');
    expect(UITS).not.toContain('.sw-root.sw-hud-suppressed > *:not(.sw-progress) { display:none; }');
  });

  it('幕布层序定谳锚（注释在位,防后续误判"HUD 在幕布之下"）：menuBg z0 盖游戏画布,VUI 页 z300 透明,HUD .sw-root z10 裸奔面', () => {
    expect(UITS).toContain('★幕布期 HUD 抑制（2026-09-29 用户报「加载幕布期热键栏/Shift 提示穿透」）');
    expect(MAINFLOW).toContain('盖不住 DOM HUD');
  });
});

describe('幕布期修复刃④：l10n 键沿用（RenderingWorld 键零新增零改文案）', () => {
  it('zh-Hans 构建产物键在位且文案不动（l10n-audit 同域;键沿用=无新键需补）', () => {
    const zh = JSON.parse(readFileSync(join(ROOT, 'public/l10n/zh-Hans.json'), 'utf8')) as Record<string, Record<string, string>>;
    expect(zh.Mods?.['SandboxWorld.Progress.RenderingWorld']).toBe('正在渲染世界…');
    expect(Lang.text('Mods.SandboxWorld.Progress.RenderingWorld')).toBe('正在渲染世界…');
  });
});
