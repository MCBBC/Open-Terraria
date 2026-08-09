// 原版 BGM 系统（LegacyAudioSystem.cs 交叉淡化语义 1:1）：
// BGM 池按 MusicID 懒建 <audio loop>（audios/music/Music_<id>.ogg，tools/xwb-extract.mjs
// 从原版 XACT Wave Bank 提取），musicFade[id] ±0.005/帧 逼近目标曲（:281 UpdateCommonTrack /
// :309 UpdateCommonTrackTowardStopping，60fps ≈ 3.3s 完成淡入）。
// Maples main/title.mp3 已弃用：标题页用原版 Title(JourneysBeginningWithIntro=50)，
// 游戏内曲目由 Music.pickMusic 按环境选择链驱动。
import { MUSIC } from '../data/Music';

const TITLE_ID = MUSIC.TitleIntro; // 50

interface Track {
  el: HTMLAudioElement;
  fade: number;   // 0..1（≈原版 Main.musicFade[id]）
}

export class AudioSystem {
  private pool = new Map<number, Track>();
  /** 目标曲目（≈原版 Main.curMusic；0 = 静音） */
  curMusic = 0;
  muted = false;
  /** 音乐音量 0..1（options.musicVol，M6 设置页） */
  volume = 0.35;
  private rafId = 0;
  private lastTs = 0;

  constructor() {
    this.startLoop();
  }

  private track(id: number): Track {
    let t = this.pool.get(id);
    if (!t) {
      const el = new Audio(`audios/music/Music_${id}.mp3`);
      el.loop = true;
      el.volume = 0;
      t = { el, fade: 0 };
      this.pool.set(id, t);
    }
    return t;
  }

  /** rAF 驱动淡化（原版按游戏帧 ±0.005，这里按 60fps 归一时间步进） */
  private startLoop() {
    if (this.rafId) return;
    const step = (ts: number) => {
      const dt = this.lastTs ? Math.min(100, ts - this.lastTs) : 16.7;
      this.lastTs = ts;
      const frames = dt / (1000 / 60);
      this.tickFade(frames * 0.005);
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** 步进淡化量 d（0.005/帧）：目标曲 fade+=d 至 1，其余 -=d 至 0 并停播 */
  private tickFade(d: number) {
    if (this.muted) {
      for (const t of this.pool.values()) {
        if (t.fade > 0) { t.fade = 0; t.el.volume = 0; t.el.pause(); }
      }
      return;
    }
    for (const [id, t] of this.pool) {
      const target = id === this.curMusic ? 1 : 0;
      if (t.fade < target) {
        t.fade = Math.min(target, t.fade + d);
        if (t.el.paused) t.el.play().catch(() => { /* 手势前播放被拒，淡入重试 */ });
      } else if (t.fade > target) {
        t.fade = Math.max(target, t.fade - d);
        if (t.fade === 0) { t.el.pause(); continue; }
      }
      t.el.volume = Math.min(1, t.fade) * this.volume;
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /** 切换目标曲目（≈原版 curMusic 赋值；实际音量由淡化循环渐变） */
  playMusic(id: number) {
    if (this.muted) return;
    if (this.curMusic === id) return;
    this.curMusic = id;
    if (id !== 0) this.track(id); // 预建元素开始缓冲
  }

  /** 兼容旧调用：'title' = 原版标题曲；'main' = 交由环境选曲接管（此处仅解除标题曲） */
  play(which: 'title' | 'main') {
    if (this.muted) return;
    if (which === 'title') this.playMusic(TITLE_ID);
    else if (this.curMusic === TITLE_ID) this.playMusic(0);
  }

  /** 旧昼夜变奏钩子：曲目切换已由选曲链接管（昼/夜曲不同 id），无操作 */
  setDayNight(_isDay: boolean) { /* no-op */ }

  stop() {
    this.curMusic = 0;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) this.stop();
    return this.muted;
  }
}
