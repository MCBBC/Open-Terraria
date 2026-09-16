// SW-BJ95 2026-09-16 三债清偿守卫（UI 拖拽面对拍补课 + bootstrap 查询透传 + __swAudio 同名覆写）
//
// 原版权威（Terarria1457 亲读；债1 对拍锚）：
//   ItemSlot.cs:894   `bool flag = Main.mouseLeftRelease && Main.mouseLeft;` —— 槽位拾取只发生在
//                     按压沿帧（mouseLeftRelease 每帧末按 `!mouseLeft` 重算,Main.cs:52700-52707）；
//                     :899-906 `num != 3 && !flag → return` + `case 0: MouseItemSwap`。
//   TriggersSet.cs:837-843  `if (MouseLeft) { if (!Main.blockMouse && !p.mouseInterface)
//                     p.controlUseItem = true; }` —— controlUseItem = 电平,面板悬停(mouseInterface)压制;
//                     :865-868 右键 controlUseTile 同式。
//   Player.cs:17526-17548 PickItemSelectionOverride —— mouseItem 非空 → 伪选中 58（先于 SmartSelectLookup,
//                     调用点 :523-525）。
//   Player.cs:5122    `inventory[58] = Main.mouseItem.Clone()`;:5139-5147 丢出臂 = controlThrow ∪
//                     (mouseRight && !mouseInterface && mouseRightRelease) ∪ !playerInventory
//                     ——【左键松手无任何丢出臂】;:5144-5145 吞沿（releaseUseTile/mouseRightRelease=false）;
//                     :5136-5141 关包臂 GetOrDropItem(mouseItem)。
//   原版拖拽放置语义：按压沿槽位拾取 → 按住移出 UI（mouseInterface 复位）→ mouseLeft 电平驱动
//   使用/放置链（拖到哪放到哪）→ 松手物品留在光标（无左键丢出臂）。BJ92 三刀（拾取沿补武
//   mouseDown/mouseHeld 电平、面板外松手 no-op、左键放行世界）与之同相（逐式判语见批章）。
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bootstrap, carryQuery } from '../tools/probe/lib/boot.mjs';
import { audioTail } from '../tools/probe/lib/record.mjs';

const src = (p: string): string =>
  fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

// ==================== 债1：BJ92 UI.ts 拖拽块逐式对拍补课（RB21 边界声明清偿） ====================
describe('SW-BJ95 债1 BJ92 拖拽面结构锁（对拍判语钉源）', () => {
  const ui = src('../src/ui/UI.ts');
  const game = src('../src/core/Game.ts');

  it('式① 拖拽拾取沿补武世界左键电平：门 = 拾取成沿 heldStack 已置（空拾取沿不误发热键物）', () => {
    // 原版同相锚：ItemSlot.cs:894 按压沿拾取后,TriggersSet.cs:837-843 mouseLeft 电平
    // 在 !mouseInterface 域驱动使用/放置链。本仓 mouseHeld = 电平(mouseup 即清,Input.ts:249),
    // mouseDown = 边沿(updateUse :12959 重入总闸的门票);补武沿由 :2037 heldStack 门把守。
    expect(ui).toMatch(
      /this\.pickUp\(this\.dragFrom\.i, this\.dragFrom\.where\);[\s\S]{0,1400}if \(this\.heldStack\) \{[\s\S]{0,200}inp\.mouseDown = true; inp\.mouseHeld = true;/,
    );
  });

  it('式② 拖拽放置连续面：tile 放置支不吃 mouseDown 边沿（按住期 = 原版电平连续铺放）', () => {
    // 原版：controlUseItem 电平存续期 ItemCheck 逐 tick 重入 → 拖到哪放到哪。
    // 本仓：tryPlace 不消费 mouseDown（Game.ts 无 mouseDown=false 写点在放置链），
    // 边沿存续到松手 = 按住连续放置同相。
    expect(game).not.toMatch(/private tryPlace\([\s\S]{0,6000}inp\.mouseDown = false/);
  });

  it('式③ 左键松手保留：resolveDrop 面板外 = no-op（原版左键无丢出臂,dropItemCheck :5139 右键限定）', () => {
    expect(ui).toMatch(/const inPanel = target\?\.closest\?\.\('\.sw-panel, \.sw-eqdock, \.sw-vinv, \.sw-itemsearch'\);\s*\n\s*if \(inPanel\) \{\s*\n\s*this\.placeHeld\(from\.i, from\.where\);/);
    expect(ui).not.toMatch(/if \(!inPanel\) \{[^}]*throwHeldToWorld/);
    // 右键丢出臂仍在（dropItemCheck :5139-5146 唯一丢出臂 + :5144-5145 吞沿）
    expect(ui).toMatch(/if \(e\.button === 0\) return;\s*\n\s*this\.throwHeldToWorld\(\);/);
    expect(ui).toMatch(/this\.throwHeldToWorld\(\);[\s\S]{0,300}this\.game\.input\.rightDown = false;/);
  });

  it('式④ 补武沿的消费面压制完备：annotate 标注沿 + 住房查询沿都有 inpOverDomUi 门（mouseInterface 等价）', () => {
    // ★BJ95 新守卫：补武前,槽位/面板按压不入 Input（DOM 事件不达 canvas 监听）→
    // 这两个世界沿消费点天然只见 canvas 按压;补武后拖拽拾取也产生带沿 —— 两个缺
    // mouseInterface 等价门的消费点会把沿落成「面板 tile 坐标」的世界动作（误标/
    // 误查房）。vanilla 同位消费序：ItemSlot.Handle→LeftClick 先吃 mouseLeftRelease
    // （ItemSlot.cs:894 读沿；:4210 置 false 系 TogglePet/ToggleLight 专用臂非通用点，
    // 通用 release 消费点=Main.cs DrawInterface 各臂）→ 槽位按压到不了住房查询
    // （Main.cs:45985 `!mouseLeftRelease → return`）。
    expect(game).toMatch(/this\.annotateMode && inp\.mouseDown && !this\._prevMouseDown && !this\._annoLatch && !inp\.uiBlocking && !this\.inpOverDomUi\(\)/);
    expect(game).toMatch(/if \(inp\.mouseDown && !this\._prevMouseDown && !this\.inpOverDomUi\(\)\) \{/);
  });
});

// ==================== 债2：bootstrap gotoApp 洗 URL 参数（BJ78 域外新账） ====================
/** 假 page:记录全部 goto 导航;evaluate 按 probe lib 各调用面返回罐头值
 *  （cleanStorage 传 {IDB_NAME,...} 对象参;waitForBridge 无参;ackWelcome 两个位置参）。 */
function fakePage(initialUrl: string) {
  let url = initialUrl;
  const navs: string[] = [];
  const page = {
    navs,
    url: () => url,
    bringToFront: async () => {},
    goto: async (u: string) => { navs.push(u); url = u; },
    evaluate: async (_fn: unknown, ...rest: unknown[]) =>
      rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null && 'IDB_NAME' in (rest[0] as object)
        ? { idbDeleted: true, idbBlocked: false, lsKeys: 0 }
        : true,
  };
  return page as never as { navs: string[]; url: string };
}

describe('SW-BJ95 债2 bootstrap 查询透传（carryQuery + bootstrap 导航面）', () => {
  it('carryQuery：保留参数/剥 t=/about:blank 与无参 = 空/多参保序', () => {
    expect(carryQuery('http://x:5201/?swperf=0&t=123')).toBe('?swperf=0');
    expect(carryQuery('http://x:5201/?t=123&swperf=0')).toBe('?swperf=0');
    expect(carryQuery('http://x:5201/?slopewave=1&wwarp=0')).toBe('?slopewave=1&wwarp=0');
    expect(carryQuery('about:blank')).toBe('');
    expect(carryQuery('http://x:5201/')).toBe('');
    expect(carryQuery('http://x:5201/?invlayout=vanilla&t=9')).toBe('?invlayout=vanilla');
  });

  it('带参页面经 bootstrap：全部内部导航透传参数（goto + clean 后 reload 两跳都在）', async () => {
    const page = fakePage('http://x:5201/?swperf=0');
    const r = await bootstrap(page as never, 'http://x:5201');
    expect(r.ok).toBe(true);
    expect(page.navs.length).toBeGreaterThanOrEqual(2);
    for (const u of page.navs) {
      expect(u).toContain('swperf=0');          // 参数不洗
      expect(u).toContain('t=');                // 缓存击穿参数照补
      expect(u.match(/t=/g)?.length).toBe(1);   // 旧 t 被剥,不叠双份
    }
  });

  it('多参页面同透传；无参/about:blank 页 = 旧行为（裸 origin + t=）', async () => {
    const p1 = fakePage('http://x:5201/?slopewave=1&wwarp=0');
    expect((await bootstrap(p1 as never, 'http://x:5201')).ok).toBe(true);
    expect(p1.navs.every((u) => u.includes('slopewave=1') && u.includes('wwarp=0'))).toBe(true);

    const p2 = fakePage('about:blank');
    expect((await bootstrap(p2 as never, 'http://x:5201')).ok).toBe(true);
    expect(p2.navs.every((u) => u.startsWith('http://x:5201/?t='))).toBe(true);
  });

  it('keepQuery:false = 逃生门（旧行为：裸 origin 洗参）', async () => {
    const page = fakePage('http://x:5201/?swperf=0');
    expect((await bootstrap(page as never, 'http://x:5201', { keepQuery: false })).ok).toBe(true);
    expect(page.navs.every((u) => !u.includes('swperf'))).toBe(true);
  });
});

// ==================== 债3：__swAudio 同名覆写（BJ74 登记债） ====================
describe('SW-BJ95 债3 __swAudio/__swAudioRec 拆名（单名单义锁）', () => {
  const game = src('../src/core/Game.ts');
  const mainFlow = src('../src/mainFlow.ts');
  const record = src('../tools/probe/lib/record.mjs');
  const report = src('../src/debug/DebugReport.ts');

  it('Game 录制器桥 = __swAudioRec；__swAudio 名下不再有任何 Game 侧赋值', () => {
    expect(game).toContain('(window as unknown as { __swAudioRec?: AudioRecorder }).__swAudioRec = this.audioRec;');
    expect(game).not.toContain('__swAudio?: AudioRecorder');
    expect(game).not.toMatch(/\.__swAudio = this\.audioRec/);
  });

  it('mainFlow AudioSystem 桥恒占 __swAudio（菜单期即挂,不被顶掉）', () => {
    expect(mainFlow).toContain('(window as unknown as { __swAudio?: AudioSystem }).__swAudio = audio;');
  });

  it('record.mjs 三消费面（tail/toggle/export）全读 __swAudioRec——空值守卫恢复真实（菜单期 null 而非炸）', () => {
    expect(record.match(/const rec = window\.__swAudioRec;/g)?.length).toBe(3);
    expect(record).not.toMatch(/window\.__swAudio\b/);
  });

  it('DebugReport.musicTrace 读 __swAudio.trace（AudioSystem 环）——域内恢复活体（BJ74 心跳面）', () => {
    expect(report).toContain('__swAudio?.trace');
  });

  it('行为面：audioTail 对 __swAudioRec 桩取 tail;缺席 = null（对 AudioSystem 形态缺席不再炸）', async () => {
    const g = globalThis as unknown as { window?: unknown };
    const stub = { tail: (a: number, b: number) => ({ sfx: [`s${a}`], bgm: [`b${b}`] }) };
    g.window = { __swAudioRec: stub };
    try {
      expect(await audioTail(fakeEvalPage())).toEqual({ sfx: ['s800'], bgm: ['b200'] });
      // 菜单态（无 Game → 无录制器桥）：返回 null 守卫,不改名前此处读到 AudioSystem
      // （无 .tail）会 TypeError——改名后守卫语义恢复真实
      g.window = { __swAudio: { trace: [], curMusic: 0 } };
      expect(await audioTail(fakeEvalPage())).toBeNull();
    } finally {
      delete g.window;
    }
  });
});

/** audioTail 用假 page：真执行 evaluate 回调（Node 环境下对 stubbed globalThis.window 跑）。 */
function fakeEvalPage() {
  const page = { evaluate: async (fn: (a: unknown) => unknown, args?: unknown) => fn(args) };
  return page as never;
}
