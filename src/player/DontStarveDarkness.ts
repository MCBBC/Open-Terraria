import { Lang } from '../i18n/Lang';

// DontStarveDarkness.ts — The Constant ("the constant"/"eye4aneye" 种子) 黑暗伤害系统
// 1:1 移植自 vanilla Terraria.GameContent/DontStarveDarknessDamageDealer.cs（1457 全文）。
// 消费门 = Player.Update :24550-24552 `if (i == Main.myPlayer && Main.dontStarveWorld)
//   DontStarveDarknessDamageDealer.Update(this);`——仅本地玩家、仅 constant 世界；
// Main.dontStarveWorld 由 seedFlags.theConstant 投影（Player fixedUpdate 饥饿链同源注入）。
//
// 原版语义备忘：
//   • Update 每帧首段三重早退：player.dead / !FocusHelper.AllowDontStarveDarknessDamage /
//     player.shimmering / Main.disableDontStarveDarknessDamage → ResetTimer()
//     （FocusHelper.cs:127 AllowDontStarveDarknessDamage = IsSelectedApplication，即窗口
//      焦点；SW 对应 game.focusLost 门。disableDontStarveDarknessDamage = 镜头追踪面
//      （Main.cs:63655/63660 GetObjectTrackingCameraPan / GetPlayerControlledCameraPan
//      活动时置位）——SW 无该两路镜头态,恒 false；死亡观战 spectating 路径以 !dead 门兜住）
//   • IsPlayerSafe(:66-68) = Lighting.GetColor(玩家中心格).ToVector3().Length() >= 0.1f
//     ——注意 Length 是 RGB 模长（0..√3），0.1 ≈ 各通道均值 ~5.7% 亮度
//   • 不安全时 darknessTimer++；≥60t 且未提示过 → Game.DarknessDanger 文案（红）一次
//   • ≥120t 后每 >60 计数一击（darknessHitTimer>60 → 250 伤 + SoundID.Item1 + 归零），
//     免疫帧内不计击（!player.immune 门,vanilla 判 immune=immuneTime>0 族标记）
//   • 安全恢复瞬间且刚提示过 → Game.DarknessSafe 文案（绿）+ ResetTimer
//   • getGoodWorld 组合【静默】两个文案（vanilla `if (!Main.getGoodWorld)` 双守卫）
//   • 致死文案 = PlayerDeathReason.ByOther(17) DeathText.DiedInTheDark

const DARKNESS_TIME_BEFORE_HITS = 120;
const DARKNESS_TIME_FOR_MESSAGE = 60;
const DARKNESS_DAMAGE_PER_HIT = 250;

export interface DarknessCtx {
  /** 光照模长（RGB Vector3.Length）：vanilla Lighting.GetColor→ToVector3().Length() */
  lightLengthAtPlayerCenter(): number;
  /** 玩家是否死亡（dealer 早退并 ResetTimer） */
  isDead(): boolean;
  /** 是否处于微光化（shimmering dealer 早退） */
  isShimmering(): boolean;
  /** 游戏窗口无焦点（FocusHelper.AllowDontStarveDarknessDamage=false 支）/暂停 */
  outOfFocusOrPaused(): boolean;
  /** getGoodWorld 组合静默文案 */
  silentMessages(): boolean;
  /** 控制台左下消息（Main.NewText）；rgb 同 vanilla 调用色 */
  showText(text: string, r: number, g: number, b: number): void;
  /** SoundEngine.PlaySound(SoundID.Item1)（玩家中心即全程音量最大,Sfx 内建衰减按声源位传玩家坐标） */
  playHitSound(): void;
  /** player.Hurt(ByOther(17),250,0)；返回是否实际落伤（免疫帧期原版不计击后仍归零） */
  hurtByDarkness(damage: number): boolean;
}

/** 单实例状态（vanilla 为静态字段；SW 本地玩家单例,寄生于 Game 实例化模块对象） */
export class DontStarveDarkness {
  private darknessTimer = -1;
  private darknessHitTimer = 0;
  private saidMessage = false;
  private lastFrameWasTooBright = true;

  static readonly SAFE_LIGHT_LENGTH = 0.1;

  reset(): void {
    this.resetTimer();
    this.saidMessage = false;
    this.lastFrameWasTooBright = true;
  }

  private resetTimer(): void {
    this.darknessTimer = -1;
    this.darknessHitTimer = 0;
  }

  update(ctx: DarknessCtx): void {
    if (ctx.isDead() || ctx.outOfFocusOrPaused() || ctx.isShimmering()) {
      this.reset();
      return;
    }
    this.updateDarknessState(ctx);
    if (this.darknessTimer >= DARKNESS_TIME_BEFORE_HITS) {
      // vanilla 钳在 120（`darknessTimer = darknessTimeBeforeStartingHits`）
      this.darknessTimer = DARKNESS_TIME_BEFORE_HITS;
      this.darknessHitTimer++;
      if (this.darknessHitTimer > 60) {
        ctx.playHitSound();
        ctx.hurtByDarkness(DARKNESS_DAMAGE_PER_HIT);
        this.darknessHitTimer = 0;
      }
    }
  }

  private updateDarknessState(ctx: DarknessCtx): void {
    if (this.isPlayerSafe(ctx)) {
      if (this.saidMessage) {
        if (!ctx.silentMessages()) {
          ctx.showText(LANG_DARKNESS_SAFE(), 50, 200, 50);
        }
        this.saidMessage = false;
      }
      this.resetTimer();
      return;
    }
    if (this.darknessTimer >= DARKNESS_TIME_FOR_MESSAGE && !this.saidMessage) {
      if (!ctx.silentMessages()) {
        ctx.showText(LANG_DARKNESS_DANGER(), 200, 50, 50);
      }
      this.saidMessage = true;
    }
    this.lastFrameWasTooBright = false;   // vanilla 维护字段,当前树无读者
    this.darknessTimer++;
  }

  private isPlayerSafe(ctx: DarknessCtx): boolean {
    return ctx.lightLengthAtPlayerCenter() >= DontStarveDarkness.SAFE_LIGHT_LENGTH;
  }

  /* ---- 测试注入口（vitest 直驱状态机,vanilla 静字段语义等价） ---- */
  _debugState(): { timer: number; hitTimer: number; said: boolean } {
    return { timer: this.darknessTimer, hitTimer: this.darknessHitTimer, said: this.saidMessage };
  }
}

function LANG_DARKNESS_DANGER(): string { return Lang.text('Game.DarknessDanger'); }
function LANG_DARKNESS_SAFE(): string { return Lang.text('Game.DarknessSafe'); }
