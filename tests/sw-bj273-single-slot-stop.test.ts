// BJ273（2026-09-22 用户报「长按右键连取取物音越来越响」）定谳回归：
// 原版单实例槽【停旧播新】族（LegacySoundPlayer.PlaySound 各 case 对命名槽/
// 逐变体槽先 .Stop() 旧实例再 CreateInstance）在本仓 slotAction 的映射——
// 此前 Menu_Tick 等落 'none'（自由叠响），右键连取加速梯（stackDelay 7→2 拍
// =117→33ms）短于 Menu_Tick 解码时长 71.4ms → 同时在响实例数单调上升=主观
// 渐强，真偏差非原版同相（②gain 累积/③pitch 抖动均证伪：每实例独立 gain
// 恒 1×master、原版 case 12 无 Pitch 赋值本仓 PITCH_CASE['Menu_Tick']=null 同相）。
// 断言三层：
//   ① 结构锁：单槽族逐文件 slotAction==='stop'（逐变体槽=逐文件槽同构）；
//   ② 语义对照：原版本就叠响/另档的不入集（case 4 NPCKilled 覆槽不 Stop→none、
//      case 2 Item_N 维持 R26 三组、case 15 Roar/NPC_Killed_10/NPC_Hit_57=skip）；
//   ③ 行为：同文件连播→旧实例 stop() 被调；'none' 组连播互不截断；每实例
//      独立 gain（无跨实例累积）。
// 原版锚（Terarria1457/Terraria.Audio/LegacySoundPlayer.cs）：case 0 :443-449/
// case 1 :506-517/case 3 :654-674/case 5 :699-707/case 6 :709-719/case 7 :720-730/
// case 8/9 :731-752/case 10/11/12 :753-785/case 13 :786-795/case 4 :693。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Sfx, applySfxPackOverrides } from '../src/core/Sfx';

// ---------- mock AudioContext（node 环境无 WebAudio，同 sfx-first-play 桩族） ----------
let created: MockSrc[] = [];

class MockGain {
  gain = { value: 0, setTargetAtTime: () => {} };
  connect(dest: unknown) { return dest; }
  disconnect() { /* noop */ }
}

class MockSrc {
  buffer: unknown = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  dest: unknown = null;
  stopped = false;
  connect(dest: unknown) { this.dest = dest; return dest; }
  start() { /* 起振 */ }
  stop() { this.stopped = true; }
}

class MockAC {
  state = 'running';
  currentTime = 0;
  destination = {};
  decodeAudioData = async () => ({ duration: 0.071, length: 3144, sampleRate: 44100 } as unknown as AudioBuffer);
  createBufferSource() { const s = new MockSrc(); created.push(s); return s; }
  createGain() { return new MockGain(); }
  async resume() { this.state = 'running'; }
}

const windowBackup = (globalThis as { window?: unknown }).window;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const slotAction = (f: string): string =>
  (Sfx as unknown as { slotAction: (file: string) => string }).slotAction(f);
const stopSet = () => (Sfx as unknown as { SINGLE_SLOT_STOP: Set<string> }).SINGLE_SLOT_STOP;

beforeEach(() => {
  created = [];
  (globalThis as { window?: unknown }).window = { AudioContext: MockAC };
});
afterEach(() => {
  (globalThis as { window?: unknown }).window = windowBackup;
  vi.unstubAllGlobals();
  applySfxPackOverrides(new Map());
});

describe('BJ273 单实例槽停旧播新族（slotAction 映射）', () => {
  it('①结构锁：单槽族逐文件 stop（golden 冻结——增删文件即爆红走重锚）', () => {
    const golden = [
      'Menu_Tick', 'Menu_Open', 'Menu_Close',
      'Grab', 'Door_Opened', 'Door_Closed', 'Shatter', 'Grass',
      'Player_Killed', 'Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2',
      'Dig_0', 'Dig_1', 'Dig_2',
      ...Array.from({ length: 56 }, (_, k) => `NPC_Hit_${k + 1}`),
      'NPC_Hit_58',
    ];
    expect([...stopSet()].sort()).toEqual([...golden].sort());
    for (const f of golden) expect(slotAction(f), f).toBe('stop');
  });

  it('②语义对照：原版覆槽不 Stop/另档族不入集', () => {
    // case 4 NPCKilled 仅覆槽引用不 Stop（:693）→ 'none'（叠响=原版本相）
    for (const f of ['NPC_Killed_1', 'NPC_Killed_23', 'NPC_Killed_68']) {
      expect(slotAction(f), f).toBe('none');
    }
    // 在播跳过族维持 skip：case 15 Roar（:825-841）/case 4 style 10（:689-691）/
    // case 3 style 57（:654-657）/成就音
    for (const f of ['Roar_0', 'Roar_1', 'NPC_Killed_10', 'NPC_Hit_57', 'achievement_complete']) {
      expect(slotAction(f), f).toBe('skip');
    }
    // case 2 Item_N 三组槽维持 R26 面：default stop / 免停 none / 在播跳过 skip
    expect(slotAction('Item_11')).toBe('stop');
    expect(slotAction('Item_9')).toBe('none');
    expect(slotAction('Item_53')).toBe('skip');
    // NPC_Hit 逐变体：57=skip、58=stop（skip 集只吞 57 一档）
    expect(stopSet().has('NPC_Hit_57')).toBe(false);
    expect(slotAction('NPC_Hit_58')).toBe('stop');
  });

  it('③行为：同文件连播先停旧实例（Menu_Tick 右键连取链/Grab 取物/Dig 挖掘逐案）', async () => {
    applySfxPackOverrides(new Map([
      ['Menu_Tick', new Uint8Array(8)], ['Grab', new Uint8Array(8)], ['Dig_0', new Uint8Array(8)],
    ]));
    for (const f of ['Menu_Tick', 'Grab', 'Dig_0']) {
      created = [];
      const sfx = new Sfx();
      expect(sfx.playWavFile(f, 1)).toBe(true);
      await flush();                              // 首调补播完成入缓存
      created = [];
      sfx.playWavFile(f, 1);                      // 第二调同步出声
      sfx.playWavFile(f, 1);                      // 第三调
      expect(created.length).toBe(2);
      expect(created[0].stopped, `${f} 第一实例被第二发截断`).toBe(true);
      expect(created[1].stopped, `${f} 末实例自然播完`).toBe(false);
    }
  });

  it('③行为：none 组连播互不截断（原版覆槽不 Stop 同相）', async () => {
    applySfxPackOverrides(new Map([['NPC_Killed_1', new Uint8Array(8)]]));
    const sfx = new Sfx();
    expect(sfx.playWavFile('NPC_Killed_1', 1)).toBe(true);
    await flush();
    created = [];
    sfx.playWavFile('NPC_Killed_1', 1);
    sfx.playWavFile('NPC_Killed_1', 1);
    expect(created.length).toBe(2);
    expect(created[0].stopped).toBe(false);       // 旧实例不被停=原版叠响
    expect(created[1].stopped).toBe(false);
  });

  it('③行为：每实例独立 gain（无跨实例累积——②假说回归面）', async () => {
    applySfxPackOverrides(new Map([['Menu_Tick', new Uint8Array(8)]]));
    const sfx = new Sfx();
    sfx.master = 1;
    expect(sfx.playWavFile('Menu_Tick', 1)).toBe(true);
    await flush();
    created = [];
    for (let i = 0; i < 4; i++) sfx.playWavFile('Menu_Tick', 1);
    expect(created.length).toBe(4);
    const gains = created.map((s) => (s.dest as MockGain).gain.value);
    for (const g of gains) expect(g).toBeCloseTo(1);   // 恒 1×master,逐实例独立节点
  });
});
