// 音频系统：BGM（标题曲/主曲）循环播放 + 音量/静音开关
// 音乐来自 Terraia_Maples 项目资源
export class AudioSystem {
  private current: HTMLAudioElement | null = null;
  private title: HTMLAudioElement;
  private main: HTMLAudioElement;
  muted = false;
  /** 主音量 0..1（M6 设置页） */
  volume = 0.35;
  private night = false;

  constructor() {
    this.title = new Audio('audios/title.mp3');
    this.main = new Audio('audios/main.mp3');
    for (const a of [this.title, this.main]) {
      a.loop = true;
      a.volume = this.volume;
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  private applyVolume() {
    // 夜晚变奏保持相对更低音量（0.2/0.35 ≈ 0.57 倍）
    const base = this.night ? this.volume * 0.57 : this.volume;
    this.main.volume = base;
    this.title.volume = this.volume;
  }

  play(which: 'title' | 'main') {
    if (this.muted) return;
    const next = which === 'title' ? this.title : this.main;
    if (this.current === next) return;
    this.current?.pause();
    this.current = next;
    next.currentTime = 0;
    this.applyVolume();
    next.play().catch(() => { /* 浏览器需用户交互后才能播放，忽略 */ });
  }

  /** 昼夜 BGM 变奏：白天正常速度，夜晚放慢+降调+减音量 */
  setDayNight(isDay: boolean) {
    if (this.muted) return;
    this.night = !isDay;
    this.main.playbackRate = isDay ? 1 : 0.88;
    this.applyVolume();
  }

  stop() {
    this.current?.pause();
    this.current = null;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) this.stop();
    return this.muted;
  }
}
