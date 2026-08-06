// 音频系统：BGM（标题曲/主曲）循环播放 + 静音开关
// 音乐来自 Terraia_Maples 项目资源
export class AudioSystem {
  private current: HTMLAudioElement | null = null;
  private title: HTMLAudioElement;
  private main: HTMLAudioElement;
  muted = false;

  constructor() {
    this.title = new Audio('audios/title.mp3');
    this.main = new Audio('audios/main.mp3');
    for (const a of [this.title, this.main]) {
      a.loop = true;
      a.volume = 0.35;
    }
  }

  play(which: 'title' | 'main') {
    if (this.muted) return;
    const next = which === 'title' ? this.title : this.main;
    if (this.current === next) return;
    this.current?.pause();
    this.current = next;
    next.currentTime = 0;
    next.play().catch(() => { /* 浏览器需用户交互后才能播放，忽略 */ });
  }

  /** 昼夜 BGM 变奏：白天正常速度，夜晚放慢+降调+减音量 */
  setDayNight(isDay: boolean) {
    if (this.muted) return;
    if (isDay) {
      this.main.playbackRate = 1;
      this.main.volume = 0.35;
    } else {
      this.main.playbackRate = 0.88;
      this.main.volume = 0.2;
    }
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
