// ★Tier1-a 守卫(2026-10-14):sw.storage 持久 KV(node 可测——KvStore LS 兜底)。
//   sw.ui.htmlPage 为浏览器 DOM 面=探针批覆盖;node 侧测 sanitize/scopeCss 纯函数。
import { describe, it, expect, beforeEach } from 'vitest';
import { createModStorage, purgeModStorage, _resetModStorageForTests } from '../src/mods/modStorage';

beforeEach(async () => {
  _resetModStorageForTests();
  await purgeModStorage('tst');
});

describe('Tier1-a:sw.storage 持久 KV', () => {
  it('set/get round-trip(任意 JSON 值)/delete/get null', async () => {
    const s = createModStorage('tst');
    expect(await s.get<{ n: number }>('k1')).toBeNull();
    expect(await s.set('k1', { n: 42, arr: [1, 2], s: 'x' })).toBe(true);
    const back = await s.get<{ n: number; arr: number[]; s: string }>('k1');
    expect(back).toEqual({ n: 42, arr: [1, 2], s: 'x' });
    await s.delete('k1');
    expect(await s.get('k1')).toBeNull();
  });

  it('键空间隔离(前缀 sandboxworld.mods.<modId>.)', async () => {
    const a = createModStorage('tst');
    const b = createModStorage('oth');
    await a.set('shared', 'A');
    await b.set('shared', 'B');
    expect(await a.get('shared')).toBe('A');
    expect(await b.get('shared')).toBe('B');
    // 原始键直查(LS 兜底位)
    expect(localStorage.getItem('sandboxworld.mods.tst.shared')).toBe('"A"');
    await purgeModStorage('tst');
    expect(await a.get('shared')).toBeNull();
    expect(await b.get('shared')).toBe('B');   // 他 mod 不受清账波及
    await purgeModStorage('oth');
  });

  it('配额门:超 2MB 拒写+false', async () => {
    const s = createModStorage('tst');
    const big = 'x'.repeat(2.1 * 1024 * 1024);
    expect(await s.set('big', big)).toBe(false);
    expect(await s.get('big')).toBeNull();
  }, 30_000);
});
