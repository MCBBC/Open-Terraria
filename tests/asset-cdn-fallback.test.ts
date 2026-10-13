// 分片 CDN 多源回退单测(2026-10-13,方案A 二代:npmmirror tarball 国内道):
//   · acceptsCdnMap 受理门(urls/tgzUrls 至少其一;结构性垃圾全拦)
//   · buildPartCandidates 候选序(tgz 优先→zip→末位同源;https-only/≤4/bytes 正数消毒)
//   · fetchPartBuffer 回退语义(候选切换/长度不符回卷/字节账净值/全败 null/轮数)
//   · extractZipFromTgz(真 gzip(tar) 构造:多条目扫描取 .zip)
//   · publish-assets-cdn.mjs 纯函数(包名/版本/tarball URL 派生/发布计划)
import { describe, it, expect } from 'vitest';
import { acceptsCdnMap, buildPartCandidates, type ZipCdnMap } from '../src/net/AssetCache';
import { fetchPartBuffer, extractZipFromTgz } from '../src/net/partFetcher';
import { gzipSync } from 'fflate';
import { pkgName, npmVersion, npmmirrorFileUrl, npmmirrorTarballUrl, jsDelivrFileUrl, derivePlan } from '../scripts/publish-assets-cdn.mjs';

const ORIGIN = '/assets-zip/p1-d3b56b63.zip';
const ZIP_BYTES = 8;
const CDN_MAP: ZipCdnMap = {
  v: 1,
  parts: {
    'p1-d3b56b63.zip': {
      pkg: '@sandboxworld/assets-p1',
      version: '0.0.0-d3b56b63',
      urls: ['https://cdn.jsdelivr.net/npm/@sandboxworld/assets-p1@0.0.0-d3b56b63/p1-d3b56b63.zip'],
      tgzUrls: [{ url: 'https://registry.npmmirror.com/@sandboxworld/assets-p1/-/assets-p1-0.0.0-d3b56b63.tgz', bytes: 999 }],
    },
  },
};

describe('acceptsCdnMap(受理门)', () => {
  it('urls/tgzUrls 至少其一即可;双字段条目放行', () => {
    expect(acceptsCdnMap(CDN_MAP)).toBe(true);
    expect(acceptsCdnMap({ v: 1, parts: { a: { tgzUrls: [{ url: 'https://x/y.tgz', bytes: 1 }] } } })).toBe(true);
    expect(acceptsCdnMap({ v: 1, parts: { a: { urls: [] } } })).toBe(true);
  });
  it('结构性垃圾全拦', () => {
    expect(acceptsCdnMap(null)).toBe(false);
    expect(acceptsCdnMap('x')).toBe(false);
    expect(acceptsCdnMap({ v: 2, parts: {} })).toBe(false);
    expect(acceptsCdnMap({ v: 1, parts: [] })).toBe(false);
    expect(acceptsCdnMap({ v: 1, parts: {} })).toBe(false);
    expect(acceptsCdnMap({ v: 1, parts: { a: 'x' } })).toBe(false);
    expect(acceptsCdnMap({ v: 1, parts: { a: { pkg: '@x/y' } } })).toBe(false);   // urls/tgzUrls 双缺
  });
});

describe('buildPartCandidates(候选序:tgz→zip→同源)', () => {
  it('tgz 优先,zip 次之,末位恒同源(bytes=zipBytes)', () => {
    expect(buildPartCandidates('p1-d3b56b63.zip', ZIP_BYTES, CDN_MAP)).toEqual([
      { url: CDN_MAP.parts['p1-d3b56b63.zip']!.tgzUrls![0]!.url, bytes: 999, kind: 'tgz' },
      { url: CDN_MAP.parts['p1-d3b56b63.zip']!.urls![0], bytes: ZIP_BYTES, kind: 'zip' },
      { url: ORIGIN, bytes: ZIP_BYTES, kind: 'zip' },
    ]);
  });
  it('无 cdn/缺该分片条目 = 纯同源(生产行为不变)', () => {
    expect(buildPartCandidates('p1-d3b56b63.zip', ZIP_BYTES, null)).toEqual([{ url: ORIGIN, bytes: ZIP_BYTES, kind: 'zip' }]);
    expect(buildPartCandidates('p0-afeea97b.zip', 4, CDN_MAP)).toEqual([{ url: '/assets-zip/p0-afeea97b.zip', bytes: 4, kind: 'zip' }]);
  });
  it('消毒:非 https 剔除/tgz.bytes 须正数/上限 4', () => {
    const dirty: ZipCdnMap = {
      v: 1,
      parts: {
        'p1-d3b56b63.zip': {
          tgzUrls: [
            { url: 'http://evil/x.tgz', bytes: 5 },        // http 剔除
            { url: 'https://a/x.tgz', bytes: 0 },          // bytes=0 剔除(长度校验锚失效)
            { url: 'https://b/x.tgz', bytes: 7 },          // 有效
          ],
          urls: ['http://evil2/x.zip', 'https://c/x.zip'],
        },
      },
    };
    expect(buildPartCandidates('p1-d3b56b63.zip', ZIP_BYTES, dirty)).toEqual([
      { url: 'https://b/x.tgz', bytes: 7, kind: 'tgz' },
      { url: 'https://c/x.zip', bytes: ZIP_BYTES, kind: 'zip' },
      { url: ORIGIN, bytes: ZIP_BYTES, kind: 'zip' },
    ]);
  });
});

// ---- tar/tgz 构造与解包 ----
const enc = new TextEncoder();
/** 单条目(头 512 + 数据 512 对齐,无结束块——拼接后由 tarFinalize 统一补) */
function tarEntry(name: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(512);
  header.set(enc.encode(name), 0);
  header.set(enc.encode('0000644'), 100);
  header.set(enc.encode(data.length.toString(8).padStart(11, '0') + '\x00'), 124);   // size:11位八进制+NUL
  header.set(enc.encode('0'), 156);                                                  // typeflag=file
  header.set(enc.encode('ustar\x00'), 257);
  header.fill(0x20, 148, 156);                                                       // checksum 位先空格
  let sum = 0;
  for (const b of header) sum += b;
  header.set(enc.encode(sum.toString(8).padStart(6, '0') + '\x00 '), 148);
  const blocks = Math.ceil(data.length / 512) * 512;
  const out = new Uint8Array(512 + blocks);
  out.set(header, 0);
  out.set(data, 512);
  return out;
}
function tarFinalize(entries: Uint8Array[]): Uint8Array {
  const total = entries.reduce((a, e) => a + e.length, 0) + 1024;
  const out = new Uint8Array(total);
  let off = 0;
  for (const e of entries) { out.set(e, off); off += e.length; }
  return out;   // 尾部 1024 零字节 = 结束块
}

describe('extractZipFromTgz(gzip(tar) → .zip 条目)', () => {
  it('多条目 tar 扫描取 .zip(json 在前);数据区 512 对齐跳过', () => {
    const zipData = enc.encode('PKzip-content-here');
    const merged = tarFinalize([
      tarEntry('package/package.json', enc.encode('{"name":"x"}')),
      tarEntry('package/p1-d3b56b63.zip', zipData),
    ]);
    const got = extractZipFromTgz(gzipSync(merged));
    expect(new TextDecoder().decode(got)).toBe('PKzip-content-here');
  });
  it('无 zip 条目 → 抛错(候选失败语义)', () => {
    expect(() => extractZipFromTgz(gzipSync(tarFinalize([tarEntry('package/package.json', enc.encode('{}'))])))).toThrow();
  });
});

describe('fetchPartBuffer(回退语义,新签名:bytes 随候选)', () => {
  const bytes = (n: number, fill = 1): Response => new Response(new Uint8Array(n).fill(fill), { status: 200 });
  it('tgz 候选命中 → 解包得 zip 字节,via=0', async () => {
    const zipData = enc.encode('PKzip-bytes!');
    const tgz = gzipSync(tarEntry('package/p1.zip', zipData));
    const totalGot = { v: 0 };
    const r = await fetchPartBuffer([
      { url: 'https://npmmirror/x.tgz', bytes: tgz.length, kind: 'tgz' },
      { url: ORIGIN, bytes: zipData.length, kind: 'zip' },
    ], totalGot, { fetchImpl: (async () => new Response(tgz, { status: 200 })) as typeof fetch });
    expect(r?.via).toBe(0);
    expect(new TextDecoder().decode(new Uint8Array(r!.buf))).toBe('PKzip-bytes!');
  });
  it('tgz 解包失败(损坏)→ 回卷换下一候选命中', async () => {
    const junk = new Uint8Array(16).fill(9);   // 非 gzip,gunzipSync 必抛
    const zipData = enc.encode('PKzip-bytes!');
    const totalGot = { v: 0 };
    let call = 0;
    const r = await fetchPartBuffer([
      { url: 'https://npmmirror/x.tgz', bytes: junk.length, kind: 'tgz' },
      { url: ORIGIN, bytes: zipData.length, kind: 'zip' },
    ], totalGot, {
      fetchImpl: (async () => (call++ === 0 ? new Response(junk, { status: 200 }) : new Response(zipData, { status: 200 }))) as typeof fetch,
    });
    expect(r?.via).toBe(1);
    expect(new TextDecoder().decode(new Uint8Array(r!.buf))).toBe('PKzip-bytes!');
    expect(totalGot.v).toBe(zipData.length);   // 失败 tgz 的传输字节已回卷,账面=有效下载净值
  });
  it('首选 500 → 换下一候选;同源兜底 via=末位', async () => {
    const totalGot = { v: 0 };
    let call = 0;
    const r = await fetchPartBuffer([
      { url: 'https://cdn/x.zip', bytes: ZIP_BYTES, kind: 'zip' },
      { url: ORIGIN, bytes: ZIP_BYTES, kind: 'zip' },
    ], totalGot, {
      fetchImpl: (async () => (call++ === 0 ? new Response('', { status: 500 }) : bytes(ZIP_BYTES))) as typeof fetch,
    });
    expect(r?.via).toBe(1);
    expect(totalGot.v).toBe(ZIP_BYTES);
  });
  it('长度不符回卷字节账 + 换候选(账面恒为净值)', async () => {
    const totalGot = { v: 0 };
    let call = 0;
    const r = await fetchPartBuffer([
      { url: 'https://cdn/x.zip', bytes: ZIP_BYTES, kind: 'zip' },
      { url: ORIGIN, bytes: ZIP_BYTES, kind: 'zip' },
    ], totalGot, {
      fetchImpl: (async () => (call++ === 0 ? bytes(3) : bytes(ZIP_BYTES))) as typeof fetch,
    });
    expect(r?.via).toBe(1);
    expect(totalGot.v).toBe(ZIP_BYTES);
  });
  it('全部失败 → null,字节账归零', async () => {
    const totalGot = { v: 0 };
    const r = await fetchPartBuffer([
      { url: 'https://cdn/x.zip', bytes: ZIP_BYTES, kind: 'zip' },
      { url: ORIGIN, bytes: ZIP_BYTES, kind: 'zip' },
    ], totalGot, { fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch });
    expect(r).toBeNull();
    expect(totalGot.v).toBe(0);
  });
  it('onBytes 直通读流中瞬时进度;回卷发生在流后(与旧版 dl 直通同语义)', async () => {
    const totalGot = { v: 0 };
    const seen: number[] = [];
    const r = await fetchPartBuffer([
      { url: 'https://cdn/x.zip', bytes: ZIP_BYTES, kind: 'zip' },
      { url: ORIGIN, bytes: ZIP_BYTES, kind: 'zip' },
    ], totalGot, {
      fetchImpl: (async () => bytes(3)) as typeof fetch,   // 恒长度不符 → 全败
      onBytes: (n) => seen.push(n),
    });
    expect(seen[seen.length - 1]).toBe(3);
    expect(totalGot.v).toBe(0);
    expect(r).toBeNull();
  });
});

describe('publish-assets-cdn 纯函数(URL 派生)', () => {
  it('包名/版本从内容寻址文件名派生', () => {
    expect(pkgName('@sandboxworld', 'p1-d3b56b63.zip')).toBe('@sandboxworld/assets-p1');
    expect(pkgName('@sandboxworld', 'p13-6a6c6dc1.zip')).toBe('@sandboxworld/assets-p13');
    expect(npmVersion('p1-d3b56b63.zip')).toBe('0.0.0-d3b56b63');
    expect(() => pkgName('@s', 'bad.zip')).toThrow();
  });
  it('tarball URL:scoped 包 basename 剥 scope(npm 规则)', () => {
    expect(npmmirrorTarballUrl('@sandboxworld/assets-p1', '0.0.0-d3b56b63'))
      .toBe('https://registry.npmmirror.com/@sandboxworld/assets-p1/-/assets-p1-0.0.0-d3b56b63.tgz');
    expect(npmmirrorFileUrl('@sandboxworld/assets-p1', '0.0.0-d3b56b63', 'p1-d3b56b63.zip'))
      .toBe('https://registry.npmmirror.com/@sandboxworld/assets-p1/0.0.0-d3b56b63/files/p1-d3b56b63.zip');
    expect(jsDelivrFileUrl('@sandboxworld/assets-p1', '0.0.0-d3b56b63', 'p1-d3b56b63.zip'))
      .toBe('https://cdn.jsdelivr.net/npm/@sandboxworld/assets-p1@0.0.0-d3b56b63/p1-d3b56b63.zip');
  });
  it('derivePlan:manifest → 全量发布计划(顺序保持,含 tgz 通道)', () => {
    const manifest = {
      algoVersion: 3, contentHash: 'x', totalFiles: 2, totalBytes: 9,
      parts: [
        { file: 'p0-afeea97b.zip', phase: 'menu', files: 1, bytes: 5, zipBytes: 4, entries: ['a'], inputHash: 'h0' },
        { file: 'p1-d3b56b63.zip', phase: 'menu', files: 1, bytes: 4, zipBytes: 5, entries: ['b'], inputHash: 'h1' },
      ],
    };
    const plan = derivePlan(manifest, '@sandboxworld');
    expect(plan.map((p: { pkg: string }) => p.pkg)).toEqual(['@sandboxworld/assets-p0', '@sandboxworld/assets-p1']);
    expect(plan.map((p: { npmmirrorTgzUrl: string }) => p.npmmirrorTgzUrl)).toEqual([
      'https://registry.npmmirror.com/@sandboxworld/assets-p0/-/assets-p0-0.0.0-afeea97b.tgz',
      'https://registry.npmmirror.com/@sandboxworld/assets-p1/-/assets-p1-0.0.0-d3b56b63.tgz',
    ]);
    expect(() => derivePlan({ parts: [] }, '@s')).toThrow();
  });
});

// ---- 三代加固(2026-10-13 生产切源前):黑洞超时 + 嫌疑降级 ----
import { demoteSuspicious } from '../src/net/partFetcher';

describe('demoteSuspicious(嫌疑降级排序)', () => {
  const A = { url: 'https://npmmirror/x.tgz', bytes: 1, kind: 'tgz' as const };
  const B = { url: 'https://jsdelivr/x.zip', bytes: 1, kind: 'zip' as const };
  const O = { url: '/assets-zip/x.zip', bytes: 1, kind: 'zip' as const };
  it('无嫌疑保持原序;origin 恒末位', () => {
    expect(demoteSuspicious([A, B, O], new Map())).toEqual([A, B, O]);
    expect(demoteSuspicious([O], new Map())).toEqual([O]);
    expect(demoteSuspicious([], new Map())).toEqual([]);
  });
  it('有嫌疑者踢到 origin 之前(队尾),分高者更靠后', () => {
    const s = new Map([[A.url, 3], [B.url, 1]]);
    expect(demoteSuspicious([A, B, O], s)).toEqual([B, A, O]);
  });
});

describe('fetchPartBuffer 黑洞防护(超时回退)', () => {
  const bytes = (n: number): Response => new Response(new Uint8Array(n).fill(1), { status: 200 });
  it('首选挂起(响应头永不到达)→ 换下一候选命中,via=1', async () => {
    const totalGot = { v: 0 };
    const hangs = new Promise<Response>(() => { /* 永不 resolve */ });
    const r = await fetchPartBuffer([
      { url: 'https://npmmirror/x.tgz', bytes: 4, kind: 'zip' },
      { url: '/origin/x.zip', bytes: 4, kind: 'zip' },
    ], totalGot, {
      // 首调:受 abort 信号控制——signal abort 后 reject(模拟连接级超时);
      // 本测试不等真实 20s:用短周期轮询 signal.aborted 手工提前引爆破口
      ttfbTimeoutMs: 25,   // 注入短超时,不真等 20s
      fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) => {
        const sig = init?.signal as AbortSignal;
        if (_url === 'https://npmmirror/x.tgz') {
          return new Promise<Response>((_, rej) => {
            const iv = setInterval(() => { if (sig.aborted) { clearInterval(iv); rej(new DOMException('aborted', 'AbortError')); } }, 5);
          }) as Promise<Response>;
        }
        return Promise.resolve(bytes(4));
      }) as typeof fetch,
      onCandidateFail: () => { /* 记账断言在下方用标志位 */ },
    });
    expect(r?.via).toBe(1);
  });
  it('onCandidateFail 按候选下标逐次上报(全败=每个候选各一次)', async () => {
    const totalGot = { v: 0 };
    const fails: number[] = [];
    await fetchPartBuffer([
      { url: 'https://cdn/x.zip', bytes: 4, kind: 'zip' },
      { url: '/origin/x.zip', bytes: 4, kind: 'zip' },
    ], totalGot, {
      fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch,
      onCandidateFail: (i) => fails.push(i),
    });
    // 2 候选 × 2 轮:0,1,0,1
    expect(fails).toEqual([0, 1, 0, 1]);
  });
});
