// R26 蓝队回归——通用武器使用管线+权威表基建轮(红队报告 /tmp/recon/red-team-r26.md):
//   ① GAP-R26-03 多发/单扣魔:spray 族(useTime<useAnimation)发数=1+⌊(A−1)/U⌋、
//      复用冷却抬到整窗(sprayCyclePlan 纯函数 + Game 接线面源断言)
//   ② GAP-R26-05 Item 音库三组槽语义:default Stop-then-play / 53·55·159 在播跳过 /
//      9·10·24·26·34·43·103·156·162·205 例外不停播(FakeCtx 行为级直证)
//   ③ GAP-R26-06 Item_1 三变体轮换:Next(3) 随机 Item_1/18/19(LegacySoundPlayer.cs:556-563)
//   ④ getSlowMagicScalar 数值档(通道前批已在,本文件补 R26 口径断言)
//   ⑤ GAP-R26-07 reuseDelay 消费:REUSE_DELAY_TICKS 对账 vanilla-shoot-table.json
//      (R26 提取器产物,只读)+ useSwing 门子句源断言
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sprayCyclePlan, REUSE_DELAY_TICKS } from '../src/core/Game';
import { Sfx } from '../src/core/Sfx';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';

// ==================== ① GAP-03 多发/单扣魔:spray 周期计划 ====================
describe('sprayCyclePlan(R26 GAP-03 节拍真值,红队 §1.1 精确式)', () => {
  // 注:本表用提取器原始 useAnimation;Game 集成传 swing.dur(style5+autoReuse 件
  // 多 +1 补间帧,见下方独立用例——Golden Shower 集成发数=4 非 3)
  it('11 件 multishotPerCycle 清单逐件发数(vanilla-shoot-table useTime/useAnimation)', () => {
    // [vid, A, U, 预期发数]——A/U 取 tools/golden/vanilla-shoot-table.json
    const cases: Array<[string, number, number, number]> = [
      ['157 Aqua Scepter', 16, 8, 2],
      ['1178 Leaf Blower', 15, 5, 3],
      ['1336 Golden Shower', 18, 6, 3],
      ['1931 Blizzard Staff', 10, 5, 2],
      ['3053 Shadowflame Hex Doll', 21, 7, 3],
      ['3787 Sky Fracture', 12, 4, 3],
      ['3852 Book Staff', 25, 3, 9],       // ★不整除:1+⌊24/3⌋=9(R27 ⌊A/U⌋=8 少一发)
      ['4270 Sharp Tears', 33, 11, 3],
      ['4952 Fairy Queen Magic Item', 36, 2, 18],
      ['6152 Daybloom Staff', 40, 4, 10],
      ['6173 ArcSurge', 18, 6, 3],
    ];
    for (const [name, a, u, shots] of cases) {
      const plan = sprayCyclePlan(a, u);
      expect(plan, name).not.toBeNull();
      expect(plan!.shots, `${name} 发数`).toBe(shots);
      expect(plan!.window, `${name} 复用窗=动画全长`).toBe(a);
    }
  });
  it('非 spray(U>=A/零值)返回 null——旧冷却模型不动', () => {
    expect(sprayCyclePlan(20, 20)).toBeNull();
    expect(sprayCyclePlan(12, 20)).toBeNull();   // U>A
    expect(sprayCyclePlan(0, 5)).toBeNull();
    expect(sprayCyclePlan(18, 0)).toBeNull();
  });
  it('Game 集成口径:animDur 取 swing.dur(style5+autoReuse 含 +1 补间帧,1458 :4451)', () => {
    // Golden Shower 实际窗 = 18+1 =19 → 发数 1+⌊18/6⌋=4——原版单击语义:flag4 在
    // anim=1 时仍放行(ItemCheck_OwnerOnlyCode :43871 itemAnimation>0 门),末帧补发。
    // 探针 spawnTicks=[0,6,12,18](绝对系)已证。红队 ⌈A/U⌉=3 未计此帧
    expect(sprayCyclePlan(19, 6)?.shots).toBe(4);
  });
});

// ==================== ⑤ GAP-07 reuseDelay 表对账 + useSwing 门子句 ====================
describe('REUSE_DELAY_TICKS vs vanilla-shoot-table.json(R26 提取器权威,只读对账)', () => {
  const table = JSON.parse(readFileSync(
    fileURLToPath(new URL('../tools/golden/vanilla-shoot-table.json', import.meta.url)), 'utf8',
  )) as { items: Record<string, { reuseDelay?: number }> };
  it('32 件 rd>0 全量收录且逐值相等(diff1457Items=0 基准)', () => {
    const golden = new Map<number, number>();
    for (const [id, e] of Object.entries(table.items)) {
      if ((e.reuseDelay ?? 0) > 0) golden.set(Number(id), e.reuseDelay!);
    }
    expect(golden.size).toBe(32);
    for (const [id, rd] of golden) {
      expect(REUSE_DELAY_TICKS[id], `vid ${id} reuseDelay`).toBe(rd);
    }
    // 反向:我方表无多余条目
    expect(Object.keys(REUSE_DELAY_TICKS).length).toBe(golden.size);
  });

  it('useSwing:+1 帧门含 reuseDelay==0 子句(:4451)+ 后摇并入动画尾(源断言)', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/core/Game.ts', import.meta.url)), 'utf8');
    // +1 门子句(1458 ApplyItemAnimation :4451 `sItem.reuseDelay == 0`)
    expect(src).toMatch(/reuseDelayOf\(vid\) === 0\) extra = 1/);
    // ApplyReuseDelay 后摇窗并入(useSwing 尾部 dur += )
    expect(src).toMatch(/dur \+= reuseDelayOf\(vid\);/);
    // yoyo/flail 派发点收口(cycleCooldown)
    expect(src).toMatch(/this\.player\.useTime = this\.cycleCooldown\(critVid, cw\.useTime\)/);
  });
});

// ==================== ④ getSlowMagicScalar 数值档(1458 Player.cs:47442-47451) ====================
describe('getSlowMagicScalar 蓝空标量通道(R28/R29 弹侧消费口径)', () => {
  it('常态 1 / 空蓝 slowMagicUse 恒 2.5(GetSlowMagicMultiplier private static)', () => {
    const world = new World(60, 30, 42, '测试');
    const p = new Player(40 * 16, 15 * 16, new Inventory());
    void world;
    p.slowMagicUse = false;
    expect(p.getSlowMagicScalar()).toBe(1);
    p.slowMagicUse = true;
    expect(p.getSlowMagicScalar()).toBe(2.5);
    // 与 UseTime/Rate 三通道并列的换算关系(rate=1/scalar)
    expect(p.getSlowMagicUseRate()).toBeCloseTo(1 / p.getSlowMagicScalar());
    // 四件待接线武器消费口径(登记债:P1/P3/P4/P6——实装时经本通道取值):
    //   2795 LaserMachinegun ai[1]+=rate + frameCounter≥4×scalar + soundDelay=(24−6×档)×scalar
    //   3269 MedusaHead 石化阈值 (int)(60×scalar)/4;2796 免疫帧 GetSlowMagicUseTime(5);
    //   3852 BookStaff MovementVector 携 slowMagicUse.ToInt()
    expect(Player.SLOW_MAGIC_MULTIPLIER).toBe(2.5);
  });
});

// ==================== ②③ GAP-05/06 Sfx Item 音库槽语义 + Item_1 轮换 ====================
// ---- FakeCtx(weather-visual.test.ts / sound-overrides.test.ts 同款,补 playbackRate) ----
class FakeGain {
  gain = { value: 0, setTargetAtTime: vi.fn() };
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}
class FakeSrc {
  buffer: unknown = null;
  loop = false;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  connect = vi.fn(() => this);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeCtx {
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

const windowBackup = (globalThis as { window?: unknown }).window;
const fetchBackup = (globalThis as { fetch?: unknown }).fetch;
const docBackup = (globalThis as { document?: unknown }).document;

/** 解码链排空(fetch→decode→buffers 缓存落位),此后 playWavFile 走同步 startBuffer */
const settle = () => new Promise((r) => setTimeout(r, 20));
/** 该文件已起的未停 source 数 */
function liveSrcCount(): number {
  let n = 0;
  for (const ctx of FakeCtx.instances) {
    for (const r of (ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.results) {
      const s = r.value as FakeSrc;
      if (s.start.mock.calls.length > 0 && s.stop.mock.calls.length === 0) n++;
    }
  }
  return n;
}

beforeEach(() => {
  FakeCtx.instances = [];
  // node 环境无 document(Sfx.ensure 的失焦闸要读 document.hidden)——最小桩
  (globalThis as { document?: unknown }).document = {
    addEventListener: vi.fn(),
    hidden: false,
  };
  (globalThis as { window?: unknown }).window = { AudioContext: FakeCtx as unknown as typeof AudioContext };
  (globalThis as { fetch?: unknown }).fetch = vi.fn(async (u: unknown) =>
    ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8), url: String(u) }) as unknown as Response);
});
afterEach(() => {
  (globalThis as { window?: unknown }).window = windowBackup;
  (globalThis as { fetch?: unknown }).fetch = fetchBackup;
  (globalThis as { document?: unknown }).document = docBackup;
  vi.restoreAllMocks();
});

describe('GAP-05:Item 音库三组槽语义(LegacySoundPlayer case 2 :555-643)', () => {
  it('default 组 Stop-then-play:Item_13 连发两次 → 旧实例被 .stop() 后新实例起振(单实例替换)', async () => {
    const sfx = new Sfx();
    expect(sfx.playWavFile('Item_13')).toBe(true);   // 首播走 deferPlay(异步补播)
    await settle();
    expect(sfx.playWavFile('Item_13')).toBe(true);   // 已命中缓存 → 同步路径
    const srcs: FakeSrc[] = [];
    for (const ctx of FakeCtx.instances) {
      for (const r of (ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.results) srcs.push(r.value as FakeSrc);
    }
    const played = srcs.filter((s) => s.start.mock.calls.length > 0);
    expect(played.length).toBe(2);
    expect(played[0].stop.mock.calls.length).toBe(1);   // ★先停旧(:600-603 SoundInstanceItem[num].Stop())
    expect(liveSrcCount()).toBe(1);                     // 只剩最新实例在响
  });

  it('在播跳过组:Item_53 在播期间再触发 → return false 不起第二实例(:555-561)', async () => {
    const sfx = new Sfx();
    sfx.playWavFile('Item_53');
    await settle();
    const before = liveSrcCount();
    expect(sfx.playWavFile('Item_53')).toBe(false);   // State==Playing → return null 同语义
    expect(liveSrcCount()).toBe(before);
    // 例外组对照:Item_9 自由叠响(Crystal Storm 连发音墙=原版真态,:604-615)
    expect(sfx.playWavFile('Item_9')).toBe(true);
    await settle();                                     // 首播走 deferPlay,排空后计数
    expect(liveSrcCount()).toBe(before + 1);
  });

  it('不停播例外清单 10 件全在 OVERLAP_OK(源断言 :604-615 清单逐值)', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/core/Sfx.ts', import.meta.url)), 'utf8');
    for (const f of ['Item_9', 'Item_10', 'Item_24', 'Item_26', 'Item_34', 'Item_43',
      'Item_103', 'Item_156', 'Item_162', 'Item_205']) {
      expect(src).toContain(`'${f}'`);
    }
    // 在播跳过组三件
    for (const f of ['Item_53', 'Item_55', 'Item_159']) {
      expect(src).toContain(`'${f}'`);
    }
  });
});

describe('GAP-06:Item_1 三变体随机轮换(LegacySoundPlayer.cs:556-563 Next(3))', () => {
  it('roll=0/1/2 分别落到 Item_1/Item_18/Item_19(fetch URL 直证)', async () => {
    for (const [rollPct, expected] of [[0.0, 'Item_1'], [0.4, 'Item_18'], [0.8, 'Item_19']] as const) {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(rollPct);
      const sfx = new Sfx();
      const urls: string[] = [];
      (globalThis as { fetch?: unknown }).fetch = vi.fn(async (u: unknown) => {
        urls.push(String(u));
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
      });
      sfx.playWavFile('Item_1');
      await settle();
      expect(urls.some((u) => u.includes(`sounds/${expected}.wav`)),
        `roll ${rollPct} → ${expected}`).toBe(true);
      spy.mockRestore();
    }
  });
  it('轮换是随机场非顺序序列:同一输入点连续 N 播只产生三种文件且都可达(分布抽样)', async () => {
    const sfx = new Sfx();
    const urls = new Set<string>();
    const origFetch = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = vi.fn(async (u: unknown) => {
      urls.add(String(u).split('?')[0]);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
    });
    for (let i = 0; i < 60; i++) sfx.playWavFile('Item_1');
    await settle();
    (globalThis as { fetch?: unknown }).fetch = origFetch;
    const variants = [...urls].filter((u) => /sounds\/Item_(1|18|19)\.wav$/.test(u));
    expect(variants.length).toBeGreaterThanOrEqual(2);   // 60 抽 3 类,缺 2 类概率 <1e-11
    for (const v of variants) expect(v).toMatch(/Item_(1|18|19)\.wav$/);
  });
});
