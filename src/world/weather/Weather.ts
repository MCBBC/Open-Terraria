// 原版天气系统 1:1 移植（Terarria1456 Main.cs UpdateWeather/StartRain/StopRain/
// ChangeRain/updateCloudLayer + Sandstorm.cs 全量）。纯逻辑无 DOM——单测与双端共用。
// dayRate 语义：原版 Main.dayRate（正常游戏 =1），所有 tick 数按 60Hz 计。
// 注意 RNG 边界：原版 rand.Next(a,b) 左闭右开；本仓库 RNG.int(a,b) 闭区间 → 移植为 int(a, b-1)。
import { RNG } from '../../core/rng';

/** 天气更新所需的外部上下文（由 Game 每帧填充） */
export interface WeatherCtx {
  /** 时间流速（正常 1；我们时钟 30 分钟/日制不影响——tick 语义独立） */
  dayRate: number;
  /** 是否白天（原版 Main.dayTime） */
  dayTime: boolean;
  /** 玩家生命上限 ≥120（雨/风的强度门，NPC.cs:64362/58248） */
  playerStrongEnough: boolean;
  /** 地表开阔度 0-1（原版 atmo；玩家深度线性近似：worldSurface 以上 1 / rockLevel 以下 0） */
  atmo: number;
  /** 玩家在岩石层以上（闪电触发门，UpdateWeather L58202） */
  aboveRockLayer: boolean;
  /** 墓园视觉强度 0-1（墓园闪电，无此系统传 0） */
  graveyardIntensity: number;
  /** 困难模式（沙尘暴频率门） */
  hardMode: boolean;
  /** 雷声落点回调（thunderDelay 归零时；参数 = 与玩家的距离 px，已含方向由 Game 决定播放） */
  onThunder?: (distancePx: number) => void;
  /** 开始下雨（公告/toast；false=instant 切换不发） */
  onRainStart?: () => void;
  /** 沙尘暴开始/结束 */
  onSandstormToggle?: (happening: boolean) => void;
}

/** 原版风/暴雨判定阈值（Main.cs:66137-66140 MainCSS 构造区） */
export const WIND_MIN = 0.34;
export const WIND_MAX = 0.4;
export const RAIN_MIN = 0.4;
export const RAIN_MAX = 0.5;

export class WeatherState {
  /** 天气周期计数（到点落盘云量并重掷 3600-10800，UpdateWeather 尾段） */
  weatherCounter = 3600;
  raining = false;
  rainTime = 0;
  /** 目标雨强 0-1（ChangeRain 掷出） */
  maxRaining = 0;
  /** 当前云雨浓度（向 maxRaining 缓动；IsItRaining = cloudAlpha>0，Main.cs:2659） */
  cloudAlpha = 0;
  /** 阴天覆盖（updateCloudLayer：0→大正数衰减到 1→负数消散回 0） */
  cloudBGActive = 0;
  numClouds = 200;
  numCloudsTemp = this.numClouds;
  windSpeedTarget = 0;
  windSpeedCurrent = 0;
  windCounter = 0;
  extremeWindCounter = 0;
  /** 闪电白 0-1（天空背景色向白 lerp，Main.cs:63346） */
  lightning = 0;
  lightningSpeed = 0;
  lightningDecay = 0;
  thunderDelay = 0;
  thunderDistance = 0;
  /** 风日/暴雨 BGM 门（UpdateWindyDayState 12924） */
  shouldUseWindyDayMusic = false;
  shouldUseStormMusic = false;

  sandstorm = new SandstormState();
  /** RNG（可注入固定种子做单测） */
  private rng: RNG;

  constructor(seed?: number) {
    this.rng = new RNG(seed ?? ((Math.random() * 1e9) | 0));
    // 开局初值（Main.cs:10801-10802）
    this.windSpeedCurrent = this.rng.int(-800, 800) * 0.001;
    this.windSpeedTarget = this.windSpeedCurrent;
    this.numClouds = this.rng.int(0, 199);
    this.numCloudsTemp = this.numClouds;
    this.resetWindCounter(true);
    this.weatherCounter = this.rng.int(3600, 10799);
  }

  // ================= 原版公开操作（Main.cs:64107-64210） =================

  stopRain(instant = false) {
    this.rainTime = 0;
    this.raining = false;
    this.maxRaining = 0;
    if (instant) this.cloudAlpha = 0;
  }

  startRain(instant = false, strengthOverride?: number) {
    // 金币雨 1/25（运气修正省略——单机 RollLuck(25) 期望一致，概率照抄）
    const range = 25;
    if (this.rng.int(0, range - 1) === 0) {
      // 金币雨公告：Game 侧在 onRainStart 里读 coinRain 标志；原版数额与 maxTilesX 成比例
      this.coinRainPending = true;
    }
    const num2 = 86400;
    const num3 = num2 / 24; // 3600 = 1 游戏小时(tick)
    let num4 = this.rng.int(num3 * 8, num2 - 1);
    if (this.rng.int(0, 2) === 0) num4 += this.rng.int(0, num3 - 1);
    if (this.rng.int(0, 3) === 0) num4 += this.rng.int(0, num3 * 2 - 1);
    if (this.rng.int(0, 4) === 0) num4 += this.rng.int(0, num3 * 2 - 1);
    if (this.rng.int(0, 5) === 0) num4 += this.rng.int(0, num3 * 3 - 1);
    if (this.rng.int(0, 6) === 0) num4 += this.rng.int(0, num3 * 4 - 1);
    if (this.rng.int(0, 7) === 0) num4 += this.rng.int(0, num3 * 5 - 1);
    let num5 = 1;
    if (this.rng.int(0, 1) === 0) num5 += 0.05;
    if (this.rng.int(0, 2) === 0) num5 += 0.1;
    if (this.rng.int(0, 3) === 0) num5 += 0.15;
    if (this.rng.int(0, 4) === 0) num5 += 0.2;
    this.rainTime = Math.round(num4 * num5);
    this.changeRain(instant, strengthOverride);
    this.raining = true;
  }

  /** 按云量/阴天状态掷目标雨强（Main.cs:64201 ChangeRain） */
  changeRain(instant = false, strengthOverride?: number) {
    let val: number;
    if (strengthOverride !== undefined) {
      val = strengthOverride;
    } else if (this.cloudBGActive >= 1 || this.numClouds > 150) {
      val = this.rng.int(0, 2) !== 0 ? this.rng.int(40, 90) * 0.01 : this.rng.int(20, 90) * 0.01;
    } else if (this.numClouds > 100) {
      val = this.rng.int(0, 2) !== 0 ? this.rng.int(20, 60) * 0.01 : this.rng.int(10, 70) * 0.01;
    } else {
      val = this.rng.int(0, 2) !== 0 ? this.rng.int(5, 30) * 0.01 : this.rng.int(5, 40) * 0.01;
    }
    this.maxRaining = val;
    if (instant) this.cloudAlpha = this.maxRaining;
  }

  /** 金币雨公告待处理标志（StartRain 1/25；Game 消费后清零） */
  coinRainPending = false;

  // ================= 每帧主更新（UpdateWeather L58124 + updateCloudLayer + 17142 段） =================

  /** 每 tick 调用（60Hz；暂停/菜单不调） */
  update(ctx: WeatherCtx) {
    this.updateLightningTimers(ctx);
    this.updateWind(ctx);
    this.updateCloudAlpha(ctx);
    this.updateCloudBG();
    this.updateCloudCounts();
    this.updateRainSchedule(ctx);
    this.updateMusicGates();
    this.sandstorm.update(ctx, this.rng, this.windSpeedCurrent);
  }

  /** 闪电计时（UpdateWeather L58129-58170） */
  private updateLightningTimers(ctx: WeatherCtx) {
    if (this.thunderDelay > 0) {
      this.thunderDelay--;
      if (this.thunderDelay === 0) {
        ctx.onThunder?.(this.thunderDistance * 15);
      }
    }
    if (this.lightningSpeed > 0) {
      this.lightning += this.lightningSpeed;
      if (this.lightning >= 1) { this.lightning = 1; this.lightningSpeed = 0; }
    } else if (this.lightning > 0) {
      this.lightning -= this.lightningDecay;
      if (this.lightning < 0) this.lightning = 0;
    } else if (this.thunderDelay <= 0 && ctx.aboveRockLayer && ctx.atmo === 1) {
      // 触发门：暴雨或强墓园（L58202-58213）
      if (this.shouldUseStormMusic) {
        let num3 = 600, num4 = 1600;
        if (this.maxRaining > 0.8) { num3 *= 0.6; num4 *= 0.8; }
        if (this.maxRaining > 0.7) { num3 *= 0.7; num4 *= 0.9; }
        if (this.maxRaining > 0.6) { num3 *= 0.8; num4 *= 0.95; }
        const w = Math.abs(this.windSpeedTarget);
        if (w > 0.7) { num3 *= 0.6; num4 *= 0.8; }
        if (w > 0.6) { num3 *= 0.7; num4 *= 0.9; }
        if (w > 0.5) { num3 *= 0.8; num4 *= 0.95; }
        let num5 = this.rng.int(Math.round(num3), Math.round(num4));
        num5 *= (1 - this.maxRaining + 1) / 2;
        num5 *= (1 - this.windSpeedTarget + 1) / 2;
        if (this.rng.int(0, Math.max(1, Math.round(num5)) - 1) === 0) this.newLightning();
      } else if (ctx.graveyardIntensity >= 0.9) {
        if (this.rng.int(0, 119) === 0) this.newLightning();
      }
    }
  }

  /** NewLightning（Main.cs:58095-58120） */
  newLightning(instant = false) {
    if (this.rng.int(0, 2) === 0) this.thunderDelay = this.rng.int(1, 30);
    else if (this.rng.int(0, 1) === 0) this.thunderDelay = this.rng.int(31, 120);
    else this.thunderDelay = this.rng.int(11, 60);
    this.thunderDistance = this.thunderDelay;
    this.lightningDecay = this.rng.range(0, 0.05) + 0.008;
    this.lightningSpeed = this.rng.range(0, 0.05) + 0.05;
    if (instant) {
      this.lightningSpeed = 0.2;
      this.thunderDelay = 1;
      this.thunderDistance = 0;
    }
  }

  /** 风场（UpdateWeather L58219-58347） */
  private updateWind(ctx: WeatherCtx) {
    // current 向 target×(1+5/9×maxRaining) 逼近（L58221-58237）
    const target = this.windSpeedTarget * (1 + 5 / 9 * this.maxRaining);
    const step = 0.0003 + Math.abs(target - this.windSpeedCurrent) * 0.0015;
    if (this.windSpeedCurrent < target) {
      this.windSpeedCurrent += step;
      if (this.windSpeedCurrent > target) this.windSpeedCurrent = target;
    } else if (this.windSpeedCurrent > target) {
      this.windSpeedCurrent -= step;
      if (this.windSpeedCurrent < target) this.windSpeedCurrent = target;
    }
    // windCounter 掷 target 增量（L58252-58295）
    this.windCounter--;
    if (this.windCounter <= 0) {
      const prevSign = this.windSpeedTarget < 0 ? -1 : 1;
      const r = this.rng.int(0, 3);
      if (r === 0) this.windSpeedTarget += this.rng.int(-25, 25) * 0.001;
      else if (r === 1 || r === 2) this.windSpeedTarget += this.rng.int(-50, 50) * 0.001;
      else this.windSpeedTarget += this.rng.int(-100, 100) * 0.001;
      if (!ctx.playerStrongEnough && Math.abs(this.windSpeedTarget) > 0.35) {
        this.windSpeedTarget = 0.35 * Math.sign(this.windSpeedTarget);
      }
      this.extremeWindCounter--;
      if (this.extremeWindCounter <= 0) {
        this.resetWindCounter(true);
        if (this.rng.int(0, 29) < 13) {
          if (this.rng.int(0, 1) === 0) {
            this.windSpeedTarget = 0;
            this.windCounter = this.rng.int(7200, 28800);
          } else {
            this.windSpeedTarget = this.rng.int(-200, 200) * 0.001;
          }
        } else if (this.rng.int(0, 19) < 13) {
          this.windSpeedTarget = this.rng.int(-400, 400) * 0.001;
        } else {
          this.windSpeedTarget = this.rng.int(-850, 850) * 0.001;
        }
        if (!ctx.playerStrongEnough && Math.abs(this.windSpeedTarget) > 0.35) {
          this.windSpeedTarget = 0.35 * Math.sign(this.windSpeedTarget);
        }
        if (Math.abs(this.windSpeedTarget) > 0.3) this.extremeWindCounter += this.rng.int(5, 10);
        if (Math.abs(this.windSpeedTarget) > 0.5) this.extremeWindCounter += this.rng.int(10, 20);
        if (Math.abs(this.windSpeedTarget) > 0.7) this.extremeWindCounter += this.rng.int(15, 30);
      } else {
        this.resetWindCounter();
      }
      // 反向 2/3 概率翻回（L58336-58339）
      if (this.rng.int(0, 2) !== 0 && ((prevSign < 0 && this.windSpeedTarget > 0) || (prevSign > 0 && this.windSpeedTarget < 0))) {
        this.windSpeedTarget *= -1;
      }
    }
    if (this.windSpeedTarget > 0.8) this.windSpeedTarget = 0.8;
    if (this.windSpeedTarget < -0.8) this.windSpeedTarget = -0.8;
  }

  /** ResetWindCounter（Main.cs:58085-58093） */
  resetWindCounter(resetExtreme = false) {
    this.windCounter = this.rng.int(900, 2700);
    if (resetExtreme) this.extremeWindCounter = this.rng.int(10, 30);
  }

  /** cloudAlpha 缓动（Main.cs:17142-17168，每帧；menuX20 系数我们无菜单场景=不用） */
  private updateCloudAlpha(ctx: WeatherCtx) {
    const step = 0.0005 * Math.max(1, ctx.dayRate);
    if (this.raining) {
      if (this.cloudAlpha > this.maxRaining) {
        this.cloudAlpha -= step;
        if (this.cloudAlpha < this.maxRaining) this.cloudAlpha = this.maxRaining;
      } else if (this.cloudAlpha < this.maxRaining) {
        this.cloudAlpha += step;
        if (this.cloudAlpha > this.maxRaining) this.cloudAlpha = this.maxRaining;
      }
    } else {
      this.cloudAlpha -= step;
      if (this.cloudAlpha < 0) this.cloudAlpha = 0;
    }
  }

  /** updateCloudLayer（Main.cs:13112-13166） */
  private updateCloudBG() {
    const num = 86400;
    const num2 = num / 24;
    const num3 = Math.max(1, 1 + 4 * this.cloudAlpha);
    if (this.cloudBGActive > 0) {
      if (this.cloudBGActive > 1) this.cloudBGActive -= 1 / num3;
      if (this.cloudBGActive < 1) this.cloudBGActive = 1;
      if (this.cloudBGActive === 1 && this.rng.int(0, Math.round((num2 * 2) * num3) - 1) === 0) {
        this.cloudBGActive = -this.rng.int(num2 * 4, num * 4 - 1);
      }
      return;
    }
    if (this.cloudBGActive < 0) {
      this.cloudBGActive += num3;
      if (this.raining) this.cloudBGActive += 2 * num3;
    }
    if (this.cloudBGActive > 0) this.cloudBGActive = 0;
    if (this.cloudBGActive === 0 && this.rng.int(0, Math.round(num2 * 12 / num3) - 1) === 0) {
      this.cloudBGActive = this.rng.int(num2 * 3, num * 2 - 1);
    } else if (this.shouldUseStormMusic) {
      this.cloudBGActive = this.rng.int(num2, num2 * 4 - 1);
    }
  }

  /** 云量漂移 + 天气周期落盘（UpdateWeather L58341-58403） */
  private updateCloudCounts() {
    if (this.rng.int(0, 59) === 0) this.numCloudsTemp += this.rng.int(-1, 1);
    if (this.rng.int(0, 999) < 50 * this.cloudBGAlpha) this.numCloudsTemp++;
    if (this.rng.int(0, 1299) < 25 * (1 - this.cloudBGAlpha)) this.numCloudsTemp--;
    if (this.rng.int(0, 999) < 200 * this.cloudAlpha && this.numCloudsTemp < 100) this.numCloudsTemp++;
    if (this.rng.int(0, 999) < 50 * this.cloudAlpha) this.numCloudsTemp++;
    if (this.numCloudsTemp > 66 && this.rng.int(0, 99) === 0) this.numCloudsTemp -= this.rng.int(1, 2);
    if (this.numCloudsTemp < 50 && this.rng.int(0, 99) === 0) this.numCloudsTemp += this.rng.int(1, 2);
    if (this.cloudBGActive <= 0 && this.numCloudsTemp > 100 && this.cloudAlpha === 0) this.numCloudsTemp = 100;
    if (this.numCloudsTemp < -20) this.numCloudsTemp = -20;
    // 下雨时云量强制爬升（L58390-58398）
    if (this.cloudAlpha > 0 && this.numClouds < 200 * this.cloudAlpha) {
      while (this.numClouds < 200 * this.cloudAlpha) {
        this.numClouds += this.rng.int(0, 29);
        if (this.numClouds > 200) this.numClouds = 200;
        if (this.numCloudsTemp < this.numClouds) this.numCloudsTemp = this.numClouds;
      }
    }
    this.weatherCounter--;
    if (this.weatherCounter <= 0) {
      if (this.rng.int(0, 1) === 0) {
        if (this.rng.int(0, 1) === 0) this.numCloudsTemp += this.rng.int(0, 249);
        else this.numCloudsTemp += this.rng.int(0, 99);
      }
      if (this.numCloudsTemp < 0) this.numCloudsTemp = 0;
      if (this.numCloudsTemp > 200) this.numCloudsTemp = 200;
      this.numClouds = this.numCloudsTemp;
      this.weatherCounter = this.rng.int(3600, 10799);
    }
  }

  /** 雨调度（UpdateTime 段 Main.cs:64327-64390） */
  private updateRainSchedule(ctx: WeatherCtx) {
    if (this.raining) {
      this.rainTime -= ctx.dayRate;
      if (ctx.dayRate > 0) {
        const num = Math.floor(86400 / ctx.dayRate / 24); // 3600
        if (this.rainTime <= 0) {
          this.stopRain();
        } else if (this.rng.int(0, num * 2 - 1) === 0) {
          this.changeRain();
        }
      }
    } else {
      const num2 = Math.floor(86400 / Math.max(1, ctx.dayRate));
      let canStart = ctx.dayRate !== 0 && ctx.playerStrongEnough;
      if (canStart) {
        if (this.rng.int(0, Math.round(num2 * 5.75) - 1) === 0) this.tryStartRain(ctx);
        else if (this.cloudBGActive >= 1 && this.rng.int(0, Math.round(num2 * 4.25) - 1) === 0) this.tryStartRain(ctx);
      }
    }
  }

  private tryStartRain(ctx: WeatherCtx) {
    this.startRain();
    ctx.onRainStart?.();
  }

  /** UpdateWindyDayState（Main.cs:12924-12961）：BGM 门。time = 原版白天 tick 窗口 10800-43200 */
  updateMusicGates(timeOfDay01 = 0.5) {
    // 原版 time∈(10800,43200) = 我们 timeOfDay∈(0.2,0.8) 白天中段
    const midDay = timeOfDay01 > 0.2 && timeOfDay01 < 0.8;
    if (this.cloudAlpha === 0) {
      this.shouldUseStormMusic = false;
      const w = Math.abs(this.windSpeedTarget);
      if (!midDay) {
        this.shouldUseWindyDayMusic = false;
      } else if (w < WIND_MIN) {
        this.shouldUseWindyDayMusic = false;
      } else if (w >= WIND_MAX) {
        this.shouldUseWindyDayMusic = true;
      }
    } else {
      if (this.cloudAlpha < RAIN_MIN || Math.abs(this.windSpeedTarget) < WIND_MIN) {
        this.shouldUseStormMusic = false;
      } else if (this.cloudAlpha >= RAIN_MAX && Math.abs(this.windSpeedTarget) >= WIND_MAX) {
        this.shouldUseStormMusic = true;
      }
      this.shouldUseWindyDayMusic = false;
    }
  }

  /** UI 天气词（Main.cs:46236 八档链） */
  statusText(): string {
    if (this.shouldUseStormMusic) return 'Storm';
    if (this.maxRaining > 0.6) return 'HeavyRain';
    if (this.maxRaining >= 0.2) return 'Rain';
    if (this.maxRaining > 0) return 'LightRain';
    if (this.cloudBGActive > 0) return 'Overcast';
    if (this.numClouds > 90) return 'MostlyCloudy';
    if (this.numClouds > 55) return 'Cloudy';
    if (this.numClouds <= 15) return 'Clear';
    return 'PartlyCloudy';
  }
}

/** 沙尘暴（Sandstorm.cs 全量） */
export class SandstormState {
  happening = false;
  timeLeft = 0;
  severity = 0;
  intendedSeverity = 0;

  update(ctx: WeatherCtx, rng: RNG, windSpeedCurrent: number) {
    if (this.happening) {
      if (this.timeLeft > 86400) this.timeLeft = 0;
      this.timeLeft -= ctx.dayRate;
      // HasSufficientWind（Sandstorm.cs:22）：|windSpeedCurrent|≥0.6；风停立即结束
      if (Math.abs(windSpeedCurrent) < 0.6) this.timeLeft -= 15 * ctx.dayRate;
      if (windSpeedCurrent === 0) this.timeLeft = 0;
      if (this.timeLeft <= 0) this.stop(rng, ctx);
    } else {
      // 频率门（Sandstorm.cs:53-63）：21600×(困难 2:3)，需风足够
      if (Math.abs(windSpeedCurrent) >= 0.6) {
        const num = 21600 * (ctx.hardMode ? 2 : 3);
        for (let i = 0; i < Math.max(1, ctx.dayRate); i++) {
          if (rng.int(0, num - 1) === 0) {
            this.start(rng);
            ctx.onSandstormToggle?.(true);
          }
        }
      }
    }
    if (rng.int(0, 17999) === 0) this.changeSeverityIntentions(rng, this.happening);
    this.updateSeverity();
  }

  start(rng: RNG) {
    this.happening = true;
    this.timeLeft = rng.int(28800, 86400);
    this.changeSeverityIntentions(rng, true);
  }

  stop(rng: RNG, ctx: WeatherCtx) {
    this.happening = false;
    this.timeLeft = 0;
    this.changeSeverityIntentions(rng, false);
    ctx.onSandstormToggle?.(false);
  }

  /** ChangeSeverityIntentions（Sandstorm.cs:99-112） */
  changeSeverityIntentions(rng: RNG, happening: boolean) {
    if (happening) {
      this.intendedSeverity = 0.4 + rng.next();
    } else if (rng.int(0, 2) === 0) {
      this.intendedSeverity = 0;
    } else {
      this.intendedSeverity = rng.next() * 0.3;
    }
  }

  /** UpdateSeverity（Sandstorm.cs:115-130）：0.003/tick 向意图逼近 */
  updateSeverity() {
    if (Number.isNaN(this.severity)) this.severity = 0;
    if (Number.isNaN(this.intendedSeverity)) this.intendedSeverity = 0;
    const dir = Math.sign(this.intendedSeverity - this.severity);
    this.severity = Math.min(1, Math.max(0, this.severity + 0.003 * dir));
    const dir2 = Math.sign(this.intendedSeverity - this.severity);
    if (dir !== dir2) this.severity = this.intendedSeverity;
  }
}
