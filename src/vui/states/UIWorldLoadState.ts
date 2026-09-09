// 移植 UIWorldLoad.cs：UIHeader 阶段文字 + UIGenProgressBar 双进度条 + 底部小贴士。
// 外加用户特有需求：左侧 GenWorldPreview 实时地图预览。
//
// ★IIIII215b 彩蛋种子生成界面 1:1 对齐（原版定谳锚见 doc 章 XCI+）：
//  · 文案三重奏（UIWorldLoad.DrawSelf :93-116，三顺序 if 判定与覆写序逐字同构；
//    ★IIIII229 M2 由互斥 else-if 链改判为顺序覆写链）：
//      ① drunk 乱码（drunkWorldGenText && !placingTraps && !getGoodWorldGen）——
//        每帧 Main.rand.Next(999999999) 起头 + 至多 3 段各 50% 追加；
//      ② 蜜蜂文案（notTheBees && !Main.zenithWorld）→ "UI.WorldGenEasterEgg_GeneratingBees"
//        整体覆写（无百分位后缀，原版该形态本就无 Message 之外的文字）——覆写①；
//      ③ FTW 镜像反写（getGoodWorldGen && (!noTrapsWorldGen || !placingTraps)）——
//        对【当前显示串】逐 UTF-16 code unit 倒序（C# Substring(num,1) 语义）——覆写②。
//  · 提示条彩蛋（GameTipsDisplay.Draw :139-162 else-if 链同序）：vampireSeed →
//    "Misc.Vampirism" 整替 > FTW 反写 > drunk 乱码(14 段)；颜色：十周年且非天顶
//    → HotPink，否则 White（UIHeader.DrawSelf :54-61 同门）。
//  · 进度条醉酒帧闪（UIGenProgressBar.drunkWorldGen + uiRand 注入，DrawSelf :63-67）。
//  · 生成期音效（WorldGen.worldGenCallback :6541/:6551 PlaySound(10)=MenuOpen 开/收两次）
//    ——挂在创建流（genSounds 门）的 onActivate/onDeactivate；读档页不播（原版加载
//    路径不走 worldGenCallback）。
//  · UI 层 RNG 纪律：全部掷点走本状态私有 UnifiedRandom(translateSeed(seedText))
//    实例（原版 Main.rand = new UnifiedRandom(seed) 同构，WorldGen.cs:11159），与
//    世界生成 genRand/Main.rand 零共享——g 链 mile8 守恒（tests/worldgen-ui-easter-eggs）。
//  · 交互缺口备案：原版 Esc(Inventory 触发器)→QueuedAbort+MenuClose(UIWorldLoad.Update
//    :54-58) 需生成管线取消钩（src/world/gen 冻结中，IIIRS214 在途）——本批不实装。
import { UIState } from '../core/UIState';
import { UIHeader } from '../elements/UIHeader';
import { UIGenProgressBar } from '../elements/UIGenProgressBar';
import { StyleDimension } from '../core/StyleDimension';
import { rgb } from '../draw/UISpriteBatch';
import { GenWorldPreview } from './GenWorldPreview';
import { Lang } from '../../i18n/Lang';
import { worldgenProgressKey } from '../../i18n/worldgenKeys';
import { UnifiedRandom, translateSeed } from '../../core/rng';
import { parseSeedChain, type SeedFlags } from '../../world/gen/SeedEasterEggs';   // ★IIIII229 ⑥M1 parseSeed→parseSeedChain（gen 同口径）
import { UISfx } from '../UISfx';
import type { World } from '../../world/World';
import type { UISpriteBatch, Color } from '../draw/UISpriteBatch';
import { PixelText } from '../draw/PixelText';


/** 原版 Color.HotPink（UIHeader.DrawSelf :56 / GameTipsDisplay.Draw :154） */
export const HOT_PINK = rgb(255, 105, 180);
/** Traps pass 的 legacy 消息号（GenPassNameID.Traps → Lang.gen[34]"正在放置机关"，
 *  placingTraps=true 域——WorldGen.cs:18792-18795；noTraps 变体 gen[91] 同 pass） */
const TRAP_PASS_LEGACY_ID = 34;
/** GameTipsDisplay 常量（GameTipsDisplay.cs:30-38/:89） */
const TIP_DURATION = 11.5;      // DURATION
const TIP_OFFSET_Y = -150;      // TipOffsetY
const TIP_SCALE = 1.1;          // Draw num4
const TIP_MAX_H = 110;          // Draw num5（超高清收縮阈值）
const TIP_APPEAR = 0.5;         // APPEAR_TIME（SmoothStep 2.5→0.5）
/** 提示池 = LoadingTips_Default +（GamePad ∪ Keyboard 二选一）（GameTipsProvider
 *  RollAvailableTip :29-36 1:1：`UsingGamepad ? _tipsGamepad : _tipsKeyboard`）。
 *  ★IIIII229（② 217/212 章登记性接桩）：仓内无 PlayerInput.UsingGamepad 等价层
 *  （手柄 UI 域未建），以「存在已连接 Gamepad 设备」近似——无手柄环境恒走键盘池
 *  （桌面键池回归零变化；手柄接入后即换 GamePad 池,文案已在 l10n 三语在位）。 */
const TIP_CATEGORIES = ['LoadingTips_Default', 'LoadingTips_Keyboard'];
const TIP_CATEGORIES_GAMEPAD = ['LoadingTips_Default', 'LoadingTips_GamePad'];
function usingGamepad(): boolean {
  try {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
    const pads = navigator.getGamepads();
    for (const p of pads) { if (p && p.connected) return true; }
    return false;
  } catch {
    return false;
  }
}
function tipCategories(): string[] {
  return usingGamepad() ? TIP_CATEGORIES_GAMEPAD : TIP_CATEGORIES;
}

/** 乱码数字串（C# string.Concat(int)——无前导零；Main.rand.Next(999999999)）。
 *  segs=追加段数上限（进度头 3 / 提示条 14），每段 50% 命中。纯函数。 */
export function drunkScrambleText(rand: UnifiedRandom, segs: number): string {
  let text = String(rand.nextInt(999999999));
  for (let i = 0; i < segs; i++) {
    if (rand.nextInt(2) === 0) text += String(rand.nextInt(999999999));
  }
  return text;
}

/** FTW 逐 code unit 倒序（C# `Substring(num, 1)` 逐 UTF-16 单元拼接语义，
 *  UIWorldLoad.DrawSelf :110-115 / GameTipsDisplay.Draw :143-150）。纯函数。 */
export function reverseUtf16Units(text: string): string {
  let out = '';
  for (let i = text.length - 1; i >= 0; i--) out += text[i];
  return out;
}

/** 生成屏种子表现旗标（UI 层只读派生，零 store 写）：由种子文本 parseSeedChain 而来（★IIIII229 ⑥M1:'|' 多段并集,gen 同口径）
 *  （与世界生成同源解析层；读档页无 seedText → undefined → 全彩蛋关）。 */
export interface GenScreenSeedFlags {
  drunkWorldGenText: boolean;   // WorldGen.drunkWorldGenText（Reset :11165 = drunkWorldGen）
  zenithWorld: boolean;         // Main.zenithWorld（getfixedboi）
  getGoodWorldGen: boolean;     // WorldGen.getGoodWorldGen（FTW）
  notTheBees: boolean;          // WorldGen.notTheBees
  noTrapsWorldGen: boolean;     // WorldGen.noTrapsWorldGen（FTW 反写门用）
  tenthAnniversaryWorldGen: boolean; // WorldGen.tenthAnniversaryWorldGen（HotPink）
  vampireSeed: boolean;         // Main.vampireSeed（提示条整替）
  drunkWorldGen: boolean;       // WorldGen.drunkWorldGen（进度条帧闪门；getfixedboi 亦置位）
  /** ★IIIII218：WorldGen.remixWorldGen（remix/天顶 logo 倒置摆动 + 菜单流星/背景漂移 +
   *  强制夜面门——DrawMenu :49060 首分支） */
  remixWorldGen: boolean;
  /** ★IIIII218：WorldGen.dontStarveWorldGen（Cloud.Update 云型强制 37-40 档——
   *  SeedFlags.theConstant = Main.dontStarveWorld 同源） */
  dontStarveWorldGen: boolean;
}

/** SeedFlags → 生成屏表现旗标（纯函数；字段语义见 GenScreenSeedFlags） */
export function genScreenFlagsOf(f: SeedFlags): GenScreenSeedFlags;
export function genScreenFlagsOf(f: SeedFlags | null | undefined): GenScreenSeedFlags | null;
export function genScreenFlagsOf(f: SeedFlags | null | undefined): GenScreenSeedFlags | null {
  if (!f) return null;
  return {
    drunkWorldGenText: !!f.drunkWorld,
    zenithWorld: !!f.everything,
    getGoodWorldGen: !!f.getGoodWorld,
    notTheBees: !!f.notTheBees,
    noTrapsWorldGen: !!f.noTraps,
    tenthAnniversaryWorldGen: !!f.tenthAnniversary,
    vampireSeed: !!f.vampireSeed,
    drunkWorldGen: !!f.drunkWorld,
    remixWorldGen: !!f.remix,
    dontStarveWorldGen: !!f.theConstant,
  };
}

/** 提示条单实例（GameTipsDisplay.GameTip 同构：锚点 ScreenAnchorX 2.5→0.5→-1.5） */
interface GenTip {
  text: string;         // 已滚定的池内原文（变换在绘制期应用,原版同构）
  spawnTime: number;    // SpawnTime（秒,状态机时钟）
}

export class UIWorldLoadState extends UIState {
  private header: UIHeader;
  private bar = new UIGenProgressBar();
  private preview: GenWorldPreview | null = null;
  private lastLabel = '';
  private pct = 0;
  private time = 0;

  // ---- ★IIIII215b 生成屏彩蛋态 ----
  /** 种子表现旗标（null = 读档页/无种子上下文 → 全彩蛋关,原版加载路径同态） */
  private seedFlags: GenScreenSeedFlags | null;
  /** UI 层私有掷子（UnifiedRandom(seed)，仅本状态与进度条帧闪消费） */
  private uiRand: UnifiedRandom | null = null;
  /** placingTraps 域（Traps pass 进行中——乱码抑制/FTW 反写门消费） */
  private placingTraps = false;
  /** 生成流音效门（WorldGen.worldGenCallback :6541/:6551 双 MenuOpen） */
  private genSounds: boolean;

  // ---- 提示条（GameTipsDisplay 1:1：集合 + 全员临期补新） ----
  private tips: GenTip[] = [];
  private lastTipText = '';

  constructor(evil?: -1 | 0 | 1, opts?: { seedText?: string; genSounds?: boolean }) {
    super();
    const logicalH = this.getDimensions().height;
    // 1.4.5.6：随机邪恶（generatingRandomEvil）用 Outer_Random 专属配色
    this.bar.randomEvil = evil === undefined || evil === -1;
    this.bar.crimson = evil === 1;   // WorldGen.crimson 初值（预览挂载后由 world.crimson 权威覆写）
    // ★IIIII215b：种子旗标派生 + 私有掷子注入（读档页 seedText 缺省 → 全关）
    //   ★IIIII229（⑥ 217 章 M1）：parseSeed（首中即返）→ parseSeedChain（'|' 多段
    //   并集）——对齐 gen 口径（WorldGen.ts:195/801/825），多段籽（vanilla 头协议
    //   UIWorldCreation.cs:1004-1008 同构,如 '05162020|not the bees'）生成屏彩蛋不再全灭。
    //   UI 层仍只读派生零 store 写。
    if (opts?.seedText != null) {
      const flags = genScreenFlagsOf(parseSeedChain(opts.seedText).flags);
      this.seedFlags = flags;
      this.uiRand = new UnifiedRandom(translateSeed(opts.seedText));
      this.bar.drunkWorldGen = flags.drunkWorldGen;
      this.bar.uiRand = this.uiRand;
    } else {
      this.seedFlags = null;
    }
    this.genSounds = opts?.genSounds === true;

    this.header = new UIHeader('');
    this.header.hAlign = 0.5;
    this.header.top = StyleDimension.fromPixels(UIGenProgressBar.topForScreenH(logicalH) - 70);
    this.append(this.header);

    this.bar.hAlign = 0.5;
    this.bar.top = StyleDimension.fromPixels(UIGenProgressBar.topForScreenH(logicalH));
    this.append(this.bar);
  }

  /** 生成流激活：原版 worldGenCallback 进场 PlaySound(10)（WorldGen.cs:6541） */
  override onActivate(): void {
    if (this.genSounds) UISfx.menuOpen();
  }

  /** ★IIIII218：生成屏表现旗标只读出口（mainFlow → TitleMenu.setGenFlags /
   *  MenuBackground.setGenFlags 接线；读档页= null） */
  get screenFlags(): GenScreenSeedFlags | null { return this.seedFlags; }

  /** 生成流收场（成败/中止同播,WorldGen.cs:6551）——创建流离场（进世界/回菜单）即触发 */
  override onDeactivate(): void {
    if (this.genSounds) UISfx.menuOpen();
  }

  /** 进度回调（WorldGen/Game 的 (label,p[,local])）。
   *  ★原版对齐（2026-08-31）：长条=p=加权 TotalProgress（GenerationProgress.TotalProgress，
   *  经 Game 端 0.7 外层缩放）；短条=local=当前原版 pass 的段内 Value——与
   *  UIWorldLoad.DrawSelf :113-133 双杆逐字同义。local 缺省的兼容路径（读档
   *  tiles/settle/preload 等）保留旧十分位窗口回退。 */
  setProgress(label: string | undefined, rawP: number, local?: number) {
    const p = Number.isFinite(rawP) ? Math.max(0, Math.min(1, rawP)) : 0;   // NaN/越界防御
    const lc = local !== undefined && Number.isFinite(local)
      ? Math.max(0, Math.min(1, local)) : null;
    this.pct = p;
    this.bar.totalProgress = p;
    if (lc !== null) {
      this.bar.currentProgress = lc;               // 原版短条=当前 GenPass 段内 Value
    } else {
      // 兼容回退（原十分位窗口）：非生成管线的合成进度没有"段内"概念
      const win = Math.floor(p * 10) / 10;
      this.bar.currentProgress = Math.max(0, Math.min(1, (p - win) * 10));
    }
    if (label !== undefined && label !== this.lastLabelKey) {
      this.lastLabelKey = label;
      const text = Lang.worldgenText(label);
      // 标签自带百分比时(读档 tiles/settle 原版水位文案"…X%")不再追加
      // " - X%"后缀——曾拼出"正在安置液体50% - 0%"双重百分比,且追加用的是
      // 阶段内 p 与标签水位不同标尺(2026-08-14)
      this.suffixMode = !text.includes('%');
      this.baseText = text;
      // ★IIIII215b：Traps pass 域（placingTraps）——乱码抑制/FTW 反写门消费
      this.placingTraps = worldgenProgressKey[label] === TRAP_PASS_LEGACY_ID;
    }
    // 后缀百分比水位（原口径 2026-08-31）：local（段内）优先,无 local 用总进度
    this.pctShown = lc !== null ? Math.round(lc * 100) : Math.round(p * 100);
    this.refreshHeaderText();
  }
  private suffixMode = true;   // 标签不含 % 时才追加 " - X%" 后缀
  private baseText = '';
  private pctShown = 0;        // 后缀水位读数（setProgress 每次回写,原口径保留）
  /** 最近一次显示键（undefined 文案=粘滞沿用,不触发重翻译/换行计算） */
  private lastLabelKey: string | undefined = '';

  /** ★IIIII215b 头部文字逐帧合成（UIWorldLoad.DrawSelf :93-116 序）：
   *  基串(原样/带后缀) → ① drunk 乱码 → ② 蜜蜂整替 → ③ FTW 反写。
   *  ★IIIII229（⑥ 217 章 M2）：三重奏**顺序 if 化**——vanilla :93/:104/:108 为三顺序
   *  if（后支可覆写前支,非互斥 else-if）。旧互斥链在组合旗标域与 vanilla 分叉：
   *  drunk+NTB 域 vanilla 显蜜蜂（乱码被覆写）而 JS 显乱码;FTW+NTB 域 vanilla 反写
   *  蜜蜂文案而 JS 不反写。M1 解链（parseSeedChain）后组合旗标可上屏,该域由不可达
   *  转可达。zenith 域三条件天然重合不受影响（bees 支 !zenithWorld 拒、drunk 支
   *  !getGoodWorldGen 拒）。 */
  private refreshHeaderText(): void {
    const f = this.seedFlags;
    let text: string;
    if (f && f.drunkWorldGenText && !this.placingTraps && !f.getGoodWorldGen) {
      // ① drunk 乱码：整串替换（无后缀——原版该形态纯数字,每帧重掷）
      text = this.uiRand ? drunkScrambleText(this.uiRand, 3) : '';
    } else {
      // 基串：原样 / " - X%"后缀（后缀水位优先用 local=段内值,同原版 Message 填充位）
      text = this.suffixMode && this.baseText ? `${this.baseText} - ${this.pctShown}%` : this.baseText;
    }
    if (f && f.notTheBees && !f.zenithWorld) {
      // ② 蜜蜂整替：固定文案（无后缀,原版即纯 Language.GetTextValue）——覆写①
      text = Lang.text('UI.WorldGenEasterEgg_GeneratingBees');
    }
    if (f && f.getGoodWorldGen && (!f.noTrapsWorldGen || !this.placingTraps)) {
      // ③ FTW 反写：对当前显示串（可为蜜蜂文案/基串）逐 code unit 倒序——覆写②
      text = reverseUtf16Units(text);
    }
    this.header.setText(text);
    // 十周年 HotPink（UIHeader.DrawSelf :54-61：tenthAnniversary && !zenithWorld）
    this.header.textColor = f && f.tenthAnniversaryWorldGen && !f.zenithWorld ? HOT_PINK : rgb(255, 255, 255);
  }

  /** WorldGen.onWorldPartial 回调：挂上部分世界，开启实时预览（主线程 fallback 路径） */
  attachWorld(world: World) {
    if (this.preview) return;
    this.preview = new GenWorldPreview(world);
    this.append(this.preview);
    this.bar.crimson = !!world.crimson;
  }

  /** worker 路径的降采样预览帧（PreviewFrame）：位图模式直接上屏 */
  attachPreview(f: { width: number; height: number; rgba: Uint8ClampedArray }) {
    if (!this.preview) {
      this.preview = GenWorldPreview.fromFirstFrame(f.rgba, f.width, f.height);
      this.append(this.preview);
    } else if (this.preview instanceof GenWorldPreview) {
      this.preview.setPreviewFrame(f.rgba, f.width, f.height);
    }
  }

  update(): void {
    this.time += 1 / 60;
    // ★IIIII215b：drunk 乱码每帧重掷（原版 DrawSelf 每帧重算 Text）+ 提示条步进
    if (this.seedFlags) this.refreshHeaderText();
    this.updateTips();
    super.update();
  }

  // ---- 提示条（GameTipsDisplay.Update/Draw 1:1 压缩版；种子变换在绘制期） ----

  private updateTips(): void {
    this.tips = this.tips.filter((t) => this.time < t.spawnTime + TIP_DURATION);
    // 全员临期（IsExpiring：spawn+DURATION-1 起）即补新（GameTipsDisplay.Update :101-110）
    const allExpiring = this.tips.length > 0
      && this.tips.every((t) => this.time >= t.spawnTime + TIP_DURATION - 1);
    if (this.tips.length === 0 || allExpiring) this.addNewTip();
  }

  private addNewTip(): void {
    // GameTipsProvider.RollAvailableTip :25-51：Default+Keyboard 池去重上条；
    // 池空/键缺失 → textKey="UI.Back"（vanilla AddNewTip :185-193）——本仓池恒非空,
    // 退化路径=沿用旧条不炸。
    // ★IIIII221：text 已含 {InputTrigger_*} 全局替换（GameTip 构造器 :64
    // `_formattedText = _textKey.Value` 同构——替换在 randomFromCategory 出口
    // 一次落定,存进 GenTip 后不再变,与原版"构造期定格"等价;种子变换在绘制期）
    let text: string | null = null;
    const rng = () => (this.uiRand ? this.uiRand.nextDouble() : Math.random());
    const cats = tipCategories();   // ★IIIII229 ②：GamePad/Keyboard 池按设备接入切换
    for (let i = 0; i < 4 && text === null; i++) {
      const cat = cats[Math.floor(rng() * cats.length)];
      text = Lang.randomFromCategory(cat, rng) || null;
      if (text !== null && text === this.lastTipText) text = null;   // do-while 去重 _lastTip
    }
    if (text === null) return;
    this.lastTipText = text;
    this.tips.push({ text, spawnTime: this.time });
  }

  /** 提示条种子变换（GameTipsDisplay.Draw :142-152 else-if 链同序） */
  private tipDisplayText(tip: GenTip): string {
    const f = this.seedFlags;
    if (!f) return tip.text;
    if (f.vampireSeed) return Lang.text('Misc.Vampirism');
    if (f.getGoodWorldGen) return reverseUtf16Units(tip.text);
    if (f.drunkWorldGenText) {
      return this.uiRand ? drunkScrambleText(this.uiRand, 14) : tip.text;
    }
    return tip.text;
  }

  /** 提示条绘制（state 自绘层——vanilla 在 UIWorldLoad.DrawSelf :117-118 直画 Menu UI） */
  private drawTips(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    const f = this.seedFlags;
    const color: Color = f && f.tenthAnniversaryWorldGen && !f.zenithWorld ? HOT_PINK : rgb(255, 255, 255);
    const y = d.height + TIP_OFFSET_Y;                     // Draw :128
    for (const tip of this.tips) {
      const num = this.time - tip.spawnTime;
      // 锚点动画（GameTip.Update :69-84）：0..0.5s SmoothStep(2.5,0.5)；末 1s SmoothStep(0.5,-1.5)
      let anchorX: number;
      if (num < TIP_APPEAR) {
        anchorX = smoothStep(2.5, 0.5, num / TIP_APPEAR);
      } else if (num >= TIP_DURATION - 1) {
        anchorX = smoothStep(0.5, -1.5, (num - (TIP_DURATION - 1)) / 1);
      } else {
        anchorX = 0.5;
      }
      if (anchorX < -0.5 || anchorX > 1.5) continue;       // Draw :134-137 裁剪
      let text = this.tipDisplayText(tip);
      // 折行（CreateWrappedText :137-141）：先半屏宽,>2 行放宽到 1.5×-50
      const half = d.width / 2;
      text = wrapText(text, half);
      if (text.split('\n').length > 2) text = wrapText(text, half * 1.5 - 50);
      const scale = TIP_SCALE;
      const vecW = PixelText.measure(text) * scale;
      const lines = text.split('\n').length;
      const vecH = lines * 16 * scale;
      const drawScale = vecH > TIP_MAX_H ? TIP_MAX_H / vecH : 1;   // :156-159 高度超阈收縮
      const px = d.width * anchorX - vecW * 0.5;            // :161-162 中心锚定
      const py = y - vecH * 0.5;
      if (drawScale !== 1) {
        // 收縮形态罕见（超 5 行长提示）：逐行缩放绘制
        let ly = py;
        for (const line of text.split('\n')) {
          batch.drawString(line, px, ly, color, scale * drawScale);
          ly += 16 * scale * drawScale;
        }
      } else {
        batch.drawString(text, px, py, color, scale);
      }
    }
  }

  /** ★IIIII229（③ 215b 面板层叠让位,217 章层叠债）：tips 改在 children 之后绘制。
   *  UIElement.draw = drawSelf → drawChildren,JS 曾把 tips 挂在 drawSelf ⇒ 被后绘的
   *  GenWorldPreview（本仓特有实时地图预览,vAlign=1/marginBottom=56 底部居中）盖住
   *  SmartCursor 短条（LoadingTips_Keyboard.1）。vanilla GameTips.Draw 在
   *  UIWorldLoad.DrawSelf :117-118 尾部=该态最上层表现面（vanilla 无预览子元素,无
   *  遮挡面）;此处 z 序让位=super.draw（children）后再画 tips,与原版「tips 压底图」
   *  观感一致,面板与短条互不吞没。 */
  protected override drawSelf(_batch: UISpriteBatch): void {}

  public override draw(batch: UISpriteBatch): void {
    super.draw(batch);
    this.drawTips(batch);
  }

  /** 预览已挂载（测试用） */
  get hasPreview(): boolean { return this.preview != null; }
  /** 生成流音效计数观测面（探针：onActivate/onDeactivate 双 MenuOpen 实证） */
  get sfxCounts(): Record<string, number> { return UISfx.counts; }
}

/** SmoothStep（MathHelper.SmoothStep,GameTipsDisplay/GameTip.Update 消费） */
function smoothStep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return a + (b - a) * (x * x * (3 - 2 * x));
}

/** 贪心逐词折行（CreateWrappedText 近似——像素字体无复杂 shaping,\n 直接断） */
function wrapText(text: string, maxWidth: number): string {
  if (PixelText.measure(text) <= maxWidth) return text;
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    if (line && PixelText.measure(line + ch) > maxWidth) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
