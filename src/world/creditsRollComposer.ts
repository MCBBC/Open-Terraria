// 制作组名单演出编排（CreditsRollComposer）—— Terraria.GameContent.Skies.CreditsRoll/
// CreditsRollComposer.cs 1:1 移植（IIIII232，1458 锚；1456↔1458 该文件唯一语义变更
// = PlaySegment_TextRoll 行距 80→55 + CreateDialogFilter 单参重载）。
//
// 结构 = 分段时间线（IAnimationSegment）：每段带 t（开场帧）+ 动作链。动作链
// Then/With 语义（Terraria.GameContent.Animations/Segments.cs:97-110）：
//  - Then(act)：act.delay = 累计 DedicatedTimeNeeded，再 += act.ExpectedLengthOfActionInFrames；
//  - With(act)：act.delay = 上一次 Then 后的累计值（并行），不推进累计。
// 动作 ApplyTo 均为 localTime 闭式函数（Actions.cs：Move=offsetPerFrame*t、
// MoveWithAcceleration=v0*t+a*t²/2、SimulateGravity=v0*t+g*t²+rot*t、Fade 线性）——
// 渲染端（ui/CreditsRollOverlay.ts）逐帧无状态求值。
//
// 剧目 = 文字卷轴（PlaySegment_TextRoll :1420-1436：类目键 .1/.2/… 逐行、行距 55、
// totalTime = n*55-55）与 Grox 小剧场（城镇 NPC 编排 + Extra_215..241 背景/道具 +
// EmoteSegment 气泡）交替；收场/开场 = PlaySegment_PrincessAndEveryoneThanksPlayer。
// endTime = FillSegments 累计 + 10（:163）= CreditsRollSky.AmountOfTimeNeededForFullPlay。
// 文本源 = Language.FindAll(Lang.CreateDialogFilter("CreditsRollCategory_X."))——经
// lineResolver 注入（LanguageManager.keysFromCategory 保插入序等价）。
// 登记债：SkeletonMerchant 骨头散落/SantaItemExample（FillSegments 未调用=死代码）
// 等 item 喷洒段不渲染（Wait 链时长原样保留）；PlayerSegment 玩家形象渲染缺独立
// 烘焙口（时序保留），详见 docs/worldgen/content-parity-vs-vanilla-2026-08-16.md 本批章。

export interface Vec { x: number; y: number }

/** 动作（Actions.cs 对应类；delay = SetDelay 值，渲染端消费） */
export type Act =
  | { a: 'look'; d: number; delay: number }                                  // LookAt
  | { a: 'fade'; target?: number; dur?: number; per?: number; delay: number } // Fade(target[,dur]) / Fade(alphaPerFrame[,dur])
  | { a: 'wait'; d: number; delay: number }                                  // Wait
  | { a: 'move'; vx: number; vy: number; d: number; delay: number }          // Move(offsetPerFrame,dur)
  | { a: 'accel'; vx: number; vy: number; ax: number; ay: number; d: number; delay: number } // MoveWithAcceleration
  | { a: 'show'; item: number; d: number; delay: number }                    // ShowItem
  | { a: 'variant'; v: number; delay: number }                               // NPCs.Variant
  | { a: 'forceAlt'; i: number; delay: number }                              // NPCs.ForceAltTexture
  | { a: 'party'; delay: number }                                            // NPCs.PartyHard
  | { a: 'rest'; d: number; delay: number }                                  // NPCs.DoBunnyRestAnimation
  | { a: 'knock'; d: number; delay: number }                                 // NPCs.ZombieKnockOnDoor
  | { a: 'frames'; frames: Array<[number, number]>; tpf: number; delay: number }  // Sprites.SetFrameSequence(无限; tpf=每帧 tick 数)
  | { a: 'framesFor'; frames: Array<[number, number]>; tpf: number; d: number; delay: number } // SetFrameSequence(dur,…; tpf=每帧 tick 数)
  | { a: 'frame'; x: number; y: number; delay: number }                      // Sprites.SetFrame
  | { a: 'gravity'; v0: Vec; g: Vec; rot: number; d: number; delay: number } // Sprites.SimulateGravity
  | { a: 'rotor'; per: Vec; speed: number; axis: Vec; d: number; delay: number }; // NPCs.MoveWithRotor

/** act.ExpectedLengthOfActionInFrames（Actions.cs 各类） */
function actLength(a: Act): number {
  switch (a.a) {
    case 'look': case 'variant': case 'forceAlt': case 'party': return 0;
    case 'fade': return a.dur ?? 0;
    case 'frames': return 0;
    case 'frame': return 0;                     // SetFrame(0,1,0,0) duration=0
    default: return a.d;
  }
}

/** 分发式 Omit（联合类型逐支剥离 delay——裸 Omit 会塌缩判别联合） */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type ActSpec = DistOmit<Act, 'delay'>;

/** AnimationSegmentWithActions<T>（Segments.cs:68-115）——Then/With 延迟链 */
export class Anim {
  dedicated = 0;
  private last = 0;
  readonly acts: Act[] = [];
  then(a: ActSpec): this {
    const act = { ...a, delay: this.dedicated } as Act;
    this.acts.push(act);
    this.last = this.dedicated;
    this.dedicated += actLength(act);
    return this;
  }
  with(a: ActSpec): this {
    this.acts.push({ ...a, delay: this.last } as Act);
    return this;
  }
  /** DedicatedTimeNeeded */
  get time(): number {
    return this.dedicated;
  }
}

export type Seg =
  | { k: 'text'; peak: number; text: string; ax: number; ay: number }
  | { k: 'npc'; t: number; type: number; dx: number; dy: number; acts: Anim }
  | { k: 'spr'; t: number; tex: string; dx: number; dy: number; flip?: boolean;
      originBottom: boolean; frames?: number; ox?: number; oy?: number; acts: Anim }
  | { k: 'emote'; t: number; id: number; dur: number; dx: number; dy: number;
      flip?: boolean; vel?: Vec }
  | { k: 'player'; t: number; dx: number; dy: number; acts: Anim };

/** Composer 字段常量（CreditsRollComposer.cs:26-34） */
const EMOTE_LEFT: Vec = { x: -14, y: -38 };   // _emoteBubbleOffsetWhenOnLeft
const EMOTE_RIGHT: Vec = { x: 14, y: -38 };   // _emoteBubbleOffsetWhenOnRight
const BG_OFFSET: Vec = { x: 76, y: 166 };     // _backgroundOffset
const SCENE_FIX_X = -BG_OFFSET.x;             // GetSceneFixVector（:789-792）(−76,0)

/** PlaySegment_TextRoll 行距（1458 :1432 `int num = 55`；1456=80） */
const TEXT_ROLL_LINE_SPACING = 55;

export interface FillResult {
  segments: Seg[];
  endTime: number;
}

// ═══════════ 段构造捷径 ═══════════

/** PlaySegment_TextRoll 1:1：anchorOffset.Y -= 40（值类型副本语义）；
 *  行 i 的 timeToShowPeak = startTime + i*55；totalTime = n*55 + 55*(-1) */
function textRoll(out: Seg[], startTime: number, sourceCategory: string,
  anchorOffset: Vec, lines: string[]): number {
  const ao: Vec = { x: anchorOffset.x, y: anchorOffset.y - 40 };
  for (let i = 0; i < lines.length; i++) {
    out.push({ k: 'text', peak: startTime + i * TEXT_ROLL_LINE_SPACING, text: lines[i], ax: ao.x, ay: ao.y });
  }
  return lines.length * TEXT_ROLL_LINE_SPACING + TEXT_ROLL_LINE_SPACING * -1;
}

/** NPCSegment 捷径：NPC 底部中心锚于 sceneAnchor+(dx,dy)（_originAtBottom (0.5,1)） */
function npc(out: Seg[], t: number, type: number, anchor: Vec, dx: number, dy: number,
  build: (an: Anim) => void): Anim {
  const an = new Anim();
  build(an);
  out.push({ k: 'npc', t, type, dx: anchor.x + dx, dy: anchor.y + dy, acts: an });
  return an;
}

/** 通用出场链：Fade(255) 立即置 alpha=255（隐）→ With Fade(-5,51) 51 帧淡入 */
function enter(an: Anim, look?: number): Anim {
  if (look !== undefined) an.then({ a: 'look', d: look });
  an.then({ a: 'fade', target: 255 });
  an.with({ a: 'fade', per: -5, dur: 51 });
  return an;
}

/** SpriteSegment 捷径。originBottom=true → origin (w/2+ox, h+oy)（原文
 *  Size*(0.5,1)+(ox,oy) 系；★BJ409⑤ ox/oy 归位为 origin 加项——此前把 (ox,oy)
 *  折进位置且取纯底 origin = 双重错位：底边 vanilla=P.y−oy vs 旧=P.y+oy）；
 *  false → origin (w/2,h/2)（原文 source=null 系）。frames = Frame(1,n) 纵向帧数 */
function spr(out: Seg[], t: number, tex: string, anchor: Vec, dx: number, dy: number,
  opts: { flip?: boolean; frames?: number; originBottom?: boolean; ox?: number; oy?: number } | undefined,
  build: (an: Anim) => void): Anim {
  const an = new Anim();
  build(an);
  out.push({ k: 'spr', t, tex, dx: anchor.x + dx, dy: anchor.y + dy,
    flip: opts?.flip, frames: opts?.frames, originBottom: opts?.originBottom ?? true,
    ox: opts?.ox, oy: opts?.oy, acts: an });
  return an;
}

/** 背景画板（Extra_2xx）：位置 = sceneAnchor + _backgroundOffset（原文 verbatim）；
 *  origin = Size*(0.5,1)+(ox,oy)（ox 常为场景 X 修正 num2、oy=-42）★BJ409⑤ */
function bg(out: Seg[], tex: string, t: number, anchor: Vec, ox: number, oy: number,
  build?: (an: Anim) => void): Anim {
  return spr(out, t, tex, anchor, BG_OFFSET.x, BG_OFFSET.y, { originBottom: true, ox, oy },
    build ?? ((an) => {
      an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 });
    }));
}

/** EmoteSegment 捷径：offset = anchor + (dx,dy) + (left? LEFT : RIGHT)。
 *  flip = SpriteEffects.FlipHorizontally；vel = 每帧位移（气泡漂移） */
function emote(out: Seg[], id: number, t: number, dur: number, anchor: Vec, dx: number, dy: number,
  left: boolean, flip = false, vel?: Vec): void {
  const e = left ? EMOTE_LEFT : EMOTE_RIGHT;
  out.push({ k: 'emote', t, id, dur, dx: anchor.x + dx + e.x, dy: anchor.y + dy + e.y, flip, vel });
}

// ═══════════ FillSegments（:61-165）1:1 ═══════════

export function fillSegments(out: Seg[], lines: (category: string) => string[],
  inGame: boolean): FillResult {
  let num = 0;
  const num3 = 210;
  const vector: Vec = { x: 0, y: -80 };                 // UnitY*-80
  let vector2: Vec = { x: vector.x + 200, y: vector.y };
  let vector3: Vec = { ...vector2 };
  const num4 = num3 * 3;
  let num5 = num3 * 3;
  let num6 = num4 - num5;
  if (!inGame) {
    vector3 = { x: 0, y: 80 };
    vector2 = { x: 0, y: 80 };
    num5 = 180;
    num6 = num4 - num5;
  }
  num += num5;
  num += textRoll(out, num, 'CreditsRollCategory_Creator', { ...vector2 }, lines('CreditsRollCategory_Creator'));
  num += num3;
  num += playGuideRunningFromZombie(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_ExecutiveProducer', { ...vector2 }, lines('CreditsRollCategory_ExecutiveProducer'));
  num += num3;
  num += playMerchantAndTravelingMerchant(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_Designer', { ...vector2 }, lines('CreditsRollCategory_Designer'));
  num += num3;
  num += playDemolitionistAndArmsDealer(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_Programming', { ...vector2 }, lines('CreditsRollCategory_Programming'));
  num += num3;
  num += playTinkererAndMechanic(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * 0, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_Graphics', { ...vector2 }, lines('CreditsRollCategory_Graphics'));
  num += num3;
  num += playDryadSayingByeToTavernKeep(out, num, { ...vector2 });
  num += num3;
  vector2 = { ...vector3 };
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_Music', { ...vector2 }, lines('CreditsRollCategory_Music'));
  num += num3;
  num += playWizardPartyGirlDyeTraderAndPainter(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_Sound', { ...vector2 }, lines('CreditsRollCategory_Sound'));
  num += num3;
  num += playClothierChasingTruffle(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_Dialog', { ...vector2 }, lines('CreditsRollCategory_Dialog'));
  num += num3;
  num += playAnglerAndPirateTalkAboutFish(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * 0, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_QualityAssurance', { ...vector2 }, lines('CreditsRollCategory_QualityAssurance'));
  num += num3;
  num += playZoologistAndPetsAnnoyGolfer(out, num, { ...vector2 });
  num += num3;
  vector2 = { ...vector3 };
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_BusinessDevelopment', { ...vector2 }, lines('CreditsRollCategory_BusinessDevelopment'));
  num += num3;
  num += playSkeletonMerchantSearchesThroughBones(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_Marketing', { ...vector2 }, lines('CreditsRollCategory_Marketing'));
  num += num3;
  num += playDryadTurningToTree(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * -1, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_PublicRelations', { ...vector2 }, lines('CreditsRollCategory_PublicRelations'));
  num += num3;
  num += playSteampunkerRepairingCyborg(out, num, { ...vector2 });
  num += num3;
  vector2 = { x: vector2.x * 0, y: vector2.y };
  num += textRoll(out, num, 'CreditsRollCategory_Webmaster', { ...vector2 }, lines('CreditsRollCategory_Webmaster'));
  num += num3;
  num += playSantaAndTaxCollectorThrowingPresents(out, num, { ...vector2 });
  num += num3;
  num += textRoll(out, num, 'CreditsRollCategory_Playtesting', { ...vector2 }, lines('CreditsRollCategory_Playtesting'));
  num += num3;
  num += playWitchDoctorGoingToHisPeople(out, num, { ...vector2 });
  num += num3;
  num += textRoll(out, num, 'CreditsRollCategory_Localization', { ...vector2 }, lines('CreditsRollCategory_Localization'));
  num += num3;
  num += textRoll(out, num, 'CreditsRollCategory_SpecialThanksto', { ...vector2 }, lines('CreditsRollCategory_SpecialThanksto'));
  num += num3 * 2;
  num += textRoll(out, num, 'CreditsRollCategory_Dedication', { ...vector2 }, lines('CreditsRollCategory_Dedication'));
  num += num3;
  num += princessAndEveryone(out, num, { ...vector2 });
  num += num3;
  num += textRoll(out, num, 'CreditsRollCategory_EndingNotes', { ...vector2 }, lines('CreditsRollCategory_EndingNotes'));
  num += num6;
  const endTime = num + 10;   // :163 _endTime = num + 10
  return { segments: out, endTime };
}

// ═══════════ 开场/收场：PrincessAndEveryoneThanksPlayer（:167-264） ═══════════

/** NPCID.Sets.AttackType（NPCID.cs:4855）——AddWavingNPC num5 = AttackType*6
 *  + npcType%13*2 + 20（:250） */
const ATTACK_TYPE: Record<number, number> = {
  38: 0, 17: 0, 107: 0, 19: 1, 22: 1, 124: 0, 228: 1, 178: 1, 18: 0, 229: 1,
  209: 1, 54: 2, 108: 2, 160: 2, 20: 2, 369: 0, 453: 0, 368: 1, 207: 3, 227: 1,
  208: 0, 142: 0, 441: 3, 353: 3, 633: 0, 550: 0, 588: 0, 663: 2,
  638: -1, 637: -1, 656: -1,
};

/** AddWavingNPC num10（:266-286 switch）——专属气泡表情 id（-1=无） */
const WAVE_EMOTE: Record<number, number> = {
  107: 0, 208: 127, 353: 136, 54: 126, 368: 15, 229: 85,
};

/** SimplifiedNPCInfo.SpawnNPC（:14-27）+ AddWavingNPC（:266-325）1:1 */
function spawnWaveNpc(out: Seg[], startTime: number, anchor: Vec, type: number,
  sx: number, sy: number, totalSceneTime: number): void {
  const look = sx > 0 ? -1 : 1;                       // _simplifiedPosition.X>0 → -1
  const jumpAt = Math.trunc((totalSceneTime - 240) / 2 - 20 + sx * -8);
  let num9 = look;
  if ([54, 107, 227, 229, 353, 550, 663].includes(type)) num9 = -num9;   // :277-285
  const flag = (type >= 207 && type <= 209) || type === 228 || (type === 368 || type === 369); // :287-289
  const emoteId = WAVE_EMOTE[type] ?? -1;             // num10
  const duration2 = emoteId >= 0 ? (type % 6) * 20 + 60 : 0;             // :294-296
  const num5 = (ATTACK_TYPE[type] ?? -1) * 6 + (type % 13) * 2 + 20;      // :250
  const num11 = totalSceneTime - jumpAt - 0 - 240;    // :299 duration - timeToJumpAt - num(0) - num8(240)
  npc(out, startTime, type, anchor, sx * 26, sy * 24, (an) => {  // GetProperPosition :35-38 pos*(26,24)
    an.then({ a: 'fade', target: 255 }).with({ a: 'fade', per: -5, dur: 51 })
      .with({ a: 'look', d: num9 });
    if (flag) an.with({ a: 'party' });
    an.then({ a: 'wait', d: 240 }).then({ a: 'look', d: look }).then({ a: 'wait', d: jumpAt })
      .then({ a: 'accel', vx: 0, vy: -4, ax: 0, ay: 0.2, d: 40 })
      .with({ a: 'move', vx: 0, vy: 0.00001, d: 40 })
      .then({ a: 'wait', d: num11 - 90 + num5 })
      .then({ a: 'wait', d: 90 - num5 });
    an.then({ a: 'fade', per: 3, dur: 85 });          // :310 Fade(3,85)
    if (type === 663) {
      // AddEmote(pos, fromTime, duration, blinkTime=num5, 17, lookDirection)
      // （:311-313）→ EmoteSegment(17, fromTime+duration-blinkTime, 60, pos+RIGHT,
      // flip=direction==1)——★BJ409④ 窗/侧归位：目标帧=收场前 num5 帧的 60t 气泡
      // （此前误用 [start, start+dur-num5) 长窗）+ 偏移恒 RIGHT（原文
      // AddEmote 硬编码 _emoteBubbleOffsetWhenOnRight,方向经 flip 表达）
      emote(out, 17, startTime + totalSceneTime - num5, 60, anchor, sx * 26, sy * 24, false, look === 1);
    }
    if (emoteId >= 0) {
      // AddEmote(pos, fromTime, duration2, 0, num10, num9)（:314-316）→
      // EmoteSegment(num10, fromTime+duration2, 60, pos+RIGHT, flip=num9==1)
      // ★BJ409④ 同上（此前误用 [start, start+duration2) 长窗）
      emote(out, emoteId, startTime + duration2, 60, anchor, sx * 26, sy * 24, false, num9 === 1);
    }
  });
}

function princessAndEveryone(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x, y: anchorIn.y + 40 };   // :168 sceneAnchorPosition.Y += 40
  const num3 = 240;
  const num4 = 400;
  const num5 = num4 + num3;                               // 640 场景总长
  // 背景画板（:200-204）：位置 = sceneAnchorPosition（verbatim,无附加偏移）；
  // origin = Size*(0.5,1)+(0,-92) → 底边恰在 anchor.y（=人群脚线）。
  // ★BJ409⑤ 此前误折成位置 (0,-92)+纯底 origin = 底边抬高 92px（画板悬空,
  // 群像脚下无台）
  spr(out, startTime, 'Extra_241', anchor, 0, 0, { originBottom: true, oy: -92 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 })
      .then({ a: 'wait', d: num5 }).then({ a: 'fade', target: 0, dur: 85 });
  });
  const list = [228, 178, 550, 208, 160, 209];            // :190
  const list2 = [353, 633, 207, 588, 227, 368];           // :191
  const list3 = [22, 19, 18, 17, 38, 54, 108];            // :192
  const list4 = [663, 20, 441, 107, 124, 229, 369];       // :193
  const num = -2;
  const num2 = 2;
  for (let i = 0; i < list.length; i++) spawnWaveNpc(out, startTime, anchor, list[i], num - i, -1, num5);
  for (let j = 0; j < list3.length; j++) spawnWaveNpc(out, startTime, anchor, list3[j], (num - j) + 0.5, 0, num5);
  for (let k = 0; k < list2.length; k++) spawnWaveNpc(out, startTime, anchor, list2[k], num2 + k, -1, num5);
  for (let l = 0; l < list4.length; l++) spawnWaveNpc(out, startTime, anchor, list4[l], (num2 + l) - 0.5, 0, num5);
  // 玩家跳跃（:235-250）：num6=3 / num7=-0.05 / num8=60 / num9=3*60+(-0.05)*(60²/2)=90
  const num8 = 60;
  const num9 = 3 * num8 + -0.05 * ((num8 * num8) * 0.5);
  const num10 = startTime + num3;
  const num11 = 51;
  const pl = new Anim();
  pl.then({ a: 'fade', target: 0 }).with({ a: 'look', d: 1 })
    .with({ a: 'fade', target: 1, dur: num8 })
    .then({ a: 'wait', d: Math.trunc(num4 / 2) })
    .with({ a: 'accel', vx: 0, vy: 3, ax: 0, ay: -0.05, d: num8 })
    .then({ a: 'wait', d: Math.trunc(num4 / 2) - 60 })
    .with({ a: 'look', d: -1 })
    .then({ a: 'wait', d: 120 })
    .with({ a: 'look', d: 1 })
    .then({ a: 'fade', target: 0, dur: 85 });
  out.push({ k: 'player', t: num10 - num8 + num11, dx: anchor.x, dy: anchor.y - num9, acts: pl });
  return num5 + 85 + 60;                                  // :252-255 totalTime
}

// ═══════════ 小剧场（PlaySegment_Grox_* 源序） ═══════════

/** PlaySegment_Grox_GuideRunningFromZombie（:1455-1531） */
function playGuideRunningFromZombie(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 12;
  anchor.x += num2;
  const num3 = 24;
  const bg1 = bg(out, 'Extra_218', num, anchor, num2, -42);       // :1461-1464
  const zom = npc(out, startTime, 3, anchor, num3 + 60, 0, (an) => {
    enter(an).then({ a: 'move', vx: -0.5, vy: 0, d: 60 });        // :1465-1466
  });
  bg1.then({ a: 'wait', d: zom.time });                           // :1467
  num += zom.time;
  zom.then({ a: 'knock', d: 60 });                                // :1468
  bg1.then({ a: 'wait', d: 60 });                                 // :1469
  num += 60;
  const guide = npc(out, num, 22, anchor, -30, 0, (an) => {
    enter(an).then({ a: 'move', vx: 0.5, vy: 0, d: 60 });         // :1470-1471
  });
  zom.then({ a: 'knock', d: guide.time });                        // :1472
  bg1.then({ a: 'wait', d: guide.time });                         // :1473
  num += guide.time;
  const num4 = 90;
  emote(out, 87, num, num4, anchor, -4, 0, true, true);           // :1475
  guide.then({ a: 'wait', d: num4 });                             // :1476
  zom.then({ a: 'knock', d: num4 });                              // :1477
  bg1.then({ a: 'wait', d: num4 - 1 });                           // :1478（原文 num4-1）
  num += num4;
  const num5 = 50;
  emote(out, 3, num, num5, anchor, -4, 0, true, true);            // :1480
  const bg2 = bg(out, 'Extra_219', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 1 });                            // :1481-1484（墙背景直显）
  });
  guide.then({ a: 'wait', d: num5 });                             // :1485
  zom.then({ a: 'move', vx: -0.4, vy: 0, d: num5 });              // :1486
  bg2.then({ a: 'wait', d: num5 });                               // :1487
  num += num5;
  emote(out, 134, num, num4, anchor, 0, 0, false, false, { x: -0.6, y: 0 }); // :1488
  guide.then({ a: 'move', vx: -0.6, vy: 0, d: num4 });            // :1489
  zom.then({ a: 'move', vx: -0.4, vy: 0, d: num4 });              // :1490
  bg2.then({ a: 'wait', d: num4 });                               // :1491
  num += num4;
  guide.then({ a: 'move', vx: -0.6, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });  // :1492
  zom.then({ a: 'move', vx: -0.4, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });    // :1493
  bg2.then({ a: 'fade', target: 0, dur: 127 });                   // :1494
  bg1.then({ a: 'fade', target: 0, dur: 127 });                   // :1495
  num += 187;
  return num - startTime;
}

/** PlaySegment_Grox_MerchantAndTravelingMerchantTryingToSellJunk（:1539-1652） */
function playMerchantAndTravelingMerchant(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 40;
  anchor.x += num2;
  const num3 = 62;
  const bg1 = bg(out, 'Extra_223', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  const mer = npc(out, startTime, 17, anchor, 0, 0, (an) => {
    enter(an, 1).then({ a: 'wait', d: 60 });
  });
  const tra = npc(out, startTime, 368, anchor, num3, 0, (an) => {
    enter(an, -1).then({ a: 'wait', d: 60 });
  });
  const balloon = spr(out, num, 'Extra_239', anchor, num2 - 128, 4, { flip: true, frames: 8 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 });
  });
  num += mer.time;
  const num4 = 90;
  const num5 = 60;
  mer.then({ a: 'show', item: 8, d: num5 });
  tra.then({ a: 'wait', d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  emote(out, 11, num, num4, anchor, num3, 0, false);
  mer.then({ a: 'wait', d: num4 }); tra.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  mer.then({ a: 'wait', d: num5 });
  tra.then({ a: 'show', item: 2242, d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  emote(out, 11, num, num4, anchor, 0, 0, true, true);
  mer.then({ a: 'wait', d: num4 }); tra.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  mer.then({ a: 'show', item: 88, d: num5 });
  tra.then({ a: 'wait', d: num5 }); bg1.then({ a: 'wait', d: num5 });
  num += num5;
  emote(out, 11, num, num4, anchor, num3, 0, false);
  mer.then({ a: 'wait', d: num4 }); tra.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  mer.then({ a: 'wait', d: num5 });
  tra.then({ a: 'show', item: 4761, d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  emote(out, 11, num, num4, anchor, 0, 0, true, true);
  mer.then({ a: 'wait', d: num4 }); tra.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  const num6 = num5 + 30;
  mer.then({ a: 'show', item: 2, d: num6 });
  tra.then({ a: 'wait', d: num6 }); bg1.then({ a: 'wait', d: num6 });
  num += num6;
  emote(out, 10, num, num4, anchor, num3, 0, false);
  mer.then({ a: 'wait', d: num4 }); tra.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  mer.then({ a: 'wait', d: num6 });
  tra.then({ a: 'show', item: 52, d: num6 });
  bg1.then({ a: 'wait', d: num6 });
  num += num6;
  emote(out, 85, num, num4, anchor, 0, 0, true, true);
  emote(out, 85, num, num4, anchor, num3, 0, false);
  mer.then({ a: 'wait', d: num4 }); tra.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  balloon.then({ a: 'framesFor', frames: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]], tpf: 5, d: num - startTime });  // :1644
  mer.then({ a: 'fade', per: 2, dur: 127 });
  tra.then({ a: 'fade', per: 2, dur: 127 });
  balloon.then({ a: 'fade', target: 0, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_Grox_DemolitionistAndArmsDealerArguingThenNurseComes（源 :1496-1559 域） */
function playDemolitionistAndArmsDealer(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = -30;
  anchor.x += num2;
  const bg1 = bg(out, 'Extra_234', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 0 });
  });
  const dem = npc(out, startTime, 38, anchor, 0, 0, (an) => {
    enter(an).then({ a: 'move', vx: 1, vy: 0, d: 60 }).then({ a: 'wait', d: 60 });
  });
  const num3 = 90;
  const arm = npc(out, startTime, 19, anchor, 120 + num3, 0, (an) => {
    enter(an).then({ a: 'move', vx: -1, vy: 0, d: 60 }).then({ a: 'wait', d: 60 });
  });
  num += dem.time;
  const num4 = 90 * 4;
  const num5 = 90;
  const num6 = Math.trunc(90 / 2);
  const num7 = 90 + Math.trunc(90 / 2);
  const num8 = 90 * 2;
  emote(out, 81, num, num5, anchor, 60, 0, true, true);
  emote(out, 82, num + num6, num5, anchor, 60 + num3, 0, false);
  emote(out, 135, num + num7, num5, anchor, 60, 0, true, true);
  emote(out, 135, num + num8, num5, anchor, 60 + num3, 0, false);
  dem.then({ a: 'wait', d: num4 }); arm.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  const num9 = num3 - 30;
  const num10 = 120;
  const nur = npc(out, num - num10, 18, anchor, 120 + num9, 0, (an) => {
    enter(an).then({ a: 'move', vx: -1, vy: 0, d: 60 }).then({ a: 'wait', d: 20 });
  });
  const num11 = nur.time - num10;
  num += num11;
  dem.then({ a: 'wait', d: num11 }); arm.then({ a: 'wait', d: num11 }); bg1.then({ a: 'wait', d: num11 });
  nur.then({ a: 'look', d: -1 });
  emote(out, 77, num, num5, anchor, 60 + num9, 0, true, true);
  emote(out, 15, num + num5, num5, anchor, 60 + num9, 0, false);
  dem.then({ a: 'wait', d: num5 }); arm.then({ a: 'wait', d: num5 }); nur.then({ a: 'wait', d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  nur.then({ a: 'look', d: 1 });
  dem.then({ a: 'wait', d: num5 }); arm.then({ a: 'wait', d: num5 }); nur.then({ a: 'wait', d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  emote(out, 10, num, num5, anchor, 60, 0, true, true);
  emote(out, 10, num, num5, anchor, 60 + num3, 0, false);
  dem.then({ a: 'wait', d: num5 }); arm.then({ a: 'wait', d: num5 }); nur.then({ a: 'wait', d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  const vector: Vec = { x: -1, y: 0 };
  emote(out, 77, num, num5, anchor, 60 + num3, 0, false, false, vector);
  emote(out, 77, num + Math.trunc(num5 / 2), num5, anchor, 60, 0, false, false, vector);
  const num12 = num5 + Math.trunc(num5 / 2);
  arm.then({ a: 'move', vx: vector.x, vy: vector.y, d: num12 });
  dem.then({ a: 'wait', d: Math.trunc(num5 / 2) }).then({ a: 'move', vx: vector.x, vy: vector.y, d: num5 });
  nur.then({ a: 'wait', d: Math.trunc(num5 / 2) + 20 }).then({ a: 'move', vx: vector.x, vy: vector.y, d: num5 - 20 });
  bg1.then({ a: 'wait', d: num12 });
  num += num12;
  dem.then({ a: 'move', vx: -0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  arm.then({ a: 'move', vx: -0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  nur.then({ a: 'move', vx: -0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_TinkererAndMechanic（源 :1560-1611 域） */
function playTinkererAndMechanic(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const bg1 = bg(out, 'Extra_237', num, anchor, 0, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 });
  });
  const tin = npc(out, startTime, 107, anchor, 0, 0, (an) => {
    enter(an).then({ a: 'move', vx: 1, vy: 0, d: 60 }).then({ a: 'wait', d: 60 });
  });
  bg1.then({ a: 'wait', d: tin.time });
  num += tin.time;
  const num2 = 24;
  const mec = npc(out, num, 124, anchor, 120 + num2, 0, (an) => {
    enter(an, -1).then({ a: 'move', vx: -1, vy: 0, d: 60 });
  });
  num += mec.time;
  tin.then({ a: 'wait', d: mec.time });
  bg1.then({ a: 'wait', d: mec.time });
  const num3 = 120;
  emote(out, 0, num, num3, anchor, 60, 0, true, true);
  emote(out, 0, num, num3, anchor, 60 + num2, 0, false);
  tin.then({ a: 'wait', d: num3 }); mec.then({ a: 'wait', d: num3 }); bg1.then({ a: 'wait', d: num3 });
  num += num3;
  tin.then({ a: 'move', vx: -0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  mec.then({ a: 'move', vx: -0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_Grox_DryadSayingByeToTavernKeep（:1444-1499） */
function playDryadSayingByeToTavernKeep(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 0;
  anchor.x += num2;
  const num3 = 30;
  const num4 = 10;
  const bg1 = bg(out, 'Extra_235', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 120 });
  });
  const num5 = 300;
  const tav = npc(out, startTime, 20, anchor, num4 + num5, 0, (an) => {
    enter(an, 1).then({ a: 'move', vx: -1, vy: 0, d: 120 });
  });
  const dry = npc(out, startTime, 550, anchor, num4 + num5 - 16 - num3, 0, (an) => {
    enter(an, 1).then({ a: 'move', vx: -1, vy: 0, d: 120 });
  });
  spr(out, startTime, 'Extra_240', anchor, num4, 2, { frames: 8 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 })
      // :429 门板.Then(SetFrameSequence(num-startTime=770, 8 帧, 5))——窗延伸兼
      // 8 帧弹跳动画（★BJ409⑥ 此前漏装=门段窗 0,酒馆门整场不可见）
      .then({ a: 'framesFor', frames: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]], tpf: 5, d: 770 });
  });
  num += dry.time;
  const num6 = 90;
  dry.then({ a: 'move', vx: -1, vy: 0, d: 90 });
  tav.then({ a: 'move', vx: -1, vy: 0, d: 30 });
  tav.then({ a: 'wait', d: 60 });
  bg1.then({ a: 'wait', d: 90 });
  num += 90;
  const num7 = num6 * 5;
  const num8 = num4 + num5 - 120 - 30;
  const num9 = num4 + num5 - 120 - 106 - num3;
  emote(out, 14, num, num6, anchor, num8, 0, false);
  emote(out, 133, num + num6, num6, anchor, num9, 0, true, true);
  emote(out, 78, num + num6 * 2, num6, anchor, num8, 0, false);
  emote(out, 15, num + num6 * 4, num6, anchor, num9, 0, true, true);
  emote(out, 15, num + num6 * 4, num6, anchor, num8, 0, false);
  dry.then({ a: 'look', d: 1 });
  dry.then({ a: 'wait', d: num6 * 3 });
  dry.then({ a: 'show', item: 353, d: num6 });
  dry.then({ a: 'wait', d: num6 });
  tav.then({ a: 'wait', d: num7 });
  bg1.then({ a: 'wait', d: num7 });
  num += num7;
  dry.then({ a: 'move', vx: -1, vy: 0, d: 30 });
  tav.then({ a: 'move', vx: -1, vy: 0, d: 30 });
  bg1.then({ a: 'wait', d: 30 });
  num += 30;
  dry.then({ a: 'wait', d: 80 });
  tav.then({ a: 'wait', d: 80 });
  bg1.then({ a: 'wait', d: 80 });
  num += 80;
  dry.then({ a: 'move', vx: -0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  tav.then({ a: 'move', vx: -0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_Grox_WizardPartyGirlDyeTraderAndPainterPartyWithBunnies（:1653-1800） */
function playWizardPartyGirlDyeTraderAndPainter(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = -35;
  anchor.x += num2;
  const num3 = 34;
  const bg1 = bg(out, 'Extra_221', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  const wiz = npc(out, startTime, 227, anchor, 0, 0, (an) => {
    an.then({ a: 'party' });
    enter(an, 1).then({ a: 'wait', d: 60 });
  });
  const par = npc(out, startTime, 108, anchor, num3, 0, (an) => {
    an.then({ a: 'party' });
    enter(an, -1).then({ a: 'wait', d: 60 });
  });
  const dye = npc(out, startTime, 207, anchor, num3 * 2 + 60, 0, (an) => {
    an.then({ a: 'party' });
    enter(an, -1).then({ a: 'move', vx: -1, vy: 0, d: 60 });
  });
  const pain = npc(out, startTime, 656, anchor, num3 * 2, 0, (an) => {
    an.then({ a: 'variant', v: 1 }).then({ a: 'party' });
    enter(an, 1).then({ a: 'move', vx: 1, vy: 0, d: 60 });
  });
  const truf = npc(out, startTime, 540, anchor, num3 * 4 + 100, 0, (an) => {
    enter(an, -1).then({ a: 'move', vx: -1, vy: 0, d: 60 });
  });
  const bun1 = spr(out, num, 'Extra_238', anchor, 60, 2, { flip: true, frames: 4 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 });
  });
  const bun2 = spr(out, num, 'Extra_238', anchor, 150, 2, { flip: true, frames: 4 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 });
  });
  num += wiz.time;
  const num4 = 90;
  const num5 = num4 * 4;
  emote(out, 127, num, num4, anchor, 0, 0, true, true);
  emote(out, 6, num + num4, num4, anchor, num3, 0, false);
  emote(out, 136, num + num4 * 2, num4, anchor, num3 * 2, 0, false);
  emote(out, 129, num + num4 * 3, num4, anchor, 0, 0, true, true);
  wiz.then({ a: 'wait', d: num5 });
  par.then({ a: 'wait', d: num4 * 2 }).then({ a: 'look', d: 1 }).then({ a: 'wait', d: num4 })
    .then({ a: 'look', d: -1 }).then({ a: 'wait', d: num4 });
  dye.then({ a: 'wait', d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  truf.then({ a: 'move', vx: -0.5, vy: 0, d: Math.trunc(num5 / 3) })
    .then({ a: 'wait', d: Math.trunc(num5 / 3) })
    .then({ a: 'move', vx: 0.4, vy: 0, d: Math.trunc(num5 / 3) });
  pain.then({ a: 'move', vx: -0.6, vy: 0, d: Math.trunc(num5 / 3) })
    .then({ a: 'move', vx: 0.5, vy: 0, d: Math.trunc(num5 / 3) })
    .then({ a: 'wait', d: Math.trunc(num5 / 3) });
  num += num5;
  const bun3 = npc(out, num - 60, 208, anchor, num3 * 5 + 100, 0, (an) => {
    an.then({ a: 'party' });
    enter(an, -1).then({ a: 'move', vx: -1, vy: 0, d: 60 });
  });
  const num6 = bun3.time - 60;
  num += num6;
  wiz.then({ a: 'wait', d: num6 }); par.then({ a: 'wait', d: num6 }); dye.then({ a: 'wait', d: num6 });
  truf.then({ a: 'wait', d: num6 }); pain.then({ a: 'wait', d: num6 });
  bg1.then({ a: 'wait', d: num6 });
  emote(out, 128, num, num4, anchor, num3 * 5 + 40, 0, false);
  num += num4;
  wiz.then({ a: 'wait', d: num4 });
  par.then({ a: 'look', d: 1 }).then({ a: 'wait', d: num4 });
  dye.then({ a: 'look', d: 1 }).then({ a: 'wait', d: num4 });
  truf.then({ a: 'wait', d: num4 }); pain.then({ a: 'wait', d: num4 }); bun3.then({ a: 'wait', d: num4 });
  bg1.then({ a: 'wait', d: num4 });
  emote(out, 128, num, num4, anchor, 0, 0, true, true);
  emote(out, 128, num, num4, anchor, num3, 0, true, true);
  emote(out, 128, num, num4, anchor, num3 * 2, 0, true, true);
  emote(out, 3, num, num4, anchor, num3 * 5 - 10, 24, true, true);
  emote(out, 0, num, num4, anchor, num3 * 4 - 20, 24, true, true);
  wiz.then({ a: 'wait', d: num4 }); par.then({ a: 'wait', d: num4 }); dye.then({ a: 'wait', d: num4 });
  truf.then({ a: 'wait', d: num4 }); pain.then({ a: 'wait', d: num4 }); bun3.then({ a: 'wait', d: num4 });
  bg1.then({ a: 'wait', d: num4 });
  num += num4;
  bun1.then({ a: 'framesFor', frames: [[0, 0], [0, 1], [0, 2], [0, 3]], tpf: 10, d: num - startTime });
  bun2.then({ a: 'framesFor', frames: [[0, 2], [0, 3], [0, 0], [0, 1]], tpf: 10, d: num - startTime });
  wiz.then({ a: 'move', vx: 1, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  par.then({ a: 'move', vx: 1, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  dye.then({ a: 'move', vx: 1, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  truf.then({ a: 'move', vx: 0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  pain.then({ a: 'move', vx: 0.75, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  bun3.then({ a: 'move', vx: 0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  bun1.then({ a: 'fade', target: 0, dur: 127 });
  bun2.then({ a: 'fade', target: 0, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_ClothierChasingTruffle（源 :1612-1659 域） */
function playClothierChasingTruffle(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 10;
  anchor.x += num2;
  const bg1 = bg(out, 'Extra_225', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 });
  });
  const clo = npc(out, startTime, 160, anchor, 20, 0, (an) => {
    enter(an, 1).then({ a: 'wait', d: 60 }).then({ a: 'look', d: -1 });
  });
  bg1.then({ a: 'wait', d: clo.time });
  num += clo.time;
  const num3 = 60;
  emote(out, 10, num, num3, anchor, 20, 0, false);
  clo.then({ a: 'wait', d: num3 }); bg1.then({ a: 'wait', d: num3 });
  num += num3;
  emote(out, 3, num, num3, anchor, 20, 0, false);
  clo.then({ a: 'wait', d: num3 }); bg1.then({ a: 'wait', d: num3 });
  num += num3;
  const vector: Vec = { x: 1.2, y: 0 };
  const vector2: Vec = { x: 1, y: 0 };
  const truf = npc(out, num, 54, anchor, -100, 0, (an) => {
    enter(an).then({ a: 'move', vx: vector.x, vy: vector.y, d: 60 })
      .then({ a: 'move', vx: vector.x, vy: vector.y, d: 130 })
      .with({ a: 'fade', per: 2, dur: 127 });
  });
  clo.then({ a: 'move', vx: vector2.x, vy: vector2.y, d: 60 })
    .then({ a: 'move', vx: vector2.x, vy: vector2.y, d: 130 })
    .with({ a: 'fade', per: 2, dur: 127 });
  bg1.then({ a: 'wait', d: 60 }).then({ a: 'wait', d: 130 }).with({ a: 'fade', target: 0, dur: 127 });
  const num4 = 10;
  const num5 = 40;
  const timeToPlay = 70;
  emote(out, 134, num + num4, timeToPlay, anchor, 20, 0, true, true, { x: vector2.x, y: 0 });
  emote(out, 15, num + num5, timeToPlay, anchor, -100, 0, true, true, { x: vector.x, y: 0 });
  void truf;
  num += 200;
  return num - startTime;
}

/** PlaySegment_Grox_AnglerAndPirateTalkAboutFish（:1802-1867） */
function playAnglerAndPirateTalkAboutFish(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 30;
  anchor.x += num2;
  const num3 = 90;
  const bg1 = bg(out, 'Extra_222', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  const ang = npc(out, startTime, 369, anchor, 0, 0, (an) => {
    enter(an, 1).then({ a: 'wait', d: 60 });
  });
  const pir = npc(out, startTime, 229, anchor, num3 + 60, 0, (an) => {
    enter(an, -1).then({ a: 'move', vx: -1, vy: 0, d: 60 });
  });
  const fish = spr(out, num, 'Extra_226', anchor, Math.trunc(num3 / 2), 4, { flip: true, frames: 8 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 });
  });
  num += ang.time;
  const num4 = 90;
  const num5 = num4 * 8;
  emote(out, 79, num, num4, anchor, 0, 0, true, true);
  emote(out, 65, num + num4, num4, anchor, num3, 0, false);
  emote(out, 136, num + num4 * 3, num4, anchor, 0, 0, true, true);
  emote(out, 3, num + num4 * 5, num4, anchor, num3, 0, false);
  emote(out, 50, num + num4 * 6, num4, anchor, num3, 0, false);
  emote(out, 15, num + num4 * 6, num4, anchor, 0, 0, false, false, { x: -1, y: 0 });
  emote(out, 2, num + num4 * 7, num4, anchor, num3, 0, false, false, { x: -1.25, y: 0 });
  ang.then({ a: 'wait', d: num4 * 4 }).then({ a: 'show', item: 2673, d: num4 })
    .then({ a: 'wait', d: num4 }).then({ a: 'move', vx: -1, vy: 0, d: num4 });
  pir.then({ a: 'wait', d: num4 * 2 }).then({ a: 'show', item: 2480, d: num4 })
    .then({ a: 'wait', d: num4 * 4 }).then({ a: 'move', vx: -1.25, vy: 0, d: num4 });
  bg1.then({ a: 'wait', d: num5 });
  fish.then({ a: 'framesFor', frames: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]], tpf: 5, d: num5 + 60 });
  num += num5;
  ang.then({ a: 'move', vx: -0.4, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  pir.then({ a: 'move', vx: -0.75, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  fish.then({ a: 'fade', target: 0, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_Grox_ZoologistAndPetsAnnoyGolfer（源 :1652-1801 域） */
function playZoologistAndPetsAnnoyGolfer(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = -28;
  anchor.x += num2;
  const num3 = 40;
  const bg1 = bg(out, 'Extra_224', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  const zoo = npc(out, startTime, 633, anchor, -60, 0, (an) => {
    an.then({ a: 'forceAlt', i: 3 });
    enter(an).then({ a: 'move', vx: 0.5, vy: 0, d: 60 });
  });
  const gol = npc(out, startTime, 656, anchor, num3 - 60, 0, (an) => {
    an.then({ a: 'variant', v: 3 });
    enter(an).then({ a: 'move', vx: 0.5, vy: 0, d: 60 });
  });
  const cat = npc(out, startTime, 638, anchor, num3 * 2 - 60, 0, (an) => {
    an.then({ a: 'variant', v: 2 });
    enter(an).then({ a: 'move', vx: 0.5, vy: 0, d: 60 });
  });
  const dog = npc(out, startTime, 637, anchor, num3 * 3 - 60, 0, (an) => {
    an.then({ a: 'variant', v: 4 });
    enter(an).then({ a: 'move', vx: 0.5, vy: 0, d: 60 });
  });
  const bunny = spr(out, startTime, 'Projectile_748', anchor, num3 * 3 - 20, 0, { originBottom: false }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 }).then({ a: 'wait', d: 60 });
  });
  num += zoo.time;
  const num4 = 90;
  const num5 = 0.5;
  zoo.then({ a: 'move', vx: 1 * num5, vy: 0, d: num4 });
  gol.then({ a: 'move', vx: 0.5 * num5, vy: 0, d: num4 });
  cat.then({ a: 'move', vx: 0.6 * num5, vy: 0, d: num4 });
  dog.then({ a: 'move', vx: 0.8 * num5, vy: 0, d: num4 });
  bunny.then({ a: 'gravity', v0: { x: 0.82 * num5, y: 0 }, g: { x: 0, y: 0 }, rot: 0.07, d: num4 });
  bg1.then({ a: 'wait', d: num4 });
  num += num4;
  const golfer = npc(out, num, 588, anchor, -70, 0, (an) => {
    enter(an).then({ a: 'move', vx: 0.7 * num5, vy: 0, d: 60 });
  });
  const num6 = golfer.time;
  zoo.then({ a: 'move', vx: 1 * num5, vy: 0, d: num6 });
  gol.then({ a: 'move', vx: 0.85 * num5, vy: 0, d: num6 });
  cat.then({ a: 'move', vx: 0.7 * num5, vy: 0, d: num6 });
  dog.then({ a: 'move', vx: 0.65 * num5, vy: 0, d: num6 });
  bunny.then({ a: 'gravity', v0: { x: 1 * num5, y: 0 }, g: { x: 0, y: 0 }, rot: 0.07, d: num6 });
  bg1.then({ a: 'wait', d: num6 });
  num += num6;
  const num7 = 90;
  const num8 = num7 * 2 + Math.trunc(num7 / 2);
  emote(out, 1, num, num7, anchor, -70 + 42 * num5, 0, true, true, { x: 1 * num5, y: 0 });
  emote(out, 15, num + Math.trunc(num7 / 2), num7, anchor, (80 + num6) * num5, 0, true, true, { x: 1 * num5, y: 0 });
  golfer.then({ a: 'move', vx: 1 * num5, vy: 0, d: num8 });
  zoo.then({ a: 'move', vx: 1 * num5, vy: 0, d: num8 });
  gol.then({ a: 'move', vx: 0.72 * num5, vy: 0, d: num8 });
  cat.then({ a: 'move', vx: 0.7 * num5, vy: 0, d: num8 });
  dog.then({ a: 'move', vx: 0.8 * num5, vy: 0, d: num8 });
  bunny.then({ a: 'gravity', v0: { x: 0.85 * num5, y: 0 }, g: { x: 0, y: 0 }, rot: 0.07, d: num8 });
  bg1.then({ a: 'wait', d: num8 });
  num += num8;
  zoo.then({ a: 'move', vx: 0.5 * num5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  golfer.then({ a: 'move', vx: 0.5 * num5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  gol.then({ a: 'move', vx: 0.6 * num5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  cat.then({ a: 'move', vx: 0.7 * num5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  dog.then({ a: 'move', vx: 0.6 * num5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  bunny.then({ a: 'gravity', v0: { x: 0.5 * num5, y: 0 }, g: { x: 0, y: 0 }, rot: 0.05, d: 120 })
    .with({ a: 'fade', target: 0, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_Grox_SkeletonMerchantSearchesThroughBones（:1873-1983；骨头散落
 *  item 喷洒段不渲染=登记债，num7 时长原样保留） */
function playSkeletonMerchantSearchesThroughBones(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 30;
  anchor.x += num2;
  const num3 = 100;
  const bg1 = bg(out, 'Extra_220', num, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  const num4 = 10;
  const skel = npc(out, startTime, 453, anchor, num4, 0, (an) => {
    enter(an, 1).then({ a: 'move', vx: 1, vy: 0, d: 60 });
  });
  const bone = spr(out, startTime, 'Extra_227', anchor, num3, 2, { originBottom: true }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 }).then({ a: 'wait', d: 60 });
  });
  num += skel.time;
  const num5 = 90;
  emote(out, 87, num, num5, anchor, 60 + num4, 0, true, true);
  skel.then({ a: 'wait', d: num5 });
  bone.then({ a: 'wait', d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  const chest = spr(out, num, 'Extra_228', anchor, num3 - 10, 4, { flip: true, frames: 14, originBottom: true }, (an) => {
    an.then({ a: 'frames', frames: [[0, 1], [0, 2], [0, 3], [0, 4]], tpf: 5 });
  });
  skel.then({ a: 'wait', d: 20 }).with({ a: 'fade', target: 255 });
  bone.then({ a: 'wait', d: 20 });
  bg1.then({ a: 'wait', d: 20 });
  num += 20;
  const num6 = 10;
  void num6;   // 骨头 item 喷洒（Extra 段 :1952-1969）不渲染=登记债
  const num7 = 30 + num6 * 10;
  chest.then({ a: 'framesFor', frames: [[0, 5], [0, 6], [0, 7], [0, 8]], tpf: 5, d: num7 });
  skel.then({ a: 'wait', d: num7 });
  bone.then({ a: 'wait', d: num7 });
  bg1.then({ a: 'wait', d: num7 });
  num += num7;
  emote(out, 3, num, num5, anchor, 80 + num4, 4, true, true);
  chest.then({ a: 'wait', d: num5 }).with({ a: 'frame', x: 0, y: 5 });
  skel.then({ a: 'wait', d: num5 });
  bone.then({ a: 'wait', d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  chest.then({ a: 'frames', frames: [[0, 9], [0, 10], [0, 11], [0, 13]], tpf: 5 });
  skel.then({ a: 'wait', d: 20 });
  bone.then({ a: 'wait', d: 20 });
  bg1.then({ a: 'wait', d: 20 });
  num += 20;
  const num8 = 90;
  chest.then({ a: 'fade', target: 0 });
  skel.then({ a: 'show', item: 3258, d: num8 }).with({ a: 'fade', per: -255 }).with({ a: 'look', d: -1 });
  bone.then({ a: 'wait', d: num8 });
  bg1.then({ a: 'wait', d: num8 });
  num += num8;
  emote(out, 136, num, num5, anchor, 60 + num4, 0, false, false, { x: -1, y: 0 });
  skel.then({ a: 'move', vx: -1, vy: 0, d: num5 });
  bone.then({ a: 'wait', d: num5 });
  bg1.then({ a: 'wait', d: num5 });
  num += num5;
  skel.then({ a: 'move', vx: -0.5, vy: 0, d: 120 }).with({ a: 'fade', per: 2, dur: 127 });
  bone.then({ a: 'fade', target: 0, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_DryadTurningToTree（:795-864） */
function playDryadTurningToTree(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const bg1 = bg(out, 'Extra_217', num, anchor, 0, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 });
  });
  const dry = npc(out, startTime, 20, anchor, 0, 0, (an) => {
    enter(an).then({ a: 'move', vx: 1, vy: 0, d: 60 }).then({ a: 'wait', d: 10 })
      .then({ a: 'fade', per: 0 });                       // :813 Fade(0)=alpha+0 原文本相
  });
  num += dry.time;
  const vector: Vec = { x: 1 * 60 + 2, y: 4 };            // :819 (1,0)*60+(2,4)
  const tree = spr(out, num, 'Extra_215', anchor, vector.x, vector.y, { flip: true, frames: 9 }, (an) => {
    an.then({ a: 'frames', frames: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8]], tpf: 8 })
      .then({ a: 'wait', d: 30 });
  });
  num += tree.time;
  npc(out, num, 46, anchor, -100, 0, (an) => {
    enter(an).then({ a: 'move', vx: 1, vy: 0, d: 60 }).then({ a: 'wait', d: 90 })
      .then({ a: 'move', vx: 1, vy: 0, d: 120 }).with({ a: 'fade', per: 3, dur: 85 });
  });
  npc(out, num + 60, 299, anchor, 170, 0, (an) => {
    enter(an).then({ a: 'move', vx: -1, vy: 0, d: 60 }).then({ a: 'wait', d: 60 })
      .then({ a: 'move', vx: -1, vy: 0, d: 90 }).then({ a: 'move', vx: -1, vy: 0, d: 85 })
      .with({ a: 'fade', per: 3, dur: 85 });
  });
  const x = 1.5;
  npc(out, num + 45, 74, anchor, -80, -70, (an) => {
    enter(an).then({ a: 'move', vx: x, vy: 0, d: 85 })
      .with({ a: 'rotor', per: { x: 10, y: 0 }, speed: (Math.PI * 2) / 85, axis: { x: 0, y: 1 }, d: 85 })
      .then({ a: 'move', vx: x, vy: 0, d: 85 })
      .with({ a: 'rotor', per: { x: 4, y: 0 }, speed: (Math.PI * 2) / 85, axis: { x: 0, y: 1 }, d: 85 })
      .with({ a: 'fade', per: 3, dur: 85 });
  });
  npc(out, num + 180, 656, anchor, 20, 0, (an) => {
    an.then({ a: 'variant', v: 1 });
    enter(an, 1).then({ a: 'wait', d: 60 }).then({ a: 'move', vx: 0.5, vy: 0, d: 60 })
      .then({ a: 'wait', d: 60 }).then({ a: 'rest', d: 90 }).then({ a: 'wait', d: 90 })
      .with({ a: 'fade', per: 3, dur: 120 });
  });
  emote(out, 0, num + 360, 60, anchor, 36, -10, true, true, { x: 0, y: 0 });
  tree.then({ a: 'wait', d: 420 }).then({ a: 'fade', target: 0, dur: 120 });
  num += 620;
  bg1.then({ a: 'wait', d: num - startTime - 180 }).then({ a: 'fade', target: 0, dur: 120 });
  return num - startTime;
}

/** PlaySegment_Grox_SantaAndTaxCollectorThrowingPresents（:566-658） */
function playSantaAndTaxCollectorThrowingPresents(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 0;
  anchor.x += num2;
  const num3 = 120;
  const bg1 = bg(out, 'Extra_236', startTime, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 120 });
  });
  const san = npc(out, startTime, 142, anchor, -30, 0, (an) => {
    enter(an, 1).then({ a: 'move', vx: 0.5, vy: 0, d: 120 });
  });
  const tax = npc(out, startTime, 441, anchor, num3, 0, (an) => {
    enter(an, 1).then({ a: 'wait', d: 120 });
  });
  const pres = spr(out, num, 'Extra_239', anchor, num2 - 44, 4, { flip: true, frames: 8 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 51 });
  });
  num += san.time;
  const num4 = 120;
  const num5 = 90;
  emote(out, 125, num, num4, anchor, 30, 0, true, true);
  san.then({ a: 'wait', d: num4 }); tax.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  emote(out, 10, num, num4, anchor, num3, 0, false);
  const num6 = num4 + 30;
  san.then({ a: 'wait', d: num6 });
  tax.then({ a: 'look', d: -1 }).then({ a: 'wait', d: num6 });
  bg1.then({ a: 'wait', d: num6 });
  num += num6;
  tax.then({ a: 'wait', d: num5 }); bg1.then({ a: 'wait', d: num5 });
  num += num5;
  emote(out, 3, num, num4, anchor, num3, 0, false);
  tax.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  emote(out, 136, num, num4, anchor, 30, 0, true, true);
  emote(out, 15, num, num4, anchor, num3, 0, false);
  tax.then({ a: 'wait', d: num4 }); bg1.then({ a: 'wait', d: num4 });
  num += num4;
  san.then({ a: 'show', item: 3749, d: num5 + num4 + num4 });
  pres.then({ a: 'framesFor', frames: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]], tpf: 5, d: num - startTime });
  san.then({ a: 'fade', per: 2, dur: 127 });
  tax.then({ a: 'fade', per: 2, dur: 127 });
  pres.then({ a: 'fade', target: 0, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_Grox_WitchDoctorGoingToHisPeople（:660-788） */
function playWitchDoctorGoingToHisPeople(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 0;
  anchor.x += num2;
  const num3 = 60;
  const bg1 = bg(out, 'Extra_231', startTime, anchor, num2, -42, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 120 });
  });
  const doc = npc(out, startTime, 228, anchor, -60, 0, (an) => {
    enter(an, 1).then({ a: 'move', vx: 0.5, vy: 0, d: 120 });
  });
  const pri = npc(out, startTime, 663, anchor, -110, 0, (an) => {
    enter(an, 1).then({ a: 'move', vx: 0.5, vy: 0, d: 120 });
  });
  const lil = npc(out, startTime, 198, anchor, num3 * 2, 0, (an) => {
    enter(an).then({ a: 'wait', d: 120 });
  });
  const liana = spr(out, startTime, 'NPC_199', anchor, num3 * 3 - 20 + 120, 4,
    { frames: 8, originBottom: true }, (an) => {
      an.then({ a: 'frame', x: 0, y: 3 }).then({ a: 'fade', target: 0 })
        .with({ a: 'fade', target: 1, dur: 25 })
        .then({ a: 'gravity', v0: { x: -1, y: 0 }, g: { x: 0, y: 0 }, rot: 0, d: 120 })
        .with({ a: 'framesFor', frames: [[0, 3], [0, 4], [0, 5], [0, 6], [0, 7]], tpf: 6, d: 120 });
    });
  num += doc.time;
  const num4 = 120;
  emote(out, 10, num, num4, anchor, 0, 0, true, true);
  const num5 = 6;
  pri.then({ a: 'wait', d: num4 }); doc.then({ a: 'wait', d: num4 }); lil.then({ a: 'wait', d: num4 });
  liana.then({ a: 'framesFor', frames: [[0, 3], [0, 2], [0, 1], [0, 0]], tpf: num5, d: 0 });
  bg1.then({ a: 'wait', d: num4 });
  num += num4;
  const dur2 = num4 - num5 * 4;
  const lil2 = npc(out, num - num4 + num5 * 4, 198, anchor, num3 * 3 - 20, 0, (an) => {
    an.then({ a: 'look', d: -1 }).then({ a: 'wait', d: dur2 });
  });
  emote(out, 92, num, num4, anchor, -50, 0, true, true);
  pri.then({ a: 'wait', d: num4 });
  doc.then({ a: 'look', d: -1 }).then({ a: 'wait', d: num4 });
  lil.then({ a: 'wait', d: num4 });
  lil2.then({ a: 'wait', d: num4 });
  bg1.then({ a: 'wait', d: num4 });
  num += num4;
  const num6 = 60;
  pri.then({ a: 'wait', d: num6 });
  doc.then({ a: 'move', vx: 0.5, vy: 0, d: num6 });
  lil.then({ a: 'wait', d: num6 });
  lil2.then({ a: 'wait', d: num6 });
  bg1.then({ a: 'wait', d: num6 });
  num += num6;
  emote(out, 87, num, num4, anchor, num3 * 2, 0, true, true);
  pri.then({ a: 'wait', d: num4 }); doc.then({ a: 'wait', d: num4 });
  lil.then({ a: 'wait', d: num4 }).then({ a: 'look', d: -1 });
  lil2.then({ a: 'wait', d: num4 }).then({ a: 'look', d: -1 });
  bg1.then({ a: 'wait', d: num4 });
  num += num4;
  emote(out, 49, num, num4, anchor, 30, 0, true, true);
  pri.then({ a: 'wait', d: num4 }); doc.then({ a: 'wait', d: num4 });
  lil.then({ a: 'wait', d: num4 }); lil2.then({ a: 'wait', d: num4 });
  bg1.then({ a: 'wait', d: num4 });
  num += num4;
  const num7 = num4 + Math.trunc(num4 / 2);
  emote(out, 10, num, num4, anchor, num3 * 2, 0, false);
  emote(out, 0, num + Math.trunc(num4 / 2), num4, anchor, num3 * 3 - 20, 0, false);
  pri.then({ a: 'wait', d: num7 }); doc.then({ a: 'wait', d: num7 });
  lil.then({ a: 'wait', d: num7 }); lil2.then({ a: 'wait', d: num7 });
  bg1.then({ a: 'wait', d: num7 });
  num += num7;
  emote(out, 17, num, num4, anchor, -50, 0, true, true);
  emote(out, 3, num, num4, anchor, 30, 0, true, true);
  pri.then({ a: 'wait', d: num4 }); doc.then({ a: 'wait', d: num4 });
  lil.then({ a: 'wait', d: num4 }); lil2.then({ a: 'wait', d: num4 });
  bg1.then({ a: 'wait', d: num4 });
  num += num4;
  pri.then({ a: 'move', vx: -0.4, vy: 0, d: 160 }).with({ a: 'fade', per: 2, dur: 127 });
  doc.then({ a: 'move', vx: -0.5, vy: 0, d: 160 }).with({ a: 'fade', per: 2, dur: 127 });
  lil.then({ a: 'move', vx: -0.8, vy: 0, d: 160 }).with({ a: 'fade', per: 2, dur: 127 });
  lil2.then({ a: 'move', vx: -0.8, vy: 0, d: 160 }).with({ a: 'fade', per: 2, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

/** PlaySegment_Grox_SteampunkerRepairingCyborg（源 :522-565 域；帧舞保留时长） */
function playSteampunkerRepairingCyborg(out: Seg[], startTime: number, anchorIn: Vec): number {
  const anchor = { x: anchorIn.x + SCENE_FIX_X, y: anchorIn.y };
  let num = startTime;
  const num2 = 30;
  anchor.x += num2;
  const num3 = 60;
  // ★BJ409⑤：两块背景画板 origin = Size*(0.5,1)+(num2,-42)、位置 verbatim
  // _backgroundOffset（:470-481）；齿轮/机械臂 origin = Size*(0.5,1) 系底锚
  // （:483-492——此前误标 originBottom:false=中心锚,半高悬空）
  const bg1 = spr(out, num, 'Extra_232', anchor, BG_OFFSET.x, BG_OFFSET.y, { originBottom: true, ox: num2, oy: -42 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  const bg2 = spr(out, num, 'Extra_233', anchor, BG_OFFSET.x, BG_OFFSET.y, { originBottom: true, ox: num2, oy: -42 }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  const gear = spr(out, num, 'Extra_230', anchor, 0, 4, { frames: 21, originBottom: true }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  const arm = spr(out, num, 'Extra_229', anchor, num3, 4, { frames: 2, originBottom: true }, (an) => {
    an.then({ a: 'fade', target: 0 }).with({ a: 'fade', target: 1, dur: 60 }).then({ a: 'wait', d: 60 });
  });
  num += gear.time;
  const num4 = 120;
  gear.then({ a: 'framesFor', frames: [[0, 0], [0, 1]], tpf: 10, d: num4 });
  arm.then({ a: 'wait', d: num4 });
  bg1.then({ a: 'wait', d: num4 });
  bg2.then({ a: 'wait', d: num4 });
  num += num4;
  const array: Array<[number, number]> = [
    [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [0, 11],
    [0, 12], [0, 13], [0, 14], [0, 15], [0, 16], [0, 17], [0, 18], [0, 19], [0, 20],
    [0, 15], [0, 16], [0, 17], [0, 18], [0, 19], [0, 20], [0, 17], [0, 18], [0, 19], [0, 20],
  ];
  const num5 = 6;
  const num6 = num5 * array.length;
  gear.then({ a: 'frames', frames: array, tpf: num5 });
  const dur = Math.trunc(num6 / 2);
  arm.then({ a: 'wait', d: dur }).then({ a: 'frame', x: 0, y: 1 }).then({ a: 'wait', d: dur });
  bg1.then({ a: 'wait', d: num6 });
  bg2.then({ a: 'wait', d: num6 });
  num += num6;
  gear.then({ a: 'framesFor', frames: [[0, 17], [0, 18], [0, 19], [0, 20]], tpf: num5, d: 187 })
    .with({ a: 'fade', target: 0, dur: 127 });
  arm.then({ a: 'fade', target: 0, dur: 127 });
  bg1.then({ a: 'fade', target: 0, dur: 127 });
  bg2.then({ a: 'fade', target: 0, dur: 127 });
  num += 187;
  return num - startTime;
}

// ═══════════ 文本源 + 缓存（本仓集成口） ═══════════

import { languageManager } from '../i18n/LanguageManager';
import { Lang } from '../i18n/Lang';

/** Language.FindAll(Lang.CreateDialogFilter(cat + ".")) 等价：类目键序 = 语言包
 *  文件序（keysFromCategory 保插入序——LanguageManager.cs 注释同源） */
export function creditsLinesOf(category: string): string[] {
  return languageManager.keysFromCategory(category)
    .map((k) => Lang.text(`${category}.${k}`));
}

let fillCache: FillResult | null = null;

/** 演出时间线（惰性构建一次；语言切换后由 onCreditsRollLanguageChange 失效）。
 *  endTime = CreditsRollSky.AmountOfTimeNeededForFullPlay（creditsRoll.tryStarting
 *  的 fullPlayTime 入参源） */
export function getCreditsRollFill(inGame = true): FillResult {
  if (!fillCache) fillCache = fillSegments([], creditsLinesOf, inGame);
  return fillCache;
}

/** 语言切换失效（Lang.onChange 订阅——UI/装配侧挂一次） */
export function invalidateCreditsRollFill(): void {
  fillCache = null;
}
