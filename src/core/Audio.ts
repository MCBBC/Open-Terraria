// 原版 BGM 系统（LegacyAudioSystem.cs 交叉淡化语义 1:1）：
// WebAudio AudioBufferSourceNode 无缝循环（loop=true，解码后内存播放，零接缝）——
// 修复 <audio loop> 播 mp3 的循环点卡顿 + 切曲冷启动顿挫（原版 XACT 同为解码循环）。
// musicFade[id] ±0.005/帧 逼近目标曲（:295 UpdateCommonTrack / :323 TowardStopping,1458 行号）。
// audios/music/Music_<id>.mp3（tools/xwb-extract.mjs 提取）。
import { MUSIC } from '../data/Music';
import { Sfx } from './Sfx';
import { options } from './Options';
import { swTrace } from '../net/AssetCache';

const TITLE_ID = MUSIC.TitleIntro; // 50

interface Track {
  src: AudioBufferSourceNode;
  gain: GainNode;
  fade: number;   // 0..1（≈原版 Main.musicFade[id]）
  /** ★fade 归零拆轨前置旗标(onended 哨兵用):true=正常停轨;ended 无此旗标=loop 失效 */
  stoppedByFade?: boolean;
}

export class AudioSystem {
  private ac: AudioContext | null = null;
  private pool = new Map<number, Track>();
  /** BGM 事件追踪（2026-09-03 用户需求：F5 长按录制窗记录 BGM 序列，与 SFX 分开）。
   *  main.ts 接线（单实例归 main 所有），事件时刻经 flow?.game 解析活 Game 的
   *  audioRec.bgm 环。事件类 k：sel=选曲切换（d.id=目标曲 MUSIC id,d.p=前曲）/
   *  start=轨解码完成实起 / stop=轨渐熄实停 / fail=取曲失败（限时负缓存）/
   *  mute=静音开关。选曲意图（sel）与实际出声（start/stop）分开记——
   *  "BGM 没声/切错曲"先对账这两层 */
  onEvent: ((k: string, d: unknown) => void) | null = null;
  private emit(k: string, d: unknown): void {
    if (this.onEvent) this.onEvent(k, d);
  }
  /** 解码 PCM 常驻上限:每首 mp3 解码后 30-45MB,104 首全驻 = GB 级;
   *  保留最近 MAX_BUFFERS 首(Map 迭代序=LRU),超限淘汰最旧并重解码(可接受) */
  private static readonly MAX_BUFFERS = 3;
  private buffers = new Map<number, AudioBuffer>();
  private decoding = new Set<number>();
  /** 取回失败曲目（限时负缓存,2026-08-24 R22）：与 Sfx.ts 同款 15s 窗口重试——
   *  旧实现 buffers.set(id,null) 永久哨兵且 evictOld 永不清除,一次 SW cache-miss/
   *  瞬时网络失败（vite 重启/SW 版本切换清缓存窗）= 该 BGM 整场哑。真 404 每
   *  15s 多一次 fetch,代价可忽略 */
  private failed = new Set<number>();
  private failedAt = new Map<number, number>();
  private static FAILED_RETRY_MS = 15_000;
  private failedFresh(id: number): boolean {
    if (!this.failed.has(id)) return false;
    const at = this.failedAt.get(id) ?? 0;
    if (performance.now() - at >= AudioSystem.FAILED_RETRY_MS) {
      this.failed.delete(id);
      this.failedAt.delete(id);
      return false;
    }
    return true;
  }
  private markFailed(id: number): void {
    this.failed.add(id);
    this.failedAt.set(id, performance.now());
  }
  /** 目标曲目（≈原版 Main.curMusic；0 = 静音） */
  curMusic = 0;
  /** ★BGM 诊断 trace(2026-09-07 用户报「蘑菇洞穴播完一轮 BGM 停止、失去循环」
   *  ——代码层唯一停止路径=选曲变化 fade 归零,无显式「曲尾停止」;加环形记录
   *  抓现场:选曲/停轨/取曲失败/静音/音量事件+周期快照。控制台
   *  `__swAudio.trace` 直接读(环形 60 条);复现后 F5/控制台即可定位层次) */
  trace: Array<Record<string, unknown>> = [];
  private tracePush(e: Record<string, unknown>): void {
    this.trace.push({ t: Math.round(performance.now() / 1000), cm: this.curMusic, muted: this.muted, moon: this.moonNum, ...e });
    if (this.trace.length > 60) this.trace.shift();
  }
  /** 周期快照(内部状态)->trace;由 startLoop 每 ~10s 调一次 */
  private lastSnapAt = 0;
  private snapshotTrace(): void {
    const now = performance.now();
    if (now - this.lastSnapAt < 10000) return;
    this.lastSnapAt = now;
    const tracks = [...this.pool.entries()].map(([id, t]) => `${id}:${t.fade.toFixed(2)}`).join(',') || 'none';
    this.tracePush({ e: 'snap', tracks, loop: [...this.pool.values()].every((t) => t.src.loop) });
  }
  muted = false;
  /** 音乐音量 0..1（options.musicVol，M6 设置页） */
  volume = 0.35;
  private rafId = 0;
  private lastTs = 0;

  constructor() {
    this.startLoop();
    this.armUnlock();
  }

  /** 首次手势解锁监听（见 armUnlock）；null = 未挂/已摘 */
  private unlockBound: Array<[string, EventListener]> | null = null;

  /** 浏览器自动播放策略：标题曲在无手势时起播 → AudioContext 挂起（audio() 里的
   *  resume 被拒后无人重试），已起的源静默空转。首次用户手势（点击/按键/触摸，
   *  capture 捕获不与页面 stopPropagation 互斥）恢复上下文即出声——源持续跑
   *  无需重播；成功恢复即自摘监听（用户激活后浏览器不会再挂起）。
   *  上下文尚未建立时保持监听：play('title') 建上下文后若仍挂起，下次手势兜底 */
  private armUnlock(): void {
    const w = typeof window !== 'undefined' ? window : null;
    if (!w || typeof w.addEventListener !== 'function' || this.unlockBound) return;
    const tryResume = () => {
      const ac = this.ac;
      if (!ac) return; // 尚未建上下文：建时 audio() 自带 resume 尝试
      if (ac.state !== 'suspended') { this.disarmUnlock(); return; }
      void ac.resume().then(() => {
        if (this.ac && this.ac.state === 'running') this.disarmUnlock();
      }).catch(() => { /* 恢复被拒：下次手势再试 */ });
    };
    this.unlockBound = (['pointerdown', 'keydown', 'touchstart'] as const).map((type) => {
      const fn = tryResume as EventListener;
      w.addEventListener(type, fn, true);
      return [type, fn] as [string, EventListener];
    });
  }

  private disarmUnlock(): void {
    const w = typeof window !== 'undefined' ? window : null;
    if (!w || !this.unlockBound) return;
    for (const [type, fn] of this.unlockBound) w.removeEventListener(type, fn, true);
    this.unlockBound = null;
  }

  /** 自动播放拦截探测（音频门前置用，2026-08-24）：惰性建 AC 并读状态——
   *  挂起 = 浏览器拦截。建 AC 本身无源无增益不发声，安全 */
  isAutoplayBlocked(): boolean {
    const ac = this.audio();
    return ac ? ac.state === 'suspended' : false;
  }

  /** ★探测式判定（2026-08-27 手机实测“策略禁 autoplay 却直接跳过耳机门”）：
   *  策略对新建 AC 的挂起是【异步】的——创建瞬间常读 running，数百 ms 后才被
   *  挂起；同步快照在启动 IO 高峰期必误判“未拦截”→ 不出门 → 静音裸奔。
   *  现：创建即 running 时等 250ms 给策略引擎挂起窗口，再实测 resume——
   *  resume 后仍非 running = 拦截实锤（要门）；running = 环境允许（不门）。 */
  async detectAutoplayBlocked(): Promise<boolean> {
    const ac = this.audio();
    if (!ac) return false;
    // st() 函数化读取:绕开 TS 对 ac.state 的控制流窄化(跨 await 后状态可变,
    // 字面量比较是运行时合法的——TS2367 为假阳性)
    const st = (): string => ac.state as string;
    if (st() === 'running') {
      await new Promise((r) => setTimeout(r, 250));
      if (st() !== 'suspended') { swTrace('音频探测: AC running（策略未拦）'); return false; }
    }
    try {
      await Promise.race([
        ac.resume(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('resume超时')), 600)),
      ]);
    } catch { /* resume 被拒/超时 = 拦截实锤 */ }
    const blocked = st() !== 'running';
    swTrace(`音频探测: state=${st()} → ${blocked ? '拦截，出门' : '未拦截'}`);
    return blocked;
  }

  /** 手势恢复（音频门点击放行）：resume 并回是否已 running（armUnlock 兜底并行） */
  async resumeNow(): Promise<boolean> {
    const ac = this.audio();
    if (!ac) return false;
    try { await ac.resume(); } catch { /* 被拒由 armUnlock 下次手势再试 */ }
    return ac.state === 'running';
  }

  private audio(): AudioContext | null {
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ac = new AC();
      // 失焦音频闸登记（'music' 类别=AllowMusic :85-95 放行面;Sfx.setAudioSuspension
      // 统一 suspend/resume,Main.cs:11193-11202 同构）
      Sfx.registerAudioContext(this.ac, 'music');
    }
    // ★失焦闸配合：未激活期间禁止自动 resume（手势恢复走 resumeNow/armUnlock,均由
    //  用户输入触发、未激活态不可达）。BGM 放行面=AllowMusic :85-95 取开关——
    //  playWhenUnfocused 开=失焦音乐继续不拦 resume;关=失焦连 BGM 全停(PauseAll)。
    //  两源合并态 Sfx.isAppInactive()（visibilitychange ∪ window blur,红队 R3-E2 ①）。
    //  node 单测无事件源 → 视为可见
    const gateBlocked = Sfx.isAppInactive() && !options.data.playWhenUnfocused;
    if (this.ac.state === 'suspended' && !gateBlocked) {
      this.ac.resume().catch(() => { /* 手势前恢复被拒，播放时重试 */ });
    }
    return this.ac;
  }

  /** 解码缓存（每曲一次；LRU 上限 MAX_BUFFERS。失败走限时负缓存,不占缓存位） */
  private async buffer(id: number): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(id);
    if (hit !== undefined) return hit;
    if (this.decoding.has(id)) return null; // 解码中：本帧跳过，就绪后 track() 会补建
    if (this.failedFresh(id)) return null;  // 负缓存窗口内：快速短路,过期自动放行重取
    this.decoding.add(id);
    try {
      const r = await fetch(`audios/music/Music_${id}.mp3`);
      if (!r.ok) throw new Error(String(r.status));
      const buf = await this.ac!.decodeAudioData(await r.arrayBuffer());
      this.buffers.set(id, buf);
      this.failed.delete(id);
      this.failedAt.delete(id);
      this.evictOld();
      return buf;
    } catch {
      this.markFailed(id);   // 限时负缓存（15s 窗口,见字段注释）——不再永久哨兵
      this.emit('fail', { id });   // BGM 取曲失败（"该段没音乐"根因,15s 内重试仍拦）
      this.tracePush({ e: 'fail', id });
      return null;
    } finally {
      this.decoding.delete(id);
    }
  }

  /** LRU 淘汰:超限后删最旧的可淘汰条目(非 pool 播放中)。失败曲目不入 buffers
   *  （限时负缓存在 failed/failedAt 集),故无需再跳过 null 哨兵。
   *  一轮全扫收集候选再删,避免 refresh-continue 式死循环(全部不可淘汰时);
   *  只删 Map 条目,已建的 AudioBufferSourceNode 仍引用旧 buffer(播放不受影响),
   *  之后 track() 重建才需重解码。pool 只存交叉淡化中的曲目(tickFade 停播即
   *  移出),故候选不足降到上限的情形可忽略 */
  private evictOld(): void {
    if (this.buffers.size <= AudioSystem.MAX_BUFFERS) return;
    const evictable: number[] = [];
    for (const [id] of this.buffers) {
      if (this.pool.has(id)) continue;   // 播放/淡化中:track() 不可失源
      evictable.push(id);
    }
    for (const id of evictable) {
      if (this.buffers.size <= AudioSystem.MAX_BUFFERS) break;
      this.buffers.delete(id);
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
    // ★onended 哨兵(2026-09-07 用户报「蘑菇洞穴播完一轮 BGM 停止、失去循环」):
    //  loop=true 的轨不应触发 ended——触发且无前置 fade 拆轨(t.stoppedByFade)
    //  = **loop 失效实锤**(解码/浏览器层);常规 fade 归零拆轨已有 stop 事件对照
    const track: Track = { src, gain, fade: 0 };
    src.addEventListener('ended', () => {
      // pool 已被拆轨移除时不重复报（stop 事件已对照）;此处只抓「无前置拆轨的 ended」
      const stoppedByFade = track.stoppedByFade === true;
      this.tracePush({ e: 'ended', id, stoppedByFade });
      this.emit('ended', { id, stoppedByFade });
    });
    src.start();
    this.pool.set(id, track);
    this.emit('start', { id });   // 实起（解码完成后轨真正出声的时刻）
  }

  /** 月总召唤倒计时音乐压制（Main.cs:11646-11664,R22 接线,Game 每帧调用）：
   *  num=(countdown/max)²,countdown>max×0.2 时生效、否则归零（60s 倒计时末段
   *  渐熄至静默）;countdown==1 且有当前曲时把该曲 fade 清 0（下曲硬起）。
   *  v<=0 复位。注：原版此处还置 curMusic=0 停轨;本仓选曲链事件驱动（lastMusic
   *  未变不回调）,置 0 后无人恢复——以乘 num 静音等效,倒计时结束由 Boss 曲
   *  （38 ≠ lastMusic 必换曲）从 fade 0 硬起自然恢复 */
  private moonNum = 1;
  setMoonLordCountdown(countdown: number, max = 3600): void {
    if (!countdown || countdown <= 0 || max <= 0) { this.moonNum = 1; return; }
    if (countdown > max * 0.2) {
      this.moonNum = Math.max(0, Math.min(1, (countdown / max) ** 2));
    } else {
      this.moonNum = 0;
    }
    if (countdown === 1 && this.curMusic >= 1) {
      const t = this.pool.get(this.curMusic);
      if (t) { t.fade = 0; t.gain.gain.value = 0; }
    }
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

  /** 步进淡化量 d（0.005/帧）：目标曲 fade+=d 至 1，其余 -=d 至 0 并停播。
   *  R22 补齐两处原版细节（LegacyAudioSystem.cs:330-345 + Main.cs:11697-11705）：
   *  ① 非主曲只在主曲可闻(fade>0.25)时渐熄、curMusic=0 时立即归零硬停
   *     （旧实现恒 200 帧线性拖尾——切静音/音乐盒静音时多 3.3s 尾巴）；
   *  ② 曲目级音量修正：TOW 族 62-88 ×0.9、风暴 52 ×1.15 钳 1。 */
  private static readonly MAIN_AUDIBLE_FADE = 0.25;
  private tickFade(d: number) {
    if (this.muted) {
      this.tracePush({ e: 'tick-muted' });
      for (const [id, t] of this.pool) {
        if (t.fade > 0) { t.fade = 0; t.gain.gain.value = 0; }
      }
      return;
    }
    const mainFade = this.curMusic > 0 ? this.pool.get(this.curMusic)?.fade ?? 0 : 0;
    for (const [id, t] of this.pool) {
      const target = id === this.curMusic ? 1 : 0;
      if (t.fade < target) {
        t.fade = Math.min(target, t.fade + d);
        // AudioContext 挂起态（浏览器手势前）：gain 无声但源持续跑，恢复后即出声
      } else if (t.fade > target) {
        if (this.curMusic === 0) {
          t.fade = 0;                       // 原版 :338-340 curMusic==0 → 立即归零硬停
        } else if (mainFade > AudioSystem.MAIN_AUDIBLE_FADE) {
          t.fade = Math.max(target, t.fade - d);   // 主曲可闻才渐熄(:335-337)
        }
        if (t.fade === 0) {
          this.emit('stop', { id });   // 实停（渐熄到 0 拆轨；curMusic=0 时硬停同路）
          t.stoppedByFade = true;
          this.tracePush({ e: 'stop', id, cmAfter: this.curMusic, mainFade: mainFade.toFixed(2) });
          t.src.stop();
          this.pool.delete(id);
          continue;
        }
      }
      let v = Math.min(1, t.fade) * this.volume * this.moonNum;
      if (id >= 62 && id <= 88) v *= 0.9;   // TOW 族曲目音量修正(Main.cs:11701-11702)
      else if (id === 52) v *= 1.15;        // Storm ×1.15(:11703-11705)
      t.gain.gain.value = Math.min(1, v);
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /** 切换目标曲目（≈原版 curMusic 赋值；实际音量由淡化循环渐变） */
  playMusic(id: number) {
    if (this.muted) { this.tracePush({ e: 'sel-blocked-muted', id }); return; }
    if (this.curMusic === id) return;
    const prev = this.curMusic;
    this.curMusic = id;
    this.emit('sel', { id, ...(prev ? { p: prev } : {}) });   // 选曲意图（id=0 即静音选择）
    this.tracePush({ e: 'sel', id, prev });
    if (id === 0) return;
    const ac = this.audio();
    if (!ac) return;
    if (ac.state !== 'running') swTrace(`playMusic 于挂起 AC 起播(state=${ac.state},手势恢复后出声)`);
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
    this.emit('mute', { on: this.muted ? 1 : 0 });
    return this.muted;
  }
}
