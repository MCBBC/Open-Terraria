// BJ507 图鉴续批两件（BJ506 登记债 B2/B3）——判别面测试（2026-10-04）。
// 定谳锚 = Terarria1457 亲读（1456 交叉参照；冲突以 1457 为准）：
//   ①B2 掉落行悬停全量 item tooltip：UIBestiaryInfoItemLine.cs——构造 :16-22
//     _infoDisplayItem = SetDefaults(itemId) fresh item；DrawSelf :119-125 hover 且
//     非 _hideMouseOver → DrawMouseOver；DrawMouseOver :130-134 `Main.HoverItem =
//     _infoDisplayItem; Main.instance.MouseText("", 0, 0); Main.mouseText = true;`
//     → MouseText 走 item tooltip 全载荷管线（名称/伤害/工具提示全链）；
//     SetBestiaryNotesOnItemCache :136-151 条件 GetConditionDescription 逐行 join →
//     Item.BestiaryNotes → Main.cs:21539-21547 tooltip 末尾逐行追加（默认白，
//     行序 = 研究行后、商店价格行前）；MouseOver/MouseOut :163-172 音 12 + 金框。
//     本行恒 st≥DropsNoRates（icon+率形）→ _hideMouseOver（<3 锁形行）不可达。
//   ②B3 悬停 NPC 待机动画：UnlockableNPCEntryIcon.cs——dummy = new NPC +
//     IsABestiaryIconDummy=true（:17-21）；Update :49-109：DrawOffset 表解包 →
//     SimulateFirstHover :180-191（首次 Update 无条件 SetFrameSize + velocity.X =
//     direction*velocity + FindFrame ×1 → 静态帧 F(1)≡帧 0）；主动画分支 :99-109：
//     无 Frame 偏移且 **IsPortrait || IsHovered** → 每帧 velocity.X=direction*velocity
//     + FindFrame()；有 Frame 偏移 → FindFrame 后 frame.Y=frame.Height*Frame 钉死帧。
//     ★亲读定谳：详情页 Portrait（isPortrait:true，UIBestiaryNPCEntryPortrait.cs:36
//     → UIBestiaryEntryIcon.cs:29）IsPortrait 恒真 = **动画常驻播放**（打开详情页即播，
//     非悬停门控——任务书"悬停时播放"假设与原版不符，按原版落）；网格卡
//     （isPortrait:false，UIBestiaryEntryButton）= 悬停才播、移开帧冻结（NPC 对象
//     持久 → 重 hover 从上次帧继续）。FindFrame 速率 = UI Update 每主循环帧（60Hz）。
//     帧域 = dummy 恒定输入（vy=0/onGround/ai 全 0/满血/wet=IsWet/vx=direction*velocity）
//     下的 FindFrame 折叠 → 本仓 Renderer.bestiaryDummyFrameIdx（分支同序共享 Set）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageManager } from '../src/i18n/LanguageManager';
import { assembleTooltipLines } from '../src/ui/itemTooltip';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { bestiaryDummyFrameIdx } from '../src/render/Renderer';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';
import { UI } from '../src/ui/UI';
import { BestiaryPanel } from '../src/ui/BestiaryPanel';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

const defOf = (vid: number) => {
  const key = Object.keys(ITEM_BY_KEY).find((k) => ITEM_DEFS[ITEM_BY_KEY[k]]?.vid === vid);
  return key ? ITEM_DEFS[ITEM_BY_KEY[key]] : undefined;
};

// ============ ①B2：BestiaryNotes 行族（Main.cs:21539-21547 装载面） ============

describe('BJ507 B2 BestiaryNotes 行族（ctx.bestiaryNotes → 逐行默认白）', () => {
  it('① notes 两行 → 装载两行（tag=bestiarynote、无 color=默认白）；行序 = 末尾（无商店/研究行时）', () => {
    const def = defOf(75);   // 铜币无关任意 vid——hold 谓词只看行族
    const d = def ?? ITEM_DEFS[1];
    const lines = assembleTooltipLines(d, { id: ITEM_BY_KEY[d.key], stack: 1 }, null, null, { bestiaryNotes: ['在海洋掉落', '这是专家模式下的掉落率'] });
    const noteIdx = lines.map((l, i) => (l.tag === 'bestiarynote' ? i : -1)).filter((i) => i >= 0);
    expect(noteIdx).toHaveLength(2);
    expect(lines[noteIdx[0]].text).toBe('在海洋掉落');
    expect(lines[noteIdx[1]].text).toBe('这是专家模式下的掉落率');
    expect(lines[noteIdx[0]].color).toBeUndefined();   // lineColors 未设 = 默认白（:21545）
    expect(lines[noteIdx[1]].color).toBeUndefined();
    expect(noteIdx[1]).toBe(lines.length - 1);   // 无商店上下文 → 末行族（研究行后 :21539 位）
  });

  it('② 非图鉴悬停（缺省 ctx）→ 零 notes 行（旧消费面零变化）', () => {
    const d = defOf(75) ?? ITEM_DEFS[1];
    const lines = assembleTooltipLines(d, { id: ITEM_BY_KEY[d.key], stack: 1 }, null, null, {});
    expect(lines.filter((l) => l.tag === 'bestiarynote')).toHaveLength(0);
  });
});

// ============ ①B2：Main.HoverItem 面（UI 桥 → showTooltipFor 形状） ============

describe('BJ507 B2 UI 桥（showFloatingItemTooltip = Main.HoverItem 面）', () => {
  it('③ 桥 → showTooltipFor(itemId,"inv",{slot stack1, anchor, bestiaryNotes})（fresh item 同相,道具搜索行先例）', () => {
    const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
    const calls: unknown[][] = [];
    (ui as { showTooltipFor: unknown }).showTooltipFor = (...a: unknown[]) => { calls.push(a); };
    const anchor = { tag: 'anchor-stub' } as unknown as HTMLElement;
    (UI.prototype as unknown as { showFloatingItemTooltip: (i: number, a: HTMLElement, n?: string[]) => void })
      .showFloatingItemTooltip.call(ui, 258, anchor, ['条件行']);
    expect(calls).toHaveLength(1);
    const [id, where, override] = calls[0] as [number, string, { slot?: { id: number; stack: number }; anchor?: HTMLElement; bestiaryNotes?: string[] }];
    expect(id).toBe(258);
    expect(where).toBe('inv');
    expect(override?.slot).toEqual({ id: 258, stack: 1 });   // SetDefaults fresh（无词缀/stack1/未收藏）
    expect(override?.anchor).toBe(anchor);
    expect(override?.bestiaryNotes).toEqual(['条件行']);
  });

  it('④ notes 缺省 → 不写 bestiaryNotes 键（undefined）', () => {
    const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
    const calls: unknown[][] = [];
    (ui as { showTooltipFor: unknown }).showTooltipFor = (...a: unknown[]) => { calls.push(a); };
    (UI.prototype as unknown as { showFloatingItemTooltip: (i: number, a: HTMLElement) => void })
      .showFloatingItemTooltip.call(ui, 75, {} as HTMLElement);
    expect((calls[0][2] as { bestiaryNotes?: string[] }).bestiaryNotes).toBeUndefined();
  });

  it('⑤ hideFloatingItemTooltip → 气泡 display none（原版 mouseText 每帧重算,DOM 遗留态须显式撤）', () => {
    const ui = Object.create(UI.prototype) as unknown as { tooltip: { style: { display: string } }; hideFloatingItemTooltip: () => void };
    ui.tooltip = { style: { display: 'block' } };
    UI.prototype.hideFloatingItemTooltip.call(ui);
    expect(ui.tooltip.style.display).toBe('none');
  });
});

// ============ ②B3：dummy 帧域（bestiaryDummyFrameIdx 折叠钉值） ============

describe('BJ507 B3 dummy 帧域（UnlockableNPCEntryIcon 折叠：帧序列/速率钉值）', () => {
  it('⑥ SimulateFirstHover 首帧 F(1)≡帧 0（多族：静态/循环/行走/wet/兜底）——网格卡静态形与旧帧 0 零回归', () => {
    // 史莱姆（ai1,8t 循环）/蝙蝠（ai14,6t）/黄蜂（2t 摆动）/僵尸行走（vx=1）/兜底蠕虫
    expect(bestiaryDummyFrameIdx(1, 1, 1, 0, 2, false)).toBe(0);
    expect(bestiaryDummyFrameIdx(49, 14, 1, 0, 6, false)).toBe(0);
    expect(bestiaryDummyFrameIdx(42, 5, 1, 0, 3, false)).toBe(0);
    expect(bestiaryDummyFrameIdx(3, 3, 1, 1, 3, false)).toBe(0);
    expect(bestiaryDummyFrameIdx(5, 0, 1, 0, 2, false)).toBe(0);
  });

  it('⑦ 史莱姆（case 1,L71506）：每 8t 推进全循环（t=8→1、t=16→0@frames2）', () => {
    expect(bestiaryDummyFrameIdx(1, 1, 8, 0, 2, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(1, 1, 16, 0, 2, false)).toBe(0);
    expect(bestiaryDummyFrameIdx(1, 1, 7, 0, 2, false)).toBe(0);
  });

  it('⑧ 蝙蝠族（ai14,case 49 块 cs:75523-75585）：每 6t 推进；49 skip-last（cap=frames-1）', () => {
    expect(bestiaryDummyFrameIdx(49, 14, 6, 0, 6, false)).toBe(1);    // 49 在 BAT_SKIP_LAST
    expect(bestiaryDummyFrameIdx(49, 14, 6 * 5, 0, 6, false)).toBe(5 % 5);   // cap=5 回卷 → 0
    expect(bestiaryDummyFrameIdx(50, 14, 6, 0, 6, false)).toBe(1);    // 非 skip 族 cap=frames
  });

  it('⑨ 僵尸族（case 3,cs:77048-77087）：velocity=1 行走 fc=t*|vx| 相位 <8:0 <16:1 <24:2 :1；vx=0 站定帧 0', () => {
    expect(bestiaryDummyFrameIdx(3, 3, 10, 1, 3, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(3, 3, 18, 1, 3, false)).toBe(2);
    expect(bestiaryDummyFrameIdx(3, 3, 26, 1, 3, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(3, 3, 34, 1, 3, false)).toBe(0);
    expect(bestiaryDummyFrameIdx(3, 3, 18, 0, 3, false)).toBe(0);   // 无 velocity 数据 → dummy 站定
  });

  it('⑩ 黄蜂族（case 42,cs:75607-75633）：2t 一换 [0,1,2,1] 摆动', () => {
    expect(bestiaryDummyFrameIdx(42, 5, 2, 0, 3, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(42, 5, 4, 0, 3, false)).toBe(2);
    expect(bestiaryDummyFrameIdx(42, 5, 6, 0, 3, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(42, 5, 8, 0, 3, false)).toBe(0);
  });

  it('⑪ 鱼族 wet 门（IsWet 13 条数据,cs:74879-74924）：wet=游姿 0..3@6t / !wet=离水折腾 4/5', () => {
    expect(bestiaryDummyFrameIdx(55, 16, 6, 0, 6, true)).toBe(1);    // wet 帧 floor(t/6)%min(4,frames)
    expect(bestiaryDummyFrameIdx(55, 16, 6, 0, 6, false)).toBe(5);   // !wet 4+(floor(t/6)%2):floor(6/6)=1→5
    expect(bestiaryDummyFrameIdx(55, 16, 12, 0, 6, false)).toBe(4);  // floor(12/6)=2%2=0→4
  });

  it('⑫ 火星探测器 399（cs:72562-72565）：counter+0.25/t 四帧扫描（dummy ai0=0 无警戒带）', () => {
    expect(bestiaryDummyFrameIdx(399, 0, 4, 0, 8, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(399, 0, 8, 0, 8, false)).toBe(2);
    expect(bestiaryDummyFrameIdx(399, 0, 16, 0, 8, false)).toBe(0);
  });

  it('⑬ 法师族站定帧 0（CASTER,cs:77721-77743：vy=0/ai1=0 → 待机）；骷髅王头 ai11 帧 0', () => {
    expect(bestiaryDummyFrameIdx(29, 8, 30, 0, 3, false)).toBe(0);
    expect(bestiaryDummyFrameIdx(35, 11, 30, 0, 2, false)).toBe(0);
  });

  it('⑭ 克眼仆从 5（cs:77633-77643）：每 8t 全循环（6t 通用档快 1/3,专属 case）；兜底 6t 全循环', () => {
    expect(bestiaryDummyFrameIdx(5, 0, 6, 0, 2, false)).toBe(0);   // 8t 支:floor(6/8)=0
    expect(bestiaryDummyFrameIdx(5, 0, 8, 0, 2, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(912, 0, 12, 0, 4, false)).toBe(2);   // 兜底 floor(t/6)%frames
  });

  it('⑮ 钉帧/单帧判定（DrawOffset.frame 4/177/266 → 不可动画；多帧史莱姆可动画;单帧 7 不可动画）', () => {
    const p = BestiaryPanel.prototype as unknown as { canAnimateNpc(npcId: number): boolean };
    expect(p.canAnimateNpc(4)).toBe(false);      // DrawOffset.frame 钉帧
    expect(p.canAnimateNpc(177)).toBe(false);
    expect(p.canAnimateNpc(266)).toBe(false);
    expect(p.canAnimateNpc(1)).toBe(true);       // 史莱姆 frames=2
    expect(p.canAnimateNpc(7)).toBe(false);      // frames=1
  });
});

// ============ 接线结构锁（源文本） ============

describe('BJ507 接线结构锁', () => {
  const bstSrc = read('src/ui/BestiaryPanel.ts');
  const uiSrc = read('src/ui/UI.ts');
  const flowSrc = read('src/mainFlow.ts');
  const rendSrc = read('src/render/Renderer.ts');

  it('⑯ B2 掉落行接线：mouseenter = 音12 + showItemTooltip(条件 notes)；mouseleave = hideItemTooltip', () => {
    expect(bstSrc).toContain('UISfx.hover();   // MouseOver :127-129（SoundEngine.PlaySound(12)）');
    expect(bstSrc).toContain('this.flow.showItemTooltip?.(d.item, line, notes.length ? notes : undefined)');
    expect(bstSrc).toContain("line.addEventListener('mouseleave', () => this.flow.hideItemTooltip?.())");
    expect(bstSrc).toContain('dropCondText(d.cond)');   // notes = 条件描述行族
    expect(bstSrc).toContain('dropTagText(d.tag)');
  });

  it('⑰ B2 条件文案键勘正：Bestiary_ItemDropConditions（产物类别两层压一层）——旧拼 Bestiary.ItemDropConditions 死键', () => {
    expect(bstSrc).toContain('`Bestiary_ItemDropConditions.${tag}`');
    expect(bstSrc).toContain('`Bestiary_ItemDropConditions.${cond}`');
    expect(bstSrc).not.toContain('Bestiary.ItemDropConditions.${');
  });

  it('⑱ B2 UI 桥存在且注释锚 DrawMouseOver（Main.HoverItem 面单源委托）', () => {
    expect(uiSrc).toContain('showFloatingItemTooltip(itemId: number, anchor: HTMLElement, notes?: string[]): void');
    expect(uiSrc).toContain('hideFloatingItemTooltip(): void');
    expect(uiSrc).toContain('bestiaryNotes: override?.bestiaryNotes');   // ctx 透传
  });

  it('⑲ B3 接线：详情 Portrait 常驻动画（IsPortrait||IsHovered 锚）+ 网格卡 hover 播/移开冻结 + close 清 rAF', () => {
    expect(bstSrc).toContain('this.animAttach(canvas, r.npcId, \'portrait\', st > UnlockState.NotKnown)');
    expect(bstSrc).toContain("this.animAttach(canvas, r.npcId, 'grid', r.state > UnlockState.NotKnown)");
    expect(bstSrc).toContain("cell.addEventListener('mouseleave', () => this.animDetach(canvas))");
    expect(bstSrc).toContain('cancelAnimationFrame(this.animRaf)');
    expect(bstSrc).toContain('this.animLive.clear()');
  });

  it('⑳ B3 帧引擎锚：Renderer.bestiaryDummyFrameIdx 导出 + 60Hz 门闸步进（rAF>60Hz 不加速判例）', () => {
    expect(rendSrc).toContain('export function bestiaryDummyFrameIdx(');
    expect(bstSrc).toContain('bestiaryDummyFrameIdx(meta.npcId, ai, t, vx, frames, wet)');
    expect(bstSrc).toContain('16.6667');   // 60Hz 门闸
    expect(bstSrc).toContain('if (steps > 3) steps = 3');   // 追赶钳 3（tickClockSteps 同款）
  });

  it('㉑ flow 桥接线（mainFlow openBestiary → ui 两桥）', () => {
    expect(flowSrc).toContain('showItemTooltip: (itemId, anchor, notes) => ui.showFloatingItemTooltip(itemId, anchor, notes)');
    expect(flowSrc).toContain('hideItemTooltip: () => ui.hideFloatingItemTooltip()');
  });

  it('㉒ 动画帧源数据链：DrawOffset.velocity/wet 消费（317 条 velocity=1 行走族/13 条 wet 鱼游姿）', () => {
    expect(bstSrc).toContain('velocity?: number; wet?: boolean');
    expect(bstSrc).toContain('const vx = ov?.velocity ?? 0');
    expect(bstSrc).toContain('const wet = ov?.wet ?? false');
  });
});
