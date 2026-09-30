// IIII232：图鉴杀数交互门收口 + CreditsRollEvent/CreditsRollComposer 机制对齐测试。
// 金标 = 手算 1458 源值（详见 docs/worldgen/content-parity-vs-vanilla-2026-08-16.md
// CCV 章 §2）：fillSegments(inGame, 每类目 2 行) endTime = 20545
// （★C6-F1 重锚：actLength('frames')=tpf*len（Actions.cs:987-994）——20473 系
// 树段 seq 账面漏记 72 的 TS 实现值,反编译亲读 = 102 进账,旧"手算"实为沿实现）；
// 行距 55（1458 变更面）；类目序 = FillSegments 派发序。
import { describe, expect, it, beforeEach } from 'vitest';
import { creditsRoll, CREDITS_ROLL_MAX_TIME, onGameEventClearedMoonLord } from '../src/world/CreditsRoll';
import { fillSegments, getCreditsRollFill, invalidateCreditsRollFill, type Seg } from '../src/world/creditsRollComposer';
import { pickMusic, pickTowMusic, newMusicState, type MusicInput } from '../src/data/Music';

const twoLines = (cat: string): string[] => [`${cat}.1`, `${cat}.2`];
const threeLines = (cat: string): string[] => [`${cat}.1`, `${cat}.2`, `${cat}.3`];

/** vanilla FillSegments 派发序（CreditsRollComposer.cs:83-161） */
const CATEGORY_ORDER = [
  'CreditsRollCategory_Creator',
  'CreditsRollCategory_ExecutiveProducer',
  'CreditsRollCategory_Designer',
  'CreditsRollCategory_Programming',
  'CreditsRollCategory_Graphics',
  'CreditsRollCategory_Music',
  'CreditsRollCategory_Sound',
  'CreditsRollCategory_Dialog',
  'CreditsRollCategory_QualityAssurance',
  'CreditsRollCategory_BusinessDevelopment',
  'CreditsRollCategory_Marketing',
  'CreditsRollCategory_PublicRelations',
  'CreditsRollCategory_Webmaster',
  'CreditsRollCategory_Playtesting',
  'CreditsRollCategory_Localization',
  'CreditsRollCategory_SpecialThanksto',
  'CreditsRollCategory_Dedication',
  'CreditsRollCategory_EndingNotes',
];

beforeEach(() => {
  creditsRoll.reset();
});

describe('IIIII232 CreditsRollEvent（CreditsRollEvent.cs 1:1）', () => {
  it('初始未进行中；tryStarting → IsEventOngoing 且 remainingTime=传入时长', () => {
    expect(creditsRoll.isEventOngoing).toBe(false);
    creditsRoll.tryStarting(1234);
    expect(creditsRoll.isEventOngoing).toBe(true);
    expect(creditsRoll.remainingTime).toBe(1234);
  });

  it('tryStarting 缺省 28800（MAX_TIME_FOR_CREDITS_ROLL_IN_FRAMES）', () => {
    creditsRoll.tryStarting();
    expect(creditsRoll.remainingTime).toBe(28800);
    expect(CREDITS_ROLL_MAX_TIME).toBe(28800);
  });

  it('UpdateTime 每帧 -1（Main.cs:65949），归零即收', () => {
    creditsRoll.tryStarting(3);
    creditsRoll.updateTime();
    creditsRoll.updateTime();
    expect(creditsRoll.isEventOngoing).toBe(true);
    creditsRoll.updateTime();
    expect(creditsRoll.isEventOngoing).toBe(false);
    // 归零后继续递减不越界（Clamp 0..28800）
    creditsRoll.updateTime();
    expect(creditsRoll.remainingTime).toBe(0);
  });

  it('SetRemainingTimeDirect 钳 0..28800（msg 140 收侧直写）', () => {
    creditsRoll.setRemainingTimeDirect(50000);
    expect(creditsRoll.remainingTime).toBe(28800);
    creditsRoll.setRemainingTimeDirect(-5);
    expect(creditsRoll.remainingTime).toBe(0);
  });

  it('Reset 归零（Main.LoadWorld :53051 / WorldGen.Reset :6948）', () => {
    creditsRoll.tryStarting(500);
    creditsRoll.reset();
    expect(creditsRoll.isEventOngoing).toBe(false);
    expect(creditsRoll.remainingTime).toBe(0);
  });

  it('onGameEventClearedMoonLord = case 10 桥（TryStartingCreditsRoll）', () => {
    onGameEventClearedMoonLord(777);
    expect(creditsRoll.remainingTime).toBe(777);
  });

  it('CanPlayCreditsRoll（Main.cs:3223-3232）：八音盒 5044 ∪ 名单菜单 ∪ IsEventOngoing', () => {
    // 游戏内无八音盒、事件未开 → false
    expect(creditsRoll.canPlay(false, false, 0)).toBe(false);
    // hasCreditsSceneMusicBox（musicBoxStyle===85）→ true（事件未开也播）
    expect(creditsRoll.canPlay(true, false, 0)).toBe(true);
    // 事件进行中 → true
    creditsRoll.tryStarting(100);
    expect(creditsRoll.canPlay(false, false, 0)).toBe(true);
    // 菜单域 menuMode 3000 → true
    creditsRoll.reset();
    expect(creditsRoll.canPlay(false, true, 3000)).toBe(true);
    // 菜单其他模式不吃门
    expect(creditsRoll.canPlay(false, true, 0)).toBe(false);
  });
});

describe('IIIII232 CreditsRollComposer（FillSegments 1:1 金标）', () => {
  it('endTime 金标：inGame + 每类目 2 行 = 20545（手算：头 630 + 18 类目行账 990'
    + ' + 14 小剧场 11200（Guide597/Merch1207/Demo1032/Tink487/DryadBye957/Wiz787/'
    + 'Cloth380/Angl967/Zoo622/Skel777/Tree792/Steam541/Santa907/Witch1147）'
    + ' + 间隔 33×210=6930 + 收场 785 + 尾 10）', () => {
    const out: Seg[] = [];
    const { endTime } = fillSegments(out, twoLines, true);
    expect(endTime).toBe(20545);
  });

  it('行数敏感：每类目 +1 行 → endTime 恰 +18×55（PlaySegment_TextRoll totalTime=n*55-55）', () => {
    const a = fillSegments([], twoLines, true).endTime;
    const b = fillSegments([], threeLines, true).endTime;
    expect(b - a).toBe(18 * 55);
  });

  it('文字行距 55（1458 变更面，1456=80）；类目内行 peak 逐行 +55', () => {
    const out: Seg[] = [];
    fillSegments(out, twoLines, true);
    const texts = out.filter((s): s is Extract<Seg, { k: 'text' }> => s.k === 'text');
    expect(texts.length).toBe(18 * 2);
    // 同类目相邻两行 peak 差 = 55
    for (let i = 0; i + 1 < texts.length; i += 2) {
      expect(texts[i + 1].peak - texts[i].peak).toBe(55);
    }
  });

  it('类目派发序 1:1（FillSegments :83-161）', () => {
    const out: Seg[] = [];
    fillSegments(out, twoLines, true);
    const seen: string[] = [];
    for (const s of out) {
      if (s.k === 'text') {
        const cat = s.text.replace(/\.\d+$/, '');
        if (!seen.includes(cat)) seen.push(cat);
      }
    }
    expect(seen).toEqual(CATEGORY_ORDER);
  });

  it('首段文字 peak = 630（inGame num5=210*3）；菜单域头 180', () => {
    const inGame: Seg[] = [];
    fillSegments(inGame, twoLines, true);
    const firstText = inGame.find((s): s is Extract<Seg, { k: 'text' }> => s.k === 'text');
    expect(firstText?.peak).toBe(630);
    const menu: Seg[] = [];
    fillSegments(menu, twoLines, false);
    const firstMenuText = menu.find((s): s is Extract<Seg, { k: 'text' }> => s.k === 'text');
    expect(firstMenuText?.peak).toBe(180);
  });

  it('锚点交替（vector2.X 翻转序）：Creator +200 / ExecProducer -200 / Graphics 0 / Music -200', () => {
    const out: Seg[] = [];
    fillSegments(out, twoLines, true);
    const peakOf = (cat: string): { peak: number; ax: number } => {
      const t = out.find((s): s is Extract<Seg, { k: 'text' }> => s.k === 'text' && s.text === `${cat}.1`);
      return { peak: t!.peak, ax: t!.ax };
    };
    expect(peakOf('CreditsRollCategory_Creator')).toMatchObject({ peak: 630, ax: 200 });
    expect(peakOf('CreditsRollCategory_ExecutiveProducer')).toMatchObject({ ax: -200 });
    // vector2.X *= 0 对 -200 产生 -0（C# IEEE 同）——数值判等
    expect(Math.abs(peakOf('CreditsRollCategory_Graphics').ax)).toBe(0);
    expect(peakOf('CreditsRollCategory_Music')).toMatchObject({ ax: -200 });
    expect(Math.abs(peakOf('CreditsRollCategory_QualityAssurance').ax)).toBe(0);
  });

  it('手算小剧场时长：Guide 597 / Tinkerer 487（经后继类目首行 peak 反推）', () => {
    const out: Seg[] = [];
    fillSegments(out, twoLines, true);
    const peakOf = (cat: string): number => {
      const t = out.find((s): s is Extract<Seg, { k: 'text' }> => s.k === 'text' && s.text === `${cat}.1`);
      return t!.peak;
    };
    // Guide 小剧场：895 开场，total 597 → ExecProducer 首行 peak = 895+597+210 = 1702
    expect(peakOf('CreditsRollCategory_ExecutiveProducer')).toBe(895 + 597 + 210);
    // Tinkerer 小剧场（Programming 之后）：Programming 首行 peak P → 本 roll 贡献 55
    // + gap 210 + 小剧场 487 + gap 210 → Graphics 首行 peak = P+55+210+487+210
    const programming = peakOf('CreditsRollCategory_Programming');
    expect(peakOf('CreditsRollCategory_Graphics')).toBe(programming + 55 + 210 + 487 + 210);
  });

  it('时间线守恒：段开场帧非负、text peak 单调不减', () => {
    const out: Seg[] = [];
    fillSegments(out, twoLines, true);
    let lastPeak = -Infinity;
    for (const s of out) {
      const sv = s as { t?: number; peak?: number };   // text 段有 peak 无 t,其余段有 t 无 peak
      expect(sv.t ?? sv.peak).toBeGreaterThanOrEqual(0);
      if (s.k === 'text') {
        expect(s.peak).toBeGreaterThanOrEqual(lastPeak);
        lastPeak = s.peak;
      }
    }
  });

  it('NPC 段全部为城镇/小动物域 id；每小剧场恰一块 512² 背景画板', () => {
    const out: Seg[] = [];
    fillSegments(out, twoLines, true);
    const npcs = out.filter((s): s is Extract<Seg, { k: 'npc' }> => s.k === 'npc');
    expect(npcs.length).toBeGreaterThan(0);
    for (const n of npcs) {
      expect(n.type).toBeGreaterThan(0);
      expect(n.type).not.toBe(121);   // 121 不进图鉴域的占位 id 不该出现
    }
    const bgs = out.filter((s): s is Extract<Seg, { k: 'spr' }> => s.k === 'spr'
      && /^Extra_(2[123456789]|3[01234567])/.test(s.tex) && Math.abs(s.dy) > 0 && s.originBottom);
    expect(bgs.length).toBeGreaterThanOrEqual(14);   // 14 小剧场各一块（Guide 2 块/Steampunker 2 块）
  });
});

describe('IIIII232 选曲链（Main.cs:12021/:12706 → MusicID 89）', () => {
  const baseInput = (): MusicInput => {
    const st = newMusicState();
    return {
      scene: {} as MusicInput['scene'],
      isDay: true,
      worldSurface: 100, rockLevel: 300, lavaLine: 500,
      centerX: 0, centerY: 0,
      state: st,
    } as MusicInput;
  };

  it('经典链链首：IsEventOngoing → 89（先于火把神 101 与 Boss flag）', () => {
    const inp = { ...baseInput(), creditsRoll: true, torchGod: true, eventMusic: 38 };
    expect(pickMusic(inp)).toBe(89);
  });

  it('TOW 链链首：IsEventOngoing → 89（:12021，IIIII230 登记缺口清偿）', () => {
    const inp = { ...baseInput(), creditsRoll: true, torchGod: true, eventMusic: 1 };
    expect(pickTowMusic(inp)).toBe(89);
  });

  it('月事件链尾仍覆写名单曲（:13150-13157 链尾语义）', () => {
    const inp = { ...baseInput(), creditsRoll: true, moonMusic: 30 };
    expect(pickMusic(inp)).toBe(30);
  });

  it('未进行中不抢链（torchGod 恢复 101）', () => {
    const inp = { ...baseInput(), torchGod: true };
    expect(pickMusic(inp)).toBe(101);
  });
});

describe('IIIII232 getCreditsRollFill 缓存与失效', () => {
  it('同一实例缓存；invalidate 后重建', () => {
    invalidateCreditsRollFill();
    const a = getCreditsRollFill(true);
    const b = getCreditsRollFill(true);
    expect(b).toBe(a);
    invalidateCreditsRollFill();
    const c = getCreditsRollFill(true);
    expect(c).not.toBe(a);
    expect(c.endTime).toBe(a.endTime);
  });
});
