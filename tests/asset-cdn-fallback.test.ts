// 分片 CDN 多源回退单测(2026-10-13,方案A):
//   · acceptsCdnMap 受理门(结构性垃圾全拦/正常形状放行)
//   · buildPartCandidates 候选序(cdn 优先 https-only ≤4 / 末位恒同源 / 无 cdn=纯同源)
//   · fetchPartBuffer 回退语义(候选切换/长度不符回卷/字节账净值/全败 null/纯同源轮数)
//   · publish-assets-cdn.mjs 纯函数(包名/版本/双源 URL 派生/发布计划)
import { describe, it, expect } from 'vitest';
import { acceptsCdnMap, buildPartCandidates, type ZipCdnMap } from '../src/net/AssetCache';
import { fetchPartBuffer } from '../src/net/partFetcher';
import { pkgName, npmVersion, npmmirrorFileUrl, jsDelivrFileUrl, derivePlan } from '../scripts/publish-assets-cdn.mjs';

const ORIGIN = '/assets-zip/p1-d3b56b63.zip';
const CDN_MAP: ZipCdnMap = {
  v: 1,
  parts: {
    'p1-d3b56b63.zip': {
      urls: [
        'https://registry.npmmirror.com/@sandboxworld/assets-p1/0.0.0-d3b56b63/files/p1-d3b56b63.zip',
        'https://cdn.jsdelivr.net/npm/@sandboxworld/assets-p1@0.0.0-d3b56b63/p1-d3b56b63.zip',
      ],
    },
  },
};

describe('acceptsCdnMap(受理门)', () => {
  it('正常形状放行', () => {
    expect(acceptsCdnMap(CDN_MAP)).toBe(true);
    expect(acceptsCdnMap({ v: 1, parts: { 'p0-afeea97b.zip': { urls: [], pkg: '@x/y', version: '0.0.0-afeea97b' } } })).toBe(true);
  });
  it('结构性垃圾全拦', () => {
    expect(acceptsCdnMap(null)).toBe(false);
    expect(acceptsCdnMap('x')).toBe(false);
    expect(acceptsCdnMap({ v: 2, parts: {} })).toBe(false);          // 版本不符
    expect(acceptsCdnMap({ v: 1, parts: [] })).toBe(false);          // parts 必须是对象
    expect(acceptsCdnMap({ v: 1, parts: {} })).toBe(false);          // 空分片表
    expect(acceptsCdnMap({ v: 1, parts: { a: 'x' } })).toBe(false);  // 条目缺 urls
    expect(acceptsCdnMap({ v: 1, parts: { a: { no: 1 } } })).toBe(false);
  });
});

describe('buildPartCandidates(候选序)', () => {
  it('cdn URLs 在前,末位恒同源', () => {
    expect(buildPartCandidates('p1-d3b56b63.zip', CDN_MAP)).toEqual([...CDN_MAP.parts['p1-d3b56b63.zip']!.urls, ORIGIN]);
  });
  it('无 cdn/缺该分片条目 = 纯同源(生产行为不变)', () => {
    expect(buildPartCandidates('p1-d3b56b63.zip', null)).toEqual([ORIGIN]);
    expect(buildPartCandidates('p0-afeea97b.zip', CDN_MAP)).toEqual(['/assets-zip/p0-afeea97b.zip']);
    expect(buildPartCandidates('p1-d3b56b63.zip', undefined)).toEqual([ORIGIN]);
  });
  it('消毒:非 https 剔除、上限 4、urls 缺失回同源', () => {
    const dirty: ZipCdnMap = {
      v: 1,
      parts: {
        'p1-d3b56b63.zip': {
          urls: [
            'http://evil.example/x.zip',                          // http 剔除
            'https://a.example/1.zip', 'https://b.example/2.zip',
            'https://c.example/3.zip', 'https://d.example/4.zip', // 截到 4
          ],
        },
      },
    };
    const got = buildPartCandidates('p1-d3b56b63.zip', dirty);
    expect(got).toEqual(['https://a.example/1.zip', 'https://b.example/2.zip', 'https://c.example/3.zip', 'https://d.example/4.zip', ORIGIN]);
    expect(buildPartCandidates('p1-d3b56b63.zip', { v: 1, parts: { 'p1-d3b56b63.zip': { urls: undefined as unknown as string[] } } })).toEqual([ORIGIN]);
  });
});

describe('fetchPartBuffer(回退语义)', () => {
  const ZIP = 8;
  const bytes = (n: number, fill = 1): Response => new Response(new Uint8Array(n).fill(fill), { status: 200 });
  it('首选候选命中 → buf+via=0', async () => {
    const totalGot = { v: 0 };
    const r = await fetchPartBuffer(['https://cdn/x.zip', ORIGIN], ZIP, totalGot, {
      fetchImpl: (async () => bytes(ZIP, 7)) as typeof fetch,
    });
    expect(r?.via).toBe(0);
    expect(r?.buf.byteLength).toBe(ZIP);
    expect(totalGot.v).toBe(ZIP);
  });
  it('首选 500 → 换下一候选;同源兜底命中 via=末位', async () => {
    const totalGot = { v: 0 };
    let call = 0;
    const r = await fetchPartBuffer(['https://cdn/x.zip', ORIGIN], ZIP, totalGot, {
      fetchImpl: (async () => (call++ === 0 ? new Response('', { status: 500 }) : bytes(ZIP))) as typeof fetch,
    });
    expect(r?.via).toBe(1);
    expect(call).toBe(2);
    expect(totalGot.v).toBe(ZIP);
  });
  it('长度不符回卷字节账 + 换候选(账面恒为净值)', async () => {
    const totalGot = { v: 0 };
    let call = 0;
    const r = await fetchPartBuffer(['https://cdn/x.zip', ORIGIN], ZIP, totalGot, {
      // 首选返回 3 字节(≠zipBytes)→ 回卷;同源给全 8
      fetchImpl: (async () => (call++ === 0 ? bytes(3) : bytes(ZIP))) as typeof fetch,
    });
    expect(r?.via).toBe(1);
    expect(totalGot.v).toBe(ZIP);   // 回卷后净值,不残留 3 字节
  });
  it('全部失败 → null,字节账归零', async () => {
    const totalGot = { v: 0 };
    const r = await fetchPartBuffer(['https://cdn/x.zip', ORIGIN], ZIP, totalGot, {
      fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch,
    });
    expect(r).toBeNull();
    expect(totalGot.v).toBe(0);
  });
  it('纯同源单候选 = 旧版 3 轮重试语义', async () => {
    const totalGot = { v: 0 };
    let calls = 0;
    const r = await fetchPartBuffer([ORIGIN], ZIP, totalGot, {
      fetchImpl: (async () => { calls++; return bytes(ZIP); }) as typeof fetch,
    });
    expect(calls).toBe(1);   // 首轮即中
    expect(r?.via).toBe(0);
  });
  it('onBytes 直通读流中瞬时进度;回卷发生在流后(与旧版 dl 直通同语义)', async () => {
    const totalGot = { v: 0 };
    const seen: number[] = [];
    const r = await fetchPartBuffer(['https://cdn/x.zip', ORIGIN], ZIP, totalGot, {
      fetchImpl: (async () => bytes(3)) as typeof fetch,   // 恒长度不符 → 全败
      onBytes: (n) => seen.push(n),
    });
    expect(seen[seen.length - 1]).toBe(3);   // 最后一次直通=读流末的瞬时计数
    expect(totalGot.v).toBe(0);              // 全败后账面回卷归零(净值)
    expect(r).toBeNull();
  });
});

describe('publish-assets-cdn 纯函数(URL 派生)', () => {
  it('包名/版本从内容寻址文件名派生', () => {
    expect(pkgName('@sandboxworld', 'p1-d3b56b63.zip')).toBe('@sandboxworld/assets-p1');
    expect(pkgName('@sandboxworld', 'p0-afeea97b.zip')).toBe('@sandboxworld/assets-p0');
    expect(pkgName('@sandboxworld', 'p13-6a6c6dc1.zip')).toBe('@sandboxworld/assets-p13');
    expect(npmVersion('p1-d3b56b63.zip')).toBe('0.0.0-d3b56b63');
    expect(() => pkgName('@s', 'bad.zip')).toThrow();
  });
  it('双源 URL 形状(npmmirror files API / jsDelivr npm)', () => {
    expect(npmmirrorFileUrl('@sandboxworld/assets-p1', '0.0.0-d3b56b63', 'p1-d3b56b63.zip'))
      .toBe('https://registry.npmmirror.com/@sandboxworld/assets-p1/0.0.0-d3b56b63/files/p1-d3b56b63.zip');
    expect(jsDelivrFileUrl('@sandboxworld/assets-p1', '0.0.0-d3b56b63', 'p1-d3b56b63.zip'))
      .toBe('https://cdn.jsdelivr.net/npm/@sandboxworld/assets-p1@0.0.0-d3b56b63/p1-d3b56b63.zip');
  });
  it('derivePlan:manifest → 全量发布计划(顺序保持)', () => {
    const manifest = {
      algoVersion: 3, contentHash: 'x', totalFiles: 2, totalBytes: 9,
      parts: [
        { file: 'p0-afeea97b.zip', phase: 'menu', files: 1, bytes: 5, zipBytes: 4, entries: ['a'], inputHash: 'h0' },
        { file: 'p1-d3b56b63.zip', phase: 'menu', files: 1, bytes: 4, zipBytes: 5, entries: ['b'], inputHash: 'h1' },
      ],
    };
    const plan = derivePlan(manifest, '@sandboxworld');
    expect(plan.map((p: { pkg: string }) => p.pkg)).toEqual(['@sandboxworld/assets-p0', '@sandboxworld/assets-p1']);
    expect(plan.map((p: { ver: string }) => p.ver)).toEqual(['0.0.0-afeea97b', '0.0.0-d3b56b63']);
    expect(() => derivePlan({ parts: [] }, '@s')).toThrow();
  });
});
