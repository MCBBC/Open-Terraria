// C6 红蓝 P2 清偿刀判别锁（F1/F2/F5/F6；F8=零改动定谳无测试面）。
// 金标 = 反编译 1457 亲读：
//  - F1 endTime：Actions.cs:987-994 无时长参 SetFrameSequence 构造器
//    _duration = _timePerFrame * _frameIndices.Length（ExpectedLengthOfActionInFrames）
//    ——树段 C#:790 Then(seq 9帧×tpf8) dedicated 72 + Wait 30 = 102 进 num 账
//    （C#:802 num += DedicatedTimeNeeded）→ endTime 20545（20473+72;旧 20473 =
//    TS actLength('frames')=0 漏账的实现值,"手算 Tree720"对该场景被证伪）。
//  - F2 帧序列两形态：Actions.cs:1005-1039——循环系（时长参 :980-985）相位锚段首
//    local%(tpf*len)（delay 只作 :1007 门槛）；一次性系（无时长参 :987-994）
//    local−delay 钳 [0,tpf*len] 除 tpf 钳末帧（hold）。覆写链 = ProcessActions
//    （Segments.cs:113-121）数组序逐帧施加、后写胜。
//  - F5 DryadSayingBye（CreditsRollComposer.cs:356-461）：dry(550) 链止于 :401
//    Move(30) → dedicated 690 硬切无退场；tav(20) :402 Wait(30)/:426 Wait(80)/
//    :442 Wait(90)/:444 Fade(2,127) → dedicated 987 原地淡出 [860,987]；门板
//    :441 Fade(0,num6-30=60) → dedicated 830；NPC_550 贴图 LooseSprite :405-425
//    （t=num、Then Fade(1)/SimulateGravity(80)、With 循环 13帧×tpf4 + Fade(0,85)
//    均 delay=0）dedicated 80、:449 入列；item6 气泡 :440（id 10,t=num,90t,:456 入列）。
//  - F6 Blink：CreditsRollComposer.cs:243-248 num6=180（663/108）+ :306-308
//    With(Blink)（delay = 末段 Wait(90-num5) 起点 = _lastDedicatedTimeNeeded）；
//    Actions.cs:509-543 ApplyTo local≤dur → ai[0]=1001；NPC.cs:69972-69976
//    frame.Y = num*(num60-1)，num60 = npcFrameCount−AttackFrameCount（:69433;
//    108/663 AFC=2 —— NPCID.cs:4839）→ 眨眼行 = 23-2-1 = 20。
import { describe, expect, it } from 'vitest';
import { fillSegments, type Seg, type Anim } from '../src/world/creditsRollComposer';
import { blankState, evalActs, seqFrameIndex, BLINK_ATTACK_FRAMES, inSegWindow, type EvalState } from '../src/ui/CreditsRollOverlay';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';

const twoLines = (cat: string): string[] => [`${cat}.1`, `${cat}.2`];

type SprSeg = Extract<Seg, { k: 'spr' }>;
type NpcSeg = Extract<Seg, { k: 'npc' }>;
type EmoteSeg = Extract<Seg, { k: 'emote' }>;

function build(): Seg[] {
  const out: Seg[] = [];
  fillSegments(out, twoLines, true);
  return out;
}

function sprOf(segs: Seg[], tex: string): SprSeg {
  const s = segs.find((x): x is SprSeg => x.k === 'spr' && x.tex === tex);
  expect(s, tex).toBeDefined();
  return s!;
}

// ═══ F1：无时长参 SetFrameSequence 账面（Actions.cs:987-994） ═══

describe('C6-F1 actLength(frames)=tpf*len（endTime 20545）', () => {
  it('树段 seq 账面 72 进链（seq 后首个 Wait delay=72,C#:802 num += 72+30=102）', () => {
    const tree = sprOf(build(), 'Extra_215');
    const seqAct = tree.acts.acts.find((a) => a.a === 'frames') as
      { tpf: number; frames: unknown[]; delay: number } | undefined;
    expect(seqAct).toBeDefined();
    expect(seqAct!.tpf).toBe(8);
    expect(seqAct!.frames.length).toBe(9);
    expect(seqAct!.delay).toBe(0);
    // seq 长度 72 进 Then 链 → 后继 Wait(30) delay=72（旧病 actLength=0 → delay=0）
    const wait30 = tree.acts.acts.find((a) => a.a === 'wait' && (a as { d: number }).d === 30);
    expect(wait30!.delay).toBe(72);
    // 全链 = 72+30+420+120 = 642（C# :790/:801/:827 同构;num 账吃前 102）
    expect(tree.acts.time).toBe(642);
  });

  it('endTime 金标 20545@twoLines（20473+72）', () => {
    expect(fillSegments([], twoLines, true).endTime).toBe(20545);
  });

  it('联动窗：齿轮 29 帧进 dedicated（541=60+120+174+187;尾淡出 delay=354 非 240）', () => {
    const gear = sprOf(build(), 'Extra_230');
    expect(gear.acts.time).toBe(541);
    const tailFade = gear.acts.acts.find((a) => a.a === 'fade' && (a as { dur?: number }).dur === 127);
    expect(tailFade!.delay).toBe(354);
  });

  it('联动窗：骨架箱盖 dedicated 260（20+130+90+20;旧 220）', () => {
    const chest = sprOf(build(), 'Extra_228');
    expect(chest.acts.time).toBe(260);
  });

  it('联动窗：藤蔓 liana seq hold 24 帧 → NPC_199 窗 144（旧 120;C#:693 无时长参构造）', () => {
    const liana = sprOf(build(), 'NPC_199');
    expect(liana.acts.time).toBe(144);
    const holdSeq = liana.acts.acts.find((a) => a.a === 'frames');
    expect(holdSeq).toBeDefined();   // :693 重分类 framesFor→frames
  });
});

// ═══ F2：帧序列两形态（hold / 循环+相位锚段首） ═══

describe('C6-F2 SetFrameSequence 两形态（Actions.cs:1005-1039）', () => {
  it('hold（一次性系）：树 seq local≥72 钳末帧 (0,8)（循环系会回绕 (0,1)=旧病）', () => {
    const idxOf = (local: number): number => seqFrameIndex(
      { frames: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8]], tpf: 8, delay: 0, loop: false },
      local,
    );
    expect(idxOf(0)).toBe(0);
    expect(idxOf(8)).toBe(1);
    expect(idxOf(71)).toBe(8);
    expect(idxOf(72)).toBe(8);
    expect(idxOf(200)).toBe(8);      // 钳末帧（旧循环公式 = (200%72)/8 = 1 → 红判据）
    expect(idxOf(1000)).toBe(8);
  });

  it('循环系相位锚段首：门板 seq(delay=770,cyc=40) local=770 → idx 2（旧公式=0）', () => {
    const frames = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]] as Array<[number, number]>;
    const idxOf = (local: number): number => seqFrameIndex({ frames, tpf: 5, delay: 770, loop: true }, local);
    // C#: (int)(local % 40) / 5 —— 770%40=10 → 2（vanilla 门板开弹自第 3 帧起）
    expect(idxOf(770)).toBe(2);
    expect(idxOf(790)).toBe(6);      // 790%40=30 → 6
    expect(idxOf(800)).toBe(0);      // 800%40=0 → 0（新循环拍）
    // delay 只作门槛（:1007-1010）——相位不含 delay 减项
    expect(idxOf(810)).toBe(2);
  });

  it('覆写链（骨架箱盖 ProcessActions 后写胜,Segments.cs:113-121）：seq1 hold→seq2 循环→SetFrame→seq3 hold', () => {
    const chest = sprOf(build(), 'Extra_228');
    const at = (local: number): EvalState => {
      const st = blankState();
      evalActs(chest.acts.acts, local, st, false);
      return st;
    };
    // [0,20): seq1 hold [[0,1]..[0,4]]（F2③——旧病 seq1/seq2 同 delay=0 被覆写永不显示）
    const s10 = at(10);
    expect(s10.seq!.loop).toBe(false);
    expect(s10.seq!.frames[seqFrameIndex(s10.seq!, 10)]).toEqual([0, 3]);
    // [20,150): seq2 循环（相位锚段首:25%20=5 → idx 1 → (0,6)）
    const s25 = at(25);
    expect(s25.seq!.loop).toBe(true);
    expect(s25.seq!.frames[seqFrameIndex(s25.seq!, 25)]).toEqual([0, 6]);
    // [150,240): With(SetFrame(0,5)) 后写胜 → st.frame（C# 数组序 SetFrame 晚于 seq2）
    const s160 = at(160);
    expect(s160.seq).toBeNull();
    expect(s160.frame).toEqual([0, 5]);
    // [240,∞): seq3 hold [[0,9],[0,10],[0,11],[0,13]] —— local 250 → idx 2 (0,11);
    //  过 260 钳末帧 (0,13)（F2① 判据——旧循环公式 local=400 → (400%20)/5=0 → (0,9)）
    const s250 = at(250);
    expect(s250.seq!.frames[seqFrameIndex(s250.seq!, 250)]).toEqual([0, 11]);
    const s400 = at(400);
    expect(s400.seq!.loop).toBe(false);
    expect(s400.seq!.frames[seqFrameIndex(s400.seq!, 400)]).toEqual([0, 13]);
  });
});

// ═══ F5：DryadSayingBye 三处欠账 + 追加定谳（CreditsRollComposer.cs:356-461） ═══

describe('C6-F5 DryadSayingBye 动作面 1:1', () => {
  function scene(): { start: number; dry: NpcSeg; tav: NpcSeg; door: SprSeg; jumper: SprSeg; item6: EmoteSeg } {
    const segs = build();
    const start = sprOf(segs, 'Extra_235').t;
    const dry = segs.find((s): s is NpcSeg => s.k === 'npc' && s.type === 550 && s.t === start);
    const tav = segs.find((s): s is NpcSeg => s.k === 'npc' && s.type === 20 && s.t === start);
    const jumper = segs.find((s): s is SprSeg => s.k === 'spr' && s.tex === 'NPC_550');
    const item6 = segs.find((s): s is EmoteSeg => s.k === 'emote' && s.id === 10 && s.t === start + 770);
    expect(dry, 'dry@sceneStart').toBeDefined();
    expect(tav, 'tav@sceneStart').toBeDefined();
    expect(jumper, 'NPC_550 LooseSprite（:405-425,:449 入列）').toBeDefined();
    expect(item6, 'item6 气泡（:440,:456 入列）').toBeDefined();
    return { start, dry: dry!, tav: tav!, door: sprOf(segs, 'Extra_240'), jumper: jumper!, item6: item6! };
  }

  it('dry(550) 链止于 :401 Move(30) → dedicated 690 硬切（无 wait(80)/move(−0.5)/fade 退场）', () => {
    const { dry } = scene();
    expect(dry.acts.time).toBe(690);
    const last = dry.acts.acts[dry.acts.acts.length - 1];
    expect(last).toMatchObject({ a: 'move', vx: -1, d: 30, delay: 660 });
    expect(dry.acts.acts.some((a) => a.a === 'wait' && (a as { d: number }).d === 80)).toBe(false);
    expect(dry.acts.acts.some((a) => a.a === 'move' && (a as { vx: number }).vx === -0.5)).toBe(false);
    // 硬切判据：窗止于 690（inSegWindow 后沿闭）
    expect(inSegWindow(dry, dry.t + 690)).toBe(true);
    expect(inSegWindow(dry, dry.t + 691)).toBe(false);
  });

  it('tav(20) :402 Wait(30) 非 Move + :442 Wait(90) + :444 Fade(2,127) 原地淡出 → dedicated 987', () => {
    const { tav } = scene();
    expect(tav.acts.time).toBe(987);
    // :402（追加定谳）——Wait(30)@660（此前误拷 :382 的 Move(−1,30)）
    expect(tav.acts.acts.some((a) => a.a === 'wait' && (a as { d: number }).d === 30 && a.delay === 660)).toBe(true);
    expect(tav.acts.acts.some((a) => a.a === 'move' && a.delay === 660)).toBe(false);
    // :442 补漏 wait(90)@770 → 淡出窗 [860,987]（vanilla 原地淡出 860→987）
    expect(tav.acts.acts.some((a) => a.a === 'wait' && (a as { d: number }).d === 90 && a.delay === 770)).toBe(true);
    const tail = tav.acts.acts[tav.acts.acts.length - 1];
    expect(tail).toMatchObject({ a: 'fade', per: 2, dur: 127, delay: 860 });
    // 原地：690 后无 move 项——dx 终值 = −(120+30) 冻结
    const at = (local: number): number => {
      const st = blankState();
      evalActs(tav.acts.acts, local, st, true);
      return st.dx;
    };
    expect(at(700)).toBe(-150);
    expect(at(987)).toBe(-150);
  });

  it('门板窗 830 = seq(770)+Fade(0,60)（:441）;NPC_550 跃走段 t=start+690/窗 80/重力(−0.2,−0.35)/13 帧循环', () => {
    const { start, door, jumper } = scene();
    expect(door.acts.time).toBe(830);
    expect(jumper.t).toBe(start + 690);       // :409 SpriteSegment(val3, num,…)
    expect(jumper.acts.time).toBe(80);        // SimulateGravity(80) 账面
    expect(jumper.frames).toBe(25);           // Frame(1, npcFrameCount[550]=25)
    const g = jumper.acts.acts.find((a) => a.a === 'gravity') as { v0: { x: number; y: number }; d: number } | undefined;
    expect(g).toMatchObject({ v0: { x: -0.2, y: -0.35 }, d: 80 });
    const seq = jumper.acts.acts.find((a) => a.a === 'framesFor') as { d: number; tpf: number; frames: unknown[]; delay: number } | undefined;
    expect(seq!.d).toBe(80);
    expect(seq!.tpf).toBe(4);
    expect(seq!.frames.length).toBe(13);      // (0,2)..(0,14)
    expect(seq!.delay).toBe(0);               // With 于 Then(Fade1)/Then(gravity) 后 → delay=last=0
    const jumpFade = jumper.acts.acts.find((a) => a.a === 'fade' && (a as { dur?: number }).dur === 85);
    expect(jumpFade!.delay).toBe(0);          // With(Fade(0,85)) delay=0 整窗淡出
  });

  it('item6 气泡（:440）id=10/t=start+770/dur=90', () => {
    const { item6 } = scene();
    expect(item6.dur).toBe(90);
  });
});

// ═══ F6：Blink(180) 663/108（Actions.cs:509-543 + CreditsRollComposer.cs:243-248/:306-308） ═══

describe('C6-F6 Blink 域', () => {
  it('收场群像仅 663/108 带 blink act d=180，delay = 末段 Wait 起点（With 语义 :306-308）', () => {
    const segs = build();
    const t0 = sprOf(segs, 'Extra_241').t;
    const waving = segs.filter((s): s is NpcSeg => s.k === 'npc' && s.t >= t0 && s.t <= t0 + 800);
    expect(waving.length).toBeGreaterThan(20);
    const blinked = waving.filter((s) => s.acts.acts.some((a) => a.a === 'blink'));
    expect(blinked.map((s) => s.type).sort((a, b) => a - b)).toEqual([108, 663]);
    for (const s of blinked) {
      const blink = s.acts.acts.find((a) => a.a === 'blink') as { d: number; delay: number };
      expect(blink.d).toBe(180);
      const waits = s.acts.acts.filter((a) => a.a === 'wait');
      const lastWait = waits[waits.length - 1];
      expect(blink.delay).toBe(lastWait.delay);   // With 于末段 Wait 起点
    }
  });

  it('ApplyTo 语义：local≤180 → blink=true+moving=false;local>180 → blink=false（ai[0]=0 归位）', () => {
    const st = blankState();
    evalActs([
      { a: 'move', vx: 1, vy: 0, d: 60, delay: 0 },
      { a: 'blink', d: 180, delay: 60 },
    ], 60, st, true);
    expect(st.blink).toBe(true);
    expect(st.moving).toBe(false);   // velocity = Vector2.Zero
    const stEnd = blankState();
    evalActs([
      { a: 'move', vx: 1, vy: 0, d: 60, delay: 0 },
      { a: 'blink', d: 180, delay: 60 },
    ], 241, stEnd, true);
    expect(stEnd.blink).toBe(false);
  });

  it('眨眼帧行 = npcFrameCount−AFC−1：108/663 → 23-2-1 = 20（NPC.cs:69433 num60−1/:69972）', () => {
    expect(BLINK_ATTACK_FRAMES).toMatchObject({ 108: 2, 663: 2 });   // NPCID.cs:4839
    for (const type of [108, 663]) {
      const frames = VANILLA_NPCS[String(type)]?.frames ?? 0;
      expect(frames).toBe(23);   // Main.cs:67493 npcFrameCount 表
      expect(frames - BLINK_ATTACK_FRAMES[type] - 1).toBe(20);
    }
  });
});
