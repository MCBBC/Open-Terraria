// BJ409：通关名单演出 NPC 舞台面判别测试（用户实报"城镇 NPC 悬空排成数排站在
// 半空"三根因的判别锁）：
//  ① 段时间窗门（Segments.cs:244-245/:397 消费端硬窗 1:1）——窗外不画。缺门时
//     全剧 64 npc + 30 spr 段从第 0 帧起全部常驻（探针实测泄漏 64/64、30/30）。
//  ② 收场群像 AddEmote 窗/侧（CreditsRollComposer.cs:322-326 + :311-316）——
//     EmoteSegment 目标帧 = fromTime+duration-blinkTime、时长 60、偏移恒 RIGHT。
//  ③ 画板 origin 语义（DrawData origin = Size*(0.5,1)+(ox,oy)、位置 verbatim）——
//     折叠错向曾致背景画板整体抬高（收场画板底边应恰在人群脚线 anchor.y）。
// 金标 = 反编译 1457/1458 亲读值； endTime 金标（20473@twoLines）不受本批影响
// （emote/origin 零计时面），连同复断 = 计时面变异哨。
import { describe, expect, it } from 'vitest';
import { fillSegments, type Seg, type Anim } from '../src/world/creditsRollComposer';
import { inSegWindow } from '../src/ui/CreditsRollOverlay';

const twoLines = (cat: string): string[] => [`${cat}.1`, `${cat}.2`];

function build(): Seg[] {
  const out: Seg[] = [];
  fillSegments(out, twoLines, true);
  return out;
}

/** Extra_241（收场群像画板）开场帧 */
function princessT(segs: Seg[]): number {
  const bg = segs.find((s): s is Extract<Seg, { k: 'spr' }> => s.k === 'spr' && s.tex === 'Extra_241');
  expect(bg).toBeDefined();
  return bg!.t;
}

describe('BJ409① 段时间窗门（Segments.cs:244-245/:397）', () => {
  it('演出开场（t=100,首段文字 peak 630 之前）：全部 npc/spr 段窗外=不画（泄漏=0）', () => {
    const segs = build();
    const npcSpr = segs.filter((s): s is Extract<Seg, { acts: Anim }> => s.k === 'npc' || s.k === 'spr');
    expect(npcSpr.length).toBeGreaterThan(50);
    const leaked = npcSpr.filter((s) => inSegWindow(s, 100));
    expect(leaked).toEqual([]);   // 缺窗门时此值 = 全部 94 段（用户实报根因）
  });

  it('每段窗内可见、窗外（前 1 帧/后 1 帧）不可见——逐段判别', () => {
    const segs = build();
    for (const s of segs) {
      if (s.k !== 'npc' && s.k !== 'spr') continue;
      const mid = s.t + Math.floor(s.acts.time / 2);
      expect(inSegWindow(s, mid), `${s.k}@${s.t} 窗内应可见`).toBe(true);
      expect(inSegWindow(s, s.t - 1), `${s.k}@${s.t} 开场前应不可见`).toBe(false);
      expect(inSegWindow(s, s.t + s.acts.time + 1), `${s.k}@${s.t} 收场后应不可见`).toBe(false);
      expect(s.acts.time).toBeGreaterThan(0);   // 窗非空（动作链 dedicated>0）
    }
  });
});

describe('BJ409② 收场群像 AddEmote 窗/侧（CreditsRollComposer.cs:311-326）', () => {
  it('Princess(663) 气泡：目标帧 = 场末-32（blinkTime=num5=32）、60t、恒 RIGHT 偏移', () => {
    const segs = build();
    const t0 = princessT(segs);
    // 663: AttackType=2 → num5 = 2*6 + 663%13*2 + 20 = 32；sx=1.5 → dx=1.5*26+14=53
    // sy=0 → dy = anchor.y(-40) + 0 - 38 = -78；look=-1 → flip=false
    const e = segs.find((s): s is Extract<Seg, { k: 'emote' }> => s.k === 'emote' && s.id === 17
      && s.t >= t0);
    expect(e).toBeDefined();
    expect(e!.t).toBe(t0 + 640 - 32);
    expect(e!.dur).toBe(60);
    expect(e!.dx).toBe(53);
    expect(e!.dy).toBe(-78);
    expect(e!.flip).toBe(false);
  });

  it('专属气泡（NPC 107）：目标帧 = start+duration2(160)、60t、flip=num9==1', () => {
    const segs = build();
    const t0 = princessT(segs);
    // 107 ∈ list4(l=3) → sx=4.5；duration2 = 107%6*20+60 = 160；flip 集 → num9=1
    const e = segs.find((s): s is Extract<Seg, { k: 'emote' }> => s.k === 'emote' && s.id === 0
      && s.t >= t0);
    expect(e).toBeDefined();
    expect(e!.t).toBe(t0 + 160);
    expect(e!.dur).toBe(60);
    expect(e!.dx).toBe(4.5 * 26 + 14);   // RIGHT 偏移（原文 AddEmote 硬编码 OnRight）
    expect(e!.flip).toBe(true);
  });

  it('收场窗内无早开气泡（旧病：t=t0 全场常驻气泡）', () => {
    const segs = build();
    const t0 = princessT(segs);
    const princessEmotes = segs.filter((s): s is Extract<Seg, { k: 'emote' }> => s.k === 'emote'
      && s.t >= t0 - 1 && s.t <= t0 + 700);
    expect(princessEmotes.length).toBeGreaterThan(0);
    for (const e of princessEmotes) {
      expect(e.t).toBeGreaterThan(t0);          // 全部延后开场（气泡在收场段才 pop）
      expect(e.dur).toBe(60);                   // EmoteSegment timeToPlay=60
    }
  });
});

describe('BJ409③ 画板 origin 语义（DrawData origin = Size*(0.5,1)+(ox,oy)）', () => {
  it('场景背景画板：位置 verbatim（anchor+_backgroundOffset）、ox/oy 入 origin', () => {
    const segs = build();
    // Guide/Zombie 场（num2=12）：anchor=(200-76+12, -80) → dx=136+76=212, dy=-80+166=86
    const g = segs.find((s): s is Extract<Seg, { k: 'spr' }> => s.k === 'spr' && s.tex === 'Extra_218');
    expect(g).toMatchObject({ dx: 212, dy: 86, ox: 12, oy: -42, originBottom: true });
  });

  it('收场画板 Extra_241：位置 verbatim（dy=anchor.y=-40）、oy=-92 → 底边恰在人群脚线', () => {
    const segs = build();
    const bg = segs.find((s): s is Extract<Seg, { k: 'spr' }> => s.k === 'spr' && s.tex === 'Extra_241');
    // 旧病：dy=-132（-40-92 折叠）+ 纯底 origin → 底边抬 92px（画板悬空）
    expect(bg).toMatchObject({ dx: 0, dy: -40, oy: -92, originBottom: true });
  });

  it('道具/立绘 originBottom 系归位（原文 Size*(0.5,1) 系底锚；Projectile_748 系中心锚）', () => {
    const segs = build();
    for (const tex of ['Extra_230', 'Extra_229', 'Extra_227', 'Extra_228', 'NPC_199']) {
      const s = segs.find((x): x is Extract<Seg, { k: 'spr' }> => x.k === 'spr' && x.tex === tex);
      expect(s, tex).toBeDefined();
      expect(s!.originBottom, `${tex} 应为底锚（原文 Size*(0.5,1)）`).toBe(true);
    }
    const bunny = segs.find((s): s is Extract<Seg, { k: 'spr' }> => s.k === 'spr' && s.tex === 'Projectile_748');
    expect(bunny).toBeDefined();
    expect(bunny!.originBottom).toBe(false);   // 原文 origin = Size()/2 中心锚
  });

  it('酒馆门板 Extra_240：窗 = :429 SetFrameSequence(770) 延伸（旧病漏装=窗 0 整场不可见）', () => {
    const segs = build();
    const door = segs.find((s): s is Extract<Seg, { k: 'spr' }> => s.k === 'spr' && s.tex === 'Extra_240');
    expect(door).toBeDefined();
    expect(door!.acts.time).toBe(770);
    const seqAct = door!.acts.acts.find((a) => a.a === 'framesFor');
    expect(seqAct).toBeDefined();
  });
});

describe('BJ409 计时面哨兵（emote/origin 零计时面）', () => {
  it('endTime 金标不受本批影响：20473@twoLines（原 IIII232 金标复断）', () => {
    const out: Seg[] = [];
    const { endTime } = fillSegments(out, twoLines, true);
    expect(endTime).toBe(20473);
  });
});
