// 音效：原版 wav 素材（public/sounds/）+ WebAudio 合成兜底。
// **按需加载（与贴图懒加载同策略，2026-08-10）**：不预读任何文件——播放未命中时
// 后台 fetch+decode（pending 防重入、failed 负缓存防 404 循环），首播走合成兜底/静默，
// 解码完成后后续播放命中真声。定向预热用 preloadFiles（如 Boss 召唤前取咆哮声）。
// hit 敌人受击 / hurt 玩家受击 / pickup 拾取 / dig 挖掘 / place 放置 / drink 饮用 / chop 砍树 / splash 落水
// + killed 怪物死亡 / zombie 僵尸环境声 / roar Boss咆哮 / coin 拾币 / door_open door_close / tink 敲石 / shatter 玻璃破碎 / drown 溺水
export type SfxName =
  | 'hit' | 'hurt' | 'pickup' | 'dig' | 'place' | 'drink' | 'chop' | 'splash'
  | 'killed' | 'pkilled' | 'zombie' | 'roar' | 'coin' | 'door_open' | 'door_close' | 'tink' | 'shatter' | 'drown'
  | 'menuOpen' | 'menuClose' | 'menuTick'
  | 'bowShoot'   // 原版 SoundID.Item5（弓弦，Item.cs case 99 UseSound）
  | 'throw'      // 原版 SoundID.Item1（手里剑/投掷刀 UseSound）
  | 'explosion'  // 原版 SoundID.Item14（爆炸通用：手雷/炸弹/炸药/巨石,Projectile.cs 20+ 处）
  | 'beeSummon'  // 原版 SoundID.Item173（Abeemination 蜂后召唤音，Player.cs:43185——Boss 召唤音唯一非 Roar 例外）
  | 'thunder';   // 原版 SoundID 43（Thunder_0-5，NewLightning 的 thunderDelay 归零时播）

// 逻辑名 → 原版 wav 文件（多文件随机选 + 音高扰动）
const WAV_MAP: Record<SfxName, string[]> = {
  hit: ['NPC_Hit_1', 'NPC_Hit_2', 'NPC_Hit_3', 'NPC_Hit_4', 'NPC_Hit_5'],
  hurt: ['Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2'],
  killed: ['NPC_Killed_1', 'NPC_Killed_2', 'NPC_Killed_3'],
  pkilled: ['Player_Killed'],
  zombie: ['Zombie_1', 'Zombie_2', 'Zombie_3', 'Zombie_4', 'Zombie_5', 'Zombie_6'],
  roar: ['Roar_0', 'Roar_1'],
  pickup: ['Grab'],
  dig: ['Dig_0', 'Dig_1', 'Dig_2'],
  chop: ['Grass'],
  tink: ['Tink_0', 'Tink_1'],
  place: ['Dig_1', 'Dig_2'],
  shatter: ['Shatter'],
  coin: ['Coin_0', 'Coin_1', 'Coins'],
  door_open: ['Door_Opened'],
  door_close: ['Door_Closed'],
  splash: ['Splash_0', 'Splash_1'],
  drown: ['Drown'],
  bowShoot: ['Item_5'],
  // 菜单 UI（原版 id 10=Menu_Open / id 11=Menu_Close / id 12=Menu_Tick）
  menuOpen: ['Menu_Open'],
  menuClose: ['Menu_Close'],
  menuTick: ['Menu_Tick'],
  throw: ['Item_1'],
  explosion: ['Item_14'],
  beeSummon: ['Item_173'],
  thunder: ['Thunder_0', 'Thunder_1', 'Thunder_2', 'Thunder_3', 'Thunder_4', 'Thunder_5'],
  // 以下无原版素材，走合成
  drink: [],
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  /** 在途解码中的文件（防重复 fetch） */
  private pending = new Set<string>();
  /** 取回失败/不存在的文件（负缓存，防 404 每次重试） */
  private failed = new Set<string>();
  muted = false;
  /** 主音量 0..1（M6 设置页） */
  master = 1;

  /** 按需取缓冲：未命中时后台 fetch+decode，同步返回已就位缓冲或 null */
  private ensureBuffer(file: string): AudioBuffer | null {
    const buf = this.buffers.get(file);
    if (buf) return buf;
    if (this.pending.has(file) || this.failed.has(file)) return null;
    const ctx = this.ensure(true);
    if (!ctx) return null;
    this.pending.add(file);
    fetch(`sounds/${file}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
      .then((decoded) => {
        if (decoded) this.buffers.set(file, decoded);
        else this.failed.add(file);
      })
      .catch(() => { this.failed.add(file); })
      .finally(() => { this.pending.delete(file); });
    return null;
  }

  /** 定向预热（不阻塞）：把指定 wav 后台取齐，播放时即命中 */
  preloadFiles(files: Iterable<string>) {
    for (const f of files) this.ensureBuffer(f);
  }

  /** 按逻辑名预热（WAV_MAP 展开到具体文件） */
  preloadNames(names: SfxName[]) {
    for (const n of names) for (const f of WAV_MAP[n] ?? []) this.ensureBuffer(f);
  }

  // ---- 雨声层：原版 RainAmbience（Music_28.mp3，XACT Wave Bank 同源提取）循环 ----
  private rainGain: GainNode | null = null;
  private rainSrc: AudioBufferSourceNode | null = null;
  private rainLoaded = false;
  /** 设置雨声强度 0-1（每帧调用；0 时静音不拆节点——重启有冷启动开销） */
  setRain(vol: number) {
    const ctx = this.ensure(true);
    if (!ctx) return;
    if (!this.rainGain) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(ctx.destination);
      this.rainGain = g;
      // 原版雨环境音轨（RainAmbience）懒加载循环；加载失败静默（雨声可选）
      fetch('audios/music/Music_28.mp3')
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
        .then((buf) => {
          if (!buf) return;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(this.rainGain!);
          src.start();
          this.rainSrc = src;
          this.rainLoaded = true;
        })
        .catch(() => {});
    }
    const v = Math.max(0, Math.min(1, vol)) * this.master * 0.6;
    this.rainGain.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
  }

  /** 世界声距离衰减（LegacySoundPlayer.cs:160 SoundAttenuationDistance = 2500px） */
  static readonly ATTEN = 2500;
  /** 监听器（原版 Main.Camera.Center，相机中心非玩家）；Game 每帧更新。未进世界=(0,0) */
  private lx = 0; private ly = 0;
  setListener(x: number, y: number) { this.lx = x; this.ly = y; }
  /** 原版距离衰减（LegacySoundPlayer.cs:381-401）：dist ≥2500 → 不播；
   *  vol × (1 - dist/2500)。不传坐标（x=-1 语义）→ 全量（UI/玩家自身动作声） */
  private atten(vol: number, x?: number, y?: number): number {
    if (x == null || y == null) return vol;
    const d = Math.hypot(x - this.lx, y - this.ly);
    if (d >= Sfx.ATTEN) return 0;
    return vol * (1 - d / Sfx.ATTEN);
  }

  private ensure(silent = false): AudioContext | null {
    if (this.muted && !silent) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** 播放原版 wav（随机变体 + 轻微音高扰动）；vol 0-1 */
  playWav(name: SfxName, vol = 1, x?: number, y?: number): boolean {
    const list = WAV_MAP[name];
    if (!list || !list.length) return false;
    return this.playWavFile(list[Math.floor(Math.random() * list.length)], vol, x, y);
  }

  /** 播放任意 wav 文件列表（随机选 + 音高扰动）；供怪物专属声效用 */
  playFiles(files: string[], vol = 1, x?: number, y?: number): boolean {
    if (!files.length) return false;
    return this.playWavFile(files[Math.floor(Math.random() * files.length)], vol, x, y);
  }

  /** 按文件名直播（缓冲未就位时触发后台加载，本播返回 false 走合成兜底） */
  playWavFile(file: string, vol = 1, x?: number, y?: number): boolean {
    const ctx = this.ensure();
    if (!ctx) return false;
    const v = this.atten(vol, x, y);
    if (v <= 0) return false;
    vol = v;
    const buf = this.ensureBuffer(file);
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    const g = ctx.createGain();
    g.gain.value = Math.min(1, vol * this.master);
    src.connect(g).connect(ctx.destination);
    src.start();
    return true;
  }

  play(name: SfxName, vol = 1, x?: number, y?: number) {
    // 优先原版素材，失败回退合成（master 在 playWavFile/osc 各自生效一次）。
    // 带坐标时衰减（atten），≤0 直接不播——合成回退也不触发
    if (x != null && y != null && this.atten(vol, x, y) <= 0) return;
    if (this.playWav(name, vol, x, y)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + delay + dur);
      g.gain.setValueAtTime(vol * this.master, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t + delay);
      o.stop(t + delay + dur);
    };
    switch (name) {
      case 'hit': osc('square', 320, 110, 0.09, 0.12); break;
      case 'chop': osc('triangle', 220, 80, 0.12, 0.16); break;
      case 'hurt': osc('sawtooth', 180, 60, 0.22, 0.14); break;
      case 'killed': osc('square', 260, 60, 0.25, 0.14); break;
      case 'pkilled': osc('sawtooth', 160, 40, 0.6, 0.18); break;
      case 'zombie': osc('sawtooth', 90, 55, 0.5, 0.1); break;
      case 'roar': osc('sawtooth', 70, 40, 0.9, 0.2); break;
      case 'pickup': osc('sine', 520, 990, 0.09, 0.1); osc('sine', 780, 1320, 0.08, 0.06, 0.05); break;
      case 'dig': osc('square', 140, 90, 0.05, 0.06); break;
      case 'tink': osc('sine', 900, 500, 0.06, 0.08); break;
      case 'place': osc('triangle', 260, 120, 0.08, 0.12); break;
      case 'drink': osc('sine', 300, 620, 0.06, 0.08); osc('sine', 420, 780, 0.06, 0.07, 0.07); osc('sine', 560, 940, 0.06, 0.06, 0.14); break;
      case 'splash': osc('sine', 700, 200, 0.18, 0.1); break;
      case 'coin': osc('sine', 990, 1400, 0.07, 0.08); osc('sine', 1320, 1760, 0.09, 0.06, 0.05); break;
      case 'door_open': osc('triangle', 180, 320, 0.12, 0.1); break;
      case 'door_close': osc('triangle', 320, 160, 0.1, 0.1); break;
      case 'shatter': osc('square', 1400, 300, 0.15, 0.1); break;
      case 'drown': osc('sine', 400, 90, 0.4, 0.1); break;
    }
  }
}
