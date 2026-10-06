// ★BJ-C4-F3/F5（2026-10-06 R4 UI 批清偿）MouseText 自绘气泡族判别锁。
//
// F3（BestiaryPanel.bindTip 锚升格）定谳链（Terarria1457 亲读）：
//   图鉴悬停名/完成度/属性名/筛选名原版全走 Main.instance.MouseText（UIBestiary-
//   EntryButton.cs:147 `Main.instance.MouseText(_icon.GetHoverText(), 0, 0)` /
//   UIBestiaryFilteringOptionsGrid.cs:223 同面）→ MouseTextInner（Main.cs:20365-
//   20425）：X=mouse+14（:20379）+6（ThickMouse 默认档 :2684,MouseBorderColor :276
//   非透明 → 恒开）+34（光标持物 :20390-20392）/ Y=mouse+14（:20380）+6,全串盒
//   右/下缘 40px 收边（:20412-20419）。旧 bindTip = 自创固定 +16/+20：X 少 4px、
//   无持物 +34 臂、无屏缘钳（近右/下缘气泡探出屏幕）。
//   修 = 委托共享族 MouseTextTip（Renderer.mouseTextAnchor 公式 1:1）。
// F5（原生 title 退役）定谳链：
//   表情钮 = EmoteButton.cs:79-84 DrawSelf hovered 臂 `Main.instance.MouseText(
//   "/" + EmojiName, 0, 0)`;住房条 = Main.cs:41513 `MouseText(GetNPCHouseBanner-
//   Text(nPC, num2), 0, 0)`——两处原版均为 MouseText 面,本仓曾用原生 browser
//   title（OS 延迟气泡,非 MouseText 形态语言）→ 统一改道自绘气泡族。
// 判别面：锚公式钉值（默认/持物/右缘钳/下缘钳）+绑定面（mousemove 取词/空词隐/
//   mouseleave 隐）+结构面（三消费源接线+旧偏移/title 退役）。变异台账见文末。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const bstSrc = read('src/ui/BestiaryPanel.ts');
const emoteSrc = read('src/ui/EmoteMenu.ts');
const housingSrc = read('src/ui/HousingPanel.ts');
const tipSrc = read('src/ui/MouseTextTip.ts');

// 动态 import 拉全 Renderer 模块（2 万行,forks 池首编译 2-5s+）——整档放宽超时
vi.setConfig({ testTimeout: 120_000 });

/** 桩元素面（style/textContent 强类型,免 unknown 塌陷） */
type TipEl = { tagName: string; id: string; className: string; textContent: string;
  style: Record<string, string>; appendChild: () => void; getContext: () => unknown;
  offsetWidth: number; offsetHeight: number };

/** 气泡模块桩环境（node 无 DOM;单例态用 resetModules+动态 import 隔离）。
 *  量测面 = offsetWidth 42 / offsetHeight 18（鼠标 (100,200) 缺省锚 → (120,220)）。
 *  捕获面 = body.appendChild 只接 className='sw-mt-tip' 的单例（style 走 head）。
 *  Renderer 顶层建 canvas（popupMeasureCtx/tintCanvas 族）→ createElement('canvas')
 *  须给 getContext 最小 2D 桩（量测/染色顶层级调用,不做真渲染）。 */
async function freshTip() {
  vi.resetModules();
  let tip: TipEl | null = null;
  const ctx2d = {
    imageSmoothingEnabled: false, fillStyle: '', font: '',
    measureText: () => ({ width: 42, fontBoundingBoxAscent: 10,
      actualBoundingBoxAscent: 10, fontBoundingBoxDescent: 4, actualBoundingBoxDescent: 4 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {}, drawImage: () => {}, fillRect: () => {}, clearRect: () => {},
  };
  const mkEl = (tag: string): TipEl => {
    const el: TipEl = {
      tagName: tag, id: '', className: '', textContent: '',
      style: {},
      appendChild: () => {},
      getContext: () => ({ ...ctx2d }),
      offsetWidth: 42, offsetHeight: 18,
    };
    Object.defineProperty(el, 'offsetWidth', { value: 42 });
    Object.defineProperty(el, 'offsetHeight', { value: 18 });
    return el;
  };
  vi.stubGlobal('document', {
    getElementById: () => null,
    createElement: (tag: string) => mkEl(tag),
    head: { appendChild: () => {} },
    body: { appendChild: (n: TipEl) => { if (n.className === 'sw-mt-tip') tip = n; } },
  });
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
  const mod = await import('../src/ui/MouseTextTip');
  return { mod, tip: () => tip as TipEl | null };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('BJ-C4-F3 MouseText 气泡锚公式钉值（mouseTextAnchor 1:1,Main.cs:20379-20419）', () => {
  it('①缺省锚=X+14+6(ThickMouse 默认档)/Y+14+6——旧自创 +16/+20 退役（X 差 4px 定谳）', async () => {
    const { mod, tip } = await freshTip();
    mod.showMouseTextTip('僵尸', 100, 200);
    expect(tip()?.style.left).toBe('120px');   // 100+14+6
    expect(tip()?.style.top).toBe('220px');    // 200+14+6
  });

  it('②光标持物臂=X+34（:20390-20392 !mouseItem.IsAir）', async () => {
    const { mod, tip } = await freshTip();
    mod.showMouseTextTip('僵尸', 100, 200, { heldOnCursor: true });
    expect(tip()?.style.left).toBe('154px');   // 100+14+6+34
    expect(tip()?.style.top).toBe('220px');
  });

  it('③右缘 40px 收边（:20412-20415）:1200+42+40>1280 → x=1280−42−40', async () => {
    const { mod, tip } = await freshTip();
    mod.showMouseTextTip('克苏鲁之眼', 1200, 200);
    expect(tip()?.style.left).toBe('1198px');
  });

  it('④下缘 40px 收边（:20416-20419）:760+18+40>800 → y=800−18−40', async () => {
    const { mod, tip } = await freshTip();
    mod.showMouseTextTip('僵尸', 100, 760);
    expect(tip()?.style.top).toBe('742px');
  });

  it('⑤显隐面:show 置 display=block,hide 归 none;重显重锚（单例无残留）', async () => {
    const { mod, tip } = await freshTip();
    mod.showMouseTextTip('僵尸', 100, 200);
    expect(tip()?.style.display).toBe('block');
    expect(tip()?.style.left).toBe('120px');
    mod.hideMouseTextTip();
    expect(tip()?.style.display).toBe('none');
    mod.showMouseTextTip('僵尸', 300, 400);
    expect(tip()?.style.display).toBe('block');
    expect(tip()?.style.left).toBe('320px');
  });
});

describe('BJ-C4-F5 绑定面（bindMouseTextTip 元素级接线）', () => {
  it('⑥mousemove 取词随锚/空词隐/mouseleave 隐（MouseText 悬停即现语义）', async () => {
    const { mod, tip } = await freshTip();
    const listeners: Record<string, (e: unknown) => void> = {};
    const el = {
      addEventListener: (t: string, fn: (e: unknown) => void) => { listeners[t] = fn; },
    } as unknown as HTMLElement;
    let text = '僵尸';
    mod.bindMouseTextTip(el, () => text);
    listeners.mousemove({ clientX: 100, clientY: 200 });
    expect(tip()?.textContent).toBe('僵尸');
    expect(tip()?.style.left).toBe('120px');
    text = '';                                     // 空词 = 隐（bindTip 空串同语义）
    listeners.mousemove({ clientX: 100, clientY: 200 });
    expect(tip()?.style.display).toBe('none');
    text = '/僵尸';
    listeners.mousemove({ clientX: 30, clientY: 40 });
    expect(tip()?.style.display).toBe('block');
    expect(tip()?.textContent).toBe('/僵尸');
    listeners.mouseleave({});
    expect(tip()?.style.display).toBe('none');
  });
});

describe('BJ-C4-F3/F5 结构面（三消费源接线+旧面退役,漂移即红）', () => {
  it('⑦BestiaryPanel:bindTip 委托共享族,固定偏移/私有 tipEl/CSS 面退役', () => {
    expect(bstSrc).toContain('bindMouseTextTip(el, () => textFn()');
    expect(bstSrc).toContain('hideMouseTextTip');
    expect(bstSrc).toContain('uiHeldItemRef?(): boolean');
    expect(bstSrc).not.toContain('clientX + 16');       // 旧固定偏移 X（差 4px）
    expect(bstSrc).not.toContain('clientY + 20');       // 旧固定偏移 Y
    expect(bstSrc).not.toContain('.sw-bst-tip {');      // 私有 CSS 规则退役
    expect(bstSrc).not.toContain("className = 'sw-bst-tip'");   // 私有单例建面退役
    expect(bstSrc).not.toContain('this.tipEl');         // 私有单例字段退役
  });

  it('⑧EmoteMenu:原生 btn.title 退役 → MouseText 气泡族（EmoteButton.cs:79-84 面）', () => {
    expect(emoteSrc).toContain('bindMouseTextTip(btn, () => `/${emojiName}`)');
    expect(emoteSrc).not.toContain('btn.title');
  });

  it('⑨HousingPanel:原生 canvas.title 退役 → MouseText 气泡族（Main.cs:41513 面）;销毁随隐', () => {
    expect(housingSrc).toContain('showMouseTextTip(title, e.clientX, e.clientY)');
    expect(housingSrc).toContain('hideMouseTextTip()');
    expect(housingSrc).not.toContain('this.canvas.title');
    expect(housingSrc).toMatch(/destroy\(\): void \{[\s\S]*?hideMouseTextTip\(\)/);
  });

  it('⑩共享族单源=Renderer.mouseTextAnchor 委托（不得另抄公式副本）', () => {
    expect(tipSrc).toContain("from '../render/Renderer'");
    expect(tipSrc).toContain('mouseTextAnchor(clientX, clientY');
    expect(tipSrc).toContain('sw-mt-tip');
  });
});

// 变异证红（本轮实录,逐字节还原+sha256 对拍）:
//   M4 摘持物臂（showMouseTextTip 忽略 opts.heldOnCursor）→ ②红,余绿;
//   M5 摘右缘钳（锚算不传 screenWidth）→ ③红,余绿;
//   M6 摘 mouseleave 绑定 → ⑥红,余绿。
