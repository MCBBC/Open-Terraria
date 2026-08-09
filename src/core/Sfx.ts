// 音效：原版 wav 素材（public/sounds/）+ WebAudio 合成兜底
// hit 敌人受击 / hurt 玩家受击 / pickup 拾取 / dig 挖掘 / place 放置 / drink 饮用 / chop 砍树 / splash 落水
// + killed 怪物死亡 / zombie 僵尸环境声 / roar Boss咆哮 / coin 拾币 / door_open door_close / tink 敲石 / shatter 玻璃破碎 / drown 溺水
export type SfxName =
  | 'hit' | 'hurt' | 'pickup' | 'dig' | 'place' | 'drink' | 'chop' | 'splash'
  | 'killed' | 'pkilled' | 'zombie' | 'roar' | 'coin' | 'door_open' | 'door_close' | 'tink' | 'shatter' | 'drown'
  | 'menuOpen' | 'menuClose' | 'menuTick';

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
  // 菜单 UI（原版 id 10=Menu_Open / id 11=Menu_Close / id 12=Menu_Tick）
  menuOpen: ['Menu_Open'],
  menuClose: ['Menu_Close'],
  menuTick: ['Menu_Tick'],
  // 以下无原版素材，走合成
  drink: [],
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  muted = false;

  private extraFiles = new Set<string>();
  /** 追加加载额外 wav 文件（怪物专属声效等） */
  addFiles(files: string[]) {
    for (const f of files) this.extraFiles.add(f);
    const ctx = this.ctx;
    if (!ctx) return;
    for (const f of files) {
      if (this.buffers.has(f)) continue;
      fetch(`sounds/${f}.wav`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => {
        if (!ab) return;
        ctx.decodeAudioData(ab).then((buf) => this.buffers.set(f, buf)).catch(() => {});
      }).catch(() => {});
    }
  }

  /** 预加载全部 wav（在用户手势后调用可获得最佳兼容；挂起态 decodeAudioData 也可用） */
  async load(): Promise<void> {
    const ctx = this.ensure(true);
    if (!ctx) return;
    const files = new Set<string>();
    for (const list of Object.values(WAV_MAP)) for (const f of list) files.add(f);
    for (const f of this.extraFiles) files.add(f);
    await Promise.all([...files].map(async (f) => {
      try {
        const r = await fetch(`sounds/${f}.wav`);
        if (!r.ok) return;
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        this.buffers.set(f, buf);
      } catch { /* 单文件失败静默 */ }
    }));
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
  playWav(name: SfxName, vol = 1): boolean {
    const list = WAV_MAP[name];
    if (!list || !list.length) return false;
    return this.playWavFile(list[Math.floor(Math.random() * list.length)], vol);
  }

  /** 播放任意 wav 文件列表（随机选 + 音高扰动）；供怪物专属声效用 */
  playFiles(files: string[], vol = 1): boolean {
    if (!files.length) return false;
    return this.playWavFile(files[Math.floor(Math.random() * files.length)], vol);
  }

  /** 按文件名直播 */
  playWavFile(file: string, vol = 1): boolean {
    const ctx = this.ensure();
    if (!ctx) return false;
    const buf = this.buffers.get(file);
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    const g = ctx.createGain();
    g.gain.value = Math.min(1, vol);
    src.connect(g).connect(ctx.destination);
    src.start();
    return true;
  }

  play(name: SfxName, vol = 1) {
    // 优先原版素材，失败回退合成
    if (this.playWav(name, vol)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + delay + dur);
      g.gain.setValueAtTime(vol, t + delay);
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
