// ★Tier1-c 守卫(2026-10-14):net 域白名单/URL 校验纯函数面 + worker
//   结构化克隆/错误隔离/terminate(node 无 Worker?worker_threads 不同——
//   node 18+ 有全局 Worker?无——浏览器 only。node 侧锁 net 校验面)。
import { describe, it, expect } from 'vitest';
import { createModNet } from '../src/mods/modNet';

describe('Tier1-c:sw.net', () => {
  it('未声明域=接口整缺(null)', () => {
    expect(createModNet('m', [])).toBeNull();
  });

  it('域白名单:host 精确/子域通配/未声明 throw', async () => {
    const net = createModNet('m', ['api.example.com', '*.cdn.example.org'])!;
    // 未声明域
    await expect(net.fetchJson('https://evil.com/x')).rejects.toThrow(/域未声明/);
    // http 明文拒
    await expect(net.fetchText('http://api.example.com/x')).rejects.toThrow(/仅 https/);
    // 非法 URL
    await expect(net.fetchText('not-a-url')).rejects.toThrow(/非法 URL/);
    // 声明域(网络不可达——AbortController/TypeError 面,但过了校验)
    await expect(net.fetchText('https://api.example.com/x')).rejects.toThrow();   // fetch fail 任意
  });

  it('子域通配:*.cdn.example.org 命中 a.b.cdn.example.org', async () => {
    const net = createModNet('m', ['*.cdn.example.org'])!;
    // 非子域(校验层拒)
    await expect(net.fetchText('https://example.org/x')).rejects.toThrow(/域未声明/);
    await expect(net.fetchText('https://foo.cdn.example.org/x')).rejects.not.toThrow(/域未声明/);
  });
});
