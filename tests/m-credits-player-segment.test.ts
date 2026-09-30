// 刀 M：收场 PlayerSegment 玩家形象段判别测试（BJ409 债#1 清偿锁）。
// 金标 = 反编译 1457 亲读：
//  - 编排 CreditsRollComposer.cs:210-225（num3=240/num4=400/num6=3/num7=-0.05/
//    num8=60/num9=90/num10=start+240/num11=51）——PlayerSegment targetTime =
//    start+240-60+51 = start+231、anchorOffset = sceneAnchor+(0,-90)、
//    DedicatedTimeNeeded = Then/With 链 0+60+200+140+120+85 = 545。
//  - 段窗/锚语义 Segments.cs:170-212（窗门 :172-175、盒底中心锚 :187-188）。
//  - 帧行 Player.cs:36523/:36824（velocity.Y≠0 → 行5 跳跃,静止 → 行0）。
//  - 小件 Actions.cs:426-470 DoBunnyRestAnimation（行 10..13 每 4 帧一进封顶 13）、
//    :645-685 ZombieKnockOnDoor（(int)num%60/4≤3 → position+(-1,0) 否则回位）。
import { describe, expect, it } from 'vitest';
import { fillSegments, type Seg, type Anim } from '../src/world/creditsRollComposer';
import { inSegWindow, evalActs, blankState, type EvalState } from '../src/ui/CreditsRollOverlay';

const twoLines = (cat: string): string[] => [`${cat}.1`, `${cat}.2`];

function build(): Seg[] {
  const out: Seg[] = [];
  fillSegments(out, twoLines, true);
  return out;
}

/** Extra_241（收场群像画板）开场帧 = 本场 startTime */
function princessT(segs: Seg[]): number {
  const bg = segs.find((s): s is Extract<Seg, { k: 'spr' }> => s.k === 'spr' && s.tex === 'Extra_241');
  expect(bg).toBeDefined();
  return bg!.t;
}

/** 收场 PlayerSegment（全剧唯一 player 段） */
function playerSeg(segs: Seg[]): Extract<Seg, { k: 'player' }> {
  const p = segs.find((s): s is Extract<Seg, { k: 'player' }> => s.k === 'player');
  expect(p).toBeDefined();
  return p!;
}

function evalPlayer(seg: Extract<Seg, { k: 'player' }>, local: number): EvalState {
  const st = blankState();
  evalActs(seg.acts.acts, local, st, false);
  return st;
}

describe('M① PlayerSegment 段窗/锚钉值（CreditsRollComposer.cs:210-225）', () => {
  it('targetTime = start+231（num10-num8+num11 = start+240-60+51）', () => {
    const segs = build();
    const t0 = princessT(segs);
    const p = playerSeg(segs);
    expect(p.t).toBe(t0 + 231);
  });

  it('anchorOffset = sceneAnchor+(0,-90)（num9 = 3*60+(-0.05)*(60²/2) = 90）；dx = Dedication 帧 vector2.X', () => {
    const segs = build();
    const t0 = princessT(segs);
    const p = playerSeg(segs);
    // sceneAnchorPosition.Y += 40 → -40；玩家落地前锚 = -40-90 = -130（场心上方 90px 起跳）
    expect(p.dy).toBe(-130);
    // 收场场 X = vector2.X：Webmaster 起 `X *= 0`（-200*0 = -0,IEEE 符号保留）
    expect(Math.abs(p.dx)).toBe(0);
    expect(Object.is(p.dx, -0)).toBe(true);
    expect(t0).toBeGreaterThanOrEqual(0);
  });

  it('段窗 = [t, t+545]（DedicatedTimeNeeded 0+60+200+140+120+85；SegmentInforReport=785 不变）', () => {
    const segs = build();
    const p = playerSeg(segs);
    expect(p.acts.time).toBe(545);
    expect(inSegWindow(p, p.t)).toBe(true);
    expect(inSegWindow(p, p.t + 545)).toBe(true);
    expect(inSegWindow(p, p.t - 1)).toBe(false);
    expect(inSegWindow(p, p.t + 546)).toBe(false);
    // 玩家窗 ⊂ 场景窗（totalTime = num5+85+60 = 785）
    expect(p.t + 545 - princessT(segs)).toBeLessThanOrEqual(785);
  });
});

describe('M② 动作链延迟金标（Then/With 预分配 = Actions.cs ApplyTo delay）', () => {
  it('链序：fade0@0 → look1@0 → fade(1,60)@0 → wait200@0 → accel@0 → wait140@200 → look-1@200 → wait120@340 → look1@340 → fade(0,85)@460', () => {
    const p = playerSeg(build());
    const delays = p.acts.acts.map((a) => `${a.a}@${a.delay}`);
    expect(delays).toEqual([
      'fade@0', 'look@0', 'fade@0', 'wait@0', 'accel@0',
      'wait@200', 'look@200', 'wait@340', 'look@340', 'fade@460',
    ]);
  });
});

describe('M③ 帧行/透明度闭式（Player.cs:36523/:36824 + Players.Fade）', () => {
  it('下落期 local∈[0,60) velocity.Y=3-0.05t≠0 → 跳跃行5；落地（t≥60）velocity=0 → 站立行0', () => {
    const p = playerSeg(build());
    expect(evalPlayer(p, 0).vy).toBe(3);
    expect(evalPlayer(p, 30).vy).toBeCloseTo(3 - 0.05 * 30, 10);
    expect(evalPlayer(p, 59).vy).not.toBe(0);
    // MoveWithAcceleration 钳 num=duration：t≥60 → velocity = 3-0.05*60 = 0
    expect(evalPlayer(p, 60).vy).toBe(0);
    expect(evalPlayer(p, 199).vy).toBe(0);
    // wait140(delay200) 在 accel 后追加置零 → 恒 0
    expect(evalPlayer(p, 300).vy).toBe(0);
    expect(evalPlayer(p, 500).vy).toBe(0);
    // 渲染判据：行 5 仅下落期
    const rowOf = (local: number): number => (evalPlayer(p, local).vy !== 0 ? 5 : 0);
    expect(rowOf(0)).toBe(5);
    expect(rowOf(59)).toBe(5);
    expect(rowOf(60)).toBe(0);
    expect(rowOf(545)).toBe(0);
  });

  it('位移闭式：local=60 恰落 90px（3*60-0.05*60²/2）——落地站位 = sceneAnchor', () => {
    const p = playerSeg(build());
    expect(evalPlayer(p, 60).dy).toBeCloseTo(90, 6);
    expect(evalPlayer(p, 60).dx).toBe(0);
    // 起跳帧位移 0（锚 -130 → 人群脚线 -40 差 90）
    expect(evalPlayer(p, 0).dy).toBe(0);
    // 下落中段
    expect(evalPlayer(p, 30).dy).toBeCloseTo(3 * 30 - 0.05 * 30 * 30 * 0.5, 6);
    // 过窗动作钳终值（t>60 位移恒 90）
    expect(evalPlayer(p, 200).dy).toBeCloseTo(90, 6);
  });

  it('淡入淡出：local=0 立即全隐（Fade(0) 先手）、30/60 帧半透、60 后全显、460+85 淡出', () => {
    const p = playerSeg(build());
    expect(evalPlayer(p, 0).opacity).toBe(0);       // Fade(0) 置位先于 Fade(1,60) Lerp
    expect(evalPlayer(p, 30).opacity).toBeCloseTo(0.5, 6);
    expect(evalPlayer(p, 60).opacity).toBeCloseTo(1, 6);
    expect(evalPlayer(p, 460).opacity).toBe(1);
    expect(evalPlayer(p, 502).opacity).toBeCloseTo(1 - 42 / 85, 6);   // 淡出 42/85
    expect(evalPlayer(p, 545).opacity).toBe(0);
  });

  it('朝向三段（LookAt 1→-1→1）：sheets 朝右系,渲染翻转面 = look<0', () => {
    const p = playerSeg(build());
    expect(evalPlayer(p, 100).look).toBe(1);        // LookAt(1)@0
    expect(evalPlayer(p, 250).look).toBe(-1);       // LookAt(-1)@200
    expect(evalPlayer(p, 400).look).toBe(1);        // LookAt(1)@340
  });
});

describe('M④ 连带小件：ZombieKnockOnDoor（Actions.cs:645-685）', () => {
  /** Guide/Zombie 场（895 开场）的僵尸段（type 3,knock 链 60/…） */
  function zombieSeg(segs: Seg[]): Extract<Seg, { k: 'npc' }> {
    const t0 = 895;   // 手算金标：Creator 首段 peak 630 + 55 + 210 = 895
    const z = segs.find((s): s is Extract<Seg, { k: 'npc' }> => s.k === 'npc' && s.type === 3 && s.t === t0);
    expect(z).toBeDefined();
    return z!;
  }
  function evalNpc(seg: Extract<Seg, { k: 'npc' }>, local: number): EvalState {
    const st = blankState();
    evalActs(seg.acts.acts, local, st, true);
    return st;
  }

  it('knock 击窗（每 60 帧前 16 帧）位移 -1、回位帧 +1；moving 置位（velocity.X=0.75 走路帧域）', () => {
    const z = zombieSeg(build());
    // 首 knock 段窗 [d, d+60)（三段 knock delay 背靠背 60/120/180,后段窗内闭式
    // 叠加——判别取首窗内差分:move(-0.5,60) 钳定常量 -30 对消,只剩 knock 闭式项）
    const knock = z.acts.acts.find((a) => a.a === 'knock');
    expect(knock).toBeDefined();
    const d = knock!.delay;
    const dxAt = (off: number): number => evalNpc(z, d + off).dx;
    // num∈[0,15] → (int)num%60/4 ≤ 3 → position += (-1,0)；num=16..59 → 回位 +1
    expect(dxAt(15) - dxAt(16)).toBe(-2);
    expect(dxAt(0) - dxAt(30)).toBe(-2);
    expect(dxAt(0) - dxAt(59)).toBe(-2);
    // 击窗期 moving（FindFrame 走路相位）
    expect(evalNpc(z, d + 0).moving).toBe(true);
  });
});

describe('M⑤ 连带小件：DoBunnyRestAnimation（Actions.cs:426-470）', () => {
  /** DryadTurningToTree 场的镇兔段（type 656、rest 90@链尾段） */
  function bunnySeg(segs: Seg[]): Extract<Seg, { k: 'npc' }> {
    const b = segs.find((s): s is Extract<Seg, { k: 'npc' }> => s.k === 'npc' && s.type === 656
      && s.acts.acts.some((a) => a.a === 'rest'));
    expect(b).toBeDefined();
    return b!;
  }

  it('rest 钉帧行 = min(10+floor(num/4),13)：0-3→10、4-7→11、8-11→12、12+→13（封顶）', () => {
    const b = bunnySeg(build());
    const rest = b.acts.acts.find((a) => a.a === 'rest');
    expect(rest).toBeDefined();
    expect(rest!.d).toBe(90);
    const st = blankState();
    evalActs(b.acts.acts, rest!.delay + 2, st, true);
    expect(st.restRow).toBe(10);
    const st4 = blankState();
    evalActs(b.acts.acts, rest!.delay + 4, st4, true);
    expect(st4.restRow).toBe(11);
    const st12 = blankState();
    evalActs(b.acts.acts, rest!.delay + 12, st12, true);
    expect(st12.restRow).toBe(13);
    // 过 duration 钳 num=duration → 恒 13（90/4=22.5 → 封顶）
    const stEnd = blankState();
    evalActs(b.acts.acts, rest!.delay + 89, stEnd, true);
    expect(stEnd.restRow).toBe(13);
  });
});

describe('M 计时面哨兵（PlayerSegment 段不进 SegmentInforReport 之外账面）', () => {
  it('endTime 金标不受本刀影响：20545@twoLines（★C6-F1 重锚）', () => {
    const { endTime } = fillSegments([], twoLines, true);
    expect(endTime).toBe(20545);
  });
  it('全剧恰一个 player 段（收场群像专属）', () => {
    const segs = build();
    expect(segs.filter((s) => s.k === 'player').length).toBe(1);
  });
});
