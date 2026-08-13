// 天气视觉三件测试：雨云/风暴云选型链 + AmbientSky 选族纯函数 + 天气环境音循环
// 标杆 Terarria1456：Cloud.cs addCloud :114-138 / AmbientSky.cs FadingSkyEntity 家族 /
// AmbienceServer.cs :30-133 / SceneState.cs :190-291 暴风雪双轨。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pickCloudType, pickAmbientFamily, type AmbientSpawnInput } from '../src/render/SkyRenderer';
import { WeatherState, type WeatherCtx, type WeatherLoopVolumes } from '../src/world/weather/Weather';
import { Sfx, LOOP_BASE_VOL } from '../src/core/Sfx';

// ---------- 工具：可控掷点序列（对齐 C# rand.Next 语义） ----------
function seqRnd(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}
const always = (v: number) => () => v;

const cloudBase = {
  scale: 0.9, y: -100, viewH: 1080,
  numClouds: 100, cloudAlpha: 0, cloudBGActive: 0,
};

describe('云选型链（Cloud.cs:114-138 五族）', () => {
  it('下雨（cloudAlpha>0 且 3/4 掷中）→ 风暴云 18-21', () => {
    // 掷序：type 基值 Next(4)=0.x → 0；雨门 Next(4)!=0 → 0.5 命中（≠0 成立）→ 进风暴支；
    // 再掷 Next(18,22)=0.0 → type 18
    const pick = pickCloudType({ ...cloudBase, cloudAlpha: 0.5, rnd: seqRnd([0.1, 0.5, 0.0]) });
    expect(pick.type).toBeGreaterThanOrEqual(18);
    expect(pick.type).toBeLessThanOrEqual(21);
    expect(pick.stormShift).toBe(0);   // scale 0.9 < 1 → 不上移
  });

  it('阴天（cloudBGActive≥1 且 1/2 掷中）也走风暴云；scale≥1 两档上移共 300', () => {
    // 掷序：基值 Next(4)=0.0 → 0；阴天门 Next(2)==0 → 0.0 命中；Next(18,22)=0.99 → 21
    const pick = pickCloudType({
      ...cloudBase, scale: 1.2, cloudAlpha: 0, cloudBGActive: 1, rnd: seqRnd([0.0, 0.0, 0.99]),
    });
    expect(pick.type).toBe(21);
    expect(pick.stormShift).toBe(300);   // 1.2≥1.15 → 150；1.2≥1 → 150
  });

  it('晴天高空小云 + 云量≤80 → 远空灰云 9-13（雨来时被 kill 的那族）', () => {
    const pick = pickCloudType({
      ...cloudBase, scale: 0.8, y: -300, numClouds: 40, rnd: seqRnd([0.1, 0.3]),
    });
    // y=-300 < -0.15*1080=-162 且 numClouds=40≤80 → 9+floor(0.3*5)=10
    expect(pick.type).toBeGreaterThanOrEqual(9);
    expect(pick.type).toBeLessThanOrEqual(13);
    expect(pick.stormShift).toBe(0);
  });

  it('阴天高空（风暴门 1/2 未中 → scale<1.15 且 y<-0.3H）→ 高层薄云 4-8', () => {
    // 掷序：基值 0.1 → 0；阴天门 Next(2)=floor(0.9*2)=1 未中 → 落 else-if 链；
    // y=-400 < -324 且 cloudBGActive≥1 → 4+floor(0.4*5)=6
    const pick = pickCloudType({
      ...cloudBase, scale: 1.0, y: -400, cloudBGActive: 1, rnd: seqRnd([0.1, 0.9, 0.4]),
    });
    expect(pick.type).toBeGreaterThanOrEqual(4);
    expect(pick.type).toBeLessThanOrEqual(8);
    expect(pick.stormShift).toBe(0);
  });

  it('晴天低空（y>-0.15H）且 1/2 掷中且云量>20 → 低空白云 14-17', () => {
    const pick = pickCloudType({
      ...cloudBase, scale: 1.2, y: 100, numClouds: 60, rnd: seqRnd([0.1, 0.0, 0.3]),
    });
    // 前两支不满足（cloudAlpha=0/阴天=0、第二支 y>-162 但 scale≥1 且 numClouds>80 不成立）
    // → 低空支：Next(2)==0 → 0.0 命中 → Next(14,18)=0.3 → 14+1=15
    expect(pick.type).toBeGreaterThanOrEqual(14);
    expect(pick.type).toBeLessThanOrEqual(17);
  });

  it('全部掷空 → 缺省常态云 0-3', () => {
    const pick = pickCloudType({ ...cloudBase, scale: 1.2, y: 100, numClouds: 10, rnd: always(0.9) });
    expect(pick.type).toBe(3);   // Next(4)=floor(0.9*4)=3，各后续掷不命中
    expect(pick.stormShift).toBe(0);
  });

  it('雨中大概率出风暴云（分布抽样：1000 次里 ≥700 次 18-21）', () => {
    let storm = 0;
    for (let i = 0; i < 1000; i++) {
      const pick = pickCloudType({ ...cloudBase, cloudAlpha: 0.8, rnd: Math.random });
      if (pick.type >= 18 && pick.type <= 21) storm++;
    }
    // 原版雨门 = rand.Next(4)!=0 → 3/4 = 75%
    expect(storm).toBeGreaterThanOrEqual(700);
    expect(storm).toBeLessThanOrEqual(800);
  });
});

describe('AmbientSky 选族纯函数（AmbienceServer.cs:30-133）', () => {
  const base: AmbientSpawnInput = {
    dayTime: true, raining: false, eclipse: false,
    bloodMoon: false, pumpkinMoon: false, snowMoon: false,
    zoneHallow: false, playerAtSkyHeight: true,
    roll5: 4, pick: 0,
  };
  it('晴天白天 → 鸟群（IsSunnyDay :30-37/:60）', () => {
    expect(pickAmbientFamily(base)).toBe('birds');
  });
  it('平静夜 + 神圣带 + roll5≥3 → 腹足怪（严格列表 :115-118）', () => {
    expect(pickAmbientFamily({ ...base, dayTime: false, zoneHallow: true, roll5: 3 })).toBe('gastropod');
  });
  it('平静夜 + 非神圣 + roll5<3 → 放宽列表仍可选腹足怪（:119-123 60% 忽略次级条件）', () => {
    expect(pickAmbientFamily({ ...base, dayTime: false, zoneHallow: false, roll5: 2 })).toBe('gastropod');
  });
  it('平静夜 + 非神圣 + roll5≥3 → 严格列表空 → 回落放宽列表', () => {
    expect(pickAmbientFamily({ ...base, dayTime: false, zoneHallow: false, roll5: 4 })).toBe('gastropod');
  });
  it('雨天 / 夜晚(鸟群) / 日食 → 各族失格', () => {
    expect(pickAmbientFamily({ ...base, raining: true })).toBeNull();
    expect(pickAmbientFamily({ ...base, dayTime: false })).toBe('gastropod'); // 夜只剩腹足怪候选
    expect(pickAmbientFamily({ ...base, eclipse: true })).toBeNull();
  });
  it('血月/南瓜月/霜月 → 平静夜不成立 → null', () => {
    expect(pickAmbientFamily({ ...base, dayTime: false, bloodMoon: true, zoneHallow: true, roll5: 4 })).toBeNull();
    expect(pickAmbientFamily({ ...base, dayTime: false, pumpkinMoon: true, zoneHallow: true, roll5: 4 })).toBeNull();
    expect(pickAmbientFamily({ ...base, dayTime: false, snowMoon: true, zoneHallow: true, roll5: 4 })).toBeNull();
  });
  it('玩家低于天空高度带（surface*16+1600）→ 不出天空装饰（:190-193）', () => {
    expect(pickAmbientFamily({ ...base, playerAtSkyHeight: false })).toBeNull();
  });
});

// ---------- 天气环境音循环（Weather 状态机 + SceneState.cs 双轨语义） ----------
const wctx = (over: Partial<WeatherCtx> = {}): WeatherCtx => ({
  dayRate: 1,
  dayTime: true,
  dayTimeTicks: 10000,
  playerStrongEnough: true,
  playerReadyForKingSlime: true,
  expertMode: false,
  atmo: 1,
  aboveRockLayer: true,
  graveyardIntensity: 0,
  hardMode: false,
  noOtherEvent: true,
  downedSlimeKing: false,
  maxTilesX: 4200,
  worldSurface: 300,
  viewCenterY: 3000,
  ...over,
});

describe('天气环境音循环（Weather.updateAmbienceLoops）', () => {
  it('雨量 → rain 轨音量 = cloudAlpha×atmo；沙暴轨 severity 驱动', () => {
    const w = new WeatherState(7);
    w.startRain(true, 0.6);   // instant：cloudAlpha = maxRaining
    const v: WeatherLoopVolumes = w.loopVolumes(1);
    expect(v.rain).toBeCloseTo(0.6, 5);
    expect(v.blizzardStrong).toBe(0);   // 非雪原带
    expect(v.blizzardInside).toBe(0);
    expect(v.sandstorm).toBe(0);
  });

  it('暴风雪双轨：blizzardSoundVolume 0.01/tick 渐入（SceneState.cs:252）；室内/室外互切', () => {
    const w = new WeatherState(11);
    w.startRain(true, 0.8);
    const seen: WeatherLoopVolumes[] = [];
    const c = wctx({ zoneSnow: true, onAmbience: (v) => seen.push(v) });
    for (let i = 0; i < 100; i++) w.update(c);   // 100 帧 → 音量 1.0
    expect(w.blizzardSoundVolume).toBeCloseTo(1, 5);
    // 室外：num13 = min(1, 0.8*2)=1 → strong=1、inside=0（SceneState.cs:253/:276）
    expect(seen[seen.length - 1].blizzardStrong).toBeCloseTo(1, 5);
    expect(seen[seen.length - 1].blizzardInside).toBeCloseTo(0, 5);
    // 进屋（BehindBackwall）：室外强度 0.005/tick 逼近 -0.1 → 钳 0 → strong 归零
    const cIn = wctx({ zoneSnow: true, behindBackwall: true });
    for (let i = 0; i < 300; i++) w.update(cIn);
    const vIn = w.loopVolumes(1);
    expect(vIn.blizzardStrong).toBeCloseTo(0, 5);
    expect(vIn.blizzardInside).toBeGreaterThan(0.5);   // 掩蔽轨接管
    expect(w.outsideWeatherEffect).toBe(0);
  });

  it('非雪原带下雨 → 暴风雪轨不启', () => {
    const w = new WeatherState(13);
    w.startRain(true, 0.8);
    for (let i = 0; i < 200; i++) w.update(wctx({ zoneSnow: false }));
    expect(w.blizzardSoundVolume).toBe(0);
    expect(w.loopVolumes(1).blizzardStrong).toBe(0);
  });

  it('雨停 → blizzardSoundVolume 渐出归零；onAmbience 每帧下发', () => {
    const w = new WeatherState(17);
    w.startRain(true, 0.7);
    let calls = 0;
    const c = wctx({ zoneSnow: true, onAmbience: () => calls++ });
    for (let i = 0; i < 100; i++) w.update(c);
    w.stopRain();
    for (let i = 0; i < 200; i++) w.update(c);
    expect(w.blizzardSoundVolume).toBe(0);
    expect(calls).toBe(300);
  });
});

// ---------- Sfx 循环轨 API（AudioContext mock） ----------
class FakeGain {
  gain = { value: 0, setTargetAtTime: vi.fn() };
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}
class FakeSrc {
  buffer: unknown = null;
  loop = false;
  connect = vi.fn(() => this);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeCtx {
  /** 记录每次 new（Sfx.ensure 内部 new AC()）——测试从末位取实例 */
  static instances: FakeCtx[] = [];
  currentTime = 0;
  state = 'running';
  destination = {};
  resume = vi.fn(() => Promise.resolve());
  createGain = vi.fn(() => new FakeGain());
  createBufferSource = vi.fn(() => new FakeSrc());
  decodeAudioData = vi.fn(async () => ({ fake: 'buffer' }) as unknown as AudioBuffer);
  constructor() { FakeCtx.instances.push(this); }
}

describe('Sfx.playLoop 循环轨 API', () => {
  const windowBackup = (globalThis as { window?: unknown }).window;
  const fetchBackup = (globalThis as { fetch?: unknown }).fetch;
  beforeEach(() => {
    FakeCtx.instances = [];
    (globalThis as { window?: unknown }).window = { AudioContext: FakeCtx as unknown as typeof AudioContext };
    (globalThis as { fetch?: unknown }).fetch = vi.fn(async () =>
      ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response);
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = windowBackup;
    (globalThis as { fetch?: unknown }).fetch = fetchBackup;
  });

  it('缺素材轨（sandstormWind）→ null，不触音频', () => {
    const sfx = new Sfx();
    expect(sfx.playLoop('sandstormWind', 0.3)).toBeNull();
  });

  it('blizzardStrong：句柄起振/音量跟随/停止；基础音量 0.5 生效', async () => {
    const sfx = new Sfx();
    sfx.master = 1;
    const h = sfx.playLoop('blizzardStrong', 0.6);
    expect(h).not.toBeNull();
    expect(h!.playing).toBe(false);   // 缓冲在途
    // 等 fetch → arrayBuffer → decodeAudioData 微任务链
    await new Promise((r) => setTimeout(r, 20));
    expect(h!.playing).toBe(true);
    expect(h!.dead).toBe(false);   // 解码在途/已起振都非终态——调用方勿重建
    const fake = FakeCtx.instances[FakeCtx.instances.length - 1];
    const gain = fake.createGain.mock.results[0].value as FakeGain;
    const src = fake.createBufferSource.mock.results[0].value as FakeSrc;
    expect(src.loop).toBe(true);
    expect(src.start).toHaveBeenCalled();
    // 基础音量（SoundID.cs:821 WithVolume(0.5)）× 0.6
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.6 * LOOP_BASE_VOL.blizzardStrong, 0, 0.2);
    h!.setVolume(1);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(LOOP_BASE_VOL.blizzardStrong, 0, 0.2);
    h!.stop();
    expect(h!.playing).toBe(false);
    expect(h!.dead).toBe(true);    // 终态——可丢弃重建
    expect(src.stop).toHaveBeenCalled();
    // 幂等 stop
    h!.stop();
    expect(src.stop).toHaveBeenCalledTimes(1);
  });

  it('缓冲加载失败 → dead=true（可重建，不泄漏）', async () => {
    (globalThis as { fetch?: unknown }).fetch = vi.fn(async () =>
      ({ ok: false }) as unknown as Response);
    const sfx = new Sfx();
    const h = sfx.playLoop('blizzardInside', 0.5);
    expect(h).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(h!.playing).toBe(false);
    expect(h!.dead).toBe(true);
  });

  it('playWav 对缺素材轨安全短路（空映射）', () => {
    const sfx = new Sfx();
    expect(sfx.playWav('sandstormWind', 1)).toBe(false);
  });
});
