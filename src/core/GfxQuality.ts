// 原版自动画质系统 gfxQuality(Main.cs:16908-16933)1:1 移植(2026-08-18)。
//
// 调速器:每秒一评(采样窗 = 该秒实际【渲染】帧数,跳帧时自然下降——
// 原版 fpsCount 计 Draw 调用同语义):
//   fps ≥ 30 + 30q → q += rate,rate += 0.005(缓升,恢复越顺利升越快)
//   fps < 29 + 30q → rate = 0.01,q -= 0.1(骤降,一次让出 10% 装饰预算)
//   29~30+30q 之间 → 保持(双阈值 = ~1fps 滞回带,防贴边抖动)
//   q 钳 [0,1]。
//
// 消费点(与原版同款):
//   · 瀑布:qualityMax = 1000×q / waterfallDist = 75×q + 25(WaterfallManager.cs:116-117)
//   · 雨池帽 ×(1+q)/2(Rain.cs:142 NewRainForced / :179 NewRain)——★SW-BJ26 2026-09-07
//     勘误:MakeRain 生成尝试【无】画质门(Rain.cs:43-91 循环体无 rand(100)),:123 的
//     rand(100)<q×100 是溅花尘概率(Rain.Update 死亡支,WeatherRenderer.update 消费);
//     曾误挂"每滴尝试掷门"→ q<0.9 雨密度双重削减(低于原版),已删
//   · 雪尘密度:num4×(q/2 + 0.5) + num4×0.1(Main.cs:12993)
//   · 小地图更新节流:mapTimeMax = (1-q)×60ms(:16941-16945,q≥0.8 恒 0)
// (qaStyle 1/2/3 手动钉 1/0.5/0 档暂缓——待波浪代理落地后随设置一起)
export const gfxQuality = {
  value: 1,
  rate: 0.005,
  /** 本秒渲染帧计数(Game.render 实际执行时 +1;跳帧不计——原版 Draw 计数语义) */
  drawsThisSecond: 0,
  _windowStart: 0,
  get(): number { return this.value; },
  tick(nowMs: number): void {
    if (!this._windowStart) { this._windowStart = nowMs; return; }
    const elapsed = nowMs - this._windowStart;
    if (elapsed < 1000) return;
    this._windowStart = nowMs;
    const fps = (this.drawsThisSecond * 1000) / elapsed;   // 实测窗口可能略长于 1s
    this.drawsThisSecond = 0;
    if (fps >= 30 + 30 * this.value) {
      this.value += this.rate;
      this.rate += 0.005;
    } else if (fps < 29 + 30 * this.value) {
      this.rate = 0.01;
      this.value -= 0.1;
    }
    if (this.value < 0) this.value = 0;
    if (this.value > 1) this.value = 1;
  },
  /** 仅供探针/测试复位 */
  reset(): void { this.value = 1; this.rate = 0.005; this.drawsThisSecond = 0; this._windowStart = 0; },
} as {
  value: number; rate: number; drawsThisSecond: number; _windowStart: number;
  get(): number; tick(nowMs: number): void; reset(): void;
};

/** 小地图更新最小间隔 ms(mapTimeMax 语义,:16941-16945) */
export function mapUpdateMinIntervalMs(): number {
  return gfxQuality.value < 0.8 ? (1 - gfxQuality.value) * 60 : 0;
}
