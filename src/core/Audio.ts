// 原版 BGM 系统（LegacyAudioSystem.cs 交叉淡化语义 1:1）：
// WebAudio AudioBufferSourceNode 无缝循环（loop=true，解码后内存播放，零接缝）——
// 修复 <audio loop> 播 mp3 的循环点卡顿 + 切曲冷启动顿挫（原版 XACT 同为解码循环）。
// musicFade[id] ±0.005/帧 逼近目标曲（:281 UpdateCommonTrack / :309 TowardStopping）。
// audios/music/Music_<id>.mp3（tools/xwb-extract.mjs 提取）。
import { MUSIC } from '../data/Music';

const TITLE_ID = MUSIC.TitleIntro; // 50

interface Track {
  src: AudioBufferSourceNode;
  gain: GainNode;
  fade: number;   // 0..1（≈原版 Main.musicFade[id]）
}

export class AudioSystem {
  private ac: AudioContext | null = null;
  private pool = new Map<number, Track>();
  private buffers = new Map<number, AudioBuffer>();
  private decoding = new Set<number>();
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

  private audio(): AudioContext | null {
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ac = new AC();
    }
    if (this.ac.state === 'suspended') this.ac.resume().catch(() => { /* 手势前恢复被拒，播放时重试 */ });
    return this.ac;
  }

  /** 解码缓存（每曲一次；解码失败标记 null 防重复请求） */
  private async buffer(id: number): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(id);
    if (hit !== undefined) return hit;
    if (this.decoding.has(id)) return null; // 解码中：本帧跳过，就绪后 track() 会补建
    this.decoding.add(id);
    try {
      const r = await fetch(`audios/music/Music_${id}.mp3`);
      if (!r.ok) throw new Error(String(r.status));
      const buf = await this.ac!.decodeAudioData(await r.arrayBuffer());
      this.buffers.set(id, buf);
      return buf;
    } catch {
      this.buffers.set(id, null as unknown as AudioBuffer); // 永久失败标记
      return null;
    } finally {
      this.decoding.delete(id);
    }
  }

  /** 建立播放源（目标曲就绪后调用；重复调用幂等） */
  private track(id: number) {
    const ac = this.audio();
    if (!ac) return;
    if (this.pool.has(id)) return;
    const buf = this.buffers.get(id);
    if (!buf) return; // 未就绪：ensureTrack 的解码回调里补建
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(ac.destination);
    src.start();
    this.pool.set(id, { src, gain, fade: 0 });
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
      for (const [id, t] of this.pool) {
        if (t.fade > 0) { t.fade = 0; t.gain.gain.value = 0; }
      }
      return;
    }
    for (const [id, t] of this.pool) {
      const target = id === this.curMusic ? 1 : 0;
      if (t.fade < target) {
        t.fade = Math.min(target, t.fade + d);
        // AudioContext 挂起态（浏览器手势前）：gain 无声但源持续跑，恢复后即出声
      } else if (t.fade > target) {
        t.fade = Math.max(target, t.fade - d);
        if (t.fade === 0) {
          t.src.stop();
          this.pool.delete(id);
          continue;
        }
      }
      t.gain.gain.value = Math.min(1, t.fade) * this.volume;
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
    if (id === 0) return;
    const ac = this.audio();
    if (!ac) return;
    // 缓冲未就绪：解码完成后补建源（此时才真正起播，无冷启动顿挫）
    if (!this.buffers.has(id)) {
      void this.buffer(id).then((buf) => { if (buf && this.curMusic === id) this.track(id); });
    } else {
      this.track(id);
    }
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
