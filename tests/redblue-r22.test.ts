// 红蓝对抗 R22（音频/音乐域）回归：2026-08-24 蓝队修复批。
// 覆盖必修清单①小动物映射+音量档 / ③多 Boss first-wins / ④pan 公式 /
// ⑤逐类型音高档 / ②BGM 限时负缓存 / ⑧月总倒计时压制(AudioSystem 侧)。
// 原版锚：Terarria1458 Terraria/NPC.cs:93365-93468、Terraria.Audio/LegacySoundPlayer.cs、
// Main.cs:12363-12613/:12612/:11646-11664。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CRITTER_SOUNDS } from '../src/data/vanillaNpcAmbience';
import { FILE_CASE_VOL, PITCH_CASE, pitchRateFor, Sfx, AMBIENT_FILES, WAV_MAP } from '../src/core/Sfx';
import { AudioSystem } from '../src/core/Audio';
import { MUSIC, resolveEventMusic } from '../src/data/Music';
import { splashDecision } from '../src/entities/npcLiquid';

// AudioSystem 构造器即 startLoop() → requestAnimationFrame;audio() 读 window
// （node 环境无 rAF——与 audio-buffer-lru.test.ts 同款桩）
const rafBackup = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
const windowBackup = (globalThis as { window?: unknown }).window;
beforeEach(() => {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => 0;
  (globalThis as { window?: unknown }).window = {};
});
afterEach(() => {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = rafBackup;
  (globalThis as { window?: unknown }).window = windowBackup;
});

describe('R22-① 小动物音效映射（NPC.cs UpdateNPC_CritterSounds :93365-93468 对拍）', () => {
  it('枭 611/689 → case46 Zombie_110/111（曾错接怪物语音 Zombie_46）', () => {
    for (const t of [611, 689]) {
      expect(CRITTER_SOUNDS[t]?.pool).toEqual(['Zombie_110', 'Zombie_111']);
      expect(CRITTER_SOUNDS[t]?.gate).toBe('night');
    }
  });
  it('海鸥 602/603 → case44 Zombie_106-108 均匀池（曾错接 Zombie_44）', () => {
    for (const t of [602, 603]) {
      expect(CRITTER_SOUNDS[t]?.pool).toEqual(['Zombie_106', 'Zombie_107', 'Zombie_108']);
    }
  });
  it('鹦鹉族：674/675→(67)118-120、671/672→(68)126-128、673→(69)129-130（曾错接 67/68/69 号怪物语音）', () => {
    expect(CRITTER_SOUNDS[674]?.pool).toEqual(['Zombie_118', 'Zombie_119', 'Zombie_120']);
    expect(CRITTER_SOUNDS[675]?.pool).toEqual(['Zombie_118', 'Zombie_119', 'Zombie_120']);
    expect(CRITTER_SOUNDS[671]?.pool).toEqual(['Zombie_126', 'Zombie_127', 'Zombie_128']);
    expect(CRITTER_SOUNDS[672]?.pool).toEqual(['Zombie_126', 'Zombie_127', 'Zombie_128']);
    expect(CRITTER_SOUNDS[673]?.pool).toEqual(['Zombie_129', 'Zombie_130']);
  });
  it('鼠族 300/447/610 → case33 固定 Zombie_15（曾错接怪物语音 Zombie_33）', () => {
    for (const t of [300, 447, 610]) expect(CRITTER_SOUNDS[t]?.file).toBe('Zombie_15');
  });
  it('鸭族不再把稀有变体 Zombie_12 并入均匀池（case30 仅 1/300 换 12,R22 登记项）', () => {
    for (const t of [362, 363, 364, 365]) {
      expect(CRITTER_SOUNDS[t]?.pool).toEqual(['Zombie_10', 'Zombie_11']);
    }
  });
  it('鸟权重用重复项表达：74 与 298 为 2/3 : 1/3；442 五掷均分', () => {
    expect(CRITTER_SOUNDS[74]?.pool).toEqual(['Zombie_14', 'Zombie_14', 'Zombie_18']);
    expect(CRITTER_SOUNDS[298]?.pool).toEqual(['Zombie_17', 'Zombie_17', 'Zombie_19']);
    expect(CRITTER_SOUNDS[442]?.pool).toEqual(['Zombie_16', 'Zombie_17', 'Zombie_19', 'Zombie_14', 'Zombie_18']);
  });
  it('全表 wav 在库(防键拼错静默)', () => {
    const files = new Set<string>();
    for (const c of Object.values(CRITTER_SOUNDS)) {
      files.add(c.file);
      for (const f of c.pool ?? []) files.add(f);
    }
    expect([...files].sort()).toEqual([
      'Zombie_10', 'Zombie_106', 'Zombie_107', 'Zombie_108', 'Zombie_11',
      'Zombie_110', 'Zombie_111', 'Zombie_118', 'Zombie_119', 'Zombie_12'.replace('12', '120'),
      'Zombie_126', 'Zombie_127', 'Zombie_128', 'Zombie_129', 'Zombie_13',
      'Zombie_130', 'Zombie_14', 'Zombie_15', 'Zombie_16', 'Zombie_17',
      'Zombie_18', 'Zombie_19',
    ]);
  });
});

describe('R22-①b 小动物/海鸟族十组音量档（FILE_CASE_VOL,LegacySoundPlayer 各 case）', () => {
  it('档位逐组对拍', () => {
    expect(FILE_CASE_VOL.Zombie_13).toBe(0.35);          // case31 Frog(:1128)
    for (let s = 14; s <= 19; s++) {
      // ★15 双归属：case32 鸟档 ×0.15 vs case33 鼠固定 num=15 档 ×0.2——原版鸟从不
      //   掷 style15（74→14/18、297→16、298→17/19、442→16/17/19/14/18）,
      //   故文件档取鼠标 ×0.2（消费面唯一路径）
      expect(FILE_CASE_VOL[`Zombie_${s}`]).toBe(s === 15 ? 0.2 : 0.15);  // case32(:1136)
    }
    for (let s = 106; s <= 108; s++) expect(FILE_CASE_VOL[`Zombie_${s}`]).toBe(0.2); // case44(:1054)
    for (let s = 110; s <= 114; s++) expect(FILE_CASE_VOL[`Zombie_${s}`]).toBe(0.9); // case46(:1074)
    for (let s = 115; s <= 117; s++) expect(FILE_CASE_VOL[`Zombie_${s}`]).toBe(0.5); // case65
    for (let s = 118; s <= 120; s++) expect(FILE_CASE_VOL[`Zombie_${s}`]).toBe(0.3); // case67(:1147)
    for (let s = 121; s <= 123; s++) expect(FILE_CASE_VOL[`Zombie_${s}`]).toBe(0.45);// case66(:1183)
    for (let s = 126; s <= 128; s++) expect(FILE_CASE_VOL[`Zombie_${s}`]).toBe(0.22);// case68(:1159)
    for (let s = 129; s <= 130; s++) expect(FILE_CASE_VOL[`Zombie_${s}`]).toBe(0.2); // case69(:1171)
  });
  it('小动物族全部登记为 ambient 轨（DoesSoundScaleWithAmbientVolume 30-33/44/46/67-69）', () => {
    for (const f of ['Zombie_10', 'Zombie_13', 'Zombie_15', 'Zombie_106', 'Zombie_110',
      'Zombie_118', 'Zombie_126', 'Zombie_129']) {
      expect(AMBIENT_FILES.has(f)).toBe(true);
    }
  });
});

describe('R22-⑤ 逐类型音高档（PITCH_CASE,替代旧全局 0.92+rand×0.16≈±0.115）', () => {
  it('不抖族：Player_Hit/Roar/Menu/Tink/Shatter/Unlock/ZombieMoan(case14)/case65 → 恒 1', () => {
    for (const f of ['Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2', 'Roar_0', 'Roar_1',
      'Menu_Open', 'Menu_Close', 'Menu_Tick', 'Tink_0', 'Tink_1', 'Tink_2',
      'Shatter', 'Unlock', 'Zombie_0', 'Zombie_1', 'Zombie_2', 'Zombie_7',
      'Zombie_115', 'Zombie_116', 'Zombie_117', 'Coins', 'Drown']) {
      expect(PITCH_CASE[f]).toBeNull();
      expect(pitchRateFor(f)).toBe(1);
    }
  });
  it('门 ±0.20 / 草 ±0.30 / 拾币 ±0.08', () => {
    expect(PITCH_CASE.Door_Opened).toEqual([-20, 20]);
    expect(PITCH_CASE.Door_Closed).toEqual([-20, 20]);
    expect(PITCH_CASE.Grass).toEqual([-30, 30]);
    expect(PITCH_CASE.Coin_0).toEqual([-8, 8]);
    expect(pitchRateFor('Door_Opened')).toBeGreaterThanOrEqual(2 ** -0.2);
    expect(pitchRateFor('Door_Opened')).toBeLessThanOrEqual(2 ** 0.2);
    expect(pitchRateFor('Grass')).toBeGreaterThanOrEqual(2 ** -0.3);
    expect(pitchRateFor('Grass')).toBeLessThanOrEqual(2 ** 0.3);
  });
  it('Item 族默认 ±0.06;特例 53/55/132/153/156/169/26·35·47(乐器)', () => {
    for (const f of ['Item_1', 'Item_29', 'Item_44', 'Item_62']) expect(PITCH_CASE[f]).toEqual([-6, 6]);
    expect(PITCH_CASE.Item_53).toEqual([-40, -22]);
    expect(PITCH_CASE.Item_55).toEqual([22, 40]);
    expect(PITCH_CASE.Item_132).toEqual([-2, 2]);
    expect(PITCH_CASE.Item_153).toEqual([-15, 15]);
    expect(PITCH_CASE.Item_156).toEqual([-10, 10]);
    expect(PITCH_CASE.Item_169).toEqual([-86, -74]);
    expect(PITCH_CASE.Item_26).toBeNull();   // Pitch=Main.musicPitch 直传,不随机
  });
  it('小动物族：鸟 -0.70..+0.25 / 海鸥鸭 -0.70..0 / 蛙·鸭12 -0.40..+0.20 / 鼠 -0.10..+0.30 / 鹦鹉 ±0.05', () => {
    expect(PITCH_CASE.Zombie_14).toEqual([-70, 25]);
    expect(PITCH_CASE.Zombie_19).toEqual([-70, 25]);
    expect(PITCH_CASE.Zombie_106).toEqual([-70, 0]);
    expect(PITCH_CASE.Zombie_10).toEqual([-70, 0]);
    expect(PITCH_CASE.Zombie_12).toEqual([-40, 20]);
    expect(PITCH_CASE.Zombie_13).toEqual([-40, 20]);
    expect(PITCH_CASE.Zombie_15).toEqual([-10, 30]);
    expect(PITCH_CASE.Zombie_118).toEqual([-5, 5]);
    expect(PITCH_CASE.Zombie_129).toEqual([-5, 5]);
    expect(PITCH_CASE.Zombie_121).toEqual([-15, 15]);   // case66
  });
  it('±0.10 战斗/挖掘族与微光溅低音高', () => {
    expect(PITCH_CASE.Dig_0).toEqual([-10, 10]);
    expect(PITCH_CASE.NPC_Hit_1).toEqual([-10, 10]);
    expect(PITCH_CASE.NPC_Killed_31).toEqual([-10, 10]);
    expect(PITCH_CASE.Grab).toEqual([-10, 10]);
    expect(PITCH_CASE.Splash_0).toEqual([-10, 10]);
    expect(PITCH_CASE.Splash_4).toEqual([-20, 0]);   // 微光对(:887)
  });
  it('显式 pitch 直传跳过抖动（乐器 musicPitch 面）;未登记文件恒 1', () => {
    expect(pitchRateFor('Grass', 0.37)).toBeCloseTo(2 ** 0.37, 10);
    expect(pitchRateFor('some_custom_pack_sound')).toBe(1);
  });
});

describe('R22-④ pan 声像（LegacySoundPlayer.cs:398 dx/(1920/2) 钳±1）', () => {
  it('公式：dx/960 钳 [-1,1];无坐标=0', () => {
    const s = new Sfx();
    const p = s as unknown as { panOf: (x?: number, y?: number) => number; setListener: (x: number, y: number) => void };
    p.setListener(1000, 500);
    expect(p.panOf()).toBe(0);
    expect(p.panOf(1960, 500)).toBe(1);        // +960px → 满 right
    expect(p.panOf(40, 500)).toBe(-1);         // -960px → 满 left
    expect(p.panOf(1480, 500)).toBeCloseTo(0.5, 10);
    expect(p.panOf(520, 500)).toBeCloseTo(-0.5, 10);
    expect(p.panOf(5000, 500)).toBe(1);        // 远超半屏宽钳边界
  });
  it('常量分母 = MaxWorldViewSize.X/2 = 960（Main.cs:754-758 恒常量,非窗口宽）', () => {
    expect(Sfx.PAN_HALF_VIEW).toBe(960);
  });
});

describe('R22-③ 多 Boss 并存 first-wins（Main.cs:12535-12612 首命中 break）', () => {
  it('按输入序取首个命中槽,不按链优先级（月总槽在后时让位）', () => {
    // 双 Boss 同屏：Boss1 兜底 NPC 序在前 → 5,而非链首的月总 38（旧链逻辑会返 38）
    expect(resolveEventMusic(new Set([1, 7]))).toBe(MUSIC.Boss1);
    expect(resolveEventMusic(new Set([7, 1]))).toBe(MUSIC.MoonLord);
  });
  it('链序不再参与裁决：石巨人[4]与 EoW[23] 谁先插入谁赢', () => {
    expect(resolveEventMusic(new Set([23, 4]))).toBe(99);    // EoW 先命中
    expect(resolveEventMusic(new Set([4, 23]))).toBe(MUSIC.Golem);  // 石巨人先命中
  });
  it('单槽与空集行为不变(向后兼容)', () => {
    expect(resolveEventMusic(new Set([4]))).toBe(MUSIC.Golem);
    expect(resolveEventMusic(new Set([7]))).toBe(MUSIC.MoonLord);
    expect(resolveEventMusic(new Set())).toBe(0);
    expect(resolveEventMusic(new Set([999]))).toBe(0);       // 未映射槽跳过
  });
});

describe('R22-② BGM 限时负缓存（对齐并行会话 Sfx.ts 的 15s 窗口语义）', () => {
  it('失败在窗口内拦截、过期自动解除并清除记录', () => {
    const sys = new AudioSystem();
    const p = sys as unknown as {
      failed: Set<number>; failedAt: Map<number, number>;
      markFailed: (id: number) => void; failedFresh: (id: number) => boolean;
    };
    p.markFailed(38);
    expect(p.failedFresh(38)).toBe(true);          // 窗口内：拦截
    // 回拨时间戳模拟 15s 流逝（FAILED_RETRY_MS=15000）
    p.failedAt.set(38, performance.now() - 15_001);
    expect(p.failedFresh(38)).toBe(false);         // 过期：放行重取
    expect(p.failed.has(38)).toBe(false);          // 且清除记录
    expect(p.failedFresh(99)).toBe(false);         // 未失败过的曲目不受影响
  });
  it('重试窗为 15s（与 Sfx.ts FAILED_RETRY_MS 同值）', () => {
    expect((AudioSystem as unknown as { FAILED_RETRY_MS: number }).FAILED_RETRY_MS).toBe(15_000);
  });
});

describe('R22-⑧ 月总倒计时音乐压制（Main.cs:11646-11664,Game.ts 接线待应用）', () => {
  function priv(sys: AudioSystem) {
    return sys as unknown as {
      moonNum: number; curMusic: number;
      pool: Map<number, { fade: number; gain: { gain: { value: number } } }>;
      setMoonLordCountdown: (v: number, max?: number) => void;
    };
  }
  it('num=(countdown/max)²;≤20% 归零;复位回 1', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    p.setMoonLordCountdown(3600, 3600);
    expect(p.moonNum).toBe(1);
    p.setMoonLordCountdown(1800, 3600);
    expect(p.moonNum).toBeCloseTo(0.25, 10);
    p.setMoonLordCountdown(721, 3600);
    expect(p.moonNum).toBeGreaterThan(0);
    p.setMoonLordCountdown(720, 3600);            // max×0.2 边界内 → 渐熄归零段
    expect(p.moonNum).toBe(0);
    p.setMoonLordCountdown(0, 3600);
    expect(p.moonNum).toBe(1);                    // 无倒计时复位
  });
  it('countdown==1 时当前曲 fade 清 0(下曲硬起,:11659-11661)', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    p.curMusic = 38;
    const track = { fade: 0.8, gain: { gain: { value: 0.8 } } };
    p.pool.set(38, track);
    p.setMoonLordCountdown(1, 3600);
    expect(track.fade).toBe(0);
    expect(track.gain.gain.value).toBe(0);
  });
});

describe('R22 低项补齐（Audio.ts 淡出硬切 + 曲目级音量修正）', () => {
  function priv(sys: AudioSystem) {
    return sys as unknown as {
      pool: Map<number, { src: { stop: () => void }; gain: { gain: { value: number } }; fade: number }>;
      curMusic: number; volume: number; moonNum: number;
      tickFade: (d: number) => void;
    };
  }
  function mkTrack() {
    return { src: { stop: () => {} }, gain: { gain: { value: 0 } }, fade: 0.8 };
  }
  it('curMusic=0 时旧曲立即归零停播,不再拖 200 帧尾巴（LegacyAudioSystem.cs:338-340）', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    p.curMusic = 0;
    const old = mkTrack();
    p.pool.set(4, old);
    p.tickFade(0.005);
    expect(old.fade).toBe(0);
    expect(old.gain.gain.value).toBe(0);
    expect([...p.pool.keys()].includes(4)).toBe(false);   // 硬停拆轨
  });
  it('主曲可闻(fade>0.25)才渐熄非主曲；不可闻时冻结(:335-337)', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    p.curMusic = 21;
    const main = mkTrack(); main.fade = 0.1;
    const other = mkTrack();
    p.pool.set(21, main);
    p.pool.set(4, other);
    p.tickFade(0.005);
    expect(other.fade).toBe(0.8);            // 主曲淡入未达可闻线 → 冻结
    main.fade = 0.9;
    p.tickFade(0.005);
    expect(other.fade).toBeCloseTo(0.795, 6); // 可闻后正常 -0.005 渐熄
  });
  it('曲目级音量修正：TOW 族 62-88 ×0.9 / Storm 52 ×1.15 钳 1(Main.cs:11699-11705)', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    p.volume = 1;
    p.moonNum = 1;
    const tow = mkTrack(); tow.fade = 1;
    const storm = mkTrack(); storm.fade = 1;
    const plain = mkTrack(); plain.fade = 1;
    p.pool.set(70, tow);
    p.pool.set(52, storm);
    p.pool.set(1, plain);
    p.curMusic = 1;
    p.tickFade(0.005);
    // 非主曲先衰减一帧 1→0.995 再乘修正：TOW=0.995×0.9；Storm=0.995×1.15 钳 1
    expect(tow.gain.gain.value).toBeCloseTo(0.8955, 6);
    expect(storm.gain.gain.value).toBe(1);
    expect(plain.gain.gain.value).toBeCloseTo(1, 6);
  });
});

describe('R22-⑦ NPC 溅落翻案+逐分支静音名单（Collision_WaterCollision :94195-94418）', () => {
  function makeHost(o: {
    vanillaId?: number | null; aiStyle?: number; noGravity?: boolean;
    shimmerWet?: boolean; honeyWet?: boolean; lavaWet?: boolean;
  }) {
    return {
      x: 0, y: 0, w: 16, h: 16, vx: 0, vy: 0, cx: 8, cy: 8,
      vanillaId: o.vanillaId ?? null, vanilla: { aiStyle: o.aiStyle ?? -1, noGravity: o.noGravity ?? false },
      ai0: 0, wet: false, wetCount: 0,
      honeyWet: o.honeyWet ?? false, shimmerWet: o.shimmerWet ?? false,
      lavaWet: o.lavaWet ?? false, lavaCd: 0, onFireT: 0, onFire3T: 0,
      inWater: false, liqFactor: 1, def: {},
      hurt: () => {},
    } as unknown as Parameters<typeof splashDecision>[0];
  }
  it('翻案：岩浆出入水有声=Splash_1（原版 if(!lava)/if(!lavaWet) 的 else 支照样播）', () => {
    const slime = makeHost({});
    expect(splashDecision(slime, true, true)).toBe('Splash_1');    // 入岩浆(:94301 else)
    const lavaWet = makeHost({ lavaWet: true });
    expect(splashDecision(lavaWet, false, false)).toBe('Splash_1'); // 出岩浆(:94399 else)
  });
  it('水/微光支用长名单（鸭 362/蛙 361/aiStyle68 静音,615 海豚豁免）；音档不变', () => {
    expect(splashDecision(makeHost({}), true, false)).toBe('Splash_0');
    expect(splashDecision(makeHost({ shimmerWet: true }), true, false)).toBe('Splash_4');
    expect(splashDecision(makeHost({ shimmerWet: true }), false, false)).toBe('Splash_5');
    for (const id of [362, 361, 445]) {
      expect(splashDecision(makeHost({ vanillaId: id }), true, false)).toBeNull();
    }
    expect(splashDecision(makeHost({ aiStyle: 68 }), true, false)).toBeNull();   // 游鸭
    expect(splashDecision(makeHost({ vanillaId: 615 }), true, false)).toBe('Splash_0'); // 海豚恒播
  });
  it('蜂蜜/岩浆支用中名单——鸭蛙在蜜/浆中照播(旧实现误杀)', () => {
    const duckInHoney = makeHost({ vanillaId: 362, honeyWet: true });
    expect(splashDecision(duckInHoney, true, false)).toBe('Splash_1');
    const duckInLava = makeHost({ vanillaId: 362 });
    expect(splashDecision(duckInLava, true, true)).toBe('Splash_1');
    expect(splashDecision(makeHost({ aiStyle: 1 }), true, false)).toBeNull();    // 史莱姆族仍静
  });
  it('无重力族全分支静音(noGravity 在所有名单尾)', () => {
    expect(splashDecision(makeHost({ noGravity: true }), true, false)).toBeNull();
    expect(splashDecision(makeHost({ noGravity: true }), true, true)).toBeNull();
  });
});


describe('R22 附带修正（同域数据面）', () => {
  it('拾币池=Coin_0-4 五变体(case38 Next(5));不再混入掉落叮当 Coins.wav(case18)', () => {
    expect(WAV_MAP.coin).toEqual(['Coin_0', 'Coin_1', 'Coin_2', 'Coin_3', 'Coin_4']);
  });
  it('tink/place 补齐第 3 变体（case21 Next(3)/PlaySound(0)=Dig 全 3）', () => {
    expect(WAV_MAP.tink).toEqual(['Tink_0', 'Tink_1', 'Tink_2']);
    expect(WAV_MAP.place).toEqual(['Dig_0', 'Dig_1', 'Dig_2']);
  });
  it('风声 cue45 循环层入口就位(setWind,驱动侧 Game.applyWeatherLoops 待接线)', () => {
    const s = new Sfx();
    expect(typeof s.setWind).toBe('function');
  });
});
