// 翅膀视觉层 1:1（PlayerDrawLayers.cs DrawPlayer_09_Wings :655-1040 + Player.cs
// WingFrame :29002-30045 + 滑翔帧段 Player.cs:26874-27010）。
//
// ===== 绘制（DrawPlayer_09_Wings）=====
// 基础锚 vector(:662-664) = Position + (width/2, height − bodyFrame.Height/2) + (0,7)
//   —— bodyFrame.Height 恒 56 → 相对脚底中心局部 Y = −21（与碰撞盒高无关）。
// generic 尾段(:935-1000) num14=4 帧切分；偏移 vector18 = vector + (num13−9, num12+2)·directions
//   —— directions=(direction, gravDir)，本仓镜像空间里 X 偏移局部值 = (num13−9)、
//   Y 偏移 = (num12+2)，故锚点局部坐标 = (num13−9, num12−19)。
// 逐款特殊分支：22(:671)/28(:705)/45(:726)/34(:752)/51(:779)/47(:802)/49(:826)/
//   48(:841)/40(:854)/39(:898)/50(:923) 各自锚点与帧数。
// generic 尾段色改族（2026-08-19 booster 批）：9/29 主色 Color(250³,100)×s²(:964-969)、
//   31/32 color9.A 直改 220/127×s(:980-986)——锚点/帧数仍 generic（4 帧/默认锚点）。
// ShouldDrawWingsThatAreAlwaysAnimated 门（Player.cs:30271：vy≠0 && 未钩爪 &&
//   非水中漂浮 && mount.CanUseWings）——22/28/34/39/44/45/48 绘制受此门
//   （仅空中出现）；generic 与 4/12/24/30/51/47/49/50/40/43/44 无门（地面也画收拢帧）。
//
// ===== 帧状态机（WingFrame(wingFlap)）=====
// wingFlap=flag19（Player.cs:26469-26483）：wings>0 && controlJump && wingTime>0 &&
//   jump==0 && vy≠0；或 hover 集合 {22,28,30,32,29,33,35,37,45} && controlJump &&
//   TryingToHoverDown && wingTime>0；下冲(flag20)强制关。downDash 时关。
// 逐款分支见 stepWingFrame 内 switch（源码行号逐段标）。
// 滑翔帧段（Player.cs:26874-27010，WingFrame 之后执行）：!flag19 && wingsLogic>0 &&
//   controlJump && vy>0 && !downDash 时按款覆盖帧（默认 2；30/34/39 恒循环；
//   48→3、40→0、44→2、26→2、37→2、43→1、12→3；22/28/45/51/47/49/50/24 除外不覆盖）。
//
// ===== 偏差登记（2026-08-13 四轮 FX 二进制真值批后——①②③ 全部清零）=====
// 已清零（四轮，字节码级真值）：
//   ① 44 HallowBoss —— PixelShader.cso 反汇编（tools/disasm-fx.mjs）取得 MISC
//     "HallowBoss" pass 精确公式：ramp[fold(灰度+uTime), 0.5]×A（Extra_171 全图烘焙
//     缓存，PlayerRainbowWingsTextureContent.cs 1:1）；染料 4778 走 ArmorHallowBoss
//     pass（ramp[fold(SUM/2+t/2), 0.5]×0.8 + 原色×0.2，SM2Effect 解释器执行）；
//     44/45 残影 (70,70,70,0)·f 与 38 影子环 A=0 是原版死画 → 跳过即 1:1；
//   ② extra38 暗环境 tint / 49 光照门 z —— 读侧光照已接（LightingEngine.lightAt，
//     三轮）；stealth 视觉分层已接（四轮：PlayerDrawSet.cs:1523-1651 逐层乘数，
//     doll skin×s'² / armor×s'(B×settled) / 星璇 Lerp 通道，tintRGBA 逐通道）；
//   ③ stealth 与 cWings 染色 —— 全染料技术走 SM2 字节码执行（src/fx/SM2Effect.ts +
//     src/data/fxPixelShader.json，63 pass 全量），无近似公式；
// 剩余（设置/跳跃系统级，默认态恒 false 与原版一致）：
//   ④ tryKeepingHoveringUp/Down 锁存 = HoverControl Click 模式专属（Player.cs:361
//      默认 Hold → :24985 恒清零）；Click 设置项未移植（设置系统级）；
//   ⑤ isPerformingJump_DownDash（5465 手持下冲跳 :13978）未移植（跳跃系统级）
//      → downDash 恒 false 与现状一致。
export interface WingDraw {
  /** 绘制切帧数（num14 / Frame(1,N) 的 N；28 用 miscCounter 动画帧率恒 4） */
  frames: number;
  /** 局部锚点（脚底中心原点、镜像空间；X 已含 (num13−9)，Y = num12−19 基底 −21） */
  anchor: [number, number];
  /** ShouldDrawWingsThatAreAlwaysAnimated 门（仅空中绘制） */
  alwaysAir?: boolean;
  /** 帧来源：wingFrame（默认）／miscCounter/5%4（28 独立动画） */
  drawFrameFrom?: 'miscCounter';
  /** 47/49：锚点按身体帧行走 OffsetsPlayerHeadgear（:810-816） */
  headgearRow?: boolean;
  /** 主纹理全亮族（硬编码绘制色，光照合成后绘制）：
   *  - 'white'      28(:714 Lerp t=1)/44(:1032)/45(:729) Color(255³,255)
   *  - 'c250a100'   34(:766)/40(:859) Color(250³,100)
   *  - 'c250a100sq' 9/29（:964-969 generic 尾段分支：stealth 先自乘再 ×(1−shadow) →
   *                 Color(250³,100)×s²——RGB/A 均随 s²，与 34/40 的 s¹ 实现不同族勿混）
   *  - 'luna'       51(:781) GetLunaGlowColor=(255³,100)×脉冲(:185-190)×免疫 */
  mainGlow?: 'white' | 'c250a100' | 'c250a100sq' | 'luna';
  /** lit 主纹理 alpha 直改（generic 尾段 color9.A 覆写族——基色仍 colorArmorBody
   *  走 lit 路径，仅 alpha 换 220/127×settled）：31(:980-982)/32(:984-986) */
  litAlpha?: number;
  /** 44：主纹理取 Extra_171 着色器层（PlayerRainbowWings RT + HallowBoss 着色器；
   *  HLSL 不在反编译源 → 直画层贴图，与女皇 Extra_157 先例同法） */
  rainbowLayer?: boolean;
  /** 叠画（第二 pass，全亮族合成后绘制；硬编码色见各 kind 注释行号） */
  overlay?: {
    kind: 'plain'      // 单帧同切片叠画（file/tint/alpha）
      | 'flames7'      // 22：ItemFlame_1866×7 火焰簇（:676-699，逐 i (250−10i,150−10i)）
      | 'extra38'      // 28：Extra[38] 半白 Lerp(colorArmorBody,White,0.5)（:713-722，光采样）
      | 'jitter2'      // 43：×2 随机 ±1.25（:1004-1015，(230³,60)）
      | 'immune'       // 50：免疫色双画（:930-940）
      | 'betsy'        // 40：8 片程序化摆动（:854-896，(250³,100)）
      | 'trail45'      // 45：Projectile_250 彩虹拖尾（:2901-2961，White A=64 族）
      | 'arkhalis'     // 38：GlowMask[251]×underShirtColor（:1044-1048）；影子环 A=0 死画
      | 'selfAdd'      // 29：自身切片纯加色重画 ×scale（:1069-1074，Color(255³,0)×s²×(1−shadow)×0.5）
      | 'glowAdd'      // 32：GlowMask 纯加色 ×scale（:1099-1104，Glow_183×Color(255³,0)×s×(1−shadow)）
      | 'nebula';      // 31：HotPink↔Crimson 脉冲色 4 轨道(×0.5)+全幅(×1)（:1083-1097）
    /** 叠画贴图（vanilla/ 前缀文件名；plain/jitter2/immune/arkhalis/glowAdd 用） */
    file?: string;
    /** RGB 均一色调 0-255（plain/jitter2） */
    tint?: number;
    /** alpha 0-255（plain；selfAdd/glowAdd 的纯加色乘子同刻度——255=×1，如 29 的
     *  ×0.5f(:1071) = 127.5） */
    alpha?: number;
    /** 放大系数（selfAdd/glowAdd：29/32 的 1.06） */
    scale?: number;
    /** stealth 已被 9/29 分支(:965-966)平方累乘——叠画因子用 s² 而非 s（selfAdd） */
    stealthSq?: boolean;
  };
}

const GENERIC_ANCHOR: [number, number] = [-9, -19];

/** 绘制表（slot → 配置）。未列款 = generic 4 帧 + 默认锚点。 */
const DRAW_TABLE: Record<number, WingDraw> = {
  // generic 偏移微调（PlayerDrawLayers.cs:935-957）
  5:  { frames: 4, anchor: [-5, -23] },   // num13=4, num12=-4
  12: { frames: 4, anchor: [-10, -20] },  // num13=-1, num12=-1
  27: { frames: 4, anchor: [-6, -19], overlay: { kind: 'plain', file: 'Glow_92.png', tint: 255, alpha: 127 } },  // :1027-1033
  30: { frames: 4, anchor: GENERIC_ANCHOR, overlay: { kind: 'plain', file: 'Glow_181.png', tint: 255, alpha: 127 } }, // :1038-1043
  38: { frames: 4, anchor: GENERIC_ANCHOR, overlay: { kind: 'arkhalis', file: 'Glow_251.png' } }, // :1044-1048
  41: { frames: 4, anchor: [-10, -19] },  // num13=-1
  43: { frames: 7, anchor: [-14, -26], overlay: { kind: 'jitter2', file: 'Glow_272.png', tint: 230, alpha: 60 } }, // :1004-1015
  // 特殊绘制分支
  22: { frames: 7, anchor: [-9, 5],   alwaysAir: true, overlay: { kind: 'flames7' } },        // :674 + :676-699
  // 9/29 烈焰之翼/日耀之翼（generic 尾段 :964-969 分支：主纹理 Color(250³,100)×s²——
  // 全亮族；29 另有 :1069-1074 自身切片 ×1.06 纯加色叠画（s² 再 ×(1−shadow)×0.5）
  9:  { frames: 4, anchor: GENERIC_ANCHOR, mainGlow: 'c250a100sq' },
  29: { frames: 4, anchor: GENERIC_ANCHOR, mainGlow: 'c250a100sq',
        overlay: { kind: 'selfAdd', scale: 1.06, stealthSq: true, alpha: 127.5 } },  // :1069-1074（×0.5f）
  // 31 星云斗篷：lit 主纹理 alpha 直改 220·s（:980-982）+ HotPink↔Crimson 脉冲
  //   4 轨道(×0.5)+全幅(×1) 纯加色叠画（:1083-1097）
  31: { frames: 4, anchor: GENERIC_ANCHOR, litAlpha: 220, overlay: { kind: 'nebula' } },
  // 32 星尘之翼：lit 主纹理 alpha 直改 127·s（:984-986）+ Glow_183 ×1.06 纯加色（:1099-1104）
  32: { frames: 4, anchor: GENERIC_ANCHOR, litAlpha: 127,
        overlay: { kind: 'glowAdd', file: 'Glow_183.png', scale: 1.06 } },
  23: { frames: 4, anchor: GENERIC_ANCHOR, overlay: { kind: 'plain', file: 'Flame_8.png', tint: 200, alpha: 200 } }, // :1016-1023
  28: { frames: 4, anchor: [0, -2],   alwaysAir: true, drawFrameFrom: 'miscCounter', mainGlow: 'white', overlay: { kind: 'extra38' } }, // :705-722
  34: { frames: 6, anchor: [-4, -21], alwaysAir: true, mainGlow: 'c250a100' },  // :752-768
  39: { frames: 6, anchor: [-6, -28], alwaysAir: true },   // (−6,−7)（:901）
  44: { frames: 7, anchor: GENERIC_ANCHOR, mainGlow: 'white', rainbowLayer: true },           // :1029-1035
  45: { frames: 6, anchor: [0, 1],    alwaysAir: true, mainGlow: 'white', overlay: { kind: 'trail45' } }, // :726-746
  48: { frames: 8, anchor: [0, -21],  alwaysAir: true },   // Size/2+(4,0)−4·dir（:845）
  51: { frames: 8, anchor: [0, -15], mainGlow: 'luna' },   // (0,+6)（:786）
  47: { frames: 11, anchor: [-3, -20], overlay: { kind: 'plain', file: 'Glow_366.png', tint: 255, alpha: 180 }, headgearRow: true }, // :810-825
  49: { frames: 11, anchor: [-3, -20], headgearRow: true },// 同 47 无叠画（:831-842）
  50: { frames: 11, anchor: [-4, -19], overlay: { kind: 'immune' } },  // :923-940
  40: { frames: 14, anchor: [-4, -21], overlay: { kind: 'betsy' } },   // :854-896
};

export function wingDrawOf(slot: number): WingDraw {
  return DRAW_TABLE[slot] ?? { frames: 4, anchor: GENERIC_ANCHOR };
}

/** Main.OffsetsPlayerHeadgear（Main.cs:504-525，20 行仅 0/2 两值）：行 ∈
 *  {7,8,9,14,15,16} 为 0，其余 2。47/49 锚 Y = hy−22（:810-816）→ −22 / −20 */
export const HEADGEAR_ZERO_ROWS = new Set([7, 8, 9, 14, 15, 16]);
/** 47/49 锚点按身体帧行修正（anchor[1] = hy − 22） */
export function wingAnchorForRow(d: WingDraw, row: number): [number, number] {
  if (!d.headgearRow) return d.anchor;
  return [d.anchor[0], (HEADGEAR_ZERO_ROWS.has(row) ? 0 : 2) - 22];
}

// ===================== stealth 视觉因子（PlayerDrawSet :1523-1660） =====================
export interface StealthFactors {
  /** drawinfo.stealth（叠画消费值） */
  settled: number;
  /** s' 档（armor 主纹理 alpha 乘子） */
  clamp: number;
  /** 星璇 secondColor RGB（Lerp(White→(0,0.12,0.16),1−s')；非星璇 null） */
  vortexTint: [number, number, number] | null;
  /** 皮肤/衣物乘子 = s'²（doll 烘焙单层整体取值） */
  skinMul: number;
}

/** stealth 潜行视觉三分支（:1523-1660）：3106 变态刀/蘑菇矿套 settled=(1+s'·10)/11、
 *  星璇 settled=s'；s' = max(stealth, 0.03)；无潜行态全 1 */
export function stealthFactors(stealth: number, heldPsychoKnife: boolean,
  shroomiteSet: boolean, vortexSet: boolean): StealthFactors {
  let settled = 1, clamp = 1;
  let vortexTint: [number, number, number] | null = null;
  if (heldPsychoKnife || shroomiteSet) {
    clamp = Math.max(stealth, 0.03);
    settled = (1 + clamp * 10) / 11;              // :1533/:1576
  } else if (vortexSet) {
    clamp = Math.max(stealth, 0.03);
    settled = clamp;                              // :1622
    const k = 1 - clamp;
    vortexTint = [1 - k, 1 - 0.88 * k, 1 - 0.84 * k];   // :1624-1627 Lerp(One,(0,0.12,0.16,0),1−s')
  }
  return { settled, clamp, vortexTint, skinMul: clamp * clamp };
}

// ===================== 帧状态机（Player.cs WingFrame :29002-30045） =====================
/** 可变帧状态（Player.wingFrame / wingFrameCounter） */
export interface WingFrameState {
  frame: number;
  counter: number;
  /** 47/49/50 帧推进瞬间的单 tick 标记（ChickenBones/Heroicis/Kazzymodus 尘爆用，
   *  :29528/:29595/:29667 justSwitched——每次 stepWingFrame 先清零） */
  justSwitched?: boolean;
}

/** 帧推进输入（Player 侧逐字段对齐原版同名字段） */
export interface WingFrameInput {
  /** flag19（翅膀飞行推进中） */
  flap: boolean;
  /** jump > 0（多段跳余量，与 flap 同触发动画） */
  jump: boolean;
  vy: number;
  controlJump: boolean;
  /** controlLeft || controlRight（22/47/49/50 分支用） */
  controlLR: boolean;
  /** TryingToHoverDown 近似（controlDown） */
  hoverDown: boolean;
  /** TryingToHoverUp 近似（controlUp） */
  hoverUp: boolean;
  wingTime: number;
  /** 滑翔帧段条件（!flap && wings>0 && controlJump && vy>0 && !downDash） */
  glide: boolean;
  /** isPerformingJump_DownDash */
  downDash: boolean;
  /** ShouldFloatInWater && wet（脚蹼水中漂浮；43/49 归零门 + 绘制门） */
  waterFloat: boolean;
  /** ShouldDrawWingsThatAreAlwaysAnimated（Player.cs:30271：vy≠0 && 未钩爪 &&
   *  !waterFloat && mount.CanUseWings）——28/34/39/44/45 分支门，false 落 generic 尾段 */
  shouldDraw: boolean;
}

/** GetWingsFunctionalityForVisuals（Player.cs:28994-28999）的 canHover 固定集 */
export const VISUAL_HOVER_SET = new Set([22, 30, 31, 28, 33, 35, 44, 45]);
/** flag19 的 hover 档集合（Player.cs:26477：与 canHover 集 *不同*，勿混用） */
export const FLAP_HOVER_SET = new Set([22, 28, 30, 32, 29, 33, 35, 37, 45]);

const clampFrame = (f: number, max: number) => (f >= 0 && f < max ? f : 0);

/**
 * 每帧推进翅膀帧（先 WingFrame(flap) 再滑翔覆盖——与原版两段执行序一致）。
 * 纯函数：状态经 state 引用修改。
 */
export function stepWingFrame(slot: number, st: WingFrameState, i: WingFrameInput): void {
  st.justSwitched = false;
  // ---- WingFrame 主干（:29002+）----
  switch (slot) {
    case 4: {
      // :29014-29086：flap 循环 0→1→2（5t/帧，counter>4 推进）；否则帧 3（张翼）
      if (i.flap || i.jump) {
        st.counter++;
        if (st.counter > 4) {
          st.frame = st.frame >= 2 ? 0 : st.frame + 1;
          st.counter = 0;
        }
      } else if (!i.controlJump || i.vy === 0) {
        st.frame = 3;
      }
      break;
    }
    case 28: {
      // :29066-29087：门内仅发光（未接）后 return——帧交由绘制端 miscCounter 独立
      // 动画，状态机不动；门外语 generic 尾段（ShouldDraw 假族回退）
      if (i.shouldDraw) break;
      genericTail(st, i, 4, 4, 0, 0, 1, false);
      break;
    }
    case 22: {
      // :29088-29190：!controlJump→0；hoverDown 横移 [1,2,3,2]@2t／竖停 [4,5,4]@6t；
      //   常态 [4,5,6,5]@2t；无时 [4,5,4]@6t
      if (!i.controlJump) { st.frame = 0; st.counter = 0; }
      else if (i.wingTime > 0) {
        if (i.hoverDown) {
          if (i.controlLR) {          // num4=2 档（:29100-29118）
            st.counter++;
            st.frame = st.counter < 2 ? 1 : st.counter < 4 ? 2 : st.counter < 6 ? 3 : 2;
            if (st.counter >= 7) { st.frame = 2; st.counter = 0; }
          } else {                     // num5=6 档（:29120-29137）
            st.counter++;
            st.frame = st.counter < 6 ? 4 : st.counter < 12 ? 5 : 4;
            if (st.counter >= 17) { st.frame = 4; st.counter = 0; }
          }
        } else {                       // num6=2 档（:29139-29158）
          st.counter++;
          st.frame = st.counter < 2 ? 4 : st.counter < 4 ? 5 : st.counter < 6 ? 6 : 5;
          if (st.counter >= 7) { st.frame = 5; st.counter = 0; }
        }
      } else {                         // num7=6 档（:29160-29177）
        st.counter++;
        st.frame = st.counter < 6 ? 4 : st.counter < 12 ? 5 : 4;
        if (st.counter >= 17) { st.frame = 4; st.counter = 0; }
      }
      break;
    }
    case 12: {
      // :29198-29228：flap [1,2,3,2]@5t；vy≠0→2；地面→0
      if (i.flap || i.jump) {
        st.counter++;
        st.frame = st.counter < 5 ? 1 : st.counter < 10 ? 2 : st.counter < 15 ? 3 : 2;
        if (st.counter >= 19) { st.frame = 2; st.counter = 0; }
      } else if (i.vy !== 0) st.frame = 2;
      else { st.frame = 0; st.counter = 0; }
      break;
    }
    case 24: {
      // :29230-29282：flap [1,2,3]@1t 尾 2；下落按跳 [1,2,3]@3t／无时 0／余 1；地面 0
      if (i.flap || i.jump) {
        st.counter++;
        st.frame = st.counter < 1 ? 1 : st.counter < 2 ? 2 : st.counter < 3 ? 3 : 2;
        if (st.counter >= 3) st.counter = 0;
      } else if (i.vy !== 0) {
        if (i.controlJump) {           // num10=3 档（:29246-29262）
          st.counter++;
          st.frame = st.counter < 3 ? 1 : st.counter < 6 ? 2 : st.counter < 9 ? 3 : 2;
          if (st.counter >= 11) st.counter = 0;
        } else if (i.wingTime === 0) st.frame = 0;
        else st.frame = 1;
      } else { st.frame = 0; st.counter = 0; }
      break;
    }
    case 30: {
      // :29284-29329：flap/按跳 1+counter/2（回绕 6）；其余恒 0
      if (i.flap || i.jump || (i.vy !== 0 && i.controlJump)) {
        st.counter++;
        if (st.counter >= 6) st.counter = 0;
        st.frame = 1 + Math.floor(st.counter / 2);
      } else st.frame = 0;
      break;
    }
    case 34: {
      // :29424-29459（ShouldDraw 门内）：flap rate4／按跳 rate9／else rate6，恒循环
      // 6 帧（回绕 24/54/36）；门外语 generic 尾段
      if (!i.shouldDraw) { genericTail(st, i, 4, 4, 0, 0, 1, false); break; }
      st.counter++;
      const rate = i.flap || i.jump ? 4 : i.controlJump ? 9 : 6;
      if (st.counter >= rate * 6) st.counter = 0;
      st.frame = Math.floor(st.counter / rate);
      break;
    }
    case 51: {
      // :29462-29489：flap rate4（回绕 32→8）；按跳 rate6（48→12）；else rate8（64→16）
      // 帧 2-7；地面归 0
      if (i.vy === 0 && !i.flap && !i.jump) { st.frame = 0; st.counter = 0; break; }
      st.counter++;
      const rate = i.flap || i.jump ? 4 : i.controlJump ? 6 : 8;
      if (st.counter >= rate * 8) st.counter = rate * 2;
      st.frame = Math.floor(st.counter / rate);
      break;
    }
    case 47:
    case 49:
    case 50: {
      // :29493-29702（三款同构 11 帧，差异已参数化）：推进档 rate=vy>0?2:
      //   (boost&&hoverUp?3:(!canHover||!hoverDown?4:(canHoverBoost&&LR?4:6)))；
      //   下落档 6（50=5）；vy>0 时按跳档 3 且帧 1 钉住、否则帧 2 钉住；
      //   转移 47/49：1→10、3(flag3)→1、回绕 >10→2；50：1→3、2(flag3)→1、>9→2
      const canHover = VISUAL_HOVER_SET.has(slot);
      // canBoost（GetWingsFunctionalityForVisuals :28998 = wingsLogic∈{44,45}）：本分支
      // slot≡wingsLogic∈{47,49,50} → 恒 false（原版同款死条件，保留形状）
      const canBoost = false;
      const canHoverBoost = [22, 37, 30, 31, 45].includes(slot); // hoverSpeed≠-1（WingStats 表）
      const flag3 = i.controlJump && !i.downDash;    // vy>0 下落按跳档（:29507）
      let rate = 0;
      let hold = false;
      if (i.flap) {
        rate = i.vy > 0 ? 2
          : canBoost && i.hoverUp ? 3
          : !canHover || !i.hoverDown ? 4
          : !canHoverBoost || !i.controlLR ? 6 : 4;
      } else if (i.vy !== 0) {
        rate = slot === 50 ? 5 : 6;
        if (i.vy > 0) {
          if (flag3) {
            rate = 3;
            if (st.frame === 1) hold = true;
          } else if (st.frame === 2) hold = true;
        }
      } else {
        hold = true;
        st.frame = 0;
      }
      if (hold) { st.counter = 0; break; }
      if (st.frame === 0) st.frame = 2;
      st.counter++;
      if (st.counter >= rate) {
        st.counter = 0;
        st.justSwitched = true;          // :29528/:29595/:29667
        if (slot === 50) {
          if (st.frame === 1) st.frame = 3;
          else if (st.frame === 2 && flag3) st.frame = 1;
          else if (++st.frame > 9) st.frame = 2;
        } else {
          if (st.frame === 1) st.frame = 10;
          else if (st.frame === 3 && flag3 && i.vy > 0) st.frame = 1;
          else if (++st.frame > 10) st.frame = 2;
        }
      }
      break;
    }
    case 45: {
      // :29707-29740（ShouldDraw 门内）：vy==0→0；else counter/3（无时 5）回绕 18
      if (!i.shouldDraw) { genericTail(st, i, 4, 4, 0, 0, 1, false); break; }
      if (i.vy === 0) { st.frame = 0; st.counter = 0; break; }
      st.counter++;
      const rate = i.wingTime === 0 ? 5 : 3;
      if (st.counter >= rate * 6) st.counter = 0;
      st.frame = Math.floor(st.counter / rate);
      break;
    }
    case 44: {
      // :29744-29778（ShouldDraw 门内）：flap/地面 1+counter/5 回绕 30（帧 1-6）；
      //   下落按跳 2／水上 0／else 3；门外语 generic 尾段
      if (!i.shouldDraw) { genericTail(st, i, 4, 4, 0, 0, 1, false); break; }
      if (i.flap || i.jump || i.vy === 0) {
        st.counter++;
        if (st.counter >= 30) st.counter = 0;
        st.frame = 1 + Math.floor(st.counter / 5);
      } else if (i.controlJump) st.frame = 2;
      else if (i.waterFloat) st.frame = 0;
      else st.frame = 3;
      break;
    }
    case 39: {
      // :29779-29813（ShouldDraw 门内）：同 34（rate4/9/6 回绕 24/54/36）
      if (!i.shouldDraw) { genericTail(st, i, 4, 4, 0, 0, 1, false); break; }
      st.counter++;
      const rate = i.flap || i.jump ? 4 : i.controlJump ? 9 : 6;
      if (st.counter >= rate * 6) st.counter = 0;
      st.frame = Math.floor(st.counter / rate);
      break;
    }
    case 33: {
      // :30541-30601（1457）：flap/jump/下落持跳（flag9）只驱动喷尘（尘已接
      //   Player.wingFx flag2 门）后 return——wingFrame/wingFrameCounter 全程
      //   不写=帧不动；帧只由下方滑翔覆盖（default→2）驱动，落地不归零。
      //   ★2026-09-27 定谳注：旧注释行号（:29820-29844/:29904-29960）系 case 22
      //   段内错锚，曾把 33 的「仅喷尘不动帧」连坐到 38（见 case 38 注）。
      break;
    }
    case 38: {
      // :30594-30633（1457）Arkhalis 之翼：flap/jump 或 下落中持跳 → counter++
      //   回绕 32、frame=1+counter/8（==4 钳 2）= [1,2,3,2]@8t 扑动循环；
      //   其余（vy==0 / 下落未持跳）→ frame=0。喷尘（flag10→尘 267）仍未接=既有登记。
      //   ★翼扑冻结案定谳修复（2026-09-27 用户实报「飞行时翅膀扑动没了」）：旧码
      //   case 33/38 合并 break=38 飞行全程帧冻结；滑翔帧覆盖不受影响（glide 时
      //   本支动画后照旧被覆盖 → 2，与原版两段执行序同相）。
      if (i.flap || i.jump || (i.vy !== 0 && i.controlJump)) {
        st.counter++;
        if (st.counter >= 32) st.counter = 0;
        st.frame = 1 + Math.floor(st.counter / 8);
        if (st.frame === 4) st.frame = 2;
      } else {
        st.frame = 0;
      }
      break;
    }
    default: {
      // generic 尾段（:29975-30045）：rate=4（43→3、48→2、32→3）；max=4（43→7、
      //   48→8）；reset=0（43→1）；下落帧 1（32→3；43→2 水上→0；49→1 水上→0）
      if (slot === 43) genericTail(st, i, 3, 7, 1, 0, 2, true);
      else if (slot === 48) genericTail(st, i, 2, 8, 0, 0, 1, false);
      else if (slot === 32) genericTail(st, i, 3, 4, 0, 0, 3, false);
      else if (slot === 49) genericTail(st, i, 4, 4, 0, 0, 1, true);
      else genericTail(st, i, 4, 4, 0, 0, 1, false);
      break;
    }
  }

  // ---- 滑翔帧覆盖（Player.cs:26874-27010，WingFrame 之后执行）----
  if (!i.flap && i.glide) glideOverride(slot, st, i);
}

/** generic 尾段（:29975-30045）。waterFallZero 仅 43/49（:30012-30024） */
function genericTail(st: WingFrameState, i: WingFrameInput,
  rate: number, max: number, reset: number, idle: number, fall: number,
  waterFallZero: boolean): void {
  if (i.flap || i.jump) {
    st.counter++;
    if (st.counter > rate) {
      st.frame++;
      st.counter = 0;
      if (st.frame >= max) st.frame = reset;
    }
  } else if (i.vy !== 0) {
    st.frame = waterFallZero && i.waterFloat ? 0 : fall;
  } else {
    st.frame = idle;
    st.counter = 0;
  }
}

/** 滑翔帧覆盖（:26874-27010）：30/34/39 恒循环；48→3、40→0、44→2、26→2、
 *  37→2、43→1、12→3；22/28/45/51/47/49/50/24 除外；默认 2 */
function glideOverride(slot: number, st: WingFrameState, i: WingFrameInput): void {
  switch (slot) {
    case 22: case 28: case 45: case 51: case 47: case 49: case 50: case 24:
      return;                            // 排除款（原版链不进 default）
    case 30:                              // :26877-26884：1+counter/5 回绕 15
      st.counter++;
      if (st.counter >= 15) st.counter = 0;
      st.frame = 1 + Math.floor(st.counter / 5);
      return;
    case 34:                              // :26885-26892：counter/7 回绕 42
      st.counter++;
      if (st.counter >= 42) st.counter = 0;
      st.frame = Math.floor(st.counter / 7);
      return;
    case 39:                              // :26928-26936：counter/12 回绕 72
      st.counter++;
      if (st.counter >= 72) st.counter = 0;
      st.frame = Math.floor(st.counter / 12);
      return;
    case 48: st.frame = 3; return;        // :26896
    case 40: st.frame = 0; return;        // :26901
    case 44: st.frame = 2; return;        // :26906
    case 43: st.frame = 1; return;        // :26976
    case 12: st.frame = 3; return;        // :26981
    case 26: case 37: st.frame = 2; return; // :26916 / :26965
    default: st.frame = 2; return;        // :26990（含 33/38）
  }
}

/** 绘制帧（wingFrame 或 miscCounter 独立动画）——clamp 到合法区间 */
export function wingDrawFrame(slot: number, st: WingFrameState, miscCounter: number): number {
  const d = wingDrawOf(slot);
  if (d.drawFrameFrom === 'miscCounter') return clampFrame(Math.floor(miscCounter / 5) % 4, 4);
  return clampFrame(st.frame, d.frames);
}
